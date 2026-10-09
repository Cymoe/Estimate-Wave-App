import React, { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
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
}

interface Props<T extends CalendarLead> {
  leads: T[];
  onOpen: (lead: T) => void;
}

type Range = 'week' | 'month';

/** Appointments by day, in a week (default) or month view. Tapping one opens the lead. */
export function LeadsCalendar<T extends CalendarLead>({ leads, onOpen }: Props<T>) {
  const [range, setRange] = useState<Range>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const today = new Date();

  const appointments = useMemo(
    () =>
      leads
        .filter((lead) => lead.appointmentAt)
        .map((lead) => ({ lead, at: new Date(lead.appointmentAt!) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    [leads],
  );
  const onDay = (day: Date) => appointments.filter((a) => isSameDay(a.at, day));

  const weekStart = startOfWeek(anchor);
  const days =
    range === 'week'
      ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      : (() => {
          const first = startOfWeek(startOfMonth(anchor));
          const last = endOfWeek(endOfMonth(anchor));
          const list: Date[] = [];
          for (let d = first; d <= last; d = addDays(d, 1)) list.push(d);
          return list;
        })();

  const step = (dir: 1 | -1) => setAnchor((d) => (range === 'week' ? addWeeks(d, dir) : addMonths(d, dir)));
  const title =
    range === 'week'
      ? `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), isSameMonth(weekStart, addDays(weekStart, 6)) ? 'd, yyyy' : 'MMM d, yyyy')}`
      : format(anchor, 'MMMM yyyy');

  const item = ({ lead, at }: { lead: T; at: Date }, compact: boolean) => (
    <button
      key={lead.id}
      onClick={() => onOpen(lead)}
      className={`w-full text-left border border-[#333333] bg-[#121212] hover:border-[#555555] ${compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1.5 text-xs'}`}
    >
      <span className="text-gray-400">{format(at, 'h:mm a')}</span>{' '}
      <span className="text-white">{lead.name}</span>
    </button>
  );

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
        <span className="text-sm text-white ml-2">{title}</span>
        <div className="ml-auto flex border border-[#333333]" role="group" aria-label="Calendar range">
          {(['week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`px-3 py-1.5 text-sm capitalize ${range === r ? 'bg-[#336699] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {range === 'week' ? (
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const list = onDay(day);
            return (
              <div key={day.toISOString()} className="border border-[#333333] bg-[#0A0A0A] min-h-[260px] flex flex-col">
                <div className={`px-2 py-1.5 border-b border-[#333333] text-xs ${isSameDay(day, today) ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {format(day, 'EEE d')}
                </div>
                <div className="p-1.5 space-y-1.5 flex-1">
                  {list.map((a) => item(a, false))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
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
                  {list.slice(0, 3).map((a) => item(a, true))}
                  {list.length > 3 && (
                    <button
                      onClick={() => {
                        setAnchor(day);
                        setRange('week');
                      }}
                      className="text-[11px] text-gray-400 hover:text-white"
                    >
                      +{list.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {appointments.length === 0 && (
        <p className="text-sm text-gray-500 mt-4">No appointments yet. Set one from a lead's card with “Set appointment”.</p>
      )}
    </div>
  );
}
