#!/usr/bin/env node
// Brings clips from the Ads library's Google Drive folder into the library (apps/web/convex/adDrive.ts).
//
// The backend notes each new video in the folder as waiting and starts this run. It claims the waiting files (each
// with an access token for the folder, which is never printed), downloads each, makes it 1080p at most 30 fps in
// H.264 with ffmpeg (the sound in AAC, or none when ffmpeg can't read it, like an iPhone's Spatial Audio), a still
// and a small copy, stores the three and says done; a file it can't do is handed back with the reason.
//
//   node scripts/import-clips.mjs                 the live queue (needs CONVEX_DEPLOY_KEY, apps/web installed, ffmpeg)
//   node scripts/import-clips.mjs --file in.mov   one local file made into out/clips, touching nothing else

import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : (process.argv[i + 1] ?? "");
};
const localFile = flag("file");
const convexDir = path.resolve(flag("convex-dir") ?? path.join(root, "..", "apps", "web"));
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const ffprobe = process.env.FFPROBE || "ffprobe";
/** Stop asking for more after this long, so the run ends well inside its time limit. */
const budgetMs = Number(flag("minutes") ?? 40) * 60_000;

/** Runs one backend function and gives back what it returned (nothing it returns is printed). */
async function convex(fn, args = {}) {
  const { stdout } = await run("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: convexDir, maxBuffer: 64 * 1024 * 1024 });
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const at = text.search(/^[[{"]/m);
    if (at < 0) throw new Error(`${fn} answered with something that isn't JSON`);
    return JSON.parse(text.slice(at));
  }
}

const short = (e) => String(e?.stderr?.split("\n").filter(Boolean).slice(-2).join(" ") || e?.message || e).slice(0, 280);

/** How long a video is, in seconds (one decimal). */
async function durationOf(file) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const n = Number(stdout.trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined;
}

/** The long side at most 1920, the short side what keeps the shape (even). */
const SCALE = "scale=w='if(gte(iw,ih),min(1920,iw),-2)':h='if(gte(iw,ih),-2,min(1920,ih))'";

/**
 * The clip made for ads: 1080p at most, at most 30 fps, H.264 about 4 Mbps, the sound in AAC. When ffmpeg can't read
 * the sound, again without it, and says so.
 */
async function makeSmaller(input, output) {
  const video = ["-vf", SCALE, "-fpsmax", "30", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "4M", "-maxrate", "5M", "-bufsize", "8M", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
  try {
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, ...video, "-map", "0:v:0", "-map", "0:a:0?", "-c:a", "aac", "-b:a", "128k", output], { maxBuffer: 16 * 1024 * 1024 });
    return { note: undefined };
  } catch (e) {
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, ...video, "-map", "0:v:0", "-an", output], { maxBuffer: 16 * 1024 * 1024 });
    return { note: `sound left off: ffmpeg couldn't read it (${short(e).slice(0, 120)})` };
  }
}

/** A still (the long side 1600) and the grid's small copy (480), from a moment in. */
async function stills(video, dir, durationSec) {
  const at = String(Math.min(1, Math.max(0, (durationSec ?? 2) / 2)));
  const poster = path.join(dir, "poster.jpg");
  const thumb = path.join(dir, "thumb.jpg");
  const fit = (n) => `scale=w='if(gte(iw,ih),min(${n},iw),-2)':h='if(gte(iw,ih),-2,min(${n},ih))'`;
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", at, "-i", video, "-frames:v", "1", "-vf", fit(1600), "-q:v", "3", poster]);
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", at, "-i", video, "-frames:v", "1", "-vf", fit(480), "-q:v", "5", thumb]);
  return { poster, thumb };
}

async function store(file, type) {
  const uploadUrl = await convex("ads:renderUploadUrl");
  const res = await fetch(uploadUrl, { method: "POST", headers: { "content-type": type }, body: await readFile(file) });
  if (!res.ok) throw new Error(`the file couldn't be stored (${res.status})`);
  return (await res.json()).storageId;
}

/** One local file made as it would be for the library, into out/clips: to try the settings. */
async function tryLocal(file) {
  const dir = path.join(root, "out", "clips");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, path.basename(file).replace(/\.[a-z0-9]+$/i, "") + ".mp4");
  const t = Date.now();
  const { note } = await makeSmaller(file, out);
  const durationSec = await durationOf(out);
  const { poster, thumb } = await stills(out, dir, durationSec);
  console.log(JSON.stringify({ in: (await stat(file)).size, out: (await stat(out)).size, durationSec, note, poster, thumb, seconds: Math.round((Date.now() - t) / 1000) }));
}

async function main() {
  if (localFile) return await tryLocal(path.resolve(localFile));
  const started = Date.now();
  let done = 0;
  let failed = 0;
  for (let ask = 0; ask < 50 && Date.now() - started < budgetMs; ask++) {
    const files = await convex("adDrive:claimImports", { limit: 4 });
    if (!files?.length) break;
    for (const f of files) {
      const t = Date.now();
      const dir = path.join(os.tmpdir(), `clip-${f.id}`);
      await mkdir(dir, { recursive: true });
      try {
        // The original, straight to disk: a phone clip can be a few hundred MB.
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.fileId)}?alt=media&supportsAllDrives=true`, {
          headers: { authorization: `Bearer ${f.token}` },
        });
        if (!res.ok || !res.body) throw new Error(`Google Drive wouldn't hand it over (${res.status})`);
        const original = path.join(dir, "original");
        await pipeline(Readable.fromWeb(res.body), createWriteStream(original));
        const out = path.join(dir, "clip.mp4");
        const { note } = await makeSmaller(original, out);
        const durationSec = await durationOf(out);
        const { poster, thumb } = await stills(out, dir, durationSec);
        const storageId = await store(out, "video/mp4");
        const posterStorageId = await store(poster, "image/jpeg");
        const thumbStorageId = await store(thumb, "image/jpeg");
        await convex("adDrive:importDone", { id: f.id, storageId, posterStorageId, thumbStorageId, ...(durationSec ? { durationSec } : {}), ...(note ? { note } : {}) });
        done++;
        console.log(`${f.name}: in the library in ${Math.round((Date.now() - t) / 1000)}s${note ? ` (${note})` : ""}`);
      } catch (e) {
        failed++;
        console.error(`${f.name}: ${short(e)}`);
        await convex("adDrive:importFailed", { id: f.id, error: short(e) }).catch((err) => console.error(`…and couldn't say so: ${short(err)}`));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }
  console.log(`${done} brought in${failed ? `, ${failed} failed` : ""}${done + failed === 0 ? ": nothing was waiting" : ""}`);
  if (failed > 0 && done === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(short(e));
  process.exit(1);
});
