"use node";
// The Outreach owners rebuild, in Convex's Node runtime: it holds every
// owner's totals at once (tens of thousands of rows), which the default
// runtime's 64 MB doesn't allow for. Everything it reads and writes lives
// in outreach.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { nowIso } from "./lib/access";
import { AddressCounter, OWNERS_SOURCE, OwnerGrouper, type Condensed, type GroupedRow } from "./lib/outreach";
import { MIDLAND_PARCELS } from "./lib/parcels";

const UPSERT_BATCH = 200;

type Page = { rows: Condensed[]; continueCursor: string; isDone: boolean };

/** Every parcel on the roll, a page at a time, into `into`. Returns how many. */
async function readRoll(ctx: ActionCtx, into: { addAll: (rows: Condensed[]) => unknown }): Promise<number> {
  let fetched = 0;
  let cursor: string | undefined;
  for (;;) {
    const page: Page = await ctx.runQuery(internal.outreach.parcelPage, { cursor });
    into.addAll(page.rows);
    fetched += page.rows.length;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return fetched;
}

/**
 * Reads the roll twice (once to find the offices, once to group the
 * owners), streams the rows into the owners table in batches, and drops
 * the ones gone. Records how it went under OWNERS_SOURCE.
 */
async function rebuildOwners(ctx: ActionCtx) {
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let error: string | undefined;
  try {
    const counter = new AddressCounter();
    await readRoll(ctx, counter);
    const grouper = new OwnerGrouper(counter.candidates());
    fetched = await readRoll(ctx, grouper);
    // Unique even when two builds share a millisecond: stale rows are the ones with any other id.
    const buildId = `${nowIso()}|${Math.random().toString(36).slice(2, 8)}`;
    let batch: GroupedRow[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const result: { added: number; updated: number } = await ctx.runMutation(internal.outreach.upsertOwners, { rows: batch, buildId });
      added += result.added;
      updated += result.updated;
      batch = [];
    };
    for (const row of grouper.rows(Date.now())) {
      batch.push(row);
      if (batch.length >= UPSERT_BATCH) await flush();
    }
    await flush();
    await ctx.runMutation(internal.outreach.dropStale, { buildId });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, { source: OWNERS_SOURCE, fetched, added, updated, error });
  return { fetched, added, updated, error };
}

/**
 * Rebuilds the owners table from the roll. Scheduled after each weekly roll
 * read; the deploy runs it with ifStale, which skips it when a clean build
 * is newer than the roll: `npx convex run outreachRebuild:rebuild '{"ifStale":true}'`.
 */
export const rebuild = internalAction({
  args: { ifStale: v.optional(v.boolean()) },
  handler: async (ctx, { ifStale }) => {
    if (ifStale) {
      const [owners, roll] = await Promise.all([
        ctx.runQuery(internal.permits.sourceState, { source: OWNERS_SOURCE }),
        ctx.runQuery(internal.permits.sourceState, { source: MIDLAND_PARCELS.source }),
      ]);
      if (owners && !owners.error && (!roll || owners.syncedAt >= roll.syncedAt)) return { skipped: true };
    }
    return await rebuildOwners(ctx);
  },
});

/** "Rebuild owners" on the Outreach page, for staff: `npx convex run outreachRebuild:rebuildNow`. */
export const rebuildNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await rebuildOwners(ctx);
  },
});
