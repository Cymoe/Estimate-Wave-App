import type { ConfirmOptions } from './ConfirmDialog';

/**
 * The app's replacements for the browser's confirm() and alert(), callable from
 * anywhere (event handlers, helpers in .ts files) without wiring a hook in:
 *
 *   if (!(await askConfirm({ title: 'Delete this photo?', confirmLabel: 'Delete' }))) return;
 *   notify('Link copied. Paste it into a text or email to your client.');
 *
 * The browser's boxes title themselves with the site address and, on iPad,
 * offer "Block dialogs", after which every confirm quietly answers Cancel.
 * <AppDialogs /> (AppDialogsHost.tsx) is mounted once at the root and shows these instead.
 */

export type PendingConfirm = { options: ConfirmOptions; resolve: (yes: boolean) => void };
export type DialogHost = { ask: (p: PendingConfirm) => void; say: (text: string) => void };
let host: DialogHost | null = null;

/** The mounted <AppDialogs /> registers itself here; returns how to unregister. */
export function setDialogHost(next: DialogHost): () => void {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  // No host (a component rendered on its own, as in tests): fall back to the browser.
  if (!host) return Promise.resolve(window.confirm(options.message ? `${options.title}\n\n${options.message}` : options.title));
  const h = host;
  return new Promise((resolve) => h.ask({ options, resolve }));
}

/** A short message in the app's toast: a confirmation, or why something didn't work. */
export function notify(text: string): void {
  host?.say(text);
}
