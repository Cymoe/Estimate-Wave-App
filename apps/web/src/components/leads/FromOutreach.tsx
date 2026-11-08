import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { outreachAPI, type OutreachOwnerOfLead } from '../../lib/api';
import { shortMoney } from '../../../convex/lib/outreach';

/**
 * Where an Outreach lead came from: the owner (or owners, when sister
 * companies were joined into one lead), what they own, why they were picked,
 * and a way back to their page in Outreach.
 */
export const FromOutreach: React.FC<{ organizationId: string; leadId: string }> = ({ organizationId, leadId }) => {
  const [owners, setOwners] = useState<OutreachOwnerOfLead[] | null>(null);
  useEffect(() => {
    let live = true;
    outreachAPI
      .ownersOfLead(organizationId, leadId)
      .then((o) => live && setOwners(o))
      .catch(() => live && setOwners([]));
    return () => {
      live = false;
    };
  }, [organizationId, leadId]);
  if (!owners || owners.length === 0) return null;
  return (
    <section className="mt-5 border border-[#333333] bg-[#121212] px-4 py-3" data-testid="from-outreach">
      <h3 className="text-xs uppercase tracking-wider text-gray-500">From Outreach</h3>
      <ul className="mt-2 space-y-3">
        {owners.map((o) => (
          <li key={o.id} className="text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-gray-100 font-medium">{o.name}</span>
              <Link to={`/outreach?owner=${o.id}`} className="shrink-0 inline-flex items-center gap-1 text-[#7fb0e0] hover:text-white">
                See owner <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-gray-500">
              {[o.properties > 1 ? `${o.properties} properties · ${shortMoney(o.totalValueCents)}` : o.address, o.why].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};
