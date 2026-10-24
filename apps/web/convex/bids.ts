import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail, nowIso, requireMember } from "./lib/access";
import { MIN_START_CENTS } from "./lib/auction";
import { closeLegacyRound } from "./lib/awards";
import { dropBidsOutsideTrades, fundedBidsFor, outbidUnseen, refreshStanding } from "./lib/standing";
import { normalizeCounty, TEXAS_COUNTIES } from "./lib/counties";
import { dollars } from "./lib/wallet";

// A company's standing bids and what they won. See lib/awards.ts for how a
// new lead is awarded.

function toCents(amount: number): number {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(cents) || cents <= 0)
    fail("INVALID", "Enter an amount above $0");
  return cents;
}

// ---- Standing bids ----

/**
 * The company's standing bids, each with where it stands: `funded` when its
 * balance covers it, `leading` when no other funded bid beats it (an equal
 * bid placed earlier does), `contested` when another company has a funded
 * bid there. Other companies' amounts are never shown.
 */
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
    const out = [];
    for (const row of rows.sort(
      (a, b) =>
        a.county.localeCompare(b.county) || a.jobType.localeCompare(b.jobType),
    )) {
      // Only bids a balance can cover count: an unfunded bid can't win a lead.
      const funded = await fundedBidsFor(ctx, row.county, row.jobType);
      const mineFunded = funded.some((b) => b._id === row._id);
      const leading = mineFunded && funded[0]._id === row._id;
      out.push({
        id: row._id,
        county: row.county,
        jobType: row.jobType,
        amountCents: row.amountCents,
        updatedAt: row.updatedAt,
        funded: mineFunded,
        contested: funded.some((b) => b.organizationId !== organizationId),
        leading,
        /** Another company took the lead since the company last looked at its bids. */
        outbidNew: !leading && mineFunded && outbidUnseen(row),
      });
    }
    return out;
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
    // Bids are only for the work the company lists: that list is what the
    // Marketplace, the Vault and the Price Book go by too.
    if (!(organization.leadTrades ?? []).includes(trade)) {
      const known = await ctx.db
        .query("industries")
        .withIndex("by_slug", (q) => q.eq("slug", trade))
        .first();
      fail(
        "INVALID",
        `Add ${known?.name ?? trade} to your trades in Company settings first.`,
      );
    }
    const amountCents = toCents(amount);
    if (amountCents < MIN_START_CENTS)
      fail("INVALID", `Bids start at ${dollars(MIN_START_CENTS)}`);
    const now = nowIso();
    const existing = (
      await ctx.db
        .query("standingBids")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect()
    ).find((row) => row.county === name && row.jobType === trade);
    // A bid is only placed when the balance can pay it. Lowering is always
    // allowed, so a bid the balance fell below (after a win, say) can be
    // brought back under it; that bid stays but is paused until it's covered.
    const balance = organization.walletBalanceCents ?? 0;
    const raising = !existing || amountCents > existing.amountCents;
    if (raising && amountCents > balance)
      fail(
        "INVALID",
        `Your balance is ${dollars(balance)}. Add funds to bid ${dollars(amountCents)}.`,
      );
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, {
        amountCents,
        updatedAt: now,
        // Moving to an amount puts the bid behind anyone already there.
        ...(amountCents !== existing.amountCents ? { amountSetAt: now } : {}),
      });
      id = existing._id;
    } else {
      id = await ctx.db.insert("standingBids", {
        organizationId,
        county: name,
        jobType: trade,
        amountCents,
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    // Whoever this move pushed out of the lead hears about it.
    await refreshStanding(ctx, name, trade, organizationId);
    return id;
  },
});

export const removeStanding = mutation({
  args: { id: v.id("standingBids") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row === null) fail("NOT_FOUND", "Bid not found");
    await requireMember(ctx, row.organizationId, "admin");
    await ctx.db.delete(id);
    await refreshStanding(ctx, row.county, row.jobType, row.organizationId);
  },
});

/** The company has looked at its bids: outbids so far are no longer news. */
export const markOutbidSeen = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const now = nowIso();
    const rows = await ctx.db
      .query("standingBids")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const row of rows) if (outbidUnseen(row)) await ctx.db.patch(row._id, { outbidSeenAt: now });
  },
});

/**
 * One-time sweep for bids placed before bids were limited to a company's
 * listed trades. Safe to run again: with nothing outside the lists it does
 * nothing. The deploy runs it.
 */
export const removeBidsOutsideTrades = internalMutation({
  args: {},
  handler: async (ctx) => {
    let companies = 0;
    let bids = 0;
    for (const org of await ctx.db.query("organizations").take(5000)) {
      const removed = await dropBidsOutsideTrades(ctx, org._id, org.leadTrades ?? []);
      if (removed > 0) {
        companies++;
        bids += removed;
      }
    }
    return { companies, bids };
  },
});

// ---- Results ----

/** The last leads the company's bids were matched to: won at its bid, or lost and why. */
export const results = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    const settled: Doc<"leadBids">[] = [];
    for (const status of ["filled", "lost"] as const) {
      const rows = await ctx.db
        .query("leadBids")
        .withIndex("by_organization_and_status", (q) =>
          q.eq("organizationId", organizationId).eq("status", status),
        )
        .order("desc")
        .take(40);
      settled.push(
        ...rows.filter((b) => b.kind === "award" || b.kind === "round"),
      );
    }
    const out = [];
    for (const bid of settled
      .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
      .slice(0, 20)) {
      const lead = await ctx.db.get(bid.marketplaceLeadId);
      out.push({
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
    return out;
  },
});

/** Legacy: closes a bidding round scheduled before leads were awarded on the spot. */
export const closeRound = internalMutation({
  args: { leadId: v.id("marketplaceLeads") },
  handler: async (ctx, { leadId }) => {
    await closeLegacyRound(ctx, leadId);
  },
});
