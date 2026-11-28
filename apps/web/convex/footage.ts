// Job site videos: a clip from the Library runs as the ad, as it was shot (lib/footage.ts says what is added to it).
//
// "Make a job site ad" on a video in Ops → Ads → Library starts it. ElevenLabs writes down what is said in the
// clip and when, which becomes the captions; Claude writes the title, headline and text around it, following the
// trade's best competitor ad on file; and the ad goes to be drawn in two sizes with the clip's own sound, like any
// other ad. It is approved in Ops → Ads → This week like the rest.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { ANY_SCOPE, creativeName, inTrade, parseJson, tradeOf, weekOf } from "./lib/ads";
import { callClaude } from "./lib/claude";
import { FOOTAGE_MAX_SEC, fitTitle, footageProblems, footagePrompt, linesFromHeard, pickFootageSwipe, type FootageCopy } from "./lib/footage";
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
    if (asset.durationSec && asset.durationSec > FOOTAGE_MAX_SEC)
      fail("INVALID", `That clip runs ${Math.round(asset.durationSec)} seconds. Trim it to ${FOOTAGE_MAX_SEC} seconds or less and upload it again`);
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
  },
  handler: async (ctx, { batchId, hookId, assetId, copy, lines, durationSec, muteClip }) => {
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
          design: { style: "footage", title: copy.title, ...(engine ? { engine } : {}), ...(muteClip ? { muteClip: true } : {}) },
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
      const heard = await heardWords(clip);
      const lines = linesFromHeard(heard);
      const lastWord = lines.length ? lines[lines.length - 1].end : 0;
      const durationSec = Math.round(Math.max(input.durationSec ?? 0, lastWord + 0.5, 3) * 100) / 100;
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
      await ctx.runMutation(internal.footage.addFootage, { batchId, hookId, assetId, copy: words, lines: speech === "crew" ? lines : [], durationSec, muteClip: speech === "song" });
      await ctx.scheduler.runAfter(0, internal.ads.startRenders, {});
    } catch (e) {
      await ctx.runMutation(internal.ads.failBatch, { batchId, error: `The job site ad couldn't be made: ${errText(e)}` });
    }
  },
});
