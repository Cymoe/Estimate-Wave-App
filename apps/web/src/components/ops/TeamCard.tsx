import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { staffAPI } from '../../lib/api';
import { useConfirm } from '../common/ConfirmDialog';

interface Team {
  staff: Array<{ id: string; email: string; name: string }>;
  invites: Array<{ id: string; email: string; createdAt: string }>;
}

const secondary =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-200 hover:border-[#336699] disabled:opacity-50';

/**
 * Who runs the Lead Market besides the owner. Staff confirm and send leads;
 * they never see money, prices or company settings. Owner only.
 */
export const TeamCard: React.FC = () => {
  const [team, setTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => setTeam(await staffAPI.list()), []);
  useEffect(() => {
    load().catch(() => setTeam({ staff: [], invites: [] }));
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const result = await staffAPI.invite(email);
      setNote(result.status === 'staff' ? `${email.trim()} is staff now.` : `Invited. ${email.trim()} becomes staff when they sign up with that email.`);
      setEmail('');
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'That didn’t work');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: Team['staff'][number]) => {
    if (!(await confirm({ title: `Remove ${member.email} from staff?`, message: 'They keep their account but lose the Ops page.', confirmLabel: 'Remove' }))) return;
    await staffAPI.remove(member.id);
    await load();
  };

  return (
    <section className="border border-[#2A2A2A] rounded p-4" data-testid="team-card">
      <h3 className="text-sm font-medium text-white">Team</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">Staff confirm and send leads. Money, prices and companies stay with you.</p>
      <form onSubmit={invite} className="flex gap-2 mb-3">
        <input
          type="email"
          aria-label="Staff email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="va@yourcompany.com"
          className="flex-1 bg-[#181818] border border-[#333] rounded px-3 py-1.5 text-sm text-white"
        />
        <button type="submit" disabled={busy || !email.trim()} className={secondary}>
          <UserPlus className="w-4 h-4" />
          Invite
        </button>
      </form>
      {note && <p className="text-xs text-gray-300 mb-3">{note}</p>}
      {team === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : team.staff.length === 0 && team.invites.length === 0 ? (
        <p className="text-sm text-gray-500">Just you so far.</p>
      ) : (
        <ul className="divide-y divide-[#2A2A2A]">
          {team.staff.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-white truncate">
                {member.email}
                {member.name ? <span className="text-gray-500"> · {member.name}</span> : null}
              </span>
              <button type="button" onClick={() => remove(member)} aria-label={`Remove ${member.email}`} className="p-1 text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
          {team.invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-gray-300 truncate">
                {invite.email} <span className="text-xs text-amber-200/80">· invited, not signed up yet</span>
              </span>
              <button
                type="button"
                onClick={() => staffAPI.removeInvite(invite.id).then(load)}
                aria-label={`Take back the invite for ${invite.email}`}
                className="p-1 text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
};
