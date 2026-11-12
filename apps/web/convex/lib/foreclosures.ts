// Midland's courthouse foreclosure auction, as pure functions. Texas holds
// foreclosure sales on the first Tuesday of the month (Prop. Code §51.002),
// or the Wednesday after when that Tuesday is January 1 or July 4. Staff
// type in each month's posted homes from the county clerk's public search;
// nothing here reads that site. Kept free of server imports for the Ops page.

const pad = (n: number) => String(n).padStart(2, "0");

/** The auction day of a month ("2026-11-03"); month is 1–12. */
export function auctionDay(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const day = 1 + ((2 - first.getUTCDay() + 7) % 7);
  const holiday = (month === 1 || month === 7) && day === (month === 1 ? 1 : 4);
  return `${year}-${pad(month)}-${pad(holiday ? day + 1 : day)}`;
}

/** Whether a "YYYY-MM-DD" date is an auction day. */
export function isAuctionDay(date: string): boolean {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return Boolean(m) && auctionDay(Number(m![1]), Number(m![2])) === date;
}

/** The next auction on or after today (Central time). */
export function nextAuction(ms = Date.now()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  const [y, m] = today.split("-").map(Number);
  const thisMonth = auctionDay(y, m);
  return thisMonth >= today ? thisMonth : m === 12 ? auctionDay(y + 1, 1) : auctionDay(y, m + 1);
}

/** The auction days around a date: the last few and the next, newest first. */
export function recentAuctions(ms = Date.now(), count = 6): string[] {
  const next = nextAuction(ms);
  let [y, m] = next.split("-").map(Number);
  const out = [next];
  while (out.length < count) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    out.push(auctionDay(y, m));
  }
  return out;
}

/** The addresses in a pasted block: one a line, trimmed, blanks and repeats dropped. */
export function parseAddresses(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    const key = line.toUpperCase();
    if (line && !seen.has(key)) {
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

/** "2026-11-03" → "Nov 3". */
export function saleLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
