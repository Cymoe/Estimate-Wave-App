// What a client gets back once their job is done: the warranty's end date,
// worked out from the agreement's wording, and their referral code.

/**
 * Months in a warranty period as the agreement words it ("1 year",
 * "18 months", "90 days", "2 años", "lifetime"). Null when it can't be read
 * (then the portal shows the wording without an end date).
 */
export function warrantyMonths(period: string | undefined): number | null {
  const text = (period ?? "").trim().toLowerCase();
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(year|yr|año|ano|month|mo|mes|week|wk|semana|day|día|dia)/,
  );
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[2];
  if (/^(year|yr|año|ano)/.test(unit)) return n * 12;
  if (/^(month|mo|mes)/.test(unit)) return n;
  if (/^(week|wk|semana)/.test(unit)) return (n * 7) / 30.4375;
  return n / 30.4375;
}

/** The day (YYYY-MM-DD) a warranty from `from` ends, or undefined when its wording can't be read. */
export function warrantyEnds(
  from: string,
  period: string | undefined,
): string | undefined {
  const months = warrantyMonths(period);
  if (months === null) return undefined;
  const start = new Date(from.length === 10 ? `${from}T12:00:00Z` : from);
  if (Number.isNaN(start.getTime())) return undefined;
  const whole = Math.floor(months);
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + whole, 1),
  );
  // Keep the day of the month, or the month's last day when it's shorter (Jan 31 + 1 month = Feb 28).
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  end.setUTCDate(end.getUTCDate() + Math.round((months - whole) * 30.4375));
  return end.toISOString().slice(0, 10);
}

const CODE_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

/** A short code for a referral link: easy to read out, no 0/o or 1/l. */
export function newReferralCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join(
    "",
  );
}

/** First name for "Ann sent you", so the friend never sees the full name. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
