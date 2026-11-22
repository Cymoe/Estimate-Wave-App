// Job site videos (footage.ts): a clip the crew shot on the job runs as the ad, as it was shot.
//
// Nothing is drawn over the work but the brand, captions of what is said in it, its title at the start and the
// ask at the end. Its own sound plays. The words around it (the title, and the headline and text Facebook shows)
// are written by Claude from what can be seen and heard in the clip, following a long-running competitor ad's
// written copy the way every other ad follows one, and are checked against the same banned claims.

import { HEADLINE_MAX, PRIMARY_MAX, SCRIPT_PRIMARY_MAX, TITLE_MAX, forbiddenIn, onceOnly, pickExamples } from "./ads";
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
  /** A few words on screen at the start. */
  title: string;
  headline: string;
  primaryText: string;
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

/** How long the text Facebook shows may run: about as long as the competitor's written copy, when it is long. */
export const primaryMaxFor = (swipe: FootageSwipe) => ((swipe.adCopy ?? "").trim().length > PRIMARY_MAX ? SCRIPT_PRIMARY_MAX : PRIMARY_MAX);

/** The instructions for the words around a job site video. */
export function footagePrompt(opts: { brand: string; trade: string; town: string; heard: string; seen?: string; swipe: FootageSwipe }): string {
  const { swipe } = opts;
  const theirs = onceOnly(swipe.adCopy ?? "");
  const primaryMax = primaryMaxFor(swipe);
  return [
    `${FOOTAGE_MARK}: a clip ${opts.brand}'s crew shot on a ${opts.trade.toLowerCase()} job, run as it was shot, with its own sound.`,
    "Write only the words around it. Nothing is added to the clip but captions of what is said in it.",
    "",
    "What is said in the clip:",
    opts.heard.trim() ? `"${opts.heard.trim()}"` : "(nothing: it is the work and the job site's sound)",
    ...(opts.seen ? ["", `What the clip shows: ${opts.seen}`] : []),
    "",
    `Follow this competitor ad, which has run for ${swipe.daysRunning ?? "many"} days (${swipe.company}; angle: ${swipe.hook}; offer: ${swipe.offer}).`,
    theirs
      ? `Their written words: "${theirs}". Keep their angle, their kind of opening and their voice, about as long as theirs.`
      : "Only their angle is on file: keep its angle and kind of opening.",
    "Change only what isn't true for us: their name, prices, discounts, warranties or guarantees, awards, review counts, years in business, licensed or insured claims, and deadlines.",
    "",
    "Rules:",
    `- Speak as ${opts.brand}, the company doing the work ("we", "our crew"), never as a homeowner or customer.`,
    "- Say only what can be seen or heard in the clip. Never name or hint where the job was, and never invent a detail about it.",
    `- The only offer is a free quote from ${opts.brand}. ${opts.town ? `You may speak to ${opts.town} homeowners, but never place the job.` : ""}`,
    "- No prices, dollar amounts, discounts, guarantees or warranties. No promise of how fast anyone answers or finishes.",
    "- Never say vetted, screened, top-rated or the best.",
    "",
    "Answer with JSON only:",
    `{"title": "3 to 6 words on screen at the start, at most ${TITLE_MAX} characters", "headline": "at most ${HEADLINE_MAX} characters", "primaryText": "the text Facebook shows above the video, at most ${primaryMax} characters"}`,
  ].join("\n");
}

/** What is wrong with the words written for a job site video. */
export function footageProblems(copy: Partial<FootageCopy> | null, swipe: FootageSwipe): string[] {
  if (!copy) return ["the reply wasn't JSON"];
  const out: string[] = [];
  const title = copy.title?.trim() ?? "";
  const headline = copy.headline?.trim() ?? "";
  const primary = copy.primaryText?.trim() ?? "";
  if (!title) out.push("no title");
  else if (title.length > TITLE_MAX) out.push(`title over ${TITLE_MAX} characters`);
  if (!headline) out.push("no headline");
  else if (headline.length > HEADLINE_MAX) out.push(`headline over ${HEADLINE_MAX} characters`);
  const primaryMax = primaryMaxFor(swipe);
  if (!primary) out.push("no primary text");
  else if (primary.length > primaryMax) out.push(`primary text over ${primaryMax} characters`);
  out.push(...forbiddenIn([title, headline, primary].join(" ")));
  return out;
}
