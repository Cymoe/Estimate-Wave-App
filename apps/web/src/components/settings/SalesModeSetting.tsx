import React, { useEffect, useState } from 'react';
import { organizationsAPI } from '../../lib/api';

/**
 * Sales mode, for companies with sales reps: on estimates, the red line is a
 * floor no price or discount can go under, and the cap, pricing options and
 * commission show. Off (an owner-operator), it's just your prices.
 * Owners and admins switch it; it applies to everyone in the company.
 */
export const SalesModeSetting: React.FC<{ organizationId: string; on: boolean; onChange: (on: boolean) => void }> = ({
  organizationId,
  on,
  onChange,
}) => {
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => organizationsAPI.myRole(organizationId))
      .then((role) => live && setCanEdit(role === 'owner' || role === 'admin'))
      .catch(() => live && setCanEdit(false));
    return () => {
      live = false;
    };
  }, [organizationId]);

  const flip = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange(await organizationsAPI.setSalesMode(organizationId, !on));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change Sales mode.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#1A1A1A] rounded-lg p-6" data-testid="sales-mode">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Sales mode</h2>
          <p className="text-sm text-gray-400">
            For companies with sales reps. On estimates, each line gets a red line (the lowest price allowed) and a cap, with pricing options and the
            rep's commission. Leave it off if you set your own prices.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Sales mode"
          onClick={flip}
          disabled={!canEdit || busy}
          className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-[#336699]' : 'bg-[#333333]'}`}
        >
          <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {!canEdit && <p className="text-sm text-amber-200/90 mt-2">Ask an owner or admin of the company to change this.</p>}
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
};
