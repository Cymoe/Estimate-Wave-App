import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  fail,
  logActivity,
  nowIso,
  requireMember,
  requireSuperAdmin,
} from "./lib/access";
import { FUNDING_TIERS, MIN_FUNDING_CENTS, bonusFor } from "./lib/funding";
import { dollars, pricingFor, postTransaction } from "./lib/wallet";

// Funding links: the page a company pays through to load its lead balance.
// Paying records what they chose; nothing is credited until a platform
// admin confirms the money arrived.

async function byToken(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<Doc<"fundingRequests"> | null> {
  if (!token) return null;
  return await ctx.db
    .query("fundingRequests")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

/** The company's funding link: the open one if there is one, otherwise a new one. */
export const createLink = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user } = await requireMember(ctx, organizationId);
    const open = await ctx.db
      .query("fundingRequests")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();
    if (open) return open.token;
    const token = crypto.randomUUID().replace(/-/g, "");
    await ctx.db.insert("fundingRequests", {
      organizationId,
      token,
      status: "open",
      createdBy: user._id,
      createdAt: nowIso(),
    });
    return token;
  },
});

/** What the funding page shows. No login: the link's token is the key. */
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const request = await byToken(ctx, token);
    if (request === null) return null;
    const organization = await ctx.db.get(request.organizationId);
    return {
      companyName: organization?.name ?? "Your company",
      status: request.status,
      amountCents: request.amountCents,
      bonusCents: request.bonusCents,
      minimumCents: MIN_FUNDING_CENTS,
      tiers: FUNDING_TIERS.map((tier) => ({
        ...tier,
        bonusCents: bonusFor(tier.amountCents),
      })),
      typicalLeadCents: (await pricingFor(ctx, undefined)).startCents,
    };
  },
});

/** The company's payment details from the funding page. Records them; credits nothing. */
export const submit = mutation({
  args: {
    token: v.string(),
    amountCents: v.number(),
    method: v.union(v.literal("card"), v.literal("apple_pay")),
    payerName: v.optional(v.string()),
    payerEmail: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { token, amountCents, method, payerName, payerEmail },
  ) => {
    const request = await byToken(ctx, token);
    if (request === null) fail("NOT_FOUND", "This payment link isn't valid");
    if (request.status !== "open")
      fail("INVALID", "This payment link has already been used");
    if (!Number.isInteger(amountCents) || amountCents < MIN_FUNDING_CENTS) {
      fail("INVALID", `The minimum is ${dollars(MIN_FUNDING_CENTS)}`);
    }
    const now = nowIso();
    await ctx.db.patch(request._id, {
      status: "submitted",
      amountCents,
      bonusCents: bonusFor(amountCents),
      method,
      payerName: payerName?.trim().slice(0, 120) || undefined,
      payerEmail: payerEmail?.trim().slice(0, 200) || undefined,
      submittedAt: now,
    });
    await logActivity(ctx, {
      organizationId: request.organizationId,
      userId: request.createdBy,
      action: "funding_submitted",
      resourceType: "organization",
      resourceId: request.organizationId,
      details: { amountCents, method },
    });
  },
});

/** Payments companies have made that are waiting for confirmation. */
export const pending = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const requests = await ctx.db
      .query("fundingRequests")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .take(200);
    return await Promise.all(
      requests.map(async (r) => ({
        id: r._id,
        organizationId: r.organizationId,
        companyName: (await ctx.db.get(r.organizationId))?.name ?? "",
        amountCents: r.amountCents ?? 0,
        bonusCents: r.bonusCents ?? 0,
        method: r.method,
        payerName: r.payerName,
        payerEmail: r.payerEmail,
        submittedAt: r.submittedAt,
      })),
    );
  },
});

/** The money arrived: loads the payment and its bonus onto the company's balance. */
export const confirm = mutation({
  args: { id: v.id("fundingRequests") },
  handler: async (ctx, { id }) => {
    const user = await requireSuperAdmin(ctx);
    const request = await ctx.db.get(id);
    if (request === null) fail("NOT_FOUND", "Payment not found");
    if (request.status !== "submitted")
      fail("INVALID", "This payment isn't waiting for confirmation");
    const method = request.method === "apple_pay" ? "Apple Pay" : "Card";
    await postTransaction(ctx, request.organizationId, {
      type: "top_up",
      amountCents: request.amountCents ?? 0,
      createdBy: user._id,
      method,
      note: request.payerName,
    });
    if (request.bonusCents) {
      await postTransaction(ctx, request.organizationId, {
        type: "bonus",
        amountCents: request.bonusCents,
        createdBy: user._id,
        note: "Bonus",
      });
    }
    await ctx.db.patch(id, { status: "confirmed", confirmedAt: nowIso() });
  },
});

export const cancel = mutation({
  args: { id: v.id("fundingRequests") },
  handler: async (ctx, { id }) => {
    await requireSuperAdmin(ctx);
    const request = await ctx.db.get(id);
    if (request === null) fail("NOT_FOUND", "Payment not found");
    if (request.status === "confirmed")
      fail("INVALID", "A confirmed payment can't be cancelled");
    await ctx.db.patch(id, { status: "cancelled" });
  },
});

/** A company's payment that's waiting for confirmation, if any. */
export async function pendingFundingFor(
  ctx: QueryCtx,
  organizationId: Doc<"organizations">["_id"],
) {
  const submitted = await ctx.db
    .query("fundingRequests")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .filter((q) => q.eq(q.field("status"), "submitted"))
    .first();
  return submitted
    ? {
        amountCents: submitted.amountCents ?? 0,
        bonusCents: submitted.bonusCents ?? 0,
      }
    : null;
}
