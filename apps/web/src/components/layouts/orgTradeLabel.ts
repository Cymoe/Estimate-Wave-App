import { NO_TRADES_LABEL } from '../settings/tradesLabels';

/** "landscaping" -> "Landscaping", "general-construction" -> "General Construction". */
const titleFromSlug = (slug: string) =>
  slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/**
 * What a company does, shown under its name: its trades by their real names
 * ("HVAC", not "Hvac"), or a nudge to add them.
 */
export const orgTradeLabel = (org: { leadTrades?: string[] }, names: Map<string, string> = new Map()) =>
  org.leadTrades?.length ? org.leadTrades.map((slug) => names.get(slug) ?? titleFromSlug(slug)).join(', ') : NO_TRADES_LABEL;
