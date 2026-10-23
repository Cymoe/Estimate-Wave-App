import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { fail, logActivity, nowIso, requireMember } from "./lib/access";
import { siteUrl } from "./delivery";
import { FUNDING_TIERS, MIN_FUNDING_CENTS, bonusFor } from "./lib/funding";
import { createCheckoutSession } from "./lib/stripe";
import { dollars, pricingFor, postTransaction } from "./lib/wallet";

// Funding links: the page a company pays through to load its lead balance.
// The page picks an amount and hands the payer to Stripe Checkout; when
// Stripe says the payment cleared (the webhook in http.ts), the amount and
// its bonus land on the balance. Nobody confirms anything by hand.
//
//   STRIPE_SECRET_KEY       set on the deployment (test mode first)
//   STRIPE_WEBHOOK_SECRET   from the Stripe endpoint pointing at /stripe/webhook
//
// With no STRIPE_SECRET_KEY the page pays with play money: the amount lands
// on the balance the moment Pay is tapped, marked as such, so the owner can
// walk the whole flow before Stripe is connected. Setting the key turns it off.

const playMoney = () => !process.env.STRIPE_SECRET_KEY;

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
      paid: request.status === "confirmed",
      playMoney: playMoney(),
    };
  },
});

/** Checks the link and the amount, and remembers what the payer chose. */
export const prepare = internalMutation({
  args: { token: v.string(), amountCents: v.number() },
  handler: async (ctx, { token, amountCents }) => {
    const request = await byToken(ctx, token);
    if (request === null) fail("NOT_FOUND", "This payment link isn't valid");
    if (request.status === "confirmed") fail("INVALID", "This payment link has already been used");
    if (request.status === "cancelled") fail("INVALID", "This payment link isn't valid");
    if (!Number.isInteger(amountCents) || amountCents < MIN_FUNDING_CENTS) {
      fail("INVALID", `The minimum is ${dollars(MIN_FUNDING_CENTS)}`);
    }
    const bonusCents = bonusFor(amountCents);
    await ctx.db.patch(request._id, { amountCents, bonusCents });
    const organization = await ctx.db.get(request.organizationId);
    return {
      requestId: request._id,
      organizationId: request.organizationId,
      companyName: organization?.name ?? "Your company",
      bonusCents,
    };
  },
});

/** The payer is on their way to Stripe: keep the session so the webhook can find the link. */
export const markSession = internalMutation({
  args: { requestId: v.id("fundingRequests"), sessionId: v.string() },
  handler: async (ctx, { requestId, sessionId }) => {
    await ctx.db.patch(requestId, { status: "submitted", stripeSessionId: sessionId, submittedAt: nowIso() });
  },
});

/**
 * Add funds: opens a Stripe Checkout session for the amount and returns
 * where to send the payer. Public (the funding page has no login); the
 * link's token is the key.
 */
export const checkout = action({
  args: { token: v.string(), amountCents: v.number() },
  handler: async (ctx, { token, amountCents }): Promise<{ url: string }> => {
    const prepared = await ctx.runMutation(internal.funding.prepare, { token, amountCents });
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      // Test mode: no Stripe. Credit now and send the page where Stripe would have.
      await ctx.runMutation(internal.funding.playMoneyPay, { requestId: prepared.requestId });
      return { url: `/fund/${token}?paid=1` };
    }
    const site = siteUrl();
    const session = await createCheckoutSession(secretKey, {
      amountCents,
      bonusCents: prepared.bonusCents,
      companyName: prepared.companyName,
      token,
      organizationId: prepared.organizationId,
      requestId: prepared.requestId,
      successUrl: `${site}/fund/${token}?paid=1`,
      cancelUrl: `${site}/fund/${token}?cancelled=1`,
    });
    await ctx.runMutation(internal.funding.markSession, { requestId: prepared.requestId, sessionId: session.id });
    return { url: session.url };
  },
});

/** Loads the request's amount and bonus on the balance and closes the link. Once: a confirmed link credits nothing. */
async function credit(
  ctx: MutationCtx,
  request: Doc<"fundingRequests">,
  paid: { method: string; paymentIntentId?: string; payerName?: string; payerEmail?: string; reference: string },
) {
  if (request.status === "confirmed") return { credited: false as const, reason: "already credited" };
  const amountCents = request.amountCents ?? 0;
  const bonusCents = request.bonusCents ?? 0;
  const payerName = paid.payerName?.trim().slice(0, 120) || undefined;
  await postTransaction(ctx, request.organizationId, {
    type: "top_up",
    amountCents,
    createdBy: request.createdBy,
    method: paid.method,
    note: payerName,
  });
  if (bonusCents > 0) {
    await postTransaction(ctx, request.organizationId, {
      type: "bonus",
      amountCents: bonusCents,
      createdBy: request.createdBy,
      note: "Bonus",
    });
  }
  const now = nowIso();
  await ctx.db.patch(request._id, {
    status: "confirmed",
    method: paid.method,
    stripePaymentIntentId: paid.paymentIntentId,
    payerName,
    payerEmail: paid.payerEmail?.trim().slice(0, 200) || undefined,
    paidAt: now,
    confirmedAt: now,
  });
  await logActivity(ctx, {
    organizationId: request.organizationId,
    userId: request.createdBy,
    action: "funding_paid",
    resourceType: "organization",
    resourceId: request.organizationId,
    details: { amountCents, bonusCents, method: paid.method, reference: paid.reference },
  });
  return { credited: true as const, amountCents, bonusCents };
}

/**
 * Stripe says the session was paid: load the amount and its bonus, once.
 * Stripe retries webhooks, so a second call for the same session credits
 * nothing.
 */
export const fulfill = internalMutation({
  args: {
    sessionId: v.string(),
    paymentIntentId: v.optional(v.string()),
    payerName: v.optional(v.string()),
    payerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, paymentIntentId, payerName, payerEmail }) => {
    const request = await ctx.db
      .query("fundingRequests")
      .withIndex("by_stripe_session", (q) => q.eq("stripeSessionId", sessionId))
      .first();
    if (request === null) return { credited: false, reason: "unknown session" };
    return await credit(ctx, request, { method: "Stripe", paymentIntentId, payerName, payerEmail, reference: sessionId });
  },
});

/** Test mode, no Stripe key: the amount lands as play money the moment Pay is tapped. */
export const playMoneyPay = internalMutation({
  args: { requestId: v.id("fundingRequests") },
  handler: async (ctx, { requestId }) => {
    if (!playMoney()) fail("INVALID", "Play money is off: this deployment takes real payments");
    const request = await ctx.db.get(requestId);
    if (request === null) fail("NOT_FOUND", "This payment link isn't valid");
    return await credit(ctx, request, { method: "Play money", reference: "play-money" });
  },
});

/** The payer never finished (Stripe expired the session or the payment failed): the link opens again. */
export const expire = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const request = await ctx.db
      .query("fundingRequests")
      .withIndex("by_stripe_session", (q) => q.eq("stripeSessionId", sessionId))
      .first();
    if (request === null || request.status !== "submitted") return { reopened: false };
    await ctx.db.patch(request._id, { status: "open", stripeSessionId: undefined, submittedAt: undefined });
    return { reopened: true };
  },
});

