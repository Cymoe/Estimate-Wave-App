import { formatCurrency } from '../../utils/format';

// Shared by the Lead Market (admins) and a company's wallet.

export const money = (cents: number) => formatCurrency(cents / 100);

/** "landscaping" -> "Landscaping", "general-construction" -> "General Construction". */
export const titleFromSlug = (slug: string) =>
  slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export const CREDIT_REASON_LABELS: Record<string, string> = {
  wrong_number: 'Wrong number',
  out_of_area: 'Out of our area',
  not_a_real_job: 'Not a real job',
  duplicate: 'Duplicate',
  other: 'Other',
};

/** Suggested bonus for a payment: +5% from $500, +10% from $1,000. */
export function suggestedBonus(amount: number): number {
  if (amount >= 1000) return Math.round(amount * 0.1);
  if (amount >= 500) return Math.round(amount * 0.05);
  return 0;
}

const TRANSACTION_LABELS: Record<string, string> = {
  top_up: 'Funds added',
  bonus: 'Bonus',
  lead_charge: 'Lead',
  credit: 'Lead credited',
  adjustment: 'Adjustment',
  plan: 'Monthly plan',
};

export function WalletHistory({ transactions }: { transactions: any[] }) {
  if (transactions.length === 0) return <p className="text-sm text-gray-500">Nothing yet.</p>;
  return (
    <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded">
      {transactions.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-sm text-white truncate">
              {TRANSACTION_LABELS[t.type] ?? t.type}
              {t.type === 'lead_charge' && t.note ? `: ${t.note}` : t.method ? ` · ${t.method}` : ''}
            </span>
            <span className="block text-xs text-gray-500">
              {new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · balance {money(t.balanceAfterCents)}
            </span>
          </span>
          <span className={`text-sm whitespace-nowrap ${t.amountCents >= 0 ? 'text-emerald-300' : 'text-gray-300'}`}>
            {t.amountCents >= 0 ? '+' : '−'}
            {money(Math.abs(t.amountCents))}
          </span>
        </li>
      ))}
    </ul>
  );
}


/** A lead that came in through FieldQuote rather than one the company added itself. */
export const isWonLead = (lead: { marketplaceLeadId?: string }) => Boolean(lead.marketplaceLeadId);

/** "Won · $250.00" for a lead that came in through FieldQuote; nothing for the company's own leads. */
export function leadOrigin(lead: { marketplaceLeadId?: string; pricePaidCents?: number }): string | null {
  return isWonLead(lead) ? `Won · ${money(lead.pricePaidCents ?? 0)}` : null;
}

/** A company's monthly plan as the backend reports it. */
export interface PlanSummary {
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  /** Whether the plan's features are open right now. */
  active: boolean;
  monthlyCents: number;
  claimsIncluded: number;
  extraClaimCents: number;
  claimsLeft: number;
  nextClaimCents: number;
  periodStart: string;
  nextChargeAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** "Trial · 12 days left", "Pro plan", "Plan paused", "Plan ends Nov 8", "Free". */
export function planLabel(plan: PlanSummary | null | undefined, now = Date.now()): string {
  if (!plan) return 'Free';
  const days = Math.max(0, Math.ceil((Date.parse(plan.nextChargeAt) - now) / DAY_MS));
  switch (plan.status) {
    case 'trial':
      return plan.active ? `Trial · ${days} day${days === 1 ? '' : 's'} left` : 'Trial ended';
    case 'active':
      return 'Pro plan';
    case 'past_due':
      return 'Plan paused';
    case 'cancelled':
      return plan.active ? `Plan ends ${shortDate(plan.nextChargeAt)}` : 'Plan ended';
  }
}

