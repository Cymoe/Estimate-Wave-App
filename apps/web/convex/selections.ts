import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso } from "./lib/access";
import { withTotals } from "./lib/documents";

// The company's side of allowances: what the client picked for each, and
// approving a pick at a price (which becomes the line's price) or reopening it.

async function pickAndLine(ctx: MutationCtx, id: Doc<"selections">["_id"]) {
  const pick = await ctx.db.get(id);
  if (pick === null) fail("NOT_FOUND", "Not found");
  const { doc: estimate, user } = await getOwned(ctx, "estimates", pick.estimateId);
  const item = estimate.items.find((i) => i._id === pick.itemId && i.allowance);
  if (!item) fail("INVALID", "That allowance isn't on the estimate any more");
  return { pick, estimate, item, user };
}

/** Saves the estimate with one line replaced, totals recalculated. */
async function saveLine(ctx: MutationCtx, estimate: Doc<"estimates">, line: Doc<"estimates">["items"][number], now: string) {
  const items = estimate.items.map((i) => (i._id === line._id ? line : i));
  const { subtotal, discountAmount, taxAmount, totalAmount } = withTotals({ ...estimate, items });
  await ctx.db.patch(estimate._id, { items, subtotal, discountAmount, taxAmount, totalAmount, updatedAt: now });
}

/**
 * Approves the client's pick at a price per unit (what they sent, or the
 * company's own, say with delivery). The line takes that price; once the
 * estimate is signed, the difference goes on the next change order.
 */
export const approve = mutation({
  args: { id: v.id("selections"), unitPrice: v.number() },
  handler: async (ctx, { id, unitPrice }) => {
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10_000_000) fail("INVALID", "Enter the price, $0 or more");
    const { pick, estimate, item, user } = await pickAndLine(ctx, id);
    const price = Math.round(unitPrice * 100) / 100;
    const now = nowIso();
    // The price is the client's choice now, not the price book's: no red line or cap.
    const line = {
      ...item,
      unitPrice: price,
      totalPrice: item.quantity * price,
      allowance: { ...item.allowance, amount: item.allowance!.amount ?? item.unitPrice },
    };
    delete line.redLinePrice;
    delete line.capPrice;
    await saveLine(ctx, estimate, line, now);
    await ctx.db.patch(id, { status: "approved", approvedUnitPrice: price, approvedAt: now, approvedBy: user._id, updatedAt: now });
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: user._id,
      action: "selection_approved",
      resourceType: "estimate",
      resourceId: estimate._id,
      details: { estimateNumber: estimate.estimateNumber, item: item.description, product: pick.name, unitPrice: price },
    });
    return null;
  },
});

/** Undoes an approval: the line goes back to the allowance and the client can pick again. */
export const reopen = mutation({
  args: { id: v.id("selections") },
  handler: async (ctx, { id }) => {
    const { pick, estimate, item } = await pickAndLine(ctx, id);
    if (pick.status !== "approved") return null;
    const now = nowIso();
    const unit = item.allowance!.amount ?? item.unitPrice;
    await saveLine(
      ctx,
      estimate,
      { ...item, unitPrice: unit, totalPrice: item.quantity * unit, allowance: item.allowance!.pickBy ? { pickBy: item.allowance!.pickBy } : {} },
      now,
    );
    await ctx.db.patch(id, { status: "picked", approvedUnitPrice: undefined, approvedAt: undefined, approvedBy: undefined, updatedAt: now });
    return null;
  },
});
