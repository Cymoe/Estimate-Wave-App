import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Send, Share, X } from 'lucide-react';
import { portalAPI, portalUrl, type PortalView as View } from '../../lib/api';
import { shareOrCopy } from '../estimates/estimateActions';
import { PortalView } from '../portal/PortalView';
import { portalMessage, sendMessage } from '../../i18n/portal';
import { askConfirm } from '../common/appDialogs';

type Live = View & { token: string | null; queued: number };

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : "That didn't work.");

/**
 * The client's real portal, opened over the project: exactly what they see
 * now. What's queued (picks to ask for, change orders) isn't on it yet: Send
 * to {client} puts it there and hands over the link with a note.
 */
export const PortalPreviewSheet: React.FC<{
  clientId: string;
  onClose: () => void;
  /** Something was sent or the link turned off: counts elsewhere may change. */
  onChanged?: () => void;
}> = ({ clientId, onClose, onChanged }) => {
  const [view, setView] = useState<Live | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await portalAPI.preview(clientId));
    } catch {
      setView(null);
    }
  }, [clientId]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setNote(null);
    setMenu(false);
    try {
      setNote(await work());
      await load();
      onChanged?.();
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const lang = view?.client.language ?? 'en';
  const name = view?.client.name;
  const first = name?.trim().split(/\s+/)[0] || 'the client';
  const how = (shared: string) => (shared === 'copied' ? 'Link copied. Paste it into a text or email.' : shared === 'shared' ? 'Sent.' : null);

  const send = () =>
    act(async () => {
      const sent = await portalAPI.send(clientId);
      return how(await shareOrCopy(portalUrl(sent.token), 'Your job page', sendMessage(name, sent.picks, sent.changeOrders, lang)));
    });
  const share = () =>
    act(async () => {
      const token = view?.token ?? (await portalAPI.link(clientId));
      return how(await shareOrCopy(portalUrl(token), 'Your job page', portalMessage(name, lang)));
    });
  const turnOff = async () => {
    if (!(await askConfirm({ title: `Turn off ${first}'s portal link?`, message: 'The link they have stops working. Sharing again makes a new one.', confirmLabel: 'Turn off' }))) return;
    act(async () => {
      await portalAPI.turnOff(clientId);
      return 'Turned off. Share again for a new link.';
    });
  };

  const queued = view?.queued ?? 0;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Client portal" className="fixed inset-0 z-[10010] flex flex-col bg-[#F5F6F8]">
      <div className="flex-shrink-0 bg-[#1a1a1a] border-b border-[#333] px-3 py-2.5 flex items-center gap-2">
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{name ? `${name}'s portal` : 'Client portal'}</p>
          <p className="text-xs text-gray-400 truncate">
            {queued > 0
              ? `${queued} waiting to send: ${queued === 1 ? 'it shows' : 'they show'} here once you send.`
              : view?.token
                ? 'Live: exactly what they see.'
                : 'Not shared yet: this is what they’ll see.'}
          </p>
        </div>
        {view && (
          <button
            type="button"
            onClick={queued > 0 ? send : share}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
          >
            {queued > 0 ? <Send className="w-4 h-4" /> : <Share className="w-4 h-4" />}
            {busy ? 'Sending…' : queued > 0 ? `Send to ${first} (${queued})` : 'Share link'}
          </button>
        )}
        {view?.token && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} aria-label="More" className="p-2 text-gray-400 hover:text-white">
              <MoreVertical className="w-4 h-4" />
            </button>
            {menu && (
              <div className="absolute right-0 mt-1 w-44 bg-[#262626] border border-[#333] shadow-lg z-10">
                <button type="button" onClick={turnOff} className="w-full text-left px-3 py-2.5 text-sm text-red-300 hover:bg-[#333]">
                  Turn off link
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {note && (
        <p className="flex-shrink-0 bg-[#22272d] px-4 py-2 text-sm text-gray-200" role="status">
          {note}
        </p>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain text-gray-900">
        <div className="mx-auto max-w-xl px-4 py-8">
          {view === undefined ? (
            <p className="text-gray-500">Loading…</p>
          ) : view === null ? (
            <p className="text-gray-600">The portal couldn&rsquo;t load. Try again in a moment.</p>
          ) : (
            <PortalView view={view} lang={lang} preview />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
