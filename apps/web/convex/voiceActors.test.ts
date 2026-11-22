import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { shotTimings, wordTimings } from "./lib/ads";
import { ACTOR_DIRECTION, READ_MATCH_MIN, actorProjectBody, alignmentFromWords, creatorBrief, mp3Of, readyRead } from "./lib/voiceActors";
import { setup, signUp } from "./test.setup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const LINES = ["We took every door off.", "Then we sprayed them smooth.", "Get a free quote today."];
/** What speech-to-text hears when the actor reads the lines as written, a word every half second. */
const heardAll = (lines = LINES) =>
  lines
    .join(" ")
    .split(" ")
    .map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));

describe("the pure parts", () => {
  test("a read's words become per-character timing that shotTimings and wordTimings take as they take ElevenLabs'", () => {
    const { alignment, matched, total } = alignmentFromWords(LINES, heardAll());
    expect([matched, total]).toEqual([15, 15]);
    const text = LINES.join(" ");
    expect(alignment.characters.join("")).toBe(text);
    expect(alignment.character_start_times_seconds).toHaveLength(text.length);
    const timed = shotTimings(LINES, alignment, 99);
    // Line 2 starts on its first word ("Then", the 6th word heard) and the read ends on the last word.
    expect(timed.shots[1].start).toBe(2.5);
    expect(timed.shots[0].end).toBe(2.4);
    expect(timed.durationSec).toBe(7.4);
    const words = wordTimings(LINES, alignment)!;
    expect(words[2].map((w) => [w.text, w.start, w.end])).toEqual([
      ["Get", 5, 5.4],
      ["a", 5.5, 5.9],
      ["free", 6, 6.4],
      ["quote", 6.5, 6.9],
      ["today.", 7, 7.4],
    ]);
  });

  test("an added word or a dropped one doesn't throw off the rest; a word not heard sits between its neighbours", () => {
    const heard = heardAll().filter((w) => w.text !== "smooth.");
    heard.splice(2, 0, { text: "uh", start: 1.0, end: 1.05 });
    const { alignment, matched, total } = alignmentFromWords(LINES, heard);
    expect([matched, total]).toEqual([14, 15]);
    const words = wordTimings(LINES, alignment)!;
    // "smooth." wasn't heard: it fills the gap between "them" (ends 4.4) and "Get" (starts 5.0).
    const smooth = words[1].find((w) => w.text === "smooth.")!;
    expect([smooth.start, smooth.end]).toEqual([4.4, 5]);
    // Punctuation and case don't matter, and "uh" is skipped.
    expect(words[0][0]).toEqual({ text: "We", start: 0, end: 0.4 });
  });

  test("a read of something else matches too few words to use", () => {
    const { matched, total } = alignmentFromWords(LINES, heardAll(["Call", "Bob's", "roofing", "for", "a", "new", "roof"]));
    expect(matched / total).toBeLessThan(READ_MATCH_MIN);
  });

  test("the order: one part with every line, how to read it, and the owner's notes after", () => {
    const body = actorProjectBody({ title: "x".repeat(140), lines: LINES, genderAndAge: "youngAdultFemale", notes: "  Texan, easygoing. ", test: true });
    expect(body.title).toHaveLength(100);
    expect(body).toMatchObject({ mainService: "voice_over", fulfillmentType: "speedy", test: true });
    expect(body.services[0]).toMatchObject({
      subCategory: "voice_over",
      language: "eng-us",
      genderAndAge: "youngAdultFemale",
      script: [{ part1: LINES.join(" ") }],
    });
    expect(body.remarks).toBe(`${ACTOR_DIRECTION} Texan, easygoing.`);
    expect(actorProjectBody({ title: "t", lines: LINES }).services[0].genderAndAge).toBe("middleAgeMale");
  });

  test("the read to take: a voice-over waiting for review with an MP3, in whichever shape the links come, not one held back", () => {
    expect(mp3Of({ wav: "https://b.example/p1.wav", mp3: "https://b.example/p1.mp3" })).toBe("https://b.example/p1.mp3");
    expect(mp3Of({ part001: { mp3: "https://b.example/a.mp3", wav: "https://b.example/a.wav" } })).toBe("https://b.example/a.mp3");
    expect(mp3Of(["https://b.example/a.wav", "https://b.example/a.mp3"])).toBe("https://b.example/a.mp3");
    expect(mp3Of({ pdf: "https://b.example/a.pdf" })).toBeNull();
    const list = [
      { id: "d0", serviceSubCategory: "voice_over", status: "assigned", urls: {} },
      { id: "d1", serviceSubCategory: "voice_over", status: "reviewable", urls: { mp3: "https://b.example/1.mp3" } },
      { id: "d2", serviceSubCategory: "voice_over", status: "reviewable", urls: { mp3: "https://b.example/2.mp3" } },
    ];
    expect(readyRead(list)).toEqual({ id: "d1", url: "https://b.example/1.mp3", status: "reviewable" });
    expect(readyRead(list, ["d1"])?.id).toBe("d2");
    expect(readyRead(list.slice(0, 1))).toBeNull();
  });

  test("the on-camera brief: the lines in order, filmed upright in front of a green screen, speaking for the company", () => {
    const brief = creatorBrief({ brand: "GoodFit Pros", headline: "Cabinets, sprayed smooth", lines: LINES, ratio: "9x16" });
    expect(brief).toContain("GoodFit Pros");
    expect(brief).toContain("green screen");
    expect(brief).toContain("1. We took every door off.\n2. Then we sprayed them smooth.\n3. Get a free quote today.");
    expect(brief).toContain("Don't say you're a customer");
  });
});

type T = ReturnType<typeof setup>;
type Call = { url: string; method: string; body?: string; token?: string | null };

/** One idea's two sizes, written and waiting for their voice, as the weekly run leaves them. */
async function writtenAd(t: T, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const now = new Date().toISOString();
    const storageId = await ctx.storage.store(new Blob(["jpg"], { type: "image/jpeg" }));
    const assetId = await ctx.db.insert("adAssets", { storageId, kind: "photo", fileName: "a.jpg", contentType: "image/jpeg", size: 3, tags: ["cabinets", "after"], uploadedBy: userId, createdAt: now });
    const hookId = await ctx.db.insert("adHooks", { family: "owner_story", scope: "cabinets", trade: "painting", textEn: "Doors off, sprayed", active: true, uses: 0, wins: 0, losses: 0, createdAt: now });
    const batchId = await ctx.db.insert("adBatches", { weekOf: "2026-11-23", status: "drafting", createdAt: now, trade: "painting" });
    const script = {
      voice: LINES.join(" "),
      onScreen: ["Doors off", "Sprayed smooth", "Free quote"],
      headline: "Cabinets, sprayed smooth",
      primaryText: "We take the doors off and spray them.",
      shots: LINES.map((voice, i) => ({ assetId, voice, onScreen: ["Doors off", "Sprayed smooth", "Free quote"][i] })),
    };
    const ids: Id<"adCreatives">[] = [];
    for (const ratio of ["9x16", "4x5"] as const)
      ids.push(await ctx.db.insert("adCreatives", { batchId, hookId, ratio, name: `WL_abcdef_${ratio === "9x16" ? "916" : "45"}_20261123`, script, assetIds: [assetId], status: "draft", createdAt: now }));
    return { ids, batchId };
  });
}

/** Bunny Studio, its files, ElevenLabs' speech-to-text and GitHub, as each answers. `reads` is what the project's deliverables say on each ask. */
function stubServices(calls: Call[], opts: { reads?: () => unknown[]; heard?: () => Array<{ text: string; start: number; end: number }>; projectStatus?: string; orderFails?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined, token: new Headers(init?.headers).get("x-access-token") });
      if (url === "https://api.bunnystudio.com/projects" && method === "POST")
        return opts.orderFails
          ? new Response(JSON.stringify({ status: 422, type: "MAINSERVICE_NOT_AUTHORIZED", message: "Not authorized for API projects" }), { status: 422 })
          : new Response(JSON.stringify({ id: "proj-1", status: "paid", price: 31 }));
      if (url.startsWith("https://api.bunnystudio.com/deliverables/project/")) return new Response(JSON.stringify(opts.reads?.() ?? []));
      if (url.startsWith("https://api.bunnystudio.com/projects/")) return new Response(JSON.stringify({ id: "proj-1", status: opts.projectStatus ?? "paid" }));
      if (url.startsWith("https://api.bunnystudio.com/deliverables/") && method === "PUT") return new Response(JSON.stringify({ id: "d1", status: "approved" }));
      if (url.startsWith("https://files.bunny.example/")) return new Response("ID3 read", { status: 200 });
      if (url.includes("api.elevenlabs.io/v1/speech-to-text")) return new Response(JSON.stringify({ text: "…", words: opts.heard?.() ?? heardAll() }));
      if (url.includes("api.github.com")) return new Response(null, { status: 204 });
      return new Response("not stubbed " + url, { status: 500 });
    }),
  );
}

async function actorSetup(env: Record<string, string> = { BUNNY_STUDIO_TOKEN: "bunny-token" }) {
  const t = setup();
  const owner = await signUp(t, "owner@goodfit.example", { role: "super_admin" });
  vi.stubEnv("ELEVENLABS_API_KEY", "e");
  vi.stubEnv("ANTHROPIC_API_KEY", "a");
  vi.stubEnv("CONSUMER_BRAND", "GoodFit Pros");
  for (const [k, val] of Object.entries(env)) vi.stubEnv(k, val);
  await owner.as.mutation(api.ads.saveSettings, {
    voiceId: "ven",
    voiceSource: "actor",
    actorVoice: "middleAgeMale",
    actorNotes: "West Texas, easygoing",
    weeklyEnabled: false,
    hooksPerWeek: 1,
    liveTarget: 6,
  });
  const ad = await writtenAd(t, owner.userId);
  const run = async <R>(step: () => Promise<R>) => {
    const out = await step();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return out;
  };
  const rows = () => t.run(async (ctx) => Promise.all(ad.ids.map((id) => ctx.db.get(id))));
  return { t, owner, ad, run, rows };
}

describe("a real voice actor reads the ad", () => {
  test("the voice step orders the read from Bunny Studio instead of ElevenLabs; the ad waits as recording", async () => {
    vi.useFakeTimers();
    const { t, ad, run, rows } = await actorSetup({ BUNNY_STUDIO_TOKEN: "bunny-token", BUNNY_STUDIO_TEST: "1" });
    const calls: Call[] = [];
    stubServices(calls);
    await run(() => t.action(internal.ads.voice, { ids: ad.ids }));
    // No ElevenLabs voice: one order, with the token, both sizes sharing it.
    expect(calls.filter((c) => c.url.includes("elevenlabs"))).toHaveLength(0);
    const order = calls.find((c) => c.url === "https://api.bunnystudio.com/projects")!;
    expect(order.token).toBe("bunny-token");
    const body = JSON.parse(order.body!);
    expect(body).toMatchObject({ mainService: "voice_over", test: true });
    expect(body.title).toBe("GoodFit Pros ad WL_abcdef_20261123");
    expect(body.services[0].script).toEqual([{ part1: LINES.join(" ") }]);
    expect(body.remarks).toContain("West Texas, easygoing");
    const [a, b] = await rows();
    expect([a!.status, b!.status]).toEqual(["recording", "recording"]);
    expect(a!.actor).toMatchObject({ projectId: "proj-1", price: 31, test: true });
    expect(b!.actor!.projectId).toBe("proj-1");
  });

  test("the read comes back: it is timed by speech-to-text, put on both sizes, sent to be drawn, and accepted at Bunny Studio", async () => {
    vi.useFakeTimers();
    const { t, ad, run, rows } = await actorSetup();
    const calls: Call[] = [];
    let ready = false;
    stubServices(calls, { reads: () => (ready ? [{ id: "d1", serviceSubCategory: "voice_over", status: "reviewable", urls: { mp3: "https://files.bunny.example/part1.mp3" } }] : []) });
    await run(() => t.action(internal.ads.voice, { ids: ad.ids }));

    // Not back yet: still recording, checked.
    expect(await t.action(internal.voiceActors.checkOrders, {})).toBe(1);
    let [a] = await rows();
    expect(a!.status).toBe("recording");
    expect(a!.actor!.checkedAt).toBeDefined();

    ready = true;
    await run(() => t.action(internal.voiceActors.checkOrders, {}));
    const [x, y] = await rows();
    expect([x!.status, y!.status]).toEqual(["voiced", "voiced"]);
    expect(x!.audioStorageId).toBeDefined();
    expect(x!.audioStorageId).toBe(y!.audioStorageId);
    expect(x!.audioDurationSec).toBe(7.4);
    expect(x!.script.shots!.map((s) => [s.start, s.end])).toEqual([
      [0, 2.4],
      [2.5, 4.9],
      [5, 7.4],
    ]);
    expect(x!.script.shots![0].words![0]).toEqual({ text: "We", start: 0, end: 0.4 });
    expect(x!.actor!.deliverableId).toBe("d1");
    expect(x!.error).toBeUndefined();
    // The read was accepted, and the drawing asked for.
    expect(calls.some((c) => c.url === "https://api.bunnystudio.com/deliverables/d1" && c.method === "PUT" && JSON.parse(c.body!).status === "approved")).toBe(true);
    // Nothing more to check.
    expect(await t.action(internal.voiceActors.checkOrders, {})).toBe(0);
  });

  test("a read that doesn't follow the script is held back with the reason; the redo is taken when it comes", async () => {
    vi.useFakeTimers();
    const { t, ad, run, rows } = await actorSetup();
    const calls: Call[] = [];
    const reads = [{ id: "d1", serviceSubCategory: "voice_over", status: "reviewable", urls: { mp3: "https://files.bunny.example/part1.mp3" } }];
    let redo = false;
    stubServices(calls, {
      reads: () => reads,
      heard: () => (redo ? heardAll() : heardAll(["Call", "Bob's", "roofing", "today"])),
    });
    await run(() => t.action(internal.ads.voice, { ids: ad.ids }));
    await run(() => t.action(internal.voiceActors.checkOrders, {}));
    let [a] = await rows();
    expect(a!.status).toBe("recording");
    expect(a!.error).toMatch(/doesn't follow the script \(\d+ of 15 words heard\)\. Ask for a revision in Bunny Studio/);
    expect(a!.actor!.heldBack).toEqual(["d1"]);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    // The same read isn't looked at again; the redo comes as a new deliverable.
    await run(() => t.action(internal.voiceActors.checkOrders, {}));
    expect(calls.filter((c) => c.url.includes("speech-to-text"))).toHaveLength(1);
    redo = true;
    reads.push({ id: "d2", serviceSubCategory: "voice_over", status: "reviewable", urls: { mp3: "https://files.bunny.example/part1-v2.mp3" } });
    await run(() => t.action(internal.voiceActors.checkOrders, {}));
    [a] = await rows();
    expect(a!.status).toBe("voiced");
    expect(a!.error).toBeUndefined();
    expect(a!.actor!.deliverableId).toBe("d2");
  });

  test("an order Bunny Studio refuses fails the ad with the reason; a canceled order fails it too", async () => {
    vi.useFakeTimers();
    const refused = await actorSetup();
    stubServices([], { orderFails: true });
    await refused.run(() => refused.t.action(internal.ads.voice, { ids: refused.ad.ids }));
    const [a] = await refused.rows();
    expect(a!.status).toBe("failed");
    expect(a!.error).toBe("The voice actor couldn't be ordered: Bunny Studio order: 422 Not authorized for API projects");

    const canceled = await actorSetup();
    stubServices([], { projectStatus: "canceled" });
    await canceled.run(() => canceled.t.action(internal.ads.voice, { ids: canceled.ad.ids }));
    await canceled.run(() => canceled.t.action(internal.voiceActors.checkOrders, {}));
    const [b] = await canceled.rows();
    expect(b!.status).toBe("failed");
    expect(b!.error).toBe("The voice actor order was canceled at Bunny Studio");
  });

  test("without a token it signs in with the account's email and password; with neither, the ad says what to set", async () => {
    vi.useFakeTimers();
    const signIn = await actorSetup({ BUNNY_STUDIO_EMAIL: "ads@goodfit.example", BUNNY_STUDIO_PASSWORD: "pw" });
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined, token: new Headers(init?.headers).get("x-access-token") });
        if (url.endsWith("/users/auth")) return new Response(JSON.stringify({ token: "signed-in" }));
        return new Response(JSON.stringify({ id: "proj-9", price: 12 }));
      }),
    );
    await signIn.run(() => signIn.t.action(internal.ads.voice, { ids: signIn.ad.ids }));
    expect(JSON.parse(calls[0].body!)).toEqual({ email: "ads@goodfit.example", password: "pw" });
    expect(calls[1].token).toBe("signed-in");
    expect((await signIn.rows())[0]!.status).toBe("recording");

    vi.unstubAllEnvs();
    const none = await actorSetup({});
    stubServices([]);
    await none.run(() => none.t.action(internal.ads.voice, { ids: none.ad.ids }));
    expect((await none.rows())[0]!.error).toBe("The voice actor couldn't be ordered: Bunny Studio isn't set up: set BUNNY_STUDIO_TOKEN on the deployment");
  });

  test("settings and readiness: a voice actor needs Bunny Studio's token; staff can copy an on-camera brief for any ad", async () => {
    const { t, owner, ad } = await actorSetup({});
    const s = await owner.as.query(api.ads.settings, {});
    expect(s).toMatchObject({ voiceSource: "actor", actorVoice: "middleAgeMale", actorLanguage: "eng-us", actorNotes: "West Texas, easygoing" });
    expect(s.keys.bunny).toBe(false);
    const services = (await owner.as.query(api.ads.readiness, {})).find((c) => c.key === "keys")!;
    expect(services.ok).toBe(false);
    expect(services.detail).toContain("BUNNY_STUDIO_TOKEN");
    vi.stubEnv("BUNNY_STUDIO_TOKEN", "x");
    expect((await owner.as.query(api.ads.readiness, {})).find((c) => c.key === "keys")!.detail).toContain("a voice actor reads each ad");
    const brief = await owner.as.query(api.voiceActors.creatorBrief, { id: ad.ids[0] });
    expect(brief).toContain("1. We took every door off.");
    await expect(t.query(api.voiceActors.creatorBrief, { id: ad.ids[0] })).rejects.toThrow();
  });
});
