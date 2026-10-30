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

/** The week's hooks: active, least used first, never a family that already has an ad live. */
export function pickHooks<H extends HookRow>(hooks: H[], liveFamilies: Set<Family>, n: number): H[] {
  return hooks
    .filter((h) => h.active && !liveFamilies.has(h.family))
    .sort((a, b) => a.uses - b.uses || (a.lastUsedAt ?? "").localeCompare(b.lastUsedAt ?? ""))
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
): { assets: A[]; inScope: boolean } {
  const fresh = assets.filter((a) => !used.has(a._id)).sort((a, b) => (a.uses ?? 0) - (b.uses ?? 0) || b.createdAt.localeCompare(a.createdAt));
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
export function creativeName(hookId: string, ratio: "9x16" | "4x5", date: Date): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `WL_${shortId(hookId)}_${ratio === "9x16" ? "916" : "45"}_${day}`;
}

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

const RULES = (brand: string) => [
  `- The voice speaks only as ${brand}, never as a homeowner or customer. No testimonials, no "I hired", no invented reviews or names.`,
  "- No prices, dollar amounts, discounts, percentages off, warranties, guarantees, or promised completion times. A cost-education hook may say prices vary by size and condition and that a quote is free.",
  '- Do not address the viewer by a personal attribute (no "is your home in...", no age, income or ethnicity). Say "Midland homeowners" style phrasing instead.',
  "- Close the last shot with a plain ask: get a quote.",
];

/** The text that goes before the images: the hook, the footage list, the rules and the shape to answer in. */
export function shotListPrompt(
  hook: { textEn: string; family: Family; scope: string },
  brand: string,
  footage: Candidate[],
  inScope: boolean,
  town = "Midland",
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
    "Write a shot list: the footage to show, in order, and the voice-over line spoken while each one is on screen.",
    "- Use 2 to 4 shots (1 if only one piece of footage is offered). Use each footage number at most once.",
    "- Each voice line must fit what is visibly in that footage. Do not name colours, rooms, materials or details you cannot see.",
    "- A before must be immediately followed by its after (same pair).",
    "- 55 to 75 words of voice in total, about 25 seconds read aloud.",
    `- Each on-screen line is at most 6 words and ${ON_SCREEN_MAX} characters.`,
    ...RULES(brand),
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

/** Pulls the JSON object out of a model reply that may wrap it in prose or a code fence. */
export function parseJson<T = unknown>(reply: string): T | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
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
}

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
                html: `<p class="a">Get a quote</p><p class="b">${escapeHtml(brand.name)} · Midland and Odessa</p>`,
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Fatigued: people are seeing it often and clicking less than they first did. */
export function isFatigued(stats: { frequency: number; ctr: number; baselineCtr: number | null }): boolean {
  if (stats.baselineCtr === null || stats.baselineCtr <= 0) return false;
  return stats.frequency >= 2.5 && stats.ctr <= stats.baselineCtr * 0.8;
}

/** Meta reports money as a decimal string ("12.34"). */
export const metaCents = (spend: string | number | undefined): number => Math.round(Number(spend ?? 0) * 100) || 0;
