#!/usr/bin/env node
// Looks through the Library's clips so they can be edited (apps/web/convex/footage.ts).
//
// A job site clip is cut to its good parts before it becomes an ad. To choose them, the app and the owner need to
// see the whole clip at a glance: this takes a frame every second or two with ffmpeg, stamps each with its time,
// and lays them out on contact sheets (4 by 4), which it stores. The backend then proposes the parts to keep.
//
//   node scripts/scan-clips.mjs                  the live queue (needs CONVEX_DEPLOY_KEY, apps/web installed, ffmpeg)
//   node scripts/scan-clips.mjs --file in.mp4    one local file's sheets into out/scan, touching nothing else

import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
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
const budgetMs = Number(flag("minutes") ?? 20) * 60_000;

/** Frames across a sheet, frames to a sheet, how wide each frame is, and the most frames taken from one clip. */
const COLS = 4;
const PER = 16;
const TILE_W = 360;
const MAX_FRAMES = 64;

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

/** How long a video is and how big its picture is, as it plays (a phone clip filmed upright is taller than wide). */
async function probe(file) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration", "-of", "json", file]);
  const info = JSON.parse(stdout);
  const s = info.streams?.[0] ?? {};
  const turned = Math.abs(Number(s.side_data_list?.[0]?.rotation ?? 0)) % 180 === 90;
  const width = turned ? s.height : s.width;
  const height = turned ? s.width : s.height;
  const durationSec = Number(info.format?.duration);
  if (!width || !height || !Number.isFinite(durationSec) || durationSec <= 0) throw new Error("the clip's size or length couldn't be read");
  return { width, height, durationSec: Math.round(durationSec * 10) / 10 };
}

/** A font for the time stamped on each frame; without one the frames go unstamped (their order still tells the time). */
async function stampFont() {
  for (const f of ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"]) {
    try {
      await readFile(f);
      return f;
    } catch {
      // the next one
    }
  }
  return undefined;
}

/**
 * The clip's frames on contact sheets. `every` is how many seconds apart the frames are; a clip gets at most
 * MAX_FRAMES, so a long one is asked for with a wider gap (lib/footage.ts scanEvery).
 */
async function sheetsOf(file, dir, every) {
  const { width, height, durationSec } = await probe(file);
  const gap = Math.max(every, Math.ceil(durationSec / MAX_FRAMES));
  const tileH = Math.round((TILE_W * height) / width / 2) * 2;
  const frames = path.join(dir, "frames");
  await mkdir(frames, { recursive: true });
  const font = await stampFont();
  const stamp = font
    ? `,drawtext=fontfile=${font.replace(/:/g, "\\:")}:text='%{eif\\:t\\:d}s':x=10:y=8:fontsize=40:fontcolor=white:borderw=3:bordercolor=black`
    : "";
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-vf", `fps=1/${gap},scale=${TILE_W}:${tileH}${stamp}`, "-frames:v", String(MAX_FRAMES), "-q:v", "4", path.join(frames, "f%03d.jpg")], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const count = (await readdir(frames)).filter((f) => f.endsWith(".jpg")).length;
  if (count === 0) throw new Error("no frames could be taken from the clip");
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-i", path.join(frames, "f%03d.jpg"), "-vf", `tile=${COLS}x${PER / COLS}:color=black`, "-q:v", "4", path.join(dir, "sheet%02d.jpg")], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const sheets = (await readdir(dir)).filter((f) => /^sheet\d+\.jpg$/.test(f)).sort().map((f) => path.join(dir, f));
  return { sheets, every: gap, frames: count, cols: COLS, per: PER, tileW: TILE_W, tileH, durationSec };
}

async function store(file, type) {
  const uploadUrl = await convex("ads:renderUploadUrl");
  const res = await fetch(uploadUrl, { method: "POST", headers: { "content-type": type }, body: await readFile(file) });
  if (!res.ok) throw new Error(`the file couldn't be stored (${res.status})`);
  return (await res.json()).storageId;
}

async function tryLocal(file) {
  const dir = path.join(root, "out", "scan");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const out = await sheetsOf(file, dir, Number(flag("every") ?? 1));
  console.log(JSON.stringify(out));
}

async function main() {
  if (localFile) return await tryLocal(localFile);
  if (!process.env.CONVEX_DEPLOY_KEY) throw new Error("Set CONVEX_DEPLOY_KEY to reach the backend");
  const started = Date.now();
  let done = 0;
  let failed = 0;
  const seen = new Set();
  for (let ask = 0; ask < 30 && Date.now() - started < budgetMs; ask++) {
    const clips = ((await convex("footage:scanClaim", { limit: 4 })) ?? []).filter((c) => !seen.has(c.id));
    if (!clips.length) break;
    for (const c of clips) {
      seen.add(c.id);
      const t = Date.now();
      const dir = path.join(os.tmpdir(), `scan-${c.id}`);
      await mkdir(dir, { recursive: true });
      try {
        const res = await fetch(c.url);
        if (!res.ok || !res.body) throw new Error(`the clip couldn't be fetched (${res.status})`);
        const file = path.join(dir, "clip.mp4");
        await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
        const out = await sheetsOf(file, dir, c.every);
        const sheets = [];
        for (const s of out.sheets) sheets.push(await store(s, "image/jpeg"));
        await convex("footage:scanDone", { id: c.id, sheets, every: out.every, frames: out.frames, cols: out.cols, per: out.per, tileW: out.tileW, tileH: out.tileH, durationSec: out.durationSec });
        done++;
        console.log(`a clip looked through: ${out.frames} frames on ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} in ${Math.round((Date.now() - t) / 1000)}s`);
      } catch (e) {
        failed++;
        console.error(`a clip couldn't be looked through: ${short(e)}`);
        await convex("footage:scanDone", { id: c.id, error: short(e) }).catch((err) => console.error(`…and couldn't say so: ${short(err)}`));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }
  console.log(`${done} looked through${failed ? `, ${failed} failed` : ""}${done + failed === 0 ? ": nothing was waiting" : ""}`);
}

main().catch((e) => {
  console.error(short(e));
  process.exit(1);
});
