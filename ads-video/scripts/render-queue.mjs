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
// where a photo or the voice may be a link, or a file beside the fixture or under public/.

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
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

/**
 * Brings an ad's photos and voice into the bundle and points its props at
 * them, with each photo's size. Drawn from files beside the page, a frame
 * never waits on the network.
 */
async function localProps(job, serveDir, base) {
  const folder = `jobs/${job.name.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const dir = path.join(serveDir, "public", folder);
  await mkdir(dir, { recursive: true });
  const seen = new Map();
  const photos = [];
  for (const photo of job.props.photos) {
    if (!seen.has(photo.src)) {
      const bytes = await bytesOf(photo.src, base);
      const size = imageSize(bytes);
      if (!size.width || !size.height) throw new Error("a photo's size couldn't be read");
      // A phone photo stored on its side is shown upright, so its sides swap.
      const turned = (size.orientation ?? 1) >= 5;
      const file = `${folder}/p${seen.size}.${size.type === "jpg" ? "jpg" : (size.type ?? "jpg")}`;
      await writeFile(path.join(serveDir, "public", file), bytes);
      seen.set(photo.src, { src: file, width: turned ? size.height : size.width, height: turned ? size.width : size.height });
    }
    photos.push(seen.get(photo.src));
  }
  let audio = "";
  if (job.props.audio) {
    audio = `${folder}/voice.mp3`;
    await writeFile(path.join(serveDir, "public", audio), await bytesOf(job.props.audio, base));
  }
  return { props: { ...job.props, photos, audio }, dir };
}

async function draw(job, serveUrl, base) {
  const { props, dir } = await localProps(job, serveUrl, base);
  const file = path.join(outDir, `${job.name}.mp4`);
  try {
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
          const res = await fetch(uploadUrl, { method: "POST", headers: { "content-type": "video/mp4" }, body: await readFile(file) });
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
