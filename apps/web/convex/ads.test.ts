import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { creativeName, isFatigued, parseScripts, pickAssets, pickHooks, scriptProblems, shotstackEdit, weekOf, type Script } from "./lib/ads";
import { setup, signUp } from "./test.setup";

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

  test("footage: the scope's before/after pair first, then newest, never reused; process footage when nothing fits", () => {
    const assets = [
      { _id: "p1", kind: "photo" as const, tags: ["cabinets", "before"], pairKey: "k", createdAt: "2026-10-01" },
      { _id: "p2", kind: "photo" as const, tags: ["cabinets", "after"], pairKey: "k", createdAt: "2026-10-02" },
      { _id: "v1", kind: "video" as const, tags: ["cabinets"], createdAt: "2026-10-05" },
      { _id: "v2", kind: "video" as const, tags: ["process"], createdAt: "2026-10-06" },
    ];
    expect(pickAssets(assets, "cabinets", new Set()).map((a) => a._id)).toEqual(["p1", "p2", "v1"]);
    expect(pickAssets(assets, "cabinets", new Set(["v1"])).map((a) => a._id)).toEqual(["p1", "p2"]);
    expect(pickAssets(assets, "exterior", new Set()).map((a) => a._id)).toEqual(["v2"]);
  });

  test("names, weeks and fatigue", () => {
    expect(creativeName("k57abcdefgh;adHooks", "es", "9x16", new Date("2026-11-03T12:00:00Z"))).toMatch(/^WL_[a-z0-9]{6}_ES_916_20261103$/);
    expect(creativeName("k57abcdefgh;adHooks", "en", "4x5", new Date("2026-11-03T12:00:00Z"))).toBe(
      creativeName("k57abcdefgh;adHooks", "en", "4x5", new Date("2026-11-03T20:00:00Z")),
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
    const parsed = parseScripts('Here you go:\n```json\n{"en":{"voice":"x"},"es":{"voice":"y"}}\n```');
    expect(parsed).toEqual({ en: { voice: "x" }, es: { voice: "y" } });
    expect(parseScripts("no json here")).toBeNull();
  });

  test("the Shotstack edit: the right size, captions off the voice, a wipe only for a pair, the ask on the last card", () => {
    const brand = { name: "Permian Home Quotes", primaryColor: "#336699", accentColor: "#8fb6e0" };
    const pair = [
      { url: "https://x/before.jpg", kind: "photo" as const, tags: ["cabinets", "before"], pairKey: "k" },
      { url: "https://x/after.jpg", kind: "photo" as const, tags: ["cabinets", "after"], pairKey: "k" },
    ];
    const edit = shotstackEdit({
      assets: pair,
      audioUrl: "https://x/voice.mp3",
      durationSec: 24,
      script: GOOD,
      brand,
      ratio: "9x16",
      language: "es",
    });
    expect(edit.output).toEqual({ format: "mp4", fps: 25, size: { width: 1080, height: 1920 } });
    const tracks = edit.timeline.tracks as Array<{ clips: any[] }>;
    expect(tracks[0].clips[0].asset).toMatchObject({ type: "caption", src: "alias://voice" });
    const media = tracks[3].clips;
    expect(media[1].transition).toEqual({ in: "wipeLeft" });
    expect(media[0].start + media[0].length).toBeCloseTo(media[1].start);
    expect(tracks[2].clips[1].asset.html).toContain("Pide tu presupuesto");
    expect(tracks[4].clips[0]).toMatchObject({ alias: "voice", asset: { type: "audio", src: "https://x/voice.mp3" } });

    const single = shotstackEdit({
      assets: [{ url: "https://x/clip.mp4", kind: "video", tags: ["exterior"] }],
      audioUrl: "https://x/v.mp3",
      durationSec: 60,
      script: GOOD,
      brand,
      ratio: "4x5",
      language: "en",
    });
    expect(single.output.size).toEqual({ width: 1080, height: 1350 });
    const clip = (single.timeline.tracks as Array<{ clips: any[] }>)[3].clips[0];
    expect(clip.transition).toBeUndefined();
    expect(clip.asset).toEqual({ type: "video", src: "https://x/clip.mp4", volume: 0 });
    // Capped at 30 seconds however long the voice runs.
    expect(clip.length + 3).toBe(30);
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

  test("the six painting hooks seed once; hooks are edited, switched off and removed", async () => {
    const t = setup();
    const staff = await signUp(t, "ops@tolliver.example", { role: "staff" });
    expect(await staff.as.mutation(api.ads.seedHooks, {})).toBe(6);
    expect(await staff.as.mutation(api.ads.seedHooks, {})).toBe(0);
    const hooks = await staff.as.query(api.ads.listHooks, {});
    expect(hooks.map((h) => h.family).sort()).toEqual(["before_after", "education", "objection", "owner_story", "proof", "seasonal"]);
    expect(hooks.every((h) => h.active && h.textEs && h.familyLabel)).toBe(true);
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
    const data = { adAccountId: "act_123", pageId: "77", leadFormId: "", adsetEn: "900", weeklyEnabled: true, hooksPerWeek: 9, liveTarget: 1 };
    await expect(staff.as.mutation(api.ads.saveSettings, data)).rejects.toThrow("Only Webb Leads admins");
    await owner.as.mutation(api.ads.saveSettings, data);
    expect(await staff.as.query(api.ads.settings, {})).toMatchObject({
      adAccountId: "123",
      pageId: "77",
      adsetEn: "900",
      weeklyEnabled: true,
      hooksPerWeek: 4,
      liveTarget: 2,
    });
  });
});

/** What each outside service answers during a weekly run. */
function stubServices(calls: Array<{ url: string; body?: string }>, opts: { scriptsFail?: boolean; renderFails?: boolean } = {}) {
  const scripts = {
    en: GOOD,
    es: {
      ...GOOD,
      headline: "Gabinetes pintados, cocina nueva",
      primaryText: "Un acabado nuevo en tus gabinetes. Un pintor local verificado y un presupuesto gratis.",
      voice: GOOD.voice.replace("Get a quote today", "Pide tu presupuesto hoy"),
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({
        url,
        body: typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : undefined,
      });
      if (url.includes("api.anthropic.com"))
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: opts.scriptsFail
                  ? "Sure! " + JSON.stringify({ en: { ...GOOD, primaryText: "Only $999 this week" }, es: scripts.es })
                  : JSON.stringify(scripts),
              },
            ],
          }),
        );
      if (url.includes("api.elevenlabs.io")) return new Response(new Blob(["mp3"], { type: "audio/mpeg" }));
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
  return scripts;
}

async function library(t: T, staff: Awaited<ReturnType<typeof signUp>>) {
  await staff.as.mutation(api.ads.seedHooks, {});
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "before.jpg", tags: ["cabinets", "before"], pairKey: "k" });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t), fileName: "after.jpg", tags: ["cabinets", "after"], pairKey: "k" });
  await staff.as.mutation(api.ads.addAsset, { storageId: await store(t, "video/mp4", "mp4"), fileName: "roller.mp4", tags: ["process"] });
}

describe("the weekly run", () => {
  test("drafts two hooks in two languages and two sizes, voices, renders and creates each PAUSED in Meta; the batch is ready and staff hear", async () => {
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
      adsetEn: "900",
      adsetEs: "901",
      voiceEn: "ven",
      voiceEs: "ves",
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
    expect(batch).toMatchObject({ status: "ready", summary: "8 paused in Meta" });
    expect(batch.creatives.length).toBe(8);
    expect(new Set(batch.creatives.map((c) => c.hook!.family)).size).toBe(2);
    expect(batch.creatives.every((c) => c.status === "paused" && c.videoUrl && c.meta?.adId === "ad1")).toBe(true);
    const es = batch.creatives.find((c) => c.language === "es" && c.ratio === "9x16")!;
    expect(es.name).toMatch(/^WL_[a-z0-9]{6}_ES_916_\d{8}$/);
    expect(es.script.headline).toBe("Gabinetes pintados, cocina nueva");
    expect(es.meta?.adsetId).toBe("901");
    // The hooks were used once each; a pair went to the cabinets hook, the roller clip to the other.
    const hooks = await owner.as.query(api.ads.listHooks, {});
    expect(hooks.filter((h) => h.uses === 1).length).toBe(2);
    // Claude twice (one per hook), ElevenLabs four times (hook × language), Shotstack eight renders, Meta three calls per creative.
    expect(calls.filter((c) => c.url.includes("anthropic")).length).toBe(2);
    expect(calls.filter((c) => c.url.includes("elevenlabs")).length).toBe(4);
    expect(calls.filter((c) => c.url.endsWith("/render")).length).toBe(8);
    const ads = calls.filter((c) => c.url.endsWith("/ads"));
    expect(ads.length).toBe(8);
    expect(new URLSearchParams(ads[0].body).get("status")).toBe("PAUSED");
    const creative = JSON.parse(new URLSearchParams(calls.find((c) => c.url.endsWith("/adcreatives"))!.body).get("object_story_spec")!);
    expect(creative.video_data.call_to_action).toEqual({ type: "GET_QUOTE", value: { lead_gen_form_id: "f1" } });
    expect(calls.find((c) => c.url.includes("elevenlabs"))!.url).toContain("/text-to-speech/ven");
    // The prompt carried the brand and the guardrails.
    const prompt = JSON.parse(calls.find((c) => c.url.includes("anthropic"))!.body!).messages[0].content as string;
    expect(prompt).toContain("Permian Home Quotes");
    expect(prompt).toContain("never as a homeowner or customer");

    // Approve one: live here, ACTIVE in Meta. Retire it: paused in Meta and the hook scored.
    vi.useFakeTimers();
    await owner.as.mutation(api.ads.activate, { id: es.id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect(new URLSearchParams(calls[calls.length - 1].body).get("status")).toBe("ACTIVE");
    expect(calls[calls.length - 1].url).toContain("/ad1");
    // Live lists everything in Meta: the one approved and the seven still paused.
    const live = await owner.as.query(api.ads.live, {});
    expect(live.length).toBe(8);
    expect(live.find((r) => r.id === es.id)).toMatchObject({ status: "live", intake: { leads: 0, confirmed: 0, sold: 0, revenueCents: 0 } });
    expect(live.filter((r) => r.status === "paused").length).toBe(7);
    // A family that is live is skipped by the next pick.
    const plan = await t.query(internal.ads.plan, { hooksPerWeek: 4 });
    expect(plan.hooks.some((h) => h.family === es.hook!.family)).toBe(false);
  });

  /** One hook a week, no Meta account, on a fresh backend. */
  async function noMeta() {
    const t = setup();
    const owner = await signUp(t, "owner@tolliver.example", { role: "super_admin" });
    await library(t, owner);
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    vi.stubEnv("ELEVENLABS_API_KEY", "e");
    vi.stubEnv("SHOTSTACK_API_KEY", "s");
    await owner.as.mutation(api.ads.saveSettings, { voiceEn: "ven", voiceEs: "ves", weeklyEnabled: false, hooksPerWeek: 1, liveTarget: 6 });
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
    expect(await draft()).toMatchObject({ status: "failed", error: expect.stringContaining("English mentions a price or discount") });
    stubServices(calls);
    await t.action(internal.ads.weeklyRun, {});
    expect((await owner.as.query(api.ads.batches, {})).length).toBe(1);
  });

  test("a failed render fails that creative, and the batch still finishes", async () => {
    const { calls, draft } = await noMeta();
    stubServices(calls, { renderFails: true });
    const batch = await draft();
    expect(batch).toMatchObject({ status: "ready", summary: "0 paused in Meta · 4 failed" });
    expect(batch.creatives.every((c) => c.status === "failed" && c.error?.includes("bad asset"))).toBe(true);
  });

  test("without a Meta account the renders wait here, watchable, and can't be approved", async () => {
    const { owner, calls, draft } = await noMeta();
    stubServices(calls);
    const latest = await draft();
    expect(latest).toMatchObject({ status: "ready", summary: "0 paused in Meta · 4 rendered but not in Meta" });
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
      const name = "WL_abc123_EN_916_20261102";
      const creativeId = await ctx.db.insert("adCreatives", {
        batchId,
        hookId: hook._id,
        language: "en",
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
