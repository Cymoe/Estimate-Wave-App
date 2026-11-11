"use node";
// The Outreach owners rebuild, in Convex's Node runtime: it holds every
// owner's totals at once (tens of thousands of rows), which the default
// runtime's 64 MB doesn't allow for. Everything it reads and writes lives
// in outreach.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { AddressCounter, ContractorGrouper, OWNERS_VERSION, OccupantGrouper, OwnerGrouper, RealtorGrouper, newBuildId, occupantsSince, permitsSince, type Condensed, type CondensedOccupant, type CondensedPermit, type CondensedRealtor, type GroupedRow, type Property, ownersSource } from "./lib/outreach";
import { COUNTY_ROLLS, MIDLAND_PARCELS } from "./lib/parcels";

const UPSERT_BATCH = 200;
/** How many upsert batches are in flight at once: they touch different owners, so they don't conflict. */
const PARALLEL = 6;

type Page<T> = { rows: T[]; continueCursor: string; isDone: boolean };

/** Every row of a paged query, a page at a time, into `into`. Returns how many. */
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

/** Every parcel on the county's roll, a page at a time, into `into`. Returns how many. */
const readRoll = (ctx: ActionCtx, county: string, into: { addAll: (rows: Condensed[]) => unknown }) => readAll<Condensed>((cursor) => ctx.runQuery(internal.outreach.parcelPage, { cursor, county }), into);

type SignalRow = { parcelId: string; signal: { kind: "code_violation" | "dilapidated" | "demolition" | "stalled_permit"; detail: string; date: string }; property: Property };

/** The roll's parcel at each address key, for a permit company's property. */
const parcelsAt = (ctx: ActionCtx, county: string) => (addressKeys: string[]): Promise<Record<string, Property>> => ctx.runQuery(internal.outreach.parcelsAt, { addressKeys, county });

/**
 * Reads the roll twice (once to find the offices, once to group the
 * owners), attaches the city's records to the owners they're about, adds
 * the contractors on recent permits, streams the rows into the owners
 * table in batches, and drops the ones gone. Records how it went under
 * OWNERS_SOURCE.
 */
async function rebuildOwners(ctx: ActionCtx, county: string = MIDLAND_PARCELS.county) {
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let error: string | undefined;
  // How many owners each facet holds, so a list can say its total without reading the facet.
  const facetCounts: Record<string, number> = {};
  try {
    const counter = new AddressCounter();
    await readRoll(ctx, county, counter);
    // The storage businesses with a sales-tax permit, by address: they name a storage property, and catch one the land code misses.
    const storageAt = new Map<string, string>();
    await readAll<{ addressKey: string; brand: string }>((cursor) => ctx.runQuery(internal.outreach.storageOutletPage, { cursor, county }), { addAll: (rows) => rows.forEach((r) => storageAt.set(r.addressKey, r.brand)) });
    const grouper = new OwnerGrouper(counter.candidates(), { storageAt });
    fetched = await readRoll(ctx, county, grouper);
    // The city's records, onto the owners of the parcels they're about.
    await readAll<SignalRow>((cursor) => ctx.runQuery(internal.outreach.signalPage, { cursor, county }), { addAll: (rows) => grouper.addSignals(rows) });
    // The companies on recent permits, as rows of their own: the builders, and the architects and engineers who applied.
    const permits = new ContractorGrouper();
    const designers = new ContractorGrouper("designer");
    const since = permitsSince();
    await readAll<CondensedPermit>((cursor) => ctx.runQuery(internal.outreach.permitPage, { since, cursor, county }), { addAll: (rows) => { permits.addAll(rows); designers.addAll(rows); } });
    const contractors = [...(await permits.grouped(parcelsAt(ctx, county))), ...(await designers.grouped(parcelsAt(ctx, county)))];
    // The businesses in spaces they don't own, from whichever source names them: certificates of occupancy, permit "owners", sales-tax permits.
    const occupants = new OccupantGrouper();
    const arrivals = occupantsSince();
    await readAll<CondensedOccupant>((cursor) => ctx.runQuery(internal.outreach.occupantPage, { since: arrivals, cursor, county }), occupants);
    await readAll<CondensedOccupant>((cursor) => ctx.runQuery(internal.outreach.outletPage, { since: arrivals, cursor, county }), occupants);
    const tenants = await occupants.grouped(parcelsAt(ctx, county));
    // The agents and brokers licensed here, with their brokerages: rows with no property at all.
    const realtors = new RealtorGrouper();
    await readAll<CondensedRealtor>((cursor) => ctx.runQuery(internal.outreach.realtorPage, { cursor, county }), realtors);
    const buildId = newBuildId();
    let batch: GroupedRow[] = [];
    let inFlight: Array<Promise<void>> = [];
    const write = async (rows: GroupedRow[]) => {
      const result: { added: number; updated: number } = await ctx.runMutation(internal.outreach.upsertOwners, { rows, buildId, county });
      added += result.added;
      updated += result.updated;
    };
    const flush = async () => {
      if (batch.length === 0) return;
      inFlight.push(write(batch));
      batch = [];
      if (inFlight.length >= PARALLEL) {
        await Promise.all(inFlight);
        inFlight = [];
      }
    };
    const all = function* () {
      yield* grouper.rows(Date.now());
      yield* contractors;
      yield* tenants;
      yield* realtors.grouped(Date.now());
    };
    for (const row of all()) {
      for (const f of row.facets) facetCounts[f.facet] = (facetCounts[f.facet] ?? 0) + 1;
      batch.push(row);
      if (batch.length >= UPSERT_BATCH) await flush();
    }
    await flush();
    await Promise.all(inFlight);
    await ctx.runMutation(internal.outreach.dropStale, { buildId, county });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await ctx.runMutation(internal.permits.recordSync, { source: ownersSource(county), fetched, added, updated, error, fieldsVersion: error ? undefined : OWNERS_VERSION, facetCounts: error ? undefined : facetCounts });
  return { fetched, added, updated, error };
}

/**
 * Rebuilds the owners table from the roll. Scheduled after each weekly roll
 * read. The deploy runs it with ifStale, which skips it when a clean build
 * of this OWNERS_VERSION is newer than the roll, and background, which schedules the work and
 * returns at once (a full build takes minutes; the deploy shouldn't wait):
 * `npx convex run outreachRebuild:rebuild '{"ifStale":true,"background":true}'`.
 */
export const rebuild = internalAction({
  args: { ifStale: v.optional(v.boolean()), background: v.optional(v.boolean()), county: v.optional(v.union(v.literal("Midland"), v.literal("Ector"), v.literal("Lubbock"), v.literal("Taylor"))) },
  handler: async (ctx, { ifStale, background, county = "Midland" }): Promise<{ skipped?: true; scheduled?: true; fetched?: number; added?: number; updated?: number; error?: string }> => {
    if (ifStale) {
      const [owners, roll] = await Promise.all([
        ctx.runQuery(internal.permits.sourceState, { source: ownersSource(county) }),
        ctx.runQuery(internal.permits.sourceState, { source: county === "Midland" ? MIDLAND_PARCELS.source : COUNTY_ROLLS[county].source }),
      ]);
      // A county whose roll was never read has no owners to build yet.
      if (county !== "Midland" && !roll) return { skipped: true };
      if (owners && !owners.error && owners.fieldsVersion === OWNERS_VERSION && (!roll || owners.syncedAt >= roll.syncedAt)) return { skipped: true };
    }
    if (background) {
      await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, { county });
      return { scheduled: true };
    }
    return await rebuildOwners(ctx, county);
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
