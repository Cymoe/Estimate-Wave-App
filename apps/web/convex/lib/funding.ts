// Shared with the web app (the funding page), so keep this file free of imports.

/** The least a company can load at once: $5,000. */
export const MIN_FUNDING_CENTS = 500_000;

/** The amounts offered on the funding page, with the bonus each earns. */
export const FUNDING_TIERS = [
  { amountCents: 500_000, bonusPercent: 0 },
  { amountCents: 750_000, bonusPercent: 5 },
  { amountCents: 1_000_000, bonusPercent: 10, popular: true },
] as const;

/** Bonus credit for loading this amount: +5% from $7,500, +10% from $10,000. */
export function bonusFor(amountCents: number): number {
  if (amountCents >= 1_000_000) return Math.round(amountCents * 0.1);
  if (amountCents >= 750_000) return Math.round(amountCents * 0.05);
  return 0;
}
