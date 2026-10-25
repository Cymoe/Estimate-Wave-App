import React from 'react';
import { ShieldCheck } from 'lucide-react';

/** "Confirmed Oct 20": the day a person at Tolliver called the homeowner. */
export const confirmedOn = (at: string) =>
  `Confirmed ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

/** The confirmation line under a lead: the date, and what the homeowner said. Nothing when unconfirmed. */
export const Confirmed: React.FC<{ verified?: { at: string; note?: string }; className?: string }> = ({ verified, className = '' }) =>
  verified ? (
    <span className={`inline-flex items-center gap-1 text-xs text-emerald-300 ${className}`} data-confirmed>
      <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
      <span>
        {confirmedOn(verified.at)}
        {verified.note ? <span className="text-gray-400"> · {verified.note}</span> : null}
      </span>
    </span>
  ) : null;
