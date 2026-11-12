import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LightPage } from '../components/common/LightPage';
import { recruitingPublicAPI, type RecruitHires, type RecruitOutcome } from '../lib/api';

const card = 'bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]';
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * A client's private link from the weekly report: the reps who interviewed
 * lately, and who they hired. Hires are what the ads learn from.
 */
export default function HiresPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<RecruitHires | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => recruitingPublicAPI.watchHires(token, setData, () => setData(null)), [token]);
  useEffect(() => {
    if (!data) return;
    const before = document.title;
    document.title = `Who did you hire? · ${data.company}`;
    return () => {
      document.title = before;
    };
  }, [data]);

  const mark = async (id: string, now: RecruitOutcome | null, picked: RecruitOutcome) => {
    setError(null);
    try {
      // Tapping the one that's already on takes it off.
      await recruitingPublicAPI.setHire(token, id, now === picked ? null : picked);
    } catch {
      setError('That didn’t save. Try again.');
    }
  };

  if (data === undefined) return <LightPage className="bg-[#F5F6F8] flex items-center justify-center text-gray-500">Loading…</LightPage>;
  if (data === null)
    return (
      <LightPage className="bg-[#F5F6F8] flex items-center justify-center px-6 text-center text-gray-700">
        <p>This link isn’t valid.</p>
      </LightPage>
    );

  const hired = data.reps.filter((r) => r.outcome === 'hired').length;
  return (
    <LightPage className="bg-[#F5F6F8] text-gray-900">
      <div className="mx-auto max-w-lg px-4 pb-10 pt-10 sm:pt-16">
        <p className="text-sm font-medium text-gray-500">{data.company}</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight">Who did you hire?</h1>
        <p className="mt-2 text-[15px] text-gray-500">Reps who interviewed in the last 90 days. Marking who you hired tells us which ads find your best people, so we run more of them.</p>
        {data.reps.length === 0 ? (
          <p className={`${card} mt-6 p-5 text-[15px] text-gray-500`}>No one has interviewed yet. Reps show up here after their interview.</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-gray-500">{hired === 0 ? 'None marked hired yet.' : `${hired} hired`}</p>
            <ul className={`${card} mt-2 divide-y divide-gray-100`}>
              {data.reps.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="hire-rep">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">
                      {r.name} {r.score && <span className="ml-1 rounded border border-gray-200 px-1.5 text-xs text-gray-500">{r.score}</span>}
                    </span>
                    <span className="block text-xs text-gray-500">{r.missed ? 'Missed the interview' : r.interviewAt ? `Interviewed ${day(r.interviewAt)}` : 'Interviewed'}</span>
                  </span>
                  <span className="flex overflow-hidden rounded-xl border border-gray-200 text-sm">
                    {(['hired', 'not_hired'] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={r.outcome === o}
                        onClick={() => void mark(r.id, r.outcome, o)}
                        className={`px-3 py-2 ${r.outcome === o ? (o === 'hired' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-white') : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                      >
                        {o === 'hired' ? 'Hired' : 'Not hired'}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </LightPage>
  );
}
