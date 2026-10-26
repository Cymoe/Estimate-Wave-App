import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowDownCircle, CheckCircle2, Gavel, PauseCircle, Plus, Trash2, Wallet, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { Modal } from '../components/common/Modal';
import { bidsAPI, industriesAPI } from '../lib/api';
import { useBidResults, useStandingBids, useWallet } from '../lib/live';
import { money } from '../components/market/wallet';
import { BidStatusLine, fundErrorText, openFundingPage, type WalletSummary } from '../components/market/WalletBar';
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
  /** Another company took the lead since the company last looked at its bids. */
  outbidNew?: boolean;
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
  up: ["Bid's in.", 'Locked in.', "Paddle's up.", 'On the books.'],
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
  /** The amount field has focus: the quiet line says any amount can be typed. */
  typing?: boolean;
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
  const [params, setParams] = useSearchParams();
  // Live: an outbid or a balance change shows without a reload.
  const wallet = useWallet<WalletSummary>(organizationId) ?? null;
  const results = useBidResults<BidResult[]>(organizationId) ?? null;
  const standing = useStandingBids<StandingBid[]>(organizationId) ?? null;
  const [trades, setTrades] = useState<Trade[]>([]);
  const [adding, setAdding] = useState(false);
  const noTrades = Boolean(wallet && Array.isArray(wallet.leadTrades) && wallet.leadTrades.length === 0);
  // Bids outbid since the last visit, marked for the rest of this one.
  const [newlyOutbid, setNewlyOutbid] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const { toast, show } = useToast();

  useEffect(() => {
    industriesAPI.list().then(setTrades).catch(() => setTrades([]));
  }, []);
  // Looking at the page is seeing the news: the outbid notice elsewhere goes, and these rows keep a "new" mark this visit.
  useEffect(() => {
    if (!organizationId || !standing) return;
    const fresh = standing.filter((b) => b.outbidNew).map((b) => b.id);
    if (fresh.length === 0) return;
    setNewlyOutbid((prev) => (fresh.every((id) => prev.has(id)) ? prev : new Set([...prev, ...fresh])));
    bidsAPI.markOutbidSeen(organizationId).catch(() => {});
  }, [organizationId, standing]);
  // The yellow + button's "Bid" opens /bids?new=1, once the page knows whether there are trades to bid on.
  useEffect(() => {
    if (params.get('new') !== '1' || !standing || !wallet) return;
    if (!noTrades) setAdding(true);
    setParams({}, { replace: true });
  }, [params, setParams, standing, wallet, noTrades]);
  // Saves and removals come back through the subscription; nothing to reload.
  const nothing = async () => {};

  // The Marketplace used to be a tab here; old links still land on it.
  if (params.get('tab') === 'marketplace') return <Navigate to="/marketplace" replace />;

  const balance = wallet?.balanceCents ?? 0;
  const addFunds = () => organizationId && openFundingPage(organizationId).catch((err) => notify(fundErrorText(err), false));
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
            {standing ? `${standing.length} bid${standing.length === 1 ? '' : 's'}` : 'Loading…'} · {won} lead{won === 1 ? '' : 's'} won
          </p>
        </div>
        {standing && noTrades ? (
          // No trades yet: there is nothing to bid on, so the button goes to where trades are picked.
          <Link to="/settings/organization?tab=trades" className={primary}>
            Pick your trades
          </Link>
        ) : standing ? (
          <button type="button" onClick={() => setAdding(true)} className={primary}>
            <Plus className="w-4 h-4" />
            {standing.length === 0 ? 'Set your bids' : 'Add bid'}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Where you work and what a lead is worth to you, per trade. Matching leads go to the highest bid the moment they come in and land in your Leads.
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
            onChanged={nothing}
            onNotify={notify}
            onAdd={() => setAdding(true)}
            onAddFunds={addFunds}
            newlyOutbid={newlyOutbid}
            noTrades={noTrades}
          />
          {/* Past results stay after the last bid is removed; a company with neither sees only the setup card. */}
          {(standing.length > 0 || results.length > 0) && (
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
          onSaved={nothing}
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
  // Plain auction words with an icon each, so the state reads by shape as well as colour.
  const [tone, text, Icon] = !funded
    ? ['bg-red-600/25 text-red-200', 'Paused until you add funds', PauseCircle]
    : unknown
      ? ['bg-[#333] text-gray-300', 'Checking standing…', null]
      : bid.leading
        ? ['bg-emerald-600/30 text-emerald-200', 'Winning', CheckCircle2]
        : ['bg-amber-600/30 text-amber-200', 'Outbid · a higher or earlier bid leads', ArrowDownCircle];
  return (
    <span data-pending={pending || undefined} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap transition-[colors,opacity] duration-300 ${pending ? 'opacity-60' : ''} ${tone}`}>
      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
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
  newlyOutbid = new Set<string>(),
  noTrades = false,
}: {
  /** The company hasn't picked its trades: the empty card points there first. */
  noTrades?: boolean;
  organizationId: string;
  standing: StandingBid[];
  /** Bids outbid since the company last looked, marked "New" this visit. */
  newlyOutbid?: Set<string>;
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
          Pick the counties you work in and what a lead is worth to you, per trade. From then on, matching leads are yours the moment they come in, as
          long as your bid is the highest.
        </p>
        {noTrades ? (
          // Nothing to bid on until the company says what work it does.
          <>
            <p className="text-sm text-amber-200 mt-3" data-no-trades>
              First, pick your trades: they decide which leads you can win.
            </p>
            <Link to="/settings/organization?tab=trades" className={`${primary} mt-4`}>
              Pick your trades
            </Link>
          </>
        ) : (
          <button type="button" onClick={onAdd} className={`${primary} mt-4`}>
            <Plus className="w-4 h-4" />
            Set your bids
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Minimum column widths and one-line cells, so a row never jumps as its standing changes;
          on a narrow screen the table scrolls sideways instead of squeezing. */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm border border-[#2A2A2A] rounded" aria-label="My standing bids">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="font-medium px-4 py-2 min-w-[8rem]">County</th>
            <th className="font-medium px-4 py-2 min-w-[8rem]">Service</th>
            <th className="font-medium px-4 py-2 text-right min-w-[9rem]">Your bid</th>
            <th className="font-medium px-4 py-2 min-w-[14rem]">Standing</th>
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
                        onFocus={() => patchRow(bid.id, { typing: true })}
                        onBlur={() => {
                          // Leaving the field with nothing it can send in it puts the saved amount back.
                          if (state.draft !== undefined && (!(Number(state.draft) >= MIN_BID) || state.over)) patchRow(bid.id, { draft: undefined, over: false, typing: false });
                          else patchRow(bid.id, { typing: false });
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
                        {!state.over && state.status === 'idle' && state.typing && (
                          <span className="text-gray-500">Type any amount from {money(MIN_BID * 100)}</span>
                        )}
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
                  {newlyOutbid.has(bid.id) && !bid.leading && funded && (
                    <span data-newly-outbid className="text-[10px] font-semibold text-amber-300" title="Outbid since you last looked">
                      New
                    </span>
                  )}
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
      {/* Bids don't each hold money: every win comes out of one balance. Say how far it goes. */}
      {(() => {
        const covered = standing.filter((b) => b.amountCents <= balance);
        if (covered.length === 0) return null;
        const top = Math.max(...covered.map((b) => b.amountCents));
        const n = Math.floor(balance / top);
        return (
          <p data-shared-balance className="text-xs text-gray-500">
            Your {money(balance)} covers about {n} lead{n === 1 ? '' : 's'} at your highest bid. Every win comes out of this one balance.
          </p>
        );
      })()}
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
              {r.won ? `Won at ${money(r.myBidCents)} · now in your Leads` : r.outcome ?? 'Missed'}
              {r.resolvedAt ? ` · ${new Date(r.resolvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
            </span>
          </span>
          {/* "Missed", not "Lost": Lost is the Leads stage for a customer you didn't close. */}
          <span className={`text-xs whitespace-nowrap ${r.won ? 'text-emerald-300' : 'text-gray-500'}`}>{r.won ? 'Won' : 'Missed'}</span>
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
  onFocus,
  tone,
  warn = false,
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
  /** Called when the amount field is tapped into, to show that any amount can be typed. */
  onFocus?: () => void;
  /** Tints the amount for a moment after a tap: green going up, amber going down. */
  tone?: 'up' | 'down';
  /** The amount is more than the balance can place: amber edge and amount until it fits. */
  warn?: boolean;
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
  const amount = warn ? 'text-amber-300' : tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-amber-300' : 'text-white';
  return (
    <div data-warn={warn || undefined} className={`relative inline-flex items-stretch rounded border bg-[#1A1A1A] transition-colors duration-300 ${warn ? 'border-amber-500/70' : 'border-[#333]'}`}>
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
          onFocus={onFocus}
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
  // When the arrow keys move the highlight, keep it in view: the list scrolls with it. Hovering
  // with the mouse moves it too, but scrolling under the pointer would jump, so only keys do.
  const countyList = useRef<HTMLUListElement>(null);
  const byKey = useRef(false);
  useEffect(() => {
    if (!byKey.current) return;
    byKey.current = false;
    countyList.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  // One county at a time; bids in another county are a second visit.
  const [county, setCounty] = useState<string | null>(null);
  // One amount per trade; a trade with no entry isn't being bid on.
  // The company's trades start on at the minimum; bids already placed here fill their rows.
  const startingBids = () =>
    Object.fromEntries(preferredTrades.filter((t) => trades.some((x) => x.id === t)).map((t) => [t, String(MIN_BID)]));
  const [bids, setBids] = useState<Record<string, string>>(startingBids);
  // Rows the company has set by hand; a bid already placed never overwrites those.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const setBid = (id: string, value: string) => {
    setTouched((t) => new Set(t).add(id));
    setBids((b) => ({ ...b, [id]: value }));
  };
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bids are only for the trades the company lists (the server refuses others),
  // so those are the rows, plus any bid already placed here.
  const ordered = useMemo(() => trades.filter((t) => preferredTrades.includes(t.id)), [trades, preferredTrades]);
  const shownTrades = trades.filter((t) => preferredTrades.includes(t.id) || bids[t.id] !== undefined);
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
  const lastCounty = useRef<string | null>(null);
  const pick = (name: string) => {
    // Switching from one county to another starts fresh: amounts set for the last county
    // don't follow you, or they'd be saved here without meaning to. (Amounts set before
    // the first county is picked are kept.)
    // "Change county" clears the county before the next pick, so remember the last one picked.
    const switching = lastCounty.current !== null && lastCounty.current !== name;
    lastCounty.current = name;
    setCounty(name);
    // Bids already placed there fill their rows, so this screen edits as well as adds.
    setBids((b) => {
      const next = switching ? startingBids() : { ...b };
      for (const sb of standing) {
        if (sb.county === name && (switching || !touched.has(sb.jobType))) next[sb.jobType] = String(sb.amountCents / 100);
      }
      return next;
    });
    if (switching) setTouched(new Set());
    setSearch('');
  };
  const turnOn = (id: string) => setBid(id, String(MIN_BID));
  // The X on a bid already placed here removes it (after asking), like the trash on the Bids table;
  // on a row not yet saved it just switches the trade off.
  const [confirmRemove, confirmDialog] = useConfirm();
  const removePlaced = async (t: Trade) => {
    const mine = placed(t.id);
    if (!mine) return turnOff(t.id);
    const yes = await confirmRemove({
      title: `Remove your ${t.name} bid in ${county} County?`,
      message: 'You can add it again later.',
      confirmLabel: 'Remove bid',
    });
    if (!yes) return;
    try {
      await bidsAPI.removeStanding(mine.id);
      turnOff(t.id);
      onNotify('Bid removed.');
      await onSaved();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "That didn't work", false);
    }
  };
  const turnOff = (id: string) => {
    setTouched((t) => new Set(t).add(id));
    setBids((b) => {
      const next = { ...b };
      delete next[id];
      return next;
    });
  };
  /** Where the company's existing bid for this trade stands in the chosen county. */
  /** Where the company's bid for this trade stands here, in the same words as the Bids table. */
  const standingFor = (id: string): 'winning' | 'outbid' | 'paused' | null => {
    const mine = standing.find((sb) => sb.jobType === id && sb.county === county);
    if (!mine) return null;
    // A bid the balance can't cover isn't outbid, it's out of the running until funds are added.
    return !mine.funded ? 'paused' : mine.leading ? 'winning' : 'outbid';
  };

  const placed = (id: string) => standing.find((sb) => sb.county === county && sb.jobType === id);
  const amounts = live.map((t) => Number(bids[t.id]));
  const amountsOk = amounts.every((a) => Number.isFinite(a) && a >= MIN_BID);
  const top = amounts.length ? Math.max(...amounts) : 0;
  // A bid is only placed when the balance covers it. Lowering one already placed always goes through.
  // Which rows ask for more than the balance can place (lowering one already placed is fine).
  const amountCents = (id: string) => Math.round(Number(bids[id]) * 100);
  const tooHigh = (id: string) => amountCents(id) > balance && amountCents(id) > (placed(id)?.amountCents ?? 0);
  const over = amountsOk ? live.filter((t) => tooHigh(t.id)) : [];
  const affordable = amountsOk && over.length === 0;
  const covers = amountsOk && top > 0 ? Math.floor(balance / (top * 100)) : 0;
  // Nothing to save if every live row already matches a placed bid in this county.
  const changed = live.some((t) => placed(t.id)?.amountCents !== Math.round(Number(bids[t.id]) * 100));
  const ready = county !== null && live.length > 0 && amountsOk && changed;
  const rows = live.length;

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      // Each row is a new bid, a change to one already placed here, or unchanged (not sent again).
      const cents = (t: Trade) => Math.round(Number(bids[t.id]) * 100);
      const added = live.filter((t) => !placed(t.id));
      const updated = live.filter((t) => placed(t.id) && placed(t.id)!.amountCents !== cents(t));
      for (const t of [...added, ...updated]) await bidsAPI.setStanding(organizationId, county!, t.id, Number(bids[t.id]));
      const where = `${county} County`;
      const join = (names: string[]) => (names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
      const priced = (rows: Trade[], lead: string) =>
        rows.every((t) => cents(t) === cents(rows[0])) ? `${lead}${money(cents(rows[0]))}` : `${lead}the price you set for each`;
      if (firstTime) {
        // The first bids get the one line that explains how winning works; it stays until dismissed.
        onNotify(`You're set: new ${join(added.map((t) => t.name))} leads in ${where} go to you the moment they come in,${priced(added, ' at ')}, while your bid is the highest.`);
      } else if (updated.length === 0) {
        onNotify(`${added.length === 1 ? 'Bid' : 'Bids'} added: ${join(added.map((t) => t.name))} in ${where}${priced(added, ' at ')}.`);
      } else if (added.length === 0) {
        onNotify(
          updated.length === 1
            ? `Bid updated: ${updated[0].name} in ${where} is now ${money(cents(updated[0]))}.`
            : `Bids updated: ${join(updated.map((t) => t.name))} in ${where}.`,
        );
      } else {
        onNotify(`Saved: ${added.length} bid${added.length === 1 ? '' : 's'} added, ${updated.length} updated in ${where}.`);
      }
      await onSaved();
      onClose();
    } catch (err) {
      // Stay open with everything still filled in, so one fix and Save tries again.
      setSaveError(err instanceof Error ? err.message : "The bid couldn't be saved");
    } finally {
      setBusy(false);
    }
  };

  // Pinned under the trade list so Save stays in reach however many trades are on.
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {saveError && (
        <p role="alert" className="w-full text-sm text-red-300">
          {saveError}
        </p>
      )}
      <p className={`text-xs ${ready && !affordable ? 'text-amber-200' : 'text-gray-500'}`}>
        {!county
          ? 'Pick a county to start. You pay your bid only when you win a lead.'
          : !amountsOk
          ? `Bids start at ${money(MIN_BID * 100)}.`
          : !changed
            ? live.length > 0 ? 'These are your current bids here.' : ''
            : !affordable
              ? over.length === 1
                ? `${over[0].name} at ${money(amountCents(over[0].id))} is more than your ${money(balance)} balance.`
                : `${over.length} bids are more than your ${money(balance)} balance.`
              : `Balance ${money(balance)} covers about ${covers} lead${covers === 1 ? '' : 's'} at your top bid. You pay your bid only when you win a lead.`}
      </p>
      <div className="flex items-center gap-2 ml-auto">
        <button type="button" onClick={onClose} className={secondary}>
          Cancel
        </button>
        {ready && !affordable ? (
          // Saving isn't placing until the balance covers it, so the button goes to the wallet instead.
          // Amber, like every other "money is what's missing" cue: this goes to the wallet, it doesn't save.
          <button
            type="button"
            onClick={onAddFunds}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium whitespace-nowrap"
          >
            <Wallet className="w-4 h-4" />
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
                    byKey.current = true;
                    setActive((i) => Math.min(i + 1, matches.length - 1));
                  } else if (e.key === 'ArrowUp' && matches.length) {
                    e.preventDefault();
                    byKey.current = true;
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
                <ul ref={countyList} className="absolute left-0 right-0 top-full mt-1 z-10 max-h-48 overflow-y-auto divide-y divide-[#2A2A2A] border border-[#333] rounded bg-[#1A1A1A] shadow-xl" aria-label="Counties">
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
          <p className="text-sm font-medium text-white mb-1">Your bids</p>
          <ul className="divide-y divide-[#2A2A2A] border-y border-[#2A2A2A]" aria-label="Bids by trade">
            {shownTrades.map((t) => {
              const on = bids[t.id] !== undefined;
              const where = standingFor(t.id);
              return (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm text-white">{t.name}</p>
                    {/* One line that says where this bid stands, always about a specific amount. */}
                    {(() => {
                      const mine = placed(t.id);
                      if (!mine) {
                        // On a new trade, say the + and − aren't the only way: any amount can be typed.
                        return (
                          <p className="text-xs text-gray-500 mt-0.5">
                            From {money(MIN_BID * 100)}
                            {on ? ' · or type any amount' : ''}
                          </p>
                        );
                      }
                      const at = money(mine.amountCents);
                      if (on && amountCents(t.id) !== mine.amountCents) {
                        // The old standing was about the old amount; say what saving will do instead.
                        return <p className="text-xs text-gray-400 mt-0.5">Was {at} · saving updates your bid</p>;
                      }
                      const [tone, text, Icon] =
                        where === 'winning'
                          ? ['text-emerald-300', `Winning at ${at}`, CheckCircle2]
                          : where === 'paused'
                            ? ['text-red-300', `Paused at ${at} · add funds`, PauseCircle]
                            : ['text-amber-200', `Outbid at ${at} · a higher or earlier bid leads`, ArrowDownCircle];
                      return (
                        <p data-standing={where ?? undefined} className={`text-xs mt-0.5 flex items-center gap-1 ${tone}`}>
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                          {text}
                        </p>
                      );
                    })()}
                  </div>
                  {on ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <BidStepper
                        label={`${t.name} bid`}
                        value={bids[t.id]}
                        warn={amountsOk && tooHigh(t.id)}
                        onChange={(v) => setBid(t.id, v)}
                        onBlur={() => {
                          if (!(Number(bids[t.id]) >= MIN_BID)) setBid(t.id, String(MIN_BID));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removePlaced(t)}
                        aria-label={placed(t.id) ? `Remove bid for ${t.name}` : `Stop bidding on ${t.name}`}
                        className="p-2 text-gray-500 hover:text-white"
                      >
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
          <p className="mt-2 text-xs text-gray-500">
            {ordered.length === 0 ? 'No trades picked yet. ' : 'Want more bids? '}
            <Link to="/settings/organization?tab=trades" className="text-[#7fb0e0] underline underline-offset-2">
              {ordered.length === 0 ? 'Pick your trades in Company settings' : 'Add another trade in Company settings'}
            </Link>
            .
          </p>
        </section>
      </div>
      {confirmDialog}
    </Modal>
  );
}

export default BidsPage;
