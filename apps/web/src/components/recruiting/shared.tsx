import { Fragment } from 'react';
import type { RecruitScore } from '../../lib/api';
import { when } from './labels';

/** Bits shared by the Recruiting tabs. */

const SCORE_TONE: Record<RecruitScore, string> = {
  A: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  B: 'bg-[#336699]/20 text-[#cfe2f5] border-[#336699]/60',
  C: 'bg-[#222] text-gray-400 border-[#333]',
};

export function ScoreBadge({ score }: { score?: RecruitScore }) {
  if (!score) return <span className="inline-flex w-6 h-6 items-center justify-center text-xs text-gray-600 border border-[#333] rounded">–</span>;
  return <span className={`inline-flex w-6 h-6 items-center justify-center text-xs font-semibold border rounded ${SCORE_TONE[score]}`}>{score}</span>;
}

/** The conversation as texts: theirs on the left, Jordan's on the right. */
export function Thread({ messages, name }: { messages: Array<{ id: string; direction: 'in' | 'out'; body: string; at: string; by?: string }>; name: string }) {
  if (messages.length === 0) return <p className="text-sm text-gray-500">No texts yet.</p>;
  return (
    <ol className="space-y-2" data-testid="thread">
      {messages.map((m) => (
        <li key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${m.direction === 'out' ? 'bg-[#336699] text-white' : 'bg-[#1E1E1E] border border-[#2A2A2A] text-gray-100'}`}>
            <span className="block text-[10px] uppercase tracking-wide opacity-70 mb-0.5">
              {m.direction === 'out' ? (m.by ?? 'Jordan') : name.split(' ')[0]} · {when(m.at)}
            </span>
            {m.body}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Answers({ answers }: { answers: Record<string, string> }) {
  const rows = Object.entries(answers);
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" data-testid="answers">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="text-gray-500">{k.replace(/_/g, ' ')}</dt>
          <dd className="text-gray-200">{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
