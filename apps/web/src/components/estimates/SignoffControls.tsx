import { withLang } from '../../../convex/lib/i18n';
import { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { signoffsAPI, type Signoff, type SignoffKind } from '../../lib/api';
import { copyText } from './estimateActions';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const signoffLink = (token: string) => `${window.location.origin}/share/signoff/${token}`;

/** Hands the client the link: the share sheet on a phone or iPad, else copied. */
async function share(signoff: Signoff, clientName?: string, lang: 'en' | 'es' = 'en') {
  const url = withLang(signoffLink(signoff.token), lang);
  if (typeof navigator.share === 'function') {
    try {
      const first = clientName?.split(' ')[0];
      const what = lang === 'es' ? (signoff.kind === 'affidavit' ? 'declaración de finalización' : 'orden de cambio') : signoff.name.toLowerCase();
      const text = lang === 'es' ? `${first ? `Hola ${first}, aquí` : 'Aquí'} está la ${what} para firmar:` : `${first ? `Hi ${first}, here` : 'Here'}'s the ${what} to sign:`;
      await navigator.share({ title: `${signoff.name} ${signoff.number}`, text, url });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'closed';
    }
  }
  await copyText(url);
  return 'copied';
}

/**
 * Sending a change order or the affidavit for the client to sign, once the
 * estimate is signed: where the latest one stands, and Send / Send again.
 */
export function SignoffControls({
  estimateId,
  kind,
  clientName,
  clientLanguage,
  disabledReason,
}: {
  estimateId: string;
  kind: SignoffKind;
  clientName?: string;
  clientLanguage?: 'en' | 'es';
  /** Why it can't be sent yet (for example, nothing has changed). */
  disabledReason?: string;
}) {
  const [latest, setLatest] = useState<Signoff | null>(null);
  const [completionDate, setCompletionDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await signoffsAPI.forEstimate(estimateId);
      setLatest(all.find((s) => s.kind === kind && s.status !== 'cancelled') ?? null);
    } catch {
      setLatest(null);
    }
  }, [estimateId, kind]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      const sent = await signoffsAPI.request(estimateId, kind, kind === 'affidavit' ? completionDate : undefined);
      await load();
      const how = await share(sent, clientName, clientLanguage);
      setNote(how === 'copied' ? 'Link copied. Paste it into a text or email to your client.' : how === 'shared' ? 'Sent.' : null);
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const status = latest
    ? latest.status === 'signed'
      ? `Signed by ${latest.signerName} on ${day(latest.signedAt)}`
      : `Sent ${day(latest.createdAt)} · waiting for the signature`
    : disabledReason ?? 'Not sent yet';

  return (
    <div className="px-4 py-3 border-t border-[#262626] bg-[#151515] flex flex-wrap items-center gap-2 text-sm" data-testid={`signoff-${kind}`}>
      <span className={`flex-1 min-w-[10rem] ${latest?.status === 'signed' ? 'text-green-400' : 'text-gray-400'}`}>{status}</span>
      {latest && latest.status !== 'cancelled' && (
        <a href={signoffLink(latest.token)} target="_blank" rel="noopener noreferrer" className="text-[#336699] hover:text-white underline-offset-2 hover:underline">
          {latest.status === 'signed' ? 'View signed' : 'View'}
        </a>
      )}
      {latest?.status === 'sent' && (
        <button type="button" disabled={busy} onClick={() => share(latest, clientName, clientLanguage).then((how) => how === 'copied' && setNote('Link copied.'))} className="text-gray-300 hover:text-white underline underline-offset-2">
          Copy link
        </button>
      )}
      {kind === 'affidavit' && latest?.status !== 'signed' && (
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          Finished
          <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} aria-label="Completion date" className="bg-[#0A0A0A] border border-[#333] px-2 py-1 text-sm text-white" />
        </label>
      )}
      {latest?.status !== 'signed' && (
        <button
          type="button"
          disabled={busy || Boolean(disabledReason)}
          onClick={send}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {busy ? 'Sending…' : latest ? 'Send again' : 'Send for signature'}
        </button>
      )}
      {note && <p className="basis-full text-xs text-gray-400" role="status">{note}</p>}
    </div>
  );
}
