import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, pick, requireMember } from "./lib/access";
import { assertLinksInOrg, documentNumber, normalizeItems, withTotals } from "./lib/documents";
import { invoiceFields, invoiceStatus } from "./schema";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.optional(v.id("clients")),
    status: v.optional(invoiceStatus),
  },
  handler: async (ctx, { organizationId, clientId, status }) => {
    await requireMember(ctx, organizationId);
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(2000);
    return invoices.filter(
      (i) => (clientId === undefined || i.clientId === clientId) && (status === undefined || i.status === status),
    );
  },
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => (await getOwned(ctx, "invoices", id)).doc,
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    const { user } = await requireMember(ctx, organizationId);
    const fields = pick(data, invoiceFields);
    await assertLinksInOrg(ctx, organizationId, fields);
    const now = nowIso();
    const doc = withTotals({
      status: "draft" as const,
      issueDate: now,
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
      amountPaid: 0,
      invoiceNumber: documentNumber("INV"),
      ...fields,
      items: normalizeItems(fields.items),
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    const id = await ctx.db.insert("invoices", doc);
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "created",
      resourceType: "invoice",
      resourceId: id,
      details: { invoiceNumber: doc.invoiceNumber, totalAmount: doc.totalAmount },
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: { id: v.id("invoices"), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const { doc } = await getOwned(ctx, "invoices", id);
    const patch = pick(data, invoiceFields, { forPatch: true });
    await assertLinksInOrg(ctx, doc.organizationId, patch);
    if ("items" in patch) patch.items = normalizeItems(patch.items);
    const { subtotal, taxAmount, totalAmount } = withTotals({ ...doc, ...patch });
    await ctx.db.patch(id, { ...patch, subtotal, taxAmount, totalAmount, updatedAt: nowIso() });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    const { doc, user } = await getOwned(ctx, "invoices", id);
    await ctx.db.delete(id);
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "deleted",
      resourceType: "invoice",
      resourceId: id,
      details: { invoiceNumber: doc.invoiceNumber },
    });
    return { message: "Invoice deleted successfully" };
  },
});

export const markAsPaid = mutation({
  args: { id: v.id("invoices"), amountPaid: v.number() },
  handler: async (ctx, { id, amountPaid }) => {
    const { doc, user } = await getOwned(ctx, "invoices", id);
    if (amountPaid < 0) fail("INVALID", "Amount paid can't be negative");
    const now = nowIso();
    await ctx.db.patch(id, { amountPaid, paidDate: now, status: "paid", updatedAt: now });
    await logActivity(ctx, {
      organizationId: doc.organizationId,
      userId: user._id,
      action: "paid",
      resourceType: "invoice",
      resourceId: id,
      details: { invoiceNumber: doc.invoiceNumber, amountPaid },
    });
    return await ctx.db.get(id);
  },
});
