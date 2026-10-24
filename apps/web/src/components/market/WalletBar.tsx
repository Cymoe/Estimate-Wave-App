import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Gavel, X } from 'lucide-react';
import { fundingAPI } from '../../lib/api';
import { useWallet } from '../../lib/live';
import { WalletHistory, money, planLabel, type PlanSummary } from './wallet';
import { FUNDING_TIERS, MIN_FUNDING_CENTS } from '../../../convex/lib/funding';

/** "$5,000": whole dollars, for the offer line. */
const whole = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`;

export interface WalletSummary {
  balanceCents: number;
  typicalLeadCents: number;
  spentCents: number;
  leadsBought: number;
  wonCents: number;
  wonCount: number;
  availableLeads?: number;
  openBids?: number;
  standingBids?: number;
  /** Standing bids above the balance: kept, but paused until funds cover them. */
  pausedBids?: number;
  /** Bids another company took the lead from since the company last looked at its bids. */
  outbidBids?: number;
  leadTrades?: string[];
  /** Whether an owner or admin has a mobile for lead alerts. */
  hasMobile?: boolean;
  plan?: PlanSummary | null;
  olderLeads?: number;
  /** No Stripe key on the deployment: Add funds loads play money. */
  playMoney?: boolean;
  transactions: Array<{ id: string; type: string; amountCents: number; balanceAfterCents: number; method?: string; note?: string; createdAt: string }>;
}

/**
 * Opens the company's funding page in a new tab, so they don't lose their
 * place. The tab is opened right away (browsers only allow that during the
 * tap) and pointed at the page once its link exists.
 */
export async function openFundingPage(organizationId: string) {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const url = fundingAPI.url(await fundingAPI.createLink(organizationId));
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Fired on `window` when a page moved money, so the balance in the navigation refreshes. */
export const WALLET_CHANGED = 'fieldquote:wallet-changed';
export const notifyWalletChanged = () => window.dispatchEvent(new Event(WALLET_CHANGED));

/** How many leads the balance covers, at the company's typical lead price. */
export const leadsCovered = (wallet: WalletSummary) =>
  wallet.typicalLeadCents > 0 ? Math.floor(wallet.balanceCents / wallet.typicalLeadCents) : 0;

/**
 * What the company's bids are doing, in one line with one next step. Leads
 * reach a company through a winning bid, so the line always talks about bids
 * and treats the balance as what powers them. Null when all is well.
 */
export function bidStatus(wallet: WalletSummary): {
  tone: 'good' | 'warn';
  text: string;
  action: 'fund' | 'bids' | 'trades' | 'mobile';
  /** The Bids link's words when it isn't "Set bids". */
  label?: string;
  /** A second, quieter link to the Bids page. */
  alsoBids?: boolean;
} | null {
  const bids = wallet.standingBids ?? 0;
  // Trades come first: they decide which leads a company can win at all.
  if (bids === 0 && Array.isArray(wallet.leadTrades) && wallet.leadTrades.length === 0) {
    return { tone: 'warn', text: 'Pick your trades first: they decide which leads you can win and what your Price Book shows.', action: 'trades', label: 'Pick trades' };
  }
  const paused = Math.min(wallet.pausedBids ?? 0, bids);
  const balance = wallet.balanceCents;
  const covered = leadsCovered(wallet);
  if (bids === 0) {
    if (balance <= 0) {
      return { tone: 'warn', text: 'Two steps to start winning leads: add funds, then set your bids.', action: 'fund', alsoBids: true };
    }
    const covers = balance > 0 && covered > 0 ? ` Your ${money(balance)} covers about ${covered} lead${covered === 1 ? '' : 's'}.` : '';
    return { tone: 'good', text: `Set your bids to start winning leads.${covers}`, action: 'bids' };
  }
  // Being outbid is news even while money is fine: someone else now gets these leads.
  const outbid = wallet.outbidBids ?? 0;
  const outbidLine =
    outbid > 0
      ? {
          tone: 'warn' as const,
          text: `You've been outbid on ${outbid === 1 ? 'a bid' : `${outbid} bids`}: a higher or earlier bid now leads. Raise ${outbid === 1 ? 'it' : 'them'} to win the next lead.`,
          action: 'bids' as const,
          label: 'See bids',
        }
      : null;
  const why = balance <= 0 ? `Your balance is ${money(0)}, so ${bids === 1 ? 'it' : 'they'} can't win leads.` : `${bids === 1 ? "It's" : "They're"} higher than your ${money(balance)} balance, so ${bids === 1 ? 'it' : 'they'} can't win leads.`;
  if (paused === bids) {
    return { tone: 'warn', text: `${bids === 1 ? 'Your bid is' : 'Your bids are'} paused. ${why} Add funds to put ${bids === 1 ? 'it' : 'them'} back in.`, action: 'fund', alsoBids: true };
  }
  if (paused > 0) {
    return {
      tone: 'warn',
      text: `${paused} of your ${bids} bids ${paused === 1 ? 'is' : 'are'} paused because ${paused === 1 ? "it's" : "they're"} higher than your ${money(balance)} balance. Add funds to put ${paused === 1 ? 'it' : 'them'} back in.`,
      action: 'fund',
      alsoBids: true,
    };
  }
  if (outbidLine) return outbidLine;
  if (covered < 2) {
    const left = covered >= 1 ? `covers about ${covered} more lead` : `is down to ${money(balance)}`;
    return { tone: 'warn', text: `Your bids are live. Your balance ${left}. Add funds so you don't miss any.`, action: 'fund' };
  }
  // Bids are live and funded: the last thing is making sure the alert reaches a phone.
  if (wallet.hasMobile === false) {
    return { tone: 'warn', text: 'Your bids are live. Add your mobile so lead alerts reach you by text the moment you win one.', action: 'mobile', label: 'Add your mobile' };
  }
  return null;
}

/**
 * Lead notices on the Leads page: a link to the Marketplace when leads are
 * waiting, and one line on what the company's bids
 * are doing (see bidStatus). The balance itself lives in the navigation
 * (WalletTile). Shown from a company's first visit, so a new company sees
 * its next step (pick trades, add funds, set bids) before anything else.
 */
export const WalletBar: React.FC<{ organizationId?: string }> = ({ organizationId }) => {
  // Live: the line changes as bids win, funds land or a bid gets outbid.
  const wallet = useWallet<WalletSummary>(organizationId) ?? null;

  if (!wallet || !organizationId) return null;
  const status = bidStatus(wallet);
  const addFunds = () => openFundingPage(organizationId).catch(() => {});

  return (
    <>
      {((wallet.availableLeads ?? 0) > 0 || (wallet.plan?.active && (wallet.olderLeads ?? 0) > 0)) && (
        <p className="mb-4 text-sm text-gray-400 flex flex-wrap gap-x-4">
          {(wallet.availableLeads ?? 0) > 0 && (
            <Link to="/marketplace" className="text-[#9cc3ea] underline underline-offset-2 [@media(hover:hover)]:hover:text-white">
              {wallet.availableLeads} new lead{wallet.availableLeads === 1 ? '' : 's'} in the Marketplace
            </Link>
          )}
          {wallet.plan?.active && (wallet.olderLeads ?? 0) > 0 && (
            <Link to="/vault" className="text-[#9cc3ea] underline underline-offset-2 [@media(hover:hover)]:hover:text-white">
              {wallet.olderLeads} lead{wallet.olderLeads === 1 ? '' : 's'} in the Vault
            </Link>
          )}
        </p>
      )}
      {status && <BidStatusLine wallet={wallet} status={status} onAddFunds={addFunds} />}
    </>
  );
};

/**
 * The bid status line (see bidStatus). On the Bids page itself (`onBidsPage`) it keeps only
 * Add funds: the links to the bids would point where you already are.
 */
export function BidStatusLine({
  wallet,
  status = bidStatus(wallet),
  onAddFunds,
  onBidsPage = false,
  className = 'mb-4',
}: {
  wallet: WalletSummary;
  status?: ReturnType<typeof bidStatus>;
  onAddFunds: () => void;
  onBidsPage?: boolean;
  className?: string;
}) {
  // The Bids page has its own big "Set your bids" card, so a set-bids line there would say it twice.
  if (!status || (onBidsPage && (status.action === 'bids' || status.action === 'trades'))) return null;
  return (
    <div
      role={status.tone === 'warn' ? 'alert' : 'status'}
      data-bid-status
      className={`${className} px-4 py-3 rounded border text-sm flex items-center gap-x-2 gap-y-1 flex-wrap ${
        status.tone === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
      }`}
    >
      <Gavel className="w-4 h-4 flex-shrink-0" />
      <span>{status.text}</span>
      {status.action === 'fund' ? (
        <button type="button" onClick={onAddFunds} className={`underline underline-offset-2 ${status.tone === 'warn' ? 'text-amber-100' : 'text-white'}`}>
          Add funds
        </button>
      ) : status.action === 'trades' ? (
        <Link to="/settings/organization?tab=trades" className="underline underline-offset-2 text-amber-100">
          {status.label}
        </Link>
      ) : status.action === 'mobile' ? (
        <Link to="/settings/organization?tab=notifications" className="underline underline-offset-2 text-amber-100">
          {status.label}
        </Link>
      ) : (
        <Link to="/bids" className={`underline underline-offset-2 ${status.tone === 'warn' ? 'text-amber-100' : 'text-white'}`}>
          {status.label ?? 'Set bids'}
        </Link>
      )}
      {status.alsoBids && !onBidsPage && (
        <Link to="/bids" className="underline underline-offset-2 text-amber-200/80">
          {(wallet.standingBids ?? 0) > 0 ? 'See bids' : 'Set bids'}
        </Link>
      )}
    </div>
  );
}

/** The Lead balance panel that slides in from the right: balance, what leads turned into, Add funds and history. */
export function WalletDrawer({ wallet, onClose: closeNow, onAddFunds }: { wallet: WalletSummary; onClose: () => void; onAddFunds: () => void }) {
  // Slides in and out like the estimate and lead drawers.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(closeNow, 150);
  }, [closeNow]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  const covered = leadsCovered(wallet);
  return createPortal(
    <>
      <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={close} />
      <aside
        role="dialog"
        aria-label="Lead balance"
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[520px] bg-[#121212] border-l border-[#2A2A2A] shadow-xl z-[10001] flex flex-col transform transition-transform ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <h2 className="text-base font-semibold text-white">Lead balance</h2>
          <button type="button" onClick={close} aria-label="Close" className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <p className="text-4xl font-semibold text-white">{money(wallet.balanceCents)}</p>
            <p className="text-sm text-gray-400 mt-1">
              About {covered} lead{covered === 1 ? '' : 's'} at {money(wallet.typicalLeadCents)} each. Your balance never expires.
            </p>
          </section>
          <section className="grid grid-cols-2 gap-3">
            <div className="border border-[#2A2A2A] rounded p-3">
              <p className="text-xs text-gray-500">Spent on leads</p>
              <p className="text-lg text-white">{money(wallet.spentCents)}</p>
              <p className="text-xs text-gray-500">{wallet.leadsBought} leads</p>
            </div>
            <Link to="/plan" onClick={close} className="border border-[#2A2A2A] rounded p-3 hover:bg-[#1A1A1A]">
              <p className="text-xs text-gray-500">Pro plan</p>
              <p className="text-lg text-white">{planLabel(wallet.plan)}</p>
              <p className="text-xs text-gray-500">
                {wallet.plan?.status === 'active' ? `${money(wallet.plan.monthlyCents)} on ${new Date(wallet.plan.nextChargeAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Tap for details'}
              </p>
            </Link>
          </section>
          <section className="border border-[#2A2A2A] rounded p-4 text-sm text-gray-300">
            <button type="button" onClick={onAddFunds} className="w-full mb-3 px-4 py-2.5 rounded bg-[#336699] text-white font-medium">
              {wallet.playMoney ? 'Add play money' : 'Add funds'}
            </button>
            {wallet.playMoney && <p className="mb-2 text-xs text-amber-300">Test mode: no card is charged and no real money moves.</p>}
            <p>
              Load from {whole(MIN_FUNDING_CENTS)} by card or Apple Pay. Larger loads get a bonus:{' '}
              {FUNDING_TIERS.filter((t) => t.bonusPercent > 0)
                .map((t) => `+${t.bonusPercent}% at ${whole(t.amountCents)}`)
                .join(', ')}
              .
            </p>
            <p className="mt-2 text-gray-400">A bad lead? Tell us within 3 days and we credit it back to your balance.</p>
          </section>
          <section>
            <h3 className="text-sm font-medium text-white mb-2">History</h3>
            <WalletHistory transactions={wallet.transactions} />
          </section>
        </div>
      </aside>
    </>,
    document.body,
  );
}
