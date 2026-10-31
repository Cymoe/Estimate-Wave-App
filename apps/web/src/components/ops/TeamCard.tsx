import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { staffAPI } from '../../lib/api';
import { useConfirm } from '../common/ConfirmDialog';

type TeamRole = 'staff' | 'caller';

interface Team {
  staff: Array<{ id: string; email: string; name: string; role?: TeamRole }>;
  invites: Array<{ id: string; email: string; role?: TeamRole; createdAt: string }>;
}

const ROLE_LABEL: Record<TeamRole, string> = { staff: 'staff', caller: 'caller' };

const secondary =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-200 hover:border-[#336699] disabled:opacity-50';

/**
 * Who runs the Lead Market besides the owner. Staff confirm and send leads;
 * they never see money, prices or company settings. Callers phone homeowners
 * from call lists and see only the Calls page. Owner only.
 */
export const TeamCard: React.FC = () => {
  const [team, setTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('staff');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => setTeam(await staffAPI.list()), []);
  useEffect(() => {
    load().catch((err) => setNote(`The team couldn't be loaded: ${err instanceof Error && err.message ? err.message : 'server error'}`));
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const result = await staffAPI.invite(email, role);
      setNote(
        result.status === 'invited'
          ? `Invited. ${email.trim()} becomes ${role === 'caller' ? 'a caller' : 'staff'} when they sign up with that email.`
          : `${email.trim()} is ${result.status === 'caller' ? 'a caller' : 'staff'} now.`,
      );
      setEmail('');
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'That didn’t work');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: Team['staff'][number]) => {
    const calls = member.role === 'caller';
    if (!(await confirm({ title: `Remove ${member.email} from the team?`, message: `They keep their account but lose the ${calls ? 'Calls' : 'Ops'} page.`, confirmLabel: 'Remove' }))) return;
    try {
      await staffAPI.remove(member.id);
      await load();
    } catch (err) {
      setNote(`${member.email} wasn't removed: ${err instanceof Error && err.message ? err.message : 'server error'}`);
    }
  };

  return (
    <section className="border border-[#2A2A2A] rounded p-4" data-testid="team-card">
      <h3 className="text-sm font-medium text-white">Team</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        Staff confirm and send leads. They see balances but can't change money, prices or company setup. Callers phone homeowners
        from call lists and see only the Calls page; someone else confirms the leads they take.
      </p>
      <form onSubmit={invite} className="flex gap-2 mb-3">
        <input
          type="email"
          aria-label="Staff email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="va@yourcompany.com"
          className="flex-1 min-w-0 bg-[#181818] border border-[#333] rounded px-3 py-1.5 text-sm text-white"
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          className="bg-[#181818] border border-[#333] rounded px-2 py-1.5 text-sm text-white"
        >
          <option value="staff">Staff</option>
          <option value="caller">Caller</option>
        </select>
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
                <span className="text-xs text-gray-500"> · {ROLE_LABEL[member.role ?? 'staff']}</span>
              </span>
              <button type="button" onClick={() => remove(member)} aria-label={`Remove ${member.email}`} className="p-1 text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
          {team.invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-gray-300 truncate">
                {invite.email} <span className="text-xs text-amber-200/80">· invited as {ROLE_LABEL[invite.role ?? 'staff']}, not signed up yet</span>
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
