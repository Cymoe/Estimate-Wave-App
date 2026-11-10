import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Mail, X } from 'lucide-react';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { useConfirm } from '../common/ConfirmDialog';
import { emailAPI, type CampaignEmail, type EmailCampaign, type MailboxInfo } from '../../lib/api';
import { connectGmail } from '../../lib/gmailConnect';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : "That didn't work");
/** "Tue 2:10 PM" in Central time, as the sender plans it. */
const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

type Checked = { count: number; sample: number; skipped: string[] };

/**
 * "Email these": the owners on the page who can be emailed, a short first
 * email and two follow-ups for each written by the AI, read and edited
 * here, then approved: they go from the company's own Gmail on working days,
 * within its daily limit. Closing before approving throws the drafts away.
 */
export const EmailSheet: React.FC<{
  open: boolean;
  organizationId: string;
  /** The owners on the page now; the ones that can't be emailed are counted and left out. */
  contactIds: string[];
  /** Where Connect Gmail comes back to. */
  returnTo: string;
  onClose: () => void;
  onScheduled: (line: string) => void;
}> = ({ open, organizationId, contactIds, returnTo, onClose, onScheduled }) => {
  const [checked, setChecked] = useState<Checked | null>(null);
  const [mailbox, setMailbox] = useState<MailboxInfo | null>(null);
  const [followUps, setFollowUps] = useState(true);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();
  const ids = useMemo(() => contactIds.slice(0, 1000), [contactIds]);
  const key = ids.join(',');

  useEffect(() => {
    if (!open) return;
    setChecked(null);
    setCampaignId(null);
    setCampaign(null);
    setError(null);
    emailAPI.check(organizationId, ids).then(setChecked, (err) => setError(errorText(err)));
    return emailAPI.watchMailbox(organizationId, setMailbox, (err) => setError(errorText(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, key]);
  useEffect(() => (campaignId ? emailAPI.watchCampaign(organizationId, campaignId, setCampaign, (err) => setError(errorText(err))) : undefined), [organizationId, campaignId]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const write = () =>
    act(async () => {
      const r = await emailAPI.start(organizationId, ids, followUps);
      if (r.campaignId) setCampaignId(r.campaignId);
      else setError('None of these owners can be emailed.');
    });
  const approve = () =>
    act(async () => {
      const r = await emailAPI.approve(organizationId, campaignId!);
      onScheduled(`${r.count} ${r.count === 1 ? 'email is' : 'emails are'} scheduled from ${campaign?.mailbox?.email ?? 'your Gmail'}: the first goes ${when(r.first)}${r.count > 1 ? `, the last ${when(r.last)}` : ''}.`);
      setCampaignId(null);
      onClose();
    });
  const close = async () => {
    const drafts = campaign && (campaign.status === 'review' || campaign.status === 'drafting') ? campaign.owners.length : 0;
    if (drafts > 0) {
      const ok = await confirm({ title: 'Throw away these drafts?', message: `The ${drafts} ${drafts === 1 ? 'draft' : 'drafts'} won't be sent. You can write new ones any time.`, confirmLabel: 'Throw away', tone: 'danger' });
      if (!ok) return;
      await emailAPI.discard(organizationId, campaignId!).catch(() => {});
    }
    setCampaignId(null);
    onClose();
  };

  const connected = mailbox?.connected;
  const reviewing = Boolean(campaign);
  const firsts = campaign?.owners.filter((o) => o.emails[0]?.status === 'draft').length ?? 0;
  const blocker = !connected ? 'Connect Gmail to send' : !mailbox?.postal ? "Add your company's street address in Settings first" : campaign && campaign.writing > 0 ? `Writing ${campaign.writing} more…` : null;

  return (
    <SlideOutDrawer isOpen={open} onClose={() => void close()} title="Email owners" width="lg">
      <div className="p-6 space-y-5 min-h-full flex flex-col" data-testid="email-sheet">
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        {!connected && mailbox && (
          <div className="border border-[#333333] bg-[#1A1A1A] p-4 space-y-2" data-testid="email-connect">
            <p className="text-white">Emails go out from your own Gmail, in your name.</p>
            <p className="text-sm text-gray-400">Connect it once. Webb Leads asks Google only for permission to send; it never reads your inbox.</p>
            {mailbox.lost && <p className="text-sm text-amber-300">{mailbox.lost.email} isn&apos;t connected any more: {mailbox.lost.why}</p>}
            <button
              type="button"
              disabled={busy || mailbox.setupMissing.length > 0}
              onClick={() => void act(() => connectGmail(organizationId, returnTo))}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium text-white bg-[#336699] hover:bg-[#2A5580] disabled:opacity-40"
            >
              <Mail className="w-4 h-4" /> Connect Gmail
            </button>
            {mailbox.setupMissing.length > 0 && <p className="text-xs text-gray-500">Email isn&apos;t switched on for Webb Leads yet.</p>}
          </div>
        )}
        {!reviewing ? (
          checked === null ? (
            <p className="text-sm text-gray-500">Counting who can be emailed…</p>
          ) : (
            <div className="space-y-4" data-testid="email-intro">
              <p className="text-lg font-semibold text-white">
                {checked.count === 0 ? 'Nobody here can be emailed yet' : `${checked.count} ${checked.count === 1 ? 'owner' : 'owners'} can be emailed`}
              </p>
              {checked.skipped.length > 0 && (
                <ul className="text-sm text-gray-400 list-disc pl-5">
                  {checked.skipped.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              {checked.sample > 0 && <p className="text-sm text-gray-500">{checked.sample} have sample addresses: their emails go through the steps but aren&apos;t really sent.</p>}
              {checked.count > 0 && (
                <>
                  <label className="flex items-start gap-3 text-sm text-gray-300">
                    <input type="checkbox" checked={followUps} onChange={(e) => setFollowUps(e.target.checked)} className="mt-1 w-4 h-4" />
                    <span>
                      Two short follow-ups, 3 and 7 days later
                      <span className="block text-xs text-gray-500">They stop as soon as the owner replies.</span>
                    </span>
                  </label>
                  <button type="button" disabled={busy} onClick={() => void write()} className="w-full min-h-[48px] text-sm font-medium text-white bg-[#336699] hover:bg-[#2A5580] disabled:opacity-50" data-testid="write-drafts">
                    {busy ? 'Starting…' : `Write ${Math.min(checked.count, 100)} ${checked.count === 1 ? 'draft' : 'drafts'}`}
                  </button>
                  <p className="text-xs text-gray-500">The AI writes each email from what you know about the owner. Nothing is sent until you approve it. Drafts are free.</p>
                </>
              )}
            </div>
          )
        ) : (
          <div className="space-y-3 flex-1" data-testid="email-drafts">
            <p className="text-sm text-gray-400">
              {campaign!.writing > 0 ? `Writing ${campaign!.writing} of ${campaign!.owners.length}…` : `${campaign!.owners.length} ${campaign!.owners.length === 1 ? 'email' : 'emails'} to read over. Edit anything, or take an owner out.`}
            </p>
            <ul className="space-y-3">
              {campaign!.owners.map((o) => (
                <OwnerDraft key={o.contactId} owner={o} footer={campaign!.footer} onEdit={(id, change) => emailAPI.edit(organizationId, id, change)} onRemove={() => void act(() => emailAPI.removeOwner(organizationId, campaignId!, o.contactId))} />
              ))}
            </ul>
          </div>
        )}
        {reviewing && (
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-[#121212] border-t border-[#333333] space-y-2" data-testid="email-approve">
            <p className="text-xs text-gray-400" data-testid="email-schedule">
              {connected && campaign!.schedule
                ? `Sends up to ${connected.dailyCap} a day from ${connected.email}, weekdays 8 to 5 Central. First ${when(campaign!.schedule.first)}, last ${when(campaign!.schedule.last)}.`
                : blocker}
            </p>
            <button type="button" disabled={busy || Boolean(blocker) || firsts === 0} onClick={() => void approve()} className="w-full min-h-[48px] text-sm font-medium text-white bg-[#336699] hover:bg-[#2A5580] disabled:opacity-40" data-testid="approve-emails">
              {blocker ?? `Approve and send ${firsts}`}
            </button>
          </div>
        )}
      </div>
      {dialog}
    </SlideOutDrawer>
  );
};

/** One owner's first email (subject and body editable) and its follow-ups, folded until opened. */
const OwnerDraft: React.FC<{
  owner: EmailCampaign['owners'][number];
  footer: string;
  onEdit: (emailId: string, change: { subject?: string; body?: string }) => Promise<unknown>;
  onRemove: () => void;
}> = ({ owner, footer, onEdit, onRemove }) => {
  const [first, ...rest] = owner.emails;
  const [more, setMore] = useState(false);
  if (!first) return null;
  return (
    <li className="border border-[#333333] bg-[#1A1A1A]" data-testid="email-draft">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">
            {owner.name}
            {owner.company && owner.company !== owner.name ? <span className="text-gray-500"> · {owner.company}</span> : null}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {owner.to}
            {owner.property ? ` · ${owner.property}` : ''}
            {owner.sample ? ' · sample address, not really sent' : ''}
          </p>
        </div>
        {first.status === 'draft' && (
          <button type="button" onClick={onRemove} aria-label={`Take ${owner.name} out`} className="w-9 h-9 -mr-2 inline-flex items-center justify-center text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {first.writing ? (
        <div className="px-4 py-3 space-y-2 animate-pulse" aria-busy="true">
          <div className="h-3.5 w-1/2 bg-[#2A2A2A]" />
          <div className="h-2.5 w-full bg-[#222222]" />
          <div className="h-2.5 w-5/6 bg-[#222222]" />
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          <Field email={first} part="subject" onEdit={onEdit} />
          <Field email={first} part="body" onEdit={onEdit} />
          <p className="text-[11px] text-gray-600">{footer} · Unsubscribe</p>
          {rest.length > 0 && (
            <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="inline-flex items-center gap-1 text-xs text-[#7fb0e0] hover:text-white">
              {rest.length} follow-{rest.length === 1 ? 'up' : 'ups'} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${more ? 'rotate-180' : ''}`} />
            </button>
          )}
          {more && rest.map((f) => <Field key={f.id} email={f} part="body" onEdit={onEdit} label={`Follow-up ${f.step}`} />)}
        </div>
      )}
    </li>
  );
};

/** A subject line or a body, saved when it loses focus. */
const Field: React.FC<{ email: CampaignEmail; part: 'subject' | 'body'; label?: string; onEdit: (emailId: string, change: { subject?: string; body?: string }) => Promise<unknown> }> = ({ email, part, label, onEdit }) => {
  const [value, setValue] = useState(email[part]);
  const [saved, setSaved] = useState(email[part]);
  useEffect(() => {
    setValue(email[part]);
    setSaved(email[part]);
  }, [email, part]);
  const editable = email.status === 'draft' || email.status === 'waiting';
  const save = () => {
    if (value.trim() && value !== saved) {
      setSaved(value);
      void onEdit(email.id, { [part]: value }).catch(() => setValue(saved));
    }
  };
  const look = 'w-full bg-black border border-[#333333] px-3 text-white focus:outline-none focus:border-[#336699] disabled:text-gray-400';
  return (
    <label className="block">
      {label && <span className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">{label}</span>}
      {part === 'subject' ? (
        <input value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} onBlur={save} aria-label="Subject" className={`${look} h-10 text-base md:text-sm font-medium`} />
      ) : (
        <textarea value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} onBlur={save} aria-label={label ?? 'Email'} rows={Math.min(18, Math.max(4, value.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 58)), 0) + 1))} className={`${look} py-2 text-base md:text-sm leading-relaxed`} />
      )}
    </label>
  );
};
