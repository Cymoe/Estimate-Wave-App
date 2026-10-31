import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Styles and small pieces shared by the Ops page and its tabs. */

export const input =
  'w-full bg-[#1A1A1A] border border-[#333] rounded px-3 py-2 text-white text-base md:text-sm placeholder-gray-500 focus:outline-none focus:border-[#336699]';
export const primary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-[#336699] text-white text-sm font-medium [@media(hover:hover)]:hover:bg-[#2A5580] active:bg-[#2A5580] disabled:opacity-50';
export const secondary =
  'inline-flex items-center justify-center gap-2 px-3 py-2 rounded border border-[#333] text-gray-200 text-sm [@media(hover:hover)]:hover:bg-[#222] active:bg-[#222] disabled:opacity-50';

/** A tap target at least 44px square, for icon buttons. */
export const tap = 'inline-flex items-center justify-center min-w-[44px] min-h-[44px]';

/**
 * For a panel or dialog: Escape closes it, focus moves into it when it
 * opens and back to what was focused before when it closes.
 */
export function usePanel<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);
  return ref;
}

/** A centred dialog over a dimmed page. */
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const panel = usePanel<HTMLDivElement>(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[90dvh] overflow-y-auto outline-none bg-[#121212] border border-[#2A2A2A] rounded-t-lg sm:rounded-lg shadow-2xl`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`${tap} -m-3 text-gray-400 hover:text-white`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

/** "3m ago", "2h ago", "4d ago". */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Turns whatever was thrown into one sentence for the person. */
export const describeError = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** What went wrong, where it happened. It stays until it is dismissed, so a slow read still catches it. */
export function ErrorLine({ error, onDismiss, className = '' }: { error: string | null; onDismiss: () => void; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={`flex items-start justify-between gap-3 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-sm text-red-200 ${className}`}>
      <span className="break-words">{error}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className={`${tap} -my-3 -mr-3 text-red-200/70 hover:text-white`}>
        <X className="w-4 h-4" />
      </button>
    </p>
  );
}
