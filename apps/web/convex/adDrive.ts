// Clips into the Ads library without the page open. A phone uploads a big video slowly, and a web page can't keep
// sending once it's closed; the Google Drive app can. So the owner shares clips to a Drive folder ("Ad clips"),
// and from there it's all on the server:
//
//   poll (every 10 minutes)  lists the folder's videos, notes each new one as waiting, and starts the runner
//   the runner (.github/workflows/ads-clips.yml, ads-video/scripts/import-clips.mjs) claims the waiting files with
//     a fresh access token, downloads each, makes it 1080p at most 30 fps with ffmpeg, a still and a small copy,
//     stores them, and says importDone (or importFailed with why)
//   importDone files it in the library (ads.ts insertAsset), as the person who connected the folder; Claude tags it
//
// The folder is read only (drive.readonly): the clips stay in Drive for the owner to clear. Google sign-in is the
// same client and return address as Gmail (lib/gmail.ts, lib/emailRoutes.ts), the refresh token sealed
// (lib/secretBox.ts).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fail, nowIso, requireStaff } from "./lib/access";
import { refreshAccess, setupMissing } from "./lib/gmail";
import { open } from "./lib/secretBox";
import { randomToken, sha256 } from "./lib/oauth";
import {
  CLAIM_LIMIT,
  CLAIM_STALE_MS,
  DEFAULT_FOLDER,
  MAX_DRIVE_BYTES,
  driveAuthUrl,
  folderQuery,
  listUrl,
  readList,
  videosQuery,
  type DriveFile,
} from "./lib/googleDrive";
import { DEFAULT_TRADE, tradeOf } from "./lib/ads";
import { insertAsset } from "./ads";

const STATE_TTL_MS = 10 * 60 * 1000;

async function liveConnection(ctx: { db: { query: (t: "adDrive") => any } }, trade: string): Promise<Doc<"adDrive"> | null> {
  const rows: Doc<"adDrive">[] = await ctx.db.query("adDrive").withIndex("by_trade", (q: any) => q.eq("trade", trade)).collect();
  return rows.filter((r) => !r.revokedAt).sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0] ?? null;
}

// ---- Connecting ----

/** "Connect Google Drive": where to send the person (Google's consent screen); they come back to `returnTo`. */
export const connect = mutation({
  args: { trade: v.optional(v.string()), folderName: v.optional(v.string()), returnTo: v.optional(v.string()) },
  handler: async (ctx, { trade, returnTo }) => {
    const user = await requireStaff(ctx);
    const missing = setupMissing();
    if (missing.length) fail("INVALID", `Google isn't set up on the server yet: ${missing.join(" and ")}`);
    const state = randomToken();
    await ctx.db.insert("adDriveStates", {
      stateHash: await sha256(state),
      userId: user._id,
      trade: tradeOf(trade ?? DEFAULT_TRADE).slug,
      returnTo: returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/ops?tab=ads&ads=library&view=clips",
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    return driveAuthUrl(state, user.email);
  },
});

/** The callback's first step (lib/emailRoutes.ts), when the state is one of Drive's: used up. */
export const takeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db.query("adDriveStates").withIndex("by_state", (q) => q.eq("stateHash", state)).first();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return { userId: row.userId, trade: row.trade, returnTo: row.returnTo };
  },
});

/** The callback's last step: the folder connection kept, any earlier one for the trade let go. */
export const saveConnection = internalMutation({
  args: {
    trade: v.string(),
    userId: v.id("users"),
    email: v.optional(v.string()),
    refreshTokenEnc: v.string(),
    accessToken: v.string(),
    accessExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = nowIso();
    for (const r of await ctx.db.query("adDrive").withIndex("by_trade", (q) => q.eq("trade", args.trade)).collect())
      if (!r.revokedAt) await ctx.db.patch(r._id, { revokedAt: now });
    await ctx.db.insert("adDrive", {
      trade: args.trade,
      email: args.email?.toLowerCase(),
      refreshTokenEnc: args.refreshTokenEnc,
      accessToken: args.accessToken,
      accessExpiresAt: args.accessExpiresAt,
      folderName: DEFAULT_FOLDER,
      connectedBy: args.userId,
      connectedAt: now,
    });
    // A first look straight away, so the owner sees it working.
    await ctx.scheduler.runAfter(0, internal.adDrive.poll, {});
  },
});

export const disconnect = mutation({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    const live = await liveConnection(ctx, tradeOf(trade ?? DEFAULT_TRADE).slug);
    if (live) await ctx.db.patch(live._id, { revokedAt: nowIso() });
  },
});

/** The connection and the latest imports, for the Ads page. */
export const status = query({
  args: { trade: v.optional(v.string()) },
  handler: async (ctx, { trade }) => {
    await requireStaff(ctx);
    const slug = tradeOf(trade ?? DEFAULT_TRADE).slug;
    const live = await liveConnection(ctx, slug);
    const imports = (await ctx.db.query("adDriveImports").withIndex("by_trade", (q) => q.eq("trade", slug)).order("desc").take(30)).map((i) => ({
      id: i._id,
      name: i.name,
      status: i.status,
      error: i.error,
      note: i.note,
      updatedAt: i.updatedAt,
    }));
    return {
      setupMissing: setupMissing(),
      connected: live ? { email: live.email, folderName: live.folderName, found: Boolean(live.folderId), lastCheckedAt: live.lastCheckedAt, error: live.error } : null,
      imports,
    };
  },
});

// ---- Watching the folder ----

export const connections = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("adDrive").collect()).filter((r) => !r.revokedAt),
});

export const saveAccess = internalMutation({
  args: { id: v.id("adDrive"), accessToken: v.string(), accessExpiresAt: v.number() },
  handler: async (ctx, { id, ...rest }) => await ctx.db.patch(id, rest),
});

export const checked = internalMutation({
  args: { id: v.id("adDrive"), folderId: v.optional(v.string()), error: v.optional(v.string()), lost: v.optional(v.boolean()) },
  handler: async (ctx, { id, folderId, error, lost }) => {
    const now = nowIso();
    await ctx.db.patch(id, { lastCheckedAt: now, error, ...(folderId ? { folderId } : {}), ...(lost ? { revokedAt: now } : {}) });
  },
});

/** An access token for a connection: the saved one while it has a minute left, else a fresh one. */
async function accessFor(ctx: { runMutation: any }, c: Doc<"adDrive">): Promise<string> {
  if (c.accessToken && (c.accessExpiresAt ?? 0) > Date.now() + 60_000) return c.accessToken;
  const fresh = await refreshAccess(await open(c.refreshTokenEnc));
  await ctx.runMutation(internal.adDrive.saveAccess, { id: c._id, accessToken: fresh.access, accessExpiresAt: fresh.expiresAt });
  return fresh.access;
}

async function driveList(token: string, q: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let page: string | undefined;
  for (let i = 0; i < 20; i++) {
    const res = await fetch(listUrl(q, page), { headers: { authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Drive ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    const { files, next } = readList(json);
    out.push(...files);
    if (!next) break;
    page = next;
  }
  return out;
}

/** The new videos noted as waiting; the ones already known are left. How many were new. */
export const recordFiles = internalMutation({
  args: { trade: v.string(), files: v.array(v.object({ id: v.string(), name: v.string(), size: v.optional(v.number()) })) },
  handler: async (ctx, { trade, files }) => {
    let added = 0;
    const now = nowIso();
    for (const f of files) {
      if (await ctx.db.query("adDriveImports").withIndex("by_file", (q) => q.eq("fileId", f.id)).first()) continue;
      const tooBig = f.size !== undefined && f.size > MAX_DRIVE_BYTES;
      await ctx.db.insert("adDriveImports", {
        trade,
        fileId: f.id,
        name: f.name.slice(0, 200),
        ...(f.size !== undefined ? { size: f.size } : {}),
        status: tooBig ? "failed" : "waiting",
        ...(tooBig ? { error: "It's over 2 GB: trim it into shorter clips." } : {}),
        createdAt: now,
        updatedAt: now,
      });
      if (!tooBig) added += 1;
    }
    return added;
  },
});

export const waitingCount = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("adDriveImports").withIndex("by_status", (q) => q.eq("status", "waiting")).take(100)).length,
});

/** Every 10 minutes (crons.ts): each connected folder looked at, new clips noted, the runner started when any wait. */
export const poll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; added: number; started: boolean }> => {
    const conns: Doc<"adDrive">[] = await ctx.runQuery(internal.adDrive.connections, {});
    let added = 0;
    for (const c of conns) {
      try {
        const token = await accessFor(ctx, c);
        const folder = c.folderId ?? (await driveList(token, folderQuery(c.folderName)))[0]?.id;
        if (!folder) {
          await ctx.runMutation(internal.adDrive.checked, { id: c._id, error: `No folder named "${c.folderName}" in this Google Drive yet: make one and share clips to it.` });
          continue;
        }
        const files = await driveList(token, videosQuery(folder));
        added += await ctx.runMutation(internal.adDrive.recordFiles, { trade: c.trade, files: files.map((f) => ({ id: f.id, name: f.name, ...(f.size !== undefined && Number.isFinite(f.size) ? { size: f.size } : {}) })) });
        await ctx.runMutation(internal.adDrive.checked, { id: c._id, folderId: folder });
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        // Google took the permission back: it shows as not connected, to connect again.
        const lost = /invalid_grant|unauthorized/i.test(why) || (e as { code?: string }).code === "invalid_grant";
        await ctx.runMutation(internal.adDrive.checked, { id: c._id, error: why.slice(0, 300), lost });
      }
    }
    const waiting: number = await ctx.runQuery(internal.adDrive.waitingCount, {});
    const started = waiting > 0 ? await startImports() : false;
    return { checked: conns.length, added, started };
  },
});

/** Asks GitHub to run the importer (as ads.startRenders does the renderer). Nothing without ADS_RENDER_TOKEN. */
async function startImports(): Promise<boolean> {
  const token = process.env.ADS_RENDER_TOKEN;
  if (!token) return false;
  const repo = process.env.ADS_RENDER_REPO ?? "Cymoe/Estimate-Wave-App";
  const ref = process.env.ADS_RENDER_REF ?? "fieldquote-convex";
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ads-clips.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "ad-maker" },
    body: JSON.stringify({ ref }),
  });
  if (!res.ok) console.error("start imports", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

// ---- The runner's side ----

/** Waiting files taken (and any left "working" by a runner that stopped), marked working. */
export const takeWaiting = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const stale = (await ctx.db.query("adDriveImports").withIndex("by_status", (q) => q.eq("status", "working")).take(50)).filter(
      (i) => (i.claimedAt ?? 0) < now - CLAIM_STALE_MS,
    );
    const waiting = await ctx.db.query("adDriveImports").withIndex("by_status", (q) => q.eq("status", "waiting")).take(limit);
    const taken = [...stale, ...waiting].slice(0, limit);
    for (const i of taken) await ctx.db.patch(i._id, { status: "working", claimedAt: now, updatedAt: nowIso() });
    return taken.map((i) => ({ id: i._id, fileId: i.fileId, name: i.name, trade: i.trade }));
  },
});

/**
 * The runner asks for work: up to CLAIM_LIMIT files, each with an access token for its folder. The token goes to
 * the runner only (it reads it from this answer and never prints it).
 */
export const claimImports = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<Array<{ id: Id<"adDriveImports">; fileId: string; name: string; token: string }>> => {
    const taken: Array<{ id: Id<"adDriveImports">; fileId: string; name: string; trade: string }> = await ctx.runMutation(internal.adDrive.takeWaiting, {
      limit: Math.min(Math.max(1, limit ?? CLAIM_LIMIT), 10),
    });
    if (taken.length === 0) return [];
    const conns: Doc<"adDrive">[] = await ctx.runQuery(internal.adDrive.connections, {});
    const out: Array<{ id: Id<"adDriveImports">; fileId: string; name: string; token: string }> = [];
    for (const t of taken) {
      const c = conns.find((x) => x.trade === t.trade);
      if (!c) {
        await ctx.runMutation(internal.adDrive.importFailed, { id: t.id, error: "The Drive folder isn't connected any more." });
        continue;
      }
      out.push({ id: t.id, fileId: t.fileId, name: t.name, token: await accessFor(ctx, c) });
    }
    return out;
  },
});

/** The runner's finished clip filed in the library, as the person who connected the folder; Claude tags it. */
export const importDone = internalMutation({
  args: {
    id: v.id("adDriveImports"),
    storageId: v.id("_storage"),
    posterStorageId: v.optional(v.id("_storage")),
    thumbStorageId: v.optional(v.id("_storage")),
    durationSec: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, storageId, posterStorageId, thumbStorageId, durationSec, note }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status === "done") return null;
    const conn = await liveConnection(ctx, row.trade);
    const by = conn?.connectedBy ?? (await ctx.db.query("adDrive").withIndex("by_trade", (q) => q.eq("trade", row.trade)).first())?.connectedBy;
    if (!by) {
      await ctx.db.patch(id, { status: "failed", error: "No one connected this folder.", updatedAt: nowIso() });
      return null;
    }
    const assetId = await insertAsset(ctx, by, {
      storageId,
      fileName: row.name.replace(/\.[a-z0-9]+$/i, "") + ".mp4",
      tags: [],
      trade: row.trade,
      durationSec,
      posterStorageId,
      thumbStorageId,
    });
    await ctx.db.patch(id, { status: "done", assetId, error: undefined, ...(note ? { note: note.slice(0, 300) } : {}), updatedAt: nowIso() });
    return assetId;
  },
});

export const importFailed = internalMutation({
  args: { id: v.id("adDriveImports"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status === "done") return;
    await ctx.db.patch(id, { status: "failed", error: error.slice(0, 300), updatedAt: nowIso() });
  },
});

/** Tries a failed import again (from the Ads page). */
export const retry = mutation({
  args: { id: v.id("adDriveImports") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.status !== "failed") return;
    await ctx.db.patch(id, { status: "waiting", error: undefined, updatedAt: nowIso() });
    await ctx.scheduler.runAfter(0, internal.adDrive.poll, {});
  },
});
