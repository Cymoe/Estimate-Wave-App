import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { assertLinksInOrg } from "./lib/documents";
import { leadFields } from "./schema";

const OPEN = new Set(["new", "no_answer", "contacted", "scheduled", "quoted"]);

function checkName(fields: Record<string, unknown>) {
  if ("name" in fields && (typeof fields.name !== "string" || fields.name.trim() === "")) {
    fail("INVALID", "Lead name is required");
  }
}

/** Open leads first, then by follow-up date (soonest first), then newest. */
function byPriority(a: Doc<"leads">, b: Doc<"leads">) {
  const open = Number(OPEN.has(b.status)) - Number(OPEN.has(a.status));
  if (open !== 0) return open;
  const followUp = (a.followUpDate ?? "9999").localeCompare(b.followUpDate ?? "9999");
  if (followUp !== 0) return followUp;
  return b.createdAt.localeCompare(a.createdAt);
}

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(2000);
    return await Promise.all(
      leads.sort(byPriority).map(async (lead) => {
        const estimate = lead.estimateId ? await ctx.db.get(lead.estimateId) : null;
        return {
          ...lead,
          estimate: estimate
            ? {
                id: estimate._id,
                estimateNumber: estimate.estimateNumber,
                status: estimate.status,
                totalAmount: estimate.totalAmount,
              }
            : null,
        };
      }),
    );
  },
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = pick(data, leadFields);
    if (fields.name === undefined) fail("INVALID", "Lead name is required");
    checkName(fields);
    fields.name = fields.name.trim();
    if (fields.status !== "lost") delete fields.lostReason;
    const now = nowIso();
    const id = await ctx.db.insert("leads", {
      status: "new",
      ...(fields as { name: string }),
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "lead",
      resourceId: id,
      details: { name: fields.name },
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("leads"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const { doc } = await getOwned(ctx, "leads", id);
    const fields = pick(data, { ...leadFields, estimateId: true }, { forPatch: true });
    checkName(fields);
    if (typeof fields.name === "string") fields.name = fields.name.trim();
    if (fields.estimateId !== undefined) {
      await assertLinksInOrg(ctx, doc.organizationId, { estimateId: fields.estimateId });
      fields.estimateId = ctx.db.normalizeId("estimates", fields.estimateId) as Id<"estimates">;
    }
    // A reason only makes sense while the lead is lost.
    if ((fields.status ?? doc.status) !== "lost") fields.lostReason = undefined;
    await ctx.db.patch(id, { ...fields, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "leads", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "lead",
      resourceId: id,
      details: { name: doc.name },
    });
    return { message: "Lead deleted successfully" };
  },
});

/** The lead's client, creating it from the lead's contact details the first time. */
export const ensureClient = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "leads", id);
    if (doc.clientId !== undefined && (await ctx.db.get(doc.clientId)) !== null) return doc.clientId;
    const now = nowIso();
    const clientId = await ctx.db.insert("clients", {
      name: doc.name,
      ...(doc.email ? { email: doc.email } : {}),
      ...(doc.phone ? { phone: doc.phone } : {}),
      ...(doc.address ? { address: doc.address } : {}),
      organizationId: doc.organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, { clientId, updatedAt: now });
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "created",
      resourceType: "client",
      resourceId: clientId,
      details: { name: doc.name, fromLead: id },
    });
    return clientId;
  },
});

// [name, phone, trade, source, value, status, follow-up in days, notes, lost reason]
type Sample = [string, string, string, string, number, Doc<"leads">["status"], number | null, string, string?];
const SAMPLES: Sample[] = [
  ["Maria Lopez", "(555) 201-3344", "roofing", "Referral", 14500, "new", 1, "Leaking around the chimney after the last storm. Wants a full replacement quote."],
  ["Dan & Priya Shah", "(555) 410-9921", "hvac", "Google", 9800, "new", -2, "AC unit is 18 years old, short-cycling. Asked about heat pumps."],
  ["Oak Street Dental", "(555) 330-7712", "painting", "Website", 6200, "contacted", 3, "Repaint lobby and two exam rooms, after hours only."],
  ["Tom Becker", "(555) 677-0145", "concrete", "Yard sign", 4800, "contacted", -1, "Cracked driveway, about 600 sq ft. Considering stamped finish."],
  ["Hannah Kim", "(555) 902-5530", "window-door", "Facebook", 11200, "quoted", 5, "Eight windows, double-hung, wants energy-efficient glass."],
  ["Riverside Apartments", "(555) 118-4400", "plumbing", "Repeat customer", 22000, "quoted", 7, "Repipe two units. Property manager: Lisa."],
  ["Carlos Mendes", "(555) 765-2290", "handyman", "Referral", 1800, "won", null, "Deck repair and two interior doors. Booked for next week."],
  ["Jenna Walsh", "(555) 483-6617", "electrical", "Google", 3500, "lost", null, "Panel upgrade to 200A.", "Went with a cheaper quote"],
];

/** Adds example leads to an organization that has none yet. */
export const addSamples = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user } = await requireMember(ctx, organizationId);
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .first();
    if (existing !== null) fail("INVALID", "Sample leads can only be added while the Leads list is empty");
    const now = new Date();
    for (const [index, [name, phone, jobType, source, estimatedValue, status, days, notes, lostReason]] of SAMPLES.entries()) {
      const followUp = days === null ? undefined : new Date(now.getTime() + days * 86_400_000);
      const createdAt = new Date(now.getTime() - (SAMPLES.length - index) * 3_600_000).toISOString();
      await ctx.db.insert("leads", {
        name,
        phone,
        jobType,
        source,
        estimatedValue,
        status,
        notes,
        ...(followUp ? { followUpDate: followUp.toISOString().split("T")[0] } : {}),
        ...(lostReason ? { lostReason } : {}),
        isSample: true,
        organizationId,
        userId: user._id,
        createdAt,
        updatedAt: createdAt,
      });
    }
    return SAMPLES.length;
  },
});

/** Deletes the example leads (and nothing else). */
export const removeSamples = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(2000);
    const samples = leads.filter((lead) => lead.isSample);
    for (const lead of samples) await ctx.db.delete(lead._id);
    return samples.length;
  },
});

/** Same person: same name, plus the same phone or email when either has one. */
function leadKey(lead: { name: string; phone?: string; email?: string }) {
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  return [lead.name.trim().toLowerCase(), digits || (lead.email ?? "").trim().toLowerCase()].join("|");
}

/**
 * Imports leads from another system into the organization of the user with
 * this email. Rows already present are skipped, or with updateExisting their
 * imported fields are refreshed, so it can be re-run.
 *
 *   npx convex run leads:importLeads '{"email":"you@example.com","leads":[...]}'
 */
export const importLeads = internalMutation({
  args: { email: v.string(), leads: v.array(v.any()), updateExisting: v.optional(v.boolean()) },
  handler: async (ctx, { email, leads, updateExisting }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (user === null) throw new Error(`No user with email ${email}`);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (membership === null) throw new Error(`${email} isn't in an organization`);
    const { organizationId } = membership;

    const existing = await ctx.db
      .query("leads")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    const seen = new Map(existing.map((lead) => [leadKey(lead), lead._id]));
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of leads) {
      const fields = pick(row, leadFields);
      if (fields.name === undefined) fail("INVALID", "Lead name is required");
      checkName(fields);
      if (fields.status !== "lost") delete fields.lostReason;
      const lead = { status: "new", ...fields, name: (fields.name as string).trim() } as Doc<"leads">;
      const key = leadKey(lead);
      const match = seen.get(key);
      if (match !== undefined) {
        if (updateExisting) {
          await ctx.db.patch(match, { ...lead, updatedAt: nowIso() });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      const createdAt = typeof row.createdAt === "string" ? row.createdAt : nowIso();
      seen.set(key, await ctx.db.insert("leads", { ...lead, organizationId, userId: user._id, createdAt, updatedAt: createdAt }));
      inserted++;
    }
    return { inserted, updated, skipped };
  },
});
