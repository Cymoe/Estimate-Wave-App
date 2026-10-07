import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { assertLinksInOrg } from "./lib/documents";
import { leadFields } from "./schema";

const OPEN = new Set(["new", "contacted", "quoted"]);

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
