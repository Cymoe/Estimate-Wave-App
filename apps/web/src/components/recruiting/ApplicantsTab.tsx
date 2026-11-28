import React, { useEffect, useState } from 'react';
import { recruitingAPI, type RecruitApplicant, type RecruitClient, type RecruitThread } from '../../lib/api';
import { Dialog, input, primary, secondary } from '../ops/ui';
import { errorText, STATUS_LABEL, when } from './labels';
import { Answers, ScoreBadge, Thread } from './shared';

/**
 * Text the rep yourself, from Jordan's number. Sending takes the conversation
 * from Jordan until it's handed back.
 */
function PersonReply({ applicantId, status, onError }: { applicantId: string; status: string; onError: (e: string | null) => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = status === 'flagged';
  if (status === 'opted_out') return <p className="text-xs text-gray-500">They texted STOP: nothing can be sent to them.</p>;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await recruitingAPI.reply(applicantId, body);
      setBody('');
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const handBack = async () => {
    onError(null);
    try {
      await recruitingAPI.handBack(applicantId);
    } catch (err) {
      onError(errorText(err));
    }
  };
  return (
    <div className="space-y-2" data-testid="person-reply">
      <form onSubmit={send} className="flex gap-2">
        <input className={`${input} flex-1`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Text them yourself…" aria-label="Your text to the rep" maxLength={1000} />
        <button type="submit" className={primary} disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {mine ? (
          <>
            <span>You have this conversation: Jordan stays quiet, and their replies are texted to the flag phones.</span>
            <button type="button" className={secondary} onClick={() => void handBack()}>
              Hand back to Jordan
            </button>
          </>
        ) : (
          <span>Sent from Jordan&apos;s number. Sending takes over from Jordan until you hand it back.</span>
        )}
      </div>
    </div>
  );
}

/** One applicant: the whole conversation, what they said, the notes, and attendance. */
function ApplicantDialog({ applicantId, onClose }: { applicantId: string; onClose: () => void }) {
  const [t, setT] = useState<RecruitThread | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => recruitingAPI.watchThread(applicantId, setT, (e) => setError(e.message)), [applicantId]);
  const mark = async (showed: boolean) => {
    try {
      await recruitingAPI.markAttendance(applicantId, showed);
    } catch (err) {
      setError(errorText(err));
    }
  };
  const outcome = async (picked: 'hired' | 'not_hired') => {
    try {
      // Tapping the one that's on takes it off.
      await recruitingAPI.markOutcome(applicantId, t?.applicant.outcome === picked ? null : picked);
    } catch (err) {
      setError(errorText(err));
    }
  };
  const a = t?.applicant;
  const interviewed = a && (a.status === 'interviewed' || a.outcome || (a.status === 'booked' && a.interviewAt && Date.parse(a.interviewAt) <= Date.now()));
  return (
    <Dialog title={a ? a.name : 'Applicant'} onClose={onClose} wide>
      {t === undefined && <p className="text-sm text-gray-400">Loading…</p>}
      {t === null && <p className="text-sm text-gray-400">This applicant is gone.</p>}
      {a && t && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ScoreBadge score={a.score} />
            <span className="text-gray-200">{a.outcome === 'hired' ? 'Hired' : (STATUS_LABEL[a.status] ?? a.status)}</span>
            <span className="text-gray-500">
              · {a.client} · ad {a.sourceAdId} · {a.phone}
              {a.demo ? ' · demo: scripted, never texted' : ''}
            </span>
          </div>
          {a.interviewAt && <p className="text-sm text-gray-300">Interview {new Date(a.interviewAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
          {a.status === 'booked' && (
            <div className="flex gap-2">
              <button type="button" className={primary} onClick={() => void mark(true)}>
                Showed
              </button>
              <button type="button" className={secondary} onClick={() => void mark(false)}>
                No-show (texts a rebook link)
              </button>
            </div>
          )}
          {interviewed && (
            <div className="flex flex-wrap items-center gap-2" data-testid="outcome">
              <span className="text-sm text-gray-400">After the interview:</span>
              {(['hired', 'not_hired'] as const).map((o) => (
                <button key={o} type="button" aria-pressed={a.outcome === o} className={a.outcome === o ? primary : secondary} onClick={() => void outcome(o)}>
                  {o === 'hired' ? 'Hired' : 'Not hired'}
                </button>
              ))}
            </div>
          )}
          {a.notes && <p className="text-sm text-gray-300 whitespace-pre-wrap border-l-2 border-[#336699] pl-3">{a.notes}</p>}
          <Answers answers={a.answers} />
          <Thread messages={t.messages} name={a.name} />
          <PersonReply applicantId={a.id} status={a.status} onError={setError} />
        </div>
      )}
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
    </Dialog>
  );
}

export function ApplicantsTab({ clients, openId, onOpen }: { clients: RecruitClient[] | null; openId: string | null; onOpen: (id: string | null) => void }) {
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [score, setScore] = useState('');
  const [rows, setRows] = useState<RecruitApplicant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    return recruitingAPI.watchApplicants({ clientId: clientId || undefined, status: status || undefined, score: score || undefined }, setRows, (e) => setError(e.message));
  }, [clientId, status, score]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className={input} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
          <option value="">All clients</option>
          {clients?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Every status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className={input} value={score} onChange={(e) => setScore(e.target.value)} aria-label="Score">
          <option value="">Every score</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="none">Not scored yet</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {rows === null && !error && <p className="text-sm text-gray-400">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-gray-400">No applicants here yet. They show up as ads send them in.</p>}
      <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded">
        {rows?.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onOpen(a.id)} className="w-full text-left px-3 py-3 flex items-start gap-3 [@media(hover:hover)]:hover:bg-[#1A1A1A]" data-testid="recruit-applicant">
              <ScoreBadge score={a.score} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium text-white">{a.name}</span>
                  {a.demo && <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-[#333] rounded px-1">demo</span>}
                  <span className={`text-xs ${a.outcome === 'hired' ? 'text-emerald-300' : 'text-gray-400'}`}>{a.outcome === 'hired' ? 'Hired' : (STATUS_LABEL[a.status] ?? a.status)}</span>
                  <span className="text-xs text-gray-500">
                    · {a.client} · ad {a.sourceAdId}
                  </span>
                </span>
                {a.lastText && (
                  <span className="block text-xs text-gray-500 truncate">
                    {a.lastText.direction === 'out' ? 'Jordan: ' : ''}
                    {a.lastText.body}
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-500 shrink-0">{when(a.lastText?.at ?? a.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {openId && <ApplicantDialog applicantId={openId} onClose={() => onOpen(null)} />}
    </div>
  );
}
