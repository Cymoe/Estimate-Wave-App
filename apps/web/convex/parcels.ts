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
import { COUNTY_ROLLS, MIDLAND_DEEDS, SELF_STORAGE_NAICS, isCompanyOwner, ownerOccupied, MIDLAND_PARCELS, PARCEL_FIELDS, PARCEL_VERSION, RESIDENTIAL_USE, addressByPin, addressKey, countyParcels, deedHistory, districtProperty, codeFromBuildings, isCommercialUse, isResidentialUse, isStorageOutlet, ownerOf, parcelKind, parcelWhere, rowsToParcels, type CountyRoll, type DeedRow, type ParcelKind } from "./lib/parcels";
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
  if (!isCommercialUse(row.useCode)) {
    // A self-storage business on a property the district codes as a home (an RV and boat yard beside the house): its
    // self-storage permit at the address makes it storage, so its deed history is read and its sellers listed.
    if (!isResidentialUse(row.useCode)) return undefined;
    const here = await ctx.db
      .query("outlets")
      .withIndex("by_county_and_address_key", (q) => q.eq("county", county).eq("addressKey", row.addressKey))
      .take(20);
    return here.some((o) => o.naics === SELF_STORAGE_NAICS) ? "storage" : undefined;
  }
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
      // The district's own roll is the base for a parcel it has (districtRoll.ts): the city's layer, a year-old copy,
      // adds only what the roll lacks, the district's land code (what tells mini-storage from a shop) and the PIN.
      if (existing?.rollAt || existing?.retiredAt) {
        if ((existing.landUse ?? undefined) === (read.landUse ?? undefined) && (existing.pin ?? undefined) === (read.pin ?? undefined)) continue;
        const kind = existing.retiredAt ? undefined : await kindOf(ctx, at, { ...existing, landUse: read.landUse });
        await ctx.db.patch(existing._id, { landUse: read.landUse, pin: read.pin, kind });
        updated++;
        continue;
      }
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
      } else if (!sameParcel(existing, row) || existing.kind !== kind || existing.source || existing.ownerKey !== filing(row).ownerKey) {
        // The city's own row from here on, if the district had filled it while the city's was blank. And filed under
        // its owner as the owner's key is written today (a hyphen in a name is read as a space now).
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
    // And who owns each parcel today, from the district's own pages: whatever hasn't been read in the last month.
    await ctx.scheduler.runAfter(0, internal.parcels.refreshOwners, {});
    // And the district's certified roll, the base for every Midland parcel (skipped when no new roll is posted).
    await ctx.scheduler.runAfter(0, internal.districtRoll.importRoll, {});
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

// ---- Reads of the appraisal district's pages ----

const pause = () => (DEED_PACE.waitMs ? new Promise((r) => setTimeout(r, DEED_PACE.waitMs)) : Promise.resolve());

/** Which of these property ids are in the parcels table at all. */
export const haveParcels = internalQuery({
  args: { cadIds: v.array(v.string()) },
  handler: async (ctx, { cadIds }) => {
    const out: string[] = [];
    for (const cadId of cadIds) if (await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", cadId)).first()) out.push(cadId);
    return out;
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
      else if (!isResidentialUse(codeFromBuildings(page.buildings))) out.notAHouse++;
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
      if (!hasDistrictPage(p) || p.source === "batchdata" || p.retiredAt || skip.includes(p._id)) continue;
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
// `found` was the shapefile finds' count: still accepted from a step scheduled before they were retired.
const refreshTotals = v.object({ read: v.number(), sold: v.number(), moved: v.number(), unreadable: v.number(), found: v.optional(v.number()) });

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
    const t = args.totals;
    const sum = { read: t?.read ?? 0, sold: t?.sold ?? 0, moved: t?.moved ?? 0, unreadable: t?.unreadable ?? 0 };
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

// ── Midland's parcels from the appraisal district's own roll (lib/districtRoll.ts, districtRoll.ts importRoll) ──

const rollRow = v.object({
  row: parcelRow,
  deeds: v.array(deedRow),
  ownerId: v.optional(v.string()),
  buildings: v.array(v.string()),
  returnedMail: v.boolean(),
  accounts: v.array(v.string()),
});

/**
 * Keeps one batch of the roll's parcels, by account number: adds the new ones and brings the rest up to the roll.
 * `stamp` marks each as in this import (what isn't is retired afterwards, retireSweep). `fileDate` is the day the
 * roll was made: a parcel whose page at the district was read after that keeps what the page said of who owns it,
 * unless the roll has a newer deed; and where the page found a sale the roll predates, the roll's owner is the one
 * who sold, so they head the owners before.
 */
export const upsertRoll = internalMutation({
  args: { rows: v.array(rollRow), stamp: v.string(), fileDate: v.string() },
  handler: async (ctx, { rows, stamp, fileDate }) => {
    const county = MIDLAND_PARCELS.county;
    const now = nowIso();
    let added = 0;
    let updated = 0;
    for (const { row: read, deeds: fileDeeds, ownerId, buildings, returnedMail, accounts } of rows) {
      const existing = await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", read.cadId)).first();
      const live = Boolean(existing?.districtAt && existing.districtAt.slice(0, 10) > fileDate && !((read.deedDate ?? "") > (existing.deedDate ?? "")));
      const row = live && existing ? { ...read, owner: existing.owner, owner2: existing.owner2, mailing: existing.mailing, deedDate: existing.deedDate, ownerOccupied: existing.ownerOccupied, companyOwned: existing.companyOwned } : read;
      const soldSince = live && existing && !sameOwnerName(read, existing.owner);
      const deeds = soldSince ? (existing.deeds?.length ? existing.deeds : [{ seller: read.owner, ...(existing.deedDate ? { date: existing.deedDate } : {}) }, ...fileDeeds]) : fileDeeds;
      const fields = {
        ...row,
        ...filing(row),
        // The city's layer is where the land code and the PIN come from: the roll has neither.
        landUse: existing?.landUse,
        pin: existing?.pin,
        kind: await kindOf(ctx, county, { ...row, landUse: existing?.landUse, vendorUse: existing?.vendorUse }),
        deeds,
        deedsReadFor: row.deedDate ?? "",
        ownerId,
        buildings,
        // Mail that came back was to the roll's owner: it says nothing of one who bought since.
        returnedMail: returnedMail && !soldSince ? true : undefined,
        accounts: accounts.length > 1 ? accounts : undefined,
        // Never back to an older import's stamp: two imports at once (the deploy's and the weekly one) would otherwise
        // leave the newer one's sweep retiring what the older one wrote last.
        rollAt: existing?.rollAt && existing.rollAt > stamp ? existing.rollAt : stamp,
        retiredAt: undefined,
        source: undefined,
      };
      if (!existing) {
        await ctx.db.insert("parcels", { county, ...fields, importedAt: now });
        added++;
      } else {
        await ctx.db.patch(existing._id, fields);
        updated++;
      }
    }
    return { added, updated };
  },
});

/** How many parcels one step of the sweep looks at. */
const SWEEP_PAGE = 600;

/**
 * After an import: a page of Midland's parcels, and each one under a district account number that the import didn't
 * have is retired (an account the district closed, one merged into another, land with nothing on it now). A retired
 * parcel is filed under no owner, so nothing lists it. Returns where to go on from.
 */
export const retireSweep = internalMutation({
  args: { stamp: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, { stamp, cursor }) => {
    const page = await ctx.db
      .query("parcels")
      .withIndex("by_county_and_address_key", (q) => q.eq("county", MIDLAND_PARCELS.county))
      .paginate({ cursor: cursor ?? null, numItems: SWEEP_PAGE });
    const now = nowIso();
    let retired = 0;
    for (const p of page.page) {
      // In this import, or in one that started after it: not this sweep's to retire.
      if ((p.rollAt && p.rollAt >= stamp) || p.retiredAt || p.source === "batchdata" || !hasDistrictPage(p)) continue;
      await ctx.db.patch(p._id, { retiredAt: now, ownerKey: "", mailKey: "", kind: undefined });
      retired++;
    }
    return { retired, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/** How Midland's parcels stand against the roll: in the latest import, retired, and neither (BatchData's own, or from before a roll was read). */
export const rollCoverage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("parcels")
      .withIndex("by_county_and_address_key", (q) => q.eq("county", MIDLAND_PARCELS.county))
      .paginate({ cursor: cursor ?? null, numItems: 2_000 });
    const out = { onRoll: 0, retired: 0, other: 0, returnedMail: 0, merged: 0 };
    for (const p of page.page) {
      if (p.retiredAt) out.retired++;
      else if (p.rollAt) out.onRoll++;
      else out.other++;
      if (p.returnedMail) out.returnedMail++;
      if (p.accounts) out.merged++;
    }
    return { ...out, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/** One page of a county's parcels whose deed history names the seller. */
export const soldByPage = internalQuery({
  args: { county: v.string(), seller: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { county, seller, cursor }) => {
    const page = await ctx.db.query("parcels").withIndex("by_county_and_address_key", (q) => q.eq("county", county)).paginate({ numItems: 1500, cursor });
    const s = seller.toUpperCase();
    const hits = page.page.flatMap((p) =>
      (p.deeds ?? []).some((d) => d.seller.toUpperCase().includes(s))
        ? [{ address: p.siteAddress, kind: p.kind ?? null, useCode: p.useCode, ownerToday: p.owner, retired: Boolean(p.retiredAt), deeds: (p.deeds ?? []).map((d) => `${d.seller}${d.date ? ` (${d.date})` : ""}`) }]
        : [],
    );
    return { hits, cursor: page.isDone ? null : page.continueCursor };
  },
});

/**
 * Every parcel in a county whose deed history names the seller (a word of the name will do), with today's owner:
 * what a past owner sold. Nothing is saved. `npx convex run parcels:soldBy '{"seller":"PROPERTY RENEGADES"}'`.
 */
export const soldBy = internalAction({
  args: { seller: v.string(), county: v.optional(v.string()) },
  handler: async (ctx, { seller, county = MIDLAND_PARCELS.county }) => {
    const out: unknown[] = [];
    let cursor: string | null = null;
    do {
      const page: { hits: unknown[]; cursor: string | null } = await ctx.runQuery(internal.parcels.soldByPage, { county, seller, cursor });
      out.push(...page.hits);
      cursor = page.cursor;
    } while (cursor && out.length < 60);
    return out;
  },
});
