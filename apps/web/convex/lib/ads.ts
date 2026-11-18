// Ads on autopilot, the pure parts: the hook library a Monday batch draws
// from, which hooks and footage a week gets, the script brief Claude writes
// to and the check on what it wrote, the Shotstack edit a creative renders
// from, and the fatigue rule. ads.ts does the storing and the calling out.

export const SCOPES = ["interior", "exterior", "cabinets", "crew", "process"] as const;
export type Scope = (typeof SCOPES)[number];

export type Family = "owner_story" | "before_after" | "proof" | "education" | "objection" | "seasonal";
export const FAMILY_LABELS: Record<Family, string> = {
  owner_story: "Owner story",
  before_after: "Before / after",
  proof: "Trust and proof",
  education: "Cost education",
  objection: "Respect for your home",
  seasonal: "Season and timing",
};

export interface HookSeed {
  family: Family;
  scope: Scope;
  trade: string;
  textEn: string;
}

/** The six painting concept families, one hook each, from the research and the competitor sheet. */
export const PAINTING_HOOKS: HookSeed[] = [
  {
    family: "before_after",
    scope: "cabinets",
    trade: "painting",
    textEn: "Paint them, don't replace them. Professionally painted cabinets change the whole kitchen for a fraction of a remodel.",
  },
  {
    family: "education",
    scope: "interior",
    trade: "painting",
    textEn: "What does it cost to paint a three-bedroom house in Midland? Here's the honest range, and how to get an exact quote.",
  },
  {
    family: "seasonal",
    scope: "exterior",
    trade: "painting",
    textEn:
      "Get the outside painted before the first freeze. West Texas sun and hail are hard on paint; a fresh coat now protects the siding all winter.",
  },
  {
    family: "objection",
    scope: "interior",
    trade: "painting",
    textEn: "Worried about a crew in your house? Floors covered, furniture wrapped, and everything cleaned up before they leave each evening.",
  },
  {
    family: "proof",
    scope: "crew",
    trade: "painting",
    textEn: "Vetted local painters, one quote within a day, and no pressure. Tell us the job and a Midland painter calls you.",
  },
  {
    family: "owner_story",
    scope: "process",
    trade: "painting",
    textEn: "Tired of seeing homeowners pay for sloppy, rushed paint jobs? These painters prep right, cut in clean and finish on time.",
  },
];

export interface HookRow {
  _id: string;
  family: Family;
  scope: string;
  active: boolean;
  uses: number;
  lastUsedAt?: string;
}

/**
 * The week's hooks: active, families with nothing live first (so the mix
 * stays wide), then least used, then longest since used. A family already
 * live is a reason to go last, never a reason to draft nothing.
 */
export function pickHooks<H extends HookRow>(hooks: H[], liveFamilies: Set<Family>, n: number): H[] {
  return hooks
    .filter((h) => h.active)
    .sort(
      (a, b) =>
        Number(liveFamilies.has(a.family)) - Number(liveFamilies.has(b.family)) ||
        a.uses - b.uses ||
        (a.lastUsedAt ?? "").localeCompare(b.lastUsedAt ?? ""),
    )
    .slice(0, Math.max(0, n));
}

export interface AssetRow {
  _id: string;
  kind: "photo" | "video";
  tags: string[];
  pairKey?: string;
  createdAt: string;
  uses?: number;
}

export const MAX_CANDIDATES = 6;

/**
 * The footage Claude chooses shots from for one hook: assets tagged with the
 * hook's scope, never one another hook this week already used. Before/after
 * pairs come first (least used pair first, before then after), then the
 * least used, newest first among equals. With nothing in scope it falls back
 * to process or crew footage and says so (inScope false), so the prompt can
 * tell Claude.
 */
export function pickAssets<A extends AssetRow>(
  assets: A[],
  scope: string,
  used: Set<string>,
  max = MAX_CANDIDATES,
  prefer: string[] = [],
): { assets: A[]; inScope: boolean } {
  // The playbook's footage preferences: an asset carrying an earlier preferred tag sorts first, then least used, then newest.
  const preference = (a: A) => {
    const ranks = a.tags.map((t) => prefer.indexOf(t)).filter((i) => i >= 0);
    return ranks.length ? Math.min(...ranks) : prefer.length;
  };
  const fresh = assets
    .filter((a) => !used.has(a._id))
    .sort((a, b) => preference(a) - preference(b) || (a.uses ?? 0) - (b.uses ?? 0) || b.createdAt.localeCompare(a.createdAt));
  const inScopeAssets = fresh.filter((a) => a.tags.includes(scope));
  const inScope = inScopeAssets.length > 0;
  const pool = inScope ? inScopeAssets : fresh.filter((a) => a.tags.includes("process") || a.tags.includes("crew"));
  const groups = new Map<string, A[]>();
  for (const a of pool) if (a.pairKey) groups.set(a.pairKey, [...(groups.get(a.pairKey) ?? []), a]);
  const pairs: Array<[A, A]> = [];
  for (const [, halves] of groups) {
    const before = halves.find((h) => h.tags.includes("before"));
    const after = halves.find((h) => h.tags.includes("after"));
    if (before && after) pairs.push([before, after]);
  }
  pairs.sort((x, y) => (x[0].uses ?? 0) + (x[1].uses ?? 0) - ((y[0].uses ?? 0) + (y[1].uses ?? 0)));
  const out: A[] = [];
  for (const [before, after] of pairs) if (out.length + 2 <= max) out.push(before, after);
  for (const a of pool) if (!out.includes(a) && out.length < max) out.push(a);
  return { assets: out, inScope };
}

/** "WL_k57abc_916_20261103": the ad's name in Meta and the creative's name here, so a lead's adName joins back. */
export function creativeName(hookId: string, ratio: "9x16" | "4x5", date: Date, kind: AdKind = "video"): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  const mark = kind === "image" ? "_img" : kind === "graphic" ? "_gfx" : "";
  return `WL_${shortId(hookId)}_${ratio === "9x16" ? "916" : "45"}_${day}${mark}`;
}

/** What an ad is made of: a voiced video cut from footage, one photo with words on it, or voiced moving text. */
export const AD_KINDS = ["video", "image", "graphic"] as const;
export type AdKind = (typeof AD_KINDS)[number];
export const AD_KIND_LABELS: Record<AdKind, string> = { video: "Video from photos", image: "Image ad", graphic: "Animated graphic" };

/** Six letters and digits that stand for an id (a hash, so the same id always gives the same six). */
export function shortId(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (h * 33) ^ id.charCodeAt(i);
  return (h >>> 0).toString(36).padStart(6, "0").slice(-6);
}

/** The Monday (UTC) of the week a date is in, as YYYY-MM-DD. */
export function weekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export interface Shot {
  assetId: string;
  voice: string;
  onScreen: string;
  /** Seconds into the voice-over, once ElevenLabs has read it. */
  start?: number;
  end?: number;
}

export interface Script {
  voice: string;
  onScreen: string[];
  headline: string;
  primaryText: string;
  shots?: Shot[];
}

export const HEADLINE_MAX = 40;
export const PRIMARY_MAX = 125;
export const ON_SCREEN_MAX = 40;

/** One piece of footage as the prompt describes it to Claude. */
export interface Candidate {
  kind: "photo" | "video";
  tags: string[];
  pairKey?: string;
  description?: string;
  durationSec?: number;
  /** The still Claude looks at; none for a video or HEIC with no still. */
  imageUrl?: string;
}

const RULES = (brand: string, town: string) => [
  `- The voice speaks only as ${brand}, never as a homeowner or customer. No testimonials, no "I hired", no invented reviews or names.`,
  "- No prices, dollar amounts, discounts, percentages off, warranties, guarantees, or promised completion times. A cost-education hook may say prices vary by size and condition and that a quote is free.",
  `- Do not address the viewer by a personal attribute (no "is your home in...", no age, income or ethnicity). Say "${town} homeowners" style phrasing instead.`,
  "- Close the last shot with a plain ask: get a quote.",
];

/** The text that goes before the images: the hook, the footage list, the rules and the shape to answer in. */
/** A competitor ad the writer is shown for tone and shape. */
export interface Example {
  company: string;
  hook: string;
  offer: string;
  transcript?: string;
  adCopy?: string;
  durationSec?: number;
}

export const MAX_EXAMPLES = 4;

export interface Scored {
  starred: boolean;
  quality?: number;
  daysRunning?: number;
  local?: boolean;
}

/**
 * How much a swipe is worth learning from, 0–100: Claude's quality (0–60),
 * how long it has run (up to 25 for a year), and 15 when it names one of
 * the owner's markets. Untagged rows count as middling quality.
 */
export function swipeScore(s: Scored): number {
  const quality = Math.max(0, Math.min(60, s.quality ?? 30));
  const longevity = Math.min(25, Math.round(((s.daysRunning ?? 0) / 365) * 25));
  return quality + longevity + (s.local ? 15 : 0);
}

/** Which swipes to show the writer for a hook: its scope first (general ones fill in), starred, highest score, with a script, newest. */
export function pickExamples<S extends Scored & { scope?: string; transcript?: string; importedAt: string }>(
  swipes: S[],
  scope: string,
  max = MAX_EXAMPLES,
): S[] {
  const rank = (x: S) =>
    (x.scope === scope ? 0 : x.scope ? 2 : 1) * 1000 + (x.starred ? 0 : 500) + (100 - swipeScore(x)) * 2 + (x.transcript ? 0 : 1);
  return [...swipes].sort((a, b) => rank(a) - rank(b) || b.importedAt.localeCompare(a.importedAt)).slice(0, max);
}

/** The example block of the prompt. Only the first 300 characters of ad copy when there is no spoken script. */
export function examplesText(examples: Example[]): string[] {
  if (examples.length === 0) return [];
  return [
    "Ads that run in this category, for tone and shape only. Never copy their claims, prices, discounts, names, warranties or deadlines.",
    ...examples.map((e, i) => {
      const text = e.transcript
        ? `spoken (${e.durationSec ? Math.round(e.durationSec) : "?"}s): ${e.transcript
            .replace(/\[\d\d:\d\d\]\s*/g, "")
            .replace(/\s+/g, " ")
            .trim()}`
        : e.adCopy
          ? `copy: ${e.adCopy.replace(/\s+/g, " ").trim().slice(0, 300)}`
          : "";
      return `Example ${i + 1} (${e.company}; angle: ${e.hook}; offer: ${e.offer})${text ? ` · ${text}` : ""}`;
    }),
    "",
  ];
}

export function shotListPrompt(
  hook: { textEn: string; family: Family; scope: string },
  brand: string,
  footage: Candidate[],
  inScope: boolean,
  examples: Example[] = [],
  town = "your town",
  playbook?: string,
): string {
  const list = footage.map((f, i) => {
    const bits = [
      `Footage ${i + 1}: ${f.kind}${f.kind === "video" && f.durationSec ? ` (${Math.round(f.durationSec)}s)` : ""}`,
      f.tags.length ? `tags: ${f.tags.join(", ")}` : "",
      f.pairKey ? `pair "${f.pairKey}"` : "",
      f.description ? `looks like: ${f.description}` : "",
      f.imageUrl ? "(image attached below)" : "(no image available; rely on the tags)",
    ].filter(Boolean);
    return bits.join(" · ");
  });
  return [
    `You write one short Facebook and Instagram video ad for ${brand}, a service in ${town}, Texas that matches homeowners with one vetted local painting contractor.`,
    `Concept family: ${FAMILY_LABELS[hook.family]}. Scope: ${hook.scope}. Hook: ${hook.textEn}`,
    "",
    "The video is cut from this footage only. Each attached image is labelled with its footage number.",
    ...list,
    inScope
      ? ""
      : `None of this footage is tagged ${hook.scope}; it is general crew and process footage. Only go ahead if the ad still works honestly with it.`,
    "",
    ...(playbook
      ? [
          "What works in this category, from competitor ads that have run for months. Follow the shape and the kind of opening; never their claims:",
          playbook.trim(),
          "",
        ]
      : []),
    ...examplesText(examples),
    "Write a shot list: the footage to show, in order, and the voice-over line spoken while each one is on screen.",
    "- Use 2 to 4 shots (1 if only one piece of footage is offered). Use each footage number at most once.",
    "- Each voice line must fit what is visibly in that footage. Do not name colours, rooms, materials or details you cannot see.",
    "- A before must be immediately followed by its after (same pair).",
    "- 55 to 75 words of voice in total, about 25 seconds read aloud.",
    `- Each on-screen line is at most 6 words and ${ON_SCREEN_MAX} characters.`,
    ...RULES(brand, town),
    `- If this footage can't carry the hook honestly (for example a cabinets hook with no cabinets in sight), don't force it.`,
    "",
    "Return only JSON, one of:",
    '{"fits":true,"shots":[{"footage":1,"voice":"spoken line","onScreen":"short line"}],"headline":"<=40 chars","primaryText":"<=125 chars"}',
    '{"fits":false,"reason":"why the footage does not fit"}',
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\$\s?\d|\d+\s?%|percent off|% off|discount/i, "a price or discount"],
  [/warrant|guarantee/i, "a warranty or guarantee"],
  [/\bin \d+ days?\b|same[- ]day/i, "a completion time"],
  [/\bI hired\b|\bthey painted my\b|\bmy painter\b/i, "a customer voice"],
  [/is your home in|are you over/i, "a personal attribute"],
];

/** What's wrong with a script, if anything. */
export function scriptProblems(s: Partial<Script> | undefined): string[] {
  const out: string[] = [];
  if (!s) return ["no script"];
  if (!s.voice || s.voice.split(/\s+/).length < 30) out.push("voice script too short");
  if (!Array.isArray(s.onScreen) || s.onScreen.length === 0) out.push("no on-screen lines");
  if (!s.headline) out.push("no headline");
  else if (s.headline.length > HEADLINE_MAX) out.push(`headline over ${HEADLINE_MAX} characters`);
  if (!s.primaryText) out.push("no primary text");
  else if (s.primaryText.length > PRIMARY_MAX) out.push(`primary text over ${PRIMARY_MAX} characters`);
  const text = [s.voice, ...(s.onScreen ?? []), s.headline, s.primaryText].filter(Boolean).join(" ");
  for (const [re, what] of FORBIDDEN) if (re.test(text)) out.push(`mentions ${what}`);
  return out;
}

/**
 * Pulls the JSON object out of a model reply that may wrap it in prose or a
 * code fence. First the whole span from the first brace to the last; when
 * that isn't JSON (a brace in the prose around it, a second object after
 * it), the largest balanced object that parses.
 */
export function parseJson<T = unknown>(reply: string): T | null {
  const tryParse = (text: string): T | null => {
    try {
      const value = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
    } catch {
      return null;
    }
  };
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const whole = tryParse(reply.slice(start, end + 1));
  if (whole) return whole;
  let best: { value: T; length: number } | null = null;
  for (let from = start; from >= 0 && from < reply.length; from = reply.indexOf("{", from + 1)) {
    const to = balancedEnd(reply, from);
    if (to < 0) continue;
    const value = tryParse(reply.slice(from, to + 1));
    if (value && (!best || to - from > best.length)) best = { value, length: to - from };
    if (value) from = to;
  }
  return best?.value ?? null;
}

/** Where the object opening at `from` closes, minding braces inside strings; -1 when it never does. */
function balancedEnd(text: string, from: number): number {
  let depth = 0;
  let quoted = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\\") i++;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

export interface ShotPlan {
  fits?: boolean;
  reason?: string;
  shots?: Array<{ footage?: number; voice?: string; onScreen?: string }>;
  headline?: string;
  primaryText?: string;
}

/** What's wrong with a shot list Claude returned, against the footage it was offered. */
export function shotPlanProblems(plan: ShotPlan, footage: Array<{ tags: string[]; pairKey?: string }>): string[] {
  const out: string[] = [];
  const shots = plan.shots ?? [];
  const min = footage.length === 1 ? 1 : 2;
  if (shots.length < min || shots.length > 4) out.push(`${shots.length} shots (use ${min} to 4)`);
  const seen = new Set<number>();
  shots.forEach((s, i) => {
    const n = s.footage;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > footage.length) out.push(`shot ${i + 1} names footage ${n ?? "nothing"}`);
    else if (seen.has(n)) out.push(`footage ${n} used twice`);
    else seen.add(n);
    if (!s.voice?.trim()) out.push(`shot ${i + 1} has no voice line`);
    if (!s.onScreen?.trim()) out.push(`shot ${i + 1} has no on-screen line`);
    else if (s.onScreen.length > ON_SCREEN_MAX) out.push(`shot ${i + 1} on-screen line over ${ON_SCREEN_MAX} characters`);
  });
  // A before is followed straight away by its after.
  shots.forEach((s, i) => {
    const f = footage[(s.footage ?? 0) - 1];
    if (!f?.pairKey || !f.tags.includes("before")) return;
    const partner = footage.findIndex((g) => g.pairKey === f.pairKey && g.tags.includes("after"));
    if (partner < 0 || !shots.some((t) => t.footage === partner + 1)) return;
    if (shots[i + 1]?.footage !== partner + 1) out.push(`the before in footage ${s.footage} isn't followed by its after`);
  });
  const words = shots
    .map((s) => s.voice ?? "")
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  if (words < 45 || words > 85) out.push(`${words} words of voice (write 55 to 75)`);
  return out;
}

/** The shot list as the script stored on the creative: shots point at asset ids, voice and lines in shot order. */
export function composeScript(plan: ShotPlan, assetIds: string[]): Script {
  const shots = (plan.shots ?? []).map((s) => ({
    assetId: assetIds[(s.footage ?? 1) - 1],
    voice: (s.voice ?? "").trim(),
    onScreen: (s.onScreen ?? "").trim(),
  }));
  return {
    voice: shots.map((s) => s.voice).join(" "),
    onScreen: shots.map((s) => s.onScreen),
    headline: (plan.headline ?? "").trim(),
    primaryText: (plan.primaryText ?? "").trim(),
    shots,
  };
}

/** What Claude is asked about one library image when it's uploaded. */
export const DESCRIBE_PROMPT = [
  "This is a photo (or a still from a video) a painting contractor took on a job. It will be used in ads.",
  "Describe what is visible in one plain sentence: the surface or room, colours, the state (unpainted, being prepped, being painted, finished), and any people or tools.",
  `Then choose tags from this list only: ${["interior", "exterior", "cabinets", "crew", "process", "before", "after"].join(", ")}. Use before or after only when the image clearly shows an unfinished or a finished state.`,
  'Return only JSON: {"description":"...","tags":["..."]}',
].join("\n");

export const ASSET_TAGS = ["interior", "exterior", "cabinets", "crew", "process", "before", "after"];

/** ElevenLabs' character timing for the whole voice-over. */
export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * When each shot's line starts and ends in the voice-over. The voice is the
 * lines joined by single spaces, so line i starts at the sum of the earlier
 * lines' lengths plus one space each. Without an alignment, the estimate is
 * split by each line's share of the characters.
 */
export function shotTimings(
  lines: string[],
  alignment: Alignment | null | undefined,
  estimateSec: number,
): { shots: Array<{ start: number; end: number }>; durationSec: number } {
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const total = lines.join(" ").length;
  if (starts.length >= total && ends.length >= total && total > 0) {
    let at = 0;
    const shots = lines.map((line) => {
      const first = Math.min(at, starts.length - 1);
      const last = Math.min(at + Math.max(1, line.length) - 1, ends.length - 1);
      at += line.length + 1;
      return { start: round(starts[first]), end: round(ends[last]) };
    });
    return { shots, durationSec: round(Math.max(...ends.slice(0, total))) };
  }
  let at = 0;
  const shots = lines.map((line) => {
    const length = (estimateSec * (line.length + 1)) / Math.max(1, total + 1);
    const out = { start: round(at), end: round(at + length) };
    at += length;
    return out;
  });
  return { shots, durationSec: round(estimateSec) };
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface EditAsset {
  url: string;
  kind: "photo" | "video";
  tags: string[];
  pairKey?: string;
  durationSec?: number;
}

export interface Brand {
  name: string;
  primaryColor: string;
  accentColor: string;
  /** The owner's markets; the first is home. On the end card. */
  markets: string[];
}

/** "Midland and Odessa", "Midland", or nothing. */
export const marketsLine = (markets: string[]): string => markets.slice(0, 2).filter(Boolean).join(" and ");

const SIZES = { "9x16": { width: 1080, height: 1920 }, "4x5": { width: 1080, height: 1350 } } as const;
export const END_CARD_SEC = 3;
const TAIL_SEC = 0.4;

/**
 * The Shotstack edit for one creative, cut to the voice-over: each shot's
 * footage is on screen from the moment its line starts until the next line
 * starts (the first from zero), with that shot's on-screen line over it; an
 * after wipes in over its before; a clip shorter than its slot repeats.
 * Captions are transcribed from the voice, the brand sits in the corner, and
 * the ask is on the last card.
 */
export function shotstackEdit(input: {
  shots: Array<{ asset: EditAsset; onScreen: string; start: number; end: number }>;
  audioUrl: string;
  audioDurationSec: number;
  brand: Brand;
  ratio: "9x16" | "4x5";
}) {
  const { shots, audioUrl, brand, ratio } = input;
  const footageEnd = round(input.audioDurationSec + TAIL_SEC);
  const total = round(footageEnd + END_CARD_SEC);
  const media: unknown[] = [];
  const lines: unknown[] = [];
  shots.forEach((shot, i) => {
    const start = i === 0 ? 0 : shot.start;
    const until = i === shots.length - 1 ? footageEnd : shots[i + 1].start;
    const length = round(Math.max(0.5, until - start));
    const a = shot.asset;
    const prev = shots[i - 1]?.asset;
    const wipe = Boolean(prev && a.pairKey && prev.pairKey === a.pairKey && prev.tags.includes("before") && a.tags.includes("after"));
    if (a.kind === "video" && a.durationSec && a.durationSec < length) {
      // Too short for its slot: play it again until the slot is full.
      for (let at = 0, n = 0; at < length - 0.01; at += a.durationSec, n++)
        media.push({
          asset: { type: "video", src: a.url, volume: 0 },
          start: round(start + at),
          length: round(Math.min(a.durationSec, length - at)),
          fit: "cover",
          ...(n === 0 && wipe ? { transition: { in: "wipeLeft" } } : {}),
        });
    } else {
      media.push({
        asset: a.kind === "video" ? { type: "video", src: a.url, volume: 0 } : { type: "image", src: a.url },
        start: round(start),
        length,
        fit: "cover",
        ...(a.kind === "photo" ? { effect: i % 2 === 0 ? "zoomIn" : "slideLeft" } : {}),
        ...(wipe ? { transition: { in: "wipeLeft" } } : {}),
      });
    }
    if (shot.onScreen)
      lines.push({
        asset: {
          type: "html",
          html: `<p>${escapeHtml(shot.onScreen)}</p>`,
          css: `p{font-family:'Roboto Condensed',sans-serif;font-weight:700;font-size:64px;color:#fff;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.6)}`,
          width: 960,
          height: 400,
        },
        start: round(start),
        length,
        position: "center",
        transition: { in: "fade", out: "fade" },
      });
  });
  return {
    timeline: {
      background: "#000000",
      tracks: [
        // Captions, transcribed from the voice track.
        {
          clips: [
            {
              asset: { type: "caption", src: "alias://voice", font: { color: "#ffffff", size: 40 }, background: { color: "#000000", opacity: 0.5 } },
              start: 0,
              length: footageEnd,
            },
          ],
        },
        { clips: lines },
        {
          clips: [
            {
              asset: {
                type: "html",
                html: `<p>${escapeHtml(brand.name)}</p>`,
                css: `p{font-family:'Roboto',sans-serif;font-weight:700;font-size:36px;color:${brand.accentColor}}`,
                width: 600,
                height: 80,
              },
              start: 0,
              length: total,
              position: "topLeft",
              offset: { x: 0.04, y: -0.04 },
            },
            {
              asset: {
                type: "html",
                html: `<p class="a">Get a quote</p><p class="b">${escapeHtml([brand.name, marketsLine(brand.markets)].filter(Boolean).join(" · "))}</p>`,
                css: `.a{font-family:'Roboto Condensed',sans-serif;font-weight:700;font-size:84px;color:#fff;text-align:center}.b{font-family:'Roboto',sans-serif;font-size:36px;color:${brand.accentColor};text-align:center}`,
                width: 1000,
                height: 500,
                background: brand.primaryColor,
              },
              start: footageEnd,
              length: END_CARD_SEC,
              position: "center",
              transition: { in: "fade" },
            },
          ],
        },
        { clips: media },
        { clips: [{ alias: "voice", asset: { type: "audio", src: audioUrl, volume: 1 }, start: 0, length: round(input.audioDurationSec) }] },
      ],
    },
    output: { format: "mp4", fps: 25, size: SIZES[ratio] },
  };
}

// --------------------------------------------------------------- Image ads

export const IMAGE_HEADLINE_MAX = 36;
export const IMAGE_SUPPORT_MAX = 70;

/** The text before the photos for an image ad: the hook, the photos on offer, the rules and the shape to answer in. */
export function imageAdPrompt(
  hook: { textEn: string; family: Family; scope: string },
  brand: string,
  photos: Candidate[],
  inScope: boolean,
  town = "your town",
  playbook?: string,
): string {
  const list = photos.map((f, i) =>
    [`Photo ${i + 1}`, f.tags.length ? `tags: ${f.tags.join(", ")}` : "", f.description ? `looks like: ${f.description}` : "", "(attached below)"]
      .filter(Boolean)
      .join(" · "),
  );
  return [
    `You write one Facebook and Instagram image ad for ${brand}, a service in ${town}, Texas that matches homeowners with one vetted local painting contractor.`,
    `Concept family: ${FAMILY_LABELS[hook.family]}. Scope: ${hook.scope}. Hook: ${hook.textEn}`,
    "",
    "The ad is one photo with a headline and a short support line printed under it, and a Get a quote button. Each attached photo is labelled with its number.",
    ...list,
    inScope ? "" : `None of these photos is tagged ${hook.scope}. Only go ahead if the ad still works honestly with one of them.`,
    "",
    ...(playbook ? ["What works in this category, from competitor ads that have run for months. Follow the angle; never their claims:", playbook.trim(), ""] : []),
    "Choose the one photo that carries the hook best: finished, well lit work a homeowner would want. Then write:",
    `- imageHeadline: the words printed on the ad. At most 6 words and ${IMAGE_HEADLINE_MAX} characters. It must be true of the photo you chose.`,
    `- support: one line under it, at most ${IMAGE_SUPPORT_MAX} characters, that says what ${brand} does for the homeowner.`,
    `- headline (at most ${HEADLINE_MAX} characters) and primaryText (at most ${PRIMARY_MAX} characters): the text Facebook shows around the image.`,
    "- Do not name colours, rooms, materials or details you cannot see in the photo.",
    ...RULES(brand, town).slice(0, 3),
    "- If none of the photos can carry the hook honestly, don't force it.",
    "",
    "Return only JSON, one of:",
    '{"fits":true,"photo":1,"imageHeadline":"...","support":"...","headline":"<=40 chars","primaryText":"<=125 chars"}',
    '{"fits":false,"reason":"why none of the photos fits"}',
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

export interface ImagePlan {
  fits?: boolean;
  reason?: string;
  photo?: number;
  imageHeadline?: string;
  support?: string;
  headline?: string;
  primaryText?: string;
}

/** What's wrong with an image ad Claude returned, against the photos it was offered. */
export function imagePlanProblems(plan: ImagePlan, photoCount: number): string[] {
  const out: string[] = [];
  const n = plan.photo;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > photoCount) out.push(`names photo ${n ?? "nothing"}`);
  const on = plan.imageHeadline?.trim() ?? "";
  if (!on) out.push("no headline for the image");
  else if (on.length > IMAGE_HEADLINE_MAX) out.push(`image headline over ${IMAGE_HEADLINE_MAX} characters`);
  else if (on.split(/\s+/).length > 6) out.push("image headline over 6 words");
  const support = plan.support?.trim() ?? "";
  if (!support) out.push("no support line");
  else if (support.length > IMAGE_SUPPORT_MAX) out.push(`support line over ${IMAGE_SUPPORT_MAX} characters`);
  if (!plan.headline?.trim()) out.push("no headline");
  else if (plan.headline.trim().length > HEADLINE_MAX) out.push(`headline over ${HEADLINE_MAX} characters`);
  if (!plan.primaryText?.trim()) out.push("no primary text");
  else if (plan.primaryText.trim().length > PRIMARY_MAX) out.push(`primary text over ${PRIMARY_MAX} characters`);
  const text = [on, support, plan.headline, plan.primaryText].filter(Boolean).join(" ");
  for (const [re, what] of FORBIDDEN) if (re.test(text)) out.push(`mentions ${what}`);
  return out;
}

/** An image ad as the script stored on the creative: no voice; the two printed lines are the on-screen lines, over the one photo. */
export function composeImageScript(plan: ImagePlan, assetIds: string[]): Script {
  const on = (plan.imageHeadline ?? "").trim();
  return {
    voice: "",
    onScreen: [on, (plan.support ?? "").trim()],
    headline: (plan.headline ?? "").trim(),
    primaryText: (plan.primaryText ?? "").trim(),
    shots: [{ assetId: assetIds[(plan.photo ?? 1) - 1], voice: "", onScreen: on }],
  };
}

/** How tall the words' band is in each size; the photo has the rest. */
const BAND = { "9x16": 620, "4x5": 450 } as const;
const BAND_COLOR = "#0e1621";

/** A filled rectangle. Its box is its own size, so `position` moves it; without one Shotstack centres it in the frame. */
const block = (width: number, height: number, color: string, opacity = 1) => ({
  type: "shape",
  shape: "rectangle",
  width,
  height,
  rectangle: { width, height },
  fill: { color, opacity },
});

/** How many lines a text takes at about `perLine` characters a line, breaking between words. */
export function lineCount(text: string, perLine: number): number {
  let lines = 1;
  let length = 0;
  for (const word of text.trim().split(/\s+/)) {
    if (length > 0 && length + 1 + word.length > perLine) {
      lines += 1;
      length = word.length;
    } else length += (length > 0 ? 1 : 0) + word.length;
  }
  return lines;
}

/**
 * A photo in a frame without stretching it: the whole photo inside its box,
 * over a blurred, darkened copy of itself that fills the box. Lowest layer
 * last, as Shotstack stacks tracks.
 */
export function framedPhoto(
  src: string,
  box: { width: number; height: number },
  at: { start: number; length: number },
  opts: { type?: "image" | "video"; down?: number; fadeIn?: boolean } = {},
) {
  const type = opts.type ?? "image";
  const asset = type === "video" ? { type, src, volume: 0 } : { type, src };
  // `down` is how far below the top edge the box starts, as a share of the frame's height.
  const place = { position: "top", ...(opts.down ? { offset: { x: 0, y: -opts.down } } : {}), ...(opts.fadeIn ? { transition: { in: "fade" } } : {}) };
  return [
    { asset, ...at, fit: "contain", width: box.width, height: box.height, ...place },
    { asset: block(box.width, box.height, "#000000", 0.45), ...at, ...place },
    { asset, ...at, fit: "crop", width: box.width, height: box.height, ...place, filters: [{ type: "blur", value: 40 }] },
  ];
}

/**
 * The Shotstack edit for an image ad, rendered as one JPEG: the photo whole
 * in the upper part of the frame, and a dark band under it with the headline,
 * the support line and the ask. Each line of words has a box of its own,
 * sized to the lines it takes, so two never print over each other. Nothing
 * is printed in the middle of the frame, where a trial key stamps its
 * watermark.
 */
export function imageEdit(input: { photoUrl: string; headline: string; support: string; brand: Brand; ratio: "9x16" | "4x5" }) {
  const { brand, ratio } = input;
  const size = SIZES[ratio];
  const band = BAND[ratio];
  const tall = ratio === "9x16";
  const at = { start: 0, length: 1 };
  const up = (px: number) => Math.round((px / size.height) * 10000) / 10000;
  const single = (clip: unknown) => ({ clips: [clip] });
  const width = 960;
  // Sizes in pixels; a letter of the bold face is about 0.62 of its size wide, of the plain face about 0.52.
  const headSize = tall ? 72 : 60;
  const supportSize = tall ? 38 : 32;
  const headLines = lineCount(input.headline, Math.floor(width / (headSize * 0.62)));
  const supportLines = lineCount(input.support, Math.floor(width / (supportSize * 0.52)));
  // Line heights are given in pixels: Shotstack's renderer reads a bare number as pixels, which prints wrapped lines on top of each other.
  const headLine = Math.round(headSize * 1.18);
  const supportLine = Math.round(supportSize * 1.4);
  const head = headLines * headLine + 24;
  const support = supportLines * supportLine + 20;
  const button = { width: 460, height: 108 };
  const pad = tall ? 110 : 52;
  const gap = 4;
  // The two lines sit together, centred in what the band has above the button.
  const room = band - pad - button.height;
  const supportAt = pad + button.height + Math.max(24, Math.round((room - head - gap - support) / 2));
  const words = (text: string, css: string, height: number, from: number) =>
    single({
      asset: { type: "html", html: `<p>${escapeHtml(text)}</p>`, css: `p{${css};text-align:center}`, width, height },
      ...at,
      position: "bottom",
      offset: { x: 0, y: up(from) },
    });
  return {
    timeline: {
      background: BAND_COLOR,
      tracks: [
        single({
          asset: {
            type: "html",
            html: `<p>${escapeHtml(brand.name)}</p>`,
            css: `p{font-family:'Montserrat ExtraBold';font-size:34px;color:#ffffff;text-align:center}`,
            width: 300,
            height: 72,
            background: BAND_COLOR,
          },
          ...at,
          position: "topLeft",
          offset: { x: 0.04, y: -up(44) },
        }),
        single({
          asset: {
            type: "html",
            html: "<p>Get a quote</p>",
            css: `p{font-family:'Montserrat ExtraBold';font-size:42px;color:#ffffff;text-align:center}`,
            width: button.width,
            height: button.height,
            background: brand.primaryColor,
          },
          ...at,
          position: "bottom",
          offset: { x: 0, y: up(pad) },
        }),
        words(input.headline, `font-family:'Montserrat ExtraBold';font-size:${headSize}px;line-height:${headLine}px;color:#ffffff`, head, supportAt + support + gap),
        words(input.support, `font-family:'Open Sans';font-size:${supportSize}px;line-height:${supportLine}px;color:${brand.accentColor}`, support, supportAt),
        single({ asset: block(size.width, band, BAND_COLOR), ...at, position: "bottom" }),
        ...framedPhoto(input.photoUrl, { width: size.width, height: size.height - band }, at).map(single),
      ],
    },
    output: { format: "jpg", quality: "high", size },
  };
}

// --------------------------------------------------- Animated graphic ads

export const GRAPHIC_TITLE_MAX = 30;
export const GRAPHIC_POINT_MAX = 26;
export const GRAPHIC_POINTS = 3;

/** The text before the photos for a checklist ad: a title, three points that appear as the voice says each, and the ask. */
export function graphicPrompt(
  hook: { textEn: string; family: Family; scope: string },
  brand: string,
  photos: Candidate[],
  inScope: boolean,
  town = "your town",
  playbook?: string,
): string {
  const list = photos.map((f, i) =>
    [`Photo ${i + 1}`, f.tags.length ? `tags: ${f.tags.join(", ")}` : "", f.description ? `looks like: ${f.description}` : "", "(attached below)"]
      .filter(Boolean)
      .join(" · "),
  );
  return [
    `You write one short animated checklist ad for Facebook and Instagram, for ${brand}, a service in ${town}, Texas that matches homeowners with one vetted local painting contractor.`,
    `Concept family: ${FAMILY_LABELS[hook.family]}. Scope: ${hook.scope}. Hook: ${hook.textEn}`,
    "",
    "On screen: a title at the top, a job photo in the middle, and three short points that appear one at a time with a tick as the voice says each. It ends on a Get a quote button. Each attached photo is labelled with its number.",
    ...list,
    inScope ? "" : `None of these photos is tagged ${hook.scope}. Only go ahead if the ad still works honestly with them.`,
    "",
    ...(playbook ? ["What works in this category, from competitor ads that have run for months. Follow the angle; never their claims:", playbook.trim(), ""] : []),
    "Write:",
    `- title: the words at the top for the whole ad. At most 5 words and ${GRAPHIC_TITLE_MAX} characters.`,
    "- intro: one spoken sentence that opens on the hook, 8 to 14 words.",
    `- points: exactly ${GRAPHIC_POINTS}. Each has text (the words that appear: at most 4 words and ${GRAPHIC_POINT_MAX} characters), voice (one spoken sentence that says the same thing, 8 to 14 words) and photo (the number of the photo on screen while it is said; a photo may be used for more than one point).`,
    `- close: one spoken sentence that names ${brand} and asks the viewer to get a quote, 6 to 12 words.`,
    `- headline (at most ${HEADLINE_MAX} characters) and primaryText (at most ${PRIMARY_MAX} characters): the text Facebook shows around the ad.`,
    "- The points are what the homeowner gets or what to check, in the order a homeowner would care about. Say nothing a photo contradicts, and do not name colours, rooms or materials you cannot see.",
    ...RULES(brand, town).slice(0, 3),
    "- If the photos can't carry the hook honestly, don't force it.",
    "",
    "Return only JSON, one of:",
    '{"fits":true,"title":"...","intro":"spoken sentence","points":[{"photo":1,"text":"short point","voice":"spoken sentence"}],"close":"spoken sentence","headline":"<=40 chars","primaryText":"<=125 chars"}',
    '{"fits":false,"reason":"why the photos do not fit"}',
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

export interface GraphicPlan {
  fits?: boolean;
  reason?: string;
  title?: string;
  intro?: string;
  points?: Array<{ photo?: number; text?: string; voice?: string }>;
  close?: string;
  headline?: string;
  primaryText?: string;
}

/** What's wrong with a checklist ad Claude returned, against the photos it was offered. */
export function graphicPlanProblems(plan: GraphicPlan, photoCount: number): string[] {
  const out: string[] = [];
  const title = plan.title?.trim() ?? "";
  if (!title) out.push("no title");
  else if (title.length > GRAPHIC_TITLE_MAX) out.push(`title over ${GRAPHIC_TITLE_MAX} characters`);
  if (!plan.intro?.trim()) out.push("no intro line");
  if (!plan.close?.trim()) out.push("no closing line");
  else if (!/quote/i.test(plan.close)) out.push("the closing line doesn't ask for a quote");
  const points = plan.points ?? [];
  if (points.length !== GRAPHIC_POINTS) out.push(`${points.length} points (write ${GRAPHIC_POINTS})`);
  points.forEach((p, i) => {
    const n = p.photo;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > photoCount) out.push(`point ${i + 1} names photo ${n ?? "nothing"}`);
    const text = p.text?.trim() ?? "";
    if (!text) out.push(`point ${i + 1} has no words`);
    else if (text.length > GRAPHIC_POINT_MAX) out.push(`point ${i + 1} is over ${GRAPHIC_POINT_MAX} characters`);
    if (!p.voice?.trim()) out.push(`point ${i + 1} has no voice line`);
  });
  const spoken = [plan.intro, ...points.map((p) => p.voice), plan.close].filter(Boolean).join(" ");
  const words = spoken.split(/\s+/).filter(Boolean).length;
  if (words < 30 || words > 75) out.push(`${words} words of voice (write 40 to 65)`);
  if (!plan.headline?.trim()) out.push("no headline");
  else if (plan.headline.trim().length > HEADLINE_MAX) out.push(`headline over ${HEADLINE_MAX} characters`);
  if (!plan.primaryText?.trim()) out.push("no primary text");
  else if (plan.primaryText.trim().length > PRIMARY_MAX) out.push(`primary text over ${PRIMARY_MAX} characters`);
  const text = [title, spoken, ...points.map((p) => p.text), plan.headline, plan.primaryText].filter(Boolean).join(" ");
  for (const [re, what] of FORBIDDEN) if (re.test(text)) out.push(`mentions ${what}`);
  return out;
}

/**
 * A checklist ad as the script stored on the creative. Five spoken lines in
 * order: the intro (on screen: the title), the three points, and the close
 * (on screen: the ask). Each carries the photo shown while it is said, so
 * the voice step times them like any shot list.
 */
export function composeGraphicScript(plan: GraphicPlan, assetIds: string[]): Script {
  const points = (plan.points ?? []).map((p) => ({ assetId: assetIds[(p.photo ?? 1) - 1], voice: (p.voice ?? "").trim(), onScreen: (p.text ?? "").trim() }));
  const title = (plan.title ?? "").trim();
  const shots = [
    { assetId: points[0]?.assetId ?? assetIds[0], voice: (plan.intro ?? "").trim(), onScreen: title },
    ...points,
    { assetId: points[points.length - 1]?.assetId ?? assetIds[0], voice: (plan.close ?? "").trim(), onScreen: "Get a quote" },
  ];
  return {
    voice: shots.map((s) => s.voice).join(" "),
    onScreen: [title, ...points.map((p) => p.onScreen)],
    headline: (plan.headline ?? "").trim(),
    primaryText: (plan.primaryText ?? "").trim(),
    shots,
  };
}

/** Where a checklist ad's three zones sit in each size: words at the top, the photo across the middle, the points under it. */
const GRAPHIC = {
  "9x16": { top: 400, photo: 860, title: 68, point: 52, row: 150, rowsFrom: 60 },
  "4x5": { top: 250, photo: 600, title: 52, point: 44, row: 122, rowsFrom: 34 },
} as const;
/** How long the ask stays up after the voice has finished. */
export const GRAPHIC_HOLD_SEC = 2;
const CROSSFADE_SEC = 0.6;
const tick = (color: string) =>
  `<svg width="56" height="56" viewBox="0 0 56 56"><path d="M5 30 L13 22 L23 32 L43 10 L51 18 L23 48 Z" fill="${color}"/></svg>`;

/**
 * The Shotstack edit for a checklist ad, cut to the voice-over. The title is
 * up from the start; each point fades in with its tick when its line starts
 * and stays; when the closing line starts, the points give way to the ask.
 * The photo zone crosses the middle of the frame, so a trial key's watermark
 * never lands on words. Fades only, no music.
 */
export function graphicEdit(input: {
  /** The intro, the points and the close, in order, each with its photo and when its line starts. */
  shots: Array<{ asset: EditAsset; onScreen: string; start: number; end: number }>;
  audioUrl: string;
  audioDurationSec: number;
  brand: Brand;
  ratio: "9x16" | "4x5";
}) {
  const { shots, brand, ratio } = input;
  const size = SIZES[ratio];
  const zone = GRAPHIC[ratio];
  const total = round(input.audioDurationSec + GRAPHIC_HOLD_SEC);
  const share = (px: number) => Math.round((px / size.height) * 10000) / 10000;
  const across = (px: number) => Math.round((px / size.width) * 10000) / 10000;
  const points = shots.slice(1, -1);
  const close = shots[shots.length - 1];
  const closeAt = round(Math.max(0.5, close.start));
  const single = (clip: unknown) => ({ clips: [clip] });
  const under = zone.top + zone.photo;

  // The photos, each on screen from its line to the next line with a different photo, fading in over the one before.
  const runs: Array<{ url: string; type: "image" | "video"; start: number; until: number }> = [];
  shots.forEach((shot, i) => {
    const start = i === 0 ? 0 : shot.start;
    const last = runs[runs.length - 1];
    if (last && last.url === shot.asset.url) return;
    if (last) last.until = start;
    runs.push({ url: shot.asset.url, type: shot.asset.kind === "video" ? "video" : "image", start, until: total });
  });
  // Later photos go on higher tracks, so each fades in over the one it follows.
  const photoTracks = [...runs]
    .reverse()
    .flatMap((run) => {
      const first = run === runs[0];
      const length = round(Math.min(total, run.until + CROSSFADE_SEC) - run.start);
      return framedPhoto(run.url, { width: size.width, height: zone.photo }, { start: round(run.start), length }, { type: run.type, down: share(zone.top), fadeIn: !first });
    })
    .map(single);

  const rows = points.map((p, i) => {
    const start = round(p.start);
    const length = round(Math.max(0.5, closeAt - start));
    const y = -share(under + zone.rowsFrom + i * zone.row);
    return [
      { asset: { type: "svg", src: tick(brand.accentColor) }, start, length, position: "topLeft", offset: { x: across(84), y: Math.round((y - share((zone.row - 56) / 2)) * 10000) / 10000 }, transition: { in: "fade", out: "fade" } },
      {
        asset: {
          type: "html",
          html: `<p>${escapeHtml(p.onScreen)}</p>`,
          css: `p{font-family:'Montserrat ExtraBold';font-size:${zone.point}px;line-height:${Math.round(zone.point * 1.15)}px;color:#ffffff;text-align:left}`,
          width: 840,
          height: zone.row,
        },
        start,
        length,
        position: "topLeft",
        offset: { x: across(170), y },
        transition: { in: "fade", out: "fade" },
      },
    ];
  });
  const askLength = round(Math.max(0.5, total - closeAt));
  const below = size.height - under;
  return {
    timeline: {
      background: BAND_COLOR,
      tracks: [
        single({
          asset: {
            type: "html",
            html: `<p>${escapeHtml(brand.name)}</p>`,
            css: `p{font-family:'Montserrat ExtraBold';font-size:32px;color:${brand.accentColor};text-align:center}`,
            width: size.width,
            height: 60,
          },
          start: 0,
          length: total,
          position: "top",
          offset: { x: 0, y: -share(ratio === "9x16" ? 70 : 24) },
        }),
        single({
          asset: {
            type: "html",
            html: `<p>${escapeHtml(shots[0].onScreen)}</p>`,
            css: `p{font-family:'Montserrat ExtraBold';font-size:${zone.title}px;line-height:${Math.round(zone.title * 1.15)}px;color:#ffffff;text-align:center}`,
            width: 980,
            height: zone.top - (ratio === "9x16" ? 170 : 100),
          },
          start: 0,
          length: total,
          position: "top",
          offset: { x: 0, y: -share(ratio === "9x16" ? 150 : 90) },
          transition: { in: "fade" },
        }),
        ...rows.flat().map(single),
        // The ask, in the points' place.
        single({
          asset: {
            type: "html",
            html: "<p>Get a quote</p>",
            css: `p{font-family:'Montserrat ExtraBold';font-size:${ratio === "9x16" ? 56 : 46}px;color:#ffffff;text-align:center}`,
            width: 620,
            height: ratio === "9x16" ? 150 : 120,
            background: brand.primaryColor,
          },
          start: closeAt,
          length: askLength,
          position: "top",
          offset: { x: 0, y: -share(under + Math.round(below * 0.22)) },
          transition: { in: "fade" },
        }),
        single({
          asset: {
            type: "html",
            html: `<p>${escapeHtml([brand.name, marketsLine(brand.markets)].filter(Boolean).join(" · "))}</p>`,
            css: `p{font-family:'Open Sans';font-size:${ratio === "9x16" ? 38 : 32}px;color:${brand.accentColor};text-align:center}`,
            width: 980,
            height: 70,
          },
          start: closeAt,
          length: askLength,
          position: "top",
          offset: { x: 0, y: -share(under + Math.round(below * 0.22) + (ratio === "9x16" ? 190 : 150)) },
          transition: { in: "fade" },
        }),
        ...photoTracks,
        single({ asset: { type: "audio", src: input.audioUrl, volume: 1 }, start: 0, length: round(input.audioDurationSec) }),
      ],
    },
    output: { format: "mp4", fps: 25, size },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ------------------------------------------------------------ Swipe file

/** Parses a CSV the way Google Sheets writes one: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface SwipeRow {
  company: string;
  paintingType: string;
  scope?: string;
  hook: string;
  offer: string;
  creative: string;
  area: string;
  cta: string;
  adaptation: string;
  startedAt?: string;
  status?: string;
  pageUrl?: string;
  destination?: string;
  metaAdId?: string;
  adCopy?: string;
  transcript?: string;
  durationSec?: number;
}

export const scopeOfType = (paintingType: string): string | undefined =>
  ({ cabinets: "cabinets", interior: "interior", exterior: "exterior" })[paintingType.trim().toLowerCase()];

/** A tab's rows as objects keyed by the header, from the "#" row on. Returns null when no "#" header is found. */
function tabRows(rows: string[][]): Array<Record<string, string>> | null {
  const hi = rows.findIndex((r) => (r[0] ?? "").trim() === "#");
  if (hi < 0) return null;
  const header = rows[hi].map((h) => h.trim());
  return rows
    .slice(hi + 1)
    .filter((r) => (r[0] ?? "").trim() !== "")
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/**
 * The three tabs of the research sheet (ads, ad copy, video transcripts),
 * each saved as its own CSV, merged by the "#" column. Tabs are told apart by
 * their header; a file with none of the three headers is ignored.
 */
export function mergeSwipeCsvs(files: string[]): { rows: SwipeRow[]; tabs: string[] } {
  let ads: Array<Record<string, string>> = [];
  const copy = new Map<string, string>();
  const video = new Map<string, { transcript: string; durationSec?: number }>();
  const tabs: string[] = [];
  for (const text of files) {
    const rows = tabRows(parseCsv(text));
    if (!rows) continue;
    const keys = Object.keys(rows[0] ?? {});
    if (keys.includes("Painting type")) {
      ads = rows;
      tabs.push("ads");
    } else if (keys.includes("Ad copy and card text")) {
      for (const r of rows) copy.set(r["#"], r["Ad copy and card text"]);
      tabs.push("copy");
    } else if (keys.some((k) => k.startsWith("Spoken transcript"))) {
      const col = keys.find((k) => k.startsWith("Spoken transcript"))!;
      for (const r of rows) if (r[col]) video.set(r["#"], { transcript: r[col], durationSec: Number(r["Duration (seconds)"]) || undefined });
      tabs.push("transcripts");
    }
  }
  const num = (s: string) => String(parseInt(s, 10));
  const rowsOut: SwipeRow[] = ads.map((r) => {
    const n = num(r["#"]);
    const v = video.get(n) ?? [...video.entries()].find(([k]) => num(k) === n)?.[1];
    const c = copy.get(n) ?? [...copy.entries()].find(([k]) => num(k) === n)?.[1];
    const opt = (x: string | undefined) => (x && x.trim() ? x.trim() : undefined);
    return {
      company: r["Company"] ?? "",
      paintingType: r["Painting type"] ?? "",
      scope: scopeOfType(r["Painting type"] ?? ""),
      hook: r["Hook / angle"] ?? "",
      offer: r["Offer"] ?? "",
      creative: r["Creative"] ?? "",
      area: r["Area evidence"] ?? "",
      cta: r["CTA"] ?? "",
      adaptation: r["Client adaptation"] ?? "",
      startedAt: opt(r["Started (Meta)"]),
      status: opt(r["Status when observed"]),
      pageUrl: opt(r["Advertiser page"]),
      destination: opt(r["Destination"]),
      metaAdId: opt(r["Ad ID"]),
      adCopy: opt(c),
      transcript: v?.transcript,
      durationSec: v?.durationSec,
    };
  });
  return { rows: rowsOut, tabs };
}

// ------------------------------------------------------------ Niche research

/** One ad as the Ad Library scrape gives it, in our words. */
export interface ScrapedAd {
  metaAdId: string;
  pageId?: string;
  pageName: string;
  pageLikes?: number;
  /** ISO date the ad started running. */
  startedAt: string;
  daysRunning: number;
  active: boolean;
  variants: number;
  platforms: string[];
  adCopy: string;
  title?: string;
  cta?: string;
  landing?: string;
  imageUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
  mediaType: "video" | "image" | "carousel" | "other";
}

/** The Apify actor that searches the Ad Library (overridable with APIFY_ACTOR). */
export const DEFAULT_APIFY_ACTOR = "igolaizola~facebook-ad-library-scraper";

/** The actor's input for one keyword: active US ads that started at least minDays ago. */
export function apifyInput(keyword: string, minDays: number, now = new Date(), maxItems = 200) {
  const maxDate = new Date(now.getTime() - minDays * 86_400_000).toISOString().slice(0, 10);
  return { query: keyword, country: "US", activeStatus: "active", mediaType: "all", sortBy: "mostRecent", maxDate, maxItems };
}

type Loose = Record<string, unknown>;
const obj = (x: unknown): Loose => (x && typeof x === "object" ? (x as Loose) : {});
const first = (o: Loose, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : typeof x === "number" ? String(x) : undefined);

/** A start date as the scrape gives it: unix seconds, unix milliseconds or a date string. */
function startDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  const d = Number.isFinite(n) ? new Date(n > 1e12 ? n : n * 1000) : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Reads one scraped item, whichever spelling the actor uses (Meta's own
 * snake_case or the camelCase some actors rewrite to). Null when there is no
 * ad id or no readable start date, since longevity is the whole point.
 */
export function fromApifyItem(raw: unknown, now = new Date()): ScrapedAd | null {
  const o = obj(raw);
  const snap = obj(o.snapshot);
  const metaAdId = str(first(o, "ad_archive_id", "adArchiveID", "adArchiveId", "ad_id", "adId", "id"));
  const started = startDate(first(o, "start_date", "startDate", "startDateFormatted", "ad_delivery_start_time"));
  if (!metaAdId || !started) return null;
  const cards = Array.isArray(snap.cards) ? snap.cards.map(obj) : [];
  const videos = Array.isArray(snap.videos) ? snap.videos.map(obj) : [];
  const images = Array.isArray(snap.images) ? snap.images.map(obj) : [];
  const video = videos[0] ?? cards.find((c) => first(c, "video_hd_url", "videoHdUrl", "video_sd_url", "videoSdUrl"));
  const videoUrl = video ? str(first(video, "video_hd_url", "videoHdUrl", "video_sd_url", "videoSdUrl")) : undefined;
  const posterUrl = video ? str(first(video, "video_preview_image_url", "videoPreviewImageUrl")) : undefined;
  const image = images[0] ?? cards.find((c) => first(c, "original_image_url", "originalImageUrl", "resized_image_url", "resizedImageUrl"));
  const imageUrl = image ? str(first(image, "original_image_url", "originalImageUrl", "resized_image_url", "resizedImageUrl")) : undefined;
  const body = obj(snap.body);
  const adCopy = str(body.text) ?? str(snap.body) ?? str(first(obj(cards[0] ?? {}), "body")) ?? "";
  const end = first(o, "end_date", "endDate", "endDateFormatted");
  const active = first(o, "is_active", "isActive");
  const variants = Number(first(o, "collation_count", "collationCount") ?? 1);
  const platforms = first(o, "publisher_platform", "publisherPlatform", "publisher_platforms", "publisherPlatforms");
  return {
    metaAdId,
    pageId: str(first(o, "page_id", "pageID", "pageId")),
    pageName: str(first(o, "page_name", "pageName")) ?? str(first(snap, "page_name", "pageName")) ?? "Unknown page",
    pageLikes: Number(first(snap, "page_like_count", "pageLikeCount")) || undefined,
    startedAt: started.toISOString().slice(0, 10),
    daysRunning: Math.max(0, Math.floor((now.getTime() - started.getTime()) / 86_400_000)),
    active: typeof active === "boolean" ? active : end === undefined || end === null,
    variants: Number.isFinite(variants) && variants > 0 ? variants : 1,
    platforms: Array.isArray(platforms) ? platforms.map(String) : [],
    adCopy,
    title: str(first(snap, "title")) ?? str(first(obj(cards[0] ?? {}), "title")),
    cta: str(first(snap, "cta_text", "ctaText")) ?? str(first(obj(cards[0] ?? {}), "cta_text", "ctaText")),
    landing: str(first(snap, "link_url", "linkUrl")) ?? str(first(obj(cards[0] ?? {}), "link_url", "linkUrl")),
    imageUrl,
    videoUrl,
    posterUrl,
    mediaType: videoUrl ? "video" : cards.length > 1 ? "carousel" : imageUrl ? "image" : "other",
  };
}

/** Still running, and for long enough to mean something. */
export const qualifies = (ad: { active: boolean; daysRunning: number }, minDays: number): boolean => ad.active && ad.daysRunning >= minDays;

/** Whether the ad names one of the owner's markets (whole words, any case). */
export function isLocal(text: string, markets: string[]): boolean {
  return markets.some((m) => m.trim() && new RegExp(`\\b${m.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

export const OPENINGS = ["question", "owner", "claim", "before_after", "offer", "other"] as const;
export const FOOTAGE_KINDS = ["owner_to_camera", "before_after", "process", "crew", "finished", "graphic"] as const;

/** What Claude answers when it reads one competitor ad. */
export interface SwipeTags {
  painting: boolean;
  paintingType: string;
  scope?: string;
  hook: string;
  family: Family;
  offer: string;
  creative: string;
  area: string;
  cta: string;
  adaptation: string;
  claims: string[];
  opening: (typeof OPENINGS)[number];
  footage: Array<(typeof FOOTAGE_KINDS)[number]>;
  quality: number;
}

export const TAG_MARK = "Is this an ad for a residential painting service";

/** The text Claude gets with one competitor ad (and its still, when there is one). */
export function tagSwipePrompt(
  ad: {
    pageName: string;
    adCopy?: string;
    title?: string;
    cta?: string;
    landing?: string;
    transcript?: string;
    daysRunning?: number;
    mediaType?: string;
  },
  markets: string[],
): string {
  return [
    "You read a competitor's Facebook ad for a service that matches homeowners with local painting contractors.",
    `Advertiser: ${ad.pageName}${ad.daysRunning ? ` · running ${ad.daysRunning} days` : ""}${ad.mediaType ? ` · ${ad.mediaType}` : ""}`,
    ad.title ? `Headline: ${ad.title}` : "",
    `Copy: ${(ad.adCopy ?? "").slice(0, 1500) || "(none)"}`,
    ad.transcript ? `Spoken: ${ad.transcript.slice(0, 1500)}` : "",
    ad.cta ? `Button: ${ad.cta}` : "",
    ad.landing ? `Landing page: ${ad.landing}` : "",
    "",
    `${TAG_MARK} (house painting, cabinets, interior or exterior)? Painting classes, art, cars, commercial-only or unrelated ads are not.`,
    "Answer only JSON:",
    "{",
    '  "painting": true|false,',
    '  "paintingType": "Interior"|"Exterior"|"Cabinets"|"General painting",',
    '  "scope": "interior"|"exterior"|"cabinets"|null,',
    '  "hook": "the angle in 3 to 6 words",',
    `  "family": ${Object.keys(FAMILY_LABELS)
      .map((f) => `"${f}"`)
      .join("|")},`,
    '  "offer": "what they offer, in one line",',
    '  "creative": "what the visual is, in one line",',
    `  "area": "the market the ad names, or empty" (the owner's markets are ${markets.join(", ")}),`,
    '  "cta": "the button text",',
    `  "adaptation": "one sentence: how a ${markets[0] ?? "local"} lead service could use this angle honestly",`,
    '  "claims": ["each price, discount, warranty, deadline, time promise or named person, as written"],',
    `  "opening": ${OPENINGS.map((o) => `"${o}"`).join("|")},`,
    `  "footage": [${FOOTAGE_KINDS.map((f) => `"${f}"`).join("|")}],`,
    '  "quality": 0-60 (how clear, specific and well-made the ad is as an ad; 60 is excellent)',
    "}",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Cleans Claude's tag reply; null when it isn't usable. */
export function readSwipeTags(reply: string): SwipeTags | null {
  const out = parseJson<Partial<SwipeTags>>(reply);
  if (!out || typeof out.painting !== "boolean") return null;
  const family = (Object.keys(FAMILY_LABELS) as Family[]).includes(out.family as Family) ? (out.family as Family) : "proof";
  const scope = SCOPES.includes(out.scope as Scope) ? out.scope : undefined;
  const clean = (x: unknown, max = 200) =>
    String(x ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  return {
    painting: out.painting,
    paintingType: clean(out.paintingType, 40) || "General painting",
    scope,
    hook: clean(out.hook, 80) || "Unclear angle",
    family,
    offer: clean(out.offer),
    creative: clean(out.creative),
    area: clean(out.area, 80),
    cta: clean(out.cta, 40),
    adaptation: clean(out.adaptation, 300),
    claims: Array.isArray(out.claims)
      ? out.claims
          .map((c) => clean(c, 120))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    opening: OPENINGS.includes(out.opening as (typeof OPENINGS)[number]) ? (out.opening as (typeof OPENINGS)[number]) : "other",
    footage: Array.isArray(out.footage)
      ? (out.footage.filter((f) => FOOTAGE_KINDS.includes(f as (typeof FOOTAGE_KINDS)[number])) as SwipeTags["footage"])
      : [],
    quality: Math.max(0, Math.min(60, Math.round(Number(out.quality) || 0))),
  };
}

/** One swipe as the playbook writer sees it. */
export interface PlaybookInput {
  company: string;
  hook: string;
  family?: string;
  offer: string;
  opening?: string;
  footage?: string[];
  daysRunning?: number;
  local?: boolean;
  transcript?: string;
  adCopy?: string;
  durationSec?: number;
}

export interface Playbook {
  text: string;
  footagePrefs: string[];
  angleFamilies: Family[];
  localCompetitors: Array<{ company: string; angle: string; daysRunning: number }>;
  missingFootage: string[];
}

export const PLAYBOOK_MARK = "Distill what these ads have in common";

/** The text Claude gets to write one scope's playbook from the ads that qualify. */
export function playbookPrompt(scope: string, swipes: PlaybookInput[], markets: string[], libraryTags: Record<string, number>): string {
  const lines = swipes.map((x, i) => {
    const spoken = x.transcript
      ? `spoken (${x.durationSec ? Math.round(x.durationSec) : "?"}s): ${x.transcript
          .replace(/\[\d\d:\d\d\]\s*/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240)}`
      : x.adCopy
        ? `copy: ${x.adCopy.replace(/\s+/g, " ").trim().slice(0, 200)}`
        : "";
    return [
      `${i + 1}. ${x.company}${x.daysRunning ? ` · ${x.daysRunning} days` : ""}${x.local ? " · LOCAL" : ""}`,
      `angle: ${x.hook}${x.family ? ` (${FAMILY_LABELS[x.family as Family] ?? x.family})` : ""}`,
      `offer: ${x.offer}`,
      x.opening ? `opens with: ${x.opening}` : "",
      x.footage?.length ? `footage: ${x.footage.join(", ")}` : "",
      spoken,
    ]
      .filter(Boolean)
      .join(" · ");
  });
  const tags = Object.entries(libraryTags)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  return [
    `You advise a service in ${markets[0] ?? "Midland"}, Texas that matches homeowners with one vetted local painting contractor. It runs short video ads on Facebook and Instagram, cut from its own photo and clip library, in the "${scope}" category.`,
    `Below are competitor ads in this category that have been running for months (longevity is the only public signal; it hints that the ad pays for itself). The owner's markets are ${markets.join(", ")}; ads marked LOCAL name one of them.`,
    "",
    ...lines,
    "",
    `The owner's library, by tag: ${tags || "empty"}.`,
    "",
    `${PLAYBOOK_MARK}, in plain language a business owner reads in a minute. Describe offers generically (a free quote, a consultation), never a competitor's price, discount, warranty, deadline or named person. Answer only JSON:`,
    "{",
    '  "text": "at most 1,200 characters: the dominant angles with counts, how the long-runners open, the offers they lean on (generic), the footage they rely on, typical length, and what nobody in the owner’s markets is doing",',
    `  "footagePrefs": [the library tags the winners rely on most, in order, from: ${ASSET_TAGS.join(", ")}],`,
    `  "angleFamilies": [the concept families that dominate, in order, from: ${Object.keys(FAMILY_LABELS).join(", ")}],`,
    '  "localCompetitors": [{"company":"...","angle":"...","daysRunning":123} for each LOCAL ad],',
    '  "missingFootage": ["each kind of footage the winners rely on that the library lacks or has little of, as a plain request to the owner"]',
    "}",
  ].join("\n");
}

/** Cleans Claude's playbook reply; null when it isn't usable. */
export function readPlaybook(reply: string): Playbook | null {
  const out = parseJson<Partial<Playbook>>(reply);
  if (!out || typeof out.text !== "string" || !out.text.trim()) return null;
  const families = Object.keys(FAMILY_LABELS) as Family[];
  return {
    text: out.text.trim().slice(0, 1600),
    footagePrefs: Array.isArray(out.footagePrefs) ? [...new Set(out.footagePrefs.map(String))].filter((t) => ASSET_TAGS.includes(t)) : [],
    angleFamilies: Array.isArray(out.angleFamilies)
      ? [...new Set(out.angleFamilies.map(String))].filter((f): f is Family => families.includes(f as Family))
      : [],
    localCompetitors: Array.isArray(out.localCompetitors)
      ? out.localCompetitors
          .map((c) => obj(c))
          .filter((c) => str(c.company))
          .map((c) => ({
            company: String(c.company).slice(0, 80),
            angle: String(c.angle ?? "").slice(0, 120),
            daysRunning: Math.max(0, Math.round(Number(c.daysRunning) || 0)),
          }))
          .slice(0, 12)
      : [],
    missingFootage: Array.isArray(out.missingFootage)
      ? out.missingFootage
          .map((m) => String(m).slice(0, 160))
          .filter(Boolean)
          .slice(0, 6)
      : [],
  };
}

/** The concept family a competitor's angle most likely belongs to, for "Make a hook". */
export function familyOfAngle(angle: string): Family {
  const a = angle.toLowerCase();
  if (/cost|price|budget|afford|cheap|expens/.test(a)) return "education";
  if (/before\s*(\/|&|and|-|to)?\s*after|transform|makeover|instead|replace/.test(a)) return "before_after";
  if (/owner|founder|selfie|my name|i own/.test(a)) return "owner_story";
  if (/season|fall|winter|spring|summer|urgency|book|schedul|fresh start|new year/.test(a)) return "seasonal";
  if (/disrupt|respect|clean|protect|guest|house|process|prep/.test(a)) return "objection";
  return "proof";
}

/** Fatigued: people are seeing it often and clicking less than they first did. */
export function isFatigued(stats: { frequency: number; ctr: number; baselineCtr: number | null }): boolean {
  if (stats.baselineCtr === null || stats.baselineCtr <= 0) return false;
  return stats.frequency >= 2.5 && stats.ctr <= stats.baselineCtr * 0.8;
}

/** Meta reports money as a decimal string ("12.34"). */
export const metaCents = (spend: string | number | undefined): number => Math.round(Number(spend ?? 0) * 100) || 0;
