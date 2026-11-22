// A real person reads the ad instead of the ElevenLabs voice (ads.ts `voice`, voiceActors.ts).
//
// The order goes to Bunny Studio, a marketplace of human voice actors with an API: the script goes in as a
// project, an actor records it, and the read comes back as an MP3. ElevenLabs then writes down when each word
// was said (speech-to-text, word timestamps), and that is turned into the same per-character timing ElevenLabs'
// own voice returns, so shotTimings and wordTimings, and the renderer after them, work unchanged.
//
// Bunny Studio's API (documentation.bunnystudio.com/integrations/documentation/api):
//   POST /projects                        create a project (scope projects)
//   GET  /deliverables/project/{id}       a project's deliverables: id, status, urls { mp3, wav }
//   PUT  /deliverables/{id}               { status: "approved" } accepts a read
//   POST /users/auth                      { email, password } -> { token }
// Every call sends the token in the x-access-token header.

import type { Alignment } from "./ads";

export const BUNNY_API = "https://api.bunnystudio.com";

/** Who reads, as Bunny Studio names it (its genderAndAge attribute). */
export const ACTOR_VOICES = [
  "youngAdultMale",
  "middleAgeMale",
  "seniorMale",
  "youngAdultFemale",
  "middleAgeFemale",
  "seniorFemale",
] as const;
export const ACTOR_VOICE_LABELS: Record<(typeof ACTOR_VOICES)[number], string> = {
  youngAdultMale: "Young man",
  middleAgeMale: "Middle-aged man",
  seniorMale: "Older man",
  youngAdultFemale: "Young woman",
  middleAgeFemale: "Middle-aged woman",
  seniorFemale: "Older woman",
};
export const DEFAULT_ACTOR_VOICE = "middleAgeMale";
export const DEFAULT_ACTOR_LANGUAGE = "eng-us";

/** How the read should sound, always sent; the owner's own notes go after it. */
export const ACTOR_DIRECTION =
  "Short social video ad for a local painting company, read as one of the crew talking to a homeowner: warm, plain, " +
  "confident, not a radio announcer. Read every word as written, in order, with no extra words, so the edit can follow " +
  "the read. A short natural pause between lines.";

/** At least this share of the script's words must be heard in the read, or it is held back for a redo. */
export const READ_MATCH_MIN = 0.8;

/** The body of a Bunny Studio voice-over project for one ad's lines. `test` asks for a project that isn't fulfilled or billed. */
export function actorProjectBody(opts: {
  title: string;
  lines: string[];
  genderAndAge?: string;
  language?: string;
  notes?: string;
  test?: boolean;
}) {
  const remarks = [ACTOR_DIRECTION, opts.notes?.trim()].filter(Boolean).join(" ");
  return {
    // Bunny Studio keeps titles short.
    title: opts.title.slice(0, 100),
    mainService: "voice_over",
    fulfillmentType: "speedy",
    test: Boolean(opts.test),
    remarks,
    services: [
      {
        subCategory: "voice_over",
        language: opts.language || DEFAULT_ACTOR_LANGUAGE,
        genderAndAge: opts.genderAndAge || DEFAULT_ACTOR_VOICE,
        purpose: "radioTvAds",
        // One part, so one file comes back: the lines are read in one take, as the ElevenLabs voice reads them.
        script: [{ part1: opts.lines.join(" ") }],
        remarks,
      },
    ],
  };
}

export interface Deliverable {
  id: string;
  serviceSubCategory?: string;
  name?: string;
  status?: string;
  urls?: unknown;
}

/** The first MP3 link in a deliverable's urls, whichever shape Bunny Studio sends ({mp3}, {part1: {mp3}}, a list or a string). */
export function mp3Of(urls: unknown): string | null {
  if (typeof urls === "string") return /^https?:\/\//.test(urls) && /\.mp3(\?|$)/i.test(urls) ? urls : null;
  if (Array.isArray(urls)) {
    for (const u of urls) {
      const found = mp3Of(u);
      if (found) return found;
    }
    return null;
  }
  if (urls && typeof urls === "object") {
    const o = urls as Record<string, unknown>;
    if (typeof o.mp3 === "string" && /^https?:\/\//.test(o.mp3)) return o.mp3;
    for (const val of Object.values(o)) {
      const found = mp3Of(val);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The read to use from a project's deliverables: a voice-over waiting for review (or already accepted) with an
 * MP3, and not one held back before. Null while the actor is still at work.
 */
export function readyRead(deliverables: Deliverable[], skip: string[] = []): { id: string; url: string; status: string } | null {
  for (const d of deliverables) {
    if (d.serviceSubCategory && d.serviceSubCategory !== "voice_over") continue;
    if (skip.includes(d.id)) continue;
    if (d.status !== "reviewable" && d.status !== "approved") continue;
    const url = mp3Of(d.urls);
    if (url) return { id: d.id, url, status: d.status };
  }
  return null;
}

/** A word as speech-to-text gives it. */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
}

const norm = (w: string) =>
  w
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** How far ahead in the read a script word is looked for, so a word the actor added doesn't throw off the rest. */
const LOOKAHEAD = 4;

/**
 * The read's timing, character by character over `lines.join(" ")`, the way ElevenLabs' own voice returns it, from
 * the words speech-to-text heard. Script words are matched to heard words in order (a word or two the actor added
 * or dropped is skipped); a script word that wasn't heard is placed between its neighbours. `matched` of `total`
 * script words were heard.
 */
export function alignmentFromWords(lines: string[], heard: HeardWord[]): { alignment: Alignment; matched: number; total: number } {
  const text = lines.join(" ");
  const words = [...text.matchAll(/\S+/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, key: norm(m[0]) }));
  const said = heard
    .map((w) => ({ key: norm(String(w.text ?? "")), start: Number(w.start) || 0, end: Number(w.end) || 0 }))
    .filter((w) => w.key !== "");
  const times: Array<{ start: number; end: number } | null> = words.map(() => null);
  let at = 0;
  let matched = 0;
  words.forEach((w, i) => {
    if (w.key === "") return;
    for (let j = at; j < Math.min(said.length, at + LOOKAHEAD); j++) {
      if (said[j].key === w.key) {
        times[i] = { start: said[j].start, end: Math.max(said[j].start, said[j].end) };
        at = j + 1;
        matched += 1;
        return;
      }
    }
  });
  const total = words.filter((w) => w.key !== "").length;
  // Words not heard (or only punctuation) share the gap between the heard words either side of them.
  const lastEnd = said.length ? Math.max(...said.map((w) => w.end)) : 0;
  let i = 0;
  while (i < words.length) {
    if (times[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < words.length && !times[j]) j++;
    const from = i > 0 ? times[i - 1]!.end : 0;
    const to = j < words.length ? times[j]!.start : Math.max(from, lastEnd);
    const step = (to - from) / (j - i);
    for (let k = i; k < j; k++) times[k] = { start: from + step * (k - i), end: from + step * (k - i + 1) };
    i = j;
  }
  const starts: number[] = [];
  const ends: number[] = [];
  let w = 0;
  for (let c = 0; c < text.length; c++) {
    while (w < words.length && c >= words[w].to) w++;
    const word = words[w];
    if (word && c >= word.from) {
      // Inside a word: its time spread over its letters.
      const t = times[w]!;
      const n = word.to - word.from;
      const per = (t.end - t.start) / n;
      starts.push(t.start + per * (c - word.from));
      ends.push(t.start + per * (c - word.from + 1));
    } else {
      // A space: the moment the word before it ends.
      const t = w > 0 ? times[w - 1]! : { start: 0, end: 0 };
      starts.push(t.end);
      ends.push(t.end);
    }
  }
  return {
    alignment: { characters: [...text], character_start_times_seconds: starts, character_end_times_seconds: ends },
    matched,
    total,
  };
}

/**
 * What an on-camera creator is sent for one ad: the lines to say, one take per line, and how to film them so we can
 * put them in front of the job's own photos. Copied by hand to whoever records it (a creator found on Billo,
 * JoinBrands, Craigslist or Facebook), until one of those has an API to send it to.
 */
export function creatorBrief(opts: { brand: string; headline: string; lines: string[]; ratio: "9x16" | "4x5" }): string {
  return [
    `${opts.brand}: on-camera read for a short Facebook and Instagram ad`,
    "",
    `What it's about: ${opts.headline}`,
    "",
    "How to film it",
    `- Phone held ${opts.ratio === "9x16" ? "upright (vertical)" : "upright (vertical); we crop it to 4:5"}, at eye level, 1080p or better, 30 fps.`,
    "- In front of a plain green screen (or a smooth, evenly lit green wall), standing 4 to 6 feet in front of it, so there's no shadow on it.",
    "- Even light on your face from the front. No green clothes, no shiny jewellery.",
    "- Waist up, centred, with a little room above your head.",
    "- A quiet room. Use a clip-on mic if you have one.",
    "- You speak for the company to a homeowner, in your own natural voice. Don't say you're a customer.",
    "",
    "What to say: one take per line, a beat of silence before and after, every word as written",
    ...opts.lines.map((line, i) => `${i + 1}. ${line}`),
    "",
    "Send back: one video file per line (or one file with all the lines in order), unedited, with the sound.",
  ].join("\n");
}
