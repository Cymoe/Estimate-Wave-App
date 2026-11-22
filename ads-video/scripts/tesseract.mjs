// A job site video drawn with Tesseract (Mirage's local video engine, the `tsrct` CLI) instead of Remotion, to
// compare the two side by side (the owner asked to test it on job site videos, Nov 2026).
//
// The same ad as the Remotion version (src/parts/Footage.tsx): the clip whole over a blurred, darkened copy of
// itself with its own sound, the title for the opening moments, captions of what is said in it, the brand, music
// under a clip nobody talks in, and the ask after the clip ends. Only the engine differs. The project is written
// here as Tesseract actions (a fixed recipe, no model in the loop), applied with `tsrct project apply`, and exported
// to MP4 through the runner's FFmpeg (the Linux build carries no H.264 encoder).
//
// Needs on the machine: `tsrct` (TSRCT, or on PATH), a Vulkan driver (Mesa lavapipe on a machine without a GPU),
// an FFmpeg with libx264 and AAC (FFMPEG, or on PATH), and the Inter Bold font (INTER_FONT, or the fonts-inter
// package's file). The workflow installs all four; see .github/workflows/ads-render.yml.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const SIZES = { "9x16": { width: 1080, height: 1920 }, "4x5": { width: 1080, height: 1350 } };
/** Where the captions and the title sit, matching the Remotion version (src/theme.ts ZONES). */
const ZONES = {
  "9x16": { chip: 84, head: { top: 180, height: 290 }, captions: { top: 1440, height: 220 } },
  "4x5": { chip: 40, head: { top: 104, height: 190 }, captions: { top: 972, height: 230 } },
};
/** How long the end card holds after the clip (src/types.ts HOLD_SEC), and how long the title is up. */
const HOLD_MS = 1600;
const TITLE_MS = 3500;
/** Music under a clip nobody talks in: under the sound of the work, not hiding it (src/Ad.tsx FOOTAGE_MUSIC). */
const FOOTAGE_MUSIC = 0.35;
const INK = "#0b121c";
/** The most words in one caption. */
const MAX_WORDS = 6;
const WIDE = 960;
const INTER_FONT_PATHS = ["/usr/share/fonts/opentype/inter/Inter-Bold.otf", "/usr/share/fonts/truetype/inter/Inter-Bold.ttf"];

/** "#336699" as Tesseract's colour: sRGB 0 to 1 and alpha. */
export function colorOf(hex, alpha = 1) {
  const h = String(hex ?? "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = (i) => Math.round((parseInt(full.slice(i, i + 2), 16) / 255) * 1000) / 1000;
  return [n(0), n(2), n(4), alpha];
}

/**
 * What is said, as short caption phrases with their times in milliseconds: up to six words, broken where the voice
 * pauses or a sentence ends, the way the Remotion captions read in phrases (src/timing.ts phrasesOf).
 */
export function phrasesOf(lines) {
  const words = [];
  for (const line of lines ?? []) {
    if (line.words?.length) words.push(...line.words.map((w) => ({ text: w.text, start: w.start, end: w.end })));
    else if (line.voice?.trim()) {
      // No word times: the line's words share its time evenly.
      const parts = line.voice.trim().split(/\s+/);
      const step = (line.end - line.start) / parts.length;
      parts.forEach((text, i) => words.push({ text, start: line.start + step * i, end: line.start + step * (i + 1) }));
    }
  }
  // First the runs the voice says in one breath (a sentence's end, a comma or a pause closes one); then a long run
  // is cut into even parts of at most MAX_WORDS, so no caption is left with one word ("SHOP.").
  const runs = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (/[.!?,]$/.test(w.text) || (next && next.start - w.end > 0.35)) {
      runs.push(cur);
      cur = [];
    }
  });
  if (cur.length) runs.push(cur);
  const phrases = [];
  for (const r of runs) {
    const parts = Math.ceil(r.length / MAX_WORDS);
    const size = Math.ceil(r.length / parts);
    for (let i = 0; i < r.length; i += size) {
      const p = r.slice(i, i + size);
      phrases.push({ text: p.map((w) => w.text).join(" "), start: Math.round(p[0].start * 1000), end: Math.round(p[p.length - 1].end * 1000) });
    }
  }
  // Each phrase stays up until the next one starts (or a moment after its last word), so captions don't flicker.
  return phrases.map((p, i) => ({ ...p, end: Math.max(p.end + 300, Math.min(phrases[i + 1]?.start ?? p.end + 500, p.end + 1200)) }));
}

const transform = (x, y) => ({ anchorPoint: [0, 0], position: [x, y], scale: [100, 100], rotation: 0, opacity: 100 });

/** A centred box of text: the title, a caption, the end card's words. */
function textLayer(id, name, text, { top, height, size, color = [1, 1, 1, 1], start, end, caps = false, stroke = true, width = WIDE, frameWidth = 1080 }) {
  return {
    type: "animatorAddTextLayer",
    compositionId: "main",
    layerId: id,
    name,
    insertIndex: 0,
    transform: transform(Math.round((frameWidth - width) / 2), top),
    sourceText: {
      text,
      fontFamily: "Inter",
      fontStyle: "Bold",
      fontSize: size,
      fillColor: color,
      // A dark edge, so white words read over any part of the footage.
      strokeEnabled: stroke,
      strokeColor: [0.04, 0.07, 0.11, 0.9],
      strokeWidth: stroke ? Math.round(size / 9) : 0,
      strokeOverFill: false,
      justification: "center",
      allCaps: caps,
      boxText: true,
      boxSize: [width, height],
      boxPosition: [0, 0],
      boxFit: "shrink",
      verticalAlign: "center",
    },
    projectActiveRange: { start, end },
  };
}

/**
 * The actions that make the ad, given the props the backend hands out (renderProps' footage branch) with its files
 * already local: `clipMs` is the clip's length, `musicMs` the music file's, when there is music.
 */
export function tesseractActions(props, { clipMs, musicMs }) {
  const { width, height } = SIZES[props.ratio];
  const zone = ZONES[props.ratio];
  const endMs = Math.round(props.audioSec * 1000);
  const totalMs = endMs + HOLD_MS;
  const full = { anchorPoint: [width / 2, height / 2], position: [width / 2, height / 2], scale: [100, 100], rotation: 0, opacity: 100 };
  const playable = Math.min(clipMs, endMs);
  const clip = (id, name, fit, volume) => ({
    type: "animatorAddVideoLayer",
    compositionId: "main",
    layerId: id,
    name,
    insertIndex: 0,
    transform: full,
    sourceRange: { start: 0, duration: playable },
    sourceIntrinsicDuration: clipMs,
    source: { assetId: "clip", fit, sourceRect: { x: 0, y: 0, width, height } },
    projectActiveRange: { start: 0, end: playable },
    volume,
  });
  const actions = [
    // Behind everything, the page colour.
    { type: "animatorAddRectLayer", compositionId: "main", layerId: 1, name: "Page", insertIndex: 0, transform: transform(0, 0), rect: { size: [width, height], fillColor: colorOf(INK), position: [0, 0] }, projectActiveRange: { start: 0, end: totalMs } },
    // A soft, dark copy of the clip fills the edges a clip shot sideways leaves.
    clip(2, "Backdrop", "cover", 0),
    { type: "addFxLayerEffect", compositionId: "main", layerId: 2, effectId: 1, effect: { type: "gaussianBlur", blurriness: 60, repeatEdgePixels: true } },
    // Dark over it, as the Remotion version's brightness(0.45): the clip is what the eye goes to.
    { type: "animatorAddRectLayer", compositionId: "main", layerId: 6, name: "Shade", insertIndex: 0, transform: transform(0, 0), rect: { size: [width, height], fillColor: colorOf(INK, 0.6), position: [0, 0] }, projectActiveRange: { start: 0, end: playable } },
    // The clip itself, whole, with its own sound.
    clip(3, "Clip", "contain", 1),
    // The brand, small at the top, while the clip plays.
    textLayer(4, "Brand", props.brand.name, { top: zone.chip - 24, height: 56, size: 30, start: 0, end: endMs, stroke: true, width: 600, frameWidth: width }),
    // The title, for the opening moments.
    textLayer(5, "Title", props.headline, { top: zone.head.top, height: zone.head.height, size: props.ratio === "9x16" ? 92 : 76, start: 0, end: Math.min(TITLE_MS, endMs), frameWidth: width }),
    { type: "animatorSetLayerFade", compositionId: "main", layerId: 5, fadeInType: "fade", fadeOutType: "fade" },
  ];
  // Captions of what is said, a short phrase at a time.
  let id = 100;
  for (const p of phrasesOf(props.lines)) {
    if (p.start >= endMs) break;
    actions.push(
      textLayer(id++, `Caption ${id - 100}`, p.text, {
        top: zone.captions.top,
        height: zone.captions.height,
        size: props.ratio === "9x16" ? 66 : 56,
        start: p.start,
        end: Math.min(p.end, endMs),
        caps: true,
        frameWidth: width,
      }),
    );
  }
  // The ask, after the clip: the brand's colour, its name and markets, and the button.
  const mid = Math.round(height / 2);
  actions.push(
    { type: "animatorAddRectLayer", compositionId: "main", layerId: 50, name: "End card", insertIndex: 0, transform: transform(0, 0), rect: { size: [width, height], fillColor: colorOf(props.brand.primaryColor), position: [0, 0] }, projectActiveRange: { start: endMs, end: totalMs } },
    { type: "animatorSetLayerFade", compositionId: "main", layerId: 50, fadeInType: "fade", fadeOutType: "none" },
    textLayer(51, "End brand", props.brand.name, { top: mid - 230, height: 110, size: 76, start: endMs, end: totalMs, stroke: false, frameWidth: width }),
    textLayer(52, "End markets", (props.brand.markets ?? []).slice(0, 2).join(" · "), { top: mid - 120, height: 60, size: 34, color: colorOf(props.brand.accentColor), start: endMs, end: totalMs, stroke: false, frameWidth: width }),
    { type: "animatorAddRectLayer", compositionId: "main", layerId: 53, name: "Button", insertIndex: 0, transform: transform(Math.round(width / 2 - 230), mid + 10), rect: { size: [460, 120], fillColor: [1, 1, 1, 1], roundness: 60, position: [0, 0] }, projectActiveRange: { start: endMs + 150, end: totalMs } },
    { type: "animatorSetLayerFade", compositionId: "main", layerId: 53, fadeInType: "pop", fadeOutType: "none" },
    textLayer(54, "Button words", "Get a quote", { top: mid + 10, height: 120, size: 52, color: colorOf(props.brand.primaryColor), start: endMs + 150, end: totalMs, stroke: false, width: 460, frameWidth: width }),
    { type: "animatorSetLayerFade", compositionId: "main", layerId: 54, fadeInType: "pop", fadeOutType: "none" },
  );
  // Music under a clip nobody talks in, from where the track should start.
  if (musicMs) {
    const from = Math.round((props.sound?.musicFrom ?? 0) * 1000);
    actions.push({
      type: "animatorAddAudioLayer",
      compositionId: "main",
      layerId: 60,
      name: "Music",
      sourceRange: { start: from, duration: Math.max(0, Math.min(totalMs, musicMs - from)) },
      sourceIntrinsicDuration: musicMs,
      source: { assetId: "music" },
      projectActiveRange: { start: 0, end: Math.min(totalMs, musicMs - from) },
      volume: FOOTAGE_MUSIC,
      windowMs: 50,
    });
  }
  return actions;
}

/** The length of a media file in milliseconds, read by FFmpeg's prober beside the given FFmpeg. */
async function durationMs(file, ffmpeg) {
  const probe = path.join(path.dirname(ffmpeg), "ffprobe");
  const { stdout } = await run(existsSync(probe) ? probe : "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const sec = Number(stdout.trim());
  if (!Number.isFinite(sec) || sec <= 0) throw new Error(`couldn't read how long ${path.basename(file)} runs`);
  return Math.floor(sec * 1000);
}

const which = async (name) => {
  try {
    return (await run("bash", ["-lc", `command -v ${name}`])).stdout.trim() || null;
  } catch {
    return null;
  }
};

/**
 * Draws one job site ad with Tesseract into `output` (an MP4). `props` are the ad's props with local files (the clip
 * at props.footage.src, music at props.sound.music), resolved against `publicDir`. `work` is a folder of its own.
 */
export async function drawWithTesseract(props, { publicDir, work, output }) {
  const tsrct = process.env.TSRCT || (await which("tsrct"));
  const ffmpeg = process.env.FFMPEG || (await which("ffmpeg"));
  if (!tsrct) throw new Error("Tesseract (tsrct) isn't installed on this machine");
  if (!ffmpeg) throw new Error("Tesseract needs FFmpeg to write an MP4, and none was found");
  const font = process.env.INTER_FONT || INTER_FONT_PATHS.find((f) => existsSync(f));
  if (!font) throw new Error("Tesseract needs the Inter Bold font file (fonts-inter)");
  if (!props.footage?.src) throw new Error("Only a job site video is drawn with Tesseract");
  const clip = path.join(publicDir, props.footage.src);
  const music = props.sound?.music ? path.join(publicDir, props.sound.music) : null;
  const project = path.join(work, "ad.tsrct");
  const { width, height } = SIZES[props.ratio];
  const t = async (...args) => (await run(tsrct, args, { maxBuffer: 64 * 1024 * 1024 })).stdout;
  await t("project", "create", "--project", project, "--width", String(width), "--height", String(height));
  await t("project", "import-video", "--project", project, "--file", clip, "--asset-id", "clip");
  await t("project", "import-font", "--project", project, "--file", font);
  let musicMs = 0;
  if (music && existsSync(music)) {
    await t("project", "import-asset", "--project", project, "--file", music, "--asset-id", "music", "--kind", "audio");
    musicMs = await durationMs(music, ffmpeg);
  }
  const actions = path.join(work, "actions.json");
  await writeFile(actions, JSON.stringify(tesseractActions(props, { clipMs: await durationMs(clip, ffmpeg), musicMs })));
  await t("project", "apply", "--project", project, "--actions", actions);
  await t("project", "check", "--project", project);
  await t("export", "--project", project, "--output", output, "--fps", "30", "--resolution", "1080p", "--encoder-backend", "external-ffmpeg-command", "--ffmpeg-path", ffmpeg);
  if (!existsSync(output)) throw new Error("Tesseract finished without writing the video");
  return output;
}
