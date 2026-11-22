#!/usr/bin/env node
// Draws the ads that are waiting.
//
// The ad maker (apps/web/convex/ads.ts) writes and voices an ad, then leaves
// it "voiced". This asks the backend for those ads, draws each one with
// Remotion, puts the file back and says so; an ad it can't draw is handed
// back with the reason. It keeps asking until nothing is waiting.
//
//   node scripts/render-queue.mjs                    the live queue (needs CONVEX_DEPLOY_KEY, and apps/web installed)
//   node scripts/render-queue.mjs --fixture f.json   draw the ads in a file into out/queue, touching nothing else
//
// A fixture is what the backend hands out: [{ "name": "...", "props": { ... } }],
// where a photo, the voice or the music may be a link, or a file beside the fixture or under public/.

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { imageSize } from "image-size";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : (process.argv[i + 1] ?? "");
};
const fixture = flag("fixture");
const outDir = path.resolve(flag("out") ?? path.join(root, "out", "queue"));
const convexDir = path.resolve(flag("convex-dir") ?? path.join(root, "..", "apps", "web"));
/** Ads taken per ask: one idea's two sizes, so nothing sits claimed for long while it waits its turn. */
const perAsk = Number(flag("limit") ?? 2);
/** Stop asking for more after this long, so the run ends well inside its time limit. */
const budgetMs = Number(flag("minutes") ?? 40) * 60_000;
const browserExecutable = process.env.ADS_BROWSER || undefined;
const concurrency = Number(process.env.ADS_CONCURRENCY ?? 0) || Math.max(1, Math.min(8, os.cpus().length));

/** Runs one backend function and gives back what it returned. */
async function convex(fn, args = {}) {
  const { stdout } = await run("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: convexDir, maxBuffer: 64 * 1024 * 1024 });
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Anything printed before the result: the result starts at the first bracket, brace or quote on a line of its own.
    const at = text.search(/^[[{"]/m);
    if (at < 0) throw new Error(`${fn} answered with something that isn't JSON: ${text.slice(0, 200)}`);
    return JSON.parse(text.slice(at));
  }
}

/** The bytes of a link, or of a file beside the fixture or under public/. */
async function bytesOf(src, base) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`couldn't fetch a file (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  const found = [path.resolve(base, src), path.join(root, "public", src)].find((p) => existsSync(p));
  if (!found) throw new Error(`no file at ${src}`);
  return await readFile(found);
}

/** The loudness ads are played at. A voice comes from ElevenLabs a good deal quieter, and uneven from one read to the next. */
const VOICE_LUFS = -16;

/**
 * Brings a voice up to the usual loudness with the ffmpeg Remotion carries.
 * If that can't be run, the voice goes in as it came: quieter, not broken.
 */
async function evenVoice(file, from = file) {
  const out = file.replace(/\.mp3$/, "-even.mp3");
  try {
    await run("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-i", from, "-vn", "-af", `loudnorm=I=${VOICE_LUFS}:TP=-1.5:LRA=11`, "-ar", "44100", "-b:a", "192k", out], { cwd: root });
    return existsSync(out) ? out : from;
  } catch (e) {
    console.error(`The voice couldn't be brought up to level and is used as it came: ${short(e)}`);
    return from;
  }
}

/**
 * Cuts a music track to where it should start and brings it to the same loudness as the voice, so the level it is
 * mixed under the voice at means the same for every track. If that can't be run, the track goes in whole.
 */
async function evenMusic(file, from = 0) {
  const out = file.replace(/\.mp3$/, "-even.mp3");
  try {
    await run(
      "npx",
      ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-ss", String(from), "-t", "90", "-i", file, "-af", `loudnorm=I=${VOICE_LUFS}:TP=-1.5:LRA=11`, "-ar", "44100", "-b:a", "192k", out],
      { cwd: root },
    );
    return existsSync(out) ? { file: out, from: 0 } : { file, from };
  } catch (e) {
    console.error(`The music couldn't be cut and levelled and is used as it came: ${short(e)}`);
    return { file, from };
  }
}

/**
 * Cuts a photo down to a part of its width, or of its height when the part is measured down. A photo that is a
 * before and its after in one image, side by side or one above the other, is shown one picture at a time, so the
 * cut has to be right: if it can't be made, the ad isn't drawn.
 */
async function cutPhoto(file, size, crop) {
  const out = file.replace(/(\.[a-z]+)$/i, `-${crop.down ? "d" : ""}${crop.from}-${crop.to}.jpg`);
  const share = (crop.to - crop.from) / 100;
  const width = crop.down ? size.width : Math.max(2, Math.round(size.width * share));
  const height = crop.down ? Math.max(2, Math.round(size.height * share)) : size.height;
  const left = crop.down ? 0 : Math.round((size.width * crop.from) / 100);
  const top = crop.down ? Math.round((size.height * crop.from) / 100) : 0;
  await run("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", "-i", file, "-vf", `crop=${width}:${height}:${left}:${top}`, "-q:v", "2", out], { cwd: root });
  if (!existsSync(out)) throw new Error("a photo couldn't be cut to the part it should show");
  return { file: out, width, height };
}

/**
 * Brings an ad's photos, voice and music into the bundle and points its props
 * at them, with each photo's size. Drawn from files beside the page, a frame
 * never waits on the network.
 */
async function localProps(job, serveDir, base) {
  const folder = `jobs/${job.name.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const dir = path.join(serveDir, "public", folder);
  await mkdir(dir, { recursive: true });
  const seen = new Map();
  // A photo as a file the page can read, fetched once however many times the ad shows it.
  const local = async (photo) => {
    // The same file shown whole and shown in part are two different pictures.
    const key = photo.crop ? `${photo.src}#${photo.crop.down ? "d" : ""}${photo.crop.from}-${photo.crop.to}` : photo.src;
    if (!seen.has(key)) {
      const bytes = await bytesOf(photo.src, base);
      const size = imageSize(bytes);
      if (!size.width || !size.height) throw new Error("a photo's size couldn't be read");
      // A phone photo stored on its side is shown upright, so its sides swap.
      const turned = (size.orientation ?? 1) >= 5;
      const upright = { width: turned ? size.height : size.width, height: turned ? size.width : size.height };
      const file = `${folder}/p${seen.size}.${size.type === "jpg" ? "jpg" : (size.type ?? "jpg")}`;
      await writeFile(path.join(serveDir, "public", file), bytes);
      let fetched = { src: file, ...upright };
      if (photo.crop) {
        const cut = await cutPhoto(path.join(serveDir, "public", file), upright, photo.crop);
        fetched = { src: `${folder}/${path.basename(cut.file)}`, width: cut.width, height: cut.height };
      }
      // The same photo with the camera moving, when a clip of it has been made. A clip shows the whole photo, so a part doesn't use it.
      if (photo.motion?.src && !photo.crop) {
        const clip = `${folder}/m${seen.size}.mp4`;
        await writeFile(path.join(serveDir, "public", clip), await bytesOf(photo.motion.src, base));
        fetched.motion = { src: clip };
      }
      seen.set(key, fetched);
    }
    // Where to move in on belongs to the line's photo, so it is kept as the line gave it.
    return { ...seen.get(key), ...(photo.focus ? { focus: photo.focus } : {}), ...(photo.before ? { before: true } : {}) };
  };
  // A still: its before and its after, nothing else to bring.
  if (job.props.pair) {
    const pair = [];
    for (const photo of job.props.pair) pair.push(await local(photo));
    return { props: { ...job.props, pair }, dir };
  }
  const photos = [];
  for (const photo of job.props.photos) photos.push(await local(photo));
  // A reel's lines may each have photos of their own, and the ad a few to spare.
  const lines = [];
  for (const line of job.props.lines ?? []) {
    if (!line.photos?.length) lines.push(line);
    else {
      const own = [];
      for (const photo of line.photos) own.push(await local(photo));
      lines.push({ ...line, photos: own });
    }
  }
  const spare = [];
  for (const photo of job.props.spare ?? []) spare.push(await local(photo));
  let audio = "";
  // A job site video is fetched whole: it is the picture, and its sound (taken out and levelled) the voice.
  let footage = job.props.footage;
  if (footage?.src) {
    const clip = path.join(serveDir, "public", folder, "clip.mp4");
    await writeFile(clip, await bytesOf(footage.src, base));
    footage = { src: `${folder}/clip.mp4` };
    // A clip with no sound at all plays silent rather than failing the ad.
    const voice = await evenVoice(clip.replace(/\.mp4$/, ".mp3"), clip);
    audio = voice.endsWith(".mp4") ? "" : `${folder}/${path.basename(voice)}`;
  } else if (job.props.audio) {
    const voice = path.join(serveDir, "public", folder, "voice.mp3");
    await writeFile(voice, await bytesOf(job.props.audio, base));
    audio = `${folder}/${path.basename(await evenVoice(voice))}`;
  }
  // An on-camera creator's take is fetched whole; the page keys out its green as it draws each frame.
  let presenter = job.props.presenter;
  if (presenter?.src) {
    const take = path.join(serveDir, "public", folder, "take.mp4");
    await writeFile(take, await bytesOf(presenter.src, base));
    presenter = { src: `${folder}/take.mp4` };
  }
  // Music is fetched like a photo; the effects are files the renderer carries, so they stay as they are.
  let sound = job.props.sound;
  if (sound?.music) {
    const music = path.join(serveDir, "public", folder, "music.mp3");
    await writeFile(music, await bytesOf(sound.music, base));
    const even = await evenMusic(music, sound.musicFrom);
    sound = { ...sound, music: `${folder}/${path.basename(even.file)}`, musicFrom: even.from };
  }
  return { props: { ...job.props, photos, lines, ...(spare.length ? { spare } : {}), audio, ...(sound ? { sound } : {}), ...(presenter ? { presenter } : {}), ...(footage ? { footage } : {}) }, dir };
}

async function draw(job, serveUrl, base) {
  const { props, dir } = await localProps(job, serveUrl, base);
  const still = job.kind === "image" || Boolean(job.props.pair);
  const file = path.join(outDir, `${job.name}.${still ? "jpg" : "mp4"}`);
  try {
    if (still) {
      const composition = await selectComposition({ serveUrl, id: "Still", inputProps: props, browserExecutable, logLevel: "error" });
      await renderStill({ composition, serveUrl, output: file, inputProps: props, imageFormat: "jpeg", jpegQuality: 90, browserExecutable, logLevel: "error" });
      return file;
    }
    const composition = await selectComposition({ serveUrl, id: "Ad", inputProps: props, browserExecutable, logLevel: "error" });
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: file, inputProps: props, concurrency, browserExecutable, logLevel: "error" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return file;
}

const short = (e) => String(e instanceof Error ? e.message : e).replace(/\s+/g, " ").slice(0, 400);

async function main() {
  const started = Date.now();
  await mkdir(outDir, { recursive: true });
  console.log("Building the page the ads are drawn from…");
  const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts"), publicDir: path.join(root, "public") });
  let drawn = 0;
  let failed = 0;

  if (fixture !== undefined) {
    const jobs = JSON.parse(await readFile(fixture, "utf8"));
    for (const job of jobs) {
      const t = Date.now();
      const file = await draw(job, serveUrl, path.dirname(path.resolve(fixture)));
      drawn++;
      console.log(`${job.name}: ${path.relative(process.cwd(), file)} in ${Math.round((Date.now() - t) / 1000)}s`);
    }
  } else {
    for (let ask = 0; ask < 30 && Date.now() - started < budgetMs; ask++) {
      const jobs = await convex("ads:claimRenders", { limit: perAsk });
      if (!jobs?.length) break;
      for (const job of jobs) {
        const t = Date.now();
        try {
          const file = await draw(job, serveUrl, root);
          const uploadUrl = await convex("ads:renderUploadUrl");
          const res = await fetch(uploadUrl, { method: "POST", headers: { "content-type": file.endsWith(".jpg") ? "image/jpeg" : "video/mp4" }, body: await readFile(file) });
          if (!res.ok) throw new Error(`the file couldn't be stored (${res.status})`);
          const { storageId } = await res.json();
          await convex("ads:renderDone", { id: job.id, storageId });
          drawn++;
          console.log(`${job.name}: drawn in ${Math.round((Date.now() - t) / 1000)}s`);
        } catch (e) {
          failed++;
          console.error(`${job.name}: ${short(e)}`);
          await convex("ads:renderFailed", { id: job.id, error: short(e) }).catch((err) => console.error(`…and couldn't say so: ${short(err)}`));
        }
      }
    }
  }
  console.log(`${drawn} drawn${failed ? `, ${failed} failed` : ""}${drawn + failed === 0 ? ": nothing was waiting" : ""}`);
  // An ad that couldn't be drawn has been told so; the run itself only fails when nothing could be drawn at all.
  if (failed > 0 && drawn === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(short(e));
  process.exit(1);
});
