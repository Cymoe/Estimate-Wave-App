import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Gavel, Plus, Trash2, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { Modal } from '../components/common/Modal';
import { bidsAPI, industriesAPI, walletAPI } from '../lib/api';
import { money } from '../components/market/wallet';
import { BidStatusLine, WALLET_CHANGED, openFundingPage, type WalletSummary } from '../components/market/WalletBar';
import { TEXAS_COUNTIES, countyForTown } from '../services/counties';
import { InlineNotice, Toast, useToast } from '../components/common/Notice';
import { useConfirm } from '../components/common/ConfirmDialog';

interface Trade {
  id: string;
  name: string;
}
interface StandingBid {
  id: string;
  county: string;
  jobType: string;
  amountCents: number;
  /** The balance covers it, so it can win. A bid is only placed when it's covered; it can drop
   *  below the balance later (after a win, say), and is then paused until funds are added. */
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
/** How long "Add funds to bid higher" stays after a tap on + that the balance can't cover. */
export const CAP_HINT_MS = 3000;

type Via = 'up' | 'down' | 'type';

/** Auction-room wording for the two beats under a row's stepper, picked fresh for each save and matching its direction. */
export const PLACING = {
  up: ['Going once…', 'Raising the paddle…', 'Placing your bid…', 'Calling it in…', 'Going twice…'],
  down: ['Easing off…', 'Lowering the paddle…', 'Pulling back…', 'Trimming the bid…', 'Settling lower…'],
};
export const PLACED = {
  up: ["Bid's in.", 'Locked in.', "Paddle's up.", 'On the books.', 'Sold on that.'],
  down: ["Bid's in.", 'Eased off.', "Paddle's down.", 'On the books.', 'Trimmed.'],
};
const anyOf = (words: string[]) => words[Math.floor(Math.random() * words.length)];

type RowState = {
  /** The amount being changed, until it's saved. */
  draft?: string;
  /** `pending`: changed on screen, save not sent yet (the line already shows the placing words). */
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'failed';
  /** The wording this change uses, so it doesn't change mid-beat, and the direction it was picked for. */
  words?: { placing: string; placed: string };
  wordsDir?: 'up' | 'down';
  /** Tints the amount for a moment after a tap. */
  tone?: 'up' | 'down';
  /** What a failed save was trying to set, for Retry. */
  failedValue?: string;
  error?: string;
  /** The amount asked for is a raise the balance can't cover: nothing is sent, and the row says to add funds. */
  over?: boolean;
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
    const onWallet = () => load().catch(() => {});
    // Funds are added in another tab; coming back here picks up the new balance at once.
    const onVisible = () => document.visibilityState === 'visible' && onWallet();
    window.addEventListener(WALLET_CHANGED, onWallet);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(WALLET_CHANGED, onWallet);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);
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

      {/* Same line as on Leads: what the bids are doing and, when money is the problem, Add funds. */}
      {wallet && standing && <BidStatusLine wallet={wallet} onAddFunds={addFunds} onBidsPage />}
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
    ? ['bg-red-600/25 text-red-200', 'Paused until you add funds']
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
  const [confirm, confirmDialog] = useConfirm();
  const remove = async (bid: StandingBid) => {
    const yes = await confirm({
      title: `Remove your ${tradeName(bid.jobType)} bid in ${bid.county} County?`,
      message: 'You can add it again later.',
      confirmLabel: 'Remove bid',
    });
    if (!yes) return;
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
  const save = async (bid: StandingBid, value: string, chosen?: RowState['words']) => {
    const dollars = Number(value);
    const dir = dollars < bid.amountCents / 100 ? 'down' : 'up';
    // Use the words the tap chose (passed in, since the timer's view of state is from before the tap);
    // a Retry reuses what the row shows, and only a row with none picks fresh ones.
    const words = chosen ?? row(bid.id).words ?? { placing: anyOf(PLACING[dir]), placed: anyOf(PLACED[dir]) };
    patchRow(bid.id, { status: 'saving', failedValue: undefined, error: undefined, words });
    try {
      await bidsAPI.setStanding(organizationId, bid.county, bid.jobType, dollars);
      await onChanged();
      setRows((all) => {
        const current = all[bid.id] ?? { status: 'idle' };
        // Keep a newer draft typed while this saved; otherwise the saved amount takes over.
        const draft = current.draft !== value ? current.draft : undefined;
        return { ...all, [bid.id]: { ...current, draft, status: 'saved', wordsDir: undefined } };
      });
      later(`${bid.id}:saved`, SAVED_HINT_MS, () => setRows((all) => (all[bid.id]?.status === 'saved' ? { ...all, [bid.id]: { ...all[bid.id], status: 'idle', words: undefined } } : all)));
    } catch (err) {
      // Put the saved amount back so the row never shows a number that didn't take, and offer a retry.
      patchRow(bid.id, { draft: undefined, status: 'failed', failedValue: value, error: err instanceof Error ? err.message : "The bid couldn't be saved" });
    }
  };
  const changeAmount = (bid: StandingBid, value: string, via: Via) => {
    const tone = via === 'type' ? undefined : via;
    const current = row(bid.id);
    const dollars = Number(value);
    const saved = bid.amountCents / 100;
    // A raise the balance can't cover isn't placed: the server would refuse it, so don't send it.
    // Lowering always goes through, so a paused bid can be brought back under the balance.
    const over = dollars >= MIN_BID && dollars > saved && dollars * 100 > balance;
    const valid = dollars >= MIN_BID && dollars !== saved && !over;
    const dir = dollars < saved ? 'down' : 'up';
    // The line answers the tap itself: pick the words now (fresh ones if the direction flips)
    // and show them from this moment, through the save, until "bid's in".
    const words = !valid ? undefined : current.words && current.wordsDir === dir ? current.words : { placing: anyOf(PLACING[dir]), placed: anyOf(PLACED[dir]) };
    patchRow(bid.id, {
      draft: value,
      tone,
      failedValue: undefined,
      error: undefined,
      words,
      wordsDir: valid ? dir : undefined,
      status: valid ? (current.status === 'saving' ? 'saving' : 'pending') : 'idle',
      over,
    });
    if (tone) later(`${bid.id}:tone`, TONE_MS, () => patchRow(bid.id, { tone: undefined }));
    clearTimeout(timers.current[bid.id]);
    if (!valid) return;
    later(bid.id, via === 'type' ? SAVE_DELAY : STEP_SAVE_DELAY, () => save(bid, value, words));
  };
  /** A tap on + the balance can't cover: the amount stays put and the row says to add funds, for a moment. */
  const capped = (bid: StandingBid) => {
    patchRow(bid.id, { over: true });
    later(`${bid.id}:over`, CAP_HINT_MS, () =>
      setRows((all) => {
        const r = all[bid.id];
        // A typed amount that's still over keeps the hint; it goes when the amount changes or the field is left.
        if (!r?.over || (r.draft !== undefined && Number(r.draft) * 100 > balance && Number(r.draft) * 100 > bid.amountCents)) return all;
        return { ...all, [bid.id]: { ...r, over: false } };
      }),
    );
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
            // An amount that won't be sent (over the balance, or below the minimum) doesn't count.
            const sendable = Number.isFinite(draft) && draft >= MIN_BID && !state.over;
            const funded = sendable ? draft * 100 <= balance : bid.funded;
            const pending = (sendable && draft !== bid.amountCents / 100) || state.status === 'saving';
            // + stops at the balance, unless it's only climbing back toward a bid already placed.
            const shown = Number.isFinite(draft) ? draft : bid.amountCents / 100;
            const next = stepUp(shown) * 100;
            const canRaise = next <= balance || next <= bid.amountCents;
            return (
            // A bid the balance can't cover gets a faint wash and a red edge, so it stands out in a scan
            // without reading as an error: it's paused, and comes back on its own once funds cover it.
            <tr
              key={bid.id}
              data-unfunded={!funded || undefined}
              data-leaving={leaving[bid.id]}
              data-fresh={fresh.has(bid.id) || undefined}
              className={`transition-colors duration-300 ${funded ? '' : 'bg-red-500/[0.06]'} ${
                leaving[bid.id] ? 'motion-safe:animate-row-out motion-reduce:animate-fade-out' : fresh.has(bid.id) ? 'motion-safe:animate-row-in motion-reduce:animate-wash' : ''
              }`}
            >
              {/* The red edge is an inset shadow, not a border: table borders collapse, and a cell border would swallow the table's own edge. */}
              <Cell collapsed={leaving[bid.id] === 'collapse'} className={`text-white transition-shadow duration-300 ${funded ? '' : 'shadow-[inset_2px_0_0_0_#f87171]'}`}>{bid.county} County</Cell>
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
                        canRaise={canRaise}
                        onCapped={() => capped(bid)}
                        onChange={(v, via) => changeAmount(bid, v, via)}
                        onBlur={() => {
                          // Leaving the field with nothing it can send in it puts the saved amount back.
                          if (state.draft !== undefined && (!(Number(state.draft) >= MIN_BID) || state.over)) patchRow(bid.id, { draft: undefined, over: false });
                        }}
                      />
                      {/* Always present, so the row never moves as the text comes and goes. */}
                      <span aria-live="polite" className="block h-4 mt-0.5 text-[10px] leading-4 whitespace-nowrap">
                        {state.over && (
                          <span className="text-amber-200">
                            <button type="button" onClick={onAddFunds} className="underline underline-offset-2">
                              Add funds
                            </button>{' '}
                            to bid higher
                          </span>
                        )}
                        {!state.over && (state.status === 'pending' || state.status === 'saving') && <span className="text-gray-500">{state.words?.placing}</span>}
                        {!state.over && state.status === 'saved' && <span className="text-emerald-300">{state.words?.placed}</span>}
                        {!state.over && state.status === 'failed' && (
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
      {confirmDialog}
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
  onBlur,
  tone,
  canRaise = true,
  onCapped,
}: {
  label: string;
  value: string;
  onChange: (value: string, via: Via) => void;
  /** False when the next step is more than the balance covers: + looks spent, and a tap calls onCapped instead. */
  canRaise?: boolean;
  onCapped?: () => void;
  /** Called when the field is left, so the owner can put a valid amount back if what's typed isn't one. */
  onBlur?: () => void;
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
          onBlur={onBlur}
          className={`w-16 bg-transparent px-1 py-2 text-right text-base md:text-sm focus:outline-none transition-colors duration-300 ${amount}`}
        />
      </label>
      {/* Kept tappable when capped (aria-disabled, not disabled) so a tap can say why it didn't move. */}
      <button
        type="button"
        aria-label={`Raise ${label}`}
        aria-disabled={!canRaise || undefined}
        disabled={!ok}
        onClick={() => (canRaise ? step('up', stepUp(dollars)) : onCapped?.())}
        className={`${control} ${canRaise ? '' : 'opacity-30 hover:text-gray-300 active:scale-100'}`}
      >
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

  const placed = (id: string) => standing.find((sb) => sb.county === county && sb.jobType === id);
  const amounts = live.map((t) => Number(bids[t.id]));
  const amountsOk = amounts.every((a) => Number.isFinite(a) && a >= MIN_BID);
  const top = amounts.length ? Math.max(...amounts) : 0;
  // A bid is only placed when the balance covers it. Lowering one already placed always goes through.
  const affordable = amountsOk && live.every((t) => {
    const cents = Math.round(Number(bids[t.id]) * 100);
    return cents <= balance || cents <= (placed(t.id)?.amountCents ?? 0);
  });
  const covers = amountsOk && top > 0 ? Math.floor(balance / (top * 100)) : 0;
  // Nothing to save if every live row already matches a placed bid in this county.
  const changed = live.some((t) => placed(t.id)?.amountCents !== Math.round(Number(bids[t.id]) * 100));
  const ready = county !== null && live.length > 0 && amountsOk && changed;
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

  // Pinned under the trade list so Save stays in reach however many trades are on.
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-gray-500">
        {!county
          ? 'Pick a county to start.'
          : !amountsOk
          ? `Bids start at ${money(MIN_BID * 100)}.`
          : !changed
            ? live.length > 0 ? 'These are your current bids here.' : ''
            : !affordable
              ? `Your balance is ${money(balance)}. Add funds to place a bid this high.`
              : `Balance ${money(balance)} covers about ${covers} lead${covers === 1 ? '' : 's'} at your top bid. You only pay when you win.`}
      </p>
      <div className="flex items-center gap-2 ml-auto">
        <button type="button" onClick={onClose} className={secondary}>
          Cancel
        </button>
        {ready && !affordable ? (
          // Saving isn't placing until the balance covers it, so the button goes to the wallet instead.
          <button type="button" onClick={onAddFunds} className={primary}>
            Add funds to place bid
          </button>
        ) : (
          <button type="button" disabled={busy || !ready} onClick={save} className={primary}>
            {busy ? 'Saving…' : firstTime ? 'Start bidding' : rows > 1 ? `Save ${rows} bids` : 'Save bid'}
          </button>
        )}
      </div>
    </div>
  );
  return (
    <Modal isOpen title={firstTime ? 'Set your bids' : 'Add a bid'} onClose={onClose} size="xl" dismissible={false} footer={footer}>
      {/* Tall enough from the start for the county matches (up to 12rem) to float in full under the search
          box, without being clipped by the scrolling area or making the window grow as you type. */}
      <div className="p-6 space-y-7 min-h-[20rem]" data-testid="add-bid-body">
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
                      <BidStepper
                        label={`${t.name} bid`}
                        value={bids[t.id]}
                        onChange={(v) => setBid(t.id, v)}
                        onBlur={() => {
                          if (!(Number(bids[t.id]) >= MIN_BID)) setBid(t.id, String(MIN_BID));
                        }}
                      />
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
      </div>
    </Modal>
  );
}

export default BidsPage;
