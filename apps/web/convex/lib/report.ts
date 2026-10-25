import { dollars } from "./wallet";

// The Tolliver Report: a county's week in building permits, demand and
// lead sales. Pure helpers; report.ts gathers the numbers, reportText
// writes them out (for Claude and ChatGPT now, an email later).

export const DAY_MS = 24 * 60 * 60 * 1000;
/** "Where homes are going up" looks back a month: a week is too few permits to show a street. */
export const STREET_DAYS = 30;

/** This week (the last 7 days) and the 7 before it. */
export function weekWindow(now = Date.now()) {
  return {
    from: new Date(now - 7 * DAY_MS).toISOString(),
    priorFrom: new Date(now - 14 * DAY_MS).toISOString(),
    to: new Date(now).toISOString(),
  };
}

type PermitLike = { name: string; workClass?: string; detail?: string; address?: string };

/** A new house: a residential building permit for a single-family home or new construction. */
export function isNewHome(p: PermitLike): boolean {
  if (p.name !== "Residential - Building") return false;
  if (p.workClass === "Single Family") return /carport|storage|shed/i.test(p.detail ?? "") === false;
  return !p.workClass && /^new (construction|residence|home)/i.test(p.detail ?? "");
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** "2837 ROLLING PLAINS LN" → "Rolling Plains Ln". New subdivisions show up as streets with many new homes. */
export function streetOf(address: string | undefined): string | undefined {
  const line = address?.split(",")[0]?.trim();
  if (!line) return undefined;
  const street = line.replace(/^\d+[A-Z]?\s+/i, "").replace(/\s+(apt|unit|#).*$/i, "").trim();
  return street && !/^\d+$/.test(street) ? titleCase(street) : undefined;
}

/** Streets with the most new homes, at least `min` each. */
export function hotStreets(permits: PermitLike[], { min = 2, limit = 6 } = {}) {
  const counts = new Map<string, number>();
  for (const p of permits) {
    if (!isNewHome(p)) continue;
    const street = streetOf(p.address);
    if (street) counts.set(street, (counts.get(street) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([street, newHomes]) => ({ street, newHomes }));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "up 20% on last week", "down 3", "same as last week", "none last week". */
export function versus(now: number, before: number): string {
  if (now === before) return "same as last week";
  if (before === 0) return "none last week";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on last week (${before})`;
}

const central = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", ...opts }).format(Date.parse(iso));

/** "Oct 19 – Oct 25". */
export const weekLabel = (from: string, to: string) =>
  `${central(from, { month: "short", day: "numeric" })} – ${central(to, { month: "short", day: "numeric" })}`;

const shortDay = (iso: string) => central(iso, { month: "short", day: "numeric" });

/** " · (806) 891-1607 · permitting@betenbough.com", or nothing. */
const reach = (c: { phone?: string; email?: string }) => [c.phone, c.email].filter(Boolean).map((x) => ` · ${x}`).join("");

export type Report = {
  county: string;
  trade?: { slug: string; name: string };
  week: { from: string; to: string };
  pro: boolean;
  permits: {
    feed: boolean;
    syncedAt?: string;
    total: number;
    prior: number;
    newHomes: number;
    newHomesPrior: number;
    byTrade: Array<{ slug: string; name: string; count: number; prior: number; mine: boolean }>;
    inMyTrades: number;
    /** Pro only. */
    hotStreets?: Array<{ street: string; newHomes: number }>;
    hotStreetCount: number;
    /** Pro only: this week's permits in the company's trades (or the trade asked about). */
    list?: Array<{
      permitNumber: string;
      address?: string;
      kind: string;
      detail?: string;
      appliedAt: string;
      trades: string[];
      newHome: boolean;
      url?: string;
      builder?: string;
      valuationCents?: number;
    }>;
    /** Companies that pulled permits in the last 30 days (a count for everyone, names on Pro). */
    builderCount: number;
    /** Pro only: who built the most new homes in the last 30 days. */
    builders?: Array<{ name: string; newHomes: number; valuationCents: number; phone?: string; email?: string }>;
    /** Pro only: for each of the company's trades, the contractors pulling those permits in the last 30 days. */
    tradeContractors?: Array<{ trade: string; contractors: Array<{ name: string; permits: number; phone?: string; email?: string }> }>;
  };
  demand: Array<{
    slug: string;
    name: string;
    mine: boolean;
    winningBidCents?: number;
    fundedBidders: number;
    inMarketplace: number;
    inVault: number;
    listed7: number;
    sold30: number;
    avgSoldCents: number | null;
    buyers: number;
  }>;
  sold: {
    count: number;
    prior: number;
    byTrade: Array<{ name: string; count: number; avgCents: number; topCents: number }>;
    medianHoursToSell: number | null;
  };
  /** Pro only. */
  mine?: {
    permitsInMyTrades: number;
    bids: Array<{ name: string; amountCents: number; winning: boolean; paused: boolean }>;
    newLeads: number;
  };
};

/** The report in plain words, for an assistant to read out or summarize. */
export function reportText(r: Report, links: { pro: string; web: string }): string {
  const out: string[] = [];
  const what = r.trade ? ` · ${r.trade.name}` : "";
  out.push(`THE TOLLIVER REPORT · ${r.county} County${what} · ${weekLabel(r.week.from, r.week.to)}`);

  out.push("", "PERMITS");
  if (!r.permits.feed) {
    out.push(`No public permit feed for ${r.county} County yet. Tolliver reads Midland's today and is adding more counties.`);
  } else {
    out.push(`${r.permits.total} filed this week, ${versus(r.permits.total, r.permits.prior)}.`);
    if (!r.trade) out.push(`New homes: ${r.permits.newHomes} (${r.permits.newHomesPrior} the week before).`);
    const trades = r.permits.byTrade.filter((t) => t.count > 0 || t.prior > 0).slice(0, 8);
    if (trades.length && !r.trade) out.push(`By trade: ${trades.map((t) => `${t.name} ${t.count}${t.mine ? " (yours)" : ""}`).join(" · ")}`);
    if (r.pro && r.permits.hotStreets?.length)
      out.push(`Where homes are going up (last 30 days): ${r.permits.hotStreets.map((s) => `${s.street} (${s.newHomes})`).join(", ")}.`);
    else if (!r.pro && r.permits.hotStreetCount)
      out.push(`${r.permits.hotStreetCount} street(s) with several new homes going up this month; the Pro report names them.`);
    if (r.pro && r.permits.builders?.length) {
      out.push("Who's building new homes (last 30 days):");
      for (const b of r.permits.builders)
        out.push(`- ${b.name}: ${b.newHomes} new home${b.newHomes === 1 ? "" : "s"}${b.valuationCents ? `, ${dollars(b.valuationCents)} in permits` : ""}${reach(b)}`);
    }
    if (r.pro && r.permits.tradeContractors?.length) {
      for (const t of r.permits.tradeContractors)
        out.push(`Pulling ${t.trade} permits (last 30 days): ${t.contractors.map((c) => `${c.name} (${c.permits})${reach(c)}`).join("; ")}`);
    }
    if (!r.pro && r.permits.builderCount)
      out.push(`${r.permits.builderCount} builders and contractors pulled permits this month; the Pro report names them and how to reach them.`);
    if (r.pro && r.permits.list?.length) {
      out.push(`This week's permits${r.trade ? ` for ${r.trade.name}` : " in your trades"}:`);
      for (const p of r.permits.list)
        out.push(
          `- ${p.address ?? "No address"} · ${p.newHome ? "New home" : p.kind}${p.detail && !p.newHome ? `: ${p.detail.slice(0, 90)}` : ""}${p.valuationCents ? ` · ${dollars(p.valuationCents)}` : ""}${p.builder ? ` · ${p.builder}` : ""} · ${shortDay(p.appliedAt)}${p.url ? ` · ${p.url}` : ""}`,
        );
    } else if (!r.pro && r.permits.inMyTrades) {
      out.push(`${r.permits.inMyTrades} of them are in your trades. Addresses and what each job is are in the Pro report.`);
    }
    if (r.permits.syncedAt) out.push(`(City of Midland permit records, updated ${shortDay(r.permits.syncedAt)}.)`);
  }

  out.push("", "DEMAND");
  if (!r.demand.length) out.push(`No bids or leads in ${r.county} County yet.`);
  for (const d of r.demand.slice(0, 8)) {
    const parts = [
      d.winningBidCents ? `leads win at ${dollars(d.winningBidCents)} (${d.fundedBidders} funded bid${d.fundedBidders === 1 ? "" : "s"})` : d.buyers ? "no funded bid yet: the next lead goes to the Marketplace" : "no company buys this trade yet",
      d.inMarketplace ? `${d.inMarketplace} for sale in the Marketplace` : "",
      d.inVault ? `${d.inVault} in the Vault` : "",
      d.sold30 ? `${d.sold30} sold in 30 days${d.avgSoldCents ? `, avg ${dollars(d.avgSoldCents)}` : ""}` : "",
    ].filter(Boolean);
    out.push(`- ${d.name}${d.mine ? " (yours)" : ""}: ${parts.join("; ")}`);
  }

  out.push("", "WHAT SOLD");
  if (!r.sold.count) out.push(`No leads sold this week${r.sold.prior ? ` (${r.sold.prior} the week before)` : ""}.`);
  else {
    out.push(`${r.sold.count} lead(s) sold, ${versus(r.sold.count, r.sold.prior)}.${r.sold.medianHoursToSell !== null ? ` Half sold within ${r.sold.medianHoursToSell < 1 ? "the hour" : `${Math.round(r.sold.medianHoursToSell)} hours`} of listing.` : ""}`);
    for (const t of r.sold.byTrade) out.push(`- ${t.name}: ${t.count}, avg ${dollars(t.avgCents)}, top ${dollars(t.topCents)}`);
  }

  if (r.mine) {
    out.push("", "YOUR WEEK");
    out.push(`${r.mine.permitsInMyTrades} permit(s) in your trades; ${r.mine.newLeads} new lead(s) from Tolliver.`);
    for (const b of r.mine.bids)
      out.push(`- Your ${b.name} bid, ${dollars(b.amountCents)}: ${b.paused ? "paused, the balance is below it" : b.winning ? "winning" : "not winning: another company bids more"}`);
    if (!r.mine.bids.length) out.push(`No standing bids in ${r.county} County.`);
  } else if (!r.pro) {
    out.push("", `The full report (permit addresses, where homes are going up, and your own week) comes with the Pro plan: ${links.pro}`);
  }
  return out.join("\n");
}
