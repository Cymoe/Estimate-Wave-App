import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, nowIso, requireStaff, requireSuperAdmin } from "./lib/access";

/**
 * The demand board: for every county and trade, how many companies have a
 * bid their balance can pay, what the top bid is, and how many leads those
 * balances can absorb before new leads fall into the falling-price
 * Marketplace. Against that, what a lead costs to generate. VAs run ads in
 * the slots with margin and depth, and pause where leads sit unsold.
 */

/** What a confirmation call costs in staff time, per lead (planning number). */
export const VA_COST_CENTS = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const key = (county: string, jobType: string) => `${county}\u0000${jobType}`;

interface Slot {
  county: string;
  jobType: string;
  bidders: number;
  fundedBidders: number;
  topFundedCents?: number;
  secondFundedCents?: number;
  depthLeads: number;
  listed7: number;
  listed30: number;
  soldAtAward30: number;
  inMarketplace: number;
  inVault: number;
}

/** Works the whole board out from the live tables. Small tables, so a full scan is fine for now. */
export async function computeSlots(ctx: QueryCtx | MutationCtx, now = Date.now()): Promise<Slot[]> {
  const slots = new Map<string, Slot>();
  const slot = (county: string, jobType: string) => {
    const k = key(county, jobType);
    let s = slots.get(k);
    if (!s) {
      s = { county, jobType, bidders: 0, fundedBidders: 0, depthLeads: 0, listed7: 0, listed30: 0, soldAtAward30: 0, inMarketplace: 0, inVault: 0 };
      slots.set(k, s);
    }
    return s;
  };

  // Bids, grouped; balances read once per company.
  const bids = await ctx.db.query("standingBids").take(5000);
  const orgs = new Map<Id<"organizations">, Doc<"organizations"> | null>();
  const org = async (id: Id<"organizations">) => {
    if (!orgs.has(id)) orgs.set(id, await ctx.db.get(id));
    return orgs.get(id)!;
  };
  const funded = new Map<string, number[]>();
  for (const bid of bids) {
    const company = await org(bid.organizationId);
    if (!company?.isActive) continue;
    const s = slot(bid.county, bid.jobType);
    s.bidders++;
    const balance = company.walletBalanceCents ?? 0;
    if (balance >= bid.amountCents) {
      s.fundedBidders++;
      s.depthLeads += Math.floor(balance / bid.amountCents);
      const list = funded.get(key(bid.county, bid.jobType)) ?? [];
      list.push(bid.amountCents);
      funded.set(key(bid.county, bid.jobType), list);
    }
  }
  for (const [k, amounts] of funded) {
    const sorted = amounts.sort((a, b) => b - a);
    const s = slots.get(k)!;
    s.topFundedCents = sorted[0];
    s.secondFundedCents = sorted[1];
  }

  // Leads: listed in the last 7 and 30 days, sold at award, sitting unsold.
  const since7 = new Date(now - 7 * DAY_MS).toISOString();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();
  const leads = await ctx.db.query("marketplaceLeads").order("desc").take(5000);
  const leadSlot = new Map<Id<"marketplaceLeads">, Slot>();
  for (const lead of leads) {
    if (!lead.county || !lead.jobType || lead.isSample) continue;
    const s = slot(lead.county, lead.jobType);
    leadSlot.set(lead._id, s);
    if (lead.createdAt >= since30) s.listed30++;
    if (lead.createdAt >= since7) s.listed7++;
    if (lead.status === "available") s.inMarketplace++;
    if (lead.status === "older") s.inVault++;
  }
  const awards = (await ctx.db.query("leadBids").order("desc").take(5000)).filter(
    (b) => b.kind === "award" && b.status === "filled" && b.createdAt >= since30,
  );
  for (const award of awards) {
    const s = leadSlot.get(award.marketplaceLeadId);
    if (s) s.soldAtAward30++;
  }

  // Only slots with something in them: a bid, or a lead this month, or one waiting.
  return [...slots.values()].filter((s) => s.bidders > 0 || s.listed30 > 0 || s.inMarketplace > 0 || s.inVault > 0);
}

/**
 * The Refresh button. The board reads live now, so this only clears the
 * snapshot rows an earlier version wrote (the table goes once it's empty)
 * and says how many slots there are.
 */
export const refresh = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    for (const old of await ctx.db.query("demandSnapshots").take(5000)) await ctx.db.delete(old._id);
    return { slots: (await computeSlots(ctx)).length };
  },
});

/** What a lead costs to generate in a trade, for the margin column. Owner only. */
export const setPlanCpl = mutation({
  args: { jobType: v.string(), cents: v.union(v.number(), v.null()) },
  handler: async (ctx, { jobType, cents }) => {
    await requireSuperAdmin(ctx);
    const existing = await ctx.db
      .query("demandSettings")
      .withIndex("by_job_type", (q) => q.eq("jobType", jobType))
      .unique();
    if (cents === null) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    if (!Number.isFinite(cents) || cents < 0) fail("INVALID", "Enter a cost per lead");
    const planCplCents = Math.round(cents);
    if (existing) await ctx.db.patch(existing._id, { planCplCents, updatedAt: nowIso() });
    else await ctx.db.insert("demandSettings", { jobType, planCplCents, updatedAt: nowIso() });
    return null;
  },
});

/** The grid: every slot with its planning numbers and margin. */
export const board = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    // Live, not a snapshot: a bid changed a second ago shows here now.
    const rows = await computeSlots(ctx);
    const settings = await ctx.db.query("demandSettings").take(500);
    const plan = new Map(settings.map((s) => [s.jobType, s.planCplCents]));
    const trades = await ctx.db.query("industries").take(500);
    const tradeName = new Map(trades.map((t) => [t.slug, t.name]));
    return {
      vaCostCents: VA_COST_CENTS,
      planCpl: Object.fromEntries(plan),
      slots: rows
        .map((r) => {
          const cpl = plan.get(r.jobType);
          const marginCents = r.topFundedCents !== undefined && cpl !== undefined ? r.topFundedCents - cpl - VA_COST_CENTS : null;
          return {
            county: r.county,
            jobType: r.jobType,
            tradeName: tradeName.get(r.jobType) ?? r.jobType,
            bidders: r.bidders,
            fundedBidders: r.fundedBidders,
            topFundedCents: r.topFundedCents,
            secondFundedCents: r.secondFundedCents,
            depthLeads: r.depthLeads,
            listed7: r.listed7,
            listed30: r.listed30,
            soldAtAward30: r.soldAtAward30,
            inMarketplace: r.inMarketplace,
            inVault: r.inVault,
            planCplCents: cpl,
            marginCents,
            // Green: worth running ads. Amber: bids nobody can pay. Red: leads sitting unsold. Grey: nothing.
            state:
              r.inMarketplace + r.inVault > 0
                ? ("oversupplied" as const)
                : r.fundedBidders > 0 && (marginCents === null || marginCents > 0)
                  ? ("open" as const)
                  : r.bidders > 0
                    ? ("unfunded" as const)
                    : ("quiet" as const),
          };
        })
        .sort((a, b) => (b.marginCents ?? -1) - (a.marginCents ?? -1) || b.depthLeads - a.depthLeads || a.county.localeCompare(b.county)),
    };
  },
});

/** One slot opened: who bids there and the leads it has seen. */
export const slot = query({
  args: { county: v.string(), jobType: v.string() },
  handler: async (ctx, { county, jobType }) => {
    await requireStaff(ctx);
    const bids = await ctx.db
      .query("standingBids")
      .withIndex("by_county_and_type", (q) => q.eq("county", county).eq("jobType", jobType))
      .collect();
    const bidders = [];
    for (const bid of bids.sort((a, b) => b.amountCents - a.amountCents)) {
      const company = await ctx.db.get(bid.organizationId);
      if (!company?.isActive) continue;
      const balance = company.walletBalanceCents ?? 0;
      bidders.push({ companyName: company.name, amountCents: bid.amountCents, balanceCents: balance, funded: balance >= bid.amountCents });
    }
    const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const leads = (await ctx.db.query("marketplaceLeads").order("desc").take(2000)).filter(
      (l) => l.county === county && l.jobType === jobType && !l.isSample && (l.createdAt >= since30 || l.status === "available" || l.status === "older"),
    );
    const recent = [];
    for (const lead of leads.slice(0, 50)) {
      const company = lead.assignedOrganizationId ? await ctx.db.get(lead.assignedOrganizationId) : null;
      recent.push({ id: lead._id, name: lead.name, status: lead.status, createdAt: lead.createdAt, priceCents: lead.priceCents, companyName: company?.name });
    }
    return { bidders, leads: recent };
  },
});
