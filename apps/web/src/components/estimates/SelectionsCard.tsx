import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { selectionsAPI, type Allowance } from '../../lib/api';
import { formatCurrency } from '../../utils/format';

const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const signed = (n: number) => (Math.abs(n) < 0.005 ? 'right at the allowance' : n > 0 ? `${formatCurrency(n)} over` : `${formatCurrency(-n)} under`);

/** One allowance: what's included, the client's pick, and Approve or Reopen. */
function SelectionRow({ allowance, onChanged }: { allowance: Allowance; onChanged: () => Promise<void> }) {
  const pick = allowance.pick;
  const perUnit = allowance.quantity !== 1;
  const [price, setPrice] = useState(String(pick?.unitPrice ?? allowance.allowanceUnitPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPrice(String(pick?.unitPrice ?? allowance.allowanceUnitPrice)), [pick?.unitPrice, allowance.allowanceUnitPrice]);

  const typed = Number(price.replace(/[$,]/g, ''));
  const valid = price.trim() !== '' && Number.isFinite(typed) && typed >= 0;
  const overdue = !pick && allowance.pickBy !== undefined && allowance.pickBy < todayIso();

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3" data-testid="selection">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-white">{allowance.description}</span>
        <span className="text-xs text-gray-400">
          {formatCurrency(allowance.allowanceTotal)} included
          {perUnit && ` (${allowance.quantity} × ${formatCurrency(allowance.allowanceUnitPrice)})`}
        </span>
      </div>
      {!pick && (
        <p className={`text-xs mt-1 ${overdue ? 'text-red-400' : 'text-gray-500'}`}>
          {allowance.pickBy ? `${overdue ? 'Overdue: was due' : 'Pick by'} ${day(allowance.pickBy)} · ` : ''}Waiting for the client to pick
        </p>
      )}
      {pick && (
        <div className="mt-2 bg-[#121212] border border-[#333] px-3 py-2 text-sm space-y-1">
          <div className="flex flex-wrap items-center gap-x-3">
            <span className="text-white">{pick.name || 'Their pick'}</span>
            <a
              href={pick.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-[#6b9bd1] hover:text-white"
            >
              Open link <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          {pick.unitPrice !== undefined && pick.status === 'picked' && (
            <p className="text-xs text-gray-400">
              They saw {formatCurrency(pick.unitPrice)}
              {perUnit ? ' each' : ''}
              {pick.difference !== undefined && ` · ${signed(pick.difference)}`}
            </p>
          )}
          {pick.note && <p className="text-xs text-gray-400">&ldquo;{pick.note}&rdquo;</p>}
          {pick.status === 'approved' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-green-400">
                Approved at {formatCurrency(pick.approvedUnitPrice ?? 0)}
                {perUnit ? ' each' : ''}
                {pick.difference !== undefined && ` · ${signed(pick.difference)}`}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => selectionsAPI.reopen(pick.id!))}
                className="text-xs text-gray-300 underline underline-offset-2 hover:text-white disabled:opacity-50"
              >
                Reopen
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                {perUnit ? 'Price each' : 'Price'}
                <span className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    aria-label={`Approved price for ${allowance.description}`}
                    className="w-24 pl-5 pr-2 py-1 bg-[#0A0A0A] border border-[#333] text-sm text-white font-mono focus:outline-none focus:border-[#336699]"
                  />
                </span>
              </label>
              <button
                type="button"
                disabled={busy || !valid}
                onClick={() => act(() => selectionsAPI.approve(pick.id!, typed))}
                className="px-3 py-1 text-sm bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Approve'}
              </button>
              {valid && <span className="text-xs text-gray-500">{signed((typed - allowance.allowanceUnitPrice) * allowance.quantity)}</span>}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </li>
  );
}

/**
 * Selections: the estimate's allowance lines (tile, a faucet) the client picks
 * the product for on their link. Approving a pick sets the line to that
 * price; once the estimate is signed, the difference goes on the next change order.
 */
export const SelectionsCard: React.FC<{
  estimateId: string;
  /** Changes when the allowance lines do, so the list reloads. */
  linesKey: string;
  /** The estimate changed here (a line's price): reload it. */
  onEstimateChanged: () => Promise<void>;
}> = ({ estimateId, linesKey, onEstimateChanged }) => {
  const [allowances, setAllowances] = useState<Allowance[] | null>(null);
  const load = useCallback(async () => {
    try {
      setAllowances(await selectionsAPI.forEstimate(estimateId));
    } catch {
      setAllowances(null);
    }
  }, [estimateId]);
  useEffect(() => {
    load();
  }, [load, linesKey]);

  if (!allowances || allowances.length === 0) return null;
  const waiting = allowances.filter((a) => a.pick?.status === 'picked').length;
  return (
    <div className="bg-[#1a1a1a] border border-[#333] p-4" data-testid="selections">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Selections</h3>
        {waiting > 0 && <span className="text-xs text-amber-300">{waiting} to approve</span>}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Your client picks these on their estimate link. Approving sets the line to that price; once the estimate is signed, the difference goes on the
        next change order.
      </p>
      <ul className="divide-y divide-[#333]">
        {allowances.map((allowance) => (
          <SelectionRow
            key={allowance.itemId}
            allowance={allowance}
            onChanged={async () => {
              await Promise.all([load(), onEstimateChanged()]);
            }}
          />
        ))}
      </ul>
    </div>
  );
};
