import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { assertLinksInOrg, documentNumber, normalizeItems, withTotals } from "./lib/documents";
import { estimateFields, estimateStatus } from "./schema";

// Fields the UI may set directly; signature fields only change via `sign`.
const writableFields = Object.fromEntries(
  Object.entries(estimateFields).filter(([key]) => key !== "clientSignature" && key !== "signedAt"),
);

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
    status: v.optional(estimateStatus),
  },
  handler: async (ctx, { organizationId, clientId, status }) => {
    await requireMember(ctx, organizationId);
    const estimates = await ctx.db
      .query("estimates")
      .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(2000);
    return estimates.filter(
      (e) => (clientId === undefined || e.clientId === clientId) && (status === undefined || e.status === status),
    );
  },
});

export const get = query({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => (await getOwned(ctx, "estimates", id)).doc,
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = pick(data, writableFields);
    await assertLinksInOrg(ctx, organizationId, fields);
    const now = nowIso();
    const doc = withTotals({
      status: "draft" as const,
      issueDate: now,
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
      estimateNumber: documentNumber("EST"),
      ...fields,
      items: normalizeItems(fields.items),
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    const id = await ctx.db.insert("estimates", doc);
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: doc.estimateNumber, totalAmount: doc.totalAmount },
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("estimates"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    const patch = pick(data, writableFields, { forPatch: true });
    await assertLinksInOrg(ctx, doc.organizationId, patch);
    if ("items" in patch) patch.items = normalizeItems(patch.items);
    const { subtotal, taxAmount, totalAmount } = withTotals({ ...doc, ...patch });
    await ctx.db.patch(id, { ...patch, subtotal, taxAmount, totalAmount, updatedAt: nowIso() });
    if (patch.status !== undefined && patch.status !== doc.status) {
      await logActivity(ctx, {
        organizationId: doc.organizationId,
        userId: user._id,
        action: "status_changed",
        resourceType: "estimate",
        resourceId: id,
        details: { from: doc.status, to: patch.status },
      });
    }
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("estimates") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: doc.estimateNumber },
    });
    return { message: "Estimate deleted successfully" };
  },
});

export const sign = mutation({
  args: { id: v.id("estimates"), signature: v.string() },
  handler: async (ctx, { id, signature }) => {
    const { doc, user } = await getOwned(ctx, "estimates", id);
    const now = nowIso();
    await ctx.db.patch(id, { clientSignature: signature, signedAt: now, status: "accepted", updatedAt: now });
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "signed",
      resourceType: "estimate",
      resourceId: id,
      details: { estimateNumber: doc.estimateNumber },
    });
    return await ctx.db.get(id);
  },
});
