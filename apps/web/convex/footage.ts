// Job site videos: a clip from the Library runs as the ad, as it was shot (lib/footage.ts says what is added to it).
//
// "Make a job site ad" on a video in Ops → Ads → Library starts it. ElevenLabs writes down what is said in the
// clip and when, which becomes the captions; Claude writes the title, headline and text around it, following the
// trade's best competitor ad on file; and the ad goes to be drawn in two sizes with the clip's own sound, like any
// other ad. It is approved in Ops → Ads → This week like the rest.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { ANY_SCOPE, creativeName, inTrade, parseJson, tradeOf, weekOf } from "./lib/ads";
import { callClaude } from "./lib/claude";
import {
  CLIP_MAX_SEC,
  FOOTAGE_MAX_SEC,
  cleanCuts,
  cutTotal,
  cutsPrompt,
  fitTitle,
  footageProblems,
  footagePrompt,
  linesFromHeard,
  pickFootageSwipe,
  readCuts,
  scanEvery,
  wordsInCuts,
  type FootageCopy,
} from "./lib/footage";
import { consumerBrand } from "./lib/support";
import { heardWords } from "./voiceActors";

/** The model the ad maker writes with. */
const AD_MODEL = "claude-sonnet-5-5";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** Starts a job site ad from a video in the Library: its own batch, built on the trade's best competitor ad. */
export const make = mutation({
  args: { assetId: v.id("adAssets") },
  handler: async (ctx, { assetId }) => {
    const user = await requireStaff(ctx);
    const asset = await ctx.db.get(assetId);
    if (!asset) fail("NOT_FOUND", "That video isn't in the library");
    if (asset.kind !== "video") fail("INVALID", "A job site ad is made from a video");
    // Cut to its good parts, it is as long as those; uncut, it runs whole.
    const cuts = cleanCuts(asset.cuts, asset.durationSec ?? 0);
    const runs = cuts.length ? cutTotal(cuts) : asset.durationSec;
    if (runs && runs > FOOTAGE_MAX_SEC)
      fail("INVALID", cuts.length ? `The parts you kept run ${Math.round(runs)} seconds. Keep ${FOOTAGE_MAX_SEC} seconds or less` : `That clip runs ${Math.round(runs)} seconds. Choose the parts to keep first (Create ads → Video → Job site clip)`);
    const trade = tradeOf(asset.trade);
    const scope = asset.tags.find((t) => trade.scopes.includes(t)) ?? ANY_SCOPE;
    // The words around the clip follow a competitor ad that has kept running, like every ad's do: one that is itself
    // work on camera when there is one (lib/footage.ts isWorkFootage).
    const onFile = (await ctx.db.query("adSwipes").take(1000)).filter((x) => inTrade(x, trade.slug) && x.hook.trim());
    const swipe = pickFootageSwipe(onFile, scope);
    if (!swipe) fail("INVALID", `No ${trade.label.toLowerCase()} competitor ad on file to build it on. Run the competitor search first`);
    const hookId = await ctx.db.insert("adHooks", {
      family: "proof",
      scope,
      trade: trade.slug,
      textEn: `Job site video: ${asset.fileName}`.slice(0, 220),
      // Never drafted on its own by the weekly run: it belongs to this clip.
      active: false,
      uses: 0,
      wins: 0,
      losses: 0,
      createdAt: nowIso(),
      swipeId: swipe._id,
      photoId: assetId,
    });
    const batchId = await ctx.db.insert("adBatches", { trade: trade.slug, weekOf: weekOf(new Date()), status: "drafting", startedBy: user._id, createdAt: nowIso() });
    await ctx.scheduler.runAfter(0, internal.footage.write, { batchId, hookId, assetId });
    return { batchId, builtOn: swipe.company };
  },
});

/** Everything the words are written from: the clip, what Claude saw in it, and the competitor ad to follow. */
export const writeInput = internalQuery({
  args: { hookId: v.id("adHooks"), assetId: v.id("adAssets") },
  handler: async (ctx, { hookId, assetId }) => {
    const asset = await ctx.db.get(assetId);
    const hook = await ctx.db.get(hookId);
    const swipe = hook?.swipeId ? await ctx.db.get(hook.swipeId) : null;
    if (!asset || !hook || !swipe) return null;
    const settings = (await ctx.db.query("adSettings").take(1))[0];
    return {
      storageId: asset.storageId,
      durationSec: asset.durationSec,
      cuts: cleanCuts(asset.cuts, asset.durationSec ?? 0),
      seen: asset.description,
      posterUrl: asset.posterStorageId ? ((await ctx.storage.getUrl(asset.posterStorageId)) ?? undefined) : undefined,
      trade: tradeOf(asset.trade).label,
      town: settings?.researchMarkets?.[0] ?? "",
      brand: consumerBrand(),
      swipe: { company: swipe.company, hook: swipe.hook, offer: swipe.offer, adCopy: swipe.adCopy, transcript: swipe.transcript, daysRunning: swipe.daysRunning },
    };
  },
});

/** The clip's two sizes, ready to be drawn: the clip is the picture and the voice, what is said in it the captions. */
export const addFootage = internalMutation({
  args: {
    batchId: v.id("adBatches"),
    hookId: v.id("adHooks"),
    assetId: v.id("adAssets"),
    copy: v.object({ title: v.string(), headline: v.string(), primaryText: v.string() }),
    lines: v.array(v.object({ voice: v.string(), start: v.number(), end: v.number(), words: v.array(v.object({ text: v.string(), start: v.number(), end: v.number() })) })),
    durationSec: v.number(),
    muteClip: v.optional(v.boolean()),
    cuts: v.optional(v.array(v.object({ from: v.number(), to: v.number() }))),
  },
  handler: async (ctx, { batchId, hookId, assetId, copy, lines, durationSec, muteClip, cuts }) => {
    const asset = await ctx.db.get(assetId);
    if (!asset) throw new Error("The video left the library");
    const script = {
      voice: lines.map((l) => l.voice).join(" "),
      onScreen: [copy.title],
      headline: copy.headline,
      primaryText: copy.primaryText,
      shots: lines.map((l) => ({ assetId, voice: l.voice, onScreen: "", start: l.start, end: l.end, words: l.words })),
    };
    const now = new Date();
    const ids: Id<"adCreatives">[] = [];
    // The test: each size also drawn with Tesseract, same clip and words, to compare (Settings → Tesseract).
    const settings = (await ctx.db.query("adSettings").take(1))[0];
    const engines = settings?.tesseractFootage === false ? [undefined] : [undefined, "tesseract" as const];
    for (const engine of engines)
    for (const ratio of ["9x16", "4x5"] as const) {
      const base = `${creativeName(hookId, ratio, now)}${engine ? "_tx" : ""}`;
      let name = base;
      for (let n = 2; (await ctx.db.query("adCreatives").withIndex("by_name", (q) => q.eq("name", name)).first()) !== null; n++) name = `${base}_${n}`;
      ids.push(
        await ctx.db.insert("adCreatives", {
          batchId,
          hookId,
          ratio,
          name,
          script,
          design: { style: "footage", title: copy.title, ...(engine ? { engine } : {}), ...(muteClip ? { muteClip: true } : {}), ...(cuts?.length ? { cuts } : {}) },
          assetIds: [assetId],
          // The clip's own sound is the voice.
          audioStorageId: asset.storageId,
          audioDurationSec: durationSec,
          status: "voiced",
          createdAt: nowIso(),
        }),
      );
    }
    await ctx.db.patch(assetId, { uses: (asset.uses ?? 0) + 1, lastUsedAt: nowIso() });
    const hook = await ctx.db.get(hookId);
    if (hook) await ctx.db.patch(hookId, { uses: hook.uses + 1, lastUsedAt: nowIso() });
    return ids;
  },
});

/** Hears the clip, writes the words around it, checks them, and sends the ad to be drawn. One retry with the problems named. */
export const write = internalAction({
  args: { batchId: v.id("adBatches"), hookId: v.id("adHooks"), assetId: v.id("adAssets") },
  handler: async (ctx, { batchId, hookId, assetId }) => {
    try {
      const input = await ctx.runQuery(internal.footage.writeInput, { hookId, assetId });
      if (!input) throw new Error("The video or the competitor ad it was built on is gone");
      const clip = await ctx.storage.get(input.storageId);
      if (!clip) throw new Error("The video's file is gone");
      const all = await heardWords(clip);
      // Cut to its good parts: only what is said in them is captioned, timed on the cut clip, and the ad is as long as they are.
      const cut = input.cuts.length > 0;
      const heard = cut ? wordsInCuts(all, input.cuts) : all;
      const lines = linesFromHeard(heard);
      const lastWord = lines.length ? lines[lines.length - 1].end : 0;
      const durationSec = cut ? cutTotal(input.cuts) : Math.round(Math.max(input.durationSec ?? 0, lastWord + 0.5, 3) * 100) / 100;
      if (durationSec > 90.5) throw new Error(`The clip runs ${Math.round(durationSec)} seconds. Trim it to 90 seconds or less`);
      const prompt = footagePrompt({ brand: input.brand, trade: input.trade, town: input.town, heard: lines.map((l) => l.voice).join(" "), seen: input.seen, swipe: input.swipe });
      const content: unknown[] = [{ type: "text", text: prompt }, ...(input.posterUrl ? [{ type: "image", source: { type: "url", url: input.posterUrl } }] : [])];
      let problems: string[] = [];
      let copy: FootageCopy | null = null;
      for (let attempt = 0; attempt < 2 && !copy; attempt++) {
        const ask = attempt === 0 ? content : [...content, { type: "text", text: `Your last answer had these problems: ${problems.join("; ")}. Fix them and answer again with JSON only.` }];
        const reply = await callClaude({ model: AD_MODEL, max_tokens: 2000, messages: [{ role: "user", content: ask }] });
        const text = reply.content.map((b) => (typeof b.text === "string" ? b.text : "")).join("");
        const plan = parseJson<FootageCopy>(text);
        // The title only names the ad: one that runs over is cut to fit, not sent back.
        if (plan && typeof plan.title === "string") plan.title = fitTitle(plan.title);
        problems = footageProblems(plan);
        if (problems.length === 0) copy = { title: plan!.title.trim(), headline: plan!.headline.trim(), primaryText: plan!.primaryText.trim(), speech: plan!.speech };
      }
      if (!copy) throw new Error(`The words for the video still broke the rules: ${problems.join("; ")}`);
      // Only the crew's own words become captions. A song playing in the clip gives no captions, and its sound is
      // replaced with our music (a copyrighted song gets an ad muted or blocked).
      const { speech, ...words } = copy;
      await ctx.runMutation(internal.footage.addFootage, { batchId, hookId, assetId, copy: words, lines: speech === "crew" ? lines : [], durationSec, muteClip: speech === "song", ...(cut ? { cuts: input.cuts } : {}) });
      await ctx.scheduler.runAfter(0, internal.ads.startRenders, {});
    } catch (e) {
      await ctx.runMutation(internal.ads.failBatch, { batchId, error: `The job site ad couldn't be made: ${errText(e)}` });
    }
  },
});


// ------------------------------------------------------------------ Looking through a clip and choosing its good parts
//
// 1. The clip is looked through: the clips runner (.github/workflows/ads-clips.yml, ads-video/scripts/scan-clips.mjs)
//    takes a frame every second or two with ffmpeg and stores them as contact sheets (scanClaim, scanDone).
// 2. The app proposes the parts to keep (proposeCuts): Claude is shown the sheets and what is said when.
// 3. The owner sees them over the clip and changes them (clipForEdit, setCuts), or asks for a new proposal.
// 4. The ad is made from those parts only (make, write above).

/** Asks GitHub to run the clips runner, which also looks through clips. Nothing without ADS_RENDER_TOKEN. */
export const startScan = internalAction({
  args: {},
  handler: async () => {
    const token = process.env.ADS_RENDER_TOKEN;
    if (!token) return { started: false };
    const repo = process.env.ADS_RENDER_REPO ?? "Cymoe/Estimate-Wave-App";
    const ref = process.env.ADS_RENDER_REF ?? "fieldquote-convex";
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ads-clips.yml/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "ad-maker" },
      body: JSON.stringify({ ref }),
    });
    if (!res.ok) console.error("start clip scan", res.status, (await res.text()).slice(0, 200));
    return { started: res.ok };
  },
});

/** The runner asks for clips to look through: ones asked for, not yet looked through and short enough. */
export const scanClaim = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const waiting = (await ctx.db.query("adAssets").withIndex("by_kind", (q) => q.eq("kind", "video")).take(1000)).filter(
      (a) => a.scanAskedAt && !a.scan && (a.durationSec ?? 0) <= CLIP_MAX_SEC,
    );
    const out: Array<{ id: Id<"adAssets">; url: string; durationSec: number; every: number }> = [];
    for (const a of waiting.slice(0, Math.max(1, Math.min(10, limit)))) {
      const url = await ctx.storage.getUrl(a.storageId);
      if (!url) continue;
      out.push({ id: a._id, url, durationSec: a.durationSec ?? 0, every: scanEvery(a.durationSec ?? 0) });
    }
    return out;
  },
});

/** The runner hands in a clip's contact sheets (or says why it couldn't); the app then proposes the parts to keep. */
export const scanDone = internalMutation({
  args: {
    id: v.id("adAssets"),
    sheets: v.optional(v.array(v.id("_storage"))),
    every: v.optional(v.number()),
    frames: v.optional(v.number()),
    cols: v.optional(v.number()),
    per: v.optional(v.number()),
    tileW: v.optional(v.number()),
    tileH: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, sheets, every, frames, cols, per, tileW, tileH, durationSec, error }) => {
    const a = await ctx.db.get(id);
    if (!a) {
      for (const s of sheets ?? []) await ctx.storage.delete(s);
      return;
    }
    if (!sheets?.length || !every || !frames || !cols || !per || !tileW || !tileH) {
      await ctx.db.patch(id, { scanAskedAt: undefined, cutsError: (error ?? "The clip couldn't be looked through").slice(0, 300) });
      return;
    }
    for (const old of a.scan?.sheets ?? []) await ctx.storage.delete(old);
    await ctx.db.patch(id, { scan: { every, frames, cols, per, tileW, tileH, sheets, at: nowIso() }, cutsError: undefined, ...(durationSec && !a.durationSec ? { durationSec } : {}) });
    // The owner's own parts are never replaced by a proposal.
    if (a.cutsBy !== "person") await ctx.scheduler.runAfter(0, internal.footage.proposeCuts, { assetId: id });
  },
});

export const cutsInput = internalQuery({
  args: { assetId: v.id("adAssets") },
  handler: async (ctx, { assetId }) => {
    const a = await ctx.db.get(assetId);
    if (!a || a.kind !== "video" || !a.scan) return null;
    const sheets: string[] = [];
    for (const s of a.scan.sheets) {
      const url = await ctx.storage.getUrl(s);
      if (url) sheets.push(url);
    }
    return { storageId: a.storageId, durationSec: a.durationSec ?? a.scan.frames * a.scan.every, every: a.scan.every, frames: a.scan.frames, seen: a.description, trade: tradeOf(a.trade).label, sheets, cutsBy: a.cutsBy };
  },
});

/** The app's own edit: Claude is shown the clip's frames and what is said when, and names the parts to keep. */
export const proposeCuts = internalAction({
  args: { assetId: v.id("adAssets"), force: v.optional(v.boolean()) },
  handler: async (ctx, { assetId, force }) => {
    const input: { storageId: Id<"_storage">; durationSec: number; every: number; frames: number; seen?: string; trade: string; sheets: string[]; cutsBy?: "app" | "person" } | null =
      await ctx.runQuery(internal.footage.cutsInput, { assetId });
    if (!input || (input.cutsBy === "person" && !force)) return;
    try {
      // What is said when, so a part doesn't cut a sentence in half. A clip that can't be heard is cut by eye alone.
      let lines: ReturnType<typeof linesFromHeard> = [];
      try {
        const clip = await ctx.storage.get(input.storageId);
        if (clip) lines = linesFromHeard(await heardWords(clip));
      } catch (e) {
        console.error("hear clip for cuts", errText(e));
      }
      const content: unknown[] = [
        { type: "text", text: cutsPrompt({ trade: input.trade, durationSec: input.durationSec, every: input.every, frames: input.frames, seen: input.seen, lines }) },
        ...input.sheets.flatMap((url, i) => [
          { type: "text", text: `Sheet ${i + 1} of ${input.sheets.length}:` },
          { type: "image", source: { type: "url", url } },
        ]),
      ];
      let found: ReturnType<typeof readCuts> = null;
      for (let attempt = 0; attempt < 2 && !found; attempt++) {
        const reply = await callClaude({ model: AD_MODEL, max_tokens: 2000, messages: [{ role: "user", content }] });
        found = readCuts(reply.content.map((b) => (typeof b.text === "string" ? b.text : "")).join(""), input.durationSec);
      }
      if (!found) throw new Error("No usable edit came back. Choose the parts yourself, or ask again.");
      await ctx.runMutation(internal.footage.saveCuts, { assetId, cuts: found.cuts, note: found.note });
    } catch (e) {
      await ctx.runMutation(internal.footage.saveCuts, { assetId, error: errText(e) });
    }
  },
});

export const saveCuts = internalMutation({
  args: { assetId: v.id("adAssets"), cuts: v.optional(v.array(v.object({ from: v.number(), to: v.number() }))), note: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { assetId, cuts, note, error }) => {
    const a = await ctx.db.get(assetId);
    if (!a) return;
    if (!cuts) {
      await ctx.db.patch(assetId, { cutsError: (error ?? "No edit could be proposed").slice(0, 300) });
      return;
    }
    await ctx.db.patch(assetId, { cuts: cleanCuts(cuts, a.durationSec ?? Infinity), cutsBy: "app", cutsNote: note, cutsError: undefined });
  },
});

/**
 * A clip opened for editing: the clip, its frames, and the parts kept so far. Opening one that hasn't been looked
 * through is what asks for it (prepareClip).
 */
export const clipForEdit = query({
  args: { assetId: v.id("adAssets") },
  handler: async (ctx, { assetId }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(assetId);
    if (!a || a.kind !== "video") return null;
    const sheets: string[] = [];
    for (const s of a.scan?.sheets ?? []) sheets.push((await ctx.storage.getUrl(s)) ?? "");
    const durationSec = a.durationSec ?? (a.scan ? a.scan.frames * a.scan.every : 0);
    const cuts = cleanCuts(a.cuts, durationSec || Infinity);
    return {
      id: a._id,
      fileName: a.fileName,
      videoUrl: (await ctx.storage.getUrl(a.storageId)) ?? undefined,
      durationSec,
      scan: a.scan ? { every: a.scan.every, frames: a.scan.frames, cols: a.scan.cols, per: a.scan.per, tileW: a.scan.tileW, tileH: a.scan.tileH, sheets } : undefined,
      // Being looked through, or its parts being chosen, right now.
      looking: Boolean(a.scanAskedAt && !a.scan),
      choosing: Boolean(a.scan && !a.cuts && !a.cutsError),
      tooLong: durationSec > CLIP_MAX_SEC,
      cuts,
      total: cutTotal(cuts),
      cutsBy: a.cutsBy,
      note: a.cutsNote,
      error: a.cutsError,
      canLook: Boolean(process.env.ADS_RENDER_TOKEN),
    };
  },
});

/** Has a clip looked through and its parts proposed, if that hasn't been done; `again` asks for a fresh proposal. */
export const prepareClip = mutation({
  args: { assetId: v.id("adAssets"), again: v.optional(v.boolean()) },
  handler: async (ctx, { assetId, again }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(assetId);
    if (!a || a.kind !== "video") fail("NOT_FOUND", "That video isn't in the library");
    if ((a.durationSec ?? 0) > CLIP_MAX_SEC) fail("INVALID", `That clip runs ${Math.round((a.durationSec ?? 0) / 60)} minutes. Upload one of ${CLIP_MAX_SEC / 60} minutes or less`);
    if (!a.scan) {
      // Asked again after a while (the runner missed it): the ask is renewed.
      const stale = !a.scanAskedAt || Date.now() - Date.parse(a.scanAskedAt) > 10 * 60_000;
      if (stale) {
        await ctx.db.patch(assetId, { scanAskedAt: nowIso(), cutsError: undefined });
        await ctx.scheduler.runAfter(0, internal.footage.startScan, {});
      }
      return { looking: true };
    }
    if (again || (!a.cuts && a.cutsError)) {
      await ctx.db.patch(assetId, { cuts: undefined, cutsBy: undefined, cutsNote: undefined, cutsError: undefined });
      await ctx.scheduler.runAfter(0, internal.footage.proposeCuts, { assetId, force: true });
    }
    return { looking: false };
  },
});

/** The owner's own parts: saved as given (within the clip, each at least a second), and never replaced by a proposal. */
export const setCuts = mutation({
  args: { assetId: v.id("adAssets"), cuts: v.array(v.object({ from: v.number(), to: v.number() })) },
  handler: async (ctx, { assetId, cuts }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(assetId);
    if (!a || a.kind !== "video") fail("NOT_FOUND", "That video isn't in the library");
    const clean = cleanCuts(cuts, a.durationSec ?? Infinity);
    if (clean.length === 0) fail("INVALID", "Keep at least one part of a second or more");
    if (cutTotal(clean) > FOOTAGE_MAX_SEC) fail("INVALID", `Those parts run ${Math.round(cutTotal(clean))} seconds. Keep ${FOOTAGE_MAX_SEC} seconds or less`);
    await ctx.db.patch(assetId, { cuts: clean, cutsBy: "person", cutsError: undefined });
    return { parts: clean.length, total: cutTotal(clean) };
  },
});

/** From the deployment: asks for every clip not yet looked through to be, and starts the runner. */
export const scanAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    let asked = 0;
    for (const a of await ctx.db.query("adAssets").withIndex("by_kind", (q) => q.eq("kind", "video")).take(1000)) {
      if (a.scan || (a.durationSec ?? 0) > CLIP_MAX_SEC) continue;
      await ctx.db.patch(a._id, { scanAskedAt: nowIso(), cutsError: undefined });
      asked++;
    }
    if (asked) await ctx.scheduler.runAfter(0, internal.footage.startScan, {});
    return { asked };
  },
});

/** From the deployment: what every clip's edit looks like now, to check proposals. */
export const cutsReport = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("adAssets").withIndex("by_kind", (q) => q.eq("kind", "video")).take(1000)).map((a) => ({
      id: a._id,
      fileName: a.fileName,
      trade: a.trade,
      tags: a.tags,
      durationSec: a.durationSec,
      scanned: Boolean(a.scan),
      frames: a.scan?.frames,
      cuts: a.cuts,
      cutsBy: a.cutsBy,
      note: a.cutsNote,
      error: a.cutsError,
      description: (a.description ?? "").slice(0, 120),
    })),
});
