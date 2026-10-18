import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Check, Gavel, Plus, Trash2, X } from 'lucide-react';
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

  return (
    <div className="p-4 md:p-6 text-white">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h1 className="text-xl font-semibold">Bids</h1>
          <p className="text-sm text-gray-400">
            {standing ? `${standing.length} standing bid${standing.length === 1 ? '' : 's'}` : 'Loading…'} · {won} lead{won === 1 ? '' : 's'} won
          </p>
        </div>
        {standing && (
          <button type="button" onClick={() => setAdding(true)} className={primary}>
            <Plus className="w-4 h-4" />
            {standing.length === 0 ? 'Set your bids' : 'Add bid'}
          </button>
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
          firstTime={standing?.length === 0}
          suggested={[...new Set((standing ?? []).map((b) => b.county))]}
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
  const [tone, text] = !bid.funded
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
              <td className="px-4 py-3">
                <Chip bid={bid} />
                {!bid.funded && (
                  <button type="button" onClick={onAddFunds} className="block text-xs text-[#7fb0e0] underline underline-offset-2 mt-1">
                    Add funds
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
function AddBidDialog({
  organizationId,
  trades,
  preferredTrades,
  balance,
  firstTime,
  suggested,
  onClose,
  onSaved,
  onNotify,
  onAddFunds,
}: {
  organizationId: string;
  trades: Trade[];
  preferredTrades: string[];
  balance: number;
  firstTime: boolean;
  /** Counties the company already bids in, offered first. */
  suggested: string[];
  onClose: () => void;
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

  const ordered = useMemo(() => {
    const preferred = trades.filter((t) => preferredTrades.includes(t.id));
    return [...preferred, ...trades.filter((t) => !preferredTrades.includes(t.id))];
  }, [trades, preferredTrades]);
  // Type a county or a town: "Mid" finds Midland, "Odessa" finds Ector.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suggested.filter((c) => !counties.includes(c)).map((county) => ({ county, via: undefined as string | undefined }));
    const town = countyForTown(search);
    const starts = TEXAS_COUNTIES.filter((c) => c.toLowerCase().startsWith(q));
    const within = TEXAS_COUNTIES.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
    const out = [...(town ? [{ county: town, via: search.trim() }] : []), ...[...starts, ...within].map((county) => ({ county, via: undefined as string | undefined }))];
    return out.filter((m, i) => !counties.includes(m.county) && out.findIndex((o) => o.county === m.county) === i).slice(0, 8);
  }, [search, counties, suggested]);
  const add = (county: string) => {
    setCounties((c) => (c.includes(county) ? c : [...c, county]));
    setSearch('');
  };
  const remove = (county: string) => setCounties((c) => c.filter((x) => x !== county));

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
      const what = trades.find((t) => t.id === jobType)?.name ?? jobType;
      onNotify(`You're set: new ${what} leads in ${where} go to you the moment they come in, at ${money(dollars * 100)}, while your bid is the highest.`);
      await onSaved();
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "The bid couldn't be saved", false);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const steps = ['Where', 'What', 'How much'];
  return (
    <Modal isOpen title={firstTime ? 'Set your bids' : 'Add a bid'} onClose={onClose} size="lg">
      <div className="p-5">
        <p className="flex items-center justify-between text-sm mb-3 px-3 py-2 rounded border border-[#2A2A2A] bg-[#121212]" data-testid="dialog-balance">
          <span className="text-gray-400">Lead balance</span>
          <span className="text-white font-medium">{money(balance)}</span>
        </p>
        <ol className="flex gap-2 mb-4 text-xs" aria-label="Steps">
          {steps.map((label, i) => (
            <li
              key={label}
              className={`px-2 py-1 rounded-full border ${step === i + 1 ? 'border-[#336699] text-white' : step > i + 1 ? 'border-emerald-500/50 text-emerald-200' : 'border-[#333] text-gray-500'}`}
            >
              {i + 1} {label}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <div>
            <p className="text-sm text-white mb-2">Which counties do you work in?</p>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) {
                  e.preventDefault();
                  add(matches[0].county);
                }
              }}
              placeholder="Type a county or town, like Midland or Odessa"
              aria-label="Search counties"
              className={`${input} w-full`}
            />
            {/* Fixed height, so the dialog doesn't jump as matches come and go. */}
            <ul className="mt-1 h-56 overflow-y-auto divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Counties">
              {matches.map((m) => (
                <li key={m.county}>
                  <button type="button" onClick={() => add(m.county)} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#1E1E1E]">
                    <span>{m.county} County</span>
                    {m.via ? <span className="text-xs text-gray-500">{m.via} is in {m.county} County</span> : search.trim() === '' ? <span className="text-xs text-gray-500">you bid here</span> : null}
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500">
                  {search.trim() === '' ? 'Type to find a county. Any Texas county works.' : `Nothing matches "${search.trim()}". Try the county name or a town in it.`}
                </li>
              )}
            </ul>
            <ul className="flex flex-wrap gap-1.5 mt-3 min-h-[2.25rem] empty:hidden" aria-label="Chosen counties">
              {counties.map((county) => (
                <li key={county} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-[#336699]/20 border border-[#336699]/50 text-sm text-white">
                  {county} County
                  <button type="button" onClick={() => remove(county)} aria-label={`Remove ${county}`} className="p-0.5 text-gray-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-2 min-h-[1rem]">{counties.length === 0 ? 'Add as many counties as you work in.' : `${counties.length} chosen.`}</p>
            <div className="flex justify-end mt-4">
              <button type="button" disabled={counties.length === 0} onClick={() => setStep(2)} className={primary}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm text-white mb-2">What kind of work?</p>
            <select value={jobType} onChange={(e) => setJobType(e.target.value)} aria-label="Service type" className={`${input} w-full`}>
              <option value="">Choose a service</option>
              {ordered.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">One service per bid. Add another bid for other kinds of work.</p>
            <div className="flex justify-between mt-4">
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
            <div className="flex justify-between mt-4">
              <button type="button" onClick={() => setStep(2)} className={secondary}>
                Back
              </button>
              <button type="button" disabled={busy || !ready} onClick={save} className={primary}>
                {busy ? 'Saving…' : firstTime ? 'Start bidding' : `Add bid${counties.length > 1 ? ` for ${counties.length} counties` : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default BidsPage;
