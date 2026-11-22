import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { designLabel, forbiddenIn } from "./lib/ads";
import { FOOTAGE_MARK, footageProblems, footagePrompt, isWorkFootage, linesFromHeard, pickFootageSwipe, primaryMaxFor } from "./lib/footage";
import { setup, signUp } from "./test.setup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const SWIPE = { company: "Rodgers Painting", hook: "Process + minimal disruption", offer: "Free estimate", adCopy: "We take your doors to our shop and spray them. Get a free estimate.", daysRunning: 160 };
const at = (text: string, start: number) => ({ text, start, end: start + 0.3 });

describe("the pure parts", () => {
  test("what is said becomes caption lines: a sentence's end, a pause or a dozen words closes one", () => {
    const heard = [
      at("We", 0.5),
      at("take", 0.9),
      at("every", 1.3),
      at("door.", 1.7),
      at("Then", 2.2),
      at("we", 2.6),
      // A long pause before "spray".
      at("spray", 4.0),
      ...Array.from({ length: 13 }, (_, i) => at(`w${i}`, 4.5 + i * 0.4)),
    ];
    const lines = linesFromHeard(heard);
    expect(lines.map((l) => l.voice)).toEqual([
      "We take every door.",
      "Then we",
      "spray w0 w1 w2 w3 w4 w5 w6 w7 w8 w9 w10",
      "w11 w12",
    ]);
    expect(lines[0]).toMatchObject({ start: 0.5, end: 2 });
    expect(lines[0].words).toHaveLength(4);
    expect(linesFromHeard([])).toEqual([]);
  });

  test("the prompt: what is heard and seen, the competitor ad to follow, and the rules; silence is said as such", () => {
    const prompt = footagePrompt({ brand: "GoodFit Pros", trade: "Painting", town: "Midland", heard: "We take every door.", seen: "A crew member sprays a cabinet door.", swipe: SWIPE });
    expect(prompt.startsWith(FOOTAGE_MARK)).toBe(true);
    expect(prompt).toContain('"We take every door."');
    expect(prompt).toContain("A crew member sprays a cabinet door.");
    expect(prompt).toContain("Rodgers Painting");
    expect(prompt).toContain("160 days");
    expect(prompt).toContain(SWIPE.adCopy);
    expect(prompt).toContain("never as a homeowner or customer");
    expect(footagePrompt({ brand: "B", trade: "Painting", town: "", heard: "", swipe: { ...SWIPE, adCopy: undefined } })).toContain("(nothing: it is the work and the job site's sound)");
  });

  test("the words are checked: lengths, and the same banned claims as every ad", () => {
    const good = { title: "Doors off, sprayed", headline: "Cabinets sprayed smooth", primaryText: "We take every door to the shop. Free quote." };
    expect(footageProblems(good, SWIPE)).toEqual([]);
    expect(footageProblems(null, SWIPE)).toEqual(["the reply wasn't JSON"]);
    expect(footageProblems({ ...good, title: "x".repeat(31) }, SWIPE)).toEqual(["title over 30 characters"]);
    expect(footageProblems({ ...good, primaryText: "Only $999, guaranteed." }, SWIPE)).toEqual(["mentions a price or discount", "mentions a warranty or guarantee"]);
    expect(footageProblems({ ...good, headline: "" }, SWIPE)).toEqual(["no headline"]);
    // A long competitor copy lets ours run long too.
    expect(primaryMaxFor({ ...SWIPE, adCopy: "x".repeat(400) })).toBe(1500);
    expect(primaryMaxFor(SWIPE)).toBe(125);
    expect(forbiddenIn("Top-rated painters")).toEqual(["mentions a claim about how the pros are checked (vetted, screened, top-rated)"]);
    expect(designLabel({ style: "footage" })).toBe("Job site video");
  });
});

type T = ReturnType<typeof setup>;
type Call = { url: string; body?: string };

async function ready(opts: { swipe?: boolean; durationSec?: number } = {}) {
  const t = setup();
  const owner = await signUp(t, "owner@goodfit.example", { role: "super_admin" });
  vi.stubEnv("ELEVENLABS_API_KEY", "e");
  vi.stubEnv("ANTHROPIC_API_KEY", "a");
  vi.stubEnv("CONSUMER_BRAND", "GoodFit Pros");
  await owner.as.mutation(api.ads.saveSettings, { voiceId: "ven", weeklyEnabled: false, hooksPerWeek: 1, liveTarget: 6, researchMarkets: ["Midland"] });
  const assetId = await t.run(async (ctx) => {
    const now = new Date().toISOString();
    if (opts.swipe !== false)
      await ctx.db.insert("adSwipes", {
        ...SWIPE,
        paintingType: "Cabinets",
        scope: "cabinets",
        creative: "Owner to camera",
        area: "",
        cta: "Get quote",
        adaptation: "",
        starred: true,
        source: "test",
        importedAt: now,
      });
    const storageId = await ctx.storage.store(new Blob(["mp4"], { type: "video/mp4" }));
    const posterStorageId = await ctx.storage.store(new Blob(["jpg"], { type: "image/jpeg" }));
    return await ctx.db.insert("adAssets", {
      storageId,
      posterStorageId,
      kind: "video",
      fileName: "spraying.mp4",
      contentType: "video/mp4",
      size: 3,
      durationSec: opts.durationSec ?? 9,
      tags: ["cabinets", "process"],
      description: "A crew member sprays a cabinet door in a booth.",
      uploadedBy: owner.userId,
      createdAt: now,
    });
  });
  return { t, owner, assetId };
}

/** ElevenLabs hears the crew; Claude writes the words, badly first when asked to. */
function stub(calls: Call[], opts: { badFirst?: boolean; alwaysBad?: boolean; silent?: boolean } = {}) {
  let asked = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("speech-to-text"))
        return new Response(JSON.stringify({ words: opts.silent ? [] : [at("We", 0.5), at("spray", 0.9), at("every", 1.3), at("door.", 1.7), at("Smooth.", 2.4)] }));
      if (url.includes("api.anthropic.com")) {
        asked++;
        const bad = opts.alwaysBad || (opts.badFirst && asked === 1);
        const copy = bad
          ? { title: "Doors sprayed", headline: "Only $99 a door", primaryText: "Guaranteed finish." }
          : { title: "Doors off, sprayed", headline: "Cabinets sprayed smooth", primaryText: "We take every door to the shop and spray it. Free quote." };
        return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(copy) }], stop_reason: "end_turn" }));
      }
      if (url.includes("api.github.com")) return new Response(null, { status: 204 });
      return new Response("not stubbed " + url, { status: 500 });
    }),
  );
}

const run = async <R>(t: T, step: () => Promise<R>) => {
  const out = await step();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return out;
};

describe("a job site video", () => {
  test("made from a Library clip: heard, written around, and waiting to be drawn in two sizes with its own sound, by each engine", async () => {
    vi.useFakeTimers();
    const { t, owner, assetId } = await ready();
    const calls: Call[] = [];
    stub(calls, { badFirst: true });
    const made = await run(t, () => owner.as.mutation(api.footage.make, { assetId }));
    expect(made.builtOn).toBe("Rodgers Painting");
    const batch = (await owner.as.query(api.ads.batches, {}))[0];
    expect(batch.id).toBe(made.batchId);
    expect(batch.creatives.map((c: { ratio: string; status: string; style: { label: string } }) => `${c.ratio} ${c.status} ${c.style.label}`)).toEqual([
      "9x16 voiced Job site video",
      "4x5 voiced Job site video",
      // The test: the same two sizes drawn with Tesseract, to compare.
      "9x16 voiced Job site video (Tesseract)",
      "4x5 voiced Job site video (Tesseract)",
    ]);
    expect(batch.creatives.map((c: { name: string }) => c.name).slice(2).every((n: string) => /_tx$/.test(n))).toBe(true);
    const card = batch.creatives[0] as { style: { label: string }; script: { headline: string; primaryText: string; onScreen: string[] }; hook: { basedOn?: { company: string } } };
    expect(card.style.label).toBe("Job site video");
    expect(card.script.headline).toBe("Cabinets sprayed smooth");
    expect(card.script.onScreen).toEqual(["Doors off, sprayed"]);
    expect(card.hook.basedOn?.company).toBe("Rodgers Painting");
    // The first words broke the rules and were asked for again, with the problems named.
    const asks = calls.filter((c) => c.url.includes("anthropic"));
    expect(asks).toHaveLength(2);
    expect(asks[1].body).toContain("mentions a price or discount");
    expect(JSON.parse(asks[0].body!).model).toBe("claude-sonnet-5-5");

    const rows = await t.run(async (ctx) => (await ctx.db.query("adCreatives").collect()).filter((c) => c.batchId === made.batchId));
    const asset = await t.run((ctx) => ctx.db.get(assetId));
    expect(rows.every((c) => c.audioStorageId === asset!.storageId && c.audioDurationSec === 9 && c.design?.style === "footage")).toBe(true);
    expect(rows[0].script.shots!.map((s) => [s.voice, s.start, s.end])).toEqual([
      ["We spray every door.", 0.5, 2],
      ["Smooth.", 2.4, 2.7],
    ]);
    expect(asset!.uses).toBe(1);
    // The weekly run never drafts the clip's idea on its own.
    expect((await t.run((ctx) => ctx.db.get(rows[0].hookId)))!.active).toBe(false);

    // The renderer is handed the clip as the picture and the sound, with the captions.
    const jobs = await t.mutation(internal.ads.claimRenders, {});
    const url = await t.run((ctx) => ctx.storage.getUrl(asset!.storageId));
    const props = jobs[0].props as Record<string, any>;
    expect(props).toMatchObject({ style: { kind: "footage" }, headline: "Doors off, sprayed", footage: { src: url }, audio: url, audioSec: 9, photos: [] });
    expect(props.lines.map((l: { voice: string }) => l.voice)).toEqual(["We spray every door.", "Smooth."]);
    expect(props.engine).toBeUndefined();
    // The Tesseract copies are handed out the same, marked for Tesseract.
    const tx = jobs.find((j: { name: string }) => j.name.endsWith("_tx"))!.props as Record<string, any>;
    expect(tx).toMatchObject({ engine: "tesseract", style: { kind: "footage" }, footage: { src: url }, headline: "Doors off, sprayed" });
  });

  test("with the Tesseract test switched off in Settings, only the Remotion pair is made", async () => {
    vi.useFakeTimers();
    const { t, owner, assetId } = await ready();
    await owner.as.mutation(api.ads.saveSettings, { voiceId: "ven", weeklyEnabled: false, hooksPerWeek: 1, liveTarget: 6, tesseractFootage: false });
    expect((await owner.as.query(api.ads.settings, {})).tesseractFootage).toBe(false);
    stub([]);
    await run(t, () => owner.as.mutation(api.footage.make, { assetId }));
    const rows = await t.run((ctx) => ctx.db.query("adCreatives").collect());
    expect(rows.map((c) => c.design?.engine)).toEqual([undefined, undefined]);
  });

  test("a clip with nothing said runs with no captions; words that keep breaking the rules fail the batch with why", async () => {
    vi.useFakeTimers();
    const silent = await ready();
    stub([], { silent: true });
    await run(silent.t, () => silent.owner.as.mutation(api.footage.make, { assetId: silent.assetId }));
    const rows = await silent.t.run((ctx) => ctx.db.query("adCreatives").collect());
    expect(rows.map((c) => c.status)).toEqual(["voiced", "voiced", "voiced", "voiced"]);
    expect(rows[0].script.shots).toEqual([]);

    const bad = await ready();
    stub([], { alwaysBad: true });
    await run(bad.t, () => bad.owner.as.mutation(api.footage.make, { assetId: bad.assetId }));
    const batch = (await bad.owner.as.query(api.ads.batches, {}))[0];
    expect(batch.status).toBe("failed");
    expect(batch.error).toBe("The job site ad couldn't be made: The words for the video still broke the rules: mentions a price or discount; mentions a warranty or guarantee");
  });

  test("refused: a photo, a clip over 90 seconds, no competitor ad on file, or someone who isn't staff", async () => {
    const { t, owner, assetId } = await ready({ durationSec: 140 });
    await expect(owner.as.mutation(api.footage.make, { assetId })).rejects.toThrow("Trim it to 90 seconds or less");
    await t.run((ctx) => ctx.db.patch(assetId, { durationSec: 30, kind: "photo" }));
    await expect(owner.as.mutation(api.footage.make, { assetId })).rejects.toThrow("A job site ad is made from a video");
    await t.run((ctx) => ctx.db.patch(assetId, { kind: "video" }));
    await expect(t.mutation(api.footage.make, { assetId })).rejects.toThrow();

    const none = await ready({ swipe: false });
    await expect(none.owner.as.mutation(api.footage.make, { assetId: none.assetId as Id<"adAssets"> })).rejects.toThrow("No painting competitor ad on file");
  });
});

describe("a clip's still, made after its upload", () => {
  test("a clip with no still gets one, its length, and Claude's look; only staff, only a clip", async () => {
    vi.useFakeTimers();
    const { t, owner, assetId } = await ready();
    await t.run((ctx) => ctx.db.patch(assetId, { posterStorageId: undefined, durationSec: undefined, description: undefined }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"description":"A crew member sprays a door.","tags":["cabinets","process"]}' }] }))),
    );
    const jpg = await t.run((ctx) => ctx.storage.store(new Blob(["jpg"], { type: "image/jpeg" })));
    await run(t, () => owner.as.mutation(api.ads.setPoster, { id: assetId, posterStorageId: jpg, durationSec: 12.34 }));
    const a = await t.run((ctx) => ctx.db.get(assetId));
    expect(a).toMatchObject({ posterStorageId: jpg, durationSec: 12.3, description: "A crew member sprays a door." });
    // The library shows it from the still now.
    const listed = (await owner.as.query(api.ads.listAssets, {})).find((x: { id: string }) => x.id === assetId)!;
    expect(listed.posterUrl).toBeTruthy();

    await expect(t.mutation(api.ads.setPoster, { id: assetId, posterStorageId: jpg })).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch(assetId, { kind: "photo" }));
    await expect(owner.as.mutation(api.ads.setPoster, { id: assetId, posterStorageId: jpg })).rejects.toThrow("Only a clip takes a still");
  });
});

describe("job site videos follow ads that are work on camera", () => {
  test("Spray Tex's process videos count as work footage; graphics, carousels and owner selfies don't", async () => {
    const { SWIPE_SEEDS } = await import("./catalog/swipes");
    const sprayTex = SWIPE_SEEDS.filter((x) => x.company === "Spray Tex Painting");
    expect(sprayTex.length).toBeGreaterThanOrEqual(2);
    expect(sprayTex.every((x) => isWorkFootage(x))).toBe(true);
    expect(isWorkFootage({ creative: "Owner selfie video poster" })).toBe(false);
    expect(isWorkFootage({ creative: "Branded service collage, crew and review logos" })).toBe(false);
    expect(isWorkFootage({ creative: "Painter working high on exterior siding" })).toBe(true);
    // Once tagged, the tag decides.
    expect(isWorkFootage({ footage: ["process", "finished"], creative: "Owner selfie" })).toBe(true);
    expect(isWorkFootage({ footage: ["owner_to_camera"], creative: "Door-painting process video poster" })).toBe(false);
  });

  test("the best work-footage ad is chosen over a better-ranked ad of another kind; with none, the best of any", () => {
    const now = new Date().toISOString();
    const base = { hook: "x", offer: "Free estimate", importedAt: now, scope: "cabinets" };
    const starred = { ...base, company: "Selfie Co", creative: "Owner selfie video poster", starred: true, quality: 60 };
    const spraying = { ...base, company: "Spray Tex Painting", creative: "Door-painting process video poster", starred: false, quality: 30 };
    expect(pickFootageSwipe([starred, spraying], "cabinets")!.company).toBe("Spray Tex Painting");
    expect(pickFootageSwipe([starred], "cabinets")!.company).toBe("Selfie Co");
    expect(pickFootageSwipe([], "cabinets")).toBeUndefined();
  });

  test("made from a clip: built on the work-footage ad; a clip nobody talks in plays the music under it", async () => {
    vi.useFakeTimers();
    const { t, owner, assetId } = await ready();
    await t.run(async (ctx) => {
      const now = new Date().toISOString();
      // A starred, higher-quality ad that is someone talking to camera: not what a job site video follows.
      await ctx.db.insert("adSwipes", {
        company: "Selfie Co", paintingType: "Cabinets", scope: "cabinets", hook: "Owner story", offer: "Free estimate",
        creative: "Owner selfie video poster", area: "", cta: "Get quote", adaptation: "", starred: true, quality: 60, source: "test", importedAt: now,
      });
      await ctx.db.patch((await ctx.db.query("adSwipes").collect()).find((x) => x.company === "Rodgers Painting")!._id, { starred: false, creative: "Door-painting process video poster" });
      const storageId = await ctx.storage.store(new Blob(["mp3"], { type: "audio/mpeg" }));
      await ctx.db.insert("adMusic", { name: "Track", storageId, from: 4, active: true, createdAt: now });
    });
    stub([], { silent: true });
    const made = await run(t, () => owner.as.mutation(api.footage.make, { assetId }));
    expect(made.builtOn).toBe("Rodgers Painting");
    const props = (await t.mutation(internal.ads.claimRenders, {}))[0].props as Record<string, any>;
    expect(props.lines).toEqual([]);
    expect(props.sound).toMatchObject({ musicFrom: 4 });
    expect(props.sound.music).toMatch(/^https?:/);
  });
});
