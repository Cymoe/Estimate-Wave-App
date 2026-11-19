import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
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
  motionPlanProblems,
  motionPrompt,
  parseCsv,
  parseJson,
  pickAssets,
  pickExamples,
  pickHooks,
  qualifies,
  readPlaybook,
  readSwipeTags,
  renderProps,
  swipeScore,
  shotTimings,
  weekOf,
  wordTimings,
  type Script,
} from "./lib/ads";
import { setup, signUp } from "./test.setup";
import { SWIPE_SEEDS } from "./catalog/swipes";

type T = ReturnType<typeof setup>;
const store = (t: T, type = "image/jpeg", body = "bytes") => t.run((ctx) => ctx.storage.store(new Blob([body], { type })));

const GOOD: Script = {
  voice:
    "Paint them, don't replace them. Professionally painted cabinets change the whole kitchen without a full remodel. Vetted Midland painters prep every door, spray a smooth finish and put the hardware back. Tell us about your kitchen and one local painter calls you with a free quote. Get a quote today.",
  onScreen: ["Paint, don't replace", "Vetted Midland painters", "Get a quote"],
  headline: "Cabinets painted, kitchen transformed",
  primaryText: "A fresh finish on the cabinets you have. One vetted local painter, one free quote, no pressure.",
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
      { photo: second, voice: "Permian Home Quotes matches you with one vetted local painter. Get a quote today." },
    ],
    headline: GOOD.headline,
    primaryText: GOOD.primaryText,
    ...over,
  };
}

describe("an animated ad's pure parts", () => {
  const brand = { name: "Webb Leads", primaryColor: "#336699", accentColor: "#8fb6e0", markets: ["Midland", "Odessa"] };
  const pair = [
    { tags: ["cabinets", "before"], pairKey: "k" },
    { tags: ["cabinets", "after"], pairKey: "k" },
  ];
  const loose = [{ tags: ["interior"] }, { tags: ["interior"] }];

  test("the prompt lists the photos by number with their pairs, offers the three styles, and carries the rules", () => {
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
    expect(text).toContain('"lightUp"');
    expect(text).toContain('"beforeAfter": only when two of the photos are one pair');
    expect(text).toContain("Never invent counts of jobs, years, reviews or customers.");
    expect(text).toContain("never as a homeowner or customer");
    expect(text).toContain("its final sentence asks the viewer to get a quote");
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
      adCopy: "Why replace\nwhen you can refinish?",
    });
    expect(around).toContain("Build this ad around a competitor's ad that has been running for 659 days.");
    expect(around).toContain("- Its angle: Paint instead of replace");
    expect(around).toContain("- Its offer: Free estimate; replacement-cost alternative");
    expect(around).toContain("- Its words (Precision Painting NY INC.) · copy: Why replace when you can refinish?");
    expect(around).toContain("Make the offer the nearest thing Webb Leads truly gives: a free quote from one vetted local painter.");
    expect(around).toContain("Never their name, price, discount, warranty, award, review count or deadline.");
    expect(around).not.toContain("How it opens");
  });

  test("the rules: a style, a title, three to five lines on photos that were offered, a last line that asks, and no forbidden claims", () => {
    const good = motionPlanFor(2);
    expect(motionPlanProblems(good, loose)).toEqual([]);
    expect(motionPlanProblems({ ...good, style: "explode" }, loose)).toEqual(['style "explode" (choose lightUp, beforeAfter or counter)']);
    expect(motionPlanProblems({ ...good, title: "x".repeat(31) }, loose)).toEqual(["title over 30 characters"]);
    expect(motionPlanProblems({ ...good, lines: good.lines.slice(0, 2) }, loose)).toEqual(expect.arrayContaining(["2 lines (write 3 to 5)"]));
    expect(motionPlanProblems({ ...good, lines: [{ ...good.lines[0], photo: 3 }, ...good.lines.slice(1)] }, loose)).toEqual(["line 1 names photo 3"]);
    expect(motionPlanProblems({ ...good, lines: [...good.lines.slice(0, 3), { photo: 2, voice: "Permian Home Quotes matches you with one vetted local painter near you." }] }, loose)).toEqual([
      "the last line doesn't ask for a quote",
    ]);
    // About twenty seconds of voice, and no line so long the screen sits still.
    const long = "Get the outside painted before the first freeze, because West Texas sun and hail are hard on paint all year.";
    expect(motionPlanProblems({ ...good, lines: [{ photo: 1, voice: long }, ...good.lines.slice(1)] }, loose)).toEqual(["60 words of voice (write 40 to 50)", "line 1 is 20 words (at most 15)"]);
    expect(motionPlanProblems({ ...good, primaryText: "Cabinets from $1,200 this month" }, loose)).toEqual(["mentions a price or discount"]);
    expect(motionPlanProblems({ ...good, title: "10-year warranty" }, loose)).toEqual(["mentions a warranty or guarantee"]);
    expect(motionPlanProblems({ ...good, lines: [{ ...good.lines[0], label: "x".repeat(25) }, ...good.lines.slice(1)] }, loose)).toEqual([
      "line 1's label is over 24 characters",
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
      { value: 1, label: "vetted local painter" },
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
    // A photo gone from the library stops the ad rather than drawing a hole.
    expect(() => renderProps({ ...base, design, photos: new Map([["a", photos.get("a")!]]) })).toThrow("A line's photo is missing from the library");
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
    expect(text.indexOf("Open with the owner")).toBeLessThan(text.indexOf("Choose the one style"));
    expect(motionPrompt(hook, "B", [], true)).not.toContain("What works in this category");
  });

  test("Claude's tag and playbook replies are cleaned: unknown families, tags and openings fall away; junk is junk", () => {
    const tags = readSwipeTags(
      JSON.stringify({ ...tagReplyFor("Advertiser: Acme cabinet"), family: "bogus", opening: "weird", footage: ["before_after", "x"], quality: 99 }),
    )!;
    expect(tags).toMatchObject({ painting: true, scope: "cabinets", family: "proof", opening: "other", footage: ["before_after"], quality: 60 });
    expect(readSwipeTags("not json")).toBeNull();
    expect(readSwipeTags(JSON.stringify({ paintingType: "Interior" }))).toBeNull();
    const pb = readPlaybook("```json\n" + JSON.stringify(PLAYBOOK_REPLY) + "\n```")!;
    expect(pb.footagePrefs).toEqual(["before", "after", "crew"]);
    expect(pb.angleFamilies).toEqual(["before_after", "owner_story"]);
    expect(pb.localCompetitors).toEqual([{ company: "Jesse McCandless Painting", angle: "owner story", daysRunning: 140 }]);
    expect(readPlaybook(JSON.stringify({ text: "" }))).toBeNull();
  });
});

describe("the library, hooks and settings", () => {
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
      researchKeywords: ["cabinet painting", "interior painting", "exterior house painting", "house painter"],
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
  style?: "beforeAfter";
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
  const row = ([line, opening, scope, from]: readonly [string, string, string, number]) => ({ line, opening, scope, from, family: "objection", usual: 0.2 });
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
        if (prompt.includes(IDEA_MARK)) reply = { ideas: ideasOf(prompt) };
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
        else if (opts.badFirst && !retry) reply = motionPlanFor(offered, { lines: [] });
        else if (opts.style === "beforeAfter") reply = motionPlanFor(offered, { style: "beforeAfter", revealOn: "finish" });
        else reply = motionPlanFor(offered);
        return new Response(JSON.stringify({ content: [{ type: "text", text: "Here it is: " + JSON.stringify(reply) }] }));
      }
      if (url.includes("api.apify.com")) {
        const query = JSON.parse(body!).query as string;
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
      if (url.includes("api.github.com")) return new Response(opts.github && opts.github >= 400 ? "Resource not accessible" : null, { status: opts.github ?? 204 });
      if (url.includes("graph.facebook.com")) {
        const path = new URL(url).pathname;
        return new Response(
          JSON.stringify({
            id: path.endsWith("/advideos") ? "vid1" : path.endsWith("/adcreatives") ? "cr1" : path.endsWith("/ads") ? "ad1" : "ok",
            success: true,
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
      transcript: "[00:00] We take the doors off site and spray the boxes at your home.",
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
  async function ready(opts: { hooks?: number; meta?: boolean; token?: boolean } = {}) {
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

  test("a video that can't be drawn fails that ad with the reason and the batch still finishes; drawn again, it keeps its words and voice", async () => {
    const { t, calls, settle, draft, draw, latest } = await ready();
    stubServices(calls);
    const drafted = await draft();
    await draw("the photo wouldn't load");
    let batch = await latest();
    expect(batch).toMatchObject({ status: "ready", summary: "0 paused in Meta · 2 failed" });
    expect(batch.creatives.map((c) => c.error)).toEqual(["Couldn't draw the video: the photo wouldn't load", "Couldn't draw the video: the photo wouldn't load"]);

    // After a fix to how ads are drawn, the same ad goes back in the queue: nothing is rewritten or re-read.
    const asked = { claude: to(calls, "anthropic").length, voice: to(calls, "elevenlabs").length };
    const [tall] = batch.creatives;
    expect(await settle(() => t.mutation(internal.ads.rerender, { names: [tall.name, "WL_nobody"] }))).toEqual({ sent: [tall.name] });
    expect(states(await latest())).toEqual(["9x16 voiced", "4x5 failed: Couldn't draw the video: the photo wouldn't load"]);
    expect((await draw()).map((j) => j.name)).toEqual([tall.name]);
    batch = await latest();
    expect(batch.creatives[0]).toMatchObject({ status: "rendered", script: drafted.creatives[0].script });
    expect(batch.creatives[0].videoUrl).toContain("/api/storage/");
    expect({ claude: to(calls, "anthropic").length, voice: to(calls, "elevenlabs").length }).toEqual(asked);
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

  test("a reply that isn't a plan is passed over saying what came back instead, or that it was cut off", async () => {
    const { calls, draft } = await ready();
    stubServices(calls, { notJson: { scope: "cabinets" } });
    const batch = await draft();
    expect(batch.creatives.length).toBe(2);
    expect(batch.skipped[0]).toMatch(/: the ad still broke the rules: the reply wasn't JSON: it began "Looking at the photos, I'd open on the kitchen\."$/);
    // Asked twice (the retry names the problem), with room to finish.
    const asks = to(calls, "anthropic").map((c) => JSON.parse(c.body!));
    expect(asks.filter((a) => a.messages[0].content[0].text.includes("Scope: cabinets.")).map((a) => a.max_tokens)).toEqual([4000, 4000]);

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
    expect(asks[1][asks[1].length - 1].text).toMatch(/^Your last answer had these problems: .*0 lines \(write 3 to 5\)/);
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
      expect(ideas[1].basedOn).toBeUndefined();

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
  });
});

describe("niche research", () => {
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
    const apifyBodies = calls.filter((c) => c.url.includes("api.apify.com")).map((c) => JSON.parse(c.body!));
    expect(apifyBodies.map((b) => b.query)).toEqual(["cabinet painting", "house painter"]);
    expect(apifyBodies[0]).toMatchObject({ country: "US", activeStatus: "active", maxItems: 200 });

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
    expect(cabinets).toContain("a service in Odessa, Texas");
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
