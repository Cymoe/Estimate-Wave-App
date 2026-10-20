import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Gavel, Plus, Trash2, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { Modal } from '../components/common/Modal';
import { bidsAPI, industriesAPI, walletAPI } from '../lib/api';
import { money } from '../components/market/wallet';
import { openFundingPage, type WalletSummary } from '../components/market/WalletBar';
import { TEXAS_COUNTIES, countyForTown } from '../services/counties';
import { InlineNotice, Toast, useToast } from '../components/common/Notice';

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
/** How long after the last keystroke a typed amount is saved. */
export const SAVE_DELAY = 600;
/** How long after the last + or − tap the amount is saved: quick taps still fold into one save. */
export const STEP_SAVE_DELAY = 450;
/** How long the small "Saved" hint stays under a row's stepper. */
export const SAVED_HINT_MS = 1500;
/** How long the amount stays tinted after a tap. */
const TONE_MS = 350;
/** How long a tap's "+$50" takes to lift off and fade (matches the rise animation). */
const PULSE_MS = 900;
/** A removed row fades and slips right, then its height closes up so the rows below glide in. */
export const ROW_OUT_MS = 180;
export const ROW_COLLAPSE_MS = 160;

type Via = 'up' | 'down' | 'type';

/** Auction-room wording for the two beats under a row's stepper, picked fresh for each save. */
export const PLACING = ['Going once…', 'Raising the paddle…', 'Placing your bid…', 'Calling it in…', 'Going twice…'];
export const PLACED = ["Bid's in.", 'Locked in.', "Paddle's up.", 'On the books.', 'Sold on that.'];
const anyOf = (words: string[]) => words[Math.floor(Math.random() * words.length)];

type RowState = {
  /** The amount being changed, until it's saved. */
  draft?: string;
  status: 'idle' | 'saving' | 'saved' | 'failed';
  /** The wording this save uses, so it doesn't change mid-beat. */
  words?: { placing: string; placed: string };
  /** Tints the amount for a moment after a tap. */
  tone?: 'up' | 'down';
  /** What a failed save was trying to set, for Retry. */
  failedValue?: string;
  error?: string;
};
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
  const { toast, show } = useToast();

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
  // Errors and the one-time "You're set" line sit in the page; brief confirmations go to the toast.
  const notify = (text: string, good = true) => {
    if (!good || text.startsWith("You're set")) setMessage({ text, good });
    else {
      setMessage(null);
      show(text);
    }
  };
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
        <InlineNotice tone={message.good ? 'good' : 'bad'} onDismiss={() => setMessage(null)} className="mb-4">
          {message.text}
        </InlineNotice>
      )}
      <Toast text={toast} />

      {standing === null || results === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-8">
          <StandingTab
            organizationId={organizationId!}
            standing={standing}
            balance={balance}
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

/**
 * A table cell whose height can close up: while `collapsed` the content's row track goes to
 * 0fr and the padding to 0, so a leaving row's neighbours glide into its place.
 */
function Cell({ collapsed, className = '', children }: { collapsed: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <td className={`px-4 transition-[padding] duration-150 motion-reduce:transition-none ${collapsed ? 'py-0' : 'py-3'} ${className}`}>
      <div className="grid transition-[grid-template-rows] duration-150 motion-reduce:transition-none" style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}>
        <div className={collapsed ? 'min-h-0 overflow-hidden' : 'min-h-0'}>{children}</div>
      </div>
    </td>
  );
}

/**
 * Where the bid stands. `funded` is worked out in the browser the moment the amount
 * changes (the balance is known here); leading/outbid waits for the server, so while
 * a change is unsaved or saving the chip sits dimmed as "pending".
 */
function Chip({ bid, funded = bid.funded, pending = false }: { bid: StandingBid; funded?: boolean; pending?: boolean }) {
  // The server only works out leading/outbid for a covered bid. If its last word was "uncovered"
  // and the amount is now covered but unsaved, the standing is simply not known yet.
  const unknown = pending && funded && !bid.funded;
  const [tone, text] = !funded
    ? ['bg-red-600/25 text-red-200', 'Add funds to cover this bid']
    : unknown
      ? ['bg-[#333] text-gray-300', 'Checking standing…']
      : bid.leading
        ? ['bg-emerald-600/30 text-emerald-200', 'Highest here']
        : ['bg-amber-600/30 text-amber-200', 'Outbid here · raise to win the next lead'];
  return (
    <span data-pending={pending || undefined} className={`inline-block text-xs px-2 py-0.5 rounded-full whitespace-nowrap transition-[colors,opacity] duration-300 ${pending ? 'opacity-60' : ''} ${tone}`}>
      {text}
    </span>
  );
}

function StandingTab({
  organizationId,
  standing,
  balance,
  tradeName,
  onChanged,
  onNotify,
  onAdd,
  onAddFunds,
}: {
  organizationId: string;
  standing: StandingBid[];
  /** Wallet balance in cents, so the row can tell at once whether a changed amount is covered. */
  balance: number;
  tradeName: (slug?: string) => string;
  onChanged: () => Promise<void>;
  onNotify: (text: string, good?: boolean) => void;
  onAdd: () => void;
  onAddFunds: () => void;
}) {
  // Each row's amount saves on its own a moment after the last tap or keystroke: no Save button.
  // The row shows the three beats itself: the amount moving, a "going once…" line, then a "bid's in" line (or a Retry).
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [busy, setBusy] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const row = (id: string): RowState => rows[id] ?? { status: 'idle' };
  const patchRow = (id: string, patch: Partial<RowState>) => setRows((all) => ({ ...all, [id]: { ...(all[id] ?? { status: 'idle' }), ...patch } }));
  const later = (key: string, ms: number, fn: () => void) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };
  // Rows on their way out: first they fade ("out"), then their height closes ("collapse").
  // Removal is optimistic: the row starts leaving on the tap; if the server refuses, it comes back.
  const [leaving, setLeaving] = useState<Record<string, 'out' | 'collapse'>>({});
  const remove = async (bid: StandingBid) => {
    if (!window.confirm(`Remove your ${tradeName(bid.jobType)} bid in ${bid.county} County? You can add it again later.`)) return;
    setLeaving((l) => ({ ...l, [bid.id]: 'out' }));
    const gone = new Promise<void>((resolve) =>
      later(`${bid.id}:out`, ROW_OUT_MS, () => {
        setLeaving((l) => ({ ...l, [bid.id]: 'collapse' }));
        later(`${bid.id}:collapse`, ROW_COLLAPSE_MS, resolve);
      }),
    );
    try {
      await Promise.all([bidsAPI.removeStanding(bid.id), gone]);
      onNotify('Bid removed.');
      await onChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "That didn't work", false);
    } finally {
      setLeaving((l) => {
        const { [bid.id]: _done, ...rest } = l;
        return rest;
      });
    }
  };
  // Rows that weren't here last render fade in with a brief wash, so the eye finds where a new bid landed.
  const seen = useRef<Set<string> | null>(null);
  const fresh = seen.current ? new Set(standing.filter((b) => !seen.current!.has(b.id)).map((b) => b.id)) : new Set<string>();
  useEffect(() => {
    seen.current = new Set(standing.map((b) => b.id));
  }, [standing]);
  const save = async (bid: StandingBid, value: string) => {
    const dollars = Number(value);
    patchRow(bid.id, { status: 'saving', failedValue: undefined, error: undefined, words: { placing: anyOf(PLACING), placed: anyOf(PLACED) } });
    try {
      await bidsAPI.setStanding(organizationId, bid.county, bid.jobType, dollars);
      await onChanged();
      setRows((all) => {
        const current = all[bid.id] ?? { status: 'idle' };
        // Keep a newer draft typed while this saved; otherwise the saved amount takes over.
        const draft = current.draft !== value ? current.draft : undefined;
        return { ...all, [bid.id]: { ...current, draft, status: 'saved' } };
      });
      later(`${bid.id}:saved`, SAVED_HINT_MS, () => setRows((all) => (all[bid.id]?.status === 'saved' ? { ...all, [bid.id]: { ...all[bid.id], status: 'idle' } } : all)));
    } catch (err) {
      // Put the saved amount back so the row never shows a number that didn't take, and offer a retry.
      patchRow(bid.id, { draft: undefined, status: 'failed', failedValue: value, error: err instanceof Error ? err.message : "The bid couldn't be saved" });
    }
  };
  const changeAmount = (bid: StandingBid, value: string, via: Via) => {
    const tone = via === 'type' ? undefined : via;
    patchRow(bid.id, { draft: value, tone, failedValue: undefined, error: undefined, status: row(bid.id).status === 'failed' ? 'idle' : row(bid.id).status });
    if (tone) later(`${bid.id}:tone`, TONE_MS, () => patchRow(bid.id, { tone: undefined }));
    clearTimeout(timers.current[bid.id]);
    const dollars = Number(value);
    if (!(dollars >= MIN_BID) || dollars === bid.amountCents / 100) return;
    later(bid.id, via === 'type' ? SAVE_DELAY : STEP_SAVE_DELAY, () => save(bid, value));
  };
  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) onNotify(done);
      setRows({});
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
      {/* Fixed column widths and one-line cells, so a row never jumps as its standing changes. */}
      <table className="w-full table-fixed text-sm border border-[#2A2A2A] rounded" aria-label="My standing bids">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="font-medium px-4 py-2">County</th>
            <th className="font-medium px-4 py-2">Service</th>
            <th className="font-medium px-4 py-2 text-right w-44">Your bid</th>
            <th className="font-medium px-4 py-2 w-[21rem]">Standing</th>
            <th className="px-4 py-2 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2A2A2A]">
          {standing.map((bid) => {
            const state = row(bid.id);
            const draft = state.draft !== undefined ? Number(state.draft) : NaN;
            // Optimistic: the balance is known here, so "covered or not" updates on the tap itself.
            const funded = Number.isFinite(draft) ? draft * 100 <= balance : bid.funded;
            const pending = (Number.isFinite(draft) && draft !== bid.amountCents / 100) || state.status === 'saving';
            return (
            // A bid the balance can't cover gets a faint wash and a red edge, so it stands out in a scan
            // without reading as an error: the bid is fine, it just can't win until funds are added.
            <tr
              key={bid.id}
              data-unfunded={!funded || undefined}
              data-leaving={leaving[bid.id]}
              data-fresh={fresh.has(bid.id) || undefined}
              className={`transition-colors duration-300 ${funded ? '' : 'bg-red-500/[0.06]'} ${
                leaving[bid.id] ? 'motion-safe:animate-row-out motion-reduce:animate-fade-out' : fresh.has(bid.id) ? 'motion-safe:animate-row-in motion-reduce:animate-wash' : ''
              }`}
            >
              <Cell collapsed={leaving[bid.id] === 'collapse'} className={`text-white border-l-2 transition-colors duration-300 ${funded ? 'border-transparent' : 'border-red-400'}`}>{bid.county} County</Cell>
              <Cell collapsed={leaving[bid.id] === 'collapse'} className="text-gray-300">{tradeName(bid.jobType)}</Cell>
              <Cell collapsed={leaving[bid.id] === 'collapse'} className="text-right">
                {(() => {
                  const value = state.draft ?? String(bid.amountCents / 100);
                  return (
                    <span className="inline-flex flex-col items-end">
                      <BidStepper
                        label={`Bid for ${tradeName(bid.jobType)} in ${bid.county}`}
                        value={value}
                        tone={state.tone}
                        onChange={(v, via) => changeAmount(bid, v, via)}
                      />
                      {/* Always present, so the row never moves as the text comes and goes. */}
                      <span aria-live="polite" className="block h-4 mt-0.5 text-[10px] leading-4 whitespace-nowrap">
                        {state.status === 'saving' && <span className="text-gray-500">{state.words?.placing}</span>}
                        {state.status === 'saved' && <span className="text-emerald-300">{state.words?.placed}</span>}
                        {state.status === 'failed' && (
                          <span className="text-red-300" title={state.error}>
                            Didn't take ·{' '}
                            <button type="button" onClick={() => state.failedValue && save(bid, state.failedValue)} className="underline underline-offset-2">
                              Retry
                            </button>
                          </span>
                        )}
                      </span>
                    </span>
                  );
                })()}
              </Cell>
              <Cell collapsed={leaving[bid.id] === 'collapse'}>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <Chip bid={bid} funded={funded} pending={pending} />
                  {!funded && (
                    <button type="button" onClick={onAddFunds} className="text-xs text-[#7fb0e0] underline underline-offset-2">
                      Add funds
                    </button>
                  )}
                </span>
              </Cell>
              <Cell collapsed={leaving[bid.id] === 'collapse'} className="text-right">
                <button
                  type="button"
                  aria-label={`Remove bid for ${tradeName(bid.jobType)} in ${bid.county}`}
                  disabled={busy || leaving[bid.id] !== undefined}
                  onClick={() => remove(bid)}
                  className="p-2 text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </Cell>
            </tr>
            );
          })}
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
function BidStepper({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: string;
  onChange: (value: string, via: Via) => void;
  /** Tints the amount for a moment after a tap: green going up, amber going down. */
  tone?: 'up' | 'down';
}) {
  // Each tap lifts its own "+$50" / "−$50" off the field; a new tap restarts it.
  const [pulse, setPulse] = useState<{ id: number; dir: 'up' | 'down' } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(pulseTimer.current), []);
  const step = (dir: 'up' | 'down', next: number) => {
    setPulse((p) => ({ id: (p?.id ?? 0) + 1, dir }));
    clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(null), PULSE_MS);
    onChange(String(next), dir);
  };
  const dollars = Number(value);
  const ok = Number.isFinite(dollars) && value.trim() !== '';
  const control = 'px-3 text-lg leading-none text-gray-300 hover:text-white active:scale-90 transition-transform duration-100 disabled:opacity-30 disabled:hover:text-gray-300';
  const amount = tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-amber-300' : 'text-white';
  return (
    <div className="relative inline-flex items-stretch rounded border border-[#333] bg-[#1A1A1A]">
      {pulse && (
        <span key={pulse.id} aria-hidden="true" className={`absolute -top-3.5 right-10 text-[11px] font-medium animate-rise pointer-events-none ${pulse.dir === 'up' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {pulse.dir === 'up' ? '+' : '−'}
          {money(STEP * 100)}
        </span>
      )}
      <button type="button" aria-label={`Lower ${label}`} disabled={!ok || dollars <= MIN_BID} onClick={() => step('down', stepDown(dollars))} className={control}>
        −
      </button>
      <label className="flex items-center border-x border-[#333] text-sm text-gray-400">
        <span className="pl-2">$</span>
        <input
          inputMode="decimal"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value, 'type')}
          className={`w-16 bg-transparent px-1 py-2 text-right text-base md:text-sm focus:outline-none transition-colors duration-300 ${amount}`}
        />
      </label>
      <button type="button" aria-label={`Raise ${label}`} disabled={!ok} onClick={() => step('up', stepUp(dollars))} className={control}>
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
  // Which county match the arrow keys have landed on; Enter picks it.
  const [active, setActive] = useState(0);
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
  const standingFor = (id: string): 'top' | 'outbid' | null => {
    const mine = standing.find((sb) => sb.jobType === id && sb.county === county);
    return mine ? (mine.leading ? 'top' : 'outbid') : null;
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
        <section aria-label="Where" className="relative">
          <p className="text-sm font-medium text-white mb-2">County</p>
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && matches.length) {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, matches.length - 1));
                  } else if (e.key === 'ArrowUp' && matches.length) {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' && matches[active]) {
                    e.preventDefault();
                    pick(matches[active].county);
                  }
                }}
                aria-activedescendant={matches[active] ? `county-${matches[active].county}` : undefined}
                placeholder="Type a county or town, like Midland or Odessa"
                aria-label="Search counties"
                autoFocus
                className={`${input} w-full`}
              />
              {/* Matches float over the trades below, so the dialog never jumps. */}
              {search.trim() !== '' && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-10 max-h-48 overflow-y-auto divide-y divide-[#2A2A2A] border border-[#333] rounded bg-[#1A1A1A] shadow-xl" aria-label="Counties">
                  {matches.map((m, i) => (
                    <li key={m.county} id={`county-${m.county}`}>
                      <button
                        type="button"
                        onClick={() => pick(m.county)}
                        onMouseEnter={() => setActive(i)}
                        aria-current={i === active ? 'true' : undefined}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#2A2A2A] ${i === active ? 'bg-[#2A2A2A]' : ''}`}
                      >
                        <span>{m.county} County</span>
                        {m.via && <span className="text-xs text-gray-500">{m.via} is in {m.county} County</span>}
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">{`Nothing matches "${search.trim()}". Try the county name or a town in it.`}</li>}
                </ul>
              )}
            </>
          )}
        </section>

        {/* Your bids: one row per trade, each with its own price, on screen from the start. */}
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-gray-500">
            {!county
              ? 'Pick a county to start.'
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
