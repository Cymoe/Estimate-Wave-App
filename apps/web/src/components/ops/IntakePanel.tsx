import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, MessageSquare, Phone, X } from 'lucide-react';
import { intakeAPI, type IntakeFields } from '../../lib/api';
import { COUNTY_CHOICES } from '../../services/counties';
import { Field, ago, input, primary, secondary } from './ui';
import { ConfirmChecklist, type ConfirmResult } from './ConfirmChecklist';

export interface IntakeRow {
  id: string;
  source: 'meta' | 'call' | 'manual' | 'api';
  status: 'new' | 'working' | 'confirmed' | 'closed';
  disposition?: string;
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

const DISPOSITIONS: Array<[string, string]> = [
  ['not_reached', 'Never reached them'],
  ['duplicate', 'Same homeowner as another lead'],
  ['out_of_area', 'Outside the counties we sell'],
  ['renter', 'Renter, not the owner'],
  ['wrong_trade', 'Not work we sell'],
  ['not_interested', 'Not interested any more'],
  ['bad_number', 'Bad number'],
  ['other', 'Something else'],
];

const SOURCE: Record<IntakeRow['source'], string> = { meta: 'Facebook form', call: 'Called in', manual: 'Typed in', api: 'Webhook' };

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
  const act = async (fn: () => Promise<unknown>, { keepDraft = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load(!keepDraft);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work');
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
    });
  const logAttempt = (outcome: string) =>
    act(
      async () => {
        await intakeAPI.logAttempt(id, outcome, note || undefined);
        setNote('');
      },
      { keepDraft: true },
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
  const open = row.status === 'new' || row.status === 'working';
  const tel = row.phone?.replace(/[^\d+]/g, '');

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
      <aside role="dialog" aria-label={row.label} className="fixed right-0 top-0 h-[100dvh] w-full md:w-[520px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{row.label}</h2>
            <p className="text-xs text-gray-500 truncate">
              {SOURCE[row.source]} · in {ago(row.createdAt)}
              {row.campaignName ? ` · ${row.campaignName}` : ''}
              {row.status === 'closed' ? ` · closed: ${row.disposition?.replace(/_/g, ' ')}` : row.status === 'confirmed' ? ' · confirmed' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {tel && (
              <>
                <a href={`tel:${tel}`} aria-label="Call" className="p-2 text-emerald-300 hover:text-white">
                  <Phone className="w-5 h-5" />
                </a>
                <a href={`sms:${tel}`} aria-label="Text" className="p-2 text-emerald-300 hover:text-white">
                  <MessageSquare className="w-5 h-5" />
                </a>
              </>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-white">
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
                {row.duplicate.confirmedLeadId ? ', already confirmed and sold' : row.duplicate.status === 'closed' ? ', closed' : ', still in the queue'}. Angi-style rule: one lead per homeowner in 45 days.
              </span>
            </div>
          )}
          {row.countyFromCampaign && row.county && row.countyFromCampaign !== row.county && (
            <p className="text-xs text-amber-200/80">The ad targeted {row.countyFromCampaign} County; the homeowner said {row.county}. The homeowner's answer wins.</p>
          )}
          {row.consent && (
            <p className="text-xs text-gray-500">
              Consent on the form: {row.consent.value ?? 'not recorded'}
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
              </>
            )}
          </section>

          {open && <ConfirmChecklist row={row} draft={draft} onListed={onListed} />}

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
                <button type="button" disabled={busy || !closing} onClick={() => act(() => intakeAPI.close(id, closing, note || undefined), { keepDraft: true })} className={secondary}>
                  Close
                </button>
              </div>
            </section>
          ) : row.status === 'closed' ? (
            <button type="button" disabled={busy} onClick={() => act(() => intakeAPI.reopen(id))} className={primary}>
              Put it back in the queue
            </button>
          ) : null}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </aside>
    </>,
    document.body,
  );
};
