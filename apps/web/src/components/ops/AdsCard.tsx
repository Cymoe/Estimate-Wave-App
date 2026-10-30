import React, { useEffect, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Play, Trash2, Upload } from 'lucide-react';
import { adsAPI } from '../../lib/api';
import { useAdsBatches, useAdsHooks, useAdsLibrary, useAdsLive, useAdsSettings } from '../../lib/live';
import { money } from '../market/wallet';
import { ErrorLine, Field, ago, describeError, input, primary, secondary } from './ui';

/**
 * Ops → Ads: the week's drafted ads to approve, the live ones with what
 * they cost and brought in, the photo and clip library the ads are cut
 * from, the hooks they open with, and the Meta account they go to.
 */

type Section = 'week' | 'live' | 'library' | 'hooks' | 'settings';
const SECTIONS: Array<[Section, string]> = [
  ['week', 'This week'],
  ['live', 'Live'],
  ['library', 'Library'],
  ['hooks', 'Hooks'],
  ['settings', 'Settings'],
];

const SCOPES = ['interior', 'exterior', 'cabinets', 'crew', 'process'];
const FAMILIES: Array<[string, string]> = [
  ['owner_story', 'Owner story'],
  ['before_after', 'Before / after'],
  ['proof', 'Trust and proof'],
  ['education', 'Cost education'],
  ['objection', 'Respect for your home'],
  ['seasonal', 'Season and timing'],
];

export interface AdCreative {
  id: string;
  batchId: string;
  name: string;
  ratio: '9x16' | '4x5';
  status: 'draft' | 'voiced' | 'rendering' | 'rendered' | 'paused' | 'live' | 'retired' | 'rejected' | 'failed';
  error?: string;
  script: { voice: string; onScreen: string[]; headline: string; primaryText: string };
  hook: { id: string; family: string; familyLabel: string; scope: string; textEn: string } | null;
  videoUrl?: string;
  meta?: { videoId?: string; creativeId?: string; adId?: string; adsetId?: string };
  week?: { at: string; spendCents: number; impressions: number; clicks: number; frequency: number; ctr: number; leadsMeta: number };
  baselineCtr?: number;
  fatigued: boolean;
  createdAt: string;
  activatedAt?: string;
  retiredAt?: string;
}
export interface AdBatch {
  id: string;
  weekOf: string;
  status: 'drafting' | 'rendering' | 'ready' | 'done' | 'failed';
  error?: string;
  summary?: string;
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
  createdAt: string;
}
export interface AdHook {
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
  keys: { anthropic: boolean; elevenlabs: boolean; shotstack: boolean; meta: boolean };
  adAccountId?: string;
  pageId?: string;
  leadFormId?: string;
  adsetId?: string;
  primaryColor: string;
  accentColor: string;
  voiceId?: string;
  weeklyEnabled: boolean;
  hooksPerWeek: number;
  liveTarget: number;
}

const STATUS_LABELS: Record<AdCreative['status'], string> = {
  draft: 'Writing',
  voiced: 'Voiced',
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
  const [section, setSection] = useState<Section>('week');
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
    <div className="space-y-4">
      <div role="tablist" aria-label="Ads" className="flex gap-1 flex-wrap">
        {SECTIONS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={section === value}
            onClick={() => setSection(value)}
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
        <Hooks act={act} />
      ) : (
        <Settings owner={owner} act={act} />
      )}
    </div>
  );
};

type Act = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

/** The batch cards: watch, approve or reject each creative. */
const ThisWeek: React.FC<{ owner: boolean; act: Act }> = ({ owner, act }) => {
  const batches = useAdsBatches<AdBatch[]>();
  if (batches === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-400 flex-1 min-w-[16rem]">
          Every Monday the app writes two hooks, voices them, cuts a video per size from the library and creates each one paused in Meta. Approve the
          ones to run.
        </p>
        {owner && (
          <button
            type="button"
            className={secondary}
            onClick={() => act(() => adsAPI.draftNow(), 'Drafting. The batch shows here as each piece finishes.')}
          >
            Draft now
          </button>
        )}
      </div>
      {batches.length === 0 ? (
        <div className="border border-dashed border-[#333] rounded p-8 text-center">
          <Film className="w-8 h-8 mx-auto text-gray-500 mb-2" />
          <p className="text-sm text-gray-400">No batch yet. Fill the Library, check the Hooks and Settings, then Draft now or wait for Monday.</p>
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
            {b.creatives.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-500">Nothing drafted for this week.</p>
            ) : (
              <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {b.creatives.map((c) => (
                  <CreativeCard key={c.id} c={c} act={act} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
};

const CreativeCard: React.FC<{ c: AdCreative; act: Act }> = ({ c, act }) => (
  <li className="border border-[#2A2A2A] rounded bg-[#121212] flex flex-col" data-testid="creative">
    {c.videoUrl ? (
      <video src={c.videoUrl} controls preload="metadata" className={`w-full bg-black ${c.ratio === '9x16' ? 'aspect-[9/16]' : 'aspect-[4/5]'}`} />
    ) : (
      <div className={`w-full bg-[#0c0c0c] flex items-center justify-center text-gray-600 ${c.ratio === '9x16' ? 'aspect-[9/16]' : 'aspect-[4/5]'}`}>
        <Play className="w-8 h-8" />
      </div>
    )}
    <div className="p-3 space-y-2 flex-1">
      <p className="flex flex-wrap gap-1 items-center">
        <span className={chip}>{c.ratio}</span>
        <span
          className={`${chip} ${c.status === 'live' ? 'text-emerald-300 border-emerald-900' : c.status === 'failed' ? 'text-red-300 border-red-900' : ''}`}
        >
          {STATUS_LABELS[c.status]}
        </span>
      </p>
      {c.hook && (
        <p className="text-xs text-gray-400">
          {c.hook.familyLabel} · {c.hook.scope}
        </p>
      )}
      <p className="text-sm text-white">{c.script.headline}</p>
      <p className="text-xs text-gray-400">{c.script.primaryText}</p>
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer">Script</summary>
        <p className="mt-1 whitespace-pre-wrap">{c.script.voice}</p>
        <p className="mt-1">{c.script.onScreen.join(' · ')}</p>
      </details>
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
                  {r.hook?.familyLabel ?? 'Hook'} · {r.ratio}
                </p>
                <p className="text-[10px] text-gray-600 break-all">{r.name}</p>
              </td>
              <td className="px-3 py-2">
                <span className={chip}>{STATUS_LABELS[r.status]}</span>
                {r.fatigued && <span className={`${chip} ml-1 text-amber-300 border-amber-900`}>fatigued</span>}
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

/** Uploads a file to Convex storage and files it in the library with its tags. */
async function uploadAsset(file: File, tags: string[], pairKey?: string, note?: string) {
  const url = await adsAPI.uploadUrl();
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  if (!res.ok) throw new Error(`The upload failed (${res.status})`);
  const { storageId } = (await res.json()) as { storageId: string };
  await adsAPI.addAsset({ storageId, fileName: file.name, tags, pairKey, note });
}

const Library: React.FC<{ act: Act }> = ({ act }) => {
  const assets = useAdsLibrary<AdAsset[]>();
  const [tags, setTags] = useState<string[]>(['interior']);
  const [pairKey, setPairKey] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toggle = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    await act(
      async () => {
        for (const f of Array.from(files)) await uploadAsset(f, tags, pairKey || undefined, note || undefined);
      },
      `${files.length} file${files.length === 1 ? '' : 's'} in the library.`,
    );
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  return (
    <div className="space-y-4">
      <div className="border border-[#2A2A2A] rounded p-4 space-y-3">
        <p className="text-sm text-gray-400">
          Your photos and clips. Tag each with what it shows; the Monday batch picks footage by the hook's scope, and a before and after with the same
          pair key become a wipe.
        </p>
        <div className="flex flex-wrap gap-2" aria-label="Tags for the next upload">
          {[...SCOPES, 'before', 'after'].map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tags.includes(t)}
              onClick={() => toggle(t)}
              className={`px-2 py-1 text-xs rounded border ${tags.includes(t) ? 'bg-[#336699] border-[#336699] text-white' : 'border-[#333] text-gray-300'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Pair key (optional)" hint="Same word on a before and its after, e.g. kitchen-elm">
            <input value={pairKey} onChange={(e) => setPairKey(e.target.value)} className={input} />
          </Field>
          <Field label="Note (optional)" hint="Where it was shot and whose permission you have">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          </Field>
        </div>
        <label className={`${secondary} cursor-pointer inline-flex items-center gap-2`}>
          <Upload className="w-4 h-4" /> {busy ? 'Uploading…' : 'Upload photos or clips'}
          <input
            ref={fileRef}
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
      {assets === undefined ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing in the library yet.</p>
      ) : (
        <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Library">
          {assets.map((a) => (
            <AssetCard key={a.id} a={a} act={act} />
          ))}
        </ul>
      )}
    </div>
  );
};

const AssetCard: React.FC<{ a: AdAsset; act: Act }> = ({ a, act }) => {
  const [tags, setTags] = useState(a.tags);
  const [pairKey, setPairKey] = useState(a.pairKey ?? '');
  useEffect(() => {
    setTags(a.tags);
    setPairKey(a.pairKey ?? '');
  }, [a.tags, a.pairKey]);
  const changed = tags.join(',') !== a.tags.join(',') || pairKey !== (a.pairKey ?? '');
  return (
    <li className="border border-[#2A2A2A] rounded bg-[#121212] overflow-hidden" data-testid="asset">
      {a.kind === 'video' ? (
        a.url ? (
          <video src={a.url} muted preload="metadata" className="w-full aspect-square object-cover bg-black" />
        ) : (
          <div className="w-full aspect-square bg-black" />
        )
      ) : a.url ? (
        <img src={a.url} alt={a.fileName} className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-black" />
      )}
      <div className="p-2 space-y-1">
        <p className="text-[11px] text-gray-400 truncate flex items-center gap-1">
          {a.kind === 'video' ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />} {a.fileName}
        </p>
        <div className="flex flex-wrap gap-1">
          {[...SCOPES, 'before', 'after'].map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tags.includes(t)}
              onClick={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
              className={`px-1.5 py-0.5 text-[10px] rounded border ${tags.includes(t) ? 'bg-[#336699] border-[#336699] text-white' : 'border-[#333] text-gray-400'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={pairKey}
          onChange={(e) => setPairKey(e.target.value)}
          placeholder="pair key"
          aria-label={`Pair key for ${a.fileName}`}
          className={`${input} text-xs py-1`}
        />
        <div className="flex gap-1">
          {changed && (
            <button
              type="button"
              className={`${primary} text-xs py-1 flex-1`}
              onClick={() => act(() => adsAPI.tagAsset(a.id, tags, pairKey || undefined, a.note), 'Saved.')}
            >
              Save
            </button>
          )}
          <button
            type="button"
            aria-label={`Remove ${a.fileName}`}
            className="ml-auto text-gray-500 hover:text-red-300 p-1"
            onClick={() => act(() => adsAPI.removeAsset(a.id))}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </li>
  );
};

const EMPTY_HOOK = { family: 'before_after', scope: 'cabinets', trade: 'painting', textEn: '', active: true };

const Hooks: React.FC<{ act: Act }> = ({ act }) => {
  const hooks = useAdsHooks<AdHook[]>();
  const [draft, setDraft] = useState<{ id?: string } & typeof EMPTY_HOOK>(EMPTY_HOOK);
  const set = (k: keyof typeof EMPTY_HOOK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const save = () => act(() => adsAPI.saveHook(draft).then(() => setDraft(EMPTY_HOOK)), 'Hook saved.');
  if (hooks === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        The ideas an ad opens with. Monday takes the least-used active hooks from families that aren't already live. Wins and losses come from how
        each hook's ads did against the batch.
      </p>
      {hooks.length === 0 && (
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
        <Field label="Family">
          <select value={draft.family} onChange={set('family')} className={input}>
            {FAMILIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scope">
          <select value={draft.scope} onChange={set('scope')} className={input}>
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
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
            <button type="button" className={secondary} onClick={() => setDraft(EMPTY_HOOK)}>
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
                {h.familyLabel} · {h.scope} · used {h.uses} · {h.wins} won · {h.losses} lost
              </p>
              <p className={`text-sm ${h.active ? 'text-white' : 'text-gray-500'}`}>{h.textEn}</p>
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
        const rest: Record<string, unknown> = { ...form };
        delete rest.brand;
        delete rest.keys;
        void act(() => adsAPI.saveSettings(rest), 'Settings saved.');
      }}
    >
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-400">Homeowners see the ads as {form.brand}.</span>
        {key(form.keys.anthropic, 'ANTHROPIC_API_KEY')}
        {key(form.keys.elevenlabs, 'ELEVENLABS_API_KEY')}
        {key(form.keys.shotstack, 'SHOTSTACK_API_KEY')}
        {key(form.keys.meta, 'META_ACCESS_TOKEN')}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {text('adAccountId', 'Ad account id', 'Digits only; the act_ prefix is dropped')}
        {text('pageId', 'Page id')}
        {text('leadFormId', 'Instant form id')}
        {text('adsetId', 'Ad set id')}
        {text('voiceId', 'ElevenLabs voice id')}
        {text('primaryColor', 'Brand colour')}
        {text('accentColor', 'Accent colour')}
        <Field label="Hooks per week">
          <input
            type="number"
            min={1}
            max={4}
            value={form.hooksPerWeek}
            onChange={(e) => setForm({ ...form, hooksPerWeek: Number(e.target.value) })}
            className={input}
            disabled={!owner}
            aria-label="Hooks per week"
          />
        </Field>
        <Field label="Ads to keep live">
          <input
            type="number"
            min={2}
            max={12}
            value={form.liveTarget}
            onChange={(e) => setForm({ ...form, liveTarget: Number(e.target.value) })}
            className={input}
            disabled={!owner}
            aria-label="Ads to keep live"
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
