import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  Gift,
  Mail,
  Palette,
  PenLine,
  Phone,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import { portalAPI, referralUrl, type PortalAsk, type PortalView as View } from '../../lib/api';
import { shareOrCopy } from '../estimates/estimateActions';
import { formatCurrency } from '../../utils/format';
import { formatDay } from '../../i18n/lang';
import { PORTAL } from '../../i18n/portal';
import { refusalText } from '../../i18n/share';
import type { Lang } from '../../../convex/lib/i18n';

type Strings = (typeof PORTAL)['en'];
type SelectionAsk = Extract<PortalAsk, { kind: 'selection' }>;
type Job = View['jobs'][number];

// A light card app: white rounded cards with a soft shadow on a pale page.
const card = 'bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]';
const field =
  'w-full rounded-xl border border-gray-200 bg-[#F5F6F8] px-3.5 py-3 text-[15px] text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white';
const primaryButton = 'mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButton = 'mt-4 w-full rounded-xl bg-[#F0F2F5] px-4 py-3 text-[15px] font-semibold text-gray-800 hover:bg-gray-200';
const day = (iso: string | undefined, lang: Lang) => formatDay(iso, lang, { month: 'short', day: 'numeric' });

/** How far a pick comes to over or under what's included, in words. */
function versus(difference: number, t: Strings['picks']) {
  if (Math.abs(difference) < 0.005) return t.even;
  return difference > 0 ? t.over(formatCurrency(difference)) : t.under(formatCurrency(-difference));
}

const TONES = {
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  pink: 'bg-rose-50 text-rose-500',
} as const;

/** One thing for the client to do: an icon, what it is, one line of detail, and (in children) its button or form. */
function AskShell({
  icon,
  tone,
  title,
  detail,
  testId,
  children,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  title: string;
  detail?: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <li className={`${card} p-5`} data-testid={testId}>
      <div className="flex items-start gap-3.5">
        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>{icon}</span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[17px] font-semibold leading-snug text-gray-900">{title}</p>
          {detail && <p className="mt-0.5 text-[15px] text-gray-500">{detail}</p>}
        </div>
      </div>
      {children}
    </li>
  );
}

/** Something the company asked the client to pick: what's included, and a link to what they chose. */
function PickCard({
  token,
  ask,
  lang,
  onPicked,
  preview,
}: {
  token?: string;
  ask: SelectionAsk;
  lang: Lang;
  onPicked?: () => Promise<void>;
  preview?: boolean;
}) {
  const t = PORTAL[lang].picks;
  const pick = ask.pick;
  const perUnit = ask.quantity !== 1;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(pick?.url ?? '');
  const [name, setName] = useState(pick?.name ?? '');
  const [price, setPrice] = useState(pick?.unitPrice !== undefined ? String(pick.unitPrice) : '');
  const [note, setNote] = useState(pick?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = price.trim() === '' ? undefined : Number(price.replace(/[$,]/g, ''));
    setBusy(true);
    setMessage(null);
    try {
      if (!token) return;
      await portalAPI.pick(token, ask.estimateId, ask.itemId, {
        url,
        name: name.trim() || undefined,
        unitPrice: typed !== undefined && Number.isFinite(typed) ? typed : undefined,
        note: note.trim() || undefined,
      });
      await onPicked?.();
      setOpen(false);
      setMessage(t.sent);
    } catch (err) {
      setMessage(refusalText(err, lang, t.failed));
    } finally {
      setBusy(false);
    }
  };

  const detail = [
    ask.pickBy ? t.pickBy(formatDay(ask.pickBy, lang, { month: 'short', day: 'numeric' })) : null,
    t.included(formatCurrency(ask.allowanceTotal)),
    perUnit ? t.each(ask.quantity, formatCurrency(ask.allowanceUnitPrice)) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <AskShell
      icon={<Palette className="w-5 h-5" />}
      tone="amber"
      title={t.pickYour(ask.description)}
      detail={detail}
      testId="ask-selection"
    >
      {pick && !open && (
        <div className="mt-4 rounded-xl bg-[#F5F6F8] px-4 py-3 text-[15px]" data-testid="ask-pick">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-gray-900">{pick.name || t.link}</span>
            {pick.url && (
              <a
                href={pick.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                {t.openLink} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          {pick.unitPrice !== undefined && (
            <p className="text-gray-700 mt-0.5">
              {perUnit ? t.each(ask.quantity, formatCurrency(pick.unitPrice)) : formatCurrency(pick.unitPrice)}
              <span className="text-gray-500"> · {versus((pick.unitPrice - ask.allowanceUnitPrice) * ask.quantity, t)}</span>
            </p>
          )}
          {pick.note && <p className="text-gray-500 mt-0.5">{pick.note}</p>}
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 shadow-sm">
            <Clock className="w-3.5 h-3.5" /> {t.waiting}
          </span>
        </div>
      )}

      {preview && !pick && <p className="mt-4 rounded-xl bg-[#F5F6F8] px-4 py-3 text-sm text-gray-500">{t.previewForm}</p>}
      {!open && !preview && (
        <button type="button" onClick={() => setOpen(true)} className={pick ? secondaryButton : primaryButton}>
          {pick ? t.change : t.pickYours}
        </button>
      )}

      {open && (
        <form onSubmit={send} className="mt-4 space-y-3" data-testid="pick-form">
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.link}</span>
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className={field}
            />
            <span className="block text-xs text-gray-500 mt-1">{t.linkHint}</span>
          </label>
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.name}</span>
            <input
              type="text"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className={field}
            />
          </label>
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.price(perUnit)}</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="$"
              className={`${field} max-w-[10rem]`}
            />
          </label>
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">{t.note}</span>
            <input type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={busy || !url.trim()} className={`${primaryButton} !mt-0 flex-1`}>
              {busy ? t.sending : t.send}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-4 py-3 text-[15px] text-gray-600 hover:text-gray-900">
              {t.cancel}
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="text-sm text-gray-600 mt-3" role="status">
          {message}
        </p>
      )}
    </AskShell>
  );
}

/** Something to sign: a link to the page where it's signed (from the company's look, in a new tab). */
function SignCard({ ask, t, preview }: { ask: Exclude<PortalAsk, SelectionAsk>; t: Strings; preview?: boolean }) {
  const title = ask.kind === 'estimate' ? t.signEstimate : ask.kind === 'change_order' ? t.signChanges : t.signComplete;
  const detail =
    ask.kind === 'estimate'
      ? `${ask.title ?? ask.number} · ${formatCurrency(ask.total)}`
      : ask.kind === 'change_order' && ask.difference !== undefined && Math.abs(ask.difference) >= 0.005
        ? `${ask.title ? `${ask.title} · ` : ''}${t.changeBy(formatCurrency(Math.abs(ask.difference)), ask.difference > 0)}`
        : (ask.title ?? ask.number);
  return (
    <AskShell
      icon={<PenLine className="w-5 h-5" />}
      tone={ask.kind === 'affidavit' ? 'green' : 'blue'}
      title={title}
      detail={detail}
      testId={`ask-${ask.kind}`}
    >
      <a
        href={ask.path}
        {...(preview ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={`${primaryButton} inline-flex items-center justify-center gap-1.5`}
      >
        {t.reviewSign} <ChevronRight className="w-4 h-4" />
      </a>
    </AskShell>
  );
}

/** Nothing to do: said kindly. */
function AllCaughtUp({ t }: { t: Strings }) {
  return (
    <li className={`${card} flex items-center gap-3.5 p-5`} data-testid="all-caught-up">
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${TONES.green}`}>
        <CheckCircle2 className="w-5 h-5" />
      </span>
      <div>
        <p className="text-[17px] font-semibold text-gray-900">{t.allCaughtUp}</p>
        <p className="text-[15px] text-gray-500">{t.allCaughtUpBody}</p>
      </div>
    </li>
  );
}

/** The row of quick tiles under the greeting: to-dos, documents, and calling (or emailing) the company. */
function QuickTiles({ view, t, onJump }: { view: View; t: Strings; onJump: (id: string) => void }) {
  const docs = view.jobs.reduce((n, job) => n + job.documents.length, 0);
  const company = view.company;
  const tile =
    'flex flex-col items-start rounded-2xl bg-white p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] hover:bg-gray-50';
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="quick-tiles">
      <button type="button" className={tile} onClick={() => onJump('portal-asks')}>
        <span className={`text-2xl font-semibold ${view.asks.length ? 'text-blue-600' : 'text-gray-900'}`}>{view.asks.length}</span>
        <span className="mt-1 text-sm text-gray-500">{t.toDo}</span>
      </button>
      <button type="button" className={tile} onClick={() => onJump('portal-jobs')}>
        <span className="text-2xl font-semibold text-gray-900">{docs}</span>
        <span className="mt-1 text-sm text-gray-500">{t.documentsTile}</span>
      </button>
      {company?.phone ? (
        <a href={`tel:${company.phone}`} className={tile}>
          <Phone className="h-7 w-7 text-emerald-600" />
          <span className="mt-1 text-sm text-gray-500">{t.call}</span>
        </a>
      ) : company?.email ? (
        <a href={`mailto:${company.email}`} className={tile}>
          <Mail className="h-7 w-7 text-emerald-600" />
          <span className="mt-1 text-sm text-gray-500">{t.email}</span>
        </a>
      ) : (
        <span className={`${tile} opacity-60`}>
          <Phone className="h-7 w-7 text-gray-300" />
          <span className="mt-1 text-sm text-gray-400">{t.call}</span>
        </span>
      )}
    </div>
  );
}

type Step = { title: string; when?: string; state: 'done' | 'now' | 'next' };

/** A job's steps: the agreement, then its tasks in order; the first one not done is "now". */
function stepsOf(job: Job, t: Strings, lang: Lang): Step[] {
  const signed = job.documents.find((d) => d.kind === 'estimate')?.signedAt;
  const steps: Step[] = signed ? [{ title: t.agreementSigned, when: day(signed, lang), state: 'done' }] : [];
  let nowGiven = false;
  for (const s of job.steps ?? []) {
    const when = s.start ? (s.end && s.end !== s.start ? `${day(s.start, lang)} – ${day(s.end, lang)}` : day(s.start, lang)) : undefined;
    const state = s.done ? 'done' : nowGiven ? 'next' : 'now';
    if (state === 'now') nowGiven = true;
    steps.push({ title: s.title, when, state });
  }
  return steps;
}

/** The steps as a vertical line: done, now, next. */
function Timeline({ steps, t }: { steps: Step[]; t: Strings }) {
  const [all, setAll] = useState(false);
  const LIMIT = 6;
  // Show the window around "now" when it's long: a couple done before it, then what's next.
  const nowAt = Math.max(
    steps.findIndex((s) => s.state === 'now'),
    0,
  );
  const from = all || steps.length <= LIMIT ? 0 : Math.min(Math.max(nowAt - 2, 0), steps.length - LIMIT);
  const shown = all || steps.length <= LIMIT ? steps : steps.slice(from, from + LIMIT);
  return (
    <div className="mt-5" data-testid="timeline">
      <ol className="relative">
        {shown.map((step, i) => (
          <li key={`${step.title}:${i}`} className="relative flex gap-3 pb-4 last:pb-0" data-testid="step" data-state={step.state}>
            {i < shown.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-gray-200" aria-hidden />}
            <span
              className={`relative z-10 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                step.state === 'done'
                  ? 'bg-emerald-500 text-white'
                  : step.state === 'now'
                    ? 'bg-blue-600 ring-4 ring-blue-100'
                    : 'border-2 border-gray-300 bg-white'
              }`}
            >
              {step.state === 'done' && <CheckCircle2 className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[15px] ${step.state === 'next' ? 'text-gray-500' : 'text-gray-900'} ${step.state === 'now' ? 'font-semibold' : ''}`}
              >
                {step.title}
                {step.state === 'now' && (
                  <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">{t.now}</span>
                )}
              </p>
              {step.when && <p className="text-xs text-gray-400">{step.when}</p>}
            </div>
          </li>
        ))}
      </ol>
      {steps.length > LIMIT && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-sm font-medium text-blue-600">
          {all ? t.showFewer : t.showAllSteps(steps.length)}
        </button>
      )}
    </div>
  );
}

const STATUS_PILL: Record<string, string> = {
  planning: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-50 text-blue-600',
  on_hold: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

/** One job: its status and dates, progress, the timeline, its documents and the client's picks. */
function JobCard({
  job,
  t,
  lang,
  token,
  preview,
  onChanged,
}: {
  job: Job;
  t: Strings;
  lang: Lang;
  token?: string;
  preview?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const steps = stepsOf(job, t, lang);
  const tasks = job.steps ?? [];
  const done = tasks.filter((s) => s.done).length;
  const dates =
    job.startDate || job.endDate
      ? [job.startDate && day(job.startDate, lang), job.endDate && day(job.endDate, lang)].filter(Boolean).join(' – ')
      : null;
  let changeOrders = 0;
  // Signed off as done, it's Complete whatever the project's status still says.
  const status = job.completed ? 'completed' : job.status;
  return (
    <li className={`${card} p-5`} data-testid="job">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold leading-tight text-gray-900">{job.name}</h3>
          {dates && <p className="mt-1 text-[15px] text-gray-500">{dates}</p>}
        </div>
        {status && (
          <span
            className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[status] ?? STATUS_PILL.planning}`}
            data-testid="job-status"
          >
            {t.status[status] ?? status}
          </span>
        )}
      </div>

      {job.completed && <HomeFile job={job} completed={job.completed} lang={lang} token={token} preview={preview} onChanged={onChanged} />}

      {tasks.length > 0 && !job.completed && (
        <div className="mt-4" data-testid="progress">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.round((done / tasks.length) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-sm text-gray-500">{t.stepsDone(done, tasks.length)}</p>
        </div>
      )}

      {steps.length > 0 && <Timeline steps={steps} t={t} />}

      <div className="mt-5 border-t border-gray-100 pt-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t.documentsHeading}</p>
        <ul className="divide-y divide-gray-100">
          {job.documents.map((doc) => {
            const label =
              doc.kind === 'estimate'
                ? t.documents.estimate(doc.number)
                : doc.kind === 'change_order'
                  ? t.documents.change_order(++changeOrders)
                  : t.documents.affidavit;
            const body = (
              <>
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F5F6F8] text-gray-500">
                  <FileText className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-gray-900">{label}</span>
                  {doc.signedAt && <span className="block text-xs text-gray-500">{t.signedOn(day(doc.signedAt, lang))}</span>}
                </span>
                {doc.path && <ChevronRight className="h-4 w-4 text-gray-300" />}
              </>
            );
            return (
              <li key={`${doc.kind}:${doc.number}`} data-testid="document">
                {doc.path ? (
                  <a href={doc.path} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-gray-50">
                    {body}
                  </a>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {job.selections.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t.chosen}</p>
          <ul className="space-y-1.5">
            {job.selections.map((s) => (
              <li key={s.description} className="flex flex-wrap items-center gap-x-2 text-[15px]" data-testid="chosen">
                <span className="text-gray-500">{s.description}:</span>
                <span className="text-gray-900">{s.name ?? ''}</span>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-sm text-blue-600"
                    aria-label={t.picks.openLink}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500">{t.agreed(formatCurrency(job.total))}</p>
    </li>
  );
}

/**
 * A finished job's home file: when it was done, the warranty from the
 * agreement and how long it has left, and asking for warranty service (it
 * lands on the company's project as a task).
 */
function HomeFile({
  job,
  completed,
  lang,
  token,
  preview,
  onChanged,
}: {
  job: Job;
  completed: NonNullable<Job['completed']>;
  lang: Lang;
  token?: string;
  preview?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const t = PORTAL[lang].homeFile;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const ends = completed.warrantyEnds;
  const covered = !ends || ends >= today;
  const longDay = (iso: string) => formatDay(iso, lang, { month: 'short', day: 'numeric', year: 'numeric' });
  // How much of the warranty is left, for the bar.
  const left = (() => {
    if (!ends) return null;
    const start = new Date(completed.at).getTime();
    const end = new Date(`${ends}T23:59:59Z`).getTime();
    return end > start ? Math.min(Math.max((end - Date.now()) / (end - start), 0), 1) : 0;
  })();

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      await portalAPI.requestWarranty(token, job.key, note);
      setNote('');
      setOpen(false);
      setMessage(t.sent);
      await onChanged?.();
    } catch (err) {
      setMessage(refusalText(err, lang, t.failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl bg-emerald-50/60 p-4" data-testid="home-file">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-800">
        <CheckCircle2 className="h-[18px] w-[18px]" /> {t.finished(day(completed.at, lang))}
      </p>
      {completed.warranty && (
        <div className="mt-3 rounded-xl bg-white p-4" data-testid="warranty">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${TONES.green}`}>
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-gray-900">{t.period(completed.warranty)}</p>
              {ends && <p className="text-sm text-gray-500">{covered ? t.coveredUntil(longDay(ends)) : t.ended(longDay(ends))}</p>}
              {left !== null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(left * 100)}%` }} />
                </div>
              )}
            </div>
          </div>

          {completed.requests.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3" data-testid="warranty-requests">
              {completed.requests.map((r, i) => (
                <li key={`${r.requestedAt}:${i}`} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-gray-900">{r.note}</span>
                    <span className="block text-xs text-gray-400">{t.requested(day(r.requestedAt, lang))}</span>
                  </span>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.done ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {r.done ? t.fixed : t.onIt}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {covered && preview && <p className="mt-3 rounded-xl bg-[#F5F6F8] px-3 py-2.5 text-sm text-gray-500">{t.previewForm}</p>}
          {covered && !preview && !open && (
            <button type="button" onClick={() => setOpen(true)} className={`${secondaryButton} !mt-3 inline-flex items-center justify-center gap-2`}>
              <Wrench className="h-4 w-4" /> {t.request}
            </button>
          )}
          {open && (
            <form onSubmit={send} className="mt-3 space-y-3" data-testid="warranty-form">
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">{t.label}</span>
                <textarea
                  value={note}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t.placeholder}
                  className={field}
                />
              </label>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={busy || !note.trim()} className={`${primaryButton} !mt-0 flex-1`}>
                  {busy ? t.sending : t.send}
                </button>
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-4 py-3 text-[15px] text-gray-600 hover:text-gray-900">
                  {t.cancel}
                </button>
              </div>
            </form>
          )}
          {message && (
            <p className="mt-3 text-sm text-gray-600" role="status">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Once a job is done, what the client gets back: a review ask and a referral
 * link with the company's reward, each when the company set it up.
 */
function Perks({ view, lang, token, preview }: { view: View; lang: Lang; token?: string; preview?: boolean }) {
  const t = PORTAL[lang].perks;
  const perks = view.perks;
  const company = view.company?.name ?? PORTAL[lang].theCompany;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The review placeholder is the company's alone (preview); clients see only what's set.
  if (!perks || (!perks.reviewUrl && !perks.referral && !preview)) return null;
  const referral = perks.referral;

  const share = async () => {
    if (!token || preview) return;
    setBusy(true);
    setMessage(null);
    try {
      const code = referral?.code ?? (await portalAPI.shareReferral(token));
      const how = await shareOrCopy(referralUrl(code), company, t.shareText(company));
      if (how === 'copied') setMessage(t.copied);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const stats = referral ? t.stats(referral.referred, referral.earned) : '';
  return (
    <section aria-label={t.heading} data-testid="perks">
      <h2 className="mb-3 text-[22px] font-bold tracking-tight text-gray-900">{t.heading}</h2>
      <ul className="space-y-3">
        {!perks.reviewUrl && preview && (
          <li className="rounded-2xl border-2 border-dashed border-gray-300 p-5 text-[15px] text-gray-500" data-testid="perk-review-placeholder">
            <span className="flex items-start gap-3">
              <Star className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
              <span>
                {t.reviewPlaceholder}{' '}
                <a href="/settings/organization" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                  {t.reviewPlaceholderLink}
                </a>
              </span>
            </span>
          </li>
        )}
        {perks.reviewUrl && (
          <AskShell icon={<Star className="h-5 w-5" />} tone="amber" title={t.reviewTitle} detail={t.reviewBody(company)} testId="perk-review">
            <a
              href={perks.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${primaryButton} inline-flex items-center justify-center gap-1.5`}
              onClick={preview ? (e) => e.preventDefault() : undefined}
            >
              {t.reviewButton} <ExternalLink className="h-4 w-4" />
            </a>
          </AskShell>
        )}
        {referral && (
          <AskShell
            icon={<Gift className="h-5 w-5" />}
            tone="pink"
            title={t.referTitle}
            detail={referral.reward ? t.referBody(referral.reward) : t.referBodyNoReward}
            testId="perk-referral"
          >
            {stats && <p className="mt-3 text-sm font-medium text-rose-600">{stats}</p>}
            <button type="button" onClick={share} disabled={busy} className={primaryButton}>
              {t.referButton}
            </button>
            {message && (
              <p className="mt-3 text-sm text-gray-600" role="status">
                {message}
              </p>
            )}
          </AskShell>
        )}
      </ul>
    </section>
  );
}

/** Who to reach, at the bottom. */
function ContactCard({ view, t }: { view: View; t: Strings }) {
  const company = view.company;
  if (!company || (!company.phone && !company.email)) return null;
  const button =
    'flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#F0F2F5] px-4 py-3 text-[15px] font-semibold text-gray-800 hover:bg-gray-200';
  return (
    <div className={`${card} p-5`} data-testid="contact">
      <p className="text-[17px] font-semibold text-gray-900">{company.name}</p>
      <p className="text-[15px] text-gray-500">{t.contact}</p>
      <div className="mt-4 flex gap-3">
        {company.phone && (
          <a href={`tel:${company.phone}`} className={button}>
            <Phone className="h-4 w-4" /> {t.call}
          </a>
        )}
        {company.email && (
          <a href={`mailto:${company.email}`} className={button}>
            <Mail className="h-4 w-4" /> {t.email}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The portal's page, as a light card app: a greeting, quick tiles, what needs
 * the client, then each job with its progress, timeline and documents. The
 * client's own page and the company's look at it (`preview`) draw this same
 * thing; for the company the client's forms can't be used, and it shows where
 * the review card goes until there's a review link.
 */
export function PortalView({
  view,
  lang,
  token,
  onPicked,
  preview,
}: {
  view: View;
  lang: Lang;
  token?: string;
  onPicked?: () => Promise<void>;
  preview?: boolean;
}) {
  const t = PORTAL[lang];
  const company = view.company;
  const first = view.client.name.trim().split(/\s+/)[0];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  const monogram = (company?.name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2.5">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={company.name} className="h-9 max-w-[160px] object-contain" data-testid="company-logo" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white" aria-hidden>
              {monogram}
            </span>
          )}
          <span className="text-sm font-medium text-gray-500">{company?.name}</span>
        </div>
        <h1 className="mt-6 text-[32px] font-bold leading-tight tracking-tight text-gray-900">{t.hello(first)} 👋</h1>
        <p className="mt-1 text-[17px] text-gray-500">{t.intro(company?.name ?? t.theCompany)}</p>
      </header>

      <QuickTiles view={view} t={t} onJump={jump} />

      <section id="portal-asks" aria-label={t.needsYou} data-testid="asks" className="scroll-mt-6">
        <h2 className="mb-3 text-[22px] font-bold tracking-tight text-gray-900">{t.needsYou}</h2>
        <ul className="space-y-3">
          {view.asks.length === 0 ? (
            <AllCaughtUp t={t} />
          ) : (
            view.asks.map((ask) =>
              ask.kind === 'selection' ? (
                <PickCard key={`${ask.estimateId}:${ask.itemId}`} token={token} ask={ask} lang={lang} onPicked={onPicked} preview={preview} />
              ) : (
                <SignCard key={ask.path} ask={ask} t={t} preview={preview} />
              ),
            )
          )}
        </ul>
      </section>

      <Perks view={view} lang={lang} token={token} preview={preview} />

      {view.jobs.length > 0 && (
        <section id="portal-jobs" aria-label={t.yourJobs} data-testid="jobs" className="scroll-mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-[22px] font-bold tracking-tight text-gray-900">
            <FolderOpen className="h-5 w-5 text-gray-400" /> {t.yourJobs}
          </h2>
          <ul className="space-y-4">
            {view.jobs.map((job) => (
              <JobCard key={job.key} job={job} t={t} lang={lang} token={token} preview={preview} onChanged={onPicked} />
            ))}
          </ul>
        </section>
      )}

      <ContactCard view={view} t={t} />

    </div>
  );
}
