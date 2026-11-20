import type { Line, Photo } from "./types";

export interface Word {
  text: string;
  start: number;
  end: number;
  line: number;
}

/**
 * When each word is said. The voice step keeps each word's own time where
 * ElevenLabs gave it; without that, a word's share of its line's time is its
 * share of the letters, which is close enough for a caption to follow.
 */
export function wordsOf(lines: Line[]): Word[] {
  const out: Word[] = [];
  lines.forEach((line, i) => {
    if (line.words?.length) {
      for (const w of line.words) out.push({ text: w.text, start: w.start, end: w.end, line: i });
      return;
    }
    const words = line.voice.trim().split(/\s+/).filter(Boolean);
    const total = words.reduce((n, w) => n + w.length + 1, 0);
    const span = Math.max(0.2, line.end - line.start);
    let at = line.start;
    for (const w of words) {
      const length = (span * (w.length + 1)) / total;
      out.push({ text: w, start: at, end: at + length, line: i });
      at += length;
    }
  });
  return out;
}

/** Words grouped as they are shown: a few at a time, never across two spoken lines, breaking after a sentence ends. */
export function chunksOf(words: Word[], maxLetters = 16, maxWords = 3, atCommas = false): Word[][] {
  const out: Word[][] = [];
  let now: Word[] = [];
  let letters = 0;
  for (const w of words) {
    const last = now[now.length - 1];
    const full = now.length >= maxWords || letters + w.text.length > maxLetters;
    if (last && (full || last.line !== w.line || /[.!?]$/.test(last.text) || (atCommas && now.length >= 2 && /[,;:]$/.test(last.text)))) {
      out.push(now);
      now = [];
      letters = 0;
    }
    now.push(w);
    letters += w.text.length + 1;
  }
  if (now.length) out.push(now);
  return out;
}

/**
 * When the ask takes over: as the last sentence of the last line starts
 * ("... one vetted local painter. Get a quote today."), or as the last line
 * starts when it is one sentence.
 */
export function askAt(lines: Line[]): number {
  const words = wordsOf(lines);
  const last = words.filter((w) => w.line === lines.length - 1);
  if (last.length === 0) return 0;
  let from = 0;
  last.forEach((w, i) => {
    if (i < last.length - 1 && /[.!?]$/.test(w.text)) from = i + 1;
  });
  return last[from].start;
}

/** When a word is first said, or undefined when it never is. */
export const saidAt = (lines: Line[], word: string): number | undefined =>
  wordsOf(lines).find((w) => w.text.toLowerCase().replace(/[^a-z']/g, "") === word.toLowerCase())?.start;

export interface Run {
  photo: Photo;
  /** Seconds. */
  start: number;
  end: number;
}

/** Which photo is up when: one per spoken line, and a photo used for lines in a row stays up. */
export function runsOf(photos: Photo[], lines: Line[], total: number): Run[] {
  const out: Run[] = [];
  lines.forEach((line, i) => {
    const photo = photos[Math.min(i, photos.length - 1)];
    const last = out[out.length - 1];
    if (last && last.photo.src === photo.src) return;
    const start = i === 0 ? 0 : line.start;
    if (last) last.end = start;
    out.push({ photo, start, end: total });
  });
  return out;
}

/** The largest box of a photo's own shape that fits inside a space. */
export function fit(photo: { width: number; height: number }, maxWidth: number, maxHeight: number) {
  const shape = photo.width / photo.height;
  const width = Math.min(maxWidth, maxHeight * shape);
  return { width: Math.round(width), height: Math.round(width / shape) };
}
