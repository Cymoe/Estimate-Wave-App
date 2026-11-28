// An on-camera creator says the ad's lines (lib/voiceActors.ts creatorBrief tells them how to film it).
//
// No creator marketplace takes an order by API, so the take comes back by hand: whoever has the file adds it to
// the ad in Ops → Ads ("Add on-camera take"). It goes on both of the idea's sizes. ElevenLabs writes down when
// each word was said, the same check as a voice actor's read decides whether it follows the script, and then the
// ad is timed to the take and drawn: its sound is the voice, and the renderer keys out the green and stands the
// creator in front of the job's photos (ads-video/src/parts/Presenter.tsx).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { linesOf, useRead } from "./lib/adVoice";
import { READ_MATCH_MIN, alignmentFromWords } from "./lib/voiceActors";
import { heardWords } from "./voiceActors";

/** The largest take that may be added. */
export const MAX_TAKE = 300 * 1024 * 1024;

/** A video by its type, or by its name when it came without one. */
export const isVideo = (contentType: string | undefined, fileName = "") =>
  contentType ? contentType.startsWith("video/") : /\.(mp4|mov|m4v|webm)$/i.test(fileName);

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/**
 * Puts a creator's take on an ad and its other size, and sends it to be timed. An ad already in Meta keeps the
 * file Meta has: reject it and make it again for a take.
 */
export const addTake = mutation({
  // The file's name, for when the upload carries no type (some phones send a MOV without one).
  args: { id: v.id("adCreatives"), storageId: v.id("_storage"), fileName: v.optional(v.string()) },
  handler: async (ctx, { id, storageId, fileName }) => {
    await requireStaff(ctx);
    const file = await ctx.db.system.get(storageId);
    if (!file) fail("NOT_FOUND", "The upload didn't arrive");
    if (!isVideo(file.contentType, fileName)) fail("INVALID", "A take is a video file (MP4 or MOV)");
    if (file.size > MAX_TAKE) fail("INVALID", "That take is over 300 MB: export it at 1080p and add it again");
    const c = await ctx.db.get(id);
    if (c === null) fail("NOT_FOUND", "That ad is gone");
    if (!c.design) fail("INVALID", "This ad was made before ads were drawn this way");
    if (c.design.style === "footage") fail("INVALID", "A job site video's voice is its own sound: it takes no on-camera take");
    // Both sizes of the idea say the same lines; the still has no sound of its own.
    const sizes = (
      await ctx.db
        .query("adCreatives")
        .withIndex("by_batch", (q) => q.eq("batchId", c.batchId))
        .collect()
    ).filter((x) => x.hookId === c.hookId && x.kind !== "image" && x.design?.style === c.design!.style && (x.design?.look ?? "") === (c.design!.look ?? ""));
    if (sizes.some((x) => x.meta?.adId || x.status === "live" || x.status === "retired"))
      fail("INVALID", "This ad is already in Meta. Reject it and make it again, then add the take to the new one");
    if (sizes.some((x) => x.status === "rendering")) fail("INVALID", "This ad is being drawn right now. Add the take once it's done");
    const old = new Set<Id<"_storage">>();
    for (const x of sizes) {
      if (x.presenter && x.presenter.storageId !== storageId) old.add(x.presenter.storageId);
      if (x.videoStorageId) old.add(x.videoStorageId);
      await ctx.db.patch(x._id, {
        presenter: { storageId, addedAt: nowIso() },
        status: "recording",
        error: undefined,
        videoStorageId: undefined,
        renderStartedAt: undefined,
      });
    }
    // The earlier take and the drawing made without this one are replaced.
    for (const s of old) await ctx.storage.delete(s);
    await ctx.scheduler.runAfter(0, internal.onCamera.timeTake, { ids: sizes.map((x) => x._id) });
    return sizes.length;
  },
});

export const takeFailed = internalMutation({
  args: { ids: v.array(v.id("adCreatives")), error: v.string() },
  handler: async (ctx, { ids, error }) => {
    for (const id of ids) {
      const c = await ctx.db.get(id);
      // Only while it still waits on this take: a newer one may have been added meanwhile.
      if (c?.status === "recording") await ctx.db.patch(id, { status: "failed", error: error.slice(0, 500) });
    }
  },
});

/** Times the ad to the creator's take, if the take follows the script, and sends it to be drawn. */
export const timeTake = internalAction({
  args: { ids: v.array(v.id("adCreatives")) },
  handler: async (ctx, { ids }) => {
    if (ids.length === 0) return;
    const first = await ctx.runQuery(internal.ads.creativeInput, { id: ids[0] });
    if (!first?.presenter || first.status !== "recording") return;
    const storageId = first.presenter.storageId;
    try {
      const take = await ctx.storage.get(storageId);
      if (!take) throw new Error("the take's file is gone");
      const { alignment, matched, total } = alignmentFromWords(linesOf(first), await heardWords(take));
      if (total === 0 || matched / total < READ_MATCH_MIN)
        throw new Error(`The take doesn't follow the script (${matched} of ${total} words heard). Ask the creator for another take and add it again`);
      // A newer take may have come in while this one was being timed.
      const now = await ctx.runQuery(internal.ads.creativeInput, { id: ids[0] });
      if (now?.presenter?.storageId !== storageId) return;
      // The take is the voice: the renderer plays its sound and draws its picture.
      await useRead(ctx, ids, first, storageId, alignment);
    } catch (e) {
      await ctx.runMutation(internal.onCamera.takeFailed, { ids, error: errText(e) });
      await ctx.runMutation(internal.ads.finishIfDone, { batchId: first.batchId });
    }
  },
});
