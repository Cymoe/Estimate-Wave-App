import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Sparkles, X } from 'lucide-react';
import { walletAPI } from '../../lib/api';
import { money } from './wallet';

export interface FeedLead {
  id: string;
  jobType?: string;
  tradeName?: string;
  city?: string;
  summary?: string;
  priceCents: number;
  postedAt: string;
  matchesTrades: boolean;
}

function postedAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const tradeLabel = (slug?: string, names?: Record<string, string>) =>
  (slug && names?.[slug]) || (slug ? slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'General');

/**
 * Leads a company can buy. Each shows the trade, town and job; the
 * homeowner's details unlock once it's bought, and only one company can buy it.
 */
export const LeadFeed: React.FC<{
  organizationId: string;
  balanceCents: number;
  tradeNames?: Record<string, string>;
  onClose: () => void;
  onBought: () => void;
  onAddFunds: () => void;
}> = ({ organizationId, balanceCents, tradeNames, onClose, onBought, onAddFunds }) => {
  const [leads, setLeads] = useState<FeedLead[] | null>(null);
  const [confirming, setConfirming] = useState<FeedLead | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [balance, setBalance] = useState(balanceCents);

  const load = () => walletAPI.feed(organizationId).then(setLeads).catch(() => setLeads([]));
  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const buy = async (lead: FeedLead) => {
    setBusy(true);
    setMessage(null);
    try {
      await walletAPI.buy(lead.id, organizationId);
      setBalance((b) => b - lead.priceCents);
      setMessage({ text: `Lead unlocked: it's in your Leads with the homeowner's details.`, good: true });
      onBought();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "The lead couldn't be bought", good: false });
    } finally {
      setConfirming(null);
      setBusy(false);
      load();
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
      <aside role="dialog" aria-label="New leads" className="fixed right-0 top-0 h-[100dvh] w-full md:w-[460px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div>
            <h2 className="text-base font-semibold text-white">New leads</h2>
            <p className="text-xs text-gray-400">Balance {money(balance)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {message && (
            <p role="status" className={`text-sm rounded px-3 py-2 border ${message.good ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
              {message.text}
            </p>
          )}
          {leads === null ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No new leads right now. New ones show up here as soon as they come in.</p>
          ) : (
            leads.map((lead) => {
              const affordable = balance >= lead.priceCents;
              const asking = confirming?.id === lead.id;
              return (
                <article key={lead.id} className="rounded border border-[#2A2A2A] bg-[#161616] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white flex items-center gap-1.5">
                        {lead.matchesTrades && <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-label="Your trade" />}
                        {lead.tradeName ?? tradeLabel(lead.jobType, tradeNames)}
                      </p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {lead.city || 'Area not given'} · {postedAgo(lead.postedAt)}
                      </p>
                    </div>
                    <span className="text-base font-semibold text-white">{money(lead.priceCents)}</span>
                  </div>
                  {lead.summary && <p className="text-sm text-gray-300 mt-2">{lead.summary}</p>}
                  <p className="text-xs text-gray-500 mt-2">Name, phone and address unlock when you buy.</p>
                  {asking ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-sm text-gray-200 flex-1">
                        Buy this {lead.tradeName ?? tradeLabel(lead.jobType, tradeNames)} lead for {money(lead.priceCents)}?
                      </span>
                      <button type="button" disabled={busy} onClick={() => buy(lead)} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
                        {busy ? 'Buying…' : 'Buy'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="px-3 py-1.5 rounded border border-[#333] text-gray-300 text-sm">
                        Cancel
                      </button>
                    </div>
                  ) : affordable ? (
                    <button type="button" onClick={() => setConfirming(lead)} className="mt-3 w-full px-3 py-2 rounded bg-[#336699] text-white text-sm font-medium">
                      Buy lead · {money(lead.priceCents)}
                    </button>
                  ) : (
                    <button type="button" onClick={onAddFunds} className="mt-3 w-full px-3 py-2 rounded border border-amber-500/50 text-amber-200 text-sm">
                      Add funds to buy this lead
                    </button>
                  )}
                </article>
              );
            })
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
};
