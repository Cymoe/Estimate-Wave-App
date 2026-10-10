import React, { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  CalendarDays,
  Clock,
  DollarSign,
  Globe,
  Mail,
  MapPin,
  Navigation,
  Phone,
  PhoneCall,
  Trash2,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { leadsAPI } from '../../lib/api';
import { appointmentDay, toLocalInput } from '../../utils/appointments';
import { AppointmentField } from './AppointmentField';
import { KNOWN_CITIES, SOURCES, STATUSES, type Lead, type LeadStatus, type Trade } from './leadTypes';

/** The text fields, held as strings while editing. */
interface Draft {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  jobType: string;
  source: string;
  estimatedValue: string;
  followUpDate: string;
  notes: string;
  lostReason: string;
}
type Field = keyof Draft;

const draftOf = (lead: Lead | null): Draft => ({
  name: lead?.name ?? '',
  phone: lead?.phone ?? '',
  email: lead?.email ?? '',
  address: lead?.address ?? '',
  city: lead?.city ?? '',
  jobType: lead?.jobType ?? '',
  source: lead?.source ?? '',
  estimatedValue: lead?.estimatedValue?.toString() ?? '',
  followUpDate: lead?.followUpDate ?? '',
  notes: lead?.notes ?? '',
  lostReason: lead?.lostReason ?? '',
});

/** A draft value as the server stores it: trimmed, empty as null, value as a number. */
function stored(field: Field, value: string): string | number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (field === 'estimatedValue') {
    const amount = Number(trimmed.replace(/[$,]/g, ''));
    return Number.isFinite(amount) ? amount : null;
  }
  return trimmed;
}

const formatDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Notes as written, with form questions ("Best time to call? Evenings") greyed. */
function NotesText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const question = line.match(/^(.*?\?)(\s*)(.*)$/);
        return (
          <Fragment key={i}>
            {question ? (
              <>
                <span className="text-gray-500">{question[1]}</span>
                {question[2]}
                {question[3]}
              </>
            ) : (
              line
            )}
            {'\n'}
          </Fragment>
        );
      })}
    </>
  );
}

const Row: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }> = ({
  icon: Icon,
  label,
  children,
}) => (
  <div className="grid grid-cols-[8rem_1fr] items-center min-h-[2.25rem] -mx-2 px-2 rounded-md hover:bg-[#1B1B1B] focus-within:bg-[#1B1B1B]">
    <span className="flex items-center gap-2.5 text-sm text-gray-500">
      <Icon className="w-4 h-4 text-gray-600" />
      {label}
    </span>
    <div className="min-w-0 flex items-center gap-2">{children}</div>
  </div>
);

const plainInput =
  'w-full min-w-0 bg-transparent border-0 p-0 py-1 text-[15px] text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-0';
const plainSelect = `${plainInput} appearance-none cursor-pointer`;

/**
 * A lead as a structured note: the name as a title, a stage pill, one row per
 * detail and the notes below. An existing lead saves each field as you leave
 * it; a new one is added with the button.
 */
export const LeadDrawer: React.FC<{
  organizationId: string;
  lead: Lead | null;
  trades: Trade[];
  onClose: () => void;
  onCreated: () => void;
  onDelete?: () => void;
  /** Shows a saved change on the board and calendar straight away. */
  onChanged: (lead: Lead, patch: Partial<Lead>) => void;
  /** Changes the stage the way the board does (asks why when a lead is lost). */
  onStatus: (lead: Lead, status: LeadStatus) => void;
}> = ({ organizationId, lead, trades, onClose: closeNow, onCreated, onDelete, onChanged, onStatus }) => {
  // Slides in and out like the estimate drawer.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  const slideOut = (then: () => void) => {
    setShown(false);
    window.setTimeout(then, 150);
  };

  const [draft, setDraft] = useState<Draft>(() => draftOf(lead));
  // What the server has, so a field only saves when it really changed.
  const saved = useRef<Draft>(draftOf(lead));
  const [newStatus, setNewStatus] = useState<LeadStatus>('new');
  const [newAppointment, setNewAppointment] = useState<string | undefined>();
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Notes show as text until tapped; an empty note is ready to type in.
  const [editingNotes, setEditingNotes] = useState(!lead?.notes);
  const [notesTapped, setNotesTapped] = useState(false);

  // Follow changes made elsewhere (a city found by the map lookup, the board),
  // except in fields with unsaved typing.
  useEffect(() => {
    if (!lead) return;
    const fresh = draftOf(lead);
    setDraft((current) => {
      const next = { ...current };
      for (const key of Object.keys(fresh) as Field[]) {
        if (current[key] === saved.current[key]) next[key] = fresh[key];
      }
      return next;
    });
    saved.current = fresh;
  }, [lead]);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft((current) => ({ ...current, [field]: e.target.value }));

  const save = async (patch: Partial<Lead>, data: Record<string, unknown>) => {
    if (!lead) return;
    onChanged(lead, patch);
    setState('saving');
    setError(null);
    try {
      await leadsAPI.update(lead.id, data);
      setState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setState('idle');
    }
  };

  /** Saves one field of an existing lead if it changed. */
  const commit = (field: Field, value = draft[field]) => {
    if (!lead) return;
    const next = stored(field, value);
    if (next === stored(field, saved.current[field])) return;
    if (field === 'name' && next === null) {
      setDraft((current) => ({ ...current, name: saved.current.name })); // a lead needs a name
      return;
    }
    saved.current = { ...saved.current, [field]: value };
    void save({ [field]: next ?? undefined } as Partial<Lead>, { [field]: next });
  };

  // Typing that hasn't been saved yet is saved when the drawer goes away.
  const latest = useRef({ draft, commit });
  latest.current = { draft, commit };
  useEffect(
    () => () => {
      for (const field of Object.keys(latest.current.draft) as Field[]) latest.current.commit(field, latest.current.draft[field]);
    },
    [],
  );

  const choose = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    set(field)(e);
    commit(field, e.target.value);
  };

  const changeAppointment = (iso: string | null) => {
    const day = iso ? appointmentDay(toLocalInput(iso)) : undefined;
    if (!lead) {
      setNewAppointment(iso ?? undefined);
      if (day) setDraft((current) => ({ ...current, followUpDate: day }));
      return;
    }
    // Setting one makes its day the follow-up date; removing it drops that date again.
    const oldDay = lead.appointmentAt ? appointmentDay(toLocalInput(lead.appointmentAt)) : undefined;
    const followUp = day ?? (oldDay && saved.current.followUpDate === oldDay ? '' : undefined);
    if (followUp !== undefined) {
      saved.current = { ...saved.current, followUpDate: followUp };
      setDraft((current) => ({ ...current, followUpDate: followUp }));
    }
    void save(
      { appointmentAt: iso ?? undefined, ...(followUp !== undefined ? { followUpDate: followUp || undefined } : {}) },
      { appointmentAt: iso, ...(followUp !== undefined ? { followUpDate: followUp || null } : {}) },
    );
  };

  const changeStatus = (status: LeadStatus) => {
    if (lead) onStatus(lead, status);
    else setNewStatus(status);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lead) {
      (document.activeElement as HTMLElement | null)?.blur(); // Enter saves the field
      return;
    }
    if (!draft.name.trim()) {
      setError('Add a name first');
      return;
    }
    const data: Record<string, unknown> = { status: newStatus, appointmentAt: newAppointment ?? null };
    for (const field of Object.keys(draft) as Field[]) if (field !== 'lostReason') data[field] = stored(field, draft[field]);
    setState('saving');
    try {
      await leadsAPI.create(organizationId, data);
      slideOut(onCreated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the lead');
      setState('idle');
    }
  };

  const status = STATUSES.find((s) => s.value === (lead?.status ?? newStatus)) ?? STATUSES[0];
  const appointment = lead ? lead.appointmentAt : newAppointment;
  const phoneHref = draft.phone.trim() ? `tel:${draft.phone.replace(/[^\d+]/g, '')}` : null;
  const mapHref = draft.address.trim()
    ? `https://maps.apple.com/?q=${encodeURIComponent([draft.address, draft.city].filter((s) => s.trim()).join(', '))}`
    : null;
  const added = lead?.createdAt
    ? new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => slideOut(closeNow)}
      />
      <form
        onSubmit={create}
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[520px] bg-[#121212] border-l border-[#2A2A2A] shadow-xl flex flex-col transform transition-transform z-[10001] ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-7 pt-4 text-sm text-gray-500">
          <span>{lead ? `Lead${added ? ` · added ${added}` : ''}` : 'New lead'}</span>
          <button type="button" onClick={() => slideOut(closeNow)} className="p-1 -mr-1 text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 pt-3 pb-6">
          <input
            value={draft.name}
            onChange={set('name')}
            onBlur={() => commit('name')}
            placeholder="Name"
            aria-label="Name"
            autoFocus={!lead}
            className="w-full bg-transparent border-0 p-0 text-[26px] font-semibold tracking-tight text-white placeholder-gray-600 focus:outline-none focus:ring-0"
          />

          {/* The stage, as a pill; the real picker sits invisibly on top. */}
          <label className="relative mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 text-sm cursor-pointer">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <span className={status.color}>{status.label}</span>
            <select
              value={status.value}
              onChange={(e) => changeStatus(e.target.value as LeadStatus)}
              aria-label="Stage"
              className="absolute inset-0 opacity-0 cursor-pointer text-base"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-6 space-y-0.5">
            <Row icon={Phone} label="Phone">
              <input
                type="tel"
                value={draft.phone}
                onChange={set('phone')}
                onBlur={() => commit('phone')}
                placeholder="Add phone"
                aria-label="Phone"
                className={plainInput}
              />
              {phoneHref && (
                <a href={phoneHref} className="p-1 text-gray-500 hover:text-white" aria-label="Call">
                  <PhoneCall className="w-4 h-4" />
                </a>
              )}
            </Row>
            <Row icon={Mail} label="Email">
              <input
                type="email"
                value={draft.email}
                onChange={set('email')}
                onBlur={() => commit('email')}
                placeholder="Add email"
                aria-label="Email"
                className={plainInput}
              />
            </Row>
            <Row icon={MapPin} label="Address">
              <input
                value={draft.address}
                onChange={set('address')}
                onBlur={() => commit('address')}
                placeholder="Add address"
                aria-label="Address"
                className={plainInput}
              />
              {mapHref && (
                <a href={mapHref} target="_blank" rel="noreferrer" className="p-1 text-gray-500 hover:text-white" aria-label="Open in Maps">
                  <Navigation className="w-4 h-4" />
                </a>
              )}
            </Row>
            <Row icon={Building2} label="City">
              <input
                value={draft.city}
                onChange={set('city')}
                onBlur={() => commit('city')}
                placeholder={lead ? 'Fills in from the address' : 'Add city'}
                aria-label="City"
                list="lead-cities"
                size={Math.max(draft.city.length, 1)}
                className={
                  draft.city
                    ? 'bg-[#1F1F1F] border border-[#2C2C2C] rounded px-2 py-0.5 text-[13px] text-gray-200 focus:outline-none focus:border-[#336699] w-auto min-w-[4rem]'
                    : plainInput
                }
              />
              <datalist id="lead-cities">
                {KNOWN_CITIES.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </Row>
            <Row icon={CalendarDays} label="Appointment">
              <AppointmentField value={appointment} onChange={changeAppointment} plain className="flex-1 text-[15px]" />
            </Row>
            <Row icon={Clock} label="Follow up">
              <label className="relative flex-1 min-w-0 py-1 cursor-pointer">
                <span className={`text-[15px] ${draft.followUpDate ? 'text-gray-100' : 'text-gray-600'}`}>
                  {draft.followUpDate ? formatDay(draft.followUpDate) : 'Pick a date'}
                </span>
                <input
                  type="date"
                  value={draft.followUpDate}
                  onChange={choose('followUpDate')}
                  aria-label="Follow up on"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
                />
              </label>
              {draft.followUpDate && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, followUpDate: '' }));
                    commit('followUpDate', '');
                  }}
                  className="p-1 text-gray-500 hover:text-white"
                  aria-label="Clear follow-up date"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </Row>
            <Row icon={Wrench} label="Job type">
              <select value={draft.jobType} onChange={choose('jobType')} aria-label="Job type" className={`${plainSelect} ${draft.jobType ? '' : 'text-gray-600'}`}>
                <option value="">Choose a trade</option>
                {trades.map((trade) => (
                  <option key={trade.id} value={trade.id}>{trade.name}</option>
                ))}
              </select>
            </Row>
            <Row icon={Globe} label="Source">
              <select value={draft.source} onChange={choose('source')} aria-label="Source" className={`${plainSelect} ${draft.source ? '' : 'text-gray-600'}`}>
                <option value="">How did they find you?</option>
                {SOURCES.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </Row>
            <Row icon={DollarSign} label="Value">
              <input
                inputMode="decimal"
                value={draft.estimatedValue}
                onChange={set('estimatedValue')}
                onBlur={() => commit('estimatedValue')}
                placeholder="Add estimate"
                aria-label="Estimated value"
                className={plainInput}
              />
            </Row>
            {lead?.status === 'lost' && (
              <Row icon={XCircle} label="Lost because">
                <input
                  value={draft.lostReason}
                  onChange={set('lostReason')}
                  onBlur={() => commit('lostReason')}
                  placeholder="Add a reason"
                  aria-label="Lost reason"
                  className={plainInput}
                />
              </Row>
            )}
          </div>

          <div className="mt-5 pt-5 border-t border-[#222222]">
            <div className="text-xs uppercase tracking-wider text-gray-600 mb-2">Notes</div>
            {editingNotes ? (
              <textarea
                value={draft.notes}
                onChange={set('notes')}
                onBlur={() => {
                  commit('notes');
                  if (draft.notes.trim()) setEditingNotes(false);
                }}
                autoFocus={notesTapped}
                rows={Math.max(4, draft.notes.split('\n').length + 1)}
                placeholder="Called, left VM, best time to call…"
                aria-label="Notes"
                className="w-full bg-transparent border-0 p-0 text-[15px] leading-relaxed text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:ring-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNotesTapped(true);
                  setEditingNotes(true);
                }}
                className="block w-full text-left text-[15px] leading-relaxed text-gray-200 whitespace-pre-wrap"
                aria-label="Edit notes"
              >
                <NotesText text={draft.notes.trimEnd()} />
              </button>
            )}
          </div>
        </div>

        <div className="px-7 py-3.5 border-t border-[#222222] flex items-center justify-between text-sm">
          {lead ? (
            <>
              {onDelete ? (
                <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-red-400 hover:text-red-300">
                  <Trash2 className="w-4 h-4" /> Delete lead
                </button>
              ) : (
                <span />
              )}
              <span className="text-gray-500" aria-live="polite">
                {state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : ''}
              </span>
            </>
          ) : (
            <>
              <span />
              <button type="submit" disabled={state === 'saving'} className="px-4 py-2 rounded-md bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50">
                {state === 'saving' ? 'Adding…' : 'Add lead'}
              </button>
            </>
          )}
        </div>
      </form>
    </>,
    document.body,
  );
};
