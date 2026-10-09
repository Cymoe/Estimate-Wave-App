/** A price-book item's pricing range. */
export interface PriceRange {
  /** The floor: the business's minimum price. */
  redLine: number;
  /** The ceiling: where new estimates start. */
  cap: number;
}

type PricedItem = {
  red_line_price?: number | null;
  cap_price?: number | null;
  base_price?: number | null;
  price?: number | null;
};

/**
 * Red line and cap for a price-book item. Items without a range (custom
 * items with one price) use that price for both.
 */
export function priceRange(item: PricedItem): PriceRange {
  const redLine = item.red_line_price ?? item.base_price ?? item.price ?? 0;
  const cap = Math.max(item.cap_price ?? redLine, redLine);
  return { redLine, cap };
}

/** Price at a position between red line (0) and cap (1). */
export function priceAt(range: PriceRange, position: number): number {
  return Math.round((range.redLine + (range.cap - range.redLine) * position) * 100) / 100;
}
