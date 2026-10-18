// The monthly plan: Estimates, Price Book, Projects and the Older leads
// pool, paid from the company's lead balance. Pure helpers; the mutations
// that charge and change plans live in marketplace.ts.
import type { Doc } from "../_generated/dataModel";

export type Plan = NonNullable<Doc<"organizations">["plan"]>;

/** What a company gets unless an admin sets something else. */
export const DEFAULT_PLAN = {
  monthlyCents: 9900,
  claimsIncluded: 10,
  extraClaimCents: 1500,
};

export const TRIAL_DAYS = 30;
/** A Marketplace lead nobody bought in this long moves to Older leads. */
export const OLDER_AFTER_DAYS = 7;
/** An older lead this old is archived. */
export const ARCHIVE_AFTER_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The same time of day one month on (clamped to the month's last day). */
export function nextMonth(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/** A fresh trial starting now. */
export function trialPlan(nowIso: string): Plan {
  return {
    ...DEFAULT_PLAN,
    status: "trial",
    periodStart: nowIso,
    nextChargeAt: new Date(
      Date.parse(nowIso) + TRIAL_DAYS * DAY_MS,
    ).toISOString(),
    claimsThisPeriod: 0,
  };
}

/**
 * Whether the plan's features are open right now: on an unexpired trial, on
 * an active plan, or cancelled with the paid period not over yet.
 */
export function planIsActive(plan: Plan | undefined, nowMs: number): boolean {
  if (!plan) return false;
  if (plan.status === "active") return true;
  if (plan.status === "past_due") return false;
  return Date.parse(plan.nextChargeAt) > nowMs;
}

/** What the next claim costs: nothing until the allowance is used up. */
export function claimPrice(plan: Plan): number {
  return plan.claimsThisPeriod < plan.claimsIncluded ? 0 : plan.extraClaimCents;
}

export function claimsLeft(plan: Plan): number {
  return Math.max(0, plan.claimsIncluded - plan.claimsThisPeriod);
}
