import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { demandAPI } from '../../lib/api';
import { useDemandBoard, useDemandSlot } from '../../lib/live';
import { money } from '../market/wallet';
import { ago, input, tap, usePanel } from './ui';

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
  /** Sold in the last 30 days, by a standing bid or in the Marketplace. */
  sold30: number;
  /** What those sold for. Null until something sold. */
  avgSoldCents: number | null;
  minSoldCents: number | null;
  maxSoldCents: number | null;
  lastSoldCents: number | null;
  /** sold30 / listed30; null until something was listed. */
  sellThrough: number | null;
  inMarketplace: number;
  inVault: number;
  /** Active companies that buy this trade anywhere. */
  buyers: number;
  planCplCents?: number;
  marginCents: number | null;
  /** "sold": margin on what leads fetched. "bid": on the top funded bid, until enough sold. */
  marginBasis: 'sold' | 'bid';
  state: 'open' | 'unknown' | 'loss' | 'unfunded' | 'oversupplied' | 'nobuyers' | 'quiet';
}

export interface DemandBoardData {
  vaCostCents: number;
  /** No real lead yet: the lead numbers are demo data, and the board says so. */
  demoLeads: boolean;
  planCpl: Record<string, number>;
  slots: DemandSlot[];
}

/** Whole dollars for the cards: "$845", not "$845.00". */
const dollars = (cents: number) => `$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;

/** The one number a card leads with: the profit a lead, or why there isn't one yet. */
function headline(s: DemandSlot): string {
  if (s.marginCents !== null) return `${dollars(s.marginCents)} ${s.marginCents >= 0 ? 'profit' : 'loss'}`;
  if (s.state === 'unknown') return 'Add ad cost';
  if (s.bidders > 0 && s.topFundedCents === undefined) return 'Nobody can pay';
  return 'No bids yet';
}

/** The bid that would win the next lead here: the most a company that can pay has bid. */
const winningBid = (s: DemandSlot) => (s.topFundedCents !== undefined ? `Winning bid ${dollars(s.topFundedCents)}` : null);

/** The bids in one sentence: who is bidding, the most a company that can pay has bid, and how far the money goes. */
function bidsLine(s: DemandSlot): string {
  if (s.topFundedCents !== undefined)
    return `${s.bidders} ${s.bidders === 1 ? 'bidder' : 'bidders'} · highest funded bid ${money(s.topFundedCents)} · covers ${s.depthLeads} more`;
  if (s.bidders > 0) return `${s.bidders} ${s.bidders === 1 ? 'bidder' : 'bidders'}, nobody can pay`;
  return 'No bids yet';
}

const STATE: Record<DemandSlot['state'], { label: string; cell: string }> = {
  open: { label: 'Run ads here', cell: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' },
  unknown: { label: 'Has buyers · type your ad cost per lead to check profit', cell: 'bg-sky-500/10 border-sky-500/40 text-sky-200' },
  loss: { label: "Bids don't cover your ad cost per lead", cell: 'bg-amber-500/15 border-amber-500/60 text-amber-100' },
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
  const [search, setSearch] = useState('');

  if (data === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  // The search narrows the grid to the counties and trades that match it.
  const q = search.trim().toLowerCase();
  const shown = q ? data.slots.filter((s) => s.county.toLowerCase().includes(q) || s.tradeName.toLowerCase().includes(q)) : data.slots;
  const counties = [...new Set(shown.map((s) => s.county))].sort();
  const trades = [...new Map(shown.map((s) => [s.jobType, s.tradeName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const at = (county: string, jobType: string) => shown.find((s) => s.county === county && s.jobType === jobType);
  // A card shows the profit and what to do; the hover text and the drawer carry the rest.
  const cell = bidsLine;
  // The 30-day window is about the county and trade, not about when a bid was placed: say which.
  const sales = (s: DemandSlot) => {
    const unsold = s.inMarketplace + s.inVault > 0 ? ` · ${s.inMarketplace + s.inVault} still unsold` : '';
    const demo = data.demoLeads && s.listed30 > 0 ? ' (demo)' : '';
    if (s.listed30 === 0) return `No ${s.tradeName} leads in ${s.county} County, last 30 days${unsold}`;
    if (s.sold30 === 0) return `Last 30 days: ${s.listed30} ${s.tradeName} ${s.listed30 === 1 ? 'lead' : 'leads'} in ${s.county} County, none sold${unsold}${demo}`;
    return `Last 30 days: ${s.listed30} ${s.tradeName} ${s.listed30 === 1 ? 'lead' : 'leads'} in ${s.county} County, ${s.sold30} sold${s.avgSoldCents !== null ? `, about ${money(s.avgSoldCents)} each` : ''}${unsold}${demo}`;
  };
  const margin = (s: DemandSlot) =>
    s.marginCents === null
      ? null
      : `About ${s.marginCents >= 0 ? '+' : '−'}${money(Math.abs(s.marginCents))} ${s.marginCents >= 0 ? 'profit ' : ''}a lead${s.marginBasis === 'sold' ? ' (on real sales)' : ''}`;
  // Cards are one fixed size, so a long line may clip: the hover text carries all of it.
  const tip = (s: DemandSlot) =>
    [
      `${STATE[s.state].label}${
        s.marginCents !== null
          ? s.marginBasis === 'sold'
            ? ' · Profit is figured on real sales'
            : ' · Profit is figured on the highest funded bid; switches to real sales after 3'
          : ''
      }`,
      cell(s),
      sales(s),
      margin(s) ?? '',
    ]
      .filter(Boolean)
      .join('\n');
  // Narrow enough to fit six or seven trades across an iPad: the profit, then what to do.
  const CARD = 'h-[4.75rem] w-full text-left rounded border px-2 py-1.5 leading-snug overflow-hidden';
  // Green with a winning bid already says "run ads": only the other colours spell out what to do.
  const action = (s: DemandSlot) => (s.state === 'open' ? null : STATE[s.state].label);
  const named = (s: DemandSlot) => `${s.tradeName} in ${s.county} County: ${headline(s)}.${winningBid(s) ? ` ${winningBid(s)}.` : ''} ${STATE[s.state].label}`;

  return (
    <div className="space-y-4" data-testid="demand-board">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Each square is one county and one trade: about how much profit a lead there makes, the winning bid (the most a company that can pay has bid), and what to do. Tap a square for the bids and the last 30 days of leads behind it. Profit a lead = price − the ad cost per lead you type in the column header − {money(data.vaCostCents)} for the confirmation call. The price is the highest funded bid until 3 leads sell, then what they sold for. Updates on its own.
          {data.demoLeads && <span className="block mt-1 text-amber-300/80">No real lead yet, so the lead numbers are demo data. They switch to real the moment the first real lead is confirmed.</span>}
        </p>
        {data.slots.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="County or trade"
            aria-label="Search the board"
            className={`${input} py-1.5 text-sm w-full sm:w-48`}
          />
        )}
      </div>

      {data.slots.length === 0 ? (
        <div className="border border-dashed border-[#333] rounded p-8 text-center">
          <p className="text-sm text-gray-400">No bids or leads yet. The board fills in as companies set standing bids.</p>
          {owner && <p className="text-xs text-gray-500 mt-2">The ad cost per lead boxes sit in the column headers once the grid has columns.</p>}
        </div>
      ) : (
        <>
          <div className="hidden md:block border border-[#2A2A2A] rounded overflow-x-auto">
            <table className="w-full text-sm" aria-label="Demand">
              <thead className="text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">County</th>
                  {trades.map(([slug, name]) => (
                    <th key={slug} className="text-left px-1.5 py-2">
                      {name}
                      {owner ? (
                        <PlanCpl jobType={slug} tradeName={name} cents={data.planCpl[slug]} />
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
                        <td key={slug} className="px-1.5 py-1.5 w-44 min-w-[11rem] align-top">
                          {s ? (
                            <button type="button" onClick={() => setOpen(s)} title={tip(s)} aria-label={named(s)} data-state={s.state} className={`${CARD} ${STATE[s.state].cell}`}>
                              <span className="block truncate text-base font-semibold">{headline(s)}</span>
                              <span className="block truncate text-xs">{winningBid(s) ?? '\u00a0'}</span>
                              {action(s) && <span className="block truncate text-[11px] opacity-75">{action(s)}</span>}
                            </button>
                          ) : (
                            <span className="flex h-[4.75rem] items-center justify-center text-gray-700">·</span>
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
            {shown.map((s) => (
              <li key={`${s.county}|${s.jobType}`}>
                <button type="button" onClick={() => setOpen(s)} title={tip(s)} aria-label={named(s)} data-state={s.state} className={`min-h-[4rem] w-full text-left rounded border px-3 py-2 overflow-hidden ${STATE[s.state].cell}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">
                      {s.tradeName} · {s.county} County
                    </span>
                    <span className="shrink-0 text-base font-semibold">{headline(s)}</span>
                  </span>
                  <span className="block truncate text-xs opacity-75">{[winningBid(s), action(s)].filter(Boolean).join(' · ') || '\u00a0'}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="text-sm text-gray-500">Nothing matches “{search.trim()}”.</li>}
          </ul>
        </>
      )}

      {open && <SlotPanel slot={open} vaCostCents={data.vaCostCents} demo={data.demoLeads} onClose={() => setOpen(null)} />}
    </div>
  );
};

/** The ad cost per lead for a trade, typed in by the owner. The board picks the change up on its own. */
function PlanCpl({ jobType, tradeName, cents }: { jobType: string; tradeName: string; cents?: number }) {
  const shown = (c?: number) => (c !== undefined ? String(c / 100) : '');
  const [value, setValue] = useState(shown(cents));
  const [state, setState] = useState<{ kind: 'saved' } | { kind: 'error'; text: string } | null>(null);
  useEffect(() => setValue(shown(cents)), [cents]);
  const save = async () => {
    if (value === shown(cents)) return;
    const n = Number(value.replace(/[$,]/g, ''));
    if (value.trim() !== '' && !(Number.isFinite(n) && n >= 0)) {
      setState({ kind: 'error', text: 'Enter an ad cost per lead in dollars' });
      setValue(shown(cents));
      return;
    }
    try {
      await demandAPI.setPlanCpl(jobType, value.trim() === '' ? null : Math.round(n * 100));
      setState({ kind: 'saved' });
      window.setTimeout(() => setState((s) => (s?.kind === 'saved' ? null : s)), 1500);
    } catch (err) {
      // Put back what is stored, and say why.
      setValue(shown(cents));
      setState({ kind: 'error', text: err instanceof Error && err.message ? err.message.replace(/^.*Uncaught (Convex)?Error:\s*/, '') : "Didn't save" });
    }
  };
  return (
    <span className="block mt-1 normal-case font-normal">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState(null);
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="ad cost/lead $"
        aria-label={`Ad cost per ${tradeName} lead`}
        className={`${input} py-1 text-xs w-24`}
      />
      {state?.kind === 'saved' && <span className="block text-[11px] text-emerald-300 mt-0.5">✓ Saved</span>}
      {state?.kind === 'error' && (
        <span role="alert" className="block text-[11px] text-red-300 mt-0.5">
          {state.text}
        </span>
      )}
    </span>
  );
}

/** The profit arithmetic, written out: price − ad cost − the call. */
function worthIt(slot: DemandSlot, vaCostCents: number): string {
  const price = slot.marginBasis === 'sold' && slot.avgSoldCents !== null ? slot.avgSoldCents : slot.topFundedCents;
  if (price === undefined) return 'No price to figure profit from yet: nobody with money has bid here, and nothing has sold.';
  if (slot.planCplCents === undefined) return `Type an ad cost per lead in the ${slot.tradeName} column header to see profit here.`;
  const profit = price - slot.planCplCents - vaCostCents;
  const basis = slot.marginBasis === 'sold' ? 'real average' : 'highest funded bid';
  return `Worth it? ${money(price)} ${basis} − ${money(slot.planCplCents)} ad cost − ${money(vaCostCents)} call = about ${profit < 0 ? '−' : ''}${money(Math.abs(profit))} ${profit < 0 ? 'lost' : 'profit'} a lead.`;
}

function SlotPanel({ slot, vaCostCents, demo, onClose }: { slot: DemandSlot; vaCostCents: number; demo: boolean; onClose: () => void }) {
  const panelRef = usePanel<HTMLElement>(onClose);
  const detail =
    useDemandSlot<{
      bidders: Array<{ companyName: string; amountCents: number; balanceCents: number; funded: boolean }>;
      buyers: string[];
      leads: Array<{ id: string; name: string; status: string; createdAt: string; priceCents?: number; companyName?: string }>;
    }>(slot.county, slot.jobType) ?? null;
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${slot.tradeName} in ${slot.county} County`} className="fixed right-0 top-0 h-[100dvh] w-full md:w-[440px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col outline-none">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {slot.tradeName} · {slot.county} County
            </h2>
            <p className="text-xs text-gray-500">{STATE[slot.state].label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`${tap} -m-3 text-gray-400 hover:text-white`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          <p className="text-white font-medium" data-testid="slot-profit">
            {worthIt(slot, vaCostCents)}
          </p>
          <p className="text-gray-300" data-testid="slot-bids">
            {bidsLine(slot)}
          </p>
          <p className="text-gray-300" data-testid="slot-sales">
            {slot.listed30 === 0
              ? `No ${slot.tradeName} leads came in for ${slot.county} County in the last 30 days, whenever the bids here were placed.`
              : `Last 30 days: ${slot.listed30} ${slot.tradeName} ${slot.listed30 === 1 ? 'lead' : 'leads'} came in for ${slot.county} County, ${slot.sold30} sold${slot.sellThrough !== null ? ` (${Math.round(slot.sellThrough * 100)}%)` : ''}.`}
            {slot.listed30 > 0 && (
              <>
              {slot.avgSoldCents !== null && slot.minSoldCents !== null && slot.maxSoldCents !== null
                ? ` ${slot.sold30 === 1 ? 'It' : 'They'} went for ${
                    slot.minSoldCents === slot.maxSoldCents ? money(slot.minSoldCents) : `${money(slot.minSoldCents)} to ${money(slot.maxSoldCents)}, about ${money(slot.avgSoldCents)} each`
                  }${slot.lastSoldCents !== null && slot.sold30 > 1 ? `, the latest for ${money(slot.lastSoldCents)}` : ''}.`
                : ''}
              {slot.sold30 > 0 && slot.soldAtAward30 > 0 ? ` ${slot.soldAtAward30} went straight to a standing bid.` : ''}
              {demo ? ' These are demo leads.' : ''}
              </>
            )}
          </p>
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
