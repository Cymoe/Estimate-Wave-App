// Outreach: the owners on the Midland roll, grouped and sorted into who they
// are (lib/outreach.ts), and the mailing lists a Pro company saves from them.
//
// The owners table is rebuilt from the roll after each weekly read. A list is
// one facet of it read top-down by value, filtered, and snapshotted: the
// rows a company saved stay as they were, whatever the next roll says.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { outreachDefinition, outreachEmail, outreachField, outreachPerson, outreachPhone, outreachResearch, outreachTry, outreachRowStatus, ownerContact, ownerSignal, realtorLicense } from "./schema";
import { fail, isStaff, logActivity, nowIso, organizationIdsFor, requireMember, requireStaff } from "./lib/access";
import { mutationDef, queryDef } from "./lib/actor";
import { callClaude } from "./lib/claude";
import {
  DEFAULT_ROWS,
  MAX_ROWS,
  OUTREACH_INPUT_SCHEMA,
  OWNERS_SOURCE,
  OwnerGrouper,
  REFRESH_SOURCE,
  RESEARCH_CENTS,
  SIGNAL_YEARS,
  UNLOCK_CENTS,
  DEFAULT_RESEARCH_QUESTION,
  WHO_GUIDE,
  companyKey,
  defaultTitle,
  definitionFromArgs,
  designersOn,
  occupantsOn,
  type CondensedOccupant,
  type CondensedRealtor,
  facetFor,
  facetsOf,
  familyKey,
  guessDefinition,
  listOrder,
  mailKey,
  matches,
  propertyFor,
  underFloor,
  why,
  withSignal,
  type Condensed,
  type CondensedPermit,
  type Definition,
  type Facet,
  type OwnerContact,
  type OwnerRow,
} from "./lib/outreach";
import { MIDLAND_PARCELS, addressKey } from "./lib/parcels";
import { SAMPLE_MAX, SAMPLE_NOTE, isSampleNumber, sampleFor } from "./lib/outreachSample";
import { planIsActive } from "./lib/plan";
import { needsAttention, phoneCheckers, phoneScrub, samePerson, splitName, vendors, verifier, type Found, type Person } from "./lib/skipTrace";
import { dollars, postTransaction } from "./lib/wallet";

const COUNTY = MIDLAND_PARCELS.county;
/** How many facet rows one list build reads: past this the list is cut and says so. */
export const SCAN = 3000;
const PAGE = 2000;
const DROP_BATCH = 500;

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// ---- The weekly rebuild ----

/** One page of the roll, cut down to what grouping needs. */
export const parcelPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("parcels").paginate({ cursor: cursor ?? null, numItems: PAGE });
    const rows: Condensed[] = page.page
      .filter((p) => p.county === COUNTY)
      .map((p) => ({
        id: p._id,
        siteAddress: p.siteAddress,
        street: p.street,
        useCode: p.useCode,
        owner: p.owner,
        mailing: p.mailing,
        ownerOccupied: p.ownerOccupied,
        companyOwned: p.companyOwned,
        marketValueCents: p.marketValueCents,
        deedDate: p.deedDate,
      }));
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * One page of the city's records on the roll's parcels, within SIGNAL_YEARS,
 * each with the parcel it's on: what the violation and stalled lists are
 * built from. Records not matched to a parcel are skipped.
 */
export const signalPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const since = new Date(Date.now() - SIGNAL_YEARS * 365 * 24 * 3600_000).toISOString();
    const page = await ctx.db.query("signals").paginate({ cursor: cursor ?? null, numItems: 500 });
    const rows: Array<{ parcelId: Id<"parcels">; signal: { kind: Doc<"signals">["kind"]; detail: string; date: string }; property: { parcelId: Id<"parcels">; address: string; useCode: string; valueCents?: number } }> = [];
    const kept = page.page.filter((s) => s.parcelId && s.county === COUNTY && s.date >= since);
    const parcels = await Promise.all(kept.map((s) => ctx.db.get(s.parcelId!)));
    kept.forEach((s, i) => {
      const p = parcels[i];
      if (!p) return;
      rows.push({ parcelId: p._id, signal: { kind: s.kind, detail: s.detail, date: s.date }, property: { parcelId: p._id, address: p.siteAddress, useCode: p.useCode, valueCents: p.marketValueCents } });
    });
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * One page of the permits a company pulled since `since` (permitsSince),
 * cut down to what grouping contractors needs. The caller fixes `since`
 * once for the whole read: a cursor only continues the very same query,
 * and a window recomputed per page made the live rebuild fail with
 * InvalidCursor on page two.
 */
export const permitPage = internalQuery({
  args: { since: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, { since, cursor }) => {
    const page = await ctx.db
      .query("permits")
      .withIndex("by_county_and_applied", (q) => q.eq("county", COUNTY).gte("appliedAt", since))
      .paginate({ cursor: cursor ?? null, numItems: 500 });
    const rows: CondensedPermit[] = [];
    for (const p of page.page) {
      const about = { trades: p.trades, address: p.address, addressKey: p.addressKey, appliedAt: p.appliedAt, valuationCents: p.valuationCents, residential: p.residential };
      if (p.builder) {
        const mine = companyKey(p.builder);
        rows.push({
          builder: p.builder,
          ...about,
          contacts: (p.contacts ?? []).filter((c) => companyKey(c.company) === mine).map((c) => ({ role: c.role, person: c.person, phone: c.phone, email: c.email })),
        });
      }
      // The architect or engineer on a commercial permit, as a row of its own.
      for (const d of designersOn(p)) rows.push({ builder: d.company, kind: "designer", ...about, contacts: d.contacts });
    }
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** The roll's parcel at each address, for a company's property, with who owns it; addresses off the roll give nothing. */
export const parcelsAt = internalQuery({
  args: { addressKeys: v.array(v.string()) },
  handler: async (ctx, { addressKeys }) => {
    const out: Record<string, { parcelId: Id<"parcels">; address: string; useCode: string; valueCents?: number; owner: string }> = {};
    await Promise.all(
      [...new Set(addressKeys)].map(async (key) => {
        const p = await ctx.db.query("parcels").withIndex("by_county_and_address_key", (q) => q.eq("county", COUNTY).eq("addressKey", key)).first();
        if (p) out[key] = { parcelId: p._id, address: p.siteAddress, useCode: p.useCode, valueCents: p.marketValueCents, owner: p.owner };
      }),
    );
    return out;
  },
});

/**
 * One page of the businesses the city's permits since `since` place at an
 * address: a certificate of occupancy names the business moving in; a
 * commercial permit's "owner" contact is the tenant when it isn't the deed
 * holder (OccupantGrouper settles that against the roll). `since` is fixed
 * once by the caller, as for permitPage.
 */
export const occupantPage = internalQuery({
  args: { since: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, { since, cursor }) => {
    const page = await ctx.db
      .query("permits")
      .withIndex("by_county_and_applied", (q) => q.eq("county", COUNTY).gte("appliedAt", since))
      .paginate({ cursor: cursor ?? null, numItems: 500 });
    const rows: CondensedOccupant[] = [];
    for (const p of page.page) rows.push(...occupantsOn({ name: p.name, detail: p.detail, residential: p.residential, appliedAt: p.appliedAt, address: p.address, addressKey: p.addressKey, builder: p.builder, contacts: p.contacts }));
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** One page of the county's active license holders (lib/realtors.ts), for the realtor rows. */
export const realtorPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("realtors")
      .withIndex("by_county_and_seen", (q) => q.eq("county", COUNTY))
      .paginate({ cursor: cursor ?? null, numItems: 500 });
    const rows: CondensedRealtor[] = page.page.map((r) => ({
      licenseNumber: r.licenseNumber,
      type: r.type,
      name: r.name,
      first: r.first,
      last: r.last,
      licensedAt: r.licensedAt,
      expiresAt: r.expiresAt,
      brokerage: r.brokerage,
      brokerageSince: r.brokerageSince,
      supervisor: r.supervisor,
    }));
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** One page of the Comptroller's sales-tax outlets that started selling since `since` (lib/outlets.ts), as occupant sightings. */
export const outletPage = internalQuery({
  args: { since: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, { since, cursor }) => {
    const page = await ctx.db
      .query("outlets")
      .withIndex("by_county_and_at", (q) => q.eq("county", COUNTY).gte("at", since.slice(0, 10)))
      .paginate({ cursor: cursor ?? null, numItems: 500 });
    const rows: CondensedOccupant[] = page.page.map((o) => ({
      business: o.name,
      source: "outlet" as const,
      address: o.address,
      addressKey: o.addressKey,
      at: o.at,
      mailing: o.mailing,
      taxpayer: o.taxpayer,
      naics: o.naics,
    }));
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

const ownerRow = v.object({
  key: v.string(),
  kind: v.union(v.literal("owner"), v.literal("office"), v.literal("contractor"), v.literal("designer"), v.literal("occupant"), v.literal("realtor")),
  name: v.string(),
  company: v.boolean(),
  mailing: v.object({ address: v.optional(v.string()), city: v.optional(v.string()), state: v.optional(v.string()), zip: v.optional(v.string()) }),
  parcels: v.number(),
  residential: v.number(),
  multifamily: v.number(),
  commercial: v.number(),
  totalValueCents: v.number(),
  maxValueCents: v.number(),
  homeValueCents: v.optional(v.number()),
  rentalValueCents: v.optional(v.number()),
  commercialValueCents: v.optional(v.number()),
  multifamilyValueCents: v.optional(v.number()),
  ownerOccupied: v.boolean(),
  outOfState: v.boolean(),
  latestDeed: v.optional(v.string()),
  homeDeed: v.optional(v.string()),
  useCodes: v.array(v.string()),
  streets: v.array(v.string()),
  tops: v.record(v.string(), v.object({ parcelId: v.id("parcels"), address: v.string(), useCode: v.string(), valueCents: v.optional(v.number()), owner: v.optional(v.string()) })),
  owners: v.optional(v.number()),
  signals: v.optional(v.array(ownerSignal)),
  trades: v.optional(v.array(v.string())),
  latestAt: v.optional(v.string()),
  contacts: v.optional(v.array(ownerContact)),
  sources: v.optional(v.array(v.union(v.literal("occupancy"), v.literal("permit"), v.literal("outlet")))),
  businessKind: v.optional(v.string()),
  taxpayer: v.optional(v.string()),
  license: v.optional(realtorLicense),
  brokerage: v.optional(v.string()),
});
const facetRow = v.object({ facet: v.string(), sort: v.number() });

const OWNER_KEYS = [
  "kind", "name", "company", "parcels", "residential", "multifamily", "commercial", "totalValueCents", "maxValueCents",
  "homeValueCents", "rentalValueCents", "commercialValueCents", "multifamilyValueCents", "ownerOccupied", "outOfState", "latestDeed", "homeDeed", "owners", "latestAt", "businessKind", "taxpayer", "brokerage",
] as const;
const sameOwner = (a: Doc<"owners">, b: OwnerRow) =>
  OWNER_KEYS.every((k) => (a[k] ?? undefined) === (b[k] ?? undefined)) &&
  JSON.stringify([a.mailing, a.useCodes, a.streets, a.tops, a.signals, a.trades, a.contacts, a.sources, a.license]) === JSON.stringify([b.mailing, b.useCodes, b.streets, b.tops, b.signals, b.trades, b.contacts, b.sources, b.license]);

/**
 * An owner's facet rows made to match `facets`, stamped with this build.
 * Returns how each facet's count moved (a facet gained is +1, one lost -1).
 */
async function writeFacets(ctx: MutationCtx, ownerId: Id<"owners">, facets: Array<{ facet: string; sort: number }>, buildId: string): Promise<Record<string, number>> {
  const delta: Record<string, number> = {};
  const old = await ctx.db.query("ownerFacets").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
  const same = old.length === facets.length && facets.every((f) => old.some((o) => o.facet === f.facet && o.sort === f.sort));
  if (same) {
    for (const o of old) await ctx.db.patch(o._id, { buildId });
    return delta;
  }
  for (const o of old) {
    delta[o.facet] = (delta[o.facet] ?? 0) - 1;
    await ctx.db.delete(o._id);
  }
  for (const f of facets) {
    delta[f.facet] = (delta[f.facet] ?? 0) + 1;
    await ctx.db.insert("ownerFacets", { county: COUNTY, facet: f.facet, ownerId, sort: f.sort, buildId });
  }
  return delta;
}

/** Writes a batch of owner rows and their facets, stamping them with this build. */
export const upsertOwners = internalMutation({
  args: { rows: v.array(v.object({ owner: ownerRow, facets: v.array(facetRow) })), buildId: v.string() },
  handler: async (ctx, { rows, buildId }) => {
    let added = 0;
    let updated = 0;
    for (const { owner, facets } of rows) {
      const row = { county: COUNTY, ...owner, tops: owner.tops as Doc<"owners">["tops"], buildId };
      const existing = await ctx.db.query("owners").withIndex("by_county_and_key", (q) => q.eq("county", COUNTY).eq("key", owner.key)).first();
      let ownerId: Id<"owners">;
      if (!existing) {
        ownerId = await ctx.db.insert("owners", row);
        added++;
      } else {
        ownerId = existing._id;
        if (sameOwner(existing, owner as OwnerRow)) await ctx.db.patch(ownerId, { buildId });
        else {
          await ctx.db.replace(ownerId, row);
          updated++;
        }
      }
      await writeFacets(ctx, ownerId, facets, buildId);
    }
    return { added, updated };
  },
});

/**
 * A page of the owners a build or pass didn't write and should drop: any
 * earlier id, or the same instant under another id. A strictly later id is a
 * daily pass (outreachRefresh.ts) that ran while this build was writing, and
 * its rows stay. `kind` narrows to the permit companies of one kind.
 */
async function staleOwners(ctx: MutationCtx, buildId: string, kind?: "contractor" | "designer" | "occupant"): Promise<Doc<"owners">[]> {
  const sameInstant = `${buildId.split("|")[0]}|\uffff`;
  type Bounds<R> = { lt(field: "buildId", value: string): R; gt(field: "buildId", value: string): { lt(field: "buildId", value: string): R } };
  const take = (side: "before" | "beside", n: number) => {
    const bounds = <R,>(q: Bounds<R>) => (side === "before" ? q.lt("buildId", buildId) : q.gt("buildId", buildId).lt("buildId", sameInstant));
    return kind
      ? ctx.db.query("owners").withIndex("by_county_kind_and_build", (q) => bounds(q.eq("county", COUNTY).eq("kind", kind))).take(n)
      : ctx.db.query("owners").withIndex("by_county_and_build", (q) => bounds(q.eq("county", COUNTY))).take(n);
  };
  const before = await take("before", DROP_BATCH);
  const beside = before.length < DROP_BATCH ? await take("beside", DROP_BATCH - before.length) : [];
  return [...before, ...beside];
}

/** Drops a page of owners and their facets. True when there may be more. */
async function dropOwners(ctx: MutationCtx, stale: Doc<"owners">[]): Promise<boolean> {
  for (const o of stale) {
    for (const f of await ctx.db.query("ownerFacets").withIndex("by_owner", (q) => q.eq("ownerId", o._id)).collect()) await ctx.db.delete(f._id);
    await ctx.db.delete(o._id);
  }
  return stale.length === DROP_BATCH;
}

/** Drops owners (and their facets) this build didn't write: no longer on the roll. Pages itself. */
export const dropStale = internalMutation({
  args: { buildId: v.string() },
  handler: async (ctx, { buildId }) => {
    if (await dropOwners(ctx, await staleOwners(ctx, buildId))) await ctx.scheduler.runAfter(0, internal.outreach.dropStale, { buildId });
  },
});

// ---- The daily records pass (outreachRefresh.ts) ----

/** Drops the companies of one kind this pass didn't write: no permit in CONTRACTOR_DAYS, or no arrival in OCCUPANT_DAYS, any more. Pages itself. */
export const dropStaleOf = internalMutation({
  args: { kind: v.union(v.literal("contractor"), v.literal("designer"), v.literal("occupant")), buildId: v.string() },
  handler: async (ctx, { kind, buildId }) => {
    const stale = await staleOwners(ctx, buildId, kind);
    if (await dropOwners(ctx, stale)) await ctx.scheduler.runAfter(0, internal.outreach.dropStaleOf, { kind, buildId });
    return stale.length;
  },
});

/**
 * One page of the city's records imported since `since`, folded onto the
 * owners of the parcels they're about, the way the weekly build folds them:
 * the row's signals, trades, newest date and "signal" property, and its
 * violation and stalled facets. Records already on the row change nothing.
 */
const SIGNAL_WORDS: Record<Doc<"signals">["kind"], string> = { code_violation: "code violation", dilapidated: "dilapidated building", demolition: "demolition order", stalled_permit: "stalled permit" };

/**
 * A new public record about an owner already sent to Leads goes to the lead:
 * a dated line in its notes ("Nov 12: new code violation, High weeds.") and
 * the New signal tag on its card. Only records that came in after the send, once each.
 */
async function tellLeads(ctx: MutationCtx, key: string, s: Doc<"signals">) {
  const now = nowIso();
  const day = new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const line = `${day}: new ${SIGNAL_WORDS[s.kind]}, ${s.detail}.`;
  const told = new Set<string>();
  for (const c of await ctx.db.query("outreachContacts").withIndex("by_key", (q) => q.eq("key", key)).collect()) {
    if (!c.leadId || told.has(c.leadId)) continue;
    // Something already on the record when the owner was sent isn't news.
    if (c.sentAt && s.importedAt < c.sentAt) continue;
    const lead = await ctx.db.get(c.leadId);
    if (!lead || lead.status === "won" || lead.status === "lost" || (lead.notes ?? "").includes(line)) continue;
    told.add(c.leadId);
    await ctx.db.patch(lead._id, {
      notes: [lead.notes, line].filter(Boolean).join("\n"),
      newSignal: { kind: s.kind, detail: s.detail, date: s.date, at: now },
      updatedAt: now,
    });
  }
}

export const refreshSignals = internalMutation({
  args: { since: v.string(), cursor: v.optional(v.string()), buildId: v.string() },
  handler: async (ctx, { since, cursor, buildId }) => {
    const keep = new Date(Date.now() - SIGNAL_YEARS * 365 * 24 * 3600_000).toISOString();
    const page = await ctx.db
      .query("signals")
      .withIndex("by_county_and_imported", (q) => q.eq("county", COUNTY).gte("importedAt", since))
      .paginate({ cursor: cursor ?? null, numItems: 200 });
    const delta: Record<string, number> = {};
    const touched = new Set<string>();
    const now = Date.now();
    for (const s of page.page) {
      if (!s.parcelId || s.date < keep) continue;
      const p = await ctx.db.get(s.parcelId);
      const key = p && OwnerGrouper.keyFor(p);
      if (!key) continue;
      const owner = await ctx.db.query("owners").withIndex("by_county_and_key", (q) => q.eq("county", COUNTY).eq("key", key)).first();
      if (!owner || owner.kind !== "owner") continue;
      const next = withSignal(owner, { kind: s.kind, detail: s.detail, date: s.date }, { parcelId: p._id, address: p.siteAddress, useCode: p.useCode, valueCents: p.marketValueCents });
      if (next === owner) continue;
      await ctx.db.patch(owner._id, { signals: next.signals, trades: next.trades, latestAt: next.latestAt, tops: next.tops, buildId });
      const moved = await writeFacets(ctx, owner._id, facetsOf(next as unknown as OwnerRow, now), buildId);
      for (const [facet, n] of Object.entries(moved)) delta[facet] = (delta[facet] ?? 0) + n;
      touched.add(owner.key);
      await tellLeads(ctx, owner.key, s);
    }
    return { read: page.page.length, touched: touched.size, delta, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** Moves the owners build's facet counts (what a whole-facet list reports as its total) after a daily pass: exact counts in `set`, movements in `add`. */
export const adjustFacetCounts = internalMutation({
  args: { set: v.optional(v.record(v.string(), v.number())), add: v.optional(v.record(v.string(), v.number())) },
  handler: async (ctx, { set, add }) => {
    const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", OWNERS_SOURCE)).unique();
    if (!sync?.facetCounts) return;
    const counts = { ...sync.facetCounts, ...(set ?? {}) };
    for (const [facet, n] of Object.entries(add ?? {})) counts[facet] = Math.max(0, (counts[facet] ?? 0) + n);
    await ctx.db.patch(sync._id, { facetCounts: counts });
  },
});

// ---- Building a list ----

export type ListRow = {
  key: string;
  name: string;
  company?: string;
  mailing: Doc<"owners">["mailing"];
  /** Absent for a realtor, who owns nothing here. */
  property?: Doc<"outreachContacts">["property"];
  properties: number;
  totalValueCents: number;
  why: string;
  /** A contractor, designer or occupant: the person, phone and email its permits already name, free. A realtor: the person, from their license. */
  found?: { person?: Doc<"outreachContacts">["person"]; phones: NonNullable<Doc<"outreachContacts">["phones"]>; emails: NonNullable<Doc<"outreachContacts">["emails"]>; source?: string };
};

/** What a realtor's license already says: the person is the row, from "trec", free. */
export function foundOnLicense(o: Pick<OwnerRow, "name" | "license">): ListRow["found"] | undefined {
  if (!o.license) return undefined;
  return { person: { name: o.name, title: `${o.license.type === "broker" ? "Broker" : "Sales agent"}, TREC license ${o.license.number}`, source: "trec" }, phones: [], emails: [], source: "trec" };
}

/** What a contractor's permits already say about who to call: the first named person, every phone and email, all from "permits". */
export function foundOnPermits(contacts: OwnerContact[] | undefined): ListRow["found"] | undefined {
  if (!contacts?.length) return undefined;
  const named = contacts.find((c) => c.person);
  const who = named?.person ? splitName(named.person, "person") : undefined;
  const person = who?.first && who.last ? { name: title(`${who.first} ${who.last}`), title: named?.role ? `${title(named.role)} on a permit` : undefined, source: "permits" } : undefined;
  const phones = [...new Set(contacts.map((c) => c.phone).filter((p): p is string => Boolean(p)))].map((number) => ({ number, type: "unknown" as const, source: "permits" }));
  const emails = [...new Set(contacts.map((c) => c.email).filter((e): e is string => Boolean(e)))].map((email) => ({ email, source: "permits" }));
  if (!person && !phones.length && !emails.length) return undefined;
  return { person, phones, emails };
}

const rowOf = (o: Doc<"owners">, facet: Facet): ListRow | null => {
  const row = o as unknown as OwnerRow;
  const p = propertyFor(row, facet) ?? o.tops.all;
  // A realtor owns nothing here: the row stands without a property. Anyone else without one is nothing to list.
  if (!p && o.kind !== "realtor") return null;
  return {
    key: o.key,
    name: o.name,
    company: o.kind === "realtor" ? o.brokerage : o.company ? o.name : undefined,
    mailing: o.mailing,
    ...(p ? { property: { parcelId: p.parcelId as Id<"parcels">, address: title(p.address), useCode: p.useCode, valueCents: p.valueCents } } : {}),
    properties: o.parcels,
    totalValueCents: o.totalValueCents,
    why: why(row, facet),
    ...(o.kind === "contractor" || o.kind === "designer" || o.kind === "occupant" ? { found: foundOnPermits(o.contacts) } : {}),
    ...(o.kind === "realtor" ? { found: foundOnLicense(row) } : {}),
  };
};

/** Whether a definition narrows its facet at all; one that doesn't is counted from the facet alone, with no owner read. */
const narrows = (def: Definition) =>
  def.who === "wealthy" ||
  def.who === "recent_buyer" ||
  [def.minValueCents, def.maxValueCents, def.minParcels, def.minRentals, def.ownerOccupied, def.companyOwned, def.outOfState, def.deedWithinDays, def.ownedForDays, def.withinDays].some((x) => x !== undefined) ||
  Boolean(def.useCodes?.length || def.zips?.length || def.streets?.length || def.trades?.length);

/** Owners read in parallel, a hundred at a time, in the facet's order. */
async function ownersOf(ctx: QueryCtx | MutationCtx, facetRows: Array<Doc<"ownerFacets">>, from: number, to: number): Promise<Array<Doc<"owners"> | null>> {
  const out: Array<Doc<"owners"> | null> = [];
  for (let i = from; i < to; i += 100) {
    out.push(...(await Promise.all(facetRows.slice(i, Math.min(to, i + 100)).map((f) => ctx.db.get(f.ownerId)))));
  }
  return out;
}

/**
 * The rows a definition picks: its facet read top-down by what it's sorted
 * on, filtered in memory. The first `offset` matches are skipped (a list
 * loading its next page), then up to `want` (at most the limit) are
 * returned; the rest are only counted, so `total` is how many owners the
 * definition reaches and `count` how many this page of the list holds.
 * A definition that doesn't narrow its facet is counted from the facet
 * alone (the rebuild's count when it has one, exact past the scan), and
 * only the page's owners are read. `truncated` means the total is a
 * floor: the scan cap was hit with rows unread.
 */
export async function buildRows(ctx: QueryCtx | MutationCtx, def: Definition, offset = 0, want?: number) {
  let facet: Facet;
  try {
    facet = facetFor(def);
  } catch (e) {
    fail("INVALID", e instanceof Error ? e.message : String(e));
  }
  const limit = Math.min(MAX_ROWS, Math.max(1, def.limit ?? DEFAULT_ROWS));
  const page = Math.min(limit, want ?? limit);
  const now = Date.now();
  const query = () =>
    ctx.db
      .query("ownerFacets")
      .withIndex("by_facet_and_sort", (q) => q.eq("county", def.county).eq("facet", facet))
      .order("desc");
  if (!narrows(def)) {
    // Every row of the facet is on the list: the count comes from the rebuild, or from the facet up to the scan cap.
    const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", OWNERS_SOURCE)).unique();
    const counted = sync?.facetCounts?.[facet];
    const facetRows = await query().take(Math.max(SCAN, offset + page));
    const total = counted ?? facetRows.length;
    const truncated = counted === undefined && facetRows.length >= SCAN;
    const owners = await ownersOf(ctx, facetRows, offset, Math.min(facetRows.length, offset + page));
    const rows = owners.flatMap((o) => (o ? (rowOf(o, facet) ?? []) : []));
    const count = Math.min(limit, Math.max(0, total - offset));
    return { rows, count, total, truncated, limited: total - offset >= limit };
  }
  const facetRows = await query().take(SCAN);
  const rows: ListRow[] = [];
  let total = 0;
  let floored = false;
  outer: for (let i = 0; i < facetRows.length; i += 100) {
    for (const owner of await ownersOf(ctx, facetRows, i, Math.min(facetRows.length, i + 100))) {
      if (!owner) continue;
      // Sorted by holdings or value, so once a row is under the floor every row after it is too: the count is exact.
      if (underFloor(owner as unknown as OwnerRow, def, facet)) {
        floored = true;
        break outer;
      }
      if (!matches(owner as unknown as OwnerRow, def, facet, now)) continue;
      total++;
      if (total <= offset || rows.length >= page) continue;
      const row = rowOf(owner, facet);
      if (row) rows.push(row);
    }
  }
  const count = Math.min(limit, Math.max(0, total - offset));
  return { rows, count, total, truncated: !floored && facetRows.length === SCAN, limited: total - offset >= limit };
}

// ---- A company's lists ----

/** A member of a company on an active Pro plan. */
async function requirePro(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const member = await requireMember(ctx, organizationId);
  if (!member.organization.plan || !planIsActive(member.organization.plan, Date.now())) fail("FORBIDDEN", "Outreach is part of the Pro plan");
  return member;
}

/** What a list has turned into in Leads: owners sent, leads with an estimate, jobs sold. */
type ListResults = { sent: number; estimates: number; sold: number };
const listView = (l: Doc<"outreachLists">, done: number, results: ListResults = { sent: 0, estimates: 0, sold: 0 }, stranded = 0) => ({
  id: l._id,
  title: l.title,
  who: l.definition.who,
  definition: l.definition,
  rowCount: l.rowCount,
  done,
  truncated: l.truncated,
  /** How many owners the definition reaches (a floor when truncated); missing on lists saved before it was counted. */
  total: l.total,
  results,
  createdAt: l.createdAt,
  pinned: l.pinned === true,
  archived: Boolean(l.archivedAt),
  /** Still adding owners after the first, in the background. */
  filling: l.filling === true,
  /** Only a list nobody has worked can be deleted: deleting it would leave none of its worked owners on no list. Otherwise it's archived. */
  deletable: stranded === 0,
});

/** The count and a first look, before saving. `count` is what one list holds; `total` is how many owners the ask reaches. */
export const preview = query({
  args: { organizationId: v.id("organizations"), definition: outreachDefinition },
  handler: async (ctx, { organizationId, definition }) => {
    await requirePro(ctx, organizationId);
    const built = await buildRows(ctx, definition, 0, PREVIEW_ROWS);
    return { count: built.count, total: built.total, truncated: built.truncated, limited: built.limited, rows: built.rows };
  },
});

/** A preview reads this many owners (enough to scroll through before saving); the count and total come without the rest. */
const PREVIEW_ROWS = 100;

export const previewInternal = internalQuery({
  args: { organizationId: v.id("organizations"), definition: outreachDefinition },
  handler: async (ctx, { organizationId, definition }) => {
    await requirePro(ctx, organizationId);
    const built = await buildRows(ctx, definition, 0, PREVIEW_ROWS);
    return { count: built.count, total: built.total, truncated: built.truncated, limited: built.limited, rows: built.rows };
  },
});

export const assertPro = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user } = await requirePro(ctx, organizationId);
    return { staff: isStaff(user) };
  },
});

/** Dealt with: sent to Leads or skipped (or an earlier settled status); not new or still being tried. */
const isWorked = (s: Doc<"outreachContacts">["status"]) => !["new", "sent", "no_answer", "callback"].includes(s);

/** Every contact a company has, newest first. */
async function contactsOf(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  return await ctx.db.query("outreachContacts").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
}

/**
 * Builds the list and puts its owners in the company's contacts: a new row
 * for an owner the company hasn't pulled before, a tag on the row for one
 * it has (status, note and any unlocked phone stay).
 */
export const createDef = mutationDef({
  args: { organizationId: v.id("organizations"), title: v.optional(v.string()), definition: outreachDefinition },
  handler: async (ctx, { organizationId, title: wanted, definition }) => {
    const { user } = await requirePro(ctx, organizationId);
    // The first owners go in now, so the list opens with them at once; the rest follow in the background, live on the page.
    const built = await buildRows(ctx, definition, 0, FIRST_ROWS);
    const now = nowIso();
    const more = built.count > built.rows.length;
    const listId = await ctx.db.insert("outreachLists", {
      organizationId,
      title: wanted?.trim() || defaultTitle(definition),
      definition,
      rowCount: built.rows.length,
      total: built.total,
      done: 0,
      truncated: built.truncated,
      createdBy: user._id,
      createdAt: now,
      ...(more ? { filling: true } : {}),
    });
    const added = await addRows(ctx, organizationId, listId, definition.who, built.rows, now);
    if (more) await ctx.scheduler.runAfter(0, internal.outreach.fillList, { listId, offset: built.rows.length, target: built.count });
    return { listId, rowCount: built.count, total: built.total, added, truncated: built.truncated, limited: built.limited, sample: built.rows.slice(0, 3) };
  },
});
export const create = mutation(createDef);

/** How many owners a new list holds the moment it's saved, and how many each background step adds after. */
const FIRST_ROWS = 50;
const FILL_ROWS = 100;

/** A new list's owners past the first, a page at a time, each page showing on the list as it lands; the last clears `filling`. */
export const fillList = internalMutation({
  args: { listId: v.id("outreachLists"), offset: v.number(), target: v.number() },
  handler: async (ctx, { listId, offset, target }) => {
    const list = await ctx.db.get(listId);
    if (!list) return null;
    const built = await buildRows(ctx, list.definition, offset, Math.min(FILL_ROWS, target - offset));
    await addRows(ctx, list.organizationId, listId, list.definition.who, built.rows, nowIso());
    const next = offset + built.rows.length;
    const more = built.rows.length > 0 && next < target;
    await ctx.db.patch(listId, { rowCount: next, total: built.total, truncated: built.truncated, filling: more ? true : undefined });
    if (more) await ctx.scheduler.runAfter(0, internal.outreach.fillList, { listId, offset: next, target });
    return null;
  },
});

/** Puts a list's rows in the company's contacts: a new row for an owner it hasn't pulled before, a tag on the row for one it has. Returns how many were new. */
async function addRows(ctx: MutationCtx, organizationId: Id<"organizations">, listId: Id<"outreachLists">, who: Definition["who"], rows: ListRow[], now: string) {
  let added = 0;
  for (const row of rows) {
    const existing = await ctx.db
      .query("outreachContacts")
      .withIndex("by_organization_and_key", (q) => q.eq("organizationId", organizationId).eq("key", row.key))
      .unique();
    if (existing) {
      if (existing.listIds.includes(listId)) continue;
      await ctx.db.patch(existing._id, {
        listIds: [...existing.listIds, listId],
        kinds: existing.kinds.includes(who) ? existing.kinds : [...existing.kinds, who],
        updatedAt: now,
      });
    } else {
      const { found, ...rest } = row;
      // A contractor's permits (or a realtor's license) already name who to call: those cells start found, from that record, at no charge.
      const from = found?.source ?? "permits";
      const given = found
        ? {
            person: found.person,
            phones: found.phones.length ? found.phones : undefined,
            emails: found.emails.length ? found.emails : undefined,
            enrichment: {
              person: found.person ? { status: "found" as const, at: now, source: from, tries: [{ source: from, outcome: "hit" as const, note: found.person.name }] } : LOCKED,
              phone: found.phones.length ? { status: "found" as const, at: now, source: from, chargedCents: 0, tries: [{ source: from, outcome: "hit" as const, note: `${found.phones.length} ${found.phones.length === 1 ? "number" : "numbers"}` }] } : LOCKED,
              email: found.emails.length ? { status: "found" as const, at: now, source: from, tries: [{ source: from, outcome: "hit" as const, note: `${found.emails.length} ${found.emails.length === 1 ? "email" : "emails"}` }] } : LOCKED,
              research: LOCKED,
            },
          }
        : {};
      await ctx.db.insert("outreachContacts", { organizationId, ...rest, ...given, kinds: [who], listIds: [listId], status: "new", createdAt: now });
      added++;
    }
  }
  return added;
}

/**
 * Loads the next page of a list that reached its cap: the owners after the
 * ones it already holds, in the same order, up to the list's limit again.
 */
export const extend = mutation({
  args: { organizationId: v.id("organizations"), listId: v.id("outreachLists") },
  handler: async (ctx, { organizationId, listId }) => {
    await requirePro(ctx, organizationId);
    const list = await ctx.db.get(listId);
    if (!list || list.organizationId !== organizationId) fail("NOT_FOUND", "No such list");
    const built = await buildRows(ctx, list.definition, list.rowCount);
    const now = nowIso();
    const added = await addRows(ctx, organizationId, listId, list.definition.who, built.rows, now);
    const rowCount = list.rowCount + built.rows.length;
    await ctx.db.patch(listId, { rowCount, total: built.total, truncated: built.truncated });
    return { loaded: built.rows.length, added, rowCount, total: built.total, truncated: built.truncated };
  },
});

export const listsDef = queryDef({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requirePro(ctx, organizationId);
    const lists = await ctx.db.query("outreachLists").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
    const contacts = await contactsOf(ctx, organizationId);
    const done = new Map<Id<"outreachLists">, number>();
    for (const c of contacts) if (isWorked(c.status)) for (const id of c.listIds) done.set(id, (done.get(id) ?? 0) + 1);
    // Worked owners only this list holds: deleting it would leave them on no list.
    const stranded = new Map<Id<"outreachLists">, number>();
    for (const c of contacts) if (c.listIds.length === 1 && worthKeeping(c)) stranded.set(c.listIds[0], (stranded.get(c.listIds[0]) ?? 0) + 1);
    // Each lead counted once per list, however many of the list's owners joined it.
    const leads = new Map((await ctx.db.query("leads").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()).map((l) => [l._id, l] as const));
    const seen = new Map<Id<"outreachLists">, Set<string>>();
    const results = new Map<Id<"outreachLists">, ListResults>();
    for (const c of contacts) {
      const lead = c.leadId && leads.get(c.leadId);
      if (!lead) continue;
      for (const id of c.listIds) {
        const s = seen.get(id) ?? new Set<string>();
        seen.set(id, s);
        if (s.has(lead._id)) continue;
        s.add(lead._id);
        const r = results.get(id) ?? { sent: 0, estimates: 0, sold: 0 };
        r.sent++;
        if (lead.estimateId || lead.status === "quoted" || lead.status === "won") r.estimates++;
        if (lead.status === "won") r.sold++;
        results.set(id, r);
      }
    }
    return lists.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => listView(l, done.get(l._id) ?? 0, results.get(l._id), stranded.get(l._id) ?? 0));
  },
});
export const lists = query(listsDef);

type Cell = NonNullable<Doc<"outreachContacts">["enrichment"]>["phone"];
const LOCKED: Cell = { status: "locked" };
/** A contact's cells, with the old single unlock read as its cells until the migration has run. */
export function cellsOf(c: Doc<"outreachContacts">): NonNullable<Doc<"outreachContacts">["enrichment"]> {
  if (c.enrichment) return c.enrichment;
  const u = c.unlock;
  if (!u) return { phone: LOCKED, email: LOCKED, person: LOCKED, research: LOCKED };
  const status: Cell["status"] = u.status === "pending" ? "running" : u.status;
  const cell = { status, at: u.at, requestedBy: u.requestedBy, source: u.vendor, error: u.error };
  return {
    phone: { ...cell, chargedCents: u.chargedCents },
    email: { ...cell, status: u.status === "found" && !(c.emails?.length ?? 0) ? "none" : status },
    person: LOCKED,
    research: LOCKED,
  };
}
/** The cell for a field, with research's absence on older rows read as locked. */
const cellFor = (cells: NonNullable<Doc<"outreachContacts">["enrichment"]>, field: Doc<"dataSourceStats">["field"]): Cell => cells[field] ?? LOCKED;

/**
 * Whether the contact is itself a company (an LLC on the roll, a contractor),
 * so its sister entities are kin and the person behind it is to be found.
 * A realtor's `company` is the brokerage they work with, not what they are.
 */
const isCompany = (c: { company?: string; kinds: Doc<"outreachContacts">["kinds"] }) => c.company !== undefined && !c.kinds.includes("realtor");

const contactView = (c: Doc<"outreachContacts">, signals: SignalBadge[], related: Array<{ id: Id<"outreachContacts">; name: string }> = [], known?: Known, leadStage?: Doc<"leads">["status"]) => ({
  id: c._id,
  key: c.key,
  name: c.name,
  company: c.company,
  mailing: c.mailing,
  property: c.property,
  properties: c.properties,
  totalValueCents: c.totalValueCents,
  why: c.why,
  kinds: c.kinds,
  listIds: c.listIds,
  status: c.status,
  note: c.note,
  leadId: c.leadId,
  /** Where the lead stands in Leads: Contacted, Estimate Sent, Job sold… */
  ...(c.leadId && leadStage ? { leadStage } : {}),
  phones: c.phones ?? [],
  emails: c.emails ?? [],
  person: c.person,
  research: c.research,
  enrichment: { ...cellsOf(c), research: cellFor(cellsOf(c), "research") },
  signals,
  /** Sister entities of the same company family ("Nuka Hiva Alpha 1-54 LLC" and "Nuka Hiva Alpha LLC"): likely one operator. */
  related,
  /** A client or lead the company already has for this owner, until it's sent. */
  ...(known && !c.leadId ? { known } : {}),
  createdAt: c.createdAt,
});
export type ContactView = ReturnType<typeof contactView>;

/** What the Signals column says about a contact's property: the newest of each kind of public record. */
export type SignalBadge = { kind: Doc<"signals">["kind"]; date: string; detail: string; fresh?: boolean };

/**
 * When a signal counts as new: first seen in the last week, and not in the
 * first import (a day's grace after it), so the first load of the city's
 * records doesn't call everything new.
 */
async function freshSince(ctx: QueryCtx | MutationCtx, now = Date.now()): Promise<string> {
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const first = await ctx.db.query("signals").order("asc").first();
  const afterFirst = first ? new Date(Date.parse(first.importedAt) + 24 * 60 * 60 * 1000).toISOString() : weekAgo;
  return afterFirst > weekAgo ? afterFirst : weekAgo;
}

async function signalsFor(ctx: QueryCtx | MutationCtx, parcelId: Id<"parcels">, since?: string): Promise<SignalBadge[]> {
  const rows = await ctx.db
    .query("signals")
    .withIndex("by_parcel", (q) => q.eq("parcelId", parcelId))
    .order("desc")
    .take(10);
  const out: SignalBadge[] = [];
  for (const r of rows) if (!out.some((o) => o.kind === r.kind)) out.push({ kind: r.kind, date: r.date, detail: r.detail, ...(since && r.importedAt > since ? { fresh: true } : {}) });
  return out;
}

/** "Phone 12 / 200 · 2 sources": how many contacts have each field, and from how many sources. */
function coverageOf(rows: Doc<"outreachContacts">[]) {
  const count = (has: (c: Doc<"outreachContacts">) => boolean, source: (c: Doc<"outreachContacts">) => string | undefined, of: (c: Doc<"outreachContacts">) => boolean = () => true) => {
    const sources = new Set<string>();
    let found = 0;
    let total = 0;
    for (const c of rows) {
      if (!of(c)) continue;
      total++;
      if (has(c)) {
        found++;
        const s = source(c);
        if (s) sources.add(s);
      }
    }
    return { found, total, sources: sources.size };
  };
  return {
    phone: count((c) => (c.phones?.length ?? 0) > 0, (c) => cellsOf(c).phone.source),
    email: count((c) => (c.emails?.length ?? 0) > 0, (c) => cellsOf(c).email.source),
    person: count((c) => Boolean(c.person), (c) => c.person?.source, (c) => Boolean(c.company)),
    research: count((c) => Boolean(c.research), (c) => cellFor(cellsOf(c), "research").source),
  };
}

/** The checkers' names: their scorecard rows say how numbers held up, not how often one was found. */
const checkerNames = () => new Set([...phoneCheckers(process.env).map((c) => c.name), phoneScrub(process.env).name, verifier(process.env).name]);

/** The company's own hit rate on phones so far, for the estimate; undefined until it has tried. Over the finding sources only. */
async function phoneHitRate(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const stats = await ctx.db.query("dataSourceStats").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  const checkers = checkerNames();
  let attempts = 0;
  let hits = 0;
  for (const s of stats) {
    if (s.field !== "phone" || checkers.has(s.source)) continue;
    attempts += s.attempts;
    hits += s.hits;
  }
  return attempts > 0 ? hits / attempts : undefined;
}

/**
 * The company's contacts: on one list, in the list's own order (the
 * biggest holders or the most valuable property first, as the list was
 * built); across all lists, newest first. With coverage, the balance and
 * the price, for the headers and the unlock bar.
 */
export const contacts = query({
  args: { organizationId: v.id("organizations"), listId: v.optional(v.id("outreachLists")) },
  handler: async (ctx, { organizationId, listId }) => {
    const { organization } = await requirePro(ctx, organizationId);
    const all = await contactsOf(ctx, organizationId);
    const list = listId ? await ctx.db.get(listId) : null;
    const order = list && list.organizationId === organizationId ? listOrder(list.definition) : undefined;
    const picked = all
      .filter((c) => !listId || c.listIds.includes(listId))
      .sort((a, b) => (order ? order.key(b) - order.key(a) || a.name.localeCompare(b.name) : b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name)));
    // Sister entities across all the company's contacts, not only this list.
    const families = new Map<string, Array<{ id: Id<"outreachContacts">; name: string }>>();
    for (const c of all) {
      const f = isCompany(c) ? familyKey(c.name) : undefined;
      if (f) families.set(f, [...(families.get(f) ?? []), { id: c._id, name: c.name }]);
    }
    const relatedTo = (c: Doc<"outreachContacts">) => {
      const f = isCompany(c) ? familyKey(c.name) : undefined;
      return f ? (families.get(f) ?? []).filter((r) => r.id !== c._id) : [];
    };
    const since = await freshSince(ctx);
    // Every owner's signals read at once, not one after another.
    const signals = await Promise.all(picked.map((c) => (c.property ? signalsFor(ctx, c.property.parcelId, since) : Promise.resolve([] as SignalBadge[]))));
    // A lead deleted in Leads leaves its owner New here, ready to send again; one still there shows its stage.
    const stages = new Map<Id<"outreachContacts">, Doc<"leads">["status"]>();
    const gone = new Set(
      (
        await Promise.all(
          picked
            .filter((c) => c.leadId)
            .map(async (c) => {
              const lead = await ctx.db.get(c.leadId!);
              if (lead) stages.set(c._id, lead.status);
              return lead ? null : c._id;
            }),
        )
      ).filter((id) => id !== null),
    );
    const index = await knownOf(ctx, organizationId);
    const rows = picked.map((c, i) => {
      const shown = gone.has(c._id) ? { ...c, status: c.status === "lead" ? ("new" as const) : c.status, leadId: undefined } : c;
      return contactView(shown, signals[i], relatedTo(c), shown.leadId ? undefined : knownFor(shown, index), stages.get(c._id));
    });
    return {
      rows,
      coverage: coverageOf(picked),
      balanceCents: organization.walletBalanceCents ?? 0,
      unlockCents: UNLOCK_CENTS,
      researchCents: RESEARCH_CENTS,
      researchQuestion: DEFAULT_RESEARCH_QUESTION,
      phoneHitRate: await phoneHitRate(ctx, organizationId),
      lastSend: await lastSendOf(ctx, organizationId),
    };
  },
});

/** Staff: the stack in order, whether each source is connected, and how it has done for this company. */
export const sources = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireStaff(ctx);
    const stats = await ctx.db.query("dataSourceStats").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
    const checker = verifier(process.env);
    const scrub = phoneScrub(process.env);
    const own = [
      { name: "roll", fields: ["person" as const], connected: true },
      { name: "permits", fields: ["person" as const, "phone" as const, "email" as const], connected: true },
    ];
    const checks = [
      ...phoneCheckers(process.env).map((c) => ({ name: c.name, fields: c.name === "trestle" ? ["phone" as const, "email" as const] : ["phone" as const], connected: c.connected })),
      { name: scrub.name, fields: ["phone" as const], connected: scrub.connected },
      { name: checker.name, fields: ["email" as const], connected: checker.connected },
    ];
    return [...own, ...vendors(process.env), ...checks].map((s) => ({
      name: s.name,
      fields: s.fields,
      connected: s.connected,
      stats: s.fields.map((field) => {
        const row = stats.find((x) => x.source === s.name && x.field === field);
        return { field, attempts: row?.attempts ?? 0, hits: row?.hits ?? 0, chargedCents: row?.chargedCents ?? 0, lastAt: row?.lastAt, problem: row?.problem, problemAt: row?.problemAt };
      }),
    }));
  },
});

/** Marks a contact sent, done or skipped (or new again), with a note. */
/**
 * Skip or un-skip an owner, and their note. Outreach stops there: the
 * calls, follow-ups and the estimate happen in Leads (sendToLeads).
 */
export const setStatus = mutation({
  args: { organizationId: v.id("organizations"), contactId: v.id("outreachContacts"), status: outreachRowStatus, note: v.optional(v.string()) },
  handler: async (ctx, { organizationId, contactId, status, note }) => {
    await requirePro(ctx, organizationId);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.organizationId !== organizationId) fail("NOT_FOUND", "No such contact");
    // No note sent leaves the one there; an empty one clears it.
    const text = note === undefined ? contact.note : note.trim() || undefined;
    await ctx.db.patch(contactId, { status, note: text, updatedAt: nowIso() });
    return null;
  },
});

/**
 * Another owner run by the same people: one family of LLCs ("Nuka Hiva Alpha
 * 1-54 LLC" and "Nuka Hiva Alpha LLC"), or the same decision maker at the same
 * mailing address. Their calls go to one lead, not one each.
 */
function sameOperator(a: Doc<"outreachContacts">, b: Doc<"outreachContacts">): boolean {
  const family = a.company ? familyKey(a.name) : undefined;
  if (family !== undefined && b.company && familyKey(b.name) === family) return true;
  const mail = mailKey(a.mailing);
  return !!a.person && !!b.person && samePerson(a.person, b.person) && mail !== undefined && mailKey(b.mailing) === mail;
}

/** On a lead whose owner had sample or simulated results, in place of them. */
export const SAMPLE_LEFT_OUT = "Sample contact details were left out; look this owner up for real ones.";

/**
 * One owner to Leads, where the calls, follow-ups and the estimate already
 * live. The lead (new, source Outreach) gets the decision maker's name (the
 * company's until one is found), always the owning company, the best number
 * not on Do Not Call, the email, the property as its address, and a note with
 * what they own, the mailing address and the company's own note. An owner run
 * by the same people as one already sent joins that lead instead: a line on
 * its note, and the number or email it was missing. `all` is the company's
 * contacts, kept current as owners are sent.
 */
/** A client or lead the company already has, matched to an owner. */
type Known = { kind: "client" | "lead"; id: string; name: string };

const NAME_FILLER = new Set(["llc", "l", "c", "inc", "lp", "llp", "ltd", "co", "corp", "corporation", "company", "the", "pllc", "pc"]);
/** "Oak Plaza, L.L.C." and "oak plaza llc" → "oak plaza": a name to compare, without its punctuation or entity words. */
function nameKey(name?: string): string | undefined {
  const words = (name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NAME_FILLER.has(w));
  // One word is too loose to call two names the same ("Smith").
  return words.length >= 2 ? words.join(" ") : undefined;
}
const phoneKey = (p?: string) => {
  const d = (p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : undefined;
};
const emailKey = (e?: string) => e?.trim().toLowerCase() || undefined;

/** Everyone the company already has, by phone, email and name: clients first, so a client wins over a lead. */
async function knownOf(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const index = new Map<string, Known>();
  const add = (k: Known, keys: Array<string | undefined>) => {
    for (const key of keys) if (key && !index.has(key)) index.set(key, k);
  };
  for (const c of await ctx.db.query("clients").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()) {
    add({ kind: "client", id: c._id, name: c.companyName || c.name }, [`p:${phoneKey(c.phone)}`, `e:${emailKey(c.email)}`, `n:${nameKey(c.name)}`, `n:${nameKey(c.companyName)}`].filter((k) => !k.endsWith(":undefined")));
  }
  for (const l of await ctx.db.query("leads").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()) {
    if (l.isSample) continue;
    add({ kind: "lead", id: l._id, name: l.company || l.name }, [`p:${phoneKey(l.phone)}`, `e:${emailKey(l.email)}`, `n:${nameKey(l.name)}`, `n:${nameKey(l.company)}`].filter((k) => !k.endsWith(":undefined")));
  }
  return index;
}
type KnownIndex = Awaited<ReturnType<typeof knownOf>>;

/** The client or lead an owner already is: by a real phone or email, else by the owner's name. */
function knownFor(c: Doc<"outreachContacts">, index: KnownIndex): Known | undefined {
  const cells = cellsOf(c);
  const real = (field: "phone" | "email") => !isSampleRun(c) && !cellFor(cells, field).simulated;
  const keys = [
    ...(real("phone") ? (c.phones ?? []).map((p) => `p:${phoneKey(p.number)}`) : []),
    ...(real("email") ? (c.emails ?? []).map((e) => `e:${emailKey(e.email)}`) : []),
    // The owner's own name, not the decision maker's: two men named Kai Moana are not one lead.
    `n:${nameKey(c.name)}`,
  ];
  const hits = keys.map((k) => index.get(k)).filter((k): k is Known => k !== undefined && !(k.kind === "lead" && k.id === c.leadId));
  return hits.find((k) => k.kind === "client") ?? hits[0];
}

async function sendOne(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
  contact: Doc<"outreachContacts">,
  all: Doc<"outreachContacts">[],
  now: string,
  index?: KnownIndex,
): Promise<{ leadId: Id<"leads">; made: boolean }> {
  const have = async (id?: Id<"leads">) => (id ? await ctx.db.get(id) : null);
  // Sample and simulated results are made up: they show the layout here, but a lead is called for real.
  const cells = cellsOf(contact);
  const madeUp = (field: "phone" | "email" | "person") => isSampleRun(contact) || Boolean(cellFor(cells, field).simulated);
  const phone = madeUp("phone") ? undefined : (contact.phones ?? []).find((p) => !p.dnc && !p.litigator);
  const email = madeUp("email") ? undefined : (contact.emails ?? []).find((e) => e.nameMatch !== false);
  const person = madeUp("person") ? undefined : contact.person;
  const leftOut = (madeUp("phone") && (contact.phones?.length ?? 0) > 0) || (madeUp("email") && (contact.emails?.length ?? 0) > 0) || (madeUp("person") && Boolean(contact.person));
  let lead = await have(contact.leadId);
  let made = false;
  if (!lead) {
    for (const other of all) {
      if (other._id === contact._id || !other.leadId || !sameOperator(contact, other)) continue;
      lead = await have(other.leadId);
      if (lead) break;
    }
    // Someone the company already has: a lead is joined, a client gets the new lead under their name.
    const known = lead ? undefined : knownFor(contact, index ?? (await knownOf(ctx, organizationId)));
    if (known?.kind === "lead") lead = await have(known.id as Id<"leads">);
    const client = known?.kind === "client" ? await ctx.db.get(known.id as Id<"clients">) : null;
    if (lead) {
      // Joins the lead of the same operator: what this one owns, and anything the lead was missing.
      await ctx.db.patch(lead._id, {
        notes: [lead.notes, `Also owns as ${contact.name}: ${contact.why}.`].filter(Boolean).join("\n"),
        ...(!lead.phone && phone ? { phone: phone.number } : {}),
        ...(!lead.email && email ? { email: email.email } : {}),
        updatedAt: now,
      });
    } else {
      const mailing = [contact.mailing.address, contact.mailing.city, contact.mailing.state, contact.mailing.zip?.slice(0, 5)].filter(Boolean).join(", ");
      const notes = [
        `From Outreach. ${contact.why}.`,
        mailing ? `Mailing address: ${mailing}.` : "",
        client ? `Already a client: ${client.companyName || client.name}.` : "",
        leftOut ? SAMPLE_LEFT_OUT : "",
        isSampleRun(contact) ? "" : (contact.note ?? ""),
      ]
        .filter(Boolean)
        .join("\n");
      const name = person?.name ?? contact.name;
      const leadId = await ctx.db.insert("leads", {
        name,
        ...(isCompany(contact) ? { company: contact.name } : contact.company ? { company: contact.company } : {}),
        // Under a client, the client's number and email when the lookup has none: nothing to pay for.
        ...(phone ? { phone: phone.number } : client?.phone ? { phone: client.phone } : {}),
        ...(email ? { email: email.email } : client?.email ? { email: client.email } : {}),
        ...(contact.property?.address ? { address: contact.property.address, city: "Midland" } : {}),
        source: "Outreach",
        status: "new",
        notes,
        ...(client ? { clientId: client._id } : {}),
        organizationId,
        userId,
        createdAt: now,
        updatedAt: now,
      });
      await logActivity(ctx, { organizationId, userId, action: "created", resourceType: "lead", resourceId: leadId, details: { name, fromOutreach: contact._id } });
      lead = (await ctx.db.get(leadId))!;
      made = true;
      // Later owners in the same send that share a phone or email join this lead.
      if (index) for (const k of [`p:${phoneKey(lead.phone)}`, `e:${emailKey(lead.email)}`]) if (!k.endsWith(":undefined") && !index.has(k)) index.set(k, { kind: "lead", id: leadId, name: lead.company || lead.name });
    }
  }
  if (contact.status !== "lead" || contact.leadId !== lead._id) await ctx.db.patch(contact._id, { leadId: lead._id, status: "lead", sentAt: now, updatedAt: now });
  // Later owners in the same send see this one's lead.
  const mine = all.find((c) => c._id === contact._id);
  if (mine) mine.leadId = lead._id;
  return { leadId: lead._id, made };
}

/**
 * One-off: leads sent from Outreach before Company was always filled get
 * their owning company. Safe to run again. Run from the deploy workflow:
 * function `outreach:fillLeadCompanies`.
 */
export const fillLeadCompanies = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tally = { outreachLeads: 0, missing: 0, filled: 0 };
    for (const lead of await ctx.db.query("leads").filter((q) => q.eq(q.field("source"), "Outreach")).collect()) {
      tally.outreachLeads++;
      if (lead.company) continue;
      tally.missing++;
      // The owner it was sent from: linked by the send, else the owner of the same name in the same company.
      const linked = await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).first();
      const contact =
        linked ??
        (await ctx.db
          .query("outreachContacts")
          .withIndex("by_organization", (q) => q.eq("organizationId", lead.organizationId))
          .filter((q) => q.eq(q.field("name"), lead.name))
          .first());
      if (!contact?.company) continue;
      await ctx.db.patch(lead._id, { company: contact.name, updatedAt: nowIso() });
      if (!linked && !contact.leadId) await ctx.db.patch(contact._id, { leadId: lead._id, status: "lead", updatedAt: nowIso() });
      tally.filled++;
    }
    return tally;
  },
});

/** One owner to Leads (see sendOne). Sent once; after that the same lead comes back. */
export const sendToLeads = mutation({
  args: { organizationId: v.id("organizations"), contactId: v.id("outreachContacts") },
  handler: async (ctx, { organizationId, contactId }) => {
    const { user } = await requirePro(ctx, organizationId);
    const contact = await ctx.db.get(contactId);
    if (!contact || contact.organizationId !== organizationId) fail("NOT_FOUND", "No such contact");
    return (await sendOne(ctx, organizationId, user._id, contact, await contactsOf(ctx, organizationId), nowIso())).leadId;
  },
});

/** The Outreach owners behind a lead, for the lead's drawer: who they are, what they own and why they were picked. */
export const ownersOfLead = query({
  args: { organizationId: v.id("organizations"), leadId: v.id("leads") },
  handler: async (ctx, { organizationId, leadId }) => {
    await requireMember(ctx, organizationId);
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.organizationId !== organizationId) return [];
    const owners = await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect();
    return owners
      .filter((c) => c.organizationId === organizationId)
      .map((c) => ({ id: c._id, name: c.name, why: c.why, properties: c.properties, totalValueCents: c.totalValueCents, address: c.property?.address }));
  },
});

/** How long a send to Leads can be taken back. */
const UNDO_HOURS = 24;
/** Outreach leads made by one send, which share their creation time. */
async function leadsOfSend(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  return (await ctx.db.query("leads").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()).filter((l) => l.source === "Outreach");
}
/** The latest send of two or more leads in the last day, to offer Undo on: when, and how many leads are still there. */
async function lastSendOf(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">): Promise<{ at: string; leads: number } | null> {
  const since = new Date(Date.now() - UNDO_HOURS * 3600_000).toISOString();
  const counts = new Map<string, number>();
  for (const l of await leadsOfSend(ctx, organizationId)) if (l.createdAt >= since) counts.set(l.createdAt, (counts.get(l.createdAt) ?? 0) + 1);
  const at = [...counts.entries()].filter(([, n]) => n >= 2).map(([t]) => t).sort().at(-1);
  return at ? { at, leads: counts.get(at)! } : null;
}

/**
 * Takes back one send to Leads: its leads still at New with no estimate are
 * deleted and their owners go back to New here; leads already worked stay.
 * Owners of that send who joined an older lead leave it again.
 */
export const undoSend = mutation({
  args: { organizationId: v.id("organizations"), at: v.string() },
  handler: async (ctx, { organizationId, at }) => {
    await requirePro(ctx, organizationId);
    const now = nowIso();
    let removed = 0;
    let kept = 0;
    for (const lead of (await leadsOfSend(ctx, organizationId)).filter((l) => l.createdAt === at)) {
      if (lead.status !== "new" || lead.estimateId) {
        kept++;
        continue;
      }
      for (const c of await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect()) {
        await ctx.db.patch(c._id, { status: "new", leadId: undefined, sentAt: undefined, updatedAt: now });
      }
      await ctx.db.delete(lead._id);
      removed++;
    }
    for (const c of await contactsOf(ctx, organizationId)) {
      if (c.sentAt !== at || !c.leadId) continue;
      const lead = await ctx.db.get(c.leadId);
      if (!lead || lead.createdAt === at) continue;
      const line = `Also owns as ${c.name}:`;
      await ctx.db.patch(lead._id, { notes: (lead.notes ?? "").split("\n").filter((l) => !l.startsWith(line)).join("\n") || undefined, updatedAt: now });
      await ctx.db.patch(c._id, { status: "new", leadId: undefined, sentAt: undefined, updatedAt: now });
    }
    return { removed, kept };
  },
});

/** The most owners one Send to Leads takes. */
export const SEND_MAX = 500;

/**
 * Many owners to Leads at once (the ones showing on the page). Owners run by
 * the same people share one lead. Says how many owners went, how many leads
 * that made, and how many joined a lead of the same operator.
 */
export const sendManyToLeads = mutation({
  args: { organizationId: v.id("organizations"), contactIds: v.array(v.id("outreachContacts")) },
  handler: async (ctx, { organizationId, contactIds }) => {
    const { user } = await requirePro(ctx, organizationId);
    if (contactIds.length > SEND_MAX) fail("INVALID", `Send up to ${SEND_MAX} at a time`);
    const all = await contactsOf(ctx, organizationId);
    const byId = new Map(all.map((c) => [c._id, c] as const));
    const now = nowIso();
    const index = await knownOf(ctx, organizationId);
    let sent = 0;
    let made = 0;
    for (const id of new Set(contactIds)) {
      const contact = byId.get(id);
      if (!contact) continue;
      const before = contact.leadId && (await ctx.db.get(contact.leadId));
      if (before) continue;
      const r = await sendOne(ctx, organizationId, user._id, contact, all, now, index);
      sent++;
      if (r.made) made++;
    }
    return { sent, leads: made, joined: sent - made };
  },
});

/** Drops a list. Its contacts lose the tag; one on no other list goes too, unless the company paid to unlock it. */
export const remove = mutation({
  args: { organizationId: v.id("organizations"), listId: v.id("outreachLists") },
  handler: async (ctx, { organizationId, listId }) => {
    await requirePro(ctx, organizationId);
    const list = await ctx.db.get(listId);
    if (!list || list.organizationId !== organizationId) fail("NOT_FOUND", "No such list");
    const lists = await ctx.db.query("outreachLists").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
    const whoOf = new Map(lists.map((l) => [l._id, l.definition.who] as const));
    const contacts = await contactsOf(ctx, organizationId);
    // A list you've worked is archived, not deleted, so no worked owner ends up on no list.
    if (contacts.some((c) => c.listIds.length === 1 && c.listIds[0] === listId && worthKeeping(c)))
      fail("LIST_WORKED", "You've worked owners on this list. Archive it instead: that keeps everything and tucks it away.");
    for (const c of contacts) {
      if (!c.listIds.includes(listId)) continue;
      const listIds = c.listIds.filter((id) => id !== listId);
      if (listIds.length === 0 && !worthKeeping(c)) {
        await ctx.db.delete(c._id);
        continue;
      }
      const kinds = [...new Set(listIds.map((id) => whoOf.get(id)).filter((w): w is Doc<"outreachLists">["definition"]["who"] => w !== undefined))];
      await ctx.db.patch(c._id, { listIds, kinds, updatedAt: nowIso() });
    }
    await ctx.db.delete(listId);
    return null;
  },
});

/**
 * Whether an owner holds work of the company's own, so it's kept even on no
 * list: a lead or client it became, a status or note someone set, a research
 * answer, or a real lookup paid for. Sample and simulated results are made up
 * and keep nothing.
 */
function worthKeeping(c: Doc<"outreachContacts">) {
  if (c.leadId || c.clientId) return true;
  // The sample filler's owners (marked by their note); a simulated cell is made up whatever it found.
  if (isSampleRun(c)) return false;
  if (c.status !== "new" || c.note?.trim() || c.research || c.followUpOn || (c.touches?.length ?? 0) > 0) return true;
  return Object.values(cellsOf(c)).some((cell) => cell?.status === "found" && !cell.simulated);
}

/**
 * One-off, run on deploy: owners left on no list that aren't worth keeping
 * (only sample or simulated results) are removed, as deleting their list now
 * does. Real lookups and owners sent to Leads stay. Safe to re-run; goes on in
 * the background until it has looked at every contact.
 */
export const clearLeftovers = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<{ removed: number; done: boolean }> => {
    const page = await ctx.db.query("outreachContacts").paginate({ cursor: cursor ?? null, numItems: 500 });
    let removed = 0;
    for (const c of page.page) {
      if (c.listIds.length > 0 || worthKeeping(c)) continue;
      await ctx.db.delete(c._id);
      removed++;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.outreach.clearLeftovers, { cursor: page.continueCursor });
    return { removed, done: page.isDone };
  },
});

/** Keeps the lists tidy: a new name, pinned to the top of the picker, or archived out of the way (its contacts stay). */
export const organizeList = mutation({
  args: { organizationId: v.id("organizations"), listId: v.id("outreachLists"), title: v.optional(v.string()), pinned: v.optional(v.boolean()), archived: v.optional(v.boolean()) },
  handler: async (ctx, { organizationId, listId, title, pinned, archived }) => {
    await requirePro(ctx, organizationId);
    const list = await ctx.db.get(listId);
    if (!list || list.organizationId !== organizationId) fail("NOT_FOUND", "No such list");
    const patch: Partial<Doc<"outreachLists">> = {};
    if (title !== undefined) {
      const t = title.trim().replace(/\s+/g, " ");
      if (!t) fail("INVALID", "Give the list a name");
      if (t.length > 120) fail("INVALID", "That name is too long (120 characters at most)");
      patch.title = t;
    }
    if (pinned !== undefined) patch.pinned = pinned || undefined;
    if (archived !== undefined) {
      patch.archivedAt = archived ? nowIso() : undefined;
      // An archived list isn't pinned.
      if (archived) patch.pinned = undefined;
    }
    await ctx.db.patch(listId, patch);
    return null;
  },
});

/**
 * One-off: the rows lists kept before contacts existed become contacts,
 * tagged with their list; a row's status and note come along. Safe to run
 * again; the deploy runs it until the table is empty: `npx convex run outreach:migrateRows`.
 */
export const migrateRows = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("outreachRows").take(200);
    let moved = 0;
    for (const r of rows) {
      const list = await ctx.db.get(r.listId);
      const now = nowIso();
      if (list) {
        const existing = await ctx.db
          .query("outreachContacts")
          .withIndex("by_organization_and_key", (q) => q.eq("organizationId", r.organizationId).eq("key", r.key))
          .unique();
        if (existing) {
          if (!existing.listIds.includes(r.listId)) {
            await ctx.db.patch(existing._id, {
              listIds: [...existing.listIds, r.listId],
              kinds: existing.kinds.includes(list.definition.who) ? existing.kinds : [...existing.kinds, list.definition.who],
              updatedAt: now,
            });
          }
        } else {
          await ctx.db.insert("outreachContacts", {
            organizationId: r.organizationId,
            key: r.key,
            name: r.name,
            company: r.company,
            mailing: r.mailing,
            property: r.property,
            properties: r.properties,
            totalValueCents: r.totalValueCents,
            why: r.why,
            kinds: [list.definition.who],
            listIds: [r.listId],
            status: r.status,
            note: r.note,
            createdAt: list.createdAt,
            updatedAt: r.updatedAt,
          });
        }
        moved++;
      }
      await ctx.db.delete(r._id);
    }
    if (rows.length === 200) await ctx.scheduler.runAfter(0, internal.outreach.migrateRows, {});
    return { moved, more: rows.length === 200 };
  },
});

// ---- Enriching contacts: the person behind a company, their phone and email ----

const FIELDS: Doc<"dataSourceStats">["field"][] = ["person", "phone", "email", "research"];

/**
 * Queues the stack for each contact and field, for an admin with the
 * balance to cover the phones. The charge (UNLOCK_CENTS) lands only when
 * a phone is found; emails, the person, a miss and a vendor error are
 * free. A field already found or running is skipped; person only applies
 * to company owners.
 */
export const enrich = mutation({
  args: {
    organizationId: v.id("organizations"),
    contactIds: v.array(v.id("outreachContacts")),
    fields: v.optional(v.array(outreachField)),
    /** For research: what to find out; the default question when left out. */
    question: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, contactIds, fields = ["person", "phone", "email"], question }) => {
    const { user, organization } = await requireMember(ctx, organizationId, "admin");
    if (!organization.plan || !planIsActive(organization.plan, Date.now())) fail("FORBIDDEN", "Outreach is part of the Pro plan");
    const jobs: Array<{ contact: Doc<"outreachContacts">; fields: Doc<"dataSourceStats">["field"][] }> = [];
    for (const id of new Set(contactIds)) {
      const c = await ctx.db.get(id);
      if (!c || c.organizationId !== organizationId) fail("NOT_FOUND", "No such contact");
      const cells = cellsOf(c);
      const open = FIELDS.filter((f) => fields.includes(f) && (f !== "person" || isCompany(c)) && cellFor(cells, f).status !== "found" && cellFor(cells, f).status !== "running");
      if (open.length) jobs.push({ contact: c, fields: open });
    }
    const phones = jobs.filter((j) => j.fields.includes("phone")).length;
    const answers = jobs.filter((j) => j.fields.includes("research")).length;
    const balance = organization.walletBalanceCents ?? 0;
    const cost = phones * UNLOCK_CENTS + answers * RESEARCH_CENTS;
    // Lookups still running are charged when they land, so what they could cost is spoken for already.
    const held = cost > 0 ? heldCents(await contactsOf(ctx, organizationId)) : 0;
    if (cost + held > balance) {
      const needs = [phones ? `${phones} ${phones === 1 ? "phone" : "phones"}` : "", answers ? `${answers} research ${answers === 1 ? "answer" : "answers"}` : ""].filter(Boolean).join(" and ");
      const free = held ? `${dollars(Math.max(0, balance - held))} available (${dollars(held)} held for lookups still running)` : `${dollars(balance)} available`;
      fail("INVALID", `Balance too low: ${dollars(cost)} needed for ${needs}, ${free}`);
    }
    const asked = question?.trim().slice(0, 300) || DEFAULT_RESEARCH_QUESTION;
    const now = nowIso();
    // Sister entities wait their turn: the first finds the person and the phone, the rest find the same person free and copy it.
    const place = new Map<string, number>();
    for (const { contact, fields: open } of jobs) {
      const family = isCompany(contact) && open.some((f) => f === "phone" || f === "email") ? familyKey(contact.name) : undefined;
      const turn = family ? (place.get(family) ?? 0) : 0;
      if (family) place.set(family, turn + 1);
      const delay = turn * FAMILY_STAGGER_MS;
      const cells = { ...cellsOf(contact) };
      for (const f of open) cells[f] = { status: "running", at: now, requestedBy: user._id };
      await ctx.db.patch(contact._id, { enrichment: cells, unlock: undefined, ...(open.includes("research") ? { researchQuestion: asked } : {}), updatedAt: now });
      await ctx.scheduler.runAfter(delay, internal.skipTrace.trace, { contactId: contact._id, fields: open });
      // The watchdog: should the lookup be killed before it writes anything, these cells still end up failed, with Retry.
      await ctx.scheduler.runAfter(delay + GIVE_UP_AFTER_MS, internal.outreach.giveUp, { contactId: contact._id, fields: open, at: now });
    }
    return { queued: jobs.length, costCents: cost, at: now };
  },
});

/** The most the company's running lookups can still charge: a phone or a research answer each, sample runs aside. */
function heldCents(contacts: Doc<"outreachContacts">[]) {
  let held = 0;
  for (const c of contacts) {
    if (isSampleRun(c)) continue;
    const cells = cellsOf(c);
    if (cells.phone.status === "running") held += UNLOCK_CENTS;
    if (cellFor(cells, "research").status === "running") held += RESEARCH_CENTS;
  }
  return held;
}

export const UNPAID_ERROR = "Found, but the balance ran out before it could be paid for. Add funds and look it up again.";

/** How long a sister entity's lookup waits behind the one before it in the same batch. */
export const FAMILY_STAGGER_MS = 90 * 1000;

/** How long a lookup may run before its cells are failed as taking too long (Convex stops the action itself at ten). */
export const GIVE_UP_AFTER_MS = 10 * 60 * 1000;
export const GIVE_UP_ERROR = `Took longer than ${GIVE_UP_AFTER_MS / 60_000} minutes and was stopped.`;

/**
 * Fails the cells of one request that are still running when the watchdog
 * fires. Only that request's cells (same start time): a newer request on
 * the same field is left to its own watchdog. Nothing is charged.
 */
export const giveUp = internalMutation({
  args: { contactId: v.id("outreachContacts"), fields: v.array(outreachField), at: v.string() },
  handler: async (ctx, { contactId, fields, at }) => {
    const c = await ctx.db.get(contactId);
    if (!c) return { failed: 0 };
    const cells = { ...cellsOf(c) };
    let failed = 0;
    for (const field of fields) {
      const cell = cellFor(cells, field);
      if (cell.status !== "running" || cell.at !== at) continue;
      cells[field] = { status: "failed", at: nowIso(), requestedBy: cell.requestedBy, error: GIVE_UP_ERROR };
      failed++;
    }
    if (failed) await ctx.db.patch(contactId, { enrichment: cells, ...(fields.includes("research") && cells.research?.status === "failed" ? { researchQuestion: undefined } : {}), updatedAt: nowIso() });
    return { failed };
  },
});

/** What the trace sends the sources: the owner, the person already known, both addresses, and which fields are still running. */
export const contactForTrace = internalQuery({
  args: { contactId: v.id("outreachContacts") },
  handler: async (ctx, { contactId }) => {
    const c = await ctx.db.get(contactId);
    if (!c) return null;
    const cells = cellsOf(c);
    const fields = FIELDS.filter((f) => cellFor(cells, f).status === "running");
    if (fields.length === 0) return null;
    return {
      name: c.name,
      company: c.company,
      person: c.person,
      ...(c.property ? { property: { address: c.property.address, city: title(COUNTY), state: "TX", zip: undefined as string | undefined } } : {}),
      mailing: c.mailing,
      // Addresses already on the contact: the mobile finder keys off one.
      emails: (c.emails ?? []).map((e) => e.email),
      fields,
      question: c.researchQuestion ?? DEFAULT_RESEARCH_QUESTION,
      properties: c.properties,
      // A sample owner reruns the sample chain: every source by name, nothing called, nothing charged.
      sample: isSampleRun(c),
    };
  },
});

/**
 * A running lookup's progress: the source it's asking now and the turns so
 * far, for the page to narrate. Only while that cell is still running; the
 * final answer replaces it.
 */
export const noteProgress = internalMutation({
  args: { contactId: v.id("outreachContacts"), field: outreachField, asking: v.optional(v.string()), tries: v.array(outreachTry) },
  handler: async (ctx, { contactId, field, asking, tries }) => {
    const c = await ctx.db.get(contactId);
    if (!c) return null;
    const cells = { ...cellsOf(c) };
    const cell = cellFor(cells, field);
    if (cell.status !== "running") return null;
    cells[field] = { ...cell, asking, tries };
    await ctx.db.patch(contactId, { enrichment: cells });
    return null;
  },
});

/**
 * A phone and email already found on another of the company's owners with
 * the same decision maker, for the trace to copy instead of paying again.
 * Same person by name is not enough on its own (two John Smiths): the
 * owners must also be one family, share a mailing address, or the person
 * the same address.
 */
export const sharedLookup = internalQuery({
  args: { contactId: v.id("outreachContacts"), person: outreachPerson },
  handler: async (ctx, { contactId, person }): Promise<{ from: string; phones: Doc<"outreachContacts">["phones"]; emails: Doc<"outreachContacts">["emails"] } | null> => {
    const me = await ctx.db.get(contactId);
    if (!me) return null;
    const family = me.company ? familyKey(me.name) : undefined;
    const mail = mailKey(me.mailing);
    const home = person.address?.trim().toUpperCase();
    for (const c of await contactsOf(ctx, me.organizationId)) {
      if (c._id === contactId || !c.person || !(c.phones?.length) || cellFor(cellsOf(c), "phone").status !== "found") continue;
      if (!samePerson(person, c.person)) continue;
      const tied =
        (family !== undefined && isCompany(c) && familyKey(c.name) === family) ||
        (mail !== undefined && mailKey(c.mailing) === mail) ||
        (home !== undefined && c.person.address?.trim().toUpperCase() === home);
      if (tied) return { from: c.name, phones: c.phones, emails: c.emails };
    }
    return null;
  },
});

const ENTITY_WORDS = /\b(LLC|L L C|INC|LTD|LP|LLP|CORP|CORPORATION|COMPANY|CO|TRUST|HOLDINGS?|PROPERTIES|INVESTMENTS?|PARTNERS?|GROUP|ESTATE|CHURCH|CITY|COUNTY|BANK)\b/i;
const PO_BOX = /\b(P\.?\s?O\.?\s?BOX|BOX)\b/i;
const titleWords = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/**
 * The person who owns the home a company's mail goes to, from the roll
 * itself: when an LLC gets its tax bill at a Midland street address and
 * that address is a home on the roll owned by a person, that person is
 * almost always who runs the LLC. Free, and the first thing tried.
 */
export const homeAt = internalQuery({
  args: { address: v.optional(v.string()), city: v.optional(v.string()), zip: v.optional(v.string()) },
  handler: async (ctx, { address, city }): Promise<{ person: Person; home: string } | { why: string }> => {
    if (!address || !/^\d/.test(address.trim()) || PO_BOX.test(address)) return { why: "The mail doesn't go to a street address" };
    if (city && city.trim().toUpperCase() !== COUNTY.toUpperCase()) return { why: `The mail goes to ${titleWords(city.trim())}, off the roll` };
    const key = addressKey(address);
    const homes = (await ctx.db.query("parcels").withIndex("by_county_and_address_key", (q) => q.eq("county", COUNTY).eq("addressKey", key)).take(10)).filter(
      (p) => !p.companyOwned && !ENTITY_WORDS.test(p.owner),
    );
    if (homes.length === 0) return { why: "No home owned by a person at the mailing address" };
    const home = homes.find((p) => p.ownerOccupied) ?? homes[0];
    const who = splitName(home.owner);
    if (!who.first || !who.last) return { why: "No home owned by a person at the mailing address" };
    return {
      person: { name: titleWords(`${who.first} ${who.last}`), title: "Owns the home the mail goes to", address: `${titleWords(home.siteAddress)}, ${titleWords(COUNTY)}, TX`, source: "roll" },
      home: home.siteAddress,
    };
  },
});

/**
 * What the city's permits at a company's property say about the company
 * itself: the applicant or owner contact on a permit the company pulled
 * names a person, often with a phone and email. Contractors on the same
 * permit are other companies and are left out.
 */
export const permitContactsAt = internalQuery({
  args: { address: v.string(), company: v.string() },
  handler: async (ctx, { address, company }): Promise<{ found: Found; permits: number; matched: number }> => {
    const permits = await ctx.db.query("permits").withIndex("by_county_and_address_key", (q) => q.eq("county", COUNTY).eq("addressKey", addressKey(address))).take(50);
    const wanted = companyKey(company);
    const found: Found = { phones: [], emails: [] };
    let matched = 0;
    for (const permit of permits) {
      for (const c of permit.contacts ?? []) {
        if (!wanted || companyKey(c.company) !== wanted) continue;
        matched++;
        if (c.person && !found.person) {
          const who = splitName(c.person, "person");
          if (who.first && who.last) found.person = { name: titleWords(`${who.first} ${who.last}`), title: c.role ? `${titleWords(c.role)} on permit ${permit.permitNumber}` : undefined, source: "permits" };
        }
        const digits = (c.phone ?? "").replace(/\D/g, "");
        const number = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
        if (number.length === 10) found.phones!.push({ number, type: "unknown", line: "work", source: "permits" });
        if (c.email && c.email.includes("@")) found.emails!.push({ email: c.email.trim().toLowerCase(), source: "permits" });
      }
    }
    return { found, permits: permits.length, matched };
  },
});

/** One field's answer from the stack: what was found and by whom (a phone is charged), nothing (free), or an error (free). */
export const recordEnrichment = internalMutation({
  args: {
    contactId: v.id("outreachContacts"),
    field: outreachField,
    source: v.optional(v.string()),
    phones: v.optional(v.array(outreachPhone)),
    emails: v.optional(v.array(outreachEmail)),
    person: v.optional(outreachPerson),
    research: v.optional(outreachResearch),
    error: v.optional(v.string()),
    tries: v.optional(v.array(outreachTry)),
    /** From the simulated chain (no phone source connected yet): kept apart, never charged. */
    simulated: v.optional(v.boolean()),
  },
  handler: async (ctx, { contactId, field, source, phones = [], emails = [], person, research, error, tries, simulated }) => {
    const c = await ctx.db.get(contactId);
    if (!c) return null;
    const cells = { ...cellsOf(c) };
    if (cellFor(cells, field).status !== "running") return null;
    const now = nowIso();
    const requestedBy = cellFor(cells, field).requestedBy;
    const found = field === "phone" ? phones.length > 0 : field === "email" ? emails.length > 0 : field === "person" ? Boolean(person) : Boolean(research);
    // Copied from a related owner with the same decision maker (already paid for there), or a sample run: no charge, no scorecard.
    const shared = source === "shared" || isSampleRun(c) || Boolean(simulated);
    const mark = simulated ? { simulated: true } : {};
    const price = shared ? 0 : field === "phone" ? UNLOCK_CENTS : field === "research" ? RESEARCH_CENTS : 0;
    let chargedCents = 0;
    let unpaid = false;
    if (found && price > 0 && requestedBy) {
      try {
        await postTransaction(ctx, c.organizationId, {
          type: "unlock",
          amountCents: -price,
          createdBy: requestedBy,
          contactId,
          note: field === "research" ? `Research on ${c.name}` : `Phone for ${c.name}${source ? ` via ${sourceLabel(source)}` : ""}`,
        });
        chargedCents = price;
      } catch {
        // Spent elsewhere since the request (the hold only covers other lookups): what was found isn't handed over unpaid.
        unpaid = true;
      }
    }
    const kept = found && !unpaid;
    cells[field] = unpaid
      ? { status: "failed", at: now, requestedBy, source, error: UNPAID_ERROR, tries, ...mark }
      : found
        ? { status: "found", at: now, requestedBy, source, chargedCents: price > 0 || (shared && field === "phone") ? chargedCents : undefined, tries, ...mark }
        : error
          ? { status: "failed", at: now, requestedBy, error, tries, ...mark }
          : { status: "none", at: now, requestedBy, source, tries, ...mark };
    await ctx.db.patch(contactId, {
      enrichment: cells,
      ...(field === "phone" && kept ? { phones } : {}),
      ...(field === "email" && kept ? { emails } : {}),
      ...(field === "person" && kept ? { person } : {}),
      ...(field === "research" ? { research: kept ? research : c.research, researchQuestion: undefined } : {}),
      updatedAt: now,
    });
    // The stack's own scorecard: an attempt per source asked, a hit for the one that answered.
    if (!shared && (source || !error)) await bumpStat(ctx, c.organizationId, source ?? "none", field, found, chargedCents, now);
    if (tries && !shared) await noteProblems(ctx, c.organizationId, field, tries, now);
    return null;
  },
});

/**
 * A source whose answer was a refused key or an empty account is flagged on
 * its scorecard row for the Sources page; a proper answer later (a hit or
 * a miss) clears the flag.
 */
async function noteProblems(ctx: MutationCtx, organizationId: Id<"organizations">, field: Doc<"dataSourceStats">["field"], tries: Array<{ source: string; outcome: string; note?: string }>, now: string) {
  for (const t of tries) {
    const trouble = t.outcome === "error" && needsAttention(t.note);
    const fine = t.outcome === "hit" || t.outcome === "miss";
    if (!trouble && !fine) continue;
    const row = await ctx.db
      .query("dataSourceStats")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId).eq("source", t.source).eq("field", field))
      .unique();
    if (trouble) {
      if (row) await ctx.db.patch(row._id, { problem: t.note, problemAt: now });
      else await ctx.db.insert("dataSourceStats", { organizationId, source: t.source, field, attempts: 0, hits: 0, chargedCents: 0, lastAt: now, problem: t.note, problemAt: now });
    } else if (row?.problem) {
      await ctx.db.patch(row._id, { problem: undefined, problemAt: undefined });
    }
  }
}

/** One more attempt (and maybe a hit) on a source's row of the scorecard. */
async function bumpStat(ctx: MutationCtx, organizationId: Id<"organizations">, source: string, field: Doc<"dataSourceStats">["field"], hit: boolean, chargedCents: number, now: string) {
  const row = await ctx.db
    .query("dataSourceStats")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId).eq("source", source).eq("field", field))
    .unique();
  if (row) await ctx.db.patch(row._id, { attempts: row.attempts + 1, hits: row.hits + (hit ? 1 : 0), chargedCents: row.chargedCents + chargedCents, lastAt: now });
  else await ctx.db.insert("dataSourceStats", { organizationId, source, field, attempts: 1, hits: hit ? 1 : 0, chargedCents, lastAt: now });
}

/** A checker's turn on the scorecard: the deliverability check counts as an attempt, a deliverable address as a hit. */
export const recordCheck = internalMutation({
  args: { contactId: v.id("outreachContacts"), source: v.string(), field: outreachField, hit: v.boolean() },
  handler: async (ctx, { contactId, source, field, hit }) => {
    const c = await ctx.db.get(contactId);
    if (c) await bumpStat(ctx, c.organizationId, source, field, hit, 0, nowIso());
    return null;
  },
});

/** "batchdata" → "BatchData", "tx-comptroller" → "Texas Comptroller". */
export const sourceLabel = (s: string) =>
  ({
    roll: "Appraisal roll",
    permits: "City permits",
    batchdata: "BatchData",
    tracerfy: "Tracerfy",
    enformion: "EnformionGO",
    hunter: "Hunter",
    leadmagic: "LeadMagic",
    "leadmagic-mobile": "LeadMagic mobile finder",
    "tx-comptroller": "Texas Comptroller",
    cobalt: "State registry (Cobalt)",
    zerobounce: "ZeroBounce",
    twilio: "Twilio line check",
    trestle: "Trestle contact check",
    "tracerfy-dnc": "Tracerfy DNC scrub",
    claude: "Claude, from the web",
    shared: "A related owner (no charge)",
  })[s] ?? s;

/**
 * One-off: contacts unlocked before per-field cells existed get their
 * cells; the deploy runs it until none is left: `npx convex run outreach:migrateUnlocks`.
 */
export const migrateUnlocks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("outreachContacts").take(500)).filter((c) => c.unlock && !c.enrichment);
    for (const c of rows) {
      await ctx.db.patch(c._id, {
        enrichment: cellsOf(c),
        phones: (c.phones ?? []).map((p) => ({ ...p, type: p.type ?? "unknown" })),
        unlock: undefined,
      });
    }
    return { moved: rows.length };
  },
});

/** The note a sample owner carries, and what clearSample looks for. */

/**
 * One-off, for a look at the finished layout before any source key is
 * set: fills one of a company's owners with sample data (the person
 * behind the company, two ranked phones, an email, a research answer and
 * the ledger), marked by its note. Nothing is charged. `clear` takes it
 * back out, and only from an owner carrying that note.
 * `npx convex run outreach:seedSample '{"email":"owner@example.com"}'`
 */
export const seedSample = internalMutation({
  args: { email: v.optional(v.string()), organization: v.optional(v.string()), name: v.optional(v.string()), clear: v.optional(v.boolean()) },
  handler: async (ctx, { email, organization: orgName, name = "1788 Development LLC", clear }) => {
    // The companies to look in: the user's, then any whose name holds the word given.
    const candidates: Id<"organizations">[] = [];
    let user: Doc<"users"> | null = null;
    if (email) {
      user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique();
      if (!user) return { done: false, reason: "no user" };
      candidates.push(...(await organizationIdsFor(ctx, user._id)));
    }
    if (orgName) {
      const all = await ctx.db.query("organizations").take(2000);
      for (const o of all) if (o.name.toLowerCase().includes(orgName.toLowerCase()) && !candidates.includes(o._id)) candidates.push(o._id);
    }
    const seen: Array<{ organization: string; contacts: number }> = [];
    for (const organizationId of candidates) {
      const organization = await ctx.db.get(organizationId);
      const rows = await contactsOf(ctx, organizationId);
      if (organization) seen.push({ organization: organization.name, contacts: rows.length });
      const contact = rows.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? rows.find((c) => c.company);
      if (!organization || !contact) continue;
      const now = nowIso();
      if (clear) {
        if (!contact.note?.startsWith("Sample")) return { done: false, reason: "not a sample", organization: organization.name, contact: contact.name };
        await ctx.db.patch(contact._id, {
          enrichment: { phone: LOCKED, email: LOCKED, person: LOCKED, research: LOCKED },
          person: undefined,
          phones: undefined,
          emails: undefined,
          research: undefined,
          note: undefined,
          updatedAt: now,
        });
        return { done: true, cleared: true, organization: organization.name, contact: contact.name };
      }
      if (contact.note?.startsWith("Sample")) return { done: true, already: true, organization: organization.name, contact: contact.name };
      const found = (source: string, extra: Partial<Cell> = {}): Cell => ({ status: "found", at: now, requestedBy: user?._id, source, ...extra });
      const person = { name: "Mark Ellison", title: "Managing member", source: "tx-comptroller" };
      await ctx.db.patch(contact._id, {
        person,
        phones: [
          { number: "4325550142", type: "mobile", verified: true, score: 95, source: "tracerfy" },
          { number: "4325550199", type: "landline", dnc: true, score: 60, source: "tracerfy" },
        ],
        emails: [{ email: "mark.ellison@example.com", source: "tracerfy", verified: true }],
        research: {
          question: DEFAULT_RESEARCH_QUESTION,
          answer: `Sample: ${contact.name} is a Midland developer building spec homes on the west side, run by ${person.name}. A plat for 12 lots was filed in August 2026, and a site-work permit followed in October.`,
          sources: [{ title: "Midland P&Z agenda, Aug 2026 (sample)", url: "https://example.com/midland-pz-agenda" }],
          at: now,
        },
        enrichment: {
          person: found("tx-comptroller", { tries: [{ source: "tx-comptroller", outcome: "hit", note: `${person.name}, ${person.title}` }] }),
          phone: found("tracerfy", {
            chargedCents: UNLOCK_CENTS,
            tries: [
              { source: "batchdata", outcome: "miss", note: "No match" },
              { source: "tracerfy", outcome: "hit", note: "2 numbers" },
            ],
          }),
          email: found("tracerfy", {
            tries: [
              { source: "batchdata", outcome: "miss", note: "No match" },
              { source: "tracerfy", outcome: "hit", note: "1 email" },
            ],
          }),
          research: found("claude", { chargedCents: RESEARCH_CENTS, tries: [{ source: "claude", outcome: "hit", note: "2 pages read" }] }),
        },
        note: SAMPLE_NOTE,
        updatedAt: now,
      });
      return { done: true, organization: organization.name, contact: contact.name };
    }
    return { done: false, reason: "no contact", seen };
  },
});

/** An owner the sample filler marked: reruns walk the sample chain and cost nothing. Only the mark counts here. */
const isSampleRun = (c: Doc<"outreachContacts">) => Boolean(c.note?.startsWith("Sample"));
/** An owner filled by the sample filler: its note, or its 555-01xx numbers or example.com addresses, say so. */
const isSample = (c: Doc<"outreachContacts">) =>
  Boolean(c.note?.startsWith("Sample")) ||
  (c.phones ?? []).some((p) => isSampleNumber(p.number)) ||
  (c.emails ?? []).some((e) => e.email.endsWith("example.com")) ||
  Object.values(cellsOf(c)).some((cell) => cell?.simulated);

/**
 * Fills a list's first owners (in the list's own order) with sample results,
 * as a run with every key set would leave them, to see and use the page
 * before the keys are in. Owners with real results are left alone; sister
 * entities copy the first one's phone, as the shared lookup does. Nothing is
 * charged. `clear` resets every sample-marked owner of the company to locked.
 * Run it from the deploy workflow:
 * `outreach:seedSampleList {"email":"…","list":"company investors","count":40}`.
 */
export const seedSampleList = internalMutation({
  args: { email: v.optional(v.string()), organization: v.optional(v.string()), list: v.optional(v.string()), count: v.optional(v.number()), clear: v.optional(v.boolean()) },
  handler: async (ctx, { email, organization: orgName, list: wanted = "company investors", count = 40, clear }) => {
    const candidates: Id<"organizations">[] = [];
    let user: Doc<"users"> | null = null;
    if (email) {
      user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique();
      if (!user) return { done: false, reason: "no user" };
      candidates.push(...(await organizationIdsFor(ctx, user._id)));
    }
    if (orgName) {
      for await (const o of ctx.db.query("organizations")) if (o.name.toLowerCase().includes(orgName.toLowerCase()) && !candidates.includes(o._id)) candidates.push(o._id);
    }
    // What was looked at, so a miss says where it looked.
    const seen: Array<{ organization: string; lists: string[]; contacts: number }> = [];
    for (const organizationId of candidates) {
      const organization = await ctx.db.get(organizationId);
      if (!organization) continue;
      const contacts = await contactsOf(ctx, organizationId);
      const now = nowIso();
      if (clear) {
        let cleared = 0;
        for (const c of contacts.filter(isSample)) {
          await ctx.db.patch(c._id, {
            enrichment: { phone: LOCKED, email: LOCKED, person: LOCKED, research: LOCKED },
            person: undefined,
            phones: undefined,
            emails: undefined,
            research: undefined,
            note: c.note?.startsWith("Sample") ? undefined : c.note,
            updatedAt: now,
          });
          cleared++;
        }
        if (cleared) return { done: true, cleared, organization: organization.name };
        continue;
      }
      const lists = (await ctx.db.query("outreachLists").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const list = lists.find((l) => l.title.toLowerCase().includes(wanted.toLowerCase())) ?? lists[0];
      seen.push({ organization: organization.name, lists: lists.map((l) => l.title), contacts: contacts.length });
      if (!list) continue;
      const order = listOrder(list.definition);
      const members = contacts.filter((c) => c.listIds.includes(list._id)).sort((a, b) => order.key(b) - order.key(a) || a.name.localeCompare(b.name));
      const untouched = (c: Doc<"outreachContacts">) => isSample(c) || Object.values(cellsOf(c)).every((cell) => cell.status === "locked");
      const families = new Map<string, Doc<"outreachContacts">>();
      let filled = 0;
      let shared = 0;
      for (const c of members) {
        if (filled >= Math.min(SAMPLE_MAX, Math.max(1, count))) break;
        if (!untouched(c)) continue;
        const at = new Date(Date.now() - filled * 7 * 60_000).toISOString();
        const family = isCompany(c) ? familyKey(c.name) : undefined;
        const sister = family ? families.get(family) : undefined;
        const s = sampleFor(filled, { name: c.name, company: isCompany(c), properties: c.properties }, at);
        const cell = (x: (typeof s.cells)["phone"]): Cell => (x.status === "locked" ? LOCKED : { ...x, requestedBy: user?._id });
        if (sister?.person && sister.phones?.length) {
          // The same manager as a sister entity: the phone and email copied free, as the shared lookup does.
          const note = `Same decision maker as ${sister.name}; copied, no charge`;
          const copied = (field: "phone" | "email"): Cell => ({ status: "found", at, requestedBy: user?._id, source: "shared", chargedCents: field === "phone" ? 0 : undefined, tries: [{ source: "shared", outcome: "hit", note }] });
          await ctx.db.patch(c._id, {
            person: sister.person,
            phones: sister.phones,
            emails: sister.emails,
            research: undefined,
            enrichment: {
              person: { status: "found", at, requestedBy: user?._id, source: sister.person.source, tries: [{ source: sister.person.source, outcome: "hit", note: `${sister.person.name}, ${sister.person.title ?? "Officer"}` }] },
              phone: copied("phone"),
              email: sister.emails?.length ? copied("email") : { status: "none", at, requestedBy: user?._id, tries: [{ source: "shared", outcome: "miss", note: "None on the sister entity" }] },
              research: LOCKED,
            },
            note: SAMPLE_NOTE,
            updatedAt: now,
          });
          shared++;
        } else {
          await ctx.db.patch(c._id, {
            person: s.person,
            phones: s.phones,
            emails: s.emails,
            research: s.research,
            enrichment: { person: cell(s.cells.person), phone: cell(s.cells.phone), email: cell(s.cells.email), research: cell(s.cells.research) },
            note: SAMPLE_NOTE,
            updatedAt: now,
          });
          if (family && s.person && s.phones?.length) families.set(family, { ...c, person: s.person, phones: s.phones, emails: s.emails });
        }
        filled++;
      }
      return { done: true, organization: organization.name, list: list.title, filled, shared };
    }
    return { done: false, reason: clear ? "nothing to clear" : "no list", seen };
  },
});

// ---- Asking in plain words ----

const INTERPRET_SYSTEM = `You turn a contractor's plain-English ask into a list definition over the Midland County, Texas appraisal roll, so they can mail or visit the people on it.

What the roll holds, per parcel: the owner's name, their mailing address, the property's address, its appraised value, its use code (A: homes; B: apartments and duplexes; F1: commercial buildings such as shops, offices and shopping centers; F2: industrial such as warehouses), the deed date, whether the owner lives there, and whether the owner is a company.
What it does NOT hold: phone numbers, emails, occupations, income, age, religion, ethnicity, credit, or anything else about the person. Only Midland County exists.

${WHO_GUIDE}

Answer with kind "list" and a definition when the ask maps to one who, even loosely ("rich people" → wealthy; "apartment complexes" → multifamily; "strip malls" → commercial; "landlords" → investor). Use min_value only when a dollar amount is asked for or implied ("over $2M", "luxury" → 1500000); use streets or zips only when a street or zip is named; set use_codes ["F2"] for warehouses or industrial. Give a title of 50 characters or fewer, like "Shopping center owners, Midland" or "Homes over $2M, Midland". The explanation is one sentence on what the list is and what it leaves out (no phones; LLC names rather than people where a company owns it).

Answer with kind "cannot" when the ask needs what the roll doesn't hold (a job, an income, an age, a business's customers, another county, a person by name) or isn't about property owners at all. Say in one sentence why, and give closest: the nearest list that can be made (usually wealthy homeowners by value, or commercial owners) with its own title.`;

type Interpreted =
  | { ok: true; definition: Definition; title: string; explanation: string; note?: string; count: number; total: number; truncated: boolean; limited: boolean; preview: ListRow[] }
  | { ok: false; explanation: string; suggestion?: { definition: Definition; title: string } };

/** "shopping center owners in Midland" → a definition, with the count and a first look. */
export const interpret = action({
  args: { organizationId: v.id("organizations"), request: v.string() },
  handler: async (ctx, { organizationId, request }): Promise<Interpreted> => {
    const { staff } = await ctx.runQuery(internal.outreach.assertPro, { organizationId });
    const ask = request.trim().slice(0, 500);
    if (!ask) return { ok: false, explanation: "Say who you want to reach, like shopping center owners or homes over $1M." };
    // Without the assistant (no key, or it couldn't answer), the words alone decide, for the common asks. Staff see why.
    const fromWords = async (why: string): Promise<Interpreted> => {
      const guess = guessDefinition(ask);
      if (!guess) {
        return {
          ok: false,
          explanation: `${why.replace(/:.*$/, "").replace(/,$/, "")}. Until it is, say one of: shopping center owners, investors, property managers, apartment owners, homes over $1M, recent buyers, absentee owners.`,
        };
      }
      const built: { count: number; total: number; truncated: boolean; limited: boolean; rows: ListRow[] } = await ctx.runQuery(internal.outreach.previewInternal, {
        organizationId,
        definition: guess.definition,
      });
      return {
        ok: true,
        definition: guess.definition,
        title: guess.title,
        explanation: `${guess.title.replace(/, Midland$/, "")}. Names and mailing addresses; no phone numbers.`,
        ...(staff ? { note: `${why} so the words alone picked this list.` } : {}),
        count: built.count,
        total: built.total,
        truncated: built.truncated,
        limited: built.limited,
        preview: built.rows,
      };
    };
    if (!process.env.ANTHROPIC_API_KEY) return await fromWords("The assistant isn't connected: the Convex deployment has no Anthropic key,");
    let parsed: Record<string, unknown>;
    try {
      const response = await callClaude({
        max_tokens: 1024,
        output_config: { effort: "low", format: { type: "json_schema", schema: OUTREACH_INPUT_SCHEMA } },
        system: [{ type: "text", text: INTERPRET_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: ask }],
      });
      if (response.stop_reason === "refusal") return { ok: false, explanation: "That isn't a list I can make. Try who you want to reach, like commercial owners." };
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text as string)
        .join("");
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return await fromWords("The assistant couldn't answer just now,");
    }
    const toDefinition = (raw: unknown) => definitionFromArgs((raw ?? {}) as Record<string, unknown>);
    const titleOf = (raw: unknown, def: Definition) => (typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 50) : defaultTitle(def));
    const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    if (parsed.kind !== "list") {
      let suggestion: { definition: Definition; title: string } | undefined;
      const closest = parsed.closest as { definition?: unknown; title?: unknown } | undefined;
      try {
        if (closest?.definition) {
          const definition = toDefinition(closest.definition);
          suggestion = { definition, title: titleOf(closest.title, definition) };
        }
      } catch {
        suggestion = undefined;
      }
      return { ok: false, explanation: explanation || "That isn't something the appraisal roll can tell us.", suggestion };
    }
    let definition: Definition;
    try {
      definition = toDefinition(parsed.definition);
    } catch (e) {
      return { ok: false, explanation: e instanceof Error ? e.message : "That didn't make a list." };
    }
    const built: { count: number; total: number; truncated: boolean; limited: boolean; rows: ListRow[] } = await ctx.runQuery(internal.outreach.previewInternal, {
      organizationId,
      definition,
    });
    return {
      ok: true,
      definition,
      title: titleOf(parsed.title, definition),
      explanation: explanation || `${built.count} on the roll.`,
      count: built.count,
      total: built.total,
      truncated: built.truncated,
      limited: built.limited,
      preview: built.rows,
    };
  },
});

/** For staff: when the owners were last rebuilt, from how many parcels, and when the daily records pass last ran. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const [sync, refresh] = await Promise.all([
      ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", OWNERS_SOURCE)).unique(),
      ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", REFRESH_SOURCE)).unique(),
    ]);
    if (!sync) return null;
    return {
      syncedAt: sync.syncedAt,
      parcels: sync.fetched,
      owners: sync.added + sync.updated,
      error: sync.error,
      // The daily pass, when it has run since the build: its time, how many owners it touched, or why it failed.
      ...(refresh && refresh.syncedAt > sync.syncedAt ? { records: { at: refresh.syncedAt, touched: refresh.updated, error: refresh.error } } : {}),
    };
  },
});

/**
 * One-off, to start Outreach over for a company: every list and every owner
 * pulled into it are removed. Leads already sent stay on the Leads page; the
 * county roll is untouched, so new lists pull owners again. Without
 * `confirm` it only reports what it would remove. `organization` is a word
 * of the company's name and must match one company.
 * `outreach:startOver {"organization":"…","confirm":true}`
 */
export const startOver = internalMutation({
  args: { organization: v.string(), confirm: v.optional(v.boolean()) },
  handler: async (ctx, { organization, confirm }) => {
    const word = organization.trim().toLowerCase();
    if (!word) return { done: false, reason: "name a company" };
    const all = await ctx.db.query("organizations").take(2000);
    const exact = all.filter((o) => o.name.trim().toLowerCase() === word);
    const hits = exact.length ? exact : all.filter((o) => o.name.toLowerCase().includes(word));
    const matches = [];
    for (const o of hits) {
      const lists = await ctx.db.query("outreachLists").withIndex("by_organization", (q) => q.eq("organizationId", o._id)).collect();
      const owners = await contactsOf(ctx, o._id);
      matches.push({ organization: o.name, lists: lists.length, owners: owners.length, sentToLeads: owners.filter((c) => c.leadId).length });
    }
    if (!confirm) return { done: false, dryRun: true, matches };
    if (hits.length !== 1) return { done: false, reason: `${hits.length} companies match; give more of the name`, matches };
    const organizationId = hits[0]._id;
    for (const l of await ctx.db.query("outreachLists").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()) await ctx.db.delete(l._id);
    await ctx.scheduler.runAfter(0, internal.outreach.clearOwnersOf, { organizationId });
    return { done: true, removed: matches[0] };
  },
});

/** startOver's owners, a page at a time until none are left. */
export const clearOwnersOf = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const page = await ctx.db.query("outreachContacts").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(1000);
    for (const c of page) await ctx.db.delete(c._id);
    if (page.length === 1000) await ctx.scheduler.runAfter(0, internal.outreach.clearOwnersOf, { organizationId });
    return { removed: page.length };
  },
});
