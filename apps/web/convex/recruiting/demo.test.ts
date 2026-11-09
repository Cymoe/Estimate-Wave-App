import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules, signUp } from "../test.setup";
import { SCRIPT } from "./demo";

// Nothing in the demo may reach Claude.
const claude = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./lib/claude", () => ({
  MODEL: () => "test-model",
  createMessage: async () => {
    claude.calls++;
    throw new Error("the demo called Claude");
  },
  createJson: async () => {
    claude.calls++;
    throw new Error("the demo called Claude");
  },
}));

const NOW = Date.parse("2026-11-09T16:00:00.000Z");
let net: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setTimeout", "clearTimeout"] });
  // Everything that could text, book or call out is set up, and still nothing may go out.
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("RECRUIT_TWILIO_FROM", "+14325559999");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
  vi.stubEnv("CAL_API_KEY", "cal");
  net = vi.fn(async () => new Response("{}", { status: 201 }));
  vi.stubGlobal("fetch", net);
  claude.calls = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function staffOf() {
  const t = convexTest(schema, modules);
  const staff = (await signUp(t, "staff@webbleads.example", { role: "staff" })).as;
  return { t, staff };
}

describe("the recruiting demo", () => {
  test("seeding fills every tab: clients, applicants in every state, ads with numbers, hires leading", async () => {
    const { t, staff } = await staffOf();
    await staff.mutation(api.recruiting.ops.demoSeed, {});
    // Seeding again starts over instead of doubling up.
    await staff.mutation(api.recruiting.ops.demoSeed, {});

    const [client] = await staff.query(api.recruiting.ops.clients, {});
    expect(client).toMatchObject({ name: "Demo Roofing Co", slug: "demo", demo: true, applicants: 14, hired: 2, adsEnabled: false });
    const applicants = await staff.query(api.recruiting.ops.applicants, {});
    expect(applicants).toHaveLength(14);
    expect(new Set(applicants.map((a) => a.status))).toEqual(new Set(["interviewed", "booked", "no_show", "screening", "qualified", "ghosted", "rejected", "opted_out", "flagged", "texted"]));
    expect(applicants.every((a) => a.demo)).toBe(true);
    const dana = applicants.find((a) => a.name === "Dana Cruz")!;
    expect(dana).toMatchObject({ outcome: "hired", score: "A" });
    expect((await staff.query(api.recruiting.ops.thread, { applicantId: dana.id }))!.messages.length).toBeGreaterThan(2);

    const ads = (await staff.query(api.recruiting.ops.ads, {})).clients[0];
    expect(ads.drafts.length).toBe(12);
    expect(ads.drafts.find((d) => d.body.includes("$250k"))!.warnings[0]).toMatch(/Pay number not in the comp sheet/);
    expect(ads.drafts.filter((d) => d.warnings.length === 0).length).toBeGreaterThan(8);
    expect(ads.latest!.learningNotes).toMatch(/Money proof wins/);
    expect(ads.retire).toEqual([{ sourceAdId: "demo-h2", reason: expect.stringContaining("no A's") }]);
    // Hires per dollar first: the video's hire cost $180, the money-proof ad's $300.
    expect(ads.performance.slice(0, 2).map((r) => [r.sourceAdId, r.hired, r.costPerHireCents])).toEqual([
      ["demo-v3", 1, 18_000],
      ["demo-m1", 1, 30_000],
    ]);
    expect((await staff.query(api.recruiting.ops.byAd, {}))[0]).toMatchObject({ hired: 1 });

    const token = (await t.run(async (ctx) => ctx.db.get(client.id)))!.hiresToken!;
    const hires = (await t.query(api.recruiting.public.hires, { token }))!;
    expect(hires.reps.filter((r) => r.outcome === "hired").map((r) => r.name).sort()).toEqual(["Dana Cruz", "Marcus Hill"]);
    expect(await t.query(api.recruiting.public.job, { slug: "demo" })).toMatchObject({ company: "Demo Roofing Co" });
    expect(net).not.toHaveBeenCalled();
  });

  test("the live run plays from first text to hired, scripted, with nothing sent anywhere", async () => {
    const { t, staff } = await staffOf();
    // No demo yet: watching seeds it first.
    const id = await staff.mutation(api.recruiting.ops.demoLive, {});
    expect((await staff.query(api.recruiting.ops.clients, {}))[0].name).toBe("Demo Roofing Co");
    expect((await staff.query(api.recruiting.ops.thread, { applicantId: id }))!.messages).toEqual([]);
    // A minute and a half, start to finish.
    expect(SCRIPT.reduce((s, x) => s + x.after, 0)).toBeLessThan(120_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = (await staff.query(api.recruiting.ops.thread, { applicantId: id }))!;
    expect(done.applicant).toMatchObject({ name: "Taylor Reed", status: "interviewed", outcome: "hired", score: "A", sourceAdId: "demo-m1", demo: true });
    expect(done.messages[0]).toMatchObject({ direction: "out", body: expect.stringContaining("Hey Taylor, it's Jordan") });
    expect(done.messages.map((m) => m.direction)).toEqual(SCRIPT.filter((s) => s.text).map((s) => s.text!("x")[0]));
    expect(done.applicant.answers).toMatchObject({ role: expect.stringContaining("closer"), transport: "own car" });
    expect(net).not.toHaveBeenCalled();
    expect(claude.calls).toBe(0);
  });

  test("applying at /jobs/demo gets the scripted conversation, not Claude; a real text from that number does nothing", async () => {
    const { t, staff } = await staffOf();
    await staff.mutation(api.recruiting.ops.demoSeed, {});
    await t.mutation(api.recruiting.public.apply, { slug: "demo", name: "Myles Cameron", phone: "(432) 555-0177", agreed: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const me = (await staff.query(api.recruiting.ops.applicants, {})).find((a) => a.name === "Myles Cameron")!;
    expect(me).toMatchObject({ demo: true, outcome: "hired" });
    const thread = (await staff.query(api.recruiting.ops.thread, { applicantId: me.id }))!;
    expect(thread.messages[0].body).toContain("Hey Myles");
    // A real text in from that phone: logged, but no agent turn and no reply.
    await t.mutation(internal.recruiting.applicants.inbound, { from: "+14325550177", body: "hello?" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(net).not.toHaveBeenCalled();
    expect(claude.calls).toBe(0);
  });

  test("the follow-up sweep leaves demo reps alone, and Write a new batch makes a scripted one", async () => {
    const { t, staff } = await staffOf();
    const { clientId } = await t.mutation(internal.recruiting.demo.seed, {});
    vi.setSystemTime(NOW + 3 * 86_400_000);
    await t.mutation(internal.recruiting.followups.sweep, {});
    const mia = (await t.run(async (ctx) => ctx.db.query("recruitApplicants").collect())).find((a) => a.name === "Mia Grant")!;
    expect(mia).toMatchObject({ status: "texted", followUps: 0 });
    await staff.mutation(api.recruiting.ops.writeBatch, { clientId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const batches = await t.run(async (ctx) => ctx.db.query("recruitAdBatches").collect());
    expect(batches.filter((b) => b.status === "ready")).toHaveLength(3);
    expect(claude.calls).toBe(0);
  });

  test("Remove demo data takes all of it, including a run still playing; owners can't touch the demo", async () => {
    const { t, staff } = await staffOf();
    await staff.mutation(api.recruiting.ops.demoSeed, {});
    await staff.mutation(api.recruiting.ops.demoLive, {});
    expect(await staff.mutation(api.recruiting.ops.demoClear, {})).toEqual({ removed: 15 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run(async (ctx) => ({
      clients: (await ctx.db.query("recruitClients").collect()).length,
      applicants: (await ctx.db.query("recruitApplicants").collect()).length,
      messages: (await ctx.db.query("recruitMessages").collect()).length,
      ads: (await ctx.db.query("recruitAds").collect()).length,
      batches: (await ctx.db.query("recruitAdBatches").collect()).length,
    }));
    expect(left).toEqual({ clients: 0, applicants: 0, messages: 0, ads: 0, batches: 0 });
    const owner = await signUp(t, "owner@roofer.example");
    await expect(owner.as.mutation(api.recruiting.ops.demoSeed, {})).rejects.toThrow();
    await expect(owner.as.mutation(api.recruiting.ops.demoLive, {})).rejects.toThrow();
    await expect(owner.as.mutation(api.recruiting.ops.demoClear, {})).rejects.toThrow();
  });
});
