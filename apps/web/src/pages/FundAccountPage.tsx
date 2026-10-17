import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, CheckCircle2, CreditCard, Lock, ShieldCheck } from 'lucide-react';
import { fundingAPI } from '../lib/api';
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
}

type Step = 'amount' | 'pay' | 'done';

const money = (cents: number, whole = true) =>
  whole ? `$${Math.round(cents / 100).toLocaleString()}` : formatCurrency(cents / 100);

/** Groups card digits in fours as they're typed. */
export const formatCardNumber = (value: string) =>
  value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

/** MM/YY as it's typed. */
export const formatExpiry = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

const field =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900';

/**
 * The page a contractor pays through to load their FieldQuote lead balance
 * (reached from a funding link, no login). Card details stay in this page:
 * only the amount, method and payer's name and email are sent, and the
 * balance loads once FieldQuote confirms the payment.
 */
const FundAccountPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [page, setPage] = useState<FundingPage | null | undefined>(undefined);
  const [step, setStep] = useState<Step>('amount');
  const [amountCents, setAmountCents] = useState(1_000_000);
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<'card' | 'apple_pay'>('card');
  const [card, setCard] = useState({ name: '', email: '', number: '', expiry: '', cvc: '', zip: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fundingAPI
      .get(token)
      .then((result: FundingPage | null) => {
        setPage(result);
        if (result && result.status !== 'open') setStep('done');
      })
      .catch(() => setPage(null));
  }, [token]);

  const bonusCents = bonusFor(amountCents);
  const totalCredit = amountCents + bonusCents;
  const leads = page ? Math.floor(totalCredit / Math.max(page.typicalLeadCents, 1)) : 0;
  const customCents = Math.round(Number(custom.replace(/[$,]/g, '')) * 100);
  const cardReady = useMemo(
    () =>
      card.name.trim() !== '' &&
      /\S+@\S+\.\S+/.test(card.email) &&
      card.number.replace(/\s/g, '').length >= 15 &&
      /^\d{2}\/\d{2}$/.test(card.expiry) &&
      card.cvc.length >= 3 &&
      card.zip.length >= 5,
    [card],
  );

  const pay = async (chosen: 'card' | 'apple_pay') => {
    setSubmitting(true);
    setError(null);
    try {
      // Only what FieldQuote needs to match the payment: never the card itself.
      await fundingAPI.submit(token, {
        amountCents,
        method: chosen,
        payerName: card.name || undefined,
        payerEmail: card.email || undefined,
      });
      setMethod(chosen);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment couldn't be completed. Please try again.");
    } finally {
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
          <p className="text-gray-600">Ask your FieldQuote contact for a new one.</p>
        </div>
      </div>
    );
  }

  const shownAmount = page.amountCents ?? amountCents;
  const shownBonus = page.amountCents !== undefined ? page.bonusCents ?? 0 : bonusCents;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-8">
          <span className="text-lg font-semibold tracking-tight">FieldQuote</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Lock className="w-3.5 h-3.5" /> Secure checkout
          </span>
        </div>

        {step === 'done' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center" data-testid="funding-done">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
            {page.status === 'confirmed' ? (
              <>
                <h1 className="text-2xl font-semibold mb-2">Added to your balance</h1>
                <p className="text-gray-600">
                  {money(shownAmount + shownBonus)} is in {page.companyName}'s lead balance. Log in to FieldQuote to start buying leads.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold mb-2">Payment received</h1>
                <p className="text-gray-600">
                  {money(shownAmount)}
                  {shownBonus > 0 ? ` + ${money(shownBonus)} bonus` : ''} will be added to {page.companyName}'s lead balance shortly.
                  We'll let you know as soon as it's ready.
                </p>
                <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4 text-left text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">Paid</span>
                    <span>{money(shownAmount)}</span>
                  </div>
                  {shownBonus > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">Bonus credit</span>
                      <span className="text-emerald-600">+{money(shownBonus)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 font-medium border-t border-gray-200 mt-1 pt-2">
                    <span>Lead balance</span>
                    <span>{money(shownAmount + shownBonus)}</span>
                  </div>
                  {step === 'done' && page.status === 'open' && (
                    <p className="text-xs text-gray-500 mt-2">Paid with {method === 'apple_pay' ? 'Apple Pay' : 'card'}</p>
                  )}
                </div>
              </>
            )}
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
                              <span className="text-emerald-600 font-medium">+{money(tier.bonusCents)} bonus credit</span>
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
                        const cents = Math.round(Number(e.target.value.replace(/[$,]/g, '')) * 100);
                        if (Number.isFinite(cents)) setAmountCents(cents);
                      }}
                      placeholder={(page.minimumCents / 100).toLocaleString()}
                      aria-label="Other amount"
                      className={`${field} pl-7`}
                    />
                  </span>
                  {custom && customCents < page.minimumCents && (
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
                      <span className="text-gray-500">Bonus credit</span>
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

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => pay('apple_pay')}
                  className="w-full rounded-xl bg-black text-white py-3.5 font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                  aria-label="Pay with Apple Pay"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 -mt-0.5" fill="currentColor" aria-hidden>
                    <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.54 2.66-.39 6.59 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.33-3.52zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21z" />
                  </svg>
                  Pay
                </button>
                <div className="flex items-center gap-3 my-5 text-xs text-gray-400">
                  <span className="flex-1 h-px bg-gray-200" /> or pay with card <span className="flex-1 h-px bg-gray-200" />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (cardReady) pay('card');
                  }}
                  className="space-y-3"
                >
                  <input
                    value={card.name}
                    onChange={(e) => setCard({ ...card, name: e.target.value })}
                    placeholder="Name on card"
                    aria-label="Name on card"
                    autoComplete="cc-name"
                    className={field}
                  />
                  <input
                    type="email"
                    value={card.email}
                    onChange={(e) => setCard({ ...card, email: e.target.value })}
                    placeholder="Email for the receipt"
                    aria-label="Email"
                    autoComplete="email"
                    className={field}
                  />
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      inputMode="numeric"
                      value={card.number}
                      onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                      placeholder="1234 1234 1234 1234"
                      aria-label="Card number"
                      autoComplete="cc-number"
                      className={`${field} pl-10`}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      inputMode="numeric"
                      value={card.expiry}
                      onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                      placeholder="MM/YY"
                      aria-label="Expiry"
                      autoComplete="cc-exp"
                      className={field}
                    />
                    <input
                      inputMode="numeric"
                      value={card.cvc}
                      onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="CVC"
                      aria-label="CVC"
                      autoComplete="cc-csc"
                      className={field}
                    />
                    <input
                      inputMode="numeric"
                      value={card.zip}
                      onChange={(e) => setCard({ ...card, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                      placeholder="ZIP"
                      aria-label="ZIP"
                      autoComplete="postal-code"
                      className={field}
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button
                    type="submit"
                    disabled={!cardReady || submitting}
                    className="w-full rounded-xl bg-gray-900 text-white py-3.5 font-medium disabled:opacity-40"
                  >
                    {submitting ? 'Processing…' : `Pay ${money(amountCents)}`}
                  </button>
                </form>
                <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-4">
                  <ShieldCheck className="w-4 h-4" /> Your balance never expires. Bad leads are credited back.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">Payments aren't processed yet — no card is charged.</p>
      </div>
    </div>
  );
};

export default FundAccountPage;
