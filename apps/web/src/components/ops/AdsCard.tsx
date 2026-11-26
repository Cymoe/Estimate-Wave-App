import { createPortal } from 'react-dom';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Film, Play, Star, Trash2, Upload } from 'lucide-react';
import { adsAPI } from '../../lib/api';
import { useAdDrive, useAdJobs } from '../../lib/live';
import { backfillThumb, isVideo, prepareAsset, putFile, sendPreparedAsset, stillOfClip, thumbOf, tooBig, type PreparedAsset } from '../../lib/adUpload';
import {
  useAdsBatches,
  useAdsHooks,
  useAdsIdeas,
  useAdsLibrary,
  useAdsLive,
  useAdsPlaybooks,
  useAdsResearchRuns,
  useAdsSettings,
  useAdsSwipes,
} from '../../lib/live';
import { AD_TRADES, DEFAULT_TRADE, familyOfAngle, mergeSwipeCsvs, tradeOf } from '../../../convex/lib/ads';
import { ACTOR_VOICES, ACTOR_VOICE_LABELS } from '../../../convex/lib/voiceActors';
import { money } from '../market/wallet';
import { Dialog, ErrorLine, Field, ago, describeError, input, primary, secondary, tap, usePanel } from './ui';

/**
 * Ops → Ads: the week's drafted ads to approve, the live ones with what
 * they cost and brought in, the photo and clip library the ads are cut
 * from, the hooks they open with, the competitor ads kept for inspiration,
 * and the Meta account they go to.
 */

type Section = 'week' | 'live' | 'library' | 'hooks' | 'swipes' | 'settings';
const SECTIONS: Array<[Section, string]> = [
  ['week', 'This week'],
  ['live', 'Live'],
  ['library', 'Library'],
  ['hooks', 'Hooks'],
  ['swipes', 'Competitors'],
  ['settings', 'Settings'],
];

/**
 * The trade the page is working in. Homeowners see one brand for every trade; the photos, competitor ads, ideas
 * and finished ads on this page are one trade's at a time.
 */
const TradeContext = createContext<string>(DEFAULT_TRADE);
const useTrade = () => useContext(TradeContext);
/** What a photo or a hook of a trade can be about: its own subjects, then the crew and the work in progress. */
const scopesFor = (trade: string) => [...tradeOf(trade).scopes, 'crew', 'process'];
/** The trade's types of work (stained cabinets, fence stain...), as tags, in its own order. */
const worksFor = (trade: string) => Object.keys(tradeOf(trade).works ?? {});
const workLabel = (trade: string, w: string) => tradeOf(trade).works?.[w]?.label ?? w;
const TRADE_KEY = 'ads.trade';
function rememberedTrade(): string {
  try {
    const saved = window.localStorage.getItem(TRADE_KEY);
    return saved && AD_TRADES[saved] ? saved : DEFAULT_TRADE;
  } catch {
    return DEFAULT_TRADE;
  }
}
/** The room or subject a hook (or footage) is about, in the owner's words. */
const SCOPE_LABELS: Record<string, string> = {
  ...Object.assign({}, ...Object.values(AD_TRADES).map((t) => t.scopeLabels)),
  crew: 'The crew',
  process: 'The work in progress',
  general: 'all painting',
};
const scopeLabel = (s: string) => SCOPE_LABELS[s] ?? s;
/** How a competitor's ad starts, in plain words. */
const OPENING_LABELS: Record<string, string> = {
  question: 'a question',
  owner: 'the owner talking',
  claim: 'a bold claim',
  before_after: 'a before/after',
  offer: 'the offer',
  other: 'something else',
};
const FAMILIES: Array<[string, string]> = [
  ['owner_story', 'Owner story'],
  ['before_after', 'Before / after'],
  ['proof', 'Trust and proof'],
  ['education', 'Cost education'],
  ['objection', 'Respect for your home'],
  ['seasonal', 'Season and timing'],
];

/** What ads were made of before every ad was drawn as an animated video; old ones still show as what they are. */
export type AdKind = 'video' | 'image' | 'graphic';
const KIND_LABELS: Record<AdKind, string> = { video: 'Video', image: 'Image', graphic: 'Animated graphic' };

export interface AdCreative {
  id: string;
  batchId: string;
  name: string;
  /** The shot list: which file is on screen, the line spoken over it, its on-screen words, and when the line runs. */
  shots?: Array<{ fileName: string; voice: string; onScreen: string; start?: number; end?: number }>;
  ratio: '9x16' | '4x5';
  status: 'draft' | 'recording' | 'voiced' | 'rendering' | 'rendered' | 'paused' | 'live' | 'retired' | 'rejected' | 'failed';
  error?: string;
  /** The voice actor's order at Bunny Studio, when a real person reads this one. */
  actor?: { orderedAt: string; price?: number; test?: boolean };
  /** An on-camera creator's take, when one was added: it is the voice, and they stand in front of the photos. */
  presenter?: { addedAt: string };
  script: { voice: string; onScreen: string[]; headline: string; primaryText: string };
  hook: { id: string; family: string; familyLabel: string; scope: string; textEn: string; basedOn?: BasedOn } | null;
  /** How it moves ("Light-up", "Before / after", "Counter"); none on ads from before. */
  style?: { id: string; label: string };
  /** What an older ad is made of. An image ad has no voice: script.onScreen is its printed headline and support line. */
  kind?: AdKind;
  videoUrl?: string;
  imageUrl?: string;
  meta?: { videoId?: string; creativeId?: string; adId?: string; adsetId?: string };
  week?: { at: string; spendCents: number; impressions: number; clicks: number; frequency: number; ctr: number; leadsMeta: number };
  baselineCtr?: number;
  fatigued: boolean;
  createdAt: string;
  activatedAt?: string;
  retiredAt?: string;
  /** Why the daily pull suggests retiring this one. */
  suggestRetire?: string;
}

export interface Readiness {
  key: string;
  label: string;
  ok: boolean;
  hard: boolean;
  tab: Section;
  detail: string;
}

export interface AdBatch {
  id: string;
  weekOf: string;
  status: 'drafting' | 'rendering' | 'ready' | 'done' | 'failed';
  error?: string;
  summary?: string;
  /** Hooks passed over this week and why. */
  skipped?: string[];
  createdAt: string;
  creatives: AdCreative[];
}
export interface LiveAd extends AdCreative {
  intake: { leads: number; confirmed: number; sold: number; revenueCents: number };
}
export interface AdAsset {
  id: string;
  url?: string;
  kind: 'photo' | 'video';
  fileName: string;
  tags: string[];
  pairKey?: string;
  /** "person" when someone paired it by hand; else Claude's match. */
  pairSetBy?: 'person';
  note?: string;
  /** What it shows in detail, from the trade's list (doors, trim, front door...): Claude's, or as fixed. */
  items?: string[];
  /** The small copy the grid shows (about 480 pixels), so the page loads fast. */
  thumbUrl?: string;
  /** The JPEG still made at upload. */
  posterUrl?: string;
  /** What Claude saw in it, and the tags it suggests. */
  description?: string;
  suggestedTags?: string[];
  uses?: number;
  /** A clip's length. */
  durationSec?: number;
  /** The job it was shot on, when it is filed under one. */
  jobId?: string;
  createdAt: string;
}
/** One job's photos in the library: a story is told from one job, start to finish. */
export interface AdJob {
  id: string;
  name: string;
  projectId?: string;
  photos: number;
  createdAt: string;
}
/** The competitor ad an idea is built around: who ran it, for how many days, and what it offered. */
export interface BasedOn {
  company: string;
  daysRunning?: number;
  offer: string;
  /** Their angle, and what their ad said out loud and in writing. */
  angle?: string;
  spoken?: string;
  written?: string;
  /** The real ad in Meta's Ad Library (or the advertiser's page), and its own video or picture when kept. */
  link?: string;
  videoUrl?: string;
  imageUrl?: string;
}
/** "Rodgers Painting's ad, running 160 days". */
const sourceLine = (b: BasedOn) => `${b.company}'s ad${b.daysRunning !== undefined ? `, running ${b.daysRunning.toLocaleString('en-US')} days` : ''}`;
export interface AdHook {
  basedOn?: BasedOn;
  id: string;
  family: string;
  familyLabel: string;
  scope: string;
  trade: string;
  textEn: string;
  active: boolean;
  uses: number;
  wins: number;
  losses: number;
}
export interface AdSettings {
  brand: string;
  /** Which services are set up; renderer is whether the app can start the drawing of videos itself. */
  keys: { anthropic: boolean; elevenlabs: boolean; renderer: boolean; meta: boolean; apify: boolean; bunny: boolean };
  adAccountId?: string;
  pageId?: string;
  leadFormId?: string;
  adsetId?: string;
  primaryColor: string;
  accentColor: string;
  voiceId?: string;
  /** Who reads the ads: the ElevenLabs voice, or a real voice actor from Bunny Studio. */
  voiceSource: 'elevenlabs' | 'actor';
  actorVoice: string;
  actorLanguage: string;
  actorNotes?: string;
  /** Each job site video is also drawn with Tesseract, to compare with the Remotion one. */
  tesseractFootage: boolean;
  weeklyEnabled: boolean;
  hooksPerWeek: number;
  liveTarget: number;
  researchKeywords: string[];
  researchMarkets: string[];
  researchMinDays: number;
  researchMonthly: boolean;
}

export interface Playbook {
  id: string;
  scope: string;
  text: string;
  footagePrefs: string[];
  angleFamilies: string[];
  localCompetitors: Array<{ company: string; angle: string; daysRunning: number }>;
  missingFootage: string[];
  basis: { ads: number; local: number; oldestDays: number };
  writtenAt: string;
  editedAt?: string;
}

export interface ResearchRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  keywords: string[];
  scanned: number;
  kept: number;
  added: number;
  junk: number;
  unreadable: number;
  error?: string;
}

const STATUS_LABELS: Record<AdCreative['status'], string> = {
  draft: 'Writing',
  recording: 'With the voice actor',
  voiced: 'Waiting to render',
  rendering: 'Rendering',
  rendered: 'Rendered',
  paused: 'Paused in Meta',
  live: 'Live',
  retired: 'Retired',
  rejected: 'Rejected',
  failed: 'Failed',
};

const chip = 'inline-block text-[10px] uppercase tracking-wide text-gray-400 border border-[#333] rounded px-1';
const pct = (n: number) => `${n.toFixed(2)}%`;



export const AdsCard: React.FC<{ owner: boolean }> = ({ owner }) => {
  // A link can open a tab (Google Drive sends the person back to the Library's clips).
  const [section, setSection] = useState<Section>(() => {
    try {
      const want = new URLSearchParams(window.location.search).get('ads');
      return SECTIONS.some(([v]) => v === want) ? (want as Section) : 'week';
    } catch {
      return 'week';
    }
  });
  const [trade, setTrade] = useState<string>(rememberedTrade);
  const pickTrade = (slug: string) => {
    setTrade(slug);
    setHookStart(null);
    try {
      window.localStorage.setItem(TRADE_KEY, slug);
    } catch {
      /* private browsing: the choice lasts for this visit */
    }
  };
  // A hook started from a swipe: the Hooks form opens with it filled in.
  const [hookStart, setHookStart] = useState<HookDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (err) {
      setError(describeError(err, "That didn't go through"));
    }
  };
  return (
    <TradeContext.Provider value={trade}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Ads" className="flex gap-1 flex-wrap">
          {SECTIONS.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={section === value}
              onClick={() => {
                setSection(value);
                setHookStart(null);
              }}
              className={`px-3 py-1.5 text-sm rounded ${section === value ? 'bg-[#222] text-white' : 'text-gray-400 [@media(hover:hover)]:hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* The trade the page works in, as one small choice at the end of the tabs. */}
        <select
          aria-label="Trade"
          value={trade}
          onChange={(e) => pickTrade(e.target.value)}
          className="ml-auto bg-[#151515] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-sm text-gray-200"
        >
          {Object.values(AD_TRADES).map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorLine error={error} onDismiss={() => setError(null)} />
      {notice && (
        <p role="status" className="text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {section === 'week' ? (
        <ThisWeek owner={owner} act={act} />
      ) : section === 'live' ? (
        <Live act={act} />
      ) : section === 'library' ? (
        <Library act={act} />
      ) : section === 'hooks' ? (
        <Hooks act={act} initial={hookStart ?? undefined} />
      ) : section === 'swipes' ? (
        <Swipes
          act={act}
          owner={owner}
          onMakeHook={(draft) => {
            setHookStart(draft);
            setSection('hooks');
          }}
        />
      ) : (
        <Settings owner={owner} act={act} />
      )}
    </div>
    </TradeContext.Provider>
  );
};

type Act = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

export interface AdIdea {
  id: string;
  /** The idea in one sentence. */
  line: string;
  /** The first words the ad would say. */
  opening: string;
  familyLabel: string;
  scope: string;
  status: 'new' | 'kept';
  /** Why a kept idea's ad couldn't be made, when one couldn't. */
  note?: string;
  basedOn?: BasedOn;
}
export interface AdIdeas {
  round: { status: 'writing' | 'ready' | 'failed'; error?: string; startedAt: string } | null;
  ideas: AdIdea[];
  /** What the keeps and kills so far say about the owner's taste. */
  taste?: string;
}

/**
 * Idea cards. Before anything is made, the owner asks for ideas, each one a
 * line and the words it would open on, and keeps or kills them. Only the
 * kept ones are turned into ads.
 */
const Ideas: React.FC<{ owner: boolean; act: Act }> = ({ owner, act }) => {
  const trade = useTrade();
  const data = useAdsIdeas<AdIdeas>(trade);
  if (data === undefined) return null;
  const fresh = data.ideas.filter((i) => i.status === 'new');
  const kept = data.ideas.filter((i) => i.status === 'kept');
  const writing = data.round?.status === 'writing';
  return (
    <section className="border border-[#2A2A2A] rounded" aria-label="Ad ideas">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#2A2A2A]">
        <div className="flex-1 min-w-[16rem]">
          <h3 className="text-sm font-medium text-white">Ad ideas</h3>
          <p className="text-xs text-gray-400">Start here. Ask for ideas, keep the ones you like and kill the rest. Only the ones you keep get made.</p>
        </div>
        {owner && (
          <button
            type="button"
            className={secondary}
            disabled={writing}
            onClick={() => act(() => adsAPI.ideasNow(trade), 'Writing ideas. They show here in about a minute.')}
          >
            {fresh.length || kept.length ? 'Get new ideas' : 'Get ad ideas'}
          </button>
        )}
      </header>
      {writing && (
        <p role="status" className="px-4 pt-3 text-sm text-gray-300">
          Writing ideas… about a minute.
        </p>
      )}
      {data.round?.status === 'failed' && <p className="px-4 pt-3 text-sm text-red-300">The last ask didn&apos;t work: {data.round.error}</p>}
      {fresh.length === 0 && kept.length === 0 && !writing ? (
        <p className="px-4 py-4 text-sm text-gray-500">No ideas waiting.</p>
      ) : (
        <ul className="grid gap-3 p-4 lg:grid-cols-2" aria-label="Ideas to decide">
          {fresh.map((i) => (
            <IdeaCard key={i.id} idea={i} owner={owner} act={act} />
          ))}
        </ul>
      )}
      {kept.length > 0 && (
        <div className="border-t border-[#2A2A2A] p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-sm text-white flex-1">Kept ({kept.length})</h4>
            {owner && (
              <button
                type="button"
                className={primary}
                onClick={() => act(() => adsAPI.makeKept(trade), 'Making them. Each ad shows below as it is written, voiced and drawn.')}
              >
                {kept.length === 1 ? 'Make this ad' : `Make these ${kept.length} ads`}
              </button>
            )}
          </div>
          <ul className="grid gap-3 lg:grid-cols-2" aria-label="Kept ideas">
            {kept.map((i) => (
              <IdeaCard key={i.id} idea={i} owner={owner} act={act} />
            ))}
          </ul>
        </div>
      )}
      {data.taste && (
        <p className="border-t border-[#2A2A2A] px-4 py-3 text-xs text-gray-500">
          <span className="text-gray-400">What it has learned about your taste:</span> {data.taste}
        </p>
      )}
    </section>
  );
};

const IdeaCard: React.FC<{ idea: AdIdea; owner: boolean; act: Act }> = ({ idea, owner, act }) => (
  <li className={`border rounded p-3 space-y-2 ${idea.status === 'kept' ? 'border-emerald-700/60' : 'border-[#2A2A2A]'}`}>
    <p className="text-base text-white font-medium">&ldquo;{idea.opening}&rdquo;</p>
    <p className="text-sm text-gray-300">{idea.line}</p>
    <p className="flex flex-wrap gap-1.5 items-center">
      <span className={chip}>{scopeLabel(idea.scope)}</span>
      <span className={chip}>{idea.familyLabel}</span>
      {idea.basedOn && <span className="text-xs text-gray-500">From {sourceLine(idea.basedOn)}</span>}
    </p>
    {idea.note && <p className="text-xs text-amber-200/80">Couldn&apos;t be made last time: {idea.note}</p>}
    {owner && (
      <div className="flex gap-2">
        {idea.status === 'new' ? (
          <>
            <button type="button" className={`${primary} ${tap}`} aria-label={`Keep: ${idea.opening}`} onClick={() => act(() => adsAPI.decideIdea(idea.id, 'kept'))}>
              Keep
            </button>
            <button type="button" className={`${secondary} ${tap}`} aria-label={`Kill: ${idea.opening}`} onClick={() => act(() => adsAPI.decideIdea(idea.id, 'killed'))}>
              Kill
            </button>
          </>
        ) : (
          <>
            <button type="button" className={`${secondary} ${tap}`} aria-label={`Put back: ${idea.opening}`} onClick={() => act(() => adsAPI.decideIdea(idea.id, 'new'))}>
              Put back
            </button>
            <button type="button" className={`${secondary} ${tap}`} aria-label={`Kill: ${idea.opening}`} onClick={() => act(() => adsAPI.decideIdea(idea.id, 'killed'))}>
              Kill
            </button>
          </>
        )}
      </div>
    )}
  </li>
);

/** The idea cards, then the batch cards: watch, approve or reject each creative. */
const ThisWeek: React.FC<{ owner: boolean; act: Act }> = ({ owner, act }) => {
  const batches = useAdsBatches<AdBatch[]>(useTrade());
  if (batches === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="space-y-6">
      <Ideas owner={owner} act={act} />
      <p className="text-sm text-gray-400">
        Each ad made from an idea you kept shows below in two sizes, and is created paused in Meta once it is drawn. Approve the ones to run.
      </p>
      {batches.length === 0 ? (
        <div className="border border-dashed border-[#333] rounded p-8 text-center">
          <Film className="w-8 h-8 mx-auto text-gray-500 mb-2" />
          <p className="text-sm text-gray-400">No ads yet. Fill the Library, then ask for ideas above and keep the ones you like.</p>
        </div>
      ) : (
        batches.map((b) => (
          <section key={b.id} className="border border-[#2A2A2A] rounded" aria-label={`Week of ${b.weekOf}`}>
            <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#2A2A2A]">
              <h3 className="text-sm font-medium text-white">Week of {b.weekOf}</h3>
              <span className={chip}>{b.status}</span>
              {b.summary && <span className="text-xs text-gray-500">{b.summary}</span>}
              {b.error && <span className="text-xs text-red-300">{b.error}</span>}
              <span className="text-xs text-gray-500 ml-auto">started {ago(b.createdAt)}</span>
            </header>
            {(b.skipped ?? []).length > 0 && (
              <ul className="px-4 pt-3 text-xs text-amber-200/80 space-y-0.5" aria-label="Passed over">
                {b.skipped!.map((s) => (
                  <li key={s}>Passed over {s}</li>
                ))}
              </ul>
            )}
            {b.creatives.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-500">Nothing drafted for this week.</p>
            ) : (
              <ul className="grid gap-3 p-4 lg:grid-cols-2">
                {groupByHook(b.creatives).map((g) => (
                  <HookGroup key={g.key} group={g} act={act} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
};

/** A batch's creatives, two sizes to a hook and kind, in the order they were drafted. */
function groupByHook(creatives: AdCreative[]): Array<{ key: string; hook: AdCreative['hook']; items: AdCreative[] }> {
  const groups: Array<{ key: string; hook: AdCreative['hook']; items: AdCreative[] }> = [];
  for (const c of creatives) {
    const key = `${c.hook?.id ?? c.id}:${c.kind ?? 'video'}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(c);
    else groups.push({ key, hook: c.hook, items: [c] });
  }
  return groups;
}

/** One hook's drafts: the hook, both sizes side by side, the shot list once, and approve or reject for the pair. */
const HookGroup: React.FC<{ group: { key: string; hook: AdCreative['hook']; items: AdCreative[] }; act: Act }> = ({ group, act }) => {
  const reviewable = group.items.filter((c) => (c.status === 'paused' || c.status === 'rendered') && c.meta?.adId);
  const rejectable = group.items.filter((c) => c.status === 'paused' || c.status === 'rendered');
  const first = group.items[0];
  const image = first.kind === 'image';
  return (
    <li className="border border-[#2A2A2A] rounded p-3 space-y-3" data-testid="hook-group">
      {group.hook && (
        <p className="text-sm text-white">
          <span className="text-xs text-gray-500">
            {first.style ? `${first.style.label} style` : KIND_LABELS[first.kind ?? 'video']} · {group.hook.familyLabel} · {scopeLabel(group.hook.scope)} ·{' '}
          </span>
          {group.hook.textEn}
          {group.hook.basedOn && (
            <span className="block text-xs text-emerald-300 mt-0.5">
              Built around {sourceLine(group.hook.basedOn)}. Their offer: {group.hook.basedOn.offer}
            </span>
          )}
        </p>
      )}
      {group.hook?.basedOn && !image && <Compare theirs={group.hook.basedOn} ours={first} />}
      <ul className="grid gap-3 grid-cols-2">
        {group.items.map((c) => (
          <CreativeCard key={c.id} c={c} act={act} />
        ))}
      </ul>
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer">{image ? 'Words on the image' : first.style ? 'Lines' : 'Shots'}</summary>
        {image ? (
          <p className="mt-1">
            <span className="text-gray-300">{first.shots?.[0]?.fileName}</span>
            <br />
            Headline: {first.script.onScreen[0]}
            <br />
            Under it: {first.script.onScreen[1]}
          </p>
        ) : first.shots && first.shots.length > 0 ? (
          <ol className="mt-1 space-y-1.5" aria-label="Shot list">
            {first.style && first.script.onScreen[0] && <li className="list-none text-gray-400">At the top: {first.script.onScreen[0]}</li>}
            {first.shots.map((shot, i) => (
              <li key={i}>
                <span className="text-gray-300">
                  {i + 1}. {shot.fileName}
                  {shot.start !== undefined && shot.end !== undefined ? ` · ${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s` : ''}
                </span>
                <br />“{shot.voice}”
                {shot.onScreen && (
                  <>
                    <br />
                    <span className="text-gray-400">
                      {first.style ? 'Label' : 'On screen'}: {shot.onScreen}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 whitespace-pre-wrap">{first.script.voice}</p>
        )}
      </details>
      {rejectable.length > 1 && (
        <div className="flex gap-2">
          <button
            type="button"
            className={`${primary} flex-1`}
            disabled={reviewable.length !== rejectable.length}
            onClick={() => act(() => Promise.all(reviewable.map((c) => adsAPI.activate(c.id))), 'Both sizes are live.')}
          >
            Approve both
          </button>
          <button type="button" className={secondary} onClick={() => act(() => Promise.all(rejectable.map((c) => adsAPI.reject(c.id))))}>
            Reject both
          </button>
        </div>
      )}
    </li>
  );
};

/**
 * The competitor's ad beside ours: what theirs said, out loud and on the page, and what our video says, line by line,
 * so it is plain what was taken from it and what was written new.
 */
const Compare: React.FC<{ theirs: BasedOn; ours: AdCreative }> = ({ theirs, ours }) => {
  const lines = ours.shots?.length ? ours.shots.map((s) => s.voice) : [ours.script.voice];
  return (
    <div className="grid gap-3 md:grid-cols-2 text-xs" data-testid="compare">
      <div className="rounded border border-[#2A2A2A] bg-[#121212] p-3 space-y-1.5 min-w-0">
        <p className="uppercase tracking-wide text-[10px] text-gray-500">Their ad · {theirs.company}</p>
        {theirs.videoUrl ? (
          <video src={theirs.videoUrl} poster={theirs.imageUrl} controls playsInline preload="metadata" className="w-full max-h-80 rounded bg-black" />
        ) : theirs.imageUrl ? (
          <a href={theirs.link ?? theirs.imageUrl} target="_blank" rel="noreferrer">
            <img src={theirs.imageUrl} alt={`${theirs.company}'s ad`} className="w-full max-h-80 object-contain rounded bg-black" />
          </a>
        ) : null}
        {theirs.link && (
          <a href={theirs.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gray-200 underline">
            Open their ad <ExternalLink size={12} />
          </a>
        )}
        {theirs.angle && <p className="text-gray-300">Angle: {theirs.angle}</p>}
        {theirs.spoken && (
          <p className="text-gray-200 whitespace-pre-wrap">
            <span className="text-gray-500">Said: </span>“{theirs.spoken}”
          </p>
        )}
        {theirs.written && (
          <p className="text-gray-200 whitespace-pre-wrap">
            <span className="text-gray-500">Written: </span>“{theirs.written}”
          </p>
        )}
        {!theirs.spoken && !theirs.written && <p className="text-gray-500">Their words weren't saved, only the angle and the offer.</p>}
        <p className="text-gray-400">Offer: {theirs.offer}</p>
      </div>
      <div className="rounded border border-emerald-900 bg-[#0f1a14] p-3 space-y-1.5 min-w-0">
        <p className="uppercase tracking-wide text-[10px] text-emerald-400">Our ad</p>
        {ours.script.onScreen[0] && <p className="text-gray-300">At the top: {ours.script.onScreen[0]}</p>}
        <ol className="space-y-1 list-decimal pl-4 text-gray-200">
          {lines.map((line, i) => (
            <li key={i}>“{line}”</li>
          ))}
        </ol>
      </div>
    </div>
  );
};

const CreativeCard: React.FC<{ c: AdCreative; act: Act }> = ({ c, act }) => (
  <li className="border border-[#2A2A2A] rounded bg-[#121212] flex flex-col" data-testid="creative">
    {c.imageUrl ? (
      <a href={c.imageUrl} target="_blank" rel="noreferrer">
        <img src={c.imageUrl} alt={c.script.onScreen[0] ?? c.script.headline} className={`w-full bg-black ${c.ratio === '9x16' ? 'aspect-[9/16]' : 'aspect-[4/5]'}`} />
      </a>
    ) : c.videoUrl ? (
      <video src={c.videoUrl} controls preload="metadata" className={`w-full bg-black ${c.ratio === '9x16' ? 'aspect-[9/16]' : 'aspect-[4/5]'}`} />
    ) : (
      <div className={`w-full bg-[#0c0c0c] flex items-center justify-center text-gray-600 ${c.ratio === '9x16' ? 'aspect-[9/16]' : 'aspect-[4/5]'}`}>
        <Play className="w-8 h-8" />
      </div>
    )}
    <div className="p-3 space-y-2 flex-1">
      <p className="flex flex-wrap gap-1 items-center">
        <span className={chip}>{c.ratio}</span>
        {c.kind && c.kind !== 'video' && <span className={chip}>{KIND_LABELS[c.kind]}</span>}
        <span
          className={`${chip} ${c.status === 'live' ? 'text-emerald-300 border-emerald-900' : c.status === 'failed' ? 'text-red-300 border-red-900' : ''}`}
        >
          {c.status === 'recording' && c.presenter ? 'Timing the take' : STATUS_LABELS[c.status]}
        </span>
        {c.presenter && <span className={chip}>On camera</span>}
      </p>
      <p className="text-sm text-white">{c.script.headline}</p>
      <p className="text-xs text-gray-400 line-clamp-3" title={c.script.primaryText}>
        {c.script.primaryText}
      </p>
      {c.presenter && <p className="text-xs text-gray-400">Creator's take added {ago(c.presenter.addedAt)}</p>}
      {c.actor && !c.presenter && (
        <p className="text-xs text-gray-400">
          {c.status === 'recording' ? 'Voice actor ordered' : 'Read by a voice actor'} {ago(c.actor.orderedAt)}
          {c.actor.price !== undefined ? ` · $${c.actor.price.toFixed(2)}` : ''}
          {c.actor.test ? ' · test order' : ''}
        </p>
      )}
      {c.error && <p className="text-xs text-red-300">{c.error}</p>}
      <p className="text-[10px] text-gray-600 break-all">{c.name}</p>
    </div>
    {(c.status === 'paused' || c.status === 'rendered') && (
      <div className="flex gap-2 p-3 pt-0">
        <button
          type="button"
          className={`${primary} flex-1`}
          disabled={!c.meta?.adId}
          onClick={() => act(() => adsAPI.activate(c.id), `${c.name} is live.`)}
        >
          Approve
        </button>
        <button type="button" className={secondary} onClick={() => act(() => adsAPI.reject(c.id))}>
          Reject
        </button>
      </div>
    )}
    <div className="flex flex-wrap gap-2 p-3 pt-0">
      {c.status === 'recording' && !c.presenter && (
        <button type="button" className={secondary} onClick={() => act(() => adsAPI.checkActors(), 'Checking Bunny Studio for the read.')}>
          Check now
        </button>
      )}
      {/* A job site video is already the crew's own footage: no creator brief for it. */}
      {c.style?.id !== 'footage' && (
        <button
          type="button"
          className={secondary}
          onClick={() =>
            act(async () => {
              const brief = await adsAPI.creatorBrief(c.id);
              await navigator.clipboard.writeText(brief);
            }, 'On-camera brief copied. Paste it to the creator.')
          }
        >
          Copy on-camera brief
        </button>
      )}
      {takeable(c) && (
        <label className={`${secondary} cursor-pointer`}>
          {c.presenter ? 'Replace on-camera take' : 'Add on-camera take'}
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            aria-label={`On-camera take for ${c.name}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void act(async () => {
                const storageId = await putFile(file, file.type || 'video/mp4');
                await adsAPI.addTake(c.id, storageId, file.name);
              }, 'Take added. It is checked against the script, then drawn with the creator in front of the photos.');
            }}
          />
        </label>
      )}
    </div>
  </li>
);

/** The ads in Meta: spend, clicks, what came through intake, and the fatigue flag. */
const Live: React.FC<{ act: Act }> = ({ act }) => {
  const rows = useAdsLive<LiveAd[]>();
  if (rows === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-gray-400">Nothing in Meta yet. Approve a creative under This week.</p>;
  return (
    <div className="overflow-x-auto border border-[#2A2A2A] rounded">
      <table className="w-full text-sm" aria-label="Live ads">
        <thead className="text-xs text-gray-500">
          <tr className="text-left">
            <th className="px-3 py-2">Ad</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">7-day spend</th>
            <th className="px-3 py-2 text-right">CTR</th>
            <th className="px-3 py-2 text-right">Freq.</th>
            <th className="px-3 py-2 text-right">Meta leads</th>
            <th className="px-3 py-2 text-right">Ours</th>
            <th className="px-3 py-2 text-right">Confirmed</th>
            <th className="px-3 py-2 text-right">Sold</th>
            <th className="px-3 py-2 text-right">Revenue</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2A2A2A]">
          {rows.map((r) => (
            <tr key={r.id} data-testid="live-ad">
              <td className="px-3 py-2">
                <p className="text-white">
                  {r.hook ? `${r.hook.familyLabel} · ${scopeLabel(r.hook.scope)}` : 'Hook'} · {r.ratio}
                </p>
                <p className="text-[10px] text-gray-600 break-all">{r.name}</p>
              </td>
              <td className="px-3 py-2">
                <span className={chip}>{STATUS_LABELS[r.status]}</span>
                {r.fatigued && <span className={`${chip} ml-1 text-amber-300 border-amber-900`}>fatigued</span>}
                {r.suggestRetire && (
                  <span className={`${chip} ml-1 text-amber-300 border-amber-900`} title={r.suggestRetire}>
                    retire?
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-gray-300">{r.week ? money(r.week.spendCents) : '—'}</td>
              <td className="px-3 py-2 text-right text-gray-300">{r.week ? pct(r.week.ctr) : '—'}</td>
              <td className="px-3 py-2 text-right text-gray-300">{r.week ? r.week.frequency.toFixed(1) : '—'}</td>
              <td className="px-3 py-2 text-right text-gray-300">{r.week ? r.week.leadsMeta : '—'}</td>
              <td className="px-3 py-2 text-right text-white">{r.intake.leads}</td>
              <td className="px-3 py-2 text-right text-white">{r.intake.confirmed}</td>
              <td className="px-3 py-2 text-right text-white">{r.intake.sold}</td>
              <td className="px-3 py-2 text-right text-emerald-300">{money(r.intake.revenueCents)}</td>
              <td className="px-3 py-2 text-right">
                {r.status === 'live' && (
                  <button type="button" className={secondary} onClick={() => act(() => adsAPI.retire(r.id), 'Paused in Meta.')}>
                    Retire
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Whether a creator's take can still be added: a video ad not yet in Meta and not being drawn right now. */
const takeable = (c: AdCreative) =>
  c.kind !== 'image' && c.style?.id !== 'footage' && !c.meta?.adId && !['rendering', 'live', 'retired', 'rejected'].includes(c.status);


const Library: React.FC<{ act: Act }> = ({ act }) => {
  const trade = useTrade();
  const assets = useAdsLibrary<AdAsset[]>(trade);
  const jobs = useAdJobs<AdJob[]>(trade) ?? [];
  // Photos and clips are kept apart: clips have no jobs and no before or after.
  // Back from connecting Google Drive (or asked for by link): the clips, where its imports show.
  const [view, setView] = useState<'photos' | 'pairs' | 'clips'>(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get('view') === 'clips' || p.has('drive') ? 'clips' : p.get('view') === 'pairs' ? 'pairs' : 'photos';
    } catch {
      return 'photos';
    }
  });
  // The file open in its window (read fresh from the live list, so a change shows at once), and the upload window.
  const [openId, setOpenId] = useState<string | null>(null);
  // The before and after open side by side, by its pair key.
  const [openPair, setOpenPair] = useState<string | null>(null);
  // "Add its after" (or its before): the photo whose other half is being found.
  const [finding, setFinding] = useState<string | null>(null);
  // The upload window: for the library, or straight into one job's box.
  const [adding, setAdding] = useState<{ jobId?: string } | null>(null);
  // "New job": name it, then its photos go straight in.
  const [naming, setNaming] = useState(false);
  // "Select": tap several photos, then one job tag puts them all in that job.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };
  // The dotted tile at the end of a grid: the files picked go straight in, into that job when it is a job's box.
  // No tags: Claude looks at each one and tags it.
  // What is being sent right now, shown as a bar: a clip can take minutes on a phone's connection.
  const [sending, setSending] = useState<Sending | null>(null);
  // Closing or reloading the page while a file is still on its way would stop it: the browser asks first.
  useEffect(() => {
    if (!sending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sending !== null]);
  const send = async (files: File[], tags: string[], jobId?: string) => {
    // A photo too big is said before anything goes; a clip is made smaller first, then checked (uploadAsset).
    const big = files.filter((f) => !isVideo(f)).map(tooBig).find(Boolean);
    if (big) throw new Error(big);
    // Each file on its own: one that fails doesn't stop the rest, and the end says which didn't go. While one is
    // being sent the next is made ready (made smaller, its still), so the device and the connection both keep busy.
    const failed: string[] = [];
    const why = (err: unknown) => (err instanceof Error ? err.message : 'it failed');
    type Ready = { ok: true; p: PreparedAsset } | { ok: false; error: string };
    const prepare = (n: number): Promise<Ready> => {
      const f = files[n];
      return prepareAsset(f, (x) =>
        setSending((s) => {
          const base: Sending = s ?? { name: f.name, at: n + 1, of: files.length, pct: 0, step: 'shrinking' };
          // The one being sent leads the bar; the one being made ready shows under it.
          return base.at === n + 1 && base.step === 'shrinking'
            ? { ...base, pct: Math.round(x * 100) }
            : { ...base, next: { name: f.name, at: n + 1, pct: Math.round(x * 100) } };
        }),
      ).then(
        (p): Ready => ({ ok: true, p }),
        (err): Ready => ({ ok: false, error: why(err) }),
      );
    };
    try {
      setSending({ name: files[0].name, at: 1, of: files.length, pct: 0, step: isVideo(files[0]) ? 'shrinking' : 'sending' });
      let ready = files.length ? prepare(0) : null;
      for (const [n, f] of files.entries()) {
        const got = await ready!;
        // The next one starts getting ready now, while this one is sent.
        ready = n + 1 < files.length ? prepare(n + 1) : null;
        if (!got.ok) {
          failed.push(`${f.name}: ${got.error}`);
          continue;
        }
        setSending((s) => ({ name: f.name, at: n + 1, of: files.length, pct: 0, step: 'sending', next: s?.next?.at === n + 2 ? s.next : undefined }));
        try {
          await sendPreparedAsset(got.p, { tags, trade, job: jobId && !isVideo(f) ? { jobId } : undefined }, (x) =>
            setSending((s) => (s ? { ...s, pct: Math.round(x * 100) } : s)),
          );
        } catch (err) {
          failed.push(`${f.name}: ${why(err)}`);
        }
        // The next one, if it's still being made ready, leads the bar now.
        setSending((s) =>
          n + 1 < files.length
            ? s?.next
              ? { name: s.next.name, at: s.next.at, of: files.length, pct: s.next.pct, step: 'shrinking' }
              : { name: files[n + 1].name, at: n + 2, of: files.length, pct: 0, step: isVideo(files[n + 1]) ? 'shrinking' : 'sending' }
            : s,
        );
      }
    } finally {
      setSending(null);
    }
    if (failed.length)
      throw new Error(
        `${files.length - failed.length} of ${files.length} uploaded. ${failed.length === 1 ? "This one didn't" : "These didn't"}, try ${failed.length === 1 ? 'it' : 'them'} again: ${failed.join(' · ')}`,
      );
  };
  const addHere = (files: File[], jobId?: string) =>
    act(
      () => send(files, [], jobId),
      `✓ ${files.length === 1 ? 'Sent' : `All ${files.length} sent`}. You can leave this page: Claude tags ${files.length === 1 ? 'it' : 'them'} in the background.`,
    );
  const toJob = (job: { jobId?: string; name?: string }, label: string) =>
    act(async () => {
      await adsAPI.groupIntoJob(picked, job, trade);
      stopSelecting();
    }, `${picked.length} photo${picked.length === 1 ? '' : 's'} tagged ${label}.`);
  const photos = (assets ?? []).filter((a) => a.kind === 'photo');
  const clips = (assets ?? []).filter((a) => a.kind === 'video');
  const open = (assets ?? []).find((a) => a.id === openId);
  const loose = photos.filter((a) => !a.jobId || !jobs.some((j) => j.id === a.jobId));
  const pairs = pairsOf(photos);
  const shownPair = pairs.find((p) => p.key === openPair);
  // A photo that already holds both (a side by side made elsewhere) is its own before and after.
  const joined = photos.filter((a) => a.tags.includes('before') && a.tags.includes('after'));
  const paired = new Set(pairs.flatMap((p) => [p.before.id, p.after.id]));
  const needsAfter = photos.filter((a) => a.tags.includes('before') && !a.tags.includes('after') && !paired.has(a.id));
  const loneAfters = photos.filter((a) => a.tags.includes('after') && !a.tags.includes('before') && !paired.has(a.id));
  // Photos not in a job, by type of work (a photo of two shows under its first); the rest after.
  // By job (each job's box, then the rest by type of work), or every photo by type of work, jobs' too.
  const [groupBy, setGroupBy] = useState<'job' | 'work'>('work');
  const sorting = groupBy === 'work' ? photos : loose;
  // Within each type of work, its befores (the unfinished state) come after the finished photos, apart.
  const beforeOnly = (a: AdAsset) => a.tags.includes('before') && !a.tags.includes('after');
  const byWork = worksFor(trade)
    .map((w) => {
      const list = sorting.filter((a) => a.tags.find((t) => worksFor(trade).includes(t)) === w);
      return [w, [...list.filter((a) => !beforeOnly(a)), ...list.filter(beforeOnly)]] as const;
    })
    .filter(([, list]) => list.length > 0);
  const unsorted = sorting.filter((a) => !a.tags.some((t) => worksFor(trade).includes(t)));
  // The files in the order the page shows them, so an open one can flip to the one beside it.
  const sortedWork = [...byWork.flatMap(([, list]) => list), ...unsorted];
  const order = (
    view === 'clips'
      ? clips
      : view === 'pairs'
      ? [...joined, ...needsAfter, ...(selecting ? loneAfters : [])]
      : groupBy === 'work'
      ? sortedWork
      : [...jobs.flatMap((j) => photos.filter((a) => a.jobId === j.id)), ...sortedWork]
  ).map((a) => a.id);
  const at = openId ? order.indexOf(openId) : -1;
  // Files uploaded before thumbnails were made get one here, quietly, one at a time; each is tried once a visit.
  const tried = useRef(new Set<string>());
  useEffect(() => {
    const todo = (assets ?? []).filter((a) => !a.thumbUrl && !tried.current.has(a.id) && (a.posterUrl || (a.kind === 'photo' && a.url)));
    if (todo.length === 0) return;
    let stop = false;
    void (async () => {
      for (const a of todo) {
        if (stop) return;
        tried.current.add(a.id);
        await backfillThumb(a.id, (a.posterUrl ?? a.url)!);
      }
    })();
    return () => {
      stop = true;
    };
  }, [assets]);
  // In a job's box the job is its heading, so the card doesn't repeat it.
  const tile = (a: AdAsset, inBox = false) => (
    <AssetTile
      key={a.id}
      a={a}
      jobs={inBox ? [] : jobs}
      onOpen={() => setOpenId(a.id)}
      act={act}
      pick={
        selecting
          ? { on: picked.includes(a.id), toggle: () => setPicked((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id])) }
          : undefined
      }
    />
  );
  return (
    <div className={`space-y-4 ${selecting ? 'pb-40' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-[#151515] border border-[#2A2A2A] p-0.5" role="group" aria-label="Show">
          {(
            [
              ['photos', `Photos ${photos.length}`],
              ['pairs', `Before & after ${pairs.length + joined.length}`],
              ['clips', `Clips ${clips.length}`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                stopSelecting();
              }}
              className={`px-3 min-h-[34px] rounded-md text-sm ${view === v ? 'bg-[#2a2a2a] text-white' : 'text-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'photos' && worksFor(trade).length > 0 && (
          <div className="inline-flex rounded-lg bg-[#151515] border border-[#2A2A2A] p-0.5" role="group" aria-label="Group photos">
            {(
              [
                ['job', 'By project'],
                ['work', 'By type of work'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={groupBy === v}
                onClick={() => setGroupBy(v)}
                className={`px-3 min-h-[34px] rounded-md text-sm ${groupBy === v ? 'bg-[#2a2a2a] text-white' : 'text-gray-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {view !== 'clips' && photos.length > 0 && (
            <button type="button" className="px-3 min-h-[36px] rounded-lg text-sm text-gray-300 [@media(hover:hover)]:hover:text-white" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? 'Cancel' : 'Select'}
            </button>
          )}
          {view === 'photos' && !selecting && (
            <button type="button" className="px-3 min-h-[36px] rounded-lg text-sm text-gray-300 [@media(hover:hover)]:hover:text-white" onClick={() => setNaming(true)}>
              New project
            </button>
          )}
          <button type="button" aria-label="Add photos or clips" className={`${primary} min-h-[36px] py-1.5`} onClick={() => setAdding({})}>
            <Upload className="w-4 h-4" /> Add
          </button>
        </div>
      </div>
      {sending && <SendingBar s={sending} />}
      {selecting && (
        <p className="text-xs text-gray-500">
          {view === 'pairs' ? 'Pick a before and its after, then tap Pair these two.' : 'Tap the photos from one project, then tap the project below. Or pick two to pair them as a before and after.'}
        </p>
      )}
      {assets === undefined ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : view === 'pairs' ? (
        <div className="space-y-5" aria-label="Before & after">
          {pairs.length + joined.length === 0 ? (
            <p className="text-sm text-gray-500">No befores and afters yet. Claude pairs them as photos come in. You can also pick two in Select.</p>
          ) : (
            !selecting && (
              <ul className={grid} aria-label="Pairs">
                {pairs.map((p) => (
                  <PairTile key={p.key} p={p} onOpen={() => setOpenPair(p.key)} />
                ))}
                {joined.map((a) => (
                  <PairTile key={a.id} p={{ key: a.id, before: a }} onOpen={() => setOpenId(a.id)} />
                ))}
              </ul>
            )
          )}
          {needsAfter.length > 0 && (
            <section className="space-y-2" aria-label="Befores with no after yet">
              <h3 className="text-sm font-semibold text-gray-300">
                Befores with no after yet <span className="text-gray-500 font-normal">{needsAfter.length}</span>
              </h3>
              <p className="text-xs text-gray-500">Shoot these spots when the project's done, or pick one with its after in Select to pair them.</p>
              <ul className={grid}>
                {needsAfter.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1.5">
                    <ul>{tile(a)}</ul>
                    {!selecting && (
                      <button
                        type="button"
                        aria-label={`Add the after for ${a.fileName}`}
                        onClick={() => setFinding(a.id)}
                        className="min-h-[40px] rounded-lg border border-[#c9a24a]/70 text-[#e2c578] text-sm [@media(hover:hover)]:hover:bg-[#c9a24a]/10"
                      >
                        + Add its after
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {selecting && loneAfters.length > 0 && (
            <section className="space-y-2" aria-label="Afters with no before">
              <h3 className="text-sm font-semibold text-gray-300">
                Afters with no before <span className="text-gray-500 font-normal">{loneAfters.length}</span>
              </h3>
              <ul className={grid}>{loneAfters.map((a) => tile(a))}</ul>
            </section>
          )}
        </div>
      ) : view === 'photos' ? (
        <div className="space-y-5" aria-label="Library">
          {groupBy === 'job' && jobs.map((j) => (
            <JobGroup key={j.id} job={j} assets={photos.filter((a) => a.jobId === j.id)} act={act}>
              {!selecting && <AddTile label={`Add photos to ${j.name}`} photos onFiles={(files) => addHere(files, j.id)} />}
              {photos.filter((a) => a.jobId === j.id).map((a) => tile(a, true))}
            </JobGroup>
          ))}
          <section className="space-y-2" aria-label={groupBy === 'work' ? 'By type of work' : 'Not in a project'}>
            {groupBy === 'job' && jobs.length > 0 && <h3 className="text-sm font-semibold text-gray-300">Not in a project</h3>}
            {byWork.map(([work, list]) => (
              <div key={work} className="space-y-2" aria-label={workLabel(trade, work)}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                  {workLabel(trade, work)} <span className="text-gray-500">{list.filter((a) => !beforeOnly(a)).length}</span>
                </h4>
                {list.some((a) => !beforeOnly(a)) && <ul className={grid}>{list.filter((a) => !beforeOnly(a)).map((a) => tile(a))}</ul>}
                {list.some(beforeOnly) && (
                  <div className="space-y-2 pl-3 border-l-2 border-[#2A2A2A]" aria-label={`${workLabel(trade, work)} befores`}>
                    <p className="text-xs text-gray-500">
                      Befores <span className="text-gray-600">{list.filter(beforeOnly).length}</span> · used in ads only beside their after
                    </p>
                    <ul className={grid}>{list.filter(beforeOnly).map((a) => tile(a))}</ul>
                  </div>
                )}
              </div>
            ))}
            {byWork.length > 0 && unsorted.length > 0 && <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">No type of work yet</h4>}
            <ul className={grid}>
              {unsorted.map((a) => tile(a))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
        <DriveFolder act={act} />
        <ul className={grid} aria-label="Clips">
          <AddTile label="Add clips" onFiles={(files) => addHere(files)} />
          {clips.map((a) => tile(a))}
        </ul>
        </div>
      )}
      {selecting && (
        // Held at the bottom of the screen while photos are picked.
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl rounded-lg border border-[#7c5cc4] bg-[#16121f]/95 p-3 shadow-2xl space-y-2" aria-label="Tag picked photos">
          <p className="text-sm text-white">
            {picked.length === 0 ? 'Tap photos to pick them.' : `${picked.length} photo${picked.length === 1 ? '' : 's'} picked. Tap the project they belong to:`}
          </p>
          {picked.length === 2 && (
            <button
              type="button"
              className={`${secondary} w-full justify-center`}
              onClick={() =>
                act(async () => {
                  await adsAPI.pairPhotos(picked);
                  stopSelecting();
                }, 'Paired as a before and after. Claude won’t change it.')
              }
            >
              Pair these two as a before and after
            </button>
          )}
          {picked.length > 0 && (
            <JobPicker
              jobs={jobs}
              where="the picked photos"
              open
              onPick={(jobId) => jobId && toJob({ jobId }, jobs.find((j) => j.id === jobId)?.name ?? 'with the project')}
              onNew={(name) => toJob({ name }, name)}
            />
          )}
        </div>
      )}
      {open && (
        <AssetEditor
          a={open}
          jobs={jobs}
          act={act}
          partner={open.pairKey ? (assets ?? []).find((x) => x.id !== open.id && x.pairKey === open.pairKey) : undefined}
          onFindPartner={
            open.kind === 'photo' && !paired.has(open.id) && open.tags.includes('before') !== open.tags.includes('after') ? () => setFinding(open.id) : undefined
          }
          onOpen={setOpenId}
          onClose={() => setOpenId(null)}
          flip={at >= 0 && order.length > 1 ? { at, of: order.length, prev: at > 0 ? order[at - 1] : undefined, next: at < order.length - 1 ? order[at + 1] : undefined } : undefined}
          strip={at >= 0 ? order.slice(Math.max(0, at - 5), at + 6).flatMap((id) => (assets ?? []).filter((x) => x.id === id)) : undefined}
        />
      )}
      {finding && photos.some((a) => a.id === finding) && (
        <FindPartner
          a={photos.find((x) => x.id === finding)!}
          photos={photos}
          paired={paired}
          act={act}
          onClose={() => setFinding(null)}
        />
      )}
      {shownPair && (
        <PairView
          p={shownPair}
          act={act}
          onClose={() => setOpenPair(null)}
          onOpen={(id) => {
            setOpenPair(null);
            setOpenId(id);
          }}
        />
      )}
      {adding && <AddFiles jobs={jobs} act={act} startJob={adding.jobId} onClose={() => setAdding(null)} send={send} sending={sending} />}
      {naming && (
        <NewJob
          act={act}
          onClose={() => setNaming(false)}
          onMade={() => {
            // Its box shows at once, with the dotted tile to add its photos.
            setNaming(false);
            setView('photos');
          }}
        />
      )}
    </div>
  );
};

const grid = 'grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

/** The last tile of a grid: a dotted box the size of the others. Tapping it picks files that go straight in. */
const AddTile: React.FC<{ label: string; photos?: boolean; onFiles: (files: File[]) => Promise<unknown> }> = ({ label, photos, onFiles }) => {
  const [busy, setBusy] = useState(false);
  return (
    <li data-testid="add-tile">
      <label
        className={`flex flex-col items-center justify-center gap-2 aspect-square w-full rounded border-2 border-dashed border-[#3a3a3a] text-gray-400 cursor-pointer [@media(hover:hover)]:hover:border-[#336699] [@media(hover:hover)]:hover:text-white ${busy ? 'opacity-60' : ''}`}
      >
        <Upload className="w-6 h-6" aria-hidden="true" />
        <span className="text-sm">{busy ? 'Adding…' : photos ? '+ Add photos' : '+ Add clips'}</span>
        <input
          type="file"
          accept={photos ? 'image/*' : 'video/*'}
          multiple
          className="sr-only"
          aria-label={label}
          disabled={busy}
          onChange={async (e) => {
            const input = e.target;
            const files = Array.from(input.files ?? []);
            if (files.length === 0) return;
            setBusy(true);
            await onFiles(files);
            setBusy(false);
            input.value = '';
          }}
        />
      </label>
    </li>
  );
};

/** The picture of a library file: its still, else the photo, else the clip's first frame. */
/**
 * A card's picture: the small copy where there is one, loaded only as it scrolls near, on a soft grey box that it
 * fades in over, so there is never a blank pause.
 */
type Pair = { key: string; before: AdAsset; after: AdAsset; byPerson: boolean };

/** The library's pairs: two photos sharing a key, one the before and one the after; newest first. */
function pairsOf(photos: AdAsset[]): Pair[] {
  const byKey = new Map<string, AdAsset[]>();
  for (const a of photos) if (a.pairKey) byKey.set(a.pairKey, [...(byKey.get(a.pairKey) ?? []), a]);
  const stage = (a: AdAsset, s: string) => a.tags.includes(s) && !a.tags.includes(s === 'before' ? 'after' : 'before');
  const out: Pair[] = [];
  for (const [key, list] of byKey) {
    const before = list.find((a) => stage(a, 'before'));
    const after = list.find((a) => stage(a, 'after'));
    if (list.length === 2 && before && after) out.push({ key, before, after, byPerson: list.some((a) => a.pairSetBy === 'person') });
  }
  return out.sort((x, y) => (y.after.createdAt ?? '').localeCompare(x.after.createdAt ?? ''));
}

const srcOf = (a: AdAsset, big = false) => (big ? (a.posterUrl ?? a.url ?? a.thumbUrl) : (a.thumbUrl ?? a.posterUrl ?? a.url));

/** A before and its after as one square, split down the middle; or one photo that holds both. */
const PairTile: React.FC<{ p: { key: string; before: AdAsset; after?: AdAsset; byPerson?: boolean }; onOpen: () => void }> = ({ p, onOpen }) => {
  const trade = useTrade();
  const work = [...p.before.tags, ...(p.after?.tags ?? [])].find((t) => worksFor(trade).includes(t));
  const tag = 'absolute bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white';
  return (
    <li className="border border-[#2A2A2A] rounded bg-[#121212] overflow-hidden" data-testid="pair">
      <button type="button" onClick={onOpen} aria-label={`Open the before and after: ${p.before.fileName}`} className="block w-full text-left">
        <div className={`relative aspect-square bg-[#1d1d1d] ${p.after ? 'grid grid-cols-2' : ''}`}>
          {(p.after ? [p.before, p.after] : [p.before]).map((a) => (
            <img key={a.id} src={srcOf(a)} alt={a.fileName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ))}
          {p.after ? (
            <>
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-0.5 -ml-px bg-white/80" />
              <span className={`${tag} left-1.5`}>Before</span>
              <span className={`${tag} right-1.5`}>After</span>
            </>
          ) : (
            <span className={`${tag} left-1.5`}>Before and after in one</span>
          )}
        </div>
        <div className="p-2 text-[11px] text-gray-400 min-h-[2.25rem] flex items-center gap-1">
          {work && <span className="text-amber-200">{workLabel(trade, work)}</span>}
          {work && p.after && <span aria-hidden="true">·</span>}
          {p.after && <span>{p.byPerson ? 'Paired by you' : 'Paired by Claude'}</span>}
        </div>
      </button>
    </li>
  );
};

/** A pair side by side: the before, its after, and the two fixes (swap them, or they're not a pair). */
const PairView: React.FC<{ p: Pair; act: Act; onClose: () => void; onOpen: (id: string) => void }> = ({ p, act, onClose, onOpen }) => (
  <Dialog title="Before and after" onClose={onClose} wide>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['Before', p.before],
            ['After', p.after],
          ] as const
        ).map(([label, a]) => (
          <figure key={a.id} className="space-y-1">
            <button type="button" onClick={() => onOpen(a.id)} aria-label={`Open the ${label.toLowerCase()}: ${a.fileName}`} className="block w-full">
              <img src={srcOf(a, true)} alt={a.fileName} className="w-full h-[min(55dvh,420px)] object-contain bg-black rounded" />
            </button>
            <figcaption className="text-sm text-gray-300">{label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {p.byPerson ? 'You paired these.' : 'Claude paired these as the same spot, before and after.'} Ads show them together.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => act(() => adsAPI.swapPair(p.before.id), 'Swapped: the before is now the after.')}>
          Swap before and after
        </button>
        <button
          type="button"
          className="px-3 min-h-[40px] rounded-lg text-sm text-red-300 border border-red-400/30 [@media(hover:hover)]:hover:bg-red-500/10"
          onClick={() =>
            act(async () => {
              await adsAPI.splitPair(p.before.id);
              onClose();
            }, 'Split. Claude won’t pair these two again.')
          }
        >
          Not a pair
        </button>
      </div>
    </div>
  </Dialog>
);

/**
 * "Add its after" (or "Add its before"): the other half of a photo, uploaded now or picked from the library, and
 * paired with it at once. The likeliest first: the same job, then the same type of work, then the nearest in time.
 */
const FindPartner: React.FC<{ a: AdAsset; photos: AdAsset[]; paired: Set<string>; act: Act; onClose: () => void }> = ({ a, photos, paired, act, onClose }) => {
  const trade = useTrade();
  const want: 'before' | 'after' = a.tags.includes('before') ? 'after' : 'before';
  const work = a.tags.find((t) => worksFor(trade).includes(t));
  const [all, setAll] = useState(false);
  const [sendingPct, setSendingPct] = useState<number | null>(null);
  const when = (x: AdAsset) => Date.parse(x.createdAt ?? '') || 0;
  const score = (x: AdAsset) => [a.jobId && x.jobId === a.jobId ? 0 : 1, work && x.tags.includes(work) ? 0 : 1, Math.abs(when(x) - when(a))];
  const options = photos
    .filter((x) => x.id !== a.id && !paired.has(x.id) && x.tags.includes(want) && !x.tags.includes(want === 'after' ? 'before' : 'after'))
    .sort((x, y) => {
      const [p, q] = [score(x), score(y)];
      return p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
    });
  const shown = all ? options : options.slice(0, 12);
  const pairWith = (id: string) =>
    act(async () => {
      await adsAPI.pairPhotos(want === 'after' ? [a.id, id] : [id, a.id]);
      onClose();
    }, `Paired: shown together as a before and after.`);
  const upload = (file: File) =>
    act(async () => {
      const big = tooBig(file);
      if (big) throw new Error(big);
      setSendingPct(0);
      try {
        const ready = await prepareAsset(file);
        const id = await sendPreparedAsset(
          ready,
          { tags: [...(work ? [work] : []), want], trade, job: a.jobId ? { jobId: a.jobId } : undefined },
          (x) => setSendingPct(Math.round(x * 100)),
        );
        await adsAPI.pairPhotos(want === 'after' ? [a.id, id] : [id, a.id]);
      } finally {
        setSendingPct(null);
      }
      onClose();
    }, `Uploaded and paired: shown together as a before and after.`);
  return (
    <Dialog title={`Add its ${want}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <img src={a.thumbUrl ?? a.posterUrl ?? a.url} alt={a.fileName} className="w-20 h-20 rounded object-cover bg-[#1d1d1d] flex-none" />
          <p className="text-sm text-gray-400">
            The {want === 'after' ? 'before' : 'after'}
            {work ? ` · ${workLabel(trade, work)}` : ''}. Upload its {want}, or pick it below.
          </p>
        </div>
        <label className={`${primary} w-full justify-center cursor-pointer ${sendingPct !== null ? 'opacity-60 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" /> {sendingPct !== null ? `Sending… ${sendingPct}%` : `Upload the ${want}`}
          <input
            type="file"
            accept="image/*"
            aria-label={`Upload the ${want}`}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f);
            }}
          />
        </label>
        {options.length === 0 ? (
          <p className="text-sm text-gray-500">No {want}s without a {want === 'after' ? 'before' : 'after'} in the library yet.</p>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-300">Or pick it from the library</h3>
            <ul className="grid gap-2 grid-cols-3 sm:grid-cols-4" aria-label={`${want}s to pick`}>
              {shown.map((x) => (
                <li key={x.id}>
                  <button type="button" aria-label={`Pair with ${x.fileName}`} onClick={() => pairWith(x.id)} className="block w-full rounded overflow-hidden border border-[#2A2A2A] [@media(hover:hover)]:hover:border-[#c9a24a]">
                    <img src={x.thumbUrl ?? x.posterUrl ?? x.url} alt={x.fileName} loading="lazy" className="w-full aspect-square object-cover bg-[#1d1d1d]" />
                  </button>
                </li>
              ))}
            </ul>
            {!all && options.length > shown.length && (
              <button type="button" className="text-sm text-[#e2c578] min-h-[40px]" onClick={() => setAll(true)}>
                Show all {options.length}
              </button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};

const Thumb: React.FC<{ a: AdAsset }> = ({ a }) => {
  const src = a.thumbUrl ?? a.posterUrl ?? (a.kind === 'photo' ? a.url : undefined);
  const [loaded, setLoaded] = useState(false);
  if (!src) return <Picture a={a} className="w-full aspect-square object-cover" />;
  return (
    <div className={`w-full aspect-square bg-[#1d1d1d] ${loaded ? '' : 'animate-pulse'}`}>
      <img
        src={src}
        alt={a.fileName}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};

/**
 * A photo opened on its own: its small copy at once, softened, then the full picture in its place once it has
 * loaded, so the window never opens on an empty box.
 */
const Progressive: React.FC<{ small?: string; full: string; alt: string; className: string; box?: string }> = ({
  small,
  full,
  alt,
  className,
  box = 'relative w-full h-full flex items-center justify-center',
}) => {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(false), [full]);
  return (
    <div className={box} data-testid="progressive" data-ready={ready ? 'yes' : 'no'}>
      {small && !ready && <img src={small} alt="" aria-hidden="true" className={`${className} blur-sm`} />}
      <img
        src={full}
        alt={alt}
        onLoad={() => setReady(true)}
        className={`${className} transition-opacity duration-300 ${ready || !small ? 'opacity-100' : 'opacity-0 absolute inset-0 m-auto'}`}
      />
    </div>
  );
};

const Picture: React.FC<{ a: AdAsset; className: string; play?: boolean }> = ({ a, className, play }) =>
  a.kind === 'photo' && play && a.url ? (
    <Progressive key={a.id} small={a.thumbUrl} full={a.url} alt={a.fileName} className={className} />
  ) : a.kind === 'video' && play && a.url ? (
    <video src={a.url} controls playsInline poster={a.posterUrl} className={`${className} bg-black`} />
  ) : a.posterUrl ? (
    <img src={a.posterUrl} alt={a.fileName} className={className} />
  ) : a.kind === 'video' ? (
    a.url ? (
      // "#t=0.1" asks the browser to show a frame; iPhones and iPads show black without it.
      <video src={`${a.url}#t=0.1`} muted playsInline preload="metadata" className={`${className} bg-black`} />
    ) : (
      <div className={`${className} bg-black`} />
    )
  ) : a.url ? (
    <img src={a.url} alt={a.fileName} className={className} />
  ) : (
    <div className={`${className} bg-black`} />
  );

/** Whether Claude suggests other tags than the file has. */
const suggestsOther = (a: AdAsset) => Boolean(a.suggestedTags?.length) && [...a.suggestedTags!].sort().join(',') !== [...a.tags].sort().join(',');

/** A file in the grid: its picture and what it is tagged, nothing to fill in. Tapping it opens it. */
const AssetTile: React.FC<{ a: AdAsset; jobs: AdJob[]; onOpen: () => void; act: Act; pick?: { on: boolean; toggle: () => void } }> = ({
  a,
  jobs,
  onOpen,
  act,
  pick,
}) => {
  const trade = useTrade();
  const job = jobs.find((j) => j.id === a.jobId);
  return (
    <li
      className={`border rounded bg-[#121212] overflow-hidden ${pick?.on ? 'border-[#7c5cc4] ring-2 ring-[#7c5cc4]' : 'border-[#2A2A2A]'}`}
      data-testid="asset"
    >
      <button
        type="button"
        onClick={pick ? pick.toggle : onOpen}
        aria-label={pick ? `Pick ${a.fileName}` : `Open ${a.fileName}`}
        aria-pressed={pick ? pick.on : undefined}
        className="block w-full text-left"
      >
        <div className="relative">
          <Thumb a={a} />
          {pick && (
            <span
              aria-hidden="true"
              className={`absolute top-1.5 left-1.5 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold ${pick.on ? 'bg-[#7c5cc4] border-[#7c5cc4] text-white' : 'bg-black/50 border-white text-transparent'}`}
            >
              ✓
            </span>
          )}
          {a.kind === 'video' && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white inline-flex items-center gap-1">
              <Film className="w-3 h-3" /> {a.durationSec ? `${Math.round(a.durationSec)}s` : 'clip'}
            </span>
          )}
          {a.uses ? (
            <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-gray-200">
              in {a.uses} ad{a.uses === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <div className="p-2 flex flex-wrap gap-1 min-h-[2.25rem]">
          {job && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[#7c5cc4] text-white">{job.name}</span>}
          {a.tags
            .filter((t) => worksFor(trade).includes(t))
            .map((t) => (
              <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/25 text-amber-200" data-testid="work">
                {workLabel(trade, t)}
              </span>
            ))}
          {a.tags
            .filter((t) => !worksFor(trade).includes(t))
            .map((t) => (
              <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-[#336699]/30 text-sky-200">
                {t}
              </span>
            ))}
          {a.tags.length === 0 && <span className="text-[10px] text-amber-300">No tags yet</span>}
          {a.tags.length > 0 && suggestsOther(a) && (
            <span className="text-[10px] text-sky-300" data-testid="suggested-mark">
              · Claude suggests other tags
            </span>
          )}
          {(a.items ?? []).length > 0 && (
            <span className="w-full text-[11px] text-gray-400 truncate capitalize" data-testid="items">
              {a.items!.join(' · ')}
            </span>
          )}
        </div>
      </button>
      {a.kind === 'video' && (
        <div className="px-2 pb-2">
          <button
            type="button"
            className={`${secondary} text-xs py-1 w-full`}
            onClick={() =>
              act(() => adsAPI.makeFootage(a.id), 'Making a job site ad from this clip. It shows under This week once it is written, then drawn.')
            }
          >
            Make a job site ad
          </button>
        </div>
      )}
    </li>
  );
};

/** Where a photo is in the job, in the owner's words: the before, the work going on, the finish. */
const STAGES: Array<[string, string]> = [
  ['before', 'Before'],
  ['process', 'In progress'],
  ['after', 'After'],
];

/**
 * A photo's types of work changed: its scopes (interior, exterior, cabinets) follow from them, so they aren't picked
 * by hand. With no type of work left, the scopes it had stay.
 */
function withWork(tags: string[], works: string[], trade: string): string[] {
  const t = tradeOf(trade);
  const all = worksFor(trade);
  const rest = tags.filter((x) => !all.includes(x));
  if (works.length === 0) return rest;
  const scopes = [...new Set(works.map((w) => t.works![w].scope))];
  return [...works, ...rest.filter((x) => !t.scopes.includes(x)), ...scopes];
}

/**
 * Tags, picked: the type of work as cards, inside and outside apart; where in the job it is (before, in progress,
 * after) as one switch; and whether the crew is in it. Claude's picks carry a dot. A trade with no types of work
 * picks its kinds of job as plain buttons.
 */
const KindTags: React.FC<{ value: string[]; onChange: (tags: string[]) => void; photo: boolean; label: string; marked?: string[] }> = ({
  value,
  onChange,
  photo,
  label,
  marked = [],
}) => {
  const trade = useTrade();
  const works = worksFor(trade);
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const dot = (t: string, on: boolean) =>
    marked.includes(t) ? <span className={`w-1.5 h-1.5 rounded-full flex-none ${on ? 'bg-[#b08d3c]' : 'bg-[#c9a24a]'}`} aria-label="Claude's pick" /> : null;
  if (works.length === 0)
    return (
      <div className="flex flex-wrap gap-2" aria-label={label}>
        {[...scopesFor(trade), ...(photo ? ['before', 'after'] : [])].map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={value.includes(t)}
            onClick={() => toggle(t)}
            className={`px-3.5 min-h-[40px] text-sm rounded-lg border ${value.includes(t) ? 'bg-white border-white text-black' : 'border-[#333] text-gray-300'}`}
          >
            {t}
          </button>
        ))}
      </div>
    );
  const picked = works.filter((w) => value.includes(w));
  const pickWork = (w: string) => onChange(withWork(value, picked.includes(w) ? picked.filter((x) => x !== w) : [...picked, w], trade));
  const areas: Array<[string, string[]]> = [
    ['Inside', works.filter((w) => tradeOf(trade).works![w].scope !== 'exterior')],
    ['Outside', works.filter((w) => tradeOf(trade).works![w].scope === 'exterior')],
  ];
  const stages = photo ? STAGES : STAGES.filter(([t]) => t === 'process');
  const heading = 'text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500';
  return (
    <div className="space-y-5" aria-label={label}>
      {areas.map(([area, list]) => (
        <div key={area} className="space-y-2">
          <p className={heading}>{area}</p>
          <div className="grid grid-cols-2 gap-2">
            {list.map((w) => {
              const on = picked.includes(w);
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickWork(w)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-4 min-h-[48px] text-left text-[15px] transition-colors ${
                    on ? 'bg-white border-white text-black font-medium' : 'border-[#2E2E2E] bg-[#151515] text-gray-200 [@media(hover:hover)]:hover:border-[#4a4a4a]'
                  }`}
                >
                  <span className="leading-tight">{workLabel(trade, w)}</span>
                  {dot(w, on)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="space-y-2">
        <p className={heading}>Stage</p>
        <div className="grid grid-flow-col auto-cols-fr rounded-lg bg-[#151515] border border-[#2E2E2E] p-1" role="group" aria-label="Stage">
          {stages.map(([t, name]) => {
            const on = value.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t)}
                className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-md text-[15px] ${on ? 'bg-white text-black font-medium' : 'text-gray-300'}`}
              >
                {name}
                {dot(t, on)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#242424] pt-4">
        <span className="text-[15px] text-gray-200">Crew in the shot</span>
        <button
          type="button"
          role="switch"
          aria-checked={value.includes('crew')}
          aria-pressed={value.includes('crew')}
          aria-label="Crew in the shot"
          onClick={() => toggle('crew')}
          className={`relative w-12 h-7 rounded-full transition-colors ${value.includes('crew') ? 'bg-[#c9a24a]' : 'bg-[#2E2E2E]'}`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${value.includes('crew') ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
    </div>
  );
};

/** One file, opened: the photo fills the screen; one bar under it changes its type of work, stage, crew, job and pair. */
const AssetEditor: React.FC<{
  a: AdAsset;
  jobs: AdJob[];
  act: Act;
  /** The before or after this one is paired with. */
  partner?: AdAsset;
  /** A before (or an after) with no other half: opens "Add its after" (or its before). */
  onFindPartner?: () => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** Its place among the files on the page, and the ones either side, to flip to. */
  flip?: { at: number; of: number; prev?: string; next?: string };
  /** The files around it on the page, for the strip of small pictures under the photo. */
  strip?: AdAsset[];
}> = ({ a, jobs, act, partner, onFindPartner, onOpen, onClose, flip, strip }) => {
  // The photo on the left with its stage on it, arrows either side and a strip of the files around it; on the right
  // a panel: Stage, Details (type of work, project, crew), Before & after, then the file and Delete. Every change
  // saves as it's made. The ⓘ button hides the panel, for the photo alone.
  const trade = useTrade();
  const photo = a.kind === 'photo';
  const works = worksFor(trade);
  const claude = a.suggestedTags ?? [];
  const [tags, setTags] = useState(a.tags);
  const [deleting, setDeleting] = useState(false);
  const [mode, setMode] = useState<'read' | 'work' | 'project'>('read');
  const [info, setInfo] = useState(true);
  useEffect(() => {
    setTags(a.tags);
    setDeleting(false);
    setMode('read');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, a.tags.join(',')]);
  const saveTags = (next: string[]) => {
    setTags(next);
    void act(() => adsAPI.tagAsset(a.id, next, undefined, a.note));
  };
  const go = (id?: string) => id && onOpen(id);
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowLeft') goRef.current(flip?.prev);
      if (e.key === 'ArrowRight') goRef.current(flip?.next);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [flip?.prev, flip?.next]);
  const panel = usePanel<HTMLDivElement>(onClose);
  const touch = useRef<number | null>(null);
  const picked = works.filter((w) => tags.includes(w));
  const job = jobs.find((j) => j.id === a.jobId);
  const stages = photo ? STAGES : STAGES.filter(([t]) => t === 'process');
  const stageNames = stages.filter(([t]) => tags.includes(t)).map(([, n]) => n);
  const added = a.createdAt ? new Date(a.createdAt) : null;
  const day = added ? added.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const time = added ? added.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  // The most the photo may take: the screen less the bars (and the panel beside it, or under it on a phone).
  const fit = info
    ? 'max-h-[calc(45dvh-12.5rem)] max-w-[calc(100vw-2rem)] md:max-h-[calc(100dvh-13rem)] md:max-w-[calc(100vw-420px-12rem)]'
    : 'max-h-[calc(100dvh-13rem)] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-12rem)]';
  const title = picked.length ? picked.map((w) => workLabel(trade, w)).join(' + ') : photo ? 'Photo' : 'Clip';
  const head = 'px-6 pt-6 pb-2 text-[13px] tracking-wide uppercase text-gray-400';
  const card = 'mx-4 rounded-xl bg-[#1c1c1e] overflow-hidden';
  const row = 'w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-[16px] text-white border-b border-[#2c2c2e] last:border-b-0';
  const gold = 'text-[#e2b350]';
  const share = async () => {
    const url = a.url ?? a.posterUrl;
    if (!url) return;
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) await nav.share({ title: a.fileName, url }).catch(() => undefined);
    else await act(() => navigator.clipboard.writeText(url), 'Link copied.');
  };
  const listHeader = (name: string) => (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      <button type="button" aria-label="Back" className={`inline-flex items-center gap-0.5 min-h-[40px] pr-2 text-[16px] ${gold}`} onClick={() => setMode('read')}>
        <ChevronLeft className="w-5 h-5" aria-hidden="true" /> Back
      </button>
      <span className="text-[16px] font-medium text-white">{name}</span>
    </div>
  );
  // The other half's slot: its picture (tap to open it), or a dashed "+ Pick before" that finds or uploads it.
  const want: 'before' | 'after' = tags.includes('before') && !tags.includes('after') ? 'after' : 'before';
  const slot = (side: 'before' | 'after') => {
    const mine = side !== want || (!partner && !onFindPartner);
    const pic = mine ? a : partner;
    const label = mine && side === (want === 'after' ? 'before' : 'after') ? `${side === 'before' ? 'Before' : 'After'} · this photo` : side === 'before' ? 'Before' : 'After';
    return (
      <figure className="flex-1 min-w-0 space-y-2 text-center">
        {pic ? (
          <button
            type="button"
            disabled={pic === a}
            onClick={() => onOpen(pic.id)}
            data-testid={pic === a ? undefined : 'pair'}
            aria-label={pic === a ? undefined : `Open its ${side}: ${pic.fileName}`}
            className="block w-full aspect-square rounded-lg overflow-hidden bg-[#2c2c2e]"
          >
            <img src={pic.thumbUrl ?? pic.posterUrl ?? pic.url} alt="" className="w-full h-full object-cover" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onFindPartner}
            className={`w-full aspect-square rounded-lg border-2 border-dashed border-[#48484a] flex flex-col items-center justify-center gap-1 ${gold}`}
          >
            <span className="text-3xl leading-none">+</span>
            <span className="text-[15px] font-medium">Pick {side}</span>
          </button>
        )}
        <figcaption className={`text-[14px] ${mine && pic === a ? 'text-white font-medium' : 'text-gray-400'}`}>{label}</figcaption>
      </figure>
    );
  };
  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={a.fileName}
      className="fixed inset-0 z-[10050] flex flex-col bg-black outline-none"
    >
      <div className="flex-none grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 h-16 bg-[#161618] border-b border-[#2c2c2e]">
        <button type="button" onClick={onClose} aria-label="Close" className={`justify-self-start inline-flex items-center gap-1 min-h-[44px] pr-2 text-[17px] ${gold}`}>
          <ChevronLeft className="w-6 h-6" aria-hidden="true" /> Photos
        </button>
        <div className="text-center min-w-0">
          <p className="text-[17px] font-semibold text-white truncate">{title}</p>
          <p className="text-[13px] text-gray-400" data-testid="flip-place">
            {flip ? `${photo ? 'Photo' : 'Clip'} ${flip.at + 1} of ${flip.of}` : ''}
            {flip && day ? ' · ' : ''}
            {day}
          </p>
        </div>
        <div className="justify-self-end flex items-center gap-1">
          <button type="button" aria-label="Share" className={`${tap} ${gold}`} onClick={() => void share()}>
            <Upload className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label={info ? 'Hide the details' : 'Show the details'}
            aria-pressed={info}
            className={`${tap} rounded-xl ${info ? 'bg-[#3a3020]' : ''} ${gold}`}
            onClick={() => setInfo(!info)}
          >
            <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-[13px] font-bold">i</span>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          <div
            className="relative flex-1 min-h-0 flex items-center justify-center px-4 py-3 sm:py-6 sm:px-24"
            onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              const end = e.changedTouches[0]?.clientX;
              if (start === null || end === undefined || Math.abs(end - start) < 50) return;
              go(end < start ? flip?.next : flip?.prev);
            }}
          >
            {/* Sized to the screen (not the box, whose height a browser may not know), so a tall photo never pushes
                the arrows off; the stage sits on the photo's own corner. */}
            <div className="relative flex">
              {photo && a.url ? (
                <Progressive key={a.id} small={a.thumbUrl} full={a.url} alt={a.fileName} box="relative flex items-center justify-center" className={`${fit} w-auto h-auto object-contain rounded-xl`} />
              ) : (
                <Picture a={a} play className={`${fit} w-auto h-auto object-contain rounded-xl`} />
              )}
              {stageNames.length > 0 && (
                <span className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[13px] font-semibold tracking-wide uppercase text-white">
                  <span className="w-2 h-2 rounded-full bg-[#e2b350]" aria-hidden="true" />
                  {stageNames.join(' + ')}
                </span>
              )}
            </div>
            {flip && (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  disabled={!flip.prev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-[#2c2c2e]/90 text-white flex items-center justify-center disabled:opacity-0"
                  onClick={() => go(flip.prev)}
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  disabled={!flip.next}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-[#2c2c2e]/90 text-white flex items-center justify-center disabled:opacity-0"
                  onClick={() => go(flip.next)}
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
          {strip && strip.length > 1 && (
            <div className="flex-none px-4 py-3 border-t border-[#2c2c2e] overflow-x-auto" aria-label="Photos around this one">
              <div className="flex gap-1.5 w-max mx-auto">
                {strip.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-label={`Open ${x.fileName}`}
                  aria-current={x.id === a.id}
                  onClick={() => onOpen(x.id)}
                  className={`flex-none w-14 h-[72px] rounded-md overflow-hidden bg-[#2c2c2e] ${x.id === a.id ? 'ring-2 ring-white w-[72px]' : 'opacity-60 hover:opacity-100'}`}
                >
                  <img src={x.thumbUrl ?? x.posterUrl ?? (x.kind === 'photo' ? x.url : undefined)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {info && (
          <div className="flex-none md:w-[420px] max-h-[55dvh] md:max-h-none flex flex-col min-h-0 bg-[#161618] border-t md:border-t-0 md:border-l border-[#2c2c2e] overflow-y-auto" aria-label={`Tags for ${a.fileName}`}>
            {mode === 'work' && (
              <div>
                {listHeader('Type of work')}
                <div className={card}>
                  {works.map((w) => (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={picked.includes(w)}
                      className={row}
                      onClick={() => {
                        saveTags(withWork(tags, picked.includes(w) ? picked.filter((x) => x !== w) : [w, ...picked], trade));
                        setMode('read');
                      }}
                    >
                      <span className="flex-1">{workLabel(trade, w)}</span>
                      {picked.includes(w) && <span className={gold}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mode === 'project' && photo && (
              <div>
                {listHeader('Project')}
                <div className="px-4" aria-label={`Project of ${a.fileName}`}>
                  <JobPicker
                    jobs={jobs}
                    value={a.jobId}
                    where={a.fileName}
                    open
                    onPick={(jobId) => {
                      void act(() => adsAPI.setAssetJob(a.id, jobId), jobId ? 'Tagged with the project.' : 'Project tag taken off.');
                      setMode('read');
                    }}
                    onNew={(name) =>
                      act(async () => {
                        const jobId = await adsAPI.addJob(name, trade);
                        await adsAPI.setAssetJob(a.id, jobId);
                      }, `Project "${name}" added and this photo tagged with it.`).then(() => setMode('read'))
                    }
                  />
                </div>
              </div>
            )}
            {mode === 'read' && (
              <>
                <p className={head}>Stage</p>
                <div className="mx-4 grid gap-1 rounded-xl bg-[#1c1c1e] p-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} role="group" aria-label="Stage">
                  {stages.map(([t, name]) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={tags.includes(t)}
                      className={`min-h-[48px] rounded-lg text-[16px] whitespace-nowrap ${tags.includes(t) ? 'bg-[#636366] text-white font-semibold' : 'text-gray-300'}`}
                      onClick={() => saveTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <p className={head}>Details</p>
                <div className={card}>
                  {works.length > 0 && (
                    <button type="button" className={row} onClick={() => setMode('work')} aria-label="Change the type of work">
                      <span className="flex-1">Type of work</span>
                      <span className={picked.length ? 'text-gray-400' : gold}>{picked.length ? picked.map((w) => workLabel(trade, w)).join(', ') : 'Assign'}</span>
                      <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
                    </button>
                  )}
                  {photo && (
                    <button type="button" className={row} onClick={() => setMode('project')} data-testid="row-job">
                      <span className="flex-1">Project</span>
                      <span className={job ? 'text-gray-400 truncate max-w-[60%]' : gold}>{job ? job.name : 'Assign'}</span>
                      <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={row}
                    aria-pressed={tags.includes('crew')}
                    aria-label="Crew in the shot"
                    onClick={() => saveTags(tags.includes('crew') ? tags.filter((x) => x !== 'crew') : [...tags, 'crew'])}
                  >
                    <span className="flex-1">Crew</span>
                    <span className={tags.includes('crew') ? 'text-gray-400' : gold}>{tags.includes('crew') ? 'In the shot' : 'Assign'}</span>
                    <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  </button>
                </div>
                {claude.length > 0 && claude.join(',') !== tags.join(',') && (
                  <button type="button" className={`mx-6 mt-2 min-h-[36px] text-left text-[14px] ${gold}`} onClick={() => saveTags(claude)}>
                    Use Claude&apos;s tags
                  </button>
                )}
                {photo && (partner || onFindPartner) && (
                  <>
                    <p className={head}>Before &amp; after</p>
                    <div className={`${card} p-4 space-y-4`}>
                      <div className="flex gap-4">
                        {slot('before')}
                        {slot('after')}
                      </div>
                      <p className="text-[14px] text-gray-400">
                        {partner ? 'Shown together as a before and after in ads.' : `Link ${want === 'after' ? 'an after' : 'a before'} shot to use this pair in ads.`}
                      </p>
                    </div>
                  </>
                )}
                {a.kind === 'video' && !a.posterUrl && a.url && (
                  <button
                    type="button"
                    className={`${secondary} mx-4 mt-4`}
                    onClick={() =>
                      act(async () => {
                        const { still, durationSec } = await stillOfClip(a.url!, true);
                        if (!still) throw new Error("This device couldn't read a frame of the clip. Try it from a computer, or upload it again.");
                        await adsAPI.setPoster(a.id, await putFile(still, 'image/jpeg'), durationSec);
                        const thumb = await thumbOf(still);
                        if (thumb) await adsAPI.setThumb(a.id, await putFile(thumb, 'image/jpeg'));
                      }, 'Still made. Claude is looking at the clip and will suggest its tags.')
                    }
                  >
                    Make its still
                  </button>
                )}
                <div className="mt-auto pt-8 pb-4 space-y-3">
                  <p className="px-6 text-center text-[14px] text-gray-500 truncate">
                    {a.fileName}
                    {added ? ` · Added ${day}, ${time}` : ''}
                  </p>
                  {deleting ? (
                    <div className="mx-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-3" role="alertdialog" aria-label={`Delete ${a.fileName}?`}>
                      <p className="text-[15px] text-white">
                        Delete this {photo ? 'photo' : 'clip'} for good?{a.uses ? ` It's been used in ${a.uses} ad${a.uses === 1 ? '' : 's'}.` : ''}
                      </p>
                      <div className="flex gap-2">
                        <button type="button" className="flex-1 min-h-[44px] rounded-lg border border-[#3a3a3a] text-sm text-gray-200" onClick={() => setDeleting(false)}>
                          Keep it
                        </button>
                        <button
                          type="button"
                          className="flex-1 min-h-[44px] rounded-lg bg-red-600 text-sm font-semibold text-white"
                          onClick={() => {
                            // The next file opens in its place, so deleting a run of bad photos stays quick.
                            const after = flip?.next ?? flip?.prev;
                            void act(() => adsAPI.removeAsset(a.id), 'Deleted.').then(() => (after ? onOpen(after) : onClose()));
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${a.fileName}`}
                      className="mx-4 w-[calc(100%-2rem)] min-h-[52px] rounded-xl bg-[#1c1c1e] inline-flex items-center justify-center gap-2 text-[17px] text-[#ff6b5e]"
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 className="w-5 h-5" /> Delete {photo ? 'photo' : 'clip'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

/** The upload, in its own window: tags and a job for what comes next, the rest under More, then the files. */
/** "New job": a name, then straight on to its photos. */
const NewJob: React.FC<{ act: Act; onClose: () => void; onMade: (jobId: string) => void }> = ({ act, onClose, onMade }) => {
  const trade = useTrade();
  const [name, setName] = useState('');
  return (
    <Dialog title="New project" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = name.trim();
          if (!clean) return;
          void act(async () => onMade(await adsAPI.addJob(clean, trade)), `Project "${clean}" added.`);
        }}
      >
        <Field label="Project name" hint="Your own name for it, like Smith kitchen. It never shows in an ad.">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" className={input} autoFocus />
        </Field>
        <button type="submit" className={`${primary} w-full`} disabled={!name.trim()}>
          Make the project
        </button>
      </form>
    </Dialog>
  );
};

type DriveStatus = {
  setupMissing: string[];
  connected: { email?: string; folderName: string; found: boolean; lastCheckedAt?: string; error?: string } | null;
  imports: Array<{ id: string; name: string; status: 'waiting' | 'working' | 'done' | 'failed'; error?: string; note?: string; updatedAt: string }>;
};

/** What came back from Google's consent screen, said once. */
const DRIVE_BACK: Record<string, string> = {
  connected: 'Google Drive is connected. Clips shared to the "Ad clips" folder come in here on their own.',
  denied: 'Google Drive wasn’t connected: the permission wasn’t given.',
  no_read: 'Google Drive wasn’t connected: tick the box that lets it see your Drive files, then try again.',
  failed: 'Google Drive couldn’t be connected. Try again.',
};

/**
 * Clips without the page open: shared from the iPad to a Google Drive folder, then brought in by the server
 * (convex/adDrive.ts). Connect it here; what's being brought in, and what couldn't be, shows under it.
 */
const DriveFolder: React.FC<{ act: Act }> = ({ act }) => {
  const trade = useTrade();
  const d = useAdDrive<DriveStatus>(trade);
  const [back] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('drive');
    } catch {
      return null;
    }
  });
  if (!d) return null;
  const busy = d.imports.filter((i) => i.status === 'waiting' || i.status === 'working');
  const failed = d.imports.filter((i) => i.status === 'failed');
  const recent = d.imports.filter((i) => i.status === 'done').slice(0, 3);
  const box = 'rounded-xl border border-[#2A2A2A] bg-[#111] p-4 space-y-3';
  return (
    <section className={box} aria-label="Google Drive folder">
      {back && DRIVE_BACK[back] && <p className={`text-sm ${back === 'connected' ? 'text-emerald-300' : 'text-amber-300'}`}>{DRIVE_BACK[back]}</p>}
      {!d.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[16rem]">
            <p className="text-[15px] font-medium text-white">Upload with the page closed</p>
            <p className="text-sm text-gray-400">
              Share clips from your iPad to a Google Drive folder named <span className="text-gray-200">Ad clips</span>. The Drive app keeps uploading in the
              background, and they come in here on their own: made smaller, tagged by Claude.
            </p>
            {d.setupMissing.length > 0 && <p className="text-xs text-amber-300 mt-1">Not set up on the server yet: {d.setupMissing.join(' and ')}.</p>}
          </div>
          <button
            type="button"
            className={primary}
            disabled={d.setupMissing.length > 0}
            onClick={() =>
              act(async () => {
                window.location.href = await adsAPI.driveConnect(trade);
              })
            }
          >
            Connect Google Drive
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-white font-medium">Google Drive · {d.connected.folderName}</span>
            {d.connected.email && <span className="text-gray-500">{d.connected.email}</span>}
            <span className="text-gray-500" data-testid="drive-checked">
              {d.connected.lastCheckedAt ? `checked ${ago(d.connected.lastCheckedAt)}` : 'checking…'}
            </span>
            <button type="button" className="ml-auto text-sm text-gray-500 hover:text-gray-300" onClick={() => act(() => adsAPI.driveDisconnect(trade), 'Google Drive disconnected.')}>
              Disconnect
            </button>
          </div>
          {d.connected.error && <p className="text-sm text-amber-300">{d.connected.error}</p>}
          {busy.length > 0 && (
            <p className="text-sm text-gray-300" data-testid="drive-busy">
              Bringing in {busy.length} clip{busy.length === 1 ? '' : 's'}: {busy.map((i) => i.name).join(', ')}. They show here once ready.
            </p>
          )}
          {recent.length > 0 && busy.length === 0 && (
            <p className="text-sm text-gray-500">
              Latest from Drive: {recent.map((i) => i.name).join(', ')}
              {recent.some((i) => i.note) ? ' (some without sound: it couldn’t be read)' : ''}.
            </p>
          )}
          {failed.map((i) => (
            <p key={i.id} className="text-sm text-amber-300 flex flex-wrap items-center gap-2" data-testid="drive-failed">
              <span>
                {i.name} couldn’t come in: {i.error}
              </span>
              <button type="button" className="underline text-gray-300" onClick={() => act(() => adsAPI.driveRetry(i.id), 'Trying it again.')}>
                Try again
              </button>
            </p>
          ))}
          {busy.length === 0 && failed.length === 0 && recent.length === 0 && !d.connected.error && (
            <p className="text-sm text-gray-500">Share clips to the {d.connected.folderName} folder in Google Drive; they come in here within about 10 minutes.</p>
          )}
        </>
      )}
    </section>
  );
};

type Sending = {
  name: string;
  at: number;
  of: number;
  pct: number;
  step: 'shrinking' | 'sending';
  /** The next file, being made ready while this one is sent. */
  next?: { name: string; at: number; pct: number };
};

/** A file on its way: which, of how many, and how far along. */
const SendingBar: React.FC<{ s: Sending }> = ({ s }) => (
  <div className="rounded-lg border border-[#2A2A2A] bg-[#141414] px-4 py-3 space-y-2" role="status" data-testid="sending">
    <div className="flex items-center gap-3 text-sm">
      <span className="flex-1 min-w-0 truncate text-gray-200">
        {s.step === 'shrinking' ? 'Making a smaller copy of' : 'Uploading'} {s.name}
        {s.of > 1 ? ` (${s.at} of ${s.of})` : ''}
      </span>
      <span className="font-mono text-gray-400">{s.pct}%</span>
    </div>
    <div className="h-1.5 rounded-full bg-[#2A2A2A] overflow-hidden">
      <div className="h-full bg-[#c9a24a] transition-all" style={{ width: `${s.pct}%` }} />
    </div>
    {s.next && (
      <p className="text-xs text-gray-400" data-testid="sending-next">
        Meanwhile, making a smaller copy of {s.next.name} ({s.next.at} of {s.of}) · {s.next.pct}%
      </p>
    )}
    <p className="text-xs text-gray-500">
      {s.step === 'shrinking'
        ? 'A big clip is made at 1080p on this device first, so it sends in a fraction of the time. Keep this page open.'
        : 'Keep this page open until it’s sent. Once it is, you can leave: the rest happens on the server.'}
    </p>
  </div>
);

const AddFiles: React.FC<{
  jobs: AdJob[];
  act: Act;
  onClose: () => void;
  startJob?: string;
  send: (files: File[], tags: string[], jobId?: string) => Promise<void>;
  sending: Sending | null;
}> = ({ jobs, act, onClose, startJob, send, sending }) => {
  const trade = useTrade();
  // Nothing lit up by default: an upload with no tags takes the tags Claude suggests.
  const [tags, setTags] = useState<string[]>([]);
  const [jobId, setJobId] = useState(startJob ?? '');
  const into = startJob ? jobs.find((j) => j.id === startJob) : undefined;
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    await act(
      async () => {
        // A job is for photos: a clip goes up without one (send leaves it off).
        await send(Array.from(files), tags, jobId || undefined);
        onClose();
      },
      `✓ ${files.length === 1 ? 'Sent' : `All ${files.length} sent`}. You can leave this page: Claude tags ${files.length === 1 ? 'it' : 'them'} in the background.`,
    );
    setBusy(false);
  };
  return (
    <Dialog title={into ? `Add photos to ${into.name}` : 'Add photos or clips'} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-400">Just pick them: Claude looks at each one and sorts it by type of work. Nothing to fill in.</p>
        {sending && <SendingBar s={sending} />}
        <label className={`${primary} w-full cursor-pointer min-h-[52px]`}>
          <Upload className="w-4 h-4" /> {busy ? (sending ? `Uploading… ${sending.pct}%` : 'Uploading…') : 'Choose files'}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            aria-label="Upload photos or clips"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        <details className="text-sm" open={Boolean(startJob)}>
          <summary className="cursor-pointer text-gray-400">Tag them yourself (optional)</summary>
          <div className="mt-3 space-y-4">
            <p className="text-xs text-gray-500">Only if you want: what you pick here goes on every file in this upload, instead of Claude&apos;s.</p>
            <KindTags value={tags} onChange={setTags} photo label="Tags for the next upload" />
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Project (photos only)</p>
              <div>
                <JobPicker
                  jobs={jobs}
                  value={jobId}
                  where="the next upload"
                  onPick={(id) => setJobId(id ?? '')}
                  onNew={(name) => act(async () => setJobId(await adsAPI.addJob(name, trade)), `Project "${name}" added. The next upload is tagged with it.`)}
                />
              </div>
            </div>
          </div>
        </details>
      </div>
    </Dialog>
  );
};

/**
 * Which job a photo is from, made for a finger: the job shown as one wide row; tapping it opens the jobs as a list
 * of big rows (newest first), with "No job" and a new one by name. Picking one closes the list. Open from the start
 * where a job is the only thing being asked (the bar for picked photos).
 */
const JobPicker: React.FC<{
  jobs: AdJob[];
  value?: string;
  onPick: (jobId?: string) => void;
  onNew: (name: string) => Promise<unknown>;
  where: string;
  open?: boolean;
}> = ({ jobs, value, onPick, onNew, where, open: startOpen = false }) => {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState('');
  const current = jobs.find((j) => j.id === value);
  const row = 'w-full min-h-[48px] px-4 flex items-center gap-3 text-left text-[15px] rounded-lg';
  const pick = (jobId?: string) => {
    onPick(jobId);
    if (!startOpen) setOpen(false);
  };
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Change the project for ${where}`}
        className={`${row} border ${current ? 'border-[#7c5cc4] bg-[#7c5cc4]/15 text-white' : 'border-[#333] text-gray-300'}`}
      >
        <span className={`w-3 h-3 rounded-full flex-none ${current ? 'bg-[#7c5cc4]' : 'border border-gray-500'}`} aria-hidden="true" />
        <span className="flex-1 truncate">{current ? current.name : 'No project'}</span>
        <span className="text-sm text-[#c9b8f0]">Change</span>
      </button>
    );
  return (
    <div className="rounded-lg border border-[#333] bg-[#141414] overflow-hidden" aria-label={`Projects for ${where}`}>
      <form
        className="flex gap-2 p-2 border-b border-[#2A2A2A]"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = name.trim();
          if (!clean) return;
          void onNew(clean).then(() => {
            setName('');
            if (!startOpen) setOpen(false);
          });
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project, e.g. Smith kitchen"
          aria-label={`New project for ${where}`}
          className={`${input} min-h-[44px] flex-1 min-w-0`}
        />
        <button type="submit" className={`${primary} min-h-[44px]`} disabled={!name.trim()}>
          Add
        </button>
      </form>
      <ul className="max-h-[40dvh] overflow-y-auto divide-y divide-[#222]">
        {jobs.map((j) => (
          <li key={j.id}>
            <button
              type="button"
              aria-pressed={value === j.id}
              aria-label={`Project ${j.name} for ${where}`}
              onClick={() => pick(value === j.id && startOpen ? undefined : j.id)}
              className={`${row} rounded-none ${value === j.id ? 'bg-[#7c5cc4]/20 text-white' : 'text-gray-200 [@media(hover:hover)]:hover:bg-[#1d1d1d]'}`}
            >
              <span className={`w-3 h-3 rounded-full flex-none ${value === j.id ? 'bg-[#7c5cc4]' : 'bg-[#7c5cc4]/40'}`} aria-hidden="true" />
              <span className="flex-1 truncate">{j.name}</span>
              <span className="text-xs text-gray-500">
                {j.photos} photo{j.photos === 1 ? '' : 's'}
              </span>
              {value === j.id && <span className="text-[#c9b8f0]">✓</span>}
            </button>
          </li>
        ))}
        {!startOpen && (
          <li>
            <button type="button" onClick={() => pick(undefined)} aria-pressed={!value} className={`${row} rounded-none text-gray-400`}>
              <span className="w-3 h-3 rounded-full flex-none border border-gray-500" aria-hidden="true" />
              <span className="flex-1">No project</span>
              {!value && <span>✓</span>}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
};

/** One job's photos together, with its name to change and a way to take the job away (its photos stay). */
const JobGroup: React.FC<{ job: AdJob; assets: AdAsset[]; act: Act; children: React.ReactNode }> = ({ job, assets, act, children }) => {
  const [name, setName] = useState<string | null>(null);
  const hasBefore = assets.some((a) => a.tags.includes('before'));
  const hasAfter = assets.some((a) => a.tags.includes('after'));
  // Claude's matches of a before with the after of the same spot.
  const pairs = new Set(assets.flatMap((a) => (a.pairKey && assets.filter((b) => b.pairKey === a.pairKey).length === 2 ? [a.pairKey] : []))).size;
  return (
    <section className="space-y-2 border border-[#2A2A2A] rounded p-3" aria-label={`Project ${job.name}`} data-testid="job">
      <div className="flex flex-wrap items-center gap-2">
        {name === null ? (
          <h3 className="text-sm font-semibold text-white">{job.name}</h3>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => adsAPI.renameJob(job.id, name), 'Project renamed.').then(() => setName(null));
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" className={`${input} text-sm py-1`} />
            <button type="submit" className={`${primary} text-xs py-1`}>
              Save
            </button>
          </form>
        )}
        <span className="text-xs text-gray-500">
          {assets.length} photo{assets.length === 1 ? '' : 's'}
          {assets.length > 0 &&
            (pairs > 0
              ? ` · ${pairs} before/after pair${pairs === 1 ? '' : 's'}`
              : hasBefore && hasAfter
                ? ' · before and after'
                : hasAfter
                  ? ' · no before yet'
                  : hasBefore
                    ? ' · no finish yet'
                    : ' · tag a before and an after')}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          {name === null && (
            <button type="button" className="text-gray-400 underline" onClick={() => setName(job.name)}>
              Rename
            </button>
          )}
          <button
            type="button"
            className="text-gray-400 hover:text-red-300 underline"
            onClick={() => act(() => adsAPI.removeJob(job.id), 'Project taken away. Its photos stay in the library.')}
          >
            Take away job
          </button>
        </span>
      </div>
      {assets.length < 3 && (
        <p className="text-xs text-gray-500">A story is told from one project once it has 3 photos or more.</p>
      )}
      <ul className={grid}>{children}</ul>
    </section>
  );
};

const EMPTY_HOOK = { family: 'before_after', scope: 'cabinets', trade: 'painting', textEn: '', active: true };

type HookDraft = typeof EMPTY_HOOK;
/** A blank hook for a trade: painting's starts on cabinets as it always has, another trade's on its first subject. */
const emptyHook = (trade: string): HookDraft => (trade === DEFAULT_TRADE ? EMPTY_HOOK : { ...EMPTY_HOOK, trade, scope: tradeOf(trade).scopes[0] ?? 'general' });

const Hooks: React.FC<{ act: Act; initial?: HookDraft }> = ({ act, initial }) => {
  const trade = useTrade();
  const hooks = useAdsHooks<AdHook[]>(trade);
  const [draft, setDraft] = useState<{ id?: string } & HookDraft>(initial ?? emptyHook(trade));
  // Switching trade starts the form over: a half-written painting hook isn't saved as a hardscaping one.
  useEffect(() => {
    setDraft((d) => (d.trade === trade ? d : emptyHook(trade)));
  }, [trade]);
  const set = (k: keyof typeof EMPTY_HOOK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const save = () => act(() => adsAPI.saveHook(draft).then(() => setDraft(emptyHook(trade))), 'Hook saved.');
  if (hooks === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        The ideas an ad is built on. Every competitor ad in Competitors becomes one, and a batch writes the longest-running ones first, each ad
        built around the competitor ad it came from. The ones you write yourself come after. Wins and losses come from how each idea's ads did
        against the batch.
      </p>
      {hooks.length === 0 && trade === DEFAULT_TRADE && (
        <button type="button" className={secondary} onClick={() => act(() => adsAPI.seedHooks(), 'Six painting hooks added.')}>
          Add the six painting hooks
        </button>
      )}
      <form
        className="border border-[#2A2A2A] rounded p-4 grid gap-3 sm:grid-cols-2"
        aria-label={draft.id ? 'Edit hook' : 'New hook'}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Type of angle">
          <select value={draft.family} onChange={set('family')} className={input}>
            {FAMILIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Room or subject">
          <select value={draft.scope} onChange={set('scope')} className={input}>
            {[...scopesFor(trade), 'general'].map((s) => (
              <option key={s} value={s}>
                {scopeLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Hook">
            <textarea value={draft.textEn} onChange={set('textEn')} rows={2} className={input} />
          </Field>
        </div>
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" className={primary} disabled={draft.textEn.trim().length < 10}>
            {draft.id ? 'Save hook' : 'Add hook'}
          </button>
          {draft.id && (
            <button type="button" className={secondary} onClick={() => setDraft(emptyHook(trade))}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Hooks">
        {hooks.map((h) => (
          <li key={h.id} className="px-4 py-3 flex flex-wrap items-start gap-3" data-testid="hook">
            <div className="flex-1 min-w-[14rem]">
              <p className="text-xs text-gray-500">
                {h.familyLabel} · {scopeLabel(h.scope)} · used {h.uses} · {h.wins} won · {h.losses} lost
              </p>
              <p className={`text-sm ${h.active ? 'text-white' : 'text-gray-500'}`}>{h.textEn}</p>
              {h.basedOn && <p className="text-xs text-emerald-300">From {sourceLine(h.basedOn)}</p>}
            </div>
            <label className="text-xs text-gray-300 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={h.active}
                onChange={(e) =>
                  act(() =>
                    adsAPI.saveHook({
                      id: h.id,
                      family: h.family,
                      scope: h.scope,
                      trade: h.trade,
                      textEn: h.textEn,
                      active: e.target.checked,
                    }),
                  )
                }
              />{' '}
              active
            </label>
            <button
              type="button"
              className="text-xs text-gray-400 underline"
              onClick={() => setDraft({ id: h.id, family: h.family, scope: h.scope, trade: h.trade, textEn: h.textEn, active: h.active })}
            >
              Edit
            </button>
            <button
              type="button"
              aria-label={`Remove hook ${h.textEn.slice(0, 20)}`}
              className="text-gray-500 hover:text-red-300"
              onClick={() => act(() => adsAPI.removeHook(h.id))}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export interface Swipe {
  id: string;
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
  starred: boolean;
  source: string;
  pageLikes?: number;
  daysRunning?: number;
  variants?: number;
  title?: string;
  landing?: string;
  imageUrl?: string;
  posterUrl?: string;
  mediaType?: string;
  family?: string;
  claims?: string[];
  opening?: string;
  footage?: string[];
  quality?: number;
  local?: boolean;
  tagError?: string;
  score?: number;
}

const readText = (file: File) =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

/** Competitor ads kept for inspiration: browse, star, turn an angle into a hook, import more research. */
const runLine = (r: ResearchRun) => {
  const when = new Date(r.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (r.error) return `${when} · stopped: ${r.error}`;
  if (!r.finishedAt) return `${when} · searching ${r.keywords.join(', ')}…`;
  return `${when} · scanned ${r.scanned} · ${r.kept} past the bar · ${r.added} new${r.junk ? ` · ${r.junk} junk dropped` : ''}${
    r.unreadable ? ` · ${r.unreadable} unreadable` : ''
  }`;
};

const FOOTAGE_LABELS: Record<string, string> = {
  owner_to_camera: 'owner to camera',
  before_after: 'before / after',
  process: 'process',
  crew: 'crew',
  finished: 'finished work',
  graphic: 'graphic',
};

/** The playbooks: what the long-running ads in each scope have in common, editable, rewritable. */
const Playbooks: React.FC<{ act: Act }> = ({ act }) => {
  const playbooks = useAdsPlaybooks<Playbook[]>();
  const [editing, setEditing] = useState<{ scope: string; text: string } | null>(null);
  if (!playbooks || playbooks.length === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-3" aria-label="Playbooks">
      {playbooks.map((p) => (
        <section key={p.scope} className="border border-[#2A2A2A] rounded p-4 space-y-2 text-sm" data-testid="playbook">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 text-white font-medium">What works: {scopeLabel(p.scope).toLowerCase()}</h3>
            <span className="text-xs text-gray-500">
              {p.basis.ads} ads{p.basis.local ? ` · ${p.basis.local} local` : ''}
              {p.editedAt ? ' · edited' : ''}
            </span>
          </div>
          {editing?.scope === p.scope ? (
            <form
              aria-label={`Edit what works: ${scopeLabel(p.scope).toLowerCase()}`}
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  () => adsAPI.savePlaybook(p.scope, editing.text).then(() => setEditing(null)),
                  'Playbook saved. It holds until you ask for a rewrite.',
                );
              }}
              className="space-y-2"
            >
              <textarea value={editing.text} onChange={(e) => setEditing({ scope: p.scope, text: e.target.value })} rows={8} className={input} />
              <div className="flex gap-2">
                <button type="submit" className={primary}>
                  Save
                </button>
                <button type="button" className={secondary} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <p className="whitespace-pre-wrap text-gray-200">{p.text}</p>
          )}
          {p.footagePrefs.length > 0 && (
            <p className="text-xs text-gray-400">
              <span className="text-gray-500">Footage the winners use: </span>
              {p.footagePrefs.join(', ')}
            </p>
          )}
          {p.missingFootage.length > 0 && (
            <ul className="text-xs text-amber-300 list-disc pl-4" aria-label="Footage you're missing">
              {p.missingFootage.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {p.localCompetitors.length > 0 && (
            <p className="text-xs text-gray-400">
              <span className="text-gray-500">Advertising in your markets: </span>
              {p.localCompetitors.map((c) => `${c.company} (${c.angle}${c.daysRunning ? `, ${c.daysRunning} days` : ''})`).join('; ')}
            </p>
          )}
          {editing?.scope !== p.scope && (
            <div className="flex gap-2 text-xs">
              <button type="button" className={secondary} onClick={() => setEditing({ scope: p.scope, text: p.text })}>
                Edit
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() => act(() => adsAPI.rewritePlaybook(p.scope), `Claude is rewriting what works for ${scopeLabel(p.scope).toLowerCase()}.`)}
              >
                Rewrite
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
};

/** The newest research run, when there has been one. */
const lastRunOf = (runs: ResearchRun[] | undefined): ResearchRun | undefined => runs?.[0];

/**
 * Each trade's competitor ads. Painting's page also has its playbooks and the older ways in (the October research,
 * the sheet's CSVs); another trade's starts empty, with the owner's button to search for its ads.
 */
const Swipes: React.FC<{ act: Act; owner: boolean; onMakeHook: (draft: HookDraft) => void }> = ({ act, owner, onMakeHook }) => {
  const trade = useTrade();
  const painting = trade === DEFAULT_TRADE;
  const swipes = useAdsSwipes<Swipe[]>(painting ? undefined : trade);
  const runs = useAdsResearchRuns<ResearchRun[]>();
  const settings = useAdsSettings<AdSettings>();
  const minDays = settings?.researchMinDays ?? 90;
  const [type, setType] = useState('All');
  const [onlyLocal, setOnlyLocal] = useState(false);
  const [onlyLong, setOnlyLong] = useState(false);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importCsv = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    try {
      const texts = await Promise.all(Array.from(files).map(readText));
      const { rows } = mergeSwipeCsvs(texts);
      const source = Array.from(files)
        .map((f) => f.name.replace(/\.csv$/i, ''))
        .join(', ');
      await act(async () => {
        const { added, updated } = await adsAPI.importSwipes(rows as unknown as Record<string, unknown>[], source);
        setImported(`${rows.length} ads read from ${files.length} file${files.length === 1 ? '' : 's'}: ${added} added, ${updated} updated.`);
      });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  if (swipes === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  const searchButton = owner && (
    <button
      type="button"
      className={primary}
      disabled={Boolean(lastRunOf(runs) && !lastRunOf(runs)!.finishedAt)}
      onClick={() =>
        act(
          () => adsAPI.researchNow(painting ? undefined : trade),
          'Searching the niche. The new ads and the playbooks land here as Claude reads them.',
        )
      }
    >
      Search the niche
    </button>
  );
  if (!painting && swipes.length === 0)
    return (
      <div className="border border-dashed border-[#333] rounded p-8 text-center space-y-3">
        <p className="text-sm text-gray-300">No competitor ads on file for {tradeOf(trade).label.toLowerCase()} yet.</p>
        <p className="text-sm text-gray-500">
          Search the niche pulls this trade&apos;s ads still running after months from Meta&apos;s Ad Library, and Claude reads each one.
        </p>
        {(searchButton || lastRunOf(runs)) && (
          <div className="flex flex-wrap gap-2 items-center justify-center">
            {searchButton}
            {lastRunOf(runs) && <span className="text-xs text-gray-400">{runLine(lastRunOf(runs)!)}</span>}
          </div>
        )}
      </div>
    );
  const types = ['All', ...Array.from(new Set(swipes.map((x) => x.paintingType))).sort()];
  const needle = search.trim().toLowerCase();
  const shown = swipes.filter(
    (x) =>
      (type === 'All' || x.paintingType === type) &&
      (!onlyLocal || x.local) &&
      (!onlyLong || (x.daysRunning ?? 0) >= minDays) &&
      (!needle || [x.company, x.hook, x.offer, x.creative, x.adaptation, x.adCopy ?? '', x.area].join(' ').toLowerCase().includes(needle)),
  );
  const lastRun = runs?.[0];
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Competitor ads, kept here for inspiration. "Search the niche" pulls the ads still running after months from Meta's Ad Library; Claude reads
        each one and writes a playbook per category that the Monday writer follows. Star the ones you like: they lead the examples the writer sees, as
        tone and shape, never as claims. "Make a hook" starts a hook from an ad's angle.
      </p>
      {painting && <Playbooks act={act} />}
      <div className="flex flex-wrap gap-2 items-center">
        {searchButton}
        {lastRun && (
          <span className="text-xs text-gray-400" data-testid="research-run">
            {runLine(lastRun)}
          </span>
        )}
      </div>
      {painting && (
      <details className="text-xs text-gray-400" open={swipes.length === 0}>
        <summary className="cursor-pointer">Other ways to add ads</summary>
        <div className="flex flex-wrap gap-2 items-center mt-2">
          {swipes.length === 0 && (
            <button type="button" className={secondary} onClick={() => act(() => adsAPI.seedSwipes(), 'The October 10 research is in.')}>
              Load the October 10 research
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            aria-label="Import research CSV files"
            className="text-xs text-gray-400"
            disabled={importing}
            onChange={(e) => void importCsv(e.target.files)}
          />
          <span className="text-xs text-gray-500">Download each tab of the research sheet as CSV and pick them all at once.</span>
        </div>
      </details>
      )}
      {imported && (
        <p role="status" className="text-sm text-emerald-300">
          {imported}
        </p>
      )}
      {swipes.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div role="group" aria-label={painting ? 'Painting type' : 'Job type'} className="flex gap-1 flex-wrap">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`px-2 py-1 text-xs rounded border ${type === t ? 'border-white text-white' : 'border-[#333] text-gray-400'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={onlyLocal}
            onClick={() => setOnlyLocal((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${onlyLocal ? 'border-emerald-400 text-emerald-300' : 'border-[#333] text-gray-400'}`}
          >
            Local
          </button>
          <button
            type="button"
            aria-pressed={onlyLong}
            onClick={() => setOnlyLong((v) => !v)}
            className={`px-2 py-1 text-xs rounded border ${onlyLong ? 'border-white text-white' : 'border-[#333] text-gray-400'}`}
          >
            {minDays}+ days
          </button>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, angle, offer, copy"
            aria-label="Search the swipe file"
            className={`${input} max-w-xs`}
          />
          <span className="text-xs text-gray-500">
            {shown.length} of {swipes.length}
          </span>
        </div>
      )}
      <ul className="space-y-3" aria-label="Swipe file">
        {shown.map((x) => (
          <li key={x.id} className="border border-[#2A2A2A] rounded p-4 space-y-2" data-testid="swipe">
            <div className="flex items-start gap-2">
              {(x.posterUrl || x.imageUrl) && (
                <img src={x.posterUrl ?? x.imageUrl} alt="" className="w-16 h-16 object-cover rounded bg-[#111] flex-none" loading="lazy" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">
                  {x.company} · {x.paintingType}
                  {x.area ? ` · ${x.area}` : ''}
                  {x.startedAt ? ` · since ${x.startedAt}` : ''}
                  {x.daysRunning ? ` · ${x.daysRunning} days` : ''}
                  {x.variants && x.variants > 1 ? ` · ${x.variants} versions` : ''}
                  {x.pageLikes ? ` · ${x.pageLikes.toLocaleString('en-US')} page likes` : ''}
                </p>
                <p className="text-sm text-white font-medium">
                  {x.local && <span className={`${chip} text-emerald-300 border-emerald-900 mr-1`}>Local</span>}
                  {x.hook}
                </p>
                {(x.family || x.opening || x.footage?.length) && (
                  <p className="text-xs text-gray-500">
                    {[
                      x.family ? FAMILIES.find(([v]) => v === x.family)?.[1] : '',
                      x.opening ? `Opens with: ${OPENING_LABELS[x.opening] ?? x.opening}` : '',
                      x.footage?.length ? x.footage.map((f) => FOOTAGE_LABELS[f] ?? f).join(', ') : '',
                      x.score !== undefined ? `fit ${x.score}/100` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {x.tagError && <p className="text-xs text-amber-300">Claude couldn't read this one: {x.tagError}</p>}
              </div>
              <button
                type="button"
                className={`${tap} ${x.starred ? 'text-amber-300' : 'text-gray-500'}`}
                aria-label={x.starred ? `Unstar ${x.company}` : `Star ${x.company}`}
                aria-pressed={x.starred}
                onClick={() => act(() => adsAPI.starSwipe(x.id, !x.starred))}
              >
                <Star size={18} fill={x.starred ? 'currentColor' : 'none'} />
              </button>
            </div>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[6rem_1fr] text-sm">
              <dt className="text-gray-500">Offer</dt>
              <dd className="text-gray-200">{x.offer}</dd>
              <dt className="text-gray-500">Creative</dt>
              <dd className="text-gray-200">{x.creative}</dd>
              <dt className="text-gray-500">Button</dt>
              <dd className="text-gray-200">{x.cta}</dd>
              <dt className="text-gray-500">For us</dt>
              <dd className="text-gray-200">{x.adaptation}</dd>
              {x.claims && x.claims.length > 0 && (
                <>
                  <dt className="text-gray-500">Never copy</dt>
                  <dd className="text-amber-200/80">{x.claims.join(' · ')}</dd>
                </>
              )}
            </dl>
            {x.adCopy && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-300">Ad copy</summary>
                <p className="whitespace-pre-wrap text-gray-200 mt-1">{x.adCopy}</p>
              </details>
            )}
            {x.transcript && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-300">Script{x.durationSec ? ` · ${Math.round(x.durationSec)}s` : ''}</summary>
                <p className="whitespace-pre-wrap text-gray-200 mt-1">{x.transcript}</p>
              </details>
            )}
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <button
                type="button"
                className={secondary}
                onClick={() =>
                  onMakeHook({
                    ...EMPTY_HOOK,
                    family: familyOfAngle(`${x.hook} ${x.creative}`),
                    scope: x.scope ?? EMPTY_HOOK.scope,
                    textEn: x.hook,
                  })
                }
              >
                Make a hook
              </button>
              {x.metaAdId && (
                <a
                  href={`https://www.facebook.com/ads/library/?id=${encodeURIComponent(x.metaAdId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-gray-300 underline"
                >
                  View in Ad Library <ExternalLink size={12} />
                </a>
              )}
              {x.pageUrl && (
                <a href={x.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gray-300 underline">
                  Their page <ExternalLink size={12} />
                </a>
              )}
              <span className="text-gray-600">{x.source}</span>
              <button
                type="button"
                className={`${tap} text-gray-500 ml-auto`}
                aria-label={`Remove ${x.company}`}
                onClick={() => act(() => adsAPI.removeSwipe(x.id))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Settings: React.FC<{ owner: boolean; act: Act }> = ({ owner, act }) => {
  const s = useAdsSettings<AdSettings>();
  const [form, setForm] = useState<AdSettings | null>(null);
  useEffect(() => {
    if (s && !form) setForm(s);
  }, [s, form]);
  if (!form) return <p className="text-sm text-gray-500">Loading…</p>;
  const text = (k: keyof AdSettings, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        value={(form[k] as string | undefined) ?? ''}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className={input}
        disabled={!owner}
        aria-label={label}
      />
    </Field>
  );
  const key = (ok: boolean, name: string) => (
    <span className={`${chip} ${ok ? 'text-emerald-300 border-emerald-900' : 'text-amber-300 border-amber-900'}`}>
      {name}: {ok ? 'set' : 'missing'}
    </span>
  );
  return (
    <form
      className="space-y-4"
      aria-label="Ad settings"
      onSubmit={(e) => {
        e.preventDefault();
        const rest: Record<string, unknown> = {
          ...form,
          researchKeywords: form.researchKeywords.filter(Boolean),
          researchMarkets: form.researchMarkets.filter(Boolean),
        };
        delete rest.brand;
        delete rest.keys;
        void act(() => adsAPI.saveSettings(rest), 'Settings saved.');
      }}
    >
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-400">Homeowners see the ads as {form.brand}.</span>
        {key(form.keys.anthropic, 'ANTHROPIC_API_KEY')}
        {key(form.keys.elevenlabs, 'ELEVENLABS_API_KEY')}
        {key(form.keys.renderer, 'ADS_RENDER_TOKEN')}
        {key(form.keys.meta, 'META_ACCESS_TOKEN')}
        {key(form.keys.apify, 'APIFY_TOKEN')}
        {form.voiceSource === 'actor' && key(form.keys.bunny, 'BUNNY_STUDIO_TOKEN')}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {text('adAccountId', 'Ad account id', 'Digits only; the act_ prefix is dropped')}
        {text('pageId', 'Page id')}
        {text('leadFormId', 'Instant form id')}
        {text('adsetId', 'Ad set id')}
        {text('voiceId', 'ElevenLabs voice id')}
        {text('primaryColor', 'Brand colour')}
        {text('accentColor', 'Accent colour')}
        <Field label="Ads to write each Monday">
          <input
            type="number" inputMode="decimal"
            min={1}
            max={4}
            value={form.hooksPerWeek}
            onChange={(e) => setForm({ ...form, hooksPerWeek: Number(e.target.value) })}
            className={input}
            disabled={!owner}
            aria-label="Ads to write each Monday"
          />
        </Field>
        <Field label="Most ads running at once">
          <input
            type="number" inputMode="decimal"
            min={2}
            max={12}
            value={form.liveTarget}
            onChange={(e) => setForm({ ...form, liveTarget: Number(e.target.value) })}
            className={input}
            disabled={!owner}
            aria-label="Most ads running at once"
          />
        </Field>
      </div>
      <label className="text-sm text-gray-300 inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.weeklyEnabled}
          onChange={(e) => setForm({ ...form, weeklyEnabled: e.target.checked })}
          disabled={!owner}
        />{' '}
        Draft a batch every Monday
      </label>
      <label className="text-sm text-gray-300 inline-flex items-center gap-2 ml-4">
        <input
          type="checkbox"
          checked={form.tesseractFootage}
          onChange={(e) => setForm({ ...form, tesseractFootage: e.target.checked })}
          disabled={!owner}
          aria-label="Also draw job site videos with Tesseract"
        />{' '}
        Also draw job site videos with Tesseract, to compare
      </label>
      <p className="text-xs text-gray-500">
        Each ad idea becomes one animated video in two sizes. The videos are drawn on GitHub, about three minutes each.{' '}
        {form.keys.renderer
          ? 'The app starts the drawing itself once a batch is voiced.'
          : 'Until ADS_RENDER_TOKEN is set, a batch shows Waiting to render until the drawing is started by hand.'}
      </p>
      <fieldset className="border border-[#2A2A2A] rounded p-4 space-y-3">
        <legend className="text-sm text-gray-300 px-1">Voice</legend>
        <Field label="Who reads the ads">
          <select
            value={form.voiceSource}
            onChange={(e) => setForm({ ...form, voiceSource: e.target.value as AdSettings['voiceSource'] })}
            className={input}
            disabled={!owner}
            aria-label="Who reads the ads"
          >
            <option value="elevenlabs">The ElevenLabs voice (ready in a minute)</option>
            <option value="actor">A real voice actor from Bunny Studio (back in about a day)</option>
          </select>
        </Field>
        {form.voiceSource === 'actor' && (
          <>
            <p className="text-xs text-gray-500">
              Once an ad is written, its lines go to Bunny Studio and a voice actor records them. The app checks every half hour. When the read is
              in, the ad is timed to it and drawn as usual. A read that skips or changes the words is held back, and you ask for a redo in Bunny
              Studio. Each read is paid for at Bunny Studio.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Who reads">
                <select
                  value={form.actorVoice}
                  onChange={(e) => setForm({ ...form, actorVoice: e.target.value })}
                  className={input}
                  disabled={!owner}
                  aria-label="Who reads"
                >
                  {ACTOR_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {ACTOR_VOICE_LABELS[v]}
                    </option>
                  ))}
                </select>
              </Field>
              {text('actorLanguage', 'Language and accent', "Bunny Studio's code, e.g. eng-us")}
            </div>
            <Field label="Notes for the voice actor" hint="How it should sound, e.g. West Texas, easygoing">
              <input
                value={form.actorNotes ?? ''}
                onChange={(e) => setForm({ ...form, actorNotes: e.target.value })}
                className={input}
                disabled={!owner}
                aria-label="Notes for the voice actor"
              />
            </Field>
          </>
        )}
      </fieldset>
      <fieldset className="border border-[#2A2A2A] rounded p-4 space-y-3">
        <legend className="text-sm text-gray-300 px-1">Niche research</legend>
        <p className="text-xs text-gray-500">
          "Search the niche" looks these words up in Meta's Ad Library (US) and keeps the ads still running past the bar. Ads that name one of your
          markets are flagged Local.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Search words" hint="Comma-separated">
            <input
              value={form.researchKeywords.join(', ')}
              onChange={(e) => setForm({ ...form, researchKeywords: e.target.value.split(',').map((w) => w.trim()) })}
              className={input}
              disabled={!owner}
              aria-label="Search words"
            />
          </Field>
          <Field label="Your markets" hint="Comma-separated; the first is home and goes in the ads">
            <input
              value={form.researchMarkets.join(', ')}
              onChange={(e) => setForm({ ...form, researchMarkets: e.target.value.split(',').map((w) => w.trim()) })}
              className={input}
              disabled={!owner}
              aria-label="Your markets"
            />
          </Field>
          <Field label="Days an ad must have run">
            <input
              type="number" inputMode="decimal"
              min={30}
              max={365}
              value={form.researchMinDays}
              onChange={(e) => setForm({ ...form, researchMinDays: Number(e.target.value) })}
              className={input}
              disabled={!owner}
              aria-label="Days an ad must have run"
            />
          </Field>
        </div>
        <label className="text-sm text-gray-300 inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.researchMonthly}
            onChange={(e) => setForm({ ...form, researchMonthly: e.target.checked })}
            disabled={!owner}
          />{' '}
          Search the niche on the 1st of every month
        </label>
      </fieldset>
      {owner && (
        <div>
          <button type="submit" className={primary}>
            Save settings
          </button>
        </div>
      )}
    </form>
  );
};
