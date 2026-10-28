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
import { fail, logActivity, nowIso, requireMember, requireStaff } from "./lib/access";
import { mutationDef } from "./lib/actor";
import { siteUrl } from "./delivery";
import { tellStaff } from "./notify";
import { FUNDING_TIERS, MIN_FUNDING_CENTS, bonusFor } from "./lib/funding";
import { createCheckoutSession } from "./lib/stripe";
import { dollars, pricingFor, postTransaction, typicalLeadCents } from "./lib/wallet";

// Funding links: the page a company pays through to load its lead balance.
// The page picks an amount and hands the payer to Stripe Checkout; when
// Stripe says the payment cleared (the webhook in http.ts), the amount and
// its bonus land on the balance. Nobody confirms anything by hand.
//
//   STRIPE_SECRET_KEY       set on the deployment (test mode first)
//   STRIPE_WEBHOOK_SECRET   from the Stripe endpoint pointing at /stripe/webhook
//
// With no STRIPE_SECRET_KEY, sample companies pay with play money: the amount
// lands on the balance the moment Pay is tapped, marked as such, so the owner
// can walk the whole flow before Stripe is connected. Real companies can't add
// funds until the key is set. Setting the key turns play money off.

const stripeOff = () => !process.env.STRIPE_SECRET_KEY;
const playMoney = (organization: Doc<"organizations"> | null | undefined) => stripeOff() && Boolean(organization?.isSample);

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
export const createLinkDef = mutationDef({
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
export const createLink = mutation(createLinkDef);

/** Whether payments are in test mode (no Stripe key: balances are play money). Staff. */
export const mode = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return { playMoney: stripeOff() };
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
      // The same "about N leads" the wallet shows: midpoint of start and floor over the company's trades.
      typicalLeadCents: typicalLeadCents(
        await Promise.all((organization?.leadTrades?.length ? organization.leadTrades : [undefined]).map((t) => pricingFor(ctx, t))),
      ),
      paid: request.status === "confirmed",
      playMoney: playMoney(organization),
      // Stripe isn't connected and this isn't a sample company: nothing can be paid yet.
      paymentsOff: stripeOff() && !playMoney(organization),
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
      playMoney: playMoney(organization),
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
      // No Stripe yet. A sample company gets play money on the spot; anyone else waits.
      if (!prepared.playMoney) fail("INVALID", "Payments aren't set up yet. Tolliver can add funds to your account for you.");
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

/**
 * Loads a payment on the balance and closes the link. Once per payment: the
 * session id is the key, so a retried webhook credits nothing, while a link
 * that saw two sessions both paid credits both. The amount is the one Stripe
 * reports, with the bonus worked out from it, never the amount the page last
 * showed.
 */
async function credit(
  ctx: MutationCtx,
  request: Doc<"fundingRequests">,
  paid: { sessionId: string; amountCents: number; method: string; paymentIntentId?: string; payerName?: string; payerEmail?: string },
) {
  const seen = await ctx.db
    .query("fundingPayments")
    .withIndex("by_session", (q) => q.eq("sessionId", paid.sessionId))
    .unique();
  if (seen !== null) return { credited: false as const, reason: "already credited" };
  if (!Number.isInteger(paid.amountCents) || paid.amountCents <= 0) return { credited: false as const, reason: "no amount" };
  const amountCents = paid.amountCents;
  const bonusCents = bonusFor(amountCents);
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
  await ctx.db.insert("fundingPayments", {
    requestId: request._id,
    organizationId: request.organizationId,
    sessionId: paid.sessionId,
    paymentIntentId: paid.paymentIntentId,
    amountCents,
    bonusCents,
    method: paid.method,
    createdAt: now,
  });
  await ctx.db.patch(request._id, {
    status: "confirmed",
    amountCents,
    bonusCents,
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
    details: { amountCents, bonusCents, method: paid.method, reference: paid.sessionId },
  });
  return { credited: true as const, amountCents, bonusCents };
}

/**
 * Stripe says a session was paid: load what it charged, plus the bonus that
 * amount earns, once per session. The link is found by the request id Stripe
 * carried in the session's metadata, else by the session the link currently
 * points at, else by the link token in client_reference_id. A payment that
 * matches no link is not lost quietly: staff get an email with the session.
 */
export const fulfill = internalMutation({
  args: {
    sessionId: v.string(),
    amountTotal: v.optional(v.number()),
    requestId: v.optional(v.string()),
    clientReference: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    payerName: v.optional(v.string()),
    payerEmail: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, amountTotal, requestId, clientReference, paymentIntentId, payerName, payerEmail }) => {
    const byId = requestId ? ctx.db.normalizeId("fundingRequests", requestId) : null;
    const request =
      (byId ? await ctx.db.get(byId) : null) ??
      (await ctx.db
        .query("fundingRequests")
        .withIndex("by_stripe_session", (q) => q.eq("stripeSessionId", sessionId))
        .first()) ??
      (clientReference ? await byToken(ctx, clientReference) : null);
    if (request === null) {
      await tellStaff(
        ctx,
        `A Stripe payment matched no payment link: ${sessionId}`,
        [
          `Stripe reports a paid Checkout session (${sessionId}${amountTotal ? `, ${dollars(amountTotal)}` : ""}) that matches no payment link, so nothing was credited.`,
          "Find the payment in the Stripe dashboard, then record it on the company's panel with Record a payment.",
        ],
        "/ops?tab=companies",
      );
      return { credited: false, reason: "unknown session" };
    }
    // Stripe always sends amount_total; the stored amount is only a last resort.
    const amountCents = amountTotal ?? request.amountCents ?? 0;
    return await credit(ctx, request, { sessionId, amountCents, method: "Stripe", paymentIntentId, payerName, payerEmail });
  },
});

/** Test mode, no Stripe key: the amount lands as play money the moment Pay is tapped. */
export const playMoneyPay = internalMutation({
  args: { requestId: v.id("fundingRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (request === null) fail("NOT_FOUND", "This payment link isn't valid");
    if (!playMoney(await ctx.db.get(request.organizationId))) fail("INVALID", "Play money is only for sample companies while Stripe is off");
    return await credit(ctx, request, { sessionId: `play-money:${requestId}`, amountCents: request.amountCents ?? 0, method: "Play money" });
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

