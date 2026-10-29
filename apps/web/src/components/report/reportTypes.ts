/** The Webb Report as the backend sends it (convex/lib/report.ts). Money is in cents. */
export interface WebbReport {
  county: string;
  trade?: { slug: string; name: string };
  week: { from: string; to: string };
  pro: boolean;
  permits: {
    feed: boolean;
    syncedAt?: string;
    total: number;
    prior: number;
    newHomes: number;
    newHomesPrior: number;
    byTrade: Array<{ slug: string; name: string; count: number; prior: number; mine: boolean }>;
    inMyTrades: number;
    hotStreets?: Array<{ street: string; newHomes: number }>;
    hotStreetCount: number;
    list?: Array<{
      permitNumber: string;
      address?: string;
      kind: string;
      detail?: string;
      appliedAt: string;
      trades: string[];
      newHome: boolean;
      url?: string;
      builder?: string;
      valuationCents?: number;
    }>;
    builderCount: number;
    builders?: Array<{ name: string; newHomes: number; valuationCents: number; phone?: string; email?: string }>;
    tradeContractors?: Array<{ trade: string; contractors: Array<{ name: string; permits: number; phone?: string; email?: string }> }>;
  };
  demand: Array<{
    slug: string;
    name: string;
    mine: boolean;
    winningBidCents?: number;
    fundedBidders: number;
    inMarketplace: number;
    inVault: number;
    listed7: number;
    sold30: number;
    avgSoldCents: number | null;
    buyers: number;
  }>;
  sold: {
    count: number;
    prior: number;
    byTrade: Array<{ name: string; count: number; avgCents: number; topCents: number }>;
    medianHoursToSell: number | null;
  };
  auction?: {
    next: { date: string; posted: number };
    last?: { date: string; posted: number; sold: number; backToLender: number; cancelled: number };
    boughtCount: number;
    bought?: Array<{ address: string; saleDate: string; priceCents?: number; buyer: string; phone?: string }>;
  };
  mine?: {
    permitsInMyTrades: number;
    bids: Array<{ name: string; amountCents: number; winning: boolean; paused: boolean }>;
    newLeads: number;
  };
}

/** "up 20% on last week", "same as last week", "none last week" (as the backend words it). */
export function versus(now: number, before: number): string {
  if (now === before) return 'same as last week';
  if (before === 0) return 'none last week';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on last week (${before})`;
}
