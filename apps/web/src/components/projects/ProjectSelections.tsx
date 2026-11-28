import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, Send } from 'lucide-react';
import { selectionsAPI, type Allowance, type EstimateSelections } from '../../lib/api';
import { formatCurrency } from '../../utils/format';

const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const versus = (n: number) => (Math.abs(n) < 0.005 ? 'right at the allowance' : n > 0 ? `${formatCurrency(n)} over` : `${formatCurrency(-n)} under`);
const signedMoney = (n: number) => `${n >= 0 ? '+' : '−'}${formatCurrency(Math.abs(n))}`;
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : "That didn't work.");
const field = 'bg-[#0A0A0A] border border-[#333] px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699]';
const primary = 'px-3 py-1.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50';
const quiet = 'text-sm text-gray-400 hover:text-white disabled:opacity-50';

type Stage = 'not_asked' | 'queued' | 'waiting' | 'ready' | 'approved';
const stageOf = (a: Allowance): Stage =>
  a.pick?.status === 'approved' ? 'approved' : a.pick?.status === 'picked' ? 'ready' : a.pick?.queued ? 'queued' : a.pick ? 'waiting' : 'not_asked';
const isOverdue = (a: Allowance) => {
  const stage = stageOf(a);
  return (stage === 'not_asked' || stage === 'queued' || stage === 'waiting') && a.pickBy !== undefined && a.pickBy < todayIso();
};
/** Still to do on a line: the client picked and it's waiting for approval, or its pick-by date passed. */
const needsYou = (a: Allowance) => stageOf(a) === 'ready' || isOverdue(a);

const PILL: Record<Stage, { label: string; className: string }> = {
  not_asked: { label: 'Not asked', className: 'bg-[#262626] text-gray-300' },
  queued: { label: 'Queued', className: 'bg-[#336699]/25 text-[#9cc2ea]' },
  waiting: { label: 'Waiting on client', className: 'bg-[#262626] text-gray-300' },
  ready: { label: 'Ready to approve', className: 'bg-amber-500/20 text-amber-300' },
  approved: { label: 'Approved', className: 'bg-green-500/15 text-green-400' },
};

/** When the client needs to pick by: a chip that opens a date field. */
function PickBy({ allowance, busy, onSet }: { allowance: Allowance; busy: boolean; onSet: (date: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const overdue = isOverdue(allowance);
  if (editing)
    return (
      <span className="inline-flex items-center gap-2">
        <input
          type="date"
          autoFocus
          defaultValue={allowance.pickBy ?? ''}
          disabled={busy}
          onChange={(e) => {
            if (!e.target.value) return;
            onSet(e.target.value);
            setEditing(false);
          }}
          aria-label={`Pick by for ${allowance.description}`}
          style={{ colorScheme: 'dark' }}
          className={`${field} min-w-[10rem] py-1`}
        />
        {allowance.pickBy && (
          <button
            type="button"
            className={quiet}
            onClick={() => {
              onSet(null);
              setEditing(false);
            }}
          >
            Clear
          </button>
        )}
        <button type="button" className={quiet} onClick={() => setEditing(false)}>
          Done
        </button>
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        overdue ? 'border-red-500/50 text-red-300' : allowance.pickBy ? 'border-[#333] text-gray-300' : 'border-dashed border-[#444] text-gray-500'
      } hover:text-white`}
      data-testid="pick-by"
    >
      <CalendarDays className="w-3.5 h-3.5" />
      {allowance.pickBy ? `${overdue ? 'Overdue: pick by' : 'Pick by'} ${day(allowance.pickBy)}` : 'Add pick-by date'}
    </button>
  );
}

/** One allowance line: what's included, where it stands, and the one thing to do next. */
function SelectionCard({
  estimateId,
  allowance,
  clientFirst,
  onChanged,
}: {
  estimateId: string;
  allowance: Allowance;
  clientFirst: string;
  onChanged: () => Promise<void>;
}) {
  const pick = allowance.pick;
  const stage = stageOf(allowance);
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

  const pill = isOverdue(allowance) && stage !== 'queued' ? { label: 'Overdue', className: 'bg-red-500/15 text-red-300' } : PILL[stage];
  const enterLink = (
    <button type="button" disabled={busy} onClick={() => setEntering(true)} className={quiet}>
      Enter it yourself
    </button>
  );

  return (
    <li className="bg-[#1a1a1a] border border-[#333] p-4 space-y-3" data-testid="selection">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-white">{allowance.description}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatCurrency(allowance.allowanceTotal)} included
            {perUnit && ` · ${allowance.quantity} × ${formatCurrency(allowance.allowanceUnitPrice)}`}
          </p>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.className}`} data-testid="selection-stage">
          {pill.label}
        </span>
      </div>

      {stage !== 'approved' && (
        <PickBy allowance={allowance} busy={busy} onSet={(date) => act(() => selectionsAPI.setPickBy(estimateId, allowance.itemId, date))} />
      )}

      {pick && (stage === 'ready' || stage === 'approved') && (
        <div className="bg-[#121212] border border-[#2a2a2a] px-3 py-2 text-sm space-y-1" data-testid="selection-pick">
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
          {stage === 'ready' && pick.unitPrice !== undefined && (
            <p className="text-xs text-gray-400">
              They saw {formatCurrency(pick.unitPrice)}
              {each}
              {pick.difference !== undefined && ` · ${versus(pick.difference)}`}
            </p>
          )}
          {stage === 'approved' && (
            <p className="text-xs text-green-400">
              {pick.entered ? 'Entered and approved' : 'Approved'} at {formatCurrency(pick.approvedUnitPrice ?? 0)}
              {each}
              {pick.difference !== undefined && ` · ${versus(pick.difference)}`}
            </p>
          )}
          {pick.note && <p className="text-xs text-gray-400">&ldquo;{pick.note}&rdquo;</p>}
        </div>
      )}

      {!entering && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {stage === 'not_asked' && (
            <>
              <button type="button" disabled={busy} onClick={() => act(() => selectionsAPI.ask(estimateId, allowance.itemId))} className={primary}>
                Ask {clientFirst}
              </button>
              {enterLink}
            </>
          )}
          {stage === 'queued' && (
            <>
              <span className="text-sm text-[#9cc2ea]">Goes out when you send</span>
              <button type="button" disabled={busy} onClick={() => act(() => selectionsAPI.unqueue(estimateId, allowance.itemId))} className={quiet}>
                Undo
              </button>
              {enterLink}
            </>
          )}
          {stage === 'waiting' && (
            <>
              <span className="text-sm text-gray-400">
                Sent{pick?.askedAt ? ` ${day(pick.askedAt)}` : ''}: waiting on {clientFirst}
              </span>
              {enterLink}
            </>
          )}
          {stage === 'ready' && (
            <>
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
                onClick={() => act(() => selectionsAPI.approve(pick!.id!, typed!))}
                className={primary}
              >
                {busy ? 'Saving…' : 'Approve'}
              </button>
              {typed !== null && <span className="text-xs text-gray-500">{versus((typed - allowance.allowanceUnitPrice) * allowance.quantity)}</span>}
            </>
          )}
          {stage === 'approved' && (
            <button type="button" disabled={busy} onClick={() => act(() => selectionsAPI.reopen(pick!.id!))} className={quiet}>
              Reopen
            </button>
          )}
        </div>
      )}

      {entering && (
        <form
          className="bg-[#121212] border border-[#2a2a2a] p-3 space-y-2"
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
          <p className="text-xs text-gray-400">What {clientFirst} told you they picked. Saving approves it.</p>
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
            <button type="submit" disabled={busy || entryPrice === null || (!entry.url.trim() && !entry.name.trim())} className={primary}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEntering(false)} className={quiet}>
              Cancel
            </button>
            {entryPrice !== null && (
              <span className="text-xs text-gray-500">{versus((entryPrice - allowance.allowanceUnitPrice) * allowance.quantity)}</span>
            )}
          </div>
        </form>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </li>
  );
}

/** Under an estimate's picks: what they come to, and the change order for them. */
function ChangeOrderLine({ group, clientFirst, onChanged }: { group: EstimateSelections; clientFirst: string; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const approvedChanged = group.allowances.filter((a) => a.pick?.status === 'approved' && Math.abs(a.pick.difference ?? 0) >= 0.005).length;
  const others = Math.max(group.changes - approvedChanged, 0);
  if (group.changes === 0 && !group.changeOrderWaiting) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-[#333] bg-[#151515] px-4 py-3 text-sm" data-testid="change-order-line">
      <span className="flex-1 min-w-[12rem] text-gray-300">
        {approvedChanged > 0 && <>Approved picks: {signedMoney(group.picksDifference)} vs. allowances</>}
        {approvedChanged > 0 && others > 0 && ', plus '}
        {others > 0 && `${others} other change${others === 1 ? '' : 's'} since signing`}
        {group.changes === 0 && group.changeOrderWaiting && `Change order sent: waiting for ${clientFirst}'s signature`}
      </span>
      {group.changes > 0 &&
        (group.changeOrderQueued ? (
          <>
            <span className="text-[#9cc2ea]">Change order queued</span>
            <button type="button" disabled={busy} onClick={() => act(() => selectionsAPI.unqueueChangeOrder(group.estimateId))} className={quiet}>
              Undo
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => act(() => selectionsAPI.queueChangeOrder(group.estimateId))} className={primary}>
            Add change order to next send
          </button>
        ))}
      {error && <p className="basis-full text-xs text-red-400">{error}</p>}
    </div>
  );
}

/**
 * Selections: the allowance lines of the project's signed estimates (tile, a
 * faucet). Ask the client (it waits for the next send from the client's
 * portal) or enter what they told you; approve their picks; then queue the
 * change order and send it all at once.
 */
export const ProjectSelections: React.FC<{
  projectId: string;
  /** A line's price changed: read the estimates again. */
  onEstimatesChanged: () => void;
  /** How many need the company: picks to approve and overdue ones. */
  onCount?: (count: number) => void;
  /** Whose portal this goes to, for the wording. */
  portalClientName?: string;
  /** Something was queued or taken off: the send counts change. */
  onQueueChanged?: () => void;
  /** Opens the client's portal, where queued things are sent. */
  onPreview?: () => void;
}> = ({ projectId, onEstimatesChanged, onCount, portalClientName, onQueueChanged, onPreview }) => {
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

  const clientFirst = portalClientName?.trim().split(/\s+/)[0] || 'the client';
  const changed = async () => {
    await load();
    onEstimatesChanged();
    onQueueChanged?.();
  };

  if (error) return <p className="text-sm text-red-400">Selections couldn&rsquo;t load. Try again in a moment.</p>;
  if (groups === null) return <p className="text-sm text-gray-500">Loading…</p>;
  if (groups.length === 0)
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        Nothing to pick yet. Tick &ldquo;Allowance&rdquo; on an estimate line (tile, a faucet); once the client signs, it shows here.
      </p>
    );

  const queued = groups.reduce((n, g) => n + g.allowances.filter((a) => a.pick?.queued).length + (g.changeOrderQueued ? 1 : 0), 0);
  return (
    <div className="space-y-6 pb-20" data-testid="project-selections">
      {groups.map((group) => (
        <section key={group.estimateId} aria-label={`Selections for ${group.estimateNumber}`} className="space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-gray-500">
            {group.estimateNumber}
            {group.title && <span className="normal-case tracking-normal"> · {group.title}</span>}
          </h3>
          <ul className="space-y-3">
            {group.allowances.map((allowance) => (
              <SelectionCard
                key={allowance.itemId}
                estimateId={group.estimateId}
                allowance={allowance}
                clientFirst={clientFirst}
                onChanged={changed}
              />
            ))}
          </ul>
          <ChangeOrderLine group={group} clientFirst={clientFirst} onChanged={changed} />
        </section>
      ))}

      {queued > 0 && (
        <div
          className="sticky bottom-0 -mx-4 border-t border-[#333] bg-[#1a1a1a]/95 backdrop-blur px-4 py-3 flex items-center gap-3"
          data-testid="send-bar"
        >
          <span className="flex-1 text-sm text-gray-200">
            {queued} thing{queued === 1 ? '' : 's'} ready for {clientFirst}
          </span>
          <button type="button" onClick={onPreview} disabled={!onPreview} className={`${primary} inline-flex items-center gap-1.5`}>
            <Send className="w-4 h-4" />
            Open portal &amp; send
          </button>
        </div>
      )}
    </div>
  );
};
