import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Item = Doc<"estimates">["items"][number];

/**
 * Fills in each item's category: the trade of its price book line item
 * (e.g. "Painting"), so a client sees labor and materials for the same work
 * as one line. Items not from the price book keep whatever category they have.
 */
export async function withCategories<T extends Item>(
  ctx: QueryCtx | MutationCtx,
  items: T[],
): Promise<T[]> {
  const trades = new Map<string, string | undefined>();
  const tradeOf = async (productId: string) => {
    if (!trades.has(productId)) {
      const lineItemId = ctx.db.normalizeId("lineItems", productId);
      const lineItem = lineItemId ? await ctx.db.get(lineItemId) : null;
      const costCode = lineItem
        ? await ctx.db.get(lineItem.cost_code_id)
        : null;
      const slug = costCode?.industry_id;
      const industry = slug
        ? await ctx.db
            .query("industries")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .first()
        : null;
      trades.set(productId, industry?.name || undefined);
    }
    return trades.get(productId);
  };
  return await Promise.all(
    items.map(async (item) => {
      if (!item.productId) return item;
      const category = await tradeOf(item.productId);
      return category && category !== item.category
        ? { ...item, category }
        : item;
    }),
  );
}
