import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { verifyStripeSignature } from "./lib/stripe";

const http = httpRouter();

auth.addHttpRoutes(http);

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
    const expected = process.env.INTAKE_KEY;
    if (!expected) return json({ error: "Intake isn't set up yet (no INTAKE_KEY)" }, 503);
    const url = new URL(request.url);
    const given = request.headers.get("x-intake-key") ?? url.searchParams.get("key");
    if (given !== expected) return json({ error: "Wrong key" }, 401);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Send JSON" }, 400);
    }
    if (!payload || typeof payload !== "object") return json({ error: "Send a JSON object" }, 400);
    const source = url.searchParams.get("source");
    const result = await ctx.runMutation(internal.intake.receive, {
      payload,
      source: source === "meta" || source === "call" || source === "manual" || source === "api" ? source : undefined,
    });
    return json(result, result.repeat ? 200 : 201);
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
    if ((type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") && session!.payment_status === "paid") {
      const details = (session!.customer_details ?? {}) as { name?: string | null; email?: string | null };
      const result = await ctx.runMutation(internal.funding.fulfill, {
        sessionId,
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

export default http;
