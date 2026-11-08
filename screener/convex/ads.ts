// Ads: what the ad agent wrote, what a person approved, and how each ad did.
// Performance comes from the screener's own applicants by source ad id, so
// "A's per dollar" is measured in reps Jordan scored, not clicks.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";

const nowIso = () => new Date().toISOString();

export const KIND_CODE: Record<Doc<"ads">["kind"], string> = { hook: "h", meta_primary: "m", video_script: "v", indeed: "i" };
export const KIND_LABEL: Record<Doc<"ads">["kind"], string> = { hook: "Hook", meta_primary: "Meta primary text", video_script: "Video script", indeed: "Indeed posting" };

/** Volume with no A's: an ad with this many applicants and not one A is suggested for retiring. */
export const RETIRE_AFTER = 10;
/** Fewer applicants than this and an ad isn't proven either way. */
export const PROVEN_AT = 5;

export type AdPerformance = {
  sourceAdId: string;
  kind?: Doc<"ads">["kind"];
  angle?: string;
  status?: Doc<"ads">["status"];
  body?: string;
  applicants: number;
  A: number;
  B: number;
  C: number;
  aRate: number | null;
  booked: number;
  showed: number;
  missed: number;
  showRate: number | null;
  spendCents?: number;
  aPer100: number | null;
};

/** Every ad that has brought in applicants or been approved for this client, with its numbers. */
export async function performanceOf(ctx: QueryCtx, clientId: Id<"clients">): Promise<AdPerformance[]> {
  const applicants = await ctx.db.query("applicants").withIndex("by_client", (q) => q.eq("clientId", clientId)).collect();
  const ads = [
    ...(await ctx.db.query("ads").withIndex("by_client_status", (q) => q.eq("clientId", clientId).eq("status", "approved")).collect()),
    ...(await ctx.db.query("ads").withIndex("by_client_status", (q) => q.eq("clientId", clientId).eq("status", "retired")).collect()),
  ];
  const rows = new Map<string, AdPerformance>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { sourceAdId: id, applicants: 0, A: 0, B: 0, C: 0, aRate: null, booked: 0, showed: 0, missed: 0, showRate: null, aPer100: null };
      rows.set(id, r);
    }
    return r;
  };
  for (const ad of ads) if (ad.sourceAdId) Object.assign(row(ad.sourceAdId), { kind: ad.kind, angle: ad.angle, status: ad.status, body: ad.body, spendCents: ad.spendCents });
  for (const a of applicants) {
    const r = row(a.sourceAdId);
    r.applicants++;
    if (a.score) r[a.score]++;
    if (a.bookedAt) r.booked++;
    if (a.status === "interviewed") r.showed++;
    if (a.status === "no_show") r.missed++;
  }
  for (const r of rows.values()) {
    r.aRate = r.applicants ? r.A / r.applicants : null;
    r.showRate = r.showed + r.missed ? r.showed / (r.showed + r.missed) : null;
    r.aPer100 = r.spendCents ? (r.A / r.spendCents) * 10_000 : null;
  }
  // A's per dollar first, then A-grade rate, then volume.
  return [...rows.values()].sort((x, y) => (y.aPer100 ?? -1) - (x.aPer100 ?? -1) || (y.aRate ?? -1) - (x.aRate ?? -1) || y.applicants - x.applicants);
}

/** The same numbers rolled up by angle, so the agent can see which angles win. */
export function byAngle(rows: AdPerformance[]) {
  const angles = new Map<string, { angle: string; ads: number; applicants: number; A: number; spendCents: number; aRate: number | null; aPer100: number | null }>();
  for (const r of rows) {
    const key = r.angle ?? "(written outside the agent)";
    const a = angles.get(key) ?? { angle: key, ads: 0, applicants: 0, A: 0, spendCents: 0, aRate: null, aPer100: null };
    a.ads++;
    a.applicants += r.applicants;
    a.A += r.A;
    a.spendCents += r.spendCents ?? 0;
    angles.set(key, a);
  }
  for (const a of angles.values()) {
    a.aRate = a.applicants ? a.A / a.applicants : null;
    a.aPer100 = a.spendCents ? (a.A / a.spendCents) * 10_000 : null;
  }
  return [...angles.values()].sort((x, y) => (y.aPer100 ?? -1) - (x.aPer100 ?? -1) || (y.aRate ?? -1) - (x.aRate ?? -1));
}

/** Ads that bring volume but no A's (the brief's retire rule). */
export const volumeNoAs = (rows: AdPerformance[]) => rows.filter((r) => r.status === "approved" && r.applicants >= RETIRE_AFTER && r.A === 0);

/** What the ad agent writes from: the client's inputs and every ad's numbers. */
export const inputs = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const client = await ctx.db.get(clientId);
    if (!client) return null;
    const performance = await performanceOf(ctx, clientId);
    return { client, performance, angles: byAngle(performance), retireRule: volumeNoAs(performance).map((r) => r.sourceAdId) };
  },
});

export const startBatch = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => await ctx.db.insert("adBatches", { clientId, status: "writing", createdAt: nowIso() }),
});

const piece = v.object({
  kind: v.union(v.literal("hook"), v.literal("meta_primary"), v.literal("video_script"), v.literal("indeed")),
  angle: v.string(),
  title: v.optional(v.string()),
  body: v.string(),
  variationOf: v.optional(v.string()),
  warnings: v.array(v.string()),
});

export const saveBatch = internalMutation({
  args: {
    batchId: v.id("adBatches"),
    pieces: v.array(piece),
    learningNotes: v.string(),
    retire: v.array(v.object({ sourceAdId: v.string(), reason: v.string() })),
    problems: v.array(v.string()),
  },
  handler: async (ctx, { batchId, pieces, learningNotes, retire, problems }) => {
    const batch = (await ctx.db.get(batchId))!;
    const at = nowIso();
    // Last batch's undecided drafts make way for this one: the new batch already learned from the same numbers.
    for (const old of await ctx.db.query("ads").withIndex("by_client_status", (q) => q.eq("clientId", batch.clientId).eq("status", "draft")).collect()) {
      await ctx.db.patch(old._id, { status: "expired", decidedAt: at });
    }
    for (const p of pieces) await ctx.db.insert("ads", { ...p, clientId: batch.clientId, batchId, status: "draft", createdAt: at });
    const variations = pieces.filter((p) => p.variationOf).length;
    await ctx.db.patch(batchId, { status: "ready", learningNotes, retire, problems, variations, fresh: pieces.length - variations });
  },
});

export const failBatch = internalMutation({
  args: { batchId: v.id("adBatches"), error: v.string() },
  handler: async (ctx, { batchId, error }) => await ctx.db.patch(batchId, { status: "failed", error }),
});

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w && !["the", "and", "of", "llc", "inc", "co"].includes(w))[0]
    ?.slice(0, 10) || "client";

/**
 * A person's call on a draft. Approving hands out the source ad id that goes
 * on the live ad and into /apply, so applicants trace back to it.
 */
export const decide = internalMutation({
  args: { adId: v.id("ads"), decision: v.union(v.literal("approve"), v.literal("reject")) },
  handler: async (ctx, { adId, decision }) => {
    const ad = await ctx.db.get(adId);
    if (!ad || ad.status !== "draft") return null;
    if (decision === "reject") {
      await ctx.db.patch(adId, { status: "rejected", decidedAt: nowIso() });
      return null;
    }
    const client = (await ctx.db.get(ad.clientId))!;
    const slug = client.slug ?? slugOf(client.name);
    // The next number whose id nobody has used: not an ad of ours, not an ad id applicants already came in on.
    let seq = client.adSeq ?? 0;
    let sourceAdId: string;
    for (;;) {
      seq++;
      sourceAdId = `${slug}-${KIND_CODE[ad.kind]}${seq}`;
      const id = sourceAdId;
      const takenByAd = await ctx.db.query("ads").withIndex("by_source_ad", (q) => q.eq("sourceAdId", id)).first();
      const takenByApplicants = await ctx.db.query("applicants").withIndex("by_source_ad", (q) => q.eq("sourceAdId", id)).first();
      if (!takenByAd && !takenByApplicants) break;
    }
    await ctx.db.patch(client._id, { slug, adSeq: seq });
    await ctx.db.patch(adId, { status: "approved", sourceAdId, decidedAt: nowIso() });
    return sourceAdId;
  },
});

/** Take an ad out of rotation (a person's call, usually on a retire suggestion). */
export const retire = internalMutation({
  args: { sourceAdId: v.string() },
  handler: async (ctx, { sourceAdId }) => {
    const ad = await ctx.db.query("ads").withIndex("by_source_ad", (q) => q.eq("sourceAdId", sourceAdId)).first();
    if (ad && ad.status === "approved") await ctx.db.patch(ad._id, { status: "retired", decidedAt: nowIso() });
    return Boolean(ad);
  },
});

/** The media buyer's total spend on an ad so far: `npx convex run ads:setSpend '{"sourceAdId":"acme-m3","dollars":420}'`, or POST /ads/spend. */
export const setSpend = internalMutation({
  args: { sourceAdId: v.string(), dollars: v.number() },
  handler: async (ctx, { sourceAdId, dollars }) => {
    const ad = await ctx.db.query("ads").withIndex("by_source_ad", (q) => q.eq("sourceAdId", sourceAdId)).first();
    if (!ad) return { ok: false as const, error: `no ad with source id ${sourceAdId}` };
    await ctx.db.patch(ad._id, { spendCents: Math.round(dollars * 100) });
    return { ok: true as const };
  },
});

/** Everything the review page shows: per client, the drafts to decide, retire suggestions, and the approved ads with their numbers. */
export const review = internalQuery({
  args: {},
  handler: async (ctx) => {
    const clients = (await ctx.db.query("clients").collect()).filter((c) => c.active);
    const out = [];
    for (const client of clients) {
      const drafts = await ctx.db.query("ads").withIndex("by_client_status", (q) => q.eq("clientId", client._id).eq("status", "draft")).collect();
      const batches = await ctx.db.query("adBatches").withIndex("by_client", (q) => q.eq("clientId", client._id)).order("desc").take(5);
      const latest = batches.find((b) => b.status === "ready");
      const performance = await performanceOf(ctx, client._id);
      const live = new Set(performance.filter((r) => r.status === "approved").map((r) => r.sourceAdId));
      // The agent's picks plus the rule's, for ads still running.
      const retire = new Map<string, string>();
      for (const r of latest?.retire ?? []) if (live.has(r.sourceAdId)) retire.set(r.sourceAdId, r.reason);
      for (const r of volumeNoAs(performance)) if (!retire.has(r.sourceAdId)) retire.set(r.sourceAdId, `${r.applicants} applicants, no A's`);
      out.push({
        client: { id: client._id, name: client.name, adsEnabled: client.adsEnabled === true },
        writing: batches.some((b) => b.status === "writing"),
        failed: batches[0]?.status === "failed" ? batches[0].error : undefined,
        latest: latest ? { createdAt: latest.createdAt, learningNotes: latest.learningNotes, problems: latest.problems ?? [], variations: latest.variations ?? 0, fresh: latest.fresh ?? 0 } : null,
        drafts: drafts.map((d) => ({ id: d._id, kind: d.kind, angle: d.angle, title: d.title, body: d.body, variationOf: d.variationOf, warnings: d.warnings })),
        retire: [...retire.entries()].map(([sourceAdId, reason]) => ({ sourceAdId, reason })),
        performance: performance.filter((r) => r.status === "approved" || r.applicants > 0),
      });
    }
    return out;
  },
});

/** Approved ads for the hand-off: scripts to the video team, copy and videos to the media buyer. */
export const approved = internalQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query("clients").collect();
    const rows = [];
    for (const c of clients) {
      for (const ad of await ctx.db.query("ads").withIndex("by_client_status", (q) => q.eq("clientId", c._id).eq("status", "approved")).collect()) {
        rows.push({ sourceAdId: ad.sourceAdId!, client: c.name, kind: ad.kind, angle: ad.angle, title: ad.title ?? "", body: ad.body, approvedAt: ad.decidedAt ?? "" });
      }
    }
    return rows.sort((x, y) => y.approvedAt.localeCompare(x.approvedAt));
  },
});
