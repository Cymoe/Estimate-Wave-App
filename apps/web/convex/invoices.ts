import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, requireMember } from "./lib/access";
import { cents, contractTotal, createInvoice, invoicesFor, paymentSummary } from "./lib/invoicing";

// Getting paid for a signed estimate: the deposit asked at signing, an
// invoice for the rest, and payments the company records by hand (check,
// cash, Zelle, a card taken elsewhere).

export const PAYMENT_METHODS = ["Check", "Cash", "Card", "Bank transfer", "Zelle", "Venmo", "Other"] as const;

const KIND_LABEL = { deposit: "Deposit", balance: "Balance", other: "Invoice" } as const;

/** The invoice as the screens read it. */
function view(invoice: Doc<"invoices">) {
  return {
    id: invoice._id,
    number: invoice.invoiceNumber,
    kind: invoice.kind ?? "other",
    label: KIND_LABEL[invoice.kind ?? "other"],
    description: invoice.items[0]?.description ?? "",
    total: invoice.totalAmount,
    paid: invoice.amountPaid,
    due: cents(invoice.totalAmount - invoice.amountPaid),
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    paidDate: invoice.paidDate,
    payments: invoice.payments ?? [],
  };
}

async function ownInvoice(ctx: MutationCtx, id: Doc<"invoices">["_id"]) {
  const invoice = await ctx.db.get(id);
  if (invoice === null) fail("NOT_FOUND", "Invoice not found");
  const { user } = await requireMember(ctx, invoice.organizationId);
  return { invoice, user };
}

/** A signed estimate's money: its invoices and what's paid, due and left to invoice. */
export const forEstimate = query({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    const { doc: estimate } = await getOwned(ctx, "estimates", estimateId);
    const invoices = await invoicesFor(ctx, estimateId);
    const organization = await ctx.db.get(estimate.organizationId);
    return {
      signed: estimate.status === "accepted",
      invoices: invoices.map(view),
      summary: paymentSummary(contractTotal(estimate), invoices),
      depositPercent: organization?.payments?.depositPercent ?? 0,
      methods: PAYMENT_METHODS,
    };
  },
});

/** What a project's clients have been asked for and paid, over its estimates. */
export const forProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const { doc: project } = await getOwned(ctx, "projects", projectId);
    const estimates = (
      await ctx.db
        .query("estimates")
        .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", project.organizationId))
        .take(2000)
    ).filter((e) => e.projectId === projectId && e.status === "accepted");
    let invoiced = 0;
    let paid = 0;
    for (const estimate of estimates) {
      const summary = paymentSummary(contractTotal(estimate), await invoicesFor(ctx, estimate._id));
      invoiced += summary.invoiced;
      paid += summary.paid;
    }
    return { invoiced: cents(invoiced), paid: cents(paid), due: cents(invoiced - paid) };
  },
});

async function signedEstimate(ctx: MutationCtx, estimateId: Doc<"estimates">["_id"]) {
  const { doc, user } = await getOwned(ctx, "estimates", estimateId);
  if (doc.status !== "accepted") fail("INVALID", "Payments start once the client signs the estimate");
  return { estimate: doc, user };
}

/** Asks for a deposit: a percent of the signed total or an amount, at most what's left to invoice. */
export const requestDeposit = mutation({
  args: { estimateId: v.id("estimates"), percent: v.optional(v.number()), amount: v.optional(v.number()) },
  handler: async (ctx, { estimateId, percent, amount }) => {
    const { estimate, user } = await signedEstimate(ctx, estimateId);
    const total = contractTotal(estimate);
    const ask = cents(amount ?? (total * (percent ?? 0)) / 100);
    const { toInvoice } = paymentSummary(total, await invoicesFor(ctx, estimateId));
    if (!(ask > 0)) fail("INVALID", "Ask for more than $0");
    if (ask > toInvoice) fail("INVALID", `That's more than the ${toInvoice.toFixed(2)} left to invoice`);
    const label = percent !== undefined && amount === undefined ? `Deposit (${percent}%)` : "Deposit";
    const id = await createInvoice(ctx, estimate, { kind: "deposit", amount: ask, description: `${label} for ${estimate.estimateNumber}`, userId: user._id });
    await logActivity(ctx, { organizationId: estimate.organizationId, userId: user._id, action: "created", resourceType: "invoice", resourceId: id, details: { kind: "deposit", amount: ask, estimateNumber: estimate.estimateNumber } });
    return id;
  },
});

/** Invoices everything not yet asked for: the rest of the job. */
export const invoiceBalance = mutation({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    const { estimate, user } = await signedEstimate(ctx, estimateId);
    const { toInvoice } = paymentSummary(contractTotal(estimate), await invoicesFor(ctx, estimateId));
    if (!(toInvoice > 0)) fail("INVALID", "Everything on this estimate has been invoiced");
    const id = await createInvoice(ctx, estimate, { kind: "balance", amount: toInvoice, description: `Balance for ${estimate.estimateNumber}`, userId: user._id });
    await logActivity(ctx, { organizationId: estimate.organizationId, userId: user._id, action: "created", resourceType: "invoice", resourceId: id, details: { kind: "balance", amount: toInvoice, estimateNumber: estimate.estimateNumber } });
    return id;
  },
});

/** Records money received on an invoice; it's paid once it's all in. */
export const recordPayment = mutation({
  args: {
    id: v.id("invoices"),
    amount: v.number(),
    method: v.string(),
    paidAt: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, amount, method, paidAt, note }) => {
    const { invoice, user } = await ownInvoice(ctx, id);
    if (invoice.status === "cancelled") fail("INVALID", "This invoice was cancelled");
    const due = cents(invoice.totalAmount - invoice.amountPaid);
    const value = cents(amount);
    if (!(value > 0)) fail("INVALID", "Enter an amount over $0");
    if (value > due) fail("INVALID", `Only $${due.toFixed(2)} is due on this invoice`);
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) fail("INVALID", `How it was paid: ${PAYMENT_METHODS.join(", ")}`);
    const day = paidAt ?? nowIso().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("INVALID", "The date must be YYYY-MM-DD");
    const now = nowIso();
    const amountPaid = cents(invoice.amountPaid + value);
    const settled = amountPaid >= invoice.totalAmount;
    await ctx.db.patch(id, {
      payments: [
        ...(invoice.payments ?? []),
        { _id: crypto.randomUUID(), amount: value, method, paidAt: day, note: note?.trim().slice(0, 500) || undefined, recordedBy: user._id, recordedAt: now },
      ],
      amountPaid,
      status: settled ? "paid" : "sent",
      paidDate: settled ? day : undefined,
      updatedAt: now,
    });
    await logActivity(ctx, { organizationId: invoice.organizationId, userId: user._id, action: "payment_recorded", resourceType: "invoice", resourceId: id, details: { amount: value, method, invoiceNumber: invoice.invoiceNumber } });
    return view((await ctx.db.get(id))!);
  },
});

/** Takes back a payment recorded by mistake. */
export const removePayment = mutation({
  args: { id: v.id("invoices"), paymentId: v.string() },
  handler: async (ctx, { id, paymentId }) => {
    const { invoice, user } = await ownInvoice(ctx, id);
    const payment = (invoice.payments ?? []).find((p) => p._id === paymentId);
    if (!payment) fail("NOT_FOUND", "Payment not found");
    const amountPaid = cents(invoice.amountPaid - payment.amount);
    await ctx.db.patch(id, {
      payments: (invoice.payments ?? []).filter((p) => p._id !== paymentId),
      amountPaid,
      status: invoice.status === "cancelled" ? "cancelled" : "sent",
      paidDate: undefined,
      updatedAt: nowIso(),
    });
    await logActivity(ctx, { organizationId: invoice.organizationId, userId: user._id, action: "payment_removed", resourceType: "invoice", resourceId: id, details: { amount: payment.amount, invoiceNumber: invoice.invoiceNumber } });
    return view((await ctx.db.get(id))!);
  },
});

/** Withdraws an invoice nothing has been paid on. */
export const cancel = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    const { invoice, user } = await ownInvoice(ctx, id);
    if (invoice.amountPaid > 0) fail("INVALID", "Payments were recorded on this invoice; take them off first");
    await ctx.db.patch(id, { status: "cancelled", updatedAt: nowIso() });
    await logActivity(ctx, { organizationId: invoice.organizationId, userId: user._id, action: "cancelled", resourceType: "invoice", resourceId: id, details: { invoiceNumber: invoice.invoiceNumber } });
    return null;
  },
});
