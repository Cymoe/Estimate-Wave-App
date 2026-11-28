import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Signing that's always in reach on a client link: a slim bar pinned to the
 * bottom of the screen (what's being signed, and a button), and the sheet it
 * slides up with the signature box and the sign button. The sheet stays on
 * the page while closed, so a drawn signature is still there when it reopens.
 */
export function SignDock({
  summary,
  openLabel,
  title,
  closeLabel,
  buttonClass = 'bg-green-600 hover:bg-green-700',
  widthClass = 'max-w-4xl',
  children,
}: {
  summary: React.ReactNode;
  openLabel: string;
  title: string;
  closeLabel: string;
  /** The bar button's colour, matching the page's own sign button. */
  buttonClass?: string;
  /** The page's own column width, so the bar lines up with it. */
  widthClass?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const frame = requestAnimationFrame(() => heading.current?.focus());
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      window.addEventListener('keydown', onKey);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('keydown', onKey);
      };
    }
    // Back to the button that opened it, once it has been open.
    if (wasOpen.current) opener.current?.focus();
  }, [open]);

  // Visibility flips at the end of the slide, so the sheet slides out before it hides.
  const slide = { transition: 'transform 150ms ease, visibility 150ms' } as const;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] print:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        data-testid="sign-bar"
      >
        <div className={`${widthClass} mx-auto px-4 py-3 flex items-center justify-between gap-3`}>
          <div className="min-w-0 text-sm text-gray-700">{summary}</div>
          <button
            ref={opener}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={`shrink-0 px-5 py-2.5 rounded-lg text-white font-medium ${buttonClass}`}
          >
            {openLabel}
          </button>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-50 transition-opacity print:hidden ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
        data-testid="sign-backdrop"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open || undefined}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl shadow-2xl print:hidden ${
          open ? 'translate-y-0 visible' : 'translate-y-full invisible pointer-events-none'
        }`}
        style={{ ...slide, paddingBottom: 'env(safe-area-inset-bottom)' }}
        data-testid="sign-box"
      >
        <div className="p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold text-gray-900 outline-none">
              {title}
            </h3>
            <button type="button" onClick={() => setOpen(false)} aria-label={closeLabel} className="p-2 -mr-2 text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
