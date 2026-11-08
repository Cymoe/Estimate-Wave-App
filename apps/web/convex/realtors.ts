// TREC's active license holders for the county (lib/realtors.ts), read
// weekly before the roll: the agents and brokers Outreach's realtor list is
// made of, each with the brokerage they hang their license with.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import { nowIso } from "./lib/access";
import { TREC_REALTORS, realtorsQuery, rowsToRealtors } from "./lib/realtors";

const realtorType = v.union(v.literal("agent"), v.literal("broker"), v.literal("brokerage"));
const realtorRow = v.object({
  licenseNumber: v.string(),
  type: realtorType,
  name: v.string(),
  first: v.optional(v.string()),
  last: v.optional(v.string()),
  licensedAt: v.optional(v.string()),
  expiresAt: v.optional(v.string()),
  brokerage: v.optional(v.object({ licenseNumber: v.string(), name: v.string(), type: realtorType })),
  brokerageSince: v.optional(v.string()),
  supervisor: v.boolean(),
});

const KEYS = ["type", "name", "first", "last", "licensedAt", "expiresAt", "brokerage", "brokerageSince", "supervisor"];
const same = (a: Record<string, unknown>, b: Record<string, unknown>) => KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

/** Adds new license holders and updates changed ones, by license number; every row read is marked seen at `seenAt`. */
export const upsert = internalMutation({
  args: { rows: v.array(realtorRow), seenAt: v.string() },
  handler: async (ctx, { rows, seenAt }) => {
    let added = 0;
    let updated = 0;
    const now = nowIso();
    for (const row of rows) {
      const existing = await ctx.db.query("realtors").withIndex("by_license", (q) => q.eq("licenseNumber", row.licenseNumber)).unique();
      if (!existing) {
        await ctx.db.insert("realtors", { county: TREC_REALTORS.county, ...row, importedAt: now, seenAt });
        added++;
      } else if (!same(existing, row)) {
        await ctx.db.patch(existing._id, { ...row, importedAt: now, seenAt });
        updated++;
      } else await ctx.db.patch(existing._id, { seenAt });
    }
    return { added, updated };
  },
});

/** Drops license holders the read stamped `seenAt` didn't see: no longer active in the county. Pages itself. */
export const dropUnseen = internalMutation({
  args: { seenAt: v.string() },
  handler: async (ctx, { seenAt }) => {
    const gone = await ctx.db
      .query("realtors")
      .withIndex("by_county_and_seen", (q) => q.eq("county", TREC_REALTORS.county).lt("seenAt", seenAt))
      .take(500);
    for (const r of gone) await ctx.db.delete(r._id);
    if (gone.length === 500) await ctx.scheduler.runAfter(0, internal.realtors.dropUnseen, { seenAt });
    return gone.length;
  },
});

async function pull(ctx: ActionCtx) {
  const seenAt = nowIso();
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let error: string | undefined;
  try {
    for (let offset = 0; ; offset += TREC_REALTORS.page) {
      const response = await fetch(realtorsQuery(TREC_REALTORS.county, offset, TREC_REALTORS.page), { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`TREC license holders: HTTP ${response.status}`);
      const body = (await response.json()) as Array<Record<string, unknown>> | { error?: boolean; message?: string };
      if (!Array.isArray(body)) throw new Error(`TREC license holders: ${(body as { message?: string }).message ?? "the service returned an error"}`);
      fetched += body.length;
      const rows = rowsToRealtors(body);
      for (let i = 0; i < rows.length; i += 200) {
        const result: { added: number; updated: number } = await ctx.runMutation(internal.realtors.upsert, { rows: rows.slice(i, i + 200), seenAt });
        added += result.added;
        updated += result.updated;
      }
      if (body.length < TREC_REALTORS.page) break;
    }
    // Only a complete read may drop what it didn't see.
    await ctx.runMutation(internal.realtors.dropUnseen, { seenAt });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, { source: TREC_REALTORS.source, fetched, added, updated, error });
  return { fetched, added, updated, error };
}

/** Weekly (crons.ts), before the owners rebuild reads it. */
export const syncMidland = internalAction({
  args: {},
  handler: async (ctx) => await pull(ctx),
});

/** For staff: `npx convex run realtors:syncNow`. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await pull(ctx);
  },
});
