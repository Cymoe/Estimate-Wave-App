import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Item = Doc<"estimates">["items"][number];

/**
 * Fills in each item's category from its price book line item's cost code
 * (e.g. "Interior Painting"). Items already categorised, or not from the
 * price book, are left as they are.
 */
export async function withCategories<T extends Item>(
  ctx: QueryCtx | MutationCtx,
  items: T[],
): Promise<T[]> {
  const names = new Map<string, string | undefined>();
  const categoryOf = async (productId: string) => {
    if (!names.has(productId)) {
      const lineItemId = ctx.db.normalizeId("lineItems", productId);
      const lineItem = lineItemId ? await ctx.db.get(lineItemId) : null;
      const costCode = lineItem
        ? await ctx.db.get(lineItem.cost_code_id)
        : null;
      names.set(productId, costCode?.name || undefined);
    }
    return names.get(productId);
  };
  return await Promise.all(
    items.map(async (item) => {
      if (item.category || !item.productId) return item;
      const category = await categoryOf(item.productId);
      return category ? { ...item, category } : item;
    }),
  );
}
