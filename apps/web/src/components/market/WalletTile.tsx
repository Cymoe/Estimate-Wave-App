import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { walletAPI } from '../../lib/api';
import { money } from './wallet';
import { WALLET_CHANGED, WalletDrawer, leadsCovered, openFundingPage, type WalletSummary } from './WalletBar';

/**
 * The company's lead balance, pinned in the navigation so it's always in
 * view. Tapping it opens the Lead balance panel on the right. Refreshes
 * when the page changes, every minute, and whenever a page says the wallet
 * moved (see `notifyWalletChanged`).
 */
export const WalletTile: React.FC<{ organizationId?: string; collapsed?: boolean; onOpen?: () => void; variant?: 'sidebar' | 'menu' }> = ({
  organizationId,
  collapsed = false,
  onOpen,
  variant = 'sidebar',
}) => {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const load = useCallback(() => {
    if (!organizationId) return;
    walletAPI
      .get(organizationId)
      .then((w: WalletSummary) => setWallet(w))
      .catch(() => {});
  }, [organizationId]);

  useEffect(() => {
    setWallet(null);
    load();
  }, [load]);
  useEffect(() => {
    load();
  }, [pathname, load]);
  useEffect(() => {
    const timer = setInterval(load, 60_000);
    window.addEventListener(WALLET_CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(WALLET_CHANGED, load);
    };
  }, [load]);

  if (!organizationId || !wallet) return null;
  const covered = leadsCovered(wallet);
  const low = covered < 2 && !wallet.pendingFunding;
  const show = () => {
    setOpen(true);
    onOpen?.();
  };
  const addFunds = () => openFundingPage(organizationId).catch(() => {});
  const drawer = open && <WalletDrawer wallet={wallet} onClose={() => setOpen(false)} onAddFunds={addFunds} />;

  if (variant === 'menu') {
    return (
      <>
        <button type="button" onClick={show} aria-label="Lead balance" className="w-full text-left p-3 hover:bg-[#333333] rounded-[4px] transition-colors text-gray-300">
          <span className="flex items-center gap-2">
            <Wallet className={`w-4 h-4 ${low ? 'text-amber-300' : 'text-emerald-300'}`} />
            <span className="text-white font-medium">{money(wallet.balanceCents)}</span>
            <span className="text-xs text-gray-500">· about {covered} lead{covered === 1 ? '' : 's'}</span>
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">Lead balance · tap for history and Add funds</span>
        </button>
        {drawer}
      </>
    );
  }

  return (
    <div className="px-2 pb-2">
      <button
        type="button"
        onClick={show}
        aria-label="Lead balance"
        title={collapsed ? `Lead balance ${money(wallet.balanceCents)} · about ${covered} lead${covered === 1 ? '' : 's'}` : undefined}
        className={`w-full rounded-[4px] border transition-colors ${
          low ? 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15' : 'border-[#2A2A2A] bg-[#1A1A1A] hover:bg-[#2A2A2A]'
        } ${collapsed ? 'flex flex-col items-center py-2' : 'flex items-center gap-2 px-3 py-2'}`}
      >
        <Wallet className={`w-4 h-4 flex-shrink-0 ${low ? 'text-amber-300' : 'text-emerald-300'}`} />
        {collapsed ? (
          <span className="text-[10px] text-white font-medium mt-1 leading-none">{money(wallet.balanceCents).replace(/\.00$/, '')}</span>
        ) : (
          <span className="min-w-0 text-left">
            <span className="block text-sm text-white font-medium leading-tight">{money(wallet.balanceCents)}</span>
            <span className="block text-[10px] text-gray-400 leading-tight">
              about {covered} lead{covered === 1 ? '' : 's'}
            </span>
          </span>
        )}
      </button>
      {drawer}
    </div>
  );
};
