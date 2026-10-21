// Awarding leads. A company's standing bid says what it pays for a trade's
// leads in a county. When such a lead is listed, the highest standing bid
// whose balance covers it wins on the spot: the lead is theirs that moment
// and the amount comes off their balance. Speed matters more to the buyer
// than a waiting period would. A lead nobody has a bid for, or nobody can
// pay for, goes to the Marketplace.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { nowIso } from "./access";
import { countyForTown, normalizeCounty } from "./counties";
import { sellLead } from "./sales";
import { dollars, pricingFor } from "./wallet";
import { standingBidsFor } from "./standing";

export { standingBidsFor };

/**
 * Lists a lead: works out its county from the town when it has none, puts
 * it on its trade's price schedule, then sells it to the highest standing
 * bid that can pay, if there is one. Returns the new lead's id.
 */
export async function listLead(
  ctx: MutationCtx,
  fields: Partial<Doc<"marketplaceLeads">> & { name: string },
  createdBy: Id<"users">,
  extra: { listedAt?: string; source?: string; isSample?: boolean } = {},
): Promise<Id<"marketplaceLeads">> {
  const listedAt = extra.listedAt ?? nowIso();
  const county = normalizeCounty(fields.county) ?? countyForTown(fields.city);
  const id = await ctx.db.insert("marketplaceLeads", {
    ...fields,
    county,
    source: fields.source ?? extra.source,
    auction: {
      ...(await pricingFor(ctx, fields.jobType, fields.size)),
      listedAt,
    },
    status: "available",
    isSample: extra.isSample,
    createdBy,
    createdAt: listedAt,
    updatedAt: listedAt,
  });
  await awardLead(ctx, id);
  return id;
}

/**
 * Sells an available lead to the highest standing bid for its county and
 * trade whose company can pay, at that bid. Every matched bid gets a result
 * row so companies see what they won and what they missed and why. Bids the
 * balance can't cover are skipped; if nobody can pay the lead stays in the
 * Marketplace.
 */
export async function awardLead(
  ctx: MutationCtx,
  leadId: Id<"marketplaceLeads">,
): Promise<"sold" | "available"> {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.status !== "available" || !lead.county || !lead.jobType)
    return "available";
  const bids = await standingBidsFor(
    ctx,
    lead.county,
    lead.jobType,
    lead.size,
  );
  if (bids.length === 0) return "available";

  const now = nowIso();
  let winner: Doc<"standingBids"> | undefined;
  for (const bid of bids) {
    const organization = (await ctx.db.get(bid.organizationId))!;
    const balance = organization.walletBalanceCents ?? 0;
    if (winner) {
      await ctx.db.insert("leadBids", {
        marketplaceLeadId: leadId,
        organizationId: bid.organizationId,
        kind: "award",
        maxCents: bid.amountCents,
        status: "lost",
        outcome: "Outbid: a higher bid won it",
        createdBy: bid.createdBy,
        createdAt: now,
        resolvedAt: now,
      });
    } else if (balance < bid.amountCents) {
      await ctx.db.insert("leadBids", {
        marketplaceLeadId: leadId,
        organizationId: bid.organizationId,
        kind: "award",
        maxCents: bid.amountCents,
        status: "lost",
        outcome: `Balance too low: ${dollars(bid.amountCents)} needed, ${dollars(balance)} available`,
        createdBy: bid.createdBy,
        createdAt: now,
        resolvedAt: now,
      });
    } else {
      winner = bid;
      const bidId = await ctx.db.insert("leadBids", {
        marketplaceLeadId: leadId,
        organizationId: bid.organizationId,
        kind: "award",
        maxCents: bid.amountCents,
        status: "open",
        createdBy: bid.createdBy,
        createdAt: now,
      });
      await sellLead(ctx, bid.createdBy, leadId, bid.organizationId, {
        priceCents: bid.amountCents,
        bidId,
        via: "bid",
      });
      await ctx.db.patch(bidId, { status: "filled", resolvedAt: now });
    }
  }
  return winner ? "sold" : "available";
}

// ---- Legacy rounds ----
// Leads used to sit in a timed bidding round. Rounds already scheduled on
// the live deployment still fire `bids.closeRound`, which calls this.

/** Round bids on a lead, highest first; ties go to whoever bid first. */
export async function roundBids(
  ctx: QueryCtx | MutationCtx,
  leadId: Id<"marketplaceLeads">,
  status: Doc<"leadBids">["status"] | "any" = "open",
): Promise<Doc<"leadBids">[]> {
  const bids = await ctx.db
    .query("leadBids")
    .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", leadId))
    .collect();
  return bids
    .filter(
      (b) => b.kind === "round" && (status === "any" || b.status === status),
    )
    .sort(
      (a, b) => b.maxCents - a.maxCents || a._creationTime - b._creationTime,
    );
}

/** Closes a legacy round: the highest bid whose company can pay wins; else the lead is relisted. */
export async function closeLegacyRound(
  ctx: MutationCtx,
  leadId: Id<"marketplaceLeads">,
) {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.status !== "bidding") return;
  const now = nowIso();
  for (const bid of await roundBids(ctx, leadId)) {
    const organization = await ctx.db.get(bid.organizationId);
    const balance = organization?.walletBalanceCents ?? 0;
    if (!organization?.isActive || balance < bid.maxCents) {
      await ctx.db.patch(bid._id, {
        status: "lost",
        outcome: !organization?.isActive
          ? "Company closed"
          : `Balance too low: ${dollars(bid.maxCents)} needed, ${dollars(balance)} available`,
        resolvedAt: now,
      });
      continue;
    }
    await sellLead(ctx, bid.createdBy, leadId, bid.organizationId, {
      priceCents: bid.maxCents,
      bidId: bid._id,
      via: "bid",
    });
    await ctx.db.patch(bid._id, { status: "filled", resolvedAt: now });
    return;
  }
  await ctx.db.patch(leadId, {
    status: "available",
    round: undefined,
    auction: { ...(await pricingFor(ctx, lead.jobType)), listedAt: now },
    updatedAt: now,
  });
}
