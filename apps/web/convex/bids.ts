import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  fail,
  nowIso,
  requireMember,
  requireSuperAdmin,
  requireUser,
} from "./lib/access";
import { MIN_START_CENTS } from "./lib/auction";
import { normalizeCounty, TEXAS_COUNTIES } from "./lib/counties";
import {
  closeRound as finishRound,
  DEFAULT_ROUND_MINUTES,
  roundBids,
  roundMinutes,
} from "./lib/rounds";
import { dollars } from "./lib/wallet";

// A company's standing bids and the rounds they put it in. See lib/rounds.ts
// for how a round opens and closes.

/** A raise must beat the company's own bid by at least this. */
export const MIN_RAISE_CENTS = 1000;

function toCents(amount: number): number {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(cents) || cents <= 0)
    fail("INVALID", "Enter an amount above $0");
  return cents;
}

// ---- Standing bids ----

export const listStanding = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const rows = await ctx.db
      .query("standingBids")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    return rows
      .sort(
        (a, b) =>
          a.county.localeCompare(b.county) ||
          a.jobType.localeCompare(b.jobType),
      )
      .map((row) => ({
        id: row._id,
        county: row.county,
        jobType: row.jobType,
        amountCents: row.amountCents,
        updatedAt: row.updatedAt,
      }));
  },
});

/** Sets what a company pays for a trade's leads in a county. One per county and trade; setting it again replaces it. */
export const setStanding = mutation({
  args: {
    organizationId: v.id("organizations"),
    county: v.string(),
    jobType: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, { organizationId, county, jobType, amount }) => {
    const { user, organization } = await requireMember(
      ctx,
      organizationId,
      "admin",
    );
    const name = normalizeCounty(county);
    if (!name || !TEXAS_COUNTIES.includes(name))
      fail("INVALID", `${county} isn't a Texas county`);
    const trade = jobType.trim();
    if (!trade) fail("INVALID", "Pick a service type");
    const amountCents = toCents(amount);
    if (amountCents < MIN_START_CENTS)
      fail("INVALID", `Bids start at ${dollars(MIN_START_CENTS)}`);
    if ((organization.walletBalanceCents ?? 0) < amountCents)
      fail("INVALID", "Add funds to cover this bid");
    const now = nowIso();
    const existing = (
      await ctx.db
        .query("standingBids")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect()
    ).find((row) => row.county === name && row.jobType === trade);
    if (existing) {
      await ctx.db.patch(existing._id, { amountCents, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("standingBids", {
      organizationId,
      county: name,
      jobType: trade,
      amountCents,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeStanding = mutation({
  args: { id: v.id("standingBids") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row === null) fail("NOT_FOUND", "Bid not found");
    await requireMember(ctx, row.organizationId, "admin");
    await ctx.db.delete(id);
  },
});

// ---- Rounds ----

/** Whether this bid is the one winning right now (highest, earliest on a tie). */
const leads = (mine: Doc<"leadBids">, all: Doc<"leadBids">[]) =>
  all.length > 0 && all[0]._id === mine._id;

/**
 * The rounds a company is in, with where it stands (amounts of other bids
 * are never shown), plus its last few results.
 */
export const rounds = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const mine = (
      await ctx.db
        .query("leadBids")
        .withIndex("by_organization_and_status", (q) =>
          q.eq("organizationId", organizationId).eq("status", "open"),
        )
        .collect()
    ).filter((b) => b.kind === "round");
    const open = [];
    for (const bid of mine) {
      const lead = await ctx.db.get(bid.marketplaceLeadId);
      if (!lead || lead.status !== "bidding" || !lead.round) continue;
      const all = await roundBids(ctx, lead._id);
      open.push({
        bidId: bid._id,
        leadId: lead._id,
        jobType: lead.jobType,
        county: lead.county,
        city: lead.city,
        summary: lead.notes,
        opensAt: lead.round.opensAt,
        closesAt: lead.round.closesAt,
        myBidCents: bid.maxCents,
        highest: leads(bid, all),
        bidders: all.length,
      });
    }
    open.sort((a, b) => a.closesAt.localeCompare(b.closesAt));

    const settled: Doc<"leadBids">[] = [];
    for (const status of ["filled", "lost"] as const) {
      const rows = await ctx.db
        .query("leadBids")
        .withIndex("by_organization_and_status", (q) =>
          q.eq("organizationId", organizationId).eq("status", status),
        )
        .order("desc")
        .take(20);
      settled.push(...rows.filter((b) => b.kind === "round"));
    }
    const results = [];
    for (const bid of settled
      .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
      .slice(0, 10)) {
      const lead = await ctx.db.get(bid.marketplaceLeadId);
      results.push({
        bidId: bid._id,
        leadId: bid.marketplaceLeadId,
        jobType: lead?.jobType,
        county: lead?.county,
        city: lead?.city,
        myBidCents: bid.maxCents,
        won: bid.status === "filled",
        outcome: bid.outcome,
        resolvedAt: bid.resolvedAt,
      });
    }
    return { open, results, roundMinutes: await roundMinutes(ctx) };
  },
});

/** Raises the company's bid in an open round. */
export const raise = mutation({
  args: {
    leadId: v.id("marketplaceLeads"),
    organizationId: v.id("organizations"),
    amount: v.number(),
  },
  handler: async (ctx, { leadId, organizationId, amount }) => {
    const { organization } = await requireMember(ctx, organizationId, "admin");
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.status !== "bidding")
      fail("INVALID", "This round has closed");
    const mine = (await roundBids(ctx, leadId)).find(
      (b) => b.organizationId === organizationId,
    );
    if (!mine) fail("INVALID", "You're not in this round");
    const amountCents = toCents(amount);
    if (amountCents < mine.maxCents + MIN_RAISE_CENTS)
      fail(
        "INVALID",
        `Raise to at least ${dollars(mine.maxCents + MIN_RAISE_CENTS)}`,
      );
    if ((organization.walletBalanceCents ?? 0) < amountCents)
      fail("INVALID", "Add funds to cover this bid");
    await ctx.db.patch(mine._id, { maxCents: amountCents, raisedAt: nowIso() });
    return { bidId: mine._id, amountCents };
  },
});

/** Runs when a round's time is up. */
export const closeRound = internalMutation({
  args: { leadId: v.id("marketplaceLeads") },
  handler: async (ctx, { leadId }) => {
    await finishRound(ctx, leadId);
  },
});

// ---- Settings ----

export const settings = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return {
      roundMinutes: await roundMinutes(ctx),
      defaultRoundMinutes: DEFAULT_ROUND_MINUTES,
    };
  },
});

export const setRoundMinutes = mutation({
  args: { minutes: v.number() },
  handler: async (ctx, { minutes }) => {
    await requireSuperAdmin(ctx);
    const value = Math.round(minutes);
    if (!(value >= 5 && value <= 24 * 60))
      fail("INVALID", "Rounds last between 5 minutes and a day");
    const now = nowIso();
    const row = await ctx.db.query("marketSettings").first();
    if (row)
      await ctx.db.patch(row._id, { roundMinutes: value, updatedAt: now });
    else
      await ctx.db.insert("marketSettings", {
        roundMinutes: value,
        updatedAt: now,
      });
  },
});
