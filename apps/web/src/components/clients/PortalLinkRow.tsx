import React, { useEffect, useState } from 'react';
import { portalAPI, portalUrl } from '../../lib/api';
import { shareOrCopy } from '../estimates/estimateActions';
import { portalMessage } from '../../i18n/portal';

/**
 * The client's portal link on their page: share it (made the first time), or
 * turn it off if it got passed around. The next share makes a new one.
 */
export const PortalLinkRow: React.FC<{ clientId: string; clientName?: string; language?: 'en' | 'es' }> = ({
  clientId,
  clientName,
  language = 'en',
}) => {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    portalAPI
      .current(clientId)
      .then((t) => live && setToken(t))
      .catch(() => live && setToken(null));
    return () => {
      live = false;
    };
  }, [clientId]);

  const share = async () => {
    setBusy(true);
    setNote(null);
    try {
      const next = token ?? (await portalAPI.link(clientId));
      setToken(next);
      const how = await shareOrCopy(portalUrl(next), 'Your job page', portalMessage(clientName, language));
      if (how === 'copied') setNote('Link copied. Paste it into a text or email to your client.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!window.confirm('Turn off this portal link? The link they have stops working. Sharing again makes a new one.')) return;
    setBusy(true);
    setNote(null);
    try {
      await portalAPI.turnOff(clientId);
      setToken(null);
      setNote('Turned off. Share again for a new link.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 w-full text-sm" data-testid="portal-link-row">
      <span className="text-gray-400">{token ? 'On' : 'Not shared yet'}</span>
      <button type="button" onClick={share} disabled={busy || token === undefined} className="text-[#6b9bd1] hover:text-white disabled:opacity-50">
        {token ? 'Share link' : 'Get link'}
      </button>
      {token && (
        <button type="button" onClick={turnOff} disabled={busy} className="text-gray-400 hover:text-red-300 disabled:opacity-50">
          Turn off
        </button>
      )}
      {note && (
        <span className="basis-full text-xs text-gray-500" role="status">
          {note}
        </span>
      )}
    </div>
  );
};
