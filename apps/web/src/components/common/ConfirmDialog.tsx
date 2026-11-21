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
  /** A second way to go ahead (asked with choose()): the buttons stack, the confirm on top, this under it, Cancel last. */
  altLabel?: string;
}

export const ConfirmDialog: React.FC<ConfirmOptions & { onAnswer: (yes: boolean) => void; onAlt?: () => void }> = ({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  tone = 'danger',
  altLabel,
  onAnswer,
  onAlt,
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
      {/* A plain fade and lift: the table rows' entrance (row-in) ends on its wash's transparent frame and kept it, which left the
          box without a background, the dimmed page showing through. */}
      <div className="relative w-full max-w-sm rounded-lg border border-[#333333] bg-[#1E1E1E] p-6 shadow-2xl motion-safe:animate-appear" data-testid="confirm-panel">
        <h3 id={titleId} className="text-base font-semibold text-white">
          {title}
        </h3>
        {message && <p className="mt-2 text-sm text-gray-400">{message}</p>}
        {altLabel ? (
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onAnswer(true)}
              className={`w-full px-4 py-2.5 text-sm font-medium text-white rounded-lg ${tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#336699] hover:bg-[#2A5580]'}`}
            >
              {confirmLabel}
            </button>
            <button type="button" onClick={onAlt} className="w-full px-4 py-2.5 text-sm font-medium text-red-300 border border-red-500/40 hover:bg-red-500/10 rounded-lg">
              {altLabel}
            </button>
            <button ref={cancelRef} type="button" onClick={() => onAnswer(false)} className="w-full px-4 py-2.5 text-sm text-gray-300 hover:text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#336699]">
              {cancelLabel}
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>,
    document.body,
  );
};

/** What choose() answers: the confirm button, the second one, or neither. */
export type Choice = 'confirm' | 'alt' | null;

/**
 * Ask a yes/no question with the app's dialog. Returns the asker and the dialog to render; the third,
 * choose(), asks with two ways to go ahead (altLabel is the second) and says which was picked.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode, (options: ConfirmOptions & { altLabel: string }) => Promise<Choice>] {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (answer: Choice) => void } | null>(null);
  const choose = useCallback((options: ConfirmOptions & { altLabel: string }) => new Promise<Choice>((resolve) => setPending({ options, resolve })), []);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve: (answer) => resolve(answer === 'confirm') })),
    [],
  );
  const settle = useCallback(
    (answer: Choice) =>
      setPending((p) => {
        p?.resolve(answer);
        return null;
      }),
    [],
  );
  const answer = useCallback((yes: boolean) => settle(yes ? 'confirm' : null), [settle]);
  const alt = useCallback(() => settle('alt'), [settle]);
  const dialog = pending ? <ConfirmDialog {...pending.options} onAnswer={answer} onAlt={alt} /> : null;
  return [confirm, dialog, choose];
}
