// What recruiting clients pay National Sales Registry: a monthly retainer as a
// Stripe subscription (the client pays once through a Checkout link; Stripe
// charges them every month after), plus a fee for each rep they hire, added
// to their next monthly invoice when the hire is marked.
//
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET   the same keys as the lead balance (funding.ts)
//
// The webhook (http.ts, /stripe/webhook) hands recruiting events here first:
// the link paid, each invoice paid or failed, the subscription ended.

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "../_generated/server";
import { siteUrl } from "../delivery";
import { sendEmail } from "../lib/email";
import { fail, requireStaff } from "../lib/access";
import { createInvoiceItem, createSubscriptionCheckout, deleteInvoiceItem } from "../lib/stripe";
import { tellStaff } from "../notify";

const nowIso = () => new Date().toISOString();
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const stripeKey = () => process.env.STRIPE_SECRET_KEY;

type Billing = NonNullable<Doc<"recruitClients">["billing"]>;

/** The client's plan: the monthly retainer and the fee per hire, in dollars. */
export const setPlan = mutation({
  args: { clientId: v.id("recruitClients"), monthlyDollars: v.number(), perHireDollars: v.number() },
  handler: async (ctx, { clientId, monthlyDollars, perHireDollars }) => {
    await requireStaff(ctx);
    const c = await ctx.db.get(clientId);
    if (!c) fail("NOT_FOUND", "No such client");
    if (!(monthlyDollars >= 0) || !(perHireDollars >= 0)) fail("INVALID", "Prices can't be negative");
    if (monthlyDollars > 0 && monthlyDollars < 1) fail("INVALID", "The monthly fee is under a dollar");
    const before = c.billing;
    const monthlyCents = Math.round(monthlyDollars * 100);
    // A new monthly price needs a new link if one was sent but not paid yet; a live subscription keeps its price until it's redone.
    const keepLink = before?.status !== "link_sent" || before.monthlyCents === monthlyCents;
    await ctx.db.patch(clientId, {
      billing: {
        ...(before ?? { status: "none" as const }),
        monthlyCents,
        perHireCents: Math.round(perHireDollars * 100),
        ...(keepLink ? {} : { status: "none" as const, link: undefined, sessionId: undefined }),
        updatedAt: nowIso(),
      },
    });
  },
});

export const clientForBilling = internalQuery({
  args: { clientId: v.id("recruitClients") },
  handler: async (ctx, { clientId }) => ctx.db.get(clientId),
});

export const linkMade = internalMutation({
  args: { clientId: v.id("recruitClients"), link: v.string(), sessionId: v.string() },
  handler: async (ctx, { clientId, link, sessionId }) => {
    const c = (await ctx.db.get(clientId))!;
    await ctx.db.patch(clientId, { billing: { ...c.billing!, status: c.billing!.status === "active" ? "active" : "link_sent", link, sessionId, updatedAt: nowIso() } });
  },
});

/**
 * Ops → Recruiting → Clients: makes the Stripe link for the monthly retainer
 * and emails it to the client's report email. Returns the link to copy too.
 */
export const sendPaymentLink = action({
  args: { clientId: v.id("recruitClients") },
  handler: async (ctx, { clientId }): Promise<{ link: string; emailed: boolean }> => {
    await ctx.runQuery(internal.recruiting.people.whoIsSending, {});
    const key = stripeKey();
    if (!key) fail("INVALID", "Connect Stripe first: STRIPE_SECRET_KEY on the Convex deployment.");
    const c = await ctx.runQuery(internal.recruiting.billing.clientForBilling, { clientId });
    if (!c) fail("NOT_FOUND", "No such client");
    if (c.demo) fail("INVALID", "The demo client can't be billed.");
    if (!c.billing || c.billing.monthlyCents <= 0) fail("INVALID", "Set the client's plan first.");
    if (c.billing.status === "active") fail("INVALID", "They're already paying.");
    const site = siteUrl();
    const session = await createSubscriptionCheckout(key, {
      monthlyCents: c.billing.monthlyCents,
      productName: `National Sales Registry: recruiting for ${c.name}`,
      customerEmail: c.reportEmail,
      metadata: { recruitClientId: c._id },
      successUrl: `${site}/recruit?paid=1`,
      cancelUrl: `${site}/recruit`,
    });
    await ctx.runMutation(internal.recruiting.billing.linkMade, { clientId, link: session.url, sessionId: session.id });
    let emailed = false;
    if (c.reportEmail) {
      const per = c.billing.perHireCents > 0 ? `, plus ${money(c.billing.perHireCents)} for each rep you hire (added to the next month's invoice)` : "";
      const subject = `National Sales Registry: start recruiting for ${c.name}`;
      const text = `Here's the link to start: ${money(c.billing.monthlyCents)} a month${per}. Stripe charges your card monthly; cancel anytime by replying to this email.\n\n${session.url}`;
      const r = await sendEmail([c.reportEmail], { subject, text, html: `<p>${subject}</p><p>${money(c.billing.monthlyCents)} a month${per}. Stripe charges your card monthly; cancel anytime by replying to this email.</p><p><a href="${session.url}">Start here</a></p>` });
      emailed = r.status === "sent";
    }
    return { link: session.url, emailed };
  },
});

async function clientOfStripe(ctx: MutationCtx, ids: { clientId?: string; customer?: string }) {
  const byId = ids.clientId ? ctx.db.normalizeId("recruitClients", ids.clientId) : null;
  if (byId) return await ctx.db.get(byId);
  if (!ids.customer) return null;
  const customer = ids.customer;
  return await ctx.db.query("recruitClients").withIndex("by_stripe_customer", (q) => q.eq("billing.stripeCustomerId", customer)).first();
}

/**
 * A Stripe event about a recruiting retainer. Returns whether it was one
 * (otherwise the webhook goes on to the lead balance's handling).
 */
export const stripeEvent = internalMutation({
  args: { type: v.string(), clientId: v.optional(v.string()), customer: v.optional(v.string()), subscription: v.optional(v.string()) },
  handler: async (ctx, { type, clientId, customer, subscription }): Promise<{ recruiting: boolean; status?: Billing["status"] }> => {
    const c = await clientOfStripe(ctx, { clientId, customer });
    if (!c?.billing) return { recruiting: Boolean(clientId) };
    const b = c.billing;
    let status: Billing["status"] = b.status;
    if (type === "checkout.session.completed") status = "active";
    else if (type === "invoice.paid") status = "active";
    else if (type === "invoice.payment_failed") status = "past_due";
    else if (type === "customer.subscription.deleted") status = "canceled";
    else return { recruiting: true };
    await ctx.db.patch(c._id, {
      billing: {
        ...b,
        status,
        ...(customer ? { stripeCustomerId: customer } : {}),
        ...(subscription ? { stripeSubscriptionId: subscription } : {}),
        ...(status === "active" && !b.since ? { since: nowIso() } : {}),
        ...(type === "checkout.session.completed" ? { link: undefined } : {}),
        updatedAt: nowIso(),
      },
    });
    if (status !== b.status && (status === "past_due" || status === "canceled")) {
      await tellStaff(ctx, `${c.name}: recruiting payment ${status === "past_due" ? "failed" : "canceled"}`, [`${c.name}'s ${money(b.monthlyCents)}/month retainer ${status === "past_due" ? "didn't go through" : "was canceled"} on Stripe.`], "/ops/recruiting?tab=clients");
    }
    return { recruiting: true, status };
  },
});

// ---- The fee per hire ----

/** Claims the hire fee (so it's charged once) when the client is paying and has a per-hire fee; returns what to charge. */
export const claimHire = internalMutation({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }): Promise<{ customer: string; amountCents: number; description: string } | null> => {
    const a = await ctx.db.get(applicantId);
    if (!a || a.outcome !== "hired" || a.test || a.demo || a.hireBilledAt) return null;
    const c = await ctx.db.get(a.clientId);
    const b = c?.billing;
    if (!c || c.demo || !b || b.perHireCents <= 0 || !b.stripeCustomerId || (b.status !== "active" && b.status !== "past_due")) return null;
    await ctx.db.patch(applicantId, { hireBilledAt: nowIso() });
    return { customer: b.stripeCustomerId, amountCents: b.perHireCents, description: `Hire: ${a.name} (${c.role})` };
  },
});

export const hireCharged = internalMutation({
  args: { applicantId: v.id("recruitApplicants"), itemId: v.optional(v.string()) },
  handler: async (ctx, { applicantId, itemId }) => {
    // No item: the charge failed, so the claim is let go and a later mark can try again.
    await ctx.db.patch(applicantId, itemId ? { hireInvoiceItemId: itemId } : { hireBilledAt: undefined });
    // Un-hired while the charge was on its way: take it straight back off.
    const a = await ctx.db.get(applicantId);
    if (itemId && a && a.outcome !== "hired") await ctx.scheduler.runAfter(0, internal.recruiting.billing.unchargeHire, { applicantId });
  },
});

export const chargeHire = internalAction({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }) => {
    const key = stripeKey();
    if (!key) return;
    const charge = await ctx.runMutation(internal.recruiting.billing.claimHire, { applicantId });
    if (!charge) return;
    try {
      const item = await createInvoiceItem(key, { ...charge, metadata: { applicantId } });
      await ctx.runMutation(internal.recruiting.billing.hireCharged, { applicantId, itemId: item.id });
    } catch (err) {
      console.error(`Hire fee for ${applicantId} not added: ${err instanceof Error ? err.message : String(err)}`);
      await ctx.runMutation(internal.recruiting.billing.hireCharged, { applicantId });
    }
  },
});

export const releaseHire = internalMutation({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }): Promise<string | null> => {
    const a = await ctx.db.get(applicantId);
    if (!a || a.outcome === "hired" || !a.hireInvoiceItemId) return null;
    return a.hireInvoiceItemId;
  },
});

/** A hire taken back: the fee comes off, if Stripe hasn't put it on an invoice yet. */
export const unchargeHire = internalAction({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }) => {
    const key = stripeKey();
    if (!key) return;
    const itemId = await ctx.runMutation(internal.recruiting.billing.releaseHire, { applicantId });
    if (!itemId) return;
    try {
      await deleteInvoiceItem(key, itemId);
      await ctx.runMutation(internal.recruiting.billing.hireUncharged, { applicantId });
    } catch (err) {
      // Already invoiced: a person sorts it out (a credit on Stripe).
      console.error(`Hire fee ${itemId} not taken back: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
});

export const hireUncharged = internalMutation({
  args: { applicantId: v.id("recruitApplicants") },
  handler: async (ctx, { applicantId }) => {
    await ctx.db.patch(applicantId, { hireBilledAt: undefined, hireInvoiceItemId: undefined });
  },
});

/** Called when an outcome changes (applicants.setOutcome): hired bills the fee, un-hired takes it back. */
export async function billOutcome(ctx: MutationCtx, applicantId: Id<"recruitApplicants">, before: Doc<"recruitApplicants">["outcome"], after: "hired" | "not_hired" | null) {
  if (after === "hired" && before !== "hired") await ctx.scheduler.runAfter(0, internal.recruiting.billing.chargeHire, { applicantId });
  if (before === "hired" && after !== "hired") await ctx.scheduler.runAfter(0, internal.recruiting.billing.unchargeHire, { applicantId });
}
