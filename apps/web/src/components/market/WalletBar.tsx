import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TrendingUp, Wallet, X } from 'lucide-react';
import { walletAPI } from '../../lib/api';
import { WalletHistory, money } from './wallet';

export interface WalletSummary {
  balanceCents: number;
  typicalLeadCents: number;
  spentCents: number;
  leadsBought: number;
  wonCents: number;
  wonCount: number;
  transactions: Array<{ id: string; type: string; amountCents: number; balanceAfterCents: number; method?: string; note?: string; createdAt: string }>;
}

/** How many leads the balance covers, at the company's typical lead price. */
export const leadsCovered = (wallet: WalletSummary) =>
  wallet.typicalLeadCents > 0 ? Math.floor(wallet.balanceCents / wallet.typicalLeadCents) : 0;

/**
 * The company's lead balance on the Leads page: a chip that opens the wallet,
 * and a nudge when the balance is about to run out. Hidden for companies
 * that don't buy leads from FieldQuote.
 */
export const WalletBar: React.FC<{ organizationId?: string; refreshKey?: unknown }> = ({ organizationId, refreshKey }) => {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    walletAPI
      .get(organizationId)
      .then((w: WalletSummary) => !cancelled && setWallet(w))
      .catch(() => !cancelled && setWallet(null));
    return () => {
      cancelled = true;
    };
  }, [organizationId, refreshKey]);

  if (!wallet || (wallet.transactions.length === 0 && wallet.leadsBought === 0)) return null;
  const covered = leadsCovered(wallet);
  const low = covered < 2;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#333] bg-[#121212] text-sm [@media(hover:hover)]:hover:bg-[#1E1E1E] active:bg-[#1E1E1E]"
          aria-label="Lead balance"
        >
          <Wallet className="w-4 h-4 text-emerald-300" />
          <span className="text-white font-medium">{money(wallet.balanceCents)}</span>
          <span className="text-gray-400">· about {covered} lead{covered === 1 ? '' : 's'}</span>
        </button>
        {wallet.wonCents > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
            <TrendingUp className="w-4 h-4 text-emerald-300" />
            {money(wallet.spentCents)} in leads → {money(wallet.wonCents)} won
          </span>
        )}
      </div>
      {low && (
        <div role="alert" className="mb-4 px-4 py-3 rounded border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200">
          {wallet.balanceCents <= 0
            ? "Your lead balance is empty, so new leads can't be sent to you. Add funds to keep them coming."
            : `Your balance covers about ${covered} more lead${covered === 1 ? '' : 's'}. Add funds so you don't miss any.`}
        </div>
      )}
      {open && <WalletDrawer wallet={wallet} onClose={() => setOpen(false)} />}
    </>
  );
};

function WalletDrawer({ wallet, onClose }: { wallet: WalletSummary; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const covered = leadsCovered(wallet);
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
      <aside role="dialog" aria-label="Lead balance" className="fixed right-0 top-0 h-[100dvh] w-full md:w-[420px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <h2 className="text-base font-semibold text-white">Lead balance</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-white">
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
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded p-3">
              <p className="text-xs text-gray-500">Won from them</p>
              <p className="text-lg text-emerald-300">{money(wallet.wonCents)}</p>
              <p className="text-xs text-gray-500">{wallet.wonCount} job{wallet.wonCount === 1 ? '' : 's'}</p>
            </div>
          </section>
          <section className="border border-[#2A2A2A] rounded p-4 text-sm text-gray-300">
            <p className="text-white font-medium mb-1">Add funds</p>
            <p>Contact FieldQuote to add to your balance. Larger loads get a bonus: +5% from $500, +10% from $1,000.</p>
            <p className="mt-2 text-gray-400">A bad lead? Open it within 3 days and tap “Request credit”.</p>
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
