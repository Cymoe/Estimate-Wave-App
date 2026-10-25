import { isWonLead, money } from './wallet';

/** How a FieldQuote lead reached the company, in full and as a short tag. */
const ROUTES = {
  bid: { long: 'Won with a bid', tag: 'Bid' },
  order: { long: 'Buy order filled', tag: 'Buy order' },
  buy: { long: 'Bought in the Marketplace', tag: 'Marketplace' },
  claim: { long: 'Claimed from the Vault', tag: 'Vault' },
  sent: { long: 'Sent by FieldQuote', tag: 'Sent' },
} as const;

interface OriginLead {
  marketplaceLeadId?: string;
  pricePaidCents?: number;
  wonVia?: keyof typeof ROUTES;
  source?: string;
}

/**
 * How a FieldQuote lead got here and what it cost: "Won with a bid · $300.00",
 * "Bought in the Marketplace · $40.00", "Claimed from the Vault · included in the plan".
 * A lead sold before the route was recorded reads "From FieldQuote · $250.00".
 * Nothing for the company's own leads.
 */
export function leadOrigin(lead: OriginLead): string | null {
  if (!isWonLead(lead)) return null;
  const how = lead.wonVia ? ROUTES[lead.wonVia].long : 'From FieldQuote';
  const price = lead.wonVia === 'claim' && !lead.pricePaidCents ? 'included in the plan' : money(lead.pricePaidCents ?? 0);
  return `${how} · ${price}`;
}

/** Every lead's origin: the FieldQuote route, or "Added by hand · Referral" for one the company typed in. */
export function leadRoute(lead: OriginLead): string {
  const origin = leadOrigin(lead);
  if (origin) return origin;
  return lead.source && lead.source !== 'FieldQuote Lead' ? `Added by hand · ${lead.source}` : 'Added by hand';
}

/** The small tag on a lead card: "FieldQuote · Bid", "FieldQuote · Vault"; nothing for the company's own leads. */
export function leadTag(lead: OriginLead): string | null {
  if (!isWonLead(lead)) return null;
  return lead.wonVia ? `FieldQuote · ${ROUTES[lead.wonVia].tag}` : 'FieldQuote';
}
