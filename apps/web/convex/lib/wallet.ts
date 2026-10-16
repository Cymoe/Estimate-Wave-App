import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail, nowIso } from "./access";

type TransactionType = Doc<"walletTransactions">["type"];

export const DEFAULT_LEAD_PRICE_CENTS = 4500;

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** What a lead for this trade costs: its own price, else the default row, else the built-in default. */
export async function leadPriceCents(
  ctx: QueryCtx | MutationCtx,
  jobType: string | undefined,
): Promise<number> {
  for (const key of [jobType, "default"]) {
    if (!key) continue;
    const row = await ctx.db
      .query("leadPrices")
      .withIndex("by_job_type", (q) => q.eq("jobType", key))
      .unique();
    if (row) return row.priceCents;
  }
  return DEFAULT_LEAD_PRICE_CENTS;
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
