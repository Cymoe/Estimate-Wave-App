// The rules a Webb Leads caller works under, as pure functions: when calling
// is allowed, which Do Not Call lists must be current, how numbers are read
// from an uploaded list, and the line read for consent. calls.ts applies them.

// Kept free of server imports: the Ops page parses uploaded lists with numbersIn.
import { consumerBrand } from "./support";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DncList = "national" | "texas";
export const DNC_LISTS: DncList[] = ["national", "texas"];

/**
 * How long an uploaded list counts as current. The FTC's rule: scrub
 * against the national registry at least every 31 days. Texas publishes its
 * no-call list quarterly.
 */
export const DNC_FRESH_DAYS: Record<DncList, number> = { national: 31, texas: 92 };
export const DNC_LABEL: Record<DncList, string> = {
  national: "National Do Not Call list",
  texas: "Texas no-call list",
};

/** No more tries on a number after this many unanswered calls in CALL_WINDOW_DAYS. */
export const MAX_TRIES = 3;
export const CALL_WINDOW_DAYS = 30;

export const OUTCOMES = [
  "no_answer",
  "voicemail",
  "wrong_number",
  "not_interested",
  "callback",
  "do_not_call",
  "lead_taken",
] as const;
export type Outcome = (typeof OUTCOMES)[number];
/** Outcomes where someone picked up. */
export const LIVE: ReadonlySet<Outcome> = new Set(["not_interested", "callback", "do_not_call", "lead_taken"]);
export const OUTCOME_LABEL: Record<Outcome, string> = {
  no_answer: "No answer",
  voicemail: "Left voicemail",
  wrong_number: "Wrong number",
  not_interested: "Not interested",
  callback: "Call back",
  do_not_call: "Don't call again",
  lead_taken: "Lead taken",
};

/**
 * Texas allows telephone solicitation 9am to 9pm Monday to Saturday and noon
 * to 9pm on Sunday (Bus. & Com. Code §301.051), in Central time for Midland.
 */
export function callingHours(ms = Date.now()): { open: boolean; reason?: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(ms);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const opens = weekday === "Sun" ? 12 : 9;
  if (hour >= opens && hour < 21) return { open: true };
  return {
    open: false,
    reason: `Calls are allowed ${weekday === "Sun" ? "noon" : "9am"} to 9pm${weekday === "Sun" ? " on Sundays" : ""}, Central time.`,
  };
}

/** The moment today began in Central time, for "today" counts. */
export function centralMidnight(ms = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(ms);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return ms - (((n("hour") % 24) * 60 + n("minute")) * 60 + n("second")) * 1000 - (ms % 1000);
}

/** Whether an uploaded list is still current, and the day it falls due. */
export function listDue(list: DncList, uploadedAt: string | undefined, now = Date.now()) {
  if (!uploadedAt) return { current: false, dueAt: undefined };
  const dueAt = new Date(Date.parse(uploadedAt) + DNC_FRESH_DAYS[list] * DAY_MS).toISOString();
  return { current: Date.parse(dueAt) > now, dueAt };
}

/**
 * The 10-digit numbers in an uploaded list. The FTC's files have one number
 * a line, sometimes split as area code and number ("432,5550123"); a
 * leading 1 is dropped. Anything else on a line is ignored.
 */
export function numbersIn(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    let digits = line.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length === 10) out.add(digits);
  }
  return [...out];
}

/** The line a caller reads word for word, and that is stored with the lead. The brand is the one homeowners know (consumerBrand). */
export function consentLine(tradeName: string, brand = consumerBrand()): string {
  return `Is it okay if one local ${tradeName.toLowerCase()} company from the ${brand} network calls or texts you at this number about this job?`;
}
