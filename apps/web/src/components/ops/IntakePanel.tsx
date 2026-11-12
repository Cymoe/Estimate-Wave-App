import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, MessageSquare, Phone, X } from 'lucide-react';
import { money } from '../market/wallet';
import { useConfirm } from '../common/ConfirmDialog';
import { intakeAPI, type IntakeFields } from '../../lib/api';
import { COUNTY_CHOICES } from '../../services/counties';
import { Field, ago, input, primary, secondary, tap, usePanel } from './ui';
import { ConfirmChecklist, type ConfirmResult } from './ConfirmChecklist';
import { DISPOSITIONS, reasonLabel } from './intakeReasons';

export interface IntakeRow {
  id: string;
  source: 'meta' | 'call' | 'manual' | 'api' | 'outbound';
  /** The caller who took it, on a Webb Leads call. */
  takenBy?: string;
  status: 'new' | 'working' | 'confirmed' | 'closed';
  disposition?: string;
  /** Confirmed rows only: where the lead went. */
  listed?: { id: string; status: string; companyName?: string; organizationId?: string; priceCents?: number } | null;
  label: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  zip?: string;
  county?: string;
  countyFromCampaign?: string;
  jobType?: string;
  tradeName?: string;
  scope?: string;
  timeline?: string;
  isOwner?: boolean;
  notes?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  consent?: { text?: string; value?: string; at?: string };
  duplicateOf?: string;
  attempts: Array<{ at: string; by: string; outcome: string; note?: string }>;
  lastAttempt: { at: string; outcome: string; note?: string } | null;
  confirmedLeadId?: string;
  isSample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeDetail extends IntakeRow {
  duplicate: { id: string; label: string; status: string; createdAt: string; confirmedLeadId?: string } | null;
  /** After confirming: the Marketplace lead it became, and who bought it. */
  listed?: { id: string; status: string; companyName?: string; organizationId?: string; priceCents?: number } | null;
}

interface Trade {
  id: string;
  name: string;
}

const ATTEMPTS: Array<[string, string]> = [
  ['reached', 'Reached them'],
  ['voicemail', 'Voicemail'],
  ['no_answer', 'No answer'],
  ['texted', 'Texted'],
  ['callback', 'Call back later'],
  ['wrong_number', 'Wrong number'],
];

const SOURCE: Record<IntakeRow['source'], string> = { meta: 'Facebook form', call: 'Called in', manual: 'Typed in', api: 'Webhook', outbound: 'Webb Leads call' };

/** One lead in the queue: call the homeowner, fix what the form got wrong, log what happened. */
export const IntakePanel: React.FC<{
  id: string;
  trades: Trade[];
  onClose: () => void;
  onChanged: () => void;
  onListed: (result: ConfirmResult) => void;
}> = ({ id, trades, onClose, onChanged, onListed }) => {
  const [row, setRow] = useState<IntakeDetail | null>(null);
  const [draft, setDraft] = useState<IntakeFields | null>(null);
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which buttons the error belongs to, so it shows next to them.
  const [errorAt, setErrorAt] = useState<'save' | 'calls' | 'close' | null>(null);
  const [confirmLeave, leaveDialog] = useConfirm();
  // Escape goes through the same check as tapping outside (unsaved edits ask first).
  const closeRequest = useRef<() => void>(onClose);
  const panelRef = usePanel<HTMLElement>(() => closeRequest.current());

  // Reloads the row; the draft follows only when asked, so logging a call never wipes typed edits.
  const load = useCallback(async (resetDraft = true) => {
    const next = (await intakeAPI.get(id)) as IntakeDetail;
    setRow(next);
    if (!resetDraft) return;
    setDraft({
      name: next.name ?? '',
      phone: next.phone ?? '',
      email: next.email ?? '',
      address: next.address ?? '',
      city: next.city ?? '',
      zip: next.zip ?? '',
      county: next.county ?? '',
      jobType: next.jobType ?? '',
      scope: next.scope ?? '',
      timeline: next.timeline ?? '',
      isOwner: next.isOwner,
      notes: next.notes ?? '',
    });
  }, [id]);
  useEffect(() => {
    load().catch((err) => setError(`The lead couldn't be loaded: ${err instanceof Error && err.message ? err.message : 'server error'}`));
  }, [load]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const act = async (fn: () => Promise<unknown>, { keepDraft = false, where = null as 'save' | 'calls' | 'close' | null } = {}) => {
    setBusy(true);
    setError(null);
    setErrorAt(null);
    try {
      await fn();
      await load(!keepDraft);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work');
      setErrorAt(where);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    draft &&
    act(async () => {
      await intakeAPI.update(id, draft);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 1500);
    }, { where: 'save' });
  const logAttempt = (outcome: string) =>
    act(
      async () => {
        await intakeAPI.logAttempt(id, outcome, note || undefined);
        setNote('');
      },
      { keepDraft: true, where: 'calls' },
    );

  if (!row || !draft) {
    // Still loading: nothing yet. Failed: the panel opens anyway, says why, and closes.
    if (!error) return null;
    return createPortal(
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
        <aside role="dialog" aria-modal="true" aria-label="Intake lead" className="fixed right-0 top-0 h-[100dvh] w-full md:w-[520px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col p-6 gap-4">
          <p role="alert" className="text-sm text-red-300 break-words">{error}</p>
          <button type="button" onClick={onClose} className="self-start min-h-[44px] px-4 rounded border border-[#333] text-gray-200 text-sm">
            Close
          </button>
        </aside>
      </>,
      document.body,
    );
  }
  const set = (key: keyof IntakeFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [key]: e.target.value });
  // Typed edits not saved yet: tapping outside the panel asks before throwing them away.
  const dirty = (Object.keys(draft) as Array<keyof IntakeFields>).some((k) => String(draft[k] ?? '') !== String((row as unknown as Record<string, unknown>)[k] ?? ''));
  const closeFromBackdrop = async () => {
    if (dirty) {
      const yes = await confirmLeave({ title: 'Close without saving?', message: 'Your edits to this lead are not saved yet.', confirmLabel: 'Close without saving', cancelLabel: 'Keep editing' });
      if (!yes) return;
    }
    onClose();
  };
  closeRequest.current = closeFromBackdrop;
  const errorLine = (here: 'save' | 'calls' | 'close' | null) =>
    error && errorAt === here ? (
      <p role="alert" className="text-sm text-red-400 mt-2">
        {error}
      </p>
    ) : null;
  // A county the webhook sent that isn't a Texas county still shows, so it isn't silently blank.
  const unknownCounty = draft.county && !COUNTY_CHOICES.includes(draft.county) ? draft.county : null;
  const open = row.status === 'new' || row.status === 'working';
  const tel = row.phone?.replace(/[^\d+]/g, '');

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={closeFromBackdrop} />
      {leaveDialog}
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={row.label} className="fixed right-0 top-0 h-[100dvh] w-full md:w-[520px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col outline-none">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{row.label}</h2>
            <p className="text-xs text-gray-500 truncate">
              {SOURCE[row.source]}
              {row.takenBy ? ` by ${row.takenBy}` : ''} · in {ago(row.createdAt)}
              {row.status === 'closed' ? ` · not a lead: ${reasonLabel(row.disposition)}` : row.status === 'confirmed' ? ' · confirmed' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {tel && (
              <>
                <a href={`tel:${tel}`} aria-label="Call" className={`${tap} text-emerald-300 hover:text-white`}>
                  <Phone className="w-5 h-5" />
                </a>
                <a href={`sms:${tel}`} aria-label="Text" className={`${tap} text-emerald-300 hover:text-white`}>
                  <MessageSquare className="w-5 h-5" />
                </a>
              </>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className={`${tap} -m-3 text-gray-400 hover:text-white`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {row.duplicate && (
            <div className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 rounded p-3 text-sm text-amber-100" data-testid="duplicate-notice">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Same number as <strong>{row.duplicate.label}</strong>, {ago(row.duplicate.createdAt)}
                {row.duplicate.confirmedLeadId ? ', already confirmed and sold' : row.duplicate.status === 'closed' ? ', marked not a lead' : ', still in the queue'}. One lead per homeowner in 45 days.
              </span>
            </div>
          )}
          {/* Which ad brought the lead in: the campaign, ad set and ad as Meta named them. */}
          {row.campaignName && (
            <p className="text-xs text-gray-500 break-words" data-testid="from-ad">
              From the ad: {[row.campaignName, row.adsetName, row.adName].filter(Boolean).join(' › ')}
            </p>
          )}
          {row.countyFromCampaign && row.county && row.countyFromCampaign !== row.county && (
            <p className="text-xs text-amber-200/80">The ad targeted {row.countyFromCampaign} County; the homeowner said {row.county}. The homeowner's answer wins.</p>
          )}
          {row.consent && (
            <p className="text-xs text-gray-500">
              Consent {row.source === 'outbound' ? 'on the call' : 'on the form'}: {row.consent.value ?? 'not recorded'}
              {row.consent.text ? ` (${row.consent.text})` : ''}
            </p>
          )}

          <section>
            <h3 className="text-sm font-medium text-white mb-2">What we have</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input value={draft.name} onChange={set('name')} className={input} disabled={!open} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={draft.phone} onChange={set('phone')} className={input} disabled={!open} />
              </Field>
              <Field label="Trade">
                <select value={draft.jobType} onChange={set('jobType')} className={input} disabled={!open}>
                  <option value="">Choose a trade</option>
                  {trades.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="County">
                <select value={draft.county} onChange={set('county')} className={input} disabled={!open}>
                  <option value="">Choose a county</option>
                  {unknownCounty && <option value={unknownCounty}>{unknownCounty} (not a Texas county)</option>}
                  {COUNTY_CHOICES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="City">
                <input value={draft.city} onChange={set('city')} className={input} disabled={!open} />
              </Field>
              <Field label="ZIP">
                <input value={draft.zip} onChange={set('zip')} className={input} disabled={!open} />
              </Field>
            </div>
            <Field label="Address">
              <input value={draft.address} onChange={set('address')} aria-label="Address" className={input} disabled={!open} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="What kind of work">
                <select value={draft.scope} onChange={set('scope')} className={input} disabled={!open}>
                  <option value="">Not asked</option>
                  <option value="repair">Repair</option>
                  <option value="replacement">Replacement</option>
                  <option value="new">New install</option>
                  <option value="remodel">Remodel</option>
                </select>
              </Field>
              <Field label="When">
                <select value={draft.timeline} onChange={set('timeline')} className={input} disabled={!open}>
                  <option value="">Not asked</option>
                  <option value="asap">As soon as possible</option>
                  <option value="month">Within a month</option>
                  <option value="quarter">In the next few months</option>
                  <option value="planning">Just planning</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
              <input type="checkbox" checked={Boolean(draft.isOwner)} onChange={(e) => setDraft({ ...draft, isOwner: e.target.checked })} disabled={!open} />
              They own the home
            </label>
            <Field label="What they said">
              <textarea value={draft.notes} onChange={set('notes')} rows={3} className={input} disabled={!open} />
            </Field>
            <Field label="Email">
              <input type="email" value={draft.email} onChange={set('email')} className={input} disabled={!open} />
            </Field>
            {open && (
              <span className="inline-flex items-center gap-3">
                <button type="button" onClick={save} disabled={busy} className={secondary}>
                  Save changes
                </button>
                {savedAt && (
                  <span role="status" className="text-xs text-emerald-300">
                    Saved
                  </span>
                )}
              </span>
            )}
            {errorLine('save')}
          </section>

          <section>
            <h3 className="text-sm font-medium text-white mb-2">Calls and texts</h3>
            {row.attempts.length === 0 ? (
              <p className="text-sm text-gray-500 mb-2">Nobody has called yet.</p>
            ) : (
              <ul className="space-y-1 mb-3" aria-label="Attempts">
                {row.attempts.map((a, i) => (
                  <li key={i} className="text-sm text-gray-300">
                    <span className="text-white">{ATTEMPTS.find(([v]) => v === a.outcome)?.[1] ?? a.outcome.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500"> · {ago(a.at)}</span>
                    {a.note ? <span className="block text-xs text-gray-400">{a.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {open && (
              <>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened (optional)" className={`${input} mb-2`} aria-label="Attempt note" />
                <div className="flex flex-wrap gap-2">
                  {ATTEMPTS.map(([value, label]) => (
                    <button key={value} type="button" disabled={busy} onClick={() => logAttempt(value)} className={secondary}>
                      {label}
                    </button>
                  ))}
                </div>
                {errorLine('calls')}
              </>
            )}
          </section>

          {open && <ConfirmChecklist row={row} draft={draft} onListed={onListed} />}
          {row.status === 'confirmed' && row.listed && (
            <p className="text-sm text-emerald-300" data-testid="intake-outcome">
              {row.listed.companyName ? (
                <>
                  Sold to{' '}
                  {row.listed.organizationId ? (
                    <Link to={`/ops?tab=companies&company=${row.listed.organizationId}`} className="underline underline-offset-2">
                      {row.listed.companyName}
                    </Link>
                  ) : (
                    row.listed.companyName
                  )}
                  {row.listed.priceCents ? ` for ${money(row.listed.priceCents)}` : ''}
                </>
              ) : (
                <Link to="/ops?tab=forsale" className="underline underline-offset-2">
                  {row.listed.status === 'older' ? 'In the Vault' : 'For sale'}
                </Link>
              )}
            </p>
          )}

          {open ? (
            <section className="border-t border-[#2A2A2A] pt-5">
              <h3 className="text-sm font-medium text-white mb-2">Not a lead after all?</h3>
              <div className="flex gap-2">
                <select value={closing} onChange={(e) => setClosing(e.target.value)} className={input} aria-label="Reason">
                  <option value="">Choose a reason</option>
                  {DISPOSITIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={busy || !closing} onClick={() => act(() => intakeAPI.close(id, closing, note || undefined), { keepDraft: true, where: 'close' })} className={secondary}>
                  Mark not a lead
                </button>
              </div>
              {errorLine('close')}
            </section>
          ) : row.status === 'closed' ? (
            <button type="button" disabled={busy} onClick={() => act(() => intakeAPI.reopen(id))} className={primary}>
              Put it back in the queue
            </button>
          ) : null}

          {errorLine(null)}
        </div>
      </aside>
    </>,
    document.body,
  );
};
