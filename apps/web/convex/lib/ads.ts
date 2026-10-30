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
}

/**
 * Footage for one creative: assets tagged with the hook's scope, a
 * before/after pair first (both halves, before then after), then the
 * newest, never one another creative this week already used. With nothing
 * in scope, any process or crew asset.
 */
export function pickAssets<A extends AssetRow>(assets: A[], scope: string, used: Set<string>, max = 4): A[] {
  const fresh = assets.filter((a) => !used.has(a._id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const inScope = fresh.filter((a) => a.tags.includes(scope));
  const pool = inScope.length > 0 ? inScope : fresh.filter((a) => a.tags.includes("process") || a.tags.includes("crew"));
  const out: A[] = [];
  const pairs = new Map<string, A[]>();
  for (const a of pool) if (a.pairKey) pairs.set(a.pairKey, [...(pairs.get(a.pairKey) ?? []), a]);
  for (const [, halves] of pairs) {
    const before = halves.find((h) => h.tags.includes("before"));
    const after = halves.find((h) => h.tags.includes("after"));
    if (before && after && out.length + 2 <= max) out.push(before, after);
  }
  for (const a of pool) if (!out.includes(a) && out.length < max) out.push(a);
  return out;
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

export interface Script {
  voice: string;
  onScreen: string[];
  headline: string;
  primaryText: string;
}

export const HEADLINE_MAX = 40;
export const PRIMARY_MAX = 125;

/** The brief Claude writes to: one hook, inside the guardrails. */
export function scriptPrompt(hook: { textEn: string; family: Family; scope: string }, brand: string, town = "Midland"): string {
  return [
    `You write short Facebook and Instagram video ads for ${brand}, a service in ${town}, Texas that matches homeowners with one vetted local painting contractor.`,
    `Concept family: ${FAMILY_LABELS[hook.family]}. Scope: ${hook.scope}. Hook: ${hook.textEn}`,
    "",
    "Rules that must hold:",
    `- The voice speaks only as ${brand}, never as a homeowner or customer. No testimonials, no "I hired", no invented reviews or names.`,
    "- No prices, dollar amounts, discounts, percentages off, warranties, guarantees, or promised completion times. A cost-education hook may say prices vary by size and condition and that a quote is free.",
    '- Do not address the viewer by a personal attribute (no "is your home in...", no age, income or ethnicity). Say "Midland homeowners" style phrasing instead.',
    '- If the footage might be an AI colour preview, say "colour visualization", never "our recent job".',
    "- Close with a plain ask: get a quote.",
    "",
    "Return only JSON with this shape:",
    '{"voice":"60-75 words spoken","onScreen":["3 short lines"],"headline":"<=40 chars","primaryText":"<=125 chars"}',
  ].join("\n");
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\$\s?\d|\d+\s?%|percent off|% off|discount/i, "a price or discount"],
  [/warrant|guarantee/i, "a warranty or guarantee"],
  [/\bin \d+ days?\b|same[- ]day/i, "a completion time"],
  [/\bI hired\b|\bthey painted my\b|\bmy painter\b/i, "a customer voice"],
  [/is your home in|are you over/i, "a personal attribute"],
];

/** What's wrong with a script Claude returned, if anything. */
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
export function parseScript(reply: string): Partial<Script> | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
}

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

/**
 * The Shotstack edit for one creative: the footage cut to the voice-over
 * (photos with a slow push-in, a before/after as a wipe when a pair is
 * there), the on-screen lines, captions transcribed from the voice, a
 * brand bug throughout and the ask on the last card.
 */
export function shotstackEdit(input: {
  assets: EditAsset[];
  audioUrl: string;
  durationSec: number;
  script: Script;
  brand: Brand;
  ratio: "9x16" | "4x5";
}) {
  const { assets, audioUrl, script, brand, ratio } = input;
  const total = Math.max(15, Math.min(30, Math.round(input.durationSec + 2)));
  const endCard = 3;
  const footage = Math.max(1, total - endCard);
  const per = footage / Math.max(1, assets.length);
  const pair = assets.length >= 2 && assets[0].pairKey && assets[0].pairKey === assets[1].pairKey && assets[0].tags.includes("before");
  const media: unknown[] = [];
  let at = 0;
  assets.forEach((a, i) => {
    const length = i === assets.length - 1 ? footage - at : per;
    const clip: Record<string, unknown> = {
      asset: a.kind === "video" ? { type: "video", src: a.url, volume: 0 } : { type: "image", src: a.url },
      start: at,
      length,
      fit: "cover",
      ...(a.kind === "photo" ? { effect: i % 2 === 0 ? "zoomIn" : "slideLeft" } : {}),
      // The after half of a pair wipes over the before.
      ...(pair && i === 1 ? { transition: { in: "wipeLeft" } } : {}),
    };
    media.push(clip);
    at += length;
  });
  const lines = script.onScreen.slice(0, 3).map((text, i) => ({
    asset: {
      type: "html",
      html: `<p>${escapeHtml(text)}</p>`,
      css: `p{font-family:'Roboto Condensed',sans-serif;font-weight:700;font-size:64px;color:#fff;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.6)}`,
      width: 960,
      height: 400,
    },
    start: (footage / 3) * i,
    length: footage / 3,
    position: "center",
    transition: { in: "fade", out: "fade" },
  }));
  const ask = "Get a quote";
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
              length: footage,
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
                html: `<p class="a">${escapeHtml(ask)}</p><p class="b">${escapeHtml(brand.name)} · Midland and Odessa</p>`,
                css: `.a{font-family:'Roboto Condensed',sans-serif;font-weight:700;font-size:84px;color:#fff;text-align:center}.b{font-family:'Roboto',sans-serif;font-size:36px;color:${brand.accentColor};text-align:center}`,
                width: 1000,
                height: 500,
                background: brand.primaryColor,
              },
              start: footage,
              length: endCard,
              position: "center",
              transition: { in: "fade" },
            },
          ],
        },
        { clips: media },
        { clips: [{ alias: "voice", asset: { type: "audio", src: audioUrl, volume: 1 }, start: 0, length: Math.min(input.durationSec, footage) }] },
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
