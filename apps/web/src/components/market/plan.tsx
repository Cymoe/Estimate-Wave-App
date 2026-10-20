import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { walletAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { money, planLabel, shortDate, type PlanSummary } from './wallet';
import { WALLET_CHANGED, notifyWalletChanged, openFundingPage } from './WalletBar';
import { InlineNotice, Toast, useToast } from '../common/Notice';

export { planLabel, type PlanSummary };

/**
 * The company's plan. With `ensure`, a company that has none gets its trial
 * started (used by the pages the plan covers). It follows the company, not
 * the viewer: an admin looking at a company off the plan sees it locked too.
 */
export function usePlan(organizationId?: string, { ensure = false }: { ensure?: boolean } = {}) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanSummary | null | undefined>(undefined);
  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setPlan(ensure ? await walletAPI.ensurePlan(organizationId) : ((await walletAPI.get(organizationId)).plan ?? null));
    } catch {
      setPlan(null);
    }
  }, [organizationId, ensure]);
  useEffect(() => {
    setPlan(undefined);
    load();
  }, [load]);
  useEffect(() => {
    window.addEventListener(WALLET_CHANGED, load);
    return () => window.removeEventListener(WALLET_CHANGED, load);
  }, [load]);
  const superAdmin = user?.role === 'super_admin';
  return { plan: plan ?? null, loading: plan === undefined && Boolean(organizationId), active: Boolean(plan?.active), superAdmin };
}

const primary = 'inline-flex items-center justify-center px-4 py-2.5 rounded bg-[#336699] text-white text-sm font-medium disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center px-4 py-2.5 rounded border border-[#333] text-gray-200 text-sm disabled:opacity-50';

/**
 * What the plan is, what it costs and where this company stands, with the
 * buttons to start or stop it. The fee comes out of the lead balance, so
 * starting fails (with an Add funds button) when the balance can't cover it.
 */
export const PlanPanel: React.FC<{ organizationId?: string; plan: PlanSummary | null; onChanged?: () => void }> = ({ organizationId, plan, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; short?: boolean } | null>(null);
  const { toast, show } = useToast();
  const monthly = plan?.monthlyCents ?? 9900;
  const included = plan?.claimsIncluded ?? 10;
  const extra = plan?.extraClaimCents ?? 1500;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      show(done);
      notifyWalletChanged();
      onChanged?.();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'That didn’t work';
      setMessage({ text, short: /balance too low/i.test(text) });
    } finally {
      setBusy(false);
    }
  };
  const start = () => organizationId && run(() => walletAPI.startPlan(organizationId), `You're on the plan. ${money(monthly)} came off your lead balance.`);
  const cancel = () => organizationId && run(() => walletAPI.cancelPlan(organizationId), 'Plan cancelled. Everything stays open to the end of the month you paid for.');
  const addFunds = () => organizationId && openFundingPage(organizationId).catch(() => {});

  const heading = !plan
    ? 'The FieldQuote plan'
    : plan.status === 'trial'
      ? plan.active
        ? `You're on the free trial · ${planLabel(plan).replace('Trial · ', '')}`
        : 'Your trial has ended'
      : plan.status === 'active'
        ? "You're on the plan"
        : plan.status === 'past_due'
          ? 'Your plan is paused'
          : plan.active
            ? planLabel(plan)
            : 'Your plan has ended';
  const standing =
    plan?.status === 'active'
      ? `Next ${money(monthly)} comes off your lead balance on ${shortDate(plan.nextChargeAt)}. ${plan.claimsLeft} of ${included} Vault claims left this month.`
      : plan?.status === 'past_due'
        ? `Your lead balance couldn't cover ${money(monthly)}. Add funds and the plan picks back up on its own.`
        : plan?.status === 'cancelled' && plan.active
          ? `Paid through ${shortDate(plan.nextChargeAt)}. Start it again any time.`
          : null;

  return (
    <section className="rounded border border-[#2A2A2A] bg-[#161616] p-5 text-sm" data-testid="plan-panel">
      <h2 className="text-lg font-semibold text-white">{heading}</h2>
      {standing && <p className="mt-1 text-gray-400">{standing}</p>}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 text-gray-200">
        <li className="rounded border border-[#2A2A2A] px-3 py-2">📝 Estimates</li>
        <li className="rounded border border-[#2A2A2A] px-3 py-2">📒 Price Book</li>
        <li className="rounded border border-[#2A2A2A] px-3 py-2">🏗 Projects</li>
        <li className="rounded border border-[#2A2A2A] px-3 py-2">
          🔐 The Vault · {included} claims a month, then {money(extra)} each
        </li>
      </ul>
      <p className="mt-4 text-white">
        <span className="text-2xl font-semibold">{money(monthly)}</span> a month, from your lead balance. No card, no contract.
      </p>
      {message && (
        <InlineNotice tone="bad" onDismiss={() => setMessage(null)} className="mt-3">
          {message.text}
        </InlineNotice>
      )}
      <Toast text={toast} />
      <div className="mt-4 flex flex-wrap gap-2">
        {plan?.status === 'active' ? (
          <button type="button" onClick={cancel} disabled={busy} className={secondary}>
            Cancel plan
          </button>
        ) : (
          <button type="button" onClick={start} disabled={busy || !organizationId} className={primary}>
            {plan?.status === 'past_due' ? 'Pay and resume' : plan?.active ? 'Start the plan now' : 'Start the plan'}
          </button>
        )}
        {(message?.short || plan?.status === 'past_due') && (
          <button type="button" onClick={addFunds} className={secondary}>
            Add funds
          </button>
        )}
        <Link to="/vault" className="inline-flex items-center px-2 py-2.5 text-[#9cc3ea] underline underline-offset-2">
          See the Vault
        </Link>
      </div>
    </section>
  );
};

/**
 * Wraps a page the plan covers: shows it while the company's trial or plan
 * is on, else the plan panel in its place. Opening a covered page for the
 * first time starts the 30-day trial.
 */
export const PlanGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id || undefined;
  const { plan, active, loading } = usePlan(organizationId, { ensure: true });
  if (active) return <>{children}</>;
  if (loading || !organizationId) return null;
  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <PlanPanel organizationId={organizationId} plan={plan} />
    </div>
  );
};
