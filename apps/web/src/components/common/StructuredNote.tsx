import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Pieces for showing a record as a structured note, the way the lead drawer
 * does: a big title, one quiet row per detail, and fields that save as you
 * leave them.
 */

export const NoteRow: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }> = ({
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

export const noteInput =
  'w-full min-w-0 bg-transparent border-0 p-0 py-1 text-[15px] text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-0';
export const noteSelect = `${noteInput} appearance-none cursor-pointer`;
export const noteTitle =
  'w-full bg-transparent border-0 p-0 text-[26px] font-semibold tracking-tight text-white placeholder-gray-600 focus:outline-none focus:ring-0';
export const noteTextarea =
  'w-full min-h-[7rem] bg-transparent border-0 p-0 text-[15px] leading-relaxed text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-0 resize-none';

/** "Oct 9, 2026" for a yyyy-mm-dd date, read as a local date. */
export function formatNoteDate(date?: string) {
  if (!date) return '';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A date shown as text, with the real picker invisibly on top (Safari shows an empty date input as blank). */
export const NoteDate: React.FC<{ value: string; onChange: (value: string) => void; label: string }> = ({ value, onChange, label }) => (
  <>
    <label className="relative flex-1 min-w-0 py-1 cursor-pointer">
      <span className={`text-[15px] ${value ? 'text-gray-100' : 'text-gray-600'}`}>{value ? formatNoteDate(value) : 'Pick a date'}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
      />
    </label>
    {value && (
      <button type="button" onClick={() => onChange('')} className="p-1 text-gray-500 hover:text-white" aria-label={`Clear ${label.toLowerCase()}`}>
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </>
);

export type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Text fields held as strings while editing. With `save`, a field is saved
 * when `commit` finds it changed, and anything still unsaved is saved when the
 * component goes away. Without it (a new record) nothing saves on its own.
 */
export function useNoteFields<T extends Record<string, string>>(
  initial: T,
  save: ((patch: Partial<T>) => Promise<void>) | null,
  required: (keyof T)[] = [],
) {
  const [draft, setDraft] = useState<T>(initial);
  const saved = useRef<T>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const commit = (field: keyof T, value: string = draft[field]) => {
    if (!save) return;
    if (value.trim() === saved.current[field].trim()) return;
    if (required.includes(field) && !value.trim()) {
      setDraft((current) => ({ ...current, [field]: saved.current[field] }));
      return;
    }
    saved.current = { ...saved.current, [field]: value };
    setState('saving');
    setError(null);
    save({ [field]: value.trim() } as Partial<T>)
      .then(() => setState('saved'))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not save');
        setState('idle');
      });
  };

  const set = (field: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft((current) => ({ ...current, [field]: e.target.value }));

  /** Sets and saves straight away (pickers and selects). */
  const choose = (field: keyof T, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    commit(field, value);
  };

  const latest = useRef({ draft, commit });
  latest.current = { draft, commit };
  useEffect(
    () => () => {
      for (const field of Object.keys(latest.current.draft)) latest.current.commit(field, latest.current.draft[field]);
    },
    [],
  );

  return { draft, set, choose, commit, state, setState, error, setError };
}

/** Slides a drawer in after mounting and out before closing. */
export function useSlideIn() {
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
  return { shown, slideOut };
}

export const SaveStatus: React.FC<{ state: SaveState }> = ({ state }) => (
  <span className="text-gray-500">{state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : ''}</span>
);
