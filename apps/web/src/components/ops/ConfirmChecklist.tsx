import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { intakeAPI, type IntakeFields } from '../../lib/api';
import type { IntakeDetail } from './IntakePanel';
import { input, primary } from './ui';

/** The six things a person confirms on the phone before a lead is listed. Same order as the backend. */
export const CHECKS: Array<[string, string]> = [
  ['reached', 'Reached the homeowner live'],
  ['phoneOwner', 'The number is theirs'],
  ['addressInCounty', 'Address confirmed, inside the county'],
  ['trade', 'Trade and scope confirmed'],
  ['owner', 'Owns the home and decides'],
  ['consent', 'Consent read and acknowledged'],
];

export interface ConfirmResult {
  leadId: string;
  outcome: 'sold' | 'available';
  companyName?: string;
  priceCents?: number;
}

/**
 * The gate in front of the auction: nothing is listed until every box is
 * ticked. The fields come from the panel's draft so what staff corrected
 * is what gets listed.
 */
export const ConfirmChecklist: React.FC<{ row: IntakeDetail; draft: IntakeFields; onListed: (result: ConfirmResult) => void }> = ({ row, draft, onListed }) => {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allTicked = CHECKS.every(([key]) => checks[key]);
  const blocked = Boolean(row.duplicateOf) && !allowDuplicate;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      onListed((await intakeAPI.confirm(row.id, checks, draft, note || undefined, allowDuplicate || undefined)) as ConfirmResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-emerald-500/30 bg-emerald-500/5 rounded p-4" data-testid="confirm-checklist">
      <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-emerald-300" /> Confirm with the homeowner
      </h3>
      <p className="text-xs text-gray-500 mb-3">Tick each one as they confirm it on the call. The lead is listed and sold the moment all six are ticked.</p>
      <ul className="space-y-2 mb-3">
        {CHECKS.map(([key, label]) => (
          <li key={key}>
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" checked={Boolean(checks[key])} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} />
              {label}
            </label>
          </li>
        ))}
      </ul>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What they said (shows to the company as the confirmation note)" className={`${input} mb-3`} aria-label="What they said" />
      {row.duplicateOf && (
        <label className="flex items-center gap-2 text-sm text-amber-200 mb-3">
          <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} />
          List it anyway: it's a different job from the other lead
        </label>
      )}
      <button type="button" disabled={busy || !allTicked || blocked} onClick={confirm} className={`${primary} w-full`}>
        {busy ? 'Listing…' : 'Confirm & list'}
      </button>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </section>
  );
};
