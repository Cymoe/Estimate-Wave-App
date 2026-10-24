import React, { useContext, useMemo, useState } from 'react';
import { MapPin, Sparkles } from 'lucide-react';
import { Confirmed } from '../components/market/Confirmed';
import { PermitsNearYou } from '../components/market/PermitsNearYou';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { walletAPI } from '../lib/api';
import { useOlderLeads } from '../lib/live';
import { money } from '../components/market/wallet';
import { notifyWalletChanged } from '../components/market/WalletBar';
import { PlanPanel, type PlanSummary } from '../components/market/plan';
import { InlineNotice, Toast, useToast } from '../components/common/Notice';

/** A lead in the Vault: a week or more old, no price countdown. */
export interface VaultLead {
  id: string;
  jobType?: string;
  tradeName?: string;
  city?: string;
  county?: string;
  summary?: string;
  receivedAt: string;
  ageDays: number;
  matchesTrades: boolean;
  /** When FieldQuote confirmed it with the homeowner, and what they said. */
  verified?: { at: string; note?: string };
}

export interface VaultPool {
  locked: boolean;
  count: number;
  plan: PlanSummary | null;
  leads: VaultLead[];
}

const titleFromSlug = (slug?: string) =>
  slug ? slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'General';

const primary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap';

/**
 * The Vault: Marketplace leads nobody bought in their first week, open to
 * companies on the monthly plan. Claiming is exclusive and first come, with
 * a monthly allowance included and a flat price per claim after that.
 * Without the plan the page shows what's waiting and how to get in.
 */
const VaultPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id || undefined;
  // Live: a lead another company claims leaves the list as it happens.
  const pool = useOlderLeads<VaultPool>(organizationId) ?? null;
  const [mineOnly, setMineOnly] = useState(true);
  // Two views: leads nobody bought, and public permits for work going on nearby.
  const [tab, setTab] = useState<'leads' | 'permits'>('leads');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, show } = useToast();

  const claim = async (lead: VaultLead) => {
    setBusy(true);
    setError(null);
    try {
      await walletAPI.claim(lead.id, organizationId!);
      show('Lead claimed: it’s in your Leads with the homeowner’s details.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work');
    } finally {
      setBusy(false);
      notifyWalletChanged();
    }
  };

  const shown = useMemo(() => {
    const all = pool?.leads ?? [];
    return mineOnly && all.some((l) => l.matchesTrades) ? all.filter((l) => l.matchesTrades) : all;
  }, [pool, mineOnly]);
  const tradeOf = (lead: VaultLead) => lead.tradeName ?? titleFromSlug(lead.jobType);
  const plan = pool?.plan ?? null;
  const price = plan?.nextClaimCents ?? 0;
  const claimButton = (lead: VaultLead) => (
    <button type="button" onClick={() => claim(lead)} disabled={busy} className={primary}>
      {price > 0 ? `Claim · ${money(price)}` : 'Claim · included'}
    </button>
  );

  return (
    <div className="p-4 md:p-6 text-white">
      <div className="mb-2">
        <h1 className="text-xl font-semibold">🔐 The Vault</h1>
        <p className="text-sm text-gray-400">
          {pool === null ? 'Loading…' : `${pool.count} lead${pool.count === 1 ? '' : 's'} in your trades`}
          {plan ? ` · ${plan.claimsLeft} of ${plan.claimsIncluded} claims left this month` : ''}
          {plan && plan.claimsLeft === 0 ? ` · ${money(plan.extraClaimCents)} each after that` : ''}
        </p>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Leads nobody bought in their first week. Still exclusive: the first company to claim one gets it, and the homeowner has heard from nobody else.
      </p>

      {error && (
        <InlineNotice tone="bad" onDismiss={() => setError(null)} className="mb-4">
          {error}
        </InlineNotice>
      )}
      <Toast text={toast} />

      {pool === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : pool.locked ? (
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-white mb-1">Unlock the Vault</h2>
          <p className="text-sm text-gray-400 mb-4">
            {pool.count > 0
              ? `${pool.count} lead${pool.count === 1 ? '' : 's'} in your trades ${pool.count === 1 ? 'is' : 'are'} waiting in the Vault. It's part of the plan.`
              : 'Leads land here a week after going up for sale. The Vault is part of the plan.'}
          </p>
          <PlanPanel organizationId={organizationId} plan={plan} onChanged={() => {}} />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Vault sections" className="flex items-center gap-1 border-b border-[#2A2A2A] mb-4">
            {(['leads', 'permits'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === id ? 'border-[#336699] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
              >
                {id === 'leads' ? 'Older leads' : 'Permits near you'}
              </button>
            ))}
          </div>
          {tab === 'permits' ? (
            <PermitsNearYou organizationId={organizationId!} />
          ) : (
            <>
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
          {shown.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12 border border-[#2A2A2A] rounded">Nothing in the Vault right now. Leads land here a week after going up for sale.</p>
          ) : (
            <>
              <table className="hidden md:table w-full text-sm border border-[#2A2A2A] rounded" data-testid="vault-table">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-[#2A2A2A]">
                    <th className="px-4 py-2 font-medium">Trade</th>
                    <th className="px-4 py-2 font-medium">Where</th>
                    <th className="px-4 py-2 font-medium">Job</th>
                    <th className="px-4 py-2 font-medium">Age</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2A2A]">
                  {shown.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-3 text-white whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {lead.matchesTrades && <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-label="Your trade" />}
                          {tradeOf(lead)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {lead.city || 'Area not given'}
                        {lead.county ? ` · ${lead.county} County` : ''}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {lead.summary || '—'}
                        <Confirmed verified={lead.verified} className="mt-0.5" />
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{lead.ageDays} days</td>
                      <td className="px-4 py-3 text-right">{claimButton(lead)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="md:hidden space-y-3">
                {shown.map((lead) => (
                  <li key={lead.id} className="rounded border border-[#2A2A2A] bg-[#161616] p-4">
                    <p className="text-sm font-medium text-white flex items-center gap-1.5">
                      {lead.matchesTrades && <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-label="Your trade" />}
                      {tradeOf(lead)}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {lead.city || 'Area not given'} · {lead.ageDays} days old
                    </p>
                    {lead.summary && <p className="text-sm text-gray-300 mt-2">{lead.summary}</p>}
                    <Confirmed verified={lead.verified} className="mt-1" />
                    <div className="mt-3">{claimButton(lead)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default VaultPage;
