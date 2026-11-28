import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, ClipboardList, Megaphone, MessageSquareText, RotateCcw } from 'lucide-react';
import { LightPage } from '../components/common/LightPage';
import { SUPPORT_EMAIL } from '../config/brand';
import { recruitingPublicAPI, type RecruitSales } from '../lib/api';

const card = 'bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]';

/** The same screening the demo in Ops plays: an applicant, from first text to booked. Shown here as a picture of the service, nothing live. */
const DEMO: Array<['in' | 'out', string]> = [
  ['out', "Hey Taylor, it's Jordan with National Sales Registry. Saw you applied for the roofing sales job. Got 2 minutes for a few quick questions? Reply STOP to opt out."],
  ['in', 'yeah sure'],
  ['out', 'Have you done door-to-door or any commission sales before?'],
  ['in', '2 summers selling pest control door to door'],
  ['out', 'Nice, that counts. Closer, setter, or both?'],
  ['in', 'closer. I closed about 40 accounts last summer'],
  ['out', 'Solid. Can you work full days Monday to Saturday, and do you have a reliable car?'],
  ['in', 'yes and yes'],
  ['out', "Love it. You're a great fit. Want to meet the team? I can do Tue at 10:00 AM or 2:00 PM."],
  ['in', '10 works'],
  ['out', "You're booked: Tue at 10:00 AM. I'll text you a reminder the night before."],
];

const STEPS = [
  { icon: Megaphone, title: 'We run your recruiting ads', body: 'Meta, video and Indeed ads written for your pay plan, tested every week. The ones that bring hires get the budget.' },
  { icon: MessageSquareText, title: 'Every applicant texted in 2 minutes', body: 'Jordan, our screener, texts each one while they still care: experience, closer or setter, schedule, a car. Day and night.' },
  { icon: CalendarCheck, title: 'A-grade reps on your calendar', body: 'The best are booked straight onto your interview calendar, with reminders. You get a note before each interview with what they said.' },
  { icon: ClipboardList, title: 'You mark who you hired', body: 'One tap per rep. A weekly report shows applicants, scores, interviews and hires by ad, so the spend follows what works.' },
];

/** The conversation, one text at a time, like it would arrive on a phone. */
function DemoPhone() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? DEMO.length : 1);
  useEffect(() => {
    if (shown >= DEMO.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), DEMO[shown][0] === 'in' ? 1800 : 1300);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <div className={`${card} p-4 max-w-sm w-full mx-auto`} data-testid="recruit-demo">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Jordan · National Sales Registry</span>
        <button type="button" onClick={() => setShown(1)} className="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-gray-800" aria-label="Replay the conversation">
          <RotateCcw className="w-3.5 h-3.5" /> Replay
        </button>
      </div>
      <ol className="mt-3 space-y-2 min-h-[22rem]" aria-live="polite">
        {DEMO.slice(0, shown).map(([dir, text], i) => (
          <li key={i} className={`flex ${dir === 'in' ? 'justify-end' : 'justify-start'}`}>
            <span className={`max-w-[85%] rounded-2xl px-3 py-2 text-[14px] leading-snug ${dir === 'in' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>{text}</span>
          </li>
        ))}
      </ol>
      {shown >= DEMO.length && <p className="mt-3 text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Scored A and booked, 2 minutes after applying.</p>}
    </div>
  );
}

/**
 * National Sales Registry's sales page, for roofing and door-to-door
 * companies: what we do, the screening as it happens, the price, and a call to book.
 * Prices and the booking link come from the deployment (recruiting/public.ts salesInfo).
 */
export default function RecruitLandingPage() {
  const [params] = useSearchParams();
  const paid = params.get('paid') === '1';
  const [info, setInfo] = useState<RecruitSales | null>(null);
  useEffect(() => {
    recruitingPublicAPI.salesInfo().then(setInfo, () => setInfo({ service: 'National Sales Registry', monthly: 2500, perHire: 250, bookingUrl: null, phone: null }));
  }, []);
  useEffect(() => {
    const before = document.title;
    document.title = 'National Sales Registry · Recruiting for door-to-door sales teams';
    return () => {
      document.title = before;
    };
  }, []);
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  const book = info?.bookingUrl ?? (info?.phone ? `sms:${info.phone}` : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Recruiting for my team')}`);
  const cta = (
    <a href={book} target={info?.bookingUrl ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-[16px] font-semibold text-white hover:bg-blue-700">
      Book a 15-minute call
    </a>
  );

  return (
    <LightPage className="bg-[#F5F6F8] text-gray-900">
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-8 sm:pt-12">
        <p className="text-sm font-semibold tracking-wide text-gray-500">{info?.service ?? 'National Sales Registry'}</p>
        {paid && (
          <div className={`${card} mt-4 p-4 flex items-start gap-3`} role="status">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[15px]">You&apos;re all set. We&apos;ll reach out today to set up your first ads and your interview calendar.</p>
          </div>
        )}
        <div className="mt-6 grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-[34px] sm:text-[44px] font-bold leading-[1.05] tracking-tight">We fill your door-knocking team.</h1>
            <p className="mt-4 text-[17px] text-gray-600">
              Recruiting for roofing and door-to-door sales companies. We run the ads, text every applicant within two minutes, and put screened, A-grade reps on your
              interview calendar.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {cta}
              <span className="text-sm text-gray-500">No contract: month to month.</span>
            </div>
          </div>
          <DemoPhone />
        </div>

        <h2 className="mt-14 text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className={`${card} p-5`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Icon className="w-5 h-5" /> Step {i + 1}
              </span>
              <h3 className="mt-2 text-[17px] font-semibold">{title}</h3>
              <p className="mt-1 text-[15px] text-gray-600">{body}</p>
            </li>
          ))}
        </ol>

        <section className={`${card} mt-10 p-6 sm:p-8`} data-testid="recruit-price">
          <h2 className="text-2xl font-bold tracking-tight">Pricing</h2>
          <p className="mt-3 text-[32px] font-bold">
            {money(info?.monthly ?? 2500)}
            <span className="text-[17px] font-medium text-gray-500">/month</span>
            {(info?.perHire ?? 250) > 0 && <span className="text-[17px] font-medium text-gray-700"> + {money(info?.perHire ?? 250)} per hire</span>}
          </p>
          <ul className="mt-4 space-y-1 text-[15px] text-gray-700">
            <li>Ads written and tested every week, screening around the clock, interviews booked for you</li>
            <li>A note before every interview, and a weekly report by ad</li>
            <li>You only pay the hire fee for reps you mark hired</li>
            <li>Ad spend isn&apos;t included: it goes to Meta and Indeed at cost</li>
          </ul>
          <div className="mt-6">{cta}</div>
        </section>

        <footer className="mt-12 text-center text-xs text-gray-400 space-x-3">
          <Link to="/terms" className="underline underline-offset-2">
            Terms
          </Link>
          <Link to="/privacy#recruiting" className="underline underline-offset-2">
            Privacy
          </Link>
        </footer>
      </div>
    </LightPage>
  );
}
