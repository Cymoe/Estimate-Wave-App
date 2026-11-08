import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MessageSquareText } from 'lucide-react';
import { LightPage } from '../components/common/LightPage';
import { recruitingPublicAPI, type RecruitJob } from '../lib/api';

const card = 'bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]';
const field = 'w-full rounded-xl border border-gray-200 bg-[#F5F6F8] px-3.5 py-3 text-[15px] text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white';

/** The server's refusal ("Enter a US cell number…"), or a plain fallback. */
const message = (err: unknown) => {
  const m = err instanceof Error ? err.message : '';
  return m && m.length < 200 && !/server error/i.test(m) ? m : 'That didn’t go through. Try again in a minute.';
};

/**
 * The page a recruiting ad links to: /jobs/acme?ad=acme-m1. A rep leaves a
 * name and cell, agrees to texts, and Jordan texts them within two minutes.
 * The ad's source id rides along so the numbers know which ad sent them.
 */
export default function JobApplyPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const ad = params.get('ad') ?? undefined;
  const [job, setJob] = useState<RecruitJob | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ existing: boolean } | null>(null);

  useEffect(() => {
    recruitingPublicAPI.job(slug).then(setJob, () => setJob(null));
  }, [slug]);
  useEffect(() => {
    if (!job) return;
    const before = document.title;
    document.title = `${job.role} · ${job.company}`;
    return () => {
      document.title = before;
    };
  }, [job]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await recruitingPublicAPI.apply({ slug, ad, name, phone, agreed }));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  if (job === undefined) return <LightPage className="bg-[#F5F6F8] flex items-center justify-center text-gray-500">Loading…</LightPage>;
  if (job === null)
    return (
      <LightPage className="bg-[#F5F6F8] flex items-center justify-center px-6 text-center text-gray-700">
        <p>This job isn’t taking applications right now.</p>
      </LightPage>
    );

  const first = name.trim().split(/\s+/)[0];
  return (
    <LightPage className="bg-[#F5F6F8] text-gray-900">
      <div className="mx-auto max-w-md px-4 pb-8 pt-10 sm:pt-16">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white" aria-hidden>
            {job.company.trim().charAt(0).toUpperCase()}
          </span>
          <span className="text-sm font-medium text-gray-500">{job.company} is hiring</span>
        </div>

        {done ? (
          <div className={`${card} mt-8 p-6 text-center`} data-testid="apply-done">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{done.existing ? 'You’re already in' : `You’re in${first ? `, ${first}` : ''}`}</h1>
            <p className="mt-1 text-[15px] text-gray-500">
              {done.existing ? 'Jordan from the hiring team has your number. Reply to Jordan’s text to keep going.' : `Jordan from the hiring team will text you at ${phone} in the next couple of minutes.`}
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight">{job.role}</h1>
            <p className="mt-1 text-[17px] text-gray-500">{job.city}</p>
            {job.perks && <p className="mt-3 text-[15px] text-gray-700">{job.perks}</p>}
            <p className="mt-4 flex gap-2 text-[15px] text-gray-600">
              <MessageSquareText className="h-5 w-5 shrink-0 text-blue-600" />
              Apply in 20 seconds. Jordan from the hiring team texts you a few quick questions, then sets up your interview.
            </p>
            <form onSubmit={send} className={`${card} mt-6 space-y-3 p-5`} data-testid="apply-form">
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">Your name</span>
                <input type="text" autoComplete="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">Cell phone</span>
                <input type="tel" autoComplete="tel" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} placeholder="(432) 555-0100" className={field} />
              </label>
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-gray-500">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" aria-label="I agree to get texts" />
                <span>{job.consent}</span>
              </label>
              <button
                type="submit"
                disabled={busy || !name.trim() || !phone.trim() || !agreed}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Apply'}
              </button>
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </form>
          </>
        )}

        <footer className="mt-8 space-y-2 pb-4 text-center text-xs text-gray-400">
          <p>Texts come from {job.service} for {job.company}. Reply STOP to opt out.</p>
          <p>
            <Link to="/terms" className="underline underline-offset-2">
              Terms
            </Link>
            {' · '}
            <Link to="/privacy" className="underline underline-offset-2">
              Privacy
            </Link>
          </p>
        </footer>
      </div>
    </LightPage>
  );
}
