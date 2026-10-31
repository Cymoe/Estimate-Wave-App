import React, { useCallback, useEffect, useState } from 'react';
import { followUpsAPI, type ReminderStatus } from '../../lib/api';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

/** Where this estimate's reminder emails stand, with a switch to stop them for this client. */
export const RemindersCard: React.FC<{ estimateId: string }> = ({ estimateId }) => {
  const [state, setState] = useState<ReminderStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.resolve()
      .then(() => followUpsAPI.status(estimateId))
      .then(setState)
      .catch(() => setState(null));
  }, [estimateId]);
  useEffect(load, [load]);

  if (!state || !state.open) return null;

  const line = !state.companyOn
    ? 'Reminders are off for your company (Settings → Notifications).'
    : !state.clientEmail
      ? 'Add an email for this client to send reminders.'
      : !state.on
        ? 'No reminders for this estimate.'
        : state.sent >= state.max
          ? `Both reminders sent; the last on ${day(state.lastAt)}.`
          : state.nextAt
            ? `${state.sent ? `Reminder sent ${day(state.lastAt)}. ` : ''}Next reminder to ${state.clientEmail} around ${day(state.nextAt)} if they haven't signed.`
            : '';

  return (
    <div className="bg-[#1a1a1a] border border-[#333] p-4" data-testid="reminders">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Reminders</h3>
        {state.companyOn && state.clientEmail && (
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={state.on}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  await followUpsAPI.setForEstimate(estimateId, e.target.checked);
                  load();
                } finally {
                  setBusy(false);
                }
              }}
              aria-label="Remind this client"
              className="w-4 h-4"
            />
            Remind this client
          </label>
        )}
      </div>
      <p className="text-sm text-gray-400">{line}</p>
    </div>
  );
};
