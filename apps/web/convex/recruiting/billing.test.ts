import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules, signUp } from "../test.setup";
import { signStripePayload } from "../lib/stripe";

vi.mock("./lib/claude", () => ({
  MODEL: () => "test-model",
  createMessage: async () => {
    throw new Error("not in these tests");
  },
  createJson: async () => {
    throw new Error("not in these tests");
  },
}));

const NOW = Date.parse("2026-11-10T16:00:00.000Z");
type Call = { url: string; method: string; body: string; auth: string };
let calls: Call[];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("SITE_URL", "https://app.example");
  calls = [];
  let items = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(url), method: init.method ?? "GET", body: String(init.body ?? ""), auth: headers.authorization ?? "" });
      if (String(url).endsWith("/v1/checkout/sessions")) return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" }), { status: 200 });
      if (String(url).endsWith("/v1/invoiceitems")) return new Response(JSON.stringify({ id: `ii_${++items}` }), { status: 200 });
      if (String(url).includes("/v1/invoiceitems/")) return new Response(JSON.stringify({ deleted: true }), { status: 200 });
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const stripe = () => calls.filter((c) => c.url.startsWith("https://api.stripe.com"));
const emails = () => calls.filter((c) => c.url.includes("resend")).map((c) => JSON.parse(c.body) as { to: string[]; subject: string; text: string });

async function setUp() {
  const t = convexTest(schema, modules);
  const staff = (await signUp(t, "myles@webbleads.example", { role: "staff" })).as;
  const clientId = (await staff.mutation(api.recruiting.ops.saveClient, {
    name: "Acme Roofing",
    role: "Roofing sales rep",
    city: "Midland, TX",
    compSheet: "10% of every roof. Earnings vary.",
    calEventLink: "https://cal.com/acme/interview",
    timezone: "America/Chicago",
    reportEmail: "owner@acme.example",
  })) as Id<"recruitClients">;
  const rep = (name: string, extra: Record<string, unknown> = {}) =>
    t.run(async (ctx) =>
      ctx.db.insert("recruitApplicants", { name, phone: `+1432555${1000 + name.length}`, clientId, sourceAdId: "acme-m1", answers: {}, followUps: 0, createdAt: new Date(NOW - 86_400_000).toISOString(), status: "interviewed", ...extra }),
    );
  return { t, staff, clientId, rep };
}

async function webhook(t: Awaited<ReturnType<typeof setUp>>["t"], event: unknown, secret = "whsec_test") {
  const raw = JSON.stringify(event);
  return t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": await signStripePayload(secret, Math.floor(Date.now() / 1000), raw) }, body: raw });
}

const billing = async (t: Awaited<ReturnType<typeof setUp>>["t"], clientId: Id<"recruitClients">) => (await t.run(async (ctx) => ctx.db.get(clientId)))!.billing;

describe("billing recruiting clients", () => {
  test("set the plan, send the link: a monthly Stripe subscription for the retainer, emailed to the client", async () => {
    const { t, staff, clientId } = await setUp();
    await expect(staff.action(api.recruiting.billing.sendPaymentLink, { clientId })).rejects.toThrow(/Set the client's plan first/);
    await staff.mutation(api.recruiting.billing.setPlan, { clientId, monthlyDollars: 2500, perHireDollars: 250 });
    const r = await staff.action(api.recruiting.billing.sendPaymentLink, { clientId });
    expect(r).toEqual({ link: "https://checkout.stripe.com/c/cs_1", emailed: true });
    const form = new URLSearchParams(stripe()[0].body);
    expect(stripe()[0].auth).toBe("Bearer sk_test_x");
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("250000");
    expect(form.get("line_items[0][price_data][recurring][interval]")).toBe("month");
    expect(form.get("customer_email")).toBe("owner@acme.example");
    expect(form.get("metadata[recruitClientId]")).toBe(clientId);
    expect(form.get("subscription_data[metadata][recruitClientId]")).toBe(clientId);
    expect(form.get("success_url")).toBe("https://app.example/recruit?paid=1");
    expect(emails()[0]).toMatchObject({ to: ["owner@acme.example"], text: expect.stringContaining("$2,500 a month, plus $250 for each rep you hire") });
    expect(await billing(t, clientId)).toMatchObject({ status: "link_sent", link: "https://checkout.stripe.com/c/cs_1", monthlyCents: 250000, perHireCents: 25000 });
  });

  test("Stripe's webhook: paid makes them active, a failed invoice past due (staff told), cancel ends it; a bad signature is refused", async () => {
    const { t, staff, clientId } = await setUp();
    await staff.mutation(api.recruiting.billing.setPlan, { clientId, monthlyDollars: 2500, perHireDollars: 250 });
    await staff.action(api.recruiting.billing.sendPaymentLink, { clientId });
    const paid = { type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "subscription", payment_status: "paid", customer: "cus_1", subscription: "sub_1", metadata: { recruitClientId: clientId } } } };
    expect((await webhook(t, paid, "whsec_other")).status).toBe(400);
    expect((await webhook(t, paid)).status).toBe(200);
    expect(await billing(t, clientId)).toMatchObject({ status: "active", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", since: new Date(NOW).toISOString() });
    // Later invoices only carry the customer.
    await webhook(t, { type: "invoice.payment_failed", data: { object: { id: "in_2", customer: "cus_1", subscription: "sub_1" } } });
    expect((await billing(t, clientId))!.status).toBe("past_due");
    await webhook(t, { type: "invoice.paid", data: { object: { id: "in_3", customer: "cus_1", subscription: "sub_1" } } });
    expect((await billing(t, clientId))!.status).toBe("active");
    await webhook(t, { type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1" } } });
    expect((await billing(t, clientId))!.status).toBe("canceled");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test("a hire adds the per-hire fee to their next invoice, once; taking the hire back takes the fee off", async () => {
    const { t, staff, clientId, rep } = await setUp();
    await staff.mutation(api.recruiting.billing.setPlan, { clientId, monthlyDollars: 2500, perHireDollars: 250 });
    await t.run(async (ctx) => {
      const c = (await ctx.db.get(clientId))!;
      await ctx.db.patch(clientId, { billing: { ...c.billing!, status: "active", stripeCustomerId: "cus_1" } });
    });
    const dana = await rep("Dana Cruz");
    await staff.mutation(api.recruiting.ops.markOutcome, { applicantId: dana, outcome: "hired" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const items = stripe().filter((c) => c.url.endsWith("/v1/invoiceitems"));
    expect(items).toHaveLength(1);
    const form = new URLSearchParams(items[0].body);
    expect(Object.fromEntries(form)).toMatchObject({ customer: "cus_1", amount: "25000", currency: "usd", description: "Hire: Dana Cruz (Roofing sales rep)", "metadata[applicantId]": dana });
    expect((await t.run(async (ctx) => ctx.db.get(dana)))!.hireInvoiceItemId).toBe("ii_1");
    expect((await staff.query(api.recruiting.ops.clients, {}))[0].billedHiresThisMonth).toBe(1);

    // Marking hired again doesn't bill twice; the client's link counts the same.
    const token = (await t.run(async (ctx) => ctx.db.get(clientId)))!.hiresToken!;
    await t.mutation(api.recruiting.public.setHire, { token, applicantId: dana, outcome: "hired" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(stripe().filter((c) => c.url.endsWith("/v1/invoiceitems"))).toHaveLength(1);

    // Taken back before the invoice: the item is deleted and the rep can be billed again later.
    await t.mutation(api.recruiting.public.setHire, { token, applicantId: dana, outcome: "not_hired" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(stripe().find((c) => c.method === "DELETE")!.url).toBe("https://api.stripe.com/v1/invoiceitems/ii_1");
    const after = (await t.run(async (ctx) => ctx.db.get(dana)))!;
    expect([after.hireInvoiceItemId, after.hireBilledAt, after.outcome]).toEqual([undefined, undefined, "not_hired"]);
  });

  test("no fee for a client who isn't paying, a test or demo rep, or without Stripe", async () => {
    const { t, staff, clientId, rep } = await setUp();
    await staff.mutation(api.recruiting.billing.setPlan, { clientId, monthlyDollars: 2500, perHireDollars: 250 });
    const a = await rep("Lee Park");
    await staff.mutation(api.recruiting.ops.markOutcome, { applicantId: a, outcome: "hired" });
    await t.run(async (ctx) => {
      const c = (await ctx.db.get(clientId))!;
      await ctx.db.patch(clientId, { billing: { ...c.billing!, status: "active", stripeCustomerId: "cus_1" } });
    });
    const demo = await rep("Demo Rep", { demo: true });
    await staff.mutation(api.recruiting.ops.markOutcome, { applicantId: demo, outcome: "hired" });
    vi.stubEnv("STRIPE_SECRET_KEY", undefined as unknown as string);
    const b = await rep("Sam Ortiz");
    await staff.mutation(api.recruiting.ops.markOutcome, { applicantId: b, outcome: "hired" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(stripe()).toEqual([]);
    await expect(staff.action(api.recruiting.billing.sendPaymentLink, { clientId })).rejects.toThrow(/Connect Stripe first/);
  });

  test("only staff set plans or send links", async () => {
    const { t, clientId } = await setUp();
    const owner = await signUp(t, "owner@roofer.example");
    await expect(owner.as.mutation(api.recruiting.billing.setPlan, { clientId, monthlyDollars: 1, perHireDollars: 0 })).rejects.toThrow();
    await expect(owner.as.action(api.recruiting.billing.sendPaymentLink, { clientId })).rejects.toThrow();
    expect(stripe()).toEqual([]);
  });

  test("the lead balance's own checkout events still go to funding", async () => {
    const { t } = await setUp();
    const r = await webhook(t, { type: "checkout.session.completed", data: { object: { id: "cs_fund", mode: "payment", payment_status: "paid", amount_total: 1000, metadata: {} } } });
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).not.toContain("recruiting");
  });
});

describe("the sales page's prices", () => {
  test("defaults, or what's set on the deployment", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.recruiting.public.salesInfo, {})).toMatchObject({ monthly: 2500, perHire: 250, bookingUrl: null });
    vi.stubEnv("RECRUIT_PRICE_MONTHLY", "$3,000");
    vi.stubEnv("RECRUIT_PRICE_PER_HIRE", "0");
    vi.stubEnv("RECRUIT_SALES_BOOKING_URL", "https://cal.com/myles/15");
    expect(await t.query(api.recruiting.public.salesInfo, {})).toMatchObject({ monthly: 3000, perHire: 0, bookingUrl: "https://cal.com/myles/15" });
  });
});
