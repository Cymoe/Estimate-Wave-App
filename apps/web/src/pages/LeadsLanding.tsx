import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SUPPORT_EMAIL } from '../../convex/lib/support';
import { ArrowDown, ArrowRight, Check, PhoneCall, Megaphone, Smartphone } from 'lucide-react';
import { applicationsAPI } from '../lib/api';
import { AuthButtons } from '../components/auth/AuthButtons';
import { Dialog } from '../components/ops/ui';
import { DEFAULT_PLAN } from '../../convex/lib/plan';
import { FUNDING_TIERS, MIN_FUNDING_CENTS, bonusFor } from '../../convex/lib/funding';

/**
 * The page a contractor lands on from an ad: what Webb Leads sells, the four
 * ways to buy, and a short form to apply. Signed-out visitors to / see it;
 * /apply opens it on the form. No self-serve sign-up: the owner approves an
 * application from Ops, which sets the company up and invites the applicant.
 */

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

const WAYS = [
  {
    id: 'bids',
    n: '01',
    name: 'Standing bids',
    short: 'Set your bid per lead. The next confirmed lead in your county is yours the second it lands.',
    long:
      'Tell us the most you will pay for a lead in each county and trade. When our team confirms a homeowner there, the highest funded bid wins it on the spot and the lead is texted and emailed to you. No auction to watch, no refresh. Lose a bid and you keep your money.',
  },
  {
    id: 'marketplace',
    n: '02',
    name: 'Marketplace',
    short: 'Pick leads one at a time. Prices drop until someone buys.',
    long:
      'Leads nobody has a standing bid on go to the Marketplace. Each one shows the trade, the county and what the homeowner asked for. The price starts high and steps down over the day, so you choose between paying more to be first or waiting for a better price.',
  },
  {
    id: 'vault',
    n: '03',
    name: 'The Vault',
    short: 'Leads a week old or more, included with the Pro plan.',
    long:
      'A lead that sits unsold for a week moves to the Vault. They are not fresh, and we say so, but a homeowner who asked for a quote last week is still a homeowner who wants the work done. Pro plan companies claim them from their included claims.',
  },
  {
    id: 'plan',
    n: '04',
    name: 'Pro plan',
    short: `${money(DEFAULT_PLAN.monthlyCents)} a month from your balance, ${DEFAULT_PLAN.claimsIncluded} Vault claims included.`,
    long: `${money(DEFAULT_PLAN.monthlyCents)} a month, paid from your lead balance, opens the Vault: ${DEFAULT_PLAN.claimsIncluded} claims included every month and ${money(DEFAULT_PLAN.extraClaimCents)} each after that. Bids and the Marketplace work the same with or without it.`,
  },
] as const;

const field =
  'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400';

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const LeadsLanding: React.FC<{ scrollTo?: 'apply' }> = ({ scrollTo: target }) => {
  // A signed-out tap on an alert link lands here with ?next=: open sign-in straight away.
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  const [signIn, setSignIn] = useState(Boolean(next));
  useEffect(() => {
    if (target) document.getElementById(target)?.scrollIntoView();
  }, [target]);
  // Sign-in sent back an error (Google refused, a link expired): say it instead of a blank page.
  const authError = searchParams.get('error') ?? searchParams.get('error_description');
  const signInTitle = !next ? 'Sign in' : /^\/leads\?(.*&)?lead=/.test(next) ? 'Sign in to see your lead' : 'Sign in to get back where you were';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/85 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <a href="#top" className="font-semibold tracking-tight text-lg">
            Webb Leads<span className="text-emerald-400">.</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/70" aria-label="Ways to buy">
            {WAYS.map((w) => (
              <button key={w.id} type="button" onClick={() => scrollTo(w.id)} className="hover:text-white">
                {w.name}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSignIn(true)} className="text-sm text-white/70 hover:text-white px-3 py-1.5">
              Sign in
            </button>
            <button type="button" onClick={() => scrollTo('apply')} className="text-sm font-medium bg-emerald-400 text-black rounded-full px-4 py-1.5 hover:bg-emerald-300">
              Apply
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[40rem] h-[40rem] rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" aria-hidden="true" />
          <div className="max-w-6xl mx-auto px-4 pt-14 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center">
            <div>
              <p className="flex items-center gap-2 font-mono text-[11px] md:text-xs uppercase tracking-[0.2em] text-emerald-400 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Attention: painters, landscapers, concrete crews, builders, remodelers &amp; lighting companies in West Texas
              </p>
              <h1 className="font-condensed font-black uppercase leading-[0.92] text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-tight">
                Stop wondering where your <span className="text-emerald-400">next job</span> is coming from.
              </h1>
              <p className="mt-6 text-lg text-white/70 max-w-xl">
                Four ways to buy homeowner leads in your county. <span className="text-white font-medium">One system built to keep your crews busy.</span>
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollTo('bids')}
                  className="inline-flex items-center gap-2 bg-emerald-400 text-black font-semibold rounded-full px-6 py-3 hover:bg-emerald-300"
                >
                  See your options <ArrowDown className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => scrollTo('apply')} className="inline-flex items-center gap-2 text-white/80 hover:text-white px-4 py-3">
                  Apply now <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/10 to-transparent p-5 md:p-6">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-white/60 mb-4">
                <span>One lead system</span>
                <span>4 ways in</span>
              </div>
              <ol className="space-y-2">
                {WAYS.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(w.id)}
                      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left hover:border-emerald-400/50"
                    >
                      <span className="font-mono text-xs text-emerald-400 w-6">{w.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{w.name}</span>
                        <span className="block text-xs text-white/60 truncate">{w.short}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-white/40 flex-shrink-0" />
                    </button>
                  </li>
                ))}
              </ol>
              <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 text-xs text-white/70">
                Every lead starts with a real homeowner who asked for a quote. Our team confirms it by phone before it reaches you.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-14 md:py-20">
            <h2 className="font-condensed font-bold uppercase text-3xl md:text-4xl tracking-tight mb-8">How it works</h2>
            <ol className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Megaphone, title: 'We run the ads', text: 'Homeowners in your county see our ads and ask for a quote on the work they need done.' },
                { icon: PhoneCall, title: 'Our team calls first', text: 'A real person confirms the homeowner, the job and the address before anything is sent. A bad lead reported within 3 days is credited back.' },
                { icon: Smartphone, title: 'You get a text and an email', text: 'Name, phone, address and what they asked for, the moment it is yours. Tap "Got it" and go quote the job.' },
              ].map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-white/10 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-9 h-9 rounded-full bg-emerald-400/15 text-emerald-400 flex items-center justify-center">
                      <step.icon className="w-4 h-4" />
                    </span>
                    <span className="font-mono text-xs text-white/50">0{i + 1}</span>
                  </div>
                  <h3 className="font-medium text-lg">{step.title}</h3>
                  <p className="mt-1 text-sm text-white/65">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The four ways */}
        {WAYS.map((w, i) => (
          <section key={w.id} id={w.id} className="border-t border-white/10 scroll-mt-14">
            <div className="max-w-6xl mx-auto px-4 py-14 md:py-20 grid md:grid-cols-[1fr_1.4fr] gap-8 items-start">
              <div>
                <p className="font-mono text-xs text-emerald-400 mb-2">{w.n} / 04</p>
                <h2 className="font-condensed font-bold uppercase text-3xl md:text-5xl tracking-tight">{w.name}</h2>
                <p className="mt-3 text-white/70">{w.short}</p>
              </div>
              <div>
                <p className="text-white/80 leading-relaxed">{w.long}</p>
                {i === 0 && (
                  <ul className="mt-5 space-y-2 text-sm text-white/70">
                    {[
                      `Load a balance of ${money(MIN_FUNDING_CENTS)} or more. It never expires.`,
                      ...FUNDING_TIERS.filter((t) => t.bonusPercent > 0).map((t) => `Load ${money(t.amountCents)} and we add ${money(bonusFor(t.amountCents))} (${t.bonusPercent}% bonus).`),
                      'A lead that turns out wrong is credited back to your balance when you tell us within 3 days.',
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ))}

        <ApplySection />
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-3 text-sm text-white/50">
          <span>Webb Leads · Midland, Texas</span>
          <span className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white">
              {SUPPORT_EMAIL}
            </a>
          </span>
        </div>
      </footer>

      {authError && (
        <p role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-[10050] max-w-[calc(100%-2rem)] px-4 py-2 rounded bg-red-600 text-white text-sm shadow-lg">
          Sign-in didn't work: {authError.replace(/[_+]/g, ' ')}. Try again, or continue with Google.
        </p>
      )}
      {signIn && (
        <Dialog title={signInTitle} onClose={() => setSignIn(false)}>
          <p className="text-sm text-gray-400 mb-4">For companies Webb Leads has set up. Use the email we approved: continue with Google, or create an account with it. New here? Apply below instead.</p>
          <div className="bg-white rounded-lg p-4">
            <AuthButtons />
          </div>
        </Dialog>
      )}
    </div>
  );
};

type Options = { trades: Array<{ slug: string; name: string }>; counties: string[]; westTexas: string[] };

/** The form. One company, one application; a second with the same phone or email is told it is already on the list. */
function ApplySection() {
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ companyName: '', contactName: '', phone: '', email: '', county: '', jobsPerMonth: '', notes: '' });
  const [trades, setTrades] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'duplicate'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applicationsAPI
      .options()
      .then(setOptions)
      .catch(() => setOptions({ trades: [], counties: [], westTexas: [] }));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleTrade = (slug: string) => setTrades((t) => (t.includes(slug) ? t.filter((x) => x !== slug) : [...t, slug]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (trades.length === 0) {
      setError('Pick at least one trade.');
      return;
    }
    setState('sending');
    try {
      const result = await applicationsAPI.submit({
        companyName: form.companyName,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        trades,
        county: form.county,
        jobsPerMonth: form.jobsPerMonth || undefined,
        notes: form.notes || undefined,
      });
      setState(result.duplicate ? 'duplicate' : 'sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Please try again.");
      setState('idle');
    }
  };

  const west = new Set(options?.westTexas ?? []);
  const rest = (options?.counties ?? []).filter((c) => !west.has(c));

  return (
    <section id="apply" className="border-t border-white/10 scroll-mt-14">
      <div className="max-w-6xl mx-auto px-4 py-14 md:py-20 grid md:grid-cols-[1fr_1.4fr] gap-8 items-start">
        <div>
          <p className="font-mono text-xs text-emerald-400 mb-2">Join the Webb Leads Network</p>
          <h2 className="font-condensed font-bold uppercase text-3xl md:text-5xl tracking-tight">Get leads in your county</h2>
          <p className="mt-3 text-white/70">
            Tell us your trade and county. We call you within one business day, set up your account and send a link to load your balance. No contract, no monthly fee unless you want the Pro plan.
          </p>
        </div>

        {state === 'sent' || state === 'duplicate' ? (
          <div role="status" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6">
            <h3 className="text-xl font-semibold">{state === 'sent' ? "You're in the queue" : "You're already on the list"}</h3>
            <p className="mt-2 text-white/75">
              {state === 'sent'
                ? "We'll call you within one business day to set up your account."
                : 'We have your application and will call you within one business day.'}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-4" aria-label="Apply">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm text-white/70 mb-1">Company</span>
                <input required value={form.companyName} onChange={set('companyName')} className={field} placeholder="Basin Paint Co." />
              </label>
              <label className="block">
                <span className="block text-sm text-white/70 mb-1">Your name</span>
                <input required value={form.contactName} onChange={set('contactName')} className={field} placeholder="Ana Ruiz" />
              </label>
              <label className="block">
                <span className="block text-sm text-white/70 mb-1">Phone</span>
                <input required type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} className={field} placeholder="(432) 555-0199" />
              </label>
              <label className="block">
                <span className="block text-sm text-white/70 mb-1">Email</span>
                <input required type="email" value={form.email} onChange={set('email')} className={field} placeholder="you@company.com" />
              </label>
            </div>

            <fieldset>
              <legend className="block text-sm text-white/70 mb-2">Trades you want leads for</legend>
              {options === null ? (
                <p className="text-sm text-white/50">Loading trades…</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {options.trades.map((t) => {
                    const on = trades.includes(t.slug);
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTrade(t.slug)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-emerald-400 bg-emerald-400 text-black' : 'border-white/20 text-white/80 hover:border-white/50'}`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm text-white/70 mb-1">County</span>
                <select required value={form.county} onChange={set('county')} className={field} aria-label="County">
                  <option value="" disabled>
                    Pick a county
                  </option>
                  {options && options.westTexas.length > 0 && (
                    <optgroup label="West Texas">
                      {options.westTexas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {rest.length > 0 && (
                    <optgroup label="Rest of Texas">
                      {rest.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <label className="block">
                <span className="block text-sm text-white/70 mb-1">Jobs you can take a month (optional)</span>
                <input value={form.jobsPerMonth} onChange={set('jobsPerMonth')} className={field} placeholder="e.g. 6" />
              </label>
            </div>

            <label className="block">
              <span className="block text-sm text-white/70 mb-1">Anything else (optional)</span>
              <textarea value={form.notes} onChange={set('notes')} rows={3} className={field} placeholder="Crew size, areas you cover, the jobs you want most…" />
            </label>

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            <button type="submit" disabled={state === 'sending'} className="w-full sm:w-auto bg-emerald-400 text-black font-semibold rounded-full px-6 py-3 hover:bg-emerald-300 disabled:opacity-50">
              {state === 'sending' ? 'Sending…' : 'Apply for leads'}
            </button>
            <p className="text-xs text-white/50">
              By applying you agree to a call and a text from Webb Leads about your account. Nothing is charged until you load a balance.{' '}
              <Link to="/terms" className="underline hover:text-white">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="underline hover:text-white">
                Privacy
              </Link>
              .
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

export default LeadsLanding;
