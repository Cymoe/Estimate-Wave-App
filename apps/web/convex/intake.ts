import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, nowIso, requireStaff, requireSuperAdmin } from "./lib/access";
import { listLead } from "./lib/awards";
import { buyersOf, fundedBidsFor } from "./lib/standing";
import { pricingFor } from "./lib/wallet";
import { normalizeCounty, TEXAS_COUNTIES } from "./lib/counties";
import { DUPLICATE_WINDOW_DAYS, fieldsFromPayload, intakeLabel, normalizePhone, parseCampaign, type IntakeFields } from "./lib/intake";
import { intakeDisposition, intakeSource } from "./schema";

/**
 * The intake queue: every lead on its way in, from a Facebook form through
 * the webhook, from a call, or typed in by staff. A row sits here until a
 * person confirms it with the homeowner (then it is listed and sold) or
 * closes it with a reason. Nothing in this file sells anything.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Trade slugs, for reading campaign names and checking what staff pick. */
async function tradeSlugs(ctx: QueryCtx | MutationCtx): Promise<string[]> {
  const rows = await ctx.db.query("industries").take(500);
  return rows.filter((r) => r.is_active).map((r) => r.slug);
}

/** The same phone seen in the last 45 days, in intake or already listed. */
async function findDuplicate(
  ctx: MutationCtx,
  phoneNormalized: string | undefined,
  exclude?: Id<"intakeLeads">,
): Promise<Id<"intakeLeads"> | undefined> {
  if (!phoneNormalized) return undefined;
  const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * DAY_MS).toISOString();
  const rows = await ctx.db
    .query("intakeLeads")
    .withIndex("by_phone", (q) => q.eq("phoneNormalized", phoneNormalized))
    .collect();
  const earlier = rows
    .filter((r) => r._id !== exclude && r.createdAt >= since && r.disposition !== "duplicate" && r.disposition !== "bad_number")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return earlier[0]?._id;
}

const fieldArgs = {
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  city: v.optional(v.string()),
  zip: v.optional(v.string()),
  county: v.optional(v.string()),
  jobType: v.optional(v.string()),
  scope: v.optional(v.string()),
  timeline: v.optional(v.string()),
  isOwner: v.optional(v.boolean()),
  notes: v.optional(v.string()),
};

type FieldArgs = {
  [K in keyof typeof fieldArgs]?: K extends "isOwner" ? boolean : string;
};

/** Trims text, drops blanks, checks the county and trade. */
async function cleanFields(ctx: QueryCtx | MutationCtx, fields: FieldArgs): Promise<FieldArgs> {
  const out: FieldArgs = {};
  for (const [key, value] of Object.entries(fields) as Array<[keyof FieldArgs, unknown]>) {
    if (value === undefined || value === null) continue;
    if (key === "isOwner") {
      out.isOwner = Boolean(value);
      continue;
    }
    if (typeof value !== "string") fail("INVALID", `${key} must be text`);
    const trimmed = value.trim();
    if (trimmed) (out as Record<string, string>)[key] = trimmed;
  }
  if (out.county) {
    const county = normalizeCounty(out.county);
    if (!county || !TEXAS_COUNTIES.includes(county)) fail("INVALID", `${out.county} isn't a Texas county`);
    out.county = county;
  }
  if (out.jobType && !(await tradeSlugs(ctx)).includes(out.jobType)) fail("INVALID", "Pick a trade from the list");
  return out;
}

function summary(row: Doc<"intakeLeads">) {
  const last = row.attempts[row.attempts.length - 1];
  return {
    id: row._id,
    source: row.source,
    status: row.status,
    disposition: row.disposition,
    label: intakeLabel(row),
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    zip: row.zip,
    county: row.county,
    countyFromCampaign: row.countyFromCampaign,
    jobType: row.jobType,
    scope: row.scope,
    timeline: row.timeline,
    isOwner: row.isOwner,
    notes: row.notes,
    campaignName: row.campaignName,
    adsetName: row.adsetName,
    consent: row.consent,
    duplicateOf: row.duplicateOf,
    attempts: row.attempts,
    lastAttempt: last ?? null,
    confirmedLeadId: row.confirmedLeadId,
    isSample: row.isSample,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * A lead arriving from outside (the webhook). Idempotent on the outside id:
 * Zapier and Meta both retry. Marks a repeat phone as a duplicate rather than
 * dropping it, so staff see it and decide.
 */
export const receive = internalMutation({
  args: { payload: v.any(), source: v.optional(intakeSource) },
  handler: async (ctx, { payload, source }) => {
    const fields = fieldsFromPayload(payload);
    if (fields.externalId) {
      const seen = await ctx.db
        .query("intakeLeads")
        .withIndex("by_external_id", (q) => q.eq("externalId", fields.externalId))
        .first();
      if (seen !== null) return { id: seen._id, duplicate: seen.duplicateOf !== undefined, repeat: true };
    }
    const trades = await tradeSlugs(ctx);
    const fromCampaign = parseCampaign(fields.campaignName, trades);
    const fromAdset = parseCampaign(fields.adsetName, trades);
    const county = normalizeCounty(fields.county) ?? fromCampaign.county ?? fromAdset.county;
    const jobType = trades.includes(fields.jobType ?? "") ? fields.jobType : (fromCampaign.jobType ?? fromAdset.jobType);
    const phoneNormalized = normalizePhone(fields.phone);
    const duplicateOf = await findDuplicate(ctx, phoneNormalized);
    const now = nowIso();
    const id = await ctx.db.insert("intakeLeads", {
      source: source ?? (fields.campaignName || fields.formId ? "meta" : "api"),
      status: "new",
      name: fields.name,
      phone: fields.phone,
      phoneNormalized,
      email: fields.email,
      address: fields.address,
      city: fields.city,
      zip: fields.zip,
      county,
      countyFromCampaign: fromCampaign.county ?? fromAdset.county,
      jobType,
      scope: fields.scope,
      timeline: fields.timeline,
      isOwner: fields.isOwner,
      notes: fields.notes,
      externalId: fields.externalId,
      campaignName: fields.campaignName,
      adsetName: fields.adsetName,
      adName: fields.adName,
      formId: fields.formId,
      consent: fields.consent,
      raw: payload,
      duplicateOf,
      attempts: [],
      createdAt: now,
      updatedAt: now,
    });
    return { id, duplicate: duplicateOf !== undefined, repeat: false };
  },
});

/** A lead typed in by staff: a call that came in, or one written down. */
export const create = mutation({
  args: { source: intakeSource, ...fieldArgs },
  handler: async (ctx, { source, ...fields }) => {
    const user = await requireStaff(ctx);
    const clean = await cleanFields(ctx, fields);
    if (!clean.name && !clean.phone) fail("INVALID", "A name or a phone number is needed");
    const phoneNormalized = normalizePhone(clean.phone);
    const duplicateOf = await findDuplicate(ctx, phoneNormalized);
    const now = nowIso();
    const id = await ctx.db.insert("intakeLeads", {
      source,
      status: "new",
      ...clean,
      phoneNormalized,
      duplicateOf,
      attempts: [],
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return { id, duplicate: duplicateOf !== undefined };
  },
});

async function openRow(ctx: MutationCtx, id: Id<"intakeLeads">): Promise<Doc<"intakeLeads">> {
  const row = await ctx.db.get(id);
  if (row === null) fail("NOT_FOUND", "Lead not found");
  if (row.status === "confirmed") fail("INVALID", "This lead is already listed");
  return row;
}

/** Staff correct or fill in what the form gave. */
export const update = mutation({
  args: { id: v.id("intakeLeads"), ...fieldArgs },
  handler: async (ctx, { id, ...fields }) => {
    await requireStaff(ctx);
    const row = await openRow(ctx, id);
    const clean = await cleanFields(ctx, fields);
    // Clearing a field: an empty string came in and was dropped by cleanFields.
    const cleared = Object.fromEntries(
      (Object.keys(fields) as Array<keyof FieldArgs>)
        .filter((k) => fields[k] !== undefined && clean[k] === undefined && k !== "isOwner")
        .map((k) => [k, undefined]),
    );
    const phone = "phone" in fields ? clean.phone : row.phone;
    const phoneNormalized = normalizePhone(phone);
    await ctx.db.patch(id, {
      ...cleared,
      ...clean,
      phoneNormalized,
      duplicateOf: phoneNormalized === row.phoneNormalized ? row.duplicateOf : await findDuplicate(ctx, phoneNormalized, id),
      status: row.status === "new" ? "working" : row.status,
      updatedAt: nowIso(),
    });
    return null;
  },
});

/** Every call or text counts, reached or not. */
export const logAttempt = mutation({
  args: {
    id: v.id("intakeLeads"),
    outcome: v.union(
      v.literal("reached"),
      v.literal("voicemail"),
      v.literal("no_answer"),
      v.literal("wrong_number"),
      v.literal("callback"),
      v.literal("texted"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, outcome, note }) => {
    const user = await requireStaff(ctx);
    const row = await openRow(ctx, id);
    const now = nowIso();
    await ctx.db.patch(id, {
      attempts: [...row.attempts, { at: now, by: user._id, outcome, note: note?.trim() || undefined }],
      status: row.status === "new" ? "working" : row.status,
      updatedAt: now,
    });
    return null;
  },
});

/** Takes a lead out of the queue with a reason. */
export const close = mutation({
  args: { id: v.id("intakeLeads"), disposition: intakeDisposition, note: v.optional(v.string()) },
  handler: async (ctx, { id, disposition, note }) => {
    const user = await requireStaff(ctx);
    const row = await openRow(ctx, id);
    const now = nowIso();
    await ctx.db.patch(id, {
      status: "closed",
      disposition,
      attempts: note?.trim() ? [...row.attempts, { at: now, by: user._id, outcome: "closed", note: note.trim() }] : row.attempts,
      updatedAt: now,
    });
    return null;
  },
});

const SCOPE_LABELS: Record<string, string> = { repair: "Repair", replacement: "Replacement", new: "New install", remodel: "Remodel" };
const TIMELINE_LABELS: Record<string, string> = {
  asap: "As soon as possible",
  month: "Within a month",
  quarter: "In the next few months",
  planning: "Just planning",
};

/** The checks a person makes on the phone before a lead is worth selling. */
export const CHECKS = {
  reached: "Reached the homeowner live",
  phoneOwner: "The number is theirs",
  addressInCounty: "Address confirmed, inside the county",
  trade: "Trade and scope confirmed",
  owner: "Owns the home and decides",
  consent: "Consent read and acknowledged",
} as const;

const checksArg = v.object({
  reached: v.boolean(),
  phoneOwner: v.boolean(),
  addressInCounty: v.boolean(),
  trade: v.boolean(),
  owner: v.boolean(),
  consent: v.boolean(),
});

/**
 * The gate in front of the auction. Only a lead a person has confirmed on
 * the phone (all six checks) is listed; listing runs the instant award
 * exactly as before, and the lead carries "Confirmed today · what they
 * said" into the Marketplace and the buyer's Leads.
 */
export const confirm = mutation({
  args: {
    id: v.id("intakeLeads"),
    checks: checksArg,
    note: v.optional(v.string()),
    allowDuplicate: v.optional(v.boolean()),
    ...fieldArgs,
  },
  handler: async (ctx, { id, checks, note, allowDuplicate, ...fields }) => {
    const user = await requireStaff(ctx);
    const row = await openRow(ctx, id);
    if (row.status === "closed") fail("INVALID", "Put it back in the queue first");
    for (const [key, label] of Object.entries(CHECKS) as Array<[keyof typeof CHECKS, string]>) {
      if (!checks[key]) fail("INVALID", `Not confirmed yet: ${label.toLowerCase()}`);
    }
    if (row.duplicateOf && !allowDuplicate) fail("INVALID", "Same number as another lead. Close it as a duplicate, or list it anyway.");
    const clean = await cleanFields(ctx, fields);
    const merged = { ...row, ...clean };
    if (!merged.name) fail("INVALID", "The homeowner's name is needed");
    if (!normalizePhone(merged.phone)) fail("INVALID", "A working phone number is needed");
    if (!merged.county) fail("INVALID", "Pick the county: bids are by county");
    if (!merged.jobType) fail("INVALID", "Pick the trade");

    // What the company reads on the card: the answers, then anything typed.
    const lines = [
      merged.scope ? `What kind of work? ${SCOPE_LABELS[merged.scope] ?? merged.scope}` : null,
      merged.timeline ? `When do they want it done? ${TIMELINE_LABELS[merged.timeline] ?? merged.timeline}` : null,
      merged.notes?.trim() || null,
    ].filter((l): l is string => l !== null);
    const now = nowIso();
    const leadId = await listLead(
      ctx,
      {
        name: merged.name,
        phone: merged.phone,
        email: merged.email,
        address: merged.address,
        city: merged.city,
        county: merged.county,
        jobType: merged.jobType,
        notes: lines.length ? lines.join("\n") : undefined,
        verified: { at: now, note: note?.trim() || undefined, by: user._id },
      },
      user._id,
      { source: row.source === "meta" ? "Facebook" : row.source === "call" ? "Call" : "Staff" },
    );
    await ctx.db.patch(id, {
      ...clean,
      phoneNormalized: normalizePhone(merged.phone),
      status: "confirmed",
      confirmedLeadId: leadId,
      attempts: [...row.attempts, { at: now, by: user._id, outcome: "reached", note: note?.trim() || "Confirmed and listed" }],
      updatedAt: now,
    });
    const lead = (await ctx.db.get(leadId))!;
    const company = lead.assignedOrganizationId ? await ctx.db.get(lead.assignedOrganizationId) : null;
    return {
      leadId,
      outcome: lead.status === "assigned" ? ("sold" as const) : ("available" as const),
      companyName: company?.name,
      priceCents: lead.status === "assigned" ? lead.priceCents : undefined,
    };
  },
});

/** Demo rows out again (called by marketplace.deleteDemoData). */
export async function deleteDemoIntake(ctx: MutationCtx): Promise<number> {
  const rows = (await ctx.db.query("intakeLeads").take(5000)).filter((r) => r.isSample);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

/**
 * Six leads to try the queue with: two from a Facebook campaign, two from
 * calls, one typed in, and one that repeats a number. Owner only; "Remove
 * demo data" takes them back out. Does nothing if they're already there.
 */
export const addDemoLeads = mutation({
  args: {},
  handler: async (ctx) => seedDemoIntake(ctx, await requireSuperAdmin(ctx)),
});

/** The six demo intake leads, as `addDemoLeads` adds them; also run from the CLI (seed.ts). */
export async function seedDemoIntake(ctx: MutationCtx, user: Doc<"users">) {
    const existing = (await ctx.db.query("intakeLeads").take(5000)).filter((r) => r.isSample);
    if (existing.length > 0) return { added: 0 };
    const trades = await tradeSlugs(ctx);
    const trade = (slug: string) => (trades.includes(slug) ? slug : trades[0]);
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    const base = (at: string) => ({ attempts: [] as Doc<"intakeLeads">["attempts"], isSample: true, createdAt: at, updatedAt: at });
    const rows: Array<Omit<Doc<"intakeLeads">, "_id" | "_creationTime">> = [
      {
        ...base(ago(12)),
        source: "meta",
        status: "new",
        name: "Dana Reyes",
        phone: "432-555-0133",
        phoneNormalized: "4325550133",
        email: "dana.reyes@example.com",
        city: "Midland",
        zip: "79701",
        county: "Midland",
        countyFromCampaign: "Midland",
        jobType: trade("roofing"),
        timeline: "month",
        isOwner: true,
        notes: "Hail damage on the back side, insurance adjuster came Tuesday",
        externalId: "demo-leadgen-1",
        campaignName: "TX_MIDLAND_ROOFING_LG_202610",
        adsetName: "TX_MIDLAND_ROOFING_hail",
        adName: "video1",
        formId: "demo-form",
        consent: { text: "I agree to be contacted by FieldQuote and one contractor", value: "true", at: ago(12) },
      },
      {
        ...base(ago(45)),
        source: "meta",
        status: "new",
        name: "Luis Ortega",
        phone: "(432) 555-0188",
        phoneNormalized: "4325550188",
        city: "Odessa",
        county: "Ector",
        countyFromCampaign: "Midland",
        jobType: trade("painting"),
        scope: "repair",
        timeline: "asap",
        isOwner: true,
        notes: "Exterior trim peeling, two-story",
        externalId: "demo-leadgen-2",
        campaignName: "TX_MIDLAND_PAINTING_LG_202610",
        formId: "demo-form",
        consent: { text: "I agree to be contacted by FieldQuote and one contractor", value: "true", at: ago(45) },
      },
      {
        ...base(ago(180)),
        source: "call",
        status: "working",
        name: "Pat Cole",
        phone: "432-555-0101",
        phoneNormalized: "4325550101",
        address: "12 Elm St",
        city: "Odessa",
        county: "Ector",
        jobType: trade("hvac"),
        scope: "replacement",
        timeline: "month",
        isOwner: true,
        notes: "AC died, wants a quote on a full replacement",
        attempts: [
          { at: ago(170), by: user._id, outcome: "voicemail" },
          { at: ago(60), by: user._id, outcome: "callback", note: "Asked for a call after 5" },
        ],
        createdBy: user._id,
      },
      {
        ...base(ago(240)),
        source: "call",
        status: "new",
        name: "Maria Chen",
        phone: "432-555-0144",
        phoneNormalized: "4325550144",
        city: "Big Spring",
        county: "Howard",
        jobType: trade("landscaping"),
        timeline: "quarter",
        notes: "Sod and a drip system for the front yard",
        createdBy: user._id,
      },
      {
        ...base(ago(300)),
        source: "manual",
        status: "new",
        name: "Ray Thompson",
        phone: "432-555-0166",
        phoneNormalized: "4325550166",
        city: "Midland",
        county: "Midland",
        jobType: trade("plumbing"),
        scope: "repair",
        notes: "Water heater leaking in the garage",
        createdBy: user._id,
      },
    ];
    const ids: Id<"intakeLeads">[] = [];
    for (const row of rows) ids.push(await ctx.db.insert("intakeLeads", row));
    // The same homeowner again from the form: flagged as a duplicate of the first row.
    await ctx.db.insert("intakeLeads", {
      ...base(ago(3)),
      source: "meta",
      status: "new",
      name: "D. Reyes",
      phone: "+1 432 555 0133",
      phoneNormalized: "4325550133",
      county: "Midland",
      countyFromCampaign: "Midland",
      jobType: trade("roofing"),
      externalId: "demo-leadgen-3",
      campaignName: "TX_MIDLAND_ROOFING_LG_202610",
      formId: "demo-form",
      duplicateOf: ids[0],
    });
    return { added: rows.length + 1 };
}

/** Puts a closed lead back in the queue. */
export const reopen = mutation({
  args: { id: v.id("intakeLeads") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const row = await openRow(ctx, id);
    if (row.status !== "closed") return null;
    await ctx.db.patch(id, { status: "working", disposition: undefined, updatedAt: nowIso() });
    return null;
  },
});

/** The queue, newest first. Open leads by default; closed or confirmed on request. */
export const queue = query({
  args: { status: v.optional(v.union(v.literal("open"), v.literal("closed"), v.literal("confirmed"))) },
  handler: async (ctx, { status }) => {
    await requireStaff(ctx);
    const wanted = status ?? "open";
    const rows =
      wanted === "open"
        ? [
            ...(await ctx.db.query("intakeLeads").withIndex("by_status", (q) => q.eq("status", "new")).collect()),
            ...(await ctx.db.query("intakeLeads").withIndex("by_status", (q) => q.eq("status", "working")).collect()),
          ]
        : await ctx.db.query("intakeLeads").withIndex("by_status", (q) => q.eq("status", wanted)).order("desc").take(200);
    const trades = await ctx.db.query("industries").take(500);
    const tradeName = new Map(trades.map((t) => [t.slug, t.name]));
    return rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({ ...summary(row), tradeName: row.jobType ? (tradeName.get(row.jobType) ?? row.jobType) : undefined }));
  },
});

/** One intake lead with everything on it. */
export const get = query({
  args: { id: v.id("intakeLeads") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const row = await ctx.db.get(id);
    if (row === null) fail("NOT_FOUND", "Lead not found");
    const duplicate = row.duplicateOf ? await ctx.db.get(row.duplicateOf) : null;
    return {
      ...summary(row),
      duplicate: duplicate
        ? { id: duplicate._id, label: intakeLabel(duplicate), status: duplicate.status, createdAt: duplicate.createdAt, confirmedLeadId: duplicate.confirmedLeadId }
        : null,
    };
  },
});

/**
 * Where a lead for this county and trade would go the moment it is listed,
 * so staff see it before they confirm: sold to a funded bid, into the
 * Marketplace for the companies that buy the trade, or nowhere, because no
 * company buys the trade at all (close it, or sign a company first).
 */
export const destination = query({
  args: { county: v.string(), jobType: v.string() },
  handler: async (ctx, { county: rawCounty, jobType }) => {
    await requireStaff(ctx);
    const county = normalizeCounty(rawCounty);
    const trade = (await ctx.db.query("industries").take(500)).find((t) => t.slug === jobType);
    const tradeName = trade?.name ?? jobType;
    if (!county || !jobType) return null;
    const buyers = await buyersOf(ctx, jobType);
    if (buyers.length === 0) return { kind: "nobody" as const, tradeName, county };
    const [top] = await fundedBidsFor(ctx, county, jobType);
    if (top) {
      const company = await ctx.db.get(top.organizationId);
      return { kind: "sold" as const, tradeName, county, companyName: company?.name ?? "a company", priceCents: top.amountCents };
    }
    return { kind: "marketplace" as const, tradeName, county, priceCents: (await pricingFor(ctx, jobType)).startCents, buyers: buyers.length };
  },
});

export type { IntakeFields };
