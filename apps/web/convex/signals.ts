// Motivated sellers: public records that say a Midland owner may want to
// sell (code violations, dilapidated buildings, demolition orders, stalled
// permits, the foreclosure auction), plus what the roll says about the
// owner (absentee, out of state, owned 20+ years, landlord), stacked per
// home and scored (lib/signals.ts). Read daily from the city's ArcGIS;
// staff filter and export them in Ops. Investors get them on a plan later.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { nowIso, requireStaff } from "./lib/access";
import { MIDLAND_PARCELS, addressKey, looseKey, ownerName } from "./lib/parcels";
import { MIDLAND } from "./lib/permits";
import {
  LISTS,
  LIST_KEYS,
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
async function matchParcel(ctx: MutationCtx, address: string): Promise<Id<"parcels"> | undefined> {
  const key = addressKey(address);
  const exact = await ctx.db
    .query("parcels")
    .withIndex("by_county_and_address_key", (q) => q.eq("county", COUNTY).eq("addressKey", key))
    .take(2);
  if (exact.length === 1) return exact[0]._id;
  if (exact.length > 1) return undefined;
  const loose = await ctx.db
    .query("parcels")
    .withIndex("by_county_and_loose_key", (q) => q.eq("county", COUNTY).eq("looseKey", looseKey(address)))
    .take(2);
  return loose.length === 1 ? loose[0]._id : undefined;
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
      .map(stalledPermitSignal)
      .filter((s): s is SignalRow => s !== null),
});

/** ArcGIS wants dates as DATE 'yyyy-mm-dd hh:mm:ss' (UTC). */
const arcDate = (ms: number) => `DATE '${new Date(ms).toISOString().slice(0, 19).replace("T", " ")}'`;

/** Every feature of a layer matching `where`, 2,000 at a time. */
async function readLayer(layer: string, where: string, label: string) {
  const out: Array<{ attributes?: Record<string, unknown> }> = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "OBJECTID ASC",
      resultOffset: String(offset),
      resultRecordCount: "2000",
      returnGeometry: "false",
      f: "json",
    });
    const response = await fetch(`${layer}/query?${params}`);
    if (!response.ok) throw new Error(`Midland ${label}: HTTP ${response.status}`);
    const body = (await response.json()) as { error?: { message?: string }; features?: typeof out; exceededTransferLimit?: boolean };
    if (body.error) throw new Error(`Midland ${label}: ${body.error.message ?? "the service returned an error"}`);
    const features = body.features ?? [];
    out.push(...features);
    if (!body.exceededTransferLimit || features.length === 0) return out;
    offset += features.length;
  }
}

/** Code cases (all of them the first time, then the last 180 days), dilapidated buildings, demolition orders, stalled permits. */
async function pullSignals(ctx: ActionCtx) {
  const state = await ctx.runQuery(internal.permits.sourceState, { source: SIGNALS_SOURCE });
  const full = !state?.syncedAt || state.fieldsVersion !== SIGNALS_VERSION;
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let error: string | undefined;
  const touched = new Set<Id<"parcels">>();
  const save = async (rows: SignalRow[]) => {
    fetched += rows.length;
    for (let i = 0; i < rows.length; i += 400) {
      const r: { added: number; updated: number; touched: Id<"parcels">[] } = await ctx.runMutation(internal.signals.upsert, { rows: rows.slice(i, i + 400) });
      added += r.added;
      updated += r.updated;
      for (const id of r.touched) touched.add(id);
    }
  };
  try {
    const where = full ? "1=1" : `CREATED_DATE >= ${arcDate(Date.now() - RECENT_DAYS * DAY_MS)}`;
    await save(codeCaseSignals(await readLayer(SIGNAL_LAYERS.codeCases, where, "code cases")));
    await save(dilapidatedSignals(await readLayer(SIGNAL_LAYERS.dilapidated, "1=1", "dilapidated buildings")));
    await save(demolitionSignals(await readLayer(SIGNAL_LAYERS.demolition, "1=1", "demolition orders")));
    await save(await ctx.runQuery(internal.signals.stalledPermits, {}));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ids = [...touched];
  for (let i = 0; i < ids.length; i += 200) await ctx.runMutation(internal.signals.recomputeParcels, { ids: ids.slice(i, i + 200) });
  await refreshCounts(ctx);
  await ctx.runMutation(internal.permits.recordSync, {
    source: SIGNALS_SOURCE,
    fetched,
    added,
    updated,
    error,
    // Only a clean full pass counts as having read everything with this version.
    fieldsVersion: error ? state?.fieldsVersion : full ? SIGNALS_VERSION : state?.fieldsVersion,
  });
  return { fetched, added, updated, homes: ids.length, full, error };
}

/** The daily sync; the deploy runs it with ifStale, skipping it when a clean run happened in the last day. */
export const syncMidland = internalAction({
  args: { ifStale: v.optional(v.boolean()) },
  handler: async (ctx, { ifStale }) => {
    if (ifStale) {
      const last = await ctx.runQuery(internal.permits.sourceState, { source: SIGNALS_SOURCE });
      const fresh = last && !last.error && last.fieldsVersion === SIGNALS_VERSION && Date.now() - Date.parse(last.syncedAt) < DAY_MS;
      if (fresh) return { skipped: true };
    }
    return await pullSignals(ctx);
  },
});

/** "Sync now" on the Sellers tab. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await pullSignals(ctx);
  },
});

// ---- Stacking ----

/** Works out one home's lists and score and stores them, only writing when something changed. */
async function restack(ctx: MutationCtx, parcel: Doc<"parcels">, now: number) {
  const signals = await ctx.db
    .query("signals")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
    .collect();
  const today = new Date(now).toISOString().slice(0, 10);
  const preForeclosure = (
    await ctx.db
      .query("foreclosures")
      .withIndex("by_parcel", (q) => q.eq("parcelId", parcel._id))
      .collect()
  ).some((f) => f.status === "posted" && f.saleDate >= today);
  const landlord = Boolean(
    await ctx.db
      .query("landlords")
      .withIndex("by_county_and_owner", (q) => q.eq("county", parcel.county).eq("owner", parcel.owner))
      .first(),
  );
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

/** Restacks every home, a page at a time, then recounts the lists. Runs after the weekly roll read. */
export const recomputePage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("parcels").paginate({ cursor: cursor ?? null, numItems: 250 });
    const now = Date.now();
    for (const parcel of page.page) await restack(ctx, parcel, now);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.signals.recomputePage, { cursor: page.continueCursor });
    else await ctx.scheduler.runAfter(0, internal.signals.recount, {});
  },
});

export const countPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("distress").paginate({ cursor: cursor ?? null, numItems: 4000 });
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
  args: { counts: v.record(v.string(), v.number()), stacked: v.number(), total: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sellerCounts")
      .withIndex("by_county", (q) => q.eq("county", COUNTY))
      .first();
    const row = { county: COUNTY, ...args, updatedAt: nowIso() };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("sellerCounts", row);
  },
});

/** How many homes are on each list, read page by page. */
async function refreshCounts(ctx: ActionCtx) {
  const counts: Record<string, number> = {};
  let stacked = 0;
  let total = 0;
  let cursor: string | undefined;
  for (;;) {
    const page: { counts: Record<string, number>; stacked: number; total: number; isDone: boolean; cursor: string } = await ctx.runQuery(internal.signals.countPage, { cursor });
    for (const [k, n] of Object.entries(page.counts)) counts[k] = (counts[k] ?? 0) + n;
    stacked += page.stacked;
    total += page.total;
    if (page.isDone) break;
    cursor = page.cursor;
  }
  await ctx.runMutation(internal.signals.saveCounts, { counts, stacked, total });
}

export const recount = internalAction({
  args: {},
  handler: async (ctx) => await refreshCounts(ctx),
});

// ---- For Ops ----

const MAX_ROWS = 500;
const SCAN = 2000;

/**
 * Homes on every chosen list (and on at least minLists lists), highest
 * score first, with the owner and mailing address for direct mail. Reads the
 * rarest chosen list by score, so a small list isn't crowded out.
 */
export const sellers = query({
  args: { lists: v.optional(v.array(v.string())), minLists: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const summary = await ctx.db
      .query("sellerCounts")
      .withIndex("by_county", (q) => q.eq("county", COUNTY))
      .first();
    const counts = summary?.counts ?? {};
    const wanted = (args.lists ?? []).filter((l): l is (typeof LIST_KEYS)[number] => (LIST_KEYS as string[]).includes(l));
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
      const p = await ctx.db.get(d.parcelId);
      if (!p) continue;
      homes.push({
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
      });
    }
    return {
      homes,
      more: picked.length >= limit || scanned >= SCAN,
      counts,
      stacked: summary?.stacked ?? 0,
      total: summary?.total ?? 0,
      lists: LIST_KEYS.map((key) => ({ key, label: LISTS[key].label, weight: LISTS[key].weight })),
    };
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
      signals: signals.map((s) => ({ kind: s.kind, detail: s.detail, status: s.status, caseNumber: s.caseNumber, date: s.date })),
      foreclosures: foreclosures.map((f) => ({ saleDate: f.saleDate, status: f.status, kind: f.kind })),
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

