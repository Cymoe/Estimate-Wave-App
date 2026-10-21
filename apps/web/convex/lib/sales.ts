// Selling a lead to one company: it lands in their leads, the price comes
// off their balance, and everyone else's bids and orders on it close.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail, logActivity, nowIso } from "./access";
import { postTransaction } from "./wallet";
import { findCity } from "../leadCity";

export type SaleVia = "bid" | "order" | "buy" | "sent" | "claim";

/**
 * Sells the lead to one company at `sale.priceCents`, all in one
 * transaction. A lead can only be sold once. `sale.bidId` is the bid or
 * order this sale fills, which is left for the caller to mark. `sale.via`
 * records how the company got it, shown on their Leads board.
 */
export async function sellLead(
  ctx: MutationCtx,
  userId: Id<"users">,
  leadId: Id<"marketplaceLeads">,
  organizationId: Id<"organizations">,
  sale: { priceCents: number; bidId?: Id<"leadBids">; via: SaleVia },
) {
  const user = { _id: userId };
  {
    const lead = await ctx.db.get(leadId);
    if (lead === null) fail("NOT_FOUND", "Lead not found");
    if (
      lead.status !== "available" &&
      lead.status !== "bidding" &&
      lead.status !== "older"
    )
      fail("INVALID", "This lead was already sent to a company");
    const organization = await ctx.db.get(organizationId);
    if (organization === null || !organization.isActive)
      fail("NOT_FOUND", "Company not found");

    const priceCents = sale.priceCents;
    // A claim included in the plan costs nothing, so there's nothing to post.
    if (priceCents > 0)
      await postTransaction(ctx, organizationId, {
        type: "lead_charge",
        amountCents: -priceCents,
        createdBy: user._id,
        marketplaceLeadId: leadId,
        note: lead.name,
      });
    const now = nowIso();
    const orgLeadId = await ctx.db.insert("leads", {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      city: lead.city,
      county: lead.county,
      jobType: lead.jobType,
      notes: lead.notes,
      source: "FieldQuote Lead",
      status: "new",
      marketplaceLeadId: leadId,
      pricePaidCents: priceCents,
      assignedAt: now,
      wonVia: sale.via,
      size: lead.size,
      kind: lead.kind,
      verified: lead.verified
        ? { at: lead.verified.at, note: lead.verified.note }
        : undefined,
      organizationId,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(leadId, {
      status: "assigned",
      round: undefined,
      priceCents,
      assignedOrganizationId: organizationId,
      assignedAt: now,
      orgLeadId,
      updatedAt: now,
    });
    await logActivity(ctx, {
      organizationId,
      userId: user._id,
      action: "lead_delivered",
      resourceType: "lead",
      resourceId: orgLeadId,
      details: { name: lead.name, priceCents },
    });
    // Everyone else's buy orders and round bids on this lead have lost.
    const bids = await ctx.db
      .query("leadBids")
      .withIndex("by_lead", (q) => q.eq("marketplaceLeadId", leadId))
      .collect();
    for (const bid of bids) {
      if (bid.status !== "open" || bid._id === sale.bidId) continue;
      await ctx.db.patch(bid._id, {
        status: "lost",
        outcome:
          bid.organizationId === organizationId
            ? "You bought this lead"
            : bid.kind === "round"
              ? "Sold to another company"
              : "Another company bought it first",
        resolvedAt: now,
      });
    }
    const delivered = (await ctx.db.get(orgLeadId))!;
    if (!delivered.city) await findCity(ctx, delivered);
    return { orgLeadId, priceCents };
  }
}
