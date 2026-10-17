import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail, nowIso } from "./access";
import {
  type Auction,
  type Pricing,
  priceAt,
  pricingFor as pricingFrom,
} from "./auction";

type TransactionType = Doc<"walletTransactions">["type"];

export const DEFAULT_LEAD_PRICE_CENTS = 4500;

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** A trade's price row: its own, else the "default" row, else nothing. */
export async function leadPriceRow(
  ctx: QueryCtx | MutationCtx,
  jobType: string | undefined,
): Promise<Doc<"leadPrices"> | null> {
  for (const key of [jobType, "default"]) {
    if (!key) continue;
    const row = await ctx.db
      .query("leadPrices")
      .withIndex("by_job_type", (q) => q.eq("jobType", key))
      .unique();
    if (row) return row;
  }
  return null;
}

/** The drop schedule a lead for this trade is listed with. */
export async function pricingFor(
  ctx: QueryCtx | MutationCtx,
  jobType: string | undefined,
): Promise<Pricing> {
  const row = await leadPriceRow(ctx, jobType);
  return pricingFrom(row ?? { priceCents: DEFAULT_LEAD_PRICE_CENTS });
}

/** The schedule a lead is on: the one it was listed with, else its trade's today. */
export async function auctionFor(
  ctx: QueryCtx | MutationCtx,
  lead: Doc<"marketplaceLeads">,
): Promise<Auction> {
  if (lead.auction) return lead.auction;
  return { ...(await pricingFor(ctx, lead.jobType)), listedAt: lead.createdAt };
}

/** What a lead costs right now. */
export async function leadPriceCents(
  ctx: QueryCtx | MutationCtx,
  lead: Doc<"marketplaceLeads">,
): Promise<number> {
  return priceAt(await auctionFor(ctx, lead), Date.now()).priceCents;
}

/**
 * Records one change to a company's balance and updates the running total
 * in the same transaction. A charge that would take the balance below zero
 * is refused.
 */
export async function postTransaction(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  entry: {
    type: TransactionType;
    amountCents: number;
    createdBy: Id<"users">;
    marketplaceLeadId?: Id<"marketplaceLeads">;
    method?: string;
    note?: string;
  },
): Promise<number> {
  if (!Number.isInteger(entry.amountCents) || entry.amountCents === 0)
    fail("INVALID", "Enter an amount");
  const organization = await ctx.db.get(organizationId);
  if (organization === null) fail("NOT_FOUND", "Company not found");
  const balance = organization.walletBalanceCents ?? 0;
  const after = balance + entry.amountCents;
  if (after < 0) {
    fail(
      "INVALID",
      `Balance too low: ${dollars(-entry.amountCents)} needed, ${dollars(balance)} available`,
    );
  }
  const now = nowIso();
  await ctx.db.insert("walletTransactions", {
    organizationId,
    ...entry,
    balanceAfterCents: after,
    createdAt: now,
  });
  await ctx.db.patch(organizationId, {
    walletBalanceCents: after,
    updatedAt: now,
  });
  return after;
}
