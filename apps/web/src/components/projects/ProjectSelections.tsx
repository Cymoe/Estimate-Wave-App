import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { selectionsAPI, type Allowance, type EstimateSelections } from '../../lib/api';
import type { Estimate } from '../../services/EstimateService';
import { changesSinceSigned } from '../../services/contract';
import { formatCurrency } from '../../utils/format';
import { SignoffControls } from '../estimates/SignoffControls';

const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const versus = (n: number) => (Math.abs(n) < 0.005 ? 'right at the allowance' : n > 0 ? `${formatCurrency(n)} over` : `${formatCurrency(-n)} under`);
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : "That didn't work.");
const field = 'bg-[#0A0A0A] border border-[#333] px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699]';

/** Still to do on a line: the client picked and it's waiting for approval, or its pick-by date passed. */
const needsYou = (a: Allowance) => a.pick?.status === 'picked' || (a.pick?.status !== 'approved' && a.pickBy !== undefined && a.pickBy < todayIso());

/** One allowance line: what's included, when to pick by, the pick, and what to do next. */
function SelectionRow({
  estimateId,
  allowance,
  onAsk,
  onChanged,
}: {
  estimateId: string;
  allowance: Allowance;
  onAsk?: (allowance: Allowance) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const pick = allowance.pick;
  const perUnit = allowance.quantity !== 1;
  const each = perUnit ? ' each' : '';
  const [price, setPrice] = useState(String(pick?.unitPrice ?? allowance.allowanceUnitPrice));
  useEffect(() => setPrice(String(pick?.unitPrice ?? allowance.allowanceUnitPrice)), [pick?.unitPrice, allowance.allowanceUnitPrice]);
  const [entering, setEntering] = useState(false);
  const [entry, setEntry] = useState({ url: '', name: '', price: String(allowance.allowanceUnitPrice), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parse = (text: string) => {
    const n = Number(text.replace(/[$,]/g, ''));
    return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const typed = parse(price);
  const entryPrice = parse(entry.price);
  const overdue = pick?.status !== 'approved' && pick?.status !== 'picked' && allowance.pickBy !== undefined && allowance.pickBy < todayIso();

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const status =
    pick?.status === 'approved'
      ? null
      : pick?.status === 'picked'
        ? 'The client picked: waiting for you'
        : pick?.status === 'asked'
          ? `Asked ${pick.askedAt ? day(pick.askedAt) : ''}: waiting for the client`
          : 'Not asked yet';

  return (
    <li className="py-3" data-testid="selection">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-white">{allowance.description}</span>
        <span className="text-xs text-gray-400">
          {formatCurrency(allowance.allowanceTotal)} included
          {perUnit && ` (${allowance.quantity} × ${formatCurrency(allowance.allowanceUnitPrice)})`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
        {pick?.status !== 'approved' && (
          <label className={`flex items-center gap-1.5 ${overdue ? 'text-red-400' : 'text-gray-400'}`}>
            {overdue ? 'Overdue: pick by' : 'Pick by'}
            <input
              type="date"
              value={allowance.pickBy ?? ''}
              disabled={busy}
              onChange={(e) => act(() => selectionsAPI.setPickBy(estimateId, allowance.itemId, e.target.value || null))}
              aria-label={`Pick by for ${allowance.description}`}
              className="bg-[#0A0A0A] border border-[#333] px-1.5 py-0.5 text-xs text-white"
            />
          </label>
        )}
        {status && <span className={pick?.status === 'picked' ? 'text-amber-300' : 'text-gray-500'}>{status}</span>}
      </div>

      {pick && pick.status !== 'asked' && (
        <div className="mt-2 bg-[#121212] border border-[#333] px-3 py-2 text-sm space-y-1" data-testid="selection-pick">
          <div className="flex flex-wrap items-center gap-x-3">
            <span className="text-white">{pick.name || 'Their pick'}</span>
            {pick.url && (
              <a
                href={pick.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-[#6b9bd1] hover:text-white"
              >
                Open link <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          {pick.unitPrice !== undefined && pick.status === 'picked' && (
            <p className="text-xs text-gray-400">
              They saw {formatCurrency(pick.unitPrice)}
              {each}
              {pick.difference !== undefined && ` · ${versus(pick.difference)}`}
            </p>
          )}
          {pick.note && <p className="text-xs text-gray-400">&ldquo;{pick.note}&rdquo;</p>}
          {pick.status === 'approved' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-green-400">
                {pick.entered ? 'Entered and approved' : 'Approved'} at {formatCurrency(pick.approvedUnitPrice ?? 0)}
                {each}
                {pick.difference !== undefined && ` · ${versus(pick.difference)}`}
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
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-label={`Approved price for ${allowance.description}`}
                  className={`${field} w-24 font-mono`}
                />
              </label>
              <button
                type="button"
                disabled={busy || typed === null}
                onClick={() => act(() => selectionsAPI.approve(pick.id!, typed!))}
                className="px-3 py-1 text-sm bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Approve'}
              </button>
              {typed !== null && <span className="text-xs text-gray-500">{versus((typed - allowance.allowanceUnitPrice) * allowance.quantity)}</span>}
            </div>
          )}
        </div>
      )}

      {pick?.status !== 'approved' && !entering && (
        <div className="flex flex-wrap gap-3 mt-2 text-sm">
          {onAsk && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => onAsk(allowance))}
              className="text-[#6b9bd1] hover:text-white disabled:opacity-50"
            >
              {pick?.status === 'asked' ? 'Ask again' : 'Ask the client'}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => setEntering(true)} className="text-gray-300 hover:text-white disabled:opacity-50">
            Enter it yourself
          </button>
        </div>
      )}

      {entering && (
        <form
          className="mt-2 bg-[#121212] border border-[#333] p-3 space-y-2"
          data-testid="enter-pick"
          onSubmit={async (e) => {
            e.preventDefault();
            if (entryPrice === null) return;
            const saved = await act(() =>
              selectionsAPI.record(estimateId, allowance.itemId, {
                url: entry.url.trim() || undefined,
                name: entry.name.trim() || undefined,
                unitPrice: entryPrice,
                note: entry.note.trim() || undefined,
              }),
            );
            if (saved) setEntering(false);
          }}
        >
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            value={entry.url}
            onChange={(e) => setEntry({ ...entry, url: e.target.value })}
            placeholder="Link to the product (optional)"
            aria-label="Link"
            className={`${field} w-full`}
          />
          <input
            type="text"
            value={entry.name}
            maxLength={200}
            onChange={(e) => setEntry({ ...entry, name: e.target.value })}
            placeholder="What they picked, e.g. Delta Trinsic, matte black"
            aria-label="What they picked"
            className={`${field} w-full`}
          />
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              {perUnit ? 'Price each' : 'Price'}
              <input
                type="text"
                inputMode="decimal"
                value={entry.price}
                onChange={(e) => setEntry({ ...entry, price: e.target.value })}
                aria-label="Price"
                className={`${field} w-24 font-mono`}
              />
            </label>
            <input
              type="text"
              value={entry.note}
              maxLength={500}
              onChange={(e) => setEntry({ ...entry, note: e.target.value })}
              placeholder="Note (optional)"
              aria-label="Note"
              className={`${field} flex-1 min-w-[8rem]`}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || entryPrice === null || (!entry.url.trim() && !entry.name.trim())}
              className="px-3 py-1 text-sm bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEntering(false)} className="text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
            {entryPrice !== null && (
              <span className="text-xs text-gray-500">{versus((entryPrice - allowance.allowanceUnitPrice) * allowance.quantity)}</span>
            )}
          </div>
        </form>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </li>
  );
}

/**
 * Selections: the allowance lines of the project's signed estimates (tile, a
 * faucet). The client picks (or the company enters it); approving sets the
 * line to that price, and the differences go to the client as one change order.
 */
export const ProjectSelections: React.FC<{
  projectId: string;
  /** The project's estimates, for what changed since the client signed. */
  estimates: Estimate[];
  /** A line's price changed: read the estimates again. */
  onEstimatesChanged: () => void;
  /** How many need the company: picks to approve and overdue ones. */
  onCount?: (count: number) => void;
  /** Asks the client for one pick (shares their portal link). */
  onAsk?: (estimateId: string, allowance: Allowance) => Promise<void>;
}> = ({ projectId, estimates, onEstimatesChanged, onCount, onAsk }) => {
  const [groups, setGroups] = useState<EstimateSelections[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const rows = await selectionsAPI.forProject(projectId);
      setGroups(rows);
      setError(false);
      onCount?.(rows.reduce((n, g) => n + g.allowances.filter(needsYou).length, 0));
    } catch {
      setError(true);
    }
  }, [projectId, onCount]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-red-400">Selections couldn&rsquo;t load. Try again in a moment.</p>;
  if (groups === null) return <p className="text-sm text-gray-500">Loading…</p>;
  if (groups.length === 0)
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        Nothing to pick yet. Tick &ldquo;Allowance&rdquo; on an estimate line (tile, a faucet); once the client signs, it shows here.
      </p>
    );

  return (
    <div className="space-y-4" data-testid="project-selections">
      <p className="text-xs text-gray-500">
        Ask the client to pick, or enter what they told you. Approving sets the line to that price; then send the differences for one signature.
      </p>
      {groups.map((group) => {
        const estimate = estimates.find((e) => e.id === group.estimateId);
        const changes = estimate ? (changesSinceSigned(estimate)?.changes.length ?? 0) : 0;
        return (
          <section key={group.estimateId} className="bg-[#1a1a1a] border border-[#333]" aria-label={`Selections for ${group.estimateNumber}`}>
            <h3 className="px-4 pt-3 text-sm font-medium text-gray-400">
              {group.estimateNumber}
              {group.title && <span className="text-gray-500"> · {group.title}</span>}
            </h3>
            <ul className="px-4 divide-y divide-[#333]">
              {group.allowances.map((allowance) => (
                <SelectionRow
                  key={allowance.itemId}
                  estimateId={group.estimateId}
                  allowance={allowance}
                  onAsk={onAsk ? (a) => onAsk(group.estimateId, a) : undefined}
                  onChanged={async () => {
                    await load();
                    onEstimatesChanged();
                  }}
                />
              ))}
            </ul>
            <div className="px-4 pt-2 text-xs text-gray-400">
              {changes > 0
                ? `${changes} change${changes === 1 ? '' : 's'} since the client last signed. Send them for one signature.`
                : 'Nothing has changed since the client last signed.'}
            </div>
            <SignoffControls
              estimateId={group.estimateId}
              kind="change_order"
              clientName={estimate?.client?.name}
              clientLanguage={estimate?.client?.language}
              disabledReason={changes > 0 ? undefined : 'Nothing to send yet'}
            />
          </section>
        );
      })}
    </div>
  );
};
