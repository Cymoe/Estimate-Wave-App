import { useState } from 'react';
import { ArrowLeft, Mail, MessageSquare, Phone } from 'lucide-react';
import type { OutreachContact, OutreachField, OutreachRowStatus, OutreachToday, TodayLead } from '../../lib/api';
import { ago } from '../leads/leadIntake';
import { ContactCards } from './ContactsTable';
import { isSimulated, phoneText } from './format';

/** The device's own date as "2026-11-11", some days on: a follow-up is due by the contractor's calendar. */
export const localDay = (plus = 0, from = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + plus);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** How many calls the sheet holds, for the page's line about it. */
export const todayTotal = (t: OutreachToday) => t.followUpCount + t.uncalledCount + t.freshCount;
/** "2 follow-ups due · 1 new lead · 4 new numbers", leaving out what there is none of. */
export const todayParts = (t: OutreachToday) =>
  [
    t.followUpCount ? `${t.followUpCount} ${t.followUpCount === 1 ? 'follow-up' : 'follow-ups'} due` : '',
    t.uncalledCount ? `${t.uncalledCount} new ${t.uncalledCount === 1 ? 'lead' : 'leads'}` : '',
    t.freshCount ? `${t.freshCount}${t.freshCapped ? '+' : ''} new ${t.freshCount === 1 ? 'number' : 'numbers'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** When to follow up instead, from a lead's row. */
const LATER: Array<{ label: string; days: number }> = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

const big = 'flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] text-sm font-medium';
const square = 'w-11 h-11 shrink-0 inline-flex items-center justify-center border border-[#333333] text-gray-200 hover:bg-[#2A2A2A]';

/** One lead to call: who, why today, the last thing noted, and Call. The name opens the lead in Leads. */
const LeadCard: React.FC<{
  lead: TodayLead;
  day: string;
  called: boolean;
  onOpen: () => void;
  onContact: (kind: 'call' | 'text') => void;
  onLater: (date: string) => void;
}> = ({ lead, day, called, onOpen, onContact, onLater }) => {
  const due = lead.followUpDate && lead.followUpDate <= day;
  const why = due ? (lead.followUpDate === day ? 'Follow-up due today' : `Follow-up was due ${shortDay(lead.followUpDate!)}`) : `New lead · came in ${ago(lead.createdAt)}`;
  const digits = lead.phone?.replace(/[^\d+]/g, '');
  return (
    // The buttons sit at the foot of the card, so two cards side by side line theirs up whatever each has to say.
    <li className="flex flex-col bg-[#121212] border border-[#333333]" data-testid="today-lead">
      <button type="button" onClick={onOpen} className="block w-full flex-1 text-left px-4 pt-3 pb-2">
        <span className="block text-[15px] font-medium text-white">{lead.name}</span>
        {(lead.company || lead.place) && <span className="block text-xs text-gray-500">{[lead.company, lead.place].filter(Boolean).join(' · ')}</span>}
        <span className="mt-1 block text-xs text-amber-300" data-testid="today-why">
          {why}
          {lead.source ? <span className="text-gray-500"> · from {lead.source}</span> : null}
        </span>
        {called ? (
          <span className="block text-xs text-[#7fb0e0]">Called just now</span>
        ) : lead.calls > 0 ? (
          <span className="block text-xs text-gray-500">
            {lead.calls} {lead.calls === 1 ? 'call' : 'calls'} so far{lead.lastContactAt ? ` · last ${ago(lead.lastContactAt)}` : ''}
          </span>
        ) : null}
        {lead.note && <span className="mt-1 block text-sm text-gray-400 line-clamp-2">{lead.note}</span>}
        {lead.phone && <span className="mt-1 block text-sm text-white">{phoneText(lead.phone.replace(/^\+1/, ''))}</span>}
      </button>
      <div className="flex gap-2 px-4 pb-3">
        {digits && (
          <a href={`tel:${digits}`} onClick={() => onContact('call')} className={`${big} bg-[#336699] hover:bg-[#2a5580] text-white`} data-testid="today-call">
            <Phone className="w-4 h-4" /> Call
          </a>
        )}
        {digits && (
          <a href={`sms:${digits}`} onClick={() => onContact('text')} aria-label="Text" title="Text" className={square}>
            <MessageSquare className="w-4 h-4" />
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} aria-label="Email" title="Email" className={digits ? square : `${big} border border-[#333333] text-gray-200 hover:bg-[#2A2A2A]`}>
            <Mail className="w-4 h-4" /> {digits ? null : 'Email'}
          </a>
        )}
        {/* The device's own picker: one tap on an iPad, no menu of ours to build. Picking a day moves the follow-up and takes the lead off today. */}
        <select
          aria-label={`Follow up with ${lead.name} later`}
          value=""
          onChange={(e) => e.target.value && onLater(localDay(Number(e.target.value)))}
          className="shrink-0 min-h-[44px] rounded-none border border-[#333333] bg-[#121212] px-2 text-sm text-gray-200"
          data-testid="today-later"
        >
          <option value="">Later…</option>
          {LATER.map((l) => (
            <option key={l.days} value={l.days}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
};

const Section: React.FC<{ title: string; count: number; shown: number; note?: string; children: React.ReactNode; testid: string }> = ({ title, count, shown, note, children, testid }) => (
  <section className="space-y-2" data-testid={testid}>
    <h2 className="text-sm font-medium text-white">
      {title} <span className="text-gray-500">{count.toLocaleString('en-US')}</span>
    </h2>
    {note && <p className="text-xs text-gray-500">{note}</p>}
    {children}
    {count > shown && (
      <p className="text-xs text-gray-500">
        The first {shown} of {count.toLocaleString('en-US')}. The rest come up as these are called.
      </p>
    )}
  </section>
);

/**
 * Today's calls, top to bottom: follow-ups that have come due, leads nobody has
 * called yet, then owners whose phone was just found. The leads are worked in
 * Leads (a tap on the name opens one there); an owner goes to Leads or is
 * skipped from its card, as on a list.
 */
export function TodaySheet({
  today,
  onBack,
  onOpenLead,
  onContact,
  onLater,
  onOpenOwner,
  onStatus,
  onRetry,
  onLead,
}: {
  /** Null while it's being read. */
  today: OutreachToday | null;
  onBack: () => void;
  onOpenLead: (lead: TodayLead) => void;
  onContact: (lead: TodayLead, kind: 'call' | 'text') => void;
  onLater: (lead: TodayLead, date: string) => Promise<void>;
  onOpenOwner: (row: OutreachContact) => void;
  onStatus: (row: OutreachContact, status: OutreachRowStatus) => Promise<void>;
  onRetry: (row: OutreachContact, field: OutreachField) => void;
  onLead: (row: OutreachContact) => void;
}) {
  // What's been done from this sheet since it was read: who was just called, and whose follow-up was moved off today.
  const [called, setCalled] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const contact = (lead: TodayLead, kind: 'call' | 'text') => {
    if (kind === 'call') setCalled((s) => new Set(s).add(lead.id));
    onContact(lead, kind);
  };
  const later = async (lead: TodayLead, date: string) => {
    setError(null);
    setMoved((s) => new Set(s).add(lead.id));
    try {
      await onLater(lead, date);
    } catch (err) {
      setMoved((s) => {
        const next = new Set(s);
        next.delete(lead.id);
        return next;
      });
      setError(err instanceof Error ? err.message : "That follow-up didn't move");
    }
  };
  const cards = (leads: TodayLead[]) => (
    <ul className="grid gap-2 md:grid-cols-2">
      {leads
        .filter((l) => !moved.has(l.id))
        .map((l) => (
          <LeadCard key={l.id} lead={l} day={today!.day} called={called.has(l.id)} onOpen={() => onOpenLead(l)} onContact={(kind) => contact(l, kind)} onLater={(date) => void later(l, date)} />
        ))}
    </ul>
  );
  const gone = (leads: TodayLead[]) => leads.filter((l) => moved.has(l.id)).length;
  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const total = today ? todayTotal(today) - gone(today.followUps) - gone(today.uncalled) : 0;

  return (
    <div className="space-y-5" data-testid="today-sheet">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 px-3 h-9 text-sm border border-[#333333] text-gray-300 hover:text-white hover:bg-[#2A2A2A]">
          <ArrowLeft className="w-4 h-4" /> Back to owners
        </button>
        <p className="text-sm text-gray-400" data-testid="today-summary">
          {dateLine}
          {today ? ` · ${total === 0 ? 'nobody to call' : `${total.toLocaleString('en-US')}${today.freshCapped ? '+' : ''} to call`}` : ''}
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {!today ? (
        <div className="space-y-2 animate-pulse" role="status" aria-label="Loading today's calls">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-[#121212] border border-[#333333]" />
          ))}
        </div>
      ) : total === 0 ? (
        <p className="border border-[#333333] bg-[#161616] px-3 py-3 text-sm text-gray-300" data-testid="today-empty">
          Nobody to call today. Follow-ups you set in Leads show up here the day they're due, and so do owners the day their phone is found.
        </p>
      ) : (
        <>
          {today.followUpCount - gone(today.followUps) > 0 && (
            <Section title="Follow-ups due" count={today.followUpCount - gone(today.followUps)} shown={today.followUps.length - gone(today.followUps)} testid="today-followups">
              {cards(today.followUps)}
            </Section>
          )}
          {today.uncalledCount - gone(today.uncalled) > 0 && (
            <Section title="New leads, not called yet" count={today.uncalledCount - gone(today.uncalled)} shown={today.uncalled.length - gone(today.uncalled)} testid="today-uncalled">
              {cards(today.uncalled)}
            </Section>
          )}
          {today.freshCount > 0 && (
            <Section
              title="New numbers"
              count={today.freshCount}
              shown={today.fresh.length}
              note={`Owners whose phone was found in the last ${today.days} days. After the call, send them to Leads or skip them.`}
              testid="today-fresh"
            >
              {today.fresh.some(isSimulated) && (
                <p className="text-xs text-amber-300" data-testid="today-simulated">
                  Some of these numbers are simulated: no phone source is connected yet, so they're made up.
                </p>
              )}
              <div className="md:[&_ul]:grid md:[&_ul]:grid-cols-2 md:[&_ul]:gap-2 md:[&_ul]:space-y-0">
                <ContactCards rows={today.fresh} onOpen={onOpenOwner} onStatus={onStatus} onRetry={onRetry} onLead={onLead} />
              </div>
            </Section>
          )}
          <p className="text-xs text-gray-500">A lead's name opens it in Leads, where the call's outcome and the next follow-up are kept.</p>
        </>
      )}
    </div>
  );
}
