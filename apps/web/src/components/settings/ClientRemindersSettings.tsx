import React, { useEffect, useState } from 'react';
import { organizationsAPI } from '../../lib/api';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t save');

/**
 * Reminder emails to clients who haven't signed: on by default, a few days
 * after the estimate goes out and once more after the same wait.
 */
export const ClientRemindersSettings: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [enabled, setEnabled] = useState(true);
  const [days, setDays] = useState('3');
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([organizationsAPI.getById(organizationId), organizationsAPI.myRole(organizationId).catch(() => 'member' as const)])
      .then(([org, role]) => {
        if (!live) return;
        const followUps = (org as { followUps?: { enabled: boolean; afterDays: number } } | null)?.followUps;
        setEnabled(followUps?.enabled ?? true);
        setDays(String(followUps?.afterDays ?? 3));
        setCanEdit(role === 'owner' || role === 'admin');
        setLoaded(true);
      })
      .catch((err) => live && setNote({ text: errorText(err), good: false }));
    return () => {
      live = false;
    };
  }, [organizationId]);

  const save = async (next: { enabled: boolean; afterDays: string }) => {
    setNote(null);
    try {
      await organizationsAPI.setFollowUps(organizationId, { enabled: next.enabled, afterDays: Number(next.afterDays) });
      setNote({ text: 'Saved.', good: true });
    } catch (err) {
      setNote({ text: errorText(err), good: false });
    }
  };

  if (!loaded) return <p className="text-sm text-gray-500">{note?.text ?? 'Loading…'}</p>;

  return (
    <section aria-label="Client reminders" className="space-y-3">
      <p className="text-sm text-gray-400">
        When a client hasn&rsquo;t signed an estimate, Webb Leads emails them a friendly reminder with its link, from your company name (replies come to
        you). Two reminders at most; none once they sign. You can stop them for one estimate from its Overview.
      </p>
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => {
            setEnabled(e.target.checked);
            save({ enabled: e.target.checked, afterDays: days });
          }}
          className="w-4 h-4"
        />
        <span className="text-sm text-white">Remind clients who haven&rsquo;t signed</span>
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        After
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="30"
          value={days}
          disabled={!canEdit || !enabled}
          onChange={(e) => setDays(e.target.value)}
          onBlur={() => save({ enabled, afterDays: days })}
          aria-label="Days before a reminder"
          className="w-16 bg-[#0A0A0A] border border-[#333] px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699] disabled:opacity-60"
        />
        days, and again after the same wait
      </label>
      {!canEdit && <p className="text-sm text-amber-200/90">Ask an owner or admin of the company to change these.</p>}
      {note && (
        <p role="status" className={`text-sm ${note.good ? 'text-green-400' : 'text-red-400'}`}>
          {note.text}
        </p>
      )}
    </section>
  );
};
