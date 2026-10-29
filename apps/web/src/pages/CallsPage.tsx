import React, { useCallback, useEffect, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { callsAPI, industriesAPI } from '../lib/api';
import { consentLine } from '../../convex/lib/calls';
import { APP_NAME } from '../config/brand';
import { Dialog, Field, input, primary, secondary } from '../components/ops/ui';

type Kind = 'trade_permits' | 'recent_buyers' | 'street' | 'auction_buyers';
type Trade = { id: string; name: string };

interface Home {
  parcelId?: string;
  owner?: string;
  owner2?: string;
  address: string;
  street?: string;
  zip?: string;
  marketValueCents?: number;
  deedDate?: string;
  why?: string;
  /** Set when it came from a callback. */
  phone?: string;
  callbackNote?: string;
}

interface MyDay {
  calls: number;
  answered: number;
  leads: number;
  hours: { open: boolean; reason?: string };
  callbacks: Array<{ id: string; parcelId?: string; phone: string; address: string; owner?: string; trade?: string; callbackAt: string; note?: string }>;
  /** The name homeowners know (the consumer brand); what the caller says they're with. */
  brand?: string;
}


const KINDS: Array<[Kind, string]> = [
  ['trade_permits', 'Near permits'],
  ['recent_buyers', 'Recent buyers'],
  ['street', 'A street'],
  ['auction_buyers', 'Auction buyers'],
];

const OUTCOME_BUTTONS: Array<[string, string]> = [
  ['no_answer', 'No answer'],
  ['voicemail', 'Left voicemail'],
  ['wrong_number', 'Wrong number'],
  ['not_interested', 'Not interested'],
];

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'server error');
const money = (cents?: number) => (cents ? `$${Math.round(cents / 100).toLocaleString()}` : undefined);
const monthYear = (date?: string) =>
  date ? new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }) : undefined;
const pretty = (digits: string) => (digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits);

/** What the caller says, filled in for this home. The consent line is read word for word. */
function Script({ caller, home, tradeName, kind, brand }: { caller: string; home: Home; tradeName: string; kind: Kind; brand?: string }) {
  const trade = tradeName.toLowerCase();
  const why =
    kind === 'trade_permits' && home.street
      ? `A few homes on ${home.street} have had ${trade} work done lately, and I'm calling neighbors to see if you've been thinking about any ${trade} work.`
      : kind === 'recent_buyers'
        ? `Congratulations on the home. I'm calling to see if you've been planning any ${trade} work.`
        : kind === 'auction_buyers'
          ? `I saw you picked up ${home.address} at the courthouse auction. Are you planning any work on it? We have ${trade} companies ready to bid.`
          : `I'm calling homeowners${home.street ? ` on ${home.street}` : ''} to see if you've been thinking about any ${trade} work.`;
  return (
    <div className="rounded border border-[#2A2A2A] bg-[#151515] p-3 text-sm text-gray-200 space-y-2" data-testid="call-script">
      <p>
        "Hi, this is {caller} with {brand ?? APP_NAME}, a network of local contractors here in Midland.{' '}
        {kind === 'auction_buyers' ? `Am I speaking with ${home.owner ?? 'the buyer'}?` : `Am I speaking with the homeowner at ${home.address}?`}"
      </p>
      <p>"{why}"</p>
      <p className="text-gray-400">If they're interested, ask what kind of work and when, then read this word for word:</p>
      <p className="font-medium text-white" data-testid="consent-line">
        "{consentLine(tradeName, brand)}"
      </p>
      <p className="text-gray-400">If they ask not to be called again, say you'll make sure of it, and tap "Don't call again".</p>
    </div>
  );
}

/** One home: check the number, dial, then say how it went or take the lead. */
function HomeCall({
  home,
  kind,
  trade,
  trades,
  caller,
  brand,
  onDone,
  onClose,
}: {
  home: Home;
  kind: Kind;
  trade: Trade;
  trades: Trade[];
  caller: string;
  /** The consumer brand, from myDay; the caller's intro and the consent line name it. */
  brand?: string;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState(home.phone ?? '');
  const [checked, setChecked] = useState<{ ok: true; phone: string } | { ok: false; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackAt, setCallbackAt] = useState('');
  const [taking, setTaking] = useState(false);
  const [lead, setLead] = useState({
    name: home.owner ?? '',
    address: home.address,
    jobType: trade.id,
    scope: '',
    timeline: '',
    notes: '',
    isOwner: false,
    consented: false,
  });
  const leadTrade = trades.find((t) => t.id === lead.jobType) ?? trade;

  const check = async () => {
    setError(null);
    setChecked(null);
    try {
      setChecked(await callsAPI.check(phone));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const log = async (outcome: string) => {
    if (!checked?.ok) return;
    if (outcome === 'callback' && !callbackAt) {
      setError('Pick when to call back.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callsAPI.log({
        phone: checked.phone,
        outcome,
        address: home.address,
        parcelId: home.parcelId,
        owner: home.owner,
        trade: trade.id,
        callbackAt: outcome === 'callback' ? new Date(callbackAt).toISOString() : undefined,
      });
      onDone(outcome === 'do_not_call' ? `${pretty(checked.phone)} won't be called again.` : `Logged: ${home.address}.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const take = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checked?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await callsAPI.takeLead({
        parcelId: home.parcelId,
        phone: checked.phone,
        name: lead.name,
        address: lead.address,
        zip: home.zip,
        jobType: lead.jobType,
        scope: lead.scope || undefined,
        timeline: lead.timeline || undefined,
        notes: lead.notes || undefined,
        isOwner: lead.isOwner,
        consented: lead.consented,
      });
      onDone(
        `Lead taken: ${lead.name}. It's in Ops for someone to confirm${result.duplicate ? ' (same number as a recent lead, so they\'ll check)' : ''}.`,
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={home.owner ? `${home.owner} · ${home.address}` : home.address} onClose={onClose} wide>
      <div className="space-y-4">
        {home.why && <p className="text-xs text-gray-400">{home.why}</p>}
        {home.callbackNote && <p className="text-xs text-amber-200/80">Callback note: {home.callbackNote}</p>}
        <Script caller={caller} home={home} tradeName={trade.name} kind={kind} brand={brand} />

        <div className="flex gap-2">
          <input
            type="tel"
            inputMode="tel"
            aria-label="Phone number"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setChecked(null);
            }}
            placeholder="Their phone number"
            className={`${input} flex-1 min-w-0`}
          />
          <button type="button" className={secondary} onClick={check} disabled={!phone.trim()}>
            Check
          </button>
        </div>
        {checked && !checked.ok && (
          <p className="flex items-start gap-2 text-sm text-red-300" role="alert" data-testid="call-blocked">
            <PhoneOff className="w-4 h-4 mt-0.5 shrink-0" />
            {checked.reason}
          </p>
        )}
        {checked?.ok && (
          <>
            <a href={`tel:+1${checked.phone}`} className={`${primary} w-full py-3 text-base`} data-testid="dial">
              <Phone className="w-5 h-5" />
              Call {pretty(checked.phone)}
            </a>
            {!taking ? (
              <div className="space-y-2" aria-label="How it went">
                <p className="text-xs text-gray-500">How did it go?</p>
                <div className="grid grid-cols-2 gap-2">
                  {OUTCOME_BUTTONS.map(([value, label]) => (
                    <button key={value} type="button" className={secondary} disabled={busy} onClick={() => log(value)}>
                      {label}
                    </button>
                  ))}
                  <button type="button" className={secondary} disabled={busy} onClick={() => log('do_not_call')}>
                    Don't call again
                  </button>
                  <button type="button" className={primary} disabled={busy} onClick={() => setTaking(true)}>
                    Interested
                  </button>
                </div>
                <div className="flex gap-2 items-end">
                  <Field label="Call back">
                    <input type="datetime-local" aria-label="Call back at" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className={input} />
                  </Field>
                  <button type="button" className={`${secondary} mb-3`} disabled={busy} onClick={() => log('callback')}>
                    Save callback
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={take} className="space-y-1" aria-label="Take the lead">
                <Field label="Homeowner's name">
                  <input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} className={input} />
                </Field>
                <Field label="Address">
                  <input value={lead.address} onChange={(e) => setLead({ ...lead, address: e.target.value })} className={input} />
                </Field>
                <Field label="Trade">
                  <select value={lead.jobType} onChange={(e) => setLead({ ...lead, jobType: e.target.value, consented: false })} className={input}>
                    {trades.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="What kind of work">
                    <select value={lead.scope} onChange={(e) => setLead({ ...lead, scope: e.target.value })} className={input}>
                      <option value="">Not asked</option>
                      <option value="repair">Repair</option>
                      <option value="replacement">Replacement</option>
                      <option value="new">New install</option>
                      <option value="remodel">Remodel</option>
                    </select>
                  </Field>
                  <Field label="When">
                    <select value={lead.timeline} onChange={(e) => setLead({ ...lead, timeline: e.target.value })} className={input}>
                      <option value="">Not asked</option>
                      <option value="asap">As soon as possible</option>
                      <option value="month">Within a month</option>
                      <option value="quarter">In the next few months</option>
                      <option value="planning">Just planning</option>
                    </select>
                  </Field>
                </div>
                <Field label="What they said">
                  <textarea value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} rows={3} className={input} />
                </Field>
                <label className="flex items-start gap-2 text-sm text-gray-300 py-1">
                  <input type="checkbox" className="mt-1" checked={lead.isOwner} onChange={(e) => setLead({ ...lead, isOwner: e.target.checked })} />
                  They own the home and decide on the work
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-300 py-1">
                  <input type="checkbox" className="mt-1" checked={lead.consented} onChange={(e) => setLead({ ...lead, consented: e.target.checked })} />
                  <span>
                    They said yes to: <span className="text-white">"{consentLine(leadTrade.name, brand)}"</span>
                  </span>
                </label>
                <div className="flex gap-2 pt-2">
                  <button type="submit" className={`${primary} flex-1`} disabled={busy || !lead.isOwner || !lead.consented || !lead.name.trim()}>
                    {busy ? 'Sending…' : 'Send to Ops'}
                  </button>
                  <button type="button" className={secondary} onClick={() => setTaking(false)}>
                    Back
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The Calls page, for Webb Leads callers (and staff): pick a trade and a call
 * list, tap a home, check the number (our don't-call list, Texas hours, how
 * often it was tried), dial from your own phone, then log how it went. A
 * homeowner who wants the work and says yes to the consent line becomes a
 * lead in the Ops intake queue, which someone else confirms.
 */
export default function CallsPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const caller = (user?.name || user?.email || 'your name').split(/[\s@]/)[0];
  const [trades, setTrades] = useState<Trade[]>([]);
  const [trade, setTrade] = useState('');
  const [kind, setKind] = useState<Kind>('trade_permits');
  const [street, setStreet] = useState('');
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [streets, setStreets] = useState<Array<{ street: string; permits: number }>>([]);
  const [day, setDay] = useState<MyDay | null>(null);
  const [open, setOpen] = useState<Home | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDay = useCallback(() => {
    callsAPI.myDay().then(setDay).catch((err) => setError(`Your day couldn't be loaded: ${errorText(err)}`));
  }, []);
  useEffect(() => {
    document.title = 'Calls · Webb Leads';
    industriesAPI
      .list()
      .then((t: Trade[]) => {
        setTrades(t);
        setTrade((current) => current || t[0]?.id || '');
      })
      .catch(() => setTrades([]));
    loadDay();
  }, [loadDay]);

  const show = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await callsAPI.list({ kind, trade: trade || undefined, street: kind === 'street' ? street : undefined });
      setHomes(result.homes);
      setStreets(result.streets ?? []);
    } catch (err) {
      setError(errorText(err));
      setHomes(null);
    } finally {
      setLoading(false);
    }
  };

  const done = (message: string) => {
    const finished = open;
    setOpen(null);
    setNotice(message);
    if (finished) setHomes((h) => h?.filter((x) => x !== finished && (!finished.parcelId || x.parcelId !== finished.parcelId)) ?? h);
    loadDay();
  };

  const current = trades.find((t) => t.id === trade) ?? { id: trade, name: trade };

  return (
    <div className={embedded ? 'text-white max-w-3xl' : 'px-4 md:px-6 py-5 text-white max-w-3xl'}>
      {!embedded && (
        <>
          <p className="text-xs uppercase tracking-wide text-gray-500">Webb Leads</p>
          <h1 className="text-xl font-semibold">Calls</h1>
        </>
      )}
      <p className="text-sm text-gray-400" data-testid="my-day">
        {day
          ? `Today: ${day.calls} call${day.calls === 1 ? '' : 's'} · ${day.answered} answered · ${day.leads} lead${day.leads === 1 ? '' : 's'}${day.hours.open ? '' : ` · ${day.hours.reason}`}`
          : 'Loading…'}
      </p>

      {notice && (
        <p className="mt-3 px-3 py-2 rounded border border-[#336699]/50 bg-[#336699]/10 text-sm text-[#cfe2f5]" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {day && day.callbacks.length > 0 && (
        <section className="mt-5" aria-label="Callbacks">
          <h2 className="text-sm font-medium mb-2">Callbacks</h2>
          <ul className="space-y-2">
            {day.callbacks.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (c.trade) setTrade(c.trade);
                    setOpen({ parcelId: c.parcelId, owner: c.owner, address: c.address, phone: c.phone, callbackNote: c.note });
                  }}
                  className="w-full text-left rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2"
                >
                  <span className="block text-sm text-white">{c.owner ? `${c.owner} · ${c.address}` : c.address}</span>
                  <span className="block text-xs text-amber-200/80">
                    {new Date(c.callbackAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {c.note ? ` · ${c.note}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={show} className="mt-5 space-y-3" aria-label="Call list">
        <div className="flex rounded border border-[#333] overflow-hidden" role="tablist" aria-label="Call lists">
          {KINDS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => setKind(value)}
              className={`flex-1 px-3 py-2 text-sm ${kind === value ? 'bg-[#336699] text-white' : 'text-gray-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select aria-label="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} className={`${input} flex-1 min-w-0`}>
            {trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {kind === 'street' && (
            <input aria-label="Street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street name" className={`${input} flex-1 min-w-0`} />
          )}
          <button type="submit" className={primary} disabled={loading || !trade || (kind === 'street' && !street.trim())}>
            {loading ? 'Finding…' : 'Show homes'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {kind === 'trade_permits'
            ? 'Neighbors on Midland streets where this trade pulled permits in the last 30 days, busiest streets first.'
            : kind === 'recent_buyers'
              ? 'Homes bought in the last 18 months of the appraisal roll, newest first.'
              : kind === 'auction_buyers'
                ? "Homes bought at Midland's courthouse foreclosure auction in the last 4 months, called under the buyer's name and number."
                : 'Everyone on one street.'}{' '}
          {kind === 'auction_buyers' ? 'Buyers called in the last 30 days are left off.' : 'Only owners who live there. Homes called in the last 30 days, or on the foreclosure auction, are left off.'}
        </p>
      </form>

      {streets.length > 0 && (
        <p className="mt-3 text-xs text-gray-400">Streets: {streets.map((s) => `${s.street} (${s.permits})`).join(' · ')}</p>
      )}

      {homes !== null && (
        <section className="mt-4" aria-label="Homes to call">
          {homes.length === 0 ? (
            <p className="text-sm text-gray-500">No homes to call on this list right now.</p>
          ) : (
            <ul className="space-y-2" data-testid="homes">
              {homes.map((h) => (
                <li key={h.parcelId ?? h.address}>
                  <button type="button" onClick={() => setOpen(h)} className="w-full text-left rounded border border-[#2A2A2A] px-3 py-3 [@media(hover:hover)]:hover:border-[#336699]">
                    <span className="block text-sm text-white">{h.owner}</span>
                    <span className="block text-sm text-gray-300">{h.address}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {[h.why, money(h.marketValueCents) && `worth ${money(h.marketValueCents)}`, h.deedDate && `owned since ${monthYear(h.deedDate)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {open && (
        <HomeCall home={open} kind={kind} trade={current} trades={trades} caller={caller} brand={day?.brand} onDone={done} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
