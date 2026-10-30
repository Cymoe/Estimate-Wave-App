import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, nowIso, requireStaff, requireSuperAdmin } from "./lib/access";
import { adScript } from "./schema";
import {
  ASSET_TAGS,
  DEFAULT_APIFY_ACTOR,
  DESCRIBE_PROMPT,
  FAMILY_LABELS,
  PAINTING_HOOKS,
  SCOPES,
  apifyInput,
  composeScript,
  creativeName,
  fromApifyItem,
  isFatigued,
  isLocal,
  metaCents,
  parseJson,
  pickAssets,
  pickExamples,
  pickHooks,
  playbookPrompt,
  qualifies,
  readPlaybook,
  readSwipeTags,
  scriptProblems,
  shotListPrompt,
  shotPlanProblems,
  shotTimings,
  shotstackEdit,
  swipeScore,
  tagSwipePrompt,
  weekOf,
  type Alignment,
  type Candidate,
  type Example,
  type Family,
  type Playbook,
  type ScrapedAd,
  type Script,
  type ShotPlan,
} from "./lib/ads";
import { consumerBrand } from "./lib/support";
import { RESEARCH_SOURCE, SWIPE_SEEDS } from "./catalog/swipes";
import { siteUrl } from "./delivery";
import { tellStaff } from "./notify";

// Ads on autopilot. Every Monday (or on "Draft now") a batch is drafted.
// For each hook: candidate footage is picked from the library by tag;
// Claude looks at the stills and writes a shot list to them (which footage,
// in what order, the line spoken over each) or passes on the hook; ElevenLabs
// reads the lines and says when each starts; Shotstack cuts each shot to its
// line, in two sizes; each video becomes a PAUSED ad in Meta. Staff approve
// them in Ops → Ads; a daily pull of Meta's numbers plus the intake queue
// show what each ad brought in. Each outside step is its own action, chained
// with the scheduler, so one failure marks one creative and the batch goes on.
//
// Environment (set on the Convex deployment, never committed):
//   ANTHROPIC_API_KEY     scripts
//   ELEVENLABS_API_KEY    voice
//   SHOTSTACK_API_KEY     rendering; SHOTSTACK_ENV=stage for a sandbox key (default v1)
//   META_ACCESS_TOKEN     a system user token with ads_management on the ad account
//   APIFY_TOKEN           niche research: searches Meta's Ad Library through an Apify actor
//                         (APIFY_ACTOR overrides which one)
//   CONSUMER_BRAND        the name homeowners see (lib/support.ts)

const MAX_PHOTO = 15 * 1024 * 1024;
const MAX_POSTER = 5 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;
const GRAPH = "https://graph.facebook.com/v22.0";
const CLAUDE_MODEL = "claude-sonnet-5-5";
const RENDER_TRIES = 24;
/** Image types Claude reads; anything else (HEIC) goes through its JPEG still. */
const CLAUDE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const keys = () => ({
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
  shotstack: Boolean(process.env.SHOTSTACK_API_KEY),
  meta: Boolean(process.env.META_ACCESS_TOKEN),
  apify: Boolean(process.env.APIFY_TOKEN),
});

const DEFAULTS = { weeklyEnabled: false, hooksPerWeek: 2, liveTarget: 6 };
const RESEARCH = {
  keywords: ["cabinet painting", "interior painting", "exterior house painting", "house painter"],
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
  },
  handler: async (ctx, { storageId, fileName, tags, pairKey, note, durationSec, posterStorageId }) => {
    const user = await requireStaff(ctx);
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
    const id = await ctx.db.insert("adAssets", {
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
      uses: 0,
      uploadedBy: user._id,
      createdAt: nowIso(),
    });
    // Claude looks at it and says what it shows; the card offers its tags.
    if (process.env.ANTHROPIC_API_KEY) await ctx.scheduler.runAfter(0, internal.ads.describeAsset, { id });
    return id;
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
    return a ? { imageUrl: await lookUrl(ctx, a), kind: a.kind } : null;
  },
});

export const saveDescription = internalMutation({
  args: { id: v.id("adAssets"), description: v.string(), suggestedTags: v.array(v.string()) },
  handler: async (ctx, { id, description, suggestedTags }) => {
    const a = await ctx.db.get(id);
    if (a === null) return;
    // An upload nobody tagged takes Claude's tags; tags a person chose stay, with the suggestion shown beside them.
    await ctx.db.patch(id, {
      description: description.slice(0, 300),
      suggestedTags,
      ...(a.tags.length === 0 && suggestedTags.length > 0 ? { tags: suggestedTags } : {}),
    });
  },
});

/** Asks Claude what an uploaded photo or clip shows, and which tags it would give it. */
export const describeAsset = internalAction({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    const a = await ctx.runQuery(internal.ads.assetForDescribe, { id });
    if (!a?.imageUrl || !process.env.ANTHROPIC_API_KEY) return;
    try {
      const reply = await claude(
        [
          { type: "image", source: { type: "url", url: a.imageUrl } },
          { type: "text", text: DESCRIBE_PROMPT + (a.kind === "video" ? "\nThis image is a still from a video clip." : "") },
        ],
        400,
      );
      const out = parseJson<{ description?: string; tags?: string[] }>(reply);
      if (!out?.description) return;
      const suggestedTags = [...new Set((out.tags ?? []).map((t) => String(t).toLowerCase()))].filter((t) => ASSET_TAGS.includes(t));
      await ctx.runMutation(internal.ads.saveDescription, { id, description: out.description, suggestedTags });
    } catch (e) {
      console.error("describe asset", id, errText(e));
    }
  },
});

export const listAssets = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("adAssets").order("desc").take(500);
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
        note: a.note,
        posterUrl: a.posterStorageId ? ((await ctx.storage.getUrl(a.posterStorageId)) ?? undefined) : undefined,
        description: a.description,
        suggestedTags: a.suggestedTags,
        uses: a.uses ?? 0,
        createdAt: a.createdAt,
      })),
    );
  },
});

export const tagAsset = mutation({
  args: { id: v.id("adAssets"), tags: v.array(v.string()), pairKey: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, { id, tags, pairKey, note }) => {
    await requireStaff(ctx);
    if ((await ctx.db.get(id)) === null) fail("NOT_FOUND", "That file isn't in the library");
    await ctx.db.patch(id, { tags: cleanTags(tags), pairKey: pairKey?.trim() || undefined, note: note?.trim().slice(0, 300) || undefined });
  },
});

export const removeAsset = mutation({
  args: { id: v.id("adAssets") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const a = await ctx.db.get(id);
    if (a === null) return;
    await ctx.db.delete(id);
    for (const sid of [a.storageId, a.posterStorageId]) if (sid && (await ctx.db.system.get(sid)) !== null) await ctx.storage.delete(sid);
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
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("adHooks").take(500);
    return rows
      .map((h) => ({
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
      }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.family.localeCompare(b.family));
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
    if (!(SCOPES as readonly string[]).includes(scope)) fail("INVALID", `Scope must be one of ${SCOPES.join(", ")}`);
    const data = {
      family: fields.family,
      scope,
      trade: fields.trade.trim().toLowerCase() || "painting",
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
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return (await ctx.db.query("adSwipes").take(1000))
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

const PLAYBOOK_SCOPES = ["cabinets", "interior", "exterior"];
const PLAYBOOK_MIN_ADS = 3;
const PER_KEYWORD = 200;

export const researchNow = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireSuperAdmin(ctx);
    const k = keys();
    if (!k.apify) fail("INVALID", "Set APIFY_TOKEN on the Convex deployment first (an Apify account comes with free credit)");
    if (!k.anthropic) fail("INVALID", "Set ANTHROPIC_API_KEY on the Convex deployment first");
    const open = (await ctx.db.query("adResearchRuns").order("desc").take(1))[0];
    if (open && !open.finishedAt && Date.now() - new Date(open.startedAt).getTime() < 30 * 60_000) fail("INVALID", "A search is already running");
    await ctx.scheduler.runAfter(0, internal.ads.researchRun, { startedBy: me._id, force: true });
  },
});

export const openResearch = internalMutation({
  args: { keywords: v.array(v.string()), startedBy: v.optional(v.id("users")) },
  handler: async (ctx, { keywords, startedBy }) =>
    await ctx.db.insert("adResearchRuns", { startedAt: nowIso(), keywords, scanned: 0, kept: 0, added: 0, junk: 0, unreadable: 0, startedBy }),
});

/** Stores scraped ads: new rows are inserted untagged, known ones (by Meta ad id) get their longevity refreshed. */
export const addScraped = internalMutation({
  args: { ads: v.array(v.any()), source: v.string(), markets: v.array(v.string()) },
  handler: async (ctx, { ads, source, markets }) => {
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
        status: raw.active ? "Active" : "Inactive",
      };
      if (existing) {
        await ctx.db.patch(existing._id, { ...scraped, adCopy: existing.adCopy || raw.adCopy || undefined });
        continue;
      }
      const text = [raw.pageName, raw.title, raw.adCopy, raw.landing].filter(Boolean).join(" ");
      const id = await ctx.db.insert("adSwipes", {
        ...scraped,
        company: raw.pageName,
        paintingType: "General painting",
        hook: (raw.title || raw.adCopy || raw.pageName).replace(/\s+/g, " ").trim().slice(0, 80),
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
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, error, ...counts }) => {
    await ctx.db.patch(runId, { ...counts, error, finishedAt: nowIso() });
    await tellStaff(
      ctx,
      error ? `The niche search didn't finish: ${error.slice(0, 80)}` : `Niche search done: ${counts.added} new competitor ads`,
      [
        `Scanned ${counts.scanned} ads, ${counts.kept} still running past the longevity bar, ${counts.added} new to the swipe file.`,
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

/** The monthly search, or the button (force). One Apify call per keyword, each under the actor's five-minute cap. */
export const researchRun = internalAction({
  args: { startedBy: v.optional(v.id("users")), force: v.optional(v.boolean()) },
  handler: async (ctx, { startedBy, force }) => {
    const cfg = await ctx.runQuery(internal.ads.config, {});
    if (!cfg.researchMonthly && !force) return;
    const runId: Id<"adResearchRuns"> = await ctx.runMutation(internal.ads.openResearch, { keywords: cfg.researchKeywords, startedBy });
    const counts = { scanned: 0, kept: 0, added: 0, unreadable: 0 };
    const source = `research ${nowIso().slice(0, 10)}`;
    let delay = 0;
    try {
      if (!process.env.APIFY_TOKEN || !process.env.ANTHROPIC_API_KEY) throw new Error("Set APIFY_TOKEN and ANTHROPIC_API_KEY on the deployment");
      const actor = process.env.APIFY_ACTOR || DEFAULT_APIFY_ACTOR;
      const seen = new Set<string>();
      for (const keyword of cfg.researchKeywords) {
        const res = await fetch(
          `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(apifyInput(keyword, cfg.researchMinDays, new Date(), PER_KEYWORD)),
          },
        );
        const items = await readJson(res, "Apify");
        if (!Array.isArray(items)) throw new Error("Apify: the actor didn't return a list of ads");
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
        const ids: Id<"adSwipes">[] = await ctx.runMutation(internal.ads.addScraped, { ads: fresh, source, markets: cfg.researchMarkets });
        counts.added += ids.length;
        for (const id of ids) {
          await ctx.scheduler.runAfter(delay, internal.ads.tagSwipe, { id, runId });
          delay += 1500;
        }
      }
      await ctx.runMutation(internal.ads.finishResearch, { runId, ...counts });
    } catch (e) {
      await ctx.runMutation(internal.ads.finishResearch, { runId, ...counts, error: errText(e) });
    }
  },
});

/** Swipes Claude hasn't read yet. When it reaches zero the playbooks are rewritten. */
export const untaggedCount = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("adSwipes").take(1000)).filter((x) => !x.taggedAt).length,
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
    const prompt = { type: "text", text: tagSwipePrompt({ ...swipe, pageName: swipe.company }, markets) };
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
      tags = readSwipeTags(reply);
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
    const swipes = await ctx.db.query("adSwipes").take(1000);
    const libraryTags: Record<string, number> = {};
    for (const a of await ctx.db.query("adAssets").take(500)) for (const t of a.tags) libraryTags[t] = (libraryTags[t] ?? 0) + 1;
    const playbooks = await ctx.db.query("adPlaybooks").take(20);
    const byScope: Record<string, typeof swipes> = {};
    for (const x of swipes) {
      if (!x.scope || (x.quality !== undefined && x.quality < 20)) continue;
      // Qualifies: past the longevity bar, or starred, or the VA's own research (its dates may be unreadable).
      if (!(x.starred || (x.daysRunning ?? 0) >= minDays || x.source === RESEARCH_SOURCE)) continue;
      (byScope[x.scope] ??= []).push(x);
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
        const playbook = readPlaybook(await claude([{ type: "text", text: playbookPrompt(sc, summary, markets, libraryTags) }], 1200));
        if (!playbook) throw new Error("the reply wasn't a playbook");
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
      keys: keys(),
      adAccountId: row?.adAccountId,
      pageId: row?.pageId,
      leadFormId: row?.leadFormId,
      adsetId: row?.adsetId,
      primaryColor: row?.primaryColor ?? "#336699",
      accentColor: row?.accentColor ?? "#8fb6e0",
      voiceId: row?.voiceId,
      weeklyEnabled: row?.weeklyEnabled ?? DEFAULTS.weeklyEnabled,
      hooksPerWeek: row?.hooksPerWeek ?? DEFAULTS.hooksPerWeek,
      liveTarget: row?.liveTarget ?? DEFAULTS.liveTarget,
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
    weeklyEnabled: v.boolean(),
    hooksPerWeek: v.number(),
    liveTarget: v.number(),
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
      updatedAt: nowIso(),
    } as Omit<Doc<"adSettings">, "_id" | "_creationTime">;
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, data);
    else await ctx.db.insert("adSettings", data);
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
    hook: hook ? { id: hook._id, family: hook.family, familyLabel: FAMILY_LABELS[hook.family], scope: hook.scope, textEn: hook.textEn } : null,
    videoUrl: c.videoStorageId ? ((await ctx.storage.getUrl(c.videoStorageId)) ?? undefined) : undefined,
    meta: c.meta,
    week: c.week,
    baselineCtr: c.baselineCtr,
    fatigued: c.week ? isFatigued({ frequency: c.week.frequency, ctr: c.week.ctr, baselineCtr: c.baselineCtr ?? null }) : false,
    createdAt: c.createdAt,
    activatedAt: c.activatedAt,
    retiredAt: c.retiredAt,
  };
}

/** The last few weeks' batches with their creatives, newest first. */
export const batches = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("adBatches").order("desc").take(6);
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

/** "Draft now": this week's batch, without waiting for Monday. */
export const draftNow = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireSuperAdmin(ctx);
    const k = keys();
    if (!k.anthropic || !k.elevenlabs || !k.shotstack)
      fail("INVALID", "Set ANTHROPIC_API_KEY, ELEVENLABS_API_KEY and SHOTSTACK_API_KEY on the deployment first");
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

/** Pauses a live ad in Meta and scores its hook. */
export const retire = mutation({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const c = await setStatus(ctx, id, "retired", { retiredAt: nowIso() });
    if (c.meta?.adId) await ctx.scheduler.runAfter(0, internal.ads.setAdStatus, { id, status: "PAUSED" });
    // A hook wins when its ad's week beat the batch's median click-through.
    const siblings = (
      await ctx.db
        .query("adCreatives")
        .withIndex("by_batch", (q) => q.eq("batchId", c.batchId))
        .collect()
    ).filter((s) => s.week && s._id !== id);
    const hook = await ctx.db.get(c.hookId);
    if (hook && c.week && siblings.length > 0) {
      const ctrs = siblings.map((s) => s.week!.ctr).sort((a, b) => a - b);
      const median = ctrs[Math.floor(ctrs.length / 2)];
      await ctx.db.patch(hook._id, c.week.ctr >= median ? { wins: hook.wins + 1 } : { losses: hook.losses + 1 });
    }
  },
});

/** A draft the reviewer doesn't want: left paused in Meta, never shown as a candidate again. */
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
      brand: { name: consumerBrand(), primaryColor: row?.primaryColor ?? "#336699", accentColor: row?.accentColor ?? "#8fb6e0" },
      adAccountId: row?.adAccountId,
      pageId: row?.pageId,
      leadFormId: row?.leadFormId,
      adsetId: row?.adsetId,
      voiceId: row?.voiceId,
      weeklyEnabled: row?.weeklyEnabled ?? DEFAULTS.weeklyEnabled,
      hooksPerWeek: row?.hooksPerWeek ?? DEFAULTS.hooksPerWeek,
      ...research(row),
    };
  },
});

/** What this week can draw on: the eligible hooks in order, and the library with what Claude needs to see each asset. */
export const plan = internalQuery({
  args: { hooksPerWeek: v.number() },
  handler: async (ctx, { hooksPerWeek }) => {
    const liveFamilies = new Set<Family>();
    for (const c of await ctx.db
      .query("adCreatives")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .collect()) {
      const h = await ctx.db.get(c.hookId);
      if (h) liveFamilies.add(h.family);
    }
    const hooks = pickHooks(
      await ctx.db
        .query("adHooks")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect(),
      liveFamilies,
      hooksPerWeek,
    );
    const assets = await ctx.db.query("adAssets").take(500);
    // What the writer is shown for each hook's scope: competitor ads, for tone and shape.
    const swipes = await ctx.db.query("adSwipes").take(1000);
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
    for (const p of await ctx.db.query("adPlaybooks").take(20)) playbooks[p.scope] = { text: p.text, footagePrefs: p.footagePrefs };
    return {
      hooks,
      examples,
      playbooks,
      assets: await Promise.all(
        assets.map(async (a) => ({
          _id: a._id,
          kind: a.kind,
          tags: a.tags,
          pairKey: a.pairKey,
          createdAt: a.createdAt,
          uses: a.uses ?? 0,
          description: a.description,
          durationSec: a.durationSec,
          imageUrl: await lookUrl(ctx, a),
        })),
      ),
    };
  },
});

export const openBatch = internalMutation({
  args: { weekOf: v.string(), startedBy: v.optional(v.id("users")) },
  handler: async (ctx, { weekOf, startedBy }) => await ctx.db.insert("adBatches", { weekOf, status: "drafting", startedBy, createdAt: nowIso() }),
});

export const noteSkipped = internalMutation({
  args: { batchId: v.id("adBatches"), skipped: v.array(v.string()) },
  handler: async (ctx, { batchId, skipped }) => {
    if (skipped.length) await ctx.db.patch(batchId, { skipped: skipped.map((s) => s.slice(0, 400)) });
  },
});

export const failBatch = internalMutation({
  args: { batchId: v.id("adBatches"), error: v.string() },
  handler: async (ctx, { batchId, error }) => {
    await ctx.db.patch(batchId, { status: "failed", error: error.slice(0, 500) });
    await tellStaff(ctx, "This week's ads couldn't be drafted", [error.slice(0, 500)], "/ops?tab=ads");
  },
});

/** Creates the week's creatives for one hook (two sizes) once its script is in. */
export const addCreatives = internalMutation({
  args: {
    batchId: v.id("adBatches"),
    hookId: v.id("adHooks"),
    script: adScript,
  },
  handler: async (ctx, { batchId, hookId, script }) => {
    const assetIds = (script.shots ?? []).map((s) => s.assetId);
    const now = new Date();
    const ids: Id<"adCreatives">[] = [];
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
      ids.push(await ctx.db.insert("adCreatives", { batchId, hookId, ratio, name, script, assetIds, status: "draft", createdAt: nowIso() }));
    }
    const hook = await ctx.db.get(hookId);
    if (hook) await ctx.db.patch(hookId, { uses: hook.uses + 1, lastUsedAt: nowIso() });
    // The library rotates: footage cut into an ad this week waits behind fresher footage next week.
    for (const assetId of new Set(assetIds)) {
      const a = await ctx.db.get(assetId);
      if (a) await ctx.db.patch(assetId, { uses: (a.uses ?? 0) + 1, lastUsedAt: nowIso() });
    }
    return ids;
  },
});

export const patchCreative = internalMutation({
  args: {
    id: v.id("adCreatives"),
    status: v.optional(
      v.union(
        v.literal("draft"),
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
    renderId: v.optional(v.string()),
    meta: v.optional(
      v.object({
        videoId: v.optional(v.string()),
        creativeId: v.optional(v.string()),
        adId: v.optional(v.string()),
        adsetId: v.optional(v.string()),
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
type CreativeInput = Doc<"adCreatives"> & { assets: InputAsset[]; audioUrl: string | null; videoUrl: string | null };

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
      // A photo Shotstack can't read (HEIC) renders from its JPEG still.
      const url = a.kind === "photo" && !CLAUDE_IMAGE_TYPES.includes(a.contentType) && posterUrl ? posterUrl : original;
      if (url) assets.push({ id: assetId, url, posterUrl, kind: a.kind, tags: a.tags, pairKey: a.pairKey, durationSec: a.durationSec });
    }
    return {
      ...c,
      assets,
      audioUrl: c.audioStorageId ? await ctx.storage.getUrl(c.audioStorageId) : null,
      videoUrl: c.videoStorageId ? await ctx.storage.getUrl(c.videoStorageId) : null,
    };
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

/** The script as the validator takes it (only the stored fields). */
const stripSystem = (s: Script) =>
  ({
    voice: s.voice,
    onScreen: s.onScreen,
    headline: s.headline,
    primaryText: s.primaryText,
    ...(s.shots ? { shots: s.shots.map((x) => ({ assetId: x.assetId, voice: x.voice, onScreen: x.onScreen, start: x.start, end: x.end })) } : {}),
  }) as never;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function readJson(res: Response, what: string): Promise<any> {
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new Error(`${what}: ${res.status} ${body?.error?.message ?? body?.message ?? body?.response?.message ?? text.slice(0, 200)}`);
  return body;
}

/** One Claude call: content blocks in, the reply's text out. */
async function claude(content: unknown[], maxTokens = 1500): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  const body = await readJson(res, "Claude");
  return (body?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
}

/**
 * Monday: works down the eligible hooks until hooksPerWeek of them have a
 * shot list. A hook Claude says the footage can't carry, or whose shot list
 * still breaks a rule after one retry, is passed over with the reason.
 */
export const weeklyRun = internalAction({
  args: { startedBy: v.optional(v.id("users")), force: v.optional(v.boolean()) },
  handler: async (ctx, { startedBy, force }) => {
    const cfg = await ctx.runQuery(internal.ads.config, {});
    if (!cfg.weeklyEnabled && !force) return;
    const k = keys();
    const batchId = await ctx.runMutation(internal.ads.openBatch, { weekOf: weekOf(new Date()), startedBy });
    const skipped: string[] = [];
    try {
      if (!k.anthropic || !k.elevenlabs || !k.shotstack)
        throw new Error("Set ANTHROPIC_API_KEY, ELEVENLABS_API_KEY and SHOTSTACK_API_KEY on the deployment");
      const { hooks, assets, examples, playbooks } = await ctx.runQuery(internal.ads.plan, { hooksPerWeek: 100 });
      if (hooks.length === 0) throw new Error("No active hook whose family isn't already live. Add or switch on hooks in Ops → Ads → Hooks.");
      if (assets.length === 0) throw new Error("The library is empty. Upload photos or clips in Ops → Ads → Library.");
      const used = new Set<string>();
      let made = 0;
      let delay = 0;
      for (const hook of hooks) {
        if (made >= cfg.hooksPerWeek) break;
        const label = `"${hook.textEn.slice(0, 50)}${hook.textEn.length > 50 ? "…" : ""}"`;
        const playbook = playbooks[hook.scope];
        const picked = pickAssets(assets, hook.scope, used, undefined, playbook?.footagePrefs ?? []);
        if (picked.assets.length === 0) {
          skipped.push(`${label}: nothing tagged ${hook.scope}, and no process or crew footage left`);
          continue;
        }
        let script: Script;
        try {
          script = await writeShotList(hook, cfg.brand.name, picked.assets, picked.inScope, examples[hook.scope] ?? [], playbook?.text);
        } catch (e) {
          skipped.push(`${label}: ${errText(e)}`);
          continue;
        }
        script.shots!.forEach((s) => used.add(s.assetId));
        const ids: Id<"adCreatives">[] = await ctx.runMutation(internal.ads.addCreatives, { batchId, hookId: hook._id, script: script as never });
        // One voice per hook, shared by its two sizes.
        await ctx.scheduler.runAfter(delay, internal.ads.voice, { ids });
        delay += 1500;
        made += 1;
      }
      await ctx.runMutation(internal.ads.noteSkipped, { batchId, skipped });
      if (made === 0) throw new Error(`No hook had footage that fits. ${skipped.join(" ")}`);
    } catch (e) {
      await ctx.runMutation(internal.ads.failBatch, { batchId, error: errText(e) });
    }
  },
});

/**
 * Claude looks at the candidate footage and writes the shot list. The stills
 * go in as image blocks, each after a "Footage N" label so the numbers in
 * the reply point at the right asset. One retry with the problems named.
 */
async function writeShotList(
  hook: Doc<"adHooks">,
  brand: string,
  footage: Array<Candidate & { _id: string }>,
  inScope: boolean,
  examples: Example[],
  playbook?: string,
): Promise<Script> {
  const content: unknown[] = [{ type: "text", text: shotListPrompt(hook, brand, footage, inScope, examples, undefined, playbook) }];
  footage.forEach((f, i) => {
    if (!f.imageUrl) return;
    content.push({ type: "text", text: `Footage ${i + 1}:` }, { type: "image", source: { type: "url", url: f.imageUrl } });
  });
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const ask =
      attempt === 0
        ? content
        : [
            ...content,
            { type: "text", text: `Your last shot list had these problems: ${problems.join("; ")}. Fix them and answer again with JSON only.` },
          ];
    const plan = parseJson<ShotPlan>(await claude(ask));
    if (!plan) {
      problems = ["the reply wasn't JSON"];
      continue;
    }
    if (plan.fits === false) throw new Error(`Claude passed: ${plan.reason ?? "the footage doesn't fit the hook"}`);
    problems = shotPlanProblems(plan, footage);
    const script = composeScript(
      plan,
      footage.map((f) => f._id),
    );
    if (problems.length === 0) problems = scriptProblems(script);
    if (problems.length === 0) return script;
  }
  throw new Error(`the shot list still broke the rules: ${problems.join("; ")}`);
}

/** The voice-over for one hook, from ElevenLabs, shared by both sizes. */
export const voice = internalAction({
  args: { ids: v.array(v.id("adCreatives")) },
  handler: async (ctx, { ids }) => {
    if (ids.length === 0) return;
    const first: CreativeInput | null = await ctx.runQuery(internal.ads.creativeInput, { id: ids[0] });
    if (!first) return;
    const cfg = await ctx.runQuery(internal.ads.config, {});
    try {
      const voiceId = cfg.voiceId;
      if (!voiceId) throw new Error("No ElevenLabs voice chosen in Ops → Ads → Settings");
      const shots = first.script.shots ?? [];
      const lines = shots.length ? shots.map((s) => s.voice) : [first.script.voice];
      // The text read is the lines joined by single spaces, which is what shotTimings counts characters against.
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          body: JSON.stringify({ text: lines.join(" "), model_id: "eleven_multilingual_v2" }),
        },
      );
      const body = await readJson(res, "ElevenLabs");
      if (!body?.audio_base64) throw new Error("ElevenLabs sent no audio");
      const bytes = Uint8Array.from(atob(body.audio_base64), (ch) => ch.charCodeAt(0));
      const audioStorageId = await ctx.storage.store(new Blob([bytes], { type: "audio/mpeg" }));
      const estimate = Math.max(8, lines.join(" ").split(/\s+/).length / 2.6);
      const timed = shotTimings(lines, (body.alignment ?? null) as Alignment | null, estimate);
      const script = shots.length ? { ...first.script, shots: shots.map((s, i) => ({ ...s, ...timed.shots[i] })) } : first.script;
      let delay = 0;
      for (const id of ids) {
        await ctx.runMutation(internal.ads.patchCreative, {
          id,
          status: "voiced",
          audioStorageId,
          audioDurationSec: timed.durationSec,
          script: stripSystem(script),
        });
        await ctx.scheduler.runAfter(delay, internal.ads.render, { id });
        delay += 1000;
      }
    } catch (e) {
      for (const id of ids) await ctx.runMutation(internal.ads.patchCreative, { id, status: "failed", error: errText(e) });
      await ctx.runMutation(internal.ads.finishIfDone, { batchId: first.batchId });
    }
  },
});

const shotstackBase = () => `https://api.shotstack.io/edit/${process.env.SHOTSTACK_ENV === "stage" ? "stage" : "v1"}`;

/** Sends one creative to Shotstack and comes back for it. */
export const render = internalAction({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    const c: CreativeInput | null = await ctx.runQuery(internal.ads.creativeInput, { id });
    if (!c) return;
    const cfg = await ctx.runQuery(internal.ads.config, {});
    try {
      if (!c.audioUrl) throw new Error("No voice track");
      const byId = new Map(c.assets.map((a) => [a.id as string, a]));
      const shots = (c.script.shots ?? []).map((s) => ({ asset: byId.get(s.assetId), onScreen: s.onScreen, start: s.start ?? 0, end: s.end ?? 0 }));
      if (shots.length === 0 || shots.some((s) => !s.asset)) throw new Error("A shot's footage is missing from the library");
      const edit = shotstackEdit({
        shots: shots as Array<{ asset: NonNullable<(typeof shots)[number]["asset"]>; onScreen: string; start: number; end: number }>,
        audioUrl: c.audioUrl,
        audioDurationSec: c.audioDurationSec ?? Math.max(8, c.script.voice.split(/\s+/).length / 2.6),
        brand: cfg.brand,
        ratio: c.ratio,
      });
      const res = await fetch(`${shotstackBase()}/render`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.SHOTSTACK_API_KEY! },
        body: JSON.stringify(edit),
      });
      const body = await readJson(res, "Shotstack");
      const renderId = body?.response?.id;
      if (!renderId) throw new Error("Shotstack gave no render id");
      await ctx.runMutation(internal.ads.patchCreative, { id, status: "rendering", renderId });
      await ctx.scheduler.runAfter(30_000, internal.ads.pollRender, { id, tries: 1 });
    } catch (e) {
      await ctx.runMutation(internal.ads.patchCreative, { id, status: "failed", error: errText(e) });
      await ctx.runMutation(internal.ads.finishIfDone, { batchId: c.batchId });
    }
  },
});

export const pollRender = internalAction({
  args: { id: v.id("adCreatives"), tries: v.number() },
  handler: async (ctx, { id, tries }) => {
    const c: CreativeInput | null = await ctx.runQuery(internal.ads.creativeInput, { id });
    if (!c || c.status !== "rendering" || !c.renderId) return;
    try {
      const res = await fetch(`${shotstackBase()}/render/${c.renderId}`, { headers: { "x-api-key": process.env.SHOTSTACK_API_KEY! } });
      const body = await readJson(res, "Shotstack");
      const status = body?.response?.status;
      if (status === "done" && body.response.url) {
        const file = await fetch(body.response.url);
        if (!file.ok) throw new Error(`Couldn't download the render (${file.status})`);
        const videoStorageId = await ctx.storage.store(new Blob([await file.arrayBuffer()], { type: "video/mp4" }));
        await ctx.runMutation(internal.ads.patchCreative, { id, status: "rendered", videoStorageId });
        await ctx.scheduler.runAfter(0, internal.ads.publishPaused, { id });
      } else if (status === "failed") {
        throw new Error(`Shotstack: ${body.response.error ?? "render failed"}`);
      } else if (tries >= RENDER_TRIES) {
        throw new Error("Shotstack: the render took more than 12 minutes");
      } else {
        await ctx.scheduler.runAfter(30_000, internal.ads.pollRender, { id, tries: tries + 1 });
      }
    } catch (e) {
      await ctx.runMutation(internal.ads.patchCreative, { id, status: "failed", error: errText(e) });
      await ctx.runMutation(internal.ads.finishIfDone, { batchId: c.batchId });
    }
  },
});

const graph = async (path: string, params: Record<string, unknown>, what: string) => {
  const form = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) form.set(k, typeof val === "string" ? val : JSON.stringify(val));
  form.set("access_token", process.env.META_ACCESS_TOKEN!);
  return await readJson(await fetch(`${GRAPH}/${path}`, { method: "POST", body: form }), what);
};

/** Puts a rendered creative into Meta as a PAUSED ad: the video, then the creative, then the ad. */
export const publishPaused = internalAction({
  args: { id: v.id("adCreatives") },
  handler: async (ctx, { id }) => {
    const c: CreativeInput | null = await ctx.runQuery(internal.ads.creativeInput, { id });
    if (!c || !c.videoUrl) return;
    const cfg = await ctx.runQuery(internal.ads.config, {});
    const adsetId = cfg.adsetId;
    if (!process.env.META_ACCESS_TOKEN || !cfg.adAccountId || !cfg.pageId || !adsetId) {
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
      const video = c.meta?.videoId
        ? { id: c.meta.videoId }
        : await graph(`${act}/advideos`, { file_url: c.videoUrl, name: c.name, title: c.name }, "Meta video upload");
      await ctx.runMutation(internal.ads.patchCreative, { id, meta: { videoId: video.id } });
      const first = c.assets[0];
      const poster = first?.posterUrl ?? (first?.kind === "photo" ? first.url : undefined) ?? `${siteUrl()}/og-image.png`;
      const creative = await graph(
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
              call_to_action: { type: "GET_QUOTE", ...(cfg.leadFormId ? { value: { lead_gen_form_id: cfg.leadFormId } } : {}) },
            },
          },
          degrees_of_freedom_spec: {
            creative_features_spec: {
              text_optimizations: { enroll_status: "OPT_IN" },
              enhance_cta: { enroll_status: "OPT_IN" },
              adapt_to_placement: { enroll_status: "OPT_IN" },
              image_background_gen: { enroll_status: "OPT_OUT" },
              image_animation: { enroll_status: "OPT_OUT" },
              video_expansion: { enroll_status: "OPT_OUT" },
            },
          },
        },
        "Meta creative",
      );
      const ad = await graph(`${act}/ads`, { name: c.name, adset_id: adsetId, creative: { creative_id: creative.id }, status: "PAUSED" }, "Meta ad");
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
    if (!c?.meta?.adId || !process.env.META_ACCESS_TOKEN) return;
    try {
      await graph(c.meta.adId, { status }, "Meta ad status");
    } catch (e) {
      await ctx.runMutation(internal.ads.patchCreative, { id, error: `Meta didn't take the change: ${errText(e)}` });
    }
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
    if (!process.env.META_ACCESS_TOKEN) return;
    const ads = await ctx.runQuery(internal.ads.adsInMeta, {});
    const fields = "spend,impressions,reach,clicks,ctr,frequency,actions";
    for (const ad of ads) {
      try {
        const token = `access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN)}`;
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
  },
});
