import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { sellersAPI } from '../../lib/api';
import { LISTS, toCsv, type ListKey } from '../../../convex/lib/signals';
import { Dialog, secondary } from './ui';

interface SellerHome {
  parcelId: string;
  address: string;
  owner: string;
  owner2?: string;
  mailing: { address?: string; city?: string; state?: string; zip?: string };
  lists: ListKey[];
  score: number;
  codeCases: number;
  seriousCases: number;
  lastSignalAt?: string;
  marketValueCents?: number;
  deedDate?: string;
}

interface Sellers {
  homes: SellerHome[];
  more: boolean;
  counts: Record<string, number>;
  stacked: number;
  total: number;
  lists: Array<{ key: ListKey; label: string; weight: number }>;
}

interface Status {
  source: { syncedAt: string; fetched: number; added: number; updated: number; error?: string } | null;
  stacked: number;
  total: number;
}

interface HomeDetail {
  address: string;
  owner: string;
  lists: ListKey[];
  score: number;
  signals: Array<{ kind: string; detail: string; status?: string; caseNumber?: string; date: string }>;
  foreclosures: Array<{ saleDate: string; status: string; kind: string }>;
}

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const dollars = (cents?: number) => (cents ? `$${Math.round(cents / 100).toLocaleString()}` : '');
const year = (date?: string) => (date ? date.slice(0, 4) : '');
const outOfState = (h: SellerHome) => Boolean(h.mailing.state && !['TX', 'TEXAS'].includes(h.mailing.state.toUpperCase()));
const label = (key: string) => LISTS[key as ListKey]?.label ?? key;

/** The current result as a CSV for direct mail or a dialer. */
export function sellersCsv(homes: SellerHome[]): string {
  return toCsv(
    ['Property address', 'Owner', 'Owner 2', 'Mailing address', 'Mailing city', 'Mailing state', 'Mailing zip', 'Lists', 'Score', 'Code cases', 'Last record', 'Market value', 'Owned since'],
    homes.map((h) => [
      h.address,
      h.owner,
      h.owner2,
      h.mailing.address,
      h.mailing.city,
      h.mailing.state,
      h.mailing.zip,
      h.lists.map(label).join('; '),
      h.score,
      h.codeCases,
      h.lastSignalAt?.slice(0, 10),
      h.marketValueCents ? Math.round(h.marketValueCents / 100) : '',
      h.deedDate,
    ]),
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** One home's lists and the records behind them. */
function HomeDialog({ parcelId, onClose }: { parcelId: string; onClose: () => void }) {
  const [home, setHome] = useState<HomeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    sellersAPI.home(parcelId).then(setHome).catch((err) => setError(errorText(err)));
  }, [parcelId]);
  return (
    <Dialog title={home ? home.address : 'Loading…'} onClose={onClose} wide>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {home && (
        <div className="space-y-3" data-testid="seller-home">
          <p className="text-sm text-gray-300">
            {home.owner} · score {home.score}
          </p>
          <p className="flex flex-wrap gap-1">
            {home.lists.map((l) => (
              <span key={l} className="text-xs px-2 py-0.5 rounded-full border border-[#336699]/60 bg-[#336699]/15 text-[#cfe2f5]">
                {label(l)}
              </span>
            ))}
          </p>
          {home.foreclosures.length > 0 && (
            <p className="text-sm text-amber-200/90">
              {home.foreclosures.map((f) => `Courthouse auction ${f.saleDate}: ${f.status.replace(/_/g, ' ')}`).join(' · ')}
            </p>
          )}
          {home.signals.length === 0 ? (
            <p className="text-sm text-gray-500">No city records: it's on the lists for what the appraisal roll says about the owner.</p>
          ) : (
            <ul className="divide-y divide-[#2A2A2A]">
              {home.signals.map((s, i) => (
                <li key={i} className="py-2 text-sm">
                  <span className="text-white">{s.detail}</span>
                  <span className="text-gray-500">
                    {' '}
                    · {day(s.date)}
                    {s.status ? ` · ${s.status}` : ''}
                    {s.caseNumber ? ` · ${s.caseNumber}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * The motivated-seller lists investors work, from Midland's public records
 * and the appraisal roll, stacked per home: pick lists to narrow it down,
 * open a home for its records, export the result for direct mail.
 */
export function SellersCard() {
  const [picked, setPicked] = useState<ListKey[]>([]);
  const [minLists, setMinLists] = useState(1);
  const [data, setData] = useState<Sellers | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([sellersAPI.sellers({ lists: picked, minLists, limit: 200 }), sellersAPI.status()]);
      setData(d);
      setStatus(s);
    } catch (err) {
      setNote(`The lists couldn't be loaded: ${errorText(err)}`);
    }
  }, [picked, minLists]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: ListKey) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const sync = async () => {
    setSyncing(true);
    setNote(null);
    try {
      const r: { fetched?: number; added?: number; updated?: number; error?: string } = await sellersAPI.syncNow();
      setNote(r.error ? `The city's service failed: ${r.error}` : `Read ${r.fetched?.toLocaleString()} records: ${r.added} new, ${r.updated} changed.`);
      await load();
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setSyncing(false);
    }
  };

  const s = status?.source;
  return (
    <section className="space-y-4" aria-label="Motivated sellers">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-gray-500 max-w-2xl" data-testid="sellers-status">
          {s
            ? `City records read ${day(s.syncedAt)} · ${s.fetched.toLocaleString()} records${s.error ? ` · failed: ${s.error}` : ''} · ${(status?.total ?? 0).toLocaleString()} homes on a list, ${(status?.stacked ?? 0).toLocaleString()} on 2 or more`
            : 'Not read yet. The deploy and a daily job read code violations, dilapidated buildings, demolition orders and stalled permits.'}
        </p>
        <div className="flex gap-2">
          <button type="button" className={secondary} onClick={sync} disabled={syncing}>
            <RefreshCw className="w-4 h-4" />
            {syncing ? 'Reading…' : 'Sync now'}
          </button>
          <button
            type="button"
            className={secondary}
            disabled={!data?.homes.length}
            onClick={() => data && download(`midland-sellers-${new Date().toISOString().slice(0, 10)}.csv`, sellersCsv(data.homes))}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>
      {note && (
        <p className="text-xs text-gray-300" role="status">
          {note}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Lists">
        {(data?.lists ?? []).map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={picked.includes(l.key)}
            onClick={() => toggle(l.key)}
            className={`text-sm px-3 py-1.5 rounded-full border min-h-[36px] ${
              picked.includes(l.key) ? 'border-[#336699] bg-[#336699] text-white' : 'border-[#333] text-gray-300'
            }`}
          >
            {l.label} <span className="opacity-70">({(data?.counts[l.key] ?? 0).toLocaleString()})</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        On at least
        <select
          aria-label="Minimum lists"
          value={minLists}
          onChange={(e) => setMinLists(Number(e.target.value))}
          className="bg-[#181818] border border-[#333] rounded px-2 py-1.5 text-sm text-white"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        list{minLists === 1 ? '' : 's'}
      </label>

      {data === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : data.homes.length === 0 ? (
        <p className="text-sm text-gray-500">No homes on {picked.length ? 'all of those lists' : 'any list'} yet.</p>
      ) : (
        <>
          <p className="text-xs text-gray-400" data-testid="sellers-count">
            {data.homes.length.toLocaleString()} home{data.homes.length === 1 ? '' : 's'}, highest score first{data.more ? ' (the top ones; narrow the lists for the rest)' : ''}
          </p>
          <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" data-testid="sellers">
            {data.homes.map((h) => (
              <li key={h.parcelId}>
                <button type="button" onClick={() => setOpen(h.parcelId)} className="w-full text-left px-3 py-3 [@media(hover:hover)]:hover:bg-[#181818]">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-white">{h.address}</span>
                    <span className="text-xs text-gray-400">score {h.score}</span>
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {h.owner}
                    {h.mailing.address ? ` · mail to ${h.mailing.address}${h.mailing.city ? `, ${h.mailing.city}` : ''}${h.mailing.state ? ` ${h.mailing.state}` : ''}` : ''}
                    {outOfState(h) ? ' · out of state' : ''}
                  </span>
                  <span className="flex flex-wrap gap-1 mt-1.5">
                    {h.lists.map((l) => (
                      <span key={l} className="text-[11px] px-1.5 py-0.5 rounded border border-[#333] text-gray-300">
                        {label(l)}
                      </span>
                    ))}
                  </span>
                  <span className="block text-xs text-gray-500 mt-1">
                    {[
                      h.codeCases ? `${h.codeCases} code case${h.codeCases === 1 ? '' : 's'}` : '',
                      h.lastSignalAt ? `last record ${day(h.lastSignalAt)}` : '',
                      dollars(h.marketValueCents) && `worth ${dollars(h.marketValueCents)}`,
                      h.deedDate ? `owned since ${year(h.deedDate)}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {open && <HomeDialog parcelId={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
