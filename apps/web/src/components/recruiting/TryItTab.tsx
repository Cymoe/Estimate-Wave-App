import { useEffect, useState } from 'react';
import { recruitingAPI, type RecruitClient, type RecruitThread } from '../../lib/api';
import { input, primary, secondary } from '../ops/ui';
import { errorText, STATUS_LABEL } from './labels';
import { Answers, ScoreBadge, Thread } from './shared';

/**
 * Play a rep against Jordan: the real brief, the real tools, the real loop,
 * with nothing texted, nothing booked for real and nothing counted. How the
 * brief gets tested.
 */
export function TryItTab({ clients }: { clients: RecruitClient[] | null }) {
  const [convo, setConvo] = useState<RecruitThread | null | undefined>(undefined);
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => recruitingAPI.watchTryIt(setConvo, (e) => setError(e.message)), []);
  useEffect(() => {
    if (!clientId && clients?.length) setClientId(clients[0].id);
  }, [clients, clientId]);

  const act = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    void act(() => recruitingAPI.tryItSend(body));
  };

  if (clients && clients.length === 0) return <p className="text-sm text-gray-400">Add a client first (Clients tab): Jordan needs a role, a city and a comp sheet to screen for.</p>;

  const a = convo?.applicant;
  const done = a && (a.status === 'opted_out' || a.status === 'flagged');
  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-400">You play the rep; Jordan answers with the real brief and tools. Nothing is texted, booked or counted.</p>
      {!a ? (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <select className={input} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client to test">
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}: {c.role}
              </option>
            ))}
          </select>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rep's name (Test Rep)" aria-label="Rep's name" />
          <button type="button" className={primary} disabled={busy || !clientId} onClick={() => void act(() => recruitingAPI.tryItStart(clientId, name))}>
            Apply as this rep
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ScoreBadge score={a.score} />
            <span className="text-gray-200">{STATUS_LABEL[a.status] ?? a.status}</span>
            <span className="text-gray-500">· {a.client}</span>
            {a.replying && <span className="text-[#7fb0e0]">Jordan is typing…</span>}
            <button type="button" className={`${secondary} ml-auto`} disabled={busy} onClick={() => void act(() => recruitingAPI.tryItReset())}>
              Start over
            </button>
          </div>
          <div className="border border-[#2A2A2A] rounded p-3 bg-[#0d0d0d] min-h-[200px]">
            {convo && convo.messages.length === 0 ? <p className="text-sm text-gray-500">Jordan&apos;s first text is on its way…</p> : convo && <Thread messages={convo.messages} name={a.name} />}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={done ? 'Jordan has stopped texting this rep' : "Text back as the rep…"} aria-label="Your text as the rep" disabled={busy} />
            <button type="submit" className={primary} disabled={busy || !text.trim()}>
              Send
            </button>
          </form>
          {a.notes && <p className="text-sm text-gray-300 whitespace-pre-wrap border-l-2 border-[#336699] pl-3">{a.notes}</p>}
          <Answers answers={a.answers} />
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
