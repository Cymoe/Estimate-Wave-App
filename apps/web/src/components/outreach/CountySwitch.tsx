import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const menu = useRef<HTMLSpanElement>(null);
  // Where the menu sits on screen: drawn on the page itself, so no card or row around the switch can cover or clip it.
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  useReadyCounties();
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => t instanceof Node && Boolean(box.current?.contains(t) || menu.current?.contains(t));
    const away = (e: Event) => !inside(e.target) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // A scroll moves the words away from the menu: it closes rather than float on its own.
    const scrolled = (e: Event) => !(e.target instanceof Node && menu.current?.contains(e.target)) && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [open]);
  // Under the words, kept on screen: to the left of the right edge, and above them when there's no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = box.current?.getBoundingClientRect();
      if (!b) return;
      const width = menu.current?.offsetWidth ?? 272;
      const height = menu.current?.offsetHeight ?? 160;
      const left = Math.max(16, Math.min(b.left, window.innerWidth - width - 16));
      setAt(b.bottom + 8 + height > window.innerHeight - 16 && b.top - 8 - height > 16 ? { left, bottom: window.innerHeight - b.top + 8 } : { left, top: b.bottom + 8 });
    };
    place();
    // Once more after the menu has its size.
    const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
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
      {open && createPortal(
        <span
          ref={menu}
          role="listbox"
          aria-label="County"
          style={{ left: at?.left ?? 0, top: at?.top, bottom: at?.bottom, visibility: at ? 'visible' : 'hidden' }}
          className={`fixed z-[11010] block w-max min-w-[17rem] p-1.5 rounded-lg border border-white/10 bg-[#161616] shadow-[0_16px_40px_rgba(0,0,0,0.6)] ${at?.bottom !== undefined ? 'origin-bottom-left' : 'origin-top-left'} animate-pop text-left font-normal`}
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
        </span>,
        document.body,
      )}
    </span>
  );
}
