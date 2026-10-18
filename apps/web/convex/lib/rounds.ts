// Bidding rounds. A new lead with a county and trade that companies have
// standing bids for opens a round: each standing bid is entered for its
// company, the round closes after the platform's round length, and the
// highest bid whose balance covers it wins at that amount. A lead nobody
// has a bid for goes straight to the Marketplace.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { nowIso } from "./access";
import { countyForTown, normalizeCounty } from "./counties";
import { sellLead } from "./sales";
import { dollars, pricingFor } from "./wallet";

export const DEFAULT_ROUND_MINUTES = 60;

/** How long a round stays open, from the platform settings. */
export async function roundMinutes(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const row = await ctx.db.query("marketSettings").first();
  return row?.roundMinutes ?? DEFAULT_ROUND_MINUTES;
}

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

/**
 * Lists a lead: works out its county from the town when it has none, puts
 * it on its trade's price schedule, then opens a round if any company has a
 * standing bid for it. Returns the new lead's id.
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
    auction: { ...(await pricingFor(ctx, fields.jobType)), listedAt },
    status: "available",
    isSample: extra.isSample,
    createdBy,
    createdAt: listedAt,
    updatedAt: listedAt,
  });
  await openRound(ctx, id);
  return id;
}

/** Opens a bidding round for a lead if any active company has a standing bid for its county and trade. */
export async function openRound(
  ctx: MutationCtx,
  leadId: Id<"marketplaceLeads">,
): Promise<"bidding" | "available"> {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.status !== "available" || !lead.county || !lead.jobType)
    return "available";
  const standing = (
    await ctx.db
      .query("standingBids")
      .withIndex("by_county_and_type", (q) =>
        q.eq("county", lead.county!).eq("jobType", lead.jobType!),
      )
      .collect()
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const entrants: Doc<"standingBids">[] = [];
  for (const bid of standing) {
    const organization = await ctx.db.get(bid.organizationId);
    if (organization?.isActive) entrants.push(bid);
  }
  if (entrants.length === 0) return "available";

  const now = Date.now();
  const closesAtMs = now + (await roundMinutes(ctx)) * 60_000;
  const opensAt = new Date(now).toISOString();
  const closesAt = new Date(closesAtMs).toISOString();
  await ctx.db.patch(leadId, {
    status: "bidding",
    round: { opensAt, closesAt },
    updatedAt: opensAt,
  });
  // Earliest standing bid first, so it wins a tie at the same amount.
  for (const bid of entrants) {
    await ctx.db.insert("leadBids", {
      marketplaceLeadId: leadId,
      organizationId: bid.organizationId,
      kind: "round",
      maxCents: bid.amountCents,
      status: "open",
      createdBy: bid.createdBy,
      createdAt: opensAt,
    });
  }
  await ctx.scheduler.runAt(closesAtMs, internal.bids.closeRound, { leadId });
  return "bidding";
}

/**
 * Closes a round: the highest bid whose company can pay wins at its amount.
 * Bids the balance can't cover are skipped. If nobody can pay, the lead is
 * listed in the Marketplace on a fresh schedule.
 */
export async function closeRound(
  ctx: MutationCtx,
  leadId: Id<"marketplaceLeads">,
) {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.status !== "bidding") return;
  const now = nowIso();
  for (const bid of await roundBids(ctx, leadId)) {
    const organization = await ctx.db.get(bid.organizationId);
    const balance = organization?.walletBalanceCents ?? 0;
    if (!organization?.isActive) {
      await ctx.db.patch(bid._id, {
        status: "lost",
        outcome: "Company closed",
        resolvedAt: now,
      });
      continue;
    }
    if (balance < bid.maxCents) {
      await ctx.db.patch(bid._id, {
        status: "lost",
        outcome: `Balance too low: ${dollars(bid.maxCents)} needed, ${dollars(balance)} available`,
        resolvedAt: now,
      });
      continue;
    }
    await sellLead(ctx, bid.createdBy, leadId, bid.organizationId, {
      priceCents: bid.maxCents,
      bidId: bid._id,
    });
    await ctx.db.patch(bid._id, { status: "filled", resolvedAt: now });
    return;
  }
  // Nobody could pay: back to the Marketplace at the trade's start price.
  await ctx.db.patch(leadId, {
    status: "available",
    round: undefined,
    auction: { ...(await pricingFor(ctx, lead.jobType)), listedAt: now },
    updatedAt: now,
  });
}
