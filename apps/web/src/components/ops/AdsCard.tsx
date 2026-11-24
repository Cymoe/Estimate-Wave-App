import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Film, Play, Star, Trash2, Upload } from 'lucide-react';
import { adsAPI } from '../../lib/api';
import { useAdJobs } from '../../lib/live';
import { backfillThumb, isVideo, putFile, stillOfClip, thumbOf, uploadAsset } from '../../lib/adUpload';
import {
  useAdsBatches,
  useAdsHooks,
  useAdsIdeas,
  useAdsLibrary,
  useAdsLive,
  useAdsPlaybooks,
  useAdsReadiness,
  useAdsResearchRuns,
  useAdsSettings,
  useAdsSwipes,
  useAdRequests,
} from '../../lib/live';
import { AD_TRADES, DEFAULT_TRADE, familyOfAngle, mergeSwipeCsvs, tradeOf } from '../../../convex/lib/ads';
import { ACTOR_VOICES, ACTOR_VOICE_LABELS } from '../../../convex/lib/voiceActors';
import { money } from '../market/wallet';
import { Dialog, ErrorLine, Field, ago, describeError, input, primary, secondary, tap } from './ui';

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
  note?: string;
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

type AdRequestRow = { ask: string; createdAt: string; stage: string; link: string };
const STAGE_LABELS: Record<string, string> = {
  reading: 'Reading',
  writing: 'Writing',
  voicing: 'Recording the voice',
  drawing: 'Drawing',
  ready: 'Ready',
  failed: "Couldn't be made",
};

/**
 * "Make an ad for…": one line ("cabinet painting in Odessa") becomes a story, a lesson and a quick offer, each in
 * both sizes, on the competitor ads that fit it. The private link shows them being made, with no login, so it can
 * be opened on a phone or sent on.
 */
const MakeAnAd: React.FC = () => {
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const recent = useAdRequests<AdRequestRow[]>();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ask.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await adsAPI.makeFor(ask);
      setAsk('');
    } catch (err) {
      setError(describeError(err, "That didn't go through"));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      setCopied(null);
    }
  };
  return (
    <section className="border border-[#2A2A2A] rounded p-3 space-y-2" aria-label="Make an ad for">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <label htmlFor="make-an-ad" className="sr-only">
          Make an ad for
        </label>
        <input
          id="make-an-ad"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Make an ad for… cabinet painting in Odessa"
          className={`${input} flex-1 min-w-[200px]`}
          maxLength={300}
        />
        <button type="submit" className={primary} disabled={busy || !ask.trim()}>
          {busy ? 'Starting…' : 'Make it'}
        </button>
      </form>
      <p className="text-xs text-gray-500">A story, a checklist and a quick offer, in both sizes. Each gets a private link to watch it being made, no login needed.</p>
      <ErrorLine error={error} onDismiss={() => setError(null)} />
      {recent && recent.length > 0 && (
        <ul className="space-y-1 text-sm">
          {recent.map((r) => (
            <li key={r.link} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-gray-200">"{r.ask}"</span>
              <span className={`text-xs ${r.stage === 'ready' ? 'text-emerald-300' : r.stage === 'failed' ? 'text-amber-300' : 'text-gray-400'}`}>
                {STAGE_LABELS[r.stage] ?? r.stage} · {ago(r.createdAt)}
              </span>
              <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 underline">
                Open <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <button type="button" onClick={() => copy(r.link)} className="text-xs text-gray-400 underline">
                {copied === r.link ? 'Copied' : 'Copy link'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const AdsCard: React.FC<{ owner: boolean }> = ({ owner }) => {
  const [section, setSection] = useState<Section>('week');
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
  const checks = useAdsReadiness<Readiness[]>();
  const blocked = checks?.find((c) => c.hard && !c.ok);
  return (
    <TradeContext.Provider value={trade}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Trade">
        <span className="text-xs text-gray-500">Trade</span>
        {Object.values(AD_TRADES).map((t) => (
          <button
            key={t.slug}
            type="button"
            aria-pressed={trade === t.slug}
            onClick={() => pickTrade(t.slug)}
            className={`px-3 py-1.5 text-sm rounded border ${trade === t.slug ? 'border-white text-white bg-[#222]' : 'border-[#333] text-gray-400 [@media(hover:hover)]:hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {checks && (
        <div className="border border-[#2A2A2A] rounded px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Ready for Monday">
          <span className={blocked ? 'text-amber-300' : 'text-emerald-300'}>
            {blocked ? `Monday will skip: ${blocked.label}. ${blocked.detail}.` : 'Monday will draft.'}
          </span>
          {checks.map((c) => (
            <button
              key={c.key}
              type="button"
              title={c.detail}
              onClick={() => {
                setSection(c.tab);
                setHookStart(null);
              }}
              className={`inline-flex items-center gap-1 ${c.ok ? 'text-gray-400' : c.hard ? 'text-amber-300' : 'text-gray-500'}`}
            >
              <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span>
              <span className="underline decoration-dotted">{c.label}</span>
              <span className="sr-only">{c.ok ? 'ready' : 'not ready'}</span>
            </button>
          ))}
        </div>
      )}
      <MakeAnAd />
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
  const [view, setView] = useState<'photos' | 'clips'>('photos');
  // The file open in its window (read fresh from the live list, so a change shows at once), and the upload window.
  const [openId, setOpenId] = useState<string | null>(null);
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
  const addHere = (files: File[], jobId?: string) =>
    act(
      async () => {
        for (const f of files) await uploadAsset(f, [], trade, undefined, undefined, jobId && !isVideo(f) ? { jobId } : undefined);
      },
      `${files.length} file${files.length === 1 ? '' : 's'} in the library. Claude is tagging ${files.length === 1 ? 'it' : 'them'}.`,
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-[#1A1A1A] border border-[#2A2A2A] p-1" role="group" aria-label="Show">
          {(
            [
              ['photos', `Photos (${photos.length})`],
              ['clips', `Clips (${clips.length})`],
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
              className={`px-4 py-1.5 rounded-full text-sm ${view === v ? 'bg-[#336699] text-white' : 'text-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'photos' && photos.length > 0 && (
          <button type="button" className={`${secondary} ml-auto`} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
        {view === 'photos' && !selecting && (
          <button type="button" className={`${secondary} ${photos.length > 0 ? '' : 'ml-auto'}`} onClick={() => setNaming(true)}>
            New job
          </button>
        )}
        <button type="button" className={`${primary} ${view === 'photos' ? '' : 'ml-auto'}`} onClick={() => setAdding({})}>
          <Upload className="w-4 h-4" /> Add photos or clips
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {selecting
          ? 'Tap the photos from one job, then tap its job tag below.'
          : view === 'photos'
          ? 'Tap a photo to tag it, or Select to tag several at once. Give one job’s photos the same purple job tag, and a story ad shows that job, before to finish.'
          : 'Video clips from job sites. Tap one to tag it, or make a job site ad from it.'}
      </p>
      {assets === undefined ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : view === 'photos' ? (
        <div className="space-y-5" aria-label="Library">
          {jobs.map((j) => (
            <JobGroup key={j.id} job={j} assets={photos.filter((a) => a.jobId === j.id)} act={act}>
              {photos.filter((a) => a.jobId === j.id).map((a) => tile(a, true))}
              {!selecting && <AddTile label={`Add photos to ${j.name}`} photos onFiles={(files) => addHere(files, j.id)} />}
            </JobGroup>
          ))}
          <section className="space-y-2" aria-label="Not in a job">
            {jobs.length > 0 && <h3 className="text-sm font-semibold text-gray-300">Not in a job</h3>}
            <ul className={grid}>
              {loose.map((a) => tile(a))}
              {!selecting && <AddTile label="Add photos" photos onFiles={(files) => addHere(files)} />}
            </ul>
          </section>
        </div>
      ) : (
        <ul className={grid} aria-label="Clips">
          {clips.map((a) => tile(a))}
          <AddTile label="Add clips" onFiles={(files) => addHere(files)} />
        </ul>
      )}
      {selecting && (
        // Held at the bottom of the screen while photos are picked.
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl rounded-lg border border-[#7c5cc4] bg-[#16121f]/95 p-3 shadow-2xl space-y-2" aria-label="Tag picked photos">
          <p className="text-sm text-white">
            {picked.length === 0 ? 'Tap photos to pick them.' : `${picked.length} photo${picked.length === 1 ? '' : 's'} picked. Tap a job tag to tag them all:`}
          </p>
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <JobTags
                jobs={jobs}
                where="the picked photos"
                onPick={(jobId) => jobId && toJob({ jobId }, jobs.find((j) => j.id === jobId)?.name ?? 'with the job')}
                onNew={(name) => toJob({ name }, name)}
              />
            </div>
          )}
        </div>
      )}
      {open && <AssetEditor a={open} jobs={jobs} act={act} onClose={() => setOpenId(null)} />}
      {adding && <AddFiles jobs={jobs} act={act} startJob={adding.jobId} onClose={() => setAdding(null)} />}
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

const Picture: React.FC<{ a: AdAsset; className: string; play?: boolean }> = ({ a, className, play }) =>
  a.kind === 'video' && play && a.url ? (
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
          {a.tags.map((t) => (
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

/** Tag buttons: the trade's kinds of job, and before and after (photos only). */
const KindTags: React.FC<{ value: string[]; onChange: (tags: string[]) => void; photo: boolean; label: string }> = ({ value, onChange, photo, label }) => {
  const trade = useTrade();
  return (
    <div className="flex flex-wrap gap-2" aria-label={label}>
      {[...scopesFor(trade), ...(photo ? ['before', 'after'] : [])].map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={value.includes(t)}
          onClick={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])}
          className={`px-2.5 py-1 text-xs rounded border ${value.includes(t) ? 'bg-[#336699] border-[#336699] text-white' : 'border-[#333] text-gray-300'}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
};

/** One file, opened: the big picture, what Claude saw, its tags and job, and the rest tucked under More. */
const AssetEditor: React.FC<{ a: AdAsset; jobs: AdJob[]; act: Act; onClose: () => void }> = ({ a, jobs, act, onClose }) => {
  const trade = useTrade();
  const photo = a.kind === 'photo';
  const [tags, setTags] = useState(a.tags);
  const [pairKey, setPairKey] = useState(a.pairKey ?? '');
  const [note, setNote] = useState(a.note ?? '');
  useEffect(() => {
    setTags(a.tags);
    setPairKey(a.pairKey ?? '');
    setNote(a.note ?? '');
  }, [a.tags, a.pairKey, a.note]);
  const changed = tags.join(',') !== a.tags.join(',') || pairKey !== (a.pairKey ?? '') || note !== (a.note ?? '');
  return (
    <Dialog title={a.fileName} onClose={onClose} wide>
      <div className="space-y-4">
        <Picture a={a} play className="w-full max-h-[45dvh] object-contain rounded bg-black" />
        {a.description && <p className="text-sm text-gray-400">{a.description}</p>}
        {suggestsOther(a) && (
          <p className="text-sm text-sky-300" data-testid="suggested-tags">
            Claude suggests: {a.suggestedTags!.join(', ')} ·{' '}
            <button
              type="button"
              className="underline"
              onClick={() => act(() => adsAPI.tagAsset(a.id, a.suggestedTags!, a.pairKey, a.note), 'Tags updated.')}
            >
              Use these
            </button>
          </p>
        )}
        <div className="space-y-2">
          <p className="text-xs text-gray-400">What it shows</p>
          <KindTags value={tags} onChange={setTags} photo={photo} label={`Tags for ${a.fileName}`} />
        </div>
        {photo && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Job (purple)</p>
            <div className="flex flex-wrap gap-2" aria-label={`Job of ${a.fileName}`}>
              <JobTags
                jobs={jobs}
                value={a.jobId}
                where={a.fileName}
                onPick={(jobId) => act(() => adsAPI.setAssetJob(a.id, jobId), jobId ? 'Tagged with the job.' : 'Job tag taken off.')}
                onNew={(name) =>
                  act(async () => {
                    const jobId = await adsAPI.addJob(name, trade);
                    await adsAPI.setAssetJob(a.id, jobId);
                  }, `Job "${name}" added and this photo tagged with it.`)
                }
              />
            </div>
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-400">More</summary>
          <div className="mt-3">
            {photo && (
              <Field label="Pair key" hint="Same word on a before and its after of the same spot, e.g. kitchen-elm">
                <input value={pairKey} onChange={(e) => setPairKey(e.target.value)} aria-label={`Pair key for ${a.fileName}`} className={input} />
              </Field>
            )}
            <Field label="Note" hint="Where it was shot and whose permission you have. Never shown in an ad.">
              <input value={note} onChange={(e) => setNote(e.target.value)} aria-label={`Note for ${a.fileName}`} className={input} />
            </Field>
            {a.kind === 'video' && !a.posterUrl && a.url && (
              <button
                type="button"
                className={secondary}
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
          </div>
        </details>
        <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A2A]">
          <button
            type="button"
            aria-label={`Remove ${a.fileName}`}
            className="text-sm text-gray-500 hover:text-red-300 inline-flex items-center gap-1"
            onClick={() => act(() => adsAPI.removeAsset(a.id)).then(onClose)}
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
          {a.uses ? <span className="text-xs text-gray-500">In {a.uses} ad{a.uses === 1 ? '' : 's'}</span> : null}
          <button
            type="button"
            className={`${primary} ml-auto`}
            disabled={!changed}
            onClick={() => act(() => adsAPI.tagAsset(a.id, tags, pairKey || undefined, note || undefined), 'Saved.')}
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  );
};

/** The upload, in its own window: tags and a job for what comes next, the rest under More, then the files. */
/** "New job": a name, then straight on to its photos. */
const NewJob: React.FC<{ act: Act; onClose: () => void; onMade: (jobId: string) => void }> = ({ act, onClose, onMade }) => {
  const trade = useTrade();
  const [name, setName] = useState('');
  return (
    <Dialog title="New job" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = name.trim();
          if (!clean) return;
          void act(async () => onMade(await adsAPI.addJob(clean, trade)), `Job "${clean}" added.`);
        }}
      >
        <Field label="Job name" hint="Your own name for it, like Smith kitchen. It never shows in an ad.">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Job name" className={input} autoFocus />
        </Field>
        <button type="submit" className={`${primary} w-full`} disabled={!name.trim()}>
          Make the job
        </button>
      </form>
    </Dialog>
  );
};

const AddFiles: React.FC<{ jobs: AdJob[]; act: Act; onClose: () => void; startJob?: string }> = ({ jobs, act, onClose, startJob }) => {
  const trade = useTrade();
  // Nothing lit up by default: an upload with no tags takes the tags Claude suggests.
  const [tags, setTags] = useState<string[]>([]);
  const [jobId, setJobId] = useState(startJob ?? '');
  const into = startJob ? jobs.find((j) => j.id === startJob) : undefined;
  const [pairKey, setPairKey] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    await act(
      async () => {
        // A job is for photos: a clip goes up without one.
        for (const f of Array.from(files))
          await uploadAsset(f, tags, trade, pairKey || undefined, note || undefined, jobId && !isVideo(f) ? { jobId } : undefined);
        onClose();
      },
      `${files.length} file${files.length === 1 ? '' : 's'} in the library.`,
    );
    setBusy(false);
  };
  return (
    <Dialog title={into ? `Add photos to ${into.name}` : 'Add photos or clips'} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-400">Tag them now, or leave it: Claude looks at each one and tags it for you.</p>
        <KindTags value={tags} onChange={setTags} photo label="Tags for the next upload" />
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Job (purple, photos only)</p>
          <div className="flex flex-wrap gap-2">
            <JobTags
              jobs={jobs}
              value={jobId}
              where="the next upload"
              onPick={(id) => setJobId(id ?? '')}
              onNew={(name) => act(async () => setJobId(await adsAPI.addJob(name, trade)), `Job "${name}" added. The next upload is tagged with it.`)}
            />
          </div>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-400">More</summary>
          <div className="mt-3">
            <Field label="Pair key" hint="Same word on a before and its after of the same spot, e.g. kitchen-elm">
              <input value={pairKey} onChange={(e) => setPairKey(e.target.value)} className={input} />
            </Field>
            <Field label="Note" hint="Where it was shot and whose permission you have">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
            </Field>
          </div>
        </details>
        <label className={`${primary} w-full cursor-pointer`}>
          <Upload className="w-4 h-4" /> {busy ? 'Uploading…' : 'Choose files'}
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
      </div>
    </Dialog>
  );
};

/**
 * The job tags: one per job, and "+ job" to name a new one. A photo has one job, so tapping another moves it and
 * tapping the lit one takes it off. Purple, so they don't read as the kind-of-job tags beside them.
 */
const JobTags: React.FC<{
  jobs: AdJob[];
  value?: string;
  onPick: (jobId?: string) => void;
  onNew: (name: string) => Promise<unknown>;
  where: string;
  small?: boolean;
}> = ({ jobs, value, onPick, onNew, where, small }) => {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const size = small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';
  return (
    <>
      {jobs.map((j) => (
        <button
          key={j.id}
          type="button"
          aria-pressed={value === j.id}
          aria-label={`Job ${j.name} for ${where}`}
          onClick={() => onPick(value === j.id ? undefined : j.id)}
          className={`${size} rounded-full border ${value === j.id ? 'bg-[#7c5cc4] border-[#7c5cc4] text-white' : 'border-[#7c5cc4]/60 text-[#c9b8f0]'}`}
        >
          {j.name}
        </button>
      ))}
      {naming ? (
        <form
          className="flex gap-1 w-full"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = name.trim();
            if (!clean) return;
            void onNew(clean).then(() => {
              setNaming(false);
              setName('');
            });
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Job name, e.g. Smith kitchen"
            aria-label={`New job for ${where}`}
            className={`${input} ${small ? 'text-xs py-1' : 'text-sm py-1'} flex-1 min-w-0`}
            autoFocus
          />
          <button type="submit" className={`${primary} text-xs py-1`} disabled={!name.trim()}>
            Add
          </button>
        </form>
      ) : (
        <button
          type="button"
          aria-label={`New job for ${where}`}
          onClick={() => setNaming(true)}
          className={`${size} rounded-full border border-dashed border-[#7c5cc4]/60 text-[#c9b8f0]`}
        >
          + job
        </button>
      )}
    </>
  );
};

/** One job's photos together, with its name to change and a way to take the job away (its photos stay). */
const JobGroup: React.FC<{ job: AdJob; assets: AdAsset[]; act: Act; children: React.ReactNode }> = ({ job, assets, act, children }) => {
  const [name, setName] = useState<string | null>(null);
  const hasBefore = assets.some((a) => a.tags.includes('before'));
  const hasAfter = assets.some((a) => a.tags.includes('after'));
  return (
    <section className="space-y-2 border border-[#2A2A2A] rounded p-3" aria-label={`Job ${job.name}`} data-testid="job">
      <div className="flex flex-wrap items-center gap-2">
        {name === null ? (
          <h3 className="text-sm font-semibold text-white">{job.name}</h3>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => adsAPI.renameJob(job.id, name), 'Job renamed.').then(() => setName(null));
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Job name" className={`${input} text-sm py-1`} />
            <button type="submit" className={`${primary} text-xs py-1`}>
              Save
            </button>
          </form>
        )}
        <span className="text-xs text-gray-500">
          {assets.length} photo{assets.length === 1 ? '' : 's'}
          {assets.length > 0 && (hasBefore && hasAfter ? ' · before and after' : hasAfter ? ' · no before yet' : hasBefore ? ' · no finish yet' : ' · tag a before and an after')}
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
            onClick={() => act(() => adsAPI.removeJob(job.id), 'Job taken away. Its photos stay in the library.')}
          >
            Take away job
          </button>
        </span>
      </div>
      {assets.length < 3 && (
        <p className="text-xs text-gray-500">A story is told from one job once it has 3 photos or more.</p>
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
