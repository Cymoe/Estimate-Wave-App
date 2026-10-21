import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { permitsAPI } from '../../lib/api';

export interface NearbyPermit {
  id: string;
  permitNumber: string;
  name: string;
  workClass?: string;
  description?: string;
  status?: string;
  address?: string;
  appliedAt: string;
  issuedAt?: string;
  residential?: boolean;
  trades: string[];
  url?: string;
  matchesTrades: boolean;
}
export interface PermitsNear {
  county: string;
  syncedAt?: string;
  locked: boolean;
  summary: { days: number; total: number; residentialBuilding: number; singleFamily: number; inMyTrades: number };
  permits: NearbyPermit[];
}

const DAYS = [7, 30, 90] as const;
type Scope = 'both' | 'residential' | 'commercial';
const pill = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-xs border ${on ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333] text-gray-400'}`;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Building permits applied for near the company: public record from the
 * city, mapped to trades. Intelligence, not leads: the address and the work,
 * no contact details.
 */
export const PermitsNearYou: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [days, setDays] = useState<(typeof DAYS)[number]>(30);
  const [data, setData] = useState<PermitsNear | null>(null);
  const [mineOnly, setMineOnly] = useState(true);
  const [scope, setScope] = useState<Scope>('both');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await permitsAPI.near(organizationId, days));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The permits couldn't be loaded");
    }
  }, [organizationId, days]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    let all = data?.permits ?? [];
    if (mineOnly && all.some((p) => p.matchesTrades)) all = all.filter((p) => p.matchesTrades);
    if (scope === 'residential') all = all.filter((p) => p.residential === true);
    if (scope === 'commercial') all = all.filter((p) => p.residential === false);
    return all;
  }, [data, mineOnly, scope]);
  const work = (p: NearbyPermit) => (p.workClass && p.workClass !== p.name ? `${p.name} · ${p.workClass}` : p.name);
  const county = data?.county ?? 'Midland';
  const s = data?.summary;

  return (
    <div data-testid="permits-near-you">
      <p className="text-sm text-gray-300">
        {s
          ? `${s.total} permit${s.total === 1 ? '' : 's'} applied for in ${county} in the last ${s.days} days · ${s.singleFamily} single-family · ${s.inMyTrades} in your trades`
          : 'Loading…'}
      </p>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Public record from the City of {county}: the address and the work, no contact details. The builder's sign is usually on site.
        {data?.syncedAt ? ` Updated ${when(data.syncedAt)}.` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={() => setMineOnly((m) => !m)} aria-pressed={mineOnly} className={pill(mineOnly)}>
          My trades
        </button>
        <span className="inline-flex rounded-full border border-[#333] overflow-hidden" role="group" aria-label="Residential or commercial">
          {(['both', 'residential', 'commercial'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              aria-pressed={scope === id}
              className={`px-3 py-1.5 text-xs ${scope === id ? 'bg-[#336699]/20 text-white' : 'text-gray-400'}`}
            >
              {id === 'both' ? 'All' : id === 'residential' ? 'Residential' : 'Commercial'}
            </button>
          ))}
        </span>
        <span className="inline-flex rounded-full border border-[#333] overflow-hidden" role="group" aria-label="How far back">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`px-3 py-1.5 text-xs ${days === d ? 'bg-[#336699]/20 text-white' : 'text-gray-400'}`}
            >
              {d} days
            </button>
          ))}
        </span>
      </div>
      {error && <p className="text-sm text-red-300 mb-3">{error}</p>}
      {data && shown.length === 0 ? (
        <p className="text-sm text-gray-500">No permits match. Widen the days, or show every trade.</p>
      ) : (
        <>
          <table className="hidden md:table w-full text-sm border border-[#2A2A2A] rounded" data-testid="permits-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-[#2A2A2A]">
                <th className="px-4 py-2 font-medium">Applied</th>
                <th className="px-4 py-2 font-medium">Work</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Permit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]">
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{when(p.appliedAt)}</td>
                  <td className="px-4 py-3 text-white">
                    <span className="inline-flex items-center gap-1.5">
                      {p.matchesTrades && <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-label="Your trade" />}
                      {work(p)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{p.address || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{p.status || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#7fb0e0] underline underline-offset-2">
                        {p.permitNumber}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      p.permitNumber
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="md:hidden space-y-3">
            {shown.map((p) => (
              <li key={p.id} className="rounded border border-[#2A2A2A] bg-[#161616] p-4">
                <p className="text-sm font-medium text-white flex items-center gap-1.5">
                  {p.matchesTrades && <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-label="Your trade" />}
                  {work(p)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {p.address || 'Address not given'} · {when(p.appliedAt)}
                  {p.status ? ` · ${p.status}` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-[#7fb0e0] underline underline-offset-2">
                      {p.permitNumber}
                    </a>
                  ) : (
                    p.permitNumber
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
