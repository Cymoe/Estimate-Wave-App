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
  sellers: 'Motivated-seller lists from Midland public records, stacked per home',
  auction: "Midland's monthly courthouse foreclosure sale, kept by hand",
  sources: 'Where the lists come from, and when each was last read',
};

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

type Owners = { syncedAt: string; fetched: number; lastAppliedAt?: string; error?: string } | null | undefined;
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

      <section className="border border-dashed border-[#333] rounded p-4" aria-label="By hand">
        <span className="block text-sm font-medium text-white">By hand</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          The courthouse auction is entered on the Auction tab. Tax-delinquent, probate, divorce, eviction and lien lists come next, as an upload here.
        </span>
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
    document.title = `${title} · Real estate · Ops · Tolliver`;
    return () => {
      document.title = before;
    };
  }, [title]);

  if (!isStaff(user)) return <div className="p-8 text-gray-400">The Ops page is only for Tolliver staff.</div>;

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
