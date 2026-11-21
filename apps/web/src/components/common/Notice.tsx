import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePresence } from './usePresence';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * One quiet way to confirm things across the app.
 *
 * - `useToast` + `<Toast>`: a small pill at the bottom of the screen that
 *   fades on its own and never shifts the layout. For confirmations the
 *   screen can't show by itself (a row that's gone, a purchase).
 * - `<InlineNotice>`: a bordered line in the page for things that must be
 *   read: errors, and the odd one-time explanation.
 *
 * Anything the screen already shows (a chip flipped, a value changed) gets
 * no message at all.
 */

const toastMs = (text: string) => Math.min(6000, Math.max(2500, text.length * 50));

/** A place the confirmation can take you, such as the lead just bought. */
export interface ToastLink {
  to: string;
  label: string;
}

export function useToast() {
  const [state, setState] = useState<{ text: string; link?: ToastLink } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((text: string, link?: ToastLink) => {
    clearTimeout(timer.current);
    setState({ text, link });
    // A toast with a link stays the longest, so there is time to tap it.
    const ms = link ? 8000 : toastMs(text);
    timer.current = setTimeout(() => setState((current) => (current?.text === text ? null : current)), ms);
  }, []);
  return { toast: state?.text ?? null, link: state?.link, show };
}

export const Toast: React.FC<{ text: string | null; link?: ToastLink }> = ({ text, link }) => {
  // Fades in, and keeps its last words on screen while it fades out.
  const { mounted, shown } = usePresence(Boolean(text));
  const last = useRef<{ text: string; link?: ToastLink }>({ text: '' });
  if (text) last.current = { text, link };
  if (!mounted && !text) return null;
  const { text: words, link: to } = text ? { text, link } : last.current;
  return createPortal(
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[11600] max-w-[calc(100vw-32px)] px-4 py-2 rounded-lg bg-[#1E1E1E] border border-[#333333] text-sm text-white shadow-xl flex items-center gap-3 transition-opacity ${
        shown && text ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span>{words}</span>
      {to && (
        <Link to={to.to} className="shrink-0 inline-flex items-center min-h-[44px] font-medium text-[#6aa3d9] hover:text-white">
          {to.label}
        </Link>
      )}
    </div>,
    document.body,
  );
};

export const InlineNotice: React.FC<{ tone: 'good' | 'bad'; onDismiss?: () => void; className?: string; children: React.ReactNode }> = ({ tone, onDismiss, className = '', children }) => (
  <div
    role={tone === 'bad' ? 'alert' : 'status'}
    className={`text-sm rounded px-3 py-2 border flex items-start gap-3 ${tone === 'good' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-300'} ${className}`}
  >
    <span className="flex-1">{children}</span>
    {onDismiss && (
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="p-0.5 -mr-1 opacity-70 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);
