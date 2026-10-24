import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { MapPin, Sparkles } from 'lucide-react';
import { Confirmed } from '../components/market/Confirmed';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { walletAPI } from '../lib/api';
import { useMarketFeed, useMyBuyOrders, useWallet } from '../lib/live';
import { money } from '../components/market/wallet';
import { notifyWalletChanged, openFundingPage, type WalletSummary } from '../components/market/WalletBar';
import { fillTimeMs, priceAt, type Auction } from '../services/auction';
import { InlineNotice, Toast, useToast } from '../components/common/Notice';

export interface FeedLead {
  id: string;
  jobType?: string;
  tradeName?: string;
  city?: string;
  summary?: string;
  receivedAt: string;
  auction: Auction;
  matchesTrades: boolean;
  /** When FieldQuote confirmed it with the homeowner, and what they said. */
  verified?: { at: string; note?: string };
  myBid?: { id: string; maxCents: number };
}

interface Bid {
  id: string;
  leadId: string;
  city?: string;
  jobType?: string;
  maxCents: number;
  status: 'open' | 'filled' | 'lost' | 'cancelled';
  outcome?: string;
  pricePaidCents?: number;
  createdAt: string;
}

/** "3m", "59m", "21h 33m". Negative or tiny spans read "now". */
export function span(ms: number) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const ago = (iso: string, now: number) => `${span(now - Date.parse(iso))} ago`;

const titleFromSlug = (slug?: string) =>
  slug ? slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'General';

const primary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap';
const secondary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[#333] text-gray-200 text-sm disabled:opacity-50 whitespace-nowrap';
const input =
  'w-24 bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-right text-white text-base md:text-sm focus:outline-none focus:border-[#336699]';

/**
 * Where a company buys leads. Each lead's price drops on a schedule until
 * someone buys it: buy now at the current price, or place a buy order at
 * the price you'd pay and it fills on its own when the price gets there.
 * Live: a lead another company takes leaves the list as it happens.
 */
const MarketplacePage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  const [params] = useSearchParams();
  const wallet = useWallet<WalletSummary>(organizationId) ?? null;
  const leads = useMarketFeed<FeedLead[]>(organizationId) ?? null;
  const bids = useMyBuyOrders<Bid[]>(organizationId) ?? [];
  const [now, setNow] = useState(() => Date.now());
  const [mineOnly, setMineOnly] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, show } = useToast();

  useEffect(() => {
    // Prices move on their own: tick the countdowns. Fills and sales arrive on their own.
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  if (params.get('tab') === 'older') return <Navigate to="/vault" replace />;

  const balance = wallet?.balanceCents ?? 0;
  const addFunds = () => organizationId && openFundingPage(organizationId).catch(() => {});

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      show(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work');
    } finally {
      setBusy(false);
      setConfirming(null);
      setOrdering(null);
      notifyWalletChanged();
    }
  };
  const buyNow = (lead: FeedLead) =>
    act(() => walletAPI.buy(lead.id, organizationId!), 'Lead bought: it’s in your Leads with the homeowner’s details.');
  const placeOrder = (lead: FeedLead, max: number) =>
    act(() => walletAPI.placeBid(lead.id, organizationId!, max), `Buy order placed at ${money(Math.round(max * 100))}. It fills on its own when the price gets there.`);
  const cancelOrder = (bidId: string) => act(() => walletAPI.cancelBid(bidId), 'Buy order cancelled.');

  const shown = useMemo(() => {
    const all = leads ?? [];
    const filtered = mineOnly && all.some((l) => l.matchesTrades) ? all.filter((l) => l.matchesTrades) : all;
    return filtered.map((lead) => ({ lead, price: priceAt(lead.auction, now) }));
  }, [leads, mineOnly, now]);
  const vaultCount = wallet?.olderLeads ?? 0;
  const openOrders = bids.filter((b) => b.status === 'open');
  const settled = bids.filter((b) => b.status === 'filled' || b.status === 'lost').slice(0, 5);

  /** The buttons for one lead, shared by the table and the cards. */
  const actions = (lead: FeedLead, price: ReturnType<typeof priceAt>) => {
    if (lead.myBid) {
      const fillsIn = span(fillTimeMs(lead.auction, lead.myBid.maxCents) - now);
      return (
        <div className="flex items-center gap-2 justify-end flex-wrap">
          <span className="text-xs text-[#cfe2f5]">
            Buy order {money(lead.myBid.maxCents)} · fills in ~{fillsIn}
          </span>
          <button type="button" disabled={busy} onClick={() => cancelOrder(lead.myBid!.id)} className={secondary}>
            Cancel
          </button>
        </div>
      );
    }
    if (confirming === lead.id) {
      return (
        <div className="flex items-center gap-2 justify-end flex-wrap">
          <span className="text-xs text-gray-200">Buy for {money(price.priceCents)}?</span>
          <button type="button" disabled={busy} onClick={() => buyNow(lead)} className={primary}>
            {busy ? 'Buying…' : 'Buy'}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={secondary}>
            Back
          </button>
        </div>
      );
    }
    if (ordering?.id === lead.id) {
      const value = Number(ordering.value);
      const ok = Number.isFinite(value) && value * 100 >= lead.auction.floorCents && value * 100 < price.priceCents && value * 100 <= balance;
      return (
        <form
          className="flex items-center gap-2 justify-end flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) placeOrder(lead, value);
          }}
        >
          <label className="text-xs text-gray-400">
            Your price $
            <input
              autoFocus
              inputMode="decimal"
              aria-label="Buy order price"
              value={ordering.value}
              onChange={(e) => setOrdering({ id: lead.id, value: e.target.value })}
              className={`${input} ml-1`}
            />
          </label>
          <button type="submit" disabled={busy || !ok} className={primary}>
            Place order
          </button>
          <button type="button" disabled={busy} onClick={() => setOrdering(null)} className={secondary}>
            Back
          </button>
          {ordering.value !== '' && !ok && (
            <span className="basis-full text-right text-xs text-amber-200">
              {value * 100 > balance ? 'More than your balance' : `Between ${money(lead.auction.floorCents)} and ${money(price.priceCents - 1)}`}
            </span>
          )}
        </form>
      );
    }
    if (balance < lead.auction.floorCents) {
      return (
        <button type="button" onClick={addFunds} className="inline-flex items-center px-3 py-1.5 rounded border border-amber-500/50 text-amber-200 text-sm whitespace-nowrap">
          Add funds to buy
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2 justify-end">
        {!price.atFloor && (
          <button
            type="button"
            onClick={() => setOrdering({ id: lead.id, value: String((price.nextPriceCents ?? lead.auction.floorCents) / 100) })}
            className={secondary}
          >
            Place buy order
          </button>
        )}
        {balance >= price.priceCents ? (
          <button type="button" onClick={() => setConfirming(lead.id)} className={primary}>
            Buy now
          </button>
        ) : (
          <button type="button" onClick={addFunds} className="inline-flex items-center px-3 py-1.5 rounded border border-amber-500/50 text-amber-200 text-sm whitespace-nowrap">
            Add funds
          </button>
        )}
      </div>
    );
  };

  const tradeOf = (lead: { tradeName?: string; jobType?: string }) => lead.tradeName ?? titleFromSlug(lead.jobType);
  const endsIn = (price: ReturnType<typeof priceAt>) => (price.atFloor ? 'At floor' : span(price.floorAtMs - now));
  const nextDrop = (price: ReturnType<typeof priceAt>) =>
    price.nextPriceCents != null && price.nextDropAtMs != null ? `${money(price.nextPriceCents)} ~${span(price.nextDropAtMs - now)}` : '—';

  return (
    <div className="p-4 md:p-6 text-white">
      <div className="mb-2">
        <h1 className="text-xl font-semibold">Marketplace</h1>
        <p className="text-sm text-gray-400">
          {leads ? `${leads.length} lead${leads.length === 1 ? '' : 's'}` : 'Loading…'} · {openOrders.length} buy order{openOrders.length === 1 ? '' : 's'} open
        </p>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Leads nobody had a bid for. Prices drop on a schedule until someone buys: buy now, or place a buy order at your price and it fills on its own.
        Only one company gets each lead.
      </p>

      {error && (
        <InlineNotice tone="bad" onDismiss={() => setError(null)} className="mb-4">
          {error}
        </InlineNotice>
      )}
      <Toast text={toast} />

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setMineOnly((m) => !m)}
          aria-pressed={mineOnly}
          className={`px-3 py-1.5 rounded-full text-xs border ${mineOnly ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333] text-gray-400'}`}
        >
          My trades
        </button>
      </div>

      {leads === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12 border border-[#2A2A2A] rounded">No leads right now. New ones show up here as soon as they come in.</p>
      ) : (
        <>
          {/* Desktop */}
          <table className="hidden md:table w-full text-sm border border-[#2A2A2A] rounded" data-testid="marketplace-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="font-medium px-4 py-2">Location</th>
                <th className="font-medium px-4 py-2">Lead type</th>
                <th className="font-medium px-4 py-2">Received</th>
                <th className="font-medium px-4 py-2">Ends in</th>
                <th className="font-medium px-4 py-2 text-right">Current</th>
                <th className="font-medium px-4 py-2 text-right">Next drop</th>
                <th className="font-medium px-4 py-2 text-right">Floor</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]">
              {shown.map(({ lead, price }) => (
                <tr key={lead.id} className={lead.myBid ? 'bg-[#336699]/5' : ''}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-white">
                      {lead.matchesTrades && <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-label="Your trade" />}
                      {lead.city || 'Area not given'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block text-white">{tradeOf(lead)}</span>
                    {lead.summary && <span className="block text-xs text-gray-500 truncate max-w-[18rem]">{lead.summary}</span>}
                    <Confirmed verified={lead.verified} className="mt-0.5" />
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{ago(lead.receivedAt, now)}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{endsIn(price)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">{money(price.priceCents)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">{nextDrop(price)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{money(lead.auction.floorCents)}</td>
                  <td className="px-4 py-3 text-right">{actions(lead, price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phone */}
          <ul className="md:hidden space-y-3">
            {shown.map(({ lead, price }) => (
              <li key={lead.id} className={`rounded border p-4 ${lead.myBid ? 'border-[#336699]/60 bg-[#336699]/5' : 'border-[#2A2A2A] bg-[#161616]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white flex items-center gap-1.5">
                      {lead.matchesTrades && <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-label="Your trade" />}
                      {tradeOf(lead)}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {lead.city || 'Area not given'} · {ago(lead.receivedAt, now)}
                    </p>
                  </div>
                  <span className="text-lg font-semibold text-white">{money(price.priceCents)}</span>
                </div>
                {lead.summary && <p className="text-sm text-gray-300 mt-2">{lead.summary}</p>}
                <Confirmed verified={lead.verified} className="mt-1" />
                <p className="text-xs text-gray-500 mt-2">
                  Next drop {nextDrop(price)} · floor {money(lead.auction.floorCents)} · ends in {endsIn(price)}
                </p>
                <div className="mt-3">{actions(lead, price)}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      {vaultCount > 0 && (
        <p className="mt-6 text-sm text-gray-400">
          <Link to="/vault" className="text-[#9cc3ea] underline underline-offset-2">
            {vaultCount} lead{vaultCount === 1 ? '' : 's'} in the Vault →
          </Link>
        </p>
      )}

      {(openOrders.length > 0 || settled.length > 0) && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-white mb-2">Your buy orders</h2>
          <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded">
            {[...openOrders, ...settled].map((bid) => (
              <li key={bid.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block text-white truncate">
                    {titleFromSlug(bid.jobType)} · {bid.city || 'Area not given'}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {bid.status === 'open'
                      ? `Open at ${money(bid.maxCents)}`
                      : bid.status === 'filled'
                        ? `Bought for ${money(bid.pricePaidCents ?? bid.maxCents)}`
                        : `Missed · ${bid.outcome ?? ''}`}
                  </span>
                </span>
                {bid.status === 'open' && (
                  <button type="button" disabled={busy} onClick={() => cancelOrder(bid.id)} className={secondary}>
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default MarketplacePage;
