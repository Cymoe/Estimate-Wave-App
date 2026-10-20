import React, { useEffect, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { IndustryService } from '../../services/IndustryService';
import { WALLET_CHANGED } from '../market/WalletBar';
import { Toast, useToast } from '../common/Notice';

interface Trade {
  id: string;
  name: string;
  description?: string;
}

import { TRADES_CHANGED } from './tradesLabels';

export { NO_TRADES_LABEL, TRADES_CHANGED } from './tradesLabels';

/**
 * Where a company picks its trades: one list that decides its leads, its bids
 * and what its Price Book opens on. Your trades sit at the top as chips; the
 * rest are below to tap on. Every tap saves on its own (no Save button), and
 * taps made while a save is going out are sent right after it.
 */
export const TradesEditor: React.FC<{ organizationId: string; className?: string }> = ({ organizationId, className = '' }) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast, show } = useToast();
  // The set the company wants; a save always sends the latest one.
  const wanted = useRef<Set<string>>(new Set());
  const saving = useRef(false);

  const load = async () => {
    try {
      const [all, chosen] = await Promise.all([IndustryService.listAll(), IndustryService.getOrganizationIndustries(organizationId)]);
      const set = new Set((chosen as Trade[]).map((t) => t.id));
      wanted.current = set;
      setTrades(all as Trade[]);
      setMine(set);
    } catch {
      setError("Couldn't load the trades. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const flush = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      let sent: Set<string>;
      do {
        sent = wanted.current;
        await IndustryService.setOrganizationIndustries(organizationId, [...sent]);
      } while (sent !== wanted.current);
      setError(null);
      show('Trades saved.');
      window.dispatchEvent(new CustomEvent(TRADES_CHANGED, { detail: { organizationId } }));
      window.dispatchEvent(new Event(WALLET_CHANGED));
    } catch {
      setError("Couldn't save your trades. Showing what's saved.");
      await load();
    } finally {
      saving.current = false;
    }
  };
  const toggle = (id: string) => {
    const next = new Set(wanted.current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    wanted.current = next;
    setMine(next);
    flush();
  };

  const q = search.trim().toLowerCase();
  const chosen = trades.filter((t) => mine.has(t.id));
  const matches = trades.filter((t) => !q || t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q));

  return (
    <div className={className}>
      <Toast text={toast} />
      <p className="text-sm text-gray-400">Your trades decide which leads and bids you see and what your Price Book opens on.</p>

      {/* Your trades, as chips: tap the x to drop one. */}
      <div className="mt-4" aria-label="Your trades">
        {chosen.length === 0 ? (
          <p className="text-sm text-amber-200">{loading ? 'Loading…' : 'No trades yet. Pick the ones you work in below.'}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {chosen.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-[#336699]/20 border border-[#336699]/50 text-sm text-white">
                {t.name}
                <button type="button" onClick={() => toggle(t.id)} aria-label={`Remove ${t.name}`} className="p-1 rounded-full text-gray-300 hover:text-white hover:bg-white/10">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="relative mt-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search trades"
          aria-label="Search trades"
          className="w-full pl-9 pr-3 py-2 rounded bg-[#1A1A1A] border border-[#333] text-base md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
        />
      </div>

      {/* Every trade: tap to add or drop. */}
      <ul className="mt-3 divide-y divide-[#2A2A2A] border-y border-[#2A2A2A]" aria-label="All trades">
        {matches.map((t) => {
          const on = mine.has(t.id);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => toggle(t.id)} aria-pressed={on} className="w-full flex items-center gap-3 py-3 text-left">
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm ${on ? 'text-white' : 'text-gray-300'}`}>{t.name}</span>
                  {t.description && <span className="block text-xs text-gray-500 truncate">{t.description}</span>}
                </span>
                <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded border ${on ? 'bg-[#336699] border-[#336699]' : 'border-[#555]'}`}>
                  {on && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
              </button>
            </li>
          );
        })}
        {!loading && matches.length === 0 && <li className="py-6 text-center text-sm text-gray-500">No trades match “{search.trim()}”.</li>}
      </ul>
    </div>
  );
};
