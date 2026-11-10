import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { COUNTIES } from './presets';
import { countyOf, isReady, useReadyCounties } from './county';

/**
 * The county a list is of, as words with a small arrow: tap for the counties, the ones not in yet marked
 * Coming soon. `size` "title" sits in a heading at the heading's size; "line" is a line of its own; "inline" sits in a sentence.
 */
export function CountySwitch({
  county,
  onChange,
  size = 'line',
  short = false,
  disabled = false,
}: {
  county: string;
  onChange: (name: string) => void;
  size?: 'title' | 'line' | 'inline';
  /** "Midland County" rather than "Midland County, TX". */
  short?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useReadyCounties();
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const here = countyOf(county);
  const label = short ? here.label.replace(/, TX.*$/, '') : here.label;
  const look =
    size === 'title'
      ? 'inline-flex items-center gap-1 -mx-1 px-1 rounded-md text-[#7fb0e0] hover:bg-white/[0.06]'
      : size === 'inline'
        ? 'inline-flex items-center gap-0.5 rounded text-[#7fb0e0] hover:text-white disabled:text-inherit disabled:hover:text-inherit'
        : 'inline-flex items-center gap-1.5 min-h-[36px] -ml-2 px-2 text-sm font-medium text-white hover:bg-[#2A2A2A]';
  return (
    <span ref={box} className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open} aria-haspopup="listbox" data-testid="county-switch" className={look}>
        {label}
        <ChevronDown className={`${size === 'title' ? 'w-5 h-5' : 'w-4 h-4'} shrink-0 ${size === 'line' ? 'text-gray-400' : 'opacity-70'} transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <span
          role="listbox"
          aria-label="County"
          className="absolute left-0 top-full mt-2 z-40 block w-max min-w-[17rem] p-1.5 rounded-lg border border-white/10 bg-[#161616]/95 backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.6)] origin-top-left animate-pop text-left font-normal"
        >
          {COUNTIES.map((c) => (
            <button
              key={c.name}
              type="button"
              role="option"
              aria-selected={c.name === county}
              aria-disabled={!isReady(c.name)}
              disabled={!isReady(c.name)}
              onClick={() => {
                setOpen(false);
                if (c.name !== county) onChange(c.name);
              }}
              className="flex w-full items-center gap-2 whitespace-nowrap px-3 min-h-[40px] md:min-h-[36px] rounded-md text-left text-sm text-gray-200 transition-colors hover:bg-white/[0.07] hover:text-white disabled:text-gray-500 disabled:hover:bg-transparent"
            >
              <Check className={`w-4 h-4 shrink-0 ${c.name === county ? 'text-[#7fb0e0]' : 'invisible'}`} aria-hidden />
              {c.label}
              {!isReady(c.name) && <span className="ml-auto pl-3 text-xs text-gray-500">Coming soon</span>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
