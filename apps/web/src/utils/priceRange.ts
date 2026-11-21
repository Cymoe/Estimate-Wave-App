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

export interface PricingOption {
  id: string;
  name: string;
  position: number; // Price position: 0.0 (redline) to 1.0 (cap)
}

/** Pricing options, as positions between red line (0) and cap (1). */
export const PRICING_OPTIONS: PricingOption[] = [
  { 
    id: 'cap', 
    name: 'CAP Price (100%)', 
    position: 1.0 // CAP pricing (maximum)
  },
  { 
    id: 'busy', 
    name: 'Busy Season (60%)', 
    position: 0.6 // Busy season pricing (+20% margin)
  },
  { 
    id: 'competitive', 
    name: 'Competitive (35%)', 
    position: 0.35 // Competitive pricing
  },
  { 
    id: 'slow', 
    name: 'Slow Season (25%)', 
    position: 0.25 // Slow season discount
  },
  { 
    id: 'need', 
    name: 'Need Job (10%)', 
    position: 0.1 // Need this job (minimal margin)
  },
  { 
    id: 'redline', 
    name: 'Redline (0%)', 
    position: 0.0 // Redline (sales rep makes $0)
  }
];
