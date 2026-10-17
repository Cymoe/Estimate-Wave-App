import React, { useState } from 'react';
import { walletAPI } from '../../lib/api';
import type { Lead } from '../leads/leadTypes';
import { CREDIT_REASON_LABELS, money } from './wallet';

const CREDIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * On a lead bought from FieldQuote: what it cost, and a way to ask for a
 * credit within 3 days if it was a bad lead.
 */
export const LeadCredit: React.FC<{ lead: Lead; onRequested: (creditRequest: NonNullable<Lead['creditRequest']>) => void }> = ({
  lead,
  onRequested,
}) => {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('wrong_number');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!lead.marketplaceLeadId) return null;

  const deliveredAt = Date.parse(lead.assignedAt ?? lead.createdAt ?? '');
  const canAsk = !lead.creditRequest && Number.isFinite(deliveredAt) && Date.now() - deliveredAt <= CREDIT_WINDOW_MS;
  const request = lead.creditRequest;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await walletAPI.requestCredit(lead.id, reason, note || undefined);
      onRequested({ reason, note: note || undefined, requestedAt: new Date().toISOString(), status: 'pending' });
      setAsking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The credit couldn't be requested");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded border border-[#336699]/40 bg-[#336699]/10 px-3 py-2 text-sm" data-testid="lead-credit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[#9cc3ea]">FieldQuote lead · {money(lead.pricePaidCents ?? 0)}</span>
        {request ? (
          <span className={request.status === 'approved' ? 'text-emerald-300' : request.status === 'denied' ? 'text-gray-400' : 'text-amber-200'}>
            {request.status === 'approved' ? 'Credited' : request.status === 'denied' ? 'Credit declined' : 'Credit requested'}
          </span>
        ) : (
          canAsk &&
          !asking && (
            <button type="button" onClick={() => setAsking(true)} className="text-[#9cc3ea] underline underline-offset-2">
              Request credit
            </button>
          )
        )}
      </div>
      {asking && (
        <div className="mt-2 space-y-2">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Why"
            className="w-full bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-white text-base md:text-sm"
          >
            {Object.entries(CREDIT_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything we should know (optional)"
            aria-label="Note"
            className="w-full bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-white text-base md:text-sm placeholder-gray-500"
          />
          {error && <p className="text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={submit} className="px-3 py-1.5 rounded bg-[#336699] text-white disabled:opacity-50">
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="px-3 py-1.5 rounded border border-[#333] text-gray-300">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
