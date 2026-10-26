import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { fail, requireMember } from "./lib/access";
import { queryDef } from "./lib/actor";
import { normalizeCounty } from "./lib/counties";
import { MIDLAND } from "./lib/permits";
import { recentAuctions } from "./lib/foreclosures";
import { planIsActive } from "./lib/plan";
import { isContractor } from "./lib/energov";
import { DAY_MS, STREET_DAYS, hotStreets, isNewHome, median, weekWindow, type Report } from "./lib/report";
import { sameWorld } from "./lib/sales";
import { computeSlots } from "./demand";
import { listStandingDef } from "./bids";

// The Tolliver Report for one company: a county's week in permits, demand
// and lead sales, with the company's own week on top for the Pro plan.
// Read through the Claude / ChatGPT connector (tolliver_report).

async function tradeNames(ctx: QueryCtx) {
  const rows = await ctx.db.query("industries").take(200);
  const bySlug = new Map(rows.map((r) => [r.slug, r.name]));
  return {
    name: (slug: string) => bySlug.get(slug) ?? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "),
    /** A trade from a name or slug ("Roofing", "roofing"), or undefined. */
    find: (text: string) => {
      const t = text.trim().toLowerCase();
      const row = rows.find((r) => r.slug.toLowerCase() === t || r.name.toLowerCase() === t) ?? rows.find((r) => r.name.toLowerCase().includes(t));
      return row ? { slug: row.slug, name: row.name } : undefined;
    },
  };
}

/** The county a company works most: where most of its standing bids are. */
function homeCounty(bids: Doc<"standingBids">[]): string | undefined {
  const counts = new Map<string, number>();
  for (const b of bids) counts.set(b.county, (counts.get(b.county) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const BOUGHT_DAYS = 120;
const pretty = (digits?: string) => (digits && digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits);

/** The next courthouse auction, how the last one went, and the homes bought at it lately. */
async function auction(ctx: QueryCtx, county: string, now: number, pro: boolean): Promise<NonNullable<Report["auction"]>> {
  const [next, ...past] = recentAuctions(now, 6);
  const sale = (date: string) =>
    ctx.db
      .query("foreclosures")
      .withIndex("by_county_and_sale", (q) => q.eq("county", county).eq("saleDate", date))
      .collect();
  const upcoming = await sale(next);
  const last = past[0] ? await sale(past[0]) : [];
  const since = new Date(now - BOUGHT_DAYS * DAY_MS).toISOString().slice(0, 10);
  const bought = [];
  for (const date of past.filter((d) => d >= since)) bought.push(...(await sale(date)).filter((f) => f.status === "sold"));
  const count = (rows: Doc<"foreclosures">[], status: Doc<"foreclosures">["status"]) => rows.filter((f) => f.status === status).length;
  return {
    next: { date: next, posted: upcoming.length },
    last: past[0]
      ? { date: past[0], posted: last.length, sold: count(last, "sold"), backToLender: count(last, "back_to_lender"), cancelled: count(last, "cancelled") }
      : undefined,
    boughtCount: bought.length,
    bought: pro
      ? bought.map((f) => ({
          address: f.address,
          saleDate: f.saleDate,
          priceCents: f.salePriceCents,
          buyer: f.buyer?.company ? f.buyer.name : "a private buyer",
          phone: f.buyer?.company ? pretty(f.buyer.phone) : undefined,
        }))
      : undefined,
  };
}

export const reportDef = queryDef({
  args: { organizationId: v.id("organizations"), county: v.optional(v.string()), trade: v.optional(v.string()) },
  handler: async (ctx, { organizationId, county, trade }): Promise<Report> => {
    const { organization } = await requireMember(ctx, organizationId);
    const now = Date.now();
    const week = weekWindow(now);
    const pro = Boolean(organization.plan && planIsActive(organization.plan, now));
    const myTrades = organization.leadTrades ?? [];
    const myBids = await ctx.db
      .query("standingBids")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    const place = normalizeCounty(county) ?? homeCounty(myBids) ?? MIDLAND.county;
    const names = await tradeNames(ctx);
    const only = trade ? names.find(trade) : undefined;
    if (trade && !only) fail("INVALID", `No trade called ${trade}`);
    const inTrade = (trades: string[]) => !only || trades.includes(only.slug);

    // ---- Permits ----
    const feed = place === MIDLAND.county;
    const streetsFrom = new Date(now - STREET_DAYS * DAY_MS).toISOString();
    const permits = feed
      ? await ctx.db
          .query("permits")
          .withIndex("by_county_and_applied", (q) => q.eq("county", place).gte("appliedAt", streetsFrom < week.priorFrom ? streetsFrom : week.priorFrom))
          .order("desc")
          .take(3000)
      : [];
    const thisWeek = permits.filter((p) => p.appliedAt >= week.from && inTrade(p.trades));
    const lastWeek = permits.filter((p) => p.appliedAt >= week.priorFrom && p.appliedAt < week.from && inTrade(p.trades));
    const tradeCounts = new Map<string, { count: number; prior: number }>();
    for (const [list, field] of [[thisWeek, "count"], [lastWeek, "prior"]] as const)
      for (const p of list)
        for (const t of p.trades) {
          const row = tradeCounts.get(t) ?? { count: 0, prior: 0 };
          row[field]++;
          tradeCounts.set(t, row);
        }
    const mine = (p: Doc<"permits">) => p.trades.some((t) => (only ? t === only.slug : myTrades.includes(t)));
    const month = permits.filter((p) => p.appliedAt >= streetsFrom);
    const streets = hotStreets(month);

    // Who's building: new homes by builder, and the contractors on each of the company's trades.
    const builderTally = new Map<string, { name: string; newHomes: number; valuationCents: number; phone?: string; email?: string }>();
    for (const p of month) {
      if (!p.builder || !isNewHome(p)) continue;
      const key = p.builder.toLowerCase();
      const contact = p.contacts?.find((c) => c.company === p.builder);
      const row = builderTally.get(key) ?? { name: p.builder, newHomes: 0, valuationCents: 0, phone: contact?.phone, email: contact?.email };
      row.newHomes++;
      row.valuationCents += p.valuationCents ?? 0;
      builderTally.set(key, row);
    }
    const companies = new Set(month.flatMap((p) => (p.contacts ?? []).map((c) => c.company.toLowerCase())));
    const tradesToShow = only ? [only.slug] : myTrades;
    const tradeContractors = tradesToShow
      .map((slug) => {
        const tally = new Map<string, { name: string; permits: number; phone?: string; email?: string }>();
        for (const p of month) {
          if (!p.trades.includes(slug)) continue;
          for (const c of (p.contacts ?? []).filter(isContractor)) {
            const row = tally.get(c.company.toLowerCase()) ?? { name: c.company, permits: 0, phone: c.phone, email: c.email };
            row.permits++;
            tally.set(c.company.toLowerCase(), row);
          }
        }
        const contractors = [...tally.values()].sort((a, b) => b.permits - a.permits || a.name.localeCompare(b.name)).slice(0, 3);
        return { trade: names.name(slug), contractors };
      })
      .filter((t) => t.contractors.length > 0);
    const source = feed
      ? await ctx.db
          .query("permitSources")
          .withIndex("by_source", (q) => q.eq("source", MIDLAND.source))
          .unique()
      : null;

    // ---- Demand (no company names: totals and the winning amount only) ----
    const demand = (await computeSlots(ctx, now))
      .filter((s) => s.county === place && (!only || s.jobType === only.slug))
      .map((s) => ({
        slug: s.jobType,
        name: names.name(s.jobType),
        mine: myTrades.includes(s.jobType),
        winningBidCents: s.topFundedCents,
        fundedBidders: s.fundedBidders,
        inMarketplace: s.inMarketplace,
        inVault: s.inVault,
        listed7: s.listed7,
        sold30: s.sold30,
        avgSoldCents: s.avgSoldCents,
        buyers: s.buyers,
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || b.sold30 - a.sold30 || a.name.localeCompare(b.name));

    // ---- What sold ----
    const soldLeads = (
      await Promise.all(
        (["assigned", "credited"] as const).map((status) =>
          ctx.db
            .query("marketplaceLeads")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(1000),
        ),
      )
    )
      .flat()
      .filter((l) => l.county === place && l.assignedAt && l.assignedAt >= week.priorFrom && sameWorld(organization, l) && inTrade(l.jobType ? [l.jobType] : []));
    const soldNow = soldLeads.filter((l) => l.assignedAt! >= week.from);
    const byTrade = new Map<string, number[]>();
    for (const l of soldNow) {
      const list = byTrade.get(l.jobType ?? "") ?? [];
      list.push(l.priceCents ?? 0);
      byTrade.set(l.jobType ?? "", list);
    }
    const hours = soldNow.map((l) => (Date.parse(l.assignedAt!) - Date.parse(l.auction?.listedAt ?? l.createdAt)) / 3_600_000).filter((h) => h >= 0);

    const report: Report = {
      county: place,
      trade: only,
      week: { from: week.from, to: week.to },
      pro,
      permits: {
        feed,
        syncedAt: source?.syncedAt,
        total: thisWeek.length,
        prior: lastWeek.length,
        newHomes: thisWeek.filter(isNewHome).length,
        newHomesPrior: lastWeek.filter(isNewHome).length,
        byTrade: [...tradeCounts.entries()]
          .map(([slug, c]) => ({ slug, name: names.name(slug), ...c, mine: myTrades.includes(slug) }))
          .sort((a, b) => b.count - a.count || Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name)),
        inMyTrades: thisWeek.filter(mine).length,
        hotStreetCount: streets.length,
        hotStreets: pro ? streets : undefined,
        builderCount: companies.size,
        builders: pro ? [...builderTally.values()].sort((a, b) => b.newHomes - a.newHomes || a.name.localeCompare(b.name)).slice(0, 6) : undefined,
        tradeContractors: pro ? tradeContractors : undefined,
        list: pro
          ? thisWeek
              .filter(mine)
              .slice(0, 25)
              .map((p) => ({
                permitNumber: p.permitNumber,
                address: p.address,
                kind: p.workClass ? `${p.name} (${p.workClass})` : p.name,
                detail: p.detail,
                appliedAt: p.appliedAt,
                trades: p.trades.map(names.name),
                newHome: isNewHome(p),
                url: p.url,
                builder: p.builder,
                valuationCents: p.valuationCents,
              }))
          : undefined,
      },
      demand,
      sold: {
        count: soldNow.length,
        prior: soldLeads.length - soldNow.length,
        byTrade: [...byTrade.entries()]
          .map(([slug, cents]) => ({
            name: slug ? names.name(slug) : "Other",
            count: cents.length,
            avgCents: Math.round(cents.reduce((a, b) => a + b, 0) / cents.length),
            topCents: Math.max(...cents),
          }))
          .sort((a, b) => b.count - a.count),
        medianHoursToSell: median(hours),
      },
    };

    if (feed) report.auction = await auction(ctx, place, now, pro);

    if (pro) {
      const standing = (await listStandingDef.handler(ctx, { organizationId })).filter((b) => b.county === place && inTrade([b.jobType]));
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(2000);
      report.mine = {
        permitsInMyTrades: report.permits.inMyTrades,
        bids: standing.map((b) => ({ name: names.name(b.jobType), amountCents: b.amountCents, winning: b.leading, paused: !b.funded })),
        newLeads: leads.filter((l) => l.marketplaceLeadId && (l.assignedAt ?? l.createdAt) >= week.from && (!only || l.jobType === only.slug)).length,
      };
    }
    return report;
  },
});

/** The report for the web app, when it gets a page. */
export const report = query(reportDef);
