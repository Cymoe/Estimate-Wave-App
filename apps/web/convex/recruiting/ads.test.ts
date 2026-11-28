import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { batchProblems, batchRequest, type Batch } from "./adAgent";
import { AD_BRIEF } from "./lib/briefs";
import { amounts, checkPiece } from "./lib/adChecks";
import schema from "../schema";
import { modules, signUp } from "../test.setup";

// Claude's batch, from a fixture: the test sets what comes back.
const claude = vi.hoisted(() => ({ next: null as unknown, calls: [] as Array<{ system: string; user: string; schema: Record<string, unknown> }> }));
vi.mock("./lib/claude", () => ({
  MODEL: () => "test-model",
  createMessage: async () => {
    throw new Error("the screener isn't part of these tests");
  },
  createJson: async (req: { system: string; user: string; schema: Record<string, unknown> }) => {
    claude.calls.push(req);
    if (claude.next instanceof Error) throw claude.next;
    return claude.next;
  },
}));

const COMP = "Commission-based. Closers: 10% of contract value, average job $14k. Setters: $150 per appointment that sits, plus $250 when it closes. First-year closers average $60-90k; top closers clear $150k+ in storm season.";
const STORIES = ["Marcus was a line cook at $14 an hour; in his second storm season he closed $1.1M and made $112,000."];

const piece = (text: string, angle: string, variation_of: string | null = null) => ({ text, angle, variation_of });
const fullBatch = (over: Partial<Batch> = {}): Batch => ({
  hooks: Array.from({ length: 12 }, (_, i) => piece(`Hook ${i + 1}: knock doors, average job $14k`, i < 8 ? "money proof" : "Storm Season", i < 6 ? "acme-m1" : null)),
  meta_primary: [
    piece("Closers here average $60-90k their first year. Earnings vary; it's commission-based. Apply in 2 minutes.", "money proof", "acme-m1"),
    piece("Marcus went from line cook to $112,000. Earnings vary and are commission-based.", "rep story", "made-up-id"),
    piece("Make $250k guaranteed income your first summer!", "money proof"),
    piece("Young hungry guys wanted. Earnings vary, commission-based.", "competition"),
    piece("Your schedule, your income. Earnings vary, commission-based.", "freedom"),
  ],
  video_scripts: Array.from({ length: 5 }, (_, i) => ({ title: `Script ${i + 1}`, script: "[Rep at a door] Two summers ago I was flipping burgers. Earnings vary, it's commission-based, but closers here average $60-90k.", angle: "rep story", variation_of: null })),
  indeed_posts: Array.from({ length: 3 }, (_, i) => ({ title: `Roofing Sales Rep ${i + 1}`, body: "Commission-based roofing sales. Closers earn 10% of contract value. Earnings vary.", angle: "no experience", variation_of: null })),
  retire: [
    { source_ad_id: "acme-m2", reason: "14 applicants, no A's" },
    { source_ad_id: "not-an-ad", reason: "made up" },
  ],
  learning_notes: "Money proof brings the A's; storm season is untested.",
  ...over,
});

function setup() {
  const t = convexTest(schema, modules);
  const client = async (over: Record<string, unknown> = {}) =>
    (
      await t.mutation(internal.recruiting.clients.create, {
        name: "Acme Roofing",
        role: "Door-to-door roofing sales rep",
        city: "Midland, TX",
        compSheet: COMP,
        calEventLink: "https://cal.com/acme/interview",
        timezone: "America/Chicago",
        territory: "Permian Basin",
        repStories: STORIES,
        perks: "Paid training, Cabo trip for top 10, weekly leaderboard",
        wants: "Closers and setters; experience a plus, not required",
        adsEnabled: true,
        ...over,
      })
    ).clientId;
  return { t, client };
}

/** An approved ad with this many applicants of each score. */
async function liveAd(t: ReturnType<typeof convexTest>, clientId: Id<"recruitClients">, sourceAdId: string, angle: string, scores: Array<"A" | "B" | "C">, spendDollars?: number) {
  await t.run(async (ctx) => {
    const batchId = await ctx.db.insert("recruitAdBatches", { clientId, status: "ready", createdAt: "2026-10-01T00:00:00.000Z" });
    await ctx.db.insert("recruitAds", { clientId, batchId, kind: "meta_primary", angle, body: `The ${angle} ad's words`, warnings: [], status: "approved", sourceAdId, createdAt: "2026-10-01T00:00:00.000Z", ...(spendDollars ? { spendCents: spendDollars * 100 } : {}) });
    let i = 0;
    for (const score of scores) {
      await ctx.db.insert("recruitApplicants", { name: `Rep ${i}`, phone: `+1432555${String(1000 + i++)}`, clientId, sourceAdId, answers: {}, score, status: "screening", followUps: 0, createdAt: "2026-10-05T00:00:00.000Z" });
    }
  });
}

beforeEach(() => {
  // Texts are logged, not sent, and Cal.com is a stub, so nothing real goes out.
  for (const [k, val] of Object.entries({
    RECRUIT_SMS_MODE: "simulate",
    RECRUIT_CAL_MODE: "stub",
    RECRUIT_APPLY_SECRET: "test-secret",
    TWILIO_AUTH_TOKEN: "test-token",
    RECRUIT_TWILIO_WEBHOOK_URL: "https://screener.example/recruiting/sms",
    RECRUIT_MYLES_PHONE: "+14325550000",
    ANTHROPIC_API_KEY: "test-key",
  }))
    vi.stubEnv(k, val);
  vi.useFakeTimers({ now: Date.parse("2026-11-09T15:00:00.000Z"), toFake: ["Date", "setTimeout", "clearTimeout"] });
  claude.next = null;
  claude.calls.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the brief's rules, checked in code", () => {
  test("pay numbers are read as written: $14k, $112,000, 10%, 150k+", () => {
    expect(amounts("average job $14k, top closers $150k+, 10% of contract, made $112,000, 2 summers")).toEqual([14000, 150000, -10, 112000]);
  });

  test("a pay number that isn't in the comp sheet or a rep story is flagged; one that is passes", () => {
    const inputs = { inputs: [COMP, ...STORIES].join("\n") };
    expect(checkPiece("hook", "Average job $14k. Closers keep 10%.", inputs)).toEqual([]);
    expect(checkPiece("hook", "Reps make $250k a summer", inputs)).toEqual(["Pay number not in the comp sheet or rep stories: $250,000"]);
    expect(checkPiece("hook", "Marcus made $112,000 in his second season", inputs)).toEqual([]);
  });

  test("protected traits, get-rich-quick, the missing 'earnings vary', and a script past 30 seconds", () => {
    const inputs = { inputs: COMP };
    expect(checkPiece("hook", "Young guys wanted", inputs)).toEqual(['Mentions a protected trait ("Young"): Meta\'s Employment category doesn\'t allow it']);
    expect(checkPiece("hook", "Get rich this summer", inputs)).toEqual(['Sounds like a get-rich-quick promise ("Get rich")']);
    expect(checkPiece("meta_primary", "Knock doors, close roofs. Apply today.", inputs)).toEqual(["Doesn't say earnings vary and are commission-based"]);
    expect(checkPiece("meta_primary", "Knock doors. Earnings vary; it's commission-based.", inputs)).toEqual([]);
    const long = `[Rep at a door] ${"word ".repeat(90)} Earnings vary, commission-based.`;
    expect(checkPiece("video_script", long, inputs)[0]).toMatch(/^Likely over 30 seconds \(\d+ words\)$/);
    // Stage directions aren't spoken, so they don't count.
    expect(checkPiece("video_script", `[${"direction ".repeat(90)}] Earnings vary, commission-based.`, inputs)).toEqual([]);
  });

  test("the batch sizes the brief asks for", () => {
    expect(batchProblems(fullBatch())).toEqual([]);
    expect(batchProblems(fullBatch({ hooks: [], indeed_posts: [] }))).toEqual(["0 hooks (the brief asks for 10 to 20)", "0 Indeed postings (the brief asks for 3)"]);
  });
});

describe("writing a batch", () => {
  test("Claude gets the brief, the client's inputs, the numbers by ad and angle, and the winners' words; the batch lands as checked drafts", async () => {
    const { t, client } = setup();
    const clientId = await client();
    // acme-m1 wins: 6 applicants, 3 A's, $300 spent. acme-m2 brings volume but no A's. acme-m3 is too new to tell.
    await liveAd(t, clientId, "acme-m1", "money proof", ["A", "A", "A", "B", "C", "C"], 300);
    await liveAd(t, clientId, "acme-m2", "freedom", Array(12).fill("C"), 200);
    await liveAd(t, clientId, "acme-m3", "competition", ["B"]);
    claude.next = fullBatch();
    await t.action(internal.recruiting.adAgent.writeBatch, { clientId });

    const req = claude.calls[0];
    expect(req.system).toBe(AD_BRIEF);
    expect(req.user).toContain("Comp sheet:\n" + COMP);
    expect(req.user).toContain("1. Marcus was a line cook");
    expect(req.user).toContain("acme-m1 | meta_primary | money proof | 6 | 3 | 1 | 2 | 50% | 0 | - | 0 | $300 | 1.00 | -");
    expect(req.user).toContain("acme-m3 | meta_primary | competition | 1 | 0 | 1 | 0 | 0% | 0 | - | 0 | - | - | - (not proven yet)");
    expect(req.user).toContain("## The winners' words");
    expect(req.user).toContain("[acme-m1, money proof]\nThe money proof ad's words");
    expect(req.user).toContain("Volume but no A's (acme-m2)");
    expect(req.schema).toMatchObject({ required: ["hooks", "meta_primary", "video_scripts", "indeed_posts", "retire", "learning_notes"] });

    const drafts = await t.run(async (ctx) => ctx.db.query("recruitAds").withIndex("by_client_status", (q) => q.eq("clientId", clientId).eq("status", "draft")).collect());
    expect(drafts.map((d) => d.kind).reduce<Record<string, number>>((n, k) => ({ ...n, [k]: (n[k] ?? 0) + 1 }), {})).toEqual({ hook: 12, meta_primary: 5, video_script: 5, indeed: 3 });
    const meta = drafts.filter((d) => d.kind === "meta_primary");
    // A riff on a real winner keeps its link; one on a made-up id becomes a new angle.
    expect(meta[0]).toMatchObject({ variationOf: "acme-m1", warnings: [] });
    expect(meta[1].variationOf).toBeUndefined();
    // The checks caught the invented number and the protected trait.
    expect(meta[2].warnings).toEqual(["Pay number not in the comp sheet or rep stories: $250,000", 'Sounds like a get-rich-quick promise ("guaranteed income")', "Doesn't say earnings vary and are commission-based"]);
    expect(meta[3].warnings).toEqual(['Mentions a protected trait ("Young"): Meta\'s Employment category doesn\'t allow it']);
    // Angles are tags: trimmed, lowercase.
    expect(new Set(drafts.filter((d) => d.kind === "hook").map((d) => d.angle))).toEqual(new Set(["money proof", "storm season"]));

    const batch = await t.run(async (ctx) => (await ctx.db.query("recruitAdBatches").withIndex("by_client", (q) => q.eq("clientId", clientId)).order("desc").first())!);
    expect(batch).toMatchObject({ status: "ready", variations: 7, fresh: 18, problems: [], learningNotes: "Money proof brings the A's; storm season is untested." });
    // Only real ads can be suggested for retiring.
    expect(batch.retire).toEqual([{ sourceAdId: "acme-m2", reason: "14 applicants, no A's" }]);
  });

  test("a failed batch is saved as failed with the reason, and Ops shows it", async () => {
    const { t, client } = setup();
    const clientId = await client();
    claude.next = new Error("overloaded");
    await t.action(internal.recruiting.adAgent.writeBatch, { clientId });
    const staff = await signUp(t, "staff@webbleads.example", { role: "staff" });
    expect((await staff.as.query(api.recruiting.ops.ads, {})).clients[0].failed).toBe("overloaded");
  });

  test("a new batch replaces last batch's undecided drafts; approved ones stay", async () => {
    const { t, client } = setup();
    const clientId = await client();
    claude.next = fullBatch({ retire: [] });
    await t.action(internal.recruiting.adAgent.writeBatch, { clientId });
    const first = await t.run(async (ctx) => ctx.db.query("recruitAds").collect());
    await t.mutation(internal.recruiting.ads.decide, { adId: first[0]._id, decision: "approve" });
    await t.action(internal.recruiting.adAgent.writeBatch, { clientId });
    const all = await t.run(async (ctx) => ctx.db.query("recruitAds").collect());
    const count = (status: string) => all.filter((a) => a.status === status).length;
    expect([count("approved"), count("expired"), count("draft")]).toEqual([1, 24, 25]);
  });

  test("Mondays: a batch for every active client with ads on, not the others", async () => {
    const { t, client } = setup();
    const on = await client();
    await client({ name: "Quiet Co", adsEnabled: false });
    claude.next = fullBatch({ retire: [] });
    await t.action(internal.recruiting.adAgent.weekly, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const batches = await t.run(async (ctx) => ctx.db.query("recruitAdBatches").collect());
    expect(batches.map((b) => b.clientId)).toEqual([on]);
  });

  test("with no ads run yet, the request says so and asks for a spread across angles", () => {
    const user = batchRequest({ client: { name: "New Co", role: "Setter", city: "Tulsa, OK", compSheet: "$100 per sit" }, performance: [], angles: [], retireRule: [] });
    expect(user).toContain("No ads have run yet: no winners. Spread the batch across the angles.");
    expect(user).toContain("(none given: don't write rep-story ads)");
  });
});

describe("Ops → Recruiting: the ads", () => {
  async function withBatch() {
    const s = setup();
    const clientId = await s.client();
    await liveAd(s.t, clientId, "acme-m2", "freedom", Array(12).fill("C"));
    claude.next = fullBatch({ retire: [] });
    await s.t.action(internal.recruiting.adAgent.writeBatch, { clientId });
    const staff = (await signUp(s.t, "staff@webbleads.example", { role: "staff" })).as;
    const drafts = () => s.t.run(async (ctx) => ctx.db.query("recruitAds").withIndex("by_client_status", (q) => q.eq("clientId", clientId).eq("status", "draft")).collect());
    return { ...s, clientId, staff, drafts };
  }

  test("staff only; shows the drafts with their warnings, the learning notes and retire suggestions", async () => {
    const { t, staff } = await withBatch();
    const company = await signUp(t, "owner@roofer.example");
    await expect(company.as.query(api.recruiting.ops.ads, {})).rejects.toThrow();
    const { clients } = await staff.query(api.recruiting.ops.ads, {});
    expect(clients[0].client.name).toBe("Acme Roofing");
    expect(clients[0].drafts.filter((d) => d.kind === "video_script")).toHaveLength(5);
    expect(clients[0].drafts.flatMap((d) => d.warnings)).toContain("Pay number not in the comp sheet or rep stories: $250,000");
    expect(clients[0].latest!.learningNotes).toBe("Money proof brings the A's; storm season is untested.");
    // The volume-but-no-A's rule suggests acme-m2 even though the agent didn't.
    expect(clients[0].retire).toEqual([{ sourceAdId: "acme-m2", reason: "12 applicants, no A's" }]);
  });

  test("approving gives the ad its source ad id, never one already used; rejecting doesn't; 'approve the clean ones' skips anything with a warning", async () => {
    const { t, staff, drafts, clientId } = await withBatch();
    const all = await drafts();
    const first = all.find((d) => d.kind === "meta_primary")!;
    expect(await staff.mutation(api.recruiting.ops.decideAd, { adId: first._id, decision: "approve" })).toBe("acme-m1");
    // The next number is taken (acme-m2 is already running): it's skipped, never reused.
    const second = all.filter((d) => d.kind === "meta_primary")[4];
    expect(await staff.mutation(api.recruiting.ops.decideAd, { adId: second._id, decision: "approve" })).toBe("acme-m3");
    const flagged = all.find((d) => d.warnings.length > 0)!;
    await staff.mutation(api.recruiting.ops.decideAd, { adId: all.find((d) => d.kind === "indeed")!._id, decision: "reject" });
    const ids = await staff.mutation(api.recruiting.ops.approveClean, { clientId });
    expect(ids.length).toBeGreaterThan(10);
    const after = await t.run(async (ctx) => ctx.db.query("recruitAds").collect());
    const approved = after.filter((a) => a.status === "approved" && a.batchId === first.batchId);
    expect(approved.every((a) => a.warnings.length === 0)).toBe(true);
    expect(new Set(approved.map((a) => a.sourceAdId)).size).toBe(approved.length);
    expect(approved.filter((a) => a.kind === "hook").every((a) => /^acme-h\d+$/.test(a.sourceAdId!))).toBe(true);
    expect(after.find((a) => a._id === flagged._id)!.status).toBe("draft");
    expect(after.filter((a) => a.status === "rejected")).toHaveLength(1);
  });

  test("approved ads are listed for the hand-off; spend comes back from the media buyer; retiring takes an ad out", async () => {
    const { t, staff, drafts, clientId } = await withBatch();
    const script = (await drafts()).find((d) => d.kind === "video_script")!;
    const id = (await staff.mutation(api.recruiting.ops.decideAd, { adId: script._id, decision: "approve" }))!;
    expect(id).toMatch(/^acme-v\d+$/);
    const { approved } = await staff.query(api.recruiting.ops.ads, {});
    expect(approved).toContainEqual(expect.objectContaining({ sourceAdId: id, client: "Acme Roofing", kind: "video_script", angle: "rep story", title: "Script 1" }));

    const spend = (body: unknown, secret = "test-secret") => t.fetch("/recruiting/ads/spend", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
    expect((await spend({ sourceAdId: id, dollars: 250 }, "wrong")).status).toBe(401);
    expect((await spend({ sourceAdId: "nope", dollars: 1 })).status).toBe(404);
    expect((await spend({ sourceAdId: id, dollars: 200 })).status).toBe(200);
    // Staff can set it too.
    await staff.mutation(api.recruiting.ops.setSpend, { sourceAdId: id, dollars: 250 });
    // Two A's from it: A's per $100 = 0.8. Test applicants from "Try it" don't count.
    await t.run(async (ctx) => {
      for (const n of [1, 2]) await ctx.db.insert("recruitApplicants", { name: `A${n}`, phone: `+143255577${n}0`, clientId, sourceAdId: id, answers: {}, score: "A", status: "booked", followUps: 0, createdAt: new Date().toISOString() });
      await ctx.db.insert("recruitApplicants", { name: "Tester", phone: "test-x", clientId, sourceAdId: id, answers: {}, score: "A", status: "booked", followUps: 0, createdAt: new Date().toISOString(), test: true });
    });
    const input = (await t.query(internal.recruiting.ads.inputs, { clientId }))!;
    expect(input.performance.find((r) => r.sourceAdId === id)).toMatchObject({ applicants: 2, A: 2, spendCents: 25_000, aPer100: 0.8 });
    expect(input.angles[0]).toMatchObject({ angle: "rep story", A: 2, aPer100: 0.8 });
    expect((await staff.query(api.recruiting.ops.byAd, {})).find((r) => r.sourceAdId === id)).toMatchObject({ applicants: 2, A: 2 });

    await staff.mutation(api.recruiting.ops.retireAd, { sourceAdId: "acme-m2" });
    expect((await t.run(async (ctx) => ctx.db.query("recruitAds").withIndex("by_source_ad", (q) => q.eq("sourceAdId", "acme-m2")).first()))!.status).toBe("retired");
    expect((await staff.query(api.recruiting.ops.ads, {})).clients[0].retire).toEqual([]);
  });
});
