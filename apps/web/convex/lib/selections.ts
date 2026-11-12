import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { cents } from "./totals";

// Allowances: lines on an estimate the client picks the product for (tile, a
// faucet). The line's price is what's included; the client sends a link to
// what they chose, and once the company approves it at a price the line takes
// that price, so going over or under shows on the next change order.

type Item = Doc<"estimates">["items"][number];

/** What's included per unit: the price before the pick was approved, else the line's price now. */
export const allowanceUnitPrice = (item: Item) => item.allowance?.amount ?? item.unitPrice;

export async function selectionsFor(ctx: QueryCtx | MutationCtx, estimate: Doc<"estimates">) {
  return await ctx.db
    .query("selections")
    .withIndex("by_estimate", (q) => q.eq("estimateId", estimate._id))
    .take(200);
}

/**
 * Each allowance line with what it includes and the client's pick: what they
 * sent, the approved price, and how far over (+) or under (−) the allowance it
 * comes to (from their own price until it's approved).
 */
export function allowanceViews(items: Item[], picks: Doc<"selections">[]) {
  return items
    .filter((item) => item.allowance)
    .map((item) => {
      const unit = allowanceUnitPrice(item);
      const pick = picks.find((p) => p.itemId === item._id);
      const pickedPrice = pick?.status === "approved" ? pick.approvedUnitPrice : pick?.status === "picked" ? pick.unitPrice : undefined;
      return {
        itemId: item._id,
        description: item.description,
        category: item.category,
        quantity: item.quantity,
        allowanceUnitPrice: unit,
        allowanceTotal: cents(unit * item.quantity),
        pickBy: item.allowance?.pickBy,
        pick: pick
          ? {
              id: pick._id,
              url: pick.url,
              name: pick.name,
              unitPrice: pick.unitPrice,
              note: pick.note,
              status: pick.status,
              askedAt: pick.askedAt,
              queued: pick.queuedAt !== undefined,
              entered: pick.enteredBy !== undefined,
              pickedAt: pick.pickedAt,
              approvedAt: pick.approvedAt,
              approvedUnitPrice: pick.approvedUnitPrice,
              difference: pickedPrice === undefined ? undefined : cents((pickedPrice - unit) * item.quantity),
            }
          : undefined,
      };
    });
}

/** A product link the client pasted: http(s) only, so it can't run anything when opened. */
export function cleanLink(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > 2000) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
