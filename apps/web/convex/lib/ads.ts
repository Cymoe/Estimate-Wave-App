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
  /** What a photo can show in detail (the things worked on, and the rooms): Claude labels each upload with them. */
  items: readonly string[];
  /** Searches that find its competitors' ads. */
  keywords: readonly string[];
  /**
   * The types of work it does, finer than its scopes (stained cabinets, fence staining, LVP...): a photo is tagged
   * with them, and an ad whose idea names one shows only photos of that work. Each belongs to one scope.
   */
  works?: Record<string, WorkType>;
}

/** One type of work a trade does (AdTrade.works). */
export interface WorkType {
  label: string;
  /** The scope it is part of: a photo of it is also a photo of that scope. */
  scope: string;
  /** How Claude tells it apart in a photo. */
  looks: string;
  /** Words that name it in an idea ("stained fence", "LVP"). */
  words: RegExp;
  /** A work type whose words, when also named, mean this one isn't (stained cabinets aren't painted ones). */
  not?: string;
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
    items: [
      "walls", "ceiling", "trim", "baseboards", "crown molding", "doors", "cabinets", "kitchen island", "vanity", "built-ins",
      "shelves", "stairs and railing", "fireplace", "windows",
      "front door", "garage door", "siding", "brick", "stucco", "fascia and soffit", "shutters", "porch", "deck", "fence", "columns",
      "kitchen", "bathroom", "bedroom", "living room", "hallway", "entry", "garage",
      "balusters", "floor",
    ],
    keywords: [
      "cabinet painting",
      "interior painting",
      "exterior house painting",
      "house painter",
      "cabinet refinishing",
      "kitchen cabinet painters",
    ],
    // In this order: the chips and groups of the library follow it, the most particular first, Rooms painted last.
    works: {
      "cabinets-painted": {
        label: "Cabinets painted",
        scope: "cabinets",
        looks: "cabinets or a vanity painted a solid colour (no wood grain showing)",
        words: /\bcabinet|vanit(y|ies)\b/,
        not: "cabinets-stained",
      },
      "cabinets-stained": {
        label: "Cabinets stained",
        scope: "cabinets",
        looks: "cabinets with a wood stain, the grain showing through",
        words: /\bstain\w* (the |your |kitchen )?cabinets?|cabinets? (stain|restain)\w*|wood cabinets?\b/,
      },
      "cabinets-built": {
        label: "Cabinets & vanities built",
        scope: "cabinets",
        looks: "new cabinets or a vanity built or installed, often raw wood before finishing",
        words: /\b((new|custom|built|install\w*) (kitchen |bath\w* )?(cabinets?|vanit(y|ies))|(cabinets?|vanit(y|ies)) (built|install\w*|carpentry))\b/,
      },
      doors: {
        label: "Doors",
        scope: "interior",
        looks: "a door painted or stained, inside or the front door",
        words: /\b(front |interior |entry )?doors?\b/,
      },
      "stairs-balusters": {
        label: "Stairs and balusters",
        scope: "interior",
        looks: "a staircase, its railing, balusters or spindles",
        words: /\b(balusters?|spindles?|banisters?|stair\w*|railings?|handrails?)\b/,
      },
      "closets-built-ins": {
        label: "Closets & built-ins",
        scope: "interior",
        looks: "a closet, shelving, a built-in bookcase or storage (not kitchen or bath cabinets)",
        words: /\b(closets?|built[- ]ins?|shelv(es|ing)|bookcases?)\b/,
      },
      "flooring-lvp": {
        label: "Flooring (LVP)",
        scope: "interior",
        looks: "new floor laid, luxury vinyl plank (LVP) or similar",
        words: /\b(lvp|luxury vinyl|vinyl plank|flooring|new floors?|floors? (install|replace)\w*)\b/,
      },
      "garage-floors": {
        label: "Garage floors & coatings",
        scope: "interior",
        looks: "a garage or concrete floor coated: epoxy, floor paint or sealer",
        words: /\b(epoxy|garage floors?|floor coatings?|concrete (floor )?(coat|seal|paint)\w*)\b/,
      },
      commercial: {
        label: "Commercial & retail",
        scope: "interior",
        looks: "a business space painted: a restaurant, shop, office, church, clinic or warehouse",
        words: /\b(commercial|retail|restaurants?|offices?|stores?|shops?|business(es)?|churche?s?|warehouses?)\b/,
      },
      "unit-turn": {
        label: "Unit turns / make-readies",
        scope: "interior",
        looks: "an empty rental or apartment freshly painted for the next tenant: vacant, plain, often white or builder beige",
        words: /\b(unit turns?|turnovers?|make[- ]?read(y|ies)|rentals?|apartments?|property manag\w*|landlords?|tenants?)\b/,
      },
      "interior-walls": {
        label: "Rooms painted",
        scope: "interior",
        looks: "a lived-in room in a home repainted, the room itself the subject; only when nothing more particular is",
        words: /\b(interior (paint|repaint)\w*|paint\w* (the |your |a )?(walls?|ceilings?|rooms?|interior)|(walls?|ceilings?|rooms?) (paint|repaint)\w*)\b/,
      },
      "exterior-repaint": {
        label: "Exterior repaint",
        scope: "exterior",
        looks: "the outside of a house painted: siding, trim, fascia and soffits, a porch or patio ceiling, the garage door",
        words: /\b(exterior (house )?(paint|repaint)\w*|house paint\w*|(paint|repaint)\w* (the |your |a )?(house|home|exterior|siding)|siding)\b/,
      },
      brick: {
        label: "Brick painted or sealed",
        scope: "exterior",
        looks: "brick painted, limewashed or sealed, outside or inside (a fireplace or brick wall)",
        words: /\b(brick|limewash\w*|masonry)\b/,
      },
      "fence-stain": {
        label: "Fence stain",
        scope: "exterior",
        looks: "a wood fence with a fresh stain",
        words: /\b(stain\w* (the |your |a )?fences?|fences? (stain|restain|seal)\w*)\b/,
      },
      "fence-build": {
        label: "Fence built or repaired",
        scope: "exterior",
        looks: "a fence being built, new pickets or posts, or a repaired fence",
        words: /\b(fence (build|install|repair|replace)\w*|(build|install|repair|replace)\w* (a |the |your )?fences?|new fences?)\b/,
      },
    },
  },
  "outdoor-construction": {
    slug: "outdoor-construction",
    label: "Hardscaping",
    pro: "hardscaping contractor",
    contractor: "hardscaping contractor",
    scopes: ["patio", "walkway", "wall", "outdoor-living"],
    scopeLabels: { patio: "Patios", walkway: "Walkways and driveways", wall: "Retaining walls", "outdoor-living": "Outdoor kitchens and fire pits" },
    states: "bare ground, being dug or laid, finished",
    items: ["pavers", "flagstone", "concrete", "driveway", "walkway", "steps", "retaining wall", "fire pit", "outdoor kitchen", "pergola", "turf", "edging"],
    keywords: ["paver patio", "retaining wall", "hardscaping", "outdoor kitchen", "artificial turf"],
  },
  "bathroom-remodeling": {
    slug: "bathroom-remodeling",
    label: "Bathrooms",
    pro: "bathroom remodeler",
    contractor: "bathroom remodeling contractor",
    scopes: ["walk-in-shower", "tub-to-shower", "bathtub", "full-bath"],
    scopeLabels: {
      "walk-in-shower": "Walk-in showers",
      "tub-to-shower": "Tub-to-shower conversions",
      bathtub: "Tub replacements",
      "full-bath": "Full bathroom remodels",
    },
    states: "old or worn, being torn out or installed, finished",
    items: ["shower", "tile", "tub", "vanity", "glass door", "fixtures", "niche", "floor", "toilet"],
    keywords: ["walk-in shower", "tub to shower conversion", "bathroom remodel", "shower replacement", "one day bath remodel"],
  },
};
export const DEFAULT_TRADE = "painting";
/** The trade by its slug; painting when none is given, as everything was before there was more than one. */
export const tradeOf = (slug?: string | null): AdTrade => AD_TRADES[slug ?? DEFAULT_TRADE] ?? AD_TRADES[DEFAULT_TRADE];
/** Whether something filed with no trade, or with this one, belongs to this trade. */
export const inTrade = (row: { trade?: string }, slug?: string | null): boolean => (row.trade ?? DEFAULT_TRADE) === tradeOf(slug).slug;
/** Every tag a photo of this trade may carry. */
export const assetTagsOf = (trade: AdTrade): string[] => [...trade.scopes, ...Object.keys(trade.works ?? {}), "crew", "process", "before", "after"];
/** The trade's types of work, as tags a photo can carry. */
export const worksOf = (trade: AdTrade): string[] => Object.keys(trade.works ?? {});
/** A photo's types of work, from its tags. */
export const workTags = (tags: readonly string[], trade: AdTrade): string[] => tags.filter((t) => trade.works?.[t]);
/**
 * A photo's tags with each type of work's scope added when the photo has no scope yet (a stained fence is exterior
 * work), so an idea about the scope still finds it.
 */
export function withWorkScopes(tags: string[], trade: AdTrade): string[] {
  if (tags.some((t) => trade.scopes.includes(t))) return tags;
  const scopes = workTags(tags, trade).map((w) => trade.works![w].scope);
  return [...new Set([...tags, ...scopes])];
}
/** The types of work an idea's words name ("a fence staining ad" names fence-stain), most specific kept. */
export function worksIn(text: string, trade: AdTrade): string[] {
  const words = text.toLowerCase();
  const named = Object.entries(trade.works ?? {})
    .filter(([, w]) => w.words.test(words))
    .map(([k]) => k);
  return named.filter((k) => !(trade.works![k].not && named.includes(trade.works![k].not!)));
}
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
    textEn: "One free quote, and no pressure. Tell us the job and we call you back.",
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

/**
 * The photos a quick offer is drawn from: one job only. A before and its after where there is a pair, else one
 * image holding both, else one photo tagged finished; nothing when none is.
 */
export function pickOfferPhotos<A extends { tags: string[]; pairKey?: string }>(offered: A[]): A[] {
  for (const before of offered) {
    if (!before.pairKey || !before.tags.includes("before") || before.tags.includes("after")) continue;
    const after = offered.find((a) => a !== before && a.pairKey === before.pairKey && a.tags.includes("after"));
    if (after) return [before, after];
  }
  // One image that holds a before and its after: the reel shows each half in turn.
  const both = offered.find((a) => a.tags.includes("before") && a.tags.includes("after"));
  if (both) return [both];
  // Else one photo tagged finished. Never an untagged one: it may be the before.
  const finished = offered.find((a) => a.tags.includes("after") && !a.tags.includes("before"));
  return finished ? [finished] : [];
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
  /** The job it was shot on (adJobs), when it was filed under one. */
  jobId?: string;
  /** What it shows in detail (AdTrade.items). */
  items?: string[];
  /** One of the owner's best shots: led with, at equal use. */
  best?: boolean;
}

export const MAX_CANDIDATES = 6;
/** How many photos that are a before and an after in one image are offered ahead of the rest. */
export const JOINED_FIRST = 2;
/** How many photos a reel is offered: it shows several to a line, so it needs more to choose from. */
export const REEL_CANDIDATES = 12;

/**
 * The footage Claude chooses shots from for one hook: assets tagged with the
 * hook's scope, never one another hook this week already used. Before/after
 * pairs come first (least used pair first, before then after), then up to
 * two single images that hold a before and its after, then the least used,
 * newest first among equals. With nothing in scope it falls back
 * to process or crew footage and says so (inScope false), so the prompt can
 * tell Claude.
 */
export function pickAssets<A extends AssetRow>(
  assets: A[],
  scope: string,
  used: Set<string>,
  max = MAX_CANDIDATES,
  prefer: string[] = [],
  want: string[] = [],
  works: string[] = [],
): { assets: A[]; inScope: boolean } {
  // What the idea names (front door, fence...) first; then the playbook's footage preferences: an asset carrying an
  // earlier preferred tag sorts first, then least used, then newest.
  const preference = (a: A) => {
    if (want.length && (a.items ?? []).some((i) => want.includes(i))) return -1;
    const ranks = a.tags.map((t) => prefer.indexOf(t)).filter((i) => i >= 0);
    return ranks.length ? Math.min(...ranks) : prefer.length;
  };
  const open = assets.filter((a) => !used.has(a._id));
  // A before with no after to go beside it is left out from the start, so it never counts toward what an idea can use.
  const afters = new Set(open.filter((a) => a.pairKey && a.tags.includes("after") && !a.tags.includes("before")).map((a) => a.pairKey));
  const fresh = open
    .filter((a) => !(a.tags.includes("before") && !a.tags.includes("after") && !(a.pairKey && afters.has(a.pairKey))))
    .sort((a, b) => preference(a) - preference(b) || (a.uses ?? 0) - (b.uses ?? 0) || Number(!!b.best) - Number(!!a.best) || b.createdAt.localeCompare(a.createdAt));
  // An idea that names a type of work (a stained fence, LVP) shows only photos of that work, when there are enough
  // of them to choose from; with fewer, they go first.
  const ofWork = works.length ? fresh.filter((a) => a.tags.some((t) => works.includes(t))) : [];
  if (ofWork.length >= WORK_MIN) return pickFrom(ofWork, max, true);
  if (ofWork.length) fresh.sort((a, b) => Number(ofWork.includes(b)) - Number(ofWork.includes(a)));
  // An idea about painting in general can be carried by any photo.
  const inScopeAssets = scope === ANY_SCOPE ? fresh : fresh.filter((a) => a.tags.includes(scope));
  const inScope = inScopeAssets.length > 0;
  const pool = inScope ? inScopeAssets : fresh.filter((a) => a.tags.includes("process") || a.tags.includes("crew"));
  return pickFrom(pool, max, inScope);
}

/** The fewest photos of a type of work an idea names for its ad to show only that work. */
export const WORK_MIN = 3;

/** Before/after pairs first, then up to JOINED_FIRST images holding both, then the rest (no lone befores), in the pool's order. */
function pickFrom<A extends AssetRow>(pool: A[], max: number, inScope: boolean): { assets: A[]; inScope: boolean } {
  const groups = new Map<string, A[]>();
  for (const a of pool) if (a.pairKey) groups.set(a.pairKey, [...(groups.get(a.pairKey) ?? []), a]);
  const pairs: Array<[A, A]> = [];
  for (const [, halves] of groups) {
    const before = halves.find((h) => h.tags.includes("before"));
    const after = halves.find((h) => h.tags.includes("after"));
    if (before && after) pairs.push([before, after]);
  }
  const pairUses = ([b, a]: [A, A]) => Math.max(b.uses ?? 0, a.uses ?? 0);
  const pairBest = ([b, a]: [A, A]) => Number(!!b.best || !!a.best);
  pairs.sort((x, y) => pairUses(x) - pairUses(y) || pairBest(y) - pairBest(x));
  // A pair leads only while it is as fresh as the freshest other photo: one already in more ads waits behind fresher
  // finished work, so the same before/after doesn't open every ad.
  const inPairs = new Set(pairs.flat());
  const others = pool.filter((a) => !inPairs.has(a) && !a.tags.includes("before"));
  const freshest = others.length ? Math.min(...others.map((a) => a.uses ?? 0)) : Infinity;
  const leading = pairs.filter((p) => pairUses(p) <= freshest);
  const trailing = pairs.filter((p) => pairUses(p) > freshest);
  const out: A[] = [];
  for (const [before, after] of leading) if (out.length + 2 <= max) out.push(before, after);
  // A before is shown only beside its own after: one whose after isn't offered with it never is, so an ad can't
  // show unfinished work as if it were the job.
  const lone = (a: A) => a.tags.includes("before") && !a.tags.includes("after") && !pairs.some(([b]) => b === a);
  pool = pool.filter((a) => !lone(a));
  // One image that holds a before and its after counts as a pair too. Two of those at most go in ahead of the rest,
  // so there is a before/after to show and still mostly finished work; any others only fill what is left over.
  const joined = pool.filter((a) => !a.pairKey && a.tags.includes("before") && a.tags.includes("after"));
  for (const a of joined.slice(0, JOINED_FIRST)) if (out.length < max) out.push(a);
  for (const a of pool) if (!out.includes(a) && !joined.includes(a) && !inPairs.has(a) && out.length < max) out.push(a);
  // The more used pairs, after the fresher photos, while there's room for both halves.
  for (const [before, after] of trailing) if (out.length + 2 <= max) out.push(before, after);
  for (const a of joined) if (!out.includes(a) && out.length < max) out.push(a);
  return { assets: out, inScope };
}

/** How many photos the shortlist keeps for an idea: enough to choose shots from. */
export const SHORTLIST_MAX = 12;

/**
 * Before an ad is made, Claude reads the idea against what every photo of its kind shows (the descriptions it wrote
 * when each photo came in) and names the ones that fit: two-tone cabinets for a two-tone idea, a brick house for a
 * brick idea. Without this the photos offered are only the right category, and often none shows what the idea says.
 */
export function shortlistPrompt(
  idea: string,
  photos: Array<{ n: number; tags: string[]; description: string; uses: number; best?: boolean; project?: string }>,
  max = SHORTLIST_MAX,
): string {
  return [
    "An ad is about to be made from the owner's own job photos. The idea:",
    idea,
    "",
    "The photos on file, each with what it shows (BEST marks the owner's favourite shots; uses is how many ads it is already in):",
    ...photos.map(
      (p) =>
        `${p.n}. ${p.best ? "BEST · " : ""}${p.tags.join(", ")}${p.project ? ` · project ${p.project}` : ""} · uses ${p.uses}: ${p.description.replace(/\s+/g, " ").slice(0, 220)}`,
    ),
    "",
    `Pick up to ${max} photos that show what this idea says and shows, best fit first. Only photos whose description really matches: if the idea is about two-tone cabinets, only photos with different colours above and below; if it names a room, a material or a colour, only photos that show it. Among photos that fit equally, prefer BEST ones and ones in fewer ads. Leave out anything that doesn't fit, even if that leaves few or none.`,
    `Also say whether the idea is one project's story. "oneProject": true only when the idea follows a single job from its problem to its finish (this kitchen before, the work, this kitchen after). false when it shows a kind of result across several homes (kitchens with coloured lowers, front doors we've painted): then pick photos from as many different projects as fit.`,
    "",
    'Return only JSON: {"photos":[3,7,12],"oneProject":false}',
  ].join("\n");
}

/** The photo numbers Claude picked, in its order, only ones that were offered. */
export function readShortlist(reply: string, offered: number): number[] {
  const out = parseJson<{ photos?: unknown }>(reply);
  if (!out || !Array.isArray(out.photos)) return [];
  const seen = new Set<number>();
  for (const x of out.photos) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= offered) seen.add(n);
  }
  return [...seen].slice(0, SHORTLIST_MAX);
}

/** Whether Claude called the idea one project's story; undefined when it didn't say. */
export function readOneProject(reply: string): boolean | undefined {
  const out = parseJson<{ oneProject?: unknown }>(reply);
  return typeof out?.oneProject === "boolean" ? out.oneProject : undefined;
}

/** The fewest photos a project needs, with a before and an after among them, for an ad to be told from it alone. */
export const STORY_MIN = 5;
/** In an ad that shows a range of projects, the most photos any one project gives. */
export const RANGE_PER_PROJECT = 2;

/** The fewest photos a job needs for a story to be told from it alone; a job with fewer leaves the photos picked as before. */
export const JOB_MIN = 3;

/**
 * One job's photos for a story: the problem, the work, the finish, all from the same job, so no other job's work
 * passes for this one. A job is a candidate when it has enough photos, one of them is of the idea's kind (any kind
 * for a general idea), and none was used by another ad this week. One with a before and an after goes first, then
 * the least used, then the newest. Null when no job fits: the photos are then picked across the library.
 */
export function pickJob<A extends AssetRow>(
  assets: A[],
  scope: string,
  used: Set<string>,
  max = REEL_CANDIDATES,
  want: string[] = [],
  works: string[] = [],
): { jobId: string; assets: A[] } | null {
  const jobs = new Map<string, A[]>();
  for (const a of assets) if (a.jobId) jobs.set(a.jobId, [...(jobs.get(a.jobId) ?? []), a]);
  const hasBoth = (ps: A[]) => ps.some((p) => p.tags.includes("before")) && ps.some((p) => p.tags.includes("after"));
  // A job showing what the idea names (its front door, its fence) goes first.
  const shows = (ps: A[]) => want.length > 0 && ps.some((p) => (p.items ?? []).some((i) => want.includes(i)));
  // A job of the type of work the idea names (fence staining) goes before all others.
  const ofWork = (ps: A[]) => works.length > 0 && ps.some((p) => p.tags.some((t) => works.includes(t)));
  const uses = (ps: A[]) => ps.reduce((n, p) => n + (p.uses ?? 0), 0) / ps.length;
  const hasBest = (ps: A[]) => ps.some((p) => p.best);
  const newest = (ps: A[]) => ps.reduce((d, p) => (p.createdAt > d ? p.createdAt : d), "");
  const fits = [...jobs]
    .filter(([, ps]) => ps.length >= JOB_MIN && !ps.some((p) => used.has(p._id)) && (scope === ANY_SCOPE || ps.some((p) => p.tags.includes(scope))))
    // The least used project next, so ads rotate through the projects; then one with the owner's best shots, then one
    // with a before and an after.
    .sort(
      ([, x], [, y]) =>
        Number(ofWork(y)) - Number(ofWork(x)) ||
        Number(shows(y)) - Number(shows(x)) ||
        uses(x) - uses(y) ||
        Number(hasBest(y)) - Number(hasBest(x)) ||
        Number(hasBoth(y)) - Number(hasBoth(x)) ||
        newest(y).localeCompare(newest(x)),
    );
  if (fits.length === 0) return null;
  const [jobId, photos] = fits[0];
  return { jobId, assets: jobInOrder(photos, max) };
}

/**
 * A job's photos in the order its story is told: the befores, then the work, then the finished photos, each
 * oldest first. With more than a reel can be offered, two befores and three finished photos are kept and the
 * work fills the rest, so the story still starts on the problem and ends on the finish.
 */
export function jobInOrder<A extends AssetRow>(photos: A[], max = REEL_CANDIDATES): A[] {
  const byAge = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // An image holding a before and its after is a finish: it ends on the after.
  const befores = byAge.filter((p) => p.tags.includes("before") && !p.tags.includes("after"));
  const afters = byAge.filter((p) => p.tags.includes("after"));
  const work = byAge.filter((p) => !befores.includes(p) && !afters.includes(p));
  if (photos.length <= max) return [...befores, ...work, ...afters];
  const b = befores.slice(0, 2);
  const f = afters.slice(0, 3);
  const room = Math.max(0, max - b.length - f.length);
  // Short of work photos, more befores and finishes fill the room.
  const fill = [...work, ...afters.slice(3), ...befores.slice(2)].slice(0, room);
  const mid = fill.filter((p) => work.includes(p));
  const moreAfter = fill.filter((p) => afters.includes(p));
  const moreBefore = fill.filter((p) => befores.includes(p));
  return [...b, ...moreBefore, ...mid, ...f, ...moreAfter];
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
  /** What it shows in detail (AdTrade.items). */
  items?: string[];
  durationSec?: number;
  /** The still Claude looks at; none for a video or HEIC with no still. */
  imageUrl?: string;
}

const RULES = (brand: string, town: string) => [
  `- The voice speaks only as ${brand}, never as a homeowner or customer. No testimonials, no "I hired", no invented reviews or names.`,
  "- No prices, dollar amounts, discounts, percentages off, warranties, guarantees, or promised completion times. A cost-education hook may say prices vary by size and condition and that a quote is free.",
  `- Never promise how fast, or whether, anyone answers: no "never wait", no "always calls back", no "same-day".`,
  `- Do not address the viewer by a personal attribute (no "is your home in...", no age, income or ethnicity). Say "${town} homeowners" style phrasing instead.`,
  "- Close the last shot with a plain ask: get a quote.",
  "- No hype, even where the competitor's ad uses it: never nightmare, dream kitchen, stunning, amazing, flawless, jaw-dropping. Say plainly what is seen.",
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

export interface Scored { endedAt?: string;
  starred: boolean;
  quality?: number;
  daysRunning?: number;
  local?: boolean;
}

/**
 * How much a swipe is worth learning from, 0–100: Claude's quality (0–60) and
 * how long it has run (up to 25 for a year), less 10 once it has stopped, scaled
 * so the best possible ad is 100. Naming one of the owner's towns earns nothing.
 * Untagged rows count as middling quality.
 */
export function swipeScore(s: Scored): number {
  const quality = Math.max(0, Math.min(60, s.quality ?? 30));
  const longevity = Math.min(25, Math.round(((s.daysRunning ?? 0) / 365) * 25));
  // One that has stopped still proved itself, but a still-running one is what's working now.
  const points = quality + longevity - (s.endedAt ? 10 : 0);
  return Math.max(0, Math.min(100, Math.round((points / 85) * 100)));
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
  [/\bnever (have to )?wait|\bno (more )?waiting\b|\balways (answers?|calls? back|picks? up|responds?)\b/i, "a promise about how fast a contractor answers"],
  [/\bI hired\b|\bthey painted my\b|\bmy painter\b/i, "a customer voice"],
  [/is your home in|are you over/i, "a personal attribute"],
  // Nothing about how the pros are chosen is written down, so nothing is claimed about it.
  [/\bvetted\b|\bpre-?screened\b|\btop-rated\b/i, "a claim about how the pros are checked (vetted, screened, top-rated)"],
  // Plain words about what is seen; a competitor's hype isn't carried over.
  [/\bnightmare\b|\bdream (kitchen|home|bath|house)|\bstunning\b|\bamazing\b|\bjaw[- ]dropping\b|\bbreathtaking\b|\bflawless\b/i, "hype (nightmare, dream kitchen, stunning, amazing, flawless): say plainly what is seen"],
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

/**
 * A photo's stage, one only: before, process (in progress) or after; the furthest along wins. The exception is one image
 * holding a before and its after (a side-by-side), tagged both before and after, with no process.
 */
export function oneStage(tags: string[]): string[] {
  const has = (t: string) => tags.includes(t);
  if (has("before") && has("after")) return tags.filter((t) => t !== "process");
  const keep = has("after") ? "after" : has("process") ? "process" : has("before") ? "before" : null;
  return tags.filter((t) => !["before", "process", "after"].includes(t) || t === keep);
}

/** What Claude is asked about one library image when it's uploaded. */
export const describePrompt = (trade: AdTrade): string =>
  [
    `This is a photo (or a still from a video) a ${trade.contractor} took on a job. It will be used in ads.`,
    `Describe what is visible in one plain sentence of at most 30 words: the surface or room, colours, the state (${trade.states}), and any people or tools.`,
    `Then choose tags from this list only: ${assetTagsOf(trade).join(", ")}. Use before or after only when the image clearly shows an unfinished or a finished state.`,
    "Name the type of work that is the subject of the photo first: what it was taken to show. Walls are in nearly every photo; use interior-walls (rooms painted) only when the room as a whole is the subject and none of the others fits. A business (restaurant, shop, office) is commercial; an empty rental readied for the next tenant is unit-turn; a closet or shelving is closets-built-ins; a brick fireplace is brick.",
    "For a before or a photo of the work going on, tag the type of work the job is for, what is about to be or being done: dated wood kitchen cabinets are cabinets-painted unless the job looks like a stain; raw new cabinets going in are cabinets-built; a weathered house is exterior-repaint.",
    "Give it at most one stage: before (unfinished), process (the work going on) or after (finished). Tag it both before and after only when the image is two pictures joined, a before and its after side by side or one above the other.",
    ...(trade.works
      ? [
          "Also tag the type of work it shows (one or more, only when clear):",
          ...Object.entries(trade.works).map(([k, w]) => `- ${k}: ${w.looks}`),
        ]
      : []),
    `Then list what the photo shows, from this list only, every one that is clearly in it (the things worked on, and the room): ${trade.items.join(", ")}.`,
    'Return only JSON: {"description":"...","tags":["..."],"items":["..."]}',
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
export const AD_STYLES = ["reel", "lightUp", "beforeAfter", "counter", "explainer"] as const;
export type AdStyle = (typeof AD_STYLES)[number];
export const AD_STYLE_LABELS: Record<AdStyle, string> = { reel: "Reel", lightUp: "Light-up", beforeAfter: "Before / after", counter: "Counter", explainer: "Checklist" };
/** A cost-education idea is drawn as a checklist over the job's photos; every other idea as a reel. */
export const styleFor = (family: Family): AdStyle => (family === "education" ? "explainer" : NEW_AD_STYLE);
/** An idea about prep or the process: drawn as a checklist, it sets prep against no prep. */
export const PREP_ANGLE = /\b(prep|prepped|preparation|process|craftsmanship|tap(e|ed|ing)|mask(ed|ing)?)\b/i;
/** A checklist's title names the lesson ("3 things to check in a painting quote"), so it may run longer than a reel's. */
export const EXPLAINER_TITLE_MAX = 42;
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
export const LABEL_MAX = 40;
export const STAT_LABEL_MAX = 30;
/** The most words in one spoken line: about six seconds, so the picture never sits still for longer. */
export const LINE_WORDS_MAX = 15;

/** Other ways to draw a checklist, same words and voice: printed cards on a board, the photo marked up with a pen, or a red no-prep side pushed off by the prep photo. */
export const AD_LOOKS = ["collage", "markup", "versus"] as const;
export type AdLook = (typeof AD_LOOKS)[number];

/** What the renderer needs beyond the script: the style, the words at the top, and what the style itself shows. */
/** How an ad is drawn: one of the styles Claude picks from, or a job site video run as it was shot (lib/footage.ts). */
export type DesignStyle = AdStyle | "footage";

export interface Design {
  style: DesignStyle;
  title: string;
  stats?: Array<{ value: number; label: string }>;
  /** The word the after is revealed on, in a before/after. */
  revealOn?: string;
  /**
   * In a reel, for each line in order: where on its photo the line is about (x, y), and, when the photo is two
   * pictures side by side, which part of its width to show (from, to). All 0 to 100; x and y are within the part.
   * `down` says the part is measured down the photo, for two pictures one above the other.
   * `before` says the line's picture is the unfinished state, which an ad never opens or closes on.
   * `more` is the other photos shown while the line is said, after its own, by asset id.
   */
  frames?: Array<{ x?: number; y?: number; from?: number; to?: number; down?: boolean; before?: boolean; more?: string[]; mark?: "check" | "cross"; skip?: string }>;
  /** In a reel, photos offered for the ad that no line uses, by asset id: its opening and closing show these before showing one again. */
  spare?: string[];
  /** In an explainer, a few words above the title naming the subject ("Painting quotes"). */
  tag?: string;
  /** An explainer drawn as printed photo cards piled on a board, instead of a list over a full-frame photo. */
  look?: AdLook;
  /** Drawn with Tesseract instead of Remotion: a job site video's side-by-side copy. */
  engine?: "tesseract";
  /** A job site video whose own sound is a song or radio: played silent, with our music instead. */
  muteClip?: boolean;
  /** A quick offer: a reel of about 9 seconds, one job, a local hook, then the free quote. */
  quick?: boolean;
}

/** The three jobs an ad can do: a story stops a stranger, a lesson earns trust, a quick offer asks people who have already seen us. */
export type AdAngle = "story" | "lesson" | "offer";
export const ANGLE_LABELS: Record<AdAngle, string> = { story: "Story", lesson: "Lesson", offer: "Quick offer" };
export const angleOf = (design: { style: DesignStyle; quick?: boolean }): AdAngle => (design.quick ? "offer" : design.style === "explainer" ? "lesson" : "story");
/** What the card in Ops → Ads calls an ad: its angle and, for a lesson, its look. */
export const LOOK_LABELS: Record<AdLook, string> = { collage: "collage", markup: "marked-up", versus: "face-off" };
export function designLabel(design: { style: DesignStyle; quick?: boolean; look?: AdLook; engine?: "tesseract" }): string {
  if (design.style === "footage") return design.engine === "tesseract" ? "Job site video (Tesseract)" : "Job site video";
  const angle = angleOf(design);
  if (angle === "offer") return ANGLE_LABELS.offer;
  if (angle === "lesson") return `Lesson, ${design.look ? LOOK_LABELS[design.look] : "checklist"}`;
  return design.style === "reel" ? "Story" : AD_STYLE_LABELS[design.style];
}
/** A quick offer's length, in words of voice: about 9 seconds. */
export const QUICK_WORDS = { min: 14, max: 30 } as const;

/**
 * A competitor ad's words with repeats taken out. Carousel ads come out of the Ad Library as the same card text over
 * and over, which is no script to follow.
 */
export function onceOnly(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000)
    .replace(/(.{12,}?)(?:\s*\1)+/g, "$1")
    .trim();
}

/** Enough of a competitor's words to follow as a script, not just a headline. */
const SCRIPT_WORDS = 12;
/** The most points a checklist following a script shows: the looks still read at six. */
export const CHECKLIST_POINTS_MAX = 6;
/** The most lines a followed script takes: one per sentence of a minute-long ad. */
export const SCRIPT_LINES_MAX = 14;
/** The longest a line of a followed script may run, so the picture still changes every few seconds. */
export const SCRIPT_LINE_WORDS_MAX = 28;
/** The most primary text Facebook shows in full before "See more", and more than any long-running ad on file uses. */
export const SCRIPT_PRIMARY_MAX = 1500;

/**
 * How long our ad runs when it follows a competitor's script: as many words as they said (or, for an ad with no
 * voice, as their copy), and primary text as long as theirs. None when there is no script to follow.
 */
export function scriptLength(basedOn?: Pick<BasedOn, "transcript" | "adCopy">): { words: number; copyChars: number } | undefined {
  const spoken = onceOnly((basedOn?.transcript ?? "").replace(/\[\d\d:\d\d(?::\d\d)?\]\s*/g, ""));
  const copy = onceOnly(basedOn?.adCopy ?? "");
  const words = (spoken || copy).split(" ").filter(Boolean).length;
  if (words < SCRIPT_WORDS) return undefined;
  // A voice reads about 2.5 words a second: past 150 words the ad runs over a minute, so it stops there.
  return { words: Math.min(words, 150), copyChars: Math.min(copy.length, SCRIPT_PRIMARY_MAX) };
}

/** The text before the photos for one animated ad: the hook, the photos, the styles to choose from, the rules and the shape to answer in. */
export function motionPrompt(
  // steps: the reel's title and headlines add to what is said, never repeat it (motionPlanProblems' noEcho).
  // range: the photos are of several projects, shown as a range of our work, not one job's story.
  hook: { textEn: string; family: Family; scope: string; opening?: string; style?: AdStyle; versus?: boolean; quick?: boolean; steps?: boolean; range?: boolean },
  brand: string,
  photos: Candidate[],
  inScope: boolean,
  examples: Example[] = [],
  town = "your town",
  playbook?: string,
  basedOn?: BasedOn,
  trade: AdTrade = AD_TRADES.painting,
): string {
  // Their words in full: a script cut short is followed short.
  const spoken = onceOnly((basedOn?.transcript ?? "").replace(/\[\d\d:\d\d(?::\d\d)?\]\s*/g, "")).slice(0, 2500);
  const copy = onceOnly(basedOn?.adCopy ?? "").slice(0, 2500);
  const theirs = [spoken ? `spoken: ${spoken}` : "", copy ? `written: ${copy}` : ""].filter(Boolean).join(" · ");
  // A script to follow line by line, or only a headline's worth of words to take the angle from.
  // A script to follow: in full for a story, as its short version for a quick offer, as points for a checklist.
  const script = scriptLength(basedOn) !== undefined;
  const length = script && !hook.quick ? scriptLength(basedOn) : undefined;
  const source = basedOn
    ? [
        `Build this ad around a competitor's ad${basedOn.daysRunning ? ` that has been running for ${basedOn.daysRunning} days` : ""}. An ad that keeps running is the best sign it pays for itself, so stay close to what makes it work:`,
        `- Its angle: ${basedOn.angle}`,
        `- Its offer: ${basedOn.offer}`,
        basedOn.opening ? `- How it opens: ${basedOn.opening}` : "",
        basedOn.creative ? `- What it shows: ${basedOn.creative}` : "",
        theirs ? `- Its words (${basedOn.company}) · ${theirs}` : "",
        basedOn.adaptation ? `- How to use it honestly: ${basedOn.adaptation}` : "",
        script
          ? `Use its script. Follow its words line by line, in the same order and the same voice (it speaks as the company, "we"), and put each line on one of our photos that fits it. ${length ? "Keep every point it makes and its length: never shorten it to a summary. " : hook.quick ? "This is the short version: its hook and its strongest point, in its words. " : ""}Change only what isn't true for us: their name and town, prices, discounts, warranties or guarantees, awards, review counts, years in business, licensed or insured claims, and how many days the job takes. Their offer becomes ours: a free quote from ${brand}. The primary text follows its written words the same way.`
          : `Keep the same angle, the same kind of opening and the same order of points: take its points in order and give each one a line of ours on one of our photos. Their offer becomes ours: a free quote from ${brand}. Never their name, price, discount, warranty, award, review count or deadline.`,
        "",
      ].filter((line, i, all) => line !== "" || i === all.length - 1)
    : [];
  const list = photos.map((f, i) =>
    [
      `Photo ${i + 1}`,
      f.tags.length ? `tags: ${f.tags.join(", ")}` : "",
      f.pairKey ? `pair "${f.pairKey}"` : "",
      f.description ? `looks like: ${f.description}` : "",
      f.items?.length ? `shows: ${f.items.join(", ")}` : "",
      "(attached below)",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  // A cost-education idea is a checklist drawn over the job's photos; everything else is a reel.
  const explain = (hook.style ?? styleFor(hook.family)) === "explainer";
  // A checklist that sets prep against no prep: each point says the corner a no-prep quote cuts, then the prepped way.
  const versus = explain && hook.versus === true;
  // A quick offer: a reel of about 9 seconds for people who have seen us before, one job and the free quote.
  const quick = !explain && hook.quick === true;
  return [
    `You write one short animated ad for Facebook and Instagram, about ${quick ? 9 : 20} seconds, for ${brand}, a ${trade.contractor} in ${town}, Texas.`,
    `Concept family: ${FAMILY_LABELS[hook.family]}. Scope: ${hook.scope}. Hook: ${hook.textEn}`,
    "",
    explain
      ? "On screen: a short checklist over the job's own photos. Each line's photo fills the whole frame and moves in slowly; the cut to the next photo comes as its line starts. The title is large in the middle under a small tag while the first line is said, then moves to the top. Each line between the first and the last adds a numbered point (its label) to a list low on the screen, ticked once it has been said. Captions show the voice a few words at a time. It ends on a Get a quote button. Each attached photo is labelled with its number."
      : "On screen: each photo fills the whole frame and is cut like footage while its line is said. A line can show up to three photos, one after another. The title is large across the top while the first line is said; after that each line's label is the headline across the top. Captions show the voice a few words at a time. It ends on a Get a quote button. Each attached photo is labelled with its number.",
    ...list,
    inScope ? "" : `None of these photos is tagged ${hook.scope}. Only go ahead if the ad still works honestly with them.`,
    "",
    ...source,
    ...(playbook
      ? ["What works in this category, from competitor ads that have run for months. Follow the angle and the kind of opening; never their claims:", playbook.trim(), ""]
      : []),
    ...examplesText(examples),
    "How it is drawn:",
    ...(explain
      ? [
          "- The first line names the question the checklist answers (\"Two painting quotes for the same room can look nothing alike.\"). Its photo is finished work.",
          `- The lines between the first and the last are the points: ${length ? `one for each point their script makes, ${CHECKLIST_POINTS_MAX} at most` : "2 or 3 of them"}, each one thing a homeowner can check or ask about in any quote, in the order the competitor ad makes its points. Each has a label of 2 to 5 words naming the point ("Prep written down", at most ${LABEL_MAX} characters) and a mark: "check" for something to look for, "cross" for something a quote leaves out.`,
          "- Each point's photo must show what the point is about (taped trim for prep, plastic over counters for protecting the home). If no photo shows it, choose another point; never pair a point with a photo its words don't fit.",
          "- Never use a photo tagged before, or a photo that is two pictures in one. The last line's photo is finished work.",
          "- For each line give x and y: the spot on its photo that shows what the line names (the taped trim, the masked frame), where the camera moves in and a ring may be drawn (x from 0 at the left to 100 at the right, y from 0 at the top to 100 at the bottom).",
          "- Use a different photo for each line where you can.",
          ...(versus
            ? [
                `- This one sets prep against no prep. Give every point a skip: what a quote that skips that prep does instead, in 2 to 6 words ("Paint over the trim", at most ${LABEL_MAX} characters). It is shown crossed out, in words only, just before the point. The point's label is the prepped way ("Trim taped first"), and its photo shows that prep being done.`,
                "- Each point's line says both, in that order: the corner some quotes cut, then what prep looks like (\"Some quotes paint right over the trim. Prep means taping it first.\"). Never say or suggest that a photo shows the no-prep way, and never blame damage or a bad result on skipped prep: say only what prep is.",
              ]
            : []),
          "",
          "Teach one useful thing, plainly:",
          "- No prices, ranges or dollar amounts: say what to look for, never what anything costs.",
          "- Each point is something the homeowner can check in any quote, said in a few words they could repeat to a painter.",
        ]
      : [
    hook.steps
      ? "- Each line after the first has a label: 3 to 7 words across the top while the line is said. The captions already show what is said, so a label never repeats the line's words: it says the line's point in other words of your own, written for this ad and this job. Where the line is a step of how the work is done, the label is \"Step\" and its number, a colon, and two to four words naming that step (what happens, not what is in the photo). Any other line's label names its point in a few words. The title doesn't repeat the first line either. Read in order with the title, the labels alone still tell the story with the sound off."
      : "- Each line after the first has a label: a headline of 3 to 7 words across the top while the line is said. Read in order with the title, the headlines alone tell the story to someone watching with the sound off (\"Bare dirt, every summer\", \"Base dug and packed\", \"Same yard, finished\").",
    "- For each line give x and y: the point on its photo the line is about, where the camera should move in (x from 0 at the left to 100 at the right, y from 0 at the top to 100 at the bottom).",
    `- A photo may itself be two pictures in one, such as a before and its after, side by side or one above the other. Then give the line "cut": [from, to], the part of the photo to show, so a line about the before never shows the after. For two side by side it is measured across ([0, 50] is the left picture). For one above the other add "stacked": true and it is measured down ([0, 50] is the top picture). Where a word such as Before or After is printed on the photo by the join, stop the cut short of it. x and y are then within that part. A photo tagged both before and after is one of these, and always needs a cut.`,
    "- Use as many different photos as honestly fit the hook, each one once where you can, so the picture keeps changing and nothing comes back.",
    `- Besides its own photo, a line may name up to ${LINE_MORE_MAX} more in "more": other photos that show the same thing the line says. They are shown one after another while the line is said, the line's own photo first. Never put a photo in more that the line's words don't fit. A line with a cut takes no more, and a photo tagged before, or one of a pair, is never one of the more.`,
    "- When two of the photos are one pair, one tagged before and one tagged after, show the before first, and let the words say which is which.",
    `- Add "before": true to any line whose picture is a before, the unfinished state, whether a photo of its own or one half of a photo. The ad never opens or closes on such a picture.`,
    "",
    ...(quick
      ? [
          "This one is a quick offer: about 9 seconds, three lines, one job. It is for people nearby who have scrolled past us before, so it gets to the point.",
          `- Line 1, the hook: 3 to 6 words that speak to the viewer where they live ("${town} homeowners, look at this.", "Cabinets like these, ${town}?"). It names the area to speak to the viewer; it never says or suggests the pictured job was there. Its picture is the finished work, or the before when line 2 shows its after.`,
          "- Line 2: the one plain thing we did that you can see (\"We took every door off and masked every frame.\"), on the photo that shows it, or the after of the pair.",
          `- Line 3: the ask (\"Get a free quote from ${brand}.\"), on finished work.`,
          "- One job only: use only the photos of one job, a before and its after or a single photo. Never mix jobs.",
        ]
      : hook.range
        ? [
    "Show a range of our work: these photos are of several different homes.",
    "- Put each line on a different home's finished photo, so the picture keeps changing: use as many of the different homes as there are lines for, and never two lines running on the same home unless they are its before and its after.",
    "- Speak in the plural (\"kitchens we've painted\", \"each of these\"): never say or suggest the photos are one home, one kitchen or one job.",
    "- A before is shown only directly before its own after (the same pair), and the words say it is the same room. Never set one home's before against another home's finish.",
    "- Open on finished work that shows the idea at a glance. The ad ends on finished work.",
          ]
        : [
    "Tell it as one small story: one job, one problem, one change.",
    "- Open on the problem. Where there is a before, the first line's picture is the before and the first words name the problem you can see in it (\"This back yard was bare dirt.\"). Never open on a statement about the trade (\"cabinet redos come in plenty of looks\").",
    "- Then the turn: one concrete thing the pro did that you can see in the photos (doors off and every pane taped, the base dug and packed). One detail, said plainly, beats a list.",
    "- Then the after, from the same spot where you have it, given time to land. The ad ends on finished work.",
        ]),
        ]),
    "- Facts come only from what is visible and from the photo descriptions above. Never invent an age, a street, a homeowner, what anyone said, or anything you cannot see.",
    `- Never say or hint where a pictured job was, ${town} included: the photos don't say.${quick ? ` (The quick offer's first line may name ${town} to speak to the viewer, never about the job.)` : ""}`,
    "- Name only what anyone would see at a glance. A detail that is small, blurred, or could be something else (a decoration behind glass, a reflection, a shadow) is left out: never call something peeling, cracked, rotten or damaged unless that is plain in the photo or its description says so.",
    "- The title and every headline must be true of the picture under it: a title over a before doesn't describe the after.",
    "- Write for the ear: sentences of 6 to 12 words, one idea each, in words you'd say to a neighbour over the fence. Put the important word last. No rhyme, no lists of adjectives, and none of: transform your space, the range is wide, done right, peace of mind, quality work, top-notch, look no further.",
    `- ${brand} speaks as the company doing the work, the way the competitor ads do: \"we\" and \"our crew\" (\"We took every door off.\"). Never as a homeowner or customer. Its name comes only in the last line.`,
    "",
    "Write:",
    explain
      ? `- tag: 1 to 3 words naming the subject ("Painting quotes"). title: at most 9 words and ${EXPLAINER_TITLE_MAX} characters naming the lesson ("3 things to check in a painting quote"); a number in it matches the points.`
      : hook.steps
        ? `- title: at most 5 words and ${TITLE_MAX} characters: the problem or the change, not the brand. It sits over the first line while that line is said, so it must not use that line's words: if the line says "give your kitchen a fresh new look", the title is something like "Skip the remodel", never "A fresh new look".`
        : `- title: at most 5 words and ${TITLE_MAX} characters: the problem or the change, not the brand.`,
    explain
      ? length
        ? `- lines: the opening, one line per point, then the ask, ${Math.round(length.words * 0.85)} to ${Math.round(length.words * 1.1)} words in all (theirs is ${length.words}): say each point the way their script does, at full length, each line at most ${SCRIPT_LINE_WORDS_MAX} words. Each names the photo on screen while it is said.`
        : `- lines: 4 or 5 spoken lines: the opening, one per point, then the ask. Each at most ${LINE_WORDS_MAX} words, 45 to 55 words in all. Each names the photo on screen while it is said.`
      : quick
        ? `- lines: exactly 3 spoken lines, ${QUICK_WORDS.min + 4} to ${QUICK_WORDS.max - 4} words in all. Each names the photo on screen while it is said.`
        : length
          ? `- lines: one spoken line for each sentence or point of their script, in their order, ${Math.round(length.words * 0.85)} to ${Math.round(length.words * 1.1)} words in all (theirs is ${length.words}), each line at most ${SCRIPT_LINE_WORDS_MAX} words. Each names the photo on screen while it is said; a photo may stay up for lines in a row, and "more" keeps the picture changing.`
          : `- lines: 3 to 5 spoken lines, each at most ${LINE_WORDS_MAX} words (a line may be two short sentences), 45 to 55 words in all, so something new happens on screen every few seconds. Each names the photo on screen while it is said; a photo may stay up for lines in a row.`,
    quick ? "" : hook.opening ? `- The first line is the opening the owner chose, or very close to it: "${hook.opening}"` : "- The first line opens on the hook, in as few words as it takes.",
    `- The last line is the ask, close to: "Get a free quote from ${brand}." It may name the kind of job; it adds no other claim. Never say ${brand} matches or connects anyone with a ${trade.pro}.`,
    "- Each line must fit what is visibly in its photo. Do not name colours, rooms, materials or details you cannot see.",
    length && length.copyChars > PRIMARY_MAX
      ? `- headline (at most ${HEADLINE_MAX} characters) and primaryText: the text Facebook shows around the ad. primaryText is their written words, changed the same way as the script, about as long as theirs (${length.copyChars} characters; at most ${SCRIPT_PRIMARY_MAX}), with their line breaks and emoji.`
      : `- headline (at most ${HEADLINE_MAX} characters) and primaryText (at most ${PRIMARY_MAX} characters): the text Facebook shows around the ad.`,
    ...RULES(brand, town).slice(0, 4),
    "- If these photos can't carry the hook honestly, don't force it.",
    "",
    "Return only JSON, one of:",
    explain
      ? `{"fits":true,"style":"explainer","tag":"...","title":"...","lines":[{"photo":1,"voice":"spoken line","x":50,"y":45},{"photo":3,"voice":"spoken line","label":"point in a few words",${versus ? '"skip":"the corner a no-prep quote cuts",' : ""}"mark":"check","x":40,"y":60},{"photo":2,"voice":"spoken line","label":"point in a few words","mark":"check","x":55,"y":50},{"photo":4,"voice":"spoken line","x":50,"y":50}],"headline":"<=40 chars","primaryText":"<=125 chars"}`
      : `{"fits":true,"style":"${NEW_AD_STYLE}","title":"...","lines":[{"photo":1,"before":true,"voice":"spoken line","x":60,"y":55},{"photo":2,"more":[4,6],"voice":"spoken line","label":"scene headline","x":50,"y":40}],"headline":"<=40 chars","primaryText":"<=125 chars"}`,
    '{"fits":false,"reason":"why the photos do not fit"}',
    explain
      ? "The first and last lines have no label and no mark."
      : "The first line has no label (the title is up). Leave out more where a line shows only its own photo, before unless its picture is a before, and cut (and stacked) unless the photo is two pictures in one.",
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
  lines?: Array<{ photo?: number; more?: number[]; voice?: string; label?: string; x?: number; y?: number; cut?: number[]; stacked?: boolean; before?: boolean; mark?: string; skip?: string }>;
  /** In an explainer, the few words above the title. */
  tag?: string;
  stats?: Array<{ value?: number; label?: string }>;
  revealOn?: string;
  headline?: string;
  primaryText?: string;
}

const bare = (word: string) => word.toLowerCase().replace(/[^a-z0-9']/g, "");

/** What's wrong with an animated ad Claude returned, against the photos it was offered. */
const ECHO_SKIP = new Set(["your", "with", "that", "this", "from", "they", "them", "what", "when", "have", "will", "into", "just", "more", "than", "every", "each", "here", "there", "then", "were", "does", "make", "like", "about", "also", "step"]);
const echoWords = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/'s$/, "").replace(/'/g, ""))
      .filter((w) => w.length >= 4 && !ECHO_SKIP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );

/** Words across the top that only repeat the words said under them: two or more of their words, and most of them, are said. */
export function echoes(shown: string, said: string): boolean {
  const top = echoWords(shown);
  const spoken = echoWords(said);
  const hit = [...top].filter((w) => spoken.has(w)).length;
  return hit >= 2 && hit / top.size >= 0.6;
}

/** A reel's plan with any headline that only repeats its line's words taken off: that moment shows the captions alone. */
export function withoutEchoes<P extends { style?: string; lines?: Array<{ voice?: string; label?: string }> }>(plan: P): P {
  if (plan.style === "explainer" || !plan.lines) return plan;
  const kept = plan.lines.map((l) => (l.label && l.voice && echoes(l.label, l.voice) ? { ...l, label: undefined } : l));
  // The steps left are numbered again, so taking one off never leaves a gap (Step 1, Step 3).
  let step = 0;
  return { ...plan, lines: kept.map((l) => (l.label && /^\s*step\s+\d+\s*:/i.test(l.label) ? { ...l, label: l.label.replace(/^\s*step\s+\d+\s*:/i, `Step ${++step}:`) } : l)) };
}

export function motionPlanProblems(
  plan: MotionPlan,
  photos: Array<{ tags: string[]; pairKey?: string }>,
  quick?: { town: string },
  // A competitor's script being followed: its length is ours, not the usual 20 seconds.
  follow?: { words: number; copyChars: number },
  // noEcho: a reel's title and headlines may not repeat the words said under them (motionPrompt's steps).
  opts: { noEcho?: boolean } = {},
): string[] {
  const out: string[] = [];
  const style = AD_STYLES.find((x) => x === plan.style);
  if (!style) out.push(`style "${plan.style ?? ""}" (write ${NEW_AD_STYLE})`);
  const title = plan.title?.trim() ?? "";
  const titleMax = style === "explainer" ? EXPLAINER_TITLE_MAX : TITLE_MAX;
  if (!title) out.push("no title");
  else if (title.length > titleMax) out.push(`title over ${titleMax} characters`);
  const lines = plan.lines ?? [];
  // A followed script takes a line per sentence; anything else is three to five.
  const most = follow && !quick ? (style === "explainer" ? CHECKLIST_POINTS_MAX + 2 : SCRIPT_LINES_MAX) : 5;
  if (lines.length < 3 || lines.length > most) out.push(`${lines.length} lines (write 3 to ${most})`);
  // On a reel the captions already show what is said: words across the top that only repeat them are wasted.
  // (A headline that echoes its line is dropped afterwards by withoutEchoes, not sent back.)
  if (opts.noEcho && style !== "explainer" && title && lines[0]?.voice && echoes(title, lines[0].voice))
    out.push("the title repeats the first line's words: say what the voice doesn't");
  lines.forEach((line, i) => {
    const n = line.photo;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > photos.length) out.push(`line ${i + 1} names photo ${n ?? "nothing"}`);
    if (!line.voice?.trim()) out.push(`line ${i + 1} has no voice`);
    if (line.label && line.label.trim().length > LABEL_MAX) out.push(`line ${i + 1}'s label is over ${LABEL_MAX} characters`);
    // One image tagged both before and after is the two side by side: a reel shows one half of it, never the whole.
    const own = typeof n === "number" ? photos[n - 1] : undefined;
    if (style === "reel" && own && own.tags.includes("before") && own.tags.includes("after") && !(Array.isArray(line.cut) && line.cut.length === 2))
      out.push(`line ${i + 1}'s photo is a before and an after side by side: give it a cut, the half the line is about`);
    // The other photos a reel's line shows: real ones, not its own, not twice, and never half of a before/after.
    if (style === "reel" && line.more !== undefined) {
      const more = Array.isArray(line.more) ? line.more : [];
      if (!Array.isArray(line.more) || more.some((m) => typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > photos.length)) out.push(`line ${i + 1}'s more names a photo that isn't there`);
      else {
        if (more.length > LINE_MORE_MAX) out.push(`line ${i + 1} has ${more.length} more photos (at most ${LINE_MORE_MAX})`);
        if (more.includes(n as number) || new Set(more).size !== more.length) out.push(`line ${i + 1} names a photo twice`);
        if (more.length && Array.isArray(line.cut)) out.push(`line ${i + 1} shows part of a photo, so it takes no more photos`);
        // Finished work on its own is tagged after and is welcome; a before, or half of a pair, is only shown as what it is.
        if (more.some((m) => photos[m - 1].tags.includes("before") || photos[m - 1].pairKey)) out.push(`line ${i + 1}'s more has a before, or one of a pair`);
      }
    }
  });
  const spoken = lines.map((l) => l.voice ?? "").join(" ");
  const words = spoken.split(/\s+/).filter(Boolean).length;
  if (quick) {
    // About 9 seconds: a hook that speaks to the area, the one thing done, the ask; one job's photos only.
    if (lines.length !== 3) out.push(`${lines.length} lines (a quick offer has 3)`);
    if (words < QUICK_WORDS.min || words > QUICK_WORDS.max) out.push(`${words} words of voice (a quick offer has ${QUICK_WORDS.min + 4} to ${QUICK_WORDS.max - 4})`);
    const hook = lines[0]?.voice ?? "";
    if (hook.split(/\s+/).filter(Boolean).length > 8) out.push("the first line is over 8 words (a quick offer's hook is 3 to 6)");
    if (quick.town && !hook.toLowerCase().includes(quick.town.toLowerCase())) out.push(`the first line doesn't speak to ${quick.town}`);
    const shown = [...new Set(lines.flatMap((l) => [l.photo, ...(Array.isArray(l.more) ? l.more : [])]).filter((n): n is number => typeof n === "number" && n >= 1 && n <= photos.length))];
    const one = shown.length <= 1 || (shown.length === 2 && photos[shown[0] - 1].pairKey && photos[shown[0] - 1].pairKey === photos[shown[1] - 1].pairKey);
    if (!one) out.push("a quick offer shows one job: one photo, or a before and its after");
  }
  // Following a script: about as long as theirs. Otherwise about 20 seconds at the voice's pace.
  else if (follow) {
    if (words < Math.round(follow.words * 0.75) || words > Math.round(follow.words * 1.2))
      out.push(`${words} words of voice (their script is ${follow.words}: write ${Math.round(follow.words * 0.85)} to ${Math.round(follow.words * 1.1)}, keeping every point)`);
  } else if (words < 30 || words > 62) out.push(`${words} words of voice (write 45 to 55)`);
  // No line so long the screen sits still.
  const lineMax = follow && !quick ? SCRIPT_LINE_WORDS_MAX : LINE_WORDS_MAX;
  lines.forEach((line, i) => {
    const n = (line.voice ?? "").split(/\s+/).filter(Boolean).length;
    if (n > lineMax) out.push(`line ${i + 1} is ${n} words (at most ${lineMax})`);
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
  if (style === "explainer") {
    // The opening, two or three points, then the ask: each point a labelled, marked thing to check on a photo that shows it.
    const points = lines.slice(1, -1);
    if (lines.length < 4) out.push(`${lines.length} lines (a checklist has the opening, 2 or 3 points, then the ask)`);
    points.forEach((line, k) => {
      const i = k + 2;
      if (!line.label?.trim()) out.push(`line ${i} is a point with no label`);
      if (line.mark !== "check" && line.mark !== "cross") out.push(`line ${i}'s mark is "${line.mark ?? ""}" (write check or cross)`);
      if (line.skip && line.skip.trim().length > LABEL_MAX) out.push(`line ${i}'s skip is over ${LABEL_MAX} characters`);
    });
    // Either every point says what a no-prep quote does instead, or none does: half a comparison reads as a mistake.
    const skips = points.filter((l) => l.skip?.trim()).length;
    if (skips > 0 && skips < points.length) out.push("some points have a skip and some don't (give every point one, or none)");
    [lines[0], lines[lines.length - 1]].forEach((line, k) => {
      if (line?.label?.trim() || line?.mark || line?.skip) out.push(`the ${k === 0 ? "first" : "last"} line has a label or mark (only points have them)`);
    });
    lines.forEach((line, i) => {
      const own = typeof line.photo === "number" ? photos[line.photo - 1] : undefined;
      if (own?.tags.includes("before")) out.push(`line ${i + 1}'s photo is a before (a checklist shows finished work and work under way)`);
      if (line.more?.length || line.cut) out.push(`line ${i + 1} has more photos or a cut (a checklist shows one whole photo per line)`);
    });
    const number = title.match(/\b(\d)\b/);
    if (number && Number(number[1]) !== points.length) out.push(`the title says ${number[1]} but there are ${points.length} points`);
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
  else {
    const primaryMax = follow && follow.copyChars > PRIMARY_MAX ? SCRIPT_PRIMARY_MAX : PRIMARY_MAX;
    if (plan.primaryText.trim().length > primaryMax) out.push(`primary text over ${primaryMax} characters`);
  }
  const text = [plan.tag, title, spoken, ...lines.map((l) => l.label), ...lines.map((l) => l.skip), ...(plan.stats ?? []).map((x) => x.label), plan.headline, plan.primaryText].filter(Boolean).join(" ");
  out.push(...forbiddenIn(text));
  return out;
}

/** The banned claims a piece of ad text makes, as problems ("mentions a price or discount"). */
export function forbiddenIn(text: string): string[] {
  return FORBIDDEN.filter(([re]) => re.test(text)).map(([, what]) => `mentions ${what}`);
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
      ...(part ? { from: Math.round(from), to: Math.round(to), ...(line.stacked === true ? { down: true } : {}) } : {}),
      ...(line.before === true ? { before: true } : {}),
      ...(more.length ? { more: more.map((m) => assetIds[m - 1]) } : {}),
    };
  });
  // Offered and not used by any line; never a before or half of a pair, which is only shown as what it is.
  const taken = new Set([...shots.map((x) => x.assetId), ...frames.flatMap((f) => f.more ?? [])]);
  const spare = assetIds.filter((id, i) => !taken.has(id) && offered[i] && !offered[i].pairKey && !offered[i].tags.includes("before")).slice(0, SPARE_MAX);
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
      ...(style === "explainer"
        ? {
            // Where to move in on each line's photo, and how each point is marked once said.
            frames: (plan.lines ?? []).map((line) => ({
              ...(pct(line.x) && pct(line.y) ? { x: Math.round(line.x), y: Math.round(line.y) } : {}),
              ...(line.mark === "check" || line.mark === "cross" ? { mark: line.mark } : {}),
              ...(line.skip?.trim() ? { skip: line.skip.trim().slice(0, LABEL_MAX) } : {}),
            })),
            ...(plan.tag?.trim() ? { tag: plan.tag.trim().slice(0, 30) } : {}),
          }
        : {}),
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
/**
 * Which of a reel's lines show a before: marked as one by the writer, on a photo tagged before and not after,
 * or the first of two different parts shown of one photo (the before is always shown first).
 */
export function beforeLines(shots: Array<{ assetId: string }>, frames: Design["frames"], tagsOf: (assetId: string) => string[]): boolean[] {
  const partOf = (i: number) => {
    const f = frames?.[i] ?? {};
    return f.from === undefined ? "" : `${f.down ? "d" : ""}${f.from}-${f.to}`;
  };
  return shots.map((x, i) => {
    const f = frames?.[i] ?? {};
    const tags = tagsOf(x.assetId);
    const firstOfTwo =
      partOf(i) !== "" && !shots.slice(0, i).some((y) => y.assetId === x.assetId) && shots.some((y, j) => j > i && y.assetId === x.assetId && partOf(j) !== "" && partOf(j) !== partOf(i));
    return f.before === true || (tags.includes("before") && !tags.includes("after")) || firstOfTwo;
  });
}

/**
 * The before and the after of one job that a reel shows, for a still of the same ad: the first line on a before,
 * and the first line after it on finished work from the same photo or the same tagged pair. Never two jobs side by side.
 */
export function stillPairOf(
  shots: Array<{ assetId: string }>,
  frames: Design["frames"],
  assets: Map<string, { tags: string[]; pairKey?: string }>,
): { before: number; after: number } | null {
  const tagsOf = (id: string) => assets.get(id)?.tags ?? [];
  const before = beforeLines(shots, frames, tagsOf);
  const b = before.indexOf(true);
  if (b < 0) return null;
  const from = shots[b].assetId;
  const key = assets.get(from)?.pairKey;
  const a = shots.findIndex((x, j) => j > b && !before[j] && (x.assetId === from || (key !== undefined && assets.get(x.assetId)?.pairKey === key)));
  return a < 0 ? null : { before: b, after: a };
}

export function renderProps(input: Parameters<typeof drawnFrom>[0]) {
  const props = drawnFrom(input);
  // An on-camera creator's take: stood in front of the photos, its own sound the voice (audioUrl is the same file).
  return input.presenterUrl ? { ...props, presenter: { src: input.presenterUrl } } : props;
}

function drawnFrom(input: {
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
  /** An on-camera creator's take, keyed and stood in front of the photos. */
  presenterUrl?: string;
}) {
  const { design, script } = input;
  if (design.style === "footage") {
    // The clip is the picture and its sound the voice: the audio is the clip itself.
    return {
      ratio: input.ratio,
      style: { kind: "footage" },
      brand: input.brand,
      headline: design.title,
      lines: (script.shots ?? []).map((x) => ({ voice: x.voice, start: x.start ?? 0, end: x.end ?? 0, ...(x.words ? { words: x.words } : {}) })),
      // The clip's own sound is the voice, unless it is a song: then the clip plays silent under our music.
      audio: design.muteClip ? "" : input.audioUrl,
      audioSec: input.audioSec,
      photos: [] as Array<{ src: string }>,
      footage: { src: input.audioUrl },
      // Drawn with Tesseract instead of Remotion (ads-video/scripts/tesseract.mjs).
      ...(design.engine === "tesseract" ? { engine: "tesseract" as const } : {}),
      // Nobody talks in it: the music plays low under the job site's own sound, as work-footage ads run.
      ...(input.music && !(script.shots ?? []).length
        ? { sound: { music: input.music.url, ...(input.music.from ? { musicFrom: input.music.from } : {}), ...(input.music.beats?.length ? { beats: input.music.beats } : {}) } }
        : {}),
    };
  }
  const shots = script.shots ?? [];
  const perLine = shots.map((x) => input.photos.get(x.assetId));
  if (shots.length === 0 || perLine.some((p) => !p)) throw new Error("A line's photo is missing from the library");
  const lines = shots.map((x) => ({
    voice: x.voice,
    start: x.start ?? 0,
    end: x.end ?? 0,
    ...((design.style === "lightUp" || design.style === "reel" || design.style === "explainer") && x.onScreen ? { label: x.onScreen } : {}),
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
  if (design.style === "explainer") {
    // One whole photo per line, moved in on where the line is about; each point ticked or crossed once said.
    return {
      ratio: input.ratio,
      style: { kind: "explainer", ...(design.tag ? { tag: design.tag } : {}), ...(design.look ? { look: design.look } : {}) },
      brand: input.brand,
      headline: design.title,
      lines: lines.map((line, i) => {
        const mark = design.frames?.[i]?.mark;
        const skip = design.frames?.[i]?.skip;
        return mark && "label" in line ? { ...line, mark, ...(skip ? { skip } : {}) } : line;
      }),
      audio: input.audioUrl,
      audioSec: input.audioSec,
      photos: shots.map((x, i) => {
        const f = design.frames?.[i] ?? {};
        return { src: perLine[i]!.url, ...(f.x !== undefined && f.y !== undefined ? { focus: [{ x: f.x, y: f.y }] } : {}) };
      }),
      sound: {
        ...(input.music
          ? { music: input.music.url, ...(input.music.from ? { musicFrom: input.music.from } : {}), ...(input.music.beats?.length ? { beats: input.music.beats } : {}) }
          : {}),
        land: REEL_SOUNDS.land,
        ask: REEL_SOUNDS.ask,
      },
    };
  }
  if (design.style === "reel") {
    // Each line's photo with where to move in on it, and the part of it to show when it is two pictures in one.
    // The part of a photo a line shows, as one word, to tell two lines on the same photo apart.
    const befores = beforeLines(shots, design.frames, (id) => input.photos.get(id)?.tags ?? []);
    const own = shots.map((x, i) => {
      const f = design.frames?.[i] ?? {};
      const before = befores[i];
      return {
        src: perLine[i]!.url,
        ...(before ? { before: true } : {}),
        ...(f.x !== undefined && f.y !== undefined ? { focus: [{ x: f.x, y: f.y }] } : {}),
        ...(f.from !== undefined && f.to !== undefined ? { crop: { from: f.from, to: f.to, ...(f.down ? { down: true } : {}) } } : {}),
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

/**
 * A still of a reel: its before above or beside its after, under the reel's title, with the headline of the line
 * where the after shows beneath it. Null when the reel shows no before and after of one job.
 */
export function stillProps(reel: ReturnType<typeof renderProps>, pair: { before: number; after: number } | null) {
  if (!pair || !reel.photos[pair.before] || !reel.photos[pair.after]) return null;
  const strip = ({ focus, crop, src }: { src: string; focus?: unknown; crop?: unknown }) => ({ src, ...(focus ? { focus } : {}), ...(crop ? { crop } : {}) });
  return {
    ratio: "4x5" as const,
    brand: reel.brand,
    headline: reel.headline,
    sub: ("label" in reel.lines[pair.after] ? (reel.lines[pair.after] as { label?: string }).label : undefined) ?? "",
    pair: [strip(reel.photos[pair.before] as never), strip(reel.photos[pair.after] as never)],
  };
}

// ------------------------------------------------------------ Static image ads, made one at a time

export type ImageLayout = "single" | "pair" | "grid";
export interface ImageAdType {
  key: string;
  label: string;
  /** One line for the owner on what this type is. */
  blurb: string;
  layout: ImageLayout;
  family: Family;
  /** What the writer is told this ad is. */
  brief: string;
}

/** The static image ads the owner can ask for, one at a time (Ops → Ads → Create an ad). */
export const IMAGE_AD_TYPES: ImageAdType[] = [
  {
    key: "photo",
    label: "Finished photo",
    blurb: "One of your best finished photos with a headline and a Get a free quote button.",
    layout: "single",
    family: "proof",
    brief: "One finished photo carries the ad. The headline says plainly what the homeowner is looking at and would want for their own home.",
  },
  {
    key: "before_after",
    label: "Before and after",
    blurb: "A before next to its own after, from the same project.",
    layout: "pair",
    family: "before_after",
    brief: "A before and its own after, shown together and marked Before and After. The headline names the change you can see between them.",
  },
  {
    key: "showcase",
    label: "Showcase",
    blurb: "Three or four finished jobs of one kind, from different projects, in one image.",
    layout: "grid",
    family: "proof",
    brief: "Several finished jobs of one kind, each from a different home, shown together. The headline names the kind of work in the plural; never as if they were one home.",
  },
  {
    key: "offer",
    label: "Offer",
    blurb: "Straight to the point: what you do, where, and a free quote.",
    layout: "single",
    family: "objection",
    brief: "A direct offer over one finished photo: the headline names the service and the town, and the line under it is the free quote. No story.",
  },
  {
    key: "seasonal",
    label: "Seasonal offer",
    blurb: "The same offer tied to the time of year. Free quote only, no prices or deadlines.",
    layout: "single",
    family: "seasonal",
    brief: "A direct offer tied to the time of year, over one finished photo that suits it. Name the season or the occasion plainly (guests coming for the holidays, spring, before summer heat). Never a deadline, a date, a price or a discount.",
  },
];

export const imageAdType = (key: string): ImageAdType | undefined => IMAGE_AD_TYPES.find((t) => t.key === key);

export const IMAGE_HEADLINE_MAX = 44;
export const IMAGE_SUB_MAX = 70;
export const IMAGE_PRIMARY_MAX = 300;
export const IMAGE_MARK = "You write one static image ad";

export interface ImageCandidate {
  n: number;
  tags: string[];
  description: string;
  uses: number;
  best?: boolean;
  project?: string;
  /** For a pair: what its before shows. */
  before?: string;
}

/** The brief for one static image ad: its type, the competitor ad to model (if any), and the photos to choose from. */
export function imageAdPrompt(
  type: ImageAdType,
  brand: string,
  town: string,
  trade: AdTrade,
  candidates: ImageCandidate[],
  basedOn?: { company: string; angle: string; offer: string; daysRunning?: number; words?: string },
  now = new Date(),
  // Headlines of the ads made just before this one in the same go: this one takes a different angle and photos.
  avoid: string[] = [],
): string {
  const month = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const want = type.layout === "pair" ? "one pair" : type.layout === "grid" ? "three or four photos, each from a different project" : "one photo";
  return [
    `${IMAGE_MARK} for Facebook and Instagram, for ${brand}, a ${trade.contractor} in ${town}, Texas. It is a single picture: nothing moves and nothing is said aloud.`,
    `Type: ${type.label}. ${type.brief}`,
    type.key === "seasonal" ? `It is ${month} now.` : "",
    "",
    ...(basedOn
      ? [
          `Model it on a competitor's ad${basedOn.daysRunning ? ` that has been running for ${basedOn.daysRunning} days` : ""}: keep its angle and the feel of its headline, in our own honest words.`,
          `- Its angle (${basedOn.company}): ${basedOn.angle}`,
          `- Its offer: ${basedOn.offer}. Ours is only ever a free quote from ${brand}.`,
          basedOn.words ? `- Its words: ${basedOn.words.replace(/\s+/g, " ").slice(0, 600)}` : "",
          "",
        ]
      : []),
    type.layout === "pair"
      ? "The before-and-after pairs on file (each is one project; BEST marks the owner's favourites; uses is how many ads it is already in):"
      : "The finished photos on file (BEST marks the owner's favourites; uses is how many ads a photo is already in):",
    ...candidates.map((c) =>
      type.layout === "pair"
        ? `${c.n}. ${c.best ? "BEST · " : ""}uses ${c.uses} · before: ${(c.before ?? "").replace(/\s+/g, " ").slice(0, 160)} · after: ${c.description.replace(/\s+/g, " ").slice(0, 160)}`
        : `${c.n}. ${c.best ? "BEST · " : ""}${c.tags.join(", ")}${c.project ? ` · project ${c.project}` : ""} · uses ${c.uses}: ${c.description.replace(/\s+/g, " ").slice(0, 200)}`,
    ),
    "",
    `Choose ${want} that best carries this ad. Prefer BEST ones and ones in fewer ads. The words must be true of what the chosen ${type.layout === "single" ? "photo shows" : "photos show"}: name only what its description says.`,
    type.layout === "grid" ? "Every word of the headline and the line under it must be true of every photo chosen, not most of them: if one has no island, don't say islands." : "",
    ...(avoid.length ? [`Already made in this set, so take a different angle and different photos from these: ${avoid.map((h) => `"${h}"`).join(", ")}.`] : []),
    "Rules:",
    ...RULES(brand, town),
    `- headline: the words printed large on the image, at most ${IMAGE_HEADLINE_MAX} characters, plain and specific. No full stop needed.`,
    `- sub: one short line under it, at most ${IMAGE_SUB_MAX} characters.`,
    `- primaryText: the text above the image in the feed, one to three plain sentences, at most ${IMAGE_PRIMARY_MAX} characters, ending on the free quote from ${brand}. No emoji, no lists.`,
    "- title: the short link headline under the image, at most 40 characters.",
    "",
    "Return only JSON. Start your answer with { and write nothing before or after it.",
    type.layout === "pair"
      ? '{"pair":2,"headline":"...","sub":"...","primaryText":"...","title":"..."}'
      : type.layout === "grid"
        ? '{"photos":[3,7,12],"headline":"...","sub":"...","primaryText":"...","title":"..."}'
        : '{"photo":3,"headline":"...","sub":"...","primaryText":"...","title":"..."}',
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

export interface ImageAdPlan {
  picks: number[];
  headline: string;
  sub: string;
  primaryText: string;
  title: string;
}

/** Claude's reply as an image ad; null when it can't be read. */
export function readImageAd(reply: string): ImageAdPlan | null {
  const out = parseJson<Record<string, unknown>>(reply);
  if (!out) return null;
  const nums = (Array.isArray(out.photos) ? out.photos : [out.pair ?? out.photo]).map(Number).filter((n) => Number.isInteger(n) && n >= 1);
  const text = (x: unknown) => wholeText(String(x ?? "").replace(/\s+/g, " ").trim());
  return { picks: [...new Set(nums)], headline: text(out.headline), sub: text(out.sub), primaryText: text(out.primaryText), title: text(out.title) };
}

/** What is wrong with an image ad's plan, in words Claude can act on. Empty when it can be made. */
export function imageAdProblems(plan: ImageAdPlan | null, type: ImageAdType, candidates: ImageCandidate[]): string[] {
  if (!plan) return ["the reply wasn't JSON"];
  const out: string[] = [];
  const known = plan.picks.filter((n) => n <= candidates.length);
  if (known.length !== plan.picks.length) out.push("a photo number that wasn't offered");
  if (type.layout === "grid") {
    if (known.length < 3 || known.length > 4) out.push("a showcase needs three or four photos");
    const projects = known.map((n) => candidates[n - 1].project).filter(Boolean);
    if (new Set(projects).size !== projects.length) out.push("two photos from the same project: a showcase takes one from each");
  } else if (known.length !== 1) out.push(type.layout === "pair" ? "choose exactly one pair" : "choose exactly one photo");
  if (!plan.headline) out.push("no headline");
  if (plan.headline.length > IMAGE_HEADLINE_MAX) out.push(`the headline is ${plan.headline.length} characters (at most ${IMAGE_HEADLINE_MAX})`);
  if (plan.sub.length > IMAGE_SUB_MAX) out.push(`the sub line is ${plan.sub.length} characters (at most ${IMAGE_SUB_MAX})`);
  if (!plan.primaryText) out.push("no primaryText");
  if (plan.primaryText.length > IMAGE_PRIMARY_MAX) out.push(`primaryText is ${plan.primaryText.length} characters (at most ${IMAGE_PRIMARY_MAX})`);
  out.push(...forbiddenIn([plan.headline, plan.sub, plan.primaryText, plan.title].join(" ")));
  return out;
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
  /** ISO date the ad stopped, when it has. */
  endedAt?: string;
  /** Days it has run: to today while running, to its last day once stopped. */
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

/**
 * The actor's input for one keyword: US ads that started at least minDays ago. Active ones by default; "inactive" to
 * find the ones that have stopped since (only used to mark ads already in the table).
 */
export function apifyInput(keyword: string, minDays: number, now = new Date(), maxItems = 200, status: "active" | "inactive" = "active") {
  const maxDate = new Date(now.getTime() - minDays * 86_400_000).toISOString().slice(0, 10);
  return { query: keyword, country: "US", activeStatus: status, mediaType: "all", sortBy: "mostRecent", maxDate, maxItems };
}

type Loose = Record<string, unknown>;
const obj = (x: unknown): Loose => (x && typeof x === "object" ? (x as Loose) : {});
const first = (o: Loose, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
/** Text without half an emoji: a surrogate left alone (from a cut) makes the database turn the whole row away. */
export const wholeText = (s: string): string => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
/** The first `n` characters, never cutting an emoji in two. */
export const cutText = (s: string, n: number): string => wholeText(Array.from(s).slice(0, n).join(""));
const str = (x: unknown): string | undefined =>
  typeof x === "string" && wholeText(x).trim() ? wholeText(x).trim() : typeof x === "number" ? String(x) : undefined;

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
  const stillOn = typeof active === "boolean" ? active : end === undefined || end === null;
  const ended = stillOn ? null : startDate(end);
  const lastDay = ended && ended.getTime() < now.getTime() ? ended : now;
  const variants = Number(first(o, "collation_count", "collationCount") ?? 1);
  const platforms = first(o, "publisher_platform", "publisherPlatform", "publisher_platforms", "publisherPlatforms");
  return {
    metaAdId,
    pageId: str(first(o, "page_id", "pageID", "pageId")),
    pageName: str(first(o, "page_name", "pageName")) ?? str(first(snap, "page_name", "pageName")) ?? "Unknown page",
    pageLikes: Number(first(snap, "page_like_count", "pageLikeCount")) || undefined,
    startedAt: started.toISOString().slice(0, 10),
    endedAt: ended ? ended.toISOString().slice(0, 10) : undefined,
    daysRunning: Math.max(0, Math.floor((lastDay.getTime() - started.getTime()) / 86_400_000)),
    active: stillOn,
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

/** How the question each competitor ad is read with begins, whatever the trade. */
export const TAG_MARK = "Is this an ad for a residential";

/** What counts as an ad for each trade, and what does not. */
const TAG_SCOPE: Record<string, string> = {
  painting: "(house painting, cabinets, interior or exterior)? Painting classes, art, cars, commercial-only or unrelated ads are not.",
  "outdoor-construction":
    "(patios, pavers, walkways, driveways, retaining walls, artificial turf, outdoor kitchens, fire pits, backyard makeovers)? Lawn mowing, tree care, pools alone, commercial-only or unrelated ads are not.",
  "bathroom-remodeling":
    "(walk-in showers, tub-to-shower conversions, tub or shower replacements, bathroom remodels)? Plumbing repairs alone, bath products, commercial-only or unrelated ads are not.",
};

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
  trade: AdTrade = AD_TRADES.painting,
): string {
  return [
    `You read a competitor's Facebook ad, for a local ${trade.contractor} like ours.`,
    `Advertiser: ${ad.pageName}${ad.daysRunning ? ` · running ${ad.daysRunning} days` : ""}${ad.mediaType ? ` · ${ad.mediaType}` : ""}`,
    ad.title ? `Headline: ${ad.title}` : "",
    `Copy: ${(ad.adCopy ?? "").slice(0, 1500) || "(none)"}`,
    ad.transcript ? `Spoken: ${ad.transcript.slice(0, 1500)}` : "",
    ad.cta ? `Button: ${ad.cta}` : "",
    ad.landing ? `Landing page: ${ad.landing}` : "",
    "",
    `${TAG_MARK} ${trade.label.toLowerCase()} service ${TAG_SCOPE[trade.slug] ?? "(for homeowners)? Commercial-only or unrelated ads are not."}`,
    "Answer only JSON:",
    "{",
    '  "painting": true|false (true when it is one),',
    `  "paintingType": ${[...trade.scopes.map((x) => `"${trade.scopeLabels[x] ?? x}"`), `"General ${trade.label.toLowerCase()}"`].join("|")},`,
    `  "scope": ${trade.scopes.map((x) => `"${x}"`).join("|")}|null,`,
    '  "hook": "the angle in 3 to 6 words",',
    `  "family": ${Object.keys(FAMILY_LABELS)
      .map((f) => `"${f}"`)
      .join("|")},`,
    '  "offer": "what they offer, in one line",',
    '  "creative": "what the visual is, in one line",',
    `  "area": "the market the ad names, or empty" (the owner's markets are ${markets.join(", ")}),`,
    '  "cta": "the button text",',
    `  "adaptation": "one sentence: how a ${markets[0] ?? "local"} ${trade.contractor} could use this angle honestly",`,
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
export function readSwipeTags(reply: string, trade: AdTrade = AD_TRADES.painting): SwipeTags | null {
  const out = parseJson<Partial<SwipeTags>>(reply);
  if (!out || typeof out.painting !== "boolean") return null;
  const family = (Object.keys(FAMILY_LABELS) as Family[]).includes(out.family as Family) ? (out.family as Family) : "proof";
  const scope = trade.scopes.includes(String(out.scope)) ? (out.scope as Scope) : undefined;
  const clean = (x: unknown, max = 200) =>
    String(x ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  return {
    painting: out.painting,
    paintingType: clean(out.paintingType, 40) || `General ${trade.label.toLowerCase()}`,
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
      `${i + 1}. ${x.company}${x.daysRunning ? ` · ${x.daysRunning} days` : ""}`,
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
    `You advise a painting contractor in ${markets[0] ?? "Midland"}, Texas. It runs short video ads on Facebook and Instagram, cut from its own photo and clip library, in the "${scope}" category.`,
    `Below are competitor ads in this category from painting companies across the US that have been running for months (longevity is the only public signal; it hints that the ad pays for itself).`,
    "",
    ...lines,
    "",
    `The owner's library, by tag: ${tags || "empty"}.`,
    "",
    `${PLAYBOOK_MARK}, in plain language a business owner reads in a minute. Describe offers generically (a free quote, a consultation), never a competitor's price, discount, warranty, deadline or named person. Answer only JSON:`,
    "{",
    '  "text": "at most 1,200 characters: the dominant angles with counts, how the long-runners open, the offers they lean on (generic), the footage they rely on, typical length, and what few of them are doing",',
    `  "footagePrefs": [the library tags the winners rely on most, in order, from: ${ASSET_TAGS.join(", ")}],`,
    `  "angleFamilies": [the concept families that dominate, in order, from: ${Object.keys(FAMILY_LABELS).join(", ")}],`,
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
  `- The only offer is a free quote from ${brand}, which speaks as the ${trade.contractor} ("we"). Never say it matches or connects homeowners with anyone. Never call the crew vetted, screened, top-rated or the best: nothing is said about it that the owner hasn't written down.`,
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
    `${IDEA_MARK} on Facebook and Instagram for ${brand}, a ${trade.contractor} in ${town}, Texas.`,
    writer.brief,
    "",
    "Competitor ads that have kept running, longest first. An ad that keeps running is the best sign an idea pays for itself. Every idea is built on one of them: keep what makes it work (its angle, its kind of opening, the order of its points) and make it honest for us:",
    ...(sources.length ? sources.map((s) => `${s.n}. ${s.company}${s.daysRunning ? `, running ${s.daysRunning} days` : ""}. Angle: ${s.angle}. Offer: ${s.offer}`) : ["(none on file)"]),
    "",
    "The job photos on file to make ads from (BEST marks the owner's favourite shots; the count is how many ads a photo is already in):",
    ...(library.length ? library.map((l) => `- ${l}`) : ["(none described yet)"]),
    "Describe the kind of shot an idea needs (a finished white kitchen, a door being sprayed), not one particular photo or project: the app rotates through the projects and leads with the BEST shots, so an idea tied to one kitchen would put that kitchen in every ad. Never build ideas around a photo that is already in several ads.",
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
    "- from: the number of the competitor ad it builds on. Required.",
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
    // Every idea stands on a competitor ad that has kept running; one that names none is the writer's own and isn't kept.
    if (sources.length > 0 && out[out.length - 1].from === undefined) out.pop();
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
    `${PICK_MARK} for ${brand}, a ${trade.contractor} in ${town}, Texas. Writers have offered the ad ideas below. Pick the ${want} to put in front of the owner.`,
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
    `${TASTE_MARK} for a local contractor and kept some and killed others. Write a short note for the writers on this owner's taste.`,
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

// ── "Make an ad for…" ────────────────────────────────────────────────────────

/** What one "make an ad for…" line was read as. */
export interface RequestRead {
  trade: string;
  /** A kind of job of that trade (AdTrade.scopes), or ANY_SCOPE when the line names none. */
  scope: string;
  /** The town the line names, if any. */
  town?: string;
  /** What the ad is about, in one plain sentence. */
  idea: string;
  /** The job the line asks the ad to be made from: its place in the list of jobs the reader was shown. */
  job?: number;
}

/** The question that turns the owner's one line ("cabinet painting in Odessa") into a trade, a kind of job and a town. */
export function requestPrompt(ask: string, brand: string, markets: string[], trades: AdTrade[], jobs: string[] = []): string {
  return [
    `${brand} is a home-improvement company${markets.length ? ` serving ${markets.join(", ")}, Texas` : ""}. Its owner typed this request for a Facebook ad:`,
    "",
    `"${ask.replace(/\s+/g, " ").trim()}"`,
    "",
    "Which trade is it, and which kind of job? The trades and their kinds of job:",
    ...trades.map((t) => `- ${t.slug} (${t.label}): ${t.scopes.map((s) => `${s} (${t.scopeLabels[s] ?? s})`).join(", ")}`),
    ...(jobs.length
      ? ["", "The jobs whose photos are on file, by the owner's own names for them:", ...jobs.map((j, i) => `${i + 1}. ${j.replace(/\s+/g, " ").slice(0, 80)}`)]
      : []),
    "",
    ...(jobs.length ? ["", "Those job names are the owner's own and private: never put one in the idea."] : []),
    'Answer with JSON only: {"trade": the trade\'s slug, or null if it is none of these, "scope": the kind of job, or null if the line names none, "town": the town it names, or null, "idea": one plain sentence saying what the ad offers, as the owner would say it, with no prices, discounts or promises' +
      (jobs.length ? ', "job": the number of the job the request asks the ad to be made from, or null if it names none of them}.' : "}."),
  ].join("\n");
}

/**
 * The idea with the owner's job names taken out: they are private and can say where a job was, and the idea goes to
 * the writer and the page. A phrase like ", as we did in the Smith kitchen job" is dropped; null when a name is
 * still left in it after that, so the caller uses a plain idea instead.
 */
export function withoutJobNames(text: string, names: string[]): string | null {
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = text;
  for (const name of names) {
    const words = name.trim().split(/\s+/).filter(Boolean).map(esc).join("\\s+");
    if (name.trim().length < 3) continue;
    const named = `(?:the\\s+|our\\s+)?${words}(?:\\s+(?:job|project))?`;
    out = out.replace(new RegExp(`,?\\s*(?:just\\s+)?(?:as|like)\\s+(?:we\\s+did\\s+)?(?:(?:in|on|for|at|with)\\s+)?${named}`, "gi"), "");
    if (new RegExp(`\\b${words}\\b`, "i").test(out)) return null;
  }
  return out.replace(/\s+([.,!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/** The reply to requestPrompt, checked against the trades on offer; null when it names none of them. */
export function readRequestReply(reply: string, trades: AdTrade[], jobCount = 0): RequestRead | null {
  const out = parseJson<{ trade?: unknown; scope?: unknown; town?: unknown; idea?: unknown; job?: unknown }>(reply);
  const trade = trades.find((t) => t.slug === out?.trade);
  if (!out || !trade) return null;
  const scope = typeof out.scope === "string" && trade.scopes.includes(out.scope) ? out.scope : ANY_SCOPE;
  const town = typeof out.town === "string" && out.town.trim() ? out.town.trim().slice(0, 60) : undefined;
  const idea = typeof out.idea === "string" && out.idea.trim() ? out.idea.trim().slice(0, 220) : undefined;
  // The job named, as its place in the list the reader was given (from 0).
  const job = typeof out.job === "number" && Number.isInteger(out.job) && out.job >= 1 && out.job <= jobCount ? out.job - 1 : undefined;
  return idea ? { trade: trade.slug, scope, ...(town ? { town } : {}), idea, ...(job !== undefined ? { job } : {}) } : null;
}

/**
 * The competitor ads a request is built on: one for the story and another for the lesson, each with a real script
 * when there is one, from the same kind of job first. The lesson prefers an ad Claude read as teaching
 * (family "education"); either may be missing when too few are on file.
 */
/** How many of the best competitor ads for a kind of job take turns, so requests aren't all built on the same one. */
export const REQUEST_ROTATION = 3;

export function pickRequestSwipes<
  S extends Scored & { scope?: string; transcript?: string; adCopy?: string; family?: string; company: string; importedAt: string; lastUsedAt?: string },
>(swipes: S[], scope: string): { story?: S; lesson?: S } {
  const ranked = pickExamples(swipes, scope, swipes.length).filter((x) => !x.scope || x.scope === scope || scope === ANY_SCOPE);
  // Ads with a script to follow first, so ours can be written at their full length; then the rest, by angle only.
  const scripted = ranked.filter((x) => scriptLength(x) !== undefined);
  const pool = [...scripted, ...ranked.filter((x) => !scripted.includes(x))];
  // Of the best few that fit, the one used longest ago (never used first); the best of those when they tie.
  const turn = (fits: S[]) =>
    fits.slice(0, REQUEST_ROTATION).reduce<S | undefined>((best, x) => (!best || (x.lastUsedAt ?? "") < (best.lastUsedAt ?? "") ? x : best), undefined);
  // Turns are taken among ads with a script when there are any, so a script is never passed over for a headline.
  const among = (fits: S[]) => turn(fits.filter((x) => scripted.includes(x)).length ? fits.filter((x) => scripted.includes(x)) : fits);
  const story = among(pool.filter((x) => x.family !== "education")) ?? pool[0];
  const rest = pool.filter((x) => x !== story);
  const lesson = among(rest.filter((x) => x.family === "education")) ?? rest.find((x) => x.company !== story?.company) ?? rest[0];
  return { story, lesson };
}

/** Where a "make an ad for…" request stands, for its page. */
export type RequestStage = "reading" | "writing" | "voicing" | "drawing" | "ready" | "failed";
export const REQUEST_STAGES: RequestStage[] = ["reading", "writing", "voicing", "drawing", "ready"];

/**
 * The stage from the request, its batch and its ads: still being read; written while the batch has no word of
 * what it passed over yet; then voiced, drawn, and ready once every ad has a file or has stopped.
 */
export function requestStage(
  request: { status: "reading" | "made" | "failed" },
  batch: { status: string; skipped?: string[] } | null,
  ads: Array<{ status: string }>,
): RequestStage {
  if (request.status === "failed" || batch?.status === "failed") return "failed";
  if (request.status === "reading") return "reading";
  if (!batch || batch.skipped === undefined) return "writing";
  if (ads.some((c) => c.status === "draft")) return "voicing";
  if (ads.some((c) => c.status === "voiced" || c.status === "rendering")) return "drawing";
  return ads.length ? "ready" : "writing";
}

/** The question that matches befores with afters: which show the same spot. sameJob: all from one job. */
export function pairingPrompt(befores: number, afters: number, sameJob = false): string {
  return [
    sameJob
      ? `These photos are all from one painting or remodelling job. The first ${befores} are befores, the next ${afters} are afters, each labelled.`
      : `These photos are of the same kind of painting or remodelling work, from one or more jobs at different houses. The first ${befores} are befores, the next ${afters} are afters, each labelled.`,
    "Which before and which after show the same spot (the same room, wall, door or cabinets, from a similar view), so they could be shown as a before and its after?",
    ...(sameJob ? [] : ["Only pair two of the same house and the same spot: look at the windows, floor, walls, fixtures and what's around it. Two houses that merely look alike are not a pair."]),
    "Pair only the ones you are sure of; a photo is in one pair at most, and leave out any with no match.",
    'Answer with JSON only: {"pairs":[{"before":1,"after":2}]}, or {"pairs":[]} if none match.',
  ].join("\n");
}

/** The reply to pairingPrompt as [before, after] indexes from 0; each photo once; null when the reply isn't JSON. */
export function readPairing(reply: string, befores: number, afters: number): Array<[number, number]> | null {
  const out = parseJson<{ pairs?: Array<{ before?: unknown; after?: unknown }> }>(reply);
  if (!out || !Array.isArray(out.pairs)) return null;
  const usedB = new Set<number>();
  const usedA = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (const p of out.pairs) {
    const b = Number(p?.before) - 1;
    const a = Number(p?.after) - 1;
    if (!Number.isInteger(b) || !Number.isInteger(a) || b < 0 || a < 0 || b >= befores || a >= afters || usedB.has(b) || usedA.has(a)) continue;
    usedB.add(b);
    usedA.add(a);
    pairs.push([b, a]);
  }
  return pairs;
}

/** Claude's labels for a photo, kept to the trade's list, each once, in the list's order. */
export function cleanItems(items: unknown, trade: AdTrade): string[] {
  const asked = new Set((Array.isArray(items) ? items : []).map((i) => String(i).toLowerCase().trim()));
  return trade.items.filter((i) => asked.has(i));
}

/**
 * The labels an idea's words name ("front door painting" names front door, not doors too): the longest first, each
 * taking its words so a shorter label can't match them again. Plurals match either way.
 */
export function itemsIn(text: string, trade: AdTrade): string[] {
  let words = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const found: string[] = [];
  for (const item of [...trade.items].sort((a, b) => b.length - a.length)) {
    const parts = item.replace(/[^a-z0-9]+/g, " ").trim().split(" ").map((w) => w.replace(/s$/, ""));
    const re = new RegExp(` ${parts.join("s? ")}s? `);
    if (re.test(words)) {
      found.push(item);
      words = words.replace(re, " ");
    }
  }
  return found;
}
