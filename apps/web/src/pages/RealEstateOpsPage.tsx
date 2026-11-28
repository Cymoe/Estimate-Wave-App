import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isStaff } from '../lib/roles';
import { permitsAPI, sellersAPI } from '../lib/api';
import { SellersCard } from '../components/ops/SellersCard';
import { AuctionCard } from '../components/ops/AuctionCard';
import { secondary } from '../components/ops/ui';

type Tab = 'sellers' | 'auction' | 'sources';
const TABS: Array<[Tab, string]> = [
  ['sellers', 'Sellers'],
  ['auction', 'Auction'],
  ['sources', 'Sources'],
];
const SUMMARY: Record<Tab, string> = {
  sellers: 'Motivated-seller lists from Midland and Odessa public records, stacked per home',
  auction: "Midland's monthly courthouse foreclosure sale, kept by hand",
  sources: 'Where the lists come from, and when each was last read',
};

/** The letters asking the county offices for foreclosure, lis pendens, probate, divorce and tax-delinquent records. */
const RECORDS_REQUESTS = 'https://claude.ai/artifact/5474qEqQ25TmXB2y2WPrar';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

type Owners = { syncedAt: string; fetched: number; lastAppliedAt?: string; error?: string } | null | undefined;

type RecordKind = 'tax_delinquent' | 'probate' | 'lis_pendens' | 'divorce' | 'eviction';
const RECORD_KINDS: Array<[RecordKind, string]> = [
  ['tax_delinquent', 'Tax-delinquent'],
  ['probate', 'Probate'],
  ['lis_pendens', 'Lis pendens'],
  ['divorce', 'Divorce'],
  ['eviction', 'Eviction'],
];
const COUNTY_NAMES: Array<[string, string]> = [
  ['Midland', 'Midland'],
  ['Ector', 'Odessa (Ector)'],
];
type Uploaded = { read: number; added: number; already: number; unmatched: Array<{ line: number; text: string }>; unmatchedCount: number };

/**
 * A court or tax list from a records request, pasted or picked as a CSV: each row is matched to the one home it is,
 * by address or, with none, by the owner's name; the homes' scores change at once, and the rows that couldn't be
 * matched are listed to fix and send again.
 */
function RecordsUpload() {
  const [county, setCounty] = useState('Midland');
  const [kind, setKind] = useState<RecordKind>('tax_delinquent');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Uploaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Array<{ county: string; kind: string; count: number }>>([]);
  const loadCounts = useCallback(() => {
    sellersAPI.recordCounts().then(setCounts).catch(() => undefined);
  }, []);
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const send = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await sellersAPI.addRecords({ county, kind, text }));
      loadCounts();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const field = 'bg-[#181818] border border-[#333] rounded px-2 py-1.5 text-sm text-white';
  return (
    <section className="border border-[#2A2A2A] rounded p-4 space-y-3" aria-label="Upload records">
      <span className="block text-sm font-medium text-white">Court and tax records</span>
      <span className="block text-xs text-gray-500">
        Paste a list, or pick the CSV the county office sent. With a header, the columns are found by name (address, owner or decedent, date filed,
        case or account); without one, each line is an address. A row with no address is matched by the owner's name.
      </span>
      <div className="flex flex-wrap gap-2">
        <select aria-label="County" value={county} onChange={(e) => setCounty(e.target.value)} className={field}>
          {COUNTY_NAMES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Kind of record" value={kind} onChange={(e) => setKind(e.target.value as RecordKind)} className={field}>
          {RECORD_KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className={`${secondary} cursor-pointer`}>
          Pick a CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            aria-label="Records file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) setText(await file.text());
            }}
          />
        </label>
      </div>
      <textarea
        aria-label="Records"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'Cause Number,Decedent,Date Filed,Property Address\n2026-123,John A Smith,5/8/2026,1209 W Ohio Ave'}
        className={`${field} w-full font-mono text-xs`}
      />
      <button type="button" className={secondary} disabled={busy || !text.trim()} onClick={send}>
        {busy ? 'Matching…' : 'Add to the lists'}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {result && (
        <div className="text-xs text-gray-300 space-y-1" role="status" data-testid="records-result">
          <p>
            Read {result.read.toLocaleString()} row{result.read === 1 ? '' : 's'}: {result.added.toLocaleString()} added
            {result.already ? `, ${result.already.toLocaleString()} already in` : ''}
            {result.unmatchedCount ? `, ${result.unmatchedCount.toLocaleString()} not matched to a home` : ''}. Outreach's Likely to sell list picks the new ones up in a few minutes.
          </p>
          {result.unmatched.length > 0 && (
            <ul className="text-gray-500 list-disc pl-5">
              {result.unmatched.map((u) => (
                <li key={u.line}>
                  Line {u.line}: {u.text || '(empty)'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {counts.length > 0 && (
        <p className="text-xs text-gray-500" data-testid="records-counts">
          On file: {counts.map((c) => `${COUNTY_NAMES.find(([v]) => v === c.county)?.[1] ?? c.county} ${RECORD_KINDS.find(([v]) => v === c.kind)?.[1] ?? c.kind} ${c.count.toLocaleString()}`).join(' · ')}
        </p>
      )}
    </section>
  );
}
type Signals = { source: { syncedAt: string; fetched: number; added: number; updated: number; error?: string } | null; stacked: number; total: number };

/** The appraisal roll and the city's records behind the lists: when each was read, and a button to read it now. */
function SourcesCard() {
  const [owners, setOwners] = useState<Owners>(undefined);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([permitsAPI.status(), sellersAPI.status()]);
      setOwners(p.owners ?? null);
      setSignals(s);
    } catch (err) {
      setNote(`The sources couldn't be read: ${errorText(err)}`);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (which: 'owners' | 'records') => {
    setBusy(which);
    setNote(null);
    try {
      if (which === 'owners') {
        const r: { fetched: number; added: number; updated: number; error?: string } = await permitsAPI.syncOwners();
        setNote(r.error ? `The city's service failed: ${r.error}` : `Read ${r.fetched.toLocaleString()} homes: ${r.added} new, ${r.updated} changed.`);
      } else {
        const r: { full?: boolean } = await sellersAPI.syncNow();
        setNote(`Reading the city's records${r.full ? ' (all of them, the first time: a few minutes)' : ''}. The lists update as it goes.`);
      }
      await load();
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const s = signals?.source;
  const row = 'border border-[#2A2A2A] rounded p-4 flex flex-wrap items-center justify-between gap-3';
  return (
    <div className="space-y-4">
      <section className={row} aria-label="Appraisal roll">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-white">Owners · Midland appraisal roll</span>
          <span className="block text-xs text-gray-500 mt-0.5" data-testid="source-owners">
            {owners === undefined
              ? 'Loading…'
              : owners
                ? `${owners.fetched.toLocaleString()} homes${owners.lastAppliedAt ? ` · newest deed ${new Date(`${owners.lastAppliedAt}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''} · read ${day(owners.syncedAt)}${owners.error ? ` · failed: ${owners.error}` : ''}`
                : 'Not read yet. The deploy and a weekly job read it.'}
          </span>
          <span className="block text-xs text-gray-500">Owner, mailing address, value and deed date for every home; who's absentee, out of state, a landlord. Weekly.</span>
        </span>
        <button type="button" className={secondary} disabled={busy !== null} onClick={() => run('owners')}>
          {busy === 'owners' ? 'Reading…' : 'Sync owners'}
        </button>
      </section>

      <section className={row} aria-label="City records">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-white">City records · code violations, dilapidated, demolition, stalled permits</span>
          <span className="block text-xs text-gray-500 mt-0.5" data-testid="source-records">
            {!signals
              ? 'Loading…'
              : s
                ? `${s.fetched.toLocaleString()} records read ${day(s.syncedAt)}${s.error ? ` · failed: ${s.error}` : ''} · ${signals.total.toLocaleString()} homes on a list, ${signals.stacked.toLocaleString()} on 2 or more`
                : 'Not read yet. The deploy and a daily job read them.'}
          </span>
          <span className="block text-xs text-gray-500">From the City of Midland's public map layers. Daily.</span>
        </span>
        <button type="button" className={secondary} disabled={busy !== null} onClick={() => run('records')}>
          {busy === 'records' ? 'Starting…' : 'Sync records'}
        </button>
      </section>

      <RecordsUpload />

      <section className="border border-dashed border-[#333] rounded p-4" aria-label="By hand">
        <span className="block text-sm font-medium text-white">By hand</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          The courthouse auction is entered on the Auction tab. Tax-delinquent, probate, lis pendens, divorce and eviction lists go in the upload above.
        </span>
        <a
          href={RECORDS_REQUESTS}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-sm text-[#7fb2e5] underline underline-offset-2"
        >
          Records request letters to the county
        </a>
        <span className="block text-xs text-gray-500 mt-0.5">Fill them in and send them; the files the offices send back are what the upload takes.</span>
      </section>

      {note && (
        <p className="text-xs text-gray-300" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * The Real estate side of Ops: the motivated-seller lists investors work,
 * the courthouse auction, and where it all comes from. Kept apart from the
 * contractor-leads side; the switch in the Ops top bar goes between them.
 */
export default function RealEstateOpsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = TABS.some(([t]) => t === asked) ? (asked as Tab) : 'sellers';
  const title = TABS.find(([t]) => t === tab)![1];

  useEffect(() => {
    const before = document.title;
    document.title = `${title} · Real estate · Ops · Webb Leads`;
    return () => {
      document.title = before;
    };
  }, [title]);

  if (!isStaff(user)) return <div className="p-8 text-gray-400">The Ops page is only for Webb Leads staff.</div>;

  return (
    <div className="px-4 md:px-6 py-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Real estate</p>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-400" data-testid="real-estate-summary">
            {SUMMARY[tab]}
          </p>
        </div>
        <div className="flex max-w-full rounded border border-[#333] overflow-x-auto" role="tablist" aria-label="Real estate tabs">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setParams({ tab: value })}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm ${tab === value ? 'bg-[#336699] text-white' : 'text-gray-300 [@media(hover:hover)]:hover:bg-[#222]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'sellers' ? <SellersCard /> : tab === 'auction' ? <AuctionCard /> : <SourcesCard />}
    </div>
  );
}
