import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { formatAppointment, fromLocalInput, toLocalInput } from '../../utils/appointments';

/**
 * An appointment you set and clear in place. Tapping it opens the device's
 * date and time picker; the choice saves on its own a moment after you stop
 * changing it, and the x removes it straight away.
 */
export const AppointmentField: React.FC<{ value?: string; onChange: (iso: string | null) => void; className?: string }> = ({
  value,
  onChange,
  className = '',
}) => {
  const [local, setLocal] = useState(value);
  const timer = useRef<number>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setLocal(value), [value]);
  // Only the live value tracks the appointment; the input's starting value
  // stays empty, so the picker's Reset button clears the appointment.
  useEffect(() => {
    if (input.current) input.current.value = toLocalInput(local);
  }, [local]);
  // A pick still waiting on the timer is saved, not dropped, if the field goes
  // away first (say the drawer is closed right after choosing a time).
  const pending = useRef<{ iso: string | undefined } | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current && pending.current.iso !== latest.current.value) latest.current.onChange(pending.current.iso ?? null);
    },
    [],
  );

  const commit = (iso: string | undefined) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    if (iso !== value) onChange(iso ?? null);
  };

  return (
    <div className={`flex items-stretch border ${local ? 'border-[#444444] bg-[#1A1A1A]' : 'border-dashed border-[#333333]'} ${className}`}>
      <label className={`relative flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 cursor-pointer ${local ? 'text-white' : 'text-gray-400'}`}>
        <CalendarClock className={`w-3.5 h-3.5 flex-shrink-0 ${local ? 'text-[#7fb0e0]' : ''}`} />
        <span className="truncate">{local ? formatAppointment(local) : 'Set appointment'}</span>
        {/* The real picker sits invisibly over the label, so a tap opens it. */}
        <input
          ref={input}
          type="datetime-local"
          defaultValue=""
          onChange={(e) => {
            const iso = fromLocalInput(e.target.value) ?? undefined;
            setLocal(iso);
            pending.current = { iso };
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => commit(iso), 800);
          }}
          onBlur={() => commit(local)}
          aria-label="Appointment"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
        />
      </label>
      {local && (
        <button
          type="button"
          onClick={() => {
            setLocal(undefined);
            commit(undefined);
          }}
          className="px-2 text-gray-400 hover:text-white"
          aria-label="Remove appointment"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
