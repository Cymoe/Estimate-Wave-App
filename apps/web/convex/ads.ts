import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { open as openSealed, seal } from "./lib/secretBox";
import { fail, nowIso, requireStaff, requireSuperAdmin } from "./lib/access";
import { adScript } from "./schema";
import {
  ASSET_TAGS,
  DEFAULT_APIFY_ACTOR,
  cutText,
  designLabel,
  pickOfferPhotos,
  type AdStyle,
  NEW_AD_STYLE,
  DESCRIBE_PROMPT,
  FAMILY_LABELS,
  PAINTING_HOOKS,
  SCOPES,
  apifyInput,
  composeMotion,
  creativeName,
  shortId,
  pairingPrompt,
  cleanItems,
  itemsIn,
  IMAGE_AD_TYPES,
  imageAdType,
  adServiceOf,
  pickImageModels,
  imageShortlistPrompt,
  IMAGE_LOOK_MAX,
  IMAGE_LOOK_PAIRS,
  isImageSwipe,
  adServicesOf,
  imageAdPrompt,
  imageAdProblems,
  readImageAd,
  type ImageCandidate,
  type ImageAdPlan,
  readShortlist,
  readOneProject,
  STORY_MIN,
  RANGE_PER_PROJECT,
  shortlistPrompt,
  readPairing,
  fromApifyItem,
  isFatigued,
  isLocal,
  metaCents,
  motionPlanProblems,
  motionPrompt,
  parseJson,
  pickAssets,
  pickJob,
  jobInOrder,
  REEL_CANDIDATES,
  pickExamples,
  ANY_SCOPE,
  SHORTLIST_MAX,
  hookFromSwipe,
  pickHooks,
  type BasedOn,
  playbookPrompt,
  qualifies,
  readPlaybook,
  readSwipeTags,
  renderProps,
  stillPairOf,
  stillProps,
  shotTimings,
  swipeScore,
  tagSwipePrompt,
  weekOf,
  wordTimings,
  type AdKind,
  type Alignment,
  type Candidate,
  type Example,
  type Family,
  type MotionPlan,
  type Playbook,
  type ScrapedAd,
  type Script,
  IDEA_WRITERS,
  IDEAS_SHOWN,
  AD_TRADES,
  DEFAULT_TRADE,
  assetTagsOf,
  withWorkScopes,
  workTags,
  oneStage,
  worksIn,
  describePrompt,
  inTrade,
  scopesOf,
  tradeOf,
  criticPrompt,
  dropNearCopies,
  ideaPrompt,
  ideasFrom,
  pickIdeas,
  tastePrompt,
  type IdeaDraft,
  PREP_ANGLE,
  styleFor,
  onceOnly,
  scriptLength,
  requestPrompt,
  readRequestReply,
  withoutJobNames,
  withoutEchoes,
  pickRequestSwipes,
  requestStage,
  angleOf,
  ANGLE_LABELS,
} from "./lib/ads";
import { apiOrigin, randomToken } from "./lib/oauth";
import { consumerBrand } from "./lib/support";
import { RESEARCH_SOURCE, SWIPE_SEEDS } from "./catalog/swipes";
import { siteUrl } from "./delivery";
import { tellStaff } from "./notify";
import { DEFAULT_ACTOR_LANGUAGE, DEFAULT_ACTOR_VOICE } from "./lib/voiceActors";
import { linesOf, useRead } from "./lib/adVoice";

// Ads on autopilot. Every Monday (or on "Draft now") a batch is drafted.
// For each hook: candidate photos are picked from the library by tag; Claude
// looks at them, chooses how the ad moves (lib/ads.ts AD_STYLES) and writes
// its lines, or passes on the hook; ElevenLabs reads the lines and says when
// each word is said. The ad then waits to be drawn. Drawing is done outside
// Convex, by the Remotion project in ads-video/ run by the ads-render GitHub
// workflow: it claims the waiting ads, renders each in two sizes and uploads
// the files. Each video becomes a PAUSED ad in Meta. Staff approve them in
// Ops → Ads; a daily pull of Meta's numbers plus the intake queue show what
// each ad brought in. Each outside step is its own action, chained with the
// scheduler, so one failure marks one creative and the batch goes on.
//
// Environment (set on the Convex deployment, never committed):
//   ANTHROPIC_API_KEY     scripts
//   ELEVENLABS_API_KEY    voice
//   ADS_RENDER_TOKEN      optional: a GitHub token that may start the ads-render workflow, so a
//                         batch is drawn without anyone starting it (ADS_RENDER_REPO and
//                         ADS_RENDER_REF override the repository and branch)
//   META_ACCESS_TOKEN     a system user token with ads_management on the ad account; or pasted in Settings instead
//                         (sealed with MAILBOX_KEY, adSettings.metaTokenEnc)
//   APIFY_TOKEN           niche research: searches Meta's Ad Library through an Apify actor
//                         (APIFY_ACTOR overrides which one)
//   CONSUMER_BRAND        the name homeowners see (lib/support.ts)
//   FAL_KEY               optional: photos brought to life as short clips (the motion test)
//   BUNNY_STUDIO_TOKEN    optional: a real voice actor reads the ads instead (voiceActors.ts), when Settings says so;
//                         or BUNNY_STUDIO_EMAIL and BUNNY_STUDIO_PASSWORD to sign in for one.
//                         BUNNY_STUDIO_TEST=1 orders test projects, which aren't recorded or billed.

const MAX_PHOTO = 15 * 1024 * 1024;
const MAX_POSTER = 5 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;
const GRAPH = "https://graph.facebook.com/v22.0";
const CLAUDE_MODEL = "claude-sonnet-5-5";
/** Image types Claude reads; anything else (HEIC) goes through its JPEG still. */
const CLAUDE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const keys = () => ({
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
  // Whether the app can start the renderer itself; without it someone starts the workflow.
  renderer: Boolean(process.env.ADS_RENDER_TOKEN),
  meta: Boolean(process.env.META_ACCESS_TOKEN),
  apify: Boolean(process.env.APIFY_TOKEN),
  // ScrapeCreators, the competitor search used when its key is set (here or pasted in Settings).
  scrape: Boolean(process.env.SCRAPECREATORS_API_KEY),
  // A real voice actor through Bunny Studio (voiceActors.ts).
  bunny: Boolean(process.env.BUNNY_STUDIO_TOKEN || (process.env.BUNNY_STUDIO_EMAIL && process.env.BUNNY_STUDIO_PASSWORD)),
});

const DEFAULTS = { weeklyEnabled: false, hooksPerWeek: 2, liveTarget: 6 };
const RESEARCH = {
  keywords: [...tradeOf(DEFAULT_TRADE).keywords],
  markets: ["Midland", "Odessa", "Permian Basin", "West Texas"],
  minDays: 90,
  monthly: false,
};

/** The research settings with their defaults filled in. */
const research = (row: Doc<"adSettings"> | null) => ({
  researchKeywords: row?.researchKeywords?.length ? row.researchKeywords : RESEARCH.keywords,
  researchMarkets: row?.researchMarkets?.length ? row.researchMarkets : RESEARCH.markets,
  researchMinDays: row?.researchMinDays ?? RESEARCH.minDays,
  researchMonthly: row?.researchMonthly ?? RESEARCH.monthly,
});

/** Days since a date as the sheet or the scrape wrote it; undefined when it can't be read. */
function daysSince(startedAt: string | undefined, now = new Date()): number | undefined {
  if (!startedAt) return undefined;
  const d = new Date(startedAt);
  return Number.isNaN(d.getTime()) ? undefined : Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}

/** Who reads the ads, and for a voice actor, how. */
const actorSettings = (row: Doc<"adSettings"> | null) => ({
  voiceSource: row?.voiceSource ?? ("elevenlabs" as const),
  actorVoice: row?.actorVoice ?? DEFAULT_ACTOR_VOICE,
  actorLanguage: row?.actorLanguage ?? DEFAULT_ACTOR_LANGUAGE,
  actorNotes: row?.actorNotes,
});

async function settingsRow(ctx: QueryCtx | MutationCtx): Promise<Doc<"adSettings"> | null> {
  return (await ctx.db.query("adSettings").take(1))[0] ?? null;
}

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t && t.length <= 30))].slice(0, 12);

/** The kind of file, from the upload or the name (iPhones sometimes send no type). */
function assetKind(contentType: string | undefined, fileName: string): { kind: "photo" | "video"; type: string } | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const type =
    contentType && contentType !== "application/octet-stream"
      ? contentType.toLowerCase()
      : ({
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          heic: "image/heic",
          mp4: "video/mp4",
          mov: "video/quicktime",
          m4v: "video/x-m4v",
        }[ext] ?? "");
  if (type.startsWith("image/")) return { kind: "photo", type };
  if (type.startsWith("video/")) return { kind: "video", type };
  return null;
}

// ---------------------------------------------------------------- Library

/**
 * What happened to an upload on the person's device (a clip not made smaller, a send that stopped), written to the
 * deployment's logs: the only way to see what an iPad did. Nothing is stored.
 */
export const uploadNote = mutation({
  args: {
    fileName: v.string(),
    size: v.number(),
    step: v.string(),
    note: v.string(),
    device: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    console.log("upload note", JSON.stringify({ ...args, fileName: args.fileName.slice(0, 120), note: args.note.slice(0, 500), device: args.device?.slice(0, 200) }));
  },
});

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Files an uploaded photo or clip in the library, with its tags. */
export const addAsset = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    tags: v.array(v.string()),
    pairKey: v.optional(v.string()),
    note: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    posterStorageId: v.optional(v.id("_storage")),
    thumbStorageId: v.optional(v.id("_storage")),
    trade: v.optional(v.string()),
    jobId: v.optional(v.id("adJobs")),
    jobPhotoId: v.optional(v.id("jobPhotos")),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    return await insertAsset(ctx, user._id, args);
  },
});

/**
 * A file put in the library: checked (kind, size, its still and small copy), filed, and Claude asked what it shows.
 * For an upload from the page (addAsset) and a clip brought in from the Drive folder (adDrive.ts).
 */
export async function insertAsset(
  ctx: MutationCtx,
  uploadedBy: Id<"users">,
  {
    storageId,
    fileName,
    tags,
    pairKey,
    note,
    durationSec,
    posterStorageId,
    thumbStorageId,
    trade,
    jobId,
    jobPhotoId,
  }: {
    storageId: Id<"_storage">;
    fileName: string;
    tags: string[];
    pairKey?: string;
    note?: string;
    durationSec?: number;
    posterStorageId?: Id<"_storage">;
    thumbStorageId?: Id<"_storage">;
    trade?: string;
    jobId?: Id<"adJobs">;
    jobPhotoId?: Id<"jobPhotos">;
  },
): Promise<Id<"adAssets">> {
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (jobId && job === null) fail("NOT_FOUND", "That job isn't in the library");
    const file = await ctx.db.system.get(storageId);
    if (file === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    const found = assetKind(file.contentType, fileName);
    if (!found) fail("INVALID", "Upload a photo (JPEG, PNG, HEIC, WebP) or a video (MP4, MOV)");
    if (file.size > (found.kind === "photo" ? MAX_PHOTO : MAX_VIDEO))
      fail("INVALID", found.kind === "photo" ? "A photo must be 15MB or less" : "A video must be 200MB or less");
    if (posterStorageId) {
      const poster = await ctx.db.system.get(posterStorageId);
      // Convex records the upload's type; the still must be an image of 5MB or less.
      if (poster === null || (poster.contentType !== undefined && !poster.contentType.startsWith("image/")) || poster.size > MAX_POSTER)
        fail("INVALID", "The still for this file didn't upload right");
    }
    if (thumbStorageId) await checkThumb(ctx, thumbStorageId);
    const id = await ctx.db.insert("adAssets", {
      // A photo filed under a job is of the job's trade.
      trade: tradeOf(job?.trade ?? trade).slug,
      storageId,
      kind: found.kind,
      fileName: fileName.slice(0, 200),
      contentType: found.type,
      size: file.size,
      durationSec,
      tags: cleanTags(tags),
      pairKey: pairKey?.trim() || undefined,
      note: note?.trim().slice(0, 300) || undefined,
      posterStorageId,
      ...(thumbStorageId ? { thumbStorageId } : {}),
      ...(jobId ? { jobId } : {}),
      ...(jobPhotoId ? { jobPhotoId } : {}),
      uses: 0,
      uploadedBy,
      createdAt: nowIso(),
    });
    // Claude looks at it and says what it shows; the card offers its tags.
    if (process.env.ANTHROPIC_API_KEY) await ctx.scheduler.runAfter(0, internal.ads.describeAsset, { id });
    // Tagged before or after already: its match is looked for.
    await askPairs(ctx, await ctx.db.get(id));
    return id;
}

/** The most a library thumbnail may weigh: a small JPEG is far under it. */
const MAX_THUMB = 512 * 1024;

async function checkThumb(ctx: MutationCtx, thumbStorageId: Id<"_storage">) {
  const thumb = await ctx.db.system.get(thumbStorageId);
  if (thumb === null || (thumb.contentType !== undefined && !thumb.contentType.startsWith("image/")) || thumb.size > MAX_THUMB)
    fail("INVALID", "The small copy of this photo didn't upload right");
}

/**
 * The small copy the library grid shows, for a file uploaded before thumbnails were made (the Library page makes
 * them quietly, one at a time) or one whose copy is replaced.
 */
export const setThumb = mutation({
  args: { id: v.id("adAssets"), thumbStorageId: v.id("_storage") },
  handler: async (ctx, { id, thumbStorageId }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null) fail("NOT_FOUND", "That file isn't in the library");
    await checkThumb(ctx, thumbStorageId);
    if (a.thumbStorageId && a.thumbStorageId !== thumbStorageId && (await ctx.db.system.get(a.thumbStorageId)) !== null) await ctx.storage.delete(a.thumbStorageId);
    await ctx.db.patch(id, { thumbStorageId });
  },
});

/** The image Claude can look at for an asset: its still, or the photo itself when Claude reads that type. */
async function lookUrl(ctx: QueryCtx, a: Doc<"adAssets">): Promise<string | undefined> {
  if (a.posterStorageId) return (await ctx.storage.getUrl(a.posterStorageId)) ?? undefined;
  if (a.kind === "photo" && CLAUDE_IMAGE_TYPES.includes(a.contentType)) return (await ctx.storage.getUrl(a.storageId)) ?? undefined;
  return undefined;
}

export const assetForDescribe = internalQuery({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    const a = await ctx.db.get(id);
    return a
      ? { imageUrl: await lookUrl(ctx, a), thumbUrl: a.thumbStorageId ? ((await ctx.storage.getUrl(a.thumbStorageId)) ?? undefined) : undefined, kind: a.kind, trade: a.trade }
      : null;
  },
});

/**
 * A clip's still, made after the upload: for a clip whose still couldn't be made then (an iPhone or iPad that
 * wouldn't hand over a frame). With the still, Claude looks at the clip and suggests its tags, as at upload.
 */
export const setPoster = mutation({
  args: { id: v.id("adAssets"), posterStorageId: v.id("_storage"), durationSec: v.optional(v.number()) },
  handler: async (ctx, { id, posterStorageId, durationSec }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null) fail("NOT_FOUND", "That clip isn't in the library");
    if (a.kind !== "video") fail("INVALID", "Only a clip takes a still");
    const poster = await ctx.db.system.get(posterStorageId);
    if (poster === null || (poster.contentType !== undefined && !poster.contentType.startsWith("image/")) || poster.size > MAX_POSTER)
      fail("INVALID", "The still didn't upload right");
    if (a.posterStorageId && a.posterStorageId !== posterStorageId) await ctx.storage.delete(a.posterStorageId);
    await ctx.db.patch(id, {
      posterStorageId,
      ...(durationSec && durationSec > 0 && !a.durationSec ? { durationSec: Math.round(durationSec * 10) / 10 } : {}),
    });
    if (process.env.ANTHROPIC_API_KEY) await ctx.scheduler.runAfter(0, internal.ads.describeAsset, { id });
  },
});

export const saveDescription = internalMutation({
  args: {
    id: v.id("adAssets"),
    description: v.string(),
    suggestedTags: v.array(v.string()),
    items: v.optional(v.array(v.string())),
    // From labelWorks: a tagged photo with no type of work yet takes the ones Claude saw.
    addWorks: v.optional(v.boolean()),
    // From reworkWorks: a photo whose types of work were Claude's takes Claude's new ones, the subject first.
    rework: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, description, suggestedTags, items, addWorks, rework }) => {
    const a = await ctx.db.get(id);
    if (a === null) return;
    // Its labels (doors, trim...) are Claude's until a person fixes them; a fixed list stays.
    if (items && !a.itemsSetByPerson) await ctx.db.patch(id, { items });
    // An upload nobody tagged takes Claude's tags; tags a person chose stay, with the suggestion shown beside them.
    const takes = a.tags.length === 0 && suggestedTags.length > 0;
    // Types of work were added after most photos were tagged: one tagged before gets them, its own tags kept.
    const trade = tradeOf(a.trade);
    const works = workTags(suggestedTags, trade);
    const addsWorks = !takes && addWorks && works.length > 0 && workTags(a.tags, trade).length === 0;
    // Only types of work that were Claude's are replaced; ones a person picked stay.
    const mine = workTags(a.tags, trade).length === 0 || workTags(a.tags, trade).join(",") === workTags(a.suggestedTags ?? [], trade).join(",");
    const reworks = !takes && rework && works.length > 0 && mine;
    await ctx.db.patch(id, {
      description: description.slice(0, 300),
      suggestedTags,
      ...(takes ? { tags: suggestedTags } : {}),
      ...(addsWorks ? { tags: withWorkScopes([...a.tags, ...works], trade) } : {}),
      // The new types first (the first is its group), then its other tags (stage, crew, scope) as they were.
      ...(reworks ? { tags: withWorkScopes([...works, ...a.tags.filter((t) => !trade.works?.[t])], trade) } : {}),
    });
    // Still no type of work: a photo in a project takes its project's (a before is of the job it's for).
    await inheritWork(ctx, id);
    // Its before or after tag, or its type of work, may have just arrived: its match is looked for.
    if (takes || addsWorks || reworks) await askPairs(ctx, await ctx.db.get(id));
  },
});

/** Asks Claude what an uploaded photo or clip shows, and which tags it would give it. */
export const describeAsset = internalAction({
  // tries: how many looks at this file Claude has already turned away.
  // works: from labelWorks, so a photo tagged before types of work existed gets its own.
  // rework: from reworkWorks, so a photo gets the types of work as they are now, the subject first.
  args: { id: v.id("adAssets"), tries: v.optional(v.number()), works: v.optional(v.boolean()), rework: v.optional(v.boolean()) },
  // What came of it, in a few words: for lookOnce, to see why a file has no labels.
  handler: async (ctx, { id, tries = 0, works, rework }): Promise<string> => {
    const a = await ctx.runQuery(internal.ads.assetForDescribe, { id });
    if (!a?.imageUrl || !process.env.ANTHROPIC_API_KEY) return "nothing to look at";
    try {
      const reply = await claude(
        [
          { type: "image", source: { type: "url", url: a.imageUrl } },
          { type: "text", text: describePrompt(tradeOf(a.trade)) + (a.kind === "video" ? "\nThis image is a still from a video clip." : "") },
        ],
        // Room for a busy photo's sentence and its labels: a reply cut off part-way can't be read.
        1000,
      );
      const out = parseJson<{ description?: string; tags?: string[]; items?: unknown }>(reply);
      if (!out?.description) return `reply not read: ${reply.slice(0, 300)}`;
      const trade = tradeOf(a.trade);
      const suggestedTags = oneStage(
        withWorkScopes(
          [...new Set((out.tags ?? []).map((t) => String(t).toLowerCase()))].filter((t) => assetTagsOf(trade).includes(t)),
          trade,
        ),
      );
      await ctx.runMutation(internal.ads.saveDescription, {
        id,
        description: out.description,
        suggestedTags,
        items: cleanItems(out.items, trade),
        ...(works ? { addWorks: true } : {}),
        ...(rework ? { rework: true } : {}),
      });
      return "saved";
    } catch (e) {
      const why = errText(e);
      console.error("describe asset", id, why);
      // Claude busy, or asked too fast (many files at once), or the picture didn't reach it: looked at again a
      // little later, three more times at most.
      if (tries < 3 && /^Claude: (429|5\d\d)\b|download|fetch failed|timed? ?out/i.test(why))
        await ctx.scheduler.runAfter(DESCRIBE_RETRY_MS * 2 ** tries, internal.ads.describeAsset, { id, tries: tries + 1, ...(works ? { works } : {}), ...(rework ? { rework } : {}) });
      return `error: ${why}`;
    }
  },
});

/** From the deployment: one look at a file, with what Claude answered or the error, to see why a file gets no labels. */
export const lookOnce = internalAction({
  args: { id: v.id("adAssets"), small: v.optional(v.boolean()), save: v.optional(v.boolean()) },
  handler: async (ctx, { id, small, save }): Promise<{ error?: string; reply?: string; outcome?: string }> => {
    // save: the real look, saved as at upload, and what came of it.
    if (save) return { outcome: await ctx.runAction(internal.ads.describeAsset, { id, tries: 3 }) };
    const a = await ctx.runQuery(internal.ads.assetForDescribe, { id });
    const url = small ? a?.thumbUrl : a?.imageUrl;
    if (!url) return { error: "no picture to look at" };
    try {
      const reply = await claude([{ type: "image", source: { type: "url", url } }, { type: "text", text: describePrompt(tradeOf(a!.trade)) }], 400);
      return { reply: reply.slice(0, 600) };
    } catch (e) {
      return { error: errText(e) };
    }
  },
});

/** The star on a photo: one of the owner's best shots, which ads lead with. */
export const setBest = mutation({
  args: { id: v.id("adAssets"), best: v.boolean() },
  handler: async (ctx, { id, best }) => {
    await requireStaff(ctx);
    if ((await ctx.db.get(id)) === null) fail("NOT_FOUND", "That photo is gone");
    await ctx.db.patch(id, { best: best || undefined });
  },
});

/** How long a look Claude turned away waits before it is asked again, doubled each time. */
const DESCRIBE_RETRY_MS = 30_000;

export const listAssets = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    const rows = (await ctx.db.query("adAssets").order("desc").take(500)).filter((a) => inTrade(a, trade));
    return await Promise.all(
      rows.map(async (a) => ({
        id: a._id,
        url: (await ctx.storage.getUrl(a.storageId)) ?? undefined,
        kind: a.kind,
        fileName: a.fileName,
        contentType: a.contentType,
        size: a.size,
        durationSec: a.durationSec,
        tags: a.tags,
        pairKey: a.pairKey,
        pairSetBy: a.pairSetBy,
        note: a.note,
        posterUrl: a.posterStorageId ? ((await ctx.storage.getUrl(a.posterStorageId)) ?? undefined) : undefined,
        thumbUrl: a.thumbStorageId ? ((await ctx.storage.getUrl(a.thumbStorageId)) ?? undefined) : undefined,
        description: a.description,
        items: a.items ?? [],
        suggestedTags: a.suggestedTags,
        uses: a.uses ?? 0,
        best: a.best ?? false,
        jobId: a.jobId,
        createdAt: a.createdAt,
      })),
    );
  },
});

// ------------------------------------------------------------------ Jobs
//
// One job's photos kept together in the library, so a story can show the problem, the work and the finish of that
// one job and never pass another job's work off as its own. A job's name is the owner's, to find it by; it can say
// where the job was, so it stays in Ops and never goes to the writer or into an ad.

const jobName = (name: string) => {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) fail("INVALID", "Give the job a name, like \"Smith kitchen cabinets\"");
  return clean;
};

/** The library's jobs for a trade, newest first, each with how many photos it has. */
export const listJobs = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    const jobs = (await ctx.db.query("adJobs").order("desc").take(200)).filter((j) => inTrade(j, trade));
    return await Promise.all(
      jobs.map(async (j) => ({
        id: j._id,
        name: j.name,
        projectId: j.projectId,
        photos: (await ctx.db.query("adAssets").withIndex("by_job", (q) => q.eq("jobId", j._id)).take(200)).length,
        createdAt: j.createdAt,
      })),
    );
  },
});

export const addJob = mutation({
  args: { name: v.string(), trade: v.optional(v.string()) },
  handler: async (ctx, { name, trade }) => {
    const user = await requireStaff(ctx);
    return await ctx.db.insert("adJobs", { trade: tradeOf(trade).slug, name: jobName(name), createdBy: user._id, createdAt: nowIso() });
  },
});

export const renameJob = mutation({
  args: { id: v.id("adJobs"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await requireStaff(ctx);
    if ((await ctx.db.get(id)) === null) fail("NOT_FOUND", "That job isn't in the library");
    await ctx.db.patch(id, { name: jobName(name) });
  },
});

/** Takes a job away; its photos stay in the library, under no job. */
export const removeJob = mutation({
  args: { id: v.id("adJobs") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    // Its photos stay, out of any job, with their pairs.
    for (const a of await ctx.db.query("adAssets").withIndex("by_job", (q) => q.eq("jobId", id)).take(500))
      await ctx.db.patch(a._id, { jobId: undefined });
    await ctx.db.delete(id);
  },
});

/** Files a library photo under a job, or under none. */
export const setAssetJob = mutation({
  args: { id: v.id("adAssets"), jobId: v.optional(v.id("adJobs")) },
  handler: async (ctx, { id, jobId }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null) fail("NOT_FOUND", "That file isn't in the library");
    if (jobId) {
      const job = await ctx.db.get(jobId);
      if (job === null) fail("NOT_FOUND", "That job isn't in the library");
      if (tradeOf(job.trade).slug !== tradeOf(a.trade).slug) fail("INVALID", "That job is of another trade");
    }
    if (a.jobId === jobId) return;
    // Its pair stays (pairs aren't kept to a job); its match is looked for again among its new job's photos.
    await ctx.db.patch(id, { jobId, pairLookedAt: undefined });
    await inheritWork(ctx, id);
    await askPairs(ctx, await ctx.db.get(id));
  },
});

/**
 * Puts the photos picked in the library into one job ("Group photos into a job"): an existing job, or a new one
 * under the name given. Photos of another trade than the job's are left where they are.
 */
export const groupIntoJob = mutation({
  args: { ids: v.array(v.id("adAssets")), jobId: v.optional(v.id("adJobs")), name: v.optional(v.string()), trade: v.optional(v.string()) },
  handler: async (ctx, { ids, jobId, name, trade }) => {
    const user = await requireStaff(ctx);
    if (ids.length === 0) fail("INVALID", "Pick the photos that go together first");
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (jobId && job === null) fail("NOT_FOUND", "That job isn't in the library");
    const slug = tradeOf(job?.trade ?? trade).slug;
    const id = job?._id ?? (await ctx.db.insert("adJobs", { trade: slug, name: jobName(name ?? ""), createdBy: user._id, createdAt: nowIso() }));
    let moved = 0;
    for (const assetId of ids) {
      const a = await ctx.db.get(assetId);
      if (a === null || tradeOf(a.trade).slug !== slug) continue;
      await ctx.db.patch(assetId, { jobId: id, pairLookedAt: undefined });
      await inheritWork(ctx, assetId);
      await askPairs(ctx, await ctx.db.get(assetId));
      moved += 1;
    }
    return { jobId: id, moved };
  },
});

/**
 * The job a project's photos go to in the ad library ("Use these photos for ads" on a project), made the first
 * time, under the project's name. With it, the project photos already copied, so sending again only adds new ones.
 */
export const jobForProject = mutation({
  args: { projectId: v.id("projects"), trade: v.optional(v.string()) },
  handler: async (ctx, { projectId, trade }) => {
    const user = await requireStaff(ctx);
    const project = await ctx.db.get(projectId);
    if (project === null) fail("NOT_FOUND", "Project not found");
    const found = (await ctx.db.query("adJobs").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(20)).find(
      (j) => tradeOf(j.trade).slug === tradeOf(trade).slug,
    );
    const jobId =
      found?._id ??
      (await ctx.db.insert("adJobs", { trade: tradeOf(trade).slug, name: jobName(project.name), projectId, createdBy: user._id, createdAt: nowIso() }));
    const copied = (await ctx.db.query("adAssets").withIndex("by_job", (q) => q.eq("jobId", jobId)).take(500)).flatMap((a) => (a.jobPhotoId ? [a.jobPhotoId] : []));
    return { jobId, copied };
  },
});

// ------------------------------------------------------------------ Pairs
//
// A before and the after of the same spot become a pair (pairKey): shown side by side, a wipe in an ad. Claude finds
// them across the whole library, not only within a job: each before is compared with the afters of the same type of
// work (cabinets with cabinets), those of its own job and nearest in time first (pairPoolOf). A person can pair two
// photos themselves (pairSetBy "person"), which Claude never undoes, or split two (notPairs), which Claude never pairs
// again. Each photo is looked at once (pairLookedAt) until its tags change, so a new upload costs one or two looks,
// not the whole library. Asked a little after a change, so an upload of several photos is one look.

/** How long after a change the pairs are looked at, so an upload of several photos is one look. */
const PAIR_DELAY_MS = 20_000;
/** One look: this many befores against this many afters. */
const PAIR_BEFORES = 6;
const PAIR_AFTERS = 8;
/** The most looks one run takes; a run that has more to do asks for another. */
const PAIR_LOOKS = 6;

type Staged = { tags: string[] };
const isBefore = (a: Staged) => a.tags.includes("before") && !a.tags.includes("after");
const isAfter = (a: Staged) => a.tags.includes("after") && !a.tags.includes("before");

/** The photos Claude compares with each other: one trade and first type of work; with no type of work, its job. */
export function pairPoolOf(a: { trade?: string; tags: string[]; jobId?: string }): string {
  const trade = tradeOf(a.trade);
  const work = workTags(a.tags, trade)[0];
  return `${trade.slug}|${work ? `work:${work}` : a.jobId ? `job:${a.jobId}` : "rest"}`;
}

/** Asks for a photo's pool to be looked at, a little later: only the latest ask for the pool runs. */
async function askPairs(ctx: MutationCtx, a: Doc<"adAssets"> | null) {
  if (!process.env.ANTHROPIC_API_KEY || a === null || a.kind !== "photo") return;
  await askPool(ctx, pairPoolOf(a), PAIR_DELAY_MS);
}

async function askPool(ctx: MutationCtx, pool: string, delay: number) {
  const askedAt = `${nowIso()}#${Math.random().toString(36).slice(2, 8)}`;
  const row = await ctx.db.query("adPairing").withIndex("by_pool", (q) => q.eq("pool", pool)).first();
  if (row) await ctx.db.patch(row._id, { askedAt });
  else await ctx.db.insert("adPairing", { pool, askedAt });
  await ctx.scheduler.runAfter(delay, internal.ads.pairPool, { pool, at: askedAt });
}

/** Takes a photo out of its pair, and has the other one looked at again. */
async function unpair(ctx: MutationCtx, a: Doc<"adAssets">) {
  if (!a.pairKey) return;
  for (const b of await ctx.db.query("adAssets").withIndex("by_pair", (q) => q.eq("pairKey", a.pairKey)).take(10)) {
    await ctx.db.patch(b._id, { pairKey: undefined, pairSetBy: undefined, pairLookedAt: undefined });
    if (b._id !== a._id) await askPairs(ctx, await ctx.db.get(b._id));
  }
}

/** The stage tags of a photo made just before or just after (no "process"). */
const staged = (tags: string[], stage: "before" | "after") => cleanTags([...tags.filter((t) => t !== "before" && t !== "after" && t !== "process"), stage]);

export const poolForPairing = internalQuery({
  args: { pool: v.string() },
  handler: async (ctx, { pool }) => {
    const row = await ctx.db.query("adPairing").withIndex("by_pool", (q) => q.eq("pool", pool)).first();
    if (row === null) return null;
    const photos = (await ctx.db.query("adAssets").withIndex("by_kind", (q) => q.eq("kind", "photo")).take(1000)).filter((a) => pairPoolOf(a) === pool);
    // A pair is two photos, one before and one after; any other is broken (a photo deleted, a tag changed).
    const byKey = new Map<string, Doc<"adAssets">[]>();
    for (const a of photos) if (a.pairKey) byKey.set(a.pairKey, [...(byKey.get(a.pairKey) ?? []), a]);
    const paired = new Set<string>();
    for (const list of byKey.values())
      if (list.length === 2 && list.some(isBefore) && list.some(isAfter)) list.forEach((a) => paired.add(a._id));
    const open = await Promise.all(
      photos
        .filter((a) => !a.pairKey && (isBefore(a) || isAfter(a)))
        .map(async (a) => ({
          id: a._id,
          before: isBefore(a),
          jobId: a.jobId,
          createdAt: a.createdAt,
          looked: !!a.pairLookedAt,
          notPairs: a.notPairs ?? [],
          url: await lookUrl(ctx, a),
        })),
    );
    return {
      askedAt: row.askedAt,
      // Photos that may be in a broken pair (a photo deleted, a tag changed): savePairs checks each against the whole
      // library, so a pair whose other half now sits in another pool is kept.
      broken: photos.filter((a) => a.pairKey && !paired.has(a._id)).map((a) => a._id),
      open: open.filter((a) => a.url).sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
    };
  },
});

type Open = { id: Id<"adAssets">; before: boolean; jobId?: Id<"adJobs">; createdAt: string; looked: boolean; notPairs: Id<"adAssets">[]; url?: string };

/** Afters nearest a run of befores: of the same job first, then the closest in time. */
function nearest(befores: Open[], afters: Open[]): Open[] {
  const jobs = new Set(befores.map((b) => b.jobId).filter(Boolean));
  const times = befores.map((b) => Date.parse(b.createdAt) || 0);
  const gap = (a: Open) => Math.min(...times.map((t) => Math.abs((Date.parse(a.createdAt) || 0) - t)));
  const away = (a: Open) => (a.jobId && jobs.has(a.jobId) ? 0 : 1);
  return [...afters].sort((x, y) => away(x) - away(y) || gap(x) - gap(y));
}

/** Claude matches a pool's befores with its afters of the same spot. Only the latest ask for the pool runs. */
export const pairPool = internalAction({
  args: { pool: v.string(), at: v.string() },
  handler: async (ctx, { pool, at }) => {
    const got: { askedAt: string; broken: Id<"adAssets">[]; open: Open[] } | null = await ctx.runQuery(internal.ads.poolForPairing, { pool });
    if (!got || got.askedAt !== at) return;
    const befores = got.open.filter((a) => a.before);
    const afters = got.open.filter((a) => !a.before);
    // The looks: each new before against the afters nearest it, then the befores nearest each new after.
    const looks: Array<{ befores: Open[]; afters: Open[] }> = [];
    const fresh = befores.filter((b) => !b.looked);
    for (let i = 0; i < fresh.length; i += PAIR_BEFORES) {
      const run = fresh.slice(i, i + PAIR_BEFORES);
      looks.push({ befores: run, afters: nearest(run, afters).slice(0, PAIR_AFTERS) });
    }
    const newAfters = afters.filter((a) => !a.looked);
    const oldBefores = befores.filter((b) => b.looked);
    if (newAfters.length && oldBefores.length) {
      const run = nearest(newAfters, oldBefores).slice(0, PAIR_BEFORES * 2);
      for (let i = 0; i < run.length; i += PAIR_BEFORES) looks.push({ befores: run.slice(i, i + PAIR_BEFORES), afters: newAfters.slice(0, PAIR_AFTERS) });
    }
    const now = looks.slice(0, PAIR_LOOKS);
    const pairs: Array<[Id<"adAssets">, Id<"adAssets">]> = [];
    const looked = new Set<Id<"adAssets">>();
    for (const look of now) {
      const open = look.afters.filter((a) => !pairs.some(([, x]) => x === a.id));
      if (look.befores.length === 0 || open.length === 0) {
        look.befores.forEach((b) => looked.add(b.id));
        continue;
      }
      try {
        const sameJob = !!look.befores[0].jobId && [...look.befores, ...open].every((p) => p.jobId === look.befores[0].jobId);
        const content: unknown[] = [{ type: "text", text: pairingPrompt(look.befores.length, open.length, sameJob) }];
        look.befores.forEach((p, i) => content.push({ type: "text", text: `Before ${i + 1}:` }, { type: "image", source: { type: "url", url: p.url } }));
        open.forEach((p, i) => content.push({ type: "text", text: `After ${i + 1}:` }, { type: "image", source: { type: "url", url: p.url } }));
        const found = readPairing(await claude(content, 400), look.befores.length, open.length);
        if (found === null) continue;
        for (const [b, a] of found) {
          const before = look.befores[b];
          const after = open[a];
          // Two a person said aren't a pair stay apart.
          if (before.notPairs.includes(after.id) || after.notPairs.includes(before.id)) continue;
          pairs.push([before.id, after.id]);
        }
        [...look.befores, ...open].forEach((p) => looked.add(p.id));
      } catch (e) {
        console.error("pair photos", pool, errText(e));
      }
    }
    await ctx.runMutation(internal.ads.savePairs, { pairs, looked: [...looked], broken: got.broken });
    // More than one run's looks: the rest in a moment.
    if (looks.length > PAIR_LOOKS && looked.size > 0) await ctx.runMutation(internal.ads.askPoolAgain, { pool });
  },
});

export const askPoolAgain = internalMutation({
  args: { pool: v.string() },
  handler: async (ctx, { pool }) => await askPool(ctx, pool, 1000),
});

/** Writes what a look found: new pairs, the photos looked at, and broken pairs undone. */
export const savePairs = internalMutation({
  args: {
    pairs: v.array(v.array(v.id("adAssets"))),
    looked: v.array(v.id("adAssets")),
    broken: v.array(v.id("adAssets")),
  },
  handler: async (ctx, { pairs, looked, broken }) => {
    for (const id of broken) {
      const a = await ctx.db.get(id);
      if (a === null || !a.pairKey) continue;
      const mates = await ctx.db.query("adAssets").withIndex("by_pair", (q) => q.eq("pairKey", a.pairKey)).take(10);
      if (mates.length === 2 && mates.some(isBefore) && mates.some(isAfter)) continue;
      await ctx.db.patch(id, { pairKey: undefined, pairSetBy: undefined, pairLookedAt: undefined });
    }
    const at = nowIso();
    for (const id of looked) if (await ctx.db.get(id)) await ctx.db.patch(id, { pairLookedAt: at });
    let made = 0;
    for (const [bId, aId] of pairs) {
      const [b, a] = [await ctx.db.get(bId), await ctx.db.get(aId)];
      // Changed while Claude looked: left for the next look.
      if (!b || !a || b.pairKey || a.pairKey || !isBefore(b) || !isAfter(a)) continue;
      const pairKey = `p-${shortId(b._id)}`;
      await ctx.db.patch(b._id, { pairKey });
      await ctx.db.patch(a._id, { pairKey });
      made += 1;
    }
    return { made };
  },
});

/** Has every pool of befores and afters looked at, from the deployment: once, for the photos already there. */
export const pairLibrary = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pools = new Set<string>();
    for (const a of await ctx.db.query("adAssets").withIndex("by_kind", (q) => q.eq("kind", "photo")).take(1000))
      if (isBefore(a) || isAfter(a)) pools.add(pairPoolOf(a));
    let i = 0;
    for (const pool of pools) await askPool(ctx, pool, 2000 * i++);
    return { pools: [...pools] };
  },
});

/** Photos tagged with more than one stage, from the deployment: to check before they're made one stage (fixStages). */
export const multiStage = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("adAssets").withIndex("by_kind", (q) => q.eq("kind", "photo")).take(1000))
      .filter((a) => a.tags.filter((t) => t === "before" || t === "process" || t === "after").length > 1)
      .map((a) => ({ id: a._id, fileName: a.fileName, tags: a.tags, becomes: oneStage(a.tags), description: a.description })),
});

/**
 * Makes the photos listed one stage each, from the deployment: the stage given ("both" is a side-by-side, before and
 * after), or else the furthest along (oneStage). A pair broken by it is undone.
 */
export const fixStages = internalMutation({
  args: {
    items: v.array(
      v.object({
        id: v.id("adAssets"),
        stage: v.optional(v.union(v.literal("before"), v.literal("process"), v.literal("after"), v.literal("both"))),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    const fixed: string[] = [];
    for (const { id, stage } of items) {
      const a = await ctx.db.get(id);
      if (a === null) continue;
      const rest = a.tags.filter((t) => t !== "before" && t !== "process" && t !== "after");
      const tags = stage ? [...rest, ...(stage === "both" ? ["before", "after"] : [stage])] : oneStage(a.tags);
      if (tags.join(",") === a.tags.join(",")) continue;
      if (isBefore(a) !== isBefore({ tags }) || isAfter(a) !== isAfter({ tags })) await unpair(ctx, a);
      await ctx.db.patch(id, { tags, pairLookedAt: undefined });
      await askPairs(ctx, await ctx.db.get(id));
      fixed.push(`${a.fileName}: ${a.tags.join(", ")} → ${tags.join(", ")}`);
    }
    return { fixed };
  },
});

/** A person pairs two photos as a before and its after: the older one the before, unless they're tagged already. */
export const pairPhotos = mutation({
  args: { ids: v.array(v.id("adAssets")) },
  handler: async (ctx, { ids }) => {
    await requireStaff(ctx);
    if (ids.length !== 2 || ids[0] === ids[1]) fail("INVALID", "Pick two photos to pair");
    const [x, y] = await Promise.all(ids.map((id) => ctx.db.get(id)));
    if (x === null || y === null) fail("NOT_FOUND", "That photo isn't in the library");
    if (x.kind !== "photo" || y.kind !== "photo") fail("INVALID", "Only photos make a before and after");
    if (tradeOf(x.trade).slug !== tradeOf(y.trade).slug) fail("INVALID", "Those two are of different trades");
    const [before, after] =
      isBefore(x) && isAfter(y) ? [x, y] : isBefore(y) && isAfter(x) ? [y, x] : x._creationTime <= y._creationTime ? [x, y] : [y, x];
    await unpair(ctx, x);
    await unpair(ctx, y);
    const pairKey = `p-${shortId(before._id)}`;
    await ctx.db.patch(before._id, { tags: staged(before.tags, "before"), pairKey, pairSetBy: "person", notPairs: (before.notPairs ?? []).filter((id) => id !== after._id) });
    await ctx.db.patch(after._id, { tags: staged(after.tags, "after"), pairKey, pairSetBy: "person", notPairs: (after.notPairs ?? []).filter((id) => id !== before._id) });
    return { before: before._id, after: after._id };
  },
});

/** "Not a pair": the two go apart, and Claude never pairs them again; each is looked at again for its real match. */
export const splitPair = mutation({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null || !a.pairKey) return;
    const mates = await ctx.db.query("adAssets").withIndex("by_pair", (q) => q.eq("pairKey", a.pairKey)).take(10);
    for (const m of mates) {
      const others = mates.filter((o) => o._id !== m._id).map((o) => o._id);
      await ctx.db.patch(m._id, { pairKey: undefined, pairSetBy: undefined, pairLookedAt: undefined, notPairs: [...new Set([...(m.notPairs ?? []), ...others])].slice(-50) });
    }
    for (const m of mates) await askPairs(ctx, await ctx.db.get(m._id));
  },
});

/** "Swap": Claude had the two the wrong way round; the before becomes the after and the after the before. */
export const swapPair = mutation({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null || !a.pairKey) fail("NOT_FOUND", "That photo isn't in a pair");
    const mates = await ctx.db.query("adAssets").withIndex("by_pair", (q) => q.eq("pairKey", a.pairKey)).take(10);
    if (mates.length !== 2) fail("INVALID", "That pair is missing a photo");
    for (const m of mates) await ctx.db.patch(m._id, { tags: staged(m.tags, isBefore(m) ? "after" : "before"), pairSetBy: "person" });
  },
});

/** The library as text, from the deployment: to see which photos are of the same job before filing them under one. */
export const libraryForJobs = internalQuery({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) =>
    (await ctx.db.query("adAssets").take(500))
      .filter((a) => inTrade(a, trade) && a.kind === "photo")
      .map((a) => ({ id: a._id, fileName: a.fileName, tags: a.tags, pairKey: a.pairKey, note: a.note, description: a.description, items: a.items, size: a.size, hasThumb: !!a.thumbStorageId, jobId: a.jobId, uses: a.uses ?? 0, createdAt: a.createdAt })),
});

/** Files library photos under one job, made under this name when there is none by it yet, from the deployment. */
export const fileIntoJob = internalMutation({
  args: { name: v.string(), trade: v.optional(v.string()), ids: v.array(v.id("adAssets")) },
  handler: async (ctx, { name, trade, ids }) => {
    const slug = tradeOf(trade).slug;
    const clean = jobName(name);
    const found = (await ctx.db.query("adJobs").take(200)).find((j) => j.name === clean && tradeOf(j.trade).slug === slug);
    const jobId = found?._id ?? (await ctx.db.insert("adJobs", { trade: slug, name: clean, createdAt: nowIso() }));
    const filed: string[] = [];
    for (const id of ids) {
      const a = await ctx.db.get(id);
      if (a === null || tradeOf(a.trade).slug !== slug) continue;
      await ctx.db.patch(id, { jobId, pairLookedAt: undefined });
      await askPairs(ctx, await ctx.db.get(id));
      filed.push(a.fileName);
    }
    return { jobId, filed };
  },
});

/** The jobs with photos, for the request reader to match a job named in the owner's line. */
export const jobNames = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Array<{ id: Id<"adJobs">; name: string; trade: string }> = [];
    for (const j of await ctx.db.query("adJobs").order("desc").take(60))
      if (await ctx.db.query("adAssets").withIndex("by_job", (q) => q.eq("jobId", j._id)).first()) out.push({ id: j._id, name: j.name, trade: tradeOf(j.trade).slug });
    return out;
  },
});

/** A person's fix of what a photo shows (its labels): kept to the trade's list, and kept from Claude's next look. */
export const setItems = mutation({
  args: { id: v.id("adAssets"), items: v.array(v.string()) },
  handler: async (ctx, { id, items }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null) fail("NOT_FOUND", "That file isn't in the library");
    await ctx.db.patch(id, { items: cleanItems(items, tradeOf(a.trade)), itemsSetByPerson: true });
  },
});

/**
 * Has Claude look again at every library file with no labels yet, from the deployment: for files uploaded before
 * labels were asked for. A second apart, so the looks don't pile up. Tags a person set stay (saveDescription).
 */
export const labelLibrary = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!process.env.ANTHROPIC_API_KEY) return { asked: 0 };
    let asked = 0;
    for (const a of await ctx.db.query("adAssets").take(500)) {
      if (a.items !== undefined) continue;
      // Spaced out, so Claude isn't asked faster than it takes pictures.
      await ctx.scheduler.runAfter(asked * 3000, internal.ads.describeAsset, { id: a._id });
      asked += 1;
    }
    return { asked };
  },
});

/**
 * Has Claude look again at every library photo of a trade with types of work that has none yet, from the
 * deployment (once, after types of work were added): each gets the types Claude sees, its own tags kept
 * (saveDescription). Three seconds apart, 200 a page, each page asking for the next.
 */
export const labelWorks = internalMutation({
  args: { cursor: v.optional(v.string()), asked: v.optional(v.number()) },
  handler: async (ctx, { cursor, asked = 0 }) => {
    if (!process.env.ANTHROPIC_API_KEY) return { asked: 0, done: true };
    const page = await ctx.db.query("adAssets").paginate({ cursor: cursor ?? null, numItems: 200 });
    let here = 0;
    for (const a of page.page) {
      const trade = tradeOf(a.trade);
      if (!trade.works || workTags(a.tags, trade).length > 0) continue;
      await ctx.scheduler.runAfter(here * 3000, internal.ads.describeAsset, { id: a._id, works: true });
      here += 1;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(here * 3000, internal.ads.labelWorks, { cursor: page.continueCursor, asked: asked + here });
    return { asked: asked + here, done: page.isDone };
  },
});

/**
 * Has Claude look again at every photo of a trade tagged with one of the types of work given (by default Rooms
 * painted, once the everything category), from the deployment: each takes the types as they are now, the subject
 * first, unless a person picked its types (saveDescription). Three seconds apart, 200 a page.
 */
export const reworkWorks = internalMutation({
  // none: the photos with no type of work at all instead.
  args: { trade: v.optional(v.string()), works: v.optional(v.array(v.string())), none: v.optional(v.boolean()), cursor: v.optional(v.string()), asked: v.optional(v.number()) },
  handler: async (ctx, { trade, works = ["interior-walls"], none, cursor, asked = 0 }) => {
    if (!process.env.ANTHROPIC_API_KEY) return { asked: 0, done: true };
    const slug = tradeOf(trade).slug;
    const page = await ctx.db.query("adAssets").paginate({ cursor: cursor ?? null, numItems: 200 });
    let here = 0;
    for (const a of page.page) {
      if (tradeOf(a.trade).slug !== slug || a.kind !== "photo") continue;
      if (none ? workTags(a.tags, tradeOf(a.trade)).length > 0 : !a.tags.some((t) => works.includes(t))) continue;
      await ctx.scheduler.runAfter(here * 3000, internal.ads.describeAsset, { id: a._id, rework: true });
      here += 1;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(here * 3000, internal.ads.reworkWorks, { trade: slug, works, ...(none ? { none } : {}), cursor: page.continueCursor, asked: asked + here });
    return { asked: asked + here, done: page.isDone };
  },
});

/**
 * A photo with no type of work takes its project's: the type most of the project's other photos have (a before of a
 * kitchen whose afters are painted cabinets is cabinets painted). Nothing when it's in no project or the project has
 * none.
 */
async function inheritWork(ctx: MutationCtx, id: Id<"adAssets">) {
  const a = await ctx.db.get(id);
  if (a === null || a.kind !== "photo" || !a.jobId) return false;
  const trade = tradeOf(a.trade);
  if (!trade.works || workTags(a.tags, trade).length > 0) return false;
  const count = new Map<string, number>();
  for (const b of await ctx.db.query("adAssets").withIndex("by_job", (q) => q.eq("jobId", a.jobId)).take(200)) {
    const w = b._id !== id ? workTags(b.tags, trade)[0] : undefined;
    if (w) count.set(w, (count.get(w) ?? 0) + 1);
  }
  const best = [...count].sort((x, y) => y[1] - x[1])[0]?.[0];
  if (!best) return false;
  await ctx.db.patch(id, { tags: withWorkScopes([best, ...a.tags], trade), pairLookedAt: undefined });
  return true;
}

/** Gives each photo with no type of work its project's (inheritWork), from the deployment. */
export const fillWorksFromProjects = internalMutation({
  args: {},
  handler: async (ctx) => {
    const filled: string[] = [];
    for (const a of await ctx.db.query("adAssets").withIndex("by_kind", (q) => q.eq("kind", "photo")).take(1000))
      if (a.jobId && (await inheritWork(ctx, a._id))) {
        filled.push(`${a.fileName}: ${workTags((await ctx.db.get(a._id))!.tags, tradeOf(a.trade))[0]}`);
        await askPairs(ctx, await ctx.db.get(a._id));
      }
    return { filled };
  },
});

export const tagAsset = mutation({
  args: { id: v.id("adAssets"), tags: v.array(v.string()), pairKey: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, { id, tags, pairKey, note }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null) fail("NOT_FOUND", "That file isn't in the library");
    // Pairs are matched by Claude (pairPool) or by a person (pairPhotos); a pair key is only changed when one is given.
    const next = cleanTags(tags);
    const changed = next.join(",") !== a.tags.join(",");
    // A photo that stops being the before (or the after) leaves its pair; any change of tags has its match looked for.
    if (changed && pairKey === undefined && (isBefore(a) !== isBefore({ tags: next }) || isAfter(a) !== isAfter({ tags: next }))) await unpair(ctx, a);
    await ctx.db.patch(id, {
      tags: next,
      ...(pairKey !== undefined ? { pairKey: pairKey.trim() || undefined } : {}),
      ...(changed ? { pairLookedAt: undefined } : {}),
      note: note?.trim().slice(0, 300) || undefined,
    });
    if (changed) await askPairs(ctx, await ctx.db.get(id));
  },
});

/**
 * Sets what library files are tagged and what they show, many at once, from the deployment: for a library
 * whose tags were all given as one. Only tags of the file's own trade are kept; a file's pair is left as it is.
 */
export const retagAssets = internalMutation({
  args: { items: v.array(v.object({ id: v.id("adAssets"), tags: v.array(v.string()), description: v.optional(v.string()) })) },
  handler: async (ctx, { items }) => {
    const changed: string[] = [];
    const missing: string[] = [];
    for (const item of items) {
      const a = await ctx.db.get(item.id);
      if (a === null) {
        missing.push(item.id);
        continue;
      }
      const allowed = assetTagsOf(tradeOf(a.trade));
      const tags = cleanTags(item.tags).filter((t) => allowed.includes(t));
      await ctx.db.patch(item.id, { tags, ...(item.description?.trim() ? { description: item.description.trim().slice(0, 300) } : {}) });
      changed.push(a.fileName);
    }
    return { changed: changed.length, missing };
  },
});

export const removeAsset = mutation({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null) return;
    // Its other half goes back to being looked at.
    await unpair(ctx, a);
    await ctx.db.delete(id);
    for (const sid of [a.storageId, a.posterStorageId, a.thumbStorageId, a.motion?.storageId])
      if (sid && (await ctx.db.system.get(sid)) !== null) await ctx.storage.delete(sid);
  },
});

// ------------------------------------------------------------------ Motion
//
// A photo brought to life: an AI video model (Kling, through fal.ai) turns a
// library photo into a short clip of the same room with the camera moving.
// For now this is a test run from the deployment, to see whether the clips
// look real enough to use: nothing here puts a clip in an ad.

const MOTION_MODEL = "fal-ai/kling-video/v3/pro/image-to-video";
const FAL_QUEUE = "https://queue.fal.run";
const MOTION_SEC = 5;
/** About what the model costs a second with no sound, for the estimate a run gives before it spends. */
const MOTION_CENTS_PER_SEC = 11.2;
/** The most photos one run may send: each one costs money. */
const MOTION_MAX = 10;
/** Asked every 20 seconds, for 20 minutes. */
const MOTION_TRIES = 60;
const MOTION_PROMPT =
  "Slow, steady camera move forward through the scene. Keep everything exactly as in the photo: the same colours, the same objects, the same layout. No people. Nothing added, nothing removed.";
const MOTION_NEGATIVE = "blur, distortion, low quality, warped lines, people, text, new objects, changed colours";

/**
 * Whether the video model can be handed this photo: it needs an image it can
 * fetch (the JPEG still for a HEIC), and no clip made or being made. One
 * whose last try failed (no balance, a refusal) can be tried again.
 */
const motionReady = (a: Doc<"adAssets">) =>
  a.kind === "photo" && (!a.motion || a.motion.status === "failed") && (Boolean(a.posterStorageId) || CLAUDE_IMAGE_TYPES.includes(a.contentType));

/**
 * Picks photos for a test and, unless it's a dry run, sends them: one of the
 * cabinets, one interior and one exterior when the library has them (a
 * finished room before a "before"), then others up to the limit. A photo
 * with a clip, or one on its way, is never sent again; a failed one can be.
 */
export const motionTest = internalMutation({
  args: { limit: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { limit = 3, dryRun = true }) => {
    const max = Math.max(1, Math.min(MOTION_MAX, Math.floor(limit)));
    const photos = (await ctx.db.query("adAssets").take(500))
      .filter(motionReady)
      // A finished room shows the work; a "before" goes last.
      .sort((a, b) => Number(a.tags.includes("before")) - Number(b.tags.includes("before")) || b.createdAt.localeCompare(a.createdAt));
    const picks: Doc<"adAssets">[] = [];
    for (const scope of ["cabinets", "interior", "exterior"]) {
      const found = photos.find((a) => a.tags.includes(scope) && !picks.includes(a));
      if (found && picks.length < max) picks.push(found);
    }
    for (const a of photos) if (picks.length < max && !picks.includes(a)) picks.push(a);
    const out = {
      dryRun,
      photos: picks.map((a) => ({ id: a._id, fileName: a.fileName, tags: a.tags, description: a.description })),
      secondsEach: MOTION_SEC,
      estimateCents: Math.round(picks.length * MOTION_SEC * MOTION_CENTS_PER_SEC),
    };
    if (dryRun || picks.length === 0) return out;
    if (!process.env.FAL_KEY) fail("INVALID", "Set FAL_KEY on the Convex deployment first");
    let delay = 0;
    for (const a of picks) {
      await ctx.db.patch(a._id, { motion: { status: "making", model: MOTION_MODEL, durationSec: MOTION_SEC, startedAt: nowIso() } });
      await ctx.scheduler.runAfter(delay, internal.ads.makeMotion, { id: a._id });
      delay += 1500;
    }
    return out;
  },
});

export const motionInput = internalQuery({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    const a = await ctx.db.get(id);
    return a?.motion ? { imageUrl: await lookUrl(ctx, a), motion: a.motion } : null;
  },
});

export const patchMotion = internalMutation({
  args: {
    id: v.id("adAssets"),
    status: v.optional(v.union(v.literal("making"), v.literal("ready"), v.literal("failed"))),
    statusUrl: v.optional(v.string()),
    responseUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const a = await ctx.db.get(id);
    if (!a?.motion) return;
    const done = patch.status === "ready" || patch.status === "failed";
    await ctx.db.patch(id, { motion: { ...a.motion, ...patch, ...(done ? { finishedAt: nowIso() } : {}) } });
  },
});

const falHeaders = () => ({ "content-type": "application/json", authorization: `Key ${process.env.FAL_KEY}` });
/** The key only ever goes to fal's queue, whatever address a reply names. */
const falUrl = (url: unknown): string => {
  if (typeof url !== "string" || !url.startsWith(`${FAL_QUEUE}/`)) throw new Error("fal gave an address that isn't its queue");
  return url;
};

/** Hands one photo to the video model; the clip is collected by pollMotion. */
export const makeMotion = internalAction({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    const input = await ctx.runQuery(internal.ads.motionInput, { id });
    if (!input || input.motion.status !== "making") return;
    try {
      if (!process.env.FAL_KEY) throw new Error("FAL_KEY isn't set");
      if (!input.imageUrl) throw new Error("No image the video model can read");
      const res = await fetch(`${FAL_QUEUE}/${MOTION_MODEL}`, {
        method: "POST",
        headers: falHeaders(),
        body: JSON.stringify({
          start_image_url: input.imageUrl,
          prompt: MOTION_PROMPT,
          negative_prompt: MOTION_NEGATIVE,
          duration: String(MOTION_SEC),
          generate_audio: false,
        }),
      });
      const body = await readJson(res, "fal");
      await ctx.runMutation(internal.ads.patchMotion, { id, statusUrl: falUrl(body?.status_url), responseUrl: falUrl(body?.response_url) });
      await ctx.scheduler.runAfter(20_000, internal.ads.pollMotion, { id, tries: 1 });
    } catch (e) {
      await ctx.runMutation(internal.ads.patchMotion, { id, status: "failed", error: errText(e) });
    }
  },
});

export const pollMotion = internalAction({
  args: { id: v.id("adAssets"), tries: v.number() },
  handler: async (ctx, { id, tries }) => {
    const input = await ctx.runQuery(internal.ads.motionInput, { id });
    if (!input || input.motion.status !== "making" || !input.motion.statusUrl || !input.motion.responseUrl) return;
    try {
      const status = (await readJson(await fetch(falUrl(input.motion.statusUrl), { headers: falHeaders() }), "fal"))?.status;
      if (status === "COMPLETED") {
        const result = await readJson(await fetch(falUrl(input.motion.responseUrl), { headers: falHeaders() }), "fal");
        const url = result?.video?.url;
        if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("fal finished without a video");
        // The clip itself is a plain download: no key goes with it.
        const file = await fetch(url);
        if (!file.ok) throw new Error(`Couldn't download the clip (${file.status})`);
        const storageId = await ctx.storage.store(new Blob([await file.arrayBuffer()], { type: "video/mp4" }));
        await ctx.runMutation(internal.ads.patchMotion, { id, status: "ready", storageId });
      } else if (tries >= MOTION_TRIES) {
        throw new Error("The video model took more than 20 minutes");
      } else {
        await ctx.scheduler.runAfter(20_000, internal.ads.pollMotion, { id, tries: tries + 1 });
      }
    } catch (e) {
      await ctx.runMutation(internal.ads.patchMotion, { id, status: "failed", error: errText(e) });
    }
  },
});

/** Every photo that has been sent, with links to the photo and its clip, to watch side by side. */
export const motionResults = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sent = (await ctx.db.query("adAssets").take(500)).filter((a) => a.motion);
    return await Promise.all(
      sent.map(async (a) => ({
        fileName: a.fileName,
        tags: a.tags,
        status: a.motion!.status,
        error: a.motion!.error,
        seconds: a.motion!.durationSec,
        startedAt: a.motion!.startedAt,
        finishedAt: a.motion!.finishedAt,
        photo: await lookUrl(ctx, a),
        clip: a.motion!.storageId ? await ctx.storage.getUrl(a.motion!.storageId) : undefined,
      })),
    );
  },
});

// ------------------------------------------------------------------ Hooks

const family = v.union(
  v.literal("owner_story"),
  v.literal("before_after"),
  v.literal("proof"),
  v.literal("education"),
  v.literal("objection"),
  v.literal("seasonal"),
);

export const listHooks = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    const rows = (await ctx.db.query("adHooks").take(500)).filter((h) => inTrade(h, trade));
    const out = [];
    for (const h of rows)
      out.push({
        id: h._id,
        family: h.family,
        familyLabel: FAMILY_LABELS[h.family],
        scope: h.scope,
        trade: h.trade,
        textEn: h.textEn,
        active: h.active,
        uses: h.uses,
        wins: h.wins,
        losses: h.losses,
        lastUsedAt: h.lastUsedAt,
        basedOn: await sourceOf(ctx, h),
      });
    // Switched on first; then the ideas built on a competitor's ad, longest-running first; then the ones written by hand.
    return out.sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        Number(!a.basedOn) - Number(!b.basedOn) ||
        (b.basedOn?.daysRunning ?? 0) - (a.basedOn?.daysRunning ?? 0) ||
        a.family.localeCompare(b.family),
    );
  },
});

/** How long a competitor ad has been running: from the day Meta says it started, else as last counted. */
const runDays = (x: Doc<"adSwipes">): number | undefined => daysSince(x.startedAt) ?? x.daysRunning;

/** A competitor ad's words for the page: the times a transcript is stamped with taken out, and kept to a readable length. */
const swipeWords = (text: string | undefined): string | undefined => {
  const clean = onceOnly((text ?? "").replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, ""));
  return clean ? (clean.length > 1200 ? `${clean.slice(0, 1200).replace(/\s+\S*$/, "")}…` : clean) : undefined;
};

/**
 * The competitor ad an idea is built around, for the page: who ran it, for how long, what it offered, its angle,
 * and what it said (spoken and written), so it can be read beside what our ad says.
 */
async function sourceOf(ctx: QueryCtx, h: Doc<"adHooks">) {
  const x = h.swipeId ? await ctx.db.get(h.swipeId) : null;
  return x
    ? {
        company: x.company,
        daysRunning: runDays(x),
        offer: x.offer,
        angle: x.hook || undefined,
        spoken: swipeWords(x.transcript),
        written: swipeWords(x.adCopy),
        // Where to see the real ad: its page in Meta's Ad Library, else the advertiser's page; and its own media when kept.
        link: x.metaAdId ? `https://www.facebook.com/ads/library/?id=${encodeURIComponent(x.metaAdId)}` : x.pageUrl || undefined,
        videoUrl: x.videoUrl || undefined,
        imageUrl: x.imageUrl || x.posterUrl || undefined,
      }
    : undefined;
}

/**
 * Turns the competitor ads on file into ad ideas, one each: the ad's angle is
 * the idea, in the ad's own category. An ad with no known start date, or one
 * Claude read as not about painting, is left out. Each ad is used once: an
 * idea staff remove is not made again.
 */
export const ideasFromResearch = internalMutation({
  args: {},
  handler: async (ctx) => {
    let made = 0;
    for (const x of await ctx.db.query("adSwipes").take(1000)) {
      if (x.hookId || runDays(x) === undefined || (x.quality !== undefined && x.quality < 20)) continue;
      const seed = hookFromSwipe(x);
      if (!seed) continue;
      const hookId = await ctx.db.insert("adHooks", { ...seed, active: true, uses: 0, wins: 0, losses: 0, createdAt: nowIso(), swipeId: x._id });
      await ctx.db.patch(x._id, { hookId });
      made++;
    }
    return made;
  },
});

export const saveHook = mutation({
  args: {
    id: v.optional(v.id("adHooks")),
    family,
    scope: v.string(),
    trade: v.string(),
    textEn: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, { id, ...fields }) => {
    await requireStaff(ctx);
    const textEn = fields.textEn.trim();
    if (textEn.length < 10) fail("INVALID", "Write the hook in English first");
    const scope = fields.scope.trim().toLowerCase();
    const trade = tradeOf(fields.trade.trim().toLowerCase());
    const allowed = [...scopesOf(trade), ANY_SCOPE];
    if (!allowed.includes(scope)) fail("INVALID", `Scope must be one of ${allowed.join(", ")}`);
    const data = {
      family: fields.family,
      scope,
      trade: trade.slug,
      textEn: textEn.slice(0, 300),
      active: fields.active,
    };
    if (id) {
      if ((await ctx.db.get(id)) === null) fail("NOT_FOUND", "That hook is gone");
      await ctx.db.patch(id, data);
      return id;
    }
    return await ctx.db.insert("adHooks", { ...data, uses: 0, wins: 0, losses: 0, createdAt: nowIso() });
  },
});

export const removeHook = mutation({
  args: { id: v.id("adHooks") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    if ((await ctx.db.get(id)) !== null) await ctx.db.delete(id);
  },
});

/** Starts the hook list with the six painting families. Does nothing once any hook exists. */
export const seedHooks = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    if ((await ctx.db.query("adHooks").take(1)).length > 0) return 0;
    const now = nowIso();
    for (const h of PAINTING_HOOKS) await ctx.db.insert("adHooks", { ...h, active: true, uses: 0, wins: 0, losses: 0, createdAt: now });
    return PAINTING_HOOKS.length;
  },
});

// -------------------------------------------------------------- Swipe file

const swipeRow = v.object({
  company: v.string(),
  paintingType: v.string(),
  scope: v.optional(v.string()),
  hook: v.string(),
  offer: v.string(),
  creative: v.string(),
  area: v.string(),
  cta: v.string(),
  adaptation: v.string(),
  startedAt: v.optional(v.string()),
  status: v.optional(v.string()),
  pageUrl: v.optional(v.string()),
  destination: v.optional(v.string()),
  metaAdId: v.optional(v.string()),
  adCopy: v.optional(v.string()),
  transcript: v.optional(v.string()),
  durationSec: v.optional(v.number()),
});

/** Stores competitor ads, updating any already known by their Meta ad id. */
async function upsertSwipes(ctx: MutationCtx, rows: Record<string, unknown>[], source: string) {
  let added = 0;
  let updated = 0;
  for (const raw of rows) {
    const row = Object.fromEntries(Object.entries(raw).filter(([k, val]) => k !== "n" && val !== undefined && val !== "")) as Omit<
      Doc<"adSwipes">,
      "_id" | "_creationTime" | "starred" | "source" | "importedAt"
    >;
    if (!row.company) continue;
    const existing = row.metaAdId
      ? await ctx.db
          .query("adSwipes")
          .withIndex("by_meta_ad", (q) => q.eq("metaAdId", row.metaAdId))
          .first()
      : null;
    const longevity = { daysRunning: daysSince(row.startedAt) };
    if (existing) {
      await ctx.db.patch(existing._id, { ...row, ...longevity, source, importedAt: nowIso() });
      updated += 1;
    } else {
      const id = await ctx.db.insert("adSwipes", { ...row, ...longevity, starred: false, source, importedAt: nowIso() });
      await ctx.scheduler.runAfter(added * 1500, internal.ads.tagSwipe, { id });
      added += 1;
    }
  }
  return { added, updated };
}

/** Loads the October 10 research; ads already in the file (by Meta ad id) are left as they are. */
export const seedSwipes = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    let added = 0;
    for (const seed of SWIPE_SEEDS) {
      const existing = seed.metaAdId
        ? await ctx.db
            .query("adSwipes")
            .withIndex("by_meta_ad", (q) => q.eq("metaAdId", seed.metaAdId))
            .first()
        : null;
      if (existing) continue;
      const row = { ...seed };
      delete (row as { n?: number }).n;
      const id = await ctx.db.insert("adSwipes", {
        ...row,
        daysRunning: daysSince(seed.startedAt),
        starred: false,
        source: RESEARCH_SOURCE,
        importedAt: nowIso(),
      });
      await ctx.scheduler.runAfter(added * 1500, internal.ads.tagSwipe, { id });
      added += 1;
    }
    return added;
  },
});

/** Rows merged in the browser from the research sheet's CSV tabs. */
export const importSwipes = mutation({
  args: { rows: v.array(swipeRow), source: v.string() },
  handler: async (ctx, { rows, source }) => {
    await requireStaff(ctx);
    if (rows.length === 0)
      fail("INVALID", "No ads found. Download the sheet's tabs as CSV (File → Download → Comma-separated values) and upload those.");
    return await upsertSwipes(ctx, rows, source.trim().slice(0, 120) || "CSV import");
  },
});

export const listSwipes = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    return (await ctx.db.query("adSwipes").take(1000))
      .filter((x) => inTrade(x, trade))
      .map((x) => ({
        id: x._id,
        company: x.company,
        paintingType: x.paintingType,
        scope: x.scope,
        hook: x.hook,
        offer: x.offer,
        creative: x.creative,
        area: x.area,
        cta: x.cta,
        adaptation: x.adaptation,
        startedAt: x.startedAt,
        status: x.status,
        pageUrl: x.pageUrl,
        destination: x.destination,
        metaAdId: x.metaAdId,
        adCopy: x.adCopy,
        transcript: x.transcript,
        durationSec: x.durationSec,
        starred: x.starred,
        source: x.source,
        pageLikes: x.pageLikes,
        daysRunning: x.daysRunning,
        endedAt: x.endedAt,
        variants: x.variants,
        title: x.title,
        landing: x.landing,
        imageUrl: x.imageUrl,
        posterUrl: x.posterUrl,
        mediaType: x.mediaType,
        family: x.family,
        claims: x.claims,
        opening: x.opening,
        footage: x.footage,
        quality: x.quality,
        local: x.local,
        tagError: x.tagError,
        score: swipeScore(x),
      }))
      .sort((a, b) => Number(b.starred) - Number(a.starred) || b.score - a.score || a.company.localeCompare(b.company));
  },
});

export const starSwipe = mutation({
  args: { id: v.id("adSwipes"), starred: v.boolean() },
  handler: async (ctx, { id, starred }) => {
    await requireStaff(ctx);
    if ((await ctx.db.get(id)) === null) fail("NOT_FOUND", "That ad isn't in the swipe file");
    await ctx.db.patch(id, { starred });
  },
});

export const removeSwipe = mutation({
  args: { id: v.id("adSwipes") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    if ((await ctx.db.get(id)) !== null) await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------- Niche research
//
// "Search the niche": each keyword goes to Meta's Ad Library through an Apify
// actor (Meta's own API carries no US commercial ads). Ads still running after
// the longevity bar come in as swipes; Claude reads each one (angle, family,
// offer, claims never to copy, quality, whether it names one of the owner's
// markets); video ads get a transcript from ElevenLabs; then the playbook for
// each scope is rewritten from what qualifies.

// "general" is written from every qualifying ad and stands in for hooks whose scope (crew, process) has no playbook of its own.
const PLAYBOOK_SCOPES = ["cabinets", "interior", "exterior", "general"];
const PLAYBOOK_MIN_ADS = 3;
const PER_KEYWORD = 200;
/** Stopped ads looked at per keyword: enough to catch the table's own, cheaper than the main search. */
const STOPPED_PER_KEYWORD = 100;
/** ScrapeCreators bills per page (a credit each), so it reads fewer: the most-seen ads first. */
const SCRAPE_PER_KEYWORD = 150;
const SCRAPE_STOPPED_PER_KEYWORD = 60;
const SCRAPE_PAGES = 8;
const SCRAPE_URL = "https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads";

/** The competitor search key: SCRAPECREATORS_API_KEY on the deployment, else the one pasted in Settings (sealed). */
async function scrapeKey(ctx: ActionCtx): Promise<string | undefined> {
  if (process.env.SCRAPECREATORS_API_KEY) return process.env.SCRAPECREATORS_API_KEY;
  const enc: string | null = await ctx.runQuery(internal.ads.scrapeKeySealed, {});
  return enc ? await openSealed(enc) : undefined;
}

export const scrapeKeySealed = internalQuery({
  args: {},
  handler: async (ctx) => (await settingsRow(ctx))?.scrapeKeyEnc ?? null,
});

/** One page of a US Ad Library search through ScrapeCreators. */
async function scrapePage(key: string, keyword: string, status: "active" | "inactive", cursor?: string) {
  const q = new URLSearchParams({
    query: keyword,
    country: "US",
    status: status === "active" ? "ACTIVE" : "INACTIVE",
    media_type: "ALL",
    sort_by: "total_impressions",
    ...(cursor ? { cursor } : {}),
  });
  const body = await readJson(await fetch(`${SCRAPE_URL}?${q}`, { headers: { "x-api-key": key } }), "ScrapeCreators");
  if (body?.success === false) throw new Error(`ScrapeCreators: ${String(body?.message ?? body?.error ?? "said no")}`.slice(0, 300));
  const ads: unknown[] = Array.isArray(body?.searchResults) ? body.searchResults : Array.isArray(body?.results) ? body.results : [];
  return { ads, cursor: typeof body?.cursor === "string" && body.cursor ? body.cursor : undefined, credits: body?.credits_remaining };
}

/** Up to `max` ads for a keyword, a page at a time while there's a next page. */
async function scrapeSearch(key: string, keyword: string, status: "active" | "inactive", max: number): Promise<unknown[]> {
  const out: unknown[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < SCRAPE_PAGES && out.length < max; page++) {
    const got = await scrapePage(key, keyword, status, cursor);
    out.push(...got.ads);
    cursor = got.cursor;
    if (!cursor || got.ads.length === 0) break;
  }
  return out.slice(0, max);
}

/**
 * The owner pastes the competitor search key in Settings: one small search checks it with ScrapeCreators first (a
 * wrong key is turned away with their reason), then it's sealed and stored. Only its last four characters are shown.
 */
export const saveScrapeKey = action({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ credits?: number }> => {
    await ctx.runQuery(internal.ads.ownerOnly, {});
    const clean = key.trim();
    if (clean.length < 12 || /\s/.test(clean)) fail("INVALID", "That doesn't look like a ScrapeCreators key. Copy the whole key and paste it again.");
    const got = await scrapePage(clean, "house painting", "active").catch((e) => fail("INVALID", `ScrapeCreators didn't accept that key. ${errText(e)}`));
    await ctx.runMutation(internal.ads.storeScrapeKey, { enc: await seal(clean), hint: clean.slice(-4) });
    return { credits: typeof got.credits === "number" ? got.credits : undefined };
  },
});

export const storeScrapeKey = internalMutation({
  args: { enc: v.optional(v.string()), hint: v.optional(v.string()) },
  handler: async (ctx, { enc, hint }) => {
    const row = await settingsRow(ctx);
    const fields = { scrapeKeyEnc: enc, scrapeKeyHint: enc ? hint : undefined, scrapeKeySetAt: enc ? nowIso() : undefined, updatedAt: nowIso() };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("adSettings", { ...DEFAULTS, ...fields });
  },
});

/** Takes the pasted competitor search key away. */
export const removeScrapeKey = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { scrapeKeyEnc: undefined, scrapeKeyHint: undefined, scrapeKeySetAt: undefined, updatedAt: nowIso() });
  },
});

export const researchNow = mutation({
  // `trade`: search for that trade's competitor ads; painting when none is given.
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    const me = await requireSuperAdmin(ctx);
    const k = keys();
    if (!k.apify && !k.scrape && !(await settingsRow(ctx))?.scrapeKeyEnc)
      fail("INVALID", "Paste the competitor search key (ScrapeCreators) in Ads → Settings first");
    if (!k.anthropic) fail("INVALID", "Set ANTHROPIC_API_KEY on the Convex deployment first");
    const open = (await ctx.db.query("adResearchRuns").order("desc").take(1))[0];
    if (open && !open.finishedAt && Date.now() - new Date(open.startedAt).getTime() < 30 * 60_000) fail("INVALID", "A search is already running");
    await ctx.scheduler.runAfter(0, internal.ads.researchRun, { startedBy: me._id, force: true, trade: tradeOf(trade).slug });
  },
});

export const openResearch = internalMutation({
  args: { keywords: v.array(v.string()), startedBy: v.optional(v.id("users")) },
  handler: async (ctx, { keywords, startedBy }) =>
    await ctx.db.insert("adResearchRuns", { startedAt: nowIso(), keywords, scanned: 0, kept: 0, added: 0, junk: 0, unreadable: 0, startedBy }),
});

/** Stores scraped ads: new rows are inserted untagged, known ones (by Meta ad id) get their longevity refreshed. */
export const addScraped = internalMutation({
  args: { ads: v.array(v.any()), source: v.string(), markets: v.array(v.string()), trade: v.optional(v.string()) },
  handler: async (ctx, { ads, source, markets, trade: slug }) => {
    const trade = tradeOf(slug);
    const added: Id<"adSwipes">[] = [];
    for (const raw of ads as ScrapedAd[]) {
      const existing = await ctx.db
        .query("adSwipes")
        .withIndex("by_meta_ad", (q) => q.eq("metaAdId", raw.metaAdId))
        .first();
      const scraped = {
        pageId: raw.pageId,
        pageLikes: raw.pageLikes,
        daysRunning: raw.daysRunning,
        active: raw.active,
        variants: raw.variants,
        platforms: raw.platforms,
        title: raw.title,
        landing: raw.landing,
        imageUrl: raw.imageUrl,
        videoUrl: raw.videoUrl,
        posterUrl: raw.posterUrl,
        mediaType: raw.mediaType,
        startedAt: raw.startedAt,
        endedAt: raw.endedAt,
        lastSeenAt: nowIso(),
        status: raw.active ? "Active" : "Inactive",
      };
      if (existing) {
        await ctx.db.patch(existing._id, { ...scraped, adCopy: existing.adCopy || raw.adCopy || undefined });
        continue;
      }
      const text = [raw.pageName, raw.title, raw.adCopy, raw.landing].filter(Boolean).join(" ");
      const id = await ctx.db.insert("adSwipes", {
        ...scraped,
        trade: trade.slug,
        company: raw.pageName,
        paintingType: `General ${trade.label.toLowerCase()}`,
        hook: cutText((raw.title || raw.adCopy || raw.pageName).replace(/\s+/g, " ").trim(), 80),
        offer: "",
        creative: raw.mediaType,
        area: "",
        cta: raw.cta ?? "",
        adaptation: "",
        pageUrl: raw.pageId ? `https://www.facebook.com/${raw.pageId}/` : undefined,
        destination: raw.landing,
        metaAdId: raw.metaAdId,
        adCopy: raw.adCopy || undefined,
        local: isLocal(text, markets),
        starred: false,
        source,
        importedAt: nowIso(),
      });
      added.push(id);
    }
    return added;
  },
});

export const finishResearch = internalMutation({
  args: {
    runId: v.id("adResearchRuns"),
    scanned: v.number(),
    kept: v.number(),
    added: v.number(),
    unreadable: v.number(),
    stopped: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, error, ...counts }) => {
    await ctx.db.patch(runId, { ...counts, error, finishedAt: nowIso() });
    await tellStaff(
      ctx,
      error ? `The niche search didn't finish: ${error.slice(0, 80)}` : `Niche search done: ${counts.added} new competitor ads`,
      [
        `Scanned ${counts.scanned} ads, ${counts.kept} still running past the longevity bar, ${counts.added} new to the swipe file.`,
        counts.stopped ? `${counts.stopped} already kept have stopped running; they're marked Stopped.` : "",
        counts.unreadable ? `${counts.unreadable} came back without an id or start date and were skipped.` : "",
        error ? `Stopped on: ${error}` : "Claude is reading the new ones now; the playbooks follow in Ops → Ads → Swipe file.",
      ].filter(Boolean),
      "/ops?tab=ads",
    );
  },
});

export const countJunk = internalMutation({
  args: { runId: v.id("adResearchRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (run) await ctx.db.patch(runId, { junk: run.junk + 1 });
  },
});

/**
 * Ads already in the table that a search found stopped: marked so, with their last day and final run length. Ads the
 * table doesn't have are left out; a stopped ad is never added. Returns how many were marked.
 */
export const markStopped = internalMutation({
  args: { ads: v.array(v.any()) },
  handler: async (ctx, { ads }) => {
    let stopped = 0;
    for (const raw of ads as ScrapedAd[]) {
      if (raw.active) continue;
      const x = await ctx.db
        .query("adSwipes")
        .withIndex("by_meta_ad", (q) => q.eq("metaAdId", raw.metaAdId))
        .first();
      if (!x || x.endedAt) continue;
      await ctx.db.patch(x._id, {
        active: false,
        status: "Inactive",
        endedAt: raw.endedAt ?? nowIso().slice(0, 10),
        daysRunning: raw.daysRunning,
        lastSeenAt: nowIso(),
      });
      stopped += 1;
    }
    return stopped;
  },
});

/** Trades searched on Mondays, a quarter hour apart so each run has its own time. */
const TRADE_GAP_MS = 15 * 60_000;

/**
 * The weekly search (every trade, when the switch is on), or the button (force, one trade). Per keyword: one Apify
 * call for the ads still running, then a smaller one for stopped ads, to mark the ones the table already has.
 */
export const researchRun = internalAction({
  // `trade`: search for that trade's ads with its own keywords; painting (and the keywords in Settings) when none is given.
  // `also`: more words to search this once, beside the usual ones (from a cloud session: a kind of job with few ads).
  args: {
    startedBy: v.optional(v.id("users")),
    force: v.optional(v.boolean()),
    trade: v.optional(v.string()),
    also: v.optional(v.array(v.string())),
    everyTrade: v.optional(v.boolean()),
  },
  handler: async (ctx, { startedBy, force, trade: slug, also, everyTrade }) => {
    const cfg = await ctx.runQuery(internal.ads.config, {});
    if (!cfg.researchMonthly && !force) return;
    if (everyTrade) {
      const slugs = Object.values(AD_TRADES)
        .filter((t) => t.keywords.length > 0)
        .map((t) => t.slug);
      for (const [i, s] of slugs.entries()) await ctx.scheduler.runAfter(i * TRADE_GAP_MS, internal.ads.researchRun, { force: true, trade: s });
      return;
    }
    const trade = tradeOf(slug);
    const usual = trade.slug === DEFAULT_TRADE ? cfg.researchKeywords : [...trade.keywords];
    const keywords = [...new Set([...usual, ...(also ?? []).map((k) => k.trim().slice(0, 60)).filter(Boolean).slice(0, 6)])];
    const runId: Id<"adResearchRuns"> = await ctx.runMutation(internal.ads.openResearch, { keywords, startedBy });
    const counts = { scanned: 0, kept: 0, added: 0, unreadable: 0, stopped: 0 };
    if (!(await scrapeKey(ctx)) && !process.env.APIFY_TOKEN) {
      await ctx.runMutation(internal.ads.finishResearch, { runId, ...counts, error: "Paste the competitor search key (ScrapeCreators) in Ads → Settings" });
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      await ctx.runMutation(internal.ads.finishResearch, { runId, ...counts, error: "Set ANTHROPIC_API_KEY on the deployment" });
      return;
    }
    // One keyword per step, each its own action, so a long list never runs into an action's time limit.
    await ctx.scheduler.runAfter(0, internal.ads.researchStep, {
      runId,
      trade: trade.slug,
      keywords,
      index: 0,
      source: `research ${nowIso().slice(0, 10)}`,
      seen: [],
      counts,
      delay: 0,
    });
  },
});

const researchCounts = v.object({ scanned: v.number(), kept: v.number(), added: v.number(), unreadable: v.number(), stopped: v.number() });

/**
 * One keyword of a search: the ads still running past the bar (new ones kept, known ones refreshed), then a smaller
 * look at stopped ads to mark the kept ones that ended. Then the next keyword, or the end of the run.
 */
export const researchStep = internalAction({
  args: {
    runId: v.id("adResearchRuns"),
    trade: v.string(),
    keywords: v.array(v.string()),
    index: v.number(),
    source: v.string(),
    seen: v.array(v.string()),
    counts: researchCounts,
    delay: v.number(),
  },
  handler: async (ctx, { runId, trade, keywords, index, source, seen: seenBefore, counts, delay }) => {
    const cfg = await ctx.runQuery(internal.ads.config, {});
    const keyword = keywords[index];
    const seen = new Set(seenBefore);
    const scrape = await scrapeKey(ctx);
    // ScrapeCreators when its key is set, else Apify. Both hand back Meta's own fields for each ad.
    const search = async (status: "active" | "inactive", max: number): Promise<unknown> => {
      if (scrape) return await scrapeSearch(scrape, keyword, status, max);
      return await readJson(
        await fetch(
          `https://api.apify.com/v2/acts/${process.env.APIFY_ACTOR || DEFAULT_APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN ?? "")}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(apifyInput(keyword, cfg.researchMinDays, new Date(), max, status)),
          },
        ),
        "Apify",
      );
    };
    try {
      const items = await search("active", scrape ? SCRAPE_PER_KEYWORD : PER_KEYWORD);
      if (!Array.isArray(items)) throw new Error("The ad search didn't return a list of ads");
      counts.scanned += items.length;
      const fresh: ScrapedAd[] = [];
      for (const item of items) {
        const ad = fromApifyItem(item);
        if (!ad) {
          counts.unreadable += 1;
          continue;
        }
        if (!qualifies(ad, cfg.researchMinDays) || seen.has(ad.metaAdId)) continue;
        seen.add(ad.metaAdId);
        counts.kept += 1;
        fresh.push(ad);
      }
      const ids: Id<"adSwipes">[] = await ctx.runMutation(internal.ads.addScraped, { ads: fresh, source, markets: cfg.researchMarkets, trade });
      counts.added += ids.length;
      for (const id of ids) {
        await ctx.scheduler.runAfter(delay, internal.ads.tagSwipe, { id, runId });
        delay += 1500;
      }
      // The ones that have stopped: only to mark ads already kept. A failure here doesn't stop the search.
      try {
        const ended = await search("inactive", scrape ? SCRAPE_STOPPED_PER_KEYWORD : STOPPED_PER_KEYWORD);
        const stoppedAds = (Array.isArray(ended) ? ended : []).map((item) => fromApifyItem(item)).filter((a): a is ScrapedAd => a !== null && !a.active);
        if (stoppedAds.length) counts.stopped += await ctx.runMutation(internal.ads.markStopped, { ads: stoppedAds });
      } catch (e) {
        console.error("stopped ads", errText(e));
      }
    } catch (e) {
      await ctx.runMutation(internal.ads.finishResearch, { runId, ...counts, error: errText(e) });
      return;
    }
    if (index + 1 < keywords.length) {
      // Kept ids only matter within a run; capped so the arguments stay small.
      await ctx.scheduler.runAfter(0, internal.ads.researchStep, {
        runId,
        trade,
        keywords,
        index: index + 1,
        source,
        seen: [...seen].slice(-2000),
        counts,
        delay: Math.max(0, delay - 60_000),
      });
    } else {
      await ctx.runMutation(internal.ads.finishResearch, { runId, ...counts });
    }
  },
});

/** Swipes Claude hasn't read yet. When it reaches zero the playbooks are rewritten. */
export const untaggedCount = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("adSwipes").take(1000)).filter((x) => !x.taggedAt).length,
});

/**
 * Competitor ads Claude hasn't read yet (a read that never ran, say Claude was busy): each read again, a few seconds
 * apart. The last one brings the playbooks up to date, as after a search.
 */
export const tagWaiting = internalMutation({
  args: {},
  handler: async (ctx) => {
    const waiting = (await ctx.db.query("adSwipes").take(1000)).filter((x) => !x.taggedAt);
    for (const [i, x] of waiting.entries()) await ctx.scheduler.runAfter(i * 3000, internal.ads.tagSwipe, { id: x._id });
    return { reading: waiting.length };
  },
});

export const swipeForTag = internalQuery({
  args: { id: v.id("adSwipes") },
  handler: async (ctx, { id }) => {
    const x = await ctx.db.get(id);
    return x ? { swipe: x, markets: research(await settingsRow(ctx)).researchMarkets } : null;
  },
});

export const saveTags = internalMutation({
  args: { id: v.id("adSwipes"), tags: v.optional(v.any()), error: v.optional(v.string()), markets: v.array(v.string()) },
  handler: async (ctx, { id, tags, error, markets }) => {
    const x = await ctx.db.get(id);
    if (!x) return "gone" as const;
    if (!tags) {
      await ctx.db.patch(id, { tagError: error ?? "Claude's answer couldn't be read", taggedAt: nowIso() });
      return "error" as const;
    }
    const t = tags as NonNullable<ReturnType<typeof readSwipeTags>>;
    if (!t.painting || t.quality < 20) {
      await ctx.db.delete(id);
      return "junk" as const;
    }
    // The VA's own reading of an ad stands; Claude fills what was blank.
    const vaWritten = x.adaptation !== "";
    const text = [x.company, x.title, x.adCopy, x.landing, x.transcript, x.area, t.area].filter(Boolean).join(" ");
    await ctx.db.patch(id, {
      paintingType: vaWritten ? x.paintingType : t.paintingType,
      scope: x.scope ?? t.scope,
      hook: vaWritten ? x.hook : t.hook,
      offer: x.offer || t.offer,
      creative: vaWritten ? x.creative : t.creative,
      area: x.area || t.area,
      cta: x.cta || t.cta,
      adaptation: x.adaptation || t.adaptation,
      family: t.family,
      claims: t.claims,
      opening: t.opening,
      footage: t.footage,
      quality: t.quality,
      local: isLocal(text, markets),
      tagError: undefined,
      taggedAt: nowIso(),
    });
    return "tagged" as const;
  },
});

/** Claude reads one competitor ad (with its still when there is one); junk is dropped. Video ads go on to be transcribed. */
export const tagSwipe = internalAction({
  args: { id: v.id("adSwipes"), runId: v.optional(v.id("adResearchRuns")) },
  handler: async (ctx, { id, runId }) => {
    if (!process.env.ANTHROPIC_API_KEY) return;
    const found = await ctx.runQuery(internal.ads.swipeForTag, { id });
    if (!found) return;
    const { swipe, markets } = found;
    const trade = tradeOf(swipe.trade);
    const prompt = { type: "text", text: tagSwipePrompt({ ...swipe, pageName: swipe.company }, markets, trade) };
    const image = swipe.posterUrl ?? swipe.imageUrl;
    let tags: ReturnType<typeof readSwipeTags> = null;
    let error: string | undefined;
    try {
      let reply: string;
      try {
        reply = await claude(image ? [{ type: "image", source: { type: "url", url: image } }, prompt] : [prompt], 700);
      } catch (e) {
        // A still Claude can't take (too big, gone, not an image): read the words alone.
        if (!image) throw e;
        reply = await claude([prompt], 700);
      }
      tags = readSwipeTags(reply, trade);
    } catch (e) {
      error = errText(e);
    }
    const outcome = await ctx.runMutation(internal.ads.saveTags, { id, tags: tags ?? undefined, error, markets });
    if (outcome === "junk" && runId) await ctx.runMutation(internal.ads.countJunk, { runId });
    if (outcome === "tagged" && swipe.videoUrl && !swipe.transcript && process.env.ELEVENLABS_API_KEY)
      await ctx.scheduler.runAfter(0, internal.ads.transcribeSwipe, { id });
    // The last ad read in a batch brings the playbooks up to date.
    if ((await ctx.runQuery(internal.ads.untaggedCount, {})) === 0) await ctx.scheduler.runAfter(0, internal.ads.rebuildPlaybooks, {});
  },
});

export const saveTranscript = internalMutation({
  args: { id: v.id("adSwipes"), transcript: v.string(), durationSec: v.optional(v.number()) },
  handler: async (ctx, { id, transcript, durationSec }) => {
    if ((await ctx.db.get(id)) !== null) await ctx.db.patch(id, { transcript, durationSec });
  },
});

/** ElevenLabs writes down what a competitor's video says, from the video URL the scrape gave (those expire, so soon after). */
export const transcribeSwipe = internalAction({
  args: { id: v.id("adSwipes") },
  handler: async (ctx, { id }) => {
    const found = await ctx.runQuery(internal.ads.swipeForTag, { id });
    if (!found?.swipe.videoUrl || found.swipe.transcript || !process.env.ELEVENLABS_API_KEY) return;
    try {
      const form = new FormData();
      form.set("model_id", "scribe_v2");
      form.set("source_url", found.swipe.videoUrl);
      form.set("timestamps_granularity", "word");
      form.set("tag_audio_events", "false");
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
        body: form,
      });
      const body = await readJson(res, "ElevenLabs");
      const text = String(body?.text ?? "").trim();
      if (!text) return;
      const ends = (Array.isArray(body?.words) ? body.words : []).map((w: { end?: number }) => Number(w.end) || 0);
      const durationSec = ends.length ? Math.max(...ends) : undefined;
      await ctx.runMutation(internal.ads.saveTranscript, { id, transcript: text.slice(0, 4000), durationSec });
    } catch (e) {
      console.error("transcribe swipe", id, errText(e));
    }
  },
});

/** What each scope's playbook is written from: the swipes that qualify, the library's tag counts, the markets. */
export const playbookInputs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await settingsRow(ctx);
    const { researchMarkets: markets, researchMinDays: minDays } = research(row);
    // Playbooks are kept per painting scope; other trades' ads are built straight on their own competitor ads.
    const swipes = (await ctx.db.query("adSwipes").take(1000)).filter((x) => inTrade(x, DEFAULT_TRADE));
    const libraryTags: Record<string, number> = {};
    for (const a of await ctx.db.query("adAssets").take(500)) for (const t of a.tags) libraryTags[t] = (libraryTags[t] ?? 0) + 1;
    const playbooks = await ctx.db.query("adPlaybooks").take(20);
    const byScope: Record<string, typeof swipes> = {};
    for (const x of swipes) {
      if (x.quality !== undefined && x.quality < 20) continue;
      // Qualifies: past the longevity bar, or starred, or the VA's own research (its dates may be unreadable).
      if (!(x.starred || (x.daysRunning ?? 0) >= minDays || x.source === RESEARCH_SOURCE)) continue;
      (byScope.general ??= []).push(x);
      if (x.scope) (byScope[x.scope] ??= []).push(x);
    }
    return { markets, libraryTags, byScope, playbooks };
  },
});

export const savePlaybookAuto = internalMutation({
  args: {
    scope: v.string(),
    playbook: v.any(),
    basis: v.object({ ads: v.number(), local: v.number(), oldestDays: v.number() }),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { scope, playbook, basis, force }) => {
    const p = playbook as Playbook;
    const existing = await ctx.db
      .query("adPlaybooks")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .first();
    // A human's edit holds until someone asks for a rewrite.
    if (existing?.editedAt && !force) return false;
    const data = { scope, ...p, basis, writtenAt: nowIso(), editedAt: undefined };
    if (existing) await ctx.db.patch(existing._id, data);
    else await ctx.db.insert("adPlaybooks", data);
    return true;
  },
});

/** Claude distills each scope's qualifying swipes into its playbook. */
export const rebuildPlaybooks = internalAction({
  args: { scope: v.optional(v.string()), force: v.optional(v.boolean()) },
  handler: async (ctx, { scope, force }) => {
    if (!process.env.ANTHROPIC_API_KEY) return;
    const inputs: {
      markets: string[];
      libraryTags: Record<string, number>;
      byScope: Record<string, Doc<"adSwipes">[]>;
      playbooks: Doc<"adPlaybooks">[];
    } = await ctx.runQuery(internal.ads.playbookInputs, {});
    const { markets, libraryTags, byScope, playbooks } = inputs;
    for (const sc of scope ? [scope] : PLAYBOOK_SCOPES) {
      const rows = (byScope[sc] ?? []).sort((a, b) => swipeScore(b) - swipeScore(a)).slice(0, 25);
      if (rows.length < PLAYBOOK_MIN_ADS) continue;
      const current = playbooks.find((p) => p.scope === sc);
      if (current?.editedAt && !force) continue;
      // Two ads finishing together both ask for a rewrite; one is enough.
      if (current && !force && Date.now() - new Date(current.writtenAt).getTime() < 30_000) continue;
      try {
        const summary = rows.map((x) => ({
          company: x.company,
          hook: x.hook,
          family: x.family,
          offer: x.offer,
          opening: x.opening,
          footage: x.footage,
          daysRunning: x.daysRunning,
          local: x.local,
          transcript: x.transcript,
          adCopy: x.adCopy,
          durationSec: x.durationSec,
        }));
        // Room to finish: at 1,200 the reply was cut off part-way through its JSON every time, so nothing was ever saved.
        const reply = await claudeReply([{ type: "text", text: playbookPrompt(sc, summary, markets, libraryTags) }], SHOT_LIST_TOKENS);
        const playbook = readPlaybook(reply.text);
        if (!playbook) throw new Error(reply.cutOff ? "the reply was cut off before it finished" : "the reply wasn't a playbook");
        await ctx.runMutation(internal.ads.savePlaybookAuto, {
          scope: sc,
          playbook,
          basis: { ads: rows.length, local: rows.filter((x) => x.local).length, oldestDays: Math.max(0, ...rows.map((x) => x.daysRunning ?? 0)) },
          force,
        });
      } catch (e) {
        console.error("playbook", sc, errText(e));
      }
    }
  },
});

export const listPlaybooks = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return (await ctx.db.query("adPlaybooks").take(20))
      .map((p) => ({
        id: p._id,
        scope: p.scope,
        text: p.text,
        footagePrefs: p.footagePrefs,
        angleFamilies: p.angleFamilies,
        localCompetitors: p.localCompetitors,
        missingFootage: p.missingFootage,
        basis: p.basis,
        writtenAt: p.writtenAt,
        editedAt: p.editedAt,
      }))
      .sort((a, b) => PLAYBOOK_SCOPES.indexOf(a.scope) - PLAYBOOK_SCOPES.indexOf(b.scope));
  },
});

/** A human rewrites the text; it then holds until "Rewrite". */
export const savePlaybook = mutation({
  args: { scope: v.string(), text: v.string() },
  handler: async (ctx, { scope, text }) => {
    await requireStaff(ctx);
    const clean = text.trim().slice(0, 1600);
    if (clean.length < 20) fail("INVALID", "Write at least a sentence");
    const existing = await ctx.db
      .query("adPlaybooks")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .first();
    if (existing) await ctx.db.patch(existing._id, { text: clean, editedAt: nowIso() });
    else
      await ctx.db.insert("adPlaybooks", {
        scope,
        text: clean,
        footagePrefs: [],
        angleFamilies: [],
        localCompetitors: [],
        missingFootage: [],
        basis: { ads: 0, local: 0, oldestDays: 0 },
        writtenAt: nowIso(),
        editedAt: nowIso(),
      });
  },
});

export const rewritePlaybook = mutation({
  args: { scope: v.optional(v.string()) },
  handler: async (ctx, { scope }) => {
    await requireStaff(ctx);
    if (!keys().anthropic) fail("INVALID", "Set ANTHROPIC_API_KEY on the Convex deployment first");
    await ctx.scheduler.runAfter(0, internal.ads.rebuildPlaybooks, { scope, force: true });
  },
});

/** The last few competitor searches and how each ended, for the deploy workflow to read. */
export const researchRuns = internalQuery({
  args: {},
  handler: async (ctx) => ({
    apify: keys().apify,
    scrape: keys().scrape || Boolean((await settingsRow(ctx))?.scrapeKeyEnc),
    runs: (await ctx.db.query("adResearchRuns").order("desc").take(5)).map((r) => ({
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      keywords: r.keywords,
      scanned: r.scanned,
      kept: r.kept,
      added: r.added,
      junk: r.junk,
      unreadable: r.unreadable,
      stopped: r.stopped ?? 0,
      error: r.error,
    })),
  }),
});

export const listResearchRuns = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return (await ctx.db.query("adResearchRuns").order("desc").take(5)).map((r) => ({
      id: r._id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      keywords: r.keywords,
      scanned: r.scanned,
      kept: r.kept,
      added: r.added,
      junk: r.junk,
      unreadable: r.unreadable,
      stopped: r.stopped ?? 0,
      error: r.error,
    }));
  },
});

// --------------------------------------------------------------- Settings

export const settings = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const row = await settingsRow(ctx);
    return {
      brand: consumerBrand(),
      keys: { ...keys(), meta: keys().meta || Boolean(row?.metaTokenEnc), library: keys().apify || keys().scrape || Boolean(row?.scrapeKeyEnc) },
      // The competitor search key pasted here: its last four characters and when. Never the key.
      scrapeKey: row?.scrapeKeyEnc ? { hint: row.scrapeKeyHint, setAt: row.scrapeKeySetAt, fromServer: keys().scrape } : null,
      // The token pasted here: only that one is set, its last four characters and when. Never the token.
      metaToken: row?.metaTokenEnc ? { hint: row.metaTokenHint, setAt: row.metaTokenSetAt, fromServer: keys().meta } : null,
      adAccountId: row?.adAccountId,
      pageId: row?.pageId,
      leadFormId: row?.leadFormId,
      adsetId: row?.adsetId,
      primaryColor: row?.primaryColor ?? "#336699",
      accentColor: row?.accentColor ?? "#8fb6e0",
      voiceId: row?.voiceId,
      ...actorSettings(row),
      weeklyEnabled: row?.weeklyEnabled ?? DEFAULTS.weeklyEnabled,
      hooksPerWeek: row?.hooksPerWeek ?? DEFAULTS.hooksPerWeek,
      liveTarget: row?.liveTarget ?? DEFAULTS.liveTarget,
      quickOffer: row?.quickOffer ?? true,
      tesseractFootage: row?.tesseractFootage ?? true,
      ...research(row),
    };
  },
});

export const saveSettings = mutation({
  args: {
    adAccountId: v.optional(v.string()),
    pageId: v.optional(v.string()),
    leadFormId: v.optional(v.string()),
    adsetId: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    voiceId: v.optional(v.string()),
    voiceSource: v.optional(v.union(v.literal("elevenlabs"), v.literal("actor"))),
    actorVoice: v.optional(v.string()),
    actorLanguage: v.optional(v.string()),
    actorNotes: v.optional(v.string()),
    weeklyEnabled: v.boolean(),
    hooksPerWeek: v.number(),
    liveTarget: v.number(),
    quickOffer: v.optional(v.boolean()),
    tesseractFootage: v.optional(v.boolean()),
    researchKeywords: v.optional(v.array(v.string())),
    researchMarkets: v.optional(v.array(v.string())),
    researchMinDays: v.optional(v.number()),
    researchMonthly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const trimmed = Object.fromEntries(
      Object.entries(args).map(([k, val]) => [k, typeof val === "string" ? val.trim().replace(/^act_/, "") || undefined : val]),
    );
    const words = (list: string[] | undefined) => [...new Set((list ?? []).map((w) => w.trim()).filter(Boolean))].slice(0, 12);
    const data = {
      ...trimmed,
      hooksPerWeek: Math.min(4, Math.max(1, Math.round(args.hooksPerWeek))),
      liveTarget: Math.min(12, Math.max(2, Math.round(args.liveTarget))),
      researchKeywords: words(args.researchKeywords),
      researchMarkets: words(args.researchMarkets),
      researchMinDays: args.researchMinDays === undefined ? undefined : Math.min(365, Math.max(30, Math.round(args.researchMinDays))),
      actorNotes: args.actorNotes?.trim().slice(0, 500) || undefined,
      updatedAt: nowIso(),
    } as Omit<Doc<"adSettings">, "_id" | "_creationTime">;
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, data);
    else await ctx.db.insert("adSettings", data);
  },
});

// ------------------------------------------------------------- Idea cards
//
// Before an ad is made, the owner is shown ideas in one line each and keeps
// or kills them. Four writers with different points of view are each asked on
// their own; near-copies are dropped in code; one more pass picks the best.
// Only kept ideas go on to be written, voiced and drawn.

/** How many kept ideas one press of Make turns into ads. The rest stay kept for the next press. */
const MAKE_AT_ONCE = 6;

/** What the idea writers are told: the competitor ads to build on, the photos to make ads from, and what the owner has gone for before. */
export const ideaBrief = internalQuery({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    const swipes = (await ctx.db.query("adSwipes").take(1000))
      .filter((x) => inTrade(x, trade) && x.hook.trim() && runDays(x) !== undefined && !(x.quality !== undefined && x.quality < 20))
      .sort((a, b) => (runDays(b) ?? 0) - (runDays(a) ?? 0))
      .slice(0, 14);
    const photos = (await ctx.db.query("adAssets").take(500)).filter((a) => a.kind === "photo" && inTrade(a, trade));
    const tagged = new Map<string, number>();
    for (const p of photos) for (const t of p.tags) tagged.set(t, (tagged.get(t) ?? 0) + 1);
    const library = photos.length
      ? [
          `${photos.length} photos in all: ${[...tagged].map(([t, n]) => `${n} tagged ${t}`).join(", ") || "none tagged"}.`,
          // The owner's best shots first, then the least used, so ideas lean on fresh photos and not the one pair.
          ...photos
            .filter((p) => p.description)
            .sort((a, b) => Number(!!b.best) - Number(!!a.best) || (a.uses ?? 0) - (b.uses ?? 0))
            .slice(0, 24)
            .map(
              (p) =>
                `${p.best ? "BEST · " : ""}${p.tags.join(", ") || "untagged"}${p.uses ? ` · in ${p.uses} ads` : ""}: ${p.description!.replace(/\s+/g, " ").slice(0, 160)}`,
            ),
        ]
      : [];
    const recent = (await ctx.db.query("adIdeas").order("desc").take(300))
      .filter((i) => inTrade(i, trade))
      .slice(0, 80)
      .map((i) => i.line);
    const taste = (await ctx.db.query("adTaste").order("desc").take(1))[0];
    return {
      sources: swipes.map((x, i) => ({ n: i + 1, swipeId: x._id, company: x.company, daysRunning: runDays(x), angle: x.hook, offer: x.offer })),
      library,
      recent,
      houseStyle: taste?.note,
    };
  },
});

/** Staff ask for a fresh set of ideas. */
export const ideasNow = mutation({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    const user = await requireSuperAdmin(ctx);
    if (!keys().anthropic) fail("INVALID", "Set ANTHROPIC_API_KEY on the deployment first");
    const newest = (await ctx.db.query("adIdeaRounds").order("desc").take(20)).find((r) => inTrade(r, trade));
    if (newest && newest.status === "writing" && Date.now() - new Date(newest.startedAt).getTime() < 10 * 60_000)
      fail("INVALID", "Ideas are already being written; they show here in a minute");
    await startIdeas(ctx, trade, user._id);
  },
});

async function startIdeas(ctx: MutationCtx, trade?: string, startedBy?: Id<"users">) {
  const slug = tradeOf(trade).slug;
  const roundId = await ctx.db.insert("adIdeaRounds", { trade: slug, startedAt: nowIso(), status: "writing", startedBy });
  await ctx.scheduler.runAfter(0, internal.ads.proposeIdeas, { roundId, trade: slug });
}

/** The same ask from outside the app (the deploy workflow), for a first set before anyone opens the page. */
export const openIdeas = internalMutation({ args: { trade: v.optional(v.string()) }, handler: async (ctx, { trade }) => await startIdeas(ctx, trade) });

const ideaRow = v.object({
  line: v.string(),
  opening: v.string(),
  family,
  scope: v.string(),
  swipeId: v.optional(v.id("adSwipes")),
  writer: v.string(),
});

export const saveIdeas = internalMutation({
  args: { roundId: v.id("adIdeaRounds"), ideas: v.array(ideaRow) },
  handler: async (ctx, { roundId, ideas }) => {
    const round = await ctx.db.get(roundId);
    if (!round) return;
    // Ideas nobody decided on give way to the new set (remembered, so they aren't offered again); kept ones stay until they are made.
    for (const old of await ctx.db
      .query("adIdeas")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .take(200))
      if (inTrade(old, round.trade)) await ctx.db.patch(old._id, { status: "passed" });
    for (const idea of ideas) await ctx.db.insert("adIdeas", { ...idea, trade: tradeOf(round.trade).slug, round: round.startedAt, status: "new", createdAt: nowIso() });
    await ctx.db.patch(roundId, { status: "ready", offered: ideas.length });
  },
});

export const noteIdeas = internalMutation({
  args: { roundId: v.id("adIdeaRounds"), notes: v.array(v.string()) },
  handler: async (ctx, { roundId, notes }) => {
    await ctx.db.patch(roundId, { notes: notes.map((n) => n.slice(0, 300)) });
  },
});

export const failIdeas = internalMutation({
  args: { roundId: v.id("adIdeaRounds"), error: v.string() },
  handler: async (ctx, { roundId, error }) => {
    await ctx.db.patch(roundId, { status: "failed", error: error.slice(0, 400) });
  },
});

/** Writes a set of ideas: each writer on its own, near-copies dropped, then the best picked. */
export const proposeIdeas = internalAction({
  args: { roundId: v.id("adIdeaRounds"), trade: v.optional(v.string()) },
  handler: async (ctx, { roundId, trade: slug }) => {
    const trade = tradeOf(slug);
    try {
      // What the last keeps and kills say goes into this set.
      await ctx.runAction(internal.ads.learnTaste, {}).catch(() => undefined);
      const cfg = await ctx.runQuery(internal.ads.config, {});
      const brief = await ctx.runQuery(internal.ads.ideaBrief, { trade: trade.slug });
      // Every idea is built on a competitor ad that has kept running; with none on file there is nothing to build on.
      if (brief.sources.length === 0) {
        await ctx.runMutation(internal.ads.failIdeas, {
          roundId,
          error: `No ${trade.label.toLowerCase()} competitor ads on file yet, so there is nothing to build ideas on. Run the competitor search first.`,
        });
        return;
      }
      const town = cfg.researchMarkets[0] ?? "your town";
      // One writer at a time, so four long answers never ask for more at once than the key allows; a writer
      // whose answer errors or can't be read is asked once more. What each gave is kept with the round.
      const errors: string[] = [];
      const notes: string[] = [];
      const perWriter: IdeaDraft[][] = [];
      for (const writer of IDEA_WRITERS) {
        const prompt = ideaPrompt(writer, cfg.brand.name, town, brief.sources, brief.library, brief.houseStyle, brief.recent, trade);
        let got: IdeaDraft[] = [];
        let why = "";
        for (let attempt = 0; attempt < 2 && got.length === 0; attempt++) {
          try {
            const reply = await claudeReply([{ type: "text", text: prompt }], SHOT_LIST_TOKENS);
            got = ideasFrom(reply.text, writer.key, brief.sources, trade);
            if (got.length === 0) why = reply.cutOff ? "the answer was cut off" : `nothing usable in the answer, which began "${reply.text.replace(/\s+/g, " ").trim().slice(0, 80)}"`;
          } catch (e) {
            why = errText(e).slice(0, 160);
            errors.push(why);
          }
        }
        notes.push(`${writer.key}: ${got.length ? `${got.length} ideas` : why}`);
        perWriter.push(got);
      }
      // Taken in turn from each writer, so dropping near-copies doesn't always favour the first.
      const inTurn: IdeaDraft[] = [];
      for (let turn = 0; perWriter.some((list) => list.length > turn); turn++) for (const list of perWriter) if (list[turn]) inTurn.push(list[turn]);
      const distinct = dropNearCopies(inTurn, brief.recent);
      await ctx.runMutation(internal.ads.noteIdeas, { roundId, notes });
      if (distinct.length === 0) throw new Error(errors[0] ?? "No usable ideas came back. Ask again.");
      let picks: string | null = null;
      if (distinct.length > IDEAS_SHOWN)
        picks = await claude([{ type: "text", text: criticPrompt(distinct, cfg.brand.name, town, IDEAS_SHOWN, brief.houseStyle, trade) }], 300).catch(() => null);
      const chosen = pickIdeas(distinct, picks, IDEAS_SHOWN);
      await ctx.runMutation(internal.ads.saveIdeas, {
        roundId,
        ideas: chosen.map((i) => ({
          line: i.line,
          opening: i.opening,
          family: i.family,
          scope: i.scope,
          writer: i.writer,
          swipeId: brief.sources.find((s: { n: number }) => s.n === i.from)?.swipeId,
        })),
      });
    } catch (e) {
      await ctx.runMutation(internal.ads.failIdeas, { roundId, error: errText(e) });
    }
  },
});

/** The idea cards: the ones waiting on a decision and the ones kept, with how the last ask went and what has been learned. */
export const listIdeas = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    const round = (await ctx.db.query("adIdeaRounds").order("desc").take(20)).find((r) => inTrade(r, trade));
    const rows = [
      ...(await ctx.db
        .query("adIdeas")
        .withIndex("by_status", (q) => q.eq("status", "new"))
        .take(200)),
      ...(await ctx.db
        .query("adIdeas")
        .withIndex("by_status", (q) => q.eq("status", "kept"))
        .take(200)),
    ].filter((i) => inTrade(i, trade));
    const ideas = [];
    for (const i of rows) {
      const x = i.swipeId ? await ctx.db.get(i.swipeId) : null;
      ideas.push({
        id: i._id,
        line: i.line,
        opening: i.opening,
        familyLabel: FAMILY_LABELS[i.family],
        scope: i.scope,
        status: i.status as "new" | "kept",
        note: i.note,
        basedOn: x ? { company: x.company, daysRunning: runDays(x), offer: x.offer } : undefined,
      });
    }
    const taste = (await ctx.db.query("adTaste").order("desc").take(1))[0];
    return {
      round: round ? { status: round.status, error: round.error, startedAt: round.startedAt } : null,
      ideas,
      taste: taste?.note,
    };
  },
});

/** The cards as read from outside the app: how the last ask went and every idea waiting or kept. */
export const ideasOutside = internalQuery({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    const round = (await ctx.db.query("adIdeaRounds").order("desc").take(20)).find((r) => inTrade(r, trade));
    const out = [];
    for (const status of ["new", "kept"] as const)
      for (const i of await ctx.db
        .query("adIdeas")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(200)) {
        if (!inTrade(i, trade)) continue;
        const x = i.swipeId ? await ctx.db.get(i.swipeId) : null;
        out.push({ id: i._id, status, opening: i.opening, line: i.line, scope: i.scope, family: FAMILY_LABELS[i.family], writer: i.writer, builtOn: x ? `${x.company}, ${runDays(x) ?? "?"} days` : undefined });
      }
    return { round: round ? { status: round.status, error: round.error, offered: round.offered, writers: round.notes } : null, ideas: out };
  },
});

/** Keep or kill an idea, or put it back to undecided. */
export const decideIdea = mutation({
  args: { id: v.id("adIdeas"), status: v.union(v.literal("kept"), v.literal("killed"), v.literal("new")) },
  handler: async (ctx, { id, status }) => {
    await requireSuperAdmin(ctx);
    const idea = await ctx.db.get(id);
    if (!idea) fail("NOT_FOUND", "That idea is gone");
    if (idea.status === "made") fail("INVALID", "That idea has already been made into an ad");
    if (idea.status === "passed") fail("NOT_FOUND", "That idea has been replaced by a newer set");
    await ctx.db.patch(id, { status, decidedAt: nowIso(), note: undefined });
  },
});

/** Turns the kept ideas into ads: each becomes a hook of its own and goes down the usual path (script, voice, render). */
/** Turns ideas into the hooks their ads are made from, and marks them made. */
async function hooksFor(ctx: MutationCtx, ideas: Doc<"adIdeas">[]): Promise<Id<"adHooks">[]> {
  const only: Id<"adHooks">[] = [];
  for (const idea of ideas) {
    // Off, so Monday's own run never picks it up a second time.
    const hookId =
      idea.hookId ??
      (await ctx.db.insert("adHooks", {
        family: idea.family,
        scope: idea.scope,
        trade: tradeOf(idea.trade).slug,
        textEn: idea.line,
        opening: idea.opening,
        active: false,
        uses: 0,
        wins: 0,
        losses: 0,
        createdAt: nowIso(),
        swipeId: idea.swipeId,
      }));
    await ctx.db.patch(idea._id, { status: "made", hookId, note: undefined });
    only.push(hookId);
  }
  return only;
}

/**
 * An ad about one job, from the deployment: the photo it is about leads, and it is written, like every ad, on the
 * competitor ad that has run longest for that kind of job. The words are the writer's; `line` only says what to show.
 */
export const makeFromPhoto = internalMutation({
  args: { assetId: v.id("adAssets"), line: v.string(), opening: v.optional(v.string()), scope: v.optional(v.string()) },
  handler: async (ctx, { assetId, line, opening, scope }) => {
    const asset = await ctx.db.get(assetId);
    if (!asset) fail("NOT_FOUND", "That photo isn't in the library");
    const trade = tradeOf(asset.trade);
    const kind = scope ?? asset.tags.find((t) => trade.scopes.includes(t)) ?? ANY_SCOPE;
    const onFile = (await ctx.db.query("adSwipes").take(1000)).filter((x) => inTrade(x, trade.slug) && x.hook.trim());
    const swipe = pickExamples(onFile, kind, 1)[0];
    if (!swipe) fail("INVALID", `No ${trade.label.toLowerCase()} competitor ad on file to build it on`);
    const hookId = await ctx.db.insert("adHooks", {
      family: "before_after",
      scope: kind,
      trade: trade.slug,
      textEn: line.trim().slice(0, 220),
      ...(opening ? { opening: opening.trim().slice(0, 120) } : {}),
      active: false,
      uses: 0,
      wins: 0,
      losses: 0,
      createdAt: nowIso(),
      swipeId: swipe._id,
      photoId: assetId,
    });
    await ctx.scheduler.runAfter(0, internal.ads.weeklyRun, { force: true, only: [hookId], trade: trade.slug });
    return { hookId, scope: kind, builtOn: swipe.company };
  },
});

// ── "Make an ad for…" ──────────────────────────────────────────────────────────
// One line from the owner ("cabinet painting in Odessa"), from Ops → Ads or from Claude, becomes a few versions of
// the same offer: a story and a lesson, each built on a different competitor ad, and a quick offer on the story's
// job, in both sizes. They wait in Ops → Ads like any other, and /ads/<token> shows them being made, with no login.

/** The private page for one request. */
// On the backend's own address, not the app's: the app's preview address asks for a Vercel sign-in.
const requestLink = (token: string) => `${apiOrigin()}/ads/${token}`;

async function startRequest(ctx: MutationCtx, ask: string, startedBy?: Id<"users">) {
  const clean = ask.replace(/\s+/g, " ").trim().slice(0, 300);
  if (clean.length < 3) fail("INVALID", "Say what the ad is for, like \"cabinet painting in Odessa\"");
  const token = randomToken(24);
  const requestId = await ctx.db.insert("adRequests", { ask: clean, token, status: "reading", createdAt: nowIso(), ...(startedBy ? { startedBy } : {}) });
  await ctx.scheduler.runAfter(0, internal.ads.readRequest, { requestId });
  return { requestId, link: requestLink(token) };
}

/** "Make an ad for…" from Ops → Ads. */
export const makeFor = mutation({
  args: { ask: v.string() },
  handler: async (ctx, { ask }) => {
    const user = await requireStaff(ctx);
    const { link } = await startRequest(ctx, ask, user._id);
    return { link };
  },
});

/** The same, from the deployment: what Claude runs when the owner asks it for an ad. */
export const makeForInternal = internalMutation({
  args: { ask: v.string() },
  handler: async (ctx, { ask }) => ({ link: (await startRequest(ctx, ask)).link }),
});

export const requestRow = internalQuery({
  args: { requestId: v.id("adRequests") },
  handler: async (ctx, { requestId }) => await ctx.db.get(requestId),
});

export const failRequest = internalMutation({
  args: { requestId: v.id("adRequests"), error: v.string() },
  handler: async (ctx, { requestId, error }) => {
    await ctx.db.patch(requestId, { status: "failed", error: error.slice(0, 400) });
  },
});

/** Reads the line: which trade, which kind of job, which town, and what the ad offers. */
export const readRequest = internalAction({
  args: { requestId: v.id("adRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.runQuery(internal.ads.requestRow, { requestId });
    if (!request || request.status !== "reading") return;
    try {
      const cfg = await ctx.runQuery(internal.ads.config, {});
      const trades = Object.values(AD_TRADES);
      // The jobs on file, by the owner's names, so "from the Smith kitchen" finds its photos.
      const jobs: Array<{ id: Id<"adJobs">; name: string; trade: string }> = await ctx.runQuery(internal.ads.jobNames, {});
      const reply = await claude(
        [{ type: "text", text: requestPrompt(request.ask, cfg.brand.name, cfg.researchMarkets, trades, jobs.map((j) => j.name)) }],
        500,
      );
      const read = readRequestReply(reply, trades, jobs.length);
      if (!read) throw new Error(`Couldn't tell which kind of job that is. Name it, like "cabinet painting in Odessa" or "paver patio in Midland".`);
      const { job, ...rest } = read;
      const named = job !== undefined ? jobs[job] : undefined;
      // The owner's job names stay private: never in the idea the writer and the page are given.
      const trade = tradeOf(named?.trade ?? rest.trade);
      rest.idea = withoutJobNames(rest.idea, jobs.map((j) => j.name)) || `We do ${trade.label.toLowerCase()} for homeowners, with a free quote.`;
      // A job named is made in its own trade, whatever trade the line sounded like.
      await ctx.runMutation(internal.ads.startRequestAds, { requestId, ...rest, ...(named ? { trade: named.trade, jobId: named.id } : {}) });
    } catch (e) {
      await ctx.runMutation(internal.ads.failRequest, { requestId, error: errText(e) });
    }
  },
});

/** Builds the request's ideas on the competitor ads that fit it best and sends them to be written. */
export const startRequestAds = internalMutation({
  args: { requestId: v.id("adRequests"), trade: v.string(), scope: v.string(), town: v.optional(v.string()), idea: v.string(), jobId: v.optional(v.id("adJobs")) },
  handler: async (ctx, { requestId, trade: slug, scope, town, idea, jobId }) => {
    const trade = tradeOf(slug);
    const onFile = (await ctx.db.query("adSwipes").take(1000)).filter((x) => inTrade(x, trade.slug) && x.hook.trim());
    const { story, lesson } = pickRequestSwipes(onFile, scope);
    if (!story) {
      await ctx.db.patch(requestId, { status: "failed", trade: trade.slug, scope, town, idea, error: `No ${trade.label.toLowerCase()} competitor ads on file to build it on yet.` });
      return;
    }
    const hook = async (family: Family, swipe: Doc<"adSwipes">) =>
      await ctx.db.insert("adHooks", {
        family,
        scope,
        trade: trade.slug,
        textEn: idea,
        // Off, so the weekly run never picks it up a second time.
        active: false,
        uses: 0,
        wins: 0,
        losses: 0,
        createdAt: nowIso(),
        swipeId: swipe._id,
      });
    const hookIds = [await hook("before_after", story), ...(lesson ? [await hook("education", lesson)] : [])];
    // Used now: the next request takes the next of the best few.
    for (const x of [story, lesson]) if (x) await ctx.db.patch(x._id, { lastUsedAt: nowIso() });
    await ctx.db.patch(requestId, { status: "made", trade: trade.slug, scope, idea, hookIds, ...(town ? { town } : {}), ...(jobId ? { jobId } : {}) });
    await ctx.scheduler.runAfter(0, internal.ads.weeklyRun, { force: true, only: hookIds, trade: trade.slug, requestId, town, quickToo: true, ...(jobId ? { jobId } : {}) });
  },
});

/** One request for its private page: what was asked, how far it has got, and each ad as it comes. No login: the long token is the key. */
export const requestView = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => await requestViewOf(ctx, token),
});

/** The same, for the page the backend serves itself at /ads/<token> (lib/adRoutes.ts). */
export const requestPage = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => await requestViewOf(ctx, token),
});

/** A failure as the owner reads it: a service that didn't answer is said plainly, the rest as it is. */
const plainError = (error?: string) =>
  error && /error sending request|fetch failed|timed out|ECONNRESET|network/i.test(error)
    ? "The writing service didn't answer just then. Ask again in a minute."
    : error;

async function requestViewOf(ctx: QueryCtx, token: string) {
  if (token.length < 20) return null;
  const request = await ctx.db
    .query("adRequests")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!request) return null;
  const batch = await ctx.db
    .query("adBatches")
    .withIndex("by_request", (q) => q.eq("requestId", request._id))
    .first();
  const rows = batch
    ? (
        await ctx.db
          .query("adCreatives")
          .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
          .collect()
      ).filter((c) => c.status !== "rejected")
    : [];
  const ads = await Promise.all(
    rows.map(async (c) => {
      const hook = await ctx.db.get(c.hookId);
      const source = hook?.swipeId ? await ctx.db.get(hook.swipeId) : null;
      const file = c.videoStorageId ? await ctx.storage.getUrl(c.videoStorageId) : c.imageStorageId ? await ctx.storage.getUrl(c.imageStorageId) : null;
      return {
        name: c.name,
        angle: c.design ? ANGLE_LABELS[angleOf(c.design)] : "Ad",
        ratio: c.ratio,
        image: Boolean(c.imageStorageId && !c.videoStorageId),
        status: c.status,
        file,
        headline: c.script.headline,
        lines: (c.script.shots ?? []).map((x) => x.voice).filter(Boolean),
        primaryText: c.script.primaryText,
        builtOn: source ? { company: source.company, daysRunning: runDays(source) } : undefined,
      };
    }),
  );
  return {
    ask: request.ask,
    idea: request.idea,
    town: request.town,
    trade: request.trade ? tradeOf(request.trade).label : undefined,
    stage: requestStage(request, batch, rows),
    error: plainError(request.error ?? batch?.error),
    skipped: batch?.skipped ?? [],
    createdAt: request.createdAt,
    ads,
  };
}

/** The latest requests, for Ops → Ads: what was asked, how far it got, and its link. */
export const recentRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("adRequests").order("desc").take(8);
    return await Promise.all(
      rows.map(async (r) => {
        const batch = await ctx.db
          .query("adBatches")
          .withIndex("by_request", (q) => q.eq("requestId", r._id))
          .first();
        const ads = batch
          ? await ctx.db
              .query("adCreatives")
              .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
              .collect()
          : [];
        return { ask: r.ask, createdAt: r.createdAt, stage: requestStage(r, batch, ads), link: requestLink(r.token) };
      }),
    );
  },
});

/** How many ads wait to be drawn, so the scheduled renderer can stop at once when there are none. */
export const waitingCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const voiced = await ctx.db
      .query("adCreatives")
      .withIndex("by_status", (q) => q.eq("status", "voiced"))
      .take(50);
    const stale = (
      await ctx.db
        .query("adCreatives")
        .withIndex("by_status", (q) => q.eq("status", "rendering"))
        .take(50)
    ).filter((c) => !c.renderStartedAt || Date.now() - new Date(c.renderStartedAt).getTime() > RENDER_STALE_MS);
    return voiced.length + stale.length;
  },
});

/**
 * Makes ads from the ideas named, from the deployment: for when the owner asks for some to be chosen for them.
 * Only ideas still on offer (new or kept) of one trade; the rest of the set is left as it is.
 */
export const makeIdeas = internalMutation({
  args: { ids: v.array(v.id("adIdeas")) },
  handler: async (ctx, { ids }) => {
    const ideas = (await Promise.all(ids.slice(0, MAKE_AT_ONCE).map((id) => ctx.db.get(id)))).filter(
      (i): i is Doc<"adIdeas"> => i !== null && (i.status === "new" || i.status === "kept"),
    );
    if (ideas.length === 0) return { made: 0 };
    const trade = tradeOf(ideas[0].trade).slug;
    const same = ideas.filter((i) => tradeOf(i.trade).slug === trade);
    const only = await hooksFor(ctx, same);
    await ctx.scheduler.runAfter(0, internal.ads.weeklyRun, { force: true, only, trade });
    return { made: same.length, trade, lines: same.map((i) => i.line) };
  },
});

export const makeKept = mutation({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    const user = await requireSuperAdmin(ctx);
    const k = keys();
    if (!k.anthropic || !k.elevenlabs) fail("INVALID", "Set ANTHROPIC_API_KEY and ELEVENLABS_API_KEY on the deployment first");
    const newest = (await ctx.db.query("adBatches").order("desc").take(1))[0];
    if (newest && newest.status === "drafting" && Date.now() - new Date(newest.createdAt).getTime() < 30 * 60_000)
      fail("INVALID", "A batch is already drafting; it shows under This week as each piece finishes");
    const kept = (
      await ctx.db
        .query("adIdeas")
        .withIndex("by_status", (q) => q.eq("status", "kept"))
        .take(200)
    )
      .filter((i) => inTrade(i, trade))
      .slice(0, MAKE_AT_ONCE);
    if (kept.length === 0) fail("INVALID", "Keep at least one idea first");
    const only = await hooksFor(ctx, kept);
    await ctx.scheduler.runAfter(0, internal.ads.weeklyRun, { startedBy: user._id, force: true, only, trade: tradeOf(trade).slug });
    await ctx.scheduler.runAfter(0, internal.ads.learnTaste, {});
    return kept.length;
  },
});

/** An idea whose ad couldn't be made goes back to kept, with the reason on the card. */
export const ideaNotMade = internalMutation({
  args: { hookId: v.id("adHooks"), why: v.string() },
  handler: async (ctx, { hookId, why }) => {
    const idea = (
      await ctx.db
        .query("adIdeas")
        .withIndex("by_status", (q) => q.eq("status", "made"))
        .take(500)
    ).find((i) => i.hookId === hookId);
    if (idea) await ctx.db.patch(idea._id, { status: "kept", note: why.slice(0, 300) });
  },
});

export const tasteInputs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const lines = async (status: "kept" | "made" | "killed") =>
      (
        await ctx.db
          .query("adIdeas")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .take(40)
      ).map((i) => `${i.line} Opens: "${i.opening}"`);
    const taste = (await ctx.db.query("adTaste").order("desc").take(1))[0];
    return { kept: [...(await lines("kept")), ...(await lines("made"))].slice(0, 40), killed: await lines("killed"), taste };
  },
});

export const saveTaste = internalMutation({
  args: { note: v.string(), kept: v.number(), killed: v.number() },
  handler: async (ctx, args) => {
    const row = (await ctx.db.query("adTaste").order("desc").take(1))[0];
    const data = { ...args, note: args.note.slice(0, 900), writtenAt: nowIso() };
    if (row) await ctx.db.patch(row._id, data);
    else await ctx.db.insert("adTaste", data);
  },
});

/** Reads the keeps and kills and writes a short note on the owner's taste, once there is something new to go on. */
export const learnTaste = internalAction({
  args: {},
  handler: async (ctx) => {
    const { kept, killed, taste } = await ctx.runQuery(internal.ads.tasteInputs, {});
    if (kept.length + killed.length < 3 || (taste && taste.kept === kept.length && taste.killed === killed.length)) return;
    const note = parseJson<{ note?: string }>(await claude([{ type: "text", text: tastePrompt(kept, killed, taste?.note) }], 400))?.note?.trim();
    if (note) await ctx.runMutation(internal.ads.saveTaste, { note, kept: kept.length, killed: killed.length });
  },
});

// ------------------------------------------------------- Batches and ads

async function creativeView(ctx: QueryCtx, c: Doc<"adCreatives">, hooks: Map<string, Doc<"adHooks">>) {
  const hook = hooks.get(c.hookId);
  const shots = [];
  for (const s of c.script.shots ?? []) {
    const a = await ctx.db.get(s.assetId);
    shots.push({ fileName: a?.fileName ?? "removed from the library", voice: s.voice, onScreen: s.onScreen, start: s.start, end: s.end });
  }
  return {
    shots,
    id: c._id,
    batchId: c.batchId,
    name: c.name,
    ratio: c.ratio,
    status: c.status,
    error: c.error,
    script: c.script,
    hook: hook
      ? {
          id: hook._id,
          family: hook.family,
          familyLabel: FAMILY_LABELS[hook.family],
          scope: hook.scope,
          textEn: hook.textEn,
          // The competitor ad this one is built around, when the idea came from the research.
          basedOn: await sourceOf(ctx, hook),
        }
      : null,
    kind: c.kind ?? ("video" as AdKind),
    // How it moves; none on ads from before they were drawn with Remotion.
    style: c.design ? { id: c.design.style, label: designLabel(c.design) } : undefined,
    videoUrl: c.videoStorageId ? ((await ctx.storage.getUrl(c.videoStorageId)) ?? undefined) : undefined,
    imageUrl: c.imageStorageId ? ((await ctx.storage.getUrl(c.imageStorageId)) ?? undefined) : undefined,
    meta: c.meta,
    // The voice actor's order, while it is out and after.
    actor: c.actor ? { orderedAt: c.actor.orderedAt, price: c.actor.price, test: c.actor.test } : undefined,
    // An on-camera creator's take, when one was added.
    presenter: c.presenter ? { addedAt: c.presenter.addedAt } : undefined,
    week: c.week,
    baselineCtr: c.baselineCtr,
    fatigued: c.week ? isFatigued({ frequency: c.week.frequency, ctr: c.week.ctr, baselineCtr: c.baselineCtr ?? null }) : false,
    createdAt: c.createdAt,
    activatedAt: c.activatedAt,
    retiredAt: c.retiredAt,
    suggestRetire: c.suggestRetire,
  };
}

/** The last few weeks' batches with their creatives, newest first. */
/** How many batches Ops → Ads lists: the newest, then the older ones still holding an ad that wasn't rejected. */
const BATCHES_SHOWN = 20;

export const batches = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    const recent = (await ctx.db.query("adBatches").order("desc").take(100)).filter((b) => inTrade(b, trade));
    // The newest batch always shows, so a failed or empty run says why. Older ones show while they still hold an ad
    // that hasn't been rejected: a run of remakes never pushes the ads waiting for review off the page.
    const rows: typeof recent = [];
    for (const [i, b] of recent.entries()) {
      if (rows.length >= BATCHES_SHOWN) break;
      if (i === 0) {
        rows.push(b);
        continue;
      }
      const made = await ctx.db
        .query("adCreatives")
        .withIndex("by_batch", (q) => q.eq("batchId", b._id))
        .collect();
      if (made.some((c) => c.status !== "rejected")) rows.push(b);
    }
    const hooks = new Map((await ctx.db.query("adHooks").take(500)).map((h) => [h._id as string, h]));
    return await Promise.all(
      rows.map(async (b) => ({
        id: b._id,
        weekOf: b.weekOf,
        status: b.status,
        error: b.error,
        summary: b.summary,
        skipped: b.skipped ?? [],
        createdAt: b.createdAt,
        creatives: await Promise.all(
          (
            await ctx.db
              .query("adCreatives")
              .withIndex("by_batch", (q) => q.eq("batchId", b._id))
              .collect()
          ).map((c) => creativeView(ctx, c, hooks)),
        ),
      })),
    );
  },
});

/** Ads that are live or paused in Meta (and the last month's retired ones), with Meta's numbers and what came through intake. */
export const live = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rows = (await ctx.db.query("adCreatives").order("desc").take(400)).filter(
      (c) => c.status === "live" || c.status === "paused" || (c.status === "retired" && (c.retiredAt ?? "") >= monthAgo),
    );
    const hooks = new Map((await ctx.db.query("adHooks").take(500)).map((h) => [h._id as string, h]));
    // What each ad brought in: intake rows name the ad as Meta sent it.
    const leads = (await ctx.db.query("intakeLeads").order("desc").take(3000)).filter((l) => l.adName);
    const byAd = new Map<string, { leads: number; confirmed: number; sold: number; revenueCents: number }>();
    for (const l of leads) {
      const row = byAd.get(l.adName!) ?? { leads: 0, confirmed: 0, sold: 0, revenueCents: 0 };
      row.leads += 1;
      if (l.status === "confirmed") row.confirmed += 1;
      if (l.confirmedLeadId) {
        const m = await ctx.db.get(l.confirmedLeadId);
        // "assigned": sold to a company, at priceCents.
        if (m && m.status === "assigned") {
          row.sold += 1;
          row.revenueCents += m.priceCents ?? 0;
        }
      }
      byAd.set(l.adName!, row);
    }
    return await Promise.all(
      rows.map(async (c) => ({
        ...(await creativeView(ctx, c, hooks)),
        intake: byAd.get(c.name) ?? { leads: 0, confirmed: 0, sold: 0, revenueCents: 0 },
      })),
    );
  },
});

/**
 * Whether Monday can draft, check by check. The hard checks stop a batch;
 * the soft ones only change what it can do (no Meta: renders wait here).
 */
async function readinessChecks(ctx: QueryCtx) {
  const k = keys();
  const row = await settingsRow(ctx);
  const assets = await ctx.db.query("adAssets").take(500);
  const tagged = assets.filter((a) => a.tags.some((t) => ["cabinets", "interior", "exterior"].includes(t))).length;
  const hooks = (
    await ctx.db
      .query("adHooks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect()
  ).length;
  const playbooks = (await ctx.db.query("adPlaybooks").take(20)).length;
  const meta = Boolean((k.meta || row?.metaTokenEnc) && row?.adAccountId && row?.pageId && row?.adsetId);
  // A voice actor's read is still timed by ElevenLabs (speech-to-text), so its key is needed either way.
  const actor = row?.voiceSource === "actor";
  const missingKeys = [
    k.anthropic ? "" : "ANTHROPIC_API_KEY",
    k.elevenlabs ? "" : "ELEVENLABS_API_KEY",
    actor && !k.bunny ? "BUNNY_STUDIO_TOKEN" : "",
  ].filter(Boolean);
  return [
    {
      key: "keys",
      label: "Services",
      ok: missingKeys.length === 0,
      hard: true,
      tab: "settings",
      detail: missingKeys.length
        ? `Set ${missingKeys.join(", ")} on the deployment`
        : actor
          ? "Claude, ElevenLabs and Bunny Studio are set: a voice actor reads each ad"
          : "Claude and ElevenLabs are set",
    },
    {
      key: "library",
      label: "Library",
      ok: assets.length >= 3 && tagged > 0,
      hard: true,
      tab: "library",
      detail:
        assets.length < 3
          ? `${assets.length} of at least 3 files`
          : tagged === 0
            ? "Nothing tagged cabinets, interior or exterior"
            : `${assets.length} files, ${tagged} tagged by room`,
    },
    { key: "hooks", label: "Hooks", ok: hooks >= 2, hard: true, tab: "hooks", detail: hooks >= 2 ? `${hooks} active` : `${hooks} active, need 2` },
    {
      key: "playbook",
      label: "What works",
      ok: playbooks > 0,
      hard: false,
      tab: "swipes",
      detail: playbooks > 0 ? `${playbooks} written` : "None yet: load or search competitor ads",
    },
    {
      key: "renderer",
      label: "Drawing the videos",
      ok: k.renderer,
      hard: false,
      tab: "settings",
      detail: k.renderer ? "Videos are drawn as soon as a batch is voiced" : "No ADS_RENDER_TOKEN yet: ads wait as Waiting to render until the renderer is started",
    },
    {
      key: "meta",
      label: "Meta account",
      ok: meta,
      hard: false,
      tab: "settings",
      detail: meta ? "Ads go to Meta paused" : "Token, ad account, page and ad set needed; until then renders wait here",
    },
  ];
}

export const readiness = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await readinessChecks(ctx);
  },
});

export const readinessState = internalQuery({ args: {}, handler: async (ctx) => await readinessChecks(ctx) });

/** "Draft now": this week's batch, without waiting for Monday. */
export const draftNow = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireSuperAdmin(ctx);
    const k = keys();
    if (!k.anthropic || !k.elevenlabs) fail("INVALID", "Set ANTHROPIC_API_KEY and ELEVENLABS_API_KEY on the deployment first");
    const newest = (await ctx.db.query("adBatches").order("desc").take(1))[0];
    if (newest && newest.status === "drafting" && Date.now() - new Date(newest.createdAt).getTime() < 30 * 60_000)
      fail("INVALID", "A batch is already drafting; it shows under This week as each piece finishes");
    await ctx.scheduler.runAfter(0, internal.ads.weeklyRun, { startedBy: user._id, force: true });
  },
});

async function setStatus(ctx: MutationCtx, id: Id<"adCreatives">, status: Doc<"adCreatives">["status"], extra: Partial<Doc<"adCreatives">> = {}) {
  const c = await ctx.db.get(id);
  if (c === null) fail("NOT_FOUND", "That ad is gone");
  await ctx.db.patch(id, { status, ...extra });
  return c;
}

/** Turns a paused ad on in Meta. */
export const activate = mutation({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const c = await ctx.db.get(id);
    if (c === null) fail("NOT_FOUND", "That ad is gone");
    if (!c.meta?.adId) fail("INVALID", "This one isn't in Meta yet (no ad id), so it can't go live from here");
    await ctx.db.patch(id, { status: "live", activatedAt: nowIso(), error: undefined });
    await ctx.scheduler.runAfter(0, internal.ads.setAdStatus, { id, status: "ACTIVE" });
  },
});

/** Pauses a live ad in Meta. Its hook is scored from the daily numbers (scoreHooks), not from this. */
export const retire = mutation({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const c = await setStatus(ctx, id, "retired", { retiredAt: nowIso(), suggestRetire: undefined });
    if (c.meta?.adId) await ctx.scheduler.runAfter(0, internal.ads.setAdStatus, { id, status: "PAUSED" });
  },
});

/** A week with this many impressions is enough to judge an ad by. */
const SCORE_IMPRESSIONS = 1000;

/**
 * Hooks learn on their own: once an ad has a week with enough impressions,
 * it wins or loses against the median click-through of its batch mates
 * that also have a week. Each ad is scored once.
 */
export const scoreHooks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("adCreatives").take(1000)).filter((c) => c.week && c.week.impressions >= SCORE_IMPRESSIONS);
    const byBatch = new Map<string, typeof rows>();
    for (const c of rows) byBatch.set(c.batchId, [...(byBatch.get(c.batchId) ?? []), c]);
    let scored = 0;
    for (const c of rows) {
      if (c.scoredAt) continue;
      const mates = (byBatch.get(c.batchId) ?? []).filter((m) => m._id !== c._id);
      if (mates.length === 0) continue;
      const ctrs = mates.map((m) => m.week!.ctr).sort((a, b) => a - b);
      const median = ctrs[Math.floor(ctrs.length / 2)];
      const hook = await ctx.db.get(c.hookId);
      if (hook) await ctx.db.patch(hook._id, c.week!.ctr >= median ? { wins: hook.wins + 1 } : { losses: hook.losses + 1 });
      await ctx.db.patch(c._id, { scoredAt: nowIso() });
      scored += 1;
    }
    return scored;
  },
});

/** Over the live target: the weakest live ad (lowest week click-through, enough impressions) is marked "retire?". Nothing is paused by itself. */
export const rankLive = internalMutation({
  args: {},
  handler: async (ctx) => {
    const target = (await settingsRow(ctx))?.liveTarget ?? DEFAULTS.liveTarget;
    const live = await ctx.db
      .query("adCreatives")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .collect();
    const judged = live.filter((c) => c.week && c.week.impressions >= SCORE_IMPRESSIONS).sort((a, b) => a.week!.ctr - b.week!.ctr);
    const weakest = live.length > target && judged.length > 0 ? judged[0] : null;
    for (const c of live) {
      const reason =
        weakest && c._id === weakest._id
          ? `${live.length} live, the target is ${target}; this one has the lowest click-through this week`
          : undefined;
      if ((c.suggestRetire ?? undefined) !== reason) await ctx.db.patch(c._id, { suggestRetire: reason });
    }
    return weakest?._id ?? null;
  },
});

/** A draft the reviewer doesn't want: left paused in Meta, never shown as a candidate again. */
/**
 * Pulls every ad that hasn't gone live, so none can be approved by mistake. For when what the ads say has changed
 * under them (the homeowner brand was renamed): each is rejected, its words and files kept. Live and retired ads
 * are left alone.
 */
export const pullUnpublished = internalMutation({
  // `names`: only these ads, so one trade's ads can be pulled and another's left waiting for review.
  args: { names: v.optional(v.array(v.string())) },
  handler: async (ctx, { names }) => {
    const pulled: string[] = [];
    const inMeta: string[] = [];
    // The ideas the pulled ads were made from, so one can be made again (weeklyRun's `only`).
    const hooks = new Set<Id<"adHooks">>();
    for (const c of await ctx.db.query("adCreatives").take(2000)) {
      if (c.status === "live" || c.status === "retired" || c.status === "rejected" || c.status === "failed") continue;
      if (names && !names.includes(c.name)) continue;
      // One already created in Meta is retired there by a person, not orphaned from here.
      if (c.meta?.adId) {
        inMeta.push(c.name);
        continue;
      }
      await ctx.db.patch(c._id, { status: "rejected" });
      pulled.push(c.name);
      hooks.add(c.hookId);
    }
    return { pulled, leftInMeta: inMeta, hooks: [...hooks] };
  },
});

export const reject = mutation({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    await setStatus(ctx, id, "rejected");
  },
});

// ------------------------------------------------- The weekly run (internal)

export const config = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await settingsRow(ctx);
    return {
      brand: {
        name: consumerBrand(),
        primaryColor: row?.primaryColor ?? "#336699",
        accentColor: row?.accentColor ?? "#8fb6e0",
        markets: research(row).researchMarkets,
      },
      liveTarget: row?.liveTarget ?? DEFAULTS.liveTarget,
      adAccountId: row?.adAccountId,
      pageId: row?.pageId,
      leadFormId: row?.leadFormId,
      adsetId: row?.adsetId,
      voiceId: row?.voiceId,
      ...actorSettings(row),
      weeklyEnabled: row?.weeklyEnabled ?? DEFAULTS.weeklyEnabled,
      hooksPerWeek: row?.hooksPerWeek ?? DEFAULTS.hooksPerWeek,
      quickOffer: row?.quickOffer ?? true,
      tesseractFootage: row?.tesseractFootage ?? true,
      ...research(row),
    };
  },
});

/** What this week can draw on: the eligible hooks in order, and the library with what Claude needs to see each asset. */
export const plan = internalQuery({
  // `only`: these hooks, in this order, whether or not they are switched on (the ideas the owner kept).
  args: { hooksPerWeek: v.number(), only: v.optional(v.array(v.id("adHooks"))), trade: v.optional(v.string()) },
  handler: async (ctx, { hooksPerWeek, only, trade }) => {
    const liveFamilies = new Set<Family>();
    const liveAds = await ctx.db
      .query("adCreatives")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .collect();
    for (const c of liveAds) {
      const h = await ctx.db.get(c.hookId);
      if (h) liveFamilies.add(h.family);
    }
    const chosen = only ? (await Promise.all(only.map((id) => ctx.db.get(id)))).filter((h): h is Doc<"adHooks"> => h !== null) : null;
    const active =
      chosen ??
      (
        await ctx.db
          .query("adHooks")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect()
      ).filter((h) => inTrade(h, trade));
    // Each idea with the competitor ad it is built around: its own, or else the best one on file for its kind of job.
    // Every ad is written from a competitor ad that has kept running, so an idea with none to stand on isn't made.
    const onFile = (await ctx.db.query("adSwipes").take(1000)).filter((x) => inTrade(x, trade) && x.hook.trim());
    const sources = new Map<string, Doc<"adSwipes">>();
    const own = new Set<string>();
    for (const h of active) {
      const x = h.swipeId ? await ctx.db.get(h.swipeId) : null;
      if (x) own.add(h._id);
      const best = x ?? pickExamples(onFile, h.scope, 1)[0];
      if (best) sources.set(h._id, best);
    }
    // Ideas taken from a competitor ad go first, longest-running first; the others borrow the best one only to be written.
    const dated = active.map((h) => ({ ...h, daysRunning: own.has(h._id) ? (runDays(sources.get(h._id)!) ?? 0) : undefined }));
    const hooks = (chosen ? dated : pickHooks(dated, liveFamilies, hooksPerWeek)).map((h) => {
      const x = sources.get(h._id);
      const basedOn: BasedOn | undefined = x
        ? {
            company: x.company,
            daysRunning: h.daysRunning ?? runDays(x),
            angle: x.hook,
            offer: x.offer,
            creative: x.creative,
            opening: x.opening,
            adaptation: x.adaptation,
            transcript: x.transcript,
            adCopy: x.adCopy,
          }
        : undefined;
      return { ...h, basedOn };
    });
    const assets = (await ctx.db.query("adAssets").take(500)).filter((a) => inTrade(a, trade));
    // What the writer is shown for each hook's scope: competitor ads of the same trade, for tone and shape.
    const swipes = (await ctx.db.query("adSwipes").take(1000)).filter((x) => inTrade(x, trade));
    const examples: Record<string, Example[]> = {};
    for (const scope of new Set(hooks.map((h) => h.scope)))
      examples[scope] = pickExamples(swipes, scope).map((x) => ({
        company: x.company,
        hook: x.hook,
        offer: x.offer,
        transcript: x.transcript,
        adCopy: x.adCopy,
        durationSec: x.durationSec,
      }));
    const playbooks: Record<string, { text: string; footagePrefs: string[] }> = {};
    for (const p of await ctx.db.query("adPlaybooks").take(100)) if (inTrade(p, trade)) playbooks[p.scope] = { text: p.text, footagePrefs: p.footagePrefs };
    return {
      hooks,
      examples,
      playbooks,
      liveCount: liveAds.length,
      assets: await Promise.all(
        assets.map(async (a) => ({
          _id: a._id,
          kind: a.kind,
          tags: a.tags,
          pairKey: a.pairKey,
          createdAt: a.createdAt,
          uses: a.uses ?? 0,
          best: a.best ?? false,
          description: a.description,
          items: a.items,
          durationSec: a.durationSec,
          jobId: a.jobId,
          imageUrl: await lookUrl(ctx, a),
        })),
      ),
    };
  },
});

export const openBatch = internalMutation({
  args: { weekOf: v.string(), startedBy: v.optional(v.id("users")), trade: v.optional(v.string()), requestId: v.optional(v.id("adRequests")) },
  handler: async (ctx, { weekOf, startedBy, trade, requestId }) =>
    await ctx.db.insert("adBatches", { trade: tradeOf(trade).slug, weekOf, status: "drafting", startedBy, createdAt: nowIso(), ...(requestId ? { requestId } : {}) }),
});

export const noteSkipped = internalMutation({
  args: { batchId: v.id("adBatches"), skipped: v.array(v.string()) },
  handler: async (ctx, { batchId, skipped }) => {
    // Always written, even empty: it also says the writing is over (a request's page moves on to the voice).
    await ctx.db.patch(batchId, { skipped: skipped.map((s) => s.slice(0, 400)) });
  },
});

export const failBatch = internalMutation({
  args: { batchId: v.id("adBatches"), error: v.string() },
  handler: async (ctx, { batchId, error }) => {
    await ctx.db.patch(batchId, { status: "failed", error: error.slice(0, 500) });
    await tellStaff(ctx, "This week's ads couldn't be drafted", [error.slice(0, 500)], "/ops?tab=ads");
  },
});

/** The other ways a checklist can be drawn (AD_LOOKS). */
const adLook = v.union(v.literal("collage"), v.literal("markup"), v.literal("versus"));

const adDesign = v.object({
  style: v.union(v.literal("reel"), v.literal("lightUp"), v.literal("beforeAfter"), v.literal("counter"), v.literal("explainer"), v.literal("footage")),
  title: v.string(),
  stats: v.optional(v.array(v.object({ value: v.number(), label: v.string() }))),
  revealOn: v.optional(v.string()),
  frames: v.optional(
    v.array(
            v.object({
              x: v.optional(v.number()),
              y: v.optional(v.number()),
              from: v.optional(v.number()),
              to: v.optional(v.number()),
              down: v.optional(v.boolean()),
              before: v.optional(v.boolean()),
              more: v.optional(v.array(v.id("adAssets"))),
              mark: v.optional(v.union(v.literal("check"), v.literal("cross"))),
              skip: v.optional(v.string()),
            }),
          ),
  ),
  spare: v.optional(v.array(v.id("adAssets"))),
  tag: v.optional(v.string()),
  look: v.optional(adLook),
  engine: v.optional(v.literal("tesseract")),
  muteClip: v.optional(v.boolean()),
  quick: v.optional(v.boolean()),
});

/** Creates the week's creatives for one hook (two sizes) once its script is in. */
export const addCreatives = internalMutation({
  args: {
    batchId: v.id("adBatches"),
    hookId: v.id("adHooks"),
    script: adScript,
    design: adDesign,
  },
  handler: async (ctx, { batchId, hookId, script, design }) => {
    // Each file once, in the order it first appears (a photo may stay up for lines in a row); then a reel's other photos.
    const assetIds = [...new Set([...(script.shots ?? []).map((s) => s.assetId), ...(design.frames ?? []).flatMap((f) => f.more ?? []), ...(design.spare ?? [])])];
    const now = new Date();
    const ids: Id<"adCreatives">[] = [];
    // The 4:5 video's name, which its still takes: a second ad on the same idea (a quick offer, "…_2") keeps its own.
    let fourFive = creativeName(hookId, "4x5", now);
    for (const ratio of ["9x16", "4x5"] as const) {
      let name = creativeName(hookId, ratio, now);
      for (
        let n = 2;
        (await ctx.db
          .query("adCreatives")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first()) !== null;
        n++
      )
        name = `${creativeName(hookId, ratio, now)}_${n}`;
      if (ratio === "4x5") fourFive = name;
      ids.push(await ctx.db.insert("adCreatives", { batchId, hookId, ratio, name, script, design, assetIds, status: "draft", createdAt: nowIso() }));
    }
    // A still of the same ad when it shows a before and its after from one job: it shares the words and needs no voice of its own.
    if ((await settingsRow(ctx))?.stills && design.style === "reel") {
      const assets = new Map<string, { tags: string[]; pairKey?: string }>();
      for (const id of assetIds) {
        const a = await ctx.db.get(id);
        if (a) assets.set(id, { tags: a.tags, pairKey: a.pairKey });
      }
      if (stillPairOf(script.shots ?? [], design.frames, assets))
        ids.push(
          await ctx.db.insert("adCreatives", {
            batchId,
            hookId,
            ratio: "4x5",
            kind: "image",
            name: `${fourFive}_still`,
            script,
            design,
            assetIds,
            status: "draft",
            createdAt: nowIso(),
          }),
        );
    }
    const hook = await ctx.db.get(hookId);
    if (hook) await ctx.db.patch(hookId, { uses: hook.uses + 1, lastUsedAt: nowIso() });
    // The library rotates: a photo used in an ad this week waits behind fresher ones next week.
    for (const assetId of assetIds) {
      const a = await ctx.db.get(assetId);
      if (a) await ctx.db.patch(assetId, { uses: (a.uses ?? 0) + 1, lastUsedAt: nowIso() });
    }
    return ids;
  },
});

/**
 * The same checklist ad drawn in another look, to test one look against the other: same words, voice, photos and
 * offer, so only the look differs. Copies the ad's two sizes (named by their shared start, e.g. "WL_wrdyop") into
 * its own batch, already voiced, and they wait to be drawn.
 */
export const addLook = internalMutation({
  args: { name: v.string(), look: adLook },
  handler: async (ctx, { name, look }) => {
    const recent = await ctx.db.query("adCreatives").order("desc").take(300);
    // The same idea can have ads from earlier weeks under the same name: only the newest batch's are copied.
    // Only the originals: a copy already in another look is never copied again.
    const named = recent.filter((c) => c.name.startsWith(`${name}_`) && !c.design?.look && c.kind !== "image");
    if (named.length === 0) fail("NOT_FOUND", `No ad named ${name} among the recent ones`);
    const from = named.filter((c) => c.batchId === named[0].batchId);
    const made: string[] = [];
    for (const c of from) {
      if (c.design?.style !== "explainer") fail("INVALID", `${c.name} isn't a checklist ad; only those have a ${look} look`);
      if (!c.audioStorageId) fail("INVALID", `${c.name} has no voice yet`);
      const copy = `${c.name}_${look}`;
      if (recent.some((x) => x.name === copy)) continue;
      await ctx.db.insert("adCreatives", {
        batchId: c.batchId,
        hookId: c.hookId,
        ratio: c.ratio,
        name: copy,
        script: c.script,
        design: { ...c.design, look },
        assetIds: c.assetIds,
        audioStorageId: c.audioStorageId,
        audioDurationSec: c.audioDurationSec,
        status: "voiced",
        createdAt: nowIso(),
      });
      made.push(copy);
    }
    if (made.length) await ctx.scheduler.runAfter(0, internal.ads.startRenders, {});
    return { made };
  },
});

/**
 * From the deployment: a story copied with only its opening title and the captions, no headline over each later
 * line, to set beside the one it was made from. Same words, voice and photos; nothing is rewritten. For jobs with
 * only finished photos, where a headline per step has nothing new to say and repeats the voice.
 */
export const sampleCaptionsOnly = internalMutation({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const made: string[] = [];
    for (const name of names) {
      const c = await ctx.db.query("adCreatives").withIndex("by_name", (q) => q.eq("name", name)).first();
      if (!c) fail("NOT_FOUND", `No ad named ${name}`);
      if (c.design?.style !== "reel" || c.design.quick) fail("INVALID", `${name} isn't a story ad`);
      if (!c.audioStorageId || !c.script.shots?.length) fail("INVALID", `${name} has no voice yet`);
      const copy = `${name}_cap`;
      if (await ctx.db.query("adCreatives").withIndex("by_name", (q) => q.eq("name", copy)).first()) continue;
      const shots = c.script.shots.map((x) => ({ ...x, onScreen: "" }));
      await ctx.db.insert("adCreatives", {
        batchId: c.batchId,
        hookId: c.hookId,
        ratio: c.ratio,
        name: copy,
        script: { ...c.script, shots, onScreen: c.script.onScreen.slice(0, 1) },
        design: c.design,
        assetIds: c.assetIds,
        audioStorageId: c.audioStorageId,
        audioDurationSec: c.audioDurationSec,
        status: "voiced",
        createdAt: nowIso(),
      });
      made.push(copy);
    }
    if (made.length) await ctx.scheduler.runAfter(0, internal.ads.startRenders, {});
    return { made };
  },
});

export const patchCreative = internalMutation({
  args: {
    id: v.id("adCreatives"),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("recording"),
        v.literal("voiced"),
        v.literal("rendering"),
        v.literal("rendered"),
        v.literal("paused"),
        v.literal("live"),
        v.literal("retired"),
        v.literal("rejected"),
        v.literal("failed"),
      ),
    ),
    error: v.optional(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    audioDurationSec: v.optional(v.number()),
    script: v.optional(adScript),
    videoStorageId: v.optional(v.id("_storage")),
    imageStorageId: v.optional(v.id("_storage")),
    renderId: v.optional(v.string()),
    meta: v.optional(
      v.object({
        videoId: v.optional(v.string()),
        imageHash: v.optional(v.string()),
        creativeId: v.optional(v.string()),
        adId: v.optional(v.string()),
        adsetId: v.optional(v.string()),
      }),
    ),
    actor: v.optional(
      v.object({
        projectId: v.string(),
        orderedAt: v.string(),
        price: v.optional(v.number()),
        test: v.optional(v.boolean()),
        deliverableId: v.optional(v.string()),
        heldBack: v.optional(v.array(v.string())),
        checkedAt: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { id, ...fields }) => {
    const c = await ctx.db.get(id);
    if (c === null) return;
    await ctx.db.patch(id, {
      ...fields,
      ...(fields.error ? { error: fields.error.slice(0, 500) } : {}),
      ...(fields.meta ? { meta: { ...c.meta, ...fields.meta } } : {}),
    });
  },
});

type InputAsset = {
  id: Id<"adAssets">;
  url: string;
  posterUrl?: string;
  kind: "photo" | "video";
  tags: string[];
  pairKey?: string;
  durationSec?: number;
};
type CreativeInput = Doc<"adCreatives"> & { assets: InputAsset[]; audioUrl: string | null; videoUrl: string | null; imageUrl: string | null };

/** A creative with everything an action needs to voice, render or publish it. */
export const creativeInput = internalQuery({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (c === null) return null;
    const assets: Array<{
      id: Id<"adAssets">;
      url: string;
      posterUrl?: string;
      kind: "photo" | "video";
      tags: string[];
      pairKey?: string;
      durationSec?: number;
    }> = [];
    for (const assetId of c.assetIds) {
      const a = await ctx.db.get(assetId);
      if (!a) continue;
      const original = await ctx.storage.getUrl(a.storageId);
      const posterUrl = a.posterStorageId ? ((await ctx.storage.getUrl(a.posterStorageId)) ?? undefined) : undefined;
      // A photo a browser can't read (HEIC) is shown from its JPEG still.
      const url = a.kind === "photo" && !CLAUDE_IMAGE_TYPES.includes(a.contentType) && posterUrl ? posterUrl : original;
      if (url) assets.push({ id: assetId, url, posterUrl, kind: a.kind, tags: a.tags, pairKey: a.pairKey, durationSec: a.durationSec });
    }
    return {
      ...c,
      assets,
      audioUrl: c.audioStorageId ? await ctx.storage.getUrl(c.audioStorageId) : null,
      videoUrl: c.videoStorageId ? await ctx.storage.getUrl(c.videoStorageId) : null,
      imageUrl: c.imageStorageId ? await ctx.storage.getUrl(c.imageStorageId) : null,
    };
  },
});

/** One ad as it is looked at from outside the app: its file, its words and voice, what it was drawn from, and the competitor ad it was built around. */
async function outsideView(ctx: QueryCtx, c: Doc<"adCreatives">) {
  const hook = await ctx.db.get(c.hookId);
  return {
    name: c.name,
    kind: c.kind ?? "video",
    style: c.design?.style,
    ratio: c.ratio,
    status: c.status,
    createdAt: c.createdAt,
    error: c.error,
    idea: hook?.textEn,
    builtAround: hook ? await sourceOf(ctx, hook) : undefined,
    headline: c.script.headline,
    onScreen: c.script.onScreen,
    shots: (c.script.shots ?? []).length,
    file: c.videoStorageId ? await ctx.storage.getUrl(c.videoStorageId) : c.imageStorageId ? await ctx.storage.getUrl(c.imageStorageId) : undefined,
    voice: c.audioStorageId ? await ctx.storage.getUrl(c.audioStorageId) : undefined,
    voiceSec: c.audioDurationSec,
    lines: (c.script.shots ?? []).map((x) => ({ voice: x.voice, onScreen: x.onScreen, start: x.start, end: x.end })),
    footage: await Promise.all(
      c.assetIds.map(async (id) => {
        const a = await ctx.db.get(id);
        return a ? { fileName: a.fileName, kind: a.kind, tags: a.tags, pairKey: a.pairKey, description: a.description, url: await lookUrl(ctx, a) } : null;
      }),
    ),
  };
}

/** The latest ads, newest first, to look at a render from outside the app. */
export const recentCreatives = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 12 }) => {
    const rows = await ctx.db.query("adCreatives").order("desc").take(Math.max(1, Math.min(40, limit)));
    return await Promise.all(rows.map((c) => outsideView(ctx, c)));
  },
});

/**
 * Every ad still waiting or running, from outside the app: its name, kind, look, the idea it was made from and the
 * competitor ad behind it, so a remake can name the idea (weeklyRun's `only`) and the looks to copy it into.
 */
export const waitingAds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("adCreatives").order("desc").take(500)).filter((c) => !["rejected", "failed", "retired"].includes(c.status));
    const hooks = new Map<string, Doc<"adHooks"> | null>();
    const out = [];
    for (const c of rows) {
      if (!hooks.has(c.hookId)) hooks.set(c.hookId, await ctx.db.get(c.hookId));
      const h = hooks.get(c.hookId);
      const x = h?.swipeId ? await ctx.db.get(h.swipeId) : null;
      out.push({
        name: c.name,
        status: c.status,
        kind: c.kind ?? "video",
        style: c.design?.style,
        look: c.design?.look,
        quick: c.design?.quick === true,
        words: c.script.voice.split(/\s+/).filter(Boolean).length,
        hookId: c.hookId,
        idea: h?.textEn,
        builtOn: x ? { company: x.company, scriptWords: scriptLength(x)?.words } : undefined,
        createdAt: c.createdAt,
      });
    }
    return out;
  },
});

/** The newest batch from outside the app: how it ended, the ideas it passed over and why, and its ads. */
export const lastBatch = internalQuery({
  // `back`: how many batches before the newest (0, the newest, when left out).
  // `names`: just these ads, whatever batch they are in, for checking a redraw.
  args: { back: v.optional(v.number()), names: v.optional(v.array(v.string())) },
  handler: async (ctx, { back, names }) => {
    if (names) {
      const found = await Promise.all(names.map((name) => ctx.db.query("adCreatives").withIndex("by_name", (q) => q.eq("name", name)).first()));
      return { ads: await Promise.all(found.flatMap((c) => (c ? [outsideView(ctx, c)] : []))) };
    }
    const batch = (await ctx.db.query("adBatches").order("desc").take((back ?? 0) + 1))[back ?? 0];
    if (!batch) return null;
    const rows = await ctx.db
      .query("adCreatives")
      .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
      .collect();
    return {
      trade: tradeOf(batch.trade).slug,
      weekOf: batch.weekOf,
      status: batch.status,
      summary: batch.summary,
      error: batch.error,
      skipped: batch.skipped ?? [],
      ads: await Promise.all(rows.map((c) => outsideView(ctx, c))),
    };
  },
});

/**
 * From the deployment: a story made again from the same idea and competitor ad, with headlines that add to what is
 * said instead of repeating it (weeklyRun's `steps`), to set beside the one it was made from. `jobId` keeps it on the
 * same job's photos.
 */
export const sampleWithSteps = internalMutation({
  // `checklist`: the same idea drawn as a checklist instead (the lesson's look), its steps ticked as they're said.
  args: { name: v.string(), jobId: v.optional(v.id("adJobs")), checklist: v.optional(v.boolean()) },
  handler: async (ctx, { name, jobId, checklist }) => {
    const c = await ctx.db.query("adCreatives").withIndex("by_name", (q) => q.eq("name", name)).first();
    if (!c) fail("NOT_FOUND", `No ad named ${name}`);
    const batch = await ctx.db.get(c.batchId);
    await ctx.scheduler.runAfter(0, internal.ads.weeklyRun, {
      force: true,
      only: [c.hookId],
      trade: tradeOf(batch?.trade).slug,
      ...(checklist ? { style: "explainer" as const } : { steps: true }),
      ...(jobId ? { jobId } : {}),
    });
    return { hookId: c.hookId };
  },
});

/**
 * Sends ads back to be drawn again from the words and voice they already
 * have, after a change to how ads are drawn: nothing is rewritten or re-read.
 * The old file goes; the new one takes its place when the render is back.
 */
export const rerender = internalMutation({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const sent: string[] = [];
    for (const name of names) {
      const c = await ctx.db
        .query("adCreatives")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      // Only one still waiting for review, and only one the renderer can draw: an ad in Meta keeps the file Meta has.
      if (!c || !c.design || !c.audioStorageId || (c.status !== "rendered" && c.status !== "failed")) continue;
      if (c.videoStorageId) await ctx.storage.delete(c.videoStorageId);
      await ctx.db.patch(c._id, { status: "voiced", videoStorageId: undefined, renderStartedAt: undefined, error: undefined });
      sent.push(name);
    }
    if (sent.length) await ctx.scheduler.runAfter(0, internal.ads.startRenders, {});
    return { sent };
  },
});

/** How long a claimed ad may go without its file before it is offered again (the renderer stopped part-way). */
const RENDER_STALE_MS = 20 * 60_000;
/** The most ads handed out to one run of the renderer. */
const RENDER_BATCH = 8;

/**
 * The renderer asks for work: the ads that are voiced and waiting, each with
 * everything it is drawn from (lib/ads.ts renderProps). They are marked as
 * rendering, so a second renderer doesn't draw them too; one claimed over
 * twenty minutes ago with no file is offered again.
 */
/**
 * What one ad is drawn from, without claiming it: for drawing a sample of a finished ad another way, from outside
 * the app (render-queue.mjs --fixture). Reels only.
 */
export const renderInputOf = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const c = await ctx.db
      .query("adCreatives")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!c?.design || !c.audioStorageId) fail("NOT_FOUND", `No drawn ad named ${name}`);
    const row = await settingsRow(ctx);
    const brand = {
      name: consumerBrand(),
      primaryColor: row?.primaryColor ?? "#336699",
      accentColor: row?.accentColor ?? "#8fb6e0",
      markets: research(row).researchMarkets,
    };
    const track = (await ctx.db.query("adMusic").order("desc").take(20)).find((m) => m.active);
    const musicUrl = track ? await ctx.storage.getUrl(track.storageId) : null;
    const music = track && musicUrl ? { url: musicUrl, from: track.from, beats: track.beats } : undefined;
    const photos = new Map<string, { url: string; tags: string[]; pairKey?: string }>();
    for (const assetId of c.assetIds) {
      const a = await ctx.db.get(assetId);
      const url = a ? await lookUrl(ctx, a) : undefined;
      if (a && url) photos.set(assetId, { url, tags: a.tags, pairKey: a.pairKey });
    }
    const audioUrl = (await ctx.storage.getUrl(c.audioStorageId!))!;
    return {
      name: c.name,
      props: renderProps({
        ratio: c.ratio,
        design: c.design!,
        script: c.script,
        photos,
        audioUrl,
        audioSec: c.audioDurationSec ?? Math.max(8, c.script.voice.split(/\s+/).length / 2.6),
        brand,
        music,
        presenterUrl: c.presenter ? ((await ctx.storage.getUrl(c.presenter.storageId)) ?? undefined) : undefined,
      }),
    };
  },
});

export const claimRenders = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = RENDER_BATCH }) => {
    const waiting = await ctx.db
      .query("adCreatives")
      .withIndex("by_status", (q) => q.eq("status", "voiced"))
      .take(50);
    const stale = (
      await ctx.db
        .query("adCreatives")
        .withIndex("by_status", (q) => q.eq("status", "rendering"))
        .take(50)
    ).filter((c) => !c.renderStartedAt || Date.now() - new Date(c.renderStartedAt).getTime() > RENDER_STALE_MS);
    const row = await settingsRow(ctx);
    const brand = {
      name: consumerBrand(),
      primaryColor: row?.primaryColor ?? "#336699",
      accentColor: row?.accentColor ?? "#8fb6e0",
      markets: research(row).researchMarkets,
    };
    // The music a reel plays: the newest track switched on.
    const track = (await ctx.db.query("adMusic").order("desc").take(20)).find((m) => m.active);
    const musicUrl = track ? await ctx.storage.getUrl(track.storageId) : null;
    const music = track && musicUrl ? { url: musicUrl, from: track.from, beats: track.beats } : undefined;
    const jobs: Array<{ id: Id<"adCreatives">; name: string; kind: "video" | "image"; props: ReturnType<typeof renderProps> | NonNullable<ReturnType<typeof stillProps>> }> = [];
    for (const c of [...waiting, ...stale].slice(0, Math.max(1, Math.min(RENDER_BATCH, limit)))) {
      try {
        if (c.still) {
          // A static image ad: its photos in order, its headline and the line under it. Nothing else.
          const srcs: Array<{ src: string }> = [];
          for (const assetId of c.assetIds) {
            const a = await ctx.db.get(assetId);
            const url = a ? await lookUrl(ctx, a) : undefined;
            if (url) srcs.push({ src: url });
          }
          const need = c.still.layout === "pair" ? 2 : c.still.layout === "grid" ? 3 : 1;
          if (srcs.length < need) throw new Error("A photo this image ad was made from is gone");
          const base = { ratio: "4x5" as const, brand, headline: c.script.onScreen[0] ?? c.script.headline, sub: c.still.sub, variant: c.still.variant ?? 0 };
          const props = c.still.layout === "pair" ? { ...base, pair: [srcs[0], srcs[1]] } : c.still.layout === "grid" ? { ...base, grid: srcs.slice(0, 4) } : { ...base, photo: srcs[0] };
          await ctx.db.patch(c._id, { status: "rendering", renderStartedAt: nowIso(), error: undefined });
          jobs.push({ id: c._id, name: c.name, kind: "image", props: props as never });
          continue;
        }
        if (!c.design) throw new Error("This ad was made before ads were drawn this way");
        const audioUrl = c.audioStorageId ? await ctx.storage.getUrl(c.audioStorageId) : null;
        if (!audioUrl) throw new Error("No voice track");
        const photos = new Map<string, { url: string; tags: string[]; pairKey?: string }>();
        for (const assetId of c.assetIds) {
          const a = await ctx.db.get(assetId);
          // The still Claude looked at: the photo itself, or its JPEG still when the browser can't read it (HEIC).
          const url = a ? await lookUrl(ctx, a) : undefined;
          if (a && url) photos.set(assetId, { url, tags: a.tags, pairKey: a.pairKey });
        }
        const reel = renderProps({
          ratio: c.ratio,
          design: c.design,
          script: c.script,
          photos,
          audioUrl,
          audioSec: c.audioDurationSec ?? Math.max(8, c.script.voice.split(/\s+/).length / 2.6),
          brand,
          music,
          presenterUrl: c.presenter ? ((await ctx.storage.getUrl(c.presenter.storageId)) ?? undefined) : undefined,
        });
        let props: ReturnType<typeof renderProps> | NonNullable<ReturnType<typeof stillProps>> = reel;
        if (c.kind === "image") {
          const still = stillProps(reel, c.design ? stillPairOf(c.script.shots ?? [], c.design.frames, photos) : null);
          if (!still) throw new Error("This ad shows no before and after of one job to put in a still");
          props = still;
        }
        await ctx.db.patch(c._id, { status: "rendering", renderStartedAt: nowIso(), error: undefined });
        jobs.push({ id: c._id, name: c.name, kind: c.kind === "image" ? "image" : "video", props });
      } catch (e) {
        await ctx.db.patch(c._id, { status: "failed", error: errText(e) });
        await ctx.scheduler.runAfter(0, internal.ads.finishIfDone, { batchId: c.batchId });
      }
    }
    return jobs;
  },
});

/** Where the renderer puts a finished file. */
/** Files a music track that is already in storage; with `only`, it becomes the one track in use. */
export const addMusic = internalMutation({
  args: { name: v.string(), storageId: v.id("_storage"), from: v.optional(v.number()), beats: v.optional(v.array(v.number())), only: v.optional(v.boolean()) },
  handler: async (ctx, { name, storageId, from, beats, only }) => {
    const file = await ctx.db.system.get(storageId);
    if (file === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    if (only) for (const m of await ctx.db.query("adMusic").take(100)) await ctx.db.patch(m._id, { active: false });
    return await ctx.db.insert("adMusic", { name: name.slice(0, 80), storageId, from, beats: beats?.slice(0, 400), active: true, createdAt: nowIso() });
  },
});

/** Fetches a music track from where it is published, keeps it in storage, and files it. Run by hand when a track is chosen. */
export const fetchMusic = internalAction({
  args: { url: v.string(), name: v.string(), from: v.optional(v.number()), beats: v.optional(v.array(v.number())), only: v.optional(v.boolean()) },
  handler: async (ctx, { url, ...rest }): Promise<{ id: Id<"adMusic">; bytes: number }> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The track couldn't be fetched (${res.status})`);
    const blob = await res.blob();
    if (blob.size < 10_000 || blob.size > 30 * 1024 * 1024) throw new Error(`That doesn't look like a music track (${blob.size} bytes)`);
    const storageId = await ctx.storage.store(new Blob([await blob.arrayBuffer()], { type: "audio/mpeg" }));
    const id: Id<"adMusic"> = await ctx.runMutation(internal.ads.addMusic, { ...rest, storageId });
    return { id, bytes: blob.size };
  },
});

export const renderUploadUrl = internalMutation({ args: {}, handler: async (ctx) => await ctx.storage.generateUploadUrl() });

/** The renderer hands in a finished video. An ad that was rejected or removed meanwhile doesn't keep it. */
export const renderDone = internalMutation({
  args: { id: v.id("adCreatives"), storageId: v.id("_storage") },
  handler: async (ctx, { id, storageId }) => {
    const c = await ctx.db.get(id);
    if (c === null || c.status !== "rendering") {
      await ctx.storage.delete(storageId);
      return { kept: false };
    }
    // A still keeps its picture where an image ad does; a reel its video.
    if (c.kind === "image") {
      if (c.imageStorageId) await ctx.storage.delete(c.imageStorageId);
      await ctx.db.patch(id, { status: "rendered", imageStorageId: storageId, error: undefined });
      await ctx.scheduler.runAfter(0, internal.ads.publishPaused, { id });
      return { kept: true };
    }
    if (c.videoStorageId) await ctx.storage.delete(c.videoStorageId);
    await ctx.db.patch(id, { status: "rendered", videoStorageId: storageId, error: undefined });
    await ctx.scheduler.runAfter(0, internal.ads.publishPaused, { id });
    return { kept: true };
  },
});

/** The renderer couldn't draw one: that ad fails with the reason and the batch goes on. */
export const renderFailed = internalMutation({
  args: { id: v.id("adCreatives"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const c = await ctx.db.get(id);
    if (c === null || c.status !== "rendering") return;
    await ctx.db.patch(id, { status: "failed", error: `Couldn't draw the ${c.kind === "image" ? "still" : "video"}: ${error}`.slice(0, 500) });
    await ctx.scheduler.runAfter(0, internal.ads.finishIfDone, { batchId: c.batchId });
  },
});

/**
 * Asks GitHub to run the renderer. With no ADS_RENDER_TOKEN it does nothing:
 * the ads wait as voiced until someone starts the workflow.
 */
export const startRenders = internalAction({
  args: {},
  handler: async (): Promise<{ started: boolean; why?: string }> => {
    const token = process.env.ADS_RENDER_TOKEN;
    if (!token) return { started: false, why: "no ADS_RENDER_TOKEN" };
    const repo = process.env.ADS_RENDER_REPO ?? "Cymoe/Estimate-Wave-App";
    const ref = process.env.ADS_RENDER_REF ?? "fieldquote-convex";
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ads-render.yml/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "ad-maker" },
      body: JSON.stringify({ ref }),
    });
    if (!res.ok) {
      const why = `GitHub: ${res.status} ${(await res.text()).slice(0, 200)}`;
      console.error("start renders", why);
      return { started: false, why };
    }
    return { started: true };
  },
});

/** Once every creative in a batch has reached a resting state, the batch is ready and staff hear about it. */
export const finishIfDone = internalMutation({
  args: { batchId: v.id("adBatches") },
  handler: async (ctx, { batchId }) => {
    const batch = await ctx.db.get(batchId);
    if (batch === null || batch.status === "ready" || batch.status === "done" || batch.status === "failed") return;
    const rows = await ctx.db
      .query("adCreatives")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .collect();
    const resting = new Set(["rendered", "paused", "failed", "rejected", "live", "retired"]);
    // "rendered" rests only once publishPaused has said why it stayed here (no Meta account); before that it is still on its way.
    if (rows.length === 0 || !rows.every((c) => resting.has(c.status) && (c.status !== "rendered" || c.error))) return;
    const paused = rows.filter((c) => c.status === "paused").length;
    const rendered = rows.filter((c) => c.status === "rendered").length;
    const failed = rows.filter((c) => c.status === "failed").length;
    const summary = [`${paused} paused in Meta`, rendered ? `${rendered} rendered but not in Meta` : "", failed ? `${failed} failed` : ""]
      .filter(Boolean)
      .join(" · ");
    await ctx.db.patch(batchId, { status: "ready", summary });
    await tellStaff(
      ctx,
      `This week's ads are ready to review (${summary})`,
      [
        `Week of ${batch.weekOf}: ${rows.length} creative(s). Open Ops → Ads, watch them, and approve the ones to run.`,
        ...(batch.skipped ?? []).map((s) => `Passed over: ${s}`),
      ],
      "/ops?tab=ads",
    );
  },
});

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function readJson(res: Response, what: string): Promise<any> {
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    // Meta puts what is actually wrong in error_user_title and error_user_msg; its message is often just "Invalid parameter".
    const e = body?.error;
    const detail = [e?.error_user_title, e?.error_user_msg, e?.error_subcode ? `(subcode ${e.error_subcode})` : ""].filter(Boolean).join(" ");
    throw new Error(`${what}: ${res.status} ${e?.message ?? body?.message ?? body?.response?.message ?? text.slice(0, 200)}${detail ? ` - ${detail}` : ""}`.slice(0, 900));
  }
  return body;
}

/** One Claude call: content blocks in; the reply's text out, and whether it ran out of room before finishing. */
/**
 * The photos that fit an idea, from what each one shows: in the idea's kind of job (any kind for a general idea), not
 * used by another ad this week, with a description. Each picked photo brings its before or after along. Null when
 * Claude can't be asked or names none, so the usual picking runs on the whole library.
 */
async function shortlistFor<P extends { _id: string; tags: string[]; description?: string; uses?: number; best?: boolean; jobId?: string; pairKey?: string }>(
  idea: string,
  scope: string,
  photos: P[],
  used: Set<string>,
  seen?: { reply?: string; error?: string },
): Promise<{ photos: P[]; oneProject?: boolean } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const candidates = photos
    .filter((p) => p.description && !used.has(p._id) && (scope === ANY_SCOPE || p.tags.includes(scope)))
    .sort((a, b) => Number(!!b.best) - Number(!!a.best) || (a.uses ?? 0) - (b.uses ?? 0))
    .slice(0, 220);
  if (candidates.length <= SHORTLIST_MAX) return null;
  try {
    const reply = await claude(
      [
        {
          type: "text",
          text: shortlistPrompt(
            idea,
            candidates.map((p, i) => ({ n: i + 1, tags: p.tags, description: p.description!, uses: p.uses ?? 0, best: p.best, project: p.jobId ? p.jobId.slice(-4) : undefined })),
          ),
        },
      ],
      // Room to read 75+ descriptions before answering: a small budget ends before any answer is written.
      4000,
    );
    if (seen) seen.reply = reply.slice(0, 1500);
    const picked = readShortlist(reply, candidates.length).map((n) => candidates[n - 1]);
    if (picked.length === 0) return null;
    const keys = new Set(picked.map((p) => p.pairKey).filter(Boolean));
    const halves = photos.filter((p) => p.pairKey && keys.has(p.pairKey) && !picked.includes(p) && !used.has(p._id));
    return { photos: [...picked, ...halves], oneProject: readOneProject(reply) };
  } catch (e) {
    console.error("shortlist", errText(e));
    if (seen) seen.error = errText(e);
    return null;
  }
}

/** From a cloud session: what the shortlist picks for an idea from the live library, to see why an ad got the photos it did. */
export const shortlistProbe = internalAction({
  args: { idea: v.string(), scope: v.string(), trade: v.optional(v.string()) },
  handler: async (ctx, { idea, scope, trade }) => {
    const { assets } = await ctx.runQuery(internal.ads.plan, { hooksPerWeek: 1, trade: tradeOf(trade).slug });
    const photos = assets.filter((a: { kind: string; imageUrl?: string }) => a.kind === "photo" && a.imageUrl);
    const inScope = photos.filter((p: { tags: string[]; description?: string }) => p.description && (scope === ANY_SCOPE || p.tags.includes(scope)));
    const seen: { reply?: string; error?: string } = {};
    const short = await shortlistFor(idea, scope, photos, new Set<string>(), seen);
    const picked = short?.photos;
    return {
      ...seen,
      oneProject: short?.oneProject,
      photos: photos.length,
      inScope: inScope.length,
      picked: picked?.map((p: { _id: string; jobId?: string; tags: string[] }) => ({ id: p._id, job: p.jobId?.slice(-6), tags: p.tags.join(",") })) ?? null,
    };
  },
});

async function claudeReply(content: unknown[], maxTokens = 1500): Promise<{ text: string; cutOff: boolean }> {
  const ask = () =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
    });
  // A request that never reached Claude (the network dropped it) is sent once more after a moment.
  const res = await ask().catch(async () => {
    // ADS_RETRY_MS: how long to wait first (3 seconds; tests set 0).
    const wait = Number(process.env.ADS_RETRY_MS ?? 3000);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return await ask();
  });
  const body = await readJson(res, "Claude");
  return { text: (body?.content ?? []).map((c: { text?: string }) => c.text ?? "").join(""), cutOff: body?.stop_reason === "max_tokens" };
}

/** One Claude call: content blocks in, the reply's text out. */
const claude = async (content: unknown[], maxTokens = 1500): Promise<string> => (await claudeReply(content, maxTokens)).text;

/** Room for a shot list, with whatever Claude says around it. */
// Room for a full-length script: up to 14 lines, their photos and 1,500 characters of primary text.
const SHOT_LIST_TOKENS = 12000;

/**
 * Monday: works down the eligible hooks until hooksPerWeek of them have an ad
 * written. A hook Claude says the photos can't carry, or whose ad still
 * breaks a rule after one retry, is passed over with the reason.
 */
export const weeklyRun = internalAction({
  args: {
    startedBy: v.optional(v.id("users")),
    force: v.optional(v.boolean()),
    // For a one-off run: how many hooks, whatever Settings says.
    hooks: v.optional(v.number()),
    // The ideas the owner kept, as hooks: make these and nothing else.
    only: v.optional(v.array(v.id("adHooks"))),
    // The trade to draft for; painting when none is given.
    trade: v.optional(v.string()),
    // For the ideas named in only: draw them as a checklist, or as a quick offer, whatever their family.
    style: v.optional(v.union(v.literal("explainer"), v.literal("quick"))),
    // A reel's title and headlines add to what is said (numbered steps, what the photo shows), never repeat it.
    steps: v.optional(v.boolean()),
    // A "make an ad for…" request (makeFor): the batch is its, the town it named is the one spoken to, and the
    // quick offer is made too, though the ideas are named.
    requestId: v.optional(v.id("adRequests")),
    town: v.optional(v.string()),
    quickToo: v.optional(v.boolean()),
    // The job a request named: every version shows that job's photos only.
    jobId: v.optional(v.id("adJobs")),
  },
  handler: async (ctx, { startedBy, force, hooks: hookCount, only, trade: slug, style: asked, requestId, town: askedTown, quickToo, jobId, steps }) => {
    const cfg = await ctx.runQuery(internal.ads.config, {});
    if (!cfg.weeklyEnabled && !force) return;
    const trade = tradeOf(slug);
    const batchId = await ctx.runMutation(internal.ads.openBatch, { weekOf: weekOf(new Date()), startedBy, trade: trade.slug, requestId });
    const skipped: string[] = [];
    const town = askedTown ?? cfg.researchMarkets[0] ?? "your town";
    try {
      const checks: Array<{ label: string; ok: boolean; hard: boolean; detail: string }> = await ctx.runQuery(internal.ads.readinessState, {});
      const blocked = checks.find((c) => c.hard && !c.ok);
      if (blocked) throw new Error(`${blocked.label}: ${blocked.detail}`);
      // The competitor ads on file are the ideas: each becomes one, and the longest-running are written first.
      if (!only) await ctx.runMutation(internal.ads.ideasFromResearch, {});
      const { hooks: ranked, assets, examples, playbooks, liveCount } = await ctx.runQuery(internal.ads.plan, { hooksPerWeek: 100, only, trade: trade.slug });
      // One of each kind of angle before a second of any, so a batch isn't the same ad twice.
      const kinds = new Set<string>();
      const firsts: typeof ranked = [];
      const seconds: typeof ranked = [];
      for (const h of ranked) {
        (kinds.has(h.family) ? seconds : firsts).push(h);
        kinds.add(h.family);
      }
      // A lesson second, so even a small week has a story and a lesson; the quick offer comes after.
      const lesson = firsts.findIndex((h: { family: Family }) => styleFor(h.family) === "explainer");
      if (lesson > 1) firsts.splice(1, 0, ...firsts.splice(lesson, 1));
      const hooks = only ? ranked : [...firsts, ...seconds];
      // A request only adds ads to look at; the cap on live ads is for the weekly run.
      if (!requestId && liveCount >= cfg.liveTarget)
        throw new Error(`${liveCount} ads are live and the target is ${cfg.liveTarget}. Retire one under Live, or raise the target in Settings.`);
      if (hooks.length === 0) throw new Error("No active hooks. Add or switch on hooks in Ops → Ads → Hooks.");
      // An ad is drawn from photos Claude can look at.
      const photos = assets.filter((a: { kind: string; imageUrl?: string }) => a.kind === "photo" && a.imageUrl);
      if (photos.length === 0) throw new Error("The library has no photos. Upload job photos in Ops → Ads → Library.");
      const used = new Set<string>();
      let made = 0;
      let delay = 0;
      let storyHook: (typeof hooks)[number] | undefined;
      // The photos of the job the story was told from, for the quick offer on it.
      let storyJob: typeof photos | undefined;
      // Writes, checks and saves one ad, then sends it to be voiced.
      const makeAd = async (hook: (typeof hooks)[number], shape: AdStyle, quick: boolean, offered: typeof photos, inScope: boolean, range = false) => {
        const playbook = playbooks[hook.scope] ?? playbooks.general;
        const plan = await writePlan<MotionPlan>(
          motionPrompt(
            { ...hook, style: shape, quick, steps, range: range && !quick, versus: shape === "explainer" && PREP_ANGLE.test(`${hook.textEn} ${hook.basedOn?.angle ?? ""}`) },
            cfg.brand.name,
            offered,
            inScope,
            // The ad it is built around is told in full above; the others are for tone.
            (examples[hook.scope] ?? []).filter((e: Example) => !(hook.basedOn && e.company === hook.basedOn.company && e.hook === hook.basedOn.angle)),
            town,
            playbook?.text,
            hook.basedOn,
            trade,
          ),
          offered,
          "ad",
          (p) =>
            motionPlanProblems(p, offered, quick ? { town: askedTown ?? cfg.researchMarkets[0] ?? "" } : undefined, quick ? undefined : scriptLength(hook.basedOn), {
              noEcho: steps,
            }),
        );
        const { script, design } = composeMotion(
          steps ? withoutEchoes(plan) : plan,
          offered.map((a: { _id: string }) => a._id),
          offered,
        );
        if (quick) design.quick = true;
        // What a line shows is this ad's; what it only keeps to spare may still carry another.
        script.shots!.forEach((s) => used.add(s.assetId));
        (design.frames ?? []).forEach((f) => (f.more ?? []).forEach((id) => used.add(id)));
        const ids: Id<"adCreatives">[] = await ctx.runMutation(internal.ads.addCreatives, { batchId, hookId: hook._id, script: script as never, design: design as never });
        // One voice per hook, shared by its two sizes.
        await ctx.scheduler.runAfter(delay, internal.ads.voice, { ids });
        delay += 1500;
      };
      for (const hook of hooks) {
        if (made >= (only ? only.length : (hookCount ?? cfg.hooksPerWeek))) break;
        const label = `"${hook.textEn.slice(0, 50)}${hook.textEn.length > 50 ? "…" : ""}"`;
        const playbook = playbooks[hook.scope] ?? playbooks.general;
        // Every ad is written from a competitor ad that has kept running; without one on file there is nothing to build on.
        if (!hook.basedOn) {
          const why = `no competitor ad on file for ${trade.label.toLowerCase()} to build it on. Run the competitor search first`;
          skipped.push(`${label}: ${why}`);
          if (only) await ctx.runMutation(internal.ads.ideaNotMade, { hookId: hook._id, why });
          continue;
        }
        // A request's versions are the same offer told different ways, so each may use the best photos for it; a
        // week's ads each keep to photos the others haven't used.
        // What the idea names (a front door, a fence) is offered first.
        const want = itemsIn(`${hook.textEn} ${hook.basedOn?.angle ?? ""}`, trade);
        // The type of work it names (fence staining, stained cabinets): only photos of that work, when there are enough.
        const works = worksIn(hook.textEn, trade);
        // The photos that show what the idea says, read from their descriptions (with their pairs), when Claude finds
        // some; the rest of the picking then works on those alone.
        const short = hook.photoId || jobId ? null : await shortlistFor(`${hook.textEn}${hook.basedOn?.angle ? ` (angle: ${hook.basedOn.angle})` : ""}`, hook.scope, photos, requestId ? new Set<string>() : used);
        const fitting = short?.photos ?? null;
        const pool = fitting ?? photos;
        const picked = pickAssets(pool, fitting ? ANY_SCOPE : hook.scope, requestId ? new Set<string>() : used, REEL_CANDIDATES, playbook?.footagePrefs ?? [], want, works);
        // An ad made for one job's photo shows that job only: the photo, and its pair if it has one. Other jobs' work would pass for this one.
        const lead = hook.photoId ? photos.find((a: { _id: string }) => a._id === hook.photoId) : undefined;
        if (lead) {
          const pair = lead.pairKey ? photos.filter((a: { _id: string; pairKey?: string }) => a._id !== lead._id && a.pairKey === lead.pairKey) : [];
          picked.assets.splice(0, picked.assets.length, lead, ...pair);
          picked.inScope = true;
        }
        // How it is drawn: as asked for the ideas named, else by the idea's family.
        const shape = only && asked === "explainer" ? "explainer" : styleFor(hook.family);
        const quick = Boolean(only && asked === "quick");
        // One project carries an ad only when the idea is that project's story (Claude says so of the idea; with no
        // answer, a before/after or an owner's story is one) and the project has plenty to tell it with. Any other
        // idea shows a range of projects. A job the request named carries every version; a lesson takes photos from
        // several jobs.
        const quickOne = quick;
        const oneProject = quickOne || (short?.oneProject ?? (hook.family === "before_after" || hook.family === "owner_story"));
        const storyJob_ = <J extends { jobId: string }>(j: J | null): J | null => {
          if (!j || quickOne) return j;
          const ps = photos.filter((a: { jobId?: string }) => a.jobId === j.jobId);
          const has = (t: string) => ps.some((p: { tags: string[] }) => p.tags.includes(t));
          return ps.length >= STORY_MIN && has("before") && has("after") ? j : null;
        };
        const job = lead
          ? null
          : jobId
            ? { jobId: String(jobId), assets: jobInOrder(photos.filter((a: { jobId?: string }) => a.jobId === jobId)) }
            : shape !== "explainer" && oneProject
              ? // A story's job: one the fitting photos come from, when one has enough photos.
                storyJob_(
                  pickJob(
                  fitting ? photos.filter((a: { jobId?: string }) => a.jobId && fitting.some((f: { jobId?: string }) => f.jobId === a.jobId)) : photos,
                  hook.scope,
                  requestId ? new Set<string>() : used,
                  REEL_CANDIDATES,
                  want,
                  works,
                  ),
                )
              : null;
        if (job) {
          // With photos that fit the idea, the project's finished photos are only those: its befores and work in
          // progress still tell the story, but a finish that doesn't show the idea isn't offered (and can't crowd out
          // the ones that do).
          const fitIds = new Set((fitting ?? []).map((f: { _id: string }) => f._id));
          const finish = (p: { tags: string[] }) => p.tags.includes("after") || !(p.tags.includes("before") || p.tags.includes("process"));
          const jobPhotos = fitting ? photos.filter((a: { jobId?: string }) => a.jobId === job.jobId) : [];
          const assets = fitting ? jobInOrder(jobPhotos.filter((p: { _id: string; tags: string[] }) => fitIds.has(p._id) || !finish(p))) : job.assets;
          picked.assets.splice(0, picked.assets.length, ...assets);
          picked.inScope = true;
        }
        // A range: no one project gives more than a couple of photos, so several are seen.
        const range = !job && !lead && shape !== "explainer" && !quickOne;
        if (range) {
          const per = new Map<string, number>();
          const kept = picked.assets.filter((a: { jobId?: string }) => {
            if (!a.jobId) return true;
            per.set(a.jobId, (per.get(a.jobId) ?? 0) + 1);
            return per.get(a.jobId)! <= RANGE_PER_PROJECT;
          });
          if (kept.length >= 3) picked.assets.splice(0, picked.assets.length, ...kept);
        }
        if (picked.assets.length === 0) {
          const why = jobId ? "the job asked for has no photos to show yet" : `no photo tagged ${hook.scope}, and no process or crew photo left`;
          skipped.push(`${label}: ${why}`);
          if (only) await ctx.runMutation(internal.ads.ideaNotMade, { hookId: hook._id, why });
          continue;
        }
        // A quick offer shows one job: a before and its after, or one finished photo.
        const offered = quick ? pickOfferPhotos(picked.assets) : picked.assets;
        try {
          await makeAd(hook, quick ? NEW_AD_STYLE : shape, quick, offered, picked.inScope, range);
          made += 1;
          if (!quick && shape !== "explainer" && !storyHook) {
            storyHook = hook;
            if (job) storyJob = job.assets;
          }
        } catch (e) {
          skipped.push(`${label}: ${errText(e)}`);
          if (only) await ctx.runMutation(internal.ads.ideaNotMade, { hookId: hook._id, why: errText(e) });
        }
      }
      // Each week also asks people who have seen us before: a quick offer on one job from the week's story.
      if (storyHook && (quickToo || (!only && cfg.quickOffer))) {
        // The same job as the story is welcome here: the offer is for people who have seen it.
        // From the story's own job when it had one.
        const fromJob = storyJob ? pickOfferPhotos(storyJob) : [];
        const offered = fromJob.length ? fromJob : pickOfferPhotos(pickAssets(photos, storyHook.scope, new Set<string>(), REEL_CANDIDATES, []).assets);
        if (offered.length) {
          try {
            await makeAd(storyHook, NEW_AD_STYLE, true, offered, true);
          } catch (e) {
            skipped.push(`Quick offer: ${errText(e)}`);
          }
        }
      }
      await ctx.runMutation(internal.ads.noteSkipped, { batchId, skipped });
      if (made === 0) throw new Error(`No ad could be made. ${skipped.join(" ")}`);
    } catch (e) {
      await ctx.runMutation(internal.ads.failBatch, { batchId, error: errText(e) });
    }
  },
});

/**
 * Asks Claude for a plan about some photos and checks it. The photos go in
 * as image blocks, each after a "Photo N" label so the numbers in the reply
 * point at the right one. One retry with the problems named.
 */
async function writePlan<P extends { fits?: boolean; reason?: string }>(
  prompt: string,
  photos: Array<Candidate & { _id: string }>,
  what: string,
  problemsOf: (plan: P) => string[],
): Promise<P> {
  const content: unknown[] = [{ type: "text", text: prompt }];
  photos.forEach((f, i) => content.push({ type: "text", text: `Photo ${i + 1}:` }, { type: "image", source: { type: "url", url: f.imageUrl } }));
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const ask =
      attempt === 0
        ? content
        : [...content, { type: "text", text: `Your last answer had these problems: ${problems.join("; ")}. Fix them and answer again with JSON only.` }];
    const reply = await claudeReply(ask, SHOT_LIST_TOKENS);
    const plan = parseJson<P>(reply.text);
    if (!plan) {
      // What came back instead, so the skip on the page says what to fix.
      const began = reply.text.replace(/\s+/g, " ").trim().slice(0, 120);
      problems = [reply.cutOff ? "the reply wasn't JSON: it was cut off before it finished" : `the reply wasn't JSON${began ? `: it began "${began}"` : ": it was empty"}`];
      continue;
    }
    if (plan.fits === false) throw new Error(`Claude passed: ${plan.reason ?? "the photos don't fit the hook"}`);
    problems = problemsOf(plan);
    if (problems.length === 0) return plan;
  }
  throw new Error(`the ${what} still broke the rules: ${problems.join("; ")}`);
}

/** The voice-over for one hook, from ElevenLabs, shared by both sizes. */
/**
 * How the narrator reads. Lower stability lets the read rise and fall instead of holding one flat tone; a little
 * style adds the voice's own expression; similarity keeps it sounding like itself.
 */
const VOICE_SETTINGS = { stability: 0.35, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.0 };
/** The model the narrator reads with, and the one used when it can't time the words. */
const VOICE_MODELS = ["eleven_v4", "eleven_multilingual_v2"];

/** Whether each reel showing a before and after of one job also gets a still of that pair. */
export const setStills = internalMutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { stills: on });
    else fail("INVALID", "Save the ad settings once first");
    return { stills: on };
  },
});

/** From a cloud session: words added to or taken out of the niche search (beside the saved ones), and the weekly switch. */
export const setResearch = internalMutation({
  args: { addWords: v.optional(v.array(v.string())), removeWords: v.optional(v.array(v.string())), weekly: v.optional(v.boolean()) },
  handler: async (ctx, { addWords, removeWords, weekly }) => {
    const row = await settingsRow(ctx);
    if (!row) fail("INVALID", "Save the ad settings once first");
    const now = research(row).researchKeywords;
    const out = new Set((removeWords ?? []).map((w) => w.trim().toLowerCase()));
    const words = [...new Set([...now, ...(addWords ?? []).map((w) => w.trim()).filter(Boolean)])].filter((w) => !out.has(w.toLowerCase()));
    await ctx.db.patch(row!._id, { researchKeywords: words, ...(weekly === undefined ? {} : { researchMonthly: weekly }), updatedAt: nowIso() });
    return { researchKeywords: words, weekly: weekly ?? research(row).researchMonthly };
  },
});

/** The narrator the owner picked from the samples. */
export const setVoice = internalMutation({
  args: { voiceId: v.string() },
  handler: async (ctx, { voiceId }) => {
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { voiceId });
    else fail("INVALID", "Save the ad settings once first");
    return { voiceId };
  },
});

/** What the ElevenLabs plan on file allows, and the voices it can use: read only, nothing is spent. */
export const voicePlan = internalAction({
  args: {},
  handler: async () => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { error: "ELEVENLABS_API_KEY isn't set" };
    const get = async (path: string) => {
      const res = await fetch(`https://api.elevenlabs.io${path}`, { headers: { "xi-api-key": key } });
      return res.ok ? await res.json() : { status: res.status, error: (await res.text()).slice(0, 200) };
    };
    const sub = await get("/v1/user/subscription");
    const voices = await get("/v1/voices");
    const models = await get("/v1/models");
    return {
      plan: { tier: sub.tier, used: sub.character_count, limit: sub.character_limit, resetsAt: sub.next_character_count_reset_unix, status: sub.status, error: sub.error },
      voices: (voices.voices ?? []).map((x: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }) => ({
        id: x.voice_id,
        name: x.name,
        category: x.category,
        labels: x.labels,
      })),
      models: Array.isArray(models) ? models.map((m: { model_id: string; can_do_text_to_speech?: boolean }) => ({ id: m.model_id, tts: m.can_do_text_to_speech })) : models,
    };
  },
});

/** One script read by several voices, for the owner to choose between. Each read is stored and its link returned. */
export const voiceSamples = internalAction({
  args: { text: v.string(), voiceIds: v.array(v.string()), model: v.optional(v.string()), lines: v.optional(v.array(v.string())) },
  handler: async (ctx, { text, voiceIds, model, lines }) => {
    // With lines: one read by the first voice, timed line by line and word by word, the way an ad is read, for drawing a sample.
    if (lines?.length) {
      const say = (m: string) =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceIds[0])}/with-timestamps?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          body: JSON.stringify({ text: lines.join(" "), model_id: m, voice_settings: VOICE_SETTINGS }),
        });
      let res = await say(model ?? VOICE_MODELS[0]);
      if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 401) res = await say(VOICE_MODELS[1]);
      const body = await readJson(res, "ElevenLabs");
      if (!body?.audio_base64) throw new Error("ElevenLabs sent no audio");
      const bytes = Uint8Array.from(atob(body.audio_base64), (ch) => ch.charCodeAt(0));
      const id = await ctx.storage.store(new Blob([bytes], { type: "audio/mpeg" }));
      const alignment = (body.alignment ?? null) as Alignment | null;
      const timed = shotTimings(lines, alignment, Math.max(8, lines.join(" ").split(/\s+/).length / 2.6));
      return [{ voiceId: voiceIds[0], url: await ctx.storage.getUrl(id), durationSec: timed.durationSec, shots: timed.shots, words: wordTimings(lines, alignment) }];
    }
    const out: Array<{ voiceId: string; url?: string | null; error?: string }> = [];
    for (const voiceId of voiceIds.slice(0, 4)) {
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          body: JSON.stringify({ text: text.slice(0, 600), model_id: model ?? "eleven_multilingual_v2", voice_settings: VOICE_SETTINGS }),
        });
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
        const id = await ctx.storage.store(new Blob([await res.arrayBuffer()], { type: "audio/mpeg" }));
        out.push({ voiceId, url: await ctx.storage.getUrl(id) });
      } catch (e) {
        out.push({ voiceId, error: errText(e) });
      }
    }
    return out;
  },
});

export const voice = internalAction({
  args: { ids: v.array(v.id("adCreatives")) },
  handler: async (ctx, { ids }) => {
    if (ids.length === 0) return;
    const first: CreativeInput | null = await ctx.runQuery(internal.ads.creativeInput, { id: ids[0] });
    if (!first) return;
    const cfg = await ctx.runQuery(internal.ads.config, {});
    // A real person reads it instead: the order goes out now and the read comes back later (voiceActors.ts).
    if (cfg.voiceSource === "actor") {
      await ctx.scheduler.runAfter(0, internal.voiceActors.order, { ids });
      return;
    }
    try {
      const voiceId = cfg.voiceId;
      if (!voiceId) throw new Error("No ElevenLabs voice chosen in Ops → Ads → Settings");
      const lines = linesOf(first);
      // The text read is the lines joined by single spaces, which is what shotTimings counts characters against.
      // The newer model reads with more life; if it won't give word timings, the older one does.
      const say = (model: string) =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          body: JSON.stringify({ text: lines.join(" "), model_id: model, voice_settings: VOICE_SETTINGS }),
        });
      let res = await say(VOICE_MODELS[0]);
      if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 401) res = await say(VOICE_MODELS[1]);
      const body = await readJson(res, "ElevenLabs");
      if (!body?.audio_base64) throw new Error("ElevenLabs sent no audio");
      const bytes = Uint8Array.from(atob(body.audio_base64), (ch) => ch.charCodeAt(0));
      const audioStorageId = await ctx.storage.store(new Blob([bytes], { type: "audio/mpeg" }));
      await useRead(ctx, ids, first, audioStorageId, (body.alignment ?? null) as Alignment | null);
    } catch (e) {
      for (const id of ids) await ctx.runMutation(internal.ads.patchCreative, { id, status: "failed", error: errText(e) });
      await ctx.runMutation(internal.ads.finishIfDone, { batchId: first.batchId });
    }
  },
});

const graph = async (path: string, params: Record<string, unknown>, what: string, token: string) => {
  const form = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) form.set(k, typeof val === "string" ? val : JSON.stringify(val));
  form.set("access_token", token);
  return await readJson(await fetch(`${GRAPH}/${path}`, { method: "POST", body: form }), what);
};

/** The Meta token: META_ACCESS_TOKEN on the deployment, else the one pasted in Settings (sealed). */
export async function metaToken(ctx: ActionCtx): Promise<string | undefined> {
  if (process.env.META_ACCESS_TOKEN) return process.env.META_ACCESS_TOKEN;
  const enc: string | null = await ctx.runQuery(internal.ads.metaTokenSealed, {});
  return enc ? await openSealed(enc) : undefined;
}

export const metaTokenSealed = internalQuery({
  args: {},
  handler: async (ctx) => (await settingsRow(ctx))?.metaTokenEnc ?? null,
});

/** Only the owner (a super admin) pastes or reads Meta's key, from an action. */
export const ownerOnly = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return true;
  },
});

/** A Graph API read with the token; Meta's own message when it says no. */
export async function graphGet(path: string, token: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error?.message ? `Meta: ${body.error.message}` : `Meta answered ${res.status}`);
  return body;
}

/**
 * The owner pastes the Meta token in Settings: Meta is asked who it belongs to first (a wrong or expired token is
 * turned away with Meta's reason), then it is sealed and stored. Only its last four characters are ever shown.
 */
export const saveMetaToken = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ name: string }> => {
    await ctx.runQuery(internal.ads.ownerOnly, {});
    const clean = token.trim().replace(/^Bearer\s+/i, "");
    if (clean.length < 20 || /\s/.test(clean)) fail("INVALID", "That doesn't look like a Meta token. Copy the whole token and paste it again.");
    const me = await graphGet("me?fields=id,name", clean).catch((e) => fail("INVALID", `Meta didn't accept that token. ${errText(e)}`));
    await ctx.runMutation(internal.ads.storeMetaToken, { enc: await seal(clean), hint: clean.slice(-4) });
    return { name: String(me?.name ?? me?.id ?? "") };
  },
});

export const storeMetaToken = internalMutation({
  args: { enc: v.optional(v.string()), hint: v.optional(v.string()) },
  handler: async (ctx, { enc, hint }) => {
    const row = await settingsRow(ctx);
    const fields = { metaTokenEnc: enc, metaTokenHint: enc ? hint : undefined, metaTokenSetAt: enc ? nowIso() : undefined, updatedAt: nowIso() };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("adSettings", { ...DEFAULTS, ...fields });
  },
});

/** Takes the pasted Meta token away. */
export const removeMetaToken = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { metaTokenEnc: undefined, metaTokenHint: undefined, metaTokenSetAt: undefined, updatedAt: nowIso() });
  },
});

/**
 * One search of Meta's Ad Library through its API (ads_archive) with the token, from the deployment: to see whether
 * Meta returns ordinary ads for a search in a country, so competitor research could use it instead of reading the
 * Ad Library pages. Returns what came back, or Meta's reason it said no.
 */
export const adLibraryProbe = internalAction({
  args: { terms: v.string(), country: v.optional(v.string()), adType: v.optional(v.string()) },
  handler: async (ctx, { terms, country = "US", adType = "ALL" }) => {
    const token = await metaToken(ctx);
    if (!token) return { ok: false, error: "No Meta token yet" };
    const q = new URLSearchParams({
      search_terms: terms,
      ad_reached_countries: JSON.stringify([country]),
      ad_type: adType,
      ad_active_status: "ALL",
      fields: "page_name,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_snapshot_url",
      limit: "25",
    });
    try {
      const out = await graphGet(`ads_archive?${q.toString()}`, token);
      const ads: any[] = out?.data ?? [];
      return {
        ok: true,
        count: ads.length,
        more: Boolean(out?.paging?.next),
        ads: ads.slice(0, 10).map((a) => ({
          page: a.page_name,
          started: a.ad_delivery_start_time,
          stopped: a.ad_delivery_stop_time,
          text: String(a.ad_creative_bodies?.[0] ?? "").slice(0, 140),
        })),
      };
    } catch (e) {
      return { ok: false, error: errText(e) };
    }
  },
});

/** The homeowner brand's privacy page on this backend's own address (lib/privacyRoute.ts), for Meta's links. */
const privacyUrl = () => `${(process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/privacy`;

/**
 * The instant form for the brand's ads, made in Meta from here: the brand's words, the questions a painter needs, the
 * brand's privacy page, and the call-and-text line the app's own forms read out (lib/calls.ts consentLine). It is
 * saved as the form new ads use. From the deployment, once the Page is picked in Settings.
 */
export const createLeadForm = internalAction({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const token = await metaToken(ctx);
    const cfg = await ctx.runQuery(internal.ads.config, {});
    if (!token || !cfg.pageId) return { ok: false, error: "Set the Meta token and the Page first" };
    const brand = consumerBrand();
    try {
      // Forms are made with the Page's own token.
      const pages = await graphGet("me/accounts?fields=id,access_token&limit=50", token);
      const page = (pages?.data ?? []).find((p: { id: string }) => String(p.id) === cfg.pageId);
      if (!page?.access_token) return { ok: false, error: "The token can't reach the Page" };
      const form = await graph(
        `${cfg.pageId}/leadgen_forms`,
        {
          name: name ?? `${brand} – Free painting quote`,
          locale: "en_US",
          block_display_for_non_targeted_viewer: true,
          context_card: {
            title: "Free painting quote",
            style: "PARAGRAPH_STYLE",
            content: [`Tell us what you'd like painted and a local painter from the ${brand} network will reach out about a free quote. Midland, Odessa and nearby.`],
          },
          questions: [
            { type: "FULL_NAME" },
            { type: "PHONE" },
            { type: "EMAIL" },
            { type: "ZIP" },
            {
              type: "CUSTOM",
              key: "work",
              label: "What would you like painted?",
              options: [
                { key: "interior", value: "Inside (rooms, walls)" },
                { key: "exterior", value: "Outside of the house" },
                { key: "cabinets", value: "Cabinets" },
                { key: "other", value: "Something else" },
              ],
            },
          ],
          privacy_policy: { url: privacyUrl(), link_text: `${brand} Privacy Policy` },
          custom_disclaimer: {
            title: "Before you send",
            body: {
              text: `By tapping Submit, you agree that one local painting company from the ${brand} network may call or text you at this number about this job. Message and data rates may apply. Reply STOP to opt out.`,
            },
          },
          thank_you_page: {
            title: "Thanks! We got your request.",
            body: `A local painter from the ${brand} network will call or text you soon.`,
            button_type: "VIEW_ON_FACEBOOK",
            button_text: "Done",
          },
        },
        "Meta instant form",
        page.access_token,
      );
      await ctx.runMutation(internal.ads.setLeadForm, { leadFormId: String(form.id) });
      return { ok: true, id: String(form.id), privacy: privacyUrl() };
    } catch (e) {
      return { ok: false, error: errText(e) };
    }
  },
});

export const setLeadForm = internalMutation({
  args: { leadFormId: v.string() },
  handler: async (ctx, { leadFormId }) => {
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { leadFormId, updatedAt: nowIso() });
  },
});

type MetaPick = { id: string; name: string; status?: string };

/**
 * What the token can reach, for the owner to tap instead of typing numbers: the ad accounts with their ad sets
 * (and each one's campaign), and the Pages with their instant forms. A part Meta won't show is left out, with why.
 */
export const metaLookup = action({
  args: {},
  handler: async (ctx): Promise<{
    who: string;
    accounts: Array<MetaPick & { adsets: Array<MetaPick & { campaign?: string }> }>;
    pages: Array<MetaPick & { forms: MetaPick[] }>;
    problems: string[];
  }> => {
    await ctx.runQuery(internal.ads.ownerOnly, {});
    const token = await metaToken(ctx);
    if (!token) fail("INVALID", "Paste the Meta token first");
    const problems: string[] = [];
    const me = await graphGet("me?fields=id,name", token);
    const accounts: Array<MetaPick & { adsets: Array<MetaPick & { campaign?: string }> }> = [];
    try {
      const list = await graphGet("me/adaccounts?fields=account_id,name,account_status&limit=50", token);
      for (const a of (list?.data ?? []).slice(0, 10)) {
        const adsets: Array<MetaPick & { campaign?: string }> = [];
        try {
          const sets = await graphGet(`act_${a.account_id}/adsets?fields=id,name,status,campaign{name}&limit=50`, token);
          for (const x of sets?.data ?? []) adsets.push({ id: String(x.id), name: String(x.name ?? x.id), status: x.status, campaign: x.campaign?.name });
        } catch (e) {
          problems.push(`Ad sets of ${a.name ?? a.account_id}: ${errText(e)}`);
        }
        accounts.push({ id: String(a.account_id), name: String(a.name ?? a.account_id), status: a.account_status === 1 ? "ACTIVE" : String(a.account_status ?? ""), adsets });
      }
    } catch (e) {
      problems.push(`Ad accounts: ${errText(e)}`);
    }
    const pages: Array<MetaPick & { forms: MetaPick[] }> = [];
    try {
      const list = await graphGet("me/accounts?fields=id,name,access_token&limit=50", token);
      for (const p of (list?.data ?? []).slice(0, 10)) {
        const forms: MetaPick[] = [];
        try {
          // Instant forms are read with the Page's own token.
          const fs = await graphGet(`${p.id}/leadgen_forms?fields=id,name,status&limit=50`, p.access_token ?? token);
          for (const f of fs?.data ?? []) forms.push({ id: String(f.id), name: String(f.name ?? f.id), status: f.status });
        } catch (e) {
          problems.push(`Instant forms of ${p.name ?? p.id}: ${errText(e)}`);
        }
        pages.push({ id: String(p.id), name: String(p.name ?? p.id), forms });
      }
    } catch (e) {
      problems.push(`Pages: ${errText(e)}`);
    }
    return { who: String(me?.name ?? me?.id ?? ""), accounts, pages, problems };
  },
});

/**
 * Sends drawn ads into Meta as paused ads, by name, from the deployment: for ads drawn before the Meta account was
 * set up. Ads already in Meta, and ones not drawn yet, are left as they are. Five seconds apart.
 */
export const sendToMeta = internalMutation({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const sent: string[] = [];
    const skipped: string[] = [];
    for (const name of names) {
      const c = await ctx.db.query("adCreatives").withIndex("by_name", (q) => q.eq("name", name)).first();
      if (!c || c.meta?.adId || c.status !== "rendered") {
        skipped.push(`${name}: ${!c ? "not found" : c.meta?.adId ? "already in Meta" : c.status}`);
        continue;
      }
      await ctx.db.patch(c._id, { error: undefined });
      await ctx.scheduler.runAfter(sent.length * 5000, internal.ads.publishPaused, { id: c._id });
      sent.push(name);
    }
    return { sent, skipped };
  },
});

/** A file's bytes as base64, for Meta's image upload (no Buffer in Convex's default runtime). */
async function base64Of(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't read the still (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Puts a rendered creative into Meta as a PAUSED ad. A video: the video, then the creative, then the ad. A still: the
 * picture (as an ad image), then an image creative with the same words and the quote form, then the ad.
 */
export const publishPaused = internalAction({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    const c: CreativeInput | null = await ctx.runQuery(internal.ads.creativeInput, { id });
    if (!c || !(c.videoUrl || (c.kind === "image" && c.imageUrl))) return;
    const cfg = await ctx.runQuery(internal.ads.config, {});
    const adsetId = cfg.adsetId;
    const token = await metaToken(ctx);
    if (!token || !cfg.adAccountId || !cfg.pageId || !adsetId) {
      // Rendered and watchable in Ops; it goes to Meta by hand until the account is set up.
      await ctx.runMutation(internal.ads.patchCreative, {
        id,
        error: "Meta isn't set up (token, ad account, page and ad set), so this one wasn't created there",
      });
      await ctx.runMutation(internal.ads.finishIfDone, { batchId: c.batchId });
      return;
    }
    try {
      const act = `act_${cfg.adAccountId}`;
      // Meta's own changes to an ad, each turned off: the ad runs as it was made (real photos, our words). Only the
      // features Meta's API still takes for a video ad (it turned away the older names, Nov 2026).
      const features = {
        image_animation: { enroll_status: "OPT_OUT" },
        text_overlay_translation: { enroll_status: "OPT_OUT" },
        profile_card: { enroll_status: "OPT_OUT" },
      };
      const cta = { type: "GET_QUOTE", ...(cfg.leadFormId ? { value: { lead_gen_form_id: cfg.leadFormId } } : {}) };
      let creative: { id: string };
      if (!c.videoUrl && c.imageUrl) {
        const up = await graph(`${act}/adimages`, { bytes: await base64Of(c.imageUrl), name: `${c.name}.png` }, "Meta image upload", token);
        const hash: string | undefined = (Object.values(up?.images ?? {})[0] as { hash?: string } | undefined)?.hash;
        if (!hash) throw new Error("Meta took the still but gave no image hash");
        creative = await graph(
          `${act}/adcreatives`,
          {
            name: c.name,
            object_story_spec: {
              page_id: cfg.pageId,
              // A lead ad's link is Meta's placeholder: the button opens the quote form, not a page.
              link_data: { image_hash: hash, link: "http://fb.me/", name: c.script.headline, message: c.script.primaryText, call_to_action: cta },
            },
            degrees_of_freedom_spec: { creative_features_spec: features },
          },
          "Meta creative",
          token,
        );
      } else {
      const video = c.meta?.videoId
        ? { id: c.meta.videoId }
        : await graph(`${act}/advideos`, { file_url: c.videoUrl, name: c.name, title: c.name }, "Meta video upload", token);
      await ctx.runMutation(internal.ads.patchCreative, { id, meta: { videoId: video.id } });
      const first = c.assets[0];
      const poster = first?.posterUrl ?? (first?.kind === "photo" ? first.url : undefined) ?? `${siteUrl()}/og-image.png`;
      creative = await graph(
        `${act}/adcreatives`,
        {
          name: c.name,
          object_story_spec: {
            page_id: cfg.pageId,
            video_data: {
              video_id: video.id,
              image_url: poster,
              title: c.script.headline,
              message: c.script.primaryText,
              call_to_action: cta,
            },
          },
          degrees_of_freedom_spec: { creative_features_spec: features },
        },
        "Meta creative",
        token,
      );
      }
      const ad = await graph(`${act}/ads`, { name: c.name, adset_id: adsetId, creative: { creative_id: creative.id }, status: "PAUSED" }, "Meta ad", token);
      await ctx.runMutation(internal.ads.patchCreative, {
        id,
        status: "paused",
        error: undefined,
        meta: { creativeId: creative.id, adId: ad.id, adsetId },
      });
    } catch (e) {
      await ctx.runMutation(internal.ads.patchCreative, { id, error: errText(e) });
    }
    await ctx.runMutation(internal.ads.finishIfDone, { batchId: c.batchId });
  },
});

/** ACTIVE or PAUSED on the ad in Meta, after staff tap Approve or Retire. */
export const setAdStatus = internalAction({
  args: { id: v.id("adCreatives"), status: v.union(v.literal("ACTIVE"), v.literal("PAUSED")) },
  handler: async (ctx, { id, status }) => {
    const c: CreativeInput | null = await ctx.runQuery(internal.ads.creativeInput, { id });
    const token = await metaToken(ctx);
    if (!c?.meta?.adId || !token) return;
    try {
      await graph(c.meta.adId, { status }, "Meta ad status", token);
    } catch (e) {
      await ctx.runMutation(internal.ads.patchCreative, { id, error: `Meta didn't take the change: ${errText(e)}` });
    }
  },
});

// ----------------------------------------------------- Create an ad: one static image at a time

/** The types of static image ad on offer, and what an ad may be about, for the Create ads window. */
export const imageAdTypes = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    return {
      types: IMAGE_AD_TYPES.map((t) => ({ key: t.key, label: t.label, blurb: t.blurb })),
      services: adServicesOf(tradeOf(trade).slug).map((s) => ({ key: s.key, label: s.label })),
    };
  },
});

type ImagePick = ImageCandidate & { ids: Id<"adAssets">[]; urls: string[] };

/** What one image ad is written from: the photos (or pairs) to choose from, and the competitor ad to model. */
export const imageAdInput = internalQuery({
  args: {
    service: v.string(),
    type: v.string(),
    swipeId: v.optional(v.id("adSwipes")),
    trade: v.optional(v.string()),
    // fresh: no competitor ad at all. Otherwise, with no swipeId, the best long-running one is chosen.
    fresh: v.optional(v.boolean()),
    // Competitor ads this set has already been built on, so each ad in it takes another.
    skipSwipes: v.optional(v.array(v.id("adSwipes"))),
    // Photos the ads made just before this one in the same set show: this one shows others.
    skipAssets: v.optional(v.array(v.id("adAssets"))),
  },
  handler: async (ctx, { service: serviceKey, type: key, swipeId, trade: slug, fresh, skipSwipes, skipAssets }) => {
    const type = imageAdType(key);
    if (!type) fail("INVALID", "That isn't a type of image ad");
    const trade = tradeOf(slug);
    const service = adServiceOf(trade.slug, serviceKey);
    if (!service) fail("INVALID", "Choose what the ad is about");
    const row = await settingsRow(ctx);
    // Only photos of the service: an ad about cabinet painting never shows a staircase.
    const ofService = (a: Doc<"adAssets">) => a.tags.some((t) => service!.works.includes(t));
    const photos = (await ctx.db.query("adAssets").take(500)).filter((a) => a.kind === "photo" && inTrade(a, trade.slug) && a.description);
    const drawable: typeof photos = [];
    const urlOf = new Map<string, string>();
    for (const a of photos) {
      const url = await lookUrl(ctx, a);
      if (url) {
        drawable.push(a);
        urlOf.set(a._id, url);
      }
    }
    // The owner's best first, then the least used: so the same photo doesn't head every list.
    const order = (a: Doc<"adAssets">, b: Doc<"adAssets">) => Number(!!b.best) - Number(!!a.best) || (a.uses ?? 0) - (b.uses ?? 0) || b.createdAt.localeCompare(a.createdAt);
    const before = (a: Doc<"adAssets">) => a.tags.includes("before") && !a.tags.includes("after");
    const picks: ImagePick[] = [];
    if (type!.layout === "pair") {
      const byKey = new Map<string, Doc<"adAssets">[]>();
      for (const a of drawable) if (a.pairKey) byKey.set(a.pairKey, [...(byKey.get(a.pairKey) ?? []), a]);
      const pairs: Array<[Doc<"adAssets">, Doc<"adAssets">]> = [];
      for (const halves of byKey.values()) {
        const b = halves.find(before);
        const a = halves.find((h) => h.tags.includes("after") && !h.tags.includes("before"));
        if (b && a && ofService(a)) pairs.push([b, a]);
      }
      pairs.sort(([, x], [, y]) => order(x, y));
      for (const [b, a] of pairs.slice(0, 60))
        picks.push({ n: picks.length + 1, tags: a.tags, description: a.description!, before: b.description, uses: Math.max(a.uses ?? 0, b.uses ?? 0), best: a.best || b.best, ids: [b._id, a._id], urls: [urlOf.get(b._id)!, urlOf.get(a._id)!] });
    } else {
      // Finished work only: never a before, never work in progress, never two pictures in one.
      const all = drawable.filter((a) => ofService(a) && !a.tags.includes("before") && !a.tags.includes("process")).sort(order);
      // The owner's best shots are always offered, however many ads they are in: those are the ones to keep showing.
      // Of the rest, with plenty that no ad has used yet, only the unused, so ordinary photos aren't repeated.
      const best = all.filter((a) => a.best);
      const unused = all.filter((a) => !a.best && (a.uses ?? 0) === 0);
      const finished = best.length + unused.length >= UNUSED_ENOUGH ? [...best, ...unused] : all;
      // Each project a short name of its own (P1, P2...); a photo in no project counts as its own.
      const names = new Map<string, string>();
      const projectOf = (a: Doc<"adAssets">) => {
        const key = a.jobId ?? a._id;
        if (!names.has(key)) names.set(key, `P${names.size + 1}`);
        return names.get(key)!;
      };
      for (const a of finished.slice(0, 120))
        picks.push({ n: picks.length + 1, tags: a.tags, description: a.description!, uses: a.uses ?? 0, best: a.best, project: projectOf(a), ids: [a._id], urls: [urlOf.get(a._id)!] });
    }
    // The competitor ads for this service: the one to build on (the owner's pick, else the best long-running image
    // ad taking its turn), the rest of the best as what's working, and the category's playbook.
    const onFile = fresh ? [] : (await ctx.db.query("adSwipes").take(1000)).filter((s) => inTrade(s, trade.slug));
    const auto = pickImageModels(onFile, service!.scope, skipSwipes ?? []);
    const x = fresh ? null : swipeId ? await ctx.db.get(swipeId) : (auto.model ?? null);
    // Ads in one set don't share photos: what the earlier ones show is left out, while enough is left to make this one.
    const taken = new Set<string>(skipAssets ?? []);
    const open = picks.filter((p) => !p.ids.some((id) => taken.has(id)));
    const enough = type!.layout === "grid" ? 3 : 1;
    const offered = (open.length >= enough ? open : picks).map((p, i) => ({ ...p, n: i + 1 }));
    const playbook = fresh ? undefined : (await ctx.db.query("adPlaybooks").take(20)).find((p) => p.scope === service!.scope)?.text;
    return {
      trade: trade.slug,
      brand: consumerBrand(),
      town: research(row).researchMarkets[0] ?? "your town",
      picks: offered,
      basedOn: x ? { company: x.company, angle: x.hook, offer: x.offer, daysRunning: runDays(x), words: swipeWords(x.transcript) ?? swipeWords(x.adCopy) } : undefined,
      swipeId: x?._id,
      field: auto.field.filter((f) => f._id !== x?._id).map((f) => ({ company: f.company, angle: f.hook, offer: f.offer, daysRunning: runDays(f), image: isImageSwipe(f) })),
      playbook,
      imageAds: auto.imageAds,
      scope: service!.scope,
      service: service!,
    };
  },
});

/**
 * The owner makes one static image ad: its type, and optionally the competitor ad to model. Claude chooses the photo
 * (or pair, or three or four for a showcase) from what each shows and writes the headline, the line under it and the
 * text above; the banned claims and the length are checked, with one retry. It is then drawn and put into Meta
 * paused, like any other ad. Nothing is spoken, so there is no voice step.
 */
export const createImageAd = action({
  // count: how many to make in one go (1 to 6), each with different photos and a different angle.
  args: { service: v.string(), type: v.string(), swipeId: v.optional(v.id("adSwipes")), fresh: v.optional(v.boolean()), trade: v.optional(v.string()), count: v.optional(v.number()) },
  handler: async (ctx, { count, ...args }): Promise<{ made: Array<{ name: string; headline: string; builtOn?: string }>; missed: string[] }> => {
    const me: Id<"users"> = await ctx.runQuery(internal.ads.ownerId, {});
    return await makeImageAds(ctx, args, Math.max(1, Math.min(IMAGE_ADS_AT_ONCE, Math.round(count ?? 1))), me);
  },
});

/** With at least this many finished photos no ad has used, an image ad is offered only those. */
const UNUSED_ENOUGH = 12;

/** The most image ads made in one go. */
export const IMAGE_ADS_AT_ONCE = 6;

/** Several of one type, one after another: each sees what the ones before it used, so photos and angles differ. */
async function makeImageAds(ctx: ActionCtx, args: { service: string; type: string; swipeId?: Id<"adSwipes">; fresh?: boolean; trade?: string }, count: number, me?: Id<"users">) {
  const made: Array<{ name: string; headline: string; builtOn?: string }> = [];
  const missed: string[] = [];
  const usedSwipes: Id<"adSwipes">[] = [];
  const usedAssets: Id<"adAssets">[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const one = await makeImageAd(ctx, args, me, made.map((m) => m.headline), usedSwipes, usedAssets);
      if (one.swipeId) usedSwipes.push(one.swipeId);
      usedAssets.push(...one.assetIds);
      made.push({ name: one.name, headline: one.headline, builtOn: one.builtOn });
    } catch (e) {
      // The first failing stops nothing made before it; with none made, the reason is the owner's to see.
      if (made.length === 0) throw e;
      missed.push(errText(e));
    }
  }
  return { made, missed };
}

/** The same from a cloud session (the deploy workflow), to make one or to check the live library. */
export const createImageAdOutside = internalAction({
  args: { service: v.string(), type: v.string(), swipeId: v.optional(v.id("adSwipes")), fresh: v.optional(v.boolean()), trade: v.optional(v.string()), count: v.optional(v.number()) },
  handler: async (ctx, { count, ...args }) => await makeImageAds(ctx, args, Math.max(1, Math.min(IMAGE_ADS_AT_ONCE, Math.round(count ?? 1)))),
});

async function makeImageAd(ctx: ActionCtx, args: { service: string; type: string; swipeId?: Id<"adSwipes">; fresh?: boolean; trade?: string }, me?: Id<"users">, avoid: string[] = [], skipSwipes: Id<"adSwipes">[] = [], skipAssets: Id<"adAssets">[] = []): Promise<{ name: string; headline: string; builtOn?: string; swipeId?: Id<"adSwipes">; assetIds: Id<"adAssets">[] }> {
  {
    if (!process.env.ANTHROPIC_API_KEY) fail("INVALID", "Set ANTHROPIC_API_KEY on the deployment first");
    const type = imageAdType(args.type);
    if (!type) fail("INVALID", "That isn't a type of image ad");
    // The owner's pick is used for every ad in the set; the app's own choice takes a different one each time.
    const input = await ctx.runQuery(internal.ads.imageAdInput, { ...args, skipSwipes: args.swipeId ? [] : skipSwipes, skipAssets });
    const need = type!.layout === "grid" ? 3 : 1;
    const about = input.service.label.toLowerCase();
    if (input.picks.length < need)
      fail(
        "INVALID",
        type!.layout === "pair"
          ? `No before and after pair of ${about} in the Library yet. Pair a before with its after first.`
          : `Only ${input.picks.length} finished ${about} photo${input.picks.length === 1 ? "" : "s"} with a description in the Library.${type!.layout === "grid" ? " A showcase needs 3 from different projects." : ""}`,
      );
    // First, from descriptions: the few worth looking at. Then those are shown as pictures and chosen by eye.
    const lookMax = type!.layout === "pair" ? IMAGE_LOOK_PAIRS : IMAGE_LOOK_MAX;
    let shown: ImagePick[] = input.picks;
    if (shown.length > lookMax) {
      const listed = readShortlist(await claude([{ type: "text", text: imageShortlistPrompt(type!, input.service, input.picks, lookMax, avoid) }], 2000), input.picks.length);
      const few = listed.slice(0, lookMax).map((n) => input.picks[n - 1]);
      // An unusable answer: the first few as offered (best, then least used).
      shown = few.length >= need ? few : input.picks.slice(0, lookMax);
    }
    shown = shown.map((p, i) => ({ ...p, n: i + 1 }));
    const prompt = imageAdPrompt(type!, input.brand, input.town, tradeOf(input.trade), shown, input.basedOn, new Date(), avoid, input.service, input.field, input.playbook, true);
    const pictures: unknown[] = shown.flatMap((p) =>
      p.urls.flatMap((url, k) => [
        { type: "text", text: type!.layout === "pair" ? `Pair ${p.n}, ${k === 0 ? "before" : "after"}:` : `Photo ${p.n}:` },
        { type: "image", source: { type: "url", url } },
      ]),
    );
    let plan: ImageAdPlan | null = null;
    let problems: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const content: unknown[] = [{ type: "text", text: prompt }, ...pictures];
      if (attempt > 0) content.push({ type: "text", text: `Your last answer had these problems: ${problems.join("; ")}. Fix them and answer again with JSON only.` });
      plan = readImageAd(await claude(content, 3000));
      problems = imageAdProblems(plan, type!, shown, input.town);
      if (problems.length === 0) break;
    }
    if (!plan || problems.length) fail("INVALID", `The ad couldn't be written within the rules: ${problems.join("; ")}`);
    const assetIds = plan!.picks.flatMap((n) => shown[n - 1].ids);
    const name: string = await ctx.runMutation(internal.ads.storeImageAd, {
      type: type!.key,
      trade: input.trade,
      swipeId: input.swipeId,
      scope: input.scope,
      assetIds,
      headline: plan!.headline,
      sub: plan!.sub,
      primaryText: plan!.primaryText,
      title: plan!.title || plan!.headline,
      startedBy: me,
    });
    const days = input.basedOn?.daysRunning;
    return { name, headline: plan!.headline, assetIds, swipeId: input.swipeId, builtOn: input.basedOn ? `${input.basedOn.company}${days ? `, ${days} days` : ""}` : undefined };
  }
}

/** The signed-in owner's id (a super admin), for an action. */
export const ownerId = internalQuery({
  args: {},
  handler: async (ctx) => (await requireSuperAdmin(ctx))._id,
});

export const storeImageAd = internalMutation({
  args: {
    type: v.string(),
    trade: v.string(),
    swipeId: v.optional(v.id("adSwipes")),
    scope: v.optional(v.string()),
    assetIds: v.array(v.id("adAssets")),
    headline: v.string(),
    sub: v.string(),
    primaryText: v.string(),
    title: v.string(),
    startedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, a) => {
    const type = imageAdType(a.type)!;
    const trade = tradeOf(a.trade);
    const first = await ctx.db.get(a.assetIds[a.assetIds.length - 1]);
    const scope = a.scope ?? first?.tags.find((t) => trade.scopes.includes(t)) ?? ANY_SCOPE;
    // Its own idea, switched off, so the weekly run never drafts it again.
    const hookId = await ctx.db.insert("adHooks", {
      family: type.family,
      scope,
      trade: trade.slug,
      textEn: a.headline,
      active: false,
      uses: 1,
      wins: 0,
      losses: 0,
      createdAt: nowIso(),
      lastUsedAt: nowIso(),
      ...(a.swipeId ? { swipeId: a.swipeId } : {}),
    });
    // Its turn is taken: the next image ad builds on another of the best.
    if (a.swipeId && (await ctx.db.get(a.swipeId))) await ctx.db.patch(a.swipeId, { lastUsedAt: nowIso() });
    const batchId = await ctx.db.insert("adBatches", { trade: trade.slug, weekOf: weekOf(new Date()), status: "rendering", startedBy: a.startedBy, createdAt: nowIso() });
    // Each new image ad takes the next of the four text layouts, so a set looks varied.
    const before = (await ctx.db.query("adCreatives").order("desc").take(200)).filter((c) => c.still).length;
    let name = `${creativeName(hookId, "4x5", new Date())}_${type.key}`;
    for (let n = 2; (await ctx.db.query("adCreatives").withIndex("by_name", (q) => q.eq("name", name)).first()) !== null; n++)
      name = `${creativeName(hookId, "4x5", new Date())}_${type.key}_${n}`;
    await ctx.db.insert("adCreatives", {
      batchId,
      hookId,
      ratio: "4x5",
      kind: "image",
      name,
      still: { type: type.key, layout: type.layout, sub: a.sub, variant: before % 4 },
      script: { voice: "", onScreen: [a.headline, a.sub], headline: a.title, primaryText: a.primaryText },
      assetIds: a.assetIds,
      // Nothing to voice: it waits to be drawn.
      status: "voiced",
      createdAt: nowIso(),
    });
    for (const id of a.assetIds) {
      const p = await ctx.db.get(id);
      if (p) await ctx.db.patch(id, { uses: (p.uses ?? 0) + 1, lastUsedAt: nowIso() });
    }
    return name;
  },
});

// ----------------------------------------------------- the campaign's on/off switch

/** The ad set the ads go to, and how many approved ads sit in it (turned on in Meta by Approve). */
export const campaignSwitchInput = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await settingsRow(ctx);
    const approved = (
      await ctx.db
        .query("adCreatives")
        .withIndex("by_status", (q) => q.eq("status", "live"))
        .take(500)
    ).filter((c) => c.meta?.adId).length;
    return { adsetId: row?.adsetId, approved };
  },
});

export interface CampaignState {
  campaign: { id: string; name: string; on: boolean };
  adset: { id: string; name: string; on: boolean };
  /** The daily budget in dollars, from the ad set or else the campaign; undefined when the budget is a lifetime one. */
  dailyBudget?: number;
  /** What Meta says is actually happening (ACTIVE, CAMPAIGN_PAUSED, IN_PROCESS...). */
  delivery: string;
  approved: number;
}

const budgetOf = (x: { daily_budget?: string }) => (x?.daily_budget ? Number(x.daily_budget) / 100 : undefined);

async function readCampaign(adsetId: string, token: string, approved: number): Promise<CampaignState> {
  const s = await graphGet(
    `${adsetId}?fields=id,name,status,effective_status,daily_budget,campaign{id,name,status,effective_status,daily_budget}`,
    token,
  );
  const c = s.campaign ?? {};
  return {
    campaign: { id: String(c.id), name: String(c.name ?? c.id), on: c.status === "ACTIVE" },
    adset: { id: String(s.id), name: String(s.name ?? s.id), on: s.status === "ACTIVE" },
    dailyBudget: budgetOf(s) ?? budgetOf(c),
    delivery: String(s.effective_status ?? c.effective_status ?? ""),
    approved,
  };
}

/**
 * The campaign's master switch, read from Meta: whether the ads the owner approved can spend. Approve turns single
 * ads on; nothing spends until this is on too.
 */
export const campaignState = action({
  args: {},
  handler: async (ctx): Promise<CampaignState> => {
    await ctx.runQuery(internal.ads.ownerOnly, {});
    const token = await metaToken(ctx);
    const { adsetId, approved } = await ctx.runQuery(internal.ads.campaignSwitchInput, {});
    if (!token || !adsetId) fail("INVALID", "Connect Meta and pick the ad set in Settings first");
    return await readCampaign(adsetId!, token!, approved);
  },
});

/**
 * The owner turns the campaign on or off from the app. On: the campaign, and its ad set if that's off too, so the
 * approved ads start spending. Off: the campaign only, which stops every ad under it; the ad set and each ad keep
 * their own setting for next time.
 */
export const setCampaign = action({
  args: { on: v.boolean() },
  handler: async (ctx, { on }): Promise<CampaignState> => {
    await ctx.runQuery(internal.ads.ownerOnly, {});
    const token = await metaToken(ctx);
    const { adsetId, approved } = await ctx.runQuery(internal.ads.campaignSwitchInput, {});
    if (!token || !adsetId) fail("INVALID", "Connect Meta and pick the ad set in Settings first");
    const now = await readCampaign(adsetId!, token!, approved);
    try {
      await graph(now.campaign.id, { status: on ? "ACTIVE" : "PAUSED" }, "Meta campaign", token!);
      if (on && !now.adset.on) await graph(now.adset.id, { status: "ACTIVE" }, "Meta ad set", token!);
    } catch (e) {
      fail("INVALID", `Meta didn't take it: ${errText(e)}`);
    }
    return await readCampaign(adsetId!, token!, approved);
  },
});

// ----------------------------------------------------- Meta's numbers (daily)

export const adsInMeta = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("adCreatives").take(1000))
      .filter((c) => c.meta?.adId && (c.status === "paused" || c.status === "live"))
      .map((c) => ({ id: c._id, adId: c.meta!.adId!, baselineCtr: c.baselineCtr, createdAt: c.createdAt })),
});

export const recordInsights = internalMutation({
  args: {
    id: v.id("adCreatives"),
    days: v.array(
      v.object({
        day: v.string(),
        spendCents: v.number(),
        impressions: v.number(),
        reach: v.number(),
        clicks: v.number(),
        frequency: v.number(),
        ctr: v.number(),
        leadsMeta: v.number(),
      }),
    ),
    week: v.object({
      spendCents: v.number(),
      impressions: v.number(),
      clicks: v.number(),
      frequency: v.number(),
      ctr: v.number(),
      leadsMeta: v.number(),
    }),
  },
  handler: async (ctx, { id, days, week }) => {
    const c = await ctx.db.get(id);
    if (c === null) return;
    for (const d of days) {
      const existing = await ctx.db
        .query("adStats")
        .withIndex("by_creative_day", (q) => q.eq("creativeId", id).eq("day", d.day))
        .first();
      if (existing) await ctx.db.patch(existing._id, d);
      else await ctx.db.insert("adStats", { creativeId: id, ...d });
    }
    // The first week with enough impressions sets the bar fatigue is judged against.
    const baselineCtr = c.baselineCtr ?? (week.impressions >= 1000 ? week.ctr : undefined);
    await ctx.db.patch(id, { week: { at: nowIso(), ...week }, ...(baselineCtr !== undefined ? { baselineCtr } : {}) });
  },
});

const leadsIn = (actions: Array<{ action_type: string; value: string }> | undefined) =>
  Number(actions?.find((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped")?.value ?? 0) || 0;

/** Every ad we have in Meta: yesterday and the last seven days, by day and as a week. */
export const pullInsights = internalAction({
  args: {},
  handler: async (ctx) => {
    const metaKey = await metaToken(ctx);
    if (!metaKey) return;
    const ads = await ctx.runQuery(internal.ads.adsInMeta, {});
    const fields = "spend,impressions,reach,clicks,ctr,frequency,actions";
    for (const ad of ads) {
      try {
        const token = `access_token=${encodeURIComponent(metaKey)}`;
        const daily = await readJson(
          await fetch(`${GRAPH}/${ad.adId}/insights?fields=${fields}&date_preset=last_7d&time_increment=1&${token}`),
          "Meta insights",
        );
        const weekly = await readJson(await fetch(`${GRAPH}/${ad.adId}/insights?fields=${fields}&date_preset=last_7d&${token}`), "Meta insights");
        const days = (daily?.data ?? [])
          .filter((r: any) => r.date_start)
          .map((r: any) => ({
            day: r.date_start,
            spendCents: metaCents(r.spend),
            impressions: Number(r.impressions ?? 0),
            reach: Number(r.reach ?? 0),
            clicks: Number(r.clicks ?? 0),
            frequency: Number(r.frequency ?? 0),
            ctr: Number(r.ctr ?? 0),
            leadsMeta: leadsIn(r.actions),
          }));
        const w = weekly?.data?.[0] ?? {};
        await ctx.runMutation(internal.ads.recordInsights, {
          id: ad.id,
          days,
          week: {
            spendCents: metaCents(w.spend),
            impressions: Number(w.impressions ?? 0),
            clicks: Number(w.clicks ?? 0),
            frequency: Number(w.frequency ?? 0),
            ctr: Number(w.ctr ?? 0),
            leadsMeta: leadsIn(w.actions),
          },
        });
      } catch (e) {
        console.error("insights", ad.adId, errText(e));
      }
    }
    await ctx.runMutation(internal.ads.scoreHooks, {});
    await ctx.runMutation(internal.ads.rankLive, {});
  },
});
