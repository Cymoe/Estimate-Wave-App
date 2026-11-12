import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useIntakeLog } from '../../lib/live';
import { ago } from './ui';

export interface IntakeLogRow {
  id: string;
  receivedAt: string;
  source?: string;
  outcome: 'accepted' | 'repeat' | 'rejected';
  reason?: string;
  externalId?: string;
  intakeLeadId?: string;
  summary?: string;
}

const OUTCOME: Record<IntakeLogRow['outcome'], { label: string; cls: string }> = {
  accepted: { label: 'In', cls: 'text-emerald-300 border-emerald-500/40' },
  repeat: { label: 'Repeat', cls: 'text-gray-400 border-[#333]' },
  rejected: { label: 'Rejected', cls: 'text-red-300 border-red-500/40' },
};

/**
 * Every hit on the intake webhook, newest first, so "the form fired and
 * nothing showed up" has an answer: a wrong key, a body that wasn't JSON,
 * or a retry of a lead already in. Collapsed until opened. Live.
 */
export const IncomingLog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const rows = useIntakeLog<IntakeLogRow[]>();
  const rejected = (rows ?? []).filter((r) => r.outcome === 'rejected').length;
  return (
    <section aria-label="Incoming" className="border border-[#2A2A2A] rounded" data-testid="incoming-log">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm">
        {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        <span className="text-white">Incoming webhook hits</span>
        <span className="text-xs text-gray-500">
          last {rows?.length ?? 0}
          {rejected > 0 ? ` · ${rejected} rejected` : ''}
        </span>
      </button>
      {open && (
        <div className="border-t border-[#2A2A2A]">
          {rows === undefined ? (
            <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">Nothing has hit the webhook yet. Each form submission, test or real, shows here the moment it lands.</p>
          ) : (
            <ul className="divide-y divide-[#2A2A2A]">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className={`text-[11px] uppercase tracking-wide border rounded px-1.5 py-0.5 ${OUTCOME[r.outcome].cls}`}>{OUTCOME[r.outcome].label}</span>
                  <span className="flex-1 min-w-[12rem] text-gray-300">
                    {r.summary ?? <span className="text-gray-500">no details</span>}
                    {r.reason && <span className="block text-xs text-gray-500">{r.reason}</span>}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {r.source ? `${r.source} · ` : ''}
                    {ago(r.receivedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
