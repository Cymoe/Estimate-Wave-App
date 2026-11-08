import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules, signUp } from "../test.setup";
import { BURST } from "./public";
import { reportText } from "./reports";

vi.mock("./lib/claude", () => ({
  MODEL: () => "test-model",
  createMessage: async () => {
    throw new Error("not in these tests");
  },
  createJson: async () => {
    throw new Error("not in these tests");
  },
}));

const client = {
  name: "Acme Roofing",
  role: "Door-to-door roofing sales rep",
  city: "Midland, TX",
  compSheet: "Closers: 10% of contract value. Earnings vary.",
  calEventLink: "https://cal.com/acme/interview",
  timezone: "America/Chicago",
};
const NOW = Date.parse("2026-11-09T16:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setUp() {
  const t = convexTest(schema, modules);
  const staff = (await signUp(t, "staff@webbleads.example", { role: "staff" })).as;
  const clientId = (await staff.mutation(api.recruiting.ops.saveClient, client)) as Id<"recruitClients">;
  return { t, staff, clientId };
}

describe("the apply page, /jobs/<slug>", () => {
  test("a client gets its address when it's saved; the page shows the job and the consent wording", async () => {
    const { t, staff } = await setUp();
    const [c] = await staff.query(api.recruiting.ops.clients, {});
    expect(c.slug).toBe("acme");
    const job = await t.query(api.recruiting.public.job, { slug: "ACME" });
    expect(job).toMatchObject({ company: "Acme Roofing", role: "Door-to-door roofing sales rep", city: "Midland, TX", service: "National Sales Registry" });
    expect(job!.consent).toMatch(/agree that National Sales Registry may text you .* Acme Roofing job, including automated texts.*Reply STOP to opt out, HELP for help\./);
    expect(await t.query(api.recruiting.public.job, { slug: "nope" })).toBeNull();
    // A second client with the same first word gets its own address.
    await staff.mutation(api.recruiting.ops.saveClient, { ...client, name: "Acme Solar" });
    expect((await staff.query(api.recruiting.ops.clients, {})).map((x) => x.slug).sort()).toEqual(["acme", "acme2"]);
  });

  test("applying saves the rep with the ad they came from and the words they agreed to, and Jordan's first text is on its way", async () => {
    const { t, clientId } = await setUp();
    await expect(t.mutation(api.recruiting.public.apply, { slug: "acme", ad: "acme-m1", name: "Dana Cruz", phone: "432-555-0100", agreed: false })).rejects.toThrow(/Check the box/);
    await expect(t.mutation(api.recruiting.public.apply, { slug: "acme", ad: "acme-m1", name: "Dana Cruz", phone: "555", agreed: true })).rejects.toThrow(/US cell number/);
    expect(await t.mutation(api.recruiting.public.apply, { slug: "acme", ad: "acme-m1", name: " Dana Cruz ", phone: "(432) 555-0100", agreed: true })).toEqual({ existing: false });
    // The same number again is the same applicant, not a second text.
    expect(await t.mutation(api.recruiting.public.apply, { slug: "acme", ad: "acme-m1", name: "Dana", phone: "4325550100", agreed: true })).toEqual({ existing: true });
    // A link with no ad, or a mangled one, still works.
    await t.mutation(api.recruiting.public.apply, { slug: "acme", ad: "<script>", name: "Lee Park", phone: "4325550101", agreed: true });
    const rows = await t.run(async (ctx) => ctx.db.query("recruitApplicants").withIndex("by_client", (q) => q.eq("clientId", clientId)).collect());
    expect(rows.map((a) => [a.name, a.phone, a.sourceAdId])).toEqual([
      ["Dana Cruz", "+14325550100", "acme-m1"],
      ["Lee Park", "+14325550101", "direct"],
    ]);
    expect(rows[0].consentText).toMatch(/^By tapping Apply, you agree/);
    expect(rows[0].consentAt).toBe(new Date(NOW).toISOString());
    const jobs = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.filter((j) => j.name.includes("firstText"))).toHaveLength(2);
  });

  test("a number that texted STOP isn't texted again; a paused client's page is closed", async () => {
    const { t, staff, clientId } = await setUp();
    await t.run(async (ctx) => ctx.db.insert("recruitOptOuts", { phone: "+14325550100", at: new Date(NOW).toISOString() }));
    await expect(t.mutation(api.recruiting.public.apply, { slug: "acme", name: "Dana", phone: "4325550100", agreed: true })).rejects.toThrow(/opted out/);
    await staff.mutation(api.recruiting.ops.saveClient, { clientId, ...client, active: false });
    expect(await t.query(api.recruiting.public.job, { slug: "acme" })).toBeNull();
    await expect(t.mutation(api.recruiting.public.apply, { slug: "acme", name: "Lee", phone: "4325550101", agreed: true })).rejects.toThrow(/isn't taking applications/);
  });

  test(`more than ${BURST} applications in ten minutes and the page asks people to wait`, async () => {
    const { t, clientId } = await setUp();
    await t.run(async (ctx) => {
      for (let i = 0; i < BURST; i++)
        await ctx.db.insert("recruitApplicants", { name: `Rep ${i}`, phone: `+1432555${String(1000 + i)}`, clientId, sourceAdId: "acme-m1", answers: {}, status: "texted", followUps: 0, createdAt: new Date(NOW - 60_000).toISOString() });
    });
    await expect(t.mutation(api.recruiting.public.apply, { slug: "acme", name: "Dana", phone: "4325550100", agreed: true })).rejects.toThrow(/Try again in a few minutes/);
  });

  test("a client saved before slugs existed is found by its name", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => ctx.db.insert("recruitClients", { ...client, name: "Storm Pros", active: true, createdAt: new Date(NOW).toISOString() }));
    expect(await t.query(api.recruiting.public.job, { slug: "storm" })).toMatchObject({ company: "Storm Pros" });
  });
});

describe("hires", () => {
  async function withReps() {
    const s = await setUp();
    const add = (name: string, extra: Record<string, unknown>) =>
      s.t.run(async (ctx) =>
        ctx.db.insert("recruitApplicants", { name, phone: `+1432555${name.length}${name.charCodeAt(0)}`, clientId: s.clientId, sourceAdId: "acme-m1", answers: {}, followUps: 0, createdAt: new Date(NOW - 5 * 86_400_000).toISOString(), status: "screening", ...extra }),
      );
    const showed = await add("Dana Cruz", { status: "interviewed", score: "A", interviewAt: new Date(NOW - 86_400_000).toISOString() });
    const pastBooked = await add("Lee Park", { status: "booked", score: "B", interviewAt: new Date(NOW - 3_600_000).toISOString(), bookedAt: new Date(NOW - 2 * 86_400_000).toISOString() });
    await add("Sam Ortiz", { status: "booked", score: "A", interviewAt: new Date(NOW + 86_400_000).toISOString() });
    await add("Kai Lee", { status: "screening" });
    const token = (await s.t.run(async (ctx) => ctx.db.get(s.clientId)))!.hiresToken!;
    return { ...s, showed, pastBooked, token };
  }

  test("the client's link lists reps whose interview has passed; marking one hired counts them as showed", async () => {
    const { t, token, showed, pastBooked } = await withReps();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await t.query(api.recruiting.public.hires, { token: "wrong" })).toBeNull();
    const list = (await t.query(api.recruiting.public.hires, { token }))!;
    expect(list.company).toBe("Acme Roofing");
    expect(list.reps.map((r) => r.name)).toEqual(["Lee Park", "Dana Cruz"]);
    await t.mutation(api.recruiting.public.setHire, { token, applicantId: pastBooked, outcome: "hired" });
    await t.mutation(api.recruiting.public.setHire, { token, applicantId: showed, outcome: "not_hired" });
    const lee = (await t.run(async (ctx) => ctx.db.get(pastBooked)))!;
    expect(lee).toMatchObject({ outcome: "hired", status: "interviewed", outcomeAt: new Date(NOW).toISOString() });
    expect((await t.query(api.recruiting.public.hires, { token }))!.reps.map((r) => r.outcome)).toEqual(["hired", "not_hired"]);
    // Clearing it takes the outcome off.
    await t.mutation(api.recruiting.public.setHire, { token, applicantId: showed, outcome: null });
    expect((await t.run(async (ctx) => ctx.db.get(showed)))!.outcome).toBeUndefined();
  });

  test("a link can't touch another client's reps", async () => {
    const { t, staff, showed } = await withReps();
    const otherId = (await staff.mutation(api.recruiting.ops.saveClient, { ...client, name: "Storm Pros" })) as Id<"recruitClients">;
    const other = (await t.run(async (ctx) => ctx.db.get(otherId)))!.hiresToken!;
    await expect(t.mutation(api.recruiting.public.setHire, { token: other, applicantId: showed, outcome: "hired" })).rejects.toThrow(/isn't on this list/);
    await expect(t.mutation(api.recruiting.public.setHire, { token: "wrong", applicantId: showed, outcome: "hired" })).rejects.toThrow(/isn't valid/);
  });

  test("staff mark hires from Ops; owners can't", async () => {
    const { t, staff, showed } = await withReps();
    await staff.mutation(api.recruiting.ops.markOutcome, { applicantId: showed, outcome: "hired" });
    expect((await staff.query(api.recruiting.ops.thread, { applicantId: showed }))!.applicant.outcome).toBe("hired");
    const owner = await signUp(t, "owner@roofer.example");
    await expect(owner.as.mutation(api.recruiting.ops.markOutcome, { applicantId: showed, outcome: null })).rejects.toThrow();
  });

  test("hires lead the ad numbers, cost per hire is worked out, and an ad with a hire isn't up for retiring", async () => {
    const { t, staff, clientId } = await setUp();
    await t.run(async (ctx) => {
      const batchId = await ctx.db.insert("recruitAdBatches", { clientId, status: "ready", createdAt: new Date(NOW).toISOString() });
      for (const [sourceAdId, spendCents] of [["acme-m1", 20_000], ["acme-m2", 20_000]] as const)
        await ctx.db.insert("recruitAds", { clientId, batchId, kind: "meta_primary", angle: "money proof", body: sourceAdId, warnings: [], status: "approved", sourceAdId, spendCents, createdAt: new Date(NOW).toISOString() });
      // acme-m1: 12 applicants, two A's. acme-m2: 12 applicants, no A's, but one of them was hired.
      for (let i = 0; i < 24; i++) {
        const m1 = i < 12;
        await ctx.db.insert("recruitApplicants", {
          name: `Rep ${i}`,
          phone: `+1432555${1000 + i}`,
          clientId,
          sourceAdId: m1 ? "acme-m1" : "acme-m2",
          answers: {},
          followUps: 0,
          createdAt: new Date(NOW - 86_400_000).toISOString(),
          status: !m1 && i === 12 ? "interviewed" : "screening",
          score: m1 && i < 2 ? "A" : "C",
          ...(!m1 && i === 12 ? { outcome: "hired" as const, outcomeAt: new Date(NOW).toISOString() } : {}),
        });
      }
    });
    const review = (await staff.query(api.recruiting.ops.ads, {})).clients[0];
    expect(review.performance.map((r) => [r.sourceAdId, r.hired, r.costPerHireCents])).toEqual([
      ["acme-m2", 1, 20_000],
      ["acme-m1", 0, null],
    ]);
    // Volume and no A's would retire acme-m2, but it got someone hired.
    expect(review.retire).toEqual([]);
    expect(review.client.slug).toBe("acme");
    expect((await staff.query(api.recruiting.ops.byAd, {}))[0]).toMatchObject({ sourceAdId: "acme-m2", hired: 1 });
    // The client's week counts the hire and carries their link.
    const w = await t.query(internal.recruiting.reports.week, { clientId });
    expect(w.counts.hired).toBe(1);
    const email = reportText(w, "https://app.example/hires/abc");
    expect(email.text).toContain("Hired: 1");
    expect(email.text).toContain("Who did you hire? Mark them here, so we find you more like them: https://app.example/hires/abc");
    expect(email.html).toContain('<a href="https://app.example/hires/abc">Mark who you hired</a>');
  });
});
