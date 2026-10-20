// Who leads a county and trade, and noticing when a company is outbid.
// Kept free of wallet imports so the wallet can call it after every balance
// change without an import cycle.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { nowIso } from "./access";

/** Active companies' standing bids for a county and trade, highest first; ties go to whoever bid first. */
export async function standingBidsFor(
  ctx: QueryCtx | MutationCtx,
  county: string,
  jobType: string,
): Promise<Doc<"standingBids">[]> {
  const rows = await ctx.db
    .query("standingBids")
    .withIndex("by_county_and_type", (q) =>
      q.eq("county", county).eq("jobType", jobType),
    )
    .collect();
  const active: Doc<"standingBids">[] = [];
  for (const row of rows) {
    const organization = await ctx.db.get(row.organizationId);
    if (organization?.isActive) active.push(row);
  }
  return active.sort(
    (a, b) =>
      b.amountCents - a.amountCents || a.createdAt.localeCompare(b.createdAt),
  );
}

/** The bids a balance can cover, in winning order: only these can win a lead. */
export async function fundedBidsFor(
  ctx: QueryCtx | MutationCtx,
  county: string,
  jobType: string,
): Promise<Doc<"standingBids">[]> {
  const funded: Doc<"standingBids">[] = [];
  for (const bid of await standingBidsFor(ctx, county, jobType)) {
    const balance =
      (await ctx.db.get(bid.organizationId))?.walletBalanceCents ?? 0;
    if (balance >= bid.amountCents) funded.push(bid);
  }
  return funded;
}

/**
 * Re-works out who leads a county and trade after anything that can change
 * it (a bid set or removed, a balance going up or down). A bid that led and
 * now doesn't, while still covered, was outbid: it's stamped `outbidAt` so
 * the company hears about it. Losing the lead because your own balance ran
 * low is a pause, not an outbid, and the company that made the change
 * (`actor`) isn't told about its own move. Leading again clears the stamp.
 */
export async function refreshStanding(
  ctx: MutationCtx,
  county: string,
  jobType: string,
  actor?: Id<"organizations">,
): Promise<void> {
  const funded = await fundedBidsFor(ctx, county, jobType);
  const leaderId = funded[0]?._id;
  const coveredIds = new Set(funded.map((b) => b._id));
  const rows = await ctx.db
    .query("standingBids")
    .withIndex("by_county_and_type", (q) =>
      q.eq("county", county).eq("jobType", jobType),
    )
    .collect();
  const now = nowIso();
  for (const row of rows) {
    const leads = row._id === leaderId;
    if (leads) {
      if (!row.wasLeading || row.outbidAt)
        await ctx.db.patch(row._id, { wasLeading: true, outbidAt: undefined });
    } else if (row.wasLeading) {
      const outbid = coveredIds.has(row._id) && row.organizationId !== actor;
      await ctx.db.patch(row._id, {
        wasLeading: false,
        ...(outbid ? { outbidAt: now } : {}),
      });
    }
  }
}

/** Refreshes every county and trade a company bids in, after its balance changed. */
export async function refreshStandingFor(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<void> {
  const mine = await ctx.db
    .query("standingBids")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const slots = new Set(mine.map((b) => `${b.county}\u0000${b.jobType}`));
  for (const slot of slots) {
    const [county, jobType] = slot.split("\u0000");
    await refreshStanding(ctx, county, jobType);
  }
}

/** Outbid since the company last looked at its bids. */
export const outbidUnseen = (bid: Doc<"standingBids">) =>
  Boolean(bid.outbidAt && (!bid.outbidSeenAt || bid.outbidSeenAt < bid.outbidAt));
