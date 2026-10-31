import { isWonLead, money } from './wallet';

/** How a Webb Leads lead reached the company, in full and as a short tag. */
const ROUTES = {
  bid: { long: 'Won with a bid', tag: 'Bid' },
  order: { long: 'Buy order filled', tag: 'Buy order' },
  buy: { long: 'Bought in the Marketplace', tag: 'Marketplace' },
  claim: { long: 'Claimed from the Vault', tag: 'Vault' },
  sent: { long: 'Sent by Webb Leads', tag: 'Sent' },
} as const;

/** The source a sold lead is stored with; leads sold before the renames carry the old names. */
const NETWORK_SOURCES = new Set(['Webb Leads', 'Tolliver Lead', 'FieldQuote Lead']);

interface OriginLead {
  marketplaceLeadId?: string;
  pricePaidCents?: number;
  wonVia?: keyof typeof ROUTES;
  source?: string;
}

/**
 * How a Webb Leads lead got here and what it cost: "Won with a bid · $300.00",
 * "Bought in the Marketplace · $40.00", "Claimed from the Vault · included in the plan".
 * A lead sold before the route was recorded reads "From Webb Leads · $250.00".
 * Nothing for the company's own leads.
 */
export function leadOrigin(lead: OriginLead): string | null {
  if (!isWonLead(lead)) return null;
  const how = lead.wonVia ? ROUTES[lead.wonVia].long : 'From Webb Leads';
  const price = lead.wonVia === 'claim' && !lead.pricePaidCents ? 'included in the plan' : money(lead.pricePaidCents ?? 0);
  return `${how} · ${price}`;
}

/** Every lead's origin: the Webb Leads route, or "Added by hand · Referral" for one the company typed in. */
export function leadRoute(lead: OriginLead): string {
  const origin = leadOrigin(lead);
  if (origin) return origin;
  return lead.source && !NETWORK_SOURCES.has(lead.source) ? `Added by hand · ${lead.source}` : 'Added by hand';
}

/** The small tag on a lead card: "Webb Leads · Bid", "Webb Leads · Vault"; nothing for the company's own leads. */
export function leadTag(lead: OriginLead): string | null {
  if (!isWonLead(lead)) return null;
  return lead.wonVia ? `Webb Leads · ${ROUTES[lead.wonVia].tag}` : 'Webb Leads';
}
