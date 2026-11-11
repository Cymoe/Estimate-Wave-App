import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { OutreachCell, OutreachContact } from '../../lib/api';

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How long the finished summary stays before it goes on its own, and how long it takes to fade. */
export const DONE_MS = 8000;
const FADE_MS = 300;

/**
 * The lookup that was started, while it runs and once it's done: a toast floating at the bottom of the screen that
 * fills as owners finish, with the phones, emails and people found so far
 * and what it has cost. Counts the owners whose cells were asked for at or
 * after `since`, the time the lookup started; without it (a lookup started
 * elsewhere), the owners still running.
 *
 * A toast sits over whatever is under it, so it never stays in the way: it can be closed at any moment (the lookup
 * carries on, and each owner's row shows its own progress), and the finished summary goes by itself after a few
 * seconds. `onDismiss` is told whether the lookup was still running.
 */
export const LookupProgress: React.FC<{ rows: OutreachContact[]; since?: string; onDismiss: (running: boolean) => void; className?: string }> = ({ rows, since, onDismiss, className = '' }) => {
  const running = (r: OutreachContact) => Object.values(r.enrichment).some((c) => c?.status === 'running');
  const asked = (c?: OutreachCell) => Boolean(since && c?.at && c.at >= since && c.status !== 'locked');
  const found = (c?: OutreachCell) => (since ? asked(c) : Boolean(c?.at)) && c!.status === 'found';
  const batch = since ? rows.filter((r) => Object.values(r.enrichment).some(asked)) : rows.filter(running);
  const done = batch.filter((r) => !running(r)).length;
  const over = batch.length > 0 && Boolean(since) && done === batch.length;
  // Finished: the summary stays a few seconds, fades, and is gone.
  const [leaving, setLeaving] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    setLeaving(false);
    if (!over) return;
    const fade = setTimeout(() => setLeaving(true), DONE_MS);
    const gone = setTimeout(() => dismiss.current(false), DONE_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [over, since]);
  if (batch.length === 0) return null;
  const phones = batch.filter((r) => found(r.enrichment.phone)).length;
  const emails = batch.filter((r) => found(r.enrichment.email)).length;
  const people = batch.filter((r) => found(r.enrichment.person)).length;
  const cents = batch.reduce((sum, r) => sum + (found(r.enrichment.phone) ? (r.enrichment.phone.chargedCents ?? 0) : 0) + (found(r.enrichment.research) ? (r.enrichment.research?.chargedCents ?? 0) : 0), 0);
  const finished = over;
  // A research run asks only for research: it counts answers, not phones and emails.
  const research = Boolean(since) && batch.every((r) => (Object.keys(r.enrichment) as Array<keyof typeof r.enrichment>).every((f) => f === 'research' || !asked(r.enrichment[f])));
  const answers = batch.filter((r) => found(r.enrichment.research)).length;
  const money = `${dollars(cents)} ${finished ? 'charged' : 'so far'}`;
  const parts = !since ? [] : research ? [plural(answers, 'answer'), money] : [plural(phones, 'phone'), plural(emails, 'email'), ...(people ? [plural(people, 'person', 'people')] : []), money];
  const owners = plural(batch.length, 'owner');
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="lookup-progress"
      className={`relative overflow-hidden rounded-2xl border border-[#333333] bg-[#1E1E1E] text-sm text-white shadow-2xl animate-appear transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'} ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 pl-4 pr-4">
        {finished ? <CheckCircle2 className="w-4 h-4 shrink-0 text-[#7fb0e0]" aria-hidden /> : <span className="live-dot" aria-hidden />}
        <span>{finished ? `Done: ${owners} ${research ? 'researched' : 'looked up'}` : since ? `${research ? 'Researching' : 'Looking up'} ${owners} · ${done} done` : `Looking up ${owners}…`}</span>
        {parts.length > 0 && <span className="text-gray-300 tabular-nums">{parts.join(' · ')}</span>}
        {/* Always there: while a lookup runs it closes the toast, not the lookup. */}
        <button
          type="button"
          onClick={() => onDismiss(!finished)}
          aria-label="Dismiss"
          title={finished ? 'Dismiss' : 'Hide this; the lookup carries on'}
          className="-my-1.5 -mr-2 ml-auto inline-flex items-center justify-center w-8 h-8 text-gray-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* A thin line along the bottom fills as owners finish. */}
      {since && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
          <div className="h-full bg-[#7fb0e0] transition-[width] duration-700" style={{ width: `${Math.round((done / batch.length) * 100)}%` }} />
        </div>
      )}
    </div>
  );
};
