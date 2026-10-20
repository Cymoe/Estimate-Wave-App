import React, { useContext, useEffect, useState } from 'react';
import { IndustryService } from '../../services/IndustryService';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { IndustryManagementModal } from './IndustryManagementModal';
import { TRADES_CHANGED } from '../settings/TradesEditor';

/**
 * One slim line over the Price Book, Estimates and Services: which trades the
 * company works in, with a way to change them. The Price Book opens on these.
 */
export const IndustryBanner: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  const [names, setNames] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const load = () =>
      IndustryService.getOrganizationIndustries(organizationId)
        .then((rows: Array<{ name: string }>) => setNames(rows.map((r) => r.name)))
        .catch(() => setNames([]));
    load();
    window.addEventListener(TRADES_CHANGED, load);
    return () => window.removeEventListener(TRADES_CHANGED, load);
  }, [organizationId]);

  if (names === null) return null;
  return (
    <div className="border-b border-[#2A2A2A] bg-[#0F0F0F] px-6 py-2 text-xs text-gray-400 flex items-center gap-2" data-trades-line>
      {names.length > 0 ? (
        <span className="min-w-0 truncate">
          Trades: <span className="text-gray-200">{names.join(', ')}</span>
        </span>
      ) : (
        <span className="text-amber-200">Pick your trades to see their items first</span>
      )}
      <span aria-hidden="true">·</span>
      <button type="button" onClick={() => setEditing(true)} className="text-[#7fb0e0] underline underline-offset-2 whitespace-nowrap">
        {names.length > 0 ? 'Change' : 'Pick trades'}
      </button>
      <IndustryManagementModal isOpen={editing} onClose={() => setEditing(false)} />
    </div>
  );
};
