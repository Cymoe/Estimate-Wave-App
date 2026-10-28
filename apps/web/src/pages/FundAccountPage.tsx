import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { LegalLinks } from './Legal';
import { Check, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { fundingAPI } from '../lib/api';
import { useFundingPage } from '../lib/live';
import { formatCurrency } from '../utils/format';
import { bonusFor } from '../../convex/lib/funding';

interface FundingPage {
  companyName: string;
  status: 'open' | 'submitted' | 'confirmed' | 'cancelled';
  amountCents?: number;
  bonusCents?: number;
  minimumCents: number;
  tiers: Array<{ amountCents: number; bonusPercent: number; bonusCents: number; popular?: boolean }>;
  typicalLeadCents: number;
  paid: boolean;
  /** No Stripe key on the deployment and a sample company: Pay loads play money on the spot. */
  playMoney: boolean;
  /** Stripe isn't connected yet, so nothing can be paid. */
  paymentsOff?: boolean;
}

type Step = 'amount' | 'pay';

const money = (cents: number, whole = true) =>
  whole ? `$${Math.round(cents / 100).toLocaleString()}` : formatCurrency(cents / 100);

const field =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900';

/**
 * The page a contractor pays through to load their Tolliver lead balance
 * (reached from a funding link, no login). They pick an amount here and pay
 * on Stripe's page; when Stripe says it cleared, the balance loads and this
 * page says so on its own.
 */
const FundAccountPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  // Stripe sends the payer back here with ?paid=1 or ?cancelled=1.
  const backFromStripe = params.get('paid') === '1';
  const cancelledOnStripe = params.get('cancelled') === '1';
  const page = useFundingPage<FundingPage | null>(token);
  const [step, setStep] = useState<Step>('amount');
  const [amountCents, setAmountCents] = useState(1_000_000);
  const [custom, setCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A link that already carries an amount (picked before, or paid) starts from it.
  const pickedCents = page?.amountCents;
  useEffect(() => {
    if (pickedCents) setAmountCents(pickedCents);
  }, [pickedCents]);

  const bonusCents = bonusFor(amountCents);
  const totalCredit = amountCents + bonusCents;
  const leads = page ? Math.floor(totalCredit / Math.max(page.typicalLeadCents, 1)) : 0;
  const customCents = Math.round(Number(custom.replace(/[$,]/g, '')) * 100);

  const pay = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { url } = await fundingAPI.checkout(token, amountCents);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment page couldn't be opened. Please try again.");
      setSubmitting(false);
    }
  };

  if (page === undefined) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading…</div>;
  }
  if (page === null || page.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">This payment link isn't valid</h1>
          <p className="text-gray-600">Ask your Tolliver contact for a new one.</p>
        </div>
      </div>
    );
  }

  const paid = page.status === 'confirmed';
  // Back from Stripe before its webhook has landed: a few seconds, usually.
  const waiting = backFromStripe && !paid;
  const shownAmount = page.amountCents ?? amountCents;
  const shownBonus = page.amountCents !== undefined ? page.bonusCents ?? 0 : bonusCents;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-8">
          <span className="text-lg font-semibold tracking-tight">Tolliver</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Lock className="w-3.5 h-3.5" /> Secure checkout
          </span>
        </div>

        {paid || waiting ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center" data-testid="funding-done" data-paid={paid ? 'true' : 'false'}>
            <CheckCircle2 className={`w-14 h-14 mx-auto mb-4 ${paid ? 'text-emerald-500' : 'text-gray-300'}`} />
            {paid ? (
              <>
                <h1 className="text-2xl font-semibold mb-2">Added to your balance</h1>
                <p className="text-gray-600">
                  {money(shownAmount + shownBonus)} is in {page.companyName}'s lead balance. Set your bids and new leads in your county come straight to you.
                </p>
                <a href="/bids" className="mt-5 inline-flex items-center justify-center rounded-xl bg-gray-900 text-white px-5 py-3 font-medium">
                  Set your bids →
                </a>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold mb-2">Payment received</h1>
                <p className="text-gray-600">
                  We're adding {money(shownAmount)}
                  {shownBonus > 0 ? ` + ${money(shownBonus)} bonus` : ''} to {page.companyName}'s lead balance now. This page updates on its own.
                </p>
              </>
            )}
            <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4 text-left text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Paid</span>
                <span>{money(shownAmount)}</span>
              </div>
              {shownBonus > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Bonus</span>
                  <span className="text-emerald-600">+{money(shownBonus)}</span>
                </div>
              )}
              <div className="flex justify-between py-1 font-medium border-t border-gray-200 mt-1 pt-2">
                <span>Added to balance</span>
                <span>{money(shownAmount + shownBonus)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <p className="text-sm text-gray-500">Lead balance for</p>
              <h1 className="text-2xl font-semibold">{page.companyName}</h1>
              <ol className="flex gap-2 mt-4 text-xs" aria-label="Steps">
                {(['amount', 'pay'] as Step[]).map((s, i) => (
                  <li
                    key={s}
                    className={`flex-1 h-1 rounded-full ${step === s || (s === 'amount' && step === 'pay') ? 'bg-gray-900' : 'bg-gray-200'}`}
                    aria-current={step === s ? 'step' : undefined}
                    aria-label={i === 0 ? 'Choose amount' : 'Pay'}
                  />
                ))}
              </ol>
            </div>

            {step === 'amount' ? (
              <div className="p-6">
                {cancelledOnStripe && (
                  <p role="status" className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
                    No charge was made. Pick an amount to try again.
                  </p>
                )}
                <h2 className="text-base font-medium mb-1">Choose how much to load</h2>
                <p className="text-sm text-gray-500 mb-4">Your balance pays for each lead you buy. It never expires.</p>
                <div className="space-y-3" role="radiogroup" aria-label="Amount">
                  {page.tiers.map((tier) => {
                    const selected = !custom && amountCents === tier.amountCents;
                    return (
                      <button
                        key={tier.amountCents}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setCustom('');
                          setAmountCents(tier.amountCents);
                        }}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-colors ${
                          selected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span>
                          <span className="flex items-center gap-2">
                            <span className="text-xl font-semibold">{money(tier.amountCents)}</span>
                            {tier.popular && (
                              <span className="text-[11px] font-medium uppercase tracking-wide bg-gray-900 text-white rounded-full px-2 py-0.5">
                                Most popular
                              </span>
                            )}
                          </span>
                          <span className="block text-sm text-gray-500">
                            {tier.bonusCents > 0 ? (
                              <span className="text-emerald-600 font-medium">+{money(tier.bonusCents)} bonus</span>
                            ) : (
                              'Starter'
                            )}
                            {' · '}≈ {Math.floor((tier.amountCents + tier.bonusCents) / Math.max(page.typicalLeadCents, 1))} leads
                          </span>
                        </span>
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}
                        >
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label className="block mt-4">
                  <span className="block text-sm text-gray-600 mb-1">Or another amount</span>
                  <span className="relative block">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      inputMode="decimal"
                      value={custom}
                      onChange={(e) => {
                        setCustom(e.target.value);
                        // Anything that isn't a number means no amount yet, so Continue stays off.
                        const cents = Math.round(Number(e.target.value.replace(/[$,]/g, '')) * 100);
                        setAmountCents(e.target.value.trim() && Number.isFinite(cents) ? cents : 0);
                      }}
                      placeholder={(page.minimumCents / 100).toLocaleString()}
                      aria-label="Other amount"
                      className={`${field} pl-7`}
                    />
                  </span>
                  {custom && !Number.isFinite(customCents) && (
                    <span className="block text-sm text-red-600 mt-1">Enter an amount in dollars, like 7500.</span>
                  )}
                  {custom && Number.isFinite(customCents) && customCents < page.minimumCents && (
                    <span className="block text-sm text-red-600 mt-1">The minimum is {money(page.minimumCents)}.</span>
                  )}
                </label>
                <button
                  type="button"
                  disabled={amountCents < page.minimumCents || !Number.isFinite(amountCents)}
                  onClick={() => setStep('pay')}
                  className="mt-6 w-full rounded-xl bg-gray-900 text-white py-3.5 font-medium disabled:opacity-40"
                >
                  Continue · {money(amountCents)}
                </button>
              </div>
            ) : (
              <div className="p-6">
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm mb-5">
                  <div className="flex justify-between py-0.5">
                    <span className="text-gray-500">Amount</span>
                    <span>{money(amountCents)}</span>
                  </div>
                  {bonusCents > 0 && (
                    <div className="flex justify-between py-0.5">
                      <span className="text-gray-500">Bonus</span>
                      <span className="text-emerald-600">+{money(bonusCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 mt-1 border-t border-gray-200 font-medium">
                    <span>Lead balance</span>
                    <span>{money(totalCredit)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">About {leads} leads</p>
                  <button type="button" onClick={() => setStep('amount')} className="text-xs text-gray-600 underline mt-2">
                    Change amount
                  </button>
                </div>

                {page.paymentsOff ? (
                  <p role="note" className="text-center text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3" data-testid="payments-off">
                    Online payments aren&rsquo;t set up yet. Tolliver can add funds to your account for you: reply to your lead alert or email support.
                  </p>
                ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={pay}
                  className="w-full rounded-xl bg-gray-900 text-white py-3.5 font-medium disabled:opacity-50"
                >
                  {submitting
                    ? page.playMoney ? 'Adding…' : 'Opening secure checkout…'
                    : page.playMoney ? `Add ${money(amountCents)} in play money` : `Pay ${money(amountCents)}`}
                </button>
                )}
                {page.paymentsOff ? null : page.playMoney ? (
                  <p role="note" className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                    Test mode: no card is charged. Real payments switch on once Stripe is connected to the deployment.
                  </p>
                ) : (
                  <p className="text-center text-xs text-gray-500 mt-3">You'll finish on Stripe's secure page: card, Apple Pay or Google Pay.</p>
                )}
                {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
                <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-5">
                  <ShieldCheck className="w-4 h-4" /> Your balance never expires. A bad lead reported within 3 days is credited back.
                </p>
              </div>
            )}
          </div>
        )}
        <LegalLinks className="text-xs text-gray-400 mt-6" />
      </div>
    </div>
  );
};

export default FundAccountPage;
