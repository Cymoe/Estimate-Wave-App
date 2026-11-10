import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { verifyStripeSignature } from "./lib/stripe";
import { twilioSignatureOk } from "./lib/sms";
import { addOAuthRoutes } from "./lib/oauthRoutes";
import { addMcpRoutes } from "./lib/mcpServer";
import { addRecruitingRoutes } from "./recruiting/routes";
import { addEmailRoutes } from "./lib/emailRoutes";

const http = httpRouter();

auth.addHttpRoutes(http);
// Sign-in for assistants (Claude, ChatGPT) connecting to the connector.
addOAuthRoutes(http);
// The connector itself: what a connected assistant calls.
addMcpRoutes(http);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Where leads from outside land: Zapier, LeadsBridge or Make (fed by a
 * Facebook Lead Ads form) POST JSON here. The key comes from the INTAKE_KEY
 * environment variable on the deployment and travels as ?key=… or an
 * x-intake-key header. The lead goes into the intake queue for staff to
 * confirm; nothing is sold from this endpoint.
 */
http.route({
  path: "/intake/lead",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const sourceParam = url.searchParams.get("source") ?? undefined;
    // Every hit leaves a row in the intake log, so a form that "fired and nothing showed up" can be traced.
    const reject = async (reason: string, status: number, summary?: string) => {
      await ctx.runMutation(internal.intake.log, { outcome: "rejected", reason, source: sourceParam, summary });
      return json({ error: reason }, status);
    };
    const expected = process.env.INTAKE_KEY;
    if (!expected) return await reject("Intake isn't set up yet (no INTAKE_KEY)", 503);
    const given = request.headers.get("x-intake-key") ?? url.searchParams.get("key");
    if (given !== expected) return await reject("Wrong key", 401);
    const text = await request.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return await reject("Send JSON", 400, text.slice(0, 300));
    }
    if (!payload || typeof payload !== "object") return await reject("Send a JSON object", 400, text.slice(0, 300));
    const result = await ctx.runMutation(internal.intake.receive, {
      payload,
      source: sourceParam === "meta" || sourceParam === "call" || sourceParam === "manual" || sourceParam === "api" ? sourceParam : undefined,
    });
    await ctx.runMutation(internal.intake.log, {
      outcome: result.repeat ? "repeat" : "accepted",
      reason: result.repeat ? "Same outside id as a lead already in" : result.duplicate ? "Same phone as another lead: flagged" : undefined,
      source: sourceParam,
      externalId: result.externalId,
      intakeLeadId: result.id,
      summary: result.summary,
    });
    return json({ id: result.id, duplicate: result.duplicate, repeat: result.repeat }, result.repeat ? 200 : 201);
  }),
});

/**
 * Stripe's webhook for Checkout. Verified with STRIPE_WEBHOOK_SECRET; a paid
 * session loads the company's balance (once), an expired or failed one
 * reopens the funding link. Always answers 200 once it has read the event
 * so Stripe stops retrying.
 */
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return json({ error: "Payments aren't set up yet (no STRIPE_WEBHOOK_SECRET)" }, 503);
    const raw = await request.text();
    if (!(await verifyStripeSignature(secret, request.headers.get("stripe-signature"), raw))) {
      return json({ error: "Bad signature" }, 400);
    }
    let event: { type?: string; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ error: "Send JSON" }, 400);
    }
    const type = event?.type;
    const session = event?.data?.object;
    const sessionId = typeof session?.id === "string" ? session.id : undefined;
    if (!type || !sessionId) return json({ ok: true, ignored: true });
    // A recruiting client's retainer (recruiting/billing.ts): its checkout carries recruitClientId; its invoices and
    // subscription carry it in metadata, or are matched by the Stripe customer.
    const str = (x: unknown) => (typeof x === "string" ? x : undefined);
    const meta = (session!.metadata ?? {}) as Record<string, unknown>;
    const subscriptionMeta = ((session!.subscription_details as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {}) as Record<string, unknown>;
    const recruitClientId = str(meta.recruitClientId) ?? str(subscriptionMeta.recruitClientId);
    const recruitingEvent =
      (type === "checkout.session.completed" && session!.mode === "subscription") ||
      type === "invoice.paid" ||
      type === "invoice.payment_failed" ||
      type === "customer.subscription.deleted";
    if (recruitingEvent && (recruitClientId || type !== "checkout.session.completed")) {
      const r = await ctx.runMutation(internal.recruiting.billing.stripeEvent, {
        type,
        clientId: recruitClientId,
        customer: str(session!.customer),
        subscription: type === "customer.subscription.deleted" ? sessionId : str(session!.subscription),
      });
      if (r.recruiting || type !== "checkout.session.completed") return json({ ok: true, ...r });
    }
    if ((type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") && session!.payment_status === "paid") {
      const details = (session!.customer_details ?? {}) as { name?: string | null; email?: string | null };
      const metadata = (session!.metadata ?? {}) as { fundingRequestId?: string };
      // What Stripe says was paid is what lands on the balance: never the amount the page last showed.
      const result = await ctx.runMutation(internal.funding.fulfill, {
        sessionId,
        amountTotal: typeof session!.amount_total === "number" ? session!.amount_total : undefined,
        requestId: typeof metadata.fundingRequestId === "string" ? metadata.fundingRequestId : undefined,
        clientReference: typeof session!.client_reference_id === "string" ? session!.client_reference_id : undefined,
        paymentIntentId: typeof session!.payment_intent === "string" ? session!.payment_intent : undefined,
        payerName: details.name ?? undefined,
        payerEmail: details.email ?? undefined,
      });
      return json({ ok: true, ...result });
    }
    if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
      return json({ ok: true, ...(await ctx.runMutation(internal.funding.expire, { sessionId })) });
    }
    return json({ ok: true, ignored: true });
  }),
});

/**
 * Texts to the Webb Leads number (Twilio's "A message comes in" webhook):
 * the office line (agent.ts). Signed by Twilio with TWILIO_AUTH_TOKEN; the
 * answer goes out as its own text, so this replies with empty TwiML at once.
 * TWILIO_WEBHOOK_URL overrides the URL that was signed, when Twilio posts
 * to a different address than the one this function sees.
 */
http.route({
  path: "/twilio/sms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!token) return new Response("Texting isn't set up", { status: 503 });
    const params: Record<string, string> = {};
    for (const [k, val] of new URLSearchParams(await request.text())) params[k] = val;
    const url = process.env.TWILIO_WEBHOOK_URL ?? request.url;
    if (!(await twilioSignatureOk(token, url, params, request.headers.get("x-twilio-signature")))) {
      return new Response("Bad signature", { status: 403 });
    }
    if (params.From && params.Body !== undefined) await ctx.runMutation(internal.agent.inboundSms, { from: params.From, body: params.Body });
    return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "content-type": "text/xml" } });
  }),
});

// Email outreach: Gmail's connect callback, replies, and unsubscribe (lib/emailRoutes.ts).
addEmailRoutes(http);

// National Sales Registry's recruiting (recruiting/routes.ts): its own number's webhook, applications, Cal.com, ad spend.
addRecruitingRoutes(http);

export default http;
