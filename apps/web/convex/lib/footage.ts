// Job site videos (footage.ts): a clip the crew shot on the job runs as the ad, as it was shot.
//
// Nothing is drawn over the work but the brand, captions of what is said in it, its title at the start and the
// ask at the end. Its own sound plays. The words around it (the title, and the headline and text Facebook shows)
// are written by Claude from what can be seen and heard in the clip, following a long-running competitor ad's
// written copy the way every other ad follows one, and are checked against the same banned claims.

import { HEADLINE_MAX, TITLE_MAX, forbiddenIn, onceOnly, parseJson, pickExamples } from "./ads";
import type { HeardWord } from "./voiceActors";

/** The longest clip that runs as an ad: Meta's reels and stories run to 90 seconds. */
export const FOOTAGE_MAX_SEC = 90;
/** A caption line ends at a sentence's end, a pause this long, or this many words. */
export const LINE_PAUSE_SEC = 0.8;
export const LINE_WORDS = 12;

/**
 * Whether a competitor ad is itself work being done on camera: what the swipe tagging calls "process" footage, or,
 * for an ad not tagged yet, a description of its creative that says so ("Door-painting process video"). Ads like
 * that keep running (Spray Tex's process videos have run well over a year), so a job site video follows one.
 */
export function isWorkFootage(swipe: { footage?: string[]; creative?: string }): boolean {
  if (swipe.footage?.length) return swipe.footage.includes("process");
  const creative = swipe.creative ?? "";
  return /\b(process|spray(ing|ed)?|working|in action|job ?site|on the job)\b/i.test(creative) && !/\b(graphic|carousel|collage)\b/i.test(creative);
}

/** The competitor ad a job site video follows: the best work-footage ad for its subject, else the best of any kind. */
export function pickFootageSwipe<S extends Parameters<typeof pickExamples>[0][number] & { footage?: string[]; creative?: string }>(swipes: S[], scope: string): S | undefined {
  return pickExamples(swipes.filter(isWorkFootage), scope, 1)[0] ?? pickExamples(swipes, scope, 1)[0];
}

/** Marks the prompt, so a test can tell it apart. */
export const FOOTAGE_MARK = "This ad is a job site video";

/**
 * What is said in a clip, as caption lines: a line ends where a sentence ends, at a pause, or after a dozen words.
 * Each keeps its words' times, so the captions follow the voice in the clip.
 */
export function linesFromHeard(heard: HeardWord[]): Array<{ voice: string; start: number; end: number; words: Array<{ text: string; start: number; end: number }> }> {
  const words = heard.filter((w) => w.text.trim()).map((w) => ({ text: w.text.trim(), start: round(w.start), end: round(Math.max(w.start, w.end)) }));
  const lines: Array<{ voice: string; start: number; end: number; words: typeof words }> = [];
  let current: typeof words = [];
  const close = () => {
    if (current.length === 0) return;
    lines.push({ voice: current.map((w) => w.text).join(" "), start: current[0].start, end: current[current.length - 1].end, words: current });
    current = [];
  };
  words.forEach((w, i) => {
    const next = words[i + 1];
    current.push(w);
    if (/[.!?]["')\]]?$/.test(w.text) || current.length >= LINE_WORDS || (next && next.start - w.end >= LINE_PAUSE_SEC)) close();
  });
  close();
  return lines;
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface FootageCopy {
  /** A few words naming the ad on its card (not drawn on the video). */
  title: string;
  headline: string;
  primaryText: string;
  /**
   * What the words heard in the clip are: the crew talking (they become the captions), a song or radio playing in
   * the background (no captions, and the clip's sound is replaced with our music: a copyrighted song gets an ad
   * muted or blocked), or nothing worth a caption.
   */
  speech: Speech;
}

/** The competitor ad the words follow, as the swipe file holds it. */
export interface FootageSwipe {
  company: string;
  hook: string;
  offer: string;
  adCopy?: string;
  transcript?: string;
  daysRunning?: number;
}

/**
 * How long the text Facebook shows above a job site video may run: one or two short sentences. The work in the
 * clip does the talking (the owner found the competitor-length text ridiculous, Nov 2026).
 */
export const FOOTAGE_PRIMARY_MAX = 150;
/** Emoji and checklist marks: none in a job site video's text. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/u;

/** What is heard in a clip: the crew talking, a song or radio playing, or nothing to speak of. */
export const SPEECH = ["crew", "song", "none"] as const;
export type Speech = (typeof SPEECH)[number];

/** The instructions for the words around a job site video. */
export function footagePrompt(opts: { brand: string; trade: string; town: string; heard: string; seen?: string }): string {
  return [
    `${FOOTAGE_MARK}: a clip ${opts.brand}'s crew shot on a ${opts.trade.toLowerCase()} job, run as it was shot, with its own sound.`,
    "Write only the short words around it. Nothing is written over the clip but captions of what the crew says in it.",
    "",
    "What speech-to-text heard in the clip's sound:",
    opts.heard.trim() ? `"${opts.heard.trim()}"` : "(nothing: it is the work and the job site's sound)",
    "First decide what that is. A crew member or the owner talking on the job is \"crew\". Lyrics of a song or a radio",
    "playing in the background is \"song\" (lines that rhyme or sound like a song are a song, not the crew). Nothing,",
    "or a few stray words, is \"none\".",
    ...(opts.seen ? ["", `What the clip shows: ${opts.seen}`] : []),
    "",
    // No competitor ad is followed (the owner, Nov 2026): a job site clip speaks for itself, and its words say plainly what it shows.
    "Write it plainly, from the clip alone: say what the work in it is, in a homeowner's words, then the free quote. Don't model it on anyone else's ad.",
    "",
    "Rules:",
    `- Speak as ${opts.brand}, the company doing the work ("we", "our crew"), never as a homeowner or customer.`,
    "- Say only what can be seen or heard in the clip. Never name or hint where the job was, and never invent a detail about it.",
    `- The only offer is a free quote from ${opts.brand}. ${opts.town ? `You may speak to ${opts.town} homeowners, but never place the job.` : ""}`,
    "- No prices, dollar amounts, discounts, guarantees or warranties. No promise of how fast anyone answers or finishes.",
    "- Never say vetted, screened, top-rated or the best.",
    `- Keep it short: the text above the video is one or two plain sentences, at most ${FOOTAGE_PRIMARY_MAX} characters, ending on the free quote. No emoji, no checklists, no lists of what can be seen.`,
    "",
    "Answer with JSON only:",
    `{"speech": "crew|song|none", "title": "3 to 6 words naming the ad, at most ${TITLE_MAX} characters", "headline": "at most ${HEADLINE_MAX} characters", "primaryText": "at most ${FOOTAGE_PRIMARY_MAX} characters"}`,
  ].join("\n");
}

/**
 * A title cut to fit, at a whole word: a job site video shows no title on screen (it only names the ad), so one a
 * few characters over is shortened rather than the whole ad failing on it (it did, on the owner's first try from
 * Create ads, Nov 2026).
 */
export function fitTitle(title: string, max = TITLE_MAX): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:.\-–]+$/, "");
}

/** What is wrong with the words written for a job site video. */
export function footageProblems(copy: Partial<FootageCopy> | null): string[] {
  if (!copy) return ["the reply wasn't JSON"];
  const out: string[] = [];
  const title = copy.title?.trim() ?? "";
  const headline = copy.headline?.trim() ?? "";
  const primary = copy.primaryText?.trim() ?? "";
  if (!title) out.push("no title");
  else if (title.length > TITLE_MAX) out.push(`title over ${TITLE_MAX} characters`);
  if (!headline) out.push("no headline");
  else if (headline.length > HEADLINE_MAX) out.push(`headline over ${HEADLINE_MAX} characters`);
  if (!primary) out.push("no primary text");
  else if (primary.length > FOOTAGE_PRIMARY_MAX) out.push(`primary text over ${FOOTAGE_PRIMARY_MAX} characters`);
  if (EMOJI.test([title, headline, primary].join(" "))) out.push("emoji or check marks in the text");
  if (!SPEECH.includes(copy.speech as Speech)) out.push('no "speech" (crew, song or none)');
  out.push(...forbiddenIn([title, headline, primary].join(" ")));
  return out;
}


// ------------------------------------------------------------------ Editing a clip down to its good parts
//
// A job site clip used to run whole, from its first second (the owner, Nov 2026: "you have no clue where to edit
// the clips"). Now it is cut: the app looks through the clip (frames taken every second or two, and what is said
// when) and proposes the parts to keep, the opener first; the owner adjusts them; the ad is made from those only.

/** One part of a clip to keep, in seconds from its start. */
export interface Cut {
  from: number;
  to: number;
}
/** The shortest part worth keeping, the most parts, and how long an edit should run. */
export const CUT_MIN_SEC = 1;
export const CUT_PARTS_MAX = 8;
export const EDIT_MIN_SEC = 6;
export const EDIT_MAX_SEC = 30;
/** The longest clip that can be looked through and cut (an uncut clip still has to be FOOTAGE_MAX_SEC or less). */
export const CLIP_MAX_SEC = 600;

const tenth = (n: number) => Math.round(n * 10) / 10;

/** Parts as they are stored: within the clip, a tenth of a second fine, each at least a second, in the order given. */
export function cleanCuts(cuts: Array<Partial<Cut>> | undefined | null, durationSec: number): Cut[] {
  const end = Math.max(0, durationSec);
  const out: Cut[] = [];
  for (const c of cuts ?? []) {
    const from = tenth(Math.min(Math.max(0, Number(c.from)), end));
    const to = tenth(Math.min(Math.max(0, Number(c.to)), end));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < CUT_MIN_SEC) continue;
    out.push({ from, to });
    if (out.length >= CUT_PARTS_MAX) break;
  }
  return out;
}

/** How long the parts run together. */
export const cutTotal = (cuts: Cut[]): number => tenth(cuts.reduce((n, c) => n + (c.to - c.from), 0));

/**
 * The words said inside the parts kept, timed on the cut clip: a word counts where its middle falls, and its time
 * moves to where its part now starts.
 */
export function wordsInCuts<W extends { text: string; start: number; end: number }>(words: W[], cuts: Cut[]): W[] {
  const out: W[] = [];
  let offset = 0;
  for (const c of cuts) {
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      if (mid < c.from || mid >= c.to) continue;
      out.push({ ...w, start: tenth(Math.max(w.start, c.from) - c.from + offset), end: tenth(Math.min(w.end, c.to) - c.from + offset) });
    }
    offset += c.to - c.from;
  }
  return out;
}

/** How often a frame is taken for a clip of this length, so the whole clip fits on a few sheets (at most 64 frames). */
export const scanEvery = (durationSec: number): number => Math.max(1, Math.ceil(durationSec / 64));

export const CUTS_MARK = "You are editing a clip filmed on a job site into a short ad";

/** The brief for proposing the parts of a clip to keep. The contact sheets follow it. */
export function cutsPrompt(input: { trade: string; durationSec: number; every: number; frames: number; seen?: string; lines: Array<{ voice: string; start: number; end: number }> }): string {
  const said = input.lines.length
    ? ["What is said in it, with the seconds each line runs:", ...input.lines.map((l) => `- ${l.start.toFixed(1)} to ${l.end.toFixed(1)}: ${l.voice}`)]
    : ["Nobody speaks in it."];
  return [
    `${CUTS_MARK} for Facebook and Instagram, for a ${input.trade.toLowerCase()} company. The clip runs ${Math.round(input.durationSec)} seconds.`,
    `Frames from it are attached as contact sheets, one frame every ${input.every} second${input.every === 1 ? "" : "s"}, read left to right, top to bottom. Each frame is stamped with its time in seconds.`,
    input.seen ? `What the clip shows, as described when it was filed: ${input.seen.replace(/\s+/g, " ").slice(0, 400)}` : "",
    ...said,
    "",
    `Choose the parts to keep: 1 to 5 parts, ${EDIT_MIN_SEC} to ${EDIT_MAX_SEC} seconds together (a clip shorter than that: what is good in it).`,
    "- The FIRST part is the opener, and it decides whether anyone watches: the single most striking two to four seconds, wherever it is in the clip. Work visibly happening (paint going on, a spray gun moving, tape coming off) or the finished result filling the frame. Never a person walking in, a hand adjusting the camera, or a wide shot of nothing happening.",
    "- After the opener, the rest in the order they happen in the clip.",
    "- Keep: the work being done, the finish up close, the before turning into the after, a person speaking to the camera about the work.",
    "- Leave out: walking and setting up, the camera pointing at the floor or the ceiling, blur, dark stretches, long stretches where nothing changes, and mess that isn't the work.",
    "- Don't cut a spoken sentence in half: start and end a part in a pause in the speech.",
    "- You can only see still frames, so prefer stretches where the frames change from one to the next (something is happening) over ones where they look the same.",
    "",
    'Return only JSON: {"parts":[{"from":12,"to":15.5,"why":"spray going onto the doors"}],"note":"one plain sentence on what the edit shows"}',
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

/** Claude's proposed parts; null when the reply can't be read or keeps nothing. */
export function readCuts(reply: string, durationSec: number): { cuts: Cut[]; note?: string } | null {
  const out = parseJson<{ parts?: Array<Partial<Cut>>; note?: string }>(reply);
  if (!out) return null;
  const cuts = cleanCuts(out.parts, durationSec);
  if (cuts.length === 0) return null;
  // Never over the longest an edit may run: parts are dropped from the end.
  while (cuts.length > 1 && cutTotal(cuts) > EDIT_MAX_SEC + 5) cuts.pop();
  const note = typeof out.note === "string" ? out.note.replace(/\s+/g, " ").trim().slice(0, 200) : undefined;
  return { cuts, ...(note ? { note } : {}) };
}
