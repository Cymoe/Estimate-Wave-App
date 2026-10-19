import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Check, Gavel, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { Modal } from '../components/common/Modal';
import { bidsAPI, industriesAPI, walletAPI } from '../lib/api';
import { money } from '../components/market/wallet';
import { openFundingPage, type WalletSummary } from '../components/market/WalletBar';
import { TEXAS_COUNTIES, countyForTown } from '../services/counties';

interface Trade {
  id: string;
  name: string;
}
interface StandingBid {
  id: string;
  county: string;
  jobType: string;
  amountCents: number;
  /** The balance covers it, so it can win. */
  funded: boolean;
  /** No other funded bid beats it here. */
  leading: boolean;
  /** Another company has a funded bid here. */
  contested: boolean;
  /** Kept but out of the running. */
  paused: boolean;
}
interface BidResult {
  bidId: string;
  leadId: string;
  jobType?: string;
  county?: string;
  city?: string;
  myBidCents: number;
  won: boolean;
  outcome?: string;
  resolvedAt?: string;
}

export const MIN_BID = 200;
/** Bids move in $50 steps, never below the minimum. */
export const STEP = 50;
const stepUp = (d: number) => Math.max(MIN_BID, Math.floor(d / STEP) * STEP + STEP);
const stepDown = (d: number) => Math.max(MIN_BID, Math.ceil(d / STEP) * STEP - STEP);

const primary = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap';
const secondary = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-[#333] text-gray-200 text-sm disabled:opacity-50 whitespace-nowrap';
const input = 'bg-[#1A1A1A] border border-[#333] rounded px-3 py-2 text-white text-base md:text-sm focus:outline-none focus:border-[#336699]';

const titleFromSlug = (slug?: string) => (slug ? slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'General');

/**
 * Where a company sets its standing bids: "landscaping leads in Midland
 * County: I'll pay $250". When such a lead comes in, the highest funded bid
 * wins it on the spot and it lands in that company's Leads. One quiet
 * screen: the bids, then what they won or missed. Leads nobody bid on are
 * in the Marketplace, which is its own page.
 */
const BidsPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  const [params] = useSearchParams();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [results, setResults] = useState<BidResult[] | null>(null);
  const [standing, setStanding] = useState<StandingBid[] | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const [w, r, s, t] = await Promise.all([
      walletAPI.get(organizationId),
      bidsAPI.results(organizationId),
      bidsAPI.listStanding(organizationId),
      industriesAPI.list().catch(() => []),
    ]);
    setWallet(w);
    setResults(r);
    setStanding(s);
    setTrades(t);
  }, [organizationId]);

  useEffect(() => {
    load().catch(() => {
      setResults([]);
      setStanding([]);
    });
    const refresh = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(refresh);
  }, [load]);

  // The Marketplace used to be a tab here; old links still land on it.
  if (params.get('tab') === 'marketplace') return <Navigate to="/marketplace" replace />;

  const balance = wallet?.balanceCents ?? 0;
  const addFunds = () => organizationId && openFundingPage(organizationId).catch(() => {});
  const tradeName = (slug?: string) => trades.find((t) => t.id === slug)?.name ?? titleFromSlug(slug);
  const notify = (text: string, good = true) => setMessage({ text, good });
  const won = results?.filter((r) => r.won).length ?? 0;
  const allPaused = !!standing && standing.length > 0 && standing.every((b) => b.paused);
  const pauseAll = async (paused: boolean) => {
    if (!organizationId) return;
    try {
      await bidsAPI.pauseAllStanding(organizationId, paused);
      notify(paused ? 'All bids paused. No leads will be sent to you until you resume.' : 'Bids resumed.');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "That didn't work", false);
    }
  };

  return (
    <div className="p-4 md:p-6 text-white">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h1 className="text-xl font-semibold">Bids</h1>
          <p className="text-sm text-gray-400">
            {standing ? `${standing.length} standing bid${standing.length === 1 ? '' : 's'}` : 'Loading…'} · {won} lead{won === 1 ? '' : 's'} won
            {allPaused && <span className="text-amber-200"> · All bids paused</span>}
          </p>
        </div>
        {standing && (
          <div className="flex items-center gap-2">
            {standing.length > 0 && (
              <button type="button" onClick={() => pauseAll(!allPaused)} className={secondary}>
                {allPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {allPaused ? 'Resume all' : 'Pause all'}
              </button>
            )}
            <button type="button" onClick={() => setAdding(true)} className={primary}>
              <Plus className="w-4 h-4" />
              {standing.length === 0 ? 'Set your bids' : 'Add bid'}
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Where you work, what you do and what a lead is worth to you. Matching leads go to the highest bid the moment they come in and land in your Leads.
      </p>

      {message && (
        <p role="status" className={`text-sm rounded px-3 py-2 mb-4 border ${message.good ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          {message.text}
        </p>
      )}

      {standing === null || results === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-8">
          <StandingTab
            organizationId={organizationId!}
            standing={standing}
            tradeName={tradeName}
            onChanged={load}
            onNotify={notify}
            onAdd={() => setAdding(true)}
            onAddFunds={addFunds}
          />
          {standing.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-white mb-2">Recent results</h2>
              <ResultsTab results={results.slice(0, 10)} tradeName={tradeName} />
            </section>
          )}
          <p className="text-xs text-gray-500">
            Leads nobody bid on are in the{' '}
            <Link to="/marketplace" className="text-[#7fb0e0] underline underline-offset-2">
              Marketplace
            </Link>
            .
          </p>
        </div>
      )}

      {adding && organizationId && (
        <AddBidDialog
          organizationId={organizationId}
          trades={trades}
          preferredTrades={wallet?.leadTrades ?? []}
          balance={balance}
          standing={standing ?? []}
          firstTime={standing?.length === 0}
          onClose={() => setAdding(false)}
          onSaved={load}
          onNotify={notify}
          onAddFunds={addFunds}
        />
      )}
    </div>
  );
};

function Chip({ bid }: { bid: StandingBid }) {
  const [tone, text] = bid.paused
    ? ['bg-[#333] text-gray-300', 'Paused']
    : !bid.funded
    ? ['bg-red-600/25 text-red-200', 'Add funds to cover this bid']
    : bid.leading
      ? ['bg-emerald-600/30 text-emerald-200', 'Highest here']
      : ['bg-amber-600/30 text-amber-200', 'Outbid here · raise to win the next lead'];
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`}>{text}</span>;
}

function StandingTab({
  organizationId,
  standing,
  tradeName,
  onChanged,
  onNotify,
  onAdd,
  onAddFunds,
}: {
  organizationId: string;
  standing: StandingBid[];
  tradeName: (slug?: string) => string;
  onChanged: () => Promise<void>;
  onNotify: (text: string, good?: boolean) => void;
  onAdd: () => void;
  onAddFunds: () => void;
}) {
  // Amounts being changed, by bid id, until saved.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      onNotify(done);
      setDrafts({});
      await onChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "That didn't work", false);
    } finally {
      setBusy(false);
    }
  };

  if (standing.length === 0) {
    return (
      <section className="border border-[#336699]/50 bg-[#336699]/5 rounded p-6 text-center" aria-label="Set your bids">
        <Gavel className="w-8 h-8 mx-auto text-[#7fb0e0] mb-2" />
        <h2 className="text-base font-semibold text-white">Set your bids</h2>
        <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
          Pick the counties you work in, the kind of work, and what a lead is worth to you. From then on, matching leads are yours the moment they come
          in, as long as your bid is the highest.
        </p>
        <button type="button" onClick={onAdd} className={`${primary} mt-4`}>
          <Plus className="w-4 h-4" />
          Set your bids
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm border border-[#2A2A2A] rounded" aria-label="My standing bids">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="font-medium px-4 py-2">County</th>
            <th className="font-medium px-4 py-2">Service</th>
            <th className="font-medium px-4 py-2 text-right">Your bid</th>
            <th className="font-medium px-4 py-2">Standing</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2A2A2A]">
          {standing.map((bid) => (
            <tr key={bid.id}>
              <td className="px-4 py-3 text-white">{bid.county} County</td>
              <td className="px-4 py-3 text-gray-300">{tradeName(bid.jobType)}</td>
              <td className="px-4 py-3 text-right">
                {(() => {
                  const draft = drafts[bid.id] ?? String(bid.amountCents / 100);
                  const changed = Number(draft) !== bid.amountCents / 100;
                  return (
                    <form
                      className="inline-flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (changed) act(() => bidsAPI.setStanding(organizationId, bid.county, bid.jobType, Number(draft)), 'Bid updated.');
                      }}
                    >
                      <BidStepper label={`Bid for ${tradeName(bid.jobType)} in ${bid.county}`} value={draft} onChange={(v) => setDrafts((d) => ({ ...d, [bid.id]: v }))} />
                      {changed && (
                        <button type="submit" disabled={busy || !(Number(draft) >= MIN_BID)} className={primary} aria-label="Save bid">
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </form>
                  );
                })()}
              </td>
              <td className="px-4 py-3">
                <Chip bid={bid} />
                {!bid.funded && !bid.paused && (
                  <button type="button" onClick={onAddFunds} className="block text-xs text-[#7fb0e0] underline underline-offset-2 mt-1">
                    Add funds
                  </button>
                )}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  aria-label={`${bid.paused ? 'Resume' : 'Pause'} bid for ${tradeName(bid.jobType)} in ${bid.county}`}
                  title={bid.paused ? 'Resume' : 'Pause'}
                  disabled={busy}
                  onClick={() => act(() => bidsAPI.pauseStanding(bid.id, !bid.paused), bid.paused ? 'Bid resumed.' : 'Bid paused.')}
                  className="p-2 text-gray-500 hover:text-white"
                >
                  {bid.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  aria-label={`Remove bid for ${tradeName(bid.jobType)} in ${bid.county}`}
                  disabled={busy}
                  onClick={() => act(() => bidsAPI.removeStanding(bid.id), 'Bid removed.')}
                  className="p-2 text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultsTab({ results, tradeName }: { results: BidResult[]; tradeName: (slug?: string) => string }) {
  if (results.length === 0) {
    return <p className="text-sm text-gray-500">No leads have matched your bids yet. When one does, you'll see here whether you won it and what you paid.</p>;
  }
  return (
    <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Results">
      {results.map((r) => (
        <li key={r.bidId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="block text-white truncate">
              {tradeName(r.jobType)} · {r.county ? `${r.county} County` : r.city || 'Area not given'}
              {r.city && r.county ? ` · ${r.city}` : ''}
            </span>
            <span className="block text-xs text-gray-500">
              {r.won ? `Won at ${money(r.myBidCents)} · now in your Leads` : r.outcome ?? 'Lost'}
              {r.resolvedAt ? ` · ${new Date(r.resolvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
            </span>
          </span>
          <span className={`text-xs whitespace-nowrap ${r.won ? 'text-emerald-300' : 'text-gray-500'}`}>{r.won ? 'Won' : 'Lost'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Three steps in a dialog: where (counties), what (service), how much (per lead). */
/** [−] $250 [+]: typed or stepped in $50s, never below the minimum. */
function BidStepper({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const dollars = Number(value);
  const ok = Number.isFinite(dollars) && value.trim() !== '';
  const control = 'px-3 text-lg leading-none text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:text-gray-300';
  return (
    <div className="inline-flex items-stretch rounded border border-[#333] bg-[#1A1A1A]">
      <button type="button" aria-label={`Lower ${label}`} disabled={!ok || dollars <= MIN_BID} onClick={() => onChange(String(stepDown(dollars)))} className={control}>
        −
      </button>
      <label className="flex items-center border-x border-[#333] text-sm text-gray-400">
        <span className="pl-2">$</span>
        <input
          inputMode="decimal"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 bg-transparent px-1 py-2 text-right text-white text-base md:text-sm focus:outline-none"
        />
      </label>
      <button type="button" aria-label={`Raise ${label}`} disabled={!ok} onClick={() => onChange(String(stepUp(dollars)))} className={control}>
        +
      </button>
    </div>
  );
}

function AddBidDialog({
  organizationId,
  trades,
  preferredTrades,
  balance,
  standing,
  firstTime,
  onClose,
  onSaved,
  onNotify,
  onAddFunds,
}: {
  organizationId: string;
  trades: Trade[];
  preferredTrades: string[];
  balance: number;
  /** Bids already placed, so rows prefill and show where they stand. */
  standing: StandingBid[];
  firstTime: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onNotify: (text: string, good?: boolean) => void;
  onAddFunds: () => void;
}) {
  const [search, setSearch] = useState('');
  // One county at a time; bids in another county are a second visit.
  const [county, setCounty] = useState<string | null>(null);
  // One amount per trade; a trade with no entry isn't being bid on.
  const [bids, setBids] = useState<Record<string, string>>(() =>
    Object.fromEntries(preferredTrades.filter((t) => trades.some((x) => x.id === t)).map((t) => [t, String(MIN_BID)])),
  );
  // Rows the company has set by hand; a bid already placed never overwrites those.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const setBid = (id: string, value: string) => {
    setTouched((t) => new Set(t).add(id));
    setBids((b) => ({ ...b, [id]: value }));
  };
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  // The company's own trades first, then everything else.
  const ordered = useMemo(() => {
    const preferred = trades.filter((t) => preferredTrades.includes(t.id));
    return [...preferred, ...trades.filter((t) => !preferredTrades.includes(t.id))];
  }, [trades, preferredTrades]);
  // A long catalogue is folded to the company's trades plus anything live, until "More trades".
  const FOLD_AT = 8;
  const folded = ordered.length > FOLD_AT && !showAll;
  const shownTrades = folded ? ordered.filter((t) => preferredTrades.includes(t.id) || bids[t.id] !== undefined) : ordered;
  const live = ordered.filter((t) => bids[t.id] !== undefined);

  // Type a county or a town: "Mid" finds Midland, "Odessa" finds Ector.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const town = countyForTown(search);
    const starts = TEXAS_COUNTIES.filter((c) => c.toLowerCase().startsWith(q));
    const within = TEXAS_COUNTIES.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
    const out = [...(town ? [{ county: town, via: search.trim() }] : []), ...[...starts, ...within].map((county) => ({ county, via: undefined as string | undefined }))];
    return out.filter((m, i) => out.findIndex((o) => o.county === m.county) === i).slice(0, 8);
  }, [search]);
  const pick = (name: string) => {
    setCounty(name);
    // Bids already placed there fill their rows, so this screen edits as well as adds.
    setBids((b) => {
      const next = { ...b };
      for (const sb of standing) if (sb.county === name && !touched.has(sb.jobType)) next[sb.jobType] = String(sb.amountCents / 100);
      return next;
    });
    setSearch('');
  };
  const turnOn = (id: string) => setBid(id, String(MIN_BID));
  const turnOff = (id: string) => {
    setTouched((t) => new Set(t).add(id));
    setBids((b) => {
      const next = { ...b };
      delete next[id];
      return next;
    });
  };
  /** Where the company's existing bid for this trade stands in the chosen county. */
  const standingFor = (id: string): 'top' | 'outbid' | 'paused' | null => {
    const mine = standing.find((sb) => sb.jobType === id && sb.county === county);
    return mine ? (mine.paused ? 'paused' : mine.leading ? 'top' : 'outbid') : null;
  };

  const amounts = live.map((t) => Number(bids[t.id]));
  const amountsOk = amounts.every((a) => Number.isFinite(a) && a >= MIN_BID);
  const top = amounts.length ? Math.max(...amounts) : 0;
  const affordable = amountsOk && top * 100 <= balance;
  const covers = amountsOk && top > 0 ? Math.floor(balance / (top * 100)) : 0;
  const ready = county !== null && live.length > 0 && affordable;
  const rows = live.length;

  const save = async () => {
    setBusy(true);
    try {
      for (const t of live) await bidsAPI.setStanding(organizationId, county!, t.id, Number(bids[t.id]));
      const where = `${county} County`;
      const names = live.map((t) => t.name);
      const what = names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      const same = amounts.every((a) => a === amounts[0]);
      const price = same ? ` at ${money(amounts[0] * 100)},` : ' at the price you set for each,';
      onNotify(`You're set: new ${what} leads in ${where} go to you the moment they come in,${price} while your bid is the highest.`);
      await onSaved();
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "The bid couldn't be saved", false);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen title={firstTime ? 'Set your bids' : 'Add a bid'} onClose={onClose} size="xl">
      <div className="p-6 space-y-7">
        {/* Where: a search box until a county is picked, then just its name. */}
        <section aria-label="Where">
          <p className="text-sm font-medium text-white mb-2">{county ? 'County' : 'Which county?'}</p>
          {county ? (
            <p className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-[#2A2A2A] bg-[#121212] text-sm">
              <span className="text-white">{county} County</span>
              <button type="button" onClick={() => setCounty(null)} aria-label="Change county" className="text-xs text-[#7fb0e0] underline underline-offset-2">
                Change
              </button>
            </p>
          ) : (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches[0]) {
                    e.preventDefault();
                    pick(matches[0].county);
                  }
                }}
                placeholder="Type a county or town, like Midland or Odessa"
                aria-label="Search counties"
                autoFocus
                className={`${input} w-full`}
              />
              {/* Fixed height, so the dialog doesn't jump as matches come and go. */}
              <ul className="mt-1 h-36 overflow-y-auto divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Counties">
                {matches.map((m) => (
                  <li key={m.county}>
                    <button type="button" onClick={() => pick(m.county)} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#1E1E1E]">
                      <span>{m.county} County</span>
                      {m.via && <span className="text-xs text-gray-500">{m.via} is in {m.county} County</span>}
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-3 py-2 text-sm text-gray-500">
                    {search.trim() === '' ? 'Type to find a county. Any Texas county works.' : `Nothing matches "${search.trim()}". Try the county name or a town in it.`}
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        {/* Your bids: one row per trade, each with its own price. Shown once a county is picked. */}
        {county && (
        <section aria-label="Your bids">
          <div className="flex items-baseline justify-between gap-4 mb-1">
            <p className="text-sm font-medium text-white">Your bids</p>
            <p className="text-xs text-gray-500">{`Per lead · ${money(STEP * 100)} steps · from ${money(MIN_BID * 100)}`}</p>
          </div>
          <ul className="divide-y divide-[#2A2A2A] border-y border-[#2A2A2A]" aria-label="Bids by trade">
            {shownTrades.map((t) => {
              const on = bids[t.id] !== undefined;
              const where = standingFor(t.id);
              return (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm text-white">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>Min {money(MIN_BID * 100)}</span>
                      {where === 'top' && <span className="px-1.5 py-px rounded bg-emerald-600/30 text-emerald-200 text-[10px] font-semibold tracking-wide">TOP</span>}
                      {where === 'outbid' && <span className="text-amber-200">Outbid · raise to win</span>}
                      {where === 'paused' && <span className="text-gray-400">Paused</span>}
                    </p>
                  </div>
                  {on ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <BidStepper label={`${t.name} bid`} value={bids[t.id]} onChange={(v) => setBid(t.id, v)} />
                      <button type="button" onClick={() => turnOff(t.id)} aria-label={`Stop bidding on ${t.name}`} className="p-2 text-gray-500 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => turnOn(t.id)} className={`${secondary} flex-shrink-0`}>
                      Bid {money(MIN_BID * 100)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {folded && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-sm text-[#7fb0e0] underline underline-offset-2">
              More trades…
            </button>
          )}
        </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-gray-500">
            {!county
              ? ''
              : !amountsOk
              ? `Bids start at ${money(MIN_BID * 100)}.`
              : !affordable
                ? `Your top bid is more than your balance (${money(balance)}).`
                : `Balance ${money(balance)} covers about ${covers} lead${covers === 1 ? '' : 's'} at your top bid. You only pay when you win.`}
            {amountsOk && !affordable && (
              <button type="button" onClick={onAddFunds} className="ml-2 text-[#7fb0e0] underline underline-offset-2">
                Add funds
              </button>
            )}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onClose} className={secondary}>
              Cancel
            </button>
            <button type="button" disabled={busy || !ready} onClick={save} className={primary}>
              {busy ? 'Saving…' : firstTime ? 'Start bidding' : rows > 1 ? `Save ${rows} bids` : 'Save bid'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default BidsPage;
