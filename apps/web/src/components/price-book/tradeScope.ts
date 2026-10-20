/**
 * "My trades" in the Price Book: keep items under a cost code for one of the
 * company's trades. Items with no cost code, or a cost code with no trade,
 * can't be placed, so they always stay. With no trades picked, nothing is
 * hidden.
 */
export function inMyTrades<T extends { cost_code_id?: string | null }>(
  items: T[],
  costCodes: Array<{ id: string; industry_id?: string | null; industry?: { id: string } | null }>,
  myTrades: Set<string>,
): T[] {
  if (myTrades.size === 0) return items;
  const tradeOf = new Map(costCodes.map((c) => [c.id, c.industry_id ?? c.industry?.id ?? undefined]));
  return items.filter((item) => {
    if (!item.cost_code_id) return true;
    const trade = tradeOf.get(item.cost_code_id);
    return !trade || myTrades.has(trade);
  });
}
