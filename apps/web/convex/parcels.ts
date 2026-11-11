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
import { COUNTY_ROLLS, MIDLAND_DEEDS, MIDLAND_PARCELS, PARCEL_FIELDS, PARCEL_VERSION, RESIDENTIAL_USE, addressByPin, countyParcels, deedHistory, isCommercialUse, isStorageOutlet, ownerOf, parcelKind, parcelWhere, rowsToParcels, type CountyRoll, type DeedRow, type ParcelKind } from "./lib/parcels";
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
const filing = (p: { owner: string; mailing: Doc<"parcels">["mailing"] }) => ({ ownerKey: OwnerGrouper.keyFor(p) ?? "", mailKey: mailKey(p.mailing) ?? "" });

/**
 * Storage, industrial or neither, as Outreach's grouping decides it (lib/outreach.ts fold): by the parcel's own codes
 * and owner, or for a commercial parcel they don't settle, by a storage business's sales-tax permit at its address.
 */
async function kindOf(ctx: MutationCtx, county: string, row: { useCode: string; landUse?: string; owner: string; addressKey: string }): Promise<ParcelKind | undefined> {
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
    for (const row of rows) {
      const existing = await ctx.db
        .query("parcels")
        .withIndex("by_cad_id", (q) => q.eq("cadId", row.cadId))
        .first();
      const kind = await kindOf(ctx, at, row);
      if (!existing) {
        await ctx.db.insert("parcels", { county: at, ...row, ...filing(row), ...(kind ? { kind } : {}), importedAt: now });
        added++;
      } else if (!sameParcel(existing, row) || existing.kind !== kind) {
        await ctx.db.patch(existing._id, { ...row, ...filing(row), kind, importedAt: now });
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
        if (p.deedsReadFor === readFor) continue;
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
    for (const r of rows) if (await ctx.db.get(r.id)) await ctx.db.patch(r.id, { deeds: r.deeds, deedsReadFor: r.readFor });
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

type DeedPage = { deeds: DeedRow[] } | { none: string } | { refused: string };

/** One property's page: its deed rows; `none` when this page can't be read (missing, broken, no deed table); `refused` when the site says to stop asking. */
async function deedPage(cadId: string): Promise<DeedPage> {
  let response: Response;
  try {
    response = await fetch(MIDLAND_DEEDS.page(cadId));
  } catch (e) {
    return { none: e instanceof Error ? e.message : String(e) };
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) return { refused: `HTTP ${response.status}` };
  if (!response.ok) return { none: `HTTP ${response.status}` };
  const deeds = deedHistory(await response.text());
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

// ---- Odessa and Lubbock (lib/parcels.ts COUNTY_ROLLS) ----

type Feature = { attributes?: Record<string, unknown> };
type Answer = { error?: { message?: string }; features?: Feature[]; exceededTransferLimit?: boolean };

/** How long a failed query waits before each try (the first at once). Tests shorten them. */
export const QUERY_WAITS = [0, 2_000, 6_000];

/** One query of an ArcGIS layer, posted when the where clause is long; a failed try is tried again twice, a little later each time. */
async function query(layer: string, params: Record<string, string>, what: string): Promise<Answer> {
  const body = new URLSearchParams({ ...params, returnGeometry: "false", f: "json" });
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
