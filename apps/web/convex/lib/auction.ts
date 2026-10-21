// How a lead's price moves after it's listed: it starts high and drops by a
// fixed step on a fixed interval until it reaches the floor, where it stays
// until someone buys it. Pure functions, used by both the backend and the
// Marketplace page (the page ticks the countdown itself, with no refetch).

export const MINUTE_MS = 60 * 1000;
/** How long a lead takes to reach its floor by default (23 hourly drops). */
export const DEFAULT_DROPS = 23;
export const DEFAULT_DROP_EVERY_MS = 60 * MINUTE_MS;
export const MIN_FLOOR_CENTS = 500;
/** No lead lists for less than this (before any job-size scaling). */
export const MIN_START_CENTS = 20000;

/** How big the job is, by what it's likely to cost the homeowner. */
export const SIZES = ["small", "medium", "large"] as const;
export type Size = (typeof SIZES)[number];
/** Dollar ranges the sizes stand for, in words. */
export const SIZE_RANGES: Record<Size, string> = {
  small: "under $2,000",
  medium: "$2,000 to $15,000",
  large: "$15,000 and up",
};
/** What kind of work the lead is. */
export const KINDS = ["new", "remodel", "repair"] as const;
export type Kind = (typeof KINDS)[number];
/** Price multipliers by job size until the admin sets their own. */
export const DEFAULT_SIZE_MULTIPLIERS: Record<Size, number> = {
  small: 0.5,
  medium: 1,
  large: 2,
};

/**
 * A trade's schedule scaled for a job size: start, floor and step move
 * together, so a small job's lead is cheaper all the way down. Nothing goes
 * below the $5 floor, and the step stays at least $1.
 */
export function scalePricing(p: Pricing, multiplier: number): Pricing {
  if (!(multiplier > 0) || multiplier === 1) return p;
  const scale = (cents: number) =>
    Math.max(MIN_FLOOR_CENTS, Math.round(cents * multiplier));
  const startCents = scale(p.startCents);
  return {
    ...p,
    startCents,
    floorCents: Math.min(startCents, scale(p.floorCents)),
    dropCents: Math.max(100, Math.round(p.dropCents * multiplier)),
  };
}

/** The schedule a lead was listed with. All amounts are whole cents. */
export type Auction = {
  startCents: number;
  floorCents: number;
  dropCents: number;
  dropEveryMs: number;
  /** ISO time the lead was listed. */
  listedAt: string;
};

export type Pricing = Omit<Auction, "listedAt">;

/**
 * Fills in a trade's pricing from what the admin set. Only the start price
 * is required (never below `MIN_START_CENTS`): the floor defaults to 20% of
 * it (at least $5), and the step is whatever gets from start to floor in
 * `DEFAULT_DROPS` hourly drops.
 */
export function pricingFor(input: {
  priceCents: number;
  floorCents?: number;
  dropCents?: number;
  dropEveryMinutes?: number;
}): Pricing {
  const startCents = Math.max(MIN_START_CENTS, Math.round(input.priceCents));
  const floorCents = Math.min(
    startCents,
    Math.max(
      input.floorCents != null
        ? Math.round(input.floorCents)
        : Math.round(startCents * 0.2),
      Math.min(MIN_FLOOR_CENTS, startCents),
    ),
  );
  const span = startCents - floorCents;
  const dropCents =
    input.dropCents && input.dropCents > 0
      ? Math.round(input.dropCents)
      : Math.max(100, Math.ceil(span / DEFAULT_DROPS / 100) * 100);
  const dropEveryMs =
    input.dropEveryMinutes && input.dropEveryMinutes > 0
      ? Math.round(input.dropEveryMinutes) * MINUTE_MS
      : DEFAULT_DROP_EVERY_MS;
  return { startCents, floorCents, dropCents, dropEveryMs };
}

/** How many drops it takes to reach the floor. */
export function dropsToFloor(a: Pricing): number {
  if (a.startCents <= a.floorCents || a.dropCents <= 0) return 0;
  return Math.ceil((a.startCents - a.floorCents) / a.dropCents);
}

/** Price after `n` drops, never below the floor. */
export const priceAfterDrops = (a: Pricing, n: number) =>
  Math.max(a.floorCents, a.startCents - a.dropCents * Math.max(0, n));

/** The current price and what happens next. */
export function priceAt(a: Auction, nowMs: number) {
  const listedMs = Date.parse(a.listedAt);
  const elapsed = Math.max(0, nowMs - listedMs);
  const drops = Math.floor(elapsed / a.dropEveryMs);
  const priceCents = priceAfterDrops(a, drops);
  const floorAtMs = listedMs + dropsToFloor(a) * a.dropEveryMs;
  const atFloor = priceCents <= a.floorCents;
  return {
    priceCents,
    atFloor,
    /** When the price next drops, and to what; absent once at the floor. */
    nextDropAtMs: atFloor ? undefined : listedMs + (drops + 1) * a.dropEveryMs,
    nextPriceCents: atFloor ? undefined : priceAfterDrops(a, drops + 1),
    /** When it reaches (or reached) the floor. */
    floorAtMs,
  };
}

/**
 * When the price first drops to `maxCents` or below: a buy order placed at
 * that price fills then. Returns the listing time when it's already there.
 */
export function fillTimeMs(a: Auction, maxCents: number): number {
  const listedMs = Date.parse(a.listedAt);
  if (maxCents >= a.startCents) return listedMs;
  const target = Math.max(maxCents, a.floorCents);
  const drops = Math.ceil((a.startCents - target) / a.dropCents);
  return listedMs + drops * a.dropEveryMs;
}
