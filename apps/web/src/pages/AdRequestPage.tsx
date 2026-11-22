import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { LightPage } from '../components/common/LightPage';
import { useAdRequest } from '../lib/live';

/**
 * /ads/<token>: one "make an ad for…" request, watched as it is made. No login: the long key in the link is the
 * key. Each step lights up as it finishes and each video appears the moment it is drawn. Nothing here runs an
 * ad: they are approved in Ops → Ads.
 */

type Stage = 'reading' | 'writing' | 'voicing' | 'drawing' | 'ready' | 'failed';
type Ad = {
  name: string;
  angle: string;
  ratio: '9x16' | '4x5';
  image: boolean;
  status: string;
  file: string | null;
  headline: string;
  lines: string[];
  primaryText: string;
  builtOn?: { company: string; daysRunning?: number };
};
export type RequestView = {
  ask: string;
  idea?: string;
  town?: string;
  trade?: string;
  stage: Stage;
  error?: string;
  skipped: string[];
  createdAt: string;
  ads: Ad[];
};

const STEPS: Array<[Exclude<Stage, 'failed'>, string]> = [
  ['reading', 'Reading your request'],
  ['writing', 'Writing the versions'],
  ['voicing', 'Recording the voice'],
  ['drawing', 'Drawing the videos'],
  ['ready', 'Ready to watch'],
];
const ORDER: Stage[] = STEPS.map(([s]) => s);

/** Story first, then the lesson, then the quick offer; one card per ad, both sizes together. */
const ANGLE_ORDER = ['Story', 'Lesson', 'Quick offer'];
function byAd(ads: Ad[]) {
  const groups = new Map<string, Ad[]>();
  for (const ad of ads) {
    // Only the size (and a still's tag) is dropped, so a quick offer on the story's idea ("…_2") keeps its own card.
    const key = ad.name.replace(/_(916|45)(?=_|$)/, '').replace(/_still$/, '');
    groups.set(key, [...(groups.get(key) ?? []), ad]);
  }
  return [...groups.values()].sort((a, b) => ANGLE_ORDER.indexOf(a[0].angle) - ANGLE_ORDER.indexOf(b[0].angle));
}

function Steps({ stage }: { stage: Stage }) {
  const at = ORDER.indexOf(stage);
  return (
    <ol className="mt-5 space-y-2" aria-label="Progress">
      {STEPS.map(([key, label], i) => {
        const done = stage !== 'failed' && (i < at || stage === 'ready');
        const now = stage !== 'failed' && i === at && stage !== 'ready';
        return (
          <li key={key} className={`flex items-center gap-3 text-sm ${done ? 'text-gray-900' : now ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${done ? 'bg-emerald-600 text-white' : now ? 'border-2 border-[#336699]' : 'border border-gray-300'}`}
              aria-hidden
            >
              {done ? '✓' : now ? <span className="h-2 w-2 animate-pulse rounded-full bg-[#336699]" /> : ''}
            </span>
            {label}
            {now && <span className="sr-only">(now)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function AdCard({ versions }: { versions: Ad[] }) {
  const sizes = versions.filter((v) => !v.image);
  const [ratio, setRatio] = useState<'9x16' | '4x5'>('9x16');
  const shown = sizes.find((v) => v.ratio === ratio) ?? sizes[0] ?? versions[0];
  const still = versions.find((v) => v.image && v.file);
  const first = versions[0];
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{first.angle}</h2>
        {sizes.length > 1 && (
          <div className="flex rounded-full bg-gray-100 p-0.5 text-xs" role="group" aria-label="Size">
            {(['9x16', '4x5'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRatio(r)}
                aria-pressed={ratio === r}
                className={`rounded-full px-3 py-1 ${ratio === r ? 'bg-white font-semibold shadow-sm' : 'text-gray-500'}`}
              >
                {r === '9x16' ? 'Tall' : 'Square-ish'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`mx-auto mt-3 overflow-hidden rounded-xl bg-gray-900 ${shown.ratio === '9x16' ? 'aspect-[9/16] max-w-[320px]' : 'aspect-[4/5] max-w-[400px]'}`}>
        {shown.file ? (
          <video key={shown.file} src={shown.file} controls playsInline preload="metadata" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-gray-300">
            <span className="h-3 w-3 animate-pulse rounded-full bg-gray-300" aria-hidden />
            {shown.status === 'failed' ? "This one couldn't be drawn." : shown.status === 'draft' ? 'Recording the voice…' : 'Being drawn…'}
          </div>
        )}
      </div>
      {still?.file && <img src={still.file} alt={`${first.angle}, still`} className="mx-auto mt-3 max-w-[320px] rounded-xl" />}
      {first.builtOn && (
        <p className="mt-3 text-xs text-gray-500">
          Built on {first.builtOn.company}'s ad{first.builtOn.daysRunning ? `, running ${first.builtOn.daysRunning} days` : ''}.
        </p>
      )}
      <details className="mt-2 text-sm text-gray-700">
        <summary className="cursor-pointer text-gray-500">What it says</summary>
        <p className="mt-2 font-semibold">{first.headline}</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {first.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
        {first.primaryText && <p className="mt-2 whitespace-pre-line text-gray-500">{first.primaryText}</p>}
      </details>
    </article>
  );
}

export function AdRequestView({ view }: { view: RequestView }) {
  return (
    <>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#336699]">GoodFit Pros · new ad</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">"{view.ask}"</h1>
        {view.idea && (
          <p className="mt-2 text-sm text-gray-600">
            {view.trade}
            {view.town ? ` · ${view.town}` : ''} · {view.idea}
          </p>
        )}
      </header>
      {view.stage === 'failed' ? (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">
          This one couldn't be made. {view.error}
        </p>
      ) : (
        <Steps stage={view.stage} />
      )}
      <div className="mt-6 space-y-4">
        {byAd(view.ads).map((versions) => (
          <AdCard key={versions[0].name} versions={versions} />
        ))}
      </div>
      {view.ads.length > 0 && (
        <p className="mt-6 text-center text-xs text-gray-500">
          {view.stage === 'ready' && view.skipped.length > 0
            ? `${view.skipped.length} ${view.skipped.length === 1 ? 'version' : 'versions'} couldn't be made from the photos on file. `
            : ''}
          Nothing runs until you approve it in Ops → Ads.
        </p>
      )}
    </>
  );
}

export function AdRequestPage() {
  const { token = '' } = useParams();
  const view = useAdRequest<RequestView | null>(token);
  return (
    <LightPage className="bg-[#F5F6F8] text-gray-900">
      <div className="mx-auto max-w-xl px-4 pb-10 pt-8">
        {view === undefined ? (
          <p className="text-center text-gray-500">Loading…</p>
        ) : view === null ? (
          <p className="text-center text-gray-700">This link isn't valid.</p>
        ) : (
          <AdRequestView view={view} />
        )}
      </div>
    </LightPage>
  );
}
