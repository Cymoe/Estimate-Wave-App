import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso } from "./lib/access";
import { withTotals } from "./lib/documents";
import { allowanceViews, cleanLink, selectionsFor } from "./lib/selections";
import { changesSince } from "./signoffs";
import { cents } from "./lib/totals";

// Selections on the project: the signed estimates' allowance lines (tile, a
// faucet) and what the client picked for each. The company asks the client
// (it shows in their portal) or enters the pick itself; approving a pick sets
// the line to its price, and the difference goes on the next change order.

type Line = Doc<"estimates">["items"][number];

/** The project's signed estimates that have allowance lines, each with its lines and the picks. */
export const forProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await getOwned(ctx, "projects", projectId);
    const estimates = await ctx.db
      .query("estimates")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(100);
    const out = [];
    for (const estimate of estimates) {
      if (!estimate.contractLockedAt || !estimate.items.some((i) => i.allowance)) continue;
      const allowances = allowanceViews(estimate.items, await selectionsFor(ctx, estimate));
      const signoffs = await ctx.db
        .query("signoffs")
        .withIndex("by_estimate", (q) => q.eq("estimateId", estimate._id))
        .take(100);
      out.push({
        estimateId: estimate._id,
        estimateNumber: estimate.estimateNumber,
        title: estimate.title,
        allowances,
        // How far the approved picks come to over (+) or under (−) their allowances.
        picksDifference: cents(allowances.reduce((sum, a) => sum + (a.pick?.status === "approved" ? (a.pick.difference ?? 0) : 0), 0)),
        // Everything that changed since the client last signed (what a change order would list).
        changes: estimate.contractSnapshot ? changesSince(estimate.contractSnapshot.items, estimate.items).length : 0,
        changeOrderQueued: estimate.changeOrderQueuedAt !== undefined,
        changeOrderWaiting: signoffs.some((x) => x.kind === "change_order" && x.status === "sent"),
      });
    }
    return out;
  },
});

/** A signed estimate's allowance line, and its selection row if it has one. */
async function signedLine(ctx: MutationCtx, estimateId: Id<"estimates">, itemId: string) {
  const { doc: estimate, user } = await getOwned(ctx, "estimates", estimateId);
  if (!estimate.contractLockedAt) fail("INVALID", "Selections start once the estimate is signed");
  const item = estimate.items.find((i) => i._id === itemId && i.allowance);
  if (!item) fail("INVALID", "That allowance isn't on the estimate any more");
  const row = (await selectionsFor(ctx, estimate)).find((p) => p.itemId === itemId) ?? null;
  return { estimate, item, user, row };
}

async function pickAndLine(ctx: MutationCtx, id: Id<"selections">) {
  const pick = await ctx.db.get(id);
  if (pick === null) fail("NOT_FOUND", "Not found");
  const { estimate, item, user } = await signedLine(ctx, pick.estimateId, pick.itemId);
  return { pick, estimate, item, user };
}

/** Saves the estimate with one line replaced, totals recalculated. */
async function saveLine(ctx: MutationCtx, estimate: Doc<"estimates">, line: Line, now: string) {
  const items = estimate.items.map((i) => (i._id === line._id ? line : i));
  const { subtotal, discountAmount, taxAmount, totalAmount } = withTotals({ ...estimate, items });
  await ctx.db.patch(estimate._id, { items, subtotal, discountAmount, taxAmount, totalAmount, updatedAt: now });
}

const cleanPrice = (unitPrice: number) => {
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10_000_000) fail("INVALID", "Enter the price, $0 or more");
  return Math.round(unitPrice * 100) / 100;
};

/**
 * The line takes the pick's price; the allowance it had is kept. It's the
 * client's choice now, not the price book's, so there's no red line or cap.
 */
async function priceLine(ctx: MutationCtx, estimate: Doc<"estimates">, item: Line, price: number, now: string) {
  const line = {
    ...item,
    unitPrice: price,
    totalPrice: item.quantity * price,
    allowance: { ...item.allowance, amount: item.allowance!.amount ?? item.unitPrice },
  };
  delete line.redLinePrice;
  delete line.capPrice;
  await saveLine(ctx, estimate, line, now);
}

/** When the client needs to pick by (YYYY-MM-DD), or null for no date. */
export const setPickBy = mutation({
  args: { estimateId: v.id("estimates"), itemId: v.string(), pickBy: v.union(v.string(), v.null()) },
  handler: async (ctx, { estimateId, itemId, pickBy }) => {
    if (pickBy !== null && !/^\d{4}-\d{2}-\d{2}$/.test(pickBy)) fail("INVALID", "Pick a date");
    const { estimate, item } = await signedLine(ctx, estimateId, itemId);
    const allowance = { ...item.allowance! };
    if (pickBy) allowance.pickBy = pickBy;
    else delete allowance.pickBy;
    await saveLine(ctx, estimate, { ...item, allowance }, nowIso());
    return null;
  },
});

/**
 * Asks the client to pick this one. It waits for the next "Send to client"
 * from the portal preview; until then the client doesn't see it.
 */
export const ask = mutation({
  args: { estimateId: v.id("estimates"), itemId: v.string() },
  handler: async (ctx, { estimateId, itemId }) => {
    const { estimate, row } = await signedLine(ctx, estimateId, itemId);
    if (row?.status === "approved") fail("INVALID", "This one is already approved. Reopen it first.");
    const now = nowIso();
    if (row) await ctx.db.patch(row._id, { queuedAt: now, updatedAt: now });
    else
      await ctx.db.insert("selections", {
        organizationId: estimate.organizationId,
        estimateId,
        itemId,
        status: "asked",
        queuedAt: now,
        updatedAt: now,
      });
    return null;
  },
});

/** Takes a pick off the next send: one never sent goes back to not asked. */
export const unqueue = mutation({
  args: { estimateId: v.id("estimates"), itemId: v.string() },
  handler: async (ctx, { estimateId, itemId }) => {
    const { row } = await signedLine(ctx, estimateId, itemId);
    if (!row?.queuedAt) return null;
    if (row.status === "asked" && !row.askedAt) await ctx.db.delete(row._id);
    else await ctx.db.patch(row._id, { queuedAt: undefined, updatedAt: nowIso() });
    return null;
  },
});

/** Puts the changes since the client last signed on the next send, as a change order to sign. */
export const queueChangeOrder = mutation({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    const { doc: estimate } = await getOwned(ctx, "estimates", estimateId);
    if (estimate.status !== "accepted" || !estimate.contractSnapshot) fail("INVALID", "Send it once the client has signed the estimate");
    if (changesSince(estimate.contractSnapshot.items, estimate.items).length === 0)
      fail("INVALID", "Nothing has changed since the client last signed");
    await ctx.db.patch(estimateId, { changeOrderQueuedAt: nowIso() });
    return null;
  },
});

export const unqueueChangeOrder = mutation({
  args: { estimateId: v.id("estimates") },
  handler: async (ctx, { estimateId }) => {
    await getOwned(ctx, "estimates", estimateId);
    await ctx.db.patch(estimateId, { changeOrderQueuedAt: undefined });
    return null;
  },
});

/**
 * The company enters the client's pick itself (from the showroom, a text, a
 * call): a link or a name, and the price. Entering it approves it.
 */
export const record = mutation({
  args: {
    estimateId: v.id("estimates"),
    itemId: v.string(),
    url: v.optional(v.string()),
    name: v.optional(v.string()),
    unitPrice: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { estimateId, itemId, url, name, unitPrice, note }) => {
    const price = cleanPrice(unitPrice);
    const link = url?.trim() ? cleanLink(url) : undefined;
    if (link === null) fail("INVALID", "That link doesn't look right");
    const label = name?.trim().slice(0, 200) || undefined;
    if (!link && !label) fail("INVALID", "Add a link or say what it is");
    const { estimate, item, user, row } = await signedLine(ctx, estimateId, itemId);
    const now = nowIso();
    const fields = {
      url: link,
      name: label,
      unitPrice: price,
      note: note?.trim().slice(0, 500) || undefined,
      status: "approved" as const,
      enteredBy: user._id,
      pickedAt: now,
      approvedUnitPrice: price,
      approvedAt: now,
      approvedBy: user._id,
      updatedAt: now,
    };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("selections", { organizationId: estimate.organizationId, estimateId, itemId, ...fields });
    await priceLine(ctx, estimate, item, price, now);
    await logActivity(ctx, {
      organizationId: estimate.organizationId,
      userId: user._id,
      action: "selection_approved",
      resourceType: "estimate",
      resourceId: estimate._id,
      details: { estimateNumber: estimate.estimateNumber, item: item.description, product: label, unitPrice: price },
    });
    return null;
  },
});

/**
 * Approves the client's pick at a price per unit (what they sent, or the
 * company's own, say with delivery). The line takes that price; the
 * difference goes on the next change order.
 */
export const approve = mutation({
  args: { id: v.id("selections"), unitPrice: v.number() },
  handler: async (ctx, { id, unitPrice }) => {
    const price = cleanPrice(unitPrice);
    const { pick, estimate, item, user } = await pickAndLine(ctx, id);
    if (pick.status === "asked") fail("INVALID", "The client hasn't picked yet");
    const now = nowIso();
    await priceLine(ctx, estimate, item, price, now);
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

/** Undoes an approval: the line goes back to the allowance and the pick waits again. */
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
