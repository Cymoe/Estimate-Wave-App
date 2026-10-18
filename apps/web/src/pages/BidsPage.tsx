import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Gavel, MapPin, Trash2, Wallet } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { bidsAPI, industriesAPI, walletAPI } from '../lib/api';
import { money } from '../components/market/wallet';
import { openFundingPage, type WalletSummary } from '../components/market/WalletBar';
import { MarketplaceFeed, span } from './MarketplacePage';
import { COUNTY_CHOICES, WEST_TEXAS_COUNTIES } from '../services/counties';

type Tab = 'rounds' | 'bids' | 'marketplace';

interface Trade {
  id: string;
  name: string;
}
interface StandingBid {
  id: string;
  county: string;
  jobType: string;
  amountCents: number;
}
interface OpenRound {
  bidId: string;
  leadId: string;
  jobType?: string;
  county?: string;
  city?: string;
  summary?: string;
  opensAt: string;
  closesAt: string;
  myBidCents: number;
  highest: boolean;
  bidders: number;
}
interface RoundResult {
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
export const MIN_RAISE = 10;

const primary = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap';
const secondary = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-[#333] text-gray-200 text-sm disabled:opacity-50 whitespace-nowrap';
const input = 'bg-[#1A1A1A] border border-[#333] rounded px-3 py-2 text-white text-base md:text-sm focus:outline-none focus:border-[#336699]';

const titleFromSlug = (slug?: string) => (slug ? slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'General');

/**
 * Where a company bids for leads. A standing bid says "landscaping leads in
 * Midland County: I'll pay $250"; when such a lead comes in, a timed round
 * opens and the company is entered at that amount. The Marketplace tab is
 * where leads nobody bid on go.
 */
const BidsPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab | null>((params.get('tab') as Tab) || null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [rounds, setRounds] = useState<{ open: OpenRound[]; results: RoundResult[]; roundMinutes: number } | null>(null);
  const [standing, setStanding] = useState<StandingBid[] | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const [w, r, s, t] = await Promise.all([
      walletAPI.get(organizationId),
      bidsAPI.rounds(organizationId),
      bidsAPI.listStanding(organizationId),
      industriesAPI.list().catch(() => []),
    ]);
    setWallet(w);
    setRounds(r);
    setStanding(s);
    setTrades(t);
    setNow(Date.now());
    setTab((current) => current ?? (r.open.length > 0 ? 'rounds' : s.length === 0 ? 'bids' : 'rounds'));
  }, [organizationId]);

  useEffect(() => {
    load().catch(() => {
      setRounds({ open: [], results: [], roundMinutes: 60 });
      setStanding([]);
      setTab((current) => current ?? 'bids');
    });
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => load().catch(() => {}), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [load]);

  const pick = (next: Tab) => {
    setTab(next);
    const q = new URLSearchParams(params);
    q.set('tab', next);
    setParams(q, { replace: true });
  };
  const balance = wallet?.balanceCents ?? 0;
  const addFunds = () => organizationId && openFundingPage(organizationId).catch(() => {});
  const tradeName = (slug?: string) => trades.find((t) => t.id === slug)?.name ?? titleFromSlug(slug);
  const notify = (text: string, good = true) => setMessage({ text, good });

  const openCount = rounds?.open.length ?? 0;
  return (
    <div className="p-4 md:p-6 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div>
          <h1 className="text-xl font-semibold">Bids</h1>
          <p className="text-sm text-gray-400">
            {standing ? `${standing.length} standing bid${standing.length === 1 ? '' : 's'}` : 'Loading…'} · {openCount} round{openCount === 1 ? '' : 's'} open
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#333] bg-[#121212] text-sm" data-testid="bids-balance">
            <Wallet className="w-4 h-4 text-emerald-300" />
            {money(balance)}
          </span>
          <button type="button" onClick={addFunds} className="px-3 py-2 rounded bg-[#336699] text-white text-sm font-medium">
            Add funds
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Tell us where you work, what you do and what a lead is worth to you. When a lead like that comes in, a round opens and you're in it
        automatically. Highest bid when it closes wins and pays its bid. Only one company gets each lead.
      </p>

      <div className="flex rounded border border-[#333] overflow-hidden mb-4 w-fit" role="tablist">
        {(
          [
            ['rounds', `Open rounds${openCount ? ` (${openCount})` : ''}`],
            ['bids', `My bids${standing?.length ? ` (${standing.length})` : ''}`],
            ['marketplace', 'Marketplace'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => pick(id)}
            className={`px-4 py-2 text-sm ${tab === id ? 'bg-[#336699] text-white' : 'text-gray-300 hover:bg-[#1E1E1E]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <p role="status" className={`text-sm rounded px-3 py-2 mb-4 border ${message.good ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          {message.text}
        </p>
      )}

      {tab === null || rounds === null || standing === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : tab === 'rounds' ? (
        <RoundsTab
          organizationId={organizationId!}
          rounds={rounds}
          now={now}
          balance={balance}
          tradeName={tradeName}
          hasStanding={standing.length > 0}
          onChanged={load}
          onNotify={notify}
          goToBids={() => pick('bids')}
        />
      ) : tab === 'bids' ? (
        <StandingTab
          organizationId={organizationId!}
          standing={standing}
          trades={trades}
          preferredTrades={wallet?.leadTrades ?? []}
          balance={balance}
          roundMinutes={rounds.roundMinutes}
          tradeName={tradeName}
          onChanged={load}
          onNotify={notify}
          onAddFunds={addFunds}
        />
      ) : (
        <MarketplaceFeed embedded />
      )}
    </div>
  );
};

function RoundsTab({
  organizationId,
  rounds,
  now,
  balance,
  tradeName,
  hasStanding,
  onChanged,
  onNotify,
  goToBids,
}: {
  organizationId: string;
  rounds: { open: OpenRound[]; results: RoundResult[]; roundMinutes: number };
  now: number;
  balance: number;
  tradeName: (slug?: string) => string;
  hasStanding: boolean;
  onChanged: () => Promise<void>;
  onNotify: (text: string, good?: boolean) => void;
  goToBids: () => void;
}) {
  const [raising, setRaising] = useState<{ leadId: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const raise = async (round: OpenRound, amount: number) => {
    setBusy(true);
    try {
      await bidsAPI.raise(round.leadId, organizationId, amount);
      onNotify(`Raised to ${money(Math.round(amount * 100))}.`);
      setRaising(null);
      await onChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "That didn't work", false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      {rounds.open.length === 0 ? (
        <div className="border border-dashed border-[#333] rounded p-8 text-center">
          <Gavel className="w-8 h-8 mx-auto text-gray-500 mb-2" />
          <p className="text-sm text-gray-400">
            No rounds open right now. When a lead comes in for a county and service you bid on, it shows up here and you're entered automatically.
            Rounds last {rounds.roundMinutes} minutes.
          </p>
          {!hasStanding && (
            <button type="button" onClick={goToBids} className={`${primary} mt-4`}>
              Set your bids
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Open rounds">
          {rounds.open.map((round) => {
            const left = Date.parse(round.closesAt) - now;
            const editing = raising?.leadId === round.leadId;
            const value = Number(raising?.value);
            const minRaise = round.myBidCents / 100 + MIN_RAISE;
            const ok = Number.isFinite(value) && value >= minRaise && value * 100 <= balance;
            return (
              <li key={round.bidId} className={`rounded border p-4 ${round.highest ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {tradeName(round.jobType)} · {round.county ? `${round.county} County` : 'County not set'}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {round.city || 'Town not given'} · {round.bidders} bidder{round.bidders === 1 ? '' : 's'} · closes in {left > 0 ? span(left) : 'moments'}
                    </p>
                    {round.summary && <p className="text-sm text-gray-300 mt-2">{round.summary}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-white">Your bid {money(round.myBidCents)}</p>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${round.highest ? 'bg-emerald-600/30 text-emerald-200' : 'bg-amber-600/30 text-amber-200'}`}>
                      {round.highest ? 'Highest bid' : 'Outbid'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 justify-end flex-wrap">
                  {editing ? (
                    <form
                      className="flex items-center gap-2 flex-wrap"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (ok) raise(round, value);
                      }}
                    >
                      <label className="text-xs text-gray-400">
                        Raise to $
                        <input
                          autoFocus
                          inputMode="decimal"
                          aria-label="Raise to"
                          value={raising.value}
                          onChange={(e) => setRaising({ leadId: round.leadId, value: e.target.value })}
                          className={`${input} w-24 ml-1 text-right`}
                        />
                      </label>
                      <button type="submit" disabled={busy || !ok} className={primary}>
                        Raise
                      </button>
                      <button type="button" disabled={busy} onClick={() => setRaising(null)} className={secondary}>
                        Back
                      </button>
                      {raising.value !== '' && !ok && (
                        <span className="basis-full text-right text-xs text-amber-200">
                          {value * 100 > balance ? 'More than your balance' : `At least ${money(minRaise * 100)}`}
                        </span>
                      )}
                    </form>
                  ) : (
                    <button type="button" onClick={() => setRaising({ leadId: round.leadId, value: String(minRaise) })} className={secondary}>
                      Raise bid
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rounds.results.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-white mb-2">Recent results</h2>
          <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Recent results">
            {rounds.results.map((r) => (
              <li key={r.bidId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block text-white truncate">
                    {tradeName(r.jobType)} · {r.county ? `${r.county} County` : r.city || 'Area not given'}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {r.won ? `Won at ${money(r.myBidCents)} · now in your Leads` : r.outcome ?? 'Lost'}
                  </span>
                </span>
                <span className={`text-xs whitespace-nowrap ${r.won ? 'text-emerald-300' : 'text-gray-500'}`}>{r.won ? 'Won' : 'Lost'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StandingTab({
  organizationId,
  standing,
  trades,
  preferredTrades,
  balance,
  roundMinutes,
  tradeName,
  onChanged,
  onNotify,
  onAddFunds,
}: {
  organizationId: string;
  standing: StandingBid[];
  trades: Trade[];
  preferredTrades: string[];
  balance: number;
  roundMinutes: number;
  tradeName: (slug?: string) => string;
  onChanged: () => Promise<void>;
  onNotify: (text: string, good?: boolean) => void;
  onAddFunds: () => void;
}) {
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      onNotify(done);
      setEditing(null);
      await onChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "That didn't work", false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      {standing.length > 0 && (
        <table className="w-full text-sm border border-[#2A2A2A] rounded" aria-label="My standing bids">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="font-medium px-4 py-2">County</th>
              <th className="font-medium px-4 py-2">Service</th>
              <th className="font-medium px-4 py-2 text-right">Your bid</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2A2A2A]">
            {standing.map((bid) => (
              <tr key={bid.id}>
                <td className="px-4 py-3 text-white">{bid.county} County</td>
                <td className="px-4 py-3 text-gray-300">{tradeName(bid.jobType)}</td>
                <td className="px-4 py-3 text-right">
                  {editing?.id === bid.id ? (
                    <form
                      className="inline-flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act(() => bidsAPI.setStanding(organizationId, bid.county, bid.jobType, Number(editing.value)), 'Bid updated.');
                      }}
                    >
                      <span className="text-gray-500">$</span>
                      <input
                        autoFocus
                        inputMode="decimal"
                        aria-label={`Bid for ${tradeName(bid.jobType)} in ${bid.county}`}
                        value={editing.value}
                        onChange={(e) => setEditing({ id: bid.id, value: e.target.value })}
                        className={`${input} w-24 text-right`}
                      />
                      <button type="submit" disabled={busy} className={primary} aria-label="Save bid">
                        <Check className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setEditing({ id: bid.id, value: String(bid.amountCents / 100) })} className="text-white underline underline-offset-2 decoration-[#444]">
                      {money(bid.amountCents)}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
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
      )}
      <StandingBidForm
        organizationId={organizationId}
        trades={trades}
        preferredTrades={preferredTrades}
        balance={balance}
        roundMinutes={roundMinutes}
        stepped={standing.length === 0}
        onSaved={onChanged}
        onNotify={onNotify}
        onAddFunds={onAddFunds}
      />
    </div>
  );
}

/** Pick counties, a service type and a price. Stepped the first time, one row after that. */
function StandingBidForm({
  organizationId,
  trades,
  preferredTrades,
  balance,
  roundMinutes,
  stepped,
  onSaved,
  onNotify,
  onAddFunds,
}: {
  organizationId: string;
  trades: Trade[];
  preferredTrades: string[];
  balance: number;
  roundMinutes: number;
  stepped: boolean;
  onSaved: () => Promise<void>;
  onNotify: (text: string, good?: boolean) => void;
  onAddFunds: () => void;
}) {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [counties, setCounties] = useState<string[]>([]);
  const [jobType, setJobType] = useState(preferredTrades[0] ?? '');
  const [amount, setAmount] = useState(String(MIN_BID));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!jobType && preferredTrades[0]) setJobType(preferredTrades[0]);
  }, [preferredTrades, jobType]);

  const ordered = useMemo(() => {
    const preferred = trades.filter((t) => preferredTrades.includes(t.id));
    return [...preferred, ...trades.filter((t) => !preferredTrades.includes(t.id))];
  }, [trades, preferredTrades]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return COUNTY_CHOICES.filter((c) => c.toLowerCase().includes(q));
    return [...new Set([...counties, ...WEST_TEXAS_COUNTIES])];
  }, [search, counties]);
  const toggle = (county: string) => setCounties((c) => (c.includes(county) ? c.filter((x) => x !== county) : [...c, county]));

  const dollars = Number(amount);
  const amountOk = Number.isFinite(dollars) && dollars >= MIN_BID;
  const affordable = amountOk && dollars * 100 <= balance;
  const covers = amountOk ? Math.floor(balance / (dollars * 100)) : 0;
  const ready = counties.length > 0 && jobType && affordable;

  const save = async () => {
    setBusy(true);
    try {
      for (const county of counties) await bidsAPI.setStanding(organizationId, county, jobType, dollars);
      const where = counties.length === 1 ? `${counties[0]} County` : `${counties.length} counties`;
      onNotify(`You're set: new ${trades.find((t) => t.id === jobType)?.name ?? jobType} leads in ${where} open a round for you automatically, at ${money(dollars * 100)}.`);
      setCounties([]);
      setStep(1);
      await onSaved();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "The bid couldn't be saved", false);
    } finally {
      setBusy(false);
    }
  };

  const countyPicker = (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search Texas counties"
        aria-label="Search counties"
        className={`${input} w-full mb-2`}
      />
      <ul className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-56 overflow-y-auto" aria-label="Counties">
        {shown.map((county) => (
          <li key={county}>
            <label className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${counties.includes(county) ? 'bg-[#336699]/20 text-white' : 'text-gray-300 hover:bg-[#1E1E1E]'}`}>
              <input type="checkbox" checked={counties.includes(county)} onChange={() => toggle(county)} className="accent-[#336699]" />
              {county}
            </label>
          </li>
        ))}
      </ul>
      {counties.length > 0 && <p className="text-xs text-gray-400 mt-2">{counties.map((c) => `${c} County`).join(', ')}</p>}
    </div>
  );
  const servicePicker = (
    <select value={jobType} onChange={(e) => setJobType(e.target.value)} aria-label="Service type" className={`${input} w-full`}>
      <option value="">Choose a service</option>
      {ordered.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
  const amountPicker = (
    <div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        $
        <input inputMode="decimal" aria-label="Bid amount" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-28 text-right`} />
        per lead
      </label>
      <p className="text-xs text-gray-500 mt-1">
        {!amountOk
          ? `Bids start at ${money(MIN_BID * 100)}.`
          : !affordable
            ? `That's more than your balance (${money(balance)}).`
            : `Your balance covers about ${covers} lead${covers === 1 ? '' : 's'} at this price. You only pay when you win.`}
      </p>
      {amountOk && !affordable && (
        <button type="button" onClick={onAddFunds} className={`${secondary} mt-2`}>
          Add funds
        </button>
      )}
    </div>
  );

  if (!stepped) {
    return (
      <form
        className="border border-[#2A2A2A] rounded p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) save();
        }}
      >
        <h3 className="text-sm font-medium text-white">Add a bid</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Where</p>
            {countyPicker}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">What</p>
            {servicePicker}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">How much</p>
            {amountPicker}
          </div>
        </div>
        <button type="submit" disabled={busy || !ready} className={primary}>
          {busy ? 'Saving…' : `Add bid${counties.length > 1 ? ` for ${counties.length} counties` : ''}`}
        </button>
      </form>
    );
  }

  const steps = ['Where', 'What', 'How much'];
  return (
    <section className="border border-[#336699]/50 bg-[#336699]/5 rounded p-5" aria-label="Set your bids">
      <h3 className="text-base font-semibold text-white">Set your bids</h3>
      <p className="text-sm text-gray-400 mb-4">Three quick steps. After this, leads come to you: a {roundMinutes}-minute round opens and you're in it.</p>
      <ol className="flex gap-3 mb-4 text-xs">
        {steps.map((label, i) => (
          <li key={label} className={`px-2 py-1 rounded-full border ${step === i + 1 ? 'border-[#336699] text-white' : step > i + 1 ? 'border-emerald-500/50 text-emerald-200' : 'border-[#333] text-gray-500'}`}>
            {i + 1} {label}
          </li>
        ))}
      </ol>
      {step === 1 && (
        <div>
          <p className="text-sm text-white mb-2">Which counties do you work in?</p>
          {countyPicker}
          <button type="button" disabled={counties.length === 0} onClick={() => setStep(2)} className={`${primary} mt-4`}>
            Next
          </button>
        </div>
      )}
      {step === 2 && (
        <div>
          <p className="text-sm text-white mb-2">What kind of work?</p>
          {servicePicker}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setStep(1)} className={secondary}>
              Back
            </button>
            <button type="button" disabled={!jobType} onClick={() => setStep(3)} className={primary}>
              Next
            </button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          <p className="text-sm text-white mb-2">What's a lead worth to you?</p>
          {amountPicker}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setStep(2)} className={secondary}>
              Back
            </button>
            <button type="button" disabled={busy || !ready} onClick={save} className={primary}>
              {busy ? 'Saving…' : 'Start bidding'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default BidsPage;
