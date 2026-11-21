// A county's storage and industrial buildings from BatchData's property search (lib/batchProperty.ts): every parcel
// with its owner, mailing address, deed history and whether the last purchase was cash, so nothing depends on which
// parcels a county's public map happens to fill in. A property the public roll already has gains BatchData's land use
// code, its cash flag and (where none was read) its deed history; one the roll lacks is added as a parcel of its own.
//
// Needs BATCHDATA_API_KEY on the backend, with the property search product and the core, deed and quicklist datasets.
// Every property a search returns is billed, so a pull has a ceiling (`max`) and `count` asks only how many there are.
//
//   npx convex run batchParcels:count '{"county":"Midland"}'
//   npx convex run batchParcels:find '{"county":"Midland","ownerWord":"KOSF"}'
//   npx convex run batchParcels:pull '{"county":"Midland","kind":"storage"}'
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import { nowIso } from "./lib/access";
import { BATCH_BASE, BATCH_TAKE, batchParcel, batchSummary, findBody, searchBody, searchResults, type BatchCounty } from "./lib/batchProperty";
import { nameKey, type ParcelKind } from "./lib/parcels";
import { filing, kindOf, parcelRow } from "./parcels";

const county = v.union(v.literal("Midland"), v.literal("Ector"), v.literal("Lubbock"), v.literal("Taylor"));
const kind = v.union(v.literal("storage"), v.literal("industrial"));
const deedRow = v.object({ seller: v.string(), date: v.optional(v.string()), instrument: v.optional(v.string()) });

/** Where a pull's result is recorded (permitSources). */
export const batchSource = (c: string, k: ParcelKind) => `batchdata-${c.toLowerCase()}-${k}`;
/** The most properties one pull reads (and pays for) unless told otherwise. */
export const BATCH_MAX = 3_000;
const STEP_MS = 4 * 60 * 1000;
const STEP_TRIES = 4;
const NO_KEY = "BATCHDATA_API_KEY isn't set on this backend";

type Asked = { body: unknown } | { error: string; stop?: true };

/** One search. A refused key or a spent balance stops the pull where it is; anything else can be tried again. */
async function ask(body: unknown): Promise<Asked> {
  const key = process.env.BATCHDATA_API_KEY;
  if (!key) return { error: NO_KEY, stop: true };
  const response = await fetch(`${BATCH_BASE}/property/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const said = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    return { error: `BatchData answered HTTP ${response.status}${said ? `: ${said}` : ""}`, ...([400, 401, 402, 403].includes(response.status) ? { stop: true as const } : {}) };
  }
  return { body: await response.json() };
}

/**
 * Keeps one page of BatchData's properties. The parcel the public roll has for it is found by the county's parcel
 * number, or else by the address (the same owner's, where several parcels share one): that parcel gains BatchData's
 * code, cash flag and, where it has none, deed history. With no such parcel, the property is kept as its own.
 */
export const save = internalMutation({
  args: {
    county,
    rows: v.array(v.object({ row: parcelRow, deeds: v.array(deedRow), vendorUse: v.optional(v.string()), cashBuyer: v.optional(v.boolean()), apn: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const now = nowIso();
    let added = 0;
    let matched = 0;
    for (const { row, deeds, vendorUse, cashBuyer, apn } of args.rows) {
      const own = await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", row.cadId)).first();
      let roll: Doc<"parcels"> | null = apn ? await ctx.db.query("parcels").withIndex("by_cad_id", (q) => q.eq("cadId", apn)).first() : null;
      if (roll && roll.county !== args.county) roll = null;
      if (!roll) {
        const here = (await ctx.db.query("parcels").withIndex("by_county_and_address_key", (q) => q.eq("county", args.county).eq("addressKey", row.addressKey)).take(20)).filter(
          (p) => p.source !== "batchdata",
        );
        roll = here.find((p) => (apn && p.pin === apn) || nameKey(p.owner) === nameKey(row.owner)) ?? (here.length === 1 ? here[0] : null);
      }
      if (roll) {
        const fields = { vendorUse, cashBuyer, ...(roll.deeds?.length || !deeds.length ? {} : { deeds }) };
        await ctx.db.patch(roll._id, { ...fields, kind: await kindOf(ctx, args.county, { ...roll, vendorUse }) });
        // The roll has it now: the copy kept while it didn't is done with.
        if (own) await ctx.db.delete(own._id);
        matched++;
        continue;
      }
      const fields = { ...row, ...filing(row), vendorUse, cashBuyer, deeds, deedsReadFor: row.deedDate ?? "", kind: await kindOf(ctx, args.county, { ...row, vendorUse }), source: "batchdata" as const, importedAt: now };
      if (own) await ctx.db.patch(own._id, fields);
      else {
        await ctx.db.insert("parcels", { county: args.county, ...fields });
        added++;
      }
    }
    return { added, matched };
  },
});

const totals = v.object({ fetched: v.number(), added: v.number(), matched: v.number(), found: v.optional(v.number()) });

/**
 * Reads a county's storage or industrial properties from BatchData, a page at a time from `skip`, into the parcels
 * table; hands on to a fresh step after STEP_MS. When all are read (or `max` is reached) it records how it went under
 * batchSource and rebuilds that county's Outreach owners.
 */
export const pull = internalAction({
  args: {
    county,
    kind,
    /** The most properties to read, each one billed: BATCH_MAX when not given. */
    max: v.optional(v.number()),
    skip: v.optional(v.number()),
    totals: v.optional(totals),
    failures: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ next?: number; fetched: number; added: number; matched: number; found?: number; capped?: true; error?: string }> => {
    const max = args.max ?? BATCH_MAX;
    const sum = { fetched: 0, added: 0, matched: 0, ...(args.totals ?? {}) };
    let skip = args.skip ?? 0;
    const started = Date.now();
    let error: string | undefined;
    let stop = false;
    let done = false;
    try {
      while (Date.now() - started < STEP_MS && skip < max) {
        const take = Math.min(BATCH_TAKE, max - skip);
        const answer = await ask(searchBody(args.county, args.kind, skip, take));
        if ("error" in answer) {
          error = answer.error;
          stop = Boolean(answer.stop);
          break;
        }
        const { properties, found } = searchResults(answer.body);
        if (found !== undefined) sum.found = found;
        const rows = properties.flatMap((p) => batchParcel(p, args.kind) ?? []);
        if (rows.length) {
          const saved: { added: number; matched: number } = await ctx.runMutation(internal.batchParcels.save, { county: args.county, rows });
          sum.added += saved.added;
          sum.matched += saved.matched;
        }
        sum.fetched += properties.length;
        skip += properties.length;
        if (properties.length < take || (found !== undefined && skip >= found)) {
          done = true;
          break;
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const capped = !done && !error && skip >= max;
    if (!done && !error && !capped) {
      await ctx.scheduler.runAfter(0, internal.batchParcels.pull, { county: args.county, kind: args.kind, max: args.max, skip, totals: sum });
      return { next: skip, ...sum };
    }
    const failures = (args.failures ?? 0) + 1;
    if (error && !stop && failures < STEP_TRIES) {
      await ctx.scheduler.runAfter(60_000, internal.batchParcels.pull, { county: args.county, kind: args.kind, max: args.max, skip, totals: sum, failures });
      return { next: skip, ...sum, error };
    }
    await finish(ctx, args.county, args.kind, sum, error ?? (capped ? `Stopped at ${max} of ${sum.found ?? "more"}: run again with a higher max to read the rest` : undefined));
    return { ...sum, ...(capped ? { capped: true as const } : {}), ...(error ? { error } : {}) };
  },
});

async function finish(ctx: ActionCtx, c: BatchCounty, k: ParcelKind, sum: { fetched: number; added: number; matched: number }, error: string | undefined) {
  // Whatever was read is on the lists, even when the read stopped early.
  if (sum.fetched) await ctx.scheduler.runAfter(0, internal.outreachRebuild.rebuild, { county: c });
  await ctx.runMutation(internal.permits.recordSync, { source: batchSource(c, k), fetched: sum.fetched, added: sum.added, updated: sum.matched, error });
}

/** How many storage and industrial properties BatchData has in a county, without reading (or paying for) any of them. */
export const count = internalAction({
  args: { county },
  handler: async (_ctx, args): Promise<{ storage?: number; industrial?: number; error?: string }> => {
    const out: { storage?: number; industrial?: number; error?: string } = {};
    for (const k of ["storage", "industrial"] as const) {
      const answer = await ask(searchBody(args.county, k, 0, 0));
      if ("error" in answer) return { ...out, error: answer.error };
      out[k] = searchResults(answer.body).found;
    }
    return out;
  },
});

/**
 * A search to check BatchData's records by hand, a few properties at most: an owner by a word of the name ("KOSF")
 * or the whole name, a past owner by the whole name, or a street address. Nothing is saved.
 */
export const find = internalAction({
  args: {
    county,
    ownerWord: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    previousOwner: v.optional(v.string()),
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    take: v.optional(v.number()),
  },
  handler: async (_ctx, { county: c, take, ...by }) => {
    if (!by.ownerWord && !by.ownerName && !by.previousOwner && !by.street) return { error: "Say who or where: ownerWord, ownerName, previousOwner or street" };
    const answer = await ask(findBody(c, by, Math.min(Math.max(take ?? 25, 1), 50)));
    if ("error" in answer) return { error: answer.error };
    const { properties, found } = searchResults(answer.body);
    return { found: found ?? null, properties: properties.map((p) => batchSummary(p)) };
  },
});
