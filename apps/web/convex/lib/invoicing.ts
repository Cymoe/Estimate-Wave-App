import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { nowIso } from "./access";
import { documentNumber } from "./documents";

// Getting paid for an estimate: invoices against it (a deposit when it's
// signed, then the rest) and the payments the company records on them.

type Ctx = QueryCtx | MutationCtx;
export type InvoiceKind = "deposit" | "balance" | "other";

/** Money rounded to the cent. */
export const cents = (n: number) => Math.round(n * 100) / 100;
const today = () => nowIso().slice(0, 10);

/** Live invoices first (oldest first), cancelled ones after. */
export async function invoicesFor(ctx: Ctx, estimateId: Id<"estimates">) {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_estimate", (q) => q.eq("estimateId", estimateId))
    .take(200);
  return rows.sort((a, b) => Number(a.status === "cancelled") - Number(b.status === "cancelled") || a.createdAt.localeCompare(b.createdAt));
}

/** What the job is worth, what's been asked for, paid and still due, and what's left to invoice. */
export function paymentSummary(contract: number, invoices: Doc<"invoices">[]) {
  const live = invoices.filter((i) => i.status !== "cancelled");
  const invoiced = cents(live.reduce((sum, i) => sum + i.totalAmount, 0));
  const paid = cents(live.reduce((sum, i) => sum + i.amountPaid, 0));
  return {
    contract: cents(contract),
    invoiced,
    paid,
    due: cents(invoiced - paid),
    toInvoice: cents(Math.max(0, contract - invoiced)),
  };
}

/** An invoice for part of an estimate, one line, due today. */
export async function createInvoice(
  ctx: MutationCtx,
  estimate: Doc<"estimates">,
  args: { kind: InvoiceKind; amount: number; description: string; userId: Id<"users"> },
) {
  const now = nowIso();
  const amount = cents(args.amount);
  return await ctx.db.insert("invoices", {
    organizationId: estimate.organizationId,
    userId: args.userId,
    estimateId: estimate._id,
    clientId: estimate.clientId,
    projectId: estimate.projectId,
    title: estimate.title,
    invoiceNumber: documentNumber("INV"),
    kind: args.kind,
    status: "sent",
    issueDate: now,
    dueDate: today(),
    items: [{ _id: crypto.randomUUID(), description: args.description, quantity: 1, unitPrice: amount, totalPrice: amount, displayOrder: 0 }],
    subtotal: amount,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: amount,
    amountPaid: 0,
    payments: [],
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * When an estimate is signed: asks for the company's deposit, unless it
 * has no deposit set or one was already asked for.
 */
export async function askForDeposit(ctx: MutationCtx, estimate: Doc<"estimates">, userId: Id<"users">) {
  const organization = await ctx.db.get(estimate.organizationId);
  const percent = organization?.payments?.depositPercent ?? 0;
  if (percent <= 0) return null;
  const existing = await invoicesFor(ctx, estimate._id);
  if (existing.some((i) => i.kind === "deposit" && i.status !== "cancelled")) return null;
  const total = estimate.contractSnapshot?.totalAmount ?? estimate.totalAmount;
  const amount = cents((total * Math.min(percent, 100)) / 100);
  if (amount <= 0) return null;
  return await createInvoice(ctx, estimate, {
    kind: "deposit",
    amount,
    description: `Deposit (${percent}%) for ${estimate.estimateNumber}`,
    userId,
  });
}

/** What a signed estimate is worth: the total as signed. */
export const contractTotal = (estimate: Doc<"estimates">) => estimate.contractSnapshot?.totalAmount ?? estimate.totalAmount;
