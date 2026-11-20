// Ads on autopilot, the pure parts: the hook library a Monday batch draws
// from, which hooks and photos a week gets, the brief Claude writes an
// animated ad to and the check on what it wrote, what the renderer
// (ads-video/, Remotion) is handed to draw one, and the fatigue rule.
// ads.ts does the storing and the calling out.

export const SCOPES = ["interior", "exterior", "cabinets", "crew", "process"] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * A trade the ad maker works in. The homeowner brand is one name for every
 * trade; what changes from trade to trade is here: who does the work, what
 * its photos are of, and what a competitor's ad has to be about to count.
 * Everything a brief says about the work comes from one of these.
 */
export interface AdTrade {
  /** Also the trade's slug in the lead market, so a lead from one of its ads arrives marked with it. */
  slug: string;
  label: string;
  /** Who does the work, as an ad says it. */
  pro: string;
  /** The same, as a business. */
  contractor: string;
  /** What its photos are of, besides the crew and the work in progress. */
  scopes: readonly string[];
  scopeLabels: Record<string, string>;
  /** The states a job photo can show, for describing an upload. */
  states: string;
  /** Searches that find its competitors' ads. */
  keywords: readonly string[];
}

export const AD_TRADES: Record<string, AdTrade> = {
  painting: {
    slug: "painting",
    label: "Painting",
    pro: "painter",
    contractor: "painting contractor",
    scopes: ["interior", "exterior", "cabinets"],
    scopeLabels: { interior: "Interior", exterior: "Exterior", cabinets: "Cabinets" },
    states: "unpainted, being prepped, being painted, finished",
    keywords: ["cabinet painting", "interior painting", "exterior house painting", "house painter"],
  },
  "outdoor-construction": {
    slug: "outdoor-construction",
    label: "Hardscaping",
    pro: "hardscaping contractor",
    contractor: "hardscaping contractor",
    scopes: ["patio", "walkway", "wall", "outdoor-living"],
    scopeLabels: { patio: "Patios", walkway: "Walkways and driveways", wall: "Retaining walls", "outdoor-living": "Outdoor kitchens and fire pits" },
    states: "bare ground, being dug or laid, finished",
    keywords: ["paver patio", "retaining wall", "hardscaping", "outdoor kitchen"],
  },
};
export const DEFAULT_TRADE = "painting";
/** The trade by its slug; painting when none is given, as everything was before there was more than one. */
export const tradeOf = (slug?: string | null): AdTrade => AD_TRADES[slug ?? DEFAULT_TRADE] ?? AD_TRADES[DEFAULT_TRADE];
/** Whether something filed with no trade, or with this one, belongs to this trade. */
export const inTrade = (row: { trade?: string }, slug?: string | null): boolean => (row.trade ?? DEFAULT_TRADE) === tradeOf(slug).slug;
/** Every tag a photo of this trade may carry. */
export const assetTagsOf = (trade: AdTrade): string[] => [...trade.scopes, "crew", "process", "before", "after"];
/** What a hook or an idea of this trade may be about. */
export const scopesOf = (trade: AdTrade): string[] => [...trade.scopes, "crew", "process"];

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
  scope: Scope | string;
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
  /** Set when the idea comes from a competitor ad: how many days that ad has been running. */
  daysRunning?: number;
}

/**
 * The week's ideas. Ones that come from a competitor ad go first, because an
 * ad that has kept running is the best sign an idea pays for itself: least
 * used first, and among those the longest-running. Ideas written by hand
 * follow. A family already live goes last, never a reason to draft nothing.
 */
export function pickHooks<H extends HookRow>(hooks: H[], liveFamilies: Set<Family>, n: number): H[] {
  return hooks
    .filter((h) => h.active)
    .sort(
      (a, b) =>
        Number(liveFamilies.has(a.family)) - Number(liveFamilies.has(b.family)) ||
        Number(a.daysRunning === undefined) - Number(b.daysRunning === undefined) ||
        a.uses - b.uses ||
        (b.daysRunning ?? 0) - (a.daysRunning ?? 0) ||
        (a.lastUsedAt ?? "").localeCompare(b.lastUsedAt ?? ""),
    )
    .slice(0, Math.max(0, n));
}

/** The scope of an idea that isn't about one kind of job: any photo in the library can carry it. */
export const ANY_SCOPE = "general";

/** A competitor ad as an idea to build on: its angle is the hook, in its own category. */
export function hookFromSwipe(swipe: { hook: string; scope?: string; family?: string; trade?: string }): HookSeed | null {
  const angle = swipe.hook.trim();
  if (!angle) return null;
  const families = Object.keys(FAMILY_LABELS) as Family[];
  return {
    family: families.includes(swipe.family as Family) ? (swipe.family as Family) : familyOfAngle(angle),
    scope: swipe.scope?.trim() || ANY_SCOPE,
    trade: tradeOf(swipe.trade).slug,
    textEn: angle.slice(0, 300),
  };
}

/** The competitor ad an idea is built around, as the writer is told about it. */
export interface BasedOn {
  company: string;
  daysRunning?: number;
  angle: string;
  offer: string;
  creative?: string;
  opening?: string;
  adaptation?: string;
  transcript?: string;
  adCopy?: string;
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
/** How many photos a reel is offered: it shows several to a line, so it needs more to choose from. */
export const REEL_CANDIDATES = 12;

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
  // An idea about painting in general can be carried by any photo.
  const inScopeAssets = scope === ANY_SCOPE ? fresh : fresh.filter((a) => a.tags.includes(scope));
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
export function creativeName(hookId: string, ratio: "9x16" | "4x5", date: Date): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `WL_${shortId(hookId)}_${ratio === "9x16" ? "916" : "45"}_${day}`;
}

/** What older ads were made of, before every ad was drawn with Remotion. Kept so they still show as what they are. */
export type AdKind = "video" | "image" | "graphic";

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
  /** When each word of the line is said, for captions that follow the voice. */
  words?: Array<{ text: string; start: number; end: number }>;
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

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\$\s?\d|\d+\s?%|percent off|% off|discount/i, "a price or discount"],
  [/warrant|guarantee/i, "a warranty or guarantee"],
  [/\bin \d+ days?\b|same[- ]day/i, "a completion time"],
  [/\bI hired\b|\bthey painted my\b|\bmy painter\b/i, "a customer voice"],
  [/is your home in|are you over/i, "a personal attribute"],
];

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

/** What Claude is asked about one library image when it's uploaded. */
export const describePrompt = (trade: AdTrade): string =>
  [
    `This is a photo (or a still from a video) a ${trade.contractor} took on a job. It will be used in ads.`,
    `Describe what is visible in one plain sentence: the surface or room, colours, the state (${trade.states}), and any people or tools.`,
    `Then choose tags from this list only: ${assetTagsOf(trade).join(", ")}. Use before or after only when the image clearly shows an unfinished or a finished state.`,
    'Return only JSON: {"description":"...","tags":["..."]}',
  ].join("\n");
export const DESCRIBE_PROMPT = describePrompt(AD_TRADES.painting);

export const ASSET_TAGS = assetTagsOf(AD_TRADES.painting);

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

export interface Brand {
  name: string;
  primaryColor: string;
  accentColor: string;
  /** The owner's markets; the first is home. On the end card. */
  markets: string[];
}

// ----------------------------------------------------------- Animated ads

/** How an ad moves. The renderer (ads-video/) draws each one. */
export const AD_STYLES = ["reel", "lightUp", "beforeAfter", "counter"] as const;
export type AdStyle = (typeof AD_STYLES)[number];
export const AD_STYLE_LABELS: Record<AdStyle, string> = { reel: "Reel", lightUp: "Light-up", beforeAfter: "Before / after", counter: "Counter" };
/** What a new ad is drawn as: the photos fill the frame and are cut like footage. The others are how ads were drawn before, and still are when one is drawn again. */
export const NEW_AD_STYLE: AdStyle = "reel";
/** The effects a reel plays, files the renderer carries (ads-video/public/sound). */
export const REEL_SOUNDS = { move: "sound/whip.wav", land: "sound/switch.wav", ask: "sound/whoosh.wav" } as const;
/** The narrowest part of a photo that may be shown on its own, as a share of its width out of 100. */
export const PART_MIN = 20;
/** The most photos a reel's line may show besides its own. */
export const LINE_MORE_MAX = 2;
/** The most unused photos kept for a reel's opening and closing. */
export const SPARE_MAX = 4;

export const TITLE_MAX = 30;
export const LABEL_MAX = 24;
export const STAT_LABEL_MAX = 30;
/** The most words in one spoken line: about six seconds, so the picture never sits still for longer. */
export const LINE_WORDS_MAX = 15;

/** What the renderer needs beyond the script: the style, the words at the top, and what the style itself shows. */
export interface Design {
  style: AdStyle;
  title: string;
  stats?: Array<{ value: number; label: string }>;
  /** The word the after is revealed on, in a before/after. */
  revealOn?: string;
  /**
   * In a reel, for each line in order: where on its photo the line is about (x, y), and, when the photo is two
   * pictures side by side, which part of its width to show (from, to). All 0 to 100; x and y are within the part.
   * `more` is the other photos shown while the line is said, after its own, by asset id.
   */
  frames?: Array<{ x?: number; y?: number; from?: number; to?: number; more?: string[] }>;
  /** In a reel, photos offered for the ad that no line uses, by asset id: its opening and closing show these before showing one again. */
  spare?: string[];
}

/** The text before the photos for one animated ad: the hook, the photos, the styles to choose from, the rules and the shape to answer in. */
export function motionPrompt(
  hook: { textEn: string; family: Family; scope: string; opening?: string },
  brand: string,
  photos: Candidate[],
  inScope: boolean,
  examples: Example[] = [],
  town = "your town",
  playbook?: string,
  basedOn?: BasedOn,
  trade: AdTrade = AD_TRADES.painting,
): string {
  const theirs = basedOn?.transcript
    ? `spoken: ${basedOn.transcript
        .replace(/\[\d\d:\d\d\]\s*/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600)}`
    : basedOn?.adCopy
      ? `copy: ${basedOn.adCopy.replace(/\s+/g, " ").trim().slice(0, 400)}`
      : "";
  const source = basedOn
    ? [
        `Build this ad around a competitor's ad${basedOn.daysRunning ? ` that has been running for ${basedOn.daysRunning} days` : ""}. An ad that keeps running is the best sign it pays for itself, so stay close to what makes it work:`,
        `- Its angle: ${basedOn.angle}`,
        `- Its offer: ${basedOn.offer}`,
        basedOn.opening ? `- How it opens: ${basedOn.opening}` : "",
        basedOn.creative ? `- What it shows: ${basedOn.creative}` : "",
        theirs ? `- Its words (${basedOn.company}) · ${theirs}` : "",
        basedOn.adaptation ? `- How to use it honestly: ${basedOn.adaptation}` : "",
        `Keep the same angle, the same kind of opening and the same order of points. Make the offer the nearest thing ${brand} truly gives: a free quote from one vetted local ${trade.pro}. Never their name, price, discount, warranty, award, review count or deadline.`,
        "",
      ].filter((line, i, all) => line !== "" || i === all.length - 1)
    : [];
  const list = photos.map((f, i) =>
    [
      `Photo ${i + 1}`,
      f.tags.length ? `tags: ${f.tags.join(", ")}` : "",
      f.pairKey ? `pair "${f.pairKey}"` : "",
      f.description ? `looks like: ${f.description}` : "",
      "(attached below)",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  return [
    `You write one short animated ad for Facebook and Instagram, about 20 seconds, for ${brand}, a service in ${town}, Texas that matches homeowners with one vetted local ${trade.contractor}.`,
    `Concept family: ${FAMILY_LABELS[hook.family]}. Scope: ${hook.scope}. Hook: ${hook.textEn}`,
    "",
    "On screen: each photo fills the whole frame and is cut like footage while its line is said. A line can show up to three photos, one after another. The title is large while the first line is said, and captions follow the voice word by word. It ends on a Get a quote button. Each attached photo is labelled with its number.",
    ...list,
    inScope ? "" : `None of these photos is tagged ${hook.scope}. Only go ahead if the ad still works honestly with them.`,
    "",
    ...source,
    ...(playbook
      ? ["What works in this category, from competitor ads that have run for months. Follow the angle and the kind of opening; never their claims:", playbook.trim(), ""]
      : []),
    ...examplesText(examples),
    "How it is drawn:",
    "- Each line after the first may have a label of at most 3 words that is stuck on the picture while the line is said.",
    "- For each line give x and y: the point on its photo the line is about, where the camera should move in (x from 0 at the left to 100 at the right, y from 0 at the top to 100 at the bottom).",
    `- A photo may itself be two pictures side by side, such as a before and its after in one image. Then give the line "cut": [from, to], the part of the photo's width to show (for example [0, 50] for the left picture), so a line about the before never shows the after. x and y are then within that part.`,
    "- Use as many different photos as honestly fit the hook, each one once where you can, so the picture keeps changing and nothing comes back.",
    `- Besides its own photo, a line may name up to ${LINE_MORE_MAX} more in "more": other photos that show the same thing the line says. They are shown one after another while the line is said, the line's own photo first. Never put a photo in more that the line's words don't fit. A line with a cut takes no more, and a photo tagged before or after is never one of the more.`,
    "- When two of the photos are one pair, one tagged before and one tagged after, show the before first, and let the words say which is which.",
    "",
    "Write:",
    `- title: at most 5 words and ${TITLE_MAX} characters.`,
    `- lines: 3 to 5 spoken lines, each one short sentence of at most ${LINE_WORDS_MAX} words (the last line may be two), 40 to 50 words in all, so something new happens on screen every few seconds. Each names the photo on screen while it is said; a photo may stay up for lines in a row.`,
    hook.opening ? `- The first line is the opening the owner chose, or very close to it: "${hook.opening}"` : "- The first line opens on the hook, in as few words as it takes.",
    `- The last line names ${brand}, and its final sentence asks the viewer to get a quote.`,
    "- Each line must fit what is visibly in its photo. Do not name colours, rooms, materials or details you cannot see.",
    `- headline (at most ${HEADLINE_MAX} characters) and primaryText (at most ${PRIMARY_MAX} characters): the text Facebook shows around the ad.`,
    ...RULES(brand, town).slice(0, 3),
    "- If these photos can't carry the hook honestly, don't force it.",
    "",
    "Return only JSON, one of:",
    `{"fits":true,"style":"${NEW_AD_STYLE}","title":"...","lines":[{"photo":1,"more":[4,6],"voice":"spoken line","label":"short label","x":60,"y":55}],"headline":"<=40 chars","primaryText":"<=125 chars"}`,
    '{"fits":false,"reason":"why the photos do not fit"}',
    "Leave out label where a line has none, more where a line shows only its own photo, and cut unless the photo is two pictures side by side.",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

export interface MotionPlan {
  fits?: boolean;
  reason?: string;
  style?: string;
  title?: string;
  /** In a reel a line also says where on its photo it is about (x, y) and, for a photo that is two pictures side by side, which part to show (cut). */
  lines?: Array<{ photo?: number; more?: number[]; voice?: string; label?: string; x?: number; y?: number; cut?: number[] }>;
  stats?: Array<{ value?: number; label?: string }>;
  revealOn?: string;
  headline?: string;
  primaryText?: string;
}

const bare = (word: string) => word.toLowerCase().replace(/[^a-z0-9']/g, "");

/** What's wrong with an animated ad Claude returned, against the photos it was offered. */
export function motionPlanProblems(plan: MotionPlan, photos: Array<{ tags: string[]; pairKey?: string }>): string[] {
  const out: string[] = [];
  const style = AD_STYLES.find((x) => x === plan.style);
  if (!style) out.push(`style "${plan.style ?? ""}" (write ${NEW_AD_STYLE})`);
  const title = plan.title?.trim() ?? "";
  if (!title) out.push("no title");
  else if (title.length > TITLE_MAX) out.push(`title over ${TITLE_MAX} characters`);
  const lines = plan.lines ?? [];
  if (lines.length < 3 || lines.length > 5) out.push(`${lines.length} lines (write 3 to 5)`);
  lines.forEach((line, i) => {
    const n = line.photo;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > photos.length) out.push(`line ${i + 1} names photo ${n ?? "nothing"}`);
    if (!line.voice?.trim()) out.push(`line ${i + 1} has no voice`);
    if (line.label && line.label.trim().length > LABEL_MAX) out.push(`line ${i + 1}'s label is over ${LABEL_MAX} characters`);
    // The other photos a reel's line shows: real ones, not its own, not twice, and never half of a before/after.
    if (style === "reel" && line.more !== undefined) {
      const more = Array.isArray(line.more) ? line.more : [];
      if (!Array.isArray(line.more) || more.some((m) => typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > photos.length)) out.push(`line ${i + 1}'s more names a photo that isn't there`);
      else {
        if (more.length > LINE_MORE_MAX) out.push(`line ${i + 1} has ${more.length} more photos (at most ${LINE_MORE_MAX})`);
        if (more.includes(n as number) || new Set(more).size !== more.length) out.push(`line ${i + 1} names a photo twice`);
        if (more.length && Array.isArray(line.cut)) out.push(`line ${i + 1} shows part of a photo, so it takes no more photos`);
        if (more.some((m) => photos[m - 1].tags.includes("before") || photos[m - 1].tags.includes("after"))) out.push(`line ${i + 1}'s more has a photo tagged before or after`);
      }
    }
  });
  const spoken = lines.map((l) => l.voice ?? "").join(" ");
  const words = spoken.split(/\s+/).filter(Boolean).length;
  // About 20 seconds at the voice's pace, and no line so long the screen sits still.
  if (words < 30 || words > 58) out.push(`${words} words of voice (write 40 to 50)`);
  lines.forEach((line, i) => {
    const n = (line.voice ?? "").split(/\s+/).filter(Boolean).length;
    if (n > LINE_WORDS_MAX) out.push(`line ${i + 1} is ${n} words (at most ${LINE_WORDS_MAX})`);
  });
  const last = lines[lines.length - 1]?.voice ?? "";
  // The word itself, so a brand with "Quotes" in its name doesn't pass for the ask.
  if (lines.length > 0 && !/\bquote\b/i.test(last)) out.push("the last line doesn't ask for a quote");

  if (style === "beforeAfter") {
    const used = [...new Set(lines.map((l) => l.photo).filter((n): n is number => typeof n === "number" && n >= 1 && n <= photos.length))];
    const first = photos[(lines[0]?.photo ?? 0) - 1];
    const before = first?.pairKey && first.tags.includes("before") ? first : undefined;
    const after = before ? used.map((n) => photos[n - 1]).find((f) => f !== before && f.pairKey === before.pairKey && f.tags.includes("after")) : undefined;
    if (!before || !after) out.push("a before/after needs a tagged pair: open on the photo tagged before and bring in its after");
    else if (used.length !== 2) out.push("a before/after uses only its two photos");
    else {
      // Once the after is up it stays up.
      const turned = lines.findIndex((l) => photos[(l.photo ?? 0) - 1] === after);
      if (lines.slice(turned).some((l) => photos[(l.photo ?? 0) - 1] !== after)) out.push("once the after is shown, it stays");
    }
    if (plan.revealOn && !spoken.split(/\s+/).some((w) => bare(w) === bare(plan.revealOn!))) out.push(`revealOn "${plan.revealOn}" isn't a word of the script`);
  }
  if (style === "counter") {
    const stats = plan.stats ?? [];
    if (stats.length < 2 || stats.length > 3) out.push(`${stats.length} numbers (a counter has 2 or 3)`);
    stats.forEach((stat, i) => {
      if (typeof stat.value !== "number" || !Number.isInteger(stat.value) || stat.value < 0 || stat.value > 99) out.push(`number ${i + 1} isn't a whole number from 0 to 99`);
      const label = stat.label?.trim() ?? "";
      if (!label) out.push(`number ${i + 1} doesn't say what it counts`);
      else if (label.length > STAT_LABEL_MAX) out.push(`number ${i + 1}'s label is over ${STAT_LABEL_MAX} characters`);
    });
    // The opening line, a line for each number, then the ask.
    if (stats.length >= 2 && lines.length < stats.length + 2) out.push(`${stats.length} numbers need ${stats.length + 2} lines: an opening, one each, and the ask`);
  }

  if (!plan.headline?.trim()) out.push("no headline");
  else if (plan.headline.trim().length > HEADLINE_MAX) out.push(`headline over ${HEADLINE_MAX} characters`);
  if (!plan.primaryText?.trim()) out.push("no primary text");
  else if (plan.primaryText.trim().length > PRIMARY_MAX) out.push(`primary text over ${PRIMARY_MAX} characters`);
  const text = [title, spoken, ...lines.map((l) => l.label), ...(plan.stats ?? []).map((x) => x.label), plan.headline, plan.primaryText].filter(Boolean).join(" ");
  for (const [re, what] of FORBIDDEN) if (re.test(text)) out.push(`mentions ${what}`);
  return out;
}

/**
 * An animated ad as it is stored: the script (each line a shot, with its photo and its label) and the design the renderer follows.
 * `offered` is what each photo is tagged, in the order offered, so a reel can keep the ones no line used for its opening and closing.
 */
export function composeMotion(plan: MotionPlan, assetIds: string[], offered: Array<{ tags: string[]; pairKey?: string }> = []): { script: Script; design: Design } {
  const shots = (plan.lines ?? []).map((line) => ({
    assetId: assetIds[(line.photo ?? 1) - 1],
    voice: (line.voice ?? "").trim(),
    onScreen: (line.label ?? "").trim(),
  }));
  const style = AD_STYLES.find((x) => x === plan.style) ?? NEW_AD_STYLE;
  const title = (plan.title ?? "").trim();
  // A reel's framing, line by line: only a point that lands on the photo, and only a part wide enough to show.
  const pct = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 100;
  const frames = (plan.lines ?? []).map((line) => {
    const [from, to] = Array.isArray(line.cut) ? line.cut : [];
    const part = pct(from) && pct(to) && to - from >= PART_MIN && to - from < 100;
    // The line's other photos: ones that were offered, each once, and none beside a part of a photo.
    const more = part || !Array.isArray(line.more) ? [] : [...new Set(line.more.filter((m) => Number.isInteger(m) && m !== line.photo && assetIds[m - 1]))].slice(0, LINE_MORE_MAX);
    return {
      ...(pct(line.x) && pct(line.y) ? { x: Math.round(line.x), y: Math.round(line.y) } : {}),
      ...(part ? { from: Math.round(from), to: Math.round(to) } : {}),
      ...(more.length ? { more: more.map((m) => assetIds[m - 1]) } : {}),
    };
  });
  // Offered and not used by any line; never half of a before/after, which is only shown as the pair it is.
  const taken = new Set([...shots.map((x) => x.assetId), ...frames.flatMap((f) => f.more ?? [])]);
  const spare = assetIds.filter((id, i) => !taken.has(id) && offered[i] && !offered[i].pairKey && !offered[i].tags.includes("before") && !offered[i].tags.includes("after")).slice(0, SPARE_MAX);
  return {
    script: {
      voice: shots.map((x) => x.voice).join(" "),
      onScreen: [title, ...shots.map((x) => x.onScreen).filter(Boolean)],
      headline: (plan.headline ?? "").trim(),
      primaryText: (plan.primaryText ?? "").trim(),
      shots,
    },
    design: {
      style,
      title,
      ...(style === "counter" ? { stats: (plan.stats ?? []).map((x) => ({ value: x.value ?? 0, label: (x.label ?? "").trim() })) } : {}),
      ...(style === "beforeAfter" && plan.revealOn?.trim() ? { revealOn: plan.revealOn.trim() } : {}),
      ...(style === "reel" && frames.some((f) => Object.keys(f).length) ? { frames } : {}),
      ...(style === "reel" && spare.length ? { spare } : {}),
    },
  };
}

/**
 * When each word of each line is said, from ElevenLabs' character times. The
 * voice is the lines joined by single spaces, so a line's characters start
 * where the earlier lines and their spaces end. Null when the alignment
 * doesn't cover the text, and the renderer estimates instead.
 */
export function wordTimings(lines: string[], alignment: Alignment | null | undefined): Array<Array<{ text: string; start: number; end: number }>> | null {
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const total = lines.join(" ").length;
  if (total === 0 || starts.length < total || ends.length < total) return null;
  let offset = 0;
  return lines.map((line) => {
    const words: Array<{ text: string; start: number; end: number }> = [];
    for (const match of line.matchAll(/\S+/g)) {
      const from = offset + match.index;
      words.push({ text: match[0], start: round(starts[from]), end: round(ends[from + match[0].length - 1]) });
    }
    offset += line.length + 1;
    return words;
  });
}

/** One photo as the renderer is given it; the renderer reads its size itself. */
export interface RenderPhoto {
  src: string;
}

/**
 * Everything the renderer draws one ad from (ads-video/src/types.ts, less the
 * photos' sizes). A before/after is given its two photos, before first; any
 * other style, the photo for each line.
 */
export function renderProps(input: {
  ratio: "9x16" | "4x5";
  design: Design;
  script: Script;
  /** The ad's photos by asset id. */
  photos: Map<string, { url: string; tags: string[] }>;
  audioUrl: string;
  audioSec: number;
  brand: Brand;
  /** The music a reel plays under the voice, and where its beats fall; none plays without one. */
  music?: { url: string; from?: number; beats?: number[] };
}) {
  const { design, script } = input;
  const shots = script.shots ?? [];
  const perLine = shots.map((x) => input.photos.get(x.assetId));
  if (shots.length === 0 || perLine.some((p) => !p)) throw new Error("A line's photo is missing from the library");
  const lines = shots.map((x) => ({
    voice: x.voice,
    start: x.start ?? 0,
    end: x.end ?? 0,
    ...((design.style === "lightUp" || design.style === "reel") && x.onScreen ? { label: x.onScreen } : {}),
    ...(x.words ? { words: x.words } : {}),
  }));
  let style: Record<string, unknown> = { kind: design.style };
  let photos = perLine.map((p) => ({ src: p!.url }));
  if (design.style === "beforeAfter") {
    const before = perLine[0]!;
    const turned = perLine.findIndex((p) => p !== before);
    if (turned < 0) throw new Error("A before/after has no after");
    photos = [{ src: before.url }, { src: perLine[turned]!.url }];
    style = { kind: "beforeAfter", ...(design.revealOn ? { crossOn: design.revealOn } : {}), crossAt: lines[turned].start };
  } else if (design.style === "counter") style = { kind: "counter", stats: design.stats ?? [] };
  if (design.style === "reel") {
    // Each line's photo with where to move in on it, and the part of it to show when it is two pictures in one.
    const own = shots.map((_, i) => {
      const f = design.frames?.[i] ?? {};
      return {
        src: perLine[i]!.url,
        ...(f.x !== undefined && f.y !== undefined ? { focus: [{ x: f.x, y: f.y }] } : {}),
        ...(f.from !== undefined && f.to !== undefined ? { crop: { from: f.from, to: f.to } } : {}),
      };
    });
    // A photo that has since left the library is passed over; the line still has its own.
    const urls = (ids: string[] = []) => ids.flatMap((id) => (input.photos.get(id) ? [{ src: input.photos.get(id)!.url }] : []));
    const spare = urls(design.spare);
    return {
      ratio: input.ratio,
      style,
      brand: input.brand,
      headline: design.title,
      // A line that shows more than its own photo carries them all, its own first.
      lines: lines.map((line, i) => {
        const more = urls(design.frames?.[i]?.more);
        return more.length ? { ...line, photos: [own[i], ...more] } : line;
      }),
      audio: input.audioUrl,
      audioSec: input.audioSec,
      photos: own,
      ...(spare.length ? { spare } : {}),
      sound: {
        ...(input.music
          ? { music: input.music.url, ...(input.music.from ? { musicFrom: input.music.from } : {}), ...(input.music.beats?.length ? { beats: input.music.beats } : {}) }
          : {}),
        ...REEL_SOUNDS,
      },
    };
  }
  return { ratio: input.ratio, style, brand: input.brand, headline: design.title, lines, audio: input.audioUrl, audioSec: input.audioSec, photos };
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

// ------------------------------------------------------------- Idea cards
//
// Before anything is made, a few writers each offer ideas in one line, the
// near-copies are dropped, one more pass picks the best, and a person keeps or
// kills each. Only kept ideas are written, voiced and drawn.

/** A writer with a point of view. Each is asked on its own, so their ideas don't converge. */
export const IDEA_WRITERS = [
  {
    key: "neighbour",
    brief:
      "You think like a homeowner talking over the fence. Plain, specific, a little dry. You open on the small true moment people recognise from having work done on their house.",
  },
  {
    key: "editor",
    brief:
      "You cut short videos for a living and think in pictures first. Each idea starts from what is seen in the first second and how the photos are cut; the words come second.",
  },
  {
    key: "sceptic",
    brief:
      "You start from why a homeowner doesn't call: the mess, strangers in the house, quotes that never come, not knowing who to trust. You say the worry out loud and answer it honestly.",
  },
  {
    key: "contrarian",
    brief:
      "You look at what every contractor's ad says and go the other way: the angle nobody uses, a question nobody asks, a comparison from outside the trade.",
  },
] as const;

/** How each of the three idea prompts begins, so a test can tell them apart. */
export const IDEA_MARK = "You come up with ideas for short video ads";
export const PICK_MARK = "You are the head of creative";
export const TASTE_MARK = "An owner has been shown ad ideas";

/** How many ideas each writer is asked for, and how many cards a person is shown. */
export const IDEAS_EACH = 5;
export const IDEAS_SHOWN = 8;
/** What an idea of a trade may be about: one of its kinds of photo, or anything. */
export const ideaScopesOf = (trade: AdTrade): string[] => [...trade.scopes, ANY_SCOPE];
const IDEA_LINE_MAX = 220;
const IDEA_OPENING_MAX = 90;
/** Text cut to a length at the end of a word, so a card never stops mid-word. */
const cutAtWord = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, "")}…`);

/** A competitor ad the idea writers may build on. `n` is how they point at it. */
export interface IdeaSource {
  n: number;
  company: string;
  daysRunning?: number;
  angle: string;
  offer: string;
}

/** One idea as a writer offers it. */
export interface IdeaDraft {
  /** The idea in one sentence: what is seen and said. */
  line: string;
  /** The first words spoken. */
  opening: string;
  family: Family;
  scope: string;
  /** The competitor ad it builds on, by its number; none when it is the writer's own. */
  from?: number;
  writer: string;
}

/** What may and may not be promised, the same for every writer and for the pass that picks. */
const IDEA_RULES = (brand: string, town: string, trade: AdTrade) => [
  `- The only offer is the true one: ${brand} matches a ${town} homeowner with one vetted local ${trade.pro}, and the quote is free.`,
  "- No prices, discounts, guarantees, warranties, deadlines, awards, review counts or anything a customer is supposed to have said.",
  "- No people on camera and nothing that needs filming. An ad is made from the job photos on file, words on screen, a voice, music and simple graphics.",
  "- A photo of one stage of a job is never passed off as another, and nothing is shown as finished work that isn't.",
];

/** The brief one writer answers. */
export function ideaPrompt(
  writer: { key: string; brief: string },
  brand: string,
  town: string,
  sources: IdeaSource[],
  library: string[],
  houseStyle?: string,
  recent: string[] = [],
  trade: AdTrade = AD_TRADES.painting,
): string {
  return [
    `${IDEA_MARK} on Facebook and Instagram for ${brand}, a service in ${town}, Texas that matches homeowners with one vetted local ${trade.contractor}.`,
    writer.brief,
    "",
    "Competitor ads that have kept running, longest first. An ad that keeps running is the best sign an idea pays for itself. Build on what makes one work, or leave them and bring your own:",
    ...(sources.length ? sources.map((s) => `${s.n}. ${s.company}${s.daysRunning ? `, running ${s.daysRunning} days` : ""}. Angle: ${s.angle}. Offer: ${s.offer}`) : ["(none on file)"]),
    "",
    "The job photos on file to make ads from:",
    ...(library.length ? library.map((l) => `- ${l}`) : ["(none described yet)"]),
    "",
    ...(houseStyle ? ["What the owner has kept and killed before. Lean towards what they keep:", houseStyle.trim(), ""] : []),
    ...(recent.length ? ["Already offered. Do not offer these again or anything close to them:", ...recent.map((r) => `- ${r}`), ""] : []),
    "Rules:",
    ...IDEA_RULES(brand, town, trade),
    "",
    `Give ${IDEAS_EACH} ideas that differ from each other in angle, not five wordings of one. For each also give "usual": from 0 to 1, how likely an ordinary ad writer is to come up with it. At least three must be under 0.3.`,
    `- line: the idea in one plain sentence of at most 24 words that someone who isn't in marketing can judge at a glance: what is seen and what is said.`,
    "- opening: the first words spoken, at most 12 words, that would stop a thumb.",
    `- family: one of ${(Object.keys(FAMILY_LABELS) as Family[]).join(", ")}.`,
    `- scope: one of ${ideaScopesOf(trade).join(", ")} (the kind of job photo it needs; ${ANY_SCOPE} when any will do).`,
    "- from: the number of the competitor ad it builds on, or 0.",
    "",
    "Return only JSON. Start your answer with { and write nothing before or after it: no thinking out loud, no notes.",
    '{"ideas":[{"line":"...","opening":"...","family":"objection","scope":"interior","from":0,"usual":0.2}]}',
  ].join("\n");
}

/** A writer's reply as ideas, with anything unusable left out. */
export function ideasFrom(reply: string, writer: string, sources: IdeaSource[], trade: AdTrade = AD_TRADES.painting): IdeaDraft[] {
  const parsed = parseJson<{ ideas?: unknown }>(reply);
  if (!parsed || !Array.isArray(parsed.ideas)) return [];
  const families = Object.keys(FAMILY_LABELS) as Family[];
  const out: IdeaDraft[] = [];
  for (const raw of parsed.ideas as Array<Record<string, unknown>>) {
    const line = String(raw?.line ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const opening = String(raw?.opening ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 12 || !opening) continue;
    // A promise the brand can't make is the commonest way an idea goes wrong; it is dropped here rather than argued with.
    if (/\$\s?\d|\d\s?%|guarantee|warrant|discount|\bcoupon\b|\bfinanc/i.test(`${line} ${opening}`)) continue;
    const from = Number(raw?.from);
    out.push({
      line: cutAtWord(line, IDEA_LINE_MAX),
      opening: cutAtWord(opening, IDEA_OPENING_MAX),
      family: families.includes(raw?.family as Family) ? (raw.family as Family) : familyOfAngle(line),
      scope: ideaScopesOf(trade).includes(String(raw?.scope)) ? String(raw.scope) : ANY_SCOPE,
      from: sources.some((s) => s.n === from) ? from : undefined,
      writer,
    });
  }
  return out.slice(0, IDEAS_EACH + 2);
}

const IDEA_STOP = new Set("a an and are as at be but by for from get has have how in is it its of on one or our so that the their them then this to we what when who why with you your".split(" "));
const ideaWords = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !IDEA_STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );

/** How alike two ideas are, 0 to 1: the share of their meaningful words they have in common. */
export function ideaOverlap(a: string, b: string): number {
  const x = ideaWords(a);
  const y = ideaWords(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size);
}

/** The ideas with near-copies dropped: the same opening, or mostly the same words, as one already in (or as one offered before). */
export function dropNearCopies(ideas: IdeaDraft[], before: string[] = []): IdeaDraft[] {
  const out: IdeaDraft[] = [];
  for (const idea of ideas) {
    const text = `${idea.line} ${idea.opening}`;
    const copy = out.some((o) => ideaOverlap(o.opening, idea.opening) >= 0.8 || ideaOverlap(`${o.line} ${o.opening}`, text) >= 0.6) || before.some((b) => ideaOverlap(b, idea.line) >= 0.7);
    if (!copy) out.push(idea);
  }
  return out;
}

/** The brief for the one pass that picks. It ranks; it does not rewrite. */
export function criticPrompt(ideas: IdeaDraft[], brand: string, town: string, want: number, houseStyle?: string, trade: AdTrade = AD_TRADES.painting): string {
  return [
    `${PICK_MARK} for ${brand}, a service in ${town}, Texas that matches homeowners with one vetted local ${trade.contractor}. Writers have offered the ad ideas below. Pick the ${want} to put in front of the owner.`,
    "",
    ...ideas.map((idea, i) => `${i + 1}. ${idea.line} Opens: "${idea.opening}"`),
    "",
    "Throw out any idea that breaks a rule:",
    ...IDEA_RULES(brand, town, trade),
    "",
    "Among the rest, prefer an opening that would stop someone scrolling, an idea a viewer hasn't seen from every other painter, and a set that is varied: no two picks with the same angle.",
    ...(houseStyle ? ["", "What the owner has kept and killed before:", houseStyle.trim()] : []),
    "",
    "Return only JSON, the numbers of your picks, best first:",
    '{"picks":[3,7,1]}',
  ].join("\n");
}

/**
 * The ideas a person is shown: the picks in order, then, if the pass that
 * picks gave too few or nothing readable, the rest taken in turn from each
 * writer so no one voice fills the page.
 */
export function pickIdeas(ideas: IdeaDraft[], reply: string | null, want: number): IdeaDraft[] {
  const picks = reply ? parseJson<{ picks?: unknown }>(reply)?.picks : null;
  const chosen: IdeaDraft[] = [];
  if (Array.isArray(picks))
    for (const n of picks) {
      const idea = ideas[Number(n) - 1];
      if (idea && !chosen.includes(idea)) chosen.push(idea);
    }
  const byWriter = new Map<string, IdeaDraft[]>();
  for (const idea of ideas) if (!chosen.includes(idea)) byWriter.set(idea.writer, [...(byWriter.get(idea.writer) ?? []), idea]);
  for (let turn = 0; chosen.length < want && [...byWriter.values()].some((list) => list.length > turn); turn++)
    for (const list of byWriter.values()) if (list[turn] && chosen.length < want) chosen.push(list[turn]);
  return chosen.slice(0, want);
}

/** The brief that turns keeps and kills into a short note on the owner's taste. */
export function tastePrompt(kept: string[], killed: string[], previous?: string): string {
  return [
    `${TASTE_MARK} for a service that matches homeowners with local contractors and kept some and killed others. Write a short note for the writers on this owner's taste.`,
    "",
    "Kept:",
    ...(kept.length ? kept.map((k) => `- ${k}`) : ["(none yet)"]),
    "",
    "Killed:",
    ...(killed.length ? killed.map((k) => `- ${k}`) : ["(none yet)"]),
    ...(previous ? ["", "The note so far:", previous.trim()] : []),
    "",
    'At most 90 words, plain sentences. Say what they go for and what they turn down, from what is common to each pile. Do not guess beyond the evidence; with little to go on, say little. Return only JSON: {"note":"..."}',
  ].join("\n");
}
