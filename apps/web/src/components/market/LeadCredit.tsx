import React from 'react';
import type { Lead } from '../leads/leadTypes';
import { leadOrigin } from './wallet';

/**
 * On a lead bought from FieldQuote: what it cost, and the state of a credit
 * if one is already on file. Credits are handled by FieldQuote, not asked
 * for from here.
 */
export const LeadCredit: React.FC<{ lead: Lead }> = ({ lead }) => {
  if (!lead.marketplaceLeadId) return null;
  const request = lead.creditRequest;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="lead-credit">
      <span className="text-emerald-300">{leadOrigin(lead)}</span>
      {request && (
        <span className={request.status === 'approved' ? 'text-emerald-300' : request.status === 'denied' ? 'text-gray-400' : 'text-amber-200'}>
          {request.status === 'approved' ? 'Credited' : request.status === 'denied' ? 'Credit declined' : 'Credit requested'}
        </span>
      )}
    </div>
  );
};
