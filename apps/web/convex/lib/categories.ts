import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { workTypeOf } from "./workTypes";

type Item = Doc<"estimates">["items"][number];

/**
 * Fills in each item's category, which the agreement's scope, its price
 * table and the client's summary group by:
 * - one the contractor chose stays;
 * - a price book item takes its trade (e.g. "Painting"), kept up to date;
 * - any other line keeps the category it has, or gets its type of work,
 *   read from its wording (lib/workTypes.ts).
 */
export async function withCategories<T extends Item>(ctx: QueryCtx | MutationCtx, items: T[]): Promise<T[]> {
  const trades = new Map<string, string | undefined>();
  const tradeOf = async (productId: string) => {
    if (!trades.has(productId)) {
      const lineItemId = ctx.db.normalizeId("lineItems", productId);
      const lineItem = lineItemId ? await ctx.db.get(lineItemId) : null;
      const costCode = lineItem ? await ctx.db.get(lineItem.cost_code_id) : null;
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
      if (item.categoryChosen && item.category?.trim()) return item;
      const trade = item.productId ? await tradeOf(item.productId) : undefined;
      if (trade) return trade === item.category ? item : { ...item, category: trade };
      if (item.category?.trim()) return item;
      return { ...item, category: workTypeOf(item.description) };
    }),
  );
}
