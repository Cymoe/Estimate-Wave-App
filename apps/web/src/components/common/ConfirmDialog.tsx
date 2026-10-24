import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The app's own "are you sure?" dialog, in place of the browser's confirm().
 * The browser one titles itself with the site address, can't be styled, and on
 * iPad offers "Suppress dialogs", after which every confirm silently answers
 * Cancel. This one matches the app and always answers.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: 'Remove this bid?', confirmLabel: 'Remove' }))) return;
 *   ...render {confirmDialog} somewhere in the component.
 *
 * Cancel is the safe default: it has focus, Enter presses it, and Escape or a
 * tap outside cancel too.
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" (the default) makes the confirm button red, for removing and deleting. */
  tone?: 'danger' | 'default';
}

export const ConfirmDialog: React.FC<ConfirmOptions & { onAnswer: (yes: boolean) => void }> = ({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onAnswer,
}) => {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onAnswer(false);
      }
    };
    // Capture so a dialog underneath (the add-bid one, say) doesn't also see the key.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onAnswer]);
  return createPortal(
    <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[11500] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm motion-safe:animate-fade-in-plain" onClick={() => onAnswer(false)} data-testid="confirm-backdrop" />
      <div className="relative w-full max-w-sm rounded-lg border border-[#333333] bg-[#1E1E1E] p-6 shadow-2xl motion-safe:animate-row-in">
        <h3 id={titleId} className="text-base font-semibold text-white">
          {title}
        </h3>
        {message && <p className="mt-2 text-sm text-gray-400">{message}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={() => onAnswer(false)} className="px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#336699]">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#336699] hover:bg-[#2A5580]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Ask a yes/no question with the app's dialog. Returns the asker and the dialog to render. */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (yes: boolean) => void } | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );
  const answer = useCallback(
    (yes: boolean) =>
      setPending((p) => {
        p?.resolve(yes);
        return null;
      }),
    [],
  );
  const dialog = pending ? <ConfirmDialog {...pending.options} onAnswer={answer} /> : null;
  return [confirm, dialog];
}
