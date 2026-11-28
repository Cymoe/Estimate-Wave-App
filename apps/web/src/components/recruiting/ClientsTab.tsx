import React, { useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { recruitingAPI, type RecruitBilling, type RecruitClient, type RecruitClientInput } from '../../lib/api';
import { Dialog, Field, input, primary, secondary } from '../ops/ui';
import { applyLink, copy, dollars, errorText, hiresLink } from './labels';

const TIMEZONES = ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles'];

const blank: RecruitClientInput = { name: '', role: '', city: '', compSheet: '', calEventLink: '', timezone: 'America/Chicago', repStories: [], adsEnabled: true, active: true };

/** Add or change a client: what Jordan screens for, and what the ad agent writes from. */
function ClientForm({ initial, onClose }: { initial: RecruitClient | null; onClose: () => void }) {
  const [c, setC] = useState<RecruitClientInput>(() => (initial ? { ...initial } : { ...blank }));
  const [stories, setStories] = useState((initial?.repStories ?? []).join('\n\n'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof RecruitClientInput>(k: K, v: RecruitClientInput[K]) => setC((x) => ({ ...x, [k]: v }));
  const text = (k: keyof RecruitClientInput) => ({ value: String(c[k] ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never) });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await recruitingAPI.saveClient({
        ...(initial ? { clientId: initial.id } : {}),
        name: c.name,
        role: c.role,
        city: c.city,
        compSheet: c.compSheet,
        calEventLink: c.calEventLink,
        calEventTypeId: c.calEventTypeId ? Number(c.calEventTypeId) : undefined,
        timezone: c.timezone,
        reportEmail: c.reportEmail || undefined,
        territory: c.territory || undefined,
        // A blank line between stories.
        repStories: stories.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
        perks: c.perks || undefined,
        wants: c.wants || undefined,
        adsEnabled: c.adsEnabled ?? false,
        active: c.active ?? true,
      });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <Dialog title={initial ? `Edit ${initial.name}` : 'Add a client'} onClose={onClose} wide>
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">What Jordan screens for</p>
      <Field label="Company">
        <input className={input} {...text('name')} placeholder="Acme Roofing" aria-label="Company" />
      </Field>
      <Field label="Role">
        <input className={input} {...text('role')} placeholder="Door-to-door roofing sales rep (setters and closers)" aria-label="Role" />
      </Field>
      <Field label="City">
        <input className={input} {...text('city')} placeholder="Midland, TX" aria-label="City" />
      </Field>
      <Field label="Comp sheet" hint="The real pay plan: Jordan and the ads only quote what's here.">
        <textarea className={`${input} min-h-[96px]`} {...text('compSheet')} aria-label="Comp sheet" />
      </Field>
      <Field label="Cal.com booking link">
        <input className={input} {...text('calEventLink')} placeholder="https://cal.com/acme/interview" aria-label="Booking link" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Field label="Cal.com event type id" hint="The number in the event type's address. Without it Jordan sends the link.">
          <input className={input} inputMode="numeric" value={c.calEventTypeId ?? ''} onChange={(e) => set('calEventTypeId', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined)} aria-label="Event type id" />
        </Field>
        <Field label="Timezone">
          <select className={input} value={c.timezone} onChange={(e) => set('timezone', e.target.value)} aria-label="Timezone">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace('America/', '').replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Report email" hint="Gets a note for each interview booked (who's coming and what they told Jordan) and the weekly report.">
        <input className={input} type="email" {...text('reportEmail')} placeholder="hiring@acmeroofing.com" aria-label="Report email" />
      </Field>

      <p className="text-xs uppercase tracking-wide text-gray-500 mt-5 mb-2">What the ad agent writes from</p>
      <Field label="Territory">
        <input className={input} {...text('territory')} placeholder="Permian Basin" aria-label="Territory" />
      </Field>
      <Field label="Rep stories" hint="Two or three real ones: who they were before, what they earn now. A blank line between stories.">
        <textarea className={`${input} min-h-[96px]`} value={stories} onChange={(e) => setStories(e.target.value)} aria-label="Rep stories" />
      </Field>
      <Field label="Culture and perks">
        <input className={input} {...text('perks')} placeholder="Paid training, weekly leaderboard, Cabo trip for the top 10" aria-label="Perks" />
      </Field>
      <Field label="Who they want">
        <input className={input} {...text('wants')} placeholder="Closers and setters; experience a plus" aria-label="Who they want" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-200 mb-2">
        <input type="checkbox" checked={c.adsEnabled ?? false} onChange={(e) => set('adsEnabled', e.target.checked)} /> Write a new batch of ads every Monday
      </label>
      {initial && (
        <label className="flex items-center gap-2 text-sm text-gray-200 mb-2">
          <input type="checkbox" checked={c.active ?? true} onChange={(e) => set('active', e.target.checked)} /> Taking applicants
        </label>
      )}
      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className={secondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={primary} disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : initial ? 'Save' : 'Add client'}
        </button>
      </div>
    </Dialog>
  );
}

const BILLING_LABEL: Record<RecruitBilling['status'], string> = { none: 'Not billed yet', link_sent: 'Payment link sent', active: 'Paying', past_due: 'Payment failed', canceled: 'Canceled' };
const BILLING_TONE: Record<RecruitBilling['status'], string> = {
  none: 'text-gray-400',
  link_sent: 'text-[#7fb0e0]',
  active: 'text-emerald-300',
  past_due: 'text-red-400',
  canceled: 'text-gray-500',
};

/** The client's plan (retainer and fee per hire), whether they're paying, and the Stripe link to start. */
function BillingRow({ client, stripeReady }: { client: RecruitClient; stripeReady: boolean }) {
  const b = client.billing;
  const [editing, setEditing] = useState(false);
  const [monthly, setMonthly] = useState(b ? String(b.monthlyCents / 100) : '2500');
  const [perHire, setPerHire] = useState(b ? String(b.perHireCents / 100) : '250');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(b?.status === 'link_sent' ? (b.link ?? null) : null);
  if (client.demo) return null;
  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      await recruitingAPI.setPlan(client.id, Number(monthly.replace(/[$,]/g, '')) || 0, Number(perHire.replace(/[$,]/g, '')) || 0);
      setEditing(false);
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await recruitingAPI.sendPaymentLink(client.id);
      setLink(r.link);
      setNote(r.emailed ? `Emailed to ${client.reportEmail}.` : 'Copy the link and send it to them.');
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 border-t border-[#2A2A2A] pt-3 text-xs space-y-2" data-testid="billing">
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-gray-400">
            Monthly ($)
            <input className={`${input} w-28 mt-1`} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} aria-label="Monthly fee" />
          </label>
          <label className="text-gray-400">
            Per hire ($)
            <input className={`${input} w-24 mt-1`} inputMode="decimal" value={perHire} onChange={(e) => setPerHire(e.target.value)} aria-label="Fee per hire" />
          </label>
          <button type="button" className={primary} disabled={busy} onClick={() => void save()}>
            Save plan
          </button>
          <button type="button" className={secondary} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`font-medium ${BILLING_TONE[b?.status ?? 'none']}`}>{BILLING_LABEL[b?.status ?? 'none']}</span>
          {b && (
            <span className="text-gray-400">
              {dollars(b.monthlyCents)}/month{b.perHireCents ? ` + ${dollars(b.perHireCents)} per hire` : ''}
              {client.billedHiresThisMonth ? ` · ${client.billedHiresThisMonth} ${client.billedHiresThisMonth === 1 ? 'hire' : 'hires'} billed this month` : ''}
            </span>
          )}
          <button type="button" className="text-[#7fb0e0]" onClick={() => setEditing(true)}>
            {b ? 'Change plan' : 'Set plan'}
          </button>
          {b && b.monthlyCents > 0 && b.status !== 'active' && (
            <button type="button" className={secondary} disabled={busy || !stripeReady} onClick={() => void send()} title={stripeReady ? undefined : 'Connect Stripe first (Setup tab)'}>
              {busy ? 'Making link…' : b.status === 'link_sent' ? 'Send a new payment link' : 'Send payment link'}
            </button>
          )}
        </div>
      )}
      {!stripeReady && b && b.status !== 'active' && <p className="text-gray-500">Connect Stripe to bill (Setup tab).</p>}
      {link && (
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-gray-400">Payment link</span>
          <span className="text-gray-200 break-all">{link}</span>
          <button type="button" className="text-[#7fb0e0] inline-flex items-center gap-1" onClick={() => void copy(link).then((ok) => setNote(ok ? 'Copied.' : "Couldn't copy."))}>
            <Copy className="w-3 h-3" /> Copy
          </button>
        </p>
      )}
      {note && <p className="text-gray-300">{note}</p>}
    </div>
  );
}

function LinkRow({ label, hint, url, copied, onCopy }: { label: string; hint: string; url: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2">
        <span className="text-gray-400">{label}</span>
        <a href={url} target="_blank" rel="noreferrer" className="text-gray-200 break-all underline-offset-2 hover:underline">
          {url}
        </a>
        <button type="button" className="text-[#7fb0e0] inline-flex items-center gap-1" onClick={onCopy}>
          <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      <p>{hint}</p>
    </div>
  );
}

export function ClientsTab({ clients, applyUrl, stripeReady = false }: { clients: RecruitClient[] | null; applyUrl?: string; stripeReady?: boolean }) {
  const [editing, setEditing] = useState<RecruitClient | 'new' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copyIt = async (key: string, text: string) => {
    if (await copy(text)) setCopied(key);
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-400">{clients === null ? 'Loading…' : `${clients.length} ${clients.length === 1 ? 'client' : 'clients'}`}</p>
        <button type="button" className={primary} onClick={() => setEditing('new')}>
          <Plus className="w-4 h-4" /> Add client
        </button>
      </div>
      {clients?.length === 0 && <p className="text-sm text-gray-400">No clients yet. Add one to start screening and writing ads for them.</p>}
      {clients?.map((c) => (
        <section key={c.id} className="border border-[#2A2A2A] rounded p-4 bg-[#121212]" data-testid="recruit-client">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white">
                {c.name} {c.demo && <span className="text-xs text-gray-500 font-normal">· demo</span>} {!c.active && <span className="text-xs text-gray-500 font-normal">· paused</span>}
              </h3>
              <p className="text-sm text-gray-400">
                {c.role} · {c.city}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {c.applicants} applicants · {c.A} A&apos;s · {c.hired} hired · {c.adsEnabled ? 'weekly ads on' : 'weekly ads off'}
              </p>
            </div>
            <button type="button" className={secondary} onClick={() => setEditing(c)}>
              Edit
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-500 space-y-2">
            <LinkRow label="Apply page" hint="Each approved ad gets its own copy of this link (Ads tab), so applicants trace back to the ad." url={applyLink(c.slug)} copied={copied === `apply-${c.id}`} onCopy={() => void copyIt(`apply-${c.id}`, applyLink(c.slug))} />
            {c.hiresToken && (
              <LinkRow label="Hires link" hint="Private to the client: they mark who they hired. It's in their weekly report too." url={hiresLink(c.hiresToken)} copied={copied === `hires-${c.id}`} onCopy={() => void copyIt(`hires-${c.id}`, hiresLink(c.hiresToken!))} />
            )}
            <p>
              Client id <code className="text-gray-300">{c.id}</code>{' '}
              <button type="button" className="text-[#7fb0e0] inline-flex items-center gap-1" onClick={() => void copyIt(`id-${c.id}`, c.id)}>
                <Copy className="w-3 h-3" /> {copied === `id-${c.id}` ? 'Copied' : 'Copy'}
              </button>{' '}
              for ad forms that post applicants straight to the apply address (Setup tab).
            </p>
          </div>
          <BillingRow client={c} stripeReady={stripeReady} />
        </section>
      ))}
      {applyUrl && clients && clients.length > 0 && <p className="text-xs text-gray-500">Apply address: {applyUrl}</p>}
      {editing && <ClientForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
