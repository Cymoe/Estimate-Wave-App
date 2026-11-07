import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { OutreachCell, OutreachContact } from '../../lib/api';

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The lookup that was started, while it runs and once it's done: a bar that
 * fills as owners finish, with the phones, emails and people found so far
 * and what it has cost. Counts the owners whose cells were asked for at or
 * after `since`, the time the lookup started; without it (a lookup started
 * elsewhere), the owners still running.
 */
export const LookupProgress: React.FC<{ rows: OutreachContact[]; since?: string; onDismiss: () => void; className?: string }> = ({ rows, since, onDismiss, className = '' }) => {
  const running = (r: OutreachContact) => Object.values(r.enrichment).some((c) => c?.status === 'running');
  const asked = (c?: OutreachCell) => Boolean(since && c?.at && c.at >= since && c.status !== 'locked');
  const found = (c?: OutreachCell) => (since ? asked(c) : Boolean(c?.at)) && c!.status === 'found';
  const batch = since ? rows.filter((r) => Object.values(r.enrichment).some(asked)) : rows.filter(running);
  if (batch.length === 0) return null;
  const done = batch.filter((r) => !running(r)).length;
  const phones = batch.filter((r) => found(r.enrichment.phone)).length;
  const emails = batch.filter((r) => found(r.enrichment.email)).length;
  const people = batch.filter((r) => found(r.enrichment.person)).length;
  const cents = batch.reduce((sum, r) => sum + (found(r.enrichment.phone) ? (r.enrichment.phone.chargedCents ?? 0) : 0) + (found(r.enrichment.research) ? (r.enrichment.research?.chargedCents ?? 0) : 0), 0);
  const finished = Boolean(since) && done === batch.length;
  // A research run asks only for research: it counts answers, not phones and emails.
  const research = Boolean(since) && batch.every((r) => (Object.keys(r.enrichment) as Array<keyof typeof r.enrichment>).every((f) => f === 'research' || !asked(r.enrichment[f])));
  const answers = batch.filter((r) => found(r.enrichment.research)).length;
  const money = `${dollars(cents)} ${finished ? 'charged' : 'so far'}`;
  const parts = !since ? [] : research ? [plural(answers, 'answer'), money] : [plural(phones, 'phone'), plural(emails, 'email'), ...(people ? [plural(people, 'person', 'people')] : []), money];
  const owners = plural(batch.length, 'owner');
  return (
    <div role="status" aria-live="polite" data-testid="lookup-progress" className={`relative bg-[#121212] border-b border-[#333333] ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6 py-2 text-sm">
        {finished ? <CheckCircle2 className="w-4 h-4 text-[#7fb0e0]" aria-hidden /> : <span className="live-dot" aria-hidden />}
        <span className="text-white">{finished ? `Done: ${owners} ${research ? 'researched' : 'looked up'}` : since ? `${research ? 'Researching' : 'Looking up'} ${owners} · ${done} done` : `Looking up ${owners}…`}</span>
        {parts.length > 0 && <span className="text-gray-400 tabular-nums">{parts.join(' · ')}</span>}
        {finished && (
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="ml-auto -my-1 inline-flex items-center justify-center w-8 h-8 text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {/* The blue line along the banner's bottom edge fills as owners finish. */}
      {since && (
        <div className="absolute inset-x-0 -bottom-px h-0.5 bg-[#1A1A1A]">
          <div className="h-full bg-[#336699] transition-[width] duration-700" style={{ width: `${Math.round((done / batch.length) * 100)}%` }} />
        </div>
      )}
    </div>
  );
};
