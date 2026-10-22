import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
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

export type { IntakeFields };
