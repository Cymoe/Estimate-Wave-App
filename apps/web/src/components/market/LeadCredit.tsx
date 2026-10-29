import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { Lead } from '../leads/leadTypes';
import { leadsAPI } from '../../lib/api';
import { leadOrigin } from './leadRoute';
import { SupportLine } from './SupportLine';

/**
 * On a lead bought from Webb Leads: what it cost, and the state of a credit
 * if one is already on file. Credits are handled by Webb Leads, not asked
 * for from here.
 */
export const LeadCredit: React.FC<{ lead: Lead; onAcknowledged?: (at: string) => void }> = ({ lead, onAcknowledged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!lead.marketplaceLeadId) return null;
  const request = lead.creditRequest;
  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    try {
      onAcknowledged?.(await leadsAPI.acknowledge(lead.id));
    } catch (err) {
      setError(`That didn't reach Webb Leads${err instanceof Error && err.message ? `: ${err.message}` : ''}. Tap Got it again.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="lead-credit">
      <span className="text-emerald-300">{leadOrigin(lead)}</span>
      {lead.acknowledgedAt ? (
        <span className="inline-flex items-center gap-1 text-gray-400" data-testid="acknowledged">
          <Check className="w-3.5 h-3.5" /> You acknowledged it{' '}
          {new Date(lead.acknowledgedAt).toDateString() === new Date().toDateString()
            ? `at ${new Date(lead.acknowledgedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
            : new Date(lead.acknowledgedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={acknowledge}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
        >
          <Check className="w-4 h-4" /> Got it, calling now
        </button>
      )}
      {request && (
        <span className={request.status === 'approved' ? 'text-emerald-300' : request.status === 'denied' ? 'text-gray-400' : 'text-amber-200'}>
          {request.status === 'approved' ? 'Credited' : request.status === 'denied' ? 'Credit declined' : 'Credit requested'}
        </span>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-red-300">
          {error}
        </p>
      )}
      {!request && <SupportLine className="w-full" />}
    </div>
  );
};
