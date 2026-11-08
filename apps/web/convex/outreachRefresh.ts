// The daily Outreach records pass. The owners table is built from the roll
// once a week (outreachRebuild.ts), but the city's permits and code cases
// come in every morning. Rather than remake every owner daily, which the
// database plan can't afford, this folds in only what changed: the records
// imported since the last pass go onto the owners they're about, and the
// permit companies (contractors, designers), whose rows come from permits
// alone, are remade from the last CONTRACTOR_DAYS of permits. A few hundred
// rows a day instead of tens of thousands.
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { ContractorGrouper, OWNERS_SOURCE, REFRESH_SOURCE, newBuildId, type CondensedPermit, type Property } from "./lib/outreach";

const UPSERT_BATCH = 200;
/** Records imported this long before the last pass are read again: the pass and the sync overlap, and a repeat changes nothing. */
const OVERLAP_MS = 2 * 3600_000;

type Page<T> = { rows: T[]; continueCursor: string; isDone: boolean };

async function readAll<T>(read: (cursor?: string) => Promise<Page<T>>, into: { addAll: (rows: T[]) => unknown }): Promise<number> {
  let fetched = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await read(cursor);
    into.addAll(page.rows);
    fetched += page.rows.length;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return fetched;
}

export type RefreshResult = { skipped?: true; fetched: number; added: number; updated: number; error?: string };

/** The pass itself: nothing to fold in until the owners have been built once. */
async function refreshRecords(ctx: ActionCtx): Promise<RefreshResult> {
  const [owners, last] = await Promise.all([
    ctx.runQuery(internal.permits.sourceState, { source: OWNERS_SOURCE }),
    ctx.runQuery(internal.permits.sourceState, { source: REFRESH_SOURCE }),
  ]);
  if (!owners || owners.error) return { skipped: true, fetched: 0, added: 0, updated: 0 };
  // Since the later of the build and the last pass; the build folded in everything before it.
  const from = [owners.syncedAt, last?.error ? undefined : last?.syncedAt].filter((s): s is string => !!s).sort().pop()!;
  const since = new Date(Date.parse(from) - OVERLAP_MS).toISOString();
  const buildId = newBuildId();
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let error: string | undefined;
  try {
    // The city's new records, onto their owners.
    const delta: Record<string, number> = {};
    let cursor: string | undefined;
    for (;;) {
      const page: { read: number; touched: number; delta: Record<string, number>; continueCursor: string; isDone: boolean } = await ctx.runMutation(internal.outreach.refreshSignals, { since, cursor, buildId });
      fetched += page.read;
      updated += page.touched;
      for (const [facet, n] of Object.entries(page.delta)) delta[facet] = (delta[facet] ?? 0) + n;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    // The permit companies, remade whole: permits are few, and a company's row is nothing but its permits.
    const contractors = new ContractorGrouper();
    const designers = new ContractorGrouper("designer");
    fetched += await readAll<CondensedPermit>((cursor) => ctx.runQuery(internal.outreach.permitPage, { cursor }), { addAll: (rows) => { contractors.addAll(rows); designers.addAll(rows); } });
    const lookup = (addressKeys: string[]): Promise<Record<string, Property>> => ctx.runQuery(internal.outreach.parcelsAt, { addressKeys });
    const set: Record<string, number> = {};
    for (const grouper of [contractors, designers]) {
      const rows = await grouper.grouped(lookup);
      set[grouper.kind] = rows.length;
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const result = await ctx.runMutation(internal.outreach.upsertOwners, { rows: rows.slice(i, i + UPSERT_BATCH), buildId });
        added += result.added;
        updated += result.updated;
      }
      await ctx.runMutation(internal.outreach.dropStaleOf, { kind: grouper.kind, buildId });
    }
    await ctx.runMutation(internal.outreach.adjustFacetCounts, { set, add: delta });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, { source: REFRESH_SOURCE, fetched, added, updated, error });
  return { fetched, added, updated, error };
}

/** Every morning after the permits and code cases sync (crons.ts). */
export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<RefreshResult> => refreshRecords(ctx),
});

/** "Refresh records" on the Outreach page, for staff: `npx convex run outreachRefresh:refreshNow`. */
export const refreshNow = action({
  args: {},
  handler: async (ctx): Promise<RefreshResult> => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await refreshRecords(ctx);
  },
});
