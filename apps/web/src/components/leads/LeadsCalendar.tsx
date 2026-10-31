import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalendarLead {
  id: string;
  name: string;
  appointmentAt?: string;
  /** A day to get back to them, YYYY-MM-DD. */
  followUpDate?: string;
  status?: string;
}

/** Stages where a follow-up still means something. */
const OPEN = new Set(['new', 'no_answer', 'contacted', 'scheduled', 'quoted']);

/** The local calendar day of an ISO time, YYYY-MM-DD. */
const dayOf = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

interface Props<T extends CalendarLead> {
  leads: T[];
  onOpen: (lead: T) => void;
}

/**
 * Appointments and follow-ups by day, a month at a time. A follow-up is an
 * all-day item on an open lead; one that just mirrors the lead's appointment
 * day is left out so nothing shows twice. Tapping an item opens the lead.
 */
export function LeadsCalendar<T extends CalendarLead>({ leads, onOpen }: Props<T>) {
  const [anchor, setAnchor] = useState(() => new Date());
  // A day showing all of its appointments instead of the first few.
  const [openDay, setOpenDay] = useState<string | null>(null);
  const today = new Date();

  const appointments = useMemo(
    () =>
      leads
        .filter((lead) => lead.appointmentAt)
        .map((lead) => ({ lead, at: new Date(lead.appointmentAt!) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    [leads],
  );
  const followUps = useMemo(
    () =>
      leads
        .filter(
          (lead) =>
            lead.followUpDate &&
            (!lead.status || OPEN.has(lead.status)) &&
            !(lead.appointmentAt && dayOf(lead.appointmentAt) === lead.followUpDate),
        )
        .map((lead) => ({ lead, at: new Date(`${lead.followUpDate}T00:00:00`) })),
    [leads],
  );
  const onDay = (day: Date) => appointments.filter((a) => isSameDay(a.at, day));
  const followUpsOn = (day: Date) => followUps.filter((f) => isSameDay(f.at, day));

  const days: Date[] = [];
  for (let d = startOfWeek(startOfMonth(anchor)); d <= endOfWeek(endOfMonth(anchor)); d = addDays(d, 1)) days.push(d);

  const step = (dir: 1 | -1) => setAnchor((d) => addMonths(d, dir));

  const item = ({ lead, at }: { lead: T; at: Date }) => (
    <button
      key={lead.id}
      onClick={() => onOpen(lead)}
      className="block w-full truncate text-left border border-[#333333] bg-[#121212] hover:border-[#555555] px-1.5 py-0.5 text-[11px]"
    >
      <span className="text-gray-400">{format(at, 'h:mm a')}</span>{' '}
      <span className="text-white">{lead.name}</span>
    </button>
  );
  const followUpItem = ({ lead, at }: { lead: T; at: Date }) => {
    const overdue = at < today && !isSameDay(at, today);
    return (
      <button
        key={`f-${lead.id}`}
        onClick={() => onOpen(lead)}
        title="Follow up"
        className={`block w-full truncate text-left border px-1.5 py-0.5 text-[11px] ${
          overdue ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        }`}
      >
        <span className="opacity-70">Follow up</span> <span>{lead.name}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => step(-1)} className="p-1.5 border border-[#333333] text-gray-300 hover:bg-[#1E1E1E]" aria-label="Previous">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => step(1)} className="p-1.5 border border-[#333333] text-gray-300 hover:bg-[#1E1E1E]" aria-label="Next">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => setAnchor(new Date())} className="px-3 py-1.5 text-sm border border-[#333333] text-gray-300 hover:bg-[#1E1E1E]">
          Today
        </button>
        <span className="text-sm text-white ml-2">{format(anchor, 'MMMM yyyy')}</span>
      </div>

      <div className="grid grid-cols-7 border-l border-t border-[#333333]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-1 text-xs text-gray-500 border-r border-b border-[#333333]">{d}</div>
        ))}
        {days.map((day) => {
          const list = onDay(day);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[96px] p-1 border-r border-b border-[#333333] ${isSameMonth(day, anchor) ? 'bg-[#0A0A0A]' : 'bg-[#121212]'}`}
            >
              <div className={`text-xs mb-1 ${isSameDay(day, today) ? 'text-white font-semibold' : isSameMonth(day, anchor) ? 'text-gray-400' : 'text-gray-600'}`}>
                {format(day, 'd')}
              </div>
              <div className="space-y-1">
                {followUpsOn(day).map(followUpItem)}
                {(openDay === day.toDateString() ? list : list.slice(0, 3)).map(item)}
                {list.length > 3 && openDay !== day.toDateString() && (
                  <button onClick={() => setOpenDay(day.toDateString())} className="text-[11px] text-gray-400 hover:text-white">
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {appointments.length === 0 && followUps.length === 0 && (
        <p className="text-sm text-gray-500 mt-4">Nothing booked yet. Set an appointment or a follow-up date from a lead.</p>
      )}
    </div>
  );
}
