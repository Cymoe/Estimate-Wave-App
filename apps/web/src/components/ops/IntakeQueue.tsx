import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Facebook, Keyboard, Phone, PhoneCall, Plus, Webhook } from 'lucide-react';
import { intakeAPI, type IntakeFields } from '../../lib/api';
import { COUNTY_CHOICES, countyForTown } from '../../services/counties';
import { Dialog, Field, ago, input, primary, secondary } from './ui';
import { IntakePanel, type IntakeRow } from './IntakePanel';

export interface Trade {
  id: string;
  name: string;
}

export const SOURCE_LABELS: Record<IntakeRow['source'], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  meta: { label: 'Facebook', icon: Facebook },
  call: { label: 'Call', icon: PhoneCall },
  manual: { label: 'Typed in', icon: Keyboard },
  api: { label: 'Webhook', icon: Webhook },
};

export const ATTEMPT_LABELS: Record<string, string> = {
  reached: 'Reached',
  voicemail: 'Voicemail',
  no_answer: 'No answer',
  wrong_number: 'Wrong number',
  callback: 'Call back',
  texted: 'Texted',
  closed: 'Closed',
};

/**
 * Leads on their way in: from Facebook through the webhook, from calls, or
 * typed in. Staff call each homeowner from here; nothing is listed until
 * the call confirms it.
 */
export const IntakeQueue: React.FC<{
  trades: Trade[];
  openNew: boolean;
  onCloseNew: () => void;
  onListed?: (message: string) => void;
}> = ({ trades, openNew, onCloseNew, onListed }) => {
  const [filter, setFilter] = useState<'open' | 'closed' | 'confirmed'>('open');
  const [rows, setRows] = useState<IntakeRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const closeForm = () => {
    setAdding(false);
    onCloseNew();
  };
  const tradeName = (id?: string) => trades.find((t) => t.id === id)?.name ?? id;

  const load = useCallback(async () => setRows(await intakeAPI.queue(filter)), [filter]);
  useEffect(() => {
    load().catch(() => setRows([]));
    const timer = setInterval(() => load().catch(() => {}), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-4" data-testid="intake-queue">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded border border-[#333] overflow-hidden" role="tablist" aria-label="Intake filter">
          {(
            [
              ['open', 'To call'],
              ['closed', 'Closed'],
              ['confirmed', 'Listed'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 text-xs ${filter === value ? 'bg-[#336699] text-white' : 'text-gray-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAdding(true)} className={secondary}>
          <Plus className="w-4 h-4" />
          New lead
        </button>
      </div>

      {rows === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-[#333] rounded p-8 text-center">
          <PhoneCall className="w-8 h-8 mx-auto text-gray-500 mb-2" />
          <p className="text-sm text-gray-400">
            {filter === 'open' ? 'Nobody to call. Leads from the Facebook forms and calls land here.' : filter === 'closed' ? 'Nothing closed yet.' : 'Nothing listed from intake yet.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Intake">
          {rows.map((row) => {
            const Source = SOURCE_LABELS[row.source].icon;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row.id)}
                  className="w-full text-left flex flex-wrap items-center gap-3 px-4 py-3 [@media(hover:hover)]:hover:bg-[#161616]"
                >
                  <span className="flex-1 min-w-[12rem]">
                    <span className="flex items-center gap-2 text-sm text-white">
                      <Source className="w-3.5 h-3.5 text-gray-500" aria-label={SOURCE_LABELS[row.source].label} />
                      {row.label}
                      {row.isSample && <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-[#333] rounded px-1">demo</span>}
                      {row.duplicateOf && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                          <AlertTriangle className="w-3 h-3" /> same number as another lead
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {[tradeName(row.jobType) ?? 'Trade not set', row.county ? `${row.county} County` : 'County not set', row.city].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {row.phone && (
                    <span className="inline-flex items-center gap-1 text-sm text-gray-300">
                      <Phone className="w-3.5 h-3.5" /> {row.phone}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {row.attempts.length > 0 ? `${row.attempts.length} ${row.attempts.length === 1 ? 'try' : 'tries'} · ` : ''}
                    {row.lastAttempt ? `${ATTEMPT_LABELS[row.lastAttempt.outcome] ?? row.lastAttempt.outcome} ${ago(row.lastAttempt.at)}` : `in ${ago(row.createdAt)}`}
                    {row.disposition ? ` · ${row.disposition.replace(/_/g, ' ')}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(openNew || adding) && (
        <IntakeForm
          trades={trades}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            setFilter('open');
            load().catch(() => {});
          }}
        />
      )}
      {selected && (
        <IntakePanel
          id={selected}
          trades={trades}
          onClose={() => setSelected(null)}
          onChanged={() => load().catch(() => {})}
          onListed={(result) => {
            setSelected(null);
            load().catch(() => {});
            onListed?.(
              result.outcome === 'sold'
                ? `Listed and sold to ${result.companyName} for $${((result.priceCents ?? 0) / 100).toFixed(2)}`
                : 'Listed. No funded bid for this county and trade, so it’s in the Marketplace.',
            );
          }}
        />
      )}
    </div>
  );
};

/** A call that came in, or a lead written down: straight into the queue. */
export function IntakeForm({ trades, onClose, onSaved }: { trades: Trade[]; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState<'call' | 'manual'>('call');
  const [draft, setDraft] = useState<Required<Omit<IntakeFields, 'isOwner'>> & { isOwner: boolean }>({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    zip: '',
    county: '',
    jobType: '',
    scope: '',
    timeline: '',
    isOwner: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [key]: e.target.value });
  // The county decides whose bid gets the lead; fill it in from a town we know.
  const setCity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const city = e.target.value;
    const known = countyForTown(city);
    setDraft({ ...draft, city, county: known ?? (countyForTown(draft.city) === draft.county ? '' : draft.county) });
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await intakeAPI.create(source, { ...draft, isOwner: draft.isOwner || undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lead couldn't be saved");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title="New lead" onClose={onClose}>
      <form onSubmit={save}>
        <div className="flex gap-2 mb-3" role="radiogroup" aria-label="How it came in">
          {(
            [
              ['call', 'They called'],
              ['manual', 'Typed in'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={source === value}
              onClick={() => setSource(value)}
              className={`px-3 py-1.5 rounded-full text-xs border ${source === value ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333] text-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Field label="Name">
          <input value={draft.name} onChange={set('name')} className={input} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input type="tel" value={draft.phone} onChange={set('phone')} className={input} />
          </Field>
          <Field label="Trade">
            <select value={draft.jobType} onChange={set('jobType')} className={input}>
              <option value="">Choose a trade</option>
              {trades.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input value={draft.city} onChange={setCity} className={input} />
          </Field>
          <Field label="County">
            <input value={draft.county} onChange={set('county')} list="intake-counties" placeholder="From the city when we know it" className={input} />
            <datalist id="intake-counties">
              {COUNTY_CHOICES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Address">
          <input value={draft.address} onChange={set('address')} className={input} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="What kind of work">
            <select value={draft.scope} onChange={set('scope')} className={input}>
              <option value="">Not asked</option>
              <option value="repair">Repair</option>
              <option value="replacement">Replacement</option>
              <option value="new">New install</option>
              <option value="remodel">Remodel</option>
            </select>
          </Field>
          <Field label="When">
            <select value={draft.timeline} onChange={set('timeline')} className={input}>
              <option value="">Not asked</option>
              <option value="asap">As soon as possible</option>
              <option value="month">Within a month</option>
              <option value="quarter">In the next few months</option>
              <option value="planning">Just planning</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
          <input type="checkbox" checked={draft.isOwner} onChange={(e) => setDraft({ ...draft, isOwner: e.target.checked })} />
          They own the home
        </label>
        <Field label="What they said">
          <textarea value={draft.notes} onChange={set('notes')} rows={3} className={input} />
        </Field>
        <Field label="Email">
          <input type="email" value={draft.email} onChange={set('email')} className={input} />
        </Field>
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <button type="submit" disabled={saving || (!draft.name.trim() && !draft.phone.trim())} className={`${primary} w-full`}>
          {saving ? 'Saving…' : 'Add to the queue'}
        </button>
      </form>
    </Dialog>
  );
}
