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
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { outreachDefinition, outreachRowStatus } from "./schema";
import { fail, nowIso, requireMember, requireStaff } from "./lib/access";
import { mutationDef, queryDef } from "./lib/actor";
import { callClaude } from "./lib/claude";
import {
  DEFAULT_ROWS,
  MAX_ROWS,
  OUTREACH_INPUT_SCHEMA,
  WEALTHY_DEFAULT_CENTS,
  WHO_GUIDE,
  defaultTitle,
  definitionFromArgs,
  facetFor,
  guessDefinition,
  facetValue,
  OwnerGrouper,
  matches,
  propertyFor,
  why,
  type Condensed,
  type Definition,
  type Facet,
  type OwnerRow,
} from "./lib/outreach";
import { MIDLAND_PARCELS } from "./lib/parcels";
import { planIsActive } from "./lib/plan";

const COUNTY = MIDLAND_PARCELS.county;
export const OWNERS_SOURCE = "midland-owners";
/** How many facet rows one list build reads: past this the list is cut and says so. */
export const SCAN = 3000;
const PAGE = 2000;
const UPSERT_BATCH = 200;
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

const ownerRow = v.object({
  key: v.string(),
  kind: v.union(v.literal("owner"), v.literal("office")),
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
  useCodes: v.array(v.string()),
  streets: v.array(v.string()),
  tops: v.record(v.string(), v.object({ parcelId: v.id("parcels"), address: v.string(), useCode: v.string(), valueCents: v.optional(v.number()) })),
  owners: v.optional(v.number()),
});
const facetRow = v.object({ facet: v.string(), sort: v.number() });

const OWNER_KEYS = [
  "kind", "name", "company", "parcels", "residential", "multifamily", "commercial", "totalValueCents", "maxValueCents",
  "homeValueCents", "rentalValueCents", "commercialValueCents", "multifamilyValueCents", "ownerOccupied", "outOfState", "latestDeed", "owners",
] as const;
const sameOwner = (a: Doc<"owners">, b: OwnerRow) =>
  OWNER_KEYS.every((k) => (a[k] ?? undefined) === (b[k] ?? undefined)) &&
  JSON.stringify([a.mailing, a.useCodes, a.streets, a.tops]) === JSON.stringify([b.mailing, b.useCodes, b.streets, b.tops]);

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
      const old = await ctx.db.query("ownerFacets").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
      const same =
        old.length === facets.length && facets.every((f) => old.some((o) => o.facet === f.facet && o.sort === f.sort));
      if (same) for (const o of old) await ctx.db.patch(o._id, { buildId });
      else {
        for (const o of old) await ctx.db.delete(o._id);
        for (const f of facets) await ctx.db.insert("ownerFacets", { county: COUNTY, facet: f.facet, ownerId, sort: f.sort, buildId });
      }
    }
    return { added, updated };
  },
});

/** Drops owners (and their facets) that this build didn't write: no longer on the roll. Pages itself. */
export const dropStale = internalMutation({
  args: { buildId: v.string() },
  handler: async (ctx, { buildId }) => {
    // Every build id but this one, from either side of it on the index.
    const before = await ctx.db
      .query("owners")
      .withIndex("by_county_and_build", (q) => q.eq("county", COUNTY).lt("buildId", buildId))
      .take(DROP_BATCH);
    const after =
      before.length < DROP_BATCH
        ? await ctx.db
            .query("owners")
            .withIndex("by_county_and_build", (q) => q.eq("county", COUNTY).gt("buildId", buildId))
            .take(DROP_BATCH - before.length)
        : [];
    const stale = [...before, ...after];
    for (const o of stale) {
      for (const f of await ctx.db.query("ownerFacets").withIndex("by_owner", (q) => q.eq("ownerId", o._id)).collect()) await ctx.db.delete(f._id);
      await ctx.db.delete(o._id);
    }
    if (stale.length === DROP_BATCH) await ctx.scheduler.runAfter(0, internal.outreach.dropStale, { buildId });
  },
});

/** Reads the whole roll, groups it, writes the owners and drops the ones gone. Records how it went under OWNERS_SOURCE. */
async function rebuildOwners(ctx: ActionCtx) {
  let fetched = 0;
  let added = 0;
  let updated = 0;
  let error: string | undefined;
  try {
    // A page at a time into the grouper, which keeps totals, not parcels: the roll never sits in memory whole.
    const grouper = new OwnerGrouper();
    let cursor: string | undefined;
    for (;;) {
      const page: { rows: Condensed[]; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.outreach.parcelPage, { cursor });
      grouper.addAll(page.rows);
      fetched += page.rows.length;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    const { owners, facets } = grouper.finish(Date.now());
    // Unique even when two builds share a millisecond: stale rows are the ones with any other id.
    const buildId = `${nowIso()}|${Math.random().toString(36).slice(2, 8)}`;
    for (let i = 0; i < owners.length; i += UPSERT_BATCH) {
      const batch = owners.slice(i, i + UPSERT_BATCH).map((owner) => ({ owner, facets: facets.get(owner.key) ?? [] }));
      const result: { added: number; updated: number } = await ctx.runMutation(internal.outreach.upsertOwners, { rows: batch, buildId });
      added += result.added;
      updated += result.updated;
    }
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
 * is newer than the roll: `npx convex run outreach:rebuild '{"ifStale":true}'`.
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

/** "Rebuild owners" on the Ops sources card, and the first run after deploy: `npx convex run outreach:rebuildNow`. */
export const rebuildNow = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.permits.assertStaff, {});
    return await rebuildOwners(ctx);
  },
});

// ---- Building a list ----

export type ListRow = {
  key: string;
  name: string;
  company?: string;
  mailing: Doc<"owners">["mailing"];
  property: Doc<"outreachRows">["property"];
  properties: number;
  totalValueCents: number;
  why: string;
};

const rowOf = (o: Doc<"owners">, facet: Facet): ListRow | null => {
  const p = propertyFor(o as unknown as OwnerRow, facet) ?? o.tops.all;
  if (!p) return null;
  return {
    key: o.key,
    name: o.name,
    company: o.company ? o.name : undefined,
    mailing: o.mailing,
    property: { parcelId: p.parcelId as Id<"parcels">, address: title(p.address), useCode: p.useCode, valueCents: p.valueCents },
    properties: o.parcels,
    totalValueCents: o.totalValueCents,
    why: why(o as unknown as OwnerRow, facet),
  };
};

/**
 * The rows a definition picks: its facet read top-down by what it's sorted
 * on, filtered in memory, until the limit. `truncated` means the scan cap
 * was hit with rows unread: narrow the list to see everyone.
 */
export async function buildRows(ctx: QueryCtx | MutationCtx, def: Definition) {
  let facet: Facet;
  try {
    facet = facetFor(def);
  } catch (e) {
    fail("INVALID", e instanceof Error ? e.message : String(e));
  }
  const limit = Math.min(MAX_ROWS, Math.max(1, def.limit ?? DEFAULT_ROWS));
  const now = Date.now();
  const facetRows = await ctx.db
    .query("ownerFacets")
    .withIndex("by_facet_and_sort", (q) => q.eq("county", def.county).eq("facet", facet))
    .order("desc")
    .take(SCAN);
  const valueSorted = facet !== "investor" && facet !== "office" && facet !== "buyer";
  const minValue = def.minValueCents ?? (def.who === "wealthy" ? WEALTHY_DEFAULT_CENTS : undefined);
  const rows: ListRow[] = [];
  let stopped = false;
  for (const f of facetRows) {
    if (rows.length >= limit) {
      stopped = true;
      break;
    }
    const owner = await ctx.db.get(f.ownerId);
    if (!owner) continue;
    // Sorted by value, so once a row is under the floor every row after it is too.
    if (valueSorted && minValue !== undefined && facetValue(owner as unknown as OwnerRow, facet) < minValue) {
      stopped = true;
      break;
    }
    if (!matches(owner as unknown as OwnerRow, def, facet, now)) continue;
    const row = rowOf(owner, facet);
    if (row) rows.push(row);
  }
  return { rows, truncated: !stopped && facetRows.length === SCAN, limited: rows.length >= limit };
}

// ---- A company's lists ----

/** A member of a company on an active Pro plan. */
async function requirePro(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const member = await requireMember(ctx, organizationId);
  if (!member.organization.plan || !planIsActive(member.organization.plan, Date.now())) fail("FORBIDDEN", "Outreach is part of the Pro plan");
  return member;
}

const listView = (l: Doc<"outreachLists">) => ({
  id: l._id,
  title: l.title,
  who: l.definition.who,
  definition: l.definition,
  rowCount: l.rowCount,
  done: l.done,
  truncated: l.truncated,
  createdAt: l.createdAt,
});

/** The count and a first look, before saving. */
export const preview = query({
  args: { organizationId: v.id("organizations"), definition: outreachDefinition },
  handler: async (ctx, { organizationId, definition }) => {
    await requirePro(ctx, organizationId);
    const built = await buildRows(ctx, definition);
    return { count: built.rows.length, truncated: built.truncated, limited: built.limited, rows: built.rows.slice(0, 25) };
  },
});

export const previewInternal = internalQuery({
  args: { organizationId: v.id("organizations"), definition: outreachDefinition },
  handler: async (ctx, { organizationId, definition }) => {
    await requirePro(ctx, organizationId);
    const built = await buildRows(ctx, definition);
    return { count: built.rows.length, truncated: built.truncated, limited: built.limited, rows: built.rows.slice(0, 25) };
  },
});

export const assertPro = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requirePro(ctx, organizationId);
    return null;
  },
});

/** Builds the list and keeps its rows as they are today. */
export const createDef = mutationDef({
  args: { organizationId: v.id("organizations"), title: v.optional(v.string()), definition: outreachDefinition },
  handler: async (ctx, { organizationId, title: wanted, definition }) => {
    const { user } = await requirePro(ctx, organizationId);
    const built = await buildRows(ctx, definition);
    const listId = await ctx.db.insert("outreachLists", {
      organizationId,
      title: wanted?.trim() || defaultTitle(definition),
      definition,
      rowCount: built.rows.length,
      done: 0,
      truncated: built.truncated,
      createdBy: user._id,
      createdAt: nowIso(),
    });
    for (const row of built.rows) await ctx.db.insert("outreachRows", { listId, organizationId, ...row, status: "new" });
    return { listId, rowCount: built.rows.length, truncated: built.truncated, limited: built.limited, sample: built.rows.slice(0, 3) };
  },
});
export const create = mutation(createDef);

export const listsDef = queryDef({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requirePro(ctx, organizationId);
    const lists = await ctx.db.query("outreachLists").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
    return lists.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(listView);
  },
});
export const lists = query(listsDef);

/** A list with its rows, as saved. */
export const get = query({
  args: { organizationId: v.id("organizations"), listId: v.id("outreachLists") },
  handler: async (ctx, { organizationId, listId }) => {
    await requirePro(ctx, organizationId);
    const list = await ctx.db.get(listId);
    if (!list || list.organizationId !== organizationId) fail("NOT_FOUND", "No such list");
    const rows = await ctx.db.query("outreachRows").withIndex("by_list", (q) => q.eq("listId", listId)).collect();
    return {
      ...listView(list),
      rows: rows.map((r) => ({
        id: r._id,
        key: r.key,
        name: r.name,
        company: r.company,
        mailing: r.mailing,
        property: r.property,
        properties: r.properties,
        totalValueCents: r.totalValueCents,
        why: r.why,
        status: r.status,
        note: r.note,
      })),
    };
  },
});

/** Marks a row sent, done or skipped (or new again), with a note. */
export const setStatus = mutation({
  args: { organizationId: v.id("organizations"), rowId: v.id("outreachRows"), status: outreachRowStatus, note: v.optional(v.string()) },
  handler: async (ctx, { organizationId, rowId, status, note }) => {
    await requirePro(ctx, organizationId);
    const row = await ctx.db.get(rowId);
    if (!row || row.organizationId !== organizationId) fail("NOT_FOUND", "No such row");
    const list = await ctx.db.get(row.listId);
    const wasDone = row.status === "done" || row.status === "skip";
    const isDone = status === "done" || status === "skip";
    await ctx.db.patch(rowId, { status, note: note?.trim() || undefined, updatedAt: nowIso() });
    if (list && wasDone !== isDone) await ctx.db.patch(list._id, { done: Math.max(0, list.done + (isDone ? 1 : -1)) });
    return null;
  },
});

export const remove = mutation({
  args: { organizationId: v.id("organizations"), listId: v.id("outreachLists") },
  handler: async (ctx, { organizationId, listId }) => {
    await requirePro(ctx, organizationId);
    const list = await ctx.db.get(listId);
    if (!list || list.organizationId !== organizationId) fail("NOT_FOUND", "No such list");
    for (const r of await ctx.db.query("outreachRows").withIndex("by_list", (q) => q.eq("listId", listId)).collect()) await ctx.db.delete(r._id);
    await ctx.db.delete(listId);
    return null;
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
  | { ok: true; definition: Definition; title: string; explanation: string; count: number; truncated: boolean; limited: boolean; preview: ListRow[] }
  | { ok: false; explanation: string; suggestion?: { definition: Definition; title: string } };

/** "shopping center owners in Midland" → a definition, with the count and a first look. */
export const interpret = action({
  args: { organizationId: v.id("organizations"), request: v.string() },
  handler: async (ctx, { organizationId, request }): Promise<Interpreted> => {
    await ctx.runQuery(internal.outreach.assertPro, { organizationId });
    const ask = request.trim().slice(0, 500);
    if (!ask) return { ok: false, explanation: "Say who you want to reach, like shopping center owners or homes over $1M." };
    // Without the assistant (no key, or it couldn't answer), the words alone decide, for the common asks.
    const fromWords = async (why: string): Promise<Interpreted> => {
      const guess = guessDefinition(ask);
      if (!guess) {
        return {
          ok: false,
          explanation: `${why} Until it is, say one of: shopping center owners, investors, property managers, apartment owners, homes over $1M, recent buyers, absentee owners.`,
        };
      }
      const built: { count: number; truncated: boolean; limited: boolean; rows: ListRow[] } = await ctx.runQuery(internal.outreach.previewInternal, {
        organizationId,
        definition: guess.definition,
      });
      return {
        ok: true,
        definition: guess.definition,
        title: guess.title,
        explanation: `${guess.title.replace(/, Midland$/, "")}, from the words in your ask: ${why.replace(/\.$/, "")}. Names and mailing addresses; no phone numbers.`,
        count: built.count,
        truncated: built.truncated,
        limited: built.limited,
        preview: built.rows,
      };
    };
    if (!process.env.ANTHROPIC_API_KEY) return await fromWords("The assistant isn't connected yet (ANTHROPIC_API_KEY isn't set on the Convex deployment).");
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
      return await fromWords("The assistant couldn't answer just now.");
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
    const built: { count: number; truncated: boolean; limited: boolean; rows: ListRow[] } = await ctx.runQuery(internal.outreach.previewInternal, {
      organizationId,
      definition,
    });
    return {
      ok: true,
      definition,
      title: titleOf(parsed.title, definition),
      explanation: explanation || `${built.count} on the roll.`,
      count: built.count,
      truncated: built.truncated,
      limited: built.limited,
      preview: built.rows,
    };
  },
});

/** For staff: when the owners were last rebuilt, from how many parcels. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const sync = await ctx.db.query("permitSources").withIndex("by_source", (q) => q.eq("source", OWNERS_SOURCE)).unique();
    return sync ? { syncedAt: sync.syncedAt, parcels: sync.fetched, owners: sync.added + sync.updated, error: sync.error } : null;
  },
});
