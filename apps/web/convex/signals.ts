// Motivated sellers: public records that say an owner may want to sell (Midland's code violations, dilapidated
// buildings, demolition orders and stalled permits; the foreclosure auction; court and tax lists staff upload), plus
// what the roll says about the owner (absentee, out of state, owned 20+ years, landlord, an estate or heirs on the
// deed, the district's mail returned, the homestead dropped, over 65 and owned 15+ years), stacked per home and
// scored (lib/signals.ts). Midland and Ector (Odessa) homes are scored. Read daily from the city's ArcGIS and weekly
// from the rolls; staff filter and export them in Ops, and Outreach lists the owners as "Likely to sell".
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { nowIso, requireStaff } from "./lib/access";
import { syncContactSignals } from "./lib/contactSignals";
import { MIDLAND_PARCELS, addressKey, isResidentialUse, looseKey, ownerName } from "./lib/parcels";
import { ownerKey } from "./lib/outreach";
import { MIDLAND, isOccupancy } from "./lib/permits";
import {
  LANDLORD_HOMES,
  LISTS,
  LIST_KEYS,
  RECORD_KINDS,
  SELLER_COUNTIES,
  isSellerCounty,
  nameOrders,
  parseRecords,
  SIGNALS_SOURCE,
  SIGNALS_VERSION,
  SIGNAL_LAYERS,
  codeCaseSignals,
  demolitionSignals,
  dilapidatedSignals,
  stackFor,
  stalledPermitSignal,
  type SignalRow,
} from "./lib/signals";

const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTY = MIDLAND_PARCELS.county;
/** After the first full read, code cases are read back this far each day, so status changes are caught. */
const RECENT_DAYS = 180;

const signalRow = v.object({
  sourceId: v.string(),
  kind: v.union(v.literal("code_violation"), v.literal("dilapidated"), v.literal("demolition"), v.literal("stalled_permit")),
  address: v.string(),
  detail: v.string(),
  status: v.optional(v.string()),
  caseNumber: v.optional(v.string()),
  date: v.string(),
});

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** The home an address is, when it's exactly one home on the roll. */
async function matchParcel(ctx: MutationCtx, address: string, county: string = COUNTY): Promise<Id<"parcels"> | undefined> {
  const key = addressKey(address);
  const exact = await ctx.db
    .query("parcels")
    .withIndex("by_county_and_address_key", (q) => q.eq("county", county).eq("addressKey", key))
    .take(2);
  if (exact.length === 1) return exact[0]._id;
  if (exact.length > 1) return undefined;
  const loose = await ctx.db
    .query("parcels")
    .withIndex("by_county_and_loose_key", (q) => q.eq("county", county).eq("looseKey", looseKey(address)))
    .take(2);
  return loose.length === 1 ? loose[0]._id : undefined;
}

/**
 * The home a person's name is on, for a record with no address (a probate or divorce case): the one home in the
 * county under that name, as written or the roll's way round ("John A Smith", "SMITH JOHN A"); with several, the one
 * they live in. None when it can't be told.
 */
async function matchOwner(ctx: MutationCtx, name: string, county: string): Promise<Id<"parcels"> | undefined> {
  for (const order of nameOrders(name)) {
    const key = ownerKey(order);
    if (!key) continue;
    const found = (
      await ctx.db
        .query("parcels")
        .withIndex("by_county_and_owner_key", (q) => q.eq("county", county).gte("ownerKey", `${key}|`).lt("ownerKey", `${key}|\uffff`))
        .take(20)
    ).filter((p) => isResidentialUse(p.useCode) && !p.retiredAt);
    if (found.length === 1) return found[0]._id;
    const lives = found.filter((p) => p.ownerOccupied);
    if (lives.length === 1) return lives[0]._id;
  }
  return undefined;
}

/** Adds new signals and updates changed ones, by source id. Returns the homes whose lists may have changed. */
export const upsert = internalMutation({
  args: { rows: v.array(signalRow) },
  handler: async (ctx, { rows }) => {
    const touched = new Set<Id<"parcels">>();
    let added = 0;
    let updated = 0;
    const now = nowIso();
    for (const row of rows) {
      const existing = await ctx.db
        .query("signals")
        .withIndex("by_source_id", (q) => q.eq("sourceId", row.sourceId))
        .first();
      const parcelId = existing?.parcelId ?? (await matchParcel(ctx, row.address));
      if (!existing) {
        await ctx.db.insert("signals", { county: COUNTY, parcelId, ...row, importedAt: now });
        added++;
      } else if (existing.status !== row.status || existing.detail !== row.detail || existing.parcelId !== parcelId) {
        await ctx.db.patch(existing._id, { ...row, parcelId, importedAt: now });
        updated++;
      } else continue;
      if (parcelId) touched.add(parcelId);
    }
    // The owners on Outreach lists at these homes show the new record at once.
    await syncContactSignals(ctx, touched);
    return { added, updated, touched: [...touched] };
  },
});

/** Stored permits that stopped (stop work, expired, no more work, denied), as signals. */
export const stalledPermits = internalQuery({
  args: {},
  handler: async (ctx) =>
    (
      await ctx.db
        .query("permits")
        .withIndex("by_county_and_applied", (q) => q.eq("county", MIDLAND.county))
        .take(20000)
    )
      // A certificate of occupancy that lapsed is not work that stopped.
      .filter((p) => !isOccupancy(p))
      .map(stalledPermitSignal)
      .filter((s): s is SignalRow => s !== null),
});

/** ArcGIS wants dates as DATE 'yyyy-mm-dd hh:mm:ss' (UTC). */
const arcDate = (ms: number) => `DATE '${new Date(ms).toISOString().slice(0, 19).replace("T", " ")}'`;

const PAGE = 2000;

/** One page of a layer, from `offset`. */
async function readPage(layer: string, where: string, offset: number, label: string) {
  const params = new URLSearchParams({
    where,
    outFields: "*",
    orderByFields: "OBJECTID ASC",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    returnGeometry: "false",
    f: "json",
  });
  const response = await fetch(`${layer}/query?${params}`);
  if (!response.ok) throw new Error(`Midland ${label}: HTTP ${response.status}`);
  const body = (await response.json()) as { error?: { message?: string }; features?: Array<{ attributes?: Record<string, unknown> }>; exceededTransferLimit?: boolean };
  if (body.error) throw new Error(`Midland ${label}: ${body.error.message ?? "the service returned an error"}`);
  const features = body.features ?? [];
  return { features, more: Boolean(body.exceededTransferLimit) && features.length > 0 };
}

const tally = v.object({ fetched: v.number(), added: v.number(), updated: v.number(), homes: v.number() });
type Tally = { fetched: number; added: number; updated: number; homes: number };

/** Saves signals and restacks the homes they touched. */
async function save(ctx: ActionCtx, rows: SignalRow[], t: Tally): Promise<Tally> {
  const out = { ...t, fetched: t.fetched + rows.length };
  const touched = new Set<Id<"parcels">>();
  for (let i = 0; i < rows.length; i += 400) {
    const r: { added: number; updated: number; touched: Id<"parcels">[] } = await ctx.runMutation(internal.signals.upsert, { rows: rows.slice(i, i + 400) });
    out.added += r.added;
    out.updated += r.updated;
    for (const id of r.touched) touched.add(id);
  }
  const ids = [...touched];
  for (let i = 0; i < ids.length; i += 200) await ctx.runMutation(internal.signals.recomputeParcels, { ids: ids.slice(i, i + 200) });
  out.homes += ids.length;
  return out;
}

/**
 * One step of a sync: a page of code cases, then the next step is scheduled,
 * so no single run is long (the first read is 47,000+ cases). After the last
 * page: dilapidated buildings, demolition orders and stalled permits, the
 * list counts, and the record of how it went.
 */
export const syncStep = internalAction({
  args: { full: v.boolean(), offset: v.number(), tally },
  handler: async (ctx, { full, offset, tally: t }) => {
    let error: string | undefined;
    try {
      const where = full ? "1=1" : `CREATED_DATE >= ${arcDate(Date.now() - RECENT_DAYS * DAY_MS)}`;
      const page = await readPage(SIGNAL_LAYERS.codeCases, where, offset, "code cases");
      t = await save(ctx, codeCaseSignals(page.features), t);
      if (page.more) {
        await ctx.scheduler.runAfter(0, internal.signals.syncStep, { full, offset: offset + page.features.length, tally: t });
        return;
      }
      t = await save(ctx, dilapidatedSignals((await readPage(SIGNAL_LAYERS.dilapidated, "1=1", 0, "dilapidated buildings")).features), t);
      t = await save(ctx, demolitionSignals((await readPage(SIGNAL_LAYERS.demolition, "1=1", 0, "demolition orders")).features), t);
      t = await save(ctx, await ctx.runQuery(internal.signals.stalledPermits, {}), t);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await refreshCounts(ctx);
    const state = await ctx.runQuery(internal.permits.sourceState, { source: SIGNALS_SOURCE });
    await ctx.runMutation(internal.permits.recordSync, {
      source: SIGNALS_SOURCE,
      fetched: t.fetched,
      added: t.added,
      updated: t.updated,
      error,
      // Only a clean full pass counts as having read everything with this version.
      fieldsVersion: !error && full ? SIGNALS_VERSION : state?.fieldsVersion,
    });
  },
});

/** Starts a sync: everything the first time (or after SIGNALS_VERSION changes), then the recent code cases. */
async function startSync(ctx: ActionCtx) {
  const state = await ctx.runQuery(internal.permits.sourceState, { source: SIGNALS_SOURCE });
  const full = !state?.syncedAt || state.fieldsVersion !== SIGNALS_VERSION;
  await ctx.scheduler.runAfter(0, internal.signals.syncStep, { full, offset: 0, tally: { fetched: 0, added: 0, updated: 0, homes: 0 } });
  return { started: true as const, full };
}

/**
 * The daily sync, also started by the deploy with ifStale, which skips it
 * when a clean run happened in the last day. It returns once started; the
 * steps run on their own.
 */
export const syncMidland = internalAction({
  args: { ifStale: v.optional(v.boolean()) },
  handler: async (ctx, { ifStale }) => {
    if (ifStale) {
      const last = await ctx.runQuery(internal.permits.sourceState, { source: SIGNALS_SOURCE });
      const fresh = last && !last.error && last.fieldsVersion === SIGNALS_VERSION && Date.now() - Date.parse(last.syncedAt) < DAY_MS;
      if (fresh) return { skipped: true as const };
    }
    return await startSync(ctx);
  },
});

/** "Sync now" on the Sellers tab. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await startSync(ctx);
  },
});

// ---- Stacking ----

/** Works out one home's lists and score and stores them, only writing when something changed. */
async function restack(ctx: MutationCtx, parcel: Doc<"parcels">, now: number) {
  // Only homes are motivated-seller leads: an apartment or commercial building on the roll is never stacked, nor a
  // home in a county that isn't scored, nor one the roll no longer has.
  if (!isResidentialUse(parcel.useCode) || !isSellerCounty(parcel.county) || parcel.retiredAt) {
    const stale = await ctx.db.query("distress").withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id)).first();
    if (stale) await ctx.db.delete(stale._id);
    for (const l of await ctx.db.query("distressLists").withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id)).collect()) await ctx.db.delete(l._id);
    return;
  }
  const city = await ctx.db
    .query("signals")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
    .collect();
  const records = await ctx.db
    .query("sellerRecords")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
    .collect();
  const signals = [...city, ...records.map((r) => ({ kind: r.kind, detail: r.detail ?? "", caseNumber: r.caseNumber, date: r.date, sourceId: r.sourceId }))];
  const today = new Date(now).toISOString().slice(0, 10);
  const preForeclosure = (
    await ctx.db
      .query("foreclosures")
      .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
      .collect()
  ).some((f) => f.status === "posted" && f.saleDate >= today);
  const landlord = await isLandlord(ctx, parcel);
  const stack = stackFor(parcel, signals, { preForeclosure, landlord }, now);
  const existing = await ctx.db
    .query("distress")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
    .first();
  const oldLists = existing
    ? await ctx.db
        .query("distressLists")
        .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
        .collect()
    : [];
  if (stack.lists.length === 0) {
    if (existing) await ctx.db.delete(existing._id);
    for (const l of oldLists) await ctx.db.delete(l._id);
    return;
  }
  const same =
    existing &&
    existing.score === stack.score &&
    existing.codeCases === stack.codeCases &&
    existing.seriousCases === stack.seriousCases &&
    existing.lastSignalAt === stack.lastSignalAt &&
    existing.lists.join(",") === stack.lists.join(",");
  if (same) return;
  const row = { county: parcel.county, parcelId: parcel._id, ...stack, updatedAt: new Date(now).toISOString() };
  if (existing) await ctx.db.replace(existing._id, row);
  else await ctx.db.insert("distress", row);
  for (const l of oldLists) await ctx.db.delete(l._id);
  for (const list of stack.lists) await ctx.db.insert("distressLists", { county: parcel.county, parcelId: parcel._id, list, score: stack.score });
}

/**
 * The owner has LANDLORD_HOMES or more homes in the county. Midland's are counted on the city's layer each week
 * (parcels.ts pullLandlords); elsewhere they're counted here, on the owner's filed parcels.
 */
async function isLandlord(ctx: MutationCtx, parcel: Doc<"parcels">): Promise<boolean> {
  if (parcel.county === COUNTY)
    return Boolean(
      await ctx.db
        .query("landlords")
        .withIndex("by_county_and_owner", (q) => q.eq("county", parcel.county).eq("owner", parcel.owner))
        .first(),
    );
  if (!parcel.ownerKey) return false;
  const theirs = await ctx.db
    .query("parcels")
    .withIndex("by_county_and_owner_key", (q) => q.eq("county", parcel.county).eq("ownerKey", parcel.ownerKey!))
    .take(60);
  return theirs.filter((p) => isResidentialUse(p.useCode) && !p.retiredAt).length >= LANDLORD_HOMES;
}

/** Restacks some homes (the ones a sync or the auction list touched). */
export const recomputeParcels = internalMutation({
  args: { ids: v.array(v.id("parcels")) },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    for (const id of ids) {
      const parcel = await ctx.db.get(id);
      if (parcel) await restack(ctx, parcel, now);
    }
  },
});

/**
 * Restacks every home, a page at a time, then recounts the lists. Runs after each weekly roll read: one county's
 * homes when `county` is given (Ector's read), every parcel otherwise (which also clears any home no longer scored).
 */
export const recomputePage = internalMutation({
  args: { cursor: v.optional(v.string()), county: v.optional(v.string()) },
  handler: async (ctx, { cursor, county }) => {
    const parcels = county
      ? ctx.db.query("parcels").withIndex("by_county_and_address_key", (q) => q.eq("county", county))
      : ctx.db.query("parcels");
    const page = await parcels.paginate({ cursor: cursor ?? null, numItems: 250 });
    const now = Date.now();
    for (const parcel of page.page) await restack(ctx, parcel, now);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.signals.recomputePage, { cursor: page.continueCursor, ...(county ? { county } : {}) });
    else await ctx.scheduler.runAfter(0, internal.signals.recount, {});
  },
});

export const countPage = internalQuery({
  args: { cursor: v.optional(v.string()), county: v.optional(v.string()) },
  handler: async (ctx, { cursor, county = COUNTY }) => {
    const page = await ctx.db
      .query("distress")
      .withIndex("by_county_and_score", (q) => q.eq("county", county))
      .paginate({ cursor: cursor ?? null, numItems: 4000 });
    const counts: Record<string, number> = {};
    let stacked = 0;
    for (const d of page.page) {
      for (const l of d.lists) counts[l] = (counts[l] ?? 0) + 1;
      if (d.lists.length >= 2) stacked++;
    }
    return { counts, stacked, total: page.page.length, isDone: page.isDone, cursor: page.continueCursor };
  },
});

export const saveCounts = internalMutation({
  args: { counts: v.record(v.string(), v.number()), stacked: v.number(), total: v.number(), county: v.optional(v.string()) },
  handler: async (ctx, { county = COUNTY, ...args }) => {
    const existing = await ctx.db
      .query("sellerCounts")
      .withIndex("by_county", (q) => q.eq("county", county))
      .first();
    const row = { county, ...args, updatedAt: nowIso() };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("sellerCounts", row);
  },
});

/** How many homes are on each list in each scored county, read page by page. */
async function refreshCounts(ctx: ActionCtx) {
  for (const county of SELLER_COUNTIES) {
    const counts: Record<string, number> = {};
    let stacked = 0;
    let total = 0;
    let cursor: string | undefined;
    for (;;) {
      const page: { counts: Record<string, number>; stacked: number; total: number; isDone: boolean; cursor: string } = await ctx.runQuery(internal.signals.countPage, { cursor, county });
      for (const [k, n] of Object.entries(page.counts)) counts[k] = (counts[k] ?? 0) + n;
      stacked += page.stacked;
      total += page.total;
      if (page.isDone) break;
      cursor = page.cursor;
    }
    await ctx.runMutation(internal.signals.saveCounts, { counts, stacked, total, county });
  }
}

export const recount = internalAction({
  args: {},
  handler: async (ctx) => await refreshCounts(ctx),
});

// ---- For Ops ----

const MAX_ROWS = 500;
const SCAN = 2000;
const EXPORT_PAGE = 400;

/** The lists asked for, keeping only real list keys. */
const knownLists = (lists?: string[]) => (lists ?? []).filter((l): l is (typeof LIST_KEYS)[number] => (LIST_KEYS as string[]).includes(l));

/** One home as the Sellers tab and the CSV show it: the stack joined to the roll. */
async function homeRow(ctx: QueryCtx, d: Doc<"distress">) {
  const p = await ctx.db.get(d.parcelId);
  if (!p) return null;
  return {
    parcelId: p._id,
    address: title(p.siteAddress),
    owner: ownerName(p.owner),
    owner2: p.owner2 ? ownerName(p.owner2) : undefined,
    mailing: p.mailing,
    lists: d.lists,
    score: d.score,
    codeCases: d.codeCases,
    seriousCases: d.seriousCases,
    lastSignalAt: d.lastSignalAt,
    marketValueCents: p.marketValueCents,
    deedDate: p.deedDate,
  };
}

/**
 * Homes on every chosen list (and on at least minLists lists), highest
 * score first, with the owner and mailing address for direct mail. Reads the
 * rarest chosen list by score, so a small list isn't crowded out.
 */
export const sellers = query({
  args: { lists: v.optional(v.array(v.string())), minLists: v.optional(v.number()), limit: v.optional(v.number()), county: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const COUNTY = args.county && isSellerCounty(args.county) ? args.county : MIDLAND_PARCELS.county;
    const summary = await ctx.db
      .query("sellerCounts")
      .withIndex("by_county", (q) => q.eq("county", COUNTY))
      .first();
    const counts = summary?.counts ?? {};
    const wanted = knownLists(args.lists);
    const minLists = Math.max(1, args.minLists ?? 1);
    const limit = Math.min(MAX_ROWS, Math.max(1, args.limit ?? 200));
    const ok = (d: Doc<"distress">) => d.lists.length >= minLists && wanted.every((l) => d.lists.includes(l));

    const picked: Doc<"distress">[] = [];
    let scanned = 0;
    if (wanted.length) {
      const rarest = [...wanted].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))[0];
      const rows = await ctx.db
        .query("distressLists")
        .withIndex("by_list_and_score", (q) => q.eq("county", COUNTY).eq("list", rarest))
        .order("desc")
        .take(SCAN);
      scanned = rows.length;
      for (const r of rows) {
        if (picked.length >= limit) break;
        const d = await ctx.db
          .query("distress")
          .withIndex("by_parcel", (q) => q.eq("parcelId", r.parcelId))
          .first();
        if (d && ok(d)) picked.push(d);
      }
    } else {
      const rows = await ctx.db
        .query("distress")
        .withIndex("by_county_and_score", (q) => q.eq("county", COUNTY))
        .order("desc")
        .take(SCAN);
      scanned = rows.length;
      for (const d of rows) {
        if (picked.length >= limit) break;
        if (ok(d)) picked.push(d);
      }
    }

    const homes = [];
    for (const d of picked) {
      const home = await homeRow(ctx, d);
      if (home) homes.push(home);
    }
    return {
      homes,
      more: picked.length >= limit || scanned >= SCAN,
      counts,
      stacked: summary?.stacked ?? 0,
      total: summary?.total ?? 0,
      lists: LIST_KEYS.map((key) => ({ key, label: LISTS[key].label, weight: LISTS[key].weight })),
      county: COUNTY,
      counties: [...SELLER_COUNTIES],
    };
  },
});

/**
 * Every home matching the filters, a page at a time, for the CSV: the
 * Sellers tab shows the top 200, the export takes them all. Walks the rarest
 * chosen list (or every stacked home) by score; a page can come back short
 * when the filters drop rows, so read until isDone.
 */
export const sellersExport = query({
  args: { lists: v.optional(v.array(v.string())), minLists: v.optional(v.number()), paginationOpts: paginationOptsValidator, county: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const COUNTY = args.county && isSellerCounty(args.county) ? args.county : MIDLAND_PARCELS.county;
    const wanted = knownLists(args.lists);
    const minLists = Math.max(1, args.minLists ?? 1);
    const ok = (d: Doc<"distress">) => d.lists.length >= minLists && wanted.every((l) => d.lists.includes(l));
    const opts = { ...args.paginationOpts, numItems: Math.min(EXPORT_PAGE, Math.max(1, args.paginationOpts.numItems)) };

    const picked: Doc<"distress">[] = [];
    let result: { isDone: boolean; continueCursor: string };
    if (wanted.length) {
      const summary = await ctx.db
        .query("sellerCounts")
        .withIndex("by_county", (q) => q.eq("county", COUNTY))
        .first();
      const counts = summary?.counts ?? {};
      const rarest = [...wanted].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))[0];
      const page = await ctx.db
        .query("distressLists")
        .withIndex("by_list_and_score", (q) => q.eq("county", COUNTY).eq("list", rarest))
        .order("desc")
        .paginate(opts);
      for (const r of page.page) {
        const d = await ctx.db
          .query("distress")
          .withIndex("by_parcel", (q) => q.eq("parcelId", r.parcelId))
          .first();
        if (d && ok(d)) picked.push(d);
      }
      result = page;
    } else {
      const page = await ctx.db
        .query("distress")
        .withIndex("by_county_and_score", (q) => q.eq("county", COUNTY))
        .order("desc")
        .paginate(opts);
      picked.push(...page.page.filter(ok));
      result = page;
    }

    const homes = [];
    for (const d of picked) {
      const home = await homeRow(ctx, d);
      if (home) homes.push(home);
    }
    return { page: homes, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

/** One home: its lists and every record behind them. */
export const home = query({
  args: { parcelId: v.id("parcels") },
  handler: async (ctx, { parcelId }) => {
    await requireStaff(ctx);
    const parcel = await ctx.db.get(parcelId);
    if (!parcel) return null;
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
      .order("desc")
      .take(100);
    const foreclosures = await ctx.db
      .query("foreclosures")
      .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
      .collect();
    const records = await ctx.db
      .query("sellerRecords")
      .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
      .take(50);
    const distress = await ctx.db
      .query("distress")
      .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
      .first();
    return {
      address: title(parcel.siteAddress),
      owner: ownerName(parcel.owner),
      mailing: parcel.mailing,
      lists: distress?.lists ?? [],
      score: distress?.score ?? 0,
      signals: [
        ...signals.map((s) => ({ kind: s.kind as string, detail: s.detail, status: s.status, caseNumber: s.caseNumber, date: s.date })),
        ...records.map((r) => ({ kind: r.kind as string, detail: r.detail ?? LISTS[r.kind].label, status: undefined, caseNumber: r.caseNumber, date: r.date })),
      ].sort((a, b) => b.date.localeCompare(a.date)),
      foreclosures: foreclosures.map((f) => ({ saleDate: f.saleDate, status: f.status, kind: f.kind })),
      // What the roll says, behind the roll's lists.
      roll: {
        homestead: parcel.homestead,
        over65: parcel.over65,
        homesteadDroppedAt: parcel.homesteadDroppedAt,
        returnedMail: parcel.returnedMail,
        deedDate: parcel.deedDate,
      },
    };
  },
});

/** When the signals were last read, and how many homes are on the lists. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const source = await ctx.db
      .query("permitSources")
      .withIndex("by_source", (q) => q.eq("source", SIGNALS_SOURCE))
      .unique();
    const summary = await ctx.db
      .query("sellerCounts")
      .withIndex("by_county", (q) => q.eq("county", COUNTY))
      .first();
    return {
      source: source ? { syncedAt: source.syncedAt, fetched: source.fetched, added: source.added, updated: source.updated, error: source.error } : null,
      stacked: summary?.stacked ?? 0,
      total: summary?.total ?? 0,
      countedAt: summary?.updatedAt,
    };
  },
});

// ---- Records staff upload ----

/** The most rows one upload takes. */
const RECORDS_MAX = 5000;

const recordKind = v.union(v.literal("tax_delinquent"), v.literal("probate"), v.literal("lis_pendens"), v.literal("divorce"), v.literal("eviction"));

/**
 * A court or tax list from a records request (pasted, or a CSV with a header): each row matched to the one home it
 * is, by address, or by the owner's name when there's no address (probate and divorce lists often have none). Matched
 * rows are kept and their homes restacked at once; the rows that couldn't be matched come back, so staff can fix
 * them. Sending the same list again adds nothing.
 */
export const addRecords = mutation({
  args: { county: v.string(), kind: recordKind, text: v.string() },
  handler: async (ctx, { county, kind, text }) => {
    await requireStaff(ctx);
    if (!isSellerCounty(county)) throw new Error(`Seller lists are kept for ${SELLER_COUNTIES.join(" and ")} only`);
    const lines = parseRecords(text).slice(0, RECORDS_MAX);
    const now = nowIso();
    const touched = new Set<Id<"parcels">>();
    let added = 0;
    let already = 0;
    const unmatched: Array<{ line: number; text: string }> = [];
    for (const r of lines) {
      if (!r.address && !r.owner) continue;
      const parcelId = (r.address ? await matchParcel(ctx, r.address, county) : undefined) ?? (r.owner ? await matchOwner(ctx, r.owner, county) : undefined);
      if (!parcelId) {
        unmatched.push({ line: r.line, text: [r.address, r.owner, r.caseNumber].filter(Boolean).join(" · ") });
        continue;
      }
      const date = r.date ?? now.slice(0, 10);
      const sourceId = `record:${county}:${kind}:${(r.caseNumber ?? `${r.address ?? ""}|${r.owner ?? ""}|${date}`).toUpperCase()}`;
      const existing = await ctx.db.query("sellerRecords").withIndex("by_source_id", (q) => q.eq("sourceId", sourceId)).first();
      if (existing) {
        already++;
        continue;
      }
      await ctx.db.insert("sellerRecords", {
        county,
        kind,
        parcelId,
        ...(r.address ? { address: r.address } : {}),
        ...(r.owner ? { owner: r.owner } : {}),
        ...(r.detail ? { detail: r.detail } : {}),
        ...(r.caseNumber ? { caseNumber: r.caseNumber } : {}),
        date,
        sourceId,
        importedAt: now,
      });
      added++;
      touched.add(parcelId);
    }
    const at = Date.now();
    for (const id of touched) {
      const parcel = await ctx.db.get(id);
      if (parcel) await restack(ctx, parcel, at);
    }
    if (touched.size) await ctx.scheduler.runAfter(0, internal.signals.recount, {});
    return { read: lines.length, added, already, unmatched: unmatched.slice(0, 200), unmatchedCount: unmatched.length, kinds: [...RECORD_KINDS] };
  },
});

/** How many uploaded records each county holds of each kind, for the Sources tab. */
export const recordCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const out: Array<{ county: string; kind: string; count: number }> = [];
    for (const county of SELLER_COUNTIES)
      for (const kind of RECORD_KINDS) {
        const n = (await ctx.db.query("sellerRecords").withIndex("by_county_and_kind", (q) => q.eq("county", county).eq("kind", kind)).take(10001)).length;
        if (n) out.push({ county, kind, count: n });
      }
    return out;
  },
});
