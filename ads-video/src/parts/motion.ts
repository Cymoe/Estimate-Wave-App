import { Easing, interpolate, spring } from "remotion";
import type { Line } from "../types";
import type { Word } from "../timing";

/**
 * Small pieces every look moves with, so things land with some snap: a spring
 * that overshoots a touch, a hard quick ease, a shake when something lands,
 * blur while something moves fast, and the times of words and beats to key
 * moves to.
 */

/** Fast out, soft landing: most of the move happens in the first few frames. */
export const SNAP = Easing.bezier(0.16, 1, 0.3, 1);
/** Hard in and out, for wipes and pushes. */
export const HARD = Easing.bezier(0.7, 0, 0.2, 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 from a moment, over a few frames, with the snappy ease. */
export const quick = (frame: number, fps: number, at: number, frames = 8, easing = SNAP) =>
  interpolate(frame - Math.round(at * fps), [0, frames], [0, 1], { ...clamp, easing });

/** 0 → 1 with a little overshoot: for things that land. */
export const pop = (frame: number, fps: number, at: number, bouncy = 1) =>
  spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 10 + 6 * (1 - bouncy), mass: 0.5, stiffness: 190 } });

/** A short shake after a moment, in pixels: gone within six frames. */
export const jolt = (frame: number, fps: number, at: number, px = 10) => {
  const since = frame - Math.round(at * fps);
  if (since < 0 || since > 6) return { x: 0, y: 0 };
  const fade = 1 - since / 6;
  return { x: Math.round(Math.sin(since * 2.7) * px * fade), y: Math.round(Math.cos(since * 3.3) * px * 0.6 * fade) };
};

/** A blur filter for something moving `speed` (pixels a frame): sharp when still. */
export const blurFor = (speed: number) => {
  const px = Math.min(14, Math.abs(speed) * 0.12);
  return px < 0.4 ? undefined : `blur(${px.toFixed(1)}px)`;
};

/** How far a move goes in one frame, for `blurFor`: the change in `value` between this frame and the last. */
export const speedOf = (value: (frame: number) => number, frame: number) => value(frame) - value(frame - 1);

/** The beat nearest a moment, if one is close; otherwise the moment itself. */
export const snap = (t: number, beats: number[] = [], within = 0.2) => {
  let best = t;
  let gap = within;
  for (const b of beats) {
    const d = Math.abs(b - t);
    if (d <= gap) {
      gap = d;
      best = b;
    }
  }
  return best;
};

/** How strongly a beat is landing now: 1 on the beat, falling to 0 over a few frames. */
export const thump = (t: number, beats: number[] = [], last = 0.18) => {
  let k = 0;
  for (const b of beats) if (t >= b && t - b < last) k = Math.max(k, 1 - (t - b) / last);
  return k;
};

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** When a word is first said in a line (or anywhere, without a line). */
export const wordAt = (words: Word[], text: string, line?: number) => words.find((w) => (line === undefined || w.line === line) && plain(w.text) === plain(text));

/**
 * Where a point's line turns from the corner a no-prep quote cuts to the prepped way: the start of its second
 * sentence, or partway in when it has only one.
 */
export const turnOf = (words: Word[], lines: Line[], i: number) => {
  const own = words.filter((w) => w.line === i);
  const k = own.findIndex((w, n) => n > 0 && /[.!?]$/.test(own[n - 1].text));
  if (k > 0) return own[k].start;
  const line = lines[i];
  return line.start + (line.end - line.start) * 0.45;
};

/** Words the look can colour: those that also name the point (its label), so the eye catches the subject. */
export const keyWords = (line: Line) => new Set((line.label ?? "").split(/\s+/).map(plain).filter((w) => w.length > 3));
export const isKey = (keys: Set<string>, text: string) => {
  const p = plain(text);
  return /\d/.test(p) || [...keys].some((k) => p.startsWith(k.slice(0, Math.max(4, k.length - 2))));
};
