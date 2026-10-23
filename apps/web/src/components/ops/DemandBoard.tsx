import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { demandAPI } from '../../lib/api';
import { useDemandBoard, useDemandSlot } from '../../lib/live';
import { money } from '../market/wallet';
import { ago, input } from './ui';

export interface DemandSlot {
  county: string;
  jobType: string;
  tradeName: string;
  bidders: number;
  fundedBidders: number;
  topFundedCents?: number;
  secondFundedCents?: number;
  depthLeads: number;
  listed7: number;
  listed30: number;
  soldAtAward30: number;
  inMarketplace: number;
  inVault: number;
  /** Active companies that buy this trade anywhere. */
  buyers: number;
  planCplCents?: number;
  marginCents: number | null;
  state: 'open' | 'unfunded' | 'oversupplied' | 'nobuyers' | 'quiet';
}

export interface DemandBoardData {
  vaCostCents: number;
  planCpl: Record<string, number>;
  slots: DemandSlot[];
}

const STATE: Record<DemandSlot['state'], { label: string; cell: string }> = {
  open: { label: 'Run ads here', cell: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' },
  unfunded: { label: 'Bids, but nobody can pay', cell: 'bg-amber-500/10 border-amber-500/40 text-amber-200' },
  oversupplied: { label: 'Leads sitting unsold: pause', cell: 'bg-red-500/10 border-red-500/40 text-red-200' },
  nobuyers: { label: 'Nobody buys this trade: sign a company', cell: 'bg-red-500/20 border-red-500/60 text-red-200' },
  quiet: { label: 'Nothing here', cell: 'bg-[#161616] border-[#2A2A2A] text-gray-400' },
};

/**
 * Where to run ads: for each county and trade, the top bid a funded
 * company will pay and how many leads their balances absorb, against what
 * a lead costs to generate. Green means go, amber means the bids can't
 * pay, red means leads are already sitting unsold, and the darker red
 * means no company buys the trade at all (a sales call, not a campaign
 * change). Live: a bid changed anywhere shows here on its own.
 */
export const DemandBoard: React.FC<{ owner: boolean }> = ({ owner }) => {
  const data = useDemandBoard<DemandBoardData>();
  const [open, setOpen] = useState<DemandSlot | null>(null);

  if (data === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  const counties = [...new Set(data.slots.map((s) => s.county))].sort();
  const trades = [...new Map(data.slots.map((s) => [s.jobType, s.tradeName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const at = (county: string, jobType: string) => data.slots.find((s) => s.county === county && s.jobType === jobType);
  const cell = (s: DemandSlot) =>
    s.topFundedCents !== undefined ? `${money(s.topFundedCents)} · ${s.depthLeads} lead${s.depthLeads === 1 ? '' : 's'}` : s.bidders > 0 ? `${s.bidders} unfunded` : '—';

  return (
    <div className="space-y-4" data-testid="demand-board">
      <p className="text-xs text-gray-500">
        Top funded bid · leads the balances absorb. Margin = bid − planned cost per lead − {money(data.vaCostCents)} for the confirmation call. Updates on its own.
      </p>

      {data.slots.length === 0 ? (
        <div className="border border-dashed border-[#333] rounded p-8 text-center">
          <p className="text-sm text-gray-400">No bids or leads yet. The board fills in as companies set standing bids.</p>
          {owner && <p className="text-xs text-gray-500 mt-2">The cost-per-lead boxes sit in the column headers once the grid has columns.</p>}
        </div>
      ) : (
        <>
          <div className="hidden md:block border border-[#2A2A2A] rounded overflow-x-auto">
            <table className="w-full text-sm" aria-label="Demand">
              <thead className="text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">County</th>
                  {trades.map(([slug, name]) => (
                    <th key={slug} className="text-left px-3 py-2">
                      {name}
                      {owner ? (
                        <PlanCpl jobType={slug} cents={data.planCpl[slug]} />
                      ) : data.planCpl[slug] !== undefined ? (
                        <span className="block text-[10px] normal-case text-gray-500">costs {money(data.planCpl[slug])}</span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {counties.map((county) => (
                  <tr key={county} className="border-t border-[#2A2A2A]">
                    <td className="px-3 py-2 text-white whitespace-nowrap">{county}</td>
                    {trades.map(([slug]) => {
                      const s = at(county, slug);
                      return (
                        <td key={slug} className="px-2 py-1.5">
                          {s ? (
                            <button
                              type="button"
                              onClick={() => setOpen(s)}
                              title={STATE[s.state].label}
                              data-state={s.state}
                              className={`w-full text-left rounded border px-2 py-1.5 text-xs ${STATE[s.state].cell}`}
                            >
                              <span className="block">{cell(s)}</span>
                              <span className="block opacity-75">
                                {s.marginCents !== null ? `${s.marginCents >= 0 ? '+' : '−'}${money(Math.abs(s.marginCents))} margin` : `${s.listed30} listed · ${s.soldAtAward30} sold`}
                                {s.inMarketplace + s.inVault > 0 ? ` · ${s.inMarketplace + s.inVault} unsold` : ''}
                              </span>
                            </button>
                          ) : (
                            <span className="block text-center text-gray-700">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden space-y-2" aria-label="Demand">
            {data.slots.map((s) => (
              <li key={`${s.county}|${s.jobType}`}>
                <button type="button" onClick={() => setOpen(s)} data-state={s.state} className={`w-full text-left rounded border px-3 py-2 ${STATE[s.state].cell}`}>
                  <span className="block text-sm">
                    {s.tradeName} · {s.county} County
                  </span>
                  <span className="block text-xs opacity-80">
                    {cell(s)}
                    {s.marginCents !== null ? ` · ${s.marginCents >= 0 ? '+' : '−'}${money(Math.abs(s.marginCents))} margin` : ''} · {STATE[s.state].label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {open && <SlotPanel slot={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

/** The planned cost per lead for a trade, typed in by the owner. The board picks the change up on its own. */
function PlanCpl({ jobType, cents }: { jobType: string; cents?: number }) {
  const [value, setValue] = useState(cents !== undefined ? String(cents / 100) : '');
  useEffect(() => setValue(cents !== undefined ? String(cents / 100) : ''), [cents]);
  const save = async () => {
    const n = Number(value);
    if (value.trim() === '') await demandAPI.setPlanCpl(jobType, null);
    else if (Number.isFinite(n) && n >= 0) await demandAPI.setPlanCpl(jobType, Math.round(n * 100));
  };
  return (
    <span className="block mt-1 normal-case font-normal">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="cost/lead $"
        aria-label={`Planned cost per ${jobType} lead`}
        className={`${input} py-1 text-xs w-24`}
      />
    </span>
  );
}

function SlotPanel({ slot, onClose }: { slot: DemandSlot; onClose: () => void }) {
  const detail =
    useDemandSlot<{
      bidders: Array<{ companyName: string; amountCents: number; balanceCents: number; funded: boolean }>;
      buyers: string[];
      leads: Array<{ id: string; name: string; status: string; createdAt: string; priceCents?: number; companyName?: string }>;
    }>(slot.county, slot.jobType) ?? null;
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
      <aside role="dialog" aria-label={`${slot.tradeName} in ${slot.county} County`} className="fixed right-0 top-0 h-[100dvh] w-full md:w-[440px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {slot.tradeName} · {slot.county} County
            </h2>
            <p className="text-xs text-gray-500">{STATE[slot.state].label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          <section>
            <h3 className="text-sm font-medium text-white mb-2">Bidders</h3>
            {detail === null ? (
              <p className="text-gray-500">Loading…</p>
            ) : detail.bidders.length === 0 && detail.buyers.length === 0 ? (
              <p className="text-red-200">No company lists {slot.tradeName} as a trade it buys, so nobody can bid or buy here. Sign one before sending leads.</p>
            ) : detail.bidders.length === 0 ? (
              <p className="text-gray-500">
                No standing bids here. {detail.buyers.length === 1 ? `${detail.buyers[0]} buys` : `${detail.buyers.length} companies buy`} {slot.tradeName} elsewhere; a lead here goes to the Marketplace.
              </p>
            ) : (
              <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Bidders">
                {detail.bidders.map((b) => (
                  <li key={b.companyName} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-white">{b.companyName}</span>
                    <span className={b.funded ? 'text-emerald-300' : 'text-amber-300'}>
                      {money(b.amountCents)} ·{' '}
                      {b.funded
                        ? `can pay for ${Math.floor(b.balanceCents / b.amountCents)} more ${Math.floor(b.balanceCents / b.amountCents) === 1 ? 'lead' : 'leads'}`
                        : `can't pay: balance ${money(b.balanceCents)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="text-sm font-medium text-white mb-2">Leads in the last 30 days</h3>
            {detail === null ? null : detail.leads.length === 0 ? (
              <p className="text-gray-500">None yet. This is where the next campaign goes.</p>
            ) : (
              <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Slot leads">
                {detail.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-white">
                      {l.name} <span className="text-gray-500">· {ago(l.createdAt)}</span>
                    </span>
                    <span className="text-gray-300">
                      {l.status === 'assigned' ? `to ${l.companyName ?? 'a company'}${l.priceCents ? ` · ${money(l.priceCents)}` : ''}` : l.status === 'available' ? 'in the Marketplace' : l.status === 'older' ? 'in the Vault' : l.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>,
    document.body,
  );
}
