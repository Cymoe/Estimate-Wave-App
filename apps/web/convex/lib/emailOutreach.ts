// Email outreach's rules, with no database or network: who can be emailed,
// when each email goes, the footer the law asks for, where replies go, and
// how a reply is read. convex/emailOutreach.ts runs them.

/** How many a mailbox sends a day unless the company picks another number. */
export const DEFAULT_DAILY_CAP = 30;
export const MAX_DAILY_CAP = 200;
/** The follow-ups' days after the first email, when the company leaves them on. */
export const FOLLOW_UP_DAYS = [3, 7];
/** Working hours in Central time, weekdays: when an email goes. */
export const SEND_HOURS = { from: 8, to: 17 };
/** The gap between two sends from one mailbox, before the jitter. */
export const GAP_MS = 3 * 60 * 1000;
export const JITTER_MS = 3 * 60 * 1000;

const ZONE = "America/Chicago";
const parts = (ms: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hour12: false, weekday: "short" })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, weekday: p.weekday };
};
/** The Central day a moment falls on, "2026-11-12": a mailbox's daily count is kept by it. */
export const centralDay = (ms: number) => parts(ms).day;
/** Inside working hours on a weekday, Central. */
export const isOpen = (ms: number) => {
  const p = parts(ms);
  return p.weekday !== "Sat" && p.weekday !== "Sun" && p.hour >= SEND_HOURS.from && p.hour < SEND_HOURS.to;
};
/** The first moment at or after `ms` inside working hours, to the quarter hour. */
export function nextOpen(ms: number): number {
  let t = ms;
  for (let i = 0; i < 7 * 96 && !isOpen(t); i++) t = Math.ceil((t + 1) / 900_000) * 900_000;
  return t;
}

/**
 * When each of `count` emails goes: working hours only, at most `cap` a day
 * counting what's already booked on that day (`booked`, by Central day), a
 * few minutes apart and never in lockstep. `after` is the earliest moment,
 * e.g. the mailbox's last booked send. Pure: `rand` is passed for tests.
 */
export function plan(count: number, opts: { now: number; cap: number; booked?: Record<string, number>; after?: number; rand?: () => number }): number[] {
  const rand = opts.rand ?? Math.random;
  const booked = { ...(opts.booked ?? {}) };
  const times: number[] = [];
  let t = Math.max(opts.now, opts.after ?? 0);
  for (let i = 0; i < count; i++) {
    if (times.length > 0 || (opts.after ?? 0) > opts.now) t += GAP_MS + Math.floor(rand() * JITTER_MS);
    t = nextOpen(t);
    // A full day moves the send to the next day's opening.
    for (let guard = 0; guard < 400 && (booked[centralDay(t)] ?? 0) >= opts.cap; guard++) t = nextOpen(startOfNextDay(t));
    booked[centralDay(t)] = (booked[centralDay(t)] ?? 0) + 1;
    times.push(t);
  }
  return times;
}
const startOfNextDay = (ms: number) => {
  // Step past the end of this Central day, then to the next opening.
  let t = ms;
  const day = centralDay(ms);
  while (centralDay(t) === day) t += 3_600_000;
  return t;
};

// ---- Who can be emailed ----

export type EmailLike = { email: string; verified?: boolean; nameMatch?: boolean; grade?: string };
/** A made-up address from a sample run: example.com and the like are never sent to for real. */
export const isSampleAddress = (email: string) => /@(example\.(com|org|net)|sample\.|test\.)/i.test(email);

/**
 * The address an owner is emailed at: one that belongs to the person named
 * and wasn't flagged undeliverable, a verified one first. Undefined when
 * there's none.
 */
export function addressFor(emails: EmailLike[] | undefined): string | undefined {
  const ok = (emails ?? []).filter((e) => e.nameMatch !== false && e.verified !== false && e.grade !== "F");
  return (ok.find((e) => e.verified) ?? ok[0])?.email.trim().toLowerCase();
}

export type NotEmailed = "no_email" | "bad_email" | "opted_out" | "emailed" | "in_progress";
export const NOT_EMAILED_TEXT: Record<NotEmailed, (n: number) => string> = {
  no_email: (n) => `${n} ${n === 1 ? "has" : "have"} no email yet: find phones & emails first`,
  bad_email: (n) => `${n} ${n === 1 ? "has" : "have"} only an address that failed the check or belongs to someone else`,
  opted_out: (n) => `${n} asked not to be emailed`,
  emailed: (n) => `${n} already emailed`,
  in_progress: (n) => `${n} already in an email being written or sent`,
};

// ---- The footer and the reply address ----

export type OrgPostal = { name: string; address?: string; city?: string; state?: string; zip?: string };
/** The company's postal address, which the law (CAN-SPAM) asks every email to carry; undefined until it's filled in. */
export function postalOf(org: OrgPostal): string | undefined {
  if (!org.address?.trim() || !org.city?.trim() || !org.state?.trim()) return undefined;
  return `${org.address.trim()}, ${org.city.trim()}, ${org.state.trim()}${org.zip?.trim() ? ` ${org.zip.trim()}` : ""}`;
}
export const footerOf = (org: OrgPostal) => {
  const postal = postalOf(org);
  return postal ? `${org.name} · ${postal}` : org.name;
};

/** Where an owner's reply goes when the app catches replies: r-<token>@REPLY_DOMAIN. Undefined until the domain is set. */
export const replyAddress = (token: string, domain = process.env.REPLY_DOMAIN) => (domain ? `r-${token}@${domain}` : undefined);
/** The token in a reply address, from any of the To addresses. */
export function tokenFrom(addresses: string[]): string | undefined {
  for (const a of addresses) {
    const m = a.match(/r-([A-Za-z0-9_-]{8,})@/);
    if (m) return m[1];
  }
  return undefined;
}

// ---- Reading a reply ----

/** An out-of-office or other machine answer: not someone replying. */
export function isAutoReply(subject: string | undefined, headers: Record<string, string | undefined> = {}): boolean {
  const h = (k: string) => Object.entries(headers).find(([key]) => key.toLowerCase() === k)?.[1];
  const auto = h("auto-submitted");
  if (auto && auto.toLowerCase() !== "no") return true;
  if (h("x-autoreply") || h("x-autorespond") || /^(auto_reply|bulk|junk|list)$/i.test(h("precedence") ?? "")) return true;
  return /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|away from|autoreply|undeliverable|delivery status notification)/i.test((subject ?? "").trim());
}

/** The reply's own words: the quoted email and the signature dashes cut off. */
export function replyText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .{4,200} wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim()) || /^From: /.test(line) || line.trim() === "--") break;
    if (line.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").trim().slice(0, 4000);
}

// ---- Resend's webhook signature (Svix) ----

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** Checks a Svix-signed webhook: HMAC-SHA256 of "id.timestamp.body" with the whsec_ secret, within five minutes. */
export async function svixOk(secret: string, headers: { id?: string | null; timestamp?: string | null; signature?: string | null }, body: string, now = Date.now()): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  if (Math.abs(now / 1000 - Number(headers.timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", fromB64(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`)));
  let expected = "";
  for (const b of mac) expected += String.fromCharCode(b);
  expected = btoa(expected);
  return headers.signature.split(" ").some((s) => s.split(",")[1] === expected);
}
