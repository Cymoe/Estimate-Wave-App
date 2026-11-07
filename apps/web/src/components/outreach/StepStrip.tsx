import React, { useState } from 'react';
import type { OutreachCell, OutreachContact } from '../../lib/api';
import { callOk } from './format';

/** How a step's cells stand across the list. */
type Tally = { found: number; looking: number; none: number; failed: number; locked: number; total: number };
type Steps = {
  owners: number;
  companies: number;
  person: Tally;
  phone: Tally;
  email: Tally;
  /** Owners whose only phones are on the Do Not Call list. */
  dncOnly: number;
  verifiedEmails: number;
  /** Owners with any lookup still running. */
  looking: number;
  /** For phones alone, and with research. */
  phoneCents: number;
  chargedCents: number;
};

const tally = (cells: OutreachCell[]): Tally => {
  const t: Tally = { found: 0, looking: 0, none: 0, failed: 0, locked: 0, total: cells.length };
  for (const c of cells) {
    if (c.status === 'running') t.looking++;
    else if (c.status === 'found') t.found++;
    else if (c.status === 'none') t.none++;
    else if (c.status === 'failed') t.failed++;
    else t.locked++;
  }
  return t;
};

/** The four steps' numbers for the strip, over the whole list. */
function stepsOf(rows: OutreachContact[]): Steps {
  const companies = rows.filter((r) => r.company);
  let dncOnly = 0;
  let verifiedEmails = 0;
  let looking = 0;
  let phoneCents = 0;
  let chargedCents = 0;
  for (const r of rows) {
    if (r.phones.length > 0 && !r.phones.some(callOk)) dncOnly++;
    if (r.emails.some((e) => e.verified)) verifiedEmails++;
    if (Object.values(r.enrichment).some((c) => c.status === 'running')) looking++;
    phoneCents += r.enrichment.phone.chargedCents ?? 0;
    chargedCents += (r.enrichment.phone.chargedCents ?? 0) + (r.enrichment.research?.chargedCents ?? 0);
  }
  return {
    owners: rows.length,
    companies: companies.length,
    person: tally(companies.map((r) => r.enrichment.person)),
    phone: tally(rows.map((r) => r.enrichment.phone)),
    email: tally(rows.map((r) => r.enrichment.email)),
    dncOnly,
    verifiedEmails,
    looking,
    phoneCents,
    chargedCents,
  };
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KEY = 'outreach.steps';
/** A phone starts with the one-line strip; a wider screen with the steps. The choice, once made, wins. */
const readHidden = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'hidden' || saved === 'shown') return saved === 'hidden';
  } catch {
    // A private window: the default below.
  }
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches;
};
const writeHidden = (hidden: boolean) => {
  try {
    localStorage.setItem(KEY, hidden ? 'hidden' : 'shown');
  } catch {
    // A private window: the choice lasts the page.
  }
};

/** The bar's parts and the legend's words, in the order they show. */
const PARTS: Array<{ key: keyof Omit<Tally, 'total'>; tone: string; word: string }> = [
  { key: 'found', tone: 'bg-[#336699]', word: 'found' },
  { key: 'looking', tone: 'bg-[#7fb0e0]', word: 'looking' },
  { key: 'none', tone: 'bg-gray-600', word: 'none' },
  { key: 'failed', tone: 'bg-amber-400', word: 'need a retry' },
  { key: 'locked', tone: 'bg-[#333333]', word: 'not looked up' },
];

/** A thin bar split by outcome, and the words under it. Parts at zero stay out of the legend. */
const Bar: React.FC<{ t: Tally }> = ({ t }) => (
  <>
    <div className="flex h-1 bg-[#333333] my-2" aria-hidden>
      {PARTS.map((p) => (t[p.key] > 0 ? <div key={p.key} className={p.tone} style={{ flexGrow: t[p.key] }} /> : null))}
    </div>
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 tabular-nums">
      {PARTS.map((p) =>
        t[p.key] > 0 ? (
          <span key={p.key} className="inline-flex items-center gap-1">
            <span className={`inline-block w-2 h-2 ${p.tone}`} aria-hidden />
            {t[p.key]} {p.word}
          </span>
        ) : null,
      )}
    </p>
  </>
);

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <div className="bg-[#121212] px-4 py-3 min-w-0">
    <div className="flex items-center gap-2 text-sm text-gray-300">
      <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center border border-[#333333] text-[11px] text-gray-400 tabular-nums">{n}</span>
      <span className="truncate">{title}</span>
    </div>
    {children}
  </div>
);

const Big: React.FC<{ n: number; of?: number; what?: string }> = ({ n, of, what }) => (
  <p className="mt-1 text-2xl font-semibold text-white tabular-nums leading-none">
    {n}
    {of !== undefined && (
      <span className="text-sm font-normal text-gray-500">
        {' '}
        of {of}
        {what ? ` ${what}` : ''}
      </span>
    )}
  </p>
);

/**
 * The waterfall, step by step, over the open list: how many owners, how
 * many companies have their person, how many phones and emails, with a
 * bar per step and what it cost. While lookups run, a progress line on top.
 * Hides to one line, and remembers that.
 */
export const StepStrip: React.FC<{ rows: OutreachContact[]; unlockCents: number; listLine?: React.ReactNode }> = ({ rows, unlockCents, listLine }) => {
  const [hidden, setHidden] = useState(readHidden);
  const s = stepsOf(rows);
  const toggle = () => {
    writeHidden(!hidden);
    setHidden(!hidden);
  };
  const toggleButton = (
    <button type="button" onClick={toggle} className="text-xs text-gray-500 hover:text-white whitespace-nowrap" aria-expanded={!hidden}>
      {hidden ? 'Show steps' : 'Hide'}
    </button>
  );
  const progress = s.looking > 0 && (
    <div className="flex items-center gap-3 text-sm text-gray-300" data-testid="looking">
      <span className="whitespace-nowrap">
        Looking up {plural(s.looking, 'owner')}… {s.owners - s.looking} of {s.owners} done
      </span>
      <div className="flex-1 h-1 bg-[#333333] min-w-[4rem]" aria-hidden>
        <div className="h-full bg-[#336699]" style={{ width: `${Math.round(((s.owners - s.looking) / s.owners) * 100)}%` }} />
      </div>
    </div>
  );
  if (hidden) {
    return (
      <div className="bg-[#121212] border border-[#333333] px-4 py-2 space-y-1" data-testid="steps">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-300 tabular-nums">
          <span>{plural(s.owners, 'owner')}</span>
          {s.companies > 0 && (
            <span>
              {s.person.found} of {s.companies} people found
            </span>
          )}
          <span>{plural(s.phone.found, 'phone')}</span>
          <span>{plural(s.email.found, 'email')}</span>
          {s.chargedCents > 0 && <span>{dollars(s.chargedCents)} charged</span>}
          <span className="ml-auto">{toggleButton}</span>
        </p>
        {progress}
      </div>
    );
  }
  return (
    <div className="relative bg-[#121212] border border-[#333333]" data-testid="steps">
      {progress && <div className="pl-4 pr-20 py-2 border-b border-[#333333]">{progress}</div>}
      <div className="absolute top-2 right-3 z-10">{toggleButton}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-[#333333]">
        <Step n={1} title="Owners in this list">
          <Big n={s.owners} />
          <p className="mt-2 text-[11px] text-gray-500 tabular-nums">
            {s.companies > 0 ? `${plural(s.companies, 'company', 'companies')} go to step 2 for the person` : 'No companies, so step 2 has nothing to do'}
            {s.owners - s.companies > 0 ? ` · ${plural(s.owners - s.companies, 'person or trust', 'people & trusts')} ${s.owners - s.companies === 1 ? 'skips' : 'skip'} to step 3` : ''}
          </p>
          {listLine && <div className="mt-1 text-[11px] text-gray-500">{listLine}</div>}
        </Step>
        <Step n={2} title="Person behind the company · free">
          <Big n={s.person.found} of={s.companies} what={s.companies === 1 ? 'company' : 'companies'} />
          <Bar t={s.person} />
        </Step>
        <Step n={3} title={`Phone · ${dollars(unlockCents)} when found`}>
          <Big n={s.phone.found} of={s.owners} />
          <Bar t={s.phone} />
          <p className="mt-1 text-[11px] text-gray-400 tabular-nums">
            {dollars(s.phoneCents)} charged
            {s.dncOnly > 0 ? ` · ${s.dncOnly} not callable (Do Not Call or litigator)` : ''}
          </p>
        </Step>
        <Step n={4} title="Email · included">
          <Big n={s.email.found} of={s.owners} />
          <Bar t={s.email} />
          {s.verifiedEmails > 0 && <p className="mt-1 text-[11px] text-gray-400 tabular-nums">{s.verifiedEmails} verified deliverable</p>}
        </Step>
      </div>
    </div>
  );
};
