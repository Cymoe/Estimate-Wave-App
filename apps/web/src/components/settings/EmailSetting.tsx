import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { emailAPI, type MailboxInfo } from '../../lib/api';
import { connectGmail, GMAIL_RESULT } from '../../lib/gmailConnect';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : "That didn't work");

/**
 * Settings → Email: the company's own Gmail, connected once with Google's
 * send-only permission, which Outreach emails go out from; its daily limit,
 * and what's still missing (the street address the footer needs).
 */
export const EmailSetting: React.FC<{ organizationId: string; result?: string | null }> = ({ organizationId, result }) => {
  const [m, setM] = useState<MailboxInfo | null>(null);
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(result ? (GMAIL_RESULT[result] ?? null) : null);

  useEffect(
    () =>
      emailAPI.watchMailbox(
        organizationId,
        (next) => {
          setM(next);
          setCap((c) => c || String(next.connected?.dailyCap ?? ''));
        },
        (err) => setNote({ text: errorText(err), good: false }),
      ),
    [organizationId],
  );

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      if (done) setNote({ text: done, good: true });
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    } finally {
      setBusy(false);
    }
  };

  const box = 'bg-[#1A1A1A] rounded-lg p-6 space-y-4';
  if (!m) return <div className={box}><p className="text-sm text-gray-500">Loading…</p></div>;
  const ready = m.setupMissing.length === 0;
  return (
    <div className={box} data-testid="email-setting">
      <div>
        <h2 className="text-lg font-semibold text-white">Email</h2>
        <p className="text-sm text-gray-400">
          Outreach emails go out from your own Gmail, in your name. Webb Leads can only send: it never reads your inbox.
        </p>
      </div>
      {note && (
        <p className={`text-sm ${note.good ? 'text-emerald-300' : 'text-red-300'}`} role={note.good ? 'status' : 'alert'}>
          {note.text}
        </p>
      )}
      {m.connected ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Mail className="w-5 h-5 text-[#7fb0e0]" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-white">Connected as {m.connected.email}</p>
              <p className="text-xs text-gray-500">
                {m.today} sent or booked today · replies {m.replies ? 'come back to Outreach and go to Leads' : 'go straight to your Gmail'}
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => void act(() => emailAPI.disconnect(organizationId), 'Gmail disconnected. Emails waiting to go are held until you connect again.')} className="px-3 min-h-[40px] text-sm text-gray-300 hover:text-white border border-[#333333] hover:bg-[#2A2A2A] disabled:opacity-50">
              Disconnect
            </button>
          </div>
          <label className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
            Send at most
            <input
              type="number"
              min={1}
              max={200}
              inputMode="numeric"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="w-20 h-9 bg-black border border-[#333333] px-2 text-white text-base md:text-sm"
              aria-label="Emails a day"
            />
            a day, on weekdays 8 to 5 Central
            <button
              type="button"
              disabled={busy || Number(cap) === m.connected.dailyCap || !(Number(cap) >= 1)}
              onClick={() => void act(() => emailAPI.setDailyCap(organizationId, Number(cap)), 'Saved')}
              className="px-3 min-h-[36px] text-sm text-white bg-[#336699] hover:bg-[#2A5580] disabled:opacity-40"
            >
              Save
            </button>
          </label>
          <p className="text-xs text-gray-500">Around 30 a day keeps a new Gmail out of spam folders. Go higher slowly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {m.lost && <p className="text-sm text-amber-300">{m.lost.email} isn&apos;t connected any more: {m.lost.why}</p>}
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => void act(() => connectGmail(organizationId, '/settings/organization?tab=email'))}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium text-white bg-[#336699] hover:bg-[#2A5580] disabled:opacity-40"
            data-testid="connect-gmail"
          >
            <Mail className="w-4 h-4" /> {m.lost ? 'Connect Gmail again' : 'Connect Gmail'}
          </button>
          {!ready && <p className="text-xs text-gray-500">Email isn&apos;t switched on for Webb Leads yet (missing {m.setupMissing.join(' and ')}).</p>}
        </div>
      )}
      <div className="border-t border-[#333333] pt-4 text-sm">
        {m.postal ? (
          <p className="text-gray-400">Every email ends with your company&apos;s address, as the law asks: {m.postal}</p>
        ) : (
          <p className="text-amber-300">
            Add your company&apos;s street address under General before sending: the law asks every email to carry it.
          </p>
        )}
      </div>
    </div>
  );
};
