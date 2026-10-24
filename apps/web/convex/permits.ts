// Building permits near a company: pulled from the City of Midland's public
// permit layer once a day, mapped to trades, and shown in the Vault as
// public-record intelligence (address and work, no contact details).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { nowIso, requireMember, requireStaff, requireUser } from "./lib/access";
import { planSummary } from "./marketplace";
import { MIDLAND, PERMIT_FIELDS, monthOf, rowsToPermits } from "./lib/permits";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the first sync reaches. */
const BACKFILL_DAYS = 90;

export const permitRow = v.object({
  permitNumber: v.string(),
  name: v.string(),
  workClass: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(v.string()),
  address: v.optional(v.string()),
  appliedAt: v.string(),
  issuedAt: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  residential: v.optional(v.boolean()),
  trades: v.array(v.string()),
  url: v.optional(v.string()),
});

const sameRow = (a: Doc<"permits">, b: { [k: string]: unknown; trades: string[] }) =>
  (["name", "workClass", "description", "status", "address", "issuedAt", "url"] as const).every(
    (k) => (a[k] ?? undefined) === (b[k] ?? undefined),
  ) && a.trades.join(",") === b.trades.join(",");

/** Adds new permits and updates changed ones, by permit number. Safe to run again. */
export const upsert = internalMutation({
  args: { source: v.string(), rows: v.array(permitRow) },
  handler: async (ctx, { source, rows }) => {
    let added = 0;
    let updated = 0;
    const now = nowIso();
    for (const row of rows) {
      const existing = await ctx.db
        .query("permits")
        .withIndex("by_permit_number", (q) => q.eq("permitNumber", row.permitNumber))
        .unique();
      if (!existing) {
        await ctx.db.insert("permits", {
          source,
          county: MIDLAND.county,
          city: MIDLAND.city,
          ...row,
          importedAt: now,
        });
        added++;
      } else if (!sameRow(existing, row)) {
        await ctx.db.patch(existing._id, { ...row, importedAt: now });
        updated++;
      }
    }
    return { added, updated };
  },
});

export const sourceState = internalQuery({
  args: { source: v.string() },
  handler: async (ctx, { source }) =>
    await ctx.db
      .query("permitSources")
      .withIndex("by_source", (q) => q.eq("source", source))
      .unique(),
});

export const recordSync = internalMutation({
  args: {
    source: v.string(),
    fetched: v.number(),
    added: v.number(),
    updated: v.number(),
    lastAppliedAt: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { source, ...result }) => {
    const existing = await ctx.db
      .query("permitSources")
      .withIndex("by_source", (q) => q.eq("source", source))
      .unique();
    const row = { source, syncedAt: nowIso(), ...result };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("permitSources", row);
  },
});

export const assertStaff = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return null;
  },
});

/** ArcGIS wants dates as DATE 'yyyy-mm-dd hh:mm:ss' (UTC). */
const arcDate = (ms: number) => `DATE '${new Date(ms).toISOString().slice(0, 19).replace("T", " ")}'`;

/**
 * Pulls permits applied for since the last sync (the first time: the last
 * 90 days) in pages, keeps the building work we list, and records how it
 * went. Returns the counts, with the error if the city's service failed.
 */
async function pullMidland(ctx: ActionCtx, days?: number) {
  const state = await ctx.runQuery(internal.permits.sourceState, { source: MIDLAND.source });
  // Overlap the last minute so a permit applied for while we were reading isn't missed.
  const sinceMs = state?.lastAppliedAt
    ? Date.parse(state.lastAppliedAt) - 60_000
    : Date.now() - (days ?? BACKFILL_DAYS) * DAY_MS;
  let offset = 0;
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let lastAppliedAt = state?.lastAppliedAt;
  let error: string | undefined;
  try {
    for (;;) {
      const params = new URLSearchParams({
        where: `ApplyDate >= ${arcDate(sinceMs)}`,
        outFields: PERMIT_FIELDS.join(","),
        orderByFields: "ApplyDate ASC",
        resultOffset: String(offset),
        resultRecordCount: "1000",
        outSR: "4326",
        f: "json",
      });
      const response = await fetch(`${MIDLAND.layer}/query?${params}`);
      if (!response.ok) throw new Error(`Midland permits: HTTP ${response.status}`);
      const body = (await response.json()) as {
        error?: { message?: string };
        features?: Parameters<typeof rowsToPermits>[0];
        exceededTransferLimit?: boolean;
      };
      if (body.error) throw new Error(`Midland permits: ${body.error.message ?? "the service returned an error"}`);
      const features = body.features ?? [];
      fetched += features.length;
      const rows = rowsToPermits(features);
      // Batches keep each transaction small.
      for (let i = 0; i < rows.length; i += 200) {
        const result: { added: number; updated: number } = await ctx.runMutation(internal.permits.upsert, {
          source: MIDLAND.source,
          rows: rows.slice(i, i + 200),
        });
        added += result.added;
        updated += result.updated;
      }
      for (const row of rows) if (!lastAppliedAt || row.appliedAt > lastAppliedAt) lastAppliedAt = row.appliedAt;
      if (!body.exceededTransferLimit || features.length === 0) break;
      offset += features.length;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, {
    source: MIDLAND.source,
    fetched,
    added,
    updated,
    lastAppliedAt,
    error,
  });
  return { fetched, added, updated, error };
}

/** The daily sync, also run by the deploy: `npx convex run permits:syncMidland`. */
export const syncMidland = internalAction({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => await pullMidland(ctx, days),
});

/** "Sync now" on the admin page. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await pullMidland(ctx);
  },
});

const since = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const recent = (ctx: QueryCtx, from: string) =>
  ctx.db
    .query("permits")
    .withIndex("by_county_and_applied", (q) => q.eq("county", MIDLAND.county).gte("appliedAt", from))
    .order("desc")
    .take(1000);

/**
 * Permits applied for near a company in the last `days` (7 to 90), newest
 * first, with which are in its trades. Part of the plan, like the rest of
 * the Vault; without it the counts still show.
 */
export const near = query({
  args: { organizationId: v.id("organizations"), days: v.optional(v.number()) },
  handler: async (ctx, { organizationId, days }) => {
    const { organization } = await requireMember(ctx, organizationId);
    const span = Math.min(Math.max(Math.round(days ?? 30), 1), 90);
    const rows = await recent(ctx, since(span));
    const trades = organization.leadTrades ?? [];
    const matches = (p: Doc<"permits">) => p.trades.some((t) => trades.includes(t));
    const summary = {
      days: span,
      total: rows.length,
      residentialBuilding: rows.filter((p) => p.name === "Residential - Building").length,
      singleFamily: rows.filter((p) => p.name === "Residential - Building" && p.workClass === "Single Family").length,
      inMyTrades: rows.filter(matches).length,
    };
    const plan = organization.plan ? planSummary(organization.plan, Date.now()) : null;
    const source = await ctx.db
      .query("permitSources")
      .withIndex("by_source", (q) => q.eq("source", MIDLAND.source))
      .unique();
    const base = { county: MIDLAND.county, syncedAt: source?.syncedAt, summary, plan };
    if (!plan?.active) return { ...base, locked: true as const, permits: [] };
    return {
      ...base,
      locked: false as const,
      permits: rows.map((p) => ({
        id: p._id,
        permitNumber: p.permitNumber,
        name: p.name,
        workClass: p.workClass,
        description: p.description,
        status: p.status,
        address: p.address,
        appliedAt: p.appliedAt,
        issuedAt: p.issuedAt,
        residential: p.residential,
        trades: p.trades,
        url: p.url,
        matchesTrades: matches(p),
      })),
    };
  },
});

/** Permits by month for the last six months: the Permian building report. */
export const monthly = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await recent(ctx, since(183));
    const months = new Map<string, { month: string; total: number; residentialBuilding: number; commercialBuilding: number; singleFamily: number; trade: number }>();
    for (const p of rows) {
      const key = monthOf(p.appliedAt);
      const m = months.get(key) ?? { month: key, total: 0, residentialBuilding: 0, commercialBuilding: 0, singleFamily: 0, trade: 0 };
      m.total++;
      if (p.name === "Residential - Building") {
        m.residentialBuilding++;
        if (p.workClass === "Single Family") m.singleFamily++;
      } else if (p.name === "Commercial - Building") m.commercialBuilding++;
      else m.trade++;
      months.set(key, m);
    }
    return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
  },
});

/** For the admin page: when the feed last ran and how it went. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const source = await ctx.db
      .query("permitSources")
      .withIndex("by_source", (q) => q.eq("source", MIDLAND.source))
      .unique();
    const month = await recent(ctx, since(30));
    return { source, last30Days: month.length };
  },
});
