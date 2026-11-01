import React, { useEffect, useState } from 'react';
import { EstimateService, type Discount, type Estimate } from '../../services/EstimateService';
import { discountAmountOf } from '../../../convex/lib/totals';
import { formatCurrency } from '../../utils/format';

/**
 * A discount on the whole estimate: a dollar amount or a percent, with a
 * label the client sees ("Fall special"). It comes off before tax and can't
 * take the price below red line (the server says how much can come off).
 * Once the contract is signed it stays as signed.
 */
export const DiscountCard: React.FC<{ estimate: Estimate; onSaved: (estimate: Estimate) => void }> = ({ estimate, onSaved }) => {
  const saved = estimate.discount ?? null;
  const [kind, setKind] = useState<Discount['kind']>(saved?.kind ?? 'amount');
  const [value, setValue] = useState(saved ? String(saved.value) : '');
  const [label, setLabel] = useState(saved?.label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the saved discount changes (saved here, or reloaded), the fields show it.
  const savedKind = saved?.kind;
  const savedValue = saved?.value;
  const savedLabel = saved?.label;
  useEffect(() => {
    setKind(savedKind ?? 'amount');
    setValue(savedValue !== undefined ? String(savedValue) : '');
    setLabel(savedLabel ?? '');
  }, [savedKind, savedValue, savedLabel]);

  const locked = Boolean(estimate.contract_locked_at);
  const amount = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(amount) && amount > 0 && (kind === 'amount' || amount <= 100);
  const preview = valid ? discountAmountOf(estimate.subtotal, { kind, value: amount }) : 0;
  const changed = !saved ? valid : saved.kind !== kind || saved.value !== amount || (saved.label ?? '') !== label.trim();

  const save = async (next: Discount | null) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await EstimateService.update(estimate.id!, { discount: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the discount.");
    } finally {
      setBusy(false);
    }
  };

  const field = 'bg-[#121212] border border-[#333] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699] disabled:opacity-50';
  return (
    <div className="bg-[#1a1a1a] border border-[#333] p-4" data-testid="discount">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Discount</h3>
        {(estimate.discount_amount ?? 0) > 0 && <span className="text-sm text-green-400">−{formatCurrency(estimate.discount_amount ?? 0)}</span>}
      </div>
      {locked ? (
        <p className="text-sm text-gray-400">
          {(estimate.discount_amount ?? 0) > 0
            ? `${saved?.label || 'Discount'}: −${formatCurrency(estimate.discount_amount ?? 0)}, as signed.`
            : 'No discount. The contract is signed, so the price stays as signed.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <div role="radiogroup" aria-label="Discount type" className="flex border border-[#333]">
              {(['amount', 'percent'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  disabled={busy}
                  className={`px-3 py-2 text-sm ${kind === k ? 'bg-[#336699] text-white' : 'text-gray-300 hover:bg-[#22272d]'}`}
                >
                  {k === 'amount' ? '$' : '%'}
                </button>
              ))}
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'amount' ? '500' : '10'}
              aria-label="Discount amount"
              disabled={busy}
              className={`${field} w-24`}
            />
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label, e.g. Fall special"
              aria-label="Discount label"
              maxLength={60}
              disabled={busy}
              className={`${field} flex-1 min-w-[140px]`}
            />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => save({ kind, value: amount, ...(label.trim() ? { label: label.trim() } : {}) })}
              disabled={busy || !valid || !changed}
              className="px-4 py-2 text-sm bg-[#336699] text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save discount'}
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={busy}
                className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
            )}
            <span className="text-xs text-gray-500">
              {valid ? `Takes off ${formatCurrency(preview)} before tax.` : kind === 'percent' ? 'A percent from 1 to 100.' : 'A dollar amount.'}
            </span>
          </div>
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </>
      )}
    </div>
  );
};
