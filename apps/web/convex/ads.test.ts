import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  composeScript,
  creativeName,
  familyOfAngle,
  isFatigued,
  mergeSwipeCsvs,
  parseCsv,
  parseJson,
  pickAssets,
  pickExamples,
  pickHooks,
  scriptProblems,
  shotListPrompt,
  shotPlanProblems,
  shotTimings,
  shotstackEdit,
  weekOf,
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
  test("hooks: active, least used first, never a family already live", () => {
    const hooks = [
      { _id: "a", family: "before_after" as const, scope: "cabinets", active: true, uses: 2 },
      { _id: "b", family: "education" as const, scope: "interior", active: true, uses: 0, lastUsedAt: "2026-10-01" },
      { _id: "c", family: "seasonal" as const, scope: "exterior", active: true, uses: 0 },
      { _id: "d", family: "objection" as const, scope: "interior", active: false, uses: 0 },
    ];
    expect(pickHooks(hooks, new Set(["seasonal"]), 2).map((h) => h._id)).toEqual(["b", "a"]);
    expect(pickHooks(hooks, new Set(), 2).map((h) => h._id)).toEqual(["c", "b"]);
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

  test("the shot-list prompt lists the footage by number, says when it's only fallback footage, and carries the rules", () => {
    const hook = { textEn: "Paint them, don't replace them.", family: "before_after" as const, scope: "cabinets" };
    const footage = [
      { kind: "photo" as const, tags: ["cabinets", "before"], pairKey: "k", description: "Dark oak kitchen cabinets", imageUrl: "https://x/1.jpg" },
      { kind: "video" as const, tags: ["process"], durationSec: 7.6 },
    ];
    const text = shotListPrompt(hook, "Permian Home Quotes", footage, false);
    expect(text).toContain('Footage 1: photo · tags: cabinets, before · pair "k" · looks like: Dark oak kitchen cabinets · (image attached below)');
    expect(text).toContain("Footage 2: video (8s) · tags: process · (no image available; rely on the tags)");
    expect(text).toContain("None of this footage is tagged cabinets");
    expect(text).toContain("never as a homeowner or customer");
    expect(text).toContain("A before must be immediately followed by its after");
    expect(shotListPrompt(hook, "B", footage, true)).not.toContain("None of this footage");
  });

  test("a shot list is checked against the footage it was offered, then becomes the stored script", () => {
    const footage = [{ tags: ["cabinets", "before"], pairKey: "k" }, { tags: ["cabinets", "after"], pairKey: "k" }, { tags: ["process"] }];
    const line = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    const good = {
      fits: true,
      shots: [
        { footage: 1, voice: `These cabinets ${line(18)}`, onScreen: "Before" },
        { footage: 2, voice: `and after ${line(18)}`, onScreen: "After" },
        { footage: 3, voice: `get a quote ${line(18)}`, onScreen: "Get a quote" },
      ],
      headline: "Cabinets, transformed",
      primaryText: "One vetted local painter.",
    };
    expect(shotPlanProblems(good, footage)).toEqual([]);
    expect(shotPlanProblems({ ...good, shots: [good.shots[0], good.shots[2], good.shots[1]] }, footage)).toContain(
      "the before in footage 1 isn't followed by its after",
    );
    expect(shotPlanProblems({ ...good, shots: [good.shots[0], { ...good.shots[1], footage: 1 }] }, footage)).toEqual(
      expect.arrayContaining(["footage 1 used twice"]),
    );
    expect(shotPlanProblems({ ...good, shots: [{ ...good.shots[0], footage: 9 }, good.shots[1]] }, footage)).toContain("shot 1 names footage 9");
    expect(
      shotPlanProblems(
        {
          ...good,
          shots: [
            { ...good.shots[0], voice: "Short." },
            { ...good.shots[1], voice: "Too." },
          ],
        },
        footage,
      ),
    ).toContain("2 words of voice (write 55 to 75)");
    expect(shotPlanProblems({ ...good, shots: [{ ...good.shots[0], onScreen: "x".repeat(41) }, good.shots[1]] }, footage)).toEqual(
      expect.arrayContaining(["shot 1 on-screen line over 40 characters"]),
    );
    const script = composeScript(good, ["a1", "a2", "a3"]);
    expect(script.shots!.map((x) => [x.assetId, x.onScreen])).toEqual([
      ["a1", "Before"],
      ["a2", "After"],
      ["a3", "Get a quote"],
    ]);
    expect(script.voice).toBe(good.shots.map((x) => x.voice).join(" "));
    expect(script.onScreen).toEqual(["Before", "After", "Get a quote"]);
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

  test("scripts: the guardrails reject prices, promises and a customer's voice; good copy passes; JSON comes out of a fence", () => {
    expect(scriptProblems(GOOD)).toEqual([]);
    expect(scriptProblems({ ...GOOD, primaryText: "Cabinets from $1,200 this month" })).toContain("mentions a price or discount");
    expect(scriptProblems({ ...GOOD, voice: GOOD.voice + " They painted my kitchen and I loved it." })).toContain("mentions a customer voice");
    expect(scriptProblems({ ...GOOD, headline: "Done in 3 days, 10-year warranty included" })).toEqual(
      expect.arrayContaining(["headline over 40 characters", "mentions a warranty or guarantee", "mentions a completion time"]),
    );
    expect(scriptProblems({ ...GOOD, onScreen: ["Is your home in Midland?"] })).toContain("mentions a personal attribute");
    expect(scriptProblems(undefined)).toEqual(["no script"]);
    expect(parseJson('Here you go:\n```json\n{"fits":false,"reason":"x"}\n```')).toEqual({ fits: false, reason: "x" });
    expect(parseJson("no json here")).toBeNull();
  });

  test("the Shotstack edit: each shot starts on its line, its words sit on it, an after wipes over its before, short clips repeat", () => {
    const brand = { name: "Permian Home Quotes", primaryColor: "#336699", accentColor: "#8fb6e0" };
    const before = { url: "https://x/before.jpg", kind: "photo" as const, tags: ["cabinets", "before"], pairKey: "k" };
    const after = { url: "https://x/after.jpg", kind: "photo" as const, tags: ["cabinets", "after"], pairKey: "k" };
    const clip = { url: "https://x/clip.mp4", kind: "video" as const, tags: ["process"], durationSec: 3 };
    const edit = shotstackEdit({
      shots: [
        { asset: before, onScreen: "Before", start: 0.2, end: 6 },
        { asset: after, onScreen: "After", start: 6.4, end: 12 },
        { asset: clip, onScreen: "Get a quote", start: 12.5, end: 20 },
      ],
      audioUrl: "https://x/voice.mp3",
      audioDurationSec: 20,
      brand,
      ratio: "9x16",
    });
    expect(edit.output).toEqual({ format: "mp4", fps: 25, size: { width: 1080, height: 1920 } });
    const tracks = edit.timeline.tracks as Array<{ clips: any[] }>;
    const [captions, lines, brandTrack, media, audio] = tracks;
    expect(captions.clips[0]).toMatchObject({ asset: { type: "caption", src: "alias://voice" }, start: 0, length: 20.4 });
    // Clips: 0–6.4 before, 6.4–12.5 after (wipe), then the 3s clip three times to fill 12.5–20.4.
    expect(media.clips.map((c) => [c.asset.src, c.start, c.length, c.transition?.in])).toEqual([
      ["https://x/before.jpg", 0, 6.4, undefined],
      ["https://x/after.jpg", 6.4, 6.1, "wipeLeft"],
      ["https://x/clip.mp4", 12.5, 3, undefined],
      ["https://x/clip.mp4", 15.5, 3, undefined],
      ["https://x/clip.mp4", 18.5, 1.9, undefined],
    ]);
    // Each on-screen line sits on its own shot.
    expect(lines.clips.map((c) => [c.asset.html, c.start, c.length])).toEqual([
      ["<p>Before</p>", 0, 6.4],
      ["<p>After</p>", 6.4, 6.1],
      ["<p>Get a quote</p>", 12.5, 7.9],
    ]);
    // End card after the voice, 3 seconds.
    expect(brandTrack.clips[1]).toMatchObject({ start: 20.4, length: 3 });
    expect(brandTrack.clips[1].asset.html).toContain("Get a quote");
    expect(audio.clips[0]).toMatchObject({ alias: "voice", asset: { src: "https://x/voice.mp3" }, start: 0, length: 20 });

    // No wipe when the after doesn't follow its own before.
    const swapped = shotstackEdit({
      shots: [
        { asset: after, onScreen: "A", start: 0, end: 3 },
        { asset: before, onScreen: "B", start: 3, end: 6 },
      ],
      audioUrl: "https://x/v.mp3",
      audioDurationSec: 6,
      brand,
      ratio: "4x5",
    });
    expect(swapped.output.size).toEqual({ width: 1080, height: 1350 });
    expect((swapped.timeline.tracks as Array<{ clips: any[] }>)[3].clips.some((c) => c.transition)).toBe(false);
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
    const text = shotListPrompt(hook, "B", [], true, examples);
    expect(text).toContain("for tone and shape only. Never copy their claims, prices, discounts, names, warranties or deadlines.");
    expect(text).toContain("Example 1 (Acme; angle: Cost; offer: Free quote) · spoken (14s): Hi there. Paint them.");
    expect(text).toContain(`Example 2 (Bee; angle: Selfie; offer: None) · copy: ${"x".repeat(300)}`);
    expect(text).not.toContain("x".repeat(301));
    expect(shotListPrompt(hook, "B", [], true)).not.toContain("tone and shape");
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
    vi.stubEnv("SHOTSTACK_API_KEY", "sk");
    const before = await staff.as.query(api.ads.settings, {});
    expect(before).toMatchObject({
      brand: "Permian Home Quotes",
      weeklyEnabled: false,
      hooksPerWeek: 2,
      liveTarget: 6,
      keys: { shotstack: true, anthropic: false },
    });
    const data = { adAccountId: "act_123", pageId: "77", leadFormId: "", adsetId: "900", weeklyEnabled: true, hooksPerWeek: 9, liveTarget: 1 };
    await expect(staff.as.mutation(api.ads.saveSettings, data)).rejects.toThrow("Only Webb Leads admins");
    await owner.as.mutation(api.ads.saveSettings, data);
    expect(await staff.as.query(api.ads.settings, {})).toMatchObject({
      adAccountId: "123",
      pageId: "77",
      adsetId: "900",
      weeklyEnabled: true,
      hooksPerWeek: 4,
      liveTarget: 2,
    });
  });
});

/** A valid shot list for however much footage the request offered, 60 words in all. */
function shotListFor(prompt: string, primaryText = GOOD.primaryText) {
  const count = Math.min(4, (prompt.match(/^Footage \d+:/gm) ?? []).length);
  const words = GOOD.voice.split(/\s+/).slice(0, 52).concat(["Get", "a", "quote", "today", "from", "a", "local", "painter."]);
  const per = Math.ceil(words.length / count);
  return {
    fits: true,
    shots: Array.from({ length: count }, (_, i) => ({
      footage: i + 1,
      voice: words.slice(i * per, (i + 1) * per).join(" "),
      onScreen: `Shot ${i + 1}`,
    })),
    headline: GOOD.headline,
    primaryText,
  };
}

type StubOpts = {
  /** Every shot list carries a price. */
  scriptsFail?: boolean;
  /** The first shot list for each hook breaks a rule; the retry is fine. */
  badFirst?: boolean;
  /** Claude passes on hooks whose prompt names this scope. */
  passOnScope?: string;
  renderFails?: boolean;
};

/** What each outside service answers during a weekly run. */
function stubServices(calls: Array<{ url: string; body?: string }>, opts: StubOpts = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : undefined;
      calls.push({ url, body });
      if (url.includes("api.anthropic.com")) {
        const content = JSON.parse(body!).messages[0].content as Array<{ type: string; text?: string }>;
        const prompt = content[0].text ?? "";
        const retry = content.some((c) => c.text?.startsWith("Your last shot list had these problems"));
        let reply: unknown;
        if (opts.passOnScope && prompt.includes(`Scope: ${opts.passOnScope}.`))
          reply = { fits: false, reason: `no ${opts.passOnScope} in this footage` };
        else if (opts.scriptsFail) reply = shotListFor(prompt, "Only $999 this week");
        else if (opts.badFirst && !retry) reply = { ...shotListFor(prompt), shots: [] };
        else reply = shotListFor(prompt);
        return new Response(JSON.stringify({ content: [{ type: "text", text: "Here it is: " + JSON.stringify(reply) }] }));
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
      if (url.includes("shotstack.io") && url.endsWith("/render")) return new Response(JSON.stringify({ response: { id: `r-${calls.length}` } }));
      if (url.includes("shotstack.io/edit/v1/render/"))
        return new Response(
          JSON.stringify({
            response: opts.renderFails ? { status: "failed", error: "bad asset" } : { status: "done", url: "https://cdn.shotstack.io/out.mp4" },
          }),
        );
      if (url.includes("cdn.shotstack.io")) return new Response(new Blob(["mp4"], { type: "video/mp4" }));
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
  await staff.as.mutation(api.ads.seedSwipes, {});
  const rodgers = (await staff.as.query(api.ads.listSwipes, {})).find((x) => x.company === "Rodgers Painting")!;
  await staff.as.mutation(api.ads.starSwipe, { id: rodgers.id, starred: true });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "before.jpg", tags: ["cabinets", "before"], pairKey: "k" });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "after.jpg", tags: ["cabinets", "after"], pairKey: "k" });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "video/mp4", "mp4"), fileName: "roller.mp4", tags: ["process"] });
}

describe("the weekly run", () => {
  test("drafts two hooks in two sizes, voices, renders and creates each PAUSED in Meta; the batch is ready and staff hear", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await library(t, owner);
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("ELEVENLABS_API_KEY", "e");
    vi.stubEnv("SHOTSTACK_API_KEY", "s");
    vi.stubEnv("META_ACCESS_TOKEN", "m");
    vi.stubEnv("CONSUMER_BRAND", "Permian Home Quotes");
    await owner.as.mutation(api.ads.saveSettings, {
      adAccountId: "123",
      pageId: "77",
      leadFormId: "f1",
      adsetId: "900",
      voiceId: "ven",
      weeklyEnabled: true,
      hooksPerWeek: 2,
      liveTarget: 6,
    });
    const calls: Array<{ url: string; body?: string }> = [];
    stubServices(calls);
    vi.useFakeTimers();
    await owner.as.mutation(api.ads.draftNow, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();

    const [batch] = await owner.as.query(api.ads.batches, {});
    // Named so a failed creative says why, not just that it failed.
    expect(batch.creatives.map((c) => `${c.status}${c.error ? `: ${c.error}` : ""}`)).toEqual(["paused", "paused", "paused", "paused"]);
    expect(batch).toMatchObject({ status: "ready", summary: "4 paused in Meta" });
    expect(batch.creatives.length).toBe(4);
    expect(new Set(batch.creatives.map((c) => c.hook!.family)).size).toBe(2);
    expect(batch.creatives.every((c) => c.status === "paused" && c.videoUrl && c.meta?.adId === "ad1" && c.meta?.adsetId === "900")).toBe(true);
    const tall = batch.creatives.find((c) => c.ratio === "9x16")!;
    expect(tall.name).toMatch(/^WL_[a-z0-9]{6}_916_\d{8}$/);
    // The cabinets writer saw the swipe file: the starred Rodgers ad first, as tone only.
    const cabinetsPrompt = calls
      .filter((c) => c.url.includes("api.anthropic.com"))
      .map((c) => (JSON.parse(c.body!).messages[0].content as Array<{ text?: string }>)[0].text ?? "")
      .find((p) => p.includes("Scope: cabinets."))!;
    expect(cabinetsPrompt).toContain("for tone and shape only");
    expect(cabinetsPrompt).toMatch(/Example 1 \(Rodgers Painting; [^)]*\) · spoken \(\d+s\)/);
    expect(tall.script.headline).toBe(GOOD.headline);
    // The hooks were used once each; the pair went to the cabinets hook, the roller clip to the other.
    const hooks = await owner.as.query(api.ads.listHooks, {});
    expect(hooks.filter((h) => h.uses === 1).length).toBe(2);
    const cabinets = batch.creatives.find((c) => c.hook!.scope === "cabinets" && c.ratio === "9x16")!;
    const other = batch.creatives.find((c) => c.hook!.scope !== "cabinets" && c.ratio === "9x16")!;
    // Each creative carries its shot list, timed from ElevenLabs' character times.
    expect(cabinets.shots.map((x) => [x.fileName, x.onScreen])).toEqual([
      ["before.jpg", "Shot 1"],
      ["after.jpg", "Shot 2"],
    ]);
    expect(cabinets.shots[0].start).toBe(0);
    expect(cabinets.shots[1].start).toBeGreaterThan(cabinets.shots[0].end! - 0.1);
    expect(other.shots.map((x) => x.fileName)).toEqual(["roller.mp4"]);
    // Every file was cut into one ad, so next week fresher footage goes first.
    expect((await owner.as.query(api.ads.listAssets, {})).map((a) => a.uses)).toEqual([1, 1, 1]);
    // Claude once per hook, ElevenLabs once per hook, Shotstack four renders, Meta three calls per creative.
    expect(calls.filter((c) => c.url.includes("anthropic")).length).toBe(2);
    expect(calls.filter((c) => c.url.includes("elevenlabs")).length).toBe(2);
    expect(calls.filter((c) => c.url.endsWith("/render")).length).toBe(4);
    const ads = calls.filter((c) => c.url.endsWith("/ads"));
    expect(ads.length).toBe(4);
    expect(new URLSearchParams(ads[0].body).get("status")).toBe("PAUSED");
    const creative = JSON.parse(new URLSearchParams(calls.find((c) => c.url.endsWith("/adcreatives"))!.body).get("object_story_spec")!);
    expect(creative.video_data.call_to_action).toEqual({ type: "GET_QUOTE", value: { lead_gen_form_id: "f1" } });
    expect(calls.find((c) => c.url.includes("elevenlabs"))!.url).toContain("/text-to-speech/ven/with-timestamps");
    // Claude saw the footage: the cabinets request carries both photos as images, each after its "Footage N" label.
    const asks = calls.filter((c) => c.url.includes("anthropic")).map((c) => JSON.parse(c.body!).messages[0].content as Array<any>);
    const cabinetsAsk = asks.find((a) => a[0].text.includes("Scope: cabinets."))!;
    expect(cabinetsAsk[0].text).toContain("Permian Home Quotes");
    expect(cabinetsAsk[0].text).toContain("never as a homeowner or customer");
    expect(cabinetsAsk.slice(1).map((b) => (b.type === "text" ? b.text : b.source.type))).toEqual(["Footage 1:", "url", "Footage 2:", "url"]);
    // The other hook only had the roller clip, which isn't in its scope and has no still: Claude is told both.
    const otherAsk = asks.find((a) => a !== cabinetsAsk)!;
    expect(otherAsk[0].text).toContain("None of this footage is tagged");
    expect(otherAsk[0].text).toContain("(no image available; rely on the tags)");
    expect(otherAsk.length).toBe(1);
    // The cabinets render: the after wipes over the before, each on-screen line on its own shot, cut where its line starts.
    const renders = calls.filter((c) => c.url.endsWith("/render")).map((c) => JSON.parse(c.body!));
    const cabinetsRender = renders.find((r) => r.timeline.tracks[3].clips.length === 2)!;
    const [first, second] = cabinetsRender.timeline.tracks[3].clips;
    expect(first.start).toBe(0);
    expect(second).toMatchObject({ start: cabinets.shots[1].start, transition: { in: "wipeLeft" } });
    expect(cabinetsRender.timeline.tracks[1].clips.map((c: any) => [c.asset.html, c.start])).toEqual([
      ["<p>Shot 1</p>", 0],
      ["<p>Shot 2</p>", cabinets.shots[1].start],
    ]);

    // Approve one: live here, ACTIVE in Meta.
    vi.useFakeTimers();
    await owner.as.mutation(api.ads.activate, { id: tall.id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
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

  /** One hook a week, no Meta account, on a fresh backend. */
  async function noMeta() {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await library(t, owner);
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("ELEVENLABS_API_KEY", "e");
    vi.stubEnv("SHOTSTACK_API_KEY", "s");
    await owner.as.mutation(api.ads.saveSettings, { voiceId: "ven", weeklyEnabled: false, hooksPerWeek: 1, liveTarget: 6 });
    const calls: Array<{ url: string; body?: string }> = [];
    const draft = async () => {
      vi.useFakeTimers();
      await owner.as.mutation(api.ads.draftNow, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      vi.useRealTimers();
      return (await owner.as.query(api.ads.batches, {}))[0];
    };
    return { t, owner, calls, draft };
  }

  test("a bad script fails the batch with the reason, and Monday with the switch off does nothing", async () => {
    const { t, owner, calls, draft } = await noMeta();
    stubServices(calls, { scriptsFail: true });
    expect(await draft()).toMatchObject({ status: "failed", error: expect.stringContaining("mentions a price or discount") });
    stubServices(calls);
    await t.action(internal.ads.weeklyRun, {});
    expect((await owner.as.query(api.ads.batches, {})).length).toBe(1);
  });

  test("Claude passes on a hook whose footage doesn't fit: that hook is passed over with the reason and the next one is drafted", async () => {
    const { owner, calls, draft } = await noMeta();
    stubServices(calls, { passOnScope: "cabinets" });
    const batch = await draft();
    expect(batch.status).toBe("ready");
    expect(batch.creatives.length).toBe(2);
    expect(batch.creatives.every((c) => c.hook!.scope !== "cabinets")).toBe(true);
    expect(batch.skipped[0]).toMatch(/^"Paint them, don't replace them\..*": Claude passed: no cabinets in this footage$/);
    // The pair Claude didn't use stays fresh for next week.
    expect(
      (await owner.as.query(api.ads.listAssets, {}))
        .filter((a) => a.uses === 0)
        .map((a) => a.fileName)
        .sort(),
    ).toEqual(["after.jpg", "before.jpg"]);
  });

  test("a shot list that breaks a rule gets one retry with the problems named", async () => {
    const { calls, draft } = await noMeta();
    stubServices(calls, { badFirst: true });
    const batch = await draft();
    expect(batch).toMatchObject({ status: "ready", skipped: [] });
    const asks = calls.filter((c) => c.url.includes("anthropic")).map((c) => JSON.parse(c.body!).messages[0].content as Array<any>);
    expect(asks.length).toBe(2);
    expect(asks[1][asks[1].length - 1].text).toContain("Your last shot list had these problems: 0 shots (use 2 to 4)");
  });

  test("a failed render fails that creative, and the batch still finishes", async () => {
    const { calls, draft } = await noMeta();
    stubServices(calls, { renderFails: true });
    const batch = await draft();
    expect(batch).toMatchObject({ status: "ready", summary: "0 paused in Meta · 2 failed" });
    expect(batch.creatives.every((c) => c.status === "failed" && c.error?.includes("bad asset"))).toBe(true);
  });

  test("without a Meta account the renders wait here, watchable, and can't be approved", async () => {
    const { owner, calls, draft } = await noMeta();
    stubServices(calls);
    const latest = await draft();
    expect(latest).toMatchObject({ status: "ready", summary: "0 paused in Meta · 2 rendered but not in Meta" });
    expect(latest.creatives.every((c) => c.status === "rendered" && c.videoUrl && c.error?.includes("Meta isn't set up"))).toBe(true);
    await expect(owner.as.mutation(api.ads.activate, { id: latest.creatives[0].id })).rejects.toThrow("isn't in Meta yet");
    expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
  });

  test("the live table joins Meta's numbers with what intake and the sale say, and flags fatigue", async () => {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await library(t, owner);
    const now = new Date().toISOString();
    const { creativeId, name } = await t.run(async (ctx) => {
      const hook = (await ctx.db.query("adHooks").take(1))[0];
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
      return { creativeId: creativeId as Id<"adCreatives">, name };
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
        return new Response(
          JSON.stringify({
            data: incremented
              ? [day("2026-11-03"), day("2026-11-04")]
              : [{ spend: "25.00", impressions: "1200", clicks: "18", ctr: "1.5", frequency: "1.3", actions: [{ action_type: "lead", value: "2" }] }],
          }),
        );
      }),
    );
    await t.action(internal.ads.pullInsights, {});
    let [row] = await owner.as.query(api.ads.live, {});
    expect(row).toMatchObject({
      id: creativeId,
      name,
      intake: { leads: 3, confirmed: 2, sold: 1, revenueCents: 6500 },
      week: { spendCents: 2500, impressions: 1200, leadsMeta: 2, ctr: 1.5 },
      baselineCtr: 1.5,
      fatigued: false,
    });
    expect((await t.run((ctx) => ctx.db.query("adStats").collect())).map((s) => [s.day, s.spendCents, s.leadsMeta])).toEqual([
      ["2026-11-03", 1250, 1],
      ["2026-11-04", 1250, 1],
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
    [row] = await owner.as.query(api.ads.live, {});
    expect(row).toMatchObject({ fatigued: true, baselineCtr: 1.5, week: { frequency: 3.1 } });
  });
});
