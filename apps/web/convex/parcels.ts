// Midland's homes, apartment and commercial buildings and who owns them, from
// the appraisal roll the city publishes (lib/parcels.ts). Read in full once a
// week: the roll changes a few times a year, so most weeks nothing is
// written. Callers use it to know whose door they're calling; Outreach builds
// mailing lists from it for Pro companies.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { nowIso } from "./lib/access";
import { COUNTY_ROLLS, MIDLAND_DEEDS, isCompanyOwner, ownerOccupied, MIDLAND_GAPS, MIDLAND_PARCELS, PARCEL_FIELDS, PARCEL_VERSION, RESIDENTIAL_USE, addressByPin, addressKey, atAddress, countyParcels, deedHistory, districtParcel, districtProperty, districtSearchRows, districtStreet, nameKey, nameSearch, codeFromBuildings, isCommercialUse, isResidentialUse, isStorageOutlet, ownerOf, parcelKind, parcelWhere, rowsToParcels, type CountyRoll, type DeedRow, type DistrictRow, type ParcelKind, type ParcelRow } from "./lib/parcels";
import { districtGet, hasDistrictPage, sameOwnerName } from "./lib/district";
import { LANDLORD_HOMES } from "./lib/signals";
import { COUNTY_PLACES, OwnerGrouper, mailKey } from "./lib/outreach";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const parcelRow = v.object({
  cadId: v.string(),
  pin: v.optional(v.string()),
  useCode: v.string(),
  landUse: v.optional(v.string()),
  siteAddress: v.string(),
  addressKey: v.string(),
  looseKey: v.string(),
  street: v.optional(v.string()),
  owner: v.string(),
  owner2: v.optional(v.string()),
  mailing: v.object({
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
  }),
  ownerOccupied: v.boolean(),
  companyOwned: v.boolean(),
  marketValueCents: v.optional(v.number()),
  buildingValueCents: v.optional(v.number()),
  deedDate: v.optional(v.string()),
});

const KEYS = [
  "pin", "useCode", "landUse", "siteAddress", "addressKey", "looseKey", "street", "owner", "owner2", "ownerOccupied",
  "companyOwned", "marketValueCents", "buildingValueCents", "deedDate",
] as const;
/** Whose a parcel is, as Outreach groups the roll, and where its bill goes: what lists an owner's properties ("" for none). */
export const filing = (p: { owner: string; mailing: Doc<"parcels">["mailing"] }) => ({ ownerKey: OwnerGrouper.keyFor(p) ?? "", mailKey: mailKey(p.mailing) ?? "" });

/**
 * Storage, industrial or neither, as Outreach's grouping decides it (lib/outreach.ts fold): by the parcel's own codes
 * and owner, or for a commercial parcel they don't settle, by a storage business's sales-tax permit at its address.
 */
export async function kindOf(ctx: MutationCtx, county: string, row: { useCode: string; landUse?: string; owner: string; addressKey: string; vendorUse?: string }): Promise<ParcelKind | undefined> {
  if (!isCommercialUse(row.useCode)) return undefined;
  if (parcelKind(row) === "storage") return "storage";
  const here = await ctx.db
    .query("outlets")
    .withIndex("by_county_and_address_key", (q) => q.eq("county", county).eq("addressKey", row.addressKey))
    .take(20);
  return parcelKind(row, here.some(isStorageOutlet));
}

const sameParcel = (a: Doc<"parcels">, b: Record<string, unknown> & { mailing: Doc<"parcels">["mailing"] }) =>
  KEYS.every((k) => (a[k] ?? undefined) === (b[k] ?? undefined)) &&
  (["address", "city", "state", "zip"] as const).every((k) => (a.mailing[k] ?? undefined) === (b.mailing[k] ?? undefined));

/** Adds new parcels and updates changed ones, by appraisal id. Safe to run again. `county`: Midland when not given. */
export const upsert = internalMutation({
  args: { rows: v.array(parcelRow), county: v.optional(v.string()) },
  handler: async (ctx, { rows, county }) => {
    let added = 0;
    let updated = 0;
    const now = nowIso();
    const at = county ?? MIDLAND_PARCELS.county;
    for (const read of rows) {
      const existing = await ctx.db
        .query("parcels")
        .withIndex("by_cad_id", (q) => q.eq("cadId", read.cadId))
        .first();
      // Who owns it, where their bill goes and when they bought are the district's once its page has been read
      // (refreshOwners): the city's layer runs about a year behind, so its word only wins with a newer deed.
      const row =
        existing?.districtAt && !((read.deedDate ?? "") > (existing.deedDate ?? ""))
          ? { ...read, owner: existing.owner, owner2: existing.owner2, mailing: existing.mailing, deedDate: existing.deedDate, ownerOccupied: existing.ownerOccupied, companyOwned: existing.companyOwned }
          : read;
      const kind = await kindOf(ctx, at, { ...row, vendorUse: existing?.vendorUse });
      if (!existing) {
        await ctx.db.insert("parcels", { county: at, ...row, ...filing(row), ...(kind ? { kind } : {}), importedAt: now });
        added++;
      } else if (!sameParcel(existing, row) || existing.kind !== kind || existing.source) {
        // The city's own row from here on, if the district had filled it while the city's was blank.
        await ctx.db.patch(existing._id, { ...row, ...filing(row), kind, source: undefined, importedAt: now });
        updated++;
      }
    }
    return { added, updated };
  },
});

/** How many parcels one step of the filing takes. */
const FILE_PAGE = 800;
/**
 * Files the parcels read before owners' keys were kept on them: a county at a time, FILE_PAGE parcels a step, the rest
 * in the background. Only the unfiled are read (by the index), so once it has run it costs a lookup per county.
 * On deploy: `npx convex run parcels:fileOwners '{}'`.
 */
export const fileOwners = internalMutation({
  args: { county: v.optional(v.string()), page: v.optional(v.number()) },
  handler: async (ctx, { county, page = FILE_PAGE }): Promise<{ county?: string; filed: number; done: boolean }> => {
    const counties = Object.keys(COUNTY_PLACES);
    const at = county ?? counties[0];
    const unfiled = await ctx.db
      .query("parcels")
      .withIndex("by_county_and_owner_key", (q) => q.eq("county", at).eq("ownerKey", undefined))
      .take(page);
    for (const p of unfiled) await ctx.db.patch(p._id, filing(p));
    // More in this county, or the next one.
    const next = unfiled.length === page ? at : counties[counties.indexOf(at) + 1];
    if (next) await ctx.scheduler.runAfter(0, internal.parcels.fileOwners, { county: next, page });
    return { county: at, filed: unfiled.length, done: !next };
  },
});

/** Owners with LANDLORD_HOMES or more homes on the roll, counted by the city's layer itself. */
async function pullLandlords(ctx: ActionCtx) {
  const params = new URLSearchParams({
    where: `GOV_USE_CO IN (${RESIDENTIAL_USE.map((c) => `'${c}'`).join(",")})`,
    groupByFieldsForStatistics: "OWNER",
    outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "homes" }]),
    having: `COUNT(OBJECTID) >= ${LANDLORD_HOMES}`,
    f: "json",
  });
  const response = await fetch(`${MIDLAND_PARCELS.layer}/query?${params}`);
  if (!response.ok) throw new Error(`Midland landlords: HTTP ${response.status}`);
  const body = (await response.json()) as { error?: { message?: string }; features?: Array<{ attributes?: Record<string, unknown> }> };
  if (body.error) throw new Error(`Midland landlords: ${body.error.message ?? "the service returned an error"}`);
  const owners = (body.features ?? []).flatMap((f) => {
    const owner = ownerOf(f.attributes?.OWNER);
    const homes = f.attributes?.homes;
    return owner && typeof homes === "number" ? [{ owner, homes }] : [];
  });
  await ctx.runMutation(internal.parcels.setLandlords, { owners });
}

/** Replaces Midland's list of landlords. */
export const setLandlords = internalMutation({
  args: { owners: v.array(v.object({ owner: v.string(), homes: v.number() })) },
  handler: async (ctx, { owners }) => {
    for (const row of await ctx.db.query("landlords").collect()) if (row.county === MIDLAND_PARCELS.county) await ctx.db.delete(row._id);
    for (const o of owners) await ctx.db.insert("landlords", { county: MIDLAND_PARCELS.county, ...o });
  },
});

/**
 * Reads every home, apartment and commercial parcel, 2,000 at a time, and
 * records how it went on the permit feed's status table (source
 * "midland-parcels"): fetched is the parcels on the roll, lastAppliedAt the
 * newest deed on it.
 */
async function pullMidlandParcels(ctx: ActionCtx) {
  let offset = 0;
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let newestDeed: string | undefined;
  let error: string | undefined;
  try {
    for (;;) {
      const params = new URLSearchParams({
        where: parcelWhere(),
        outFields: PARCEL_FIELDS.join(","),
        orderByFields: "OBJECTID ASC",
        resultOffset: String(offset),
        resultRecordCount: "2000",
        returnGeometry: "false",
        f: "json",
      });
      const response = await fetch(`${MIDLAND_PARCELS.layer}/query?${params}`);
      if (!response.ok) throw new Error(`Midland owners: HTTP ${response.status}`);
      const body = (await response.json()) as {
        error?: { message?: string };
        features?: Parameters<typeof rowsToParcels>[0];
        exceededTransferLimit?: boolean;
      };
      if (body.error) throw new Error(`Midland owners: ${body.error.message ?? "the service returned an error"}`);
      const features = body.features ?? [];
      const rows = rowsToParcels(features);
      fetched += rows.length;
      for (let i = 0; i < rows.length; i += 400) {
        const result: { added: number; updated: number } = await ctx.runMutation(internal.parcels.upsert, {
          rows: rows.slice(i, i + 400),
        });
        added += result.added;
        updated += result.updated;
      }
      for (const row of rows) if (row.deedDate && (!newestDeed || row.deedDate > newestDeed)) newestDeed = row.deedDate;
      if (!body.exceededTransferLimit || features.length === 0) break;
      offset += features.length;
    }
    await pullLandlords(ctx);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  // Every home's motivated-seller lists, and the owners Outreach lists from, now the roll (and who's a landlord) is current.
  // Then the deed history of the storage and industrial parcels that are new or changed hands (it rebuilds the owners again when it found any).
  if (!error) {
    await ctx.scheduler.runAfter(0, internal.signals.recomputePage, {});
    await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
    await ctx.scheduler.runAfter(0, internal.parcels.readDeedHistory, {});
    // And the parcels the city's layer has blank, looked up at the appraisal district.
    await ctx.scheduler.runAfter(0, internal.parcels.findGaps, {});
    // And who owns each parcel today, from the district's own pages: whatever hasn't been read in the last month.
    await ctx.scheduler.runAfter(0, internal.parcels.refreshOwners, {});
  }
  await ctx.runMutation(internal.permits.recordSync, {
    source: MIDLAND_PARCELS.source,
    fetched,
    added,
    updated,
    lastAppliedAt: newestDeed,
    error,
    fieldsVersion: error ? undefined : PARCEL_VERSION,
  });
  return { fetched, added, updated, error };
}

/**
 * The weekly refresh. The deploy runs it with ifStale, which skips it when a
 * clean pass of this PARCEL_VERSION ran in the last week: `npx convex run parcels:syncMidland '{"ifStale":true}'`.
 */
export const syncMidland = internalAction({
  args: { ifStale: v.optional(v.boolean()) },
  handler: async (ctx, { ifStale }) => {
    if (ifStale) {
      const last = await ctx.runQuery(internal.permits.sourceState, { source: MIDLAND_PARCELS.source });
      const fresh = last && !last.error && last.fieldsVersion === PARCEL_VERSION && Date.now() - Date.parse(last.syncedAt) < WEEK_MS;
      if (fresh) return { skipped: true };
    }
    return await pullMidlandParcels(ctx);
  },
});

/** "Sync owners" on the Ops permits card. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await pullMidlandParcels(ctx);
  },
});

// ---- Midland's deed history (lib/parcels.ts MIDLAND_DEEDS) ----

const KINDS: ParcelKind[] = ["storage", "industrial"];
const deedRow = v.object({ seller: v.string(), date: v.optional(v.string()), instrument: v.optional(v.string()) });

/** Midland's storage and industrial parcels whose deed history hasn't been read at their current deed: `limit` of them, and how many in all. */
export const deedsDue = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const due: Array<{ id: Doc<"parcels">["_id"]; cadId: string; readFor: string }> = [];
    let left = 0;
    for (const kind of KINDS) {
      for await (const p of ctx.db.query("parcels").withIndex("by_county_and_kind", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("kind", kind))) {
        const readFor = p.deedDate ?? "";
        // A parcel only BatchData has isn't on the district's site under this id: its deed history came with it.
        if (p.deedsReadFor === readFor || p.source === "batchdata") continue;
        left++;
        if (due.length < limit) due.push({ id: p._id, cadId: p.cadId, readFor });
      }
    }
    return { due, left };
  },
});

/** Keeps what the district's page said for each parcel; no `deeds` means the page had nothing to read. */
export const saveDeeds = internalMutation({
  args: { rows: v.array(v.object({ id: v.id("parcels"), readFor: v.string(), deeds: v.optional(v.array(deedRow)) })) },
  handler: async (ctx, { rows }) => {
    for (const r of rows) {
      const p = await ctx.db.get(r.id);
      // A page with nothing to read leaves a history BatchData gave in place.
      if (p) await ctx.db.patch(r.id, { deeds: r.deeds ?? (p.vendorUse ? p.deeds : undefined), deedsReadFor: r.readFor });
    }
  },
});

/** How the deed history stands, for the readiness report: parcels of each kind, how many were read, and how many have an owner before. */
export const deedCoverage = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, { parcels: number; read: number; withHistory: number; sellers: number }> = {};
    for (const kind of KINDS) {
      const sellers = new Set<string>();
      const c = { parcels: 0, read: 0, withHistory: 0, sellers: 0 };
      for await (const p of ctx.db.query("parcels").withIndex("by_county_and_kind", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("kind", kind))) {
        c.parcels++;
        if (p.deedsReadFor !== undefined) c.read++;
        if (p.deeds?.length) c.withHistory++;
        for (const d of p.deeds ?? []) sellers.add(d.seller);
      }
      c.sellers = sellers.size;
      out[kind] = c;
    }
    return out;
  },
});

/** The deed history kept for an owner's storage and industrial parcels, by the start of the roll's name ("KOSF"): to check a read by hand. */
export const deedsOf = internalQuery({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    const out: Array<{ owner: string; address: string; kind: string; deedDate?: string; read: boolean; deeds?: DeedRow[] }> = [];
    for (const kind of KINDS) {
      for await (const p of ctx.db.query("parcels").withIndex("by_county_and_kind", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("kind", kind))) {
        if (p.owner.toUpperCase().startsWith(owner.toUpperCase())) out.push({ owner: p.owner, address: p.siteAddress, kind, deedDate: p.deedDate, read: p.deedsReadFor !== undefined, deeds: p.deeds });
      }
    }
    return out.slice(0, 40);
  },
});

/** How long the read waits between pages (a page a second, about), and how many it takes from the queue at a time. Tests shorten the wait. */
export const DEED_PACE = { waitMs: 1_000, batch: 20 };
/** This many pages in a row that can't be read and the trouble is the site's, not one parcel's. */
const DEED_DOUBTS = 5;


/** One page of the district's site: `none` when it can't be read (missing, broken); `refused` when the site says to stop asking. */

type DeedPage = { deeds: DeedRow[] } | { none: string } | { refused: string };

/** One property's page: its deed rows; `none` when this page can't be read (missing, broken, no deed table); `refused` when the site says to stop asking. */
async function deedPage(cadId: string): Promise<DeedPage> {
  const got = await districtGet(MIDLAND_DEEDS.page(cadId));
  if (!("html" in got)) return got;
  const deeds = deedHistory(got.html);
  return deeds ? { deeds } : { none: "no deed table on the page" };
}

const deedTotals = v.object({ read: v.number(), found: v.number(), blank: v.number() });

/**
 * Reads the deed history of Midland's storage and industrial parcels from the appraisal district's property pages:
 * only the ones not read at their current deed, a page about every second, handing on to a fresh step after STEP_MS.
 * Scheduled after each roll read, so the first pass is every such parcel (half an hour or so) and later ones only
 * what changed hands. A page that can't be read is left blank once a later page reads fine (the trouble was that
 * parcel's); DEED_DOUBTS in a row and the step is tried again a minute later, up to STEP_TRIES. A refusal (403, 429)
 * stops the read where it is: nothing here works around one. When it's done it records how it went under
 * MIDLAND_DEEDS.source and, if it read anything, rebuilds Midland's owners so the lists show it.
 * By hand: `npx convex run parcels:readDeedHistory '{"background":true}'`.
 */
export const readDeedHistory = internalAction({
  args: { background: v.optional(v.boolean()), totals: v.optional(deedTotals), failures: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled?: true; left?: number; read: number; found: number; blank: number; error?: string }> => {
    const sum = { read: 0, found: 0, blank: 0, ...(args.totals ?? {}) };
    if (args.background) {
      await ctx.scheduler.runAfter(0, internal.parcels.readDeedHistory, {});
      return { scheduled: true, ...sum };
    }
    const started = Date.now();
    let error: string | undefined;
    let refused = false;
    let left = 0;
    // Pages that couldn't be read, until a later one reads fine.
    let doubts: Array<{ id: Doc<"parcels">["_id"]; readFor: string }> = [];
    let why = "";
    while (!error && Date.now() - started < STEP_MS) {
      const queue: { due: Array<{ id: Doc<"parcels">["_id"]; cadId: string; readFor: string }>; left: number } = await ctx.runQuery(internal.parcels.deedsDue, { limit: DEED_PACE.batch });
      // What's left once the doubted ones are set aside: they stay due until a good page clears them.
      const due = queue.due.filter((p) => !doubts.some((d) => d.id === p.id));
      left = queue.left;
      if (due.length === 0) break;
      const rows: Array<{ id: Doc<"parcels">["_id"]; readFor: string; deeds?: DeedRow[] }> = [];
      for (const p of due) {
        const page = await deedPage(p.cadId);
        if ("refused" in page) {
          refused = true;
          error = `Midland deed history: the district's site refused the read (${page.refused})`;
          break;
        }
        if ("none" in page) {
          doubts.push({ id: p.id, readFor: p.readFor });
          why = page.none;
          if (doubts.length >= DEED_DOUBTS) {
            error = `Midland deed history: ${DEED_DOUBTS} pages in a row couldn't be read (${why})`;
            break;
          }
        } else {
          rows.push({ id: p.id, readFor: p.readFor, deeds: page.deeds }, ...doubts);
          sum.blank += doubts.length;
          sum.read += 1 + doubts.length;
          if (page.deeds.length) sum.found++;
          doubts = [];
        }
        if (DEED_PACE.waitMs) await new Promise((r) => setTimeout(r, DEED_PACE.waitMs));
      }
      if (rows.length) await ctx.runMutation(internal.parcels.saveDeeds, { rows });
      left -= rows.length;
    }
    const more = left > doubts.length;
    if (!error && more) {
      await ctx.scheduler.runAfter(0, internal.parcels.readDeedHistory, { totals: sum });
      return { left, ...sum };
    }
    // The site in trouble for a moment: the same parcels again a minute later.
    const failures = (args.failures ?? 0) + 1;
    if (error && !refused && failures < STEP_TRIES) {
      await ctx.scheduler.runAfter(60_000, internal.parcels.readDeedHistory, { totals: sum, failures });
      return { left, ...sum, error };
    }
    // The few left unreadable with nothing after them to clear them: the same trouble as a run of them.
    if (!error && doubts.length) error = `Midland deed history: ${doubts.length} page${doubts.length === 1 ? "" : "s"} couldn't be read (${why})`;
    if (sum.found > 0) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
    await ctx.runMutation(internal.permits.recordSync, { source: MIDLAND_DEEDS.source, fetched: sum.read, added: sum.found, updated: sum.blank, error });
    return { left, ...sum, error };
  },
});

// ---- Midland's blank parcels (lib/parcels.ts MIDLAND_GAPS) ----

const pause = () => (DEED_PACE.waitMs ? new Promise((r) => setTimeout(r, DEED_PACE.waitMs)) : Promise.resolve());
/** How many street addresses one blank shape is looked up by (a tract with a dozen address points is still one owner or two). */
const GAP_ADDRESSES = 3;
/** An address the district had nothing for is asked again after this long. */
const GAP_RETRY_MS = 90 * 24 * 60 * 60 * 1000;
/** How many of a street's addresses one step takes (a page a second each). */
const GAPS_PER_STREET = 60;

const gapRow = v.object({ addressKey: v.string(), number: v.string(), street: v.string(), dir: v.optional(v.string()) });

/** The blank shapes' addresses as of this listing: new ones wait to be looked up; one the district had nothing for waits again after GAP_RETRY_MS. */
export const noteGaps = internalMutation({
  args: { rows: v.array(gapRow), seenAt: v.string() },
  handler: async (ctx, { rows, seenAt }) => {
    let added = 0;
    for (const row of rows) {
      const have = await ctx.db
        .query("parcelGaps")
        .withIndex("by_county_and_address_key", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("addressKey", row.addressKey))
        .first();
      if (!have) {
        await ctx.db.insert("parcelGaps", { county: MIDLAND_PARCELS.county, ...row, state: "waiting", seenAt });
        added++;
      } else {
        // Asked again after a while, or at once when the street is now named as the district names it.
        const renamed = have.street !== row.street;
        const again = have.state === "none" && (renamed || !have.lookedUpAt || Date.parse(seenAt) - Date.parse(have.lookedUpAt) > GAP_RETRY_MS);
        await ctx.db.patch(have._id, { seenAt, ...(renamed ? { street: row.street } : {}), ...(again ? { state: "waiting" as const, why: undefined } : {}) });
      }
    }
    return { added };
  },
});

/** Drops the gaps this listing didn't see: the city's layer has those parcels now. A few hundred a step. */
export const dropFilledGaps = internalMutation({
  args: { seenAt: v.string() },
  handler: async (ctx, { seenAt }) => {
    const gone = await ctx.db
      .query("parcelGaps")
      .withIndex("by_county_and_seen", (q) => q.eq("county", MIDLAND_PARCELS.county).lt("seenAt", seenAt))
      .take(400);
    for (const g of gone) await ctx.db.delete(g._id);
    if (gone.length === 400) await ctx.scheduler.runAfter(0, internal.parcels.dropFilledGaps, { seenAt });
    return { dropped: gone.length };
  },
});

type Ring = number[][];
type Shape = { rings: Ring[]; box: [number, number, number, number]; found: number };
const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** Which grid square a point is in: shapes are filed under every square their box touches, so a point meets only its neighbours. */
const CELL = 0.004;
const cellOf = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;

/**
 * Lists Midland's blank parcels and the street addresses inside them (both from the city's public layers) into
 * parcelGaps, drops the gaps the city has since filled, and starts the lookups. Scheduled after each roll read.
 * By hand: `npx convex run parcels:findGaps '{}'`.
 */
export const findGaps = internalAction({
  args: { thenFill: v.optional(v.boolean()) },
  handler: async (ctx, { thenFill = true }): Promise<{ blank: number; addresses: number; added: number; error?: string }> => {
    const seenAt = nowIso();
    let blank = 0;
    let addresses = 0;
    let added = 0;
    let error: string | undefined;
    try {
      // The shapes with no owner on them.
      const idsAnswer = (await query(MIDLAND_PARCELS.layer, { where: "OWNER IS NULL", returnIdsOnly: "true" }, "Midland blank parcels")) as { objectIds?: number[] };
      const ids = idsAnswer.objectIds ?? [];
      const shapes: Shape[] = [];
      const grid = new Map<string, number[]>();
      for (let i = 0; i < ids.length; i += 150) {
        const answer = (await query(
          MIDLAND_PARCELS.layer,
          { objectIds: ids.slice(i, i + 150).join(","), outFields: "OBJECTID", returnGeometry: "true", outSR: "4326", geometryPrecision: "6" },
          "Midland blank parcels",
        )) as { features?: Array<{ geometry?: { rings?: Ring[] } }> };
        for (const f of answer.features ?? []) {
          const rings = f.geometry?.rings;
          if (!rings?.length) continue;
          const xs = rings[0].map((p) => p[0]);
          const ys = rings[0].map((p) => p[1]);
          const box: Shape["box"] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          const at = shapes.push({ rings, box, found: 0 }) - 1;
          for (let cx = Math.floor(box[0] / CELL); cx <= Math.floor(box[2] / CELL); cx++) {
            for (let cy = Math.floor(box[1] / CELL); cy <= Math.floor(box[3] / CELL); cy++) {
              const key = `${cx}:${cy}`;
              if (!grid.has(key)) grid.set(key, []);
              grid.get(key)!.push(at);
            }
          }
        }
      }
      blank = shapes.length;
      // Every address point, a page at a time; kept only when it falls inside a blank shape.
      const rows = new Map<string, { addressKey: string; number: string; street: string; dir?: string }>();
      // (With no blank shapes there is nothing to place: the address points aren't read at all.)
      for (let offset = 0; shapes.length > 0; ) {
        const answer = (await query(
          MIDLAND_GAPS.addresses,
          { where: "ADDR_HN IS NOT NULL", outFields: "ADDR_HN,ADDR_PD,ADDR_SN,ADDRESS", orderByFields: "OBJECTID ASC", returnGeometry: "true", outSR: "4326", geometryPrecision: "6", resultOffset: String(offset), resultRecordCount: "2000" },
          "Midland addresses",
        )) as Answer & { features?: Array<Feature & { geometry?: { x?: number; y?: number } }> };
        const features = answer.features ?? [];
        for (const f of features) {
          const { x, y } = f.geometry ?? {};
          const a = f.attributes ?? {};
          const number = typeof a.ADDR_HN === "string" ? a.ADDR_HN.trim() : "";
          const full = typeof a.ADDRESS === "string" ? a.ADDRESS : "";
          // The street as the district will list it: a numbered road gets its kind ("307" on "8910 F M 307" is "FM RD 00307").
          const street = typeof a.ADDR_SN === "string" && a.ADDR_SN.trim() ? districtStreet(a.ADDR_SN, full) : "";
          if (x === undefined || y === undefined || !/^\d+$/.test(number) || !street) continue;
          const shape = (grid.get(cellOf(x, y)) ?? []).map((i) => shapes[i]).find((sh) => x >= sh.box[0] && x <= sh.box[2] && y >= sh.box[1] && y <= sh.box[3] && inRing(x, y, sh.rings[0]));
          if (!shape || shape.found >= GAP_ADDRESSES) continue;
          const key = addressKey(full || `${number} ${street}`);
          if (!key || rows.has(key)) continue;
          shape.found++;
          const dir = typeof a.ADDR_PD === "string" && a.ADDR_PD.trim() ? a.ADDR_PD.trim().toUpperCase() : undefined;
          rows.set(key, { addressKey: key, number, street, ...(dir ? { dir } : {}) });
        }
        if (!answer.exceededTransferLimit || features.length === 0) break;
        offset += features.length;
      }
      addresses = rows.size;
      const all = [...rows.values()];
      for (let i = 0; i < all.length; i += 200) {
        const r: { added: number } = await ctx.runMutation(internal.parcels.noteGaps, { rows: all.slice(i, i + 200), seenAt });
        added += r.added;
      }
      await ctx.runMutation(internal.parcels.dropFilledGaps, { seenAt });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (!error && thenFill) await ctx.scheduler.runAfter(0, internal.parcels.fillGaps, {});
    return { blank, addresses, added, error };
  },
});

type Gap = { id: Doc<"parcelGaps">["_id"]; number: string; street: string; dir?: string };

/** The next street with addresses waiting, GAPS_PER_STREET of them at most (skipping the streets set aside this step), and how many wait in all. */
export const gapsDue = internalQuery({
  args: { skip: v.array(v.string()) },
  handler: async (ctx, { skip }): Promise<{ street?: string; gaps: Gap[]; waiting: number }> => {
    let street: string | undefined;
    const gaps: Gap[] = [];
    let waiting = 0;
    for await (const g of ctx.db.query("parcelGaps").withIndex("by_county_and_state", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("state", "waiting"))) {
      waiting++;
      if (skip.includes(g.street)) continue;
      street ??= g.street;
      if (g.street === street && gaps.length < GAPS_PER_STREET) gaps.push({ id: g._id, number: g.number, street: g.street, dir: g.dir });
    }
    return { street, gaps, waiting };
  },
});

/** Which of these property ids the city's own read already holds: those are left alone. */
export const cityHas = internalQuery({
  args: { cadIds: v.array(v.string()) },
  handler: async (ctx, { cadIds }) => {
    const out: string[] = [];
    for (const cadId of cadIds) {
      const p = await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", cadId)).first();
      if (p && p.source !== "district") out.push(cadId);
    }
    return out;
  },
});

/** Keeps the parcels the district's pages gave (with their deed history, read in the same visit), and what became of each gap. */
export const saveFilled = internalMutation({
  args: {
    parcels: v.array(v.object({ row: parcelRow, deeds: v.array(deedRow) })),
    gaps: v.array(v.object({ id: v.id("parcelGaps"), cadIds: v.array(v.string()), why: v.optional(v.union(v.literal("held"), v.literal("land"), v.literal("absent"))) })),
  },
  handler: async (ctx, { parcels, gaps }) => {
    const now = nowIso();
    const county = MIDLAND_PARCELS.county;
    let added = 0;
    for (const { row, deeds } of parcels) {
      const existing = await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", row.cadId)).first();
      if (existing && existing.source !== "district") continue;
      const fields = { ...row, ...filing(row), kind: await kindOf(ctx, county, { ...row, vendorUse: existing?.vendorUse }), source: "district" as const, deeds, deedsReadFor: row.deedDate ?? "", importedAt: now };
      if (existing) await ctx.db.patch(existing._id, fields);
      else {
        await ctx.db.insert("parcels", { county, ...fields });
        added++;
      }
    }
    for (const g of gaps) if (await ctx.db.get(g.id)) await ctx.db.patch(g.id, { state: g.cadIds.length ? "found" : "none", cadIds: g.cadIds, why: g.cadIds.length ? undefined : g.why, lookedUpAt: now });
    return { added };
  },
});

type NoneWhy = "held" | "land" | "absent";
type Looked = { parcels: Array<{ row: ParcelRow; deeds: DeedRow[] }>; found: Map<number, string[]>; why: Map<number, NoneWhy>; refused?: string; unreadable?: string };

/**
 * One street at the district: a search lists every property on it, each wanted address takes the rows at its number,
 * and each owner there gets one page read (the owner, the mailing address, what's built, the deeds). Properties the
 * city's own read already holds are left alone. `found` is the property ids kept for each wanted address, by position.
 */
async function lookUpStreet(ctx: ActionCtx, street: string, wanted: Array<{ number: string; dir?: string }>): Promise<Looked> {
  const out: Looked = { parcels: [], found: new Map(), why: new Map() };
  // The district's site sometimes answers a first search with its front page; asked once more, it gives the results.
  let search = await districtGet(MIDLAND_GAPS.search(street, wanted[0].number));
  await pause();
  if ("html" in search && !districtSearchRows(search.html)) {
    search = await districtGet(MIDLAND_GAPS.search(street, wanted[0].number));
    await pause();
  }
  if ("refused" in search) return { ...out, refused: search.refused };
  const rows = "html" in search ? districtSearchRows(search.html) : undefined;
  if (!rows) {
    // What came back instead, in a few words, for whoever reads the record of the run.
    const title = "html" in search ? (search.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
    return { ...out, unreadable: "none" in search ? search.none : `the search page had no results list (${search.html.length} characters${title ? `, titled "${title}"` : ""})` };
  }
  const matches = wanted.map((w) => rows.filter((r) => atAddress(r, w.number, street, w.dir)));
  const held = new Set<string>(matches.flat().length ? await ctx.runQuery(internal.parcels.cityHas, { cadIds: [...new Set(matches.flat().map((r) => r.id))] }) : []);
  const done = new Set<string>();
  for (const [i, at] of matches.entries()) {
    const ids: string[] = [];
    // One owner's accounts at the address are one property.
    const byOwner = new Map<string, DistrictRow[]>();
    for (const r of at) if (!held.has(r.id)) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r]);
    for (const accounts of byOwner.values()) {
      if (done.has(accounts[0].id)) {
        ids.push(accounts[0].id);
        continue;
      }
      const page = await districtGet(MIDLAND_DEEDS.page(accounts[0].id));
      await pause();
      if ("refused" in page) return { ...out, refused: page.refused };
      const read = "html" in page ? districtProperty(page.html) : undefined;
      const row = read ? districtParcel(accounts, read) : undefined;
      if (!read || !row) continue;
      done.add(row.cadId);
      ids.push(row.cadId);
      out.parcels.push({ row, deeds: read.deeds });
    }
    out.found.set(i, ids);
    // Nothing kept: the district has nothing at that number, the city's own read already holds what is there, or it's land.
    if (ids.length === 0) out.why.set(i, at.length === 0 ? "absent" : at.every((r) => held.has(r.id)) ? "held" : "land");
  }
  return out;
}

const fillTotals = v.object({ looked: v.number(), added: v.number(), none: v.number() });

/**
 * Looks up the waiting addresses at the appraisal district, a street at a time and a request about every second,
 * handing on to a fresh step after STEP_MS. The same rules as the deed read: a refusal stops it where it is and
 * nothing works around one; DEED_DOUBTS unreadable searches in a row and the step is tried again a minute later,
 * up to STEP_TRIES. When it's done it records how it went under MIDLAND_GAPS.source and, if it added parcels,
 * rebuilds Midland's owners. By hand: `npx convex run parcels:fillGaps '{}'`.
 */
export const fillGaps = internalAction({
  args: { totals: v.optional(fillTotals), failures: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ waiting: number; looked: number; added: number; none: number; error?: string }> => {
    const sum = { looked: 0, added: 0, none: 0, ...(args.totals ?? {}) };
    const started = Date.now();
    let error: string | undefined;
    let refused = false;
    let waiting = 0;
    let more = false;
    // Streets whose search couldn't be read this step, until a later one reads fine.
    const doubts: Array<{ street: string; gaps: Gap[] }> = [];
    let why = "";
    while (!error) {
      const due: { street?: string; gaps: Gap[]; waiting: number } = await ctx.runQuery(internal.parcels.gapsDue, { skip: doubts.map((d) => d.street) });
      waiting = due.waiting;
      if (!due.street) break;
      if (Date.now() - started >= STEP_MS) {
        more = true;
        break;
      }
      const looked = await lookUpStreet(ctx, due.street, due.gaps);
      if (looked.refused) {
        refused = true;
        error = `Midland blank parcels: the district's site refused the read (${looked.refused})`;
        break;
      }
      if (looked.unreadable) {
        doubts.push({ street: due.street, gaps: due.gaps });
        why = looked.unreadable;
        if (doubts.length >= DEED_DOUBTS) error = `Midland blank parcels: ${DEED_DOUBTS} searches in a row couldn't be read (${why})`;
        continue;
      }
      // A search that reads fine says the earlier trouble was those streets' own: nothing found for them, for now.
      const gaps = [...due.gaps.map((g, i) => ({ id: g.id, cadIds: looked.found.get(i) ?? [], why: looked.why.get(i) })), ...doubts.flatMap((d) => d.gaps.map((g) => ({ id: g.id, cadIds: [] as string[], why: undefined as NoneWhy | undefined })))];
      doubts.length = 0;
      const saved: { added: number } = await ctx.runMutation(internal.parcels.saveFilled, { parcels: looked.parcels, gaps });
      sum.looked += gaps.length;
      sum.added += saved.added;
      sum.none += gaps.filter((g) => g.cadIds.length === 0).length;
    }
    if (!error && more) {
      await ctx.scheduler.runAfter(0, internal.parcels.fillGaps, { totals: sum });
      return { waiting, ...sum };
    }
    const failures = (args.failures ?? 0) + 1;
    if (error && !refused && failures < STEP_TRIES) {
      await ctx.scheduler.runAfter(60_000, internal.parcels.fillGaps, { totals: sum, failures });
      return { waiting, ...sum, error };
    }
    if (!error && doubts.length) error = `Midland blank parcels: ${doubts.length} search${doubts.length === 1 ? "" : "es"} couldn't be read (${why})`;
    if (sum.added > 0) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
    await ctx.runMutation(internal.permits.recordSync, { source: MIDLAND_GAPS.source, fetched: sum.looked, added: sum.added, updated: sum.none, error });
    return { waiting, ...sum, error };
  },
});

/**
 * One address looked up at the district at once, whether or not the listing has it: for a property someone asks
 * about. `npx convex run parcels:fillAddress '{"number":"200","street":"NORMAN"}'`.
 */
export const fillAddress = internalAction({
  args: { number: v.string(), street: v.string(), dir: v.optional(v.string()) },
  handler: async (ctx, { number, street, dir }): Promise<{ added: number; found: string[]; error?: string }> => {
    const looked = await lookUpStreet(ctx, street.trim().toUpperCase(), [{ number: number.trim(), dir }]);
    if (looked.refused || looked.unreadable) return { added: 0, found: [], error: looked.refused ? `the district's site refused the read (${looked.refused})` : looked.unreadable };
    const saved: { added: number } = await ctx.runMutation(internal.parcels.saveFilled, { parcels: looked.parcels, gaps: [] });
    if (looked.parcels.length) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
    return { added: saved.added, found: looked.found.get(0) ?? [] };
  },
});

// ---- The same owners, by name: what else the district shows them holding ----

/** The owners of Midland's storage and industrial parcels, each name once, in order: who the name check asks about. */
export const kindOwners = internalQuery({
  args: {},
  handler: async (ctx) => {
    const names = new Set<string>();
    for (const kind of KINDS) {
      for await (const p of ctx.db.query("parcels").withIndex("by_county_and_kind", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("kind", kind))) names.add(p.owner);
    }
    return [...names].sort();
  },
});

/** Which of these property ids are in the parcels table at all. */
export const haveParcels = internalQuery({
  args: { cadIds: v.array(v.string()) },
  handler: async (ctx, { cadIds }) => {
    const out: string[] = [];
    for (const cadId of cadIds) if (await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", cadId)).first()) out.push(cadId);
    return out;
  },
});

/** How many properties one owner may have missing before it's left for a person to look at (a name shared by many). */
const OWNER_MISSING_MAX = 25;

/**
 * One owner at the district, by name: every property under that name the parcels table doesn't have, each read from
 * its page and kept when there's a building on it. Catches what an address can't: a property the city's layer has
 * blank and addresses differently (KO Storage's 8910 FM 307).
 */
async function lookUpOwner(ctx: ActionCtx, owner: string): Promise<{ parcels: Array<{ row: ParcelRow; deeds: DeedRow[] }>; refused?: string; unreadable?: string; skipped?: true }> {
  const out: { parcels: Array<{ row: ParcelRow; deeds: DeedRow[] }> } = { parcels: [] };
  const term = nameSearch(owner);
  let search = await districtGet(MIDLAND_GAPS.byName(term));
  await pause();
  if ("html" in search && !districtSearchRows(search.html)) {
    search = await districtGet(MIDLAND_GAPS.byName(term));
    await pause();
  }
  if ("refused" in search) return { ...out, refused: search.refused };
  const rows = "html" in search ? districtSearchRows(search.html) : undefined;
  if (!rows) return { ...out, unreadable: "none" in search ? search.none : "the name search had no results list" };
  const theirs = rows.filter((r) => nameKey(r.owner) === nameKey(owner) && r.number !== "0");
  const have = new Set<string>(theirs.length ? await ctx.runQuery(internal.parcels.haveParcels, { cadIds: theirs.map((r) => r.id) }) : []);
  // One property per address: accounts at one address are one (undivided interests), and one we hold any account of is held.
  const byAddress = new Map<string, DistrictRow[]>();
  for (const r of theirs) {
    const key = `${r.number}|${r.dir ?? ""}|${r.street}`;
    byAddress.set(key, [...(byAddress.get(key) ?? []), r]);
  }
  const missing = [...byAddress.values()].filter((accounts) => !accounts.some((a) => have.has(a.id)));
  if (missing.length > OWNER_MISSING_MAX) return { ...out, skipped: true };
  for (const accounts of missing) {
    const page = await districtGet(MIDLAND_DEEDS.page(accounts[0].id));
    await pause();
    if ("refused" in page) return { ...out, refused: page.refused };
    const read = "html" in page ? districtProperty(page.html) : undefined;
    const row = read ? districtParcel(accounts, read) : undefined;
    if (read && row) out.parcels.push({ row, deeds: read.deeds });
  }
  return out;
}

const ownerTotals = v.object({ asked: v.number(), added: v.number(), skipped: v.number() });

/**
 * The name check: each storage and industrial owner looked up at the district by name, from `from` on, a request
 * about every second, handing on to a fresh step after STEP_MS. `names` asks about just those. A refusal stops it;
 * unreadable searches in a row are tried again later, then recorded. Records how it went under "midland-owner-check"
 * and rebuilds Midland's owners when it added any. By hand: `npx convex run parcels:fillOwners '{"names":["KOSF II MIDLAND LLC"]}'`.
 */
export const fillOwners = internalAction({
  args: { names: v.optional(v.array(v.string())), from: v.optional(v.number()), totals: v.optional(ownerTotals), failures: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ owners: number; asked: number; added: number; skipped: number; addedTo: string[]; error?: string }> => {
    const names: string[] = args.names ?? (await ctx.runQuery(internal.parcels.kindOwners, {}));
    const sum = { asked: 0, added: 0, skipped: 0, ...(args.totals ?? {}) };
    const addedTo: string[] = [];
    const started = Date.now();
    let at = args.from ?? 0;
    let error: string | undefined;
    let refused = false;
    let doubts = 0;
    for (; at < names.length && !error && Date.now() - started < STEP_MS; at++) {
      const looked = await lookUpOwner(ctx, names[at]);
      if (looked.refused) {
        refused = true;
        error = `Midland owner check: the district's site refused the read (${looked.refused})`;
        break;
      }
      if (looked.unreadable) {
        if (++doubts >= DEED_DOUBTS) {
          error = `Midland owner check: ${DEED_DOUBTS} searches in a row couldn't be read (${looked.unreadable})`;
          at -= doubts - 1;
          break;
        }
        continue;
      }
      doubts = 0;
      sum.asked++;
      if (looked.skipped) sum.skipped++;
      if (looked.parcels.length) {
        const saved: { added: number } = await ctx.runMutation(internal.parcels.saveFilled, { parcels: looked.parcels, gaps: [] });
        sum.added += saved.added;
        if (saved.added) addedTo.push(names[at]);
      }
    }
    const rest = args.names ? { names: args.names } : {};
    if (!error && at < names.length) {
      await ctx.scheduler.runAfter(0, internal.parcels.fillOwners, { ...rest, from: at, totals: sum });
      return { owners: names.length, ...sum, addedTo };
    }
    const failures = (args.failures ?? 0) + 1;
    if (error && !refused && failures < STEP_TRIES) {
      await ctx.scheduler.runAfter(60_000, internal.parcels.fillOwners, { ...rest, from: Math.max(0, at), totals: sum, failures });
      return { owners: names.length, ...sum, addedTo, error };
    }
    if (sum.added > 0) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
    await ctx.runMutation(internal.permits.recordSync, { source: "midland-owner-check", fetched: sum.asked, added: sum.added, updated: sum.skipped, error });
    return { owners: names.length, ...sum, addedTo, error };
  },
});

/** Every `every`th address in a state, to check a run by hand. */
export const gapSample = internalQuery({
  args: { state: v.union(v.literal("waiting"), v.literal("found"), v.literal("none")), every: v.number() },
  handler: async (ctx, { state, every }) => {
    const out: Array<{ number: string; street: string; dir?: string; cadIds?: string[]; why?: string }> = [];
    let n = 0;
    for await (const g of ctx.db.query("parcelGaps").withIndex("by_county_and_state", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("state", state))) {
      if (n++ % every === 0 && out.length < 60) out.push({ number: g.number, street: g.street, dir: g.dir, cadIds: g.cadIds, why: g.why });
    }
    return out;
  },
});

/** How the blank parcels stand, for the readiness report: addresses waiting, found and with nothing found, and the storage and industrial parcels filled from the district. */
export const gapCoverage = internalQuery({
  args: {},
  handler: async (ctx) => {
    const c = { waiting: 0, found: 0, none: 0, held: 0, land: 0, absent: 0, storageFilled: 0, industrialFilled: 0 };
    for await (const g of ctx.db.query("parcelGaps").withIndex("by_county_and_state", (q) => q.eq("county", MIDLAND_PARCELS.county))) {
      c[g.state]++;
      if (g.state === "none" && g.why) c[g.why]++;
    }
    for (const kind of KINDS) {
      for await (const p of ctx.db.query("parcels").withIndex("by_county_and_kind", (q) => q.eq("county", MIDLAND_PARCELS.county).eq("kind", kind))) {
        if (p.source === "district") c[`${kind}Filled`]++;
      }
    }
    return c;
  },
});

// ---- Odessa and Lubbock (lib/parcels.ts COUNTY_ROLLS) ----

type Feature = { attributes?: Record<string, unknown> };
type Answer = { error?: { message?: string }; features?: Feature[]; exceededTransferLimit?: boolean };

/** How long a failed query waits before each try (the first at once). Tests shorten them. */
export const QUERY_WAITS = [0, 2_000, 6_000];

/** One query of an ArcGIS layer, posted when the where clause is long; a failed try is tried again twice, a little later each time. */
async function query(layer: string, params: Record<string, string>, what: string): Promise<Answer> {
  const body = new URLSearchParams({ returnGeometry: "false", f: "json", ...params });
  let last: unknown;
  for (const wait of QUERY_WAITS) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const response =
        body.toString().length > 1500
          ? await fetch(`${layer}/query`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() })
          : await fetch(`${layer}/query?${body}`);
      if (!response.ok) throw new Error(`${what}: HTTP ${response.status}`);
      const answer = (await response.json()) as Answer;
      if (answer.error) throw new Error(`${what}: ${answer.error.message ?? "the service returned an error"}`);
      return answer;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(`${what}: ${String(last)}`);
}

const PINS_PER_QUERY = 200;

/** The street address of each PIN, from the roll's address layers in order. */
async function addressesFor(roll: CountyRoll, pins: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const source of roll.addresses) {
    const wanted = [...new Set(pins.filter((p) => !found.has(p)))];
    const chunks: string[][] = [];
    for (let i = 0; i < wanted.length; i += PINS_PER_QUERY) chunks.push(wanted.slice(i, i + PINS_PER_QUERY));
    // A few at a time: the city's and district's servers turn away a burst.
    await inBatches(
      chunks,
      async (chunk) => {
        const where = [`${source.pin} IN (${chunk.map((p) => `'${p.replace(/'/g, "''")}'`).join(",")})`, source.where].filter(Boolean).join(" AND ");
        for (let offset = 0; ; ) {
          const answer = await query(source.layer, { where, outFields: `${source.pin},${source.address}`, resultOffset: String(offset), resultRecordCount: "1000" }, `${roll.county} addresses`);
          const features = answer.features ?? [];
          const here = addressByPin(features, source.pin, source.address);
          for (const [pin, address] of here) {
            const had = found.get(pin);
            if (!had || address.length < had.length) found.set(pin, address);
          }
          if (!answer.exceededTransferLimit || features.length === 0) break;
          offset += features.length;
        }
      },
    );
  }
  return found;
}

/** Runs `work` on every item, `width` at a time. */
async function inBatches<T>(items: T[], work: (item: T) => Promise<void>, width = 2) {
  for (let i = 0; i < items.length; i += width) await Promise.all(items.slice(i, i + width).map(work));
}

const totals = v.object({ fetched: v.number(), added: v.number(), updated: v.number(), newestDeed: v.optional(v.string()) });
/** How long one step reads before handing on to the next, well inside an action's 10 minutes. */
const STEP_MS = 4 * 60 * 1000;
const UPSERT_ROWS = 300;
/** How many times a step may fail in a row before the read stops and records why. */
const STEP_TRIES = 5;

/**
 * Reads a county's roll (Ector, Lubbock or Taylor) a page at a time from `offset`,
 * each page's parcels at their address points, into the parcels table; hands
 * on to a fresh step after STEP_MS, so a big roll never meets the action
 * limit. When the roll is read it records how it went under the roll's
 * source and rebuilds that county's Outreach owners. The deploy runs it with
 * ifStale, which skips it when a clean read of this PARCEL_VERSION ran in
 * the last week: `npx convex run parcels:syncCounty '{"county":"Ector","ifStale":true}'`.
 */
export const syncCounty = internalAction({
  args: {
    county: v.union(v.literal("Ector"), v.literal("Lubbock"), v.literal("Taylor")),
    ifStale: v.optional(v.boolean()),
    /** Schedules the read and returns at once: the deploy shouldn't wait minutes for it. */
    background: v.optional(v.boolean()),
    offset: v.optional(v.number()),
    totals: v.optional(totals),
    /** How many times in a row this step has failed: it's tried again a minute later, up to STEP_TRIES. */
    failures: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ skipped?: true; scheduled?: true; next?: number; fetched?: number; added?: number; updated?: number; error?: string }> => {
    const roll = COUNTY_ROLLS[args.county];
    if (args.ifStale && args.offset === undefined) {
      const last = await ctx.runQuery(internal.permits.sourceState, { source: roll.source });
      const fresh = last && !last.error && last.fieldsVersion === PARCEL_VERSION && Date.now() - Date.parse(last.syncedAt) < WEEK_MS;
      if (fresh) return { skipped: true };
    }
    if (args.background) {
      await ctx.scheduler.runAfter(0, internal.parcels.syncCounty, { county: args.county });
      return { scheduled: true };
    }
    const sum = { fetched: 0, added: 0, updated: 0, ...(args.totals ?? {}) };
    let offset = args.offset ?? 0;
    const started = Date.now();
    let error: string | undefined;
    let done = false;
    try {
      while (Date.now() - started < STEP_MS) {
        const answer = await query(
          roll.layer,
          { where: roll.where, outFields: roll.fields.join(","), orderByFields: `${roll.orderBy} ASC`, resultOffset: String(offset), resultRecordCount: String(roll.pageSize) },
          `${roll.county} owners`,
        );
        const features = answer.features ?? [];
        const pins = features.flatMap((f) => (typeof f.attributes?.[roll.pinField] === "string" ? [f.attributes[roll.pinField] as string] : []));
        const rows = countyParcels(roll, features, await addressesFor(roll, pins));
        sum.fetched += rows.length;
        const batches: Array<typeof rows> = [];
        for (let i = 0; i < rows.length; i += UPSERT_ROWS) batches.push(rows.slice(i, i + UPSERT_ROWS));
        const results: Array<{ added: number; updated: number }> = await Promise.all(batches.map((batch) => ctx.runMutation(internal.parcels.upsert, { rows: batch, county: roll.county })));
        for (const r of results) {
          sum.added += r.added;
          sum.updated += r.updated;
        }
        for (const row of rows) if (row.deedDate && (!sum.newestDeed || row.deedDate > sum.newestDeed)) sum.newestDeed = row.deedDate;
        offset += features.length;
        if (features.length === 0 || (!answer.exceededTransferLimit && features.length < roll.pageSize)) {
          done = true;
          break;
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (!done && !error) {
      await ctx.scheduler.runAfter(0, internal.parcels.syncCounty, { county: args.county, offset, totals: sum });
      return { next: offset, ...sum };
    }
    // A failure partway (a county server down for a moment): the same page again a minute later, from where it stopped.
    const failures = (args.failures ?? 0) + 1;
    if (error && failures < STEP_TRIES) {
      await ctx.scheduler.runAfter(60_000, internal.parcels.syncCounty, { county: args.county, offset, totals: sum, failures });
      return { next: offset, ...sum, error };
    }
    if (!error) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, { county: roll.county });
    await ctx.runMutation(internal.permits.recordSync, {
      source: roll.source,
      fetched: sum.fetched,
      added: sum.added,
      updated: sum.updated,
      lastAppliedAt: sum.newestDeed,
      error,
      fieldsVersion: error ? undefined : PARCEL_VERSION,
    });
    return { fetched: sum.fetched, added: sum.added, updated: sum.updated, error };
  },
});

// ── Spot checks of Midland's houses against the appraisal district's own pages. Nothing is written. ──

type Mailing = Doc<"parcels">["mailing"];
const mailLine = (m: Mailing) => [m.address, m.city, m.state, m.zip?.slice(0, 5)].filter(Boolean).join(", ");
/** The tax bill goes to the same place: the same street line (or box), and the same zip where both give one. */
function sameMailing(app: Mailing, district: Mailing): boolean {
  const zips = [app.zip?.slice(0, 5), district.zip?.slice(0, 5)];
  return addressKey(app.address) === addressKey(district.address) && (!zips[0] || !zips[1] || zips[0] === zips[1]);
}

/** `n` of Midland's houses for a spot check: the first one at or after each key (a random house number and letter), none twice. */
export const homeSample = internalQuery({
  args: { keys: v.array(v.string()), n: v.number() },
  handler: async (ctx, { keys, n }) => {
    const out = new Map<string, { cadId: string; address: string; owner: string; owner2?: string; mailing: Mailing }>();
    for (const key of keys) {
      if (out.size >= n) break;
      const here = await ctx.db
        .query("parcels")
        .withIndex("by_county_and_address_key", (q) => q.eq("county", MIDLAND_PARCELS.county).gte("addressKey", key))
        .take(8);
      // A house the city's own read gave, under the district's id: what the lists are built from.
      const p = here.find((x) => isResidentialUse(x.useCode) && /^R\d+$/.test(x.cadId) && !x.source && !out.has(x.cadId));
      if (p) out.set(p.cadId, { cadId: p.cadId, address: p.siteAddress, owner: p.owner, ...(p.owner2 ? { owner2: p.owner2 } : {}), mailing: p.mailing });
    }
    return [...out.values()];
  },
});

/** How long a spot check reads before it reports what it has: inside an action's 10 minutes. */
const CHECK_MS = 8 * 60 * 1000;
const DIFFERENCES_SHOWN = 20;

/**
 * Is what the app shows of a house right? `n` houses spread across Midland's roll, each compared with the district's
 * own page today: the owner's name and where the tax bill goes. A difference is listed with both values, so a sale
 * since the last read can be told from a spelling. `npx convex run parcels:checkHomes '{}'`.
 */
export const checkHomes = internalAction({
  args: { n: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = Math.min(Math.max(args.n ?? 100, 1), 200);
    const letters = "ABCDEFGHIJKLMNOPRSTW";
    const keys = Array.from({ length: n * 4 }, () => `${100 + Math.floor(Math.random() * 9_900)} ${letters[Math.floor(Math.random() * letters.length)]}`);
    const sample: Array<{ cadId: string; address: string; owner: string; owner2?: string; mailing: Mailing }> = await ctx.runQuery(internal.parcels.homeSample, { keys, n });
    const differences: Array<{ address: string; id: string; owner?: { app: string; district: string }; mailing?: { app: string; district: string } }> = [];
    const out = { sampled: sample.length, checked: 0, ownerSame: 0, mailingSame: 0, bothSame: 0, unreadable: 0 };
    let refused: string | undefined;
    const started = Date.now();
    for (const p of sample) {
      if (Date.now() - started > CHECK_MS) break;
      const got = await districtGet(MIDLAND_DEEDS.page(p.cadId));
      await pause();
      if ("refused" in got) {
        refused = got.refused;
        break;
      }
      const page = "html" in got ? districtProperty(got.html) : undefined;
      if (!page?.owner) {
        out.unreadable++;
        continue;
      }
      out.checked++;
      const owner = sameOwnerName(p, page.owner);
      const mailing = sameMailing(p.mailing, page.mailing);
      if (owner) out.ownerSame++;
      if (mailing) out.mailingSame++;
      if (owner && mailing) out.bothSame++;
      else if (differences.length < DIFFERENCES_SHOWN)
        differences.push({
          address: p.address,
          id: p.cadId,
          ...(owner ? {} : { owner: { app: [p.owner, p.owner2].filter(Boolean).join(" / "), district: page.owner } }),
          ...(mailing ? {} : { mailing: { app: mailLine(p.mailing), district: mailLine(page.mailing) } }),
        });
    }
    return { ...out, ...(refused ? { refused: `the district's site refused the read (${refused})` } : {}), differences };
  },
});

/** The lowest and highest of the district's property numbers among Midland's parcels ("R000004331" is 4331). */
export const cadRange = internalQuery({
  args: {},
  handler: async (ctx) => {
    const mine = (p: Doc<"parcels">) => p.county === MIDLAND_PARCELS.county && /^R\d{9}$/.test(p.cadId);
    const between = () => ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.gte("cadId", "R0").lt("cadId", "R:"));
    const low = (await between().order("asc").take(300)).find(mine);
    const high = (await between().order("desc").take(300)).find(mine);
    return low && high ? { low: Number(low.cadId.slice(1)), high: Number(high.cadId.slice(1)) } : null;
  },
});

/**
 * Is anything missing? `n` of the district's property numbers at random, each one's page read: a number with no page,
 * or a page with no house on it, is passed over; for each house the district has, does the app have it?
 * `npx convex run parcels:checkCoverage '{}'`.
 */
export const checkCoverage = internalAction({
  args: { n: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = Math.min(Math.max(args.n ?? 300, 1), 450);
    const range: { low: number; high: number } | null = await ctx.runQuery(internal.parcels.cadRange, {});
    if (!range) return { error: "No Midland parcels to check against" };
    const ids = new Set<string>();
    const span = range.high - range.low + 1;
    for (let tries = 0; ids.size < Math.min(n, span) && tries < n * 20; tries++) ids.add(`R${String(range.low + Math.floor(Math.random() * span)).padStart(9, "0")}`);
    const out = { read: 0, noPage: 0, notAHouse: 0, houses: 0, inApp: 0 };
    const houses: Array<{ id: string; owner: string; city?: string }> = [];
    let refused: string | undefined;
    const started = Date.now();
    for (const id of ids) {
      if (Date.now() - started > CHECK_MS) break;
      const got = await districtGet(MIDLAND_DEEDS.page(id));
      await pause();
      if ("refused" in got) {
        refused = got.refused;
        break;
      }
      out.read++;
      const page = "html" in got ? districtProperty(got.html) : undefined;
      if (!page?.owner) out.noPage++;
      else if (codeFromBuildings(page.buildings) !== "A1") out.notAHouse++;
      else houses.push({ id, owner: page.owner, ...(page.mailing.city ? { city: page.mailing.city } : {}) });
    }
    const have = new Set<string>(houses.length ? await ctx.runQuery(internal.parcels.haveParcels, { cadIds: houses.map((h) => h.id) }) : []);
    out.houses = houses.length;
    out.inApp = houses.filter((h) => have.has(h.id)).length;
    return { ...out, ...(refused ? { refused: `the district's site refused the read (${refused})` } : {}), lacking: houses.filter((h) => !have.has(h.id)).slice(0, DIFFERENCES_SHOWN) };
  },
});

// ── Who owns each Midland parcel today, from the appraisal district's own pages ──
//
// The city's layer the roll is read from has no sale after late 2025: about one house in nine has changed hands since,
// and nobody who bought this year is on it. The district's page for a property is current. Every parcel's page is
// read in turn, a request a second (the first pass is most of a day), and again once it is OWNERS_MAX_AGE_MS old.

/**
 * Where the refresh records how it stands (permitSources): fetched is the pages read, added the parcels with a new
 * owner, updated those with a new mailing address or deed date. A name of its own: "midland-owners" is Outreach's
 * record of its owners build (lib/outreach.ts OWNERS_SOURCE), which the lists read their totals from.
 */
export const MIDLAND_OWNERS_SOURCE = "midland-district-owners";
/** A parcel's page is read again once its last read is this old. */
const OWNERS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Outreach's owners are rebuilt each time this many more pages have been read, and when a pass ends. */
const OWNERS_REBUILD_EVERY = 12_000;
/** A pass still going wrote its record within this long: a second one isn't started beside it. */
const OWNERS_RUNNING_MS = 15 * 60 * 1000;

/** `limit` Midland parcels whose district page hasn't been read since `before`, the longest-waiting first. */
export const ownersDue = internalQuery({
  args: { limit: v.number(), before: v.string(), skip: v.optional(v.array(v.id("parcels"))) },
  handler: async (ctx, { limit, before, skip = [] }) => {
    const out: Array<{ id: Doc<"parcels">["_id"]; cadId: string; siteAddress: string; owner: string; owner2?: string; mailing: Mailing; deedDate?: string }> = [];
    // Never read first, then the oldest: a missing districtAt sorts before every date.
    const waiting = ctx.db.query("parcels").withIndex("by_county_and_district_at", (q) => q.eq("county", MIDLAND_PARCELS.county).lt("districtAt", before));
    for await (const p of waiting) {
      // A parcel only BatchData has isn't on the district's site under its id.
      if (!hasDistrictPage(p) || p.source === "batchdata" || skip.includes(p._id)) continue;
      out.push({ id: p._id, cadId: p.cadId, siteAddress: p.siteAddress, owner: p.owner, ...(p.owner2 ? { owner2: p.owner2 } : {}), mailing: p.mailing, ...(p.deedDate ? { deedDate: p.deedDate } : {}) });
      if (out.length >= limit) break;
    }
    return out;
  },
});

const mailingArg = v.object({ address: v.optional(v.string()), city: v.optional(v.string()), state: v.optional(v.string()), zip: v.optional(v.string()) });

/**
 * Keeps what the district's pages said: each parcel is marked read; one with a new owner takes the owner, the mailing
 * address and the deed date; one with the same owner takes a mailing address or deed date that changed.
 */
export const saveOwners = internalMutation({
  args: { at: v.string(), rows: v.array(v.object({ id: v.id("parcels"), owner: v.optional(v.string()), mailing: v.optional(mailingArg), deedDate: v.optional(v.string()) })) },
  handler: async (ctx, { at, rows }) => {
    for (const r of rows) {
      const p = await ctx.db.get(r.id);
      if (!p) continue;
      const owner = r.owner ?? p.owner;
      const mailing = r.mailing ?? p.mailing;
      const changed = r.owner !== undefined || r.mailing !== undefined;
      await ctx.db.patch(r.id, {
        districtAt: at,
        ...(r.deedDate ? { deedDate: r.deedDate } : {}),
        ...(changed ? { owner, mailing, ownerOccupied: ownerOccupied(p.siteAddress, mailing.address), companyOwned: isCompanyOwner(owner), ...filing({ owner, mailing }) } : {}),
        // A new owner is one name, as the district writes it; and who owns it can make it storage (KO Storage's LLCs).
        ...(r.owner !== undefined ? { owner2: undefined, kind: await kindOf(ctx, p.county, { ...p, owner }) } : {}),
      });
    }
  },
});

const fiveDigit = (m: Mailing): Mailing => Object.fromEntries(Object.entries({ ...m, zip: m.zip?.slice(0, 5) }).filter(([, x]) => x)) as Mailing;
const refreshTotals = v.object({ read: v.number(), sold: v.number(), moved: v.number(), unreadable: v.number() });

/**
 * Reads the district's page for every Midland parcel not read since `before` (a month ago when not given), a request
 * a second, handing on to a fresh step after STEP_MS. The deed reader's rules: a refusal stops it where it is and
 * nothing works around one; DEED_DOUBTS pages in a row that can't be read and the step is tried again a minute
 * later, STEP_TRIES times. `background` schedules it and returns at once.
 * By hand: `npx convex run parcels:refreshOwners '{"background":true}'`.
 */
export const refreshOwners = internalAction({
  args: { background: v.optional(v.boolean()), before: v.optional(v.string()), totals: v.optional(refreshTotals), failures: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scheduled?: true; running?: true; done?: true; read: number; sold: number; moved: number; unreadable: number; error?: string }> => {
    const sum = { read: 0, sold: 0, moved: 0, unreadable: 0, ...(args.totals ?? {}) };
    // A fresh start, not a step of a pass under way: one pass at a time, so the site never gets two requests a second.
    if (!args.before) {
      const last = await ctx.runQuery(internal.permits.sourceState, { source: MIDLAND_OWNERS_SOURCE });
      if (last?.lastAppliedAt === "running" && Date.now() - Date.parse(last.syncedAt) < OWNERS_RUNNING_MS) return { running: true, ...sum };
    }
    const before = args.before ?? new Date(Date.now() - OWNERS_MAX_AGE_MS).toISOString();
    const record = (state: { running?: true; error?: string }) =>
      ctx.runMutation(internal.permits.recordSync, { source: MIDLAND_OWNERS_SOURCE, fetched: sum.read, added: sum.sold, updated: sum.moved, lastAppliedAt: state.running ? "running" : nowIso(), error: state.error });
    if (args.background) {
      await record({ running: true });
      await ctx.scheduler.runAfter(0, internal.parcels.refreshOwners, { before });
      return { scheduled: true, ...sum };
    }
    const started = Date.now();
    const readAtStart = sum.read;
    let error: string | undefined;
    let refused = false;
    let done = false;
    // Pages that couldn't be read, until a later one reads fine: then they're marked read too (a retired property id).
    let doubts: Array<Doc<"parcels">["_id"]> = [];
    let why = "";
    while (!error && !done && Date.now() - started < STEP_MS) {
      const due: Array<{ id: Doc<"parcels">["_id"]; cadId: string; siteAddress: string; owner: string; owner2?: string; mailing: Mailing; deedDate?: string }> = await ctx.runQuery(internal.parcels.ownersDue, { limit: DEED_PACE.batch, before, skip: doubts });
      if (due.length === 0) {
        // The last few with nothing after them to clear them (a retired property id or two): marked read, asked again in a month.
        if (doubts.length) {
          await ctx.runMutation(internal.parcels.saveOwners, { at: nowIso(), rows: doubts.map((id) => ({ id })) });
          sum.read += doubts.length;
          sum.unreadable += doubts.length;
        }
        done = true;
        break;
      }
      const rows: Array<{ id: Doc<"parcels">["_id"]; owner?: string; mailing?: Mailing; deedDate?: string }> = [];
      for (const p of due) {
        const asked = Date.now();
        const got = await districtGet(MIDLAND_DEEDS.page(p.cadId));
        if ("refused" in got) {
          refused = true;
          error = `Midland owners: the district's site refused the read (${got.refused})`;
          break;
        }
        const page = "html" in got ? districtProperty(got.html) : undefined;
        if (!page?.owner) {
          doubts.push(p.id);
          why = "none" in got ? got.none : "no owner on the page";
          if (doubts.length >= DEED_DOUBTS) error = `Midland owners: ${DEED_DOUBTS} pages in a row couldn't be read (${why})`;
        } else {
          const sold = !sameOwnerName(p, page.owner);
          const mailing = fiveDigit(page.mailing);
          const moved = Boolean(mailing.address) && !sameMailing(p.mailing, mailing);
          const newest = page.deeds[0]?.date;
          const deedDate = newest && (sold || newest > (p.deedDate ?? "")) ? newest : undefined;
          rows.push({ id: p.id, ...(sold ? { owner: page.owner } : {}), ...((sold || moved) && mailing.address ? { mailing } : {}), ...(deedDate ? { deedDate } : {}) }, ...doubts.map((id) => ({ id })));
          sum.read += 1 + doubts.length;
          sum.unreadable += doubts.length;
          if (sold) sum.sold++;
          else if (moved || deedDate) sum.moved++;
          doubts = [];
        }
        if (error) break;
        // A request a second, counting the time the page took to come back.
        if (DEED_PACE.waitMs) await new Promise((r) => setTimeout(r, Math.max(0, DEED_PACE.waitMs - (Date.now() - asked))));
      }
      if (rows.length) await ctx.runMutation(internal.parcels.saveOwners, { at: nowIso(), rows });
    }
    // The lists follow the district as the pass goes, not only when it ends a day later.
    const crossed = Math.floor(sum.read / OWNERS_REBUILD_EVERY) > Math.floor(readAtStart / OWNERS_REBUILD_EVERY);
    if (!error && !done) {
      if (crossed) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
      await record({ running: true });
      await ctx.scheduler.runAfter(0, internal.parcels.refreshOwners, { before, totals: sum });
      return { ...sum };
    }
    const failures = (args.failures ?? 0) + 1;
    if (error && !refused && failures < STEP_TRIES) {
      await record({ running: true });
      await ctx.scheduler.runAfter(60_000, internal.parcels.refreshOwners, { before, totals: sum, failures });
      return { ...sum, error };
    }
    if (sum.sold + sum.moved > 0) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, {});
    await record({ error });
    return { ...(done ? { done: true as const } : {}), ...sum, ...(error ? { error } : {}) };
  },
});
