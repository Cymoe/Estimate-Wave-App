import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  AD_TRADES,
  IDEA_MARK,
  IDEAS_SHOWN,
  PICK_MARK,
  PLAYBOOK_MARK,
  TAG_MARK,
  TASTE_MARK,
  dropNearCopies,
  ideaOverlap,
  ideasFrom,
  pickIdeas,
  apifyInput,
  composeMotion,
  creativeName,
  familyOfAngle,
  fromApifyItem,
  hookFromSwipe,
  isFatigued,
  isLocal,
  mergeSwipeCsvs,
  PREP_ANGLE,
  motionPlanProblems,
  echoes,
  withoutEchoes,
  motionPrompt,
  scriptLength,
  parseCsv,
  parseJson,
  pickAssets,
  assetTagsOf,
  withWorkScopes,
  worksIn,
  pickJob,
  jobInOrder,
  pickExamples,
  pickHooks,
  qualifies,
  readPlaybook,
  readSwipeTags,
  stillPairOf,
  tagSwipePrompt,
  renderProps,
  swipeScore,
  shotTimings,
  weekOf,
  wordTimings,
  type Script,
  angleOf,
  designLabel,
  pickOfferPhotos,
  readRequestReply,
  pickRequestSwipes,
  requestStage,
  requestPrompt,
} from "./lib/ads";
import { setup, signUp } from "./test.setup";
import { AD_TRADES, cleanItems, describePrompt, itemsIn, oneStage, pairingPrompt, readPairing, withoutJobNames } from "./lib/ads";
import { SWIPE_SEEDS } from "./catalog/swipes";

type T = ReturnType<typeof setup>;
const store = (t: T, type = "image/jpeg", body = "bytes") => t.run((ctx) => ctx.storage.store(new Blob([body], { type })));

const GOOD: Script = {
  voice:
    "Paint them, don't replace them. Professionally painted cabinets change the whole kitchen without a full remodel. Midland painters prep every door, spray a smooth finish and put the hardware back. Tell us about your kitchen and one local painter calls you with a free quote. Get a quote today.",
  onScreen: ["Paint, don't replace", "Local Midland painters", "Get a quote"],
  headline: "Cabinets painted, kitchen transformed",
  primaryText: "A fresh finish on the cabinets you have. One free quote, no pressure.",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("the pure parts", () => {
  test("hooks: active, families with nothing live first, then least used; with every family live it still drafts", () => {
    const hooks = [
      { _id: "a", family: "before_after" as const, scope: "cabinets", active: true, uses: 2 },
      { _id: "b", family: "education" as const, scope: "interior", active: true, uses: 0, lastUsedAt: "2026-10-01" },
      { _id: "c", family: "seasonal" as const, scope: "exterior", active: true, uses: 0 },
      { _id: "d", family: "objection" as const, scope: "interior", active: false, uses: 0 },
    ];
    expect(pickHooks(hooks, new Set(["seasonal"]), 2).map((h) => h._id)).toEqual(["b", "a"]);
    expect(pickHooks(hooks, new Set(), 2).map((h) => h._id)).toEqual(["c", "b"]);
    expect(pickHooks(hooks, new Set(["before_after", "education", "seasonal"]), 2).map((h) => h._id)).toEqual(["c", "b"]);
  });

  test("ideas built on a competitor's ad go before the hand-written ones: least used first, then the longest-running", () => {
    const hooks = [
      { _id: "hand", family: "seasonal" as const, scope: "exterior", active: true, uses: 0 },
      { _id: "short", family: "proof" as const, scope: "general", active: true, uses: 0, daysRunning: 101 },
      { _id: "long", family: "education" as const, scope: "interior", active: true, uses: 0, daysRunning: 745 },
      { _id: "longest-used", family: "objection" as const, scope: "cabinets", active: true, uses: 1, daysRunning: 3111 },
    ];
    expect(pickHooks(hooks, new Set(), 4).map((h) => h._id)).toEqual(["long", "short", "longest-used", "hand"]);
    // A kind of angle already live still goes last.
    expect(pickHooks(hooks, new Set(["education"]), 4).map((h) => h._id)).toEqual(["short", "longest-used", "hand", "long"]);
    // A competitor ad as an idea: its angle, in its own category; one about painting in general can use any photo.
    expect(hookFromSwipe({ hook: " Paint instead of replace ", scope: "cabinets" })).toEqual({
      family: "before_after",
      scope: "cabinets",
      trade: "painting",
      textEn: "Paint instead of replace",
    });
    expect(hookFromSwipe({ hook: "Reputation + finished home", family: "proof" })).toMatchObject({ family: "proof", scope: "general" });
    expect(hookFromSwipe({ hook: "Owner story", family: "nonsense" })).toMatchObject({ family: "owner_story" });
    expect(hookFromSwipe({ hook: "  " })).toBeNull();
    const photos = [
      { _id: "a", kind: "photo" as const, tags: ["exterior"], createdAt: "2026-10-02" },
      { _id: "b", kind: "photo" as const, tags: ["cabinets"], createdAt: "2026-10-01" },
    ];
    expect(pickAssets(photos, "general", new Set())).toEqual({ assets: photos, inScope: true });
  });

  test("footage: pairs first, then least used and newest; never reused in a week; a fallback is flagged", () => {
    const assets = [
      { _id: "p1", kind: "photo" as const, tags: ["cabinets", "before"], pairKey: "k", createdAt: "2026-10-01", uses: 0 },
      { _id: "p2", kind: "photo" as const, tags: ["cabinets", "after"], pairKey: "k", createdAt: "2026-10-02", uses: 0 },
      { _id: "v1", kind: "video" as const, tags: ["cabinets"], createdAt: "2026-10-05", uses: 3 },
      { _id: "v3", kind: "video" as const, tags: ["cabinets"], createdAt: "2026-10-04", uses: 0 },
      { _id: "v2", kind: "video" as const, tags: ["process"], createdAt: "2026-10-06", uses: 0 },
    ];
    // The pair, then the unused cabinets clip ahead of the newer but used one.
    expect(pickAssets(assets, "cabinets", new Set())).toEqual({ assets: [assets[0], assets[1], assets[3], assets[2]], inScope: true });
    expect(pickAssets(assets, "cabinets", new Set(["v1"])).assets.map((a) => a._id)).toEqual(["p1", "p2", "v3"]);
    expect(pickAssets(assets, "exterior", new Set())).toEqual({ assets: [assets[4]], inScope: false });
    // Two pairs: the less used pair goes first.
    const two = [
      ...assets.slice(0, 2).map((a) => ({ ...a, uses: 2 })),
      { _id: "q1", kind: "photo" as const, tags: ["cabinets", "before"], pairKey: "m", createdAt: "2026-09-01", uses: 0 },
      { _id: "q2", kind: "photo" as const, tags: ["cabinets", "after"], pairKey: "m", createdAt: "2026-09-01", uses: 0 },
    ];
    expect(pickAssets(two, "cabinets", new Set()).assets.map((a) => a._id)).toEqual(["q1", "q2", "p1", "p2"]);
    // One image that holds a before and its after: two of those go ahead of the rest, however old; the others only fill what is left.
    const yard = (id: string, day: string, extra: string[] = []) => ({ _id: id, kind: "photo" as const, tags: ["patio", "after", ...extra], createdAt: `2026-10-${day}`, uses: 0 });
    const yards = [yard("j1", "01", ["before"]), yard("j2", "02", ["before"]), yard("j3", "03", ["before"]), yard("f1", "10"), yard("f2", "11"), yard("f3", "12")];
    expect(pickAssets(yards, "patio", new Set(), 4).assets.map((a) => a._id)).toEqual(["j3", "j2", "f3", "f2"]);
    expect(pickAssets(yards, "patio", new Set(), 6).assets.map((a) => a._id)).toEqual(["j3", "j2", "f3", "f2", "f1", "j1"]);
    // A before is only offered beside its own after: a lone one, or one whose after is used, never is.
    const raw = { _id: "r1", kind: "photo" as const, tags: ["cabinets", "before"], createdAt: "2026-10-09", uses: 0 };
    expect(pickAssets([...assets, raw], "cabinets", new Set()).assets.map((a) => a._id)).toEqual(["p1", "p2", "v3", "v1"]);
    expect(pickAssets([...assets, raw], "cabinets", new Set(["p2"])).assets.map((a) => a._id)).toEqual(["v3", "v1"]);
    expect(pickAssets([raw, raw, raw].map((r, i) => ({ ...r, _id: `r${i}`, tags: ["cabinets-painted", "interior", "before"] })), "interior", new Set(), 8, [], [], ["cabinets-painted"]).assets).toEqual([]);
  });

  test("a photo has one stage, the furthest along; only a side-by-side is a before and an after at once", () => {
    expect(oneStage(["doors", "before", "process"])).toEqual(["doors", "process"]);
    expect(oneStage(["doors", "process", "after"])).toEqual(["doors", "after"]);
    expect(oneStage(["doors", "before", "after"])).toEqual(["doors", "before", "after"]);
    expect(oneStage(["doors", "before", "process", "after"])).toEqual(["doors", "before", "after"]);
    expect(oneStage(["doors", "crew"])).toEqual(["doors", "crew"]);
    expect(describePrompt(AD_TRADES.painting)).toContain("at most one stage");
  });

  test("shot timings come from ElevenLabs' character times, or an even estimate without them", () => {
    const lines = ["Paint them.", "Not replace."];
    const text = lines.join(" ");
    const alignment = {
      characters: [...text],
      character_start_times_seconds: [...text].map((_, i) => i * 0.1),
      character_end_times_seconds: [...text].map((_, i) => i * 0.1 + 0.1),
    };
    // "Paint them." is characters 0–10; "Not replace." starts at 12.
    expect(shotTimings(lines, alignment, 99)).toEqual({
      shots: [
        { start: 0, end: 1.1 },
        { start: 1.2, end: 2.4 },
      ],
      durationSec: 2.4,
    });
    const est = shotTimings(lines, null, 10);
    expect(est.durationSec).toBe(10);
    expect(est.shots[0].start).toBe(0);
    expect(est.shots[1].start).toBeCloseTo(est.shots[0].end, 2);
  });

  test("names, weeks and fatigue", () => {
    expect(creativeName("k57abcdefgh;adHooks", "9x16", new Date("2026-11-03T12:00:00Z"))).toMatch(/^WL_[a-z0-9]{6}_916_20261103$/);
    expect(creativeName("k57abcdefgh;adHooks", "4x5", new Date("2026-11-03T12:00:00Z"))).toBe(
      creativeName("k57abcdefgh;adHooks", "4x5", new Date("2026-11-03T20:00:00Z")),
    );
    expect(weekOf(new Date("2026-11-05T03:00:00Z"))).toBe("2026-11-02");
    expect(weekOf(new Date("2026-11-02T00:00:00Z"))).toBe("2026-11-02");
    expect(isFatigued({ frequency: 2.6, ctr: 0.7, baselineCtr: 1.0 })).toBe(true);
    expect(isFatigued({ frequency: 2.6, ctr: 0.9, baselineCtr: 1.0 })).toBe(false);
    expect(isFatigued({ frequency: 1.2, ctr: 0.5, baselineCtr: 1.0 })).toBe(false);
    expect(isFatigued({ frequency: 3, ctr: 0.1, baselineCtr: null })).toBe(false);
  });

  test("JSON comes out of a fence, out of the words around it, and not out of a reply that was cut off", () => {
    expect(parseJson('Here you go:\n```json\n{"fits":false,"reason":"x"}\n```')).toEqual({ fits: false, reason: "x" });
    expect(parseJson("no json here")).toBeNull();
    // Braces in the words around it, or inside its own strings, don't hide the object.
    expect(parseJson('I used {these} shots.\n{"fits":true,"shots":[{"footage":1}]}\nNote: see {above}.')).toEqual({ fits: true, shots: [{ footage: 1 }] });
    expect(parseJson('Sure. {"fits":false,"reason":"a } in the reason"} and then {not json')).toEqual({ fits: false, reason: "a } in the reason" });
    // Cut off before it closed: nothing to read.
    expect(parseJson('{"fits":true,"shots":[{"footage":1,"voice":"These cab')).toBeNull();
  });

});

/** A valid animated ad over the photos offered: four lines, about fifty words, the last one asking. */
function motionPlanFor(photoCount: number, over: Record<string, unknown> = {}) {
  const second = Math.min(2, photoCount);
  return {
    fits: true,
    style: "lightUp",
    title: "Paint them, don't replace",
    lines: [
      { photo: 1, voice: "Thinking about new cabinets? You might not need them at all this year." },
      { photo: 1, voice: "A fresh finish can change the whole kitchen without tearing anything out.", label: "No tear-out" },
      { photo: second, voice: "Every door and frame is cleaned, sanded and primed before the colour goes on.", label: "Prepped first" },
      { photo: second, voice: "Permian Home Quotes matches you with one local painter. Get a quote today." },
    ],
    headline: GOOD.headline,
    primaryText: GOOD.primaryText,
    ...over,
  };
}

/** A plan stretched or cut to about `words` words of voice, as a writer following a script of that length would write it. */
function toLength<P extends { lines: Array<Record<string, unknown>> }>(plan: P, words: number): P {
  const has = plan.lines.map((l) => String(l.voice ?? "")).join(" ").split(/\s+/).filter(Boolean).length;
  if (has >= words * 0.85 && has <= words * 1.1) return plan;
  const lines = [...plan.lines];
  // Enough lines that none runs long: the line before the ask is repeated, photo and all.
  while (lines.length < Math.ceil(words / 20)) lines.splice(lines.length - 1, 0, { ...lines[lines.length - 2] });
  const filler = "we sand and prime every door before the finish goes on".split(" ");
  const each = Math.max(1, Math.floor((words - 4) / (lines.length - 1)));
  const voice = (n: number) => Array.from({ length: n }, (_, i) => filler[i % filler.length]).join(" ") + ".";
  return { ...plan, lines: lines.map((l, i) => ({ ...l, voice: i === lines.length - 1 ? "Get a quote today." : voice(each) })) };
}

/** A quick offer as the writer would answer: a local hook, the one thing done, the ask, on one job's photos. */
function quickPlanFor(photoCount: number, town = "Midland") {
  const after = Math.min(2, photoCount);
  return {
    fits: true,
    style: "reel",
    title: "Cabinets, finished",
    lines: [
      { photo: 1, voice: `${town} homeowners, look at this.`, x: 50, y: 50, ...(photoCount > 1 ? { before: true } : {}) },
      { photo: after, voice: "Every door came off and every frame was masked.", label: "Doors off, frames masked", x: 40, y: 50 },
      { photo: after, voice: "Get a free quote from GoodFit Pros.", label: "One free quote" },
    ],
    headline: GOOD.headline,
    primaryText: GOOD.primaryText,
  };
}

describe("what a photo shows (labels)", () => {
  const painting = AD_TRADES.painting;
  test("Claude is asked for the trade's labels, and only those are kept, in the list's order", () => {
    expect(describePrompt(painting)).toContain("front door, garage door");
    expect(describePrompt(painting)).toContain('"items":["..."]');
    expect(cleanItems(["Doors", "trim", "unicorn", "doors", 5], painting)).toEqual(["trim", "doors"]);
    expect(cleanItems(undefined, painting)).toEqual([]);
  });
  test("an idea's words name labels: the longest first, plurals either way", () => {
    expect(itemsIn("Front door painting in Odessa", painting)).toEqual(["front door"]);
    expect(itemsIn("We paint interior doors and trim", painting)).toEqual(expect.arrayContaining(["doors", "trim"]));
    expect(itemsIn("Fence staining that lasts", painting)).toEqual(["fence"]);
    expect(itemsIn("Paint them, don't replace", painting)).toEqual([]);
  });
  test("photos showing what the idea names are offered first", () => {
    const p = (id: string, items: string[]) => ({ _id: id, kind: "photo" as const, tags: ["exterior"], items, createdAt: "2026-11-01" });
    const lib = [p("wall", ["siding"]), p("door", ["front door"]), p("fence", ["fence"])];
    expect(pickAssets(lib, "exterior", new Set(), 6, [], ["front door"]).assets[0]._id).toBe("door");
    expect(pickAssets(lib, "exterior", new Set(), 6, [], []).assets.map((a) => a._id)).toEqual(["wall", "door", "fence"]);
  });
});

describe("one job's photos", () => {
  test("Claude's answer on which before and after show the same spot is read safely: each photo once, nothing out of range", () => {
    expect(pairingPrompt(2, 3)).toContain("The first 2 are befores, the next 3 are afters");
    expect(readPairing('{"pairs":[{"before":1,"after":2},{"before":1,"after":3},{"before":2,"after":2},{"before":2,"after":9},{"before":2,"after":1}]}', 2, 3)).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(readPairing('{"pairs":[]}', 1, 1)).toEqual([]);
    expect(readPairing("no idea", 1, 1)).toBeNull();
  });

  const p = (id: string, tags: string[], jobId?: string, day = 1, uses = 0) => ({ _id: id, kind: "photo" as const, tags, jobId, uses, createdAt: `2026-11-${String(day).padStart(2, "0")}` });
  test("a story picks a job with enough photos of its kind, one with a before and an after first, then the least used; never one used this week", () => {
    const lib = [
      p("a1", ["cabinets", "after"], "A", 1), p("a2", ["cabinets"], "A", 2), p("a3", ["cabinets"], "A", 3),
      p("b1", ["cabinets", "before"], "B", 4, 3), p("b2", ["process"], "B", 5, 3), p("b3", ["cabinets", "after"], "B", 6, 3),
      p("c1", ["cabinets", "before"], "C", 7), p("c2", ["cabinets", "after"], "C", 8),
      p("x", ["cabinets", "before"]),
    ];
    expect(pickJob(lib, "cabinets", new Set())).toEqual({ jobId: "B", assets: [lib[3], lib[4], lib[5]] });
    expect(pickJob(lib, "cabinets", new Set(["b2"]))!.jobId).toBe("A");
    expect(pickJob(lib, "exterior", new Set())).toBeNull();
    expect(pickJob(lib, "general", new Set(["b2", "a1"]))).toBeNull();
  });
  test("its photos go before, work, finish; with too many, two befores and three finishes stay and the work fills the rest", () => {
    const job = [p("f1", ["after"], "J", 9), p("w1", [], "J", 2), p("b1", ["before"], "J", 3), p("both", ["before", "after"], "J", 1), p("b0", ["before"], "J", 1)];
    expect(jobInOrder(job).map((x) => x._id)).toEqual(["b0", "b1", "w1", "both", "f1"]);
    const big = [
      ...[1, 2, 3].map((d) => p(`b${d}`, ["before"], "J", d)),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => p(`w${d}`, [], "J", d)),
      ...[14, 15, 16, 17].map((d) => p(`f${d}`, ["after"], "J", d)),
    ];
    const out = jobInOrder(big, 12).map((x) => x._id);
    expect(out).toHaveLength(12);
    expect(out.slice(0, 2)).toEqual(["b1", "b2"]);
    expect(out.slice(-3)).toEqual(["f14", "f15", "f16"]);
    expect(out.slice(2, -3).every((id) => id.startsWith("w"))).toBe(true);
  });
});

describe("make an ad for…, the pure parts", () => {
  const trades = Object.values(AD_TRADES);
  test("the line is read into a trade we do, one of its kinds of job (or none), a town and the idea", () => {
    expect(requestPrompt("cabinets in Odessa", "GoodFit Pros", ["Midland", "Odessa"], trades)).toContain("serving Midland, Odessa, Texas");
    expect(readRequestReply('Sure: {"trade":"painting","scope":"cabinets","town":" Odessa ","idea":"Paint the cabinets, keep the kitchen"}', trades)).toEqual({
      trade: "painting",
      scope: "cabinets",
      town: "Odessa",
      idea: "Paint the cabinets, keep the kitchen",
    });
    // A kind of job from another trade is no kind of job here.
    expect(readRequestReply('{"trade":"painting","scope":"patio","town":null,"idea":"Painting"}', trades)).toEqual({ trade: "painting", scope: "general", idea: "Painting" });
    expect(readRequestReply('{"trade":null}', trades)).toBeNull();
    expect(readRequestReply('{"trade":"roofing","idea":"Roofs"}', trades)).toBeNull();
    expect(readRequestReply('{"trade":"painting","idea":""}', trades)).toBeNull();
  });

  test("the owner's job names never stay in the idea: the phrase is cut, or the idea is dropped when it can't be", () => {
    const names = ["Green Kitchen", "Smith kitchen on Elm"];
    expect(requestPrompt("an ad from the Green Kitchen", "GoodFit Pros", [], trades, names)).toContain("never put one in the idea");
    expect(withoutJobNames("We repaint kitchen cabinets for Midland homeowners, as we did in the Green Kitchen job.", names)).toBe("We repaint kitchen cabinets for Midland homeowners.");
    expect(withoutJobNames("We repaint cabinets, like our green kitchen job.", names)).toBe("We repaint cabinets.");
    expect(withoutJobNames("The Smith kitchen on Elm, painted.", names)).toBeNull();
    expect(withoutJobNames("We paint homes inside and out.", names)).toBe("We paint homes inside and out.");
  });

  const swipe = (company: string, more: Record<string, unknown> = {}) => ({ company, importedAt: "2026-11-01", starred: false, quality: 30, ...more });
  const script = "We take every door off and spray it in our shop so the finish comes out smooth and even.";
  test("the story is built on the best ad with a script for that kind of job, the lesson on another, a teaching one first", () => {
    const picked = pickRequestSwipes(
      [
        swipe("Thin Ads", { scope: "cabinets", adCopy: "Call now" }),
        swipe("Rodgers", { scope: "cabinets", transcript: script }),
        swipe("Teacher", { scope: "cabinets", transcript: script, family: "education" }),
        swipe("Outside", { scope: "exterior", transcript: script }),
      ],
      "cabinets",
    );
    expect([picked.story?.company, picked.lesson?.company]).toEqual(["Rodgers", "Teacher"]);
    // With one ad on file there is no lesson; with none, nothing.
    expect(pickRequestSwipes([swipe("Rodgers", { scope: "cabinets", transcript: script })], "cabinets").lesson).toBeUndefined();
    expect(pickRequestSwipes([swipe("Outside", { scope: "exterior", transcript: script })], "cabinets").story).toBeUndefined();
  });

  test("the best three ads with a script take turns: each request is built on the one used longest ago", () => {
    const ads = [
      swipe("First", { scope: "cabinets", transcript: script, quality: 40 }),
      swipe("Second", { scope: "cabinets", transcript: script, quality: 35 }),
      swipe("Third", { scope: "cabinets", transcript: script, quality: 30 }),
      swipe("Fourth", { scope: "cabinets", transcript: script, quality: 25 }),
    ] as Array<ReturnType<typeof swipe> & { lastUsedAt?: string }>;
    const order: string[] = [];
    for (let day = 1; day <= 5; day++) {
      const { story } = pickRequestSwipes(ads, "cabinets");
      order.push(story!.company);
      story!.lastUsedAt = `2026-11-0${day}`;
    }
    expect(order).toEqual(["First", "Second", "Third", "First", "Second"]);
  });

  test("the page's stage follows the request, its batch and its ads", () => {
    const made = { status: "made" as const };
    expect(requestStage({ status: "reading" }, null, [])).toBe("reading");
    expect(requestStage(made, null, [])).toBe("writing");
    expect(requestStage(made, { status: "drafting" }, [{ status: "draft" }])).toBe("writing");
    expect(requestStage(made, { status: "drafting", skipped: [] }, [{ status: "draft" }, { status: "voiced" }])).toBe("voicing");
    expect(requestStage(made, { status: "drafting", skipped: [] }, [{ status: "rendering" }, { status: "rendered" }])).toBe("drawing");
    expect(requestStage(made, { status: "ready", skipped: [] }, [{ status: "rendered" }, { status: "failed" }])).toBe("ready");
    expect(requestStage(made, { status: "failed" }, [])).toBe("failed");
    expect(requestStage({ status: "failed" }, null, [])).toBe("failed");
  });
});

describe("a quick offer", () => {
  const pair = [{ tags: ["cabinets", "before"], pairKey: "k1" }, { tags: ["cabinets", "after"], pairKey: "k1" }];
  test("the prompt asks for three lines, a hook that speaks to the town but never places the job, and one job only", () => {
    const ask = motionPrompt({ textEn: "One local painter, one free quote", family: "proof", scope: "cabinets", style: "reel", quick: true }, "GoodFit Pros", [], true, [], "Midland");
    expect(ask).toContain("about 9 seconds");
    expect(ask).toContain("exactly 3 spoken lines");
    expect(ask).toContain("One job only");
    expect(ask).toContain("may name Midland to speak to the viewer, never about the job");
    // A story reel keeps its own shape.
    const story = motionPrompt({ textEn: "Paint them, don't replace them", family: "before_after", scope: "cabinets", style: "reel" }, "GoodFit Pros", [], true, [], "Midland");
    expect(story).not.toContain("quick offer");
    expect(story).toContain("Tell it as one small story");
  });
  test("the checks: three lines, short, a hook naming the town, one job's photos", () => {
    const good = quickPlanFor(2);
    expect(motionPlanProblems(good, pair, { town: "Midland" })).toEqual([]);
    expect(motionPlanProblems({ ...good, lines: [{ ...good.lines[0], voice: "Look at these cabinets right here." }, ...good.lines.slice(1)] }, pair, { town: "Midland" })).toContain("the first line doesn't speak to Midland");
    expect(motionPlanProblems({ ...good, lines: good.lines.slice(0, 2) }, pair, { town: "Midland" }).join()).toContain("2 lines (a quick offer has 3)");
    const twoJobs = [{ tags: ["cabinets", "after"], pairKey: "a" }, { tags: ["cabinets", "after"], pairKey: "b" }];
    expect(motionPlanProblems(good, twoJobs, { town: "Midland" })).toContain("a quick offer shows one job: one photo, or a before and its after");
    // Its 27 words are too few for a story reel.
    expect(motionPlanProblems(good, pair).join()).toContain("words of voice (write 45 to 55)");
  });
  test("with steps on, the title and headlines may not just repeat the words said under them; a checklist's points may", () => {
    expect(echoes("Doors and drawers go to our shop", "First, we take your doors and drawers back to our shop.")).toBe(true);
    expect(echoes("A fresh new look for cabinets", "Give your kitchen a fresh new look with cabinet painting.")).toBe(true);
    expect(echoes("Step 1: Off to our shop", "First, we take your doors and drawers back to our shop.")).toBe(false);
    expect(echoes("Not sure how it works?", "But you're unsure of the process.")).toBe(false);
    const good = quickPlanFor(2);
    const echo = { ...good, lines: good.lines.map((l, i) => (i === 1 ? { ...l, label: "Every cabinet door painted", voice: "We painted every cabinet door in this kitchen." } : l)) };
    expect(motionPlanProblems(echo, pair, { town: "Midland" }).join()).not.toContain("repeats");
    // A headline that echoes is taken off (its moment shows the captions alone); the ad isn't sent back for it.
    expect(motionPlanProblems(echo, pair, { town: "Midland" }, undefined, { noEcho: true }).join()).not.toContain("repeats");
    const kept = { ...echo, lines: echo.lines.map((l, i) => (i === 2 ? { ...l, label: "The hardware upgrade", voice: "Get a free quote from GoodFit Pros." } : l)) };
    expect(withoutEchoes(kept).lines.map((l) => l.label)).toEqual([kept.lines[0].label, undefined, "The hardware upgrade"]);
    // A step taken off: the ones left are numbered again.
    const steps = { ...good, lines: [
      { ...good.lines[0], label: "Step 1: Off to the shop", voice: "First we take your doors and drawers away." },
      { ...good.lines[1], label: "Step 2: Sprayed in our shop", voice: "We spray them smooth in our shop." },
      { ...good.lines[2], label: "Step 3: Boxes done in place", voice: "Your cabinet frames get painted at home." },
    ] };
    expect(withoutEchoes(steps).lines.map((l) => l.label)).toEqual(["Step 1: Off to the shop", undefined, "Step 2: Boxes done in place"]);
    const echoTitle = { ...good, title: "Paint every cabinet door", lines: [{ ...good.lines[0], voice: "Midland, we paint every cabinet door." }, ...good.lines.slice(1)] };
    expect(motionPlanProblems(echoTitle, pair, { town: "Midland" }, undefined, { noEcho: true }).join()).toContain("the title repeats the first line's words");
    const ask = motionPrompt({ textEn: "Paint them", family: "before_after", scope: "cabinets", style: "reel", steps: true }, "GoodFit Pros", [], true, [], "Midland");
    expect(ask).toContain("a label never repeats the line's words");
  });
  test("its photos: a tagged pair first, then one image holding both, else one finished photo; never a lone before or an untagged photo", () => {
    const other = { tags: ["cabinets", "after"] };
    expect(pickOfferPhotos([other, ...pair])).toEqual(pair);
    expect(pickOfferPhotos([{ tags: ["cabinets", "before"] }, other])).toEqual([other]);
    expect(pickOfferPhotos([{ tags: ["cabinets", "before"] }])).toEqual([]);
    // One image holding a before and its after counts as the job; an untagged photo never does, as it may be the before.
    const both = { tags: ["cabinets", "before", "after"] };
    expect(pickOfferPhotos([{ tags: ["cabinets"] }, both, other])).toEqual([both]);
    expect(pickOfferPhotos([{ tags: ["cabinets"] }])).toEqual([]);
  });
  test("each ad's angle and label: a story, a lesson in its look, or a quick offer", () => {
    expect(angleOf({ style: "reel" })).toBe("story");
    expect(angleOf({ style: "explainer" })).toBe("lesson");
    expect(angleOf({ style: "reel", quick: true })).toBe("offer");
    expect(designLabel({ style: "reel", quick: true })).toBe("Quick offer");
    expect(designLabel({ style: "explainer", look: "markup" })).toBe("Lesson, marked-up");
    expect(designLabel({ style: "explainer" })).toBe("Lesson, checklist");
    expect(designLabel({ style: "reel" })).toBe("Story");
  });
});

describe("a checklist ad (explainer)", () => {
  const brand = { name: "GoodFit Pros", primaryColor: "#336699", accentColor: "#8fb6e0", markets: ["Midland", "Odessa"] };
  const offered = [{ tags: ["interior"] }, { tags: ["interior", "process"] }, { tags: ["interior", "process"] }, { tags: ["interior", "before"] }];
  const plan = {
    fits: true,
    style: "explainer",
    tag: "Painting quotes",
    title: "2 things to check in a painting quote",
    lines: [
      { photo: 1, voice: "Two painting quotes for the same room can look nothing alike.", x: 50, y: 45 },
      { photo: 2, voice: "First, does it say how many coats, and which paint?", label: "Coats and paint named", mark: "check", x: 40, y: 60 },
      { photo: 3, voice: "Second, is the prep written down: patching, sanding, caulk?", label: "Prep written down", mark: "check" },
      { photo: 1, voice: "Get a free quote from GoodFit Pros today." },
    ],
    headline: GOOD.headline,
    primaryText: GOOD.primaryText,
  };

  test("a cost-education idea is asked for as a checklist over the job's photos; other ideas stay reels", () => {
    const ask = motionPrompt({ textEn: "What to check in a quote", family: "education", scope: "interior" }, "GoodFit Pros", [], true);
    expect(ask).toContain("a short checklist over the job's own photos");
    expect(ask).toContain('"style":"explainer"');
    expect(ask).toContain("Each point's photo must show what the point is about");
    expect(ask).toContain("No prices, ranges or dollar amounts");
    const reel = motionPrompt({ textEn: "Same house, new look", family: "before_after", scope: "exterior" }, "GoodFit Pros", [], true);
    expect(reel).not.toContain("checklist");
    expect(reel).toContain('"style":"reel"');
  });

  test("the checks: points with labels and marks, no befores, one photo a line, a number in the title that matches", () => {
    expect(motionPlanProblems(plan, offered)).toEqual([]);
    const lines = plan.lines;
    expect(motionPlanProblems({ ...plan, lines: [lines[0], { ...lines[1], mark: "maybe" }, lines[2], lines[3]] }, offered)).toEqual(['line 2\'s mark is "maybe" (write check or cross)']);
    expect(motionPlanProblems({ ...plan, lines: [lines[0], { ...lines[1], label: "" }, lines[2], lines[3]] }, offered)).toEqual(["line 2 is a point with no label"]);
    expect(motionPlanProblems({ ...plan, lines: [lines[0], lines[1], { ...lines[2], photo: 4 }, lines[3]] }, offered)).toEqual([
      "line 3's photo is a before (a checklist shows finished work and work under way)",
    ]);
    expect(motionPlanProblems({ ...plan, title: "3 things to check in a painting quote" }, offered)).toEqual(["the title says 3 but there are 2 points"]);
    expect(motionPlanProblems({ ...plan, lines: [{ ...lines[0], mark: "check" }, lines[1], lines[2], lines[3]] }, offered)).toEqual([
      "the first line has a label or mark (only points have them)",
    ]);
    expect(motionPlanProblems({ ...plan, tag: "Lowest price painters" }, offered).some((p) => p.startsWith("mentions"))).toBe(false);
  });

  test("prep against no prep: a prep idea drawn as a checklist asks for each point's skipped corner, in words only", () => {
    const ask = motionPrompt({ textEn: "Process + minimal disruption", family: "objection", scope: "cabinets", style: "explainer", versus: true }, "GoodFit Pros", [], true);
    expect(ask).toContain("a short checklist over the job's own photos");
    expect(ask).toContain("This one sets prep against no prep. Give every point a skip");
    expect(ask).toContain("never blame damage or a bad result on skipped prep");
    expect(ask).toContain('"skip":"the corner a no-prep quote cuts"');
    // The same idea without the ask stays a reel, and a plain checklist asks for no skips.
    expect(motionPrompt({ textEn: "Process + minimal disruption", family: "objection", scope: "cabinets" }, "GoodFit Pros", [], true)).not.toContain("checklist");
    expect(motionPrompt({ textEn: "What to check", family: "education", scope: "interior" }, "GoodFit Pros", [], true)).not.toContain("skip");
    expect(PREP_ANGLE.test("Process + minimal disruption")).toBe(true);
    expect(PREP_ANGLE.test("Curb appeal")).toBe(false);
  });

  test("skips: every point has one or none, short, and never on the opening or the ask; they reach the renderer", () => {
    const lines = plan.lines;
    const versus = { ...plan, title: "Prep vs no prep", lines: [lines[0], { ...lines[1], skip: "Paint goes on as is" }, { ...lines[2], skip: "Paint over the trim" }, lines[3]] };
    expect(motionPlanProblems(versus, offered)).toEqual([]);
    expect(motionPlanProblems({ ...versus, lines: [lines[0], versus.lines[1], lines[2], lines[3]] }, offered)).toEqual([
      "some points have a skip and some don't (give every point one, or none)",
    ]);
    expect(motionPlanProblems({ ...versus, lines: [lines[0], versus.lines[1], { ...versus.lines[2], skip: "x".repeat(41) }, lines[3]] }, offered)).toEqual([
      "line 3's skip is over 40 characters",
    ]);
    expect(motionPlanProblems({ ...versus, lines: [{ ...lines[0], skip: "Nothing" }, versus.lines[1], versus.lines[2], lines[3]] }, offered)).toEqual([
      "the first line has a label or mark (only points have them)",
    ]);
    const { script, design } = composeMotion(versus, ["a", "b", "c", "d"], offered);
    expect(design.frames?.map((f) => f.skip)).toEqual([undefined, "Paint goes on as is", "Paint over the trim", undefined]);
    const photos = new Map([
      ["a", { url: "https://files.example/a.jpg", tags: ["interior"] }],
      ["b", { url: "https://files.example/b.jpg", tags: ["interior", "process"] }],
      ["c", { url: "https://files.example/c.jpg", tags: ["interior", "process"] }],
    ]);
    const timed = { ...script, shots: script.shots!.map((x, i) => ({ ...x, start: i * 4, end: i * 4 + 3 })) };
    const props = renderProps({ ratio: "4x5", design, script: timed, photos, audioUrl: "https://files.example/v.mp3", audioSec: 16, brand });
    expect(props.lines.map((l) => (l as { skip?: string }).skip)).toEqual([undefined, "Paint goes on as is", "Paint over the trim", undefined]);
  });

  test("what the renderer is given: each line's whole photo, where to move in, the points' labels and marks, and the tag", () => {
    const { script, design } = composeMotion(plan, ["a", "b", "c", "d"], offered);
    expect(design).toMatchObject({ style: "explainer", tag: "Painting quotes", title: "2 things to check in a painting quote" });
    expect(design.frames?.map((f) => f.mark)).toEqual([undefined, "check", "check", undefined]);
    const photos = new Map([
      ["a", { url: "https://files.example/a.jpg", tags: ["interior"] }],
      ["b", { url: "https://files.example/b.jpg", tags: ["interior", "process"] }],
      ["c", { url: "https://files.example/c.jpg", tags: ["interior", "process"] }],
    ]);
    const timed = { ...script, shots: script.shots!.map((x, i) => ({ ...x, start: i * 4, end: i * 4 + 3 })) };
    const props = renderProps({ ratio: "9x16", design, script: timed, photos, audioUrl: "https://files.example/v.mp3", audioSec: 16, brand, music: { url: "https://files.example/m.mp3" } });
    expect(props.style).toEqual({ kind: "explainer", tag: "Painting quotes" });
    expect(props.photos).toEqual([
      { src: "https://files.example/a.jpg", focus: [{ x: 50, y: 45 }] },
      { src: "https://files.example/b.jpg", focus: [{ x: 40, y: 60 }] },
      { src: "https://files.example/c.jpg" },
      { src: "https://files.example/a.jpg" },
    ]);
    expect(props.lines.map((l) => [(l as { label?: string }).label, (l as { mark?: string }).mark])).toEqual([
      [undefined, undefined],
      ["Coats and paint named", "check"],
      ["Prep written down", "check"],
      [undefined, undefined],
    ]);
    // A soft knock as each point is ticked and the ask; no whoosh on every cut.
    expect(props.sound).toEqual({ music: "https://files.example/m.mp3", land: "sound/switch.wav", ask: "sound/whoosh.wav" });
  });
});

describe("a still's pair", () => {
  test("a before and its after from one job only: the same photo cut in two, or one tagged pair; never two jobs", () => {
    const assets = new Map<string, { tags: string[]; pairKey?: string }>([
      ["two", { tags: ["exterior", "before", "after"] }],
      ["b", { tags: ["cabinets", "before"], pairKey: "k" }],
      ["a", { tags: ["cabinets", "after"], pairKey: "k" }],
      ["other", { tags: ["cabinets", "after"], pairKey: "z" }],
      ["room", { tags: ["interior"] }],
    ]);
    const shots = (...ids: string[]) => ids.map((assetId) => ({ assetId }));
    // One photo, its left half then its right half.
    expect(stillPairOf(shots("two", "two", "room"), [{ from: 0, to: 50 }, { from: 50, to: 100 }, {}], assets)).toEqual({ before: 0, after: 1 });
    // A tagged pair, with another photo between them.
    expect(stillPairOf(shots("b", "room", "a"), [], assets)).toEqual({ before: 0, after: 2 });
    // A before and somebody else's after.
    expect(stillPairOf(shots("b", "other"), [], assets)).toBeNull();
    // No before at all.
    expect(stillPairOf(shots("room", "a"), [], assets)).toBeNull();
  });
});

describe("an animated ad's pure parts", () => {
  const brand = { name: "Webb Leads", primaryColor: "#336699", accentColor: "#8fb6e0", markets: ["Midland", "Odessa"] };
  const pair = [
    { tags: ["cabinets", "before"], pairKey: "k" },
    { tags: ["cabinets", "after"], pairKey: "k" },
  ];
  const loose = [{ tags: ["interior"] }, { tags: ["interior"] }];

  test("the prompt lists the photos by number with their pairs, says how a reel is drawn, and carries the rules", () => {
    const hook = { textEn: "Paint them, don't replace them.", family: "before_after" as const, scope: "cabinets" };
    const text = motionPrompt(
      hook,
      "Webb Leads",
      [
        { kind: "photo", tags: ["cabinets", "before"], pairKey: "k", description: "dark oak cabinets", imageUrl: "u" },
        { kind: "photo", tags: ["cabinets", "after"], pairKey: "k", imageUrl: "u" },
      ],
      true,
      [],
      "Midland",
    );
    expect(text).toContain('Photo 1 · tags: cabinets, before · pair "k" · looks like: dark oak cabinets · (attached below)');
    // A new ad is a reel: the photos fill the frame, each with where to move in on, and a pair is shown before first.
    expect(text).toContain("each photo fills the whole frame and is cut like footage");
    expect(text).toContain('"style":"reel"');
    expect(text).toContain('"lines":[{"photo":1,"before":true,"voice":"spoken line","x":60,"y":55},{"photo":2,"more":[4,6],"voice":"spoken line","label":"scene headline","x":50,"y":40}]');
    // A reel shows as many photos as fit, each once where it can: a line may name two more besides its own.
    expect(text).toContain("Use as many different photos as honestly fit the hook, each one once where you can");
    expect(text).toContain('a line may name up to 2 more in "more"');
    expect(text).toContain("For each line give x and y");
    // A photo that is a before and an after in one image is shown a half at a time.
    expect(text).toContain('give the line "cut": [from, to]');
    expect(text).toContain("so a line about the before never shows the after");
    expect(text).toContain("show the before first");
    expect(text).not.toContain("lightUp");
    expect(text).toContain("never as a homeowner or customer");
    // It speaks as the painters, ends on the free quote, and never says it matches anyone with a painter.
    expect(text).toContain('close to: "Get a free quote from Webb Leads."');
    expect(text).toContain('"we" and "our crew"');
    expect(text).not.toContain("third person");
    expect(text).not.toMatch(/matches (homeowners|you)|one local painter/);
    expect(text).toContain("at most 15 words");
    expect(text).not.toContain("None of these photos is tagged");
    expect(motionPrompt(hook, "Webb Leads", [], false)).toContain("None of these photos is tagged cabinets");
    // Built around a competitor's ad: what it does and how long it has run, with its offer turned into ours.
    expect(text).not.toContain("Build this ad around");
    const around = motionPrompt(hook, "Webb Leads", [], true, [], "Midland", undefined, {
      company: "Precision Painting NY INC.",
      daysRunning: 659,
      angle: "Paint instead of replace",
      offer: "Free estimate; replacement-cost alternative",
      creative: "Finished dark kitchen with headline overlay",
      adaptation: "Use a real kitchen.",
      adCopy: "Why replace\nwhen you can refinish? We sand, prime and spray your cabinets for a factory finish.",
    });
    expect(around).toContain("Build this ad around a competitor's ad that has been running for 659 days.");
    expect(around).toContain("- Its angle: Paint instead of replace");
    expect(around).toContain("- Its offer: Free estimate; replacement-cost alternative");
    expect(around).toContain("- Its words (Precision Painting NY INC.) · written: Why replace when you can refinish? We sand, prime and spray your cabinets for a factory finish.");
    // With their words on file, it follows their script, changing only what isn't true for us.
    expect(around).toContain("Use its script. Follow its words line by line, in the same order and the same voice");
    expect(around).toContain("Change only what isn't true for us: their name and town, prices, discounts, warranties or guarantees, awards, review counts, years in business, licensed or insured claims, and how many days the job takes.");
    expect(around).toContain("Keep every point it makes and its length: never shorten it to a summary.");
    expect(around).toContain("(theirs is 17)");
    // A 130-word script can't come back as a 50-word summary; at its own length, a line a sentence, it passes.
    const follow = scriptLength({ transcript: Array.from({ length: 130 }, (_, i) => `w${i}`).join(" ") })!;
    expect(follow).toEqual({ words: 130, copyChars: 0 });
    const line = (n: number, photo: number) => ({ photo, voice: "we sand and prime every door first ".repeat(4).split(" ").slice(0, n).join(" ") });
    const summary = { fits: true, style: "reel", title: "Cabinets", headline: "Cabinets", primaryText: "Cabinets.", lines: [line(15, 1), line(15, 2), line(15, 1), { photo: 2, voice: "Get a free quote today." }] };
    expect(motionPlanProblems(summary, [{ tags: [] }, { tags: [] }], undefined, follow).join(" | ")).toContain("50 words of voice (their script is 130: write 111 to 143, keeping every point)");
    const full = { ...summary, lines: [...Array.from({ length: 6 }, (_, i) => line(20, (i % 2) + 1)), { photo: 1, voice: "Get a free quote today." }] };
    expect(motionPlanProblems(full, [{ tags: [] }, { tags: [] }], undefined, follow)).toEqual([]);
    // A checklist follows a script too: a point for each of theirs, up to six, at their length.
    const longScript = { company: "Squeegee Squad", angle: "Cost education", offer: "Free estimate", creative: "", adaptation: "", transcript: Array.from({ length: 120 }, (_, i) => `w${i}`).join(" ") };
    const checklistAsk = motionPrompt({ ...hook, family: "education", style: "explainer" }, "Webb Leads", [], true, [], "Midland", undefined, longScript);
    expect(checklistAsk).toContain("one for each point their script makes, 6 at most");
    expect(checklistAsk).toContain("(theirs is 120)");
    const point = (photo: number, k: number) => ({ ...line(18, photo), label: `Point ${k}`, mark: "check" });
    const checklist = { ...summary, style: "explainer", tag: "Quotes", title: "6 things to check in a quote", lines: [line(10, 1), ...[1, 2, 3, 4, 5, 6].map((k) => point((k % 2) + 1, k)), { photo: 2, voice: "Get a free quote today." }] };
    expect(motionPlanProblems(checklist, [{ tags: [] }, { tags: [] }], undefined, scriptLength(longScript))).toEqual([]);
    // Without a script to follow, the same long plan is too long.
    expect(motionPlanProblems(full, [{ tags: [] }, { tags: [] }])).toContain("7 lines (write 3 to 5)");
    expect(around).toContain("Their offer becomes ours: a free quote from Webb Leads.");
    expect(around).not.toContain("one local painter");
    // A headline's worth of words, or card text repeated over and over, is no script: it takes the angle only.
    const thin = { company: "The Cabinets Painter", angle: "Before / after", offer: "Learn more", creative: "", adaptation: "", adCopy: "Cabinet Painting: Expert Services Learn More ".repeat(6) };
    const fromThin = motionPrompt(hook, "Webb Leads", [], true, [], "Midland", undefined, thin);
    expect(fromThin).toContain("written: Cabinet Painting: Expert Services Learn More\n");
    expect(fromThin).not.toContain("Use its script");
    expect(fromThin).toContain("Keep the same angle, the same kind of opening and the same order of points");
    expect(around).not.toContain("How it opens");
  });

  test("the rules: a style, a title, three to five lines on photos that were offered, a last line that asks, and no forbidden claims", () => {
    const good = motionPlanFor(2);
    expect(motionPlanProblems(good, loose)).toEqual([]);
    expect(motionPlanProblems({ ...good, style: "explode" }, loose)).toEqual(['style "explode" (write reel)']);
    // How fast a contractor answers isn't ours to promise.
    expect(motionPlanProblems({ ...good, title: "Never Wait on a Quote" }, loose)).toEqual(["mentions a promise about how fast a contractor answers"]);
    // Nothing is said about how the pros are checked.
    for (const title of ["Vetted local painters", "Pre-screened pros", "Top-rated painters"])
      expect(motionPlanProblems({ ...good, title }, loose)).toEqual(["mentions a claim about how the pros are checked (vetted, screened, top-rated)"]);
    expect(motionPlanProblems({ ...good, title: "x".repeat(31) }, loose)).toEqual(["title over 30 characters"]);
    expect(motionPlanProblems({ ...good, lines: good.lines.slice(0, 2) }, loose)).toEqual(expect.arrayContaining(["2 lines (write 3 to 5)"]));
    expect(motionPlanProblems({ ...good, lines: [{ ...good.lines[0], photo: 3 }, ...good.lines.slice(1)] }, loose)).toEqual(["line 1 names photo 3"]);
    expect(motionPlanProblems({ ...good, lines: [...good.lines.slice(0, 3), { photo: 2, voice: "Permian Home Quotes matches you with one local painter near you." }] }, loose)).toEqual([
      "the last line doesn't ask for a quote",
    ]);
    // About twenty seconds of voice, and no line so long the screen sits still.
    const long = "Get the outside painted before the first freeze, because the hot West Texas sun and the spring hail are hard on old paint all year.";
    expect(motionPlanProblems({ ...good, lines: [{ photo: 1, voice: long }, ...good.lines.slice(1)] }, loose)).toEqual(["64 words of voice (write 45 to 55)", "line 1 is 25 words (at most 15)"]);
    expect(motionPlanProblems({ ...good, primaryText: "Cabinets from $1,200 this month" }, loose)).toEqual(["mentions a price or discount"]);
    expect(motionPlanProblems({ ...good, title: "10-year warranty" }, loose)).toEqual(["mentions a warranty or guarantee"]);
    expect(motionPlanProblems({ ...good, lines: [{ ...good.lines[0], label: "x".repeat(41) }, ...good.lines.slice(1)] }, loose)).toEqual([
      "line 1's label is over 40 characters",
    ]);
  });

  test("a before/after is only ever a tagged pair, before first, and the after stays once shown", () => {
    const wipe = motionPlanFor(2, { style: "beforeAfter", revealOn: "finish" });
    expect(motionPlanProblems(wipe, pair)).toEqual([]);
    // Two photos that aren't a pair: refused, never faked.
    expect(motionPlanProblems(wipe, loose)).toEqual(["a before/after needs a tagged pair: open on the photo tagged before and bring in its after"]);
    // Opening on the after.
    const backwards = { ...wipe, lines: wipe.lines.map((l) => ({ ...l, photo: l.photo === 1 ? 2 : 1 })) };
    expect(motionPlanProblems(backwards, pair)).toEqual(["a before/after needs a tagged pair: open on the photo tagged before and bring in its after"]);
    const flipFlop = { ...wipe, lines: [wipe.lines[0], wipe.lines[2], wipe.lines[1], wipe.lines[3]] };
    expect(motionPlanProblems(flipFlop, pair)).toEqual(["once the after is shown, it stays"]);
    expect(motionPlanProblems({ ...wipe, revealOn: "sparkle" }, pair)).toEqual(['revealOn "sparkle" isn\'t a word of the script']);
  });

  test("a counter needs two or three whole numbers, each with what it counts, and a line for each", () => {
    const stats = [
      { value: 1, label: "local painter" },
      { value: 0, label: "pressure" },
    ];
    const counter = motionPlanFor(2, { style: "counter", stats });
    expect(motionPlanProblems(counter, loose)).toEqual([]);
    expect(motionPlanProblems({ ...counter, stats: [stats[0]] }, loose)).toEqual(["1 numbers (a counter has 2 or 3)"]);
    expect(motionPlanProblems({ ...counter, stats: [{ value: 212, label: "homes painted" }, stats[1]] }, loose)).toEqual(["number 1 isn't a whole number from 0 to 99"]);
    expect(motionPlanProblems({ ...counter, stats: [...stats, { value: 1, label: "free quote" }] }, loose)).toEqual([
      "3 numbers need 5 lines: an opening, one each, and the ask",
    ]);
  });

  test("the stored ad: each line a shot with its photo and label; the design carries the style and only what that style shows", () => {
    const { script, design } = composeMotion(motionPlanFor(2, { stats: [{ value: 9, label: "ignored" }], revealOn: "ignored" }), ["a", "b"]);
    expect(script.shots!.map((x) => [x.assetId, x.onScreen])).toEqual([
      ["a", ""],
      ["a", "No tear-out"],
      ["b", "Prepped first"],
      ["b", ""],
    ]);
    expect(script.onScreen).toEqual(["Paint them, don't replace", "No tear-out", "Prepped first"]);
    expect(script.voice).toMatch(/^Thinking about new cabinets\? .* Get a quote today\.$/);
    expect(design).toEqual({ style: "lightUp", title: "Paint them, don't replace" });
    expect(composeMotion(motionPlanFor(2, { style: "counter", stats: [{ value: 1, label: " painter " }] }), ["a", "b"]).design.stats).toEqual([{ value: 1, label: "painter" }]);
    expect(composeMotion(motionPlanFor(2, { style: "beforeAfter", revealOn: "finish" }), ["a", "b"]).design.revealOn).toBe("finish");
  });

  test("word times come from the voice's own character times, line by line; without them there are none", () => {
    const lines = ["Paint them.", "Get a quote."];
    const chars = [...lines.join(" ")];
    const alignment = { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) };
    expect(wordTimings(lines, alignment)).toEqual([
      [
        { text: "Paint", start: 0, end: 0.5 },
        { text: "them.", start: 0.6, end: 1.1 },
      ],
      [
        { text: "Get", start: 1.2, end: 1.5 },
        { text: "a", start: 1.6, end: 1.7 },
        { text: "quote.", start: 1.8, end: 2.4 },
      ],
    ]);
    expect(wordTimings(lines, null)).toBeNull();
    expect(wordTimings(lines, { ...alignment, character_start_times_seconds: [0, 0.1] })).toBeNull();
  });

  test("what the renderer is given: a photo for each line, labels only where the style shows them, and a before/after's two photos", () => {
    const photos = new Map([
      ["a", { url: "https://files.example/a.jpg", tags: ["cabinets", "before"] }],
      ["b", { url: "https://files.example/b.jpg", tags: ["cabinets", "after"] }],
    ]);
    const { script, design } = composeMotion(motionPlanFor(2), ["a", "b"]);
    const timed = { ...script, shots: script.shots!.map((x, i) => ({ ...x, start: i * 5, end: i * 5 + 4, words: [{ text: "w", start: i * 5, end: i * 5 + 1 }] })) };
    const base = { ratio: "9x16" as const, script: timed, photos, audioUrl: "https://files.example/v.mp3", audioSec: 20, brand };
    const lit = renderProps({ ...base, design });
    expect(lit).toMatchObject({ ratio: "9x16", style: { kind: "lightUp" }, headline: "Paint them, don't replace", audio: "https://files.example/v.mp3", audioSec: 20, brand });
    expect(lit.photos.map((x) => x.src.slice(-5))).toEqual(["a.jpg", "a.jpg", "b.jpg", "b.jpg"]);
    expect(lit.lines.map((l) => [l.start, (l as { label?: string }).label])).toEqual([
      [0, undefined],
      [5, "No tear-out"],
      [10, "Prepped first"],
      [15, undefined],
    ]);
    expect(lit.lines[1].words).toEqual([{ text: "w", start: 5, end: 6 }]);
    // A before/after: just the two photos, and when the after comes (its word, and the line it starts on).
    const wipe = renderProps({ ...base, design: { style: "beforeAfter", title: "T", revealOn: "sanded" } });
    expect(wipe.style).toEqual({ kind: "beforeAfter", crossOn: "sanded", crossAt: 10 });
    expect(wipe.photos).toEqual([{ src: "https://files.example/a.jpg" }, { src: "https://files.example/b.jpg" }]);
    expect((wipe.lines[1] as { label?: string }).label).toBeUndefined();
    const counter = renderProps({ ...base, design: { style: "counter", title: "T", stats: [{ value: 1, label: "painter" }] } });
    expect(counter.style).toEqual({ kind: "counter", stats: [{ value: 1, label: "painter" }] });
    // A reel: every line's photo with where that line looks, labels stuck on the picture, the effects, and the music when a track is on.
    const base4 = motionPlanFor(2);
    const reelPlan = {
      ...base4,
      style: "reel",
      lines: [
        { ...base4.lines[0], x: 60.4, y: 55 },
        // The second photo of this line is a before and an after side by side: only its left picture is shown.
        { ...base4.lines[1], x: 50, y: 40, cut: [0, 50] },
        // A point off the photo is dropped; so is a part too narrow to show, or one that is the whole photo.
        { ...base4.lines[2], x: 140, y: 50, cut: [40, 45] },
        { ...base4.lines[3], cut: [0, 100] },
      ],
    };
    expect(motionPlanProblems(reelPlan, loose)).toEqual([]);
    const made = composeMotion(reelPlan, ["a", "b"]);
    expect(made.design).toEqual({
      style: "reel",
      title: "Paint them, don't replace",
      frames: [{ x: 60, y: 55 }, { x: 50, y: 40, from: 0, to: 50 }, {}, {}],
    });
    const reel = renderProps({ ...base, design: made.design, music: { url: "https://files.example/m.mp3", from: 12, beats: [0.5, 1.05] } });
    expect(reel.style).toEqual({ kind: "reel" });
    // Photo a is tagged before, so every line on it is marked as one: the ad won't open or close on it.
    expect(reel.photos).toEqual([
      { src: "https://files.example/a.jpg", before: true, focus: [{ x: 60, y: 55 }] },
      { src: "https://files.example/a.jpg", before: true, focus: [{ x: 50, y: 40 }], crop: { from: 0, to: 50 } },
      { src: "https://files.example/b.jpg" },
      { src: "https://files.example/b.jpg" },
    ]);
    expect((reel.lines[1] as { label?: string }).label).toBe("No tear-out");
    expect((reel as { sound?: unknown }).sound).toEqual({
      music: "https://files.example/m.mp3",
      musicFrom: 12,
      beats: [0.5, 1.05],
      move: "sound/whip.wav",
      land: "sound/switch.wav",
      ask: "sound/whoosh.wav",
    });
    // A reel with nothing said about framing stores none.
    expect(composeMotion({ ...base4, style: "reel" }, ["a", "b"]).design).toEqual({ style: "reel", title: "Paint them, don't replace" });
    // With no track on, a reel still has its effects; an ad in an older style carries no sound plan at all.
    expect((renderProps({ ...base, design: made.design }) as { sound?: unknown }).sound).toEqual({ move: "sound/whip.wav", land: "sound/switch.wav", ask: "sound/whoosh.wav" });
    expect((lit as { sound?: unknown }).sound).toBeUndefined();
    // A photo gone from the library stops the ad rather than drawing a hole.
    expect(() => renderProps({ ...base, design, photos: new Map([["a", photos.get("a")!]]) })).toThrow("A line's photo is missing from the library");
  });

  test("a reel's line can show more photos than its own, and the ad keeps the ones nobody used to open and close on", () => {
    const offered = [
      { tags: ["cabinets"] },
      { tags: ["cabinets"] },
      { tags: ["cabinets"] },
      { tags: ["cabinets", "before"], pairKey: "k1" },
      { tags: ["cabinets", "after"], pairKey: "k1" },
      { tags: ["cabinets", "process"] },
      { tags: ["cabinets"] },
    ];
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const base4 = motionPlanFor(2);
    const plan = {
      ...base4,
      style: "reel",
      lines: [{ ...base4.lines[0], more: [3] }, { ...base4.lines[1] }, { ...base4.lines[2], more: [3, 1] }, { ...base4.lines[3] }],
    };
    expect(motionPlanProblems(plan, offered)).toEqual([]);
    // More has to name photos that were offered, other than the line's own, each once, two at most, and never half of a pair.
    const withMore = (more: unknown, extra: Record<string, unknown> = {}) => ({ ...plan, lines: plan.lines.map((l, i) => (i === 1 ? { ...l, more, ...extra } : l)) }) as never;
    expect(motionPlanProblems(withMore([9]), offered)).toEqual(["line 2's more names a photo that isn't there"]);
    expect(motionPlanProblems(withMore("3"), offered)).toEqual(["line 2's more names a photo that isn't there"]);
    expect(motionPlanProblems(withMore([1]), offered)).toEqual(["line 2 names a photo twice"]);
    expect(motionPlanProblems(withMore([3, 3]), offered)).toEqual(["line 2 names a photo twice"]);
    expect(motionPlanProblems(withMore([2, 3, 6]), offered)).toEqual(["line 2 has 3 more photos (at most 2)"]);
    expect(motionPlanProblems(withMore([5]), offered)).toEqual(["line 2's more has a before, or one of a pair"]);
    expect(motionPlanProblems(withMore([4]), offered)).toEqual(["line 2's more has a before, or one of a pair"]);
    // Finished work on its own carries the after tag and is as welcome as any photo, as an extra or to spare.
    const finished = offered.map((f) => (f.pairKey ? f : { tags: [...f.tags, "after"] }));
    expect(motionPlanProblems(withMore([3]), finished)).toEqual([]);
    expect(composeMotion(plan, ids, finished).design.spare).toEqual(["f", "g"]);
    expect(motionPlanProblems(withMore([3], { cut: [0, 50] }), offered)).toEqual(["line 2 shows part of a photo, so it takes no more photos"]);
    // One image that is a before and an after side by side is only ever shown a half at a time.
    const twoInOne = [...offered.slice(0, 2), { tags: ["cabinets", "before", "after"] }];
    const onIt = (cut?: number[]) => ({ ...plan, lines: plan.lines.map((l, i) => ({ ...l, more: undefined, ...(i === 1 ? { photo: 3, ...(cut ? { cut } : {}) } : {}) })) }) as never;
    expect(motionPlanProblems(onIt(), twoInOne)).toEqual(["line 2's photo is a before and an after side by side: give it a cut, the half the line is about"]);
    expect(motionPlanProblems(onIt([0, 50]), twoInOne)).toEqual([]);
    // An older style doesn't read more at all.
    expect(motionPlanProblems({ ...withMore([9]), style: "lightUp" } as never, offered)).toEqual([]);

    const { script, design } = composeMotion(plan, ids, offered);
    // Lines use a, a, b, b; more adds c and a. Left over: d and e (a pair, never spare), f and g.
    expect(design.frames).toEqual([{ more: ["c"] }, {}, { more: ["c", "a"] }, {}]);
    expect(design.spare).toEqual(["f", "g"]);
    // Without knowing what was offered nothing is kept to spare, and an older style keeps neither.
    expect(composeMotion(plan, ids).design.spare).toBeUndefined();
    expect(composeMotion({ ...plan, style: "lightUp" }, ids, offered).design).toEqual({ style: "lightUp", title: "Paint them, don't replace" });
    // A line that shows part of a photo keeps to that photo.
    const part = composeMotion({ ...plan, lines: plan.lines.map((l, i) => (i === 0 ? { ...l, cut: [0, 50] } : l)) }, ids, offered);
    expect(part.design.frames![0]).toEqual({ from: 0, to: 50 });
    // Two pictures one above the other are cut down the photo, not across it, and the renderer is told so.
    const stacked = composeMotion({ ...plan, lines: plan.lines.map((l, i) => (i === 0 ? { ...l, more: undefined, cut: [50, 100], stacked: true } : l)) }, ids, offered);
    expect(stacked.design.frames![0]).toEqual({ from: 50, to: 100, down: true });
    const stackedProps = renderProps({
      ratio: "9x16",
      design: stacked.design,
      script: { ...stacked.script, shots: stacked.script.shots!.map((x, i) => ({ ...x, start: i * 5, end: i * 5 + 4 })) },
      photos: new Map(ids.map((id) => [id, { url: `https://files.example/${id}.jpg`, tags: [] as string[] }])),
      audioUrl: "https://files.example/v.mp3",
      audioSec: 20,
      brand,
    }) as { photos: Array<{ crop?: unknown }> };
    expect(stackedProps.photos[0].crop).toEqual({ from: 50, to: 100, down: true });
    expect(stackedProps.photos[1].crop).toBeUndefined();
    // Which picture is the before: the line says so, or it is the first of two different parts shown of one photo.
    const said = composeMotion({ ...plan, lines: plan.lines.map((l, i) => (i === 2 ? { ...l, more: undefined, before: true } : l)) }, ids, offered);
    expect(said.design.frames![2]).toEqual({ before: true });
    const halves = composeMotion(
      { ...plan, lines: plan.lines.map((l, i) => ({ ...l, more: undefined, ...(i === 0 ? { cut: [0, 48], stacked: true } : i === 1 ? { cut: [52, 100], stacked: true } : {}) })) },
      ids,
      offered,
    );
    const halvesProps = renderProps({
      ratio: "9x16",
      design: halves.design,
      script: { ...halves.script, shots: halves.script.shots!.map((x, i) => ({ ...x, start: i * 5, end: i * 5 + 4 })) },
      photos: new Map(ids.map((id) => [id, { url: `https://files.example/${id}.jpg`, tags: [] as string[] }])),
      audioUrl: "https://files.example/v.mp3",
      audioSec: 20,
      brand,
    }) as { photos: Array<{ before?: boolean }> };
    expect(halvesProps.photos.map((x) => x.before)).toEqual([true, undefined, undefined, undefined]);

    const photos = new Map(ids.map((id) => [id, { url: `https://files.example/${id}.jpg`, tags: [] as string[] }]));
    const timed = { ...script, shots: script.shots!.map((x, i) => ({ ...x, start: i * 5, end: i * 5 + 4 })) };
    const props = renderProps({ ratio: "9x16", design, script: timed, photos, audioUrl: "https://files.example/v.mp3", audioSec: 20, brand }) as {
      photos: Array<{ src: string }>;
      lines: Array<{ photos?: Array<{ src: string }> }>;
      spare?: Array<{ src: string }>;
    };
    const names = (list?: Array<{ src: string }>) => list?.map((x) => x.src.slice(-5, -4));
    // Every line still has its own photo, so an older renderer draws the ad as before.
    expect(names(props.photos)).toEqual(["a", "a", "b", "b"]);
    // A line with more carries them all, its own first; a line without carries none.
    expect(props.lines.map((l) => names(l.photos))).toEqual([["a", "c"], undefined, ["b", "c", "a"], undefined]);
    expect(names(props.spare)).toEqual(["f", "g"]);
    // A spare or extra photo that has left the library is passed over; the ad is still drawn.
    photos.delete("c");
    photos.delete("g");
    const fewer = renderProps({ ratio: "9x16", design, script: timed, photos, audioUrl: "https://files.example/v.mp3", audioSec: 20, brand }) as typeof props;
    expect(fewer.lines.map((l) => names(l.photos))).toEqual([undefined, undefined, ["b", "a"], undefined]);
    expect(names(fewer.spare)).toEqual(["f"]);
  });
});

describe("the swipe file's pure parts", () => {
  test("CSV: quotes, doubled quotes, newlines inside quotes and a BOM", () => {
    expect(parseCsv('\ufeffa,b\n1,"x, ""y""\nz"\n')).toEqual([
      ["a", "b"],
      ["1", 'x, "y"\nz'],
    ]);
  });

  test("the three sheet tabs merge by their # column; types map to scopes; angles map to families", () => {
    const ads =
      "#,Company,Painting type,Hook / angle,Offer,Creative,Area evidence,CTA,Client adaptation,Started (Meta),Status when observed,Advertiser page,Destination,Ad ID\n1,Acme,Cabinets,Cost of new cabinets,Free quote,Before/after,Odessa,Get quote,Try it,2026-09-01,Active,https://fb/acme,https://acme.example,111\n2,Bee,General painting,Owner selfie,None,Selfie,Midland,Learn more,Try it,,,,,222";
    const copy = '#,Company,Ad copy and card text\n1,Acme,"Tired of dark cabinets?\nWe paint them."';
    const transcripts = '#,Company,Spoken transcript,Duration (seconds)\n1,Acme,"[00:00] Hi there. [00:03] Paint them.",14';
    const merged = mergeSwipeCsvs([transcripts, copy, ads]);
    expect(merged.tabs.sort()).toEqual(["ads", "copy", "transcripts"]);
    expect(merged.rows).toEqual([
      expect.objectContaining({
        company: "Acme",
        paintingType: "Cabinets",
        scope: "cabinets",
        hook: "Cost of new cabinets",
        area: "Odessa",
        adaptation: "Try it",
        startedAt: "2026-09-01",
        status: "Active",
        pageUrl: "https://fb/acme",
        destination: "https://acme.example",
        metaAdId: "111",
        adCopy: "Tired of dark cabinets?\nWe paint them.",
        transcript: "[00:00] Hi there. [00:03] Paint them.",
        durationSec: 14,
      }),
      expect.objectContaining({ company: "Bee", paintingType: "General painting", scope: undefined, transcript: undefined, metaAdId: "222" }),
    ]);
    expect(mergeSwipeCsvs([copy]).rows).toEqual([]);
    expect(familyOfAngle("Cost of new cabinets")).toBe("education");
    expect(familyOfAngle("Before/after transformation")).toBe("before_after");
    expect(familyOfAngle("Owner selfie")).toBe("owner_story");
    expect(familyOfAngle("Book before the new year")).toBe("seasonal");
    expect(familyOfAngle("Clean, respectful crew")).toBe("objection");
    expect(familyOfAngle("5-star reviews")).toBe("proof");
  });

  test("examples for the writer: the hook's scope first, starred first, those with a script first, then newest; four at most", () => {
    const sw = (over: Partial<{ scope?: string; starred: boolean; transcript?: string; importedAt: string; id: string }>) => ({
      id: "x",
      starred: false,
      importedAt: "2026-10-10",
      ...over,
    });
    const swipes = [
      sw({ id: "general-old", importedAt: "2026-01-01" }),
      sw({ id: "ext", scope: "exterior", starred: true, transcript: "t" }),
      sw({ id: "cab-plain", scope: "cabinets" }),
      sw({ id: "cab-script", scope: "cabinets", transcript: "t" }),
      sw({ id: "cab-star", scope: "cabinets", starred: true }),
      sw({ id: "general-new", importedAt: "2026-10-20" }),
      sw({ id: "cab-newer", scope: "cabinets", importedAt: "2026-10-30" }),
    ];
    expect(pickExamples(swipes, "cabinets").map((x) => x.id)).toEqual(["cab-star", "cab-script", "cab-newer", "cab-plain"]);
    expect(pickExamples(swipes, "crew").map((x) => x.id)).toEqual(["general-new", "general-old", "ext", "cab-star"]);
  });

  test("the prompt carries the examples with the tone-only rule, scripts without their timestamps, copy cut to 300 characters", () => {
    const hook = { textEn: "Paint them, don't replace them.", family: "before_after" as const, scope: "cabinets" };
    const examples = [
      { company: "Acme", hook: "Cost", offer: "Free quote", transcript: "[00:00] Hi there.\n[00:03] Paint them.", durationSec: 14.4 },
      { company: "Bee", hook: "Selfie", offer: "None", adCopy: "x".repeat(400) },
    ];
    const text = motionPrompt(hook, "B", [], true, examples);
    expect(text).toContain("for tone and shape only. Never copy their claims, prices, discounts, names, warranties or deadlines.");
    expect(text).toContain("Example 1 (Acme; angle: Cost; offer: Free quote) · spoken (14s): Hi there. Paint them.");
    expect(text).toContain(`Example 2 (Bee; angle: Selfie; offer: None) · copy: ${"x".repeat(300)}`);
    expect(text).not.toContain("x".repeat(301));
    expect(motionPrompt(hook, "B", [], true)).not.toContain("tone and shape");
  });
});

describe("niche research's pure parts", () => {
  test("the Apify input asks for active US ads that started before the bar; items are read whichever way they're spelled", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    expect(apifyInput("cabinet painting", 90, now)).toEqual({
      query: "cabinet painting",
      country: "US",
      activeStatus: "active",
      mediaType: "all",
      sortBy: "mostRecent",
      maxDate: "2026-08-01",
      maxItems: 200,
    });
    // The fixtures' start dates count back from the real clock, so read them against it too.
    const snake = fromApifyItem(APIFY_CABINETS[0], new Date())!;
    expect(snake).toMatchObject({
      metaAdId: "9001",
      pageId: "p1",
      pageName: "Jesse McCandless Painting",
      pageLikes: 1200,
      active: true,
      variants: 3,
      platforms: ["FACEBOOK", "INSTAGRAM"],
      title: "Cabinets, painted",
      cta: "Get quote",
      landing: "https://jmpainting.example/cabinets",
      videoUrl: "https://video.example/9001.mp4",
      posterUrl: "https://img.example/9001.jpg",
      mediaType: "video",
    });
    expect(snake.daysRunning).toBeGreaterThanOrEqual(139);
    expect(snake.adCopy).toContain("Midland homeowners");
    const camel = fromApifyItem(APIFY_CABINETS[1], now)!;
    expect(camel).toMatchObject({
      metaAdId: "9002",
      pageName: "Lubbock Cabinet Co",
      imageUrl: "https://img.example/9002.jpg",
      mediaType: "image",
      variants: 1,
    });
    expect(fromApifyItem(APIFY_CABINETS[3], now)).toBeNull();
    expect(fromApifyItem({ ad_archive_id: "x", page_name: "p" }, now)).toBeNull();
    expect(fromApifyItem({ ad_archive_id: "x", page_name: "p", start_date: "2026-01-01T00:00:00.000Z", end_date: 1 }, now)).toMatchObject({
      active: false,
    });
    expect(apifyInput("cabinet painting", 90, now, 100, "inactive")).toMatchObject({ activeStatus: "inactive", maxItems: 100 });
    // A stopped ad: its last day, and the days it ran up to then, not to today.
    expect(
      fromApifyItem({ ad_archive_id: "y", page_name: "p", start_date: "2026-01-01T00:00:00.000Z", end_date: "2026-06-17T00:00:00.000Z", is_active: false }, now),
    ).toMatchObject({ active: false, endedAt: "2026-06-17", daysRunning: 167 });
    expect(qualifies({ active: true, daysRunning: 90 }, 90)).toBe(true);
    expect(qualifies({ active: true, daysRunning: 89 }, 90)).toBe(false);
    expect(qualifies({ active: false, daysRunning: 400 }, 90)).toBe(false);
  });

  test("local means a market named as a whole word; the score weighs quality, longevity and local; the writer's examples follow it", () => {
    const markets = ["Midland", "Odessa", "Permian Basin"];
    expect(isLocal("Painting homes in midland, TX", markets)).toBe(true);
    expect(isLocal("Serving the Permian Basin since 2009", markets)).toBe(true);
    expect(isLocal("Midlands UK decorators", markets)).toBe(false);
    expect(isLocal("", markets)).toBe(false);
    expect(swipeScore({ starred: false })).toBe(30);
    expect(swipeScore({ starred: false, quality: 48, daysRunning: 365, local: true })).toBe(88);
    expect(swipeScore({ starred: false, quality: 99, daysRunning: 9999 })).toBe(85);
    const sw = (
      id: string,
      over: Partial<{ scope?: string; starred: boolean; transcript?: string; quality?: number; daysRunning?: number; local?: boolean }>,
    ) => ({
      id,
      starred: false,
      importedAt: "2026-10-10",
      ...over,
    });
    const picked = pickExamples(
      [
        sw("cab-low", { scope: "cabinets", quality: 20 }),
        sw("cab-local", { scope: "cabinets", quality: 40, local: true }),
        sw("cab-old", { scope: "cabinets", quality: 40, daysRunning: 400 }),
        sw("cab-star", { scope: "cabinets", quality: 10, starred: true }),
        sw("ext-great", { scope: "exterior", quality: 60, daysRunning: 400, local: true }),
        sw("general", { quality: 55 }),
      ],
      "cabinets",
    ).map((x) => x.id);
    expect(picked).toEqual(["cab-star", "cab-old", "cab-local", "cab-low"]);
  });

  test("the footage picker leans toward the playbook's preferred tags; the prompt carries the playbook before the examples", () => {
    const a = (id: string, tags: string[], uses = 0) => ({ _id: id, kind: "photo" as const, tags, createdAt: "2026-10-01", uses });
    const assets = [a("int-plain", ["interior"]), a("int-crew", ["interior", "crew"]), a("int-process", ["interior", "process"], 1)];
    expect(pickAssets(assets, "interior", new Set(), 6).assets.map((x) => x._id)).toEqual(["int-plain", "int-crew", "int-process"]);
    expect(pickAssets(assets, "interior", new Set(), 6, ["process", "crew"]).assets.map((x) => x._id)).toEqual([
      "int-process",
      "int-crew",
      "int-plain",
    ]);
    const hook = { textEn: "Paint them, don't replace them.", family: "before_after" as const, scope: "cabinets" };
    const text = motionPrompt(hook, "B", [], true, [], "Midland", "Open with the owner, then the before/after.");
    expect(text).toContain('Say "Midland homeowners"');
    expect(motionPrompt(hook, "B", [], true, [], "Odessa")).toContain('Say "Odessa homeowners"');
    expect(text).toContain(
      "What works in this category, from competitor ads that have run for months. Follow the angle and the kind of opening; never their claims:",
    );
    expect(text.indexOf("Open with the owner")).toBeLessThan(text.indexOf("How it is drawn:"));
    expect(motionPrompt(hook, "B", [], true)).not.toContain("What works in this category");
  });

  test("Claude's tag and playbook replies are cleaned: unknown families, tags and openings fall away; junk is junk", () => {
    const tags = readSwipeTags(
      JSON.stringify({ ...tagReplyFor("Advertiser: Acme cabinet"), family: "bogus", opening: "weird", footage: ["before_after", "x"], quality: 99 }),
    )!;
    expect(tags).toMatchObject({ painting: true, scope: "cabinets", family: "proof", opening: "other", footage: ["before_after"], quality: 60 });
    expect(readSwipeTags("not json")).toBeNull();
    // A hardscaping ad is read as one, with that trade's kinds of job; a painting scope means nothing there.
    const hardscape = { company: "Backyard Pavers Co", pageName: "Backyard Pavers Co", adCopy: "New patio in a week" } as never;
    const asked = tagSwipePrompt(hardscape, ["Midland"], AD_TRADES["outdoor-construction"]);
    expect(asked).toContain(`${TAG_MARK} hardscaping service (patios, pavers`);
    expect(asked).toContain('"scope": "patio"|"walkway"|"wall"|"outdoor-living"|null');
    expect(asked).not.toContain("cabinets");
    expect(tagSwipePrompt(hardscape, ["Midland"])).toContain(`${TAG_MARK} painting service (house painting`);
    const yard = { ...tagReplyFor("Advertiser: Acme patio"), scope: "patio", paintingType: "Patios" };
    expect(readSwipeTags(JSON.stringify(yard), AD_TRADES["outdoor-construction"])).toMatchObject({ painting: true, scope: "patio", paintingType: "Patios" });
    expect(readSwipeTags(JSON.stringify(yard))!.scope).toBeUndefined();
    expect(readSwipeTags(JSON.stringify({ ...yard, scope: "cabinets" }), AD_TRADES["outdoor-construction"])!.scope).toBeUndefined();
    // A bathroom ad (walk-in showers) is read with that trade's kinds of job.
    const bath = { company: "Shower Co", pageName: "Shower Co", adCopy: "New walk-in shower in one day" } as never;
    const bathAsked = tagSwipePrompt(bath, ["Midland"], AD_TRADES["bathroom-remodeling"]);
    expect(bathAsked).toContain(`${TAG_MARK} bathrooms service (walk-in showers`);
    expect(bathAsked).toContain('"scope": "walk-in-shower"|"tub-to-shower"|"bathtub"|"full-bath"|null');
    expect(bathAsked).not.toContain("cabinets");
    const shower = { ...tagReplyFor("Advertiser: Shower Co"), scope: "walk-in-shower", paintingType: "Walk-in showers" };
    expect(readSwipeTags(JSON.stringify(shower), AD_TRADES["bathroom-remodeling"])).toMatchObject({ scope: "walk-in-shower", paintingType: "Walk-in showers" });
    expect(readSwipeTags(JSON.stringify({ ...shower, scope: "patio" }), AD_TRADES["bathroom-remodeling"])!.scope).toBeUndefined();
    expect(readSwipeTags(JSON.stringify({ paintingType: "Interior" }))).toBeNull();
    const pb = readPlaybook("```json\n" + JSON.stringify(PLAYBOOK_REPLY) + "\n```")!;
    expect(pb.footagePrefs).toEqual(["before", "after", "crew"]);
    expect(pb.angleFamilies).toEqual(["before_after", "owner_story"]);
    expect(pb.localCompetitors).toEqual([{ company: "Jesse McCandless Painting", angle: "owner story", daysRunning: 140 }]);
    expect(readPlaybook(JSON.stringify({ text: "" }))).toBeNull();
  });
});

describe("the library, hooks and settings", () => {
  test("a library file carries a small copy for the grid: given at upload or made later; replaced and removed with it", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    const member = await signUp(t, "owner@peak.example");
    const thumb = await store(t, "image/jpeg", "small");
    const a = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "a.jpg", tags: [], thumbStorageId: thumb });
    const b = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "b.jpg", tags: [] });
    const list = async () => Object.fromEntries((await staff.as.query(api.ads.listAssets, {})).map((x) => [x.fileName, x.thumbUrl]));
    expect(await list()).toEqual({ "a.jpg": expect.any(String), "b.jpg": undefined });
    // One uploaded before thumbnails gets its copy later; a new copy replaces the old file.
    await staff.as.mutation(api.ads.setThumb, { id: b, thumbStorageId: await store(t, "image/jpeg", "small b") });
    const next = await store(t, "image/jpeg", "small a2");
    await staff.as.mutation(api.ads.setThumb, { id: a, thumbStorageId: next });
    expect(await t.run(async (ctx) => await ctx.db.system.get(thumb))).toBeNull();
    expect(Object.values(await list()).every((u) => typeof u === "string")).toBe(true);
    // Nothing big will do.
    await expect(staff.as.mutation(api.ads.setThumb, { id: b, thumbStorageId: await store(t, "image/jpeg", "x".repeat(600 * 1024)) })).rejects.toThrow("small copy");
    await expect(member.as.mutation(api.ads.setThumb, { id: b, thumbStorageId: next })).rejects.toThrow("Only Webb Leads staff");
    // Removing the file removes its small copy too.
    await staff.as.mutation(api.ads.removeAsset, { id: a });
    expect(await t.run(async (ctx) => await ctx.db.system.get(next))).toBeNull();
  });

  test("types of work: named in ideas, a photo's scope follows its work, an ad shows only that work, and the old library gets them", async () => {
    const painting = AD_TRADES.painting;
    expect(worksIn("Fence staining that lasts through a Texas summer", painting)).toEqual(["fence-stain"]);
    expect(worksIn("We stain kitchen cabinets so the grain shows", painting)).toEqual(["cabinets-stained"]);
    expect(worksIn("Dated oak cabinets? We paint them white", painting)).toEqual(["cabinets-painted"]);
    expect(worksIn("New LVP flooring in a weekend", painting)).toEqual(["flooring-lvp"]);
    expect(worksIn("Painted balusters and a fresh handrail", painting)).toEqual(["stairs-balusters"]);
    expect(worksIn("Brick sealed and limewashed", painting)).toEqual(["brick"]);
    expect(worksIn("Make your house look new again", painting)).toEqual([]);
    expect(worksIn("Commercial painting for your restaurant", painting)).toEqual(["commercial"]);
    expect(worksIn("Unit turns and make-readies for property managers", painting)).toEqual(["unit-turn"]);
    expect(worksIn("Closets and built-in shelving", painting)).toEqual(["closets-built-ins"]);
    expect(worksIn("Epoxy garage floors that shine", painting)).toEqual(["garage-floors"]);
    expect(worksIn("Custom vanities built and installed", painting)).toContain("cabinets-built");
    expect(describePrompt(painting)).toContain("tag the type of work the job is for");
    expect(painting.works!["interior-walls"].label).toBe("Rooms painted");
    expect(describePrompt(painting)).toContain("only when the room as a whole is the subject");
    // A photo of a type of work is also a photo of its scope, unless it already has one.
    expect(withWorkScopes(["fence-stain", "after"], painting)).toEqual(["fence-stain", "after", "exterior"]);
    expect(withWorkScopes(["doors", "exterior"], painting)).toEqual(["doors", "exterior"]);
    expect(assetTagsOf(painting)).toEqual(expect.arrayContaining(["cabinets-stained", "fence-stain", "flooring-lvp"]));
    // A fence-staining idea shows only stained fences when there are enough of them; with fewer, they go first.
    const photo = (id: string, tags: string[], createdAt = "2026-10-01") => ({ _id: id, kind: "photo" as const, tags, createdAt });
    const library = [
      photo("house", ["exterior", "exterior-repaint"], "2026-10-09"),
      photo("f1", ["exterior", "fence-stain"]),
      photo("f2", ["exterior", "fence-stain"]),
      photo("f3", ["exterior", "fence-stain"]),
      photo("gate", ["exterior", "fence-build"], "2026-10-08"),
    ];
    expect(pickAssets(library, "exterior", new Set(), 6, [], [], ["fence-stain"]).assets.map((a) => a._id).sort()).toEqual(["f1", "f2", "f3"]);
    expect(pickAssets(library, "exterior", new Set(["f2", "f3"]), 6, [], [], ["fence-stain"]).assets.map((a) => a._id)[0]).toBe("f1");
    expect(pickAssets(library, "exterior", new Set()).assets).toHaveLength(5);

    // The old library: a photo tagged before types of work keeps its tags and gains the one Claude sees.
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    stubServices([], { describe: { description: "A cedar fence with fresh stain.", tags: ["exterior", "after", "fence-stain"], items: ["fence"] } });
    const insert = (tags: string[]) =>
      t.run(async (ctx) =>
        ctx.db.insert("adAssets", { storageId: await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" })), kind: "photo", fileName: "fence.jpg", contentType: "image/jpeg", size: 1, tags, uploadedBy: staff.userId, createdAt: new Date().toISOString() }),
      );
    const old = await insert(["exterior", "after"]);
    const sorted = await insert(["exterior", "fence-build"]);
    vi.useFakeTimers();
    expect(await t.mutation(internal.ads.labelWorks, {})).toEqual({ asked: 1, done: true });
    await oneAtATime(t);
    vi.useRealTimers();
    expect((await t.run(async (ctx) => await ctx.db.get(old)))!.tags).toEqual(["exterior", "after", "fence-stain"]);
    expect((await t.run(async (ctx) => await ctx.db.get(sorted)))!.tags).toEqual(["exterior", "fence-build"]);

    // Rooms painted, once the everything category: each photo whose types were Claude's takes Claude's new ones, the
    // subject first; one a person picked stays.
    stubServices([], { describe: { description: "A cafe with red walls and black chairs.", tags: ["commercial", "interior-walls", "after"], items: [] } });
    const insertWith = (tags: string[], suggestedTags: string[]) =>
      t.run(async (ctx) =>
        ctx.db.insert("adAssets", { storageId: await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" })), kind: "photo", fileName: "cafe.jpg", contentType: "image/jpeg", size: 1, tags, suggestedTags, uploadedBy: staff.userId, createdAt: new Date().toISOString() }),
      );
    const claudes = await insertWith(["interior-walls", "interior", "after", "crew"], ["interior-walls", "interior", "after"]);
    const persons = await insertWith(["interior-walls", "interior", "after"], ["doors", "interior", "after"]);
    vi.useFakeTimers();
    expect(await t.mutation(internal.ads.reworkWorks, {})).toEqual({ asked: 2, done: true });
    await oneAtATime(t);
    vi.useRealTimers();
    expect((await t.run(async (ctx) => await ctx.db.get(claudes)))!.tags).toEqual(["commercial", "interior-walls", "interior", "after", "crew"]);
    expect((await t.run(async (ctx) => await ctx.db.get(persons)))!.tags).toEqual(["interior-walls", "interior", "after"]);
  });

  test("an upload is labelled by Claude with what it shows; a person's fix sticks; the old library is labelled once", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    const member = await signUp(t, "owner@peak.example");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    const calls: Call[] = [];
    stubServices(calls, { describe: { description: "A front door painted black.", tags: ["exterior", "after"], items: ["front door", "brick", "spaceship"] } });
    vi.useFakeTimers();
    const id = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "door.jpg", tags: [] });
    await oneAtATime(t);
    vi.useRealTimers();
    const items = async () => (await staff.as.query(api.ads.listAssets, {})).find((a) => a.id === id)!.items;
    expect(await items()).toEqual(["front door", "brick"]);
    await staff.as.mutation(api.ads.setItems, { id, items: ["front door", "shutters", "nonsense"] });
    expect(await items()).toEqual(["front door", "shutters"]);
    await expect(member.as.mutation(api.ads.setItems, { id, items: [] })).rejects.toThrow("Only Webb Leads staff");
    // Files from before labels: each is looked at once more; a person's tags and fixed labels stay.
    const old = await t.run(async (ctx) =>
      ctx.db.insert("adAssets", { storageId: await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" })), kind: "photo", fileName: "old.jpg", contentType: "image/jpeg", size: 1, tags: ["interior"], uploadedBy: staff.userId, createdAt: new Date().toISOString() }),
    );
    vi.useFakeTimers();
    expect(await t.mutation(internal.ads.labelLibrary, {})).toEqual({ asked: 1 });
    await oneAtATime(t);
    vi.useRealTimers();
    const after = await t.run(async (ctx) => await ctx.db.get(old));
    expect(after!.items).toEqual(["front door", "brick"]);
    expect(after!.tags).toEqual(["interior"]);
    expect(await items()).toEqual(["front door", "shutters"]);
    expect(await t.mutation(internal.ads.labelLibrary, {})).toEqual({ asked: 0 });
    // Claude turning a look away for coming too fast: asked again a little later, by itself.
    const busy = { n: 2 };
    stubServices(calls, { describe: { description: "A fence painted red.", tags: ["exterior"], items: ["fence"] }, busyLooks: busy });
    vi.useFakeTimers();
    const fence = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "fence.jpg", tags: [] });
    await oneAtATime(t);
    vi.useRealTimers();
    expect(busy.n).toBeLessThan(0);
    expect((await t.run(async (ctx) => await ctx.db.get(fence)))!.items).toEqual(["fence"]);
    // A file Claude keeps turning away is let be after three more tries.
    const stuck = { n: 99 };
    stubServices(calls, { busyLooks: stuck });
    vi.useFakeTimers();
    const lost = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "lost.jpg", tags: [] });
    await oneAtATime(t);
    vi.useRealTimers();
    expect(99 - stuck.n).toBe(4);
    expect((await t.run(async (ctx) => await ctx.db.get(lost)))!.items).toBeUndefined();
  });

  test("Claude matches each before with the after of the same spot, by itself, once a run of changes settles; a person pairs, splits and swaps", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    const calls: Call[] = [];
    // Before 1 is the same spot as After 2.
    stubServices(calls, { pairs: { pairs: [{ before: 1, after: 2 }] } });
    vi.useFakeTimers();
    const jobId = await staff.as.mutation(api.ads.addJob, { name: "Elm kitchen" });
    const add = async (fileName: string, tags: string[]) => await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", fileName), fileName, tags, jobId });
    const b1 = await add("b1.jpg", ["cabinets", "before"]);
    const a1 = await add("a1.jpg", ["cabinets", "after"]);
    const a2 = await add("a2.jpg", ["cabinets", "after"]);
    const work = await add("work.jpg", ["process"]);
    await oneAtATime(t);
    vi.useRealTimers();
    const key = async (id: Id<"adAssets">) => (await t.run(async (ctx) => await ctx.db.get(id)))!.pairKey;
    expect(await key(b1)).toEqual(expect.any(String));
    expect(await key(a2)).toBe(await key(b1));
    expect(await key(a1)).toBeUndefined();
    expect(await key(work)).toBeUndefined();
    // Four uploads, one look: only the last ask ran.
    const looks = calls.filter((c) => c.url.includes("anthropic") && c.body!.includes("Which before and which after show the same spot"));
    expect(looks).toHaveLength(1);
    expect(JSON.stringify(JSON.parse(looks[0].body!).messages[0].content.filter((c: { type: string; text?: string }) => c.type === "text").map((c: { text?: string }) => c.text))).toContain("Before 1:");
    expect(JSON.stringify(looks[0].body)).toContain("all from one painting or remodelling job");
    const row = async (id: Id<"adAssets">) => (await t.run(async (ctx) => await ctx.db.get(id)))!;
    const settle = async (fn: () => Promise<unknown>) => {
      vi.useFakeTimers();
      await fn();
      await oneAtATime(t);
      vi.useRealTimers();
    };
    // A photo moved out of the job keeps its pair: pairs aren't kept to a job.
    await settle(() => staff.as.mutation(api.ads.setAssetJob, { id: a2 }));
    expect(await key(a2)).toBe(await key(b1));
    // "Not a pair": the two go apart and the before is looked at again; Claude now matches it with a1.
    stubServices(calls, { pairs: { pairs: [{ before: 1, after: 1 }] } });
    await settle(() => staff.as.mutation(api.ads.splitPair, { id: b1 }));
    expect(await key(a2)).toBeUndefined();
    expect(await key(a1)).toEqual(expect.any(String));
    expect(await key(a1)).toBe(await key(b1));
    // Split again: Claude says the same, and they stay apart.
    await settle(() => staff.as.mutation(api.ads.splitPair, { id: a1 }));
    expect(await key(a1)).toBeUndefined();
    expect(await key(b1)).toBeUndefined();
    expect((await row(b1)).notPairs).toEqual(expect.arrayContaining([a1, a2]));
    // Nothing new: asked again, nothing is looked at twice.
    const before = calls.length;
    await settle(() => staff.as.mutation(api.ads.tagAsset, { id: work, tags: ["process", "interior"] }));
    expect(calls.slice(before).filter((c) => c.body?.includes("Which before and which after"))).toHaveLength(0);
    // A person pairs two: the older is the before, whatever they were tagged.
    await staff.as.mutation(api.ads.pairPhotos, { ids: [work, b1] });
    expect(await row(b1)).toMatchObject({ pairSetBy: "person", tags: ["cabinets", "before"] });
    expect(await row(work)).toMatchObject({ pairSetBy: "person", tags: ["interior", "after"] });
    expect(await key(work)).toBe(await key(b1));
    // Swap: the before becomes the after.
    await staff.as.mutation(api.ads.swapPair, { id: work });
    expect((await row(b1)).tags).toEqual(["cabinets", "after"]);
    expect((await row(work)).tags).toEqual(["interior", "before"]);
    // A photo retagged out of its stage leaves its pair; so does the other half of a deleted photo.
    await settle(() => staff.as.mutation(api.ads.tagAsset, { id: work, tags: ["interior"] }));
    expect(await key(b1)).toBeUndefined();
    await staff.as.mutation(api.ads.pairPhotos, { ids: [a1, a2] });
    expect(await key(a1)).toEqual(expect.any(String));
    await settle(() => staff.as.mutation(api.ads.removeAsset, { id: a2 }));
    expect(await key(a1)).toBeUndefined();
    await expect(staff.as.mutation(api.ads.pairPhotos, { ids: [a1, a1] })).rejects.toThrow("Pick two photos");
  });

  test("photos with mixed stages are made one stage: the one given, or the furthest along; a pair kept when its before stays a before", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    const add = async (fileName: string, tags: string[]) => await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", fileName), fileName, tags });
    const primed = await add("primed.jpg", ["cabinets-painted", "before", "process"]);
    const done = await add("done.jpg", ["cabinets-painted", "after"]);
    const doors = await add("doors.jpg", ["doors", "process", "after"]);
    await staff.as.mutation(api.ads.pairPhotos, { ids: [primed, done] });
    // Tagged before and in progress, as Claude once did.
    await t.run(async (ctx) => ctx.db.patch(primed, { tags: ["cabinets-painted", "interior", "process", "before"] }));
    expect((await t.query(internal.ads.multiStage, {})).map((x) => x.fileName).sort()).toEqual(["doors.jpg", "primed.jpg"]);
    const out = await t.mutation(internal.ads.fixStages, { items: [{ id: primed, stage: "before" }, { id: doors }] });
    expect(out.fixed).toHaveLength(2);
    const row = async (id: Id<"adAssets">) => (await t.run(async (ctx) => await ctx.db.get(id)))!;
    expect((await row(primed)).tags).toEqual(["cabinets-painted", "interior", "before"]);
    expect((await row(primed)).pairKey).toBe((await row(done)).pairKey);
    expect((await row(primed)).pairKey).toEqual(expect.any(String));
    expect((await row(doors)).tags).toEqual(["doors", "after"]);
    expect(await t.query(internal.ads.multiStage, {})).toEqual([]);
  });

  test("a photo with no type of work takes its project's: when it's filed there, or all at once from the deployment", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    const job = await staff.as.mutation(api.ads.addJob, { name: "Oak kitchen" });
    const add = async (fileName: string, tags: string[], jobId?: Id<"adJobs">) =>
      await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", fileName), fileName, tags, ...(jobId ? { jobId } : {}) });
    await add("after1.jpg", ["cabinets-painted", "after"], job);
    await add("after2.jpg", ["cabinets-painted", "after"], job);
    await add("door.jpg", ["doors", "after"], job);
    const row = async (id: Id<"adAssets">) => (await t.run(async (ctx) => await ctx.db.get(id)))!;
    // Filed into the project: it takes the type most of the project's photos have.
    const before = await add("oak.jpg", ["interior", "before"]);
    await staff.as.mutation(api.ads.setAssetJob, { id: before, jobId: job });
    expect((await row(before)).tags).toEqual(["cabinets-painted", "interior", "before"]);
    // One already in it with none: given its project's from the deployment.
    const bare = await t.run(async (ctx) =>
      ctx.db.insert("adAssets", { storageId: await ctx.storage.store(new Blob(["x"], { type: "image/jpeg" })), kind: "photo", fileName: "bare.jpg", contentType: "image/jpeg", size: 1, tags: ["before"], jobId: job, uploadedBy: staff.userId, createdAt: new Date().toISOString() }),
    );
    expect((await t.mutation(internal.ads.fillWorksFromProjects, {})).filled).toEqual(["bare.jpg: cabinets-painted"]);
    // Out of a project, or with a type already, nothing changes.
    const loose = await add("loose.jpg", ["before"]);
    const typed = await add("typed.jpg", ["doors", "before"], job);
    await t.mutation(internal.ads.fillWorksFromProjects, {});
    expect((await row(loose)).tags).toEqual(["before"]);
    expect((await row(typed)).tags).toEqual(["doors", "before"]);
    expect((await row(bare)).tags).toEqual(["cabinets-painted", "before", "cabinets"]);
  });

  test("across the library: befores and afters of one type of work pair from different jobs, or none", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    const calls: Call[] = [];
    stubServices(calls, { pairs: { pairs: [{ before: 1, after: 1 }] } });
    vi.useFakeTimers();
    const job = await staff.as.mutation(api.ads.addJob, { name: "Oak fence" });
    const add = async (fileName: string, tags: string[], jobId?: Id<"adJobs">) =>
      await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", fileName), fileName, tags, ...(jobId ? { jobId } : {}) });
    const fenceBefore = await add("fb.jpg", ["fence-stain", "exterior", "before"], job);
    const fenceAfter = await add("fa.jpg", ["fence-stain", "exterior", "after"]);
    const doorAfter = await add("da.jpg", ["doors", "interior", "after"]);
    await oneAtATime(t);
    vi.useRealTimers();
    const key = async (id: Id<"adAssets">) => (await t.run(async (ctx) => await ctx.db.get(id)))!.pairKey;
    expect(await key(fenceBefore)).toEqual(expect.any(String));
    expect(await key(fenceAfter)).toBe(await key(fenceBefore));
    expect(await key(doorAfter)).toBeUndefined();
    const looks = calls.filter((c) => c.body?.includes("Which before and which after"));
    expect(looks).toHaveLength(1);
    expect(looks[0].body).toContain("Two houses that merely look alike are not a pair");
    // The library's pools, asked once from the deployment.
    expect((await t.mutation(internal.ads.pairLibrary, {})).pools.sort()).toEqual(["painting|work:doors", "painting|work:fence-stain"]);
  });

  test("photos of one job are kept together: a job is named, renamed and taken away without losing its photos; a project's photos go to one job, once each", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "super_admin" });
    const member = await signUp(t, "owner@peak.example");
    // On the test's clock: the pairing each change asks for is run out below, not left to go off in a later test.
    vi.useFakeTimers();
    await expect(member.as.mutation(api.ads.addJob, { name: "Theirs" })).rejects.toThrow("Only Webb Leads staff");
    await expect(staff.as.mutation(api.ads.addJob, { name: "   " })).rejects.toThrow("Give the job a name");
    const jobId = await staff.as.mutation(api.ads.addJob, { name: "Smith kitchen" });
    const photo = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "a.jpg", tags: ["cabinets"], jobId });
    const loose = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "b.jpg", tags: [] });
    await staff.as.mutation(api.ads.setAssetJob, { id: loose, jobId });
    expect(await staff.as.query(api.ads.listJobs, {})).toMatchObject([{ id: jobId, name: "Smith kitchen", photos: 2 }]);
    expect((await staff.as.query(api.ads.listAssets, {})).map((a) => a.jobId)).toEqual([jobId, jobId]);
    // A job holds one trade's photos.
    const patio = await staff.as.mutation(api.ads.addJob, { name: "Patio", trade: "outdoor-construction" });
    await expect(staff.as.mutation(api.ads.setAssetJob, { id: photo, jobId: patio })).rejects.toThrow("another trade");
    expect(await staff.as.query(api.ads.listJobs, { trade: "outdoor-construction" })).toMatchObject([{ name: "Patio", photos: 0 }]);
    await staff.as.mutation(api.ads.renameJob, { id: jobId, name: "Smith cabinets" });
    await staff.as.mutation(api.ads.removeJob, { id: jobId });
    expect(await staff.as.query(api.ads.listJobs, {})).toEqual([]);
    expect((await staff.as.query(api.ads.listAssets, {})).map((a) => [a.fileName, a.jobId])).toEqual([["b.jpg", undefined], ["a.jpg", undefined]]);

    // Photos picked in the library go into a new job by name, or one already there; another trade's stay out.
    const grouped = await staff.as.mutation(api.ads.groupIntoJob, { ids: [photo, loose], name: " Elm kitchen " });
    expect(grouped.moved).toBe(2);
    expect((await staff.as.query(api.ads.listJobs, {})).find((j) => j.id === grouped.jobId)).toMatchObject({ name: "Elm kitchen", photos: 2 });
    expect((await staff.as.mutation(api.ads.groupIntoJob, { ids: [photo], jobId: patio })).moved).toBe(0);
    await expect(staff.as.mutation(api.ads.groupIntoJob, { ids: [], name: "Empty" })).rejects.toThrow("Pick the photos");
    await expect(staff.as.mutation(api.ads.groupIntoJob, { ids: [photo], name: " " })).rejects.toThrow("Give the job a name");
    await expect(member.as.mutation(api.ads.groupIntoJob, { ids: [photo], name: "Theirs" })).rejects.toThrow("Only Webb Leads staff");
    await staff.as.mutation(api.ads.removeJob, { id: grouped.jobId });

    // From a project: one job under the project's name, and the photos already copied, so a second send adds only new ones.
    const projectId = (await staff.as.mutation(api.projects.create, { organizationId: staff.organizationId, data: { name: "Jones exterior" } }))!._id;
    const first = await staff.as.mutation(api.ads.jobForProject, { projectId });
    expect(first.copied).toEqual([]);
    const jobPhotoId = await t.run(async (ctx) =>
      ctx.db.insert("jobPhotos", { organizationId: staff.organizationId, projectId, storageId: await ctx.storage.store(new Blob(["x"])), fileName: "p.jpg", contentType: "image/jpeg", size: 1, uploadedBy: staff.userId, createdAt: new Date().toISOString() }),
    );
    await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "p.jpg", tags: [], jobId: first.jobId, jobPhotoId });
    const again = await staff.as.mutation(api.ads.jobForProject, { projectId });
    expect(again).toEqual({ jobId: first.jobId, copied: [jobPhotoId] });
    expect((await staff.as.query(api.ads.listJobs, {})).find((j) => j.id === first.jobId)).toMatchObject({ name: "Jones exterior", projectId, photos: 1 });
    await expect(member.as.mutation(api.ads.jobForProject, { projectId })).rejects.toThrow("Only Webb Leads staff");
    await oneAtATime(t);
  });

  test("staff file photos and clips with tags; tags are cleaned; removing deletes the file; members can't", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const member = await signUp(t, "owner@peak.example");
    await expect(member.as.mutation(api.ads.uploadUrl, {})).rejects.toThrow("Only Webb Leads staff");
    expect(await staff.as.mutation(api.ads.uploadUrl, {})).toEqual(expect.any(String));
    const photo = await staff.as.mutation(api.ads.addAsset, {
      storageId: await store(t),
      fileName: "kitchen-before.jpg",
      tags: [" Cabinets ", "before", "cabinets", ""],
      pairKey: "kitchen-elm",
    });
    const clip = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "", "mp4"), fileName: "IMG_0101.MOV", tags: ["process"] });
    await expect(
      staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "application/pdf"), fileName: "notes.pdf", tags: [] }),
    ).rejects.toThrow("Upload a photo");
    const list = await staff.as.query(api.ads.listAssets, {});
    expect(list.map((a) => [a.fileName, a.kind, a.tags, a.pairKey])).toEqual([
      ["IMG_0101.MOV", "video", ["process"], undefined],
      ["kitchen-before.jpg", "photo", ["cabinets", "before"], "kitchen-elm"],
    ]);
    expect(list[0].url).toEqual(expect.any(String));
    await staff.as.mutation(api.ads.tagAsset, {
      id: photo,
      tags: ["cabinets", "after"],
      pairKey: "kitchen-elm",
      note: "Elm St kitchen, owner said yes by text",
    });
    expect((await staff.as.query(api.ads.listAssets, {})).find((a) => a.id === photo)).toMatchObject({
      tags: ["cabinets", "after"],
      note: "Elm St kitchen, owner said yes by text",
    });
    const storageId = await t.run(async (ctx) => (await ctx.db.get(clip))!.storageId);
    await staff.as.mutation(api.ads.removeAsset, { id: clip });
    expect(await t.run(async (ctx) => await ctx.db.system.get(storageId))).toBeNull();
    expect((await staff.as.query(api.ads.listAssets, {})).length).toBe(1);
  });

  test("an upload with a still: Claude describes it and suggests tags from the list; the still is removed with it", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    const asks: Array<any> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        asks.push(JSON.parse(String(init!.body)).messages[0].content);
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: '{"description":"White shaker cabinets, freshly painted, in a bright kitchen.","tags":["Cabinets","after","garage"]}',
              },
            ],
          }),
        );
      }),
    );
    const poster = await store(t, "image/jpeg", "still");
    vi.useFakeTimers();
    const id = await staff.as.mutation(api.ads.addAsset, {
      storageId: await store(t, "image/heic", "heic"),
      fileName: "IMG_1.HEIC",
      tags: ["interior"],
      posterStorageId: poster,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    // Claude looked at the JPEG still, not the HEIC it can't read.
    expect(asks[0][0]).toMatchObject({ type: "image", source: { type: "url" } });
    const [row] = await staff.as.query(api.ads.listAssets, {});
    expect(row).toMatchObject({
      description: "White shaker cabinets, freshly painted, in a bright kitchen.",
      suggestedTags: ["cabinets", "after"],
      tags: ["interior"],
      uses: 0,
    });
    // An upload with no tags takes Claude's.
    vi.useFakeTimers();
    const untagged = await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", "jpg2"), fileName: "IMG_2.jpg", tags: [] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect((await staff.as.query(api.ads.listAssets, {})).find((x) => x.id === untagged)).toMatchObject({
      tags: ["cabinets", "after"],
      suggestedTags: ["cabinets", "after"],
    });
    expect(row.posterUrl).toEqual(expect.any(String));
    await expect(
      staff.as.mutation(api.ads.addAsset, {
        storageId: await store(t),
        fileName: "x.jpg",
        tags: [],
        posterStorageId: await store(t, "image/jpeg", "x".repeat(5 * 1024 * 1024 + 1)),
      }),
    ).rejects.toThrow("still for this file");
    await staff.as.mutation(api.ads.removeAsset, { id });
    expect(await t.run(async (ctx) => await ctx.db.system.get(poster))).toBeNull();
  });

  test("the six painting hooks seed once; hooks are edited, switched off and removed", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    expect(await staff.as.mutation(api.ads.seedHooks, {})).toBe(6);
    expect(await staff.as.mutation(api.ads.seedHooks, {})).toBe(0);
    const hooks = await staff.as.query(api.ads.listHooks, {});
    expect(hooks.map((h) => h.family).sort()).toEqual(["before_after", "education", "objection", "owner_story", "proof", "seasonal"]);
    expect(hooks.every((h) => h.active && h.familyLabel)).toBe(true);
    const id = await staff.as.mutation(api.ads.saveHook, {
      family: "seasonal",
      scope: "exterior",
      trade: "Painting",
      textEn: "Hail season is over. Time to look at the trim.",
      active: true,
    });
    await staff.as.mutation(api.ads.saveHook, {
      id,
      family: "seasonal",
      scope: "exterior",
      trade: "painting",
      textEn: "Hail season is over. Time to look at the trim.",
      active: false,
    });
    expect((await staff.as.query(api.ads.listHooks, {})).find((h) => h.id === id)).toMatchObject({ active: false, trade: "painting" });
    await expect(
      staff.as.mutation(api.ads.saveHook, {
        family: "proof",
        scope: "roof",
        trade: "painting",
        textEn: "A long enough hook for the check",
        active: true,
      }),
    ).rejects.toThrow("Scope must be");
    await expect(
      staff.as.mutation(api.ads.saveHook, { family: "proof", scope: "crew", trade: "painting", textEn: "short", active: true }),
    ).rejects.toThrow("Write the hook");
    await staff.as.mutation(api.ads.removeHook, { id });
    expect((await staff.as.query(api.ads.listHooks, {})).length).toBe(6);
  });

  test("the swipe file: the research loads once, CSV rows update by Meta ad id, stars and removals stick, members can't look", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const member = await signUp(t, "painter@tolliver.example", {});
    expect(await staff.as.mutation(api.ads.seedSwipes, {})).toBe(30);
    expect(await staff.as.mutation(api.ads.seedSwipes, {})).toBe(0);
    let swipes = await staff.as.query(api.ads.listSwipes, {});
    expect(swipes.length).toBe(30);
    expect(swipes.filter((x) => x.transcript).length).toBe(6);
    expect(swipes.every((x) => x.adCopy && x.source === "research 2026-10-10" && !x.starred)).toBe(true);
    const rodgers = swipes.find((x) => x.company === "Rodgers Painting")!;
    expect(rodgers).toMatchObject({ scope: "cabinets", durationSec: expect.any(Number) });

    // A later import: one row Meta already knows (updated), one new.
    const known = SWIPE_SEEDS.find((x) => x.metaAdId)!;
    const result = await staff.as.mutation(api.ads.importSwipes, {
      source: "research 2026-11-14",
      rows: [
        {
          company: known.company,
          paintingType: known.paintingType,
          scope: known.scope,
          hook: "A fresher angle",
          offer: known.offer,
          creative: known.creative,
          area: known.area,
          cta: known.cta,
          adaptation: known.adaptation,
          metaAdId: known.metaAdId,
        },
        {
          company: "New Coat Co",
          paintingType: "Exterior",
          scope: "exterior",
          hook: "Stucco cracks",
          offer: "Free quote",
          creative: "Drone",
          area: "Lubbock",
          cta: "Get quote",
          adaptation: "Try it",
        },
      ],
    });
    expect(result).toEqual({ added: 1, updated: 1 });
    swipes = await staff.as.query(api.ads.listSwipes, {});
    expect(swipes.length).toBe(31);
    expect(swipes.find((x) => x.metaAdId === known.metaAdId)).toMatchObject({ hook: "A fresher angle", source: "research 2026-11-14" });
    await expect(staff.as.mutation(api.ads.importSwipes, { source: "x", rows: [] })).rejects.toThrow("No ads found");

    await staff.as.mutation(api.ads.starSwipe, { id: rodgers.id, starred: true });
    swipes = await staff.as.query(api.ads.listSwipes, {});
    expect(swipes[0]).toMatchObject({ id: rodgers.id, starred: true });
    const gone = swipes.find((x) => x.company === "New Coat Co")!;
    await staff.as.mutation(api.ads.removeSwipe, { id: gone.id });
    expect((await staff.as.query(api.ads.listSwipes, {})).length).toBe(30);
    await expect(member.as.query(api.ads.listSwipes, {})).rejects.toThrow();
    await expect(member.as.mutation(api.ads.seedSwipes, {})).rejects.toThrow();
  });

  test("the brand's privacy page is open to anyone: who gets a request, calls and texts, and how to have it deleted", async () => {
    const t = setup();
    vi.stubEnv("CONSUMER_BRAND", "GoodFit Pros");
    const res = await t.fetch("/privacy");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>GoodFit Pros Privacy Policy</title>");
    expect(html).toContain("one local company from the GoodFit Pros network");
    expect(html).toContain('id="delete"');
    expect(html).toContain("Reply STOP");
  });

  test("drawn ads go into Meta by name, from the deployment; ones in Meta already or not drawn are left", async () => {
    const t = setup();
    const out = await t.mutation(internal.ads.sendToMeta, { names: ["nope"] });
    expect(out).toEqual({ sent: [], skipped: ["nope: not found"] });
  });

  test("the Meta token pasted in Settings: checked with Meta, sealed, shown only by its last four; the accounts it reaches listed to pick", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    vi.stubEnv("MAILBOX_KEY", btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1))));
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        seen.push(url);
        const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
        if (url.includes("access_token=bad")) return json({ error: { message: "Invalid OAuth access token." } }, 400);
        if (url.includes("/me?")) return json({ id: "77", name: "GoodFit ads" });
        if (url.includes("/me/adaccounts")) return json({ data: [{ account_id: "123", name: "GoodFit Pros", account_status: 1 }] });
        if (url.includes("/act_123/adsets")) return json({ data: [{ id: "900", name: "Midland homeowners", status: "PAUSED", campaign: { name: "Leads" } }] });
        if (url.includes("/me/accounts")) return json({ data: [{ id: "55", name: "GoodFit Pros page", access_token: "page-token" }] });
        if (url.includes("/55/leadgen_forms")) return json({ data: [{ id: "f1", name: "Free quote", status: "ACTIVE" }] });
        return json({}, 404);
      }),
    );
    const token = "EAAGgoodfit".padEnd(40, "x") + "3f9a";
    await expect(staff.as.action(api.ads.saveMetaToken, { token })).rejects.toThrow();
    await expect(owner.as.action(api.ads.saveMetaToken, { token: "bad".padEnd(30, "x") })).rejects.toThrow();
    await expect(owner.as.action(api.ads.saveMetaToken, { token: "short" })).rejects.toThrow("doesn't look like a Meta token");
    expect(await owner.as.action(api.ads.saveMetaToken, { token: ` ${token} ` })).toEqual({ name: "GoodFit ads" });
    const s = await staff.as.query(api.ads.settings, {});
    expect(s.keys.meta).toBe(true);
    expect(s.metaToken).toMatchObject({ hint: "3f9a", fromServer: false });
    expect(JSON.stringify(s)).not.toContain(token);
    // Stored sealed, never as it was pasted.
    const row = await t.run(async (ctx) => (await ctx.db.query("adSettings").take(1))[0]);
    expect(row.metaTokenEnc).toBeDefined();
    expect(row.metaTokenEnc).not.toContain(token);
    // What it reaches, to tap.
    expect(await owner.as.action(api.ads.metaLookup, {})).toEqual({
      who: "GoodFit ads",
      accounts: [{ id: "123", name: "GoodFit Pros", status: "ACTIVE", adsets: [{ id: "900", name: "Midland homeowners", status: "PAUSED", campaign: "Leads" }] }],
      pages: [{ id: "55", name: "GoodFit Pros page", forms: [{ id: "f1", name: "Free quote", status: "ACTIVE" }] }],
      problems: [],
    });
    expect(seen.find((u) => u.includes("leadgen_forms"))).toContain("access_token=page-token");
    await expect(staff.as.action(api.ads.metaLookup, {})).rejects.toThrow();
    // An Ad Library search with the token, from the deployment: what Meta returns, or why not.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        seen.push(url);
        if (url.includes("search_terms=house")) return new Response(JSON.stringify({ error: { message: "Application does not have permission for this action" } }), { status: 400 });
        return new Response(JSON.stringify({ data: [{ page_name: "Rodgers Painting", ad_delivery_start_time: "2026-06-01", ad_creative_bodies: ["Cabinets painted"] }] }));
      }),
    );
    expect(await t.action(internal.ads.adLibraryProbe, { terms: "cabinet painting" })).toEqual({
      ok: true,
      count: 1,
      more: false,
      ads: [{ page: "Rodgers Painting", started: "2026-06-01", stopped: undefined, text: "Cabinets painted" }],
    });
    expect(seen.at(-1)).toContain("ad_reached_countries=%5B%22US%22%5D");
    expect(await t.action(internal.ads.adLibraryProbe, { terms: "house painting" })).toEqual({ ok: false, error: expect.stringContaining("does not have permission") });
    await owner.as.mutation(api.ads.removeMetaToken, {});
    expect((await staff.as.query(api.ads.settings, {})).metaToken).toBeNull();
  });

  test("the campaign switch: read from Meta, turned on (with its ad set) or off by the owner only", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    vi.stubEnv("META_ACCESS_TOKEN", "tok");
    await t.run(async (ctx) => {
      await ctx.db.insert("adSettings", { adsetId: "900", weeklyEnabled: false, hooksPerWeek: 3, liveTarget: 6, updatedAt: "2026-11-27T00:00:00Z" });
    });
    const meta = { campaign: "PAUSED", adset: "PAUSED" };
    const posts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (init?.method === "POST") {
          const body = new URLSearchParams(String(init.body));
          posts.push(`${url.split("/").pop()} ${body.get("status")}`);
          if (url.endsWith("/c7")) meta.campaign = body.get("status")!;
          if (url.endsWith("/900")) meta.adset = body.get("status")!;
          return new Response(JSON.stringify({ success: true }));
        }
        return new Response(
          JSON.stringify({
            id: "900",
            name: "Midland / Odessa homeowners",
            status: meta.adset,
            effective_status: meta.adset,
            daily_budget: "2000",
            campaign: { id: "c7", name: "GoodFit Pros – Leads", status: meta.campaign },
          }),
        );
      }),
    );
    expect(await owner.as.action(api.ads.campaignState, {})).toEqual({
      campaign: { id: "c7", name: "GoodFit Pros – Leads", on: false },
      adset: { id: "900", name: "Midland / Odessa homeowners", on: false },
      dailyBudget: 20,
      delivery: "PAUSED",
      approved: 0,
    });
    await expect(staff.as.action(api.ads.campaignState, {})).rejects.toThrow();
    await expect(staff.as.action(api.ads.setCampaign, { on: true })).rejects.toThrow();
    expect(posts).toEqual([]);
    // On: the campaign, and the ad set since it was off too.
    const on = await owner.as.action(api.ads.setCampaign, { on: true });
    expect(on.campaign.on).toBe(true);
    expect(on.adset.on).toBe(true);
    expect(posts).toEqual(["c7 ACTIVE", "900 ACTIVE"]);
    // Off: the campaign only.
    const off = await owner.as.action(api.ads.setCampaign, { on: false });
    expect(off.campaign.on).toBe(false);
    expect(off.adset.on).toBe(true);
    expect(posts.slice(2)).toEqual(["c7 PAUSED"]);
  });

  test("settings: the owner saves the Meta ids (act_ dropped) and the Monday switch; staff only read; keys show as set or missing", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    vi.stubEnv("CONSUMER_BRAND", "Permian Home Quotes");
    vi.stubEnv("ADS_RENDER_TOKEN", "ghp");
    const before = await staff.as.query(api.ads.settings, {});
    expect(before).toMatchObject({
      brand: "Permian Home Quotes",
      weeklyEnabled: false,
      hooksPerWeek: 2,
      liveTarget: 6,
      keys: { renderer: true, anthropic: false, apify: false },
      researchKeywords: [
        "cabinet painting",
        "interior painting",
        "exterior house painting",
        "house painter",
        "cabinet refinishing",
        "kitchen cabinet painters",
        "painters Midland TX",
        "painters Odessa TX",
        "exterior painting Midland",
      ],
      researchMarkets: ["Midland", "Odessa", "Permian Basin", "West Texas"],
      researchMinDays: 90,
      researchMonthly: false,
    });
    const data = {
      adAccountId: "act_123",
      pageId: "77",
      leadFormId: "",
      adsetId: "900",
      weeklyEnabled: true,
      hooksPerWeek: 9,
      liveTarget: 1,
      researchKeywords: ["cabinet painting", " cabinet painting", "", "deck staining"],
      researchMarkets: ["Midland"],
      researchMinDays: 7,
      researchMonthly: true,
    };
    await expect(staff.as.mutation(api.ads.saveSettings, data)).rejects.toThrow("Only Webb Leads admins");
    await owner.as.mutation(api.ads.saveSettings, data);
    expect(await staff.as.query(api.ads.settings, {})).toMatchObject({
      adAccountId: "123",
      pageId: "77",
      adsetId: "900",
      weeklyEnabled: true,
      hooksPerWeek: 4,
      liveTarget: 2,
      researchKeywords: ["cabinet painting", "deck staining"],
      researchMarkets: ["Midland"],
      researchMinDays: 30,
      researchMonthly: true,
    });
  });
});

type StubOpts = {
  /** Claude turns this many looks at an upload away for coming too fast (429), counting down. */
  busyLooks?: { n: number };
  /** Claude answers this scope's hook in words, with no plan; "cut off" stops mid-answer instead. */
  notJson?: { scope: string; cutOff?: boolean };
  /** Every ad carries a price. */
  scriptsFail?: boolean;
  /** The first answer for each hook breaks a rule; the retry is fine. */
  badFirst?: boolean;
  /** Claude passes on hooks whose prompt names this scope. */
  passOnScope?: string;
  /** What GitHub answers when asked to start the renderer (it says 204 when it will). */
  github?: number;
  /** Claude chooses this style instead of the light-up. */
  style?: "beforeAfter" | "reel";
  /** How Claude reads a "make an ad for…" line. */
  request?: unknown;
  pairs?: unknown;
  describe?: unknown;
};

/** Claude's read of a competitor ad, from what the prompt names. */
function tagReplyFor(prompt: string) {
  const junk = prompt.includes("Advertiser: Kids Art Studio");
  // Only the ad's own lines, not the instructions (which name every market and scope).
  const text = prompt
    .split("\n")
    .filter((l) => /^(Advertiser|Headline|Copy|Spoken):/.test(l))
    .join(" ")
    .toLowerCase();
  const scope = text.includes("cabinet") ? "cabinets" : text.includes("exterior") || text.includes("siding") ? "exterior" : "interior";
  return {
    painting: !junk,
    paintingType: scope === "cabinets" ? "Cabinets" : scope === "exterior" ? "Exterior" : "Interior",
    scope,
    hook: junk ? "Art classes" : `${scope} angle`,
    family: scope === "cabinets" ? "before_after" : "owner_story",
    offer: "Free quote",
    creative: "Owner to camera",
    area: text.includes("midland") ? "Midland, TX" : "",
    cta: "Get quote",
    adaptation: "Open with the owner and show the prep.",
    claims: ["$500 off this month", "10-year warranty"],
    opening: "owner",
    footage: ["owner_to_camera", "before_after"],
    quality: junk ? 10 : 48,
  };
}

const PLAYBOOK_REPLY = {
  text: "Most long-runners open with the owner on camera, then a before/after. Offers are a free quote or a colour consultation. Nobody in Midland runs a cabinets ad.",
  footagePrefs: ["before", "after", "crew", "nonsense"],
  angleFamilies: ["before_after", "owner_story", "bogus"],
  localCompetitors: [{ company: "Jesse McCandless Painting", angle: "owner story", daysRunning: 140 }],
  missingFootage: ["A clip of the owner talking to camera for 10 seconds"],
};

const DAY = 86_400;
const unix = (daysAgo: number) => Math.floor(Date.now() / 1000) - daysAgo * DAY;

/** The scrape as Meta's own JSON spells it (snake_case), for the cabinets keyword. */
/** What an inactive search returns in tests: nothing unless a test puts stopped ads here. */
let STOPPED_ITEMS: unknown[] = [];

const APIFY_CABINETS = [
  {
    ad_archive_id: "9001",
    page_id: "p1",
    page_name: "Jesse McCandless Painting",
    is_active: true,
    start_date: unix(140),
    collation_count: 3,
    publisher_platform: ["FACEBOOK", "INSTAGRAM"],
    snapshot: {
      body: { text: "Midland homeowners: your cabinets painted in a week, by a local crew. $500 off this month." },
      title: "Cabinets, painted",
      cta_text: "Get quote",
      link_url: "https://jmpainting.example/cabinets",
      page_like_count: 1200,
      images: [],
      videos: [{ video_hd_url: "https://video.example/9001.mp4", video_preview_image_url: "https://img.example/9001.jpg" }],
    },
  },
  {
    adArchiveID: "9002",
    pageID: "p2",
    pageName: "Lubbock Cabinet Co",
    isActive: true,
    startDate: unix(200),
    collationCount: 1,
    publisherPlatform: ["FACEBOOK"],
    snapshot: {
      body: { text: "Paint them, don't replace them. Lubbock's cabinet painters." },
      ctaText: "Learn more",
      linkUrl: "https://lcc.example",
      images: [{ original_image_url: "https://img.example/9002.jpg" }],
      videos: [],
    },
  },
  {
    ad_archive_id: "9003",
    page_name: "Too Young Painting",
    is_active: true,
    start_date: unix(10),
    snapshot: { body: { text: "Cabinets painted fast" } },
  },
  { page_name: "No Id Painting", is_active: true, start_date: unix(300), snapshot: { body: { text: "cabinets" } } },
];

/** The house keyword: one ad already seen, one that isn't painting at all. */
const APIFY_HOUSE = [
  APIFY_CABINETS[0],
  {
    ad_archive_id: "9004",
    page_id: "p4",
    page_name: "Kids Art Studio",
    is_active: true,
    start_date: unix(400),
    snapshot: { body: { text: "Painting classes for kids every Saturday" }, cta_text: "Sign up", images: [], videos: [] },
  },
];

/** What each idea writer offers: three of its own, one all four share, and one that promises a price. */
const WRITER_IDEAS: Record<string, Array<[line: string, opening: string, scope: string, from: number]>> = {
  "over the fence": [
    ["The garage full of furniture at breakfast, and the living room put back by supper.", "Where does the couch go?", "interior", 0],
    ["Blue tape pulled off window trim in one slow strip, close enough to see the edge.", "Watch this edge.", "interior", 0],
    ["Cabinet doors drying in rows off site while the family still cooks dinner.", "Your kitchen stays open.", "cabinets", 1],
  ],
  "cut short videos": [
    ["Sanding dust in three quick cuts, then one glossy drawer front held still.", "Dust first. Shine after.", "cabinets", 1],
    ["A sun-faded fence beside fresh siding, the screen split down the middle.", "Left side, right side.", "exterior", 0],
    ["Every step before a brush is lifted, counted on screen with a photo each.", "Step one isn't paint.", "general", 0],
  ],
  "doesn't call": [
    ["Three painters were phoned and none rang back; here one does, and it says who.", "Nobody called you back?", "general", 0],
    ["Drop cloths over hardwood and plastic over the piano before any lid opens.", "Strangers near your piano.", "interior", 2],
    ["How a painter gets checked before a homeowner ever hears the name.", "Who checked this painter?", "general", 0],
  ],
  "go the other way": [
    ["The ad admits most people put painting off for years, and says why that is fine.", "You've put this off. Good.", "general", 0],
    ["Choosing a painter compared with choosing a babysitter: you ask a neighbour.", "You wouldn't hire a babysitter blind.", "general", 0],
    ["The cheapest quote and the careful one, told apart by the prep photos alone.", "Spot the careful quote.", "process", 2],
  ],
};
const SHARED_IDEA = ["Paint the cabinets instead of replacing them and keep the kitchen that is there.", "Don't rip them out.", "cabinets", 1] as const;
const TASTE_NOTE = "Keeps plain openings about mess and trust. Kills anything that sounds clever.";

function ideasOf(prompt: string) {
  const own = Object.entries(WRITER_IDEAS).find(([mark]) => prompt.includes(mark))?.[1] ?? [];
  // Each idea names a competitor ad the brief listed (the second when it named none, or the last there is).
  const listed = prompt.split("\n").filter((l) => /^\d+\. .*Angle: /.test(l)).length;
  const row = ([line, opening, scope, from]: readonly [string, string, string, number]) => ({ line, opening, scope, from: Math.min(from || 2, listed), family: "objection", usual: 0.2 });
  return [row(SHARED_IDEA), ...own.map(row), { ...row(["A whole house painted for $999 this month only.", "Only $999.", "interior", 0]), usual: 0.9 }];
}

/** The pass that picks: the two ideas the tests follow first (a cabinets one and the exterior one), then the rest in order. */
function picksFor(prompt: string) {
  const numbered = prompt.split("\n").filter((l) => /^\d+\. /.test(l));
  const at = (text: string) => numbered.findIndex((l) => l.includes(text)) + 1;
  const first = [at("Cabinet doors drying"), at("sun-faded fence")];
  return [...first, ...numbered.map((_, i) => i + 1).filter((n) => !first.includes(n))].slice(0, IDEAS_SHOWN);
}

/** What each outside service answers during a weekly run. */
function stubServices(calls: Array<{ url: string; body?: string; auth?: string | null }>, opts: StubOpts = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : undefined;
      calls.push({ url, body, auth: new Headers(init?.headers).get("authorization") });
      if (url.includes("api.anthropic.com")) {
        const content = JSON.parse(body!).messages[0].content as Array<{ type: string; text?: string }>;
        const prompt = content.find((c) => c.type === "text")?.text ?? "";
        const retry = content.some((c) => c.text?.startsWith("Your last answer had these problems"));
        const offered = content.filter((c) => /^Photo \d+:$/.test(c.text ?? "")).length;
        let reply: unknown;
        if (opts.busyLooks && prompt.includes("It will be used in ads.") && opts.busyLooks.n-- > 0)
          return new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit" } }), { status: 429 });
        if (opts.describe && prompt.includes("It will be used in ads.")) reply = opts.describe;
        else if (prompt.includes("Which before and which after show the same spot")) reply = opts.pairs ?? { pairs: [{ before: 1, after: 2 }] };
        else if (prompt.includes("typed this request for a Facebook ad")) reply = opts.request ?? { trade: "painting", scope: null, town: "Odessa", idea: "We paint homes inside and out" };
        else if (prompt.includes(IDEA_MARK)) reply = { ideas: ideasOf(prompt) };
        else if (prompt.includes(PICK_MARK)) reply = { picks: picksFor(prompt) };
        else if (prompt.includes(TASTE_MARK)) reply = { note: TASTE_NOTE };
        else if (prompt.includes(TAG_MARK)) reply = tagReplyFor(prompt);
        else if (prompt.includes(PLAYBOOK_MARK)) reply = PLAYBOOK_REPLY;
        else if (opts.passOnScope && prompt.includes(`Scope: ${opts.passOnScope}.`)) reply = { fits: false, reason: `no ${opts.passOnScope} in these photos` };
        else if (opts.notJson && prompt.includes(`Scope: ${opts.notJson.scope}.`))
          return new Response(
            JSON.stringify(
              opts.notJson.cutOff
                ? { content: [{ type: "text", text: '{"fits":true,"lines":[{"photo":1,"voice":"These cab' }], stop_reason: "max_tokens" }
                : { content: [{ type: "text", text: "Looking at the photos,\nI'd open on the kitchen." }], stop_reason: "end_turn" },
            ),
          );
        else if (opts.scriptsFail) reply = motionPlanFor(offered, { primaryText: "Only $999 this week" });
        else if (prompt.includes("This one is a quick offer")) reply = quickPlanFor(offered, prompt.match(/"([A-Z][\w .]*?) homeowners, look at this\."/)?.[1]);
        else if (opts.badFirst && !retry) reply = motionPlanFor(offered, { lines: [] });
        else if (opts.style === "beforeAfter") reply = motionPlanFor(offered, { style: "beforeAfter", revealOn: "finish" });
        else if (opts.style === "reel") {
          const plan = motionPlanFor(offered);
          reply = { ...plan, style: "reel", lines: plan.lines.map((l, i) => (i === 0 ? { ...l, x: 60, y: 55 } : i === 1 ? { ...l, x: 50, y: 40, cut: [0, 50] } : l)) };
        }
        else reply = motionPlanFor(offered);
        // Following a competitor's script, the writer matches its length.
        const theirs = prompt.match(/\(theirs is (\d+)\)/);
        if (theirs && ((reply as { lines?: unknown[] }).lines ?? []).length > 0) reply = toLength(reply as { lines: Array<Record<string, unknown>> }, Number(theirs[1]));
        return new Response(JSON.stringify({ content: [{ type: "text", text: "Here it is: " + JSON.stringify(reply) }] }));
      }
      if (url.includes("api.apify.com")) {
        const { query, activeStatus } = JSON.parse(body!) as { query: string; activeStatus: string };
        if (activeStatus === "inactive") return new Response(JSON.stringify(query.includes("cabinet") ? STOPPED_ITEMS : []));
        return new Response(JSON.stringify(query.includes("cabinet") ? APIFY_CABINETS : APIFY_HOUSE));
      }
      if (url.includes("api.elevenlabs.io/v1/speech-to-text")) {
        return new Response(
          JSON.stringify({
            text: "Hey Midland, Jesse here. We paint it like it's our own house.",
            words: [
              { text: "Hey", start: 0, end: 0.4 },
              { text: "house.", start: 11.2, end: 11.9 },
            ],
          }),
        );
      }
      if (url.includes("api.elevenlabs.io")) {
        const text = JSON.parse(body!).text as string;
        const chars = [...text];
        return new Response(
          JSON.stringify({
            audio_base64: btoa("mp3"),
            alignment: {
              characters: chars,
              character_start_times_seconds: chars.map((_, i) => i * 0.06),
              character_end_times_seconds: chars.map((_, i) => i * 0.06 + 0.06),
            },
          }),
        );
      }
      if (url.includes("tracks.example"))
        return url.endsWith("missing.mp3") ? new Response("gone", { status: 404 }) : new Response(url.endsWith("tiny.mp3") ? "x" : "m".repeat(20_000), { status: 200 });
      if (url.includes("api.github.com")) return new Response(opts.github && opts.github >= 400 ? "Resource not accessible" : null, { status: opts.github ?? 204 });
      if (url.includes("/api/storage/")) return new Response(new Uint8Array([137, 80, 78, 71]));
      if (url.includes("graph.facebook.com")) {
        const path = new URL(url).pathname;
        return new Response(
          JSON.stringify({
            id: path.endsWith("/advideos") ? "vid1" : path.endsWith("/adcreatives") ? "cr1" : path.endsWith("/ads") ? "ad1" : "ok",
            success: true,
            ...(path.endsWith("/adimages") ? { images: { "still.png": { hash: "hash1" } } } : {}),
          }),
        );
      }
      return new Response("not stubbed " + url, { status: 500 });
    }),
  );
}

async function library(t: T, staff: Awaited<ReturnType<typeof signUp>>) {
  await staff.as.mutation(api.ads.seedHooks, {});
  // Two competitor ads on file: a cabinets one that has run longest, with its script, and an interior one.
  await t.run(async (ctx) => {
    const ad = (over: Record<string, unknown>) =>
      ctx.db.insert("adSwipes", {
        company: "",
        paintingType: "",
        hook: "",
        offer: "Free estimate",
        creative: "Owner to camera",
        area: "",
        cta: "Get quote",
        adaptation: "Explain the steps and the disruption level.",
        starred: false,
        source: "test",
        importedAt: new Date().toISOString(),
        ...over,
      } as never);
    await ad({
      company: "Rodgers Painting",
      paintingType: "Cabinets",
      scope: "cabinets",
      hook: "Process + minimal disruption",
      offer: "Claimed 2–3 days; off-site doors, on-site boxes",
      startedAt: new Date(Date.now() - 160 * 86_400_000).toISOString(),
      starred: true,
      transcript:
        "[00:00] We take the doors off site and spray the boxes at your home. [00:04] You're thinking about new cabinets but unsure of the process. [00:08] First we take your doors and drawers back to our shop for a sprayed finish. [00:13] Your boxes we do on site. [00:15] Click the link below for a free estimate.",
      durationSec: 31,
    });
    await ad({
      company: "Squeegee Squad",
      paintingType: "Interior",
      scope: "interior",
      hook: "Cost education",
      offer: "Free in-home estimate",
      startedAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      adCopy: "What does it cost to paint a house?",
    });
  });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", "before"), fileName: "before.jpg", tags: ["cabinets", "before"], pairKey: "k" });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", "after"), fileName: "after.jpg", tags: ["cabinets", "after"], pairKey: "k" });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", "prep"), fileName: "prep.jpg", tags: ["process"] });
}

/** Runs the scheduled functions strictly one after another: finish what's running, then fire the next timer. */
async function oneAtATime(t: T, limit = 500) {
  for (let i = 0; i < limit; i++) {
    await t.finishInProgressScheduledFunctions();
    if (vi.getTimerCount() === 0) return;
    vi.advanceTimersToNextTimer();
  }
  throw new Error("Scheduled functions kept going");
}

describe("a photo brought to life", () => {
  /** fal's queue: a request is in progress the first time it's asked about, then done; `fails` names a request whose result is refused. */
  function stubFal(calls: Array<{ url: string; method: string; auth: string | null; body?: any }>, opts: { fails?: string; strayStatus?: boolean } = {}) {
    const asked = new Map<string, number>();
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        calls.push({ url, method: init?.method ?? "GET", auth: headers.get("authorization"), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
        if (url === "https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video") {
          const id = `m${++n}`;
          return new Response(
            JSON.stringify({
              request_id: id,
              status_url: opts.strayStatus ? `https://elsewhere.example/${id}/status` : `https://queue.fal.run/fal-ai/kling-video/requests/${id}/status`,
              response_url: `https://queue.fal.run/fal-ai/kling-video/requests/${id}`,
            }),
          );
        }
        const status = /^https:\/\/queue\.fal\.run\/fal-ai\/kling-video\/requests\/(m\d+)\/status$/.exec(url);
        if (status) {
          const times = (asked.get(status[1]) ?? 0) + 1;
          asked.set(status[1], times);
          return new Response(JSON.stringify({ status: times === 1 ? "IN_PROGRESS" : "COMPLETED", request_id: status[1] }));
        }
        const result = /^https:\/\/queue\.fal\.run\/fal-ai\/kling-video\/requests\/(m\d+)$/.exec(url);
        if (result)
          return result[1] === opts.fails
            ? new Response(JSON.stringify({ detail: "The image was refused" }), { status: 422 })
            : new Response(JSON.stringify({ video: { url: `https://v3.fal.media/files/${result[1]}.mp4`, content_type: "video/mp4" } }));
        if (url.startsWith("https://v3.fal.media/")) return new Response(new Blob(["clip"], { type: "video/mp4" }));
        return new Response("not stubbed " + url, { status: 500 });
      }),
    );
  }

  async function photos(t: T) {
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    const add = (fileName: string, tags: string[], extra: Record<string, unknown> = {}, type = "image/jpeg") =>
      t.run(async (ctx) => ctx.storage.store(new Blob([fileName], { type }))).then((storageId) => staff.as.mutation(api.ads.addAsset, { storageId, fileName, tags, ...extra }));
    await add("before.jpg", ["cabinets", "before"], { pairKey: "k" });
    await add("after.jpg", ["cabinets", "after"], { pairKey: "k" });
    await add("den.heic", ["interior"], { posterStorageId: await store(t, "image/jpeg", "still") }, "image/heic");
    await add("porch.jpg", ["exterior"]);
    // Not sendable: a clip, and a HEIC with no still for the model to read.
    await add("roller.mp4", ["process"], {}, "video/mp4");
    await add("raw.heic", ["interior"], {}, "image/heic");
    return staff;
  }

  const run = async (t: T, args: { limit?: number; dryRun?: boolean }) => {
    vi.useFakeTimers();
    const out = await t.mutation(internal.ads.motionTest, args);
    await oneAtATime(t);
    vi.useRealTimers();
    return out;
  };

  test("the test picks a photo of each kind and says what it would cost before it spends; its clip is kept beside it, a refusal says why and can be tried again, and a photo with a clip is never resent", async () => {
    const t = setup();
    const staff = await photos(t);
    const calls: Parameters<typeof stubFal>[0] = [];
    stubFal(calls, { fails: "m3" });

    // A dry run, the default: the finished cabinets (not the before), an interior, an exterior; ten seconds each at about 11¢ a second.
    const dry = await run(t, {});
    expect(dry).toMatchObject({ dryRun: true, secondsEach: 5, estimateCents: 168 });
    expect(dry.photos.map((p) => p.fileName)).toEqual(["after.jpg", "den.heic", "porch.jpg"]);
    expect(calls).toEqual([]);
    expect(await t.query(internal.ads.motionResults, {})).toEqual([]);
    // No key: nothing is sent and nothing is marked.
    await expect(t.mutation(internal.ads.motionTest, { dryRun: false })).rejects.toThrow(/FAL_KEY/);
    expect(await t.query(internal.ads.motionResults, {})).toEqual([]);

    vi.stubEnv("FAL_KEY", "fk");
    await run(t, { dryRun: false });
    // Each photo is handed over with the keep-it-as-it-is instruction, ten seconds, no sound; the HEIC goes as its JPEG still.
    const sent = calls.filter((c) => c.method === "POST");
    expect(sent).toHaveLength(3);
    expect(sent.every((c) => c.auth === "Key fk")).toBe(true);
    expect(sent[0].body).toMatchObject({ duration: "5", generate_audio: false, start_image_url: expect.stringContaining("/api/storage/") });
    expect(sent[0].body.prompt).toContain("Keep everything exactly as in the photo");
    expect(sent[0].body.prompt).toContain("No people");
    // The clip itself is downloaded without the key.
    const downloads = calls.filter((c) => c.url.startsWith("https://v3.fal.media/"));
    expect(downloads.map((c) => c.auth)).toEqual([null, null]);

    const results = await t.query(internal.ads.motionResults, {});
    const byName = Object.fromEntries(results.map((r) => [r.fileName, r]));
    expect(byName["after.jpg"]).toMatchObject({ status: "ready", seconds: 5, clip: expect.stringContaining("/api/storage/"), photo: expect.stringContaining("/api/storage/") });
    expect(byName["den.heic"]).toMatchObject({ status: "ready" });
    expect(byName["porch.jpg"]).toMatchObject({ status: "failed", error: expect.stringContaining("422") });
    expect(byName["porch.jpg"].clip).toBeUndefined();
    expect(byName["porch.jpg"].error).toContain("The image was refused");

    // A second run never resends a photo that has its clip: the before is left, and the one that was refused gets another try.
    const again = await run(t, { dryRun: false });
    expect(again.photos.map((p) => p.fileName)).toEqual(["before.jpg", "porch.jpg"]);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(5);
    expect((await t.query(internal.ads.motionResults, {})).map((r) => [r.fileName, r.status]).sort()).toEqual([
      ["after.jpg", "ready"],
      ["before.jpg", "ready"],
      ["den.heic", "ready"],
      ["porch.jpg", "ready"],
    ]);
    expect((await run(t, { limit: 99 })).photos).toEqual([]);

    // Removing the photo removes its clip.
    const after = (await staff.as.query(api.ads.listAssets, {})).find((a) => a.fileName === "after.jpg")!;
    const clipId = await t.run(async (ctx) => (await ctx.db.get(after.id as Id<"adAssets">))!.motion!.storageId!);
    await staff.as.mutation(api.ads.removeAsset, { id: after.id as Id<"adAssets"> });
    expect(await t.run(async (ctx) => ctx.db.system.get(clipId))).toBeNull();
  });

  test("the key is never sent anywhere but fal's queue, and at most ten photos go in one run", async () => {
    const t = setup();
    await photos(t);
    vi.stubEnv("FAL_KEY", "fk");
    const calls: Parameters<typeof stubFal>[0] = [];
    stubFal(calls, { strayStatus: true });
    expect((await run(t, { limit: 99 })).photos).toHaveLength(4);
    await run(t, { limit: 1, dryRun: false });
    const [one] = await t.query(internal.ads.motionResults, {});
    expect(one).toMatchObject({ fileName: "after.jpg", status: "failed", error: "fal gave an address that isn't its queue" });
    expect(calls.some((c) => c.url.includes("elsewhere.example"))).toBe(false);
  });
});

describe("the weekly run", () => {
  type Call = { url: string; body?: string; auth?: string | null };

  /** A fresh backend with the library in, Claude and the voice set; one ad idea a week unless told otherwise. */
  async function ready(opts: { hooks?: number; meta?: boolean; token?: boolean; quick?: boolean } = {}) {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await library(t, owner);
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("ELEVENLABS_API_KEY", "e");
    vi.stubEnv("CONSUMER_BRAND", "Permian Home Quotes");
    if (opts.token) vi.stubEnv("ADS_RENDER_TOKEN", "ghs");
    if (opts.meta) vi.stubEnv("META_ACCESS_TOKEN", "m");
    await owner.as.mutation(api.ads.saveSettings, {
      ...(opts.meta ? { adAccountId: "123", pageId: "77", leadFormId: "f1", adsetId: "900" } : {}),
      voiceId: "ven",
      weeklyEnabled: false,
      hooksPerWeek: opts.hooks ?? 1,
      liveTarget: 6,
      // The weekly quick offer is tested on its own; elsewhere a week is just its ideas.
      quickOffer: opts.quick ?? false,
    });
    const calls: Call[] = [];
    // One scheduled function at a time: the voice step saves a file, and convex-test's storage can't take
    // two actions saving at once ("Write outside of transaction"), which the real backend can.
    // finishAllScheduledFunctions keeps advancing the clock while a function is still running, so the
    // next one could start mid-save; here each runs to the end before the clock moves.
    const settle = async <R>(step: () => Promise<R>): Promise<R> => {
      vi.useFakeTimers();
      const out = await step();
      await oneAtATime(t);
      vi.useRealTimers();
      return out;
    };
    const latest = async () => (await owner.as.query(api.ads.batches, {}))[0];
    const draft = async () => {
      await settle(() => owner.as.mutation(api.ads.draftNow, {}));
      return await latest();
    };
    const claim = () => settle(() => t.mutation(internal.ads.claimRenders, {}));
    const handIn = async (job: { id: Id<"adCreatives">; name: string }) => {
      const storageId = await store(t, "video/mp4", `mp4 ${job.name}`);
      const { kept } = await settle(() => t.mutation(internal.ads.renderDone, { id: job.id, storageId }));
      return { kept, storageId };
    };
    /** The renderer's part: take what's waiting and hand each one a file, or the reason it couldn't be drawn. */
    const draw = async (fail?: string) => {
      const jobs = await claim();
      for (const job of jobs) {
        if (fail) await settle(() => t.mutation(internal.ads.renderFailed, { id: job.id, error: fail }));
        else await handIn(job);
      }
      return jobs;
    };
    return { t, owner, calls, settle, latest, draft, claim, handIn, draw };
  }
  const states = (batch: { creatives: Array<{ ratio: string; status: string; error?: string }> }) =>
    batch.creatives.map((c) => `${c.ratio} ${c.status}${c.error ? `: ${c.error}` : ""}`);
  const to = (calls: Call[], host: string) => calls.filter((c) => c.url.includes(host));

  test("two ideas are written and voiced in two sizes and wait to be drawn; the renderer takes them once, hands in the files, and each is created PAUSED in Meta", async () => {
    const { t, owner, calls, settle, latest, draft, claim, handIn } = await ready({ hooks: 2, meta: true, token: true });
    stubServices(calls);
    let batch = await draft();

    // Written and voiced: that is as far as the app itself goes.
    expect(states(batch)).toEqual(["9x16 voiced", "4x5 voiced", "9x16 voiced", "4x5 voiced"]);
    expect(batch.status).toBe("drafting");
    expect(new Set(batch.creatives.map((c) => c.hook!.family)).size).toBe(2);
    const cabinets = batch.creatives.find((c) => c.hook!.scope === "cabinets" && c.ratio === "9x16")!;
    const other = batch.creatives.find((c) => c.hook!.scope !== "cabinets" && c.ratio === "9x16")!;
    expect(cabinets.name).toMatch(/^WL_[a-z0-9]{6}_916_\d{8}$/);
    expect(cabinets.style).toEqual({ id: "lightUp", label: "Light-up" });
    expect(cabinets.script.headline).toBe(GOOD.headline);
    // Claude once per idea, the voice once per idea (shared by the two sizes), and GitHub asked to draw after each voice.
    expect(to(calls, "anthropic").length).toBe(2);
    expect(to(calls, "elevenlabs").length).toBe(2);
    expect(to(calls, "elevenlabs")[0].url).toContain("/text-to-speech/ven/with-timestamps");
    // Read on the newer, livelier model, with delivery settings that keep it from sounding flat.
    expect(JSON.parse(to(calls, "elevenlabs")[0].body!)).toMatchObject({ model_id: "eleven_v4", voice_settings: { stability: 0.35, style: 0.3 } });
    const starts = to(calls, "api.github.com");
    expect(starts.length).toBe(2);
    expect(starts[0]).toMatchObject({
      url: "https://api.github.com/repos/Cymoe/Estimate-Wave-App/actions/workflows/ads-render.yml/dispatches",
      auth: "Bearer ghs",
      body: JSON.stringify({ ref: "fieldquote-convex" }),
    });
    // Claude saw the photos: the cabinets ask carries the pair, each after its "Photo N" label, and the swipe file as tone only.
    const asks = to(calls, "anthropic").map((c) => JSON.parse(c.body!).messages[0].content as Array<any>);
    const cabinetsAsk = asks.find((a) => a[0].text.includes("Scope: cabinets."))!;
    expect(cabinetsAsk[0].text).toContain("Permian Home Quotes");
    expect(cabinetsAsk[0].text).toContain("never as a homeowner or customer");
    // Each ad is built around the competitor ad its idea came from: the longest-running one was written first.
    expect(cabinets.hook).toMatchObject({ textEn: "Process + minimal disruption", basedOn: { company: "Rodgers Painting", daysRunning: 160, offer: "Claimed 2–3 days; off-site doors, on-site boxes" } });
    // What their ad said goes with it, without the transcript's time stamps, to read beside ours.
    expect(cabinets.hook!.basedOn).toMatchObject({ angle: "Process + minimal disruption", spoken: expect.stringMatching(/^We take the doors off site and spray the boxes at your home\. You're thinking/) });
    expect(other.hook).toMatchObject({ textEn: "Cost education", basedOn: { company: "Squeegee Squad", daysRunning: 90 } });
    expect(asks.indexOf(cabinetsAsk)).toBe(0);
    expect(cabinetsAsk[0].text).toContain("Build this ad around a competitor's ad that has been running for 160 days.");
    expect(cabinetsAsk[0].text).toContain("- Its angle: Process + minimal disruption");
    expect(cabinetsAsk[0].text).toContain("- Its words (Rodgers Painting) · spoken: We take the doors off site");
    // The other ad on file is there for tone only, and the one it is built around isn't repeated as an example.
    expect(cabinetsAsk[0].text).toContain("for tone and shape only");
    expect(cabinetsAsk[0].text).toContain("Example 1 (Squeegee Squad;");
    expect(cabinetsAsk[0].text).not.toContain("Example 2");
    expect(cabinetsAsk.slice(1).map((b) => (b.type === "text" ? b.text : b.source.type))).toEqual(["Photo 1:", "url", "Photo 2:", "url"]);
    // The other idea had nothing in its scope, so it fell back to the prep photo, and Claude is told.
    const otherAsk = asks.find((a) => a !== cabinetsAsk)!;
    expect(otherAsk[0].text).toContain("None of these photos is tagged");
    expect(otherAsk[0].text).toContain("- Its offer: Free in-home estimate");
    expect(otherAsk[0].text).toMatch(/Example 1 \(Rodgers Painting; [^)]*\) · spoken \(\d+s\)/);
    expect(otherAsk.slice(1).map((b) => (b.type === "text" ? b.text : b.source.type))).toEqual(["Photo 1:", "url"]);
    // Each line is a shot on its photo, timed from the voice's own character times.
    expect(cabinets.shots.map((x) => [x.fileName, x.onScreen])).toEqual([
      ["before.jpg", ""],
      ["before.jpg", "No tear-out"],
      ["after.jpg", "Prepped first"],
      ["after.jpg", ""],
    ]);
    expect(cabinets.shots[0].start).toBe(0);
    expect(cabinets.shots[1].start).toBeGreaterThan(cabinets.shots[0].end! - 0.1);
    expect(other.shots.map((x) => x.fileName)).toEqual(["prep.jpg", "prep.jpg", "prep.jpg", "prep.jpg"]);
    // Each idea and each photo was used once, so next week fresher ones go first.
    expect((await owner.as.query(api.ads.listHooks, {})).filter((h) => h.uses === 1).length).toBe(2);
    expect((await owner.as.query(api.ads.listAssets, {})).map((a) => a.uses)).toEqual([1, 1, 1]);

    // The renderer asks for work: all four, each with everything it is drawn from.
    const jobs = await claim();
    expect(jobs.map((j) => j.name).sort()).toEqual(batch.creatives.map((c) => c.name).sort());
    const job = jobs.find((j) => j.name === cabinets.name)!;
    expect(job.props).toMatchObject({
      ratio: "9x16",
      style: { kind: "lightUp" },
      headline: "Paint them, don't replace",
      brand: { name: "Permian Home Quotes", primaryColor: "#336699" },
      audio: expect.stringContaining("/api/storage/"),
    });
    expect(job.props.audioSec).toBeGreaterThan(8);
    expect(job.props.lines.map((l: { label?: string }) => l.label)).toEqual([undefined, "No tear-out", "Prepped first", undefined]);
    // The captions follow the voice: every word of a line has its own time.
    const firstLine = job.props.lines[0] as { voice: string; words?: Array<{ text: string; start: number; end: number }> };
    expect(firstLine.words!.map((w) => w.text).join(" ")).toBe(firstLine.voice);
    expect(firstLine.words![0]).toMatchObject({ text: "Thinking", start: 0 });
    expect(firstLine.words![0].end).toBeCloseTo(0.48, 2);
    // A photo for each line: the before for two lines, then the after.
    const srcs = job.props.photos.map((p: { src: string }) => p.src);
    expect([srcs[0] === srcs[1], srcs[2] === srcs[3], srcs[0] === srcs[2]]).toEqual([true, true, false]);
    expect(srcs[0]).toContain("/api/storage/");
    // They are being drawn now, and a second renderer asking finds nothing.
    expect(states(await latest())).toEqual(["9x16 rendering", "4x5 rendering", "9x16 rendering", "4x5 rendering"]);
    expect(await claim()).toEqual([]);

    // The files come back one by one; the batch is ready only when the last is in.
    for (const j of jobs.slice(0, 3)) expect((await handIn(j)).kept).toBe(true);
    expect((await latest()).status).toBe("drafting");
    await handIn(jobs[3]);
    batch = await latest();
    expect(states(batch)).toEqual(["9x16 paused", "4x5 paused", "9x16 paused", "4x5 paused"]);
    expect(batch).toMatchObject({ status: "ready", summary: "4 paused in Meta" });
    expect(batch.creatives.every((c) => c.videoUrl && c.meta?.adId === "ad1" && c.meta?.adsetId === "900")).toBe(true);
    const ads = calls.filter((c) => c.url.endsWith("/ads"));
    expect(ads.length).toBe(4);
    expect(new URLSearchParams(ads[0].body).get("status")).toBe("PAUSED");
    const story = JSON.parse(new URLSearchParams(calls.find((c) => c.url.endsWith("/adcreatives"))!.body).get("object_story_spec")!);
    expect(story.video_data.call_to_action).toEqual({ type: "GET_QUOTE", value: { lead_gen_form_id: "f1" } });

    // From outside the app: each ad with a link to its file and to what it was drawn from, newest first.
    const recent = await t.query(internal.ads.recentCreatives, { limit: 2 });
    expect(recent).toHaveLength(2);
    expect(recent[0]).toMatchObject({ style: "lightUp", ratio: expect.stringMatching(/^(9x16|4x5)$/), file: expect.stringContaining("/api/storage/") });
    expect(recent[0].shots).toBe(4);

    // Approve one: live here, ACTIVE in Meta.
    const tall = batch.creatives.find((c) => c.id === cabinets.id)!;
    await settle(() => owner.as.mutation(api.ads.activate, { id: tall.id }));
    expect(new URLSearchParams(calls[calls.length - 1].body).get("status")).toBe("ACTIVE");
    expect(calls[calls.length - 1].url).toContain("/ad1");
    // Live lists everything in Meta: the one approved and the three still paused.
    const live = await owner.as.query(api.ads.live, {});
    expect(live.length).toBe(4);
    expect(live.find((r) => r.id === tall.id)).toMatchObject({ status: "live", intake: { leads: 0, confirmed: 0, sold: 0, revenueCents: 0 } });
    expect(live.filter((r) => r.status === "paused").length).toBe(3);
    // A family that is live is skipped by the next pick.
    const plan = await t.query(internal.ads.plan, { hooksPerWeek: 4 });
    expect(plan.hooks.some((h) => h.family === tall.hook!.family)).toBe(false);
  });

  test("a new ad is a reel: its photos say where to move in on, and the track that is switched on plays under it", async () => {
    const { t, calls, draft, claim } = await ready();
    stubServices(calls, { style: "reel" });
    // Two tracks filed; the second is made the only one in use.
    await t.mutation(internal.ads.addMusic, { name: "An earlier track", storageId: await store(t, "audio/mpeg", "old music") });
    // The chosen track is fetched from where it is published and kept in storage, with where to start it and its beats.
    await expect(t.action(internal.ads.fetchMusic, { url: "https://tracks.example/missing.mp3", name: "x" })).rejects.toThrow("couldn't be fetched (404)");
    await expect(t.action(internal.ads.fetchMusic, { url: "https://tracks.example/tiny.mp3", name: "x" })).rejects.toThrow("doesn't look like a music track");
    await t.action(internal.ads.fetchMusic, { url: "https://tracks.example/music-1.mp3", name: "Music 1", from: 12, beats: [0.49, 1.03], only: true });
    const tracks = await t.run((ctx) => ctx.db.query("adMusic").collect());
    expect(tracks.map((m) => [m.name, m.active])).toEqual([
      ["An earlier track", false],
      ["Music 1", true],
    ]);
    const batch = await draft();
    expect(batch.creatives[0].style).toEqual({ id: "reel", label: "Story" });
    const jobs = await claim();
    expect(jobs.length).toBe(2);
    const props = jobs[0].props as { style: unknown; photos: Array<{ focus?: unknown; crop?: unknown }>; sound?: { music?: string; musicFrom?: number; beats?: number[]; move?: string } };
    expect(props.style).toEqual({ kind: "reel" });
    expect(props.photos[0]).toMatchObject({ focus: [{ x: 60, y: 55 }] });
    expect(props.photos[0].crop).toBeUndefined();
    expect(props.photos[1]).toMatchObject({ focus: [{ x: 50, y: 40 }], crop: { from: 0, to: 50 } });
    expect(props.sound).toMatchObject({ music: expect.stringContaining("/api/storage/"), musicFrom: 12, beats: [0.49, 1.03], move: "sound/whip.wav" });
    expect(props.sound!.music).toBe(await t.run((ctx) => ctx.storage.getUrl(tracks[1].storageId)));
  });

  test("pulling the unpublished ads rejects every one that hasn't gone live, and leaves alone one already created in Meta", async () => {
    const { t, calls, draft, latest, draw } = await ready({ meta: true });
    stubServices(calls);
    await draft();
    // Both sizes are drawn and created paused in Meta: those are a person's to retire.
    await draw();
    expect(states(await latest())).toEqual(["9x16 paused", "4x5 paused"]);
    expect(await t.mutation(internal.ads.pullUnpublished, {})).toMatchObject({ pulled: [], leftInMeta: [expect.stringMatching(/^WL_/), expect.stringMatching(/^WL_/)] });
    // A second idea, written and voiced but never drawn, is pulled.
    await draft();
    const waiting = (await latest()).creatives.map((c) => c.name);
    // Named, only those are pulled; unnamed, every one still waiting.
    expect((await t.mutation(internal.ads.pullUnpublished, { names: ["no such ad"] })).pulled).toEqual([]);
    expect((await t.mutation(internal.ads.pullUnpublished, {})).pulled.sort()).toEqual([...waiting].sort());
    expect(states(await latest())).toEqual(["9x16 rejected", "4x5 rejected"]);
  });

  test("with no token GitHub is never asked and the ads wait; without a Meta account the finished videos wait here, watchable, and can't be approved", async () => {
    const { t, owner, calls, draft, draw, latest } = await ready();
    stubServices(calls);
    expect(states(await draft())).toEqual(["9x16 voiced", "4x5 voiced"]);
    expect(await t.action(internal.ads.startRenders, {})).toEqual({ started: false, why: "no ADS_RENDER_TOKEN" });
    expect(to(calls, "api.github.com")).toEqual([]);
    // Someone starts the renderer by hand.
    expect((await draw()).length).toBe(2);
    const batch = await latest();
    expect(batch).toMatchObject({ status: "ready", summary: "0 paused in Meta · 2 rendered but not in Meta" });
    expect(batch.creatives.every((c) => c.status === "rendered" && c.videoUrl && c.error?.includes("Meta isn't set up"))).toBe(true);
    await expect(owner.as.mutation(api.ads.activate, { id: batch.creatives[0].id })).rejects.toThrow("isn't in Meta yet");
    expect(to(calls, "graph.facebook.com")).toEqual([]);
  });

  test("GitHub refusing to start the renderer leaves the ads waiting and says why", async () => {
    const { t, calls, draft } = await ready({ token: true });
    stubServices(calls, { github: 403 });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(states(await draft())).toEqual(["9x16 voiced", "4x5 voiced"]);
    expect(await t.action(internal.ads.startRenders, {})).toEqual({ started: false, why: "GitHub: 403 Resource not accessible" });
    quiet.mockRestore();
  });

  test("a before/after is drawn from the pair: the before, its after, and when the voice turns to it", async () => {
    const { calls, draft, claim } = await ready();
    stubServices(calls, { style: "beforeAfter" });
    const batch = await draft();
    expect(batch.creatives[0].style).toEqual({ id: "beforeAfter", label: "Before / after" });
    const [job] = await claim();
    expect(job.props.style).toMatchObject({ kind: "beforeAfter", crossOn: "finish" });
    // The after comes in where the third line starts.
    expect((job.props.style as { crossAt: number }).crossAt).toBe(batch.creatives[0].shots[2].start);
    expect(job.props.photos.length).toBe(2);
    expect(job.props.photos[0].src).not.toBe(job.props.photos[1].src);
    // No ticked labels on a before/after.
    expect(job.props.lines.every((l: { label?: string }) => l.label === undefined)).toBe(true);
  });

  test("an ad made for one job's photo is written on the longest-running competitor ad for that kind of job, and offered that photo first", async () => {
    const { t, calls, settle, latest } = await ready();
    stubServices(calls, { style: "reel" });
    const prep = (await t.run(async (ctx) => (await ctx.db.query("adAssets").collect()).find((a) => a.fileName === "prep.jpg")))!;
    const made = await settle(() => t.mutation(internal.ads.makeFromPhoto, { assetId: prep._id, line: "The prep before the paint", scope: "cabinets" }));
    expect(made).toMatchObject({ scope: "cabinets", builtOn: "Rodgers Painting" });
    const ask = to(calls, "anthropic")
      .map((c) => JSON.parse(c.body!).messages[0].content as Array<{ type: string; text?: string; source?: { url: string } }>)
      .find((content) => content[0].text!.includes("You write one short animated ad"))!;
    const firstPhoto = ask[ask.findIndex((c) => c.text === "Photo 1:") + 1];
    const prepUrl = await t.run(async (ctx) => await ctx.storage.getUrl(prep.storageId));
    expect(firstPhoto.source!.url).toBe(prepUrl);
    // That job only: no other job's photos to pass for it.
    expect(ask.some((c) => c.text === "Photo 2:")).toBe(false);
    expect(ask[0].text).toContain("Build this ad around a competitor's ad that has been running for 160 days.");
    expect((await latest()).creatives.length).toBeGreaterThan(0);
  });

  describe("make an ad for…", () => {
    const tokenOf = (link: string) => link.split("/ads/")[1];

    test("one line becomes a story, a lesson and a quick offer for the town it names, each on its own competitor ad; the private page follows them to the files", async () => {
      const { t, owner, calls, settle, draw } = await ready({ token: true });
      stubServices(calls);
      const { link } = await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "  painting   in Odessa " }));
      expect(link).toMatch(/\/ads\/[A-Za-z0-9_-]{30,}$/);
      // Claude read the line, with the trades and their kinds of job to choose from.
      const read = to(calls, "anthropic").map((c) => JSON.parse(c.body!).messages[0].content[0].text as string)[0];
      expect(read).toContain('"painting in Odessa"');
      expect(read).toContain("- painting (Painting): interior (Interior), exterior (Exterior), cabinets (Cabinets)");
      expect(read).toContain("outdoor-construction (Hardscaping)");

      let view = (await t.query(api.ads.requestView, { token: tokenOf(link) }))!;
      expect(view).toMatchObject({ ask: "painting in Odessa", idea: "We paint homes inside and out", town: "Odessa", trade: "Painting", stage: "drawing" });
      // Three versions of the same offer, in both sizes, waiting to be drawn: the story and the lesson each built on a
      // different competitor ad, the quick offer on the story's. (The stand-in writer draws the lesson as a light-up.)
      expect(view.ads.map((a) => `${a.angle === "Quick offer" ? "Quick offer" : a.builtOn!.company} ${a.ratio}`).sort()).toEqual(
        ["Quick offer 4x5", "Quick offer 9x16", "Rodgers Painting 4x5", "Rodgers Painting 9x16", "Squeegee Squad 4x5", "Squeegee Squad 9x16"],
      );
      expect(view.ads.every((a) => a.status === "voiced" && a.file === null)).toBe(true);
      const story = view.ads.find((a) => a.builtOn?.company === "Rodgers Painting" && a.angle !== "Quick offer")!;
      expect(story.builtOn).toMatchObject({ company: "Rodgers Painting", daysRunning: 160 });
      expect(view.ads.find((a) => a.angle === "Quick offer")!.builtOn!.company).toBe("Rodgers Painting");
      // The lesson is asked for as a checklist.
      const lessonAsk = to(calls, "anthropic").map((c) => JSON.parse(c.body!).messages[0].content[0].text as string).find((x) => x.includes("On screen: a short checklist"))!;
      expect(lessonAsk).toContain("Concept family: Cost education");
      // The quick offer speaks to the town the line named, not the first one in Settings.
      const asks = to(calls, "anthropic").map((c) => JSON.parse(c.body!).messages[0].content[0].text as string);
      expect(asks.find((a) => a.includes("This one is a quick offer"))).toContain('"Odessa homeowners, look at this."');
      // The ideas are off, so the weekly run never makes them again; the batch is the request's.
      const hooks = await t.run(async (ctx) => (await ctx.db.query("adHooks").collect()).filter((h) => h.textEn === "We paint homes inside and out"));
      expect(hooks.map((h) => [h.family, h.active])).toEqual([["before_after", false], ["education", false]]);
      expect(await t.query(internal.ads.waitingCount, {})).toBe(6);

      await draw();
      view = (await t.query(api.ads.requestView, { token: tokenOf(link) }))!;
      expect(view.stage).toBe("ready");
      expect(view.ads.every((a) => typeof a.file === "string")).toBe(true);
      expect(story.lines.length).toBeGreaterThan(0);
      expect(await t.query(internal.ads.waitingCount, {})).toBe(0);
      // Ops → Ads lists it with its link.
      expect((await owner.as.query(api.ads.recentRequests, {}))[0]).toMatchObject({ ask: "painting in Odessa", stage: "ready", link });
      // The link is on the backend's own address, which needs no sign-in, and serves the page and its data itself.
      const path = new URL(link).pathname;
      const page = await t.fetch(path, { method: "GET" });
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      const html = await page.text();
      expect(html).toContain(JSON.stringify(tokenOf(link)));
      expect(html).toContain("Recording the voice");
      expect(html).not.toContain("<script src");
      const data = await t.fetch(`${path}.json`, { method: "GET" });
      expect(await data.json()).toEqual(JSON.parse(JSON.stringify(await t.query(api.ads.requestView, { token: tokenOf(link) }))));
      expect((await t.fetch(`/ads/${"x".repeat(32)}`, { method: "GET" })).status).toBe(404);
      expect((await t.fetch(`/ads/${"x".repeat(32)}.json`, { method: "GET" })).status).toBe(404);
      expect((await t.fetch("/ads/<script>", { method: "GET" })).status).toBe(404);
    });

    test("with stills on, the quick offer's still is named after its own video, so no two ads share a name", async () => {
      const { t, owner, calls, settle } = await ready();
      stubServices(calls, { style: "reel", request: { trade: "painting", scope: "cabinets", town: "Odessa", idea: "Paint the cabinets" } });
      await t.mutation(internal.ads.setStills, { on: true });
      await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "cabinets in Odessa" }));
      const names = await t.run(async (ctx) => (await ctx.db.query("adCreatives").collect()).map((c) => c.name));
      expect(new Set(names).size).toBe(names.length);
      const stills = names.filter((n) => n.endsWith("_still"));
      expect(stills.length).toBeGreaterThan(0);
      expect(stills.every((n) => names.includes(n.replace(/_still$/, "")))).toBe(true);
    });

    /** A job of three cabinet photos, filed together: a before, the work, the finish. */
    // Filed on the test's clock, so the pairing it asks for runs here and not, 20 seconds on, in a later test.
    const cabinetJob = async (t: T, owner: Awaited<ReturnType<typeof signUp>>, settle: <R>(step: () => Promise<R>) => Promise<R>) =>
      await settle(async () => {
        const jobId = await owner.as.mutation(api.ads.addJob, { name: "  Smith   kitchen on Elm " });
        const ids: string[] = [];
        for (const [name, tags] of [["job-before.jpg", ["cabinets", "before"]], ["job-work.jpg", ["cabinets", "process"]], ["job-after.jpg", ["cabinets", "after"]]] as const)
          ids.push(await owner.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", name), fileName: name, tags: [...tags], jobId }));
        return { jobId, ids };
      });
    /** Which library photos each kind of ad shows. */
    const shownBy = async (t: T) =>
      await t.run(async (ctx) => {
        const out: Record<string, string[]> = {};
        for (const c of await ctx.db.query("adCreatives").collect()) {
          // The stand-in writer draws every ad as a light-up, so the kind is read from the idea's family.
          const kind = c.design?.quick ? "quick" : (await ctx.db.get(c.hookId))?.family === "education" ? "lesson" : "story";
          const ids = [...(c.script.shots ?? []).map((x) => x.assetId), ...(c.design?.frames ?? []).flatMap((f) => f.more ?? [])];
          out[kind] = [...new Set([...(out[kind] ?? []), ...ids.map(String)])];
        }
        return out;
      });

    test("a story is told from one job's photos when a job fits, before to finish; the quick offer is on the same job", async () => {
      const { t, owner, calls, settle } = await ready();
      stubServices(calls, { request: { trade: "painting", scope: "cabinets", town: "Odessa", idea: "Paint the cabinets" } });
      const { ids } = await cabinetJob(t, owner, settle);
      await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "cabinets in Odessa" }));
      const shown = await shownBy(t);
      expect(shown.story.length).toBeGreaterThan(0);
      expect([...shown.story].every((id) => ids.includes(id))).toBe(true);
      expect([...shown.quick].every((id) => ids.includes(id))).toBe(true);
      // The writer was offered the job's photos in the story's order: the before first, the finish last.
      const storyAsk = to(calls, "anthropic").map((c) => JSON.parse(c.body!).messages[0].content as Array<{ type: string; text?: string; source?: { url: string } }>)
        .find((x) => x[0].text?.includes("Concept family") && !x[0].text.includes("On screen: a short checklist") && !x[0].text.includes("This one is a quick offer"))!;
      expect(storyAsk.filter((c) => c.type === "image").length).toBe(3);
      // The job's name says where it was: it never reaches the writer.
      expect(JSON.stringify(to(calls, "anthropic").map((c) => c.body).filter((b) => !b!.includes("typed this request")))).not.toContain("Smith");
    });

    test("with no job of three photos, a story is picked across the library as before", async () => {
      const { t, owner, calls, settle } = await ready();
      stubServices(calls, { request: { trade: "painting", scope: "cabinets", town: "Odessa", idea: "Paint the cabinets" } });
      const lone = await settle(async () => {
        const jobId = await owner.as.mutation(api.ads.addJob, { name: "Two photos only" });
        return await owner.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", "lone"), fileName: "lone.jpg", tags: ["cabinets", "after"], jobId });
      });
      await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "cabinets in Odessa" }));
      const shown = await shownBy(t);
      expect([...shown.story].some((id) => id !== lone)).toBe(true);
    });

    test("a job named in the line carries every version, the checklist too, and the request remembers it", async () => {
      const { t, owner, calls, settle } = await ready();
      // No kind of job named, so a lesson is built on a second competitor ad too.
      // The reader slips the job's name into the idea: it is taken out before the writer or the page sees it.
      stubServices(calls, { request: { trade: "painting", scope: null, town: "Odessa", idea: "We paint homes inside and out, like our Smith kitchen on Elm job", job: 1 } });
      const { jobId, ids } = await cabinetJob(t, owner, settle);
      const { link } = await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "an ad from the Smith kitchen" }));
      // The reader was shown the jobs on file by name, to match the one the line names.
      const read = to(calls, "anthropic").map((c) => JSON.stringify(JSON.parse(c.body!).messages[0].content)).find((x) => x.includes("typed this request"))!;
      expect(read).toContain("1. Smith kitchen on Elm");
      const shown = await shownBy(t);
      for (const kind of ["story", "lesson", "quick"]) expect([...(shown[kind] ?? [])].every((id) => ids.includes(id))).toBe(true);
      expect(shown.lesson?.length).toBeGreaterThan(0);
      const request = await t.run(async (ctx) => (await ctx.db.query("adRequests").collect()).find((r) => link.endsWith(r.token))!);
      expect(request.jobId).toBe(jobId);
      expect(request.idea).toBe("We paint homes inside and out");
      // The writer never saw the job's name.
      expect(JSON.stringify(to(calls, "anthropic").map((c) => c.body).filter((b) => !b!.includes("typed this request")))).not.toContain("Smith");
    });

    test("a request the network drops on the way to Claude is sent once more; a writer that never answers is said plainly", async () => {
      const { t, owner, calls, settle } = await ready();
      stubServices(calls);
      vi.stubEnv("ADS_RETRY_MS", "0");
      const answer = globalThis.fetch;
      let dropped = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          if (String(input).includes("anthropic") && dropped === 0) {
            dropped++;
            throw new TypeError("error sending request for url (https://api.anthropic.com/v1/messages)");
          }
          return answer(input, init);
        }),
      );
      const { link } = await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "painting in Odessa" }));
      expect(dropped).toBe(1);
      expect((await t.query(api.ads.requestView, { token: tokenOf(link) }))!.stage).toBe("drawing");

      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("error sending request for url (https://api.anthropic.com/v1/messages)"); }));
      const second = await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "painting in Midland" }));
      expect(await t.query(api.ads.requestView, { token: tokenOf(second.link) })).toMatchObject({
        stage: "failed",
        error: "The writing service didn't answer just then. Ask again in a minute.",
      });
    });

    test("the page shows nothing for a wrong or short key, and only staff can ask from the app", async () => {
      const { t, owner, calls, settle } = await ready();
      stubServices(calls);
      const { link } = await settle(() => owner.as.mutation(api.ads.makeFor, { ask: "cabinet painting" }));
      expect(await t.query(api.ads.requestView, { token: "x".repeat(32) })).toBeNull();
      expect(await t.query(api.ads.requestView, { token: tokenOf(link).slice(0, 10) })).toBeNull();
      await expect(t.mutation(api.ads.makeFor, { ask: "cabinet painting" })).rejects.toThrow();
      await expect(owner.as.mutation(api.ads.makeFor, { ask: " a " })).rejects.toThrow("Say what the ad is for");
    });

    test("from Claude, a line that names no trade we do stops with a plain reason, and one with no competitor ads says so", async () => {
      const { t, calls, settle } = await ready();
      stubServices(calls, { request: { trade: null } });
      const { link } = await settle(() => t.mutation(internal.ads.makeForInternal, { ask: "roof repair" }));
      expect(await t.query(api.ads.requestView, { token: tokenOf(link) })).toMatchObject({ stage: "failed", error: expect.stringContaining("Couldn't tell which kind of job") });

      stubServices(calls, { request: { trade: "bathroom-remodeling", scope: "walk-in-shower", town: null, idea: "Walk-in showers" } });
      const second = await settle(() => t.mutation(internal.ads.makeForInternal, { ask: "walk-in showers" }));
      expect(await t.query(api.ads.requestView, { token: tokenOf(second.link) })).toMatchObject({
        stage: "failed",
        trade: "Bathrooms",
        error: "No bathrooms competitor ads on file to build it on yet.",
      });
    });
  });

  test("a checklist ad can be copied in the collage look: same words and voice, its own name, waiting to be drawn; others can't", async () => {
    const { t, calls, draft, latest } = await ready();
    stubServices(calls);
    const batch = await draft();
    const first = batch.creatives[0];
    const prefix = first.name.replace(/_(916|45)_.*$/, "");
    // Drawn as a light-up, it has no collage look.
    await expect(t.mutation(internal.ads.addLook, { name: prefix, look: "collage" })).rejects.toThrow("isn't a checklist ad");
    await t.run(async (ctx) => {
      for (const c of await ctx.db.query("adCreatives").collect()) if (c.design) await ctx.db.patch(c._id, { design: { ...c.design, style: "explainer" } });
    });
    const made = await t.mutation(internal.ads.addLook, { name: prefix, look: "collage" });
    expect(made.made.length).toBe(2);
    expect(made.made.every((n: string) => n.endsWith("_collage"))).toBe(true);
    const copies = await t.run(async (ctx) => (await ctx.db.query("adCreatives").collect()).filter((c) => c.name.endsWith("_collage")));
    const original = await t.run(async (ctx) => (await ctx.db.query("adCreatives").collect()).find((c) => c.name === first.name)!);
    expect(copies.every((c) => c.status === "voiced" && c.design?.look === "collage" && c.audioStorageId === original.audioStorageId)).toBe(true);
    // Asked again, nothing is copied twice.
    expect((await t.mutation(internal.ads.addLook, { name: prefix, look: "collage" })).made).toEqual([]);
    expect((await latest()).creatives.some((c) => c.name.endsWith("_collage"))).toBe(true);
  });

  test("a story can be copied with only its title and captions: no headline over the later lines, same voice; others can't", async () => {
    const { t, calls, draft } = await ready();
    stubServices(calls);
    const batch = await draft();
    const first = batch.creatives[0];
    const asset = await t.run(async (ctx) => (await ctx.db.query("adAssets").first())!._id);
    const shots = [
      { assetId: asset, voice: "Your cabinets look tired.", onScreen: "Tired cabinets", start: 0, end: 2 },
      { assetId: asset, voice: "We paint them like new.", onScreen: "Painted like new", start: 2, end: 4 },
    ];
    await t.run(async (ctx) => {
      const c = (await ctx.db.query("adCreatives").collect()).find((x) => x.name === first.name)!;
      await ctx.db.patch(c._id, { design: { ...c.design!, style: "explainer" } });
    });
    await expect(t.mutation(internal.ads.sampleCaptionsOnly, { names: [first.name] })).rejects.toThrow("isn't a story ad");
    await t.run(async (ctx) => {
      const c = (await ctx.db.query("adCreatives").collect()).find((x) => x.name === first.name)!;
      await ctx.db.patch(c._id, { design: { ...c.design!, style: "reel" }, script: { ...c.script, shots, onScreen: ["A title", "Tired cabinets", "Painted like new"] } });
    });
    expect((await t.mutation(internal.ads.sampleCaptionsOnly, { names: [first.name] })).made).toEqual([`${first.name}_cap`]);
    const [original, copy] = await t.run(async (ctx) => {
      const all = await ctx.db.query("adCreatives").collect();
      return [all.find((c) => c.name === first.name)!, all.find((c) => c.name === `${first.name}_cap`)!];
    });
    expect(copy.status).toBe("voiced");
    expect(copy.audioStorageId).toBe(original.audioStorageId);
    expect(copy.script.shots!.map((x) => x.voice)).toEqual(shots.map((x) => x.voice));
    expect(copy.script.shots!.every((x) => x.onScreen === "")).toBe(true);
    expect(copy.script.onScreen).toEqual(["A title"]);
    // Asked again, nothing is copied twice.
    expect((await t.mutation(internal.ads.sampleCaptionsOnly, { names: [first.name] })).made).toEqual([]);
  });

  test("each week also makes a quick offer: one job from the week's story, a hook that speaks to the area, about 9 seconds", async () => {
    const { t, calls, draft } = await ready({ quick: true });
    stubServices(calls);
    const batch = await draft();
    const ask = to(calls, "anthropic")
      .map((c) => (JSON.parse(c.body!).messages[0].content as Array<{ text?: string }>)[0].text ?? "")
      .find((text) => text.includes("This one is a quick offer"))!;
    expect(ask).toContain("about 9 seconds");
    expect(ask).toContain('"Midland homeowners, look at this."');
    expect(ask).toContain("never says or suggests the pictured job was there");
    const quick = await t.run(async (ctx) => (await ctx.db.query("adCreatives").collect()).filter((c) => c.design?.quick));
    expect(quick.length).toBe(2);
    // One job: a before and its after, or one photo.
    expect(new Set(quick[0].script.shots!.map((s) => s.assetId)).size).toBeLessThanOrEqual(2);
    const labels = batch.creatives.map((c: { style?: { label: string } }) => c.style?.label);
    expect(labels).toEqual(expect.arrayContaining(["Quick offer"]));
  });

  test("a checklist ad can be copied in the marked-up and face-off looks too; copies are never copied again, and the renderer is told the look", async () => {
    const { t, calls, draft, claim } = await ready();
    stubServices(calls);
    const batch = await draft();
    const prefix = batch.creatives[0].name.replace(/_(916|45)_.*$/, "");
    await t.run(async (ctx) => {
      for (const c of await ctx.db.query("adCreatives").collect()) if (c.design) await ctx.db.patch(c._id, { design: { ...c.design, style: "explainer" } });
    });
    expect((await t.mutation(internal.ads.addLook, { name: prefix, look: "collage" })).made.length).toBe(2);
    const markup = await t.mutation(internal.ads.addLook, { name: prefix, look: "markup" });
    const versus = await t.mutation(internal.ads.addLook, { name: prefix, look: "versus" });
    expect(markup.made.length).toBe(2);
    expect(versus.made.length).toBe(2);
    // Made from the originals, not from the collage copies.
    expect([...markup.made, ...versus.made].some((n: string) => n.includes("_collage_"))).toBe(false);
    const all = await t.run(async (ctx) => (await ctx.db.query("adCreatives").collect()).map((c) => c.name));
    expect(all.filter((n) => n.endsWith("_markup")).length).toBe(2);
    const jobs = await claim();
    const looks = jobs.map((j: { props: { style: { look?: string } } }) => j.props.style.look);
    expect(looks).toEqual(expect.arrayContaining(["markup", "versus"]));
  });

  test("with stills on, a reel that shows a before and its after from one job also gets a still of that pair, drawn as a picture", async () => {
    const { t, calls, draft, claim, handIn, latest } = await ready({ meta: true });
    stubServices(calls, { style: "reel" });
    await t.mutation(internal.ads.setStills, { on: true });
    const batch = await draft();
    const still = batch.creatives.find((c) => c.name.endsWith("_still"));
    expect(still).toMatchObject({ ratio: "4x5", kind: "image", status: "voiced" });
    // The words and the voice are the reel's own: one read for all three.
    expect(to(calls, "elevenlabs").length).toBe(1);
    const jobs = await claim();
    const job = jobs.find((j) => j.name === still!.name)!;
    expect(job.kind).toBe("image");
    const props = job.props as unknown as { headline: string; sub: string; pair: Array<{ src: string }> };
    expect(props.headline).toBe("Paint them, don't replace");
    expect(props.pair.length).toBe(2);
    expect(props.pair[0].src).not.toBe(props.pair[1].src);
    expect(jobs.filter((j) => j.kind === "video").length).toBe(jobs.length - 1);
    await handIn(job);
    const after = (await latest()).creatives.find((c) => c.name === still!.name)!;
    // Into Meta like the reels: the picture uploaded, an image creative with the quote form, a paused ad.
    expect(after).toMatchObject({ status: "paused", meta: { adId: "ad1" } });
    expect(after.error).toBeUndefined();
    const story = JSON.parse(new URLSearchParams(calls.filter((c) => c.url.endsWith("/adcreatives")).at(-1)!.body).get("object_story_spec")!);
    expect(story.link_data).toMatchObject({ image_hash: "hash1", link: "http://fb.me/", call_to_action: { type: "GET_QUOTE", value: { lead_gen_form_id: "f1" } } });
  });

  test("a video that can't be drawn fails that ad with the reason and the batch still finishes; drawn again, it keeps its words and voice", async () => {
    const { t, calls, settle, draft, draw, latest } = await ready();
    stubServices(calls);
    const drafted = await draft();
    await draw("the photo wouldn't load");
    let batch = await latest();
    expect(batch).toMatchObject({ status: "ready", summary: "0 paused in Meta · 2 failed" });
    expect(batch.creatives.map((c) => c.error)).toEqual(["Couldn't draw the video: the photo wouldn't load", "Couldn't draw the video: the photo wouldn't load"]);

    // After a fix to how ads are drawn, the same ad goes back in the queue: nothing is rewritten or re-read.
    // The writer's calls only: a look at a photo from elsewhere isn't this ad being written again.
    const writes = () => to(calls, "anthropic").filter((c) => c.body!.includes("You write one short animated ad")).length;
    const asked = { claude: writes(), voice: to(calls, "elevenlabs").length };
    const [tall] = batch.creatives;
    expect(await settle(() => t.mutation(internal.ads.rerender, { names: [tall.name, "WL_nobody"] }))).toEqual({ sent: [tall.name] });
    expect(states(await latest())).toEqual(["9x16 voiced", "4x5 failed: Couldn't draw the video: the photo wouldn't load"]);
    expect((await draw()).map((j) => j.name)).toEqual([tall.name]);
    batch = await latest();
    expect(batch.creatives[0]).toMatchObject({ status: "rendered", script: drafted.creatives[0].script });
    expect(batch.creatives[0].videoUrl).toContain("/api/storage/");
    expect({ claude: writes(), voice: to(calls, "elevenlabs").length }).toEqual(asked);
  });

  test("an ad taken but never finished is offered again after twenty minutes; a file for an ad rejected meanwhile is thrown away; an ad from before can't be drawn", async () => {
    const { t, owner, calls, draft, claim, handIn, latest } = await ready();
    stubServices(calls);
    const batch = await draft();
    // An ad from before ads were drawn this way, sent back by mistake.
    const oldId = await t.run(async (ctx) => {
      const row = (await ctx.db.query("adCreatives").take(1))[0];
      return await ctx.db.insert("adCreatives", {
        batchId: row.batchId,
        hookId: row.hookId,
        ratio: "9x16",
        name: "WL_old_916_20261001",
        script: GOOD,
        assetIds: [],
        status: "voiced",
        createdAt: new Date().toISOString(),
      });
    });
    const jobs = await claim();
    expect(jobs.map((j) => j.name)).toEqual(batch.creatives.map((c) => c.name));
    expect(await t.run((ctx) => ctx.db.get(oldId))).toMatchObject({ status: "failed", error: "This ad was made before ads were drawn this way" });
    expect(await claim()).toEqual([]);
    // The renderer stopped part-way: twenty minutes on, both are handed out again.
    await t.run(async (ctx) => {
      for (const j of jobs) await ctx.db.patch(j.id, { renderStartedAt: new Date(Date.now() - 21 * 60_000).toISOString() });
    });
    expect((await claim()).map((j) => j.name)).toEqual(jobs.map((j) => j.name));
    // One is rejected while it is being drawn: its file isn't kept.
    await owner.as.mutation(api.ads.reject, { id: jobs[0].id });
    const thrown = await handIn(jobs[0]);
    expect(thrown.kept).toBe(false);
    expect(await t.run((ctx) => ctx.storage.getUrl(thrown.storageId))).toBeNull();
    expect((await handIn(jobs[1])).kept).toBe(true);
    expect(states(await latest()).map((s) => s.split(":")[0])).toEqual(["9x16 rejected", "4x5 rendered", "9x16 failed"]);
    expect((await latest()).status).toBe("ready");
  });

  test("every competitor ad on file becomes one idea, listed longest-running first; one staff remove isn't made again, and an ad with no start date is left out", async () => {
    const { t, owner, calls, draft } = await ready();
    await t.run(async (ctx) => {
      const one = (await ctx.db.query("adSwipes").take(1))[0];
      const { _id, _creationTime, ...copy } = one;
      void _id;
      void _creationTime;
      await ctx.db.insert("adSwipes", { ...copy, company: "No Date Painting", hook: "Curb appeal", startedAt: undefined });
    });
    stubServices(calls);
    await draft();
    const ideas = await owner.as.query(api.ads.listHooks, {});
    expect(ideas.length).toBe(8);
    expect(ideas.slice(0, 3).map((h) => [h.textEn, h.scope, h.basedOn?.company, h.basedOn?.daysRunning])).toEqual([
      ["Process + minimal disruption", "cabinets", "Rodgers Painting", 160],
      ["Cost education", "interior", "Squeegee Squad", 90],
      [expect.any(String), expect.any(String), undefined, undefined],
    ]);
    // Only the longest-running was written this time.
    expect(ideas.map((h) => h.uses).filter(Boolean)).toEqual([1]);
    expect(ideas[0].uses).toBe(1);
    // Removed by staff: it stays removed.
    await owner.as.mutation(api.ads.removeHook, { id: ideas[1].id });
    expect(await t.mutation(internal.ads.ideasFromResearch, {})).toBe(0);
    expect((await owner.as.query(api.ads.listHooks, {})).length).toBe(7);
  });

  test("a bad script fails the batch with the reason, and Monday with the switch off does nothing", async () => {
    const { t, owner, calls, draft } = await ready();
    stubServices(calls, { scriptsFail: true });
    expect(await draft()).toMatchObject({ status: "failed", error: expect.stringContaining("mentions a price or discount") });
    stubServices(calls);
    await t.action(internal.ads.weeklyRun, {});
    expect((await owner.as.query(api.ads.batches, {})).length).toBe(1);
  });

  test("the batch list keeps older ads waiting for review on the page: a run of remakes or pulled batches never pushes them off", async () => {
    const { t, owner } = await ready();
    const now = new Date().toISOString();
    await t.run(async (ctx) => {
      const hook = (await ctx.db.query("adHooks").first())!;
      const batch = async (n: number, status: "voiced" | "rejected" | null) => {
        const batchId = await ctx.db.insert("adBatches", { weekOf: `2026-11-${String(n).padStart(2, "0")}`, status: "ready", createdAt: now });
        if (status) await ctx.db.insert("adCreatives", { batchId, hookId: hook._id, ratio: "9x16", name: `WL_b${n}_916`, script: GOOD, assetIds: [], status, createdAt: now });
      };
      // Eight batches with an ad waiting, then ten newer ones that were pulled or came out empty, then the newest (empty).
      for (let n = 1; n <= 8; n++) await batch(n, "voiced");
      for (let n = 9; n <= 18; n++) await batch(n, n % 2 ? "rejected" : null);
      await batch(19, null);
    });
    const shown = await owner.as.query(api.ads.batches, {});
    expect(shown.map((b) => b.weekOf)).toEqual(["2026-11-19", ...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => `2026-11-0${n}`)]);
  });

  test("Claude passes on an idea the photos can't carry: it is passed over with the reason and the next one is drafted", async () => {
    const { t, owner, calls, draft } = await ready();
    stubServices(calls, { passOnScope: "cabinets" });
    const batch = await draft();
    expect(batch.creatives.length).toBe(2);
    expect(batch.creatives.every((c) => c.hook!.scope !== "cabinets" && c.status === "voiced")).toBe(true);
    expect(batch.skipped[0]).toBe('"Process + minimal disruption": Claude passed: no cabinets in these photos');
    // From outside the app: the batch with what it passed over, and each ad with the competitor ad it was built around.
    const seen = (await t.query(internal.ads.lastBatch, {}))!;
    expect(seen.skipped).toEqual(batch.skipped);
    expect(seen.ads.map((a) => [a.ratio, a.status, a.idea, a.builtAround?.company])).toEqual([
      ["9x16", "voiced", "Cost education", "Squeegee Squad"],
      ["4x5", "voiced", "Cost education", "Squeegee Squad"],
    ]);
    // The pair Claude didn't use stays fresh for next week.
    expect(
      (await owner.as.query(api.ads.listAssets, {}))
        .filter((a) => a.uses === 0)
        .map((a) => a.fileName)
        .sort(),
    ).toEqual(["after.jpg", "before.jpg"]);
  });

  test("with no competitor ad on file to build on, no ad is made, and the batch says why", async () => {
    const { t, calls, draft } = await ready();
    stubServices(calls);
    await t.run(async (ctx) => {
      for (const x of await ctx.db.query("adSwipes").collect()) await ctx.db.delete(x._id);
    });
    const batch = await draft();
    expect(batch.creatives).toEqual([]);
    expect(batch.status).toBe("failed");
    expect(batch.skipped.length).toBeGreaterThan(0);
    expect(batch.skipped.every((x) => x.endsWith(": no competitor ad on file for painting to build it on. Run the competitor search first"))).toBe(true);
    expect(to(calls, "anthropic").length).toBe(0);
  });

  test("a reply that isn't a plan is passed over saying what came back instead, or that it was cut off", async () => {
    const { calls, draft } = await ready();
    stubServices(calls, { notJson: { scope: "cabinets" } });
    const batch = await draft();
    expect(batch.creatives.length).toBe(2);
    expect(batch.skipped[0]).toMatch(/: the ad still broke the rules: the reply wasn't JSON: it began "Looking at the photos, I'd open on the kitchen\."$/);
    // Asked twice (the retry names the problem), with room to finish.
    const asks = to(calls, "anthropic").map((c) => JSON.parse(c.body!));
    expect(asks.filter((a) => a.messages[0].content[0].text.includes("Scope: cabinets.")).map((a) => a.max_tokens)).toEqual([12000, 12000]);

    const again = await ready();
    stubServices(again.calls, { notJson: { scope: "cabinets", cutOff: true } });
    expect((await again.draft()).skipped[0]).toMatch(/the reply wasn't JSON: it was cut off before it finished$/);
  });

  test("an ad that breaks a rule gets one retry with the problems named", async () => {
    const { calls, draft } = await ready();
    stubServices(calls, { badFirst: true });
    const batch = await draft();
    expect(batch.skipped).toEqual([]);
    expect(batch.creatives.length).toBe(2);
    const asks = to(calls, "anthropic").map((c) => JSON.parse(c.body!).messages[0].content as Array<any>);
    expect(asks.length).toBe(2);
    expect(asks[1][asks[1].length - 1].text).toMatch(/^Your last answer had these problems: .*0 lines \(write 3 to 14\)/);
  });

  test("the live table joins Meta's numbers with what intake and the sale say, and flags fatigue", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await library(t, owner);
    const now = new Date().toISOString();
    const { creativeId, name, weakId, hookId, weakHookId } = await t.run(async (ctx) => {
      const [hook, weakHook] = await ctx.db.query("adHooks").take(2);
      const batchId = await ctx.db.insert("adBatches", { weekOf: "2026-11-02", status: "ready", createdAt: now });
      const name = "WL_abc123_916_20261102";
      const creativeId = await ctx.db.insert("adCreatives", {
        batchId,
        hookId: hook._id,
        ratio: "9x16",
        name,
        script: GOOD,
        assetIds: [],
        status: "live",
        createdAt: now,
        activatedAt: now,
        meta: { adId: "ad9" },
      });
      // A batch mate on another hook that Meta reports clicking far less.
      const weakId = await ctx.db.insert("adCreatives", {
        batchId,
        hookId: weakHook._id,
        ratio: "9x16",
        name: "WL_weak_916_20261102",
        script: GOOD,
        assetIds: [],
        status: "live",
        createdAt: now,
        activatedAt: now,
        meta: { adId: "ad8" },
      });
      const sold = await ctx.db.insert("marketplaceLeads", {
        name: "Ana",
        status: "assigned",
        priceCents: 6500,
        createdBy: owner.userId,
        createdAt: now,
        updatedAt: now,
      } as any);
      const row = (status: "new" | "confirmed", extra: Record<string, unknown> = {}) =>
        ctx.db.insert("intakeLeads", {
          source: "meta",
          status,
          name: "x",
          adName: name,
          campaignName: "TX_MIDLAND_PAINTING_LG_202611",
          attempts: [],
          createdAt: now,
          updatedAt: now,
          ...extra,
        } as any);
      await row("new");
      await row("confirmed", { confirmedLeadId: sold });
      await row("confirmed");
      await ctx.db.insert("intakeLeads", {
        source: "meta",
        status: "new",
        name: "other ad",
        adName: "WL_other",
        attempts: [],
        createdAt: now,
        updatedAt: now,
      } as any);
      return { creativeId: creativeId as Id<"adCreatives">, name, weakId: weakId as Id<"adCreatives">, hookId: hook._id, weakHookId: weakHook._id };
    });
    vi.stubEnv("META_ACCESS_TOKEN", "m");
    const day = (date: string, extra: Record<string, unknown> = {}) => ({
      date_start: date,
      spend: "12.50",
      impressions: "600",
      reach: "500",
      clicks: "9",
      ctr: "1.5",
      frequency: "1.2",
      actions: [{ action_type: "lead", value: "1" }],
      ...extra,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        const incremented = url.includes("time_increment=1");
        const weak = url.includes("/ad8/");
        return new Response(
          JSON.stringify({
            data: incremented
              ? [day("2026-11-03"), day("2026-11-04")]
              : [
                  {
                    spend: "25.00",
                    impressions: "1200",
                    clicks: weak ? "6" : "18",
                    ctr: weak ? "0.5" : "1.5",
                    frequency: "1.3",
                    actions: [{ action_type: "lead", value: "2" }],
                  },
                ],
          }),
        );
      }),
    );
    await t.action(internal.ads.pullInsights, {});
    const liveRow = async () => (await owner.as.query(api.ads.live, {})).find((r) => r.id === creativeId)!;
    let row = await liveRow();
    expect(row).toMatchObject({
      id: creativeId,
      name,
      intake: { leads: 3, confirmed: 2, sold: 1, revenueCents: 6500 },
      week: { spendCents: 2500, impressions: 1200, leadsMeta: 2, ctr: 1.5 },
      baselineCtr: 1.5,
      fatigued: false,
    });
    expect(
      (await t.run((ctx) => ctx.db.query("adStats").collect()))
        .filter((s) => s.creativeId === creativeId)
        .map((s) => [s.day, s.spendCents, s.leadsMeta]),
    ).toEqual([
      ["2026-11-03", 1250, 1],
      ["2026-11-04", 1250, 1],
    ]);
    // Hooks learned on their own: the stronger ad's hook won, the weaker one's lost, each scored once.
    const hookScore = async () => {
      const hooks = await owner.as.query(api.ads.listHooks, {});
      return [hooks.find((h) => h.id === hookId)!, hooks.find((h) => h.id === weakHookId)!].map((h) => [h.wins, h.losses]);
    };
    expect(await hookScore()).toEqual([
      [1, 0],
      [0, 1],
    ]);
    await t.action(internal.ads.pullInsights, {});
    expect(await hookScore()).toEqual([
      [1, 0],
      [0, 1],
    ]);
    // Two live, target six: nothing to retire. A third goes live against a target of two: the weakest is flagged, not paused.
    expect((await owner.as.query(api.ads.live, {})).every((r) => !r.suggestRetire)).toBe(true);
    await owner.as.mutation(api.ads.saveSettings, { weeklyEnabled: false, hooksPerWeek: 2, liveTarget: 2 });
    await t.run(async (ctx) => {
      const batchId = (await ctx.db.query("adBatches").take(1))[0]._id;
      await ctx.db.insert("adCreatives", {
        batchId,
        hookId,
        ratio: "4x5",
        name: "WL_third_45_20261102",
        script: GOOD,
        assetIds: [],
        status: "live",
        createdAt: now,
        activatedAt: now,
        meta: { adId: "ad7" },
      });
    });
    await t.action(internal.ads.pullInsights, {});
    const flagged = (await owner.as.query(api.ads.live, {})).filter((r) => r.suggestRetire);
    expect(flagged.map((r) => r.id)).toEqual([weakId]);
    expect(flagged[0].suggestRetire).toBe("3 live, the target is 2; this one has the lowest click-through this week");
    expect(flagged[0].status).toBe("live");
    // Retiring it clears the flag and doesn't score the hook again.
    await owner.as.mutation(api.ads.retire, { id: weakId });
    const retired = (await owner.as.query(api.ads.live, {})).find((r) => r.id === weakId)!;
    expect(retired.status).toBe("retired");
    expect(retired.suggestRetire).toBeUndefined();
    // The third ad scored its hook once on arrival (a second win); retiring scored nothing.
    expect(await hookScore()).toEqual([
      [2, 0],
      [0, 1],
    ]);
    // A week later people have seen it three times and click half as much: fatigued, and the baseline stays the first week's.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ spend: "30.00", impressions: "3000", clicks: "20", ctr: "0.67", frequency: "3.1", actions: [] }] })),
      ),
    );
    await t.action(internal.ads.pullInsights, {});
    row = await liveRow();
    expect(row).toMatchObject({ fatigued: true, baselineCtr: 1.5, week: { frequency: 3.1 } });
  });

  describe("idea cards", () => {
    const cards = async (owner: Awaited<ReturnType<typeof signUp>>) => await owner.as.query(api.ads.listIdeas, {});

    test("the pure parts: a priced idea is dropped, near-copies go, and the pick decides the order, filled in turn from each writer when it gives too few", () => {
      const sources = [{ n: 1, company: "Rodgers Painting", angle: "Process", offer: "Free estimate" }];
      const read = ideasFrom(
        `Here: ${JSON.stringify({
          ideas: [
            { line: "Cabinet doors drying in rows off site while dinner is cooked.", opening: "Your kitchen stays open.", family: "nonsense", scope: "kitchens", from: 1 },
            { line: "Half off every room this week only, 50% for the first ten.", opening: "Half off.", family: "proof", scope: "interior", from: 0 },
            { line: "Guaranteed for life or it is repainted.", opening: "A lifetime guarantee.", family: "proof", scope: "interior", from: 9 },
            { line: "short", opening: "x" },
          ],
        })}`,
        "editor",
        sources,
      );
      // Only the one that promises nothing; its made-up family and scope fall back, and it keeps the ad it builds on.
      expect(read).toEqual([
        { line: "Cabinet doors drying in rows off site while dinner is cooked.", opening: "Your kitchen stays open.", family: "proof", scope: "general", from: 1, writer: "editor" },
      ]);
      expect(ideasFrom("I'd rather not.", "editor", sources)).toEqual([]);
      // A long line stops at the end of a word.
      // With competitor ads on file, an idea that isn't built on one of them isn't kept.
      expect(ideasFrom(JSON.stringify({ ideas: [{ line: "A fresh coat makes the whole house feel new again.", opening: "Look." }] }), "editor", sources)).toEqual([]);
      const long = ideasFrom(JSON.stringify({ ideas: [{ line: `${"Photos of the job ".repeat(14)}end`, opening: "Look.", from: 1 }] }), "editor", sources)[0].line;
      expect(long.length).toBeLessThanOrEqual(221);
      expect(long.endsWith("Photos of the job…")).toBe(true);

      expect(ideaOverlap("Cabinet doors drying in rows", "Rows of drying cabinet doors")).toBe(1);
      expect(ideaOverlap("Cabinet doors drying in rows", "A fence beside fresh siding")).toBe(0);
      const idea = (line: string, opening: string, writer: string) => ({ line, opening, family: "proof" as const, scope: "general", writer });
      const offered = [
        idea("Paint the cabinets instead of replacing them.", "Don't rip them out.", "a"),
        idea("Keep the cabinets and paint them, don't replace them.", "Do not rip them out!", "b"),
        idea("Drop cloths over hardwood before any lid opens.", "Strangers near your piano.", "b"),
        idea("A sun-faded fence beside fresh siding.", "Left side, right side.", "a"),
        idea("How a painter gets checked first.", "Who checked this painter?", "c"),
      ];
      const distinct = dropNearCopies(offered, ["A faded fence beside fresh siding, split down the middle."]);
      expect(distinct.map((i) => i.opening)).toEqual(["Don't rip them out.", "Strangers near your piano.", "Who checked this painter?"]);
      // The picks first, in their order; a number that points at nothing is passed over.
      expect(pickIdeas(distinct, '{"picks":[3,9,1]}', 2).map((i) => i.writer)).toEqual(["c", "a"]);
      // No readable pick: one from each writer in turn.
      expect(pickIdeas(distinct, "no idea", 3).map((i) => i.writer)).toEqual(["a", "b", "c"]);
      expect(pickIdeas(distinct, null, 9).length).toBe(3);
    });

    test("four writers are asked on their own; the idea they share shows once, the priced one never, and the pick chooses the eight", async () => {
      const { t, owner, calls, settle } = await ready();
      stubServices(calls);
      const member = await signUp(t, "member@tolliver.example");
      await expect(member.as.query(api.ads.listIdeas, {})).rejects.toThrow();
      expect(await cards(owner)).toEqual({ round: null, ideas: [], taste: undefined });

      await settle(() => owner.as.mutation(api.ads.ideasNow, {}));
      const asked = to(calls, "anthropic").map((c) => JSON.parse(c.body!).messages[0].content[0].text as string);
      const briefs = asked.filter((p) => p.includes(IDEA_MARK));
      expect(briefs.length).toBe(4);
      expect(new Set(briefs.map((p) => p.split("\n")[1])).size).toBe(4);
      // Each is told the competitor ads, longest-running first, and the photos on file.
      expect(briefs[0]).toContain("1. Rodgers Painting, running 160 days. Angle: Process + minimal disruption.");
      expect(briefs[0]).toContain("2. Squeegee Squad, running 90 days.");
      expect(briefs[0]).toContain("3 photos in all: 2 tagged cabinets");
      expect(briefs[0]).not.toContain("kept and killed before");
      // Thirteen distinct ideas came back, so one more pass picks; it sees the shared idea once and no price.
      const pick = asked.filter((p) => p.includes(PICK_MARK));
      expect(pick.length).toBe(1);
      expect(pick[0].match(/Don't rip them out/g)!.length).toBe(1);
      expect(pick[0]).not.toContain("$999");
      expect(pick[0].split("\n").filter((l) => /^\d+\. /.test(l)).length).toBe(13);

      const { round, ideas } = await cards(owner);
      expect(round).toMatchObject({ status: "ready" });
      expect(ideas.length).toBe(IDEAS_SHOWN);
      expect(ideas.every((i) => i.status === "new")).toBe(true);
      expect(ideas.slice(0, 2).map((i) => i.opening)).toEqual(["Your kitchen stays open.", "Left side, right side."]);
      // From outside the app the same cards read the same way.
      const outside = await t.query(internal.ads.ideasOutside, {});
      expect(outside.round).toEqual({
        status: "ready",
        error: undefined,
        offered: IDEAS_SHOWN,
        // The priced idea is dropped as each writer's answer is read, so four of five remain.
        writers: ["neighbour: 4 ideas", "editor: 4 ideas", "sceptic: 4 ideas", "contrarian: 4 ideas"],
      });
      expect(outside.ideas[0]).toMatchObject({ status: "new", opening: "Your kitchen stays open.", builtOn: "Rodgers Painting, 160 days", writer: "neighbour" });
      // An idea that builds on a competitor's ad says whose, and how long it has run.
      expect(ideas[0]).toMatchObject({ scope: "cabinets", familyLabel: "Respect for your home", basedOn: { company: "Rodgers Painting", daysRunning: 160 } });
      expect(ideas[1].basedOn).toMatchObject({ company: "Squeegee Squad" });

      // Asked again: what was shown isn't shown twice. The writers here repeat themselves, so only the five that
      // missed the cut come back. The kept idea stays; the seven nobody decided on give way.
      await owner.as.mutation(api.ads.decideIdea, { id: ideas[0].id, status: "kept" });
      await settle(() => owner.as.mutation(api.ads.ideasNow, {}));
      const again = await cards(owner);
      expect(again.round).toMatchObject({ status: "ready" });
      expect(again.ideas.filter((i) => i.status === "kept").map((i) => i.opening)).toEqual(["Your kitchen stays open."]);
      const fresh = again.ideas.filter((i) => i.status === "new");
      expect(fresh.length).toBe(5);
      expect(fresh.some((i) => ideas.some((shown) => shown.line === i.line))).toBe(false);
      // A third time there is nothing left that hasn't been shown, and the page says so.
      await settle(() => owner.as.mutation(api.ads.ideasNow, {}));
      expect((await cards(owner)).round).toMatchObject({ status: "failed", error: "No usable ideas came back. Ask again." });
      expect((await cards(owner)).ideas.map((i) => i.status)).toEqual(["new", "new", "new", "new", "new", "kept"]);
      const second = to(calls, "anthropic")
        .map((c) => JSON.parse(c.body!).messages[0].content[0].text as string)
        .filter((p) => p.includes(IDEA_MARK))[4];
      expect(second).toContain("Already offered. Do not offer these again");
      expect(second).toContain("- Cabinet doors drying in rows off site while the family still cooks dinner.");
    });

    test("only kept ideas are made, each opening on the words the owner chose; one the photos can't carry goes back with the reason; the keeps and kills become a note the writers read", async () => {
      const { t, owner, calls, settle, latest } = await ready();
      stubServices(calls, { passOnScope: "exterior" });
      await expect(owner.as.mutation(api.ads.makeKept, {})).rejects.toThrow("Keep at least one idea first");
      await settle(() => owner.as.mutation(api.ads.ideasNow, {}));
      const { ideas } = await cards(owner);
      const [cabinets, fence, third] = ideas;
      await owner.as.mutation(api.ads.decideIdea, { id: cabinets.id, status: "kept" });
      await owner.as.mutation(api.ads.decideIdea, { id: fence.id, status: "kept" });
      await owner.as.mutation(api.ads.decideIdea, { id: third.id, status: "killed" });
      const before = to(calls, "anthropic").length;

      expect(await settle(() => owner.as.mutation(api.ads.makeKept, {}))).toBe(2);
      const batch = await latest();
      // The cabinets idea is an ad in both sizes, built around the competitor ad it grew from.
      expect(states(batch)).toEqual(["9x16 voiced", "4x5 voiced"]);
      expect(batch.creatives[0].hook).toMatchObject({ textEn: cabinets.line, scope: "cabinets", basedOn: { company: "Rodgers Painting" } });
      expect(batch.skipped).toEqual([`"${fence.line.slice(0, 50)}…": Claude passed: no exterior in these photos`]);
      const prompts = to(calls, "anthropic")
        .slice(before)
        .map((c) => JSON.parse(c.body!).messages[0].content[0].text as string);
      const written = prompts.find((p) => p.includes(`Hook: ${cabinets.line}`))!;
      expect(written).toContain('- The first line is the opening the owner chose, or very close to it: "Your kitchen stays open."');
      expect(written).toContain("Build this ad around a competitor's ad that has been running for 160 days.");
      // Nothing else was written: two kept ideas, two briefs, and the hooks Monday draws from are left alone.
      expect(prompts.filter((p) => p.includes("You write one short animated ad")).length).toBe(2);
      const hooks = await owner.as.query(api.ads.listHooks, {});
      expect(hooks.find((h) => h.textEn === cabinets.line)).toMatchObject({ active: false, uses: 1 });

      // The fence idea is back among the kept ones saying why; the made one and the killed one are off the page.
      const after = await cards(owner);
      expect(after.ideas.filter((i) => i.status === "kept")).toMatchObject([{ id: fence.id, note: "Claude passed: no exterior in these photos" }]);
      expect(after.ideas.some((i) => i.id === cabinets.id || i.id === third.id)).toBe(false);
      await expect(owner.as.mutation(api.ads.decideIdea, { id: cabinets.id, status: "killed" })).rejects.toThrow("already been made");

      // Three decisions are enough to say something about taste; the next writers are told.
      expect(prompts.filter((p) => p.includes(TASTE_MARK)).length).toBe(1);
      expect(after.taste).toBe(TASTE_NOTE);
      const brief = await t.query(internal.ads.ideaBrief, {});
      expect(brief.houseStyle).toBe(TASTE_NOTE);
      // With nothing new decided, the note isn't written again.
      const count = to(calls, "anthropic").length;
      await settle(() => t.action(internal.ads.learnTaste, {}));
      expect(to(calls, "anthropic").length).toBe(count);
    });

    test("a second trade keeps to itself: its own photos, its own words in every brief, its own ideas and ads, and painting's are untouched", async () => {
      const { t, owner, calls, settle } = await ready();
      stubServices(calls);
      const trade = "outdoor-construction";
      await owner.as.mutation(api.ads.addAsset, { storageId: await store(t, "image/jpeg", "patio"), fileName: "patio.jpg", tags: ["patio", "after"], trade });
      expect((await owner.as.query(api.ads.listAssets, { trade })).map((a) => a.fileName)).toEqual(["patio.jpg"]);
      expect((await owner.as.query(api.ads.listAssets, {})).map((a) => a.fileName).sort()).toEqual(["after.jpg", "before.jpg", "prep.jpg"]);
      // A trade nobody has set up reads as painting, never as an empty page of its own.
      expect((await owner.as.query(api.ads.listAssets, { trade: "underwater-basket-weaving" })).length).toBe(3);

      // No hardscaping competitor ads are on file, and painting's are not lent to it: there is nothing to build ideas on.
      await settle(() => owner.as.mutation(api.ads.ideasNow, { trade }));
      const ideaBriefs = () =>
        to(calls, "anthropic")
          .map((c) => JSON.parse(c.body!).messages[0].content[0].text as string)
          .filter((p) => p.includes(IDEA_MARK));
      expect(ideaBriefs()).toEqual([]);
      expect((await owner.as.query(api.ads.listIdeas, { trade })).round).toMatchObject({
        status: "failed",
        error: "No hardscaping competitor ads on file yet, so there is nothing to build ideas on. Run the competitor search first.",
      });

      // One is found: every idea is built on it.
      await t.run(async (ctx) => {
        await ctx.db.insert("adSwipes", {
          trade,
          company: "Backyard Pavers Co",
          paintingType: "Patios",
          scope: "patio",
          hook: "Dirt yard to finished patio",
          offer: "Free design visit",
          creative: "Before and after photos",
          area: "",
          cta: "Get quote",
          adaptation: "Show the yard before, then the patio.",
          starred: false,
          source: "test",
          importedAt: new Date().toISOString(),
          startedAt: new Date(Date.now() - 120 * 86_400_000).toISOString(),
        } as never);
      });
      await settle(() => owner.as.mutation(api.ads.ideasNow, { trade }));
      const briefs = ideaBriefs();
      expect(briefs[0]).toContain("a hardscaping contractor in Midland, Texas.");
      expect(briefs[0]).toContain("which speaks as the hardscaping contractor (\"we\"). Never say it matches or connects homeowners with anyone.");
      expect(briefs[0]).not.toContain("paint");
      expect(briefs[0]).toContain("1. Backyard Pavers Co, running 120 days. Angle: Dirt yard to finished patio.");
      expect(briefs[0]).not.toContain("Rodgers Painting");
      expect(briefs[0]).toContain("1 photos in all: 1 tagged patio, 1 tagged after.");
      expect(briefs[0]).toContain("- scope: one of patio, walkway, wall, outdoor-living, general");

      // The ideas are hardscaping's alone; a painting scope the writers named falls back to any photo.
      expect((await cards(owner)).ideas).toEqual([]);
      const mine = await owner.as.query(api.ads.listIdeas, { trade });
      expect(mine.round).toMatchObject({ status: "ready" });
      expect(mine.ideas.length).toBe(IDEAS_SHOWN);
      expect(mine.ideas.every((i) => i.scope === "general" && i.basedOn?.company === "Backyard Pavers Co")).toBe(true);
      expect((await t.query(internal.ads.ideasOutside, { trade })).ideas.length).toBe(IDEAS_SHOWN);
      expect((await t.query(internal.ads.ideasOutside, {})).ideas.length).toBe(0);

      // Making a kept one: the ad is written for the trade, from its photo only, in a batch of its own.
      await owner.as.mutation(api.ads.decideIdea, { id: mine.ideas[0].id, status: "kept" });
      await expect(owner.as.mutation(api.ads.makeKept, {})).rejects.toThrow("Keep at least one idea first");
      const before = to(calls, "anthropic").length;
      expect(await settle(() => owner.as.mutation(api.ads.makeKept, { trade }))).toBe(1);
      const written = to(calls, "anthropic")
        .slice(before)
        .map((c) => JSON.parse(c.body!).messages[0].content as Array<{ type: string; text?: string }>)
        .find((content) => content[0].text!.includes("You write one short animated ad"))!;
      expect(written[0].text).toContain("a hardscaping contractor in Midland, Texas.");
      expect(written[0].text).toContain("Build this ad around a competitor's ad that has been running for 120 days.");
      expect(written[0].text).not.toContain("Rodgers Painting");
      expect(written.filter((c) => /^Photo \d+:$/.test(c.text ?? "")).length).toBe(1);
      expect(await owner.as.query(api.ads.batches, {})).toEqual([]);
      const made = await owner.as.query(api.ads.batches, { trade });
      expect(made.length).toBe(1);
      expect(states(made[0])).toEqual(["9x16 voiced", "4x5 voiced"]);
      expect(made[0].creatives[0].shots.map((x) => x.fileName)).toContain("patio.jpg");
      // A lead that names one of these ads arrives as that trade, though the campaign's name says nothing about it.
      await t.run(async (ctx) => {
        const stamp = new Date().toISOString();
        for (const [slug, name] of [
          ["painting", "Painting"],
          [trade, "Outdoor Construction"],
        ])
          await ctx.db.insert("industries", { slug, name, display_order: 1, is_active: true, created_at: stamp, updated_at: stamp });
      });
      const lead = await t.mutation(internal.intake.receive, {
        payload: { name: "Dana Reyes", phone: "4325550142", county: "Midland", ad_name: made[0].creatives[0].name, campaign_name: "Fall leads" },
      });
      expect((await t.run((ctx) => ctx.db.get(lead.id)))!.jobType).toBe(trade);
      const other = await t.mutation(internal.intake.receive, { payload: { name: "Lee Park", phone: "4325550143", county: "Midland", ad_name: "someone else's ad" } });
      expect((await t.run((ctx) => ctx.db.get(other.id)))!.jobType).toBeUndefined();
      // Its hook is filed under the trade, and painting's hook list doesn't show it.
      expect((await owner.as.query(api.ads.listHooks, { trade })).map((h) => h.textEn)).toEqual([mine.ideas[0].line]);
      expect((await owner.as.query(api.ads.listHooks, {})).some((h) => h.textEn === mine.ideas[0].line)).toBe(false);

      // Ideas chosen for the owner, from the deployment: those are made, in their own trade, and the rest stay on offer.
      const outside = (await t.query(internal.ads.ideasOutside, { trade })).ideas;
      expect(outside.length).toBe(IDEAS_SHOWN - 1);
      const picked = outside.slice(0, 2);
      const result = await settle(() => t.mutation(internal.ads.makeIdeas, { ids: picked.map((i) => i.id) }));
      expect(result).toMatchObject({ made: 2, trade, lines: picked.map((i) => i.line) });
      // The library has one photo, so the second has none left: it goes back on offer, kept, to be made when there are photos.
      const after = (await t.query(internal.ads.ideasOutside, { trade })).ideas;
      expect(after.length).toBe(IDEAS_SHOWN - 2);
      expect(after.find((i) => i.id === picked[1].id)?.status).toBe("kept");
      expect(after.some((i) => i.id === picked[0].id)).toBe(false);
      expect((await t.query(internal.ads.lastBatch, {}))!.trade).toBe(trade);
      // One already made isn't made twice.
      expect(await t.mutation(internal.ads.makeIdeas, { ids: [picked[0].id] })).toEqual({ made: 0 });
    });
  });
});

describe("niche research", () => {
  test("a search marks kept ads that have stopped, with their last day and run length; stopped ads it doesn't have aren't added", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    vi.stubEnv("APIFY_TOKEN", "ap");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    await owner.as.mutation(api.ads.saveSettings, {
      weeklyEnabled: false,
      hooksPerWeek: 2,
      liveTarget: 6,
      researchKeywords: ["cabinet painting"],
      researchMarkets: ["Midland"],
      researchMinDays: 90,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("adSwipes", {
        company: "Rodgers Painting",
        paintingType: "Cabinets",
        hook: "Dark cabinets",
        offer: "",
        creative: "video",
        area: "",
        cta: "",
        adaptation: "",
        metaAdId: "7001",
        daysRunning: 160,
        active: true,
        status: "Active",
        starred: false,
        source: "research 2026-10-10",
        importedAt: "2026-10-10T00:00:00Z",
        taggedAt: "2026-10-10T00:00:00Z",
      });
    });
    STOPPED_ITEMS = [
      { ad_archive_id: "7001", page_name: "Rodgers Painting", start_date: "2026-05-01T00:00:00.000Z", end_date: "2026-11-20T00:00:00.000Z", is_active: false },
      { ad_archive_id: "7002", page_name: "Someone New", start_date: "2026-01-01T00:00:00.000Z", end_date: "2026-11-01T00:00:00.000Z", is_active: false },
    ];
    const calls: Array<{ url: string; body?: string }> = [];
    stubServices(calls);
    try {
      await t.action(internal.ads.researchRun, { force: true });
    } finally {
      STOPPED_ITEMS = [];
    }
    const rows = await t.run(async (ctx) => await ctx.db.query("adSwipes").collect());
    const rodgers = rows.find((x) => x.metaAdId === "7001")!;
    expect(rodgers).toMatchObject({ active: false, status: "Inactive", endedAt: "2026-11-20", daysRunning: 203 });
    expect(rows.some((x) => x.metaAdId === "7002")).toBe(false);
    const [run] = await staff.as.query(api.ads.listResearchRuns, {});
    expect(run.stopped).toBe(1);
    const shown = (await staff.as.query(api.ads.listSwipes, {})).find((x) => x.metaAdId === "7001")!;
    expect(shown.endedAt).toBe("2026-11-20");
  });

  test("from a cloud session: words are added beside the saved ones, and the weekly switch set", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await owner.as.mutation(api.ads.saveSettings, { weeklyEnabled: false, hooksPerWeek: 2, liveTarget: 6, researchKeywords: ["cabinet painting"] });
    expect(await t.mutation(internal.ads.setResearch, { addWords: ["cabinet painting", " painters Odessa TX "], weekly: true })).toEqual({
      researchKeywords: ["cabinet painting", "painters Odessa TX"],
      weekly: true,
    });
  });

  test("on Mondays, with the switch on, every trade with search words gets its own search, a quarter hour apart", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await owner.as.mutation(api.ads.saveSettings, { weeklyEnabled: false, hooksPerWeek: 2, liveTarget: 6, researchMonthly: false });
    await t.action(internal.ads.researchRun, { everyTrade: true });
    expect(await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length)).toBe(0);
    await owner.as.mutation(api.ads.saveSettings, { weeklyEnabled: false, hooksPerWeek: 2, liveTarget: 6, researchMonthly: true });
    await t.action(internal.ads.researchRun, { everyTrade: true });
    const queued = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    const trades = queued.map((q) => (q.args[0] as { trade: string }).trade);
    expect(trades.length).toBe(Object.values(AD_TRADES).filter((x) => x.keywords.length > 0).length);
    expect(new Set(trades).size).toBe(trades.length);
    const times = queued.map((q) => q.scheduledTime).sort((a, b) => a - b);
    // A few milliseconds pass between the runs being queued.
    expect(Math.abs(times.at(-1)! - times[0] - (trades.length - 1) * 15 * 60_000)).toBeLessThan(1000);
  });

  test("a search keeps the long-runners, drops junk after Claude reads it, flags local ads, transcribes video and writes the playbook", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    await expect(owner.as.mutation(api.ads.researchNow, {})).rejects.toThrow("APIFY_TOKEN");
    vi.stubEnv("APIFY_TOKEN", "ap");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("ELEVENLABS_API_KEY", "e");
    await owner.as.mutation(api.ads.saveSettings, {
      weeklyEnabled: false,
      hooksPerWeek: 2,
      liveTarget: 6,
      researchKeywords: ["cabinet painting", "house painter"],
      researchMarkets: ["Midland", "Odessa"],
      researchMinDays: 90,
    });
    await owner.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "before.jpg", tags: ["cabinets", "before"], pairKey: "k" });
    const calls: Array<{ url: string; body?: string }> = [];
    stubServices(calls);
    vi.useFakeTimers();
    await expect(staff.as.mutation(api.ads.researchNow, {})).rejects.toThrow("Only Webb Leads admins");
    await owner.as.mutation(api.ads.researchNow, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();

    const [run] = await staff.as.query(api.ads.listResearchRuns, {});
    // 4 + 2 items scanned; the young one and the id-less one fall out; 9001 is seen twice; the kids' class is read and dropped.
    expect(run).toMatchObject({ scanned: 6, kept: 3, added: 3, junk: 1, unreadable: 1, keywords: ["cabinet painting", "house painter"] });
    expect(run.finishedAt).toBeTruthy();
    expect(run.error).toBeUndefined();
    const allBodies = calls.filter((c) => c.url.includes("api.apify.com")).map((c) => JSON.parse(c.body!));
    const apifyBodies = allBodies.filter((b) => b.activeStatus === "active");
    expect(apifyBodies.map((b) => b.query)).toEqual(["cabinet painting", "house painter"]);
    expect(apifyBodies[0]).toMatchObject({ country: "US", activeStatus: "active", maxItems: 200 });
    // After each keyword, a smaller look at the stopped ones.
    expect(allBodies.filter((b) => b.activeStatus === "inactive").map((b) => [b.query, b.maxItems])).toEqual([
      ["cabinet painting", 100],
      ["house painter", 100],
    ]);

    const swipes = await staff.as.query(api.ads.listSwipes, {});
    expect(swipes.map((x) => x.company).sort()).toEqual(["Jesse McCandless Painting", "Lubbock Cabinet Co"]);
    const jesse = swipes.find((x) => x.company === "Jesse McCandless Painting")!;
    expect(jesse).toMatchObject({
      metaAdId: "9001",
      scope: "cabinets",
      paintingType: "Cabinets",
      hook: "cabinets angle",
      family: "before_after",
      opening: "owner",
      footage: ["owner_to_camera", "before_after"],
      claims: ["$500 off this month", "10-year warranty"],
      quality: 48,
      local: true,
      variants: 3,
      pageLikes: 1200,
      mediaType: "video",
      transcript: "Hey Midland, Jesse here. We paint it like it's our own house.",
      durationSec: 11.9,
      source: `research ${new Date().toISOString().slice(0, 10)}`,
    });
    expect(jesse.daysRunning).toBeGreaterThanOrEqual(139);
    const lubbock = swipes.find((x) => x.company === "Lubbock Cabinet Co")!;
    expect(lubbock).toMatchObject({ local: false, mediaType: "image" });
    expect(lubbock.transcript).toBeUndefined();
    expect(swipes[0].company).toBe("Jesse McCandless Painting");

    // The cabinets playbook was written from the two cabinet ads plus nothing else (interior and exterior have too few).
    const playbooks = await staff.as.query(api.ads.listPlaybooks, {});
    expect(playbooks.map((p) => p.scope)).toEqual([]);
    // Three is the floor: one more cabinets ad, read, and the playbook appears.
    vi.useFakeTimers();
    await staff.as.mutation(api.ads.importSwipes, {
      source: "VA extra",
      rows: [
        {
          company: "Third Cabinet Co",
          paintingType: "Cabinets",
          scope: "cabinets",
          hook: "Before / after",
          offer: "Quote",
          creative: "Carousel",
          area: "Odessa",
          cta: "Get quote",
          adaptation: "Try it",
          metaAdId: "9009",
          startedAt: "2026-01-05",
        },
      ],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const third = (await staff.as.query(api.ads.listSwipes, {})).find((x) => x.company === "Third Cabinet Co")!;
    expect(third).toMatchObject({ local: true, scope: "cabinets", quality: 48, hook: "Before / after", area: "Odessa" });
    const [cabinets] = await staff.as.query(api.ads.listPlaybooks, {});
    expect(cabinets).toMatchObject({
      scope: "cabinets",
      text: PLAYBOOK_REPLY.text,
      footagePrefs: ["before", "after", "crew"],
      angleFamilies: ["before_after", "owner_story"],
      localCompetitors: [{ company: "Jesse McCandless Painting", angle: "owner story", daysRunning: 140 }],
      missingFootage: ["A clip of the owner talking to camera for 10 seconds"],
      basis: { ads: 3, local: 2 },
    });
    expect(cabinets.editedAt).toBeUndefined();
    const playbookPrompt = calls
      .filter((c) => c.url.includes("api.anthropic.com"))
      .map((c) => (JSON.parse(c.body!).messages[0].content as Array<{ type: string; text?: string }>).find((x) => x.type === "text")?.text ?? "")
      .find((p) => p.includes(PLAYBOOK_MARK))!;
    expect(playbookPrompt).toContain("Jesse McCandless Painting · 1");
    expect(playbookPrompt).toContain("LOCAL");
    expect(playbookPrompt).toContain("The owner's library, by tag: before 1, cabinets 1.");
    expect(playbookPrompt).toContain("never a competitor's price");

    // A human edit holds through the next automatic rewrite, and gives way to "Rewrite".
    await staff.as.mutation(api.ads.savePlaybook, { scope: "cabinets", text: "Our own read: owner first, then the kitchen, then the ask." });
    await staff.as.mutation(api.ads.starSwipe, { id: jesse.id, starred: true });
    await t.mutation(internal.ads.savePlaybookAuto, { scope: "cabinets", playbook: PLAYBOOK_REPLY, basis: { ads: 3, local: 2, oldestDays: 200 } });
    expect((await staff.as.query(api.ads.listPlaybooks, {}))[0]).toMatchObject({
      text: "Our own read: owner first, then the kitchen, then the ask.",
      editedAt: expect.any(String),
    });
    vi.useFakeTimers();
    await staff.as.mutation(api.ads.rewritePlaybook, { scope: "cabinets" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const rewritten = (await staff.as.query(api.ads.listPlaybooks, {}))[0];
    expect(rewritten.text).toBe(PLAYBOOK_REPLY.text);
    expect(rewritten.editedAt).toBeUndefined();
    await expect(staff.as.mutation(api.ads.savePlaybook, { scope: "cabinets", text: "short" })).rejects.toThrow("at least a sentence");
  });

  test("the Monday writer follows the playbook: its text is in the prompt and the footage picker leans its way", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await library(t, owner);
    await t.mutation(internal.ads.savePlaybookAuto, {
      scope: "cabinets",
      playbook: { ...PLAYBOOK_REPLY, text: "Cabinets winners open on the owner." },
      basis: { ads: 5, local: 1, oldestDays: 300 },
    });
    await t.mutation(internal.ads.savePlaybookAuto, {
      scope: "general",
      playbook: { ...PLAYBOOK_REPLY, text: "Across painting, the long-runners open on a question." },
      basis: { ads: 12, local: 2, oldestDays: 400 },
    });
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("ELEVENLABS_API_KEY", "e");
    await owner.as.mutation(api.ads.saveSettings, {
      voiceId: "ven",
      weeklyEnabled: true,
      hooksPerWeek: 2,
      liveTarget: 6,
      researchMarkets: ["Odessa", "Midland"],
    });
    const calls: Array<{ url: string; body?: string }> = [];
    stubServices(calls);
    vi.useFakeTimers();
    await owner.as.mutation(api.ads.draftNow, {});
    await oneAtATime(t);
    vi.useRealTimers();
    const prompts = calls
      .filter((c) => c.url.includes("api.anthropic.com"))
      .map((c) => (JSON.parse(c.body!).messages[0].content as Array<{ type: string; text?: string }>).find((x) => x.type === "text")?.text ?? "");
    const cabinets = prompts.find((p) => p.includes("Scope: cabinets."))!;
    expect(cabinets).toContain("What works in this category");
    expect(cabinets).toContain("Cabinets winners open on the owner.");
    // The home market from Settings, not a hardcoded town.
    expect(cabinets).toContain("a painting contractor in Odessa, Texas");
    expect(cabinets).toContain('Say "Odessa homeowners"');
    // A scope with no playbook of its own writes to the general one.
    const interior = prompts.find((p) => p.includes("Scope: interior."))!;
    expect(interior).toContain("Across painting, the long-runners open on a question.");
    expect(interior).not.toContain("Cabinets winners");
    // The renderer is told the markets in the owner's order, for the end card.
    const [job] = await t.mutation(internal.ads.claimRenders, { limit: 1 });
    expect(job.props.brand.markets).toEqual(["Odessa", "Midland"]);
  });

  test("readiness says what Monday needs; the live target stops a batch; Draft now refuses while one is drafting", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    let checks = await owner.as.query(api.ads.readiness, {});
    expect(checks.map((c) => [c.key, c.ok, c.hard])).toEqual([
      ["keys", false, true],
      ["library", false, true],
      ["hooks", false, true],
      ["playbook", false, false],
      ["renderer", false, false],
      ["meta", false, false],
    ]);
    expect(checks[0].detail).toBe("Set ANTHROPIC_API_KEY, ELEVENLABS_API_KEY on the deployment");
    expect(checks[4].detail).toContain("No ADS_RENDER_TOKEN yet");
    expect(checks[1].detail).toBe("0 of at least 3 files");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("ELEVENLABS_API_KEY", "e");
    await library(t, owner);
    checks = await owner.as.query(api.ads.readiness, {});
    expect(checks.filter((c) => c.hard).every((c) => c.ok)).toBe(true);
    expect(checks.find((c) => c.key === "library")!.detail).toBe("3 files, 2 tagged by room");
    expect(checks.find((c) => c.key === "meta")).toMatchObject({ ok: false, tab: "settings" });

    // Two live ads against a target of two: Monday says so instead of spending.
    await owner.as.mutation(api.ads.saveSettings, { weeklyEnabled: true, hooksPerWeek: 2, liveTarget: 2 });
    await t.run(async (ctx) => {
      const hook = (await ctx.db.query("adHooks").take(1))[0];
      const batchId = await ctx.db.insert("adBatches", { weekOf: "2026-10-26", status: "done", createdAt: new Date().toISOString() });
      for (const ratio of ["9x16", "4x5"] as const)
        await ctx.db.insert("adCreatives", {
          batchId,
          hookId: hook._id,
          ratio,
          name: `WL_live_${ratio}`,
          script: GOOD,
          assetIds: [],
          status: "live",
          createdAt: new Date().toISOString(),
          meta: { adId: `ad-${ratio}` },
        });
    });
    const calls: Array<{ url: string; body?: string }> = [];
    stubServices(calls);
    vi.useFakeTimers();
    await owner.as.mutation(api.ads.draftNow, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const [batch] = await owner.as.query(api.ads.batches, {});
    expect(batch).toMatchObject({
      status: "failed",
      error: "2 ads are live and the target is 2. Retire one under Live, or raise the target in Settings.",
    });
    expect(calls.filter((c) => c.url.includes("api.anthropic.com") && c.body?.includes("You write one short")).length).toBe(0);

    // A batch still drafting blocks a second Draft now.
    await t.run((ctx) => ctx.db.insert("adBatches", { weekOf: "2026-11-02", status: "drafting", createdAt: new Date().toISOString() }));
    await expect(owner.as.mutation(api.ads.draftNow, {})).rejects.toThrow("already drafting");
  });
});
