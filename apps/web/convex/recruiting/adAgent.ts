// The ad agent: Claude with ad-brief.md writes a batch of recruiting ads for a
// client from their inputs and the registry's numbers by ad. Every piece is
// checked against the brief's rules in code and waits as a draft until a
// person approves it on the review page.

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { PROVEN_AT, type AdPerformance } from "./ads";
import { AD_BRIEF } from "./lib/briefs";
import { checkPiece, type Kind } from "./lib/adChecks";
import { createJson } from "./lib/claude";
import { sendEmail } from "../lib/email";

type Written = { text: string; angle: string; variation_of: string | null };
export type Batch = {
  hooks: Written[];
  meta_primary: Written[];
  video_scripts: Array<{ title: string; script: string; angle: string; variation_of: string | null }>;
  indeed_posts: Array<{ title: string; body: string; angle: string; variation_of: string | null }>;
  retire: Array<{ source_ad_id: string; reason: string }>;
  learning_notes: string;
};

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const written = { type: "object", properties: { text: { type: "string" }, angle: { type: "string" }, variation_of: nullableString }, required: ["text", "angle", "variation_of"], additionalProperties: false };
const titled = (bodyKey: string) => ({
  type: "object",
  properties: { title: { type: "string" }, [bodyKey]: { type: "string" }, angle: { type: "string" }, variation_of: nullableString },
  required: ["title", bodyKey, "angle", "variation_of"],
  additionalProperties: false,
});

/** The batch's shape (ad-brief.md, "What it produces each batch"). */
export const BATCH_SCHEMA = {
  type: "object",
  properties: {
    hooks: { type: "array", items: written, description: "10 to 20 hooks" },
    meta_primary: { type: "array", items: written, description: "5 Meta primary texts" },
    video_scripts: { type: "array", items: titled("script"), description: "5 video scripts, 15 to 30 seconds" },
    indeed_posts: { type: "array", items: titled("body"), description: "3 Indeed postings" },
    retire: {
      type: "array",
      items: { type: "object", properties: { source_ad_id: { type: "string" }, reason: { type: "string" } }, required: ["source_ad_id", "reason"], additionalProperties: false },
    },
    learning_notes: { type: "string" },
  },
  required: ["hooks", "meta_primary", "video_scripts", "indeed_posts", "retire", "learning_notes"],
  additionalProperties: false,
};

const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);
const money = (cents?: number) => (cents ? `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "-");

/** The request: the client's inputs, then the numbers, then the winners' own words to riff on. */
export function batchRequest(input: { client: { name: string; role: string; city: string; territory?: string; compSheet: string; repStories?: string[]; perks?: string; wants?: string }; performance: AdPerformance[]; angles: Array<{ angle: string; ads: number; applicants: number; A: number; hired: number; spendCents: number; aRate: number | null; aPer100: number | null }>; retireRule: string[] }): string {
  const { client, performance, angles } = input;
  const lines = [
    `Write this week's batch for ${client.name}.`,
    "",
    "## Client inputs",
    `Role: ${client.role}`,
    `City: ${client.city}`,
    `Territory: ${client.territory ?? "(not given)"}`,
    `Comp sheet:\n${client.compSheet}`,
    `Rep stories:\n${(client.repStories ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n") || "(none given: don't write rep-story ads)"}`,
    `Culture and perks: ${client.perks ?? "(not given)"}`,
    `Who they want: ${client.wants ?? "(not given)"}`,
    "",
    "## Performance by ad (from the registry)",
  ];
  if (performance.length === 0) lines.push("No ads have run yet: no winners. Spread the batch across the angles.");
  else {
    lines.push("source ad id | kind | angle | applicants | A | B | C | A rate | booked | show rate | hired | spend | A's per $100 | cost per hire");
    for (const r of performance) {
      lines.push(
        [r.sourceAdId, r.kind ?? "?", r.angle ?? "?", r.applicants, r.A, r.B, r.C, pct(r.aRate), r.booked, pct(r.showRate), r.hired, money(r.spendCents), r.aPer100 === null ? "-" : r.aPer100.toFixed(2), money(r.costPerHireCents ?? undefined)].join(" | ") +
          (r.applicants < PROVEN_AT ? " (not proven yet)" : "") +
          (r.status === "retired" ? " (retired)" : ""),
      );
    }
    lines.push("", "## By angle", "angle | ads | applicants | A | A rate | hired | spend | A's per $100");
    for (const a of angles) lines.push([a.angle, a.ads, a.applicants, a.A, pct(a.aRate), a.hired, money(a.spendCents), a.aPer100 === null ? "-" : a.aPer100.toFixed(2)].join(" | "));
    // An ad that got someone hired is a winner however few applied.
    const winners = performance.filter((r) => r.body && r.status === "approved" && (r.hired > 0 || (r.applicants >= PROVEN_AT && r.A > 0))).slice(0, 5);
    if (winners.length) {
      lines.push("", "## The winners' words (riff on these for the ~70%)");
      for (const w of winners) lines.push(`[${w.sourceAdId}, ${w.angle}]\n${w.body}`);
    }
    if (input.retireRule.length) lines.push("", `Volume but no A's (${input.retireRule.join(", ")}): put these in retire unless there's a reason not to.`);
  }
  return lines.join("\n");
}

/** Count problems: the brief's sizes for a batch. */
export function batchProblems(b: Batch): string[] {
  const out: string[] = [];
  if (b.hooks.length < 10 || b.hooks.length > 20) out.push(`${b.hooks.length} hooks (the brief asks for 10 to 20)`);
  if (b.meta_primary.length !== 5) out.push(`${b.meta_primary.length} Meta primary texts (the brief asks for 5)`);
  if (b.video_scripts.length !== 5) out.push(`${b.video_scripts.length} video scripts (the brief asks for 5)`);
  if (b.indeed_posts.length !== 3) out.push(`${b.indeed_posts.length} Indeed postings (the brief asks for 3)`);
  return out;
}

export async function writeBatchFor(ctx: ActionCtx, clientId: Id<"recruitClients">): Promise<Id<"recruitAdBatches"> | null> {
  const input = await ctx.runQuery(internal.recruiting.ads.inputs, { clientId });
  if (!input) return null;
  // The demo client's batch is scripted: no Claude.
  if (input.client.demo) return await ctx.runMutation(internal.recruiting.demo.batch, { clientId });
  const batchId = await ctx.runMutation(internal.recruiting.ads.startBatch, { clientId });
  try {
    const batch = await createJson<Batch>({ system: AD_BRIEF, user: batchRequest(input), schema: BATCH_SCHEMA });
    const c = input.client;
    // The only numbers an ad may use: the comp sheet's, the rep stories' and the perks'.
    const allowed = { inputs: [c.compSheet, ...(c.repStories ?? []), c.perks ?? ""].join("\n") };
    const known = new Set(input.performance.map((r: { sourceAdId: string }) => r.sourceAdId));
    type Raw = { kind: Kind; angle: string; title?: string; body: string; variationOf: string | null };
    const raw: Raw[] = [
      ...batch.hooks.map((h) => ({ kind: "hook" as Kind, angle: h.angle, body: h.text, variationOf: h.variation_of })),
      ...batch.meta_primary.map((m) => ({ kind: "meta_primary" as Kind, angle: m.angle, body: m.text, variationOf: m.variation_of })),
      ...batch.video_scripts.map((s) => ({ kind: "video_script" as Kind, angle: s.angle, title: s.title, body: s.script, variationOf: s.variation_of })),
      ...batch.indeed_posts.map((p) => ({ kind: "indeed" as Kind, angle: p.angle, title: p.title, body: p.body, variationOf: p.variation_of })),
    ];
    const pieces = raw.map((p) => ({
      ...p,
      angle: p.angle.trim().toLowerCase(),
      // A "variation" of an ad that doesn't exist is a new angle.
      variationOf: p.variationOf && known.has(p.variationOf) ? p.variationOf : undefined,
      warnings: checkPiece(p.kind, [p.title, p.body].filter(Boolean).join("\n"), allowed),
    }));
    const retire = batch.retire.filter((r) => known.has(r.source_ad_id)).map((r) => ({ sourceAdId: r.source_ad_id, reason: r.reason }));
    await ctx.runMutation(internal.recruiting.ads.saveBatch, { batchId, pieces, learningNotes: batch.learning_notes, retire, problems: batchProblems(batch) });
    await tellReviewer(c.name, pieces.length, pieces.filter((p) => p.warnings.length).length);
    return batchId;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error(`Ad batch for ${input.client.name} failed: ${why}`);
    await ctx.runMutation(internal.recruiting.ads.failBatch, { batchId, error: why });
    return batchId;
  }
}

/** Emails RECRUIT_REVIEW_EMAIL that a batch is waiting, with the Ops page's link. */
async function tellReviewer(client: string, pieces: number, flagged: number) {
  const to = process.env.RECRUIT_REVIEW_EMAIL;
  if (!to) return;
  const link = `${process.env.SITE_URL ?? ""}/ops/recruiting`;
  const subject = `${client}: ${pieces} new ads to review${flagged ? ` (${flagged} with warnings)` : ""}`;
  const text = `${subject}\n\nApprove or reject them here: ${link}\n\nNothing runs until it's approved.`;
  const r = await sendEmail([to], { subject, text, html: `<p>${subject}</p><p><a href="${link}">Open the review page</a>. Nothing runs until it's approved.</p>` });
  if (r.status !== "sent") console.error(`Review email not sent: ${r.error}`);
}

/** One client's batch, now: Ops → Recruiting's "Write a new batch now", or `npx convex run recruiting/adAgent:writeBatch`. */
export const writeBatch = internalAction({
  args: { clientId: v.id("recruitClients") },
  handler: async (ctx, { clientId }) => {
    await writeBatchFor(ctx, clientId);
  },
});

/** Mondays (crons.ts): a new batch for every active client with ads turned on, a minute apart. */
export const weekly = internalAction({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.runQuery(internal.recruiting.clients.list, {});
    let i = 0;
    for (const c of clients) {
      if (!c.active || !c.adsEnabled) continue;
      await ctx.scheduler.runAfter(60_000 * i++, internal.recruiting.adAgent.writeBatch, { clientId: c.clientId as Id<"recruitClients"> });
    }
  },
});
