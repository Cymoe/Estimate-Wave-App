import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Building2, Check, Inbox, Link2, MapPin, Phone, Send, Tag, Trash2, X } from 'lucide-react';
import { fundingAPI, industriesAPI, intakeAPI, leadsAPI, marketplaceAPI, permitsAPI, walletAPI } from '../lib/api';
import { copyText } from '../components/estimates/estimateActions';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, Field, input, primary, secondary } from '../components/ops/ui';
import { IntakeQueue } from '../components/ops/IntakeQueue';
import { Delivered } from '../components/ops/Delivered';
import { DemandBoard } from '../components/ops/DemandBoard';
import { isStaff, isSuperAdmin } from '../lib/roles';
import { TeamCard } from '../components/ops/TeamCard';
import { useConfirm } from '../components/common/ConfirmDialog';
import { Confirmed } from '../components/market/Confirmed';
import { STATUSES } from '../components/leads/leadTypes';
import { CREDIT_REASON_LABELS, WalletHistory, leadOrigin, money, planLabel, suggestedBonus, type PlanSummary } from '../components/market/wallet';
import { dropsToFloor, pricingFor } from '../services/auction';

interface Trade {
  id: string;
  name: string;
}

interface MarketLead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  county?: string;
  jobType?: string;
  notes?: string;
  status: 'available' | 'older' | 'archived' | 'assigned' | 'credited';
  /** What it costs right now (it drops on a schedule until bought). */
  price: number;
  priceCents?: number;
  floorCents?: number;
  floorAt?: string;
  openBids?: number;
  /** How a sold lead went: to a standing bid or a buy order; absent when sent by hand or bought outright. */
  wonBy?: 'bid' | 'order';
  assignedAt?: string;
  companyName?: string;
  /** A person confirmed it with the homeowner: when, and what they said. */
  verified?: { at: string; note?: string };
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  leadTrades: string[];
  plan?: PlanSummary | null;
  balanceCents: number;
  leads30d: number;
  spent30dCents: number;
  leadsTotal: number;
  wonCents: number;
  wonCount: number;
  pendingCredits: number;
  invitePending?: string;
  /** Emails of the people who own it, once they have an account. */
  owners?: string[];
  isSample?: boolean;
  /** Nothing in it yet (no leads, clients, estimates or money), so it can be removed. */
  isEmpty?: boolean;
  standingBids?: Array<{ county: string; jobType: string; amountCents: number }>;
  /** How many of those were added by "Add demo bids". */
  sampleBids?: number;
}

interface CreditRequest {
  orgLeadId: string;
  name: string;
  companyName: string;
  organizationId: string;
  priceCents: number;
  reason: string;
  note?: string;
  requestedAt: string;
}

interface PendingPayment {
  id: string;
  organizationId: string;
  companyName: string;
  amountCents: number;
  bonusCents: number;
  method?: 'card' | 'apple_pay';
  payerName?: string;
  payerEmail?: string;
  submittedAt?: string;
}

type Tab = 'demand' | 'intake' | 'inbox' | 'delivered' | 'companies' | 'prices';


function TradePicker({ trades, value, onChange }: { trades: Trade[]; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
      {trades.map((trade) => {
        const on = value.includes(trade.id);
        return (
          <button
            key={trade.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((t) => t !== trade.id) : [...value, trade.id])}
            className={`px-2.5 py-1 rounded-full text-xs border ${
              on ? 'bg-[#336699]/30 border-[#336699] text-white' : 'border-[#333] text-gray-400'
            }`}
          >
            {trade.name}
          </button>
        );
      })}
    </div>
  );
}

/** Re-confirming a Vault lead after a fresh call: one line on what the homeowner said. Saving stamps today's date on the lead. Leads are confirmed the first time in Intake. */
function VerifyDialog({ lead, onClose, onSaved }: { lead: MarketLead; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(lead.verified?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await marketplaceAPI.verifyLead(lead.id, note);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title={`${lead.verified ? 'Re-confirm' : 'Confirm'} ${lead.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <p className="text-sm text-gray-400 mb-3">
          Companies will see “Confirmed {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}” on this lead, with your line.
        </p>
        <Field label="What did they say?">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Wants a quote this month, budget about $8K"
            className={input}
            autoFocus
          />
        </Field>
        {error && <p className="text-sm text-red-300 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondary}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primary}>
            {saving ? 'Saving…' : 'Mark confirmed'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The Midland permit feed: when it last ran, how it went, and a button to run it now. */
function PermitsCard() {
  type Status = { source: { syncedAt: string; fetched: number; added: number; updated: number; error?: string } | null; last30Days: number };
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => permitsAPI.status().then(setStatus).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  const sync = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r: { fetched: number; added: number; updated: number; error?: string } = await permitsAPI.syncNow();
      setNote(r.error ? `The city's service failed: ${r.error}` : `Pulled ${r.fetched}: ${r.added} new, ${r.updated} updated.`);
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  };
  const s = status?.source;
  return (
    <section className="border border-[#2A2A2A] rounded p-4 flex flex-wrap items-center justify-between gap-3" aria-label="Midland permits">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">Midland permits · the Vault's "Permits near you"</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          {!status
            ? 'Loading…'
            : s
              ? `Last pulled ${new Date(s.syncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${s.fetched} fetched, ${s.added} new, ${s.updated} updated${s.error ? ` · failed: ${s.error}` : ''} · ${status.last30Days} building permits in the last 30 days`
              : 'Not pulled yet. The deploy and a daily job pull them from the city.'}
        </span>
        {note && <span className="block text-xs text-gray-300 mt-1">{note}</span>}
      </span>
      <button type="button" onClick={sync} disabled={busy} className={secondary}>
        {busy ? 'Pulling…' : 'Sync now'}
      </button>
    </section>
  );
}

function NewCompanyDialog({ trades, onClose, onSaved }: { trades: Trade[]; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState({ name: '', ownerEmail: '', phone: '', city: '', state: '' });
  const [leadTrades, setLeadTrades] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await marketplaceAPI.createCompany({ ...draft, leadTrades });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The company couldn't be added");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title="New company" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Company name">
          <input value={draft.name} onChange={set('name')} className={input} autoFocus required />
        </Field>
        <Field label="Owner's email">
          <input type="email" value={draft.ownerEmail} onChange={set('ownerEmail')} className={input} placeholder="They join this company when they sign up" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Phone">
            <input type="tel" value={draft.phone} onChange={set('phone')} className={input} />
          </Field>
          <Field label="City">
            <input value={draft.city} onChange={set('city')} className={input} />
          </Field>
          <Field label="State">
            <input value={draft.state} onChange={set('state')} className={input} />
          </Field>
        </div>
        <Field label="Buys leads for">
          <TradePicker trades={trades} value={leadTrades} onChange={setLeadTrades} />
        </Field>
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <button type="submit" disabled={saving || !draft.name.trim()} className={`${primary} w-full`}>
          {saving ? 'Adding…' : 'Add company'}
        </button>
      </form>
    </Dialog>
  );
}

/** Picks the company a lead is sold to. Only companies that buy this trade are listed; the rest sit behind a link. Ones that can't afford it are disabled. */
function SendToDialog({
  lead,
  companies,
  tradeName,
  onClose,
  onSent,
}: {
  lead: MarketLead;
  companies: Company[];
  tradeName: (id?: string) => string;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const takes = (c: Company) => Boolean(lead.jobType && c.leadTrades.includes(lead.jobType));
  const { buyers, others } = useMemo(() => {
    const byFunds = (a: Company, b: Company) => Number(b.balanceCents >= lead.price) - Number(a.balanceCents >= lead.price) || a.name.localeCompare(b.name);
    return { buyers: companies.filter(takes).sort(byFunds), others: companies.filter((c) => !takes(c)).sort(byFunds) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, lead]);
  // Nobody buys this trade: show everyone, with a line saying so.
  const sorted = buyers.length === 0 || showOthers ? [...buyers, ...others] : buyers;
  const send = async (company: Company) => {
    setSending(company.id);
    setError(null);
    try {
      await marketplaceAPI.assign(lead.id, company.id);
      onSent(`${lead.name} sent to ${company.name} · ${money(lead.price)} charged`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lead couldn't be sent");
    } finally {
      setSending(null);
    }
  };
  return (
    <Dialog title={`Send ${lead.name}`} onClose={onClose}>
      <p className="text-sm text-gray-400 mb-4">
        {tradeName(lead.jobType)} lead · <span className="text-white font-medium">{money(lead.price)}</span> (its current price) comes off the company's balance, and any buy orders on it are closed.
        Only one company gets it.
      </p>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded">
        {sorted.map((company) => {
          const affordable = company.balanceCents >= lead.price;
          const takes = Boolean(lead.jobType && company.leadTrades.includes(lead.jobType));
          return (
            <li key={company.id}>
              <button
                type="button"
                disabled={!affordable || sending !== null}
                onClick={() => send(company)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:opacity-40 [@media(hover:hover)]:hover:bg-[#1E1E1E] active:bg-[#1E1E1E]"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-white truncate">{company.name}</span>
                  <span className="block text-xs text-gray-500">
                    {takes ? 'Buys this trade' : 'Other trades'}
                    {company.city ? ` · ${company.city}` : ''}
                  </span>
                </span>
                <span className={`text-sm whitespace-nowrap ${affordable ? 'text-emerald-300' : 'text-red-400'}`}>
                  {sending === company.id ? 'Sending…' : money(company.balanceCents)}
                </span>
              </button>
            </li>
          );
        })}
        {sorted.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">Add a company first.</li>}
      </ul>
      {buyers.length === 0 && others.length > 0 && (
        <p className="text-xs text-gray-500 mt-2">No company buys {tradeName(lead.jobType)} yet, so this is everyone.</p>
      )}
      {buyers.length > 0 && others.length > 0 && (
        <button type="button" onClick={() => setShowOthers((v) => !v)} className="mt-3 text-xs text-gray-400 underline underline-offset-2">
          {showOthers ? `Hide the ${others.length} ${others.length === 1 ? 'company' : 'companies'} that don’t buy ${tradeName(lead.jobType)}` : `Show ${others.length} ${others.length === 1 ? 'company' : 'companies'} that don’t buy ${tradeName(lead.jobType)}`}
        </button>
      )}
    </Dialog>
  );
}

/** One company: its balance, payments, credit requests, leads and history. */
/** The company's monthly plan: status, price and claims, and a one-tap comp. */
function PlanSection({ company, onChanged }: { company: Company; onChanged: () => void }) {
  const plan = company.plan ?? null;
  const [monthly, setMonthly] = useState(String((plan?.monthlyCents ?? 9900) / 100));
  const [claims, setClaims] = useState(String(plan?.claimsIncluded ?? 10));
  const [extra, setExtra] = useState(String((plan?.extraClaimCents ?? 1500) / 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMonthly(String((plan?.monthlyCents ?? 9900) / 100));
    setClaims(String(plan?.claimsIncluded ?? 10));
    setExtra(String((plan?.extraClaimCents ?? 1500) / 100));
  }, [plan?.monthlyCents, plan?.claimsIncluded, plan?.extraClaimCents]);
  const save = async (changes: Parameters<typeof marketplaceAPI.setPlan>[1]) => {
    setBusy(true);
    setError(null);
    try {
      await marketplaceAPI.setPlan(company.id, changes);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The plan couldn't be saved");
    } finally {
      setBusy(false);
    }
  };
  const cents = (value: string) => Math.round(Number(value) * 100);
  const savePrices = () => save({ monthlyCents: cents(monthly), claimsIncluded: Math.round(Number(claims)), extraClaimCents: cents(extra) });
  return (
    <section data-testid="plan-section">
      <h3 className="text-sm font-medium text-white mb-2">Plan</h3>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`text-sm ${plan?.active ? 'text-emerald-300' : 'text-gray-400'}`}>{planLabel(plan)}</span>
        {plan && (
          <span className="text-xs text-gray-500">
            · {plan.claimsLeft} of {plan.claimsIncluded} claims left · next {new Date(plan.nextChargeAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select
          aria-label="Plan status"
          value={plan?.status ?? ''}
          disabled={busy}
          onChange={(e) => e.target.value && save({ status: e.target.value as PlanSummary['status'] })}
          className="bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-sm text-white"
        >
          <option value="" disabled>
            No plan yet
          </option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="past_due">Paused (past due)</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {!(plan?.status === 'active' && plan.monthlyCents === 0) && (
          <button type="button" disabled={busy} onClick={() => save({ status: 'active', monthlyCents: 0 })} className={secondary}>
            Comp this company
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500">
          $/month
          <input aria-label="Monthly price" value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" className="block w-20 bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="text-xs text-gray-500">
          Claims included
          <input aria-label="Claims included" value={claims} onChange={(e) => setClaims(e.target.value)} inputMode="numeric" className="block w-20 bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="text-xs text-gray-500">
          $/extra claim
          <input aria-label="Extra claim price" value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" className="block w-20 bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-sm text-white" />
        </label>
        <button type="button" disabled={busy} onClick={savePrices} className={secondary}>
          Save prices
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}

function CompanyPanel({
  company,
  owner,
  trades,
  credits,
  payments,
  onClose,
  onChanged,
}: {
  company: Company;
  /** The platform owner sees and changes money and setup; staff only read. */
  owner: boolean;
  trades: Trade[];
  credits: CreditRequest[];
  payments: PendingPayment[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [wallet, setWallet] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [amount, setAmount] = useState('');
  const [bonus, setBonus] = useState('');
  const [method, setMethod] = useState('Zelle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadTrades, setLeadTrades] = useState(company.leadTrades);

  const load = useCallback(async () => {
    const [w, l] = await Promise.all([walletAPI.get(company.id), leadsAPI.list(company.id)]);
    setWallet(w);
    setLeads(l);
  }, [company.id]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const changeAmount = (value: string) => {
    setAmount(value);
    const n = Number(value);
    setBonus(Number.isFinite(n) && suggestedBonus(n) > 0 ? String(suggestedBonus(n)) : '');
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await marketplaceAPI.recordTopUp(company.id, {
        amount: Number(amount),
        bonus: bonus ? Number(bonus) : undefined,
        method,
        note: note || undefined,
      });
      setAmount('');
      setBonus('');
      setNote('');
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment couldn't be recorded");
    } finally {
      setBusy(false);
    }
  };

  const review = async (orgLeadId: string, approve: boolean) => {
    setBusy(true);
    try {
      await marketplaceAPI.reviewCredit(orgLeadId, approve);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  // Bids are only for listed trades, so dropping one drops the company's bids in it: say so first.
  const [confirm, confirmDialog] = useConfirm();
  const saveTrades = async (next: string[]) => {
    const dropped = (company.standingBids ?? []).filter((b) => !next.includes(b.jobType));
    if (dropped.length > 0) {
      const names = [...new Set(dropped.map((b) => trades.find((t) => t.id === b.jobType)?.name ?? b.jobType))].join(', ');
      const yes = await confirm({
        title: `Drop ${names}?`,
        message: `${company.name} has ${dropped.length} bid${dropped.length === 1 ? '' : 's'} there. ${dropped.length === 1 ? 'It goes' : 'They go'} too.`,
        confirmLabel: 'Drop trade',
        cancelLabel: 'Keep it',
      });
      if (!yes) return;
    }
    setLeadTrades(next);
    await marketplaceAPI.setCompanyTrades(company.id, next);
    onChanged();
  };

  const mine = credits.filter((c) => c.organizationId === company.id);
  const myPayments = payments.filter((p) => p.organizationId === company.id);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  /** Shares the company's funding page (or copies it where there's no share sheet). */
  const sendFundingLink = async () => {
    const url = fundingAPI.url(await fundingAPI.createLink(company.id));
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Load your FieldQuote lead balance', text: `Here's the link to load ${company.name}'s lead balance:`, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    await copyText(url);
    setLinkNote('Funding link copied');
    setTimeout(() => setLinkNote(null), 2500);
  };

  const settlePayment = async (id: string, confirm: boolean) => {
    setBusy(true);
    try {
      await (confirm ? fundingAPI.confirm(id) : fundingAPI.cancel(id));
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const bought = leads.filter((l) => l.marketplaceLeadId);

  const [ownerEmail, setOwnerEmail] = useState(company.invitePending ?? '');
  const [ownerNote, setOwnerNote] = useState<string | null>(null);
  const saveOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setOwnerNote(null);
    try {
      const result = await marketplaceAPI.setCompanyOwner(company.id, ownerEmail);
      setOwnerNote(result === 'added' ? 'Added as owner' : "Saved. They'll join this company when they sign up.");
      onChanged();
    } catch (err) {
      setOwnerNote(err instanceof Error ? err.message : "The owner couldn't be saved");
    } finally {
      setBusy(false);
    }
  };

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removeCompany = async () => {
    setBusy(true);
    setRemoveError(null);
    try {
      await marketplaceAPI.removeCompany(company.id);
      onChanged();
      onClose();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "The company couldn't be removed");
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={company.name}
        className="fixed right-0 top-0 h-[100dvh] w-full md:w-[480px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{company.name}</h2>
            <p className="text-xs text-gray-500 truncate">
              {[company.email, company.phone, company.city].filter(Boolean).join(' · ') || 'No contact details'}
              {company.invitePending ? ` · invite waiting for ${company.invitePending}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <p className="text-xs uppercase tracking-wide text-gray-500">Balance</p>
            <p className="text-3xl font-semibold text-white" data-testid="company-balance">
              {money(wallet?.balanceCents ?? company.balanceCents)}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {company.leadsTotal} leads bought · {money(company.wonCents)} won from them
            </p>
          </section>

          {owner && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={sendFundingLink} className={secondary}>
                <Link2 className="w-4 h-4" />
                Send funding link
              </button>
              {linkNote && <span className="text-xs text-emerald-300">{linkNote}</span>}
            </div>
          )}

          {owner && myPayments.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-white mb-2">Payments to confirm</h3>
              <ul className="space-y-2">
                {myPayments.map((p) => (
                  <li key={p.id} className="border border-[#336699]/50 bg-[#336699]/10 rounded p-3">
                    <p className="text-sm text-white">
                      {money(p.amountCents)} by {p.method === 'apple_pay' ? 'Apple Pay' : 'card'}
                      {p.bonusCents > 0 ? ` · +${money(p.bonusCents)} bonus` : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      {[p.payerName, p.payerEmail].filter(Boolean).join(' · ') || 'No payer details'}
                      {p.submittedAt ? ` · ${new Date(p.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button type="button" disabled={busy} onClick={() => settlePayment(p.id, true)} className={primary}>
                        Confirm {money(p.amountCents + p.bonusCents)}
                      </button>
                      <button type="button" disabled={busy} onClick={() => settlePayment(p.id, false)} className={secondary}>
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {owner && (
          <form onSubmit={recordPayment} className="border border-[#2A2A2A] rounded p-4">
            <h3 className="text-sm font-medium text-white mb-3">Record a payment</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount received ($)">
                <input inputMode="decimal" value={amount} onChange={(e) => changeAmount(e.target.value)} className={input} placeholder="500" />
              </Field>
              <Field label="Bonus ($)">
                <input inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} className={input} placeholder="0" />
              </Field>
              <Field label="Paid by">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
                  {['Zelle', 'Check', 'Card', 'Cash', 'Bank transfer', 'Other'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Note">
                <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
              </Field>
            </div>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <button type="submit" disabled={busy || !(Number(amount) > 0)} className={`${primary} w-full`}>
              Add {amount && Number(amount) > 0 ? money(Math.round((Number(amount) + (Number(bonus) || 0)) * 100)) : 'funds'} to balance
            </button>
          </form>
          )}

          {owner && mine.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-white mb-2">Credit requests</h3>
              <ul className="space-y-2">
                {mine.map((c) => (
                  <li key={c.orgLeadId} className="border border-amber-500/40 bg-amber-500/10 rounded p-3">
                    <p className="text-sm text-white">
                      {c.name} · {money(c.priceCents)}
                    </p>
                    <p className="text-xs text-amber-200">
                      {CREDIT_REASON_LABELS[c.reason] ?? c.reason}
                      {c.note ? ` — ${c.note}` : ''}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button type="button" disabled={busy} onClick={() => review(c.orgLeadId, true)} className={primary}>
                        Credit {money(c.priceCents)}
                      </button>
                      <button type="button" disabled={busy} onClick={() => review(c.orgLeadId, false)} className={secondary}>
                        Deny
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-medium text-white mb-2">Owner</h3>
            {company.owners && company.owners.length > 0 ? (
              <p className="text-sm text-gray-300" data-testid="company-owners">
                {company.owners.join(', ')}
              </p>
            ) : !owner ? (
              <p className="text-sm text-gray-500">No owner yet.</p>
            ) : (
              <form onSubmit={saveOwner} className="flex gap-2">
                <input
                  type="email"
                  aria-label="Owner's email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@company.com"
                  className={`${input} flex-1`}
                />
                <button type="submit" disabled={busy || !ownerEmail.trim()} className={secondary}>
                  Save
                </button>
              </form>
            )}
            {ownerNote && <p className="text-xs text-gray-400 mt-1">{ownerNote}</p>}
            {owner && !company.owners?.length && !ownerNote && (
              <p className="text-xs text-gray-500 mt-1">When they sign up with this email, they join this company instead of getting a new one.</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium text-white mb-2">Buys leads for</h3>
            {owner ? (
              <TradePicker trades={trades} value={leadTrades} onChange={saveTrades} />
            ) : (
              <p className="text-sm text-gray-300">{leadTrades.map((id) => trades.find((t) => t.id === id)?.name ?? id).join(', ') || 'No trades picked yet'}</p>
            )}
            {confirmDialog}
          </section>

          {owner && <PlanSection company={company} onChanged={onChanged} />}

          <section>
            <h3 className="text-sm font-medium text-white mb-2">Standing bids</h3>
            {!company.standingBids?.length ? (
              <p className="text-sm text-gray-500">None yet. They set these under Bids; until then their leads come from the Marketplace.</p>
            ) : (
              <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Standing bids">
                {company.standingBids.map((bid) => (
                  <li key={`${bid.county}-${bid.jobType}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-gray-300">
                      {bid.county} County · {trades.find((t) => t.id === bid.jobType)?.name ?? bid.jobType}
                    </span>
                    <span className="text-white">{money(bid.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium text-white mb-2">Their leads ({leads.length})</h3>
            {leads.length === 0 ? (
              <p className="text-sm text-gray-500">No leads yet.</p>
            ) : (
              <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded">
                {leads.slice(0, 50).map((lead) => {
                  const status = STATUSES.find((s) => s.value === lead.status);
                  return (
                    <li key={lead.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm text-white truncate">{lead.name}</span>
                        <span className="block text-xs text-gray-500">
                          {leadOrigin(lead) ?? lead.source ?? 'Their own lead'}
                        </span>
                      </span>
                      <span className={`text-xs whitespace-nowrap ${status?.color ?? 'text-gray-400'}`}>{status?.label ?? lead.status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {bought.length > 0 && <p className="text-xs text-gray-500 mt-1">{bought.length} bought from FieldQuote</p>}
          </section>

          <section>
            <h3 className="text-sm font-medium text-white mb-2">History</h3>
            <WalletHistory transactions={wallet?.transactions ?? []} />
          </section>

          {owner && company.isEmpty && (
            <section className="border-t border-[#2A2A2A] pt-5">
              {confirmRemove ? (
                <div className="border border-red-500/40 bg-red-500/10 rounded p-3">
                  <p className="text-sm text-white">Remove {company.name}?</p>
                  <p className="text-xs text-gray-400 mt-1">It has no leads, clients, estimates or money, so nothing is lost.</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={removeCompany}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded bg-red-600 text-white text-sm font-medium disabled:opacity-50"
                    >
                      Remove company
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmRemove(false)} className={secondary}>
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmRemove(true)} className="text-sm text-red-400 underline underline-offset-2">
                  Remove this empty company
                </button>
              )}
              {removeError && <p className="text-sm text-red-400 mt-2">{removeError}</p>}
            </section>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

/** "45m", "21h 33m" until a lead reaches its floor. */
function untilFloor(iso: string) {
  const minutes = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

type PriceDraft = { price: string; floor: string; drop: string; every: string };
const emptyDraft: PriceDraft = { price: '', floor: '', drop: '', every: '' };
const fromRow = (row: { priceCents: number; floorCents?: number; dropCents?: number; dropEveryMinutes?: number }): PriceDraft => ({
  price: String(row.priceCents / 100),
  floor: row.floorCents != null ? String(row.floorCents / 100) : '',
  drop: row.dropCents != null ? String(row.dropCents / 100) : '',
  every: row.dropEveryMinutes != null ? String(row.dropEveryMinutes) : '',
});

/**
 * What a lead costs per trade: it's listed at the start price and drops by
 * a step on an interval down to the floor. Blank floor, step and interval
 * use the defaults (floor 20%, reaches the floor in about 23 hourly drops).
 */
function PricesTab({ trades }: { trades: Trade[] }) {
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    marketplaceAPI
      .prices()
      .then((result: { defaultCents: number; prices: Array<{ jobType: string; priceCents: number; floorCents?: number; dropCents?: number; dropEveryMinutes?: number }> }) => {
        const next: Record<string, PriceDraft> = { default: { ...emptyDraft, price: String(result.defaultCents / 100) } };
        for (const row of result.prices) next[row.jobType] = fromRow(row);
        setDrafts(next);
      })
      .catch(() => {});
  }, []);
  const save = async (jobType: string) => {
    setError(null);
    const d = drafts[jobType] ?? emptyDraft;
    const num = (raw: string) => (raw.trim() === '' ? null : Number(raw));
    try {
      await marketplaceAPI.setPrice(jobType, num(d.price), { floor: num(d.floor), drop: num(d.drop), dropEveryMinutes: num(d.every) });
      setSaved(jobType);
      setTimeout(() => setSaved((s) => (s === jobType ? null : s)), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The price couldn't be saved");
    }
  };
  const field = (jobType: string, key: keyof PriceDraft, label: string, placeholder: string, width = 'w-20') => (
    <input
      inputMode="decimal"
      aria-label={label}
      value={drafts[jobType]?.[key] ?? ''}
      placeholder={placeholder}
      onChange={(e) => setDrafts({ ...drafts, [jobType]: { ...(drafts[jobType] ?? emptyDraft), [key]: e.target.value } })}
      onBlur={() => save(jobType)}
      className={`${width} bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-right text-white text-base md:text-sm focus:outline-none focus:border-[#336699]`}
    />
  );
  const preview = (jobType: string) => {
    const d = drafts[jobType];
    const start = Number(d?.price);
    if (!d || !(start > 0)) return null;
    const p = pricingFor({
      priceCents: Math.round(start * 100),
      floorCents: d.floor.trim() ? Math.round(Number(d.floor) * 100) : undefined,
      dropCents: d.drop.trim() ? Math.round(Number(d.drop) * 100) : undefined,
      dropEveryMinutes: d.every.trim() ? Number(d.every) : undefined,
    });
    const minutes = (dropsToFloor(p) * p.dropEveryMs) / 60000;
    return `${money(p.startCents)} → ${money(p.floorCents)}, −${money(p.dropCents)} every ${Math.round(p.dropEveryMs / 60000)}m · floor in ~${minutes < 60 ? `${Math.round(minutes)}m` : `${Math.round(minutes / 60)}h`}`;
  };
  const row = (jobType: string, label: string, placeholder: string) => (
    <li key={jobType} className="px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-white flex items-center gap-2">
          {label}
          {saved === jobType && <Check className="w-4 h-4 text-emerald-400" aria-label="Saved" />}
        </span>
        <span className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <span>Start $</span>
          {field(jobType, 'price', `${label} start price`, placeholder)}
          <span>Floor $</span>
          {field(jobType, 'floor', `${label} floor price`, '20%')}
          <span>Drop $</span>
          {field(jobType, 'drop', `${label} drop`, 'auto', 'w-16')}
          <span>every</span>
          {field(jobType, 'every', `${label} drop interval`, '60', 'w-14')}
          <span>min</span>
        </span>
      </div>
      {preview(jobType) && <p className="text-xs text-gray-500 mt-1 text-right">{preview(jobType)}</p>}
    </li>
  );
  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-400 mb-3">
        A lead with a standing bid for its county and trade is sold to the highest bidder the moment it's listed. The rest are listed at the start price ($200 or more) and drop to the floor over the day, where they stay until bought. Trades left blank use the default row.
      </p>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded">
        {row('default', 'Default (every other trade)', '200')}
        {trades.map((t) => row(t.id, t.name, drafts.default?.price ?? ''))}
      </ul>

    </div>
  );
}

const LeadMarketPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('new') === 'company' ? 'companies' : 'intake'));
  const [trades, setTrades] = useState<Trade[]>([]);
  const [inbox, setInbox] = useState<{ available: MarketLead[]; older?: MarketLead[]; archivedCount?: number; sold: MarketLead[] }>({
    available: [],
    sold: [],
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [credits, setCredits] = useState<CreditRequest[]>([]);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<MarketLead | null>(null);
  const [verifying, setVerifying] = useState<MarketLead | null>(null);
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const creating = searchParams.get('new');
  const closeCreate = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  };

  // Staff run the page; only the owner sees money, prices, demo data and companies' setup.
  const staff = isStaff(user);
  const owner = isSuperAdmin(user);
  const [demoBusy, setDemoBusy] = useState(false);
  // Bumped when demo intake leads are added so the Intake tab reloads.
  const [intakeVersion, setIntakeVersion] = useState(0);
  const reload = useCallback(async () => {
    const [i, c, p, f] = await Promise.all([
      marketplaceAPI.inbox(),
      marketplaceAPI.companies(),
      marketplaceAPI.pendingCredits(),
      fundingAPI.pending(),
    ]);
    setInbox(i);
    setCompanies(c);
    setCredits(p);
    setPayments(f);
  }, []);

  const hasDemoCompanies = companies.some((c) => c.isSample);
  const hasDemoBids = companies.some((c) => (c.sampleBids ?? 0) > 0);
  const hasDemo = hasDemoCompanies || hasDemoBids;
  const runDemo = async (action: () => Promise<unknown>, message: string) => {
    setDemoBusy(true);
    try {
      const result = await action();
      await reload();
      setNotice(typeof result === 'string' ? result : message);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setDemoBusy(false);
    }
  };
  const addDemo = () => runDemo(() => marketplaceAPI.addDemoData(), 'Demo companies and leads added');
  const removeDemo = () => runDemo(() => marketplaceAPI.removeDemoData(), 'Demo data removed');
  const addSamples = () => runDemo(() => marketplaceAPI.addSampleLeads(), '20 sample leads added to the market');
  const addDemoBids = () =>
    runDemo(async () => {
      const r = await marketplaceAPI.addDemoBids();
      return `Demo bids added: ${r.standingBids} bids across ${r.companies} companies, ${r.leads} leads, ${r.sold} awarded`;
    }, 'Demo bids added');
  const addDemoIntake = () =>
    runDemo(async () => {
      const r = await intakeAPI.addDemo();
      setIntakeVersion((v) => v + 1);
      return r.added > 0 ? `${r.added} demo leads added to Intake` : 'Demo leads are already in Intake';
    }, 'Demo leads added');
  // Every demo button in one place, on every tab, for the owner. Each one
  // hides once its data is there; "Remove demo data" takes all of it back.
  const demoButton = (label: string, action: () => void, title: string) => (
    <button type="button" disabled={demoBusy} onClick={action} title={title} className={secondary}>
      {demoBusy ? 'Adding…' : label}
    </button>
  );
  const demoStrip = owner && (
    <div className="mb-4 px-4 py-3 rounded border border-[#336699]/50 bg-[#336699]/10 text-sm flex flex-wrap items-center gap-2" data-testid="demo-strip">
      <span className="text-gray-300 mr-auto">
        {hasDemoCompanies ? "You're looking at demo companies and leads." : hasDemoBids ? "You're looking at demo bids, funds and leads." : 'Demo data, to try things with:'}
      </span>
      {!hasDemoCompanies && demoButton('Add demo companies and leads', addDemo, 'Demo companies with funds and leads, so the Marketplace and bids have both sides.')}
      {demoButton('Add 20 sample leads', addSamples, 'Sample leads for trying the Marketplace.')}
      {!hasDemoBids && demoButton('Add demo bids', addDemoBids, 'Gives every company demo funds and standing bids, then lists leads that get awarded on the spot.')}
      {demoButton('Add demo leads to Intake', addDemoIntake, 'Six leads to try the queue and the confirmation call with.')}
      {hasDemo && (
        <button type="button" disabled={demoBusy} onClick={removeDemo} className="text-[#7fb0e0] hover:text-white whitespace-nowrap disabled:opacity-50">
          Remove demo data
        </button>
      )}
    </div>
  );

  useEffect(() => {
    if (!staff) return;
    industriesAPI.list().then(setTrades).catch(() => setTrades([]));
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [staff, reload]);

  useEffect(() => {
    if (creating === 'company') setTab('companies');
    if (creating === 'lead') setTab('intake');
  }, [creating]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const tradeName = useCallback((id?: string) => trades.find((t) => t.id === id)?.name ?? (id ? id : 'Any trade'), [trades]);
  const openCompany = companies.find((c) => c.id === openCompanyId) ?? null;

  if (!staff) {
    return <div className="p-8 text-gray-400">The Ops page is only for FieldQuote staff.</div>;
  }

  const totals = {
    balance: companies.reduce((sum, c) => sum + c.balanceCents, 0),
    spent: companies.reduce((sum, c) => sum + c.spent30dCents, 0),
  };

  return (
    <div className="px-4 md:px-6 py-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">Ops</h1>
            <span className="text-xs px-2 py-0.5 rounded-full border border-[#336699]/60 bg-[#336699]/15 text-[#cfe2f5]">
              {owner ? 'Platform owner' : 'FieldQuote staff'}
            </span>
          </div>
          <p className="text-sm text-gray-400">
            {inbox.available.length} listed · {money(totals.spent)} sold in 30 days · {money(totals.balance)} in company balances
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Leads you list here sell on their own in the Marketplace. Sending one by hand is the exception.</p>
        </div>
        <div className="flex rounded border border-[#333] overflow-hidden" role="tablist">
          {(
            [
              ['demand', 'Demand'],
              ['intake', 'Intake'],
              ['inbox', `Listed (${inbox.available.length})`],
              ['delivered', 'Delivered'],
              ['companies', `Companies (${companies.length})`],
              ...(owner ? ([['prices', 'Prices']] as Array<[Tab, string]>) : []),
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`px-4 py-2 text-sm ${tab === value ? 'bg-[#336699] text-white' : 'text-gray-300 [@media(hover:hover)]:hover:bg-[#222]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {demoStrip}

      {owner && payments.length > 0 && tab !== 'prices' && (
        <button
          type="button"
          onClick={() => {
            setTab('companies');
            setOpenCompanyId(payments[0].organizationId);
          }}
          className="w-full mb-4 text-left px-4 py-3 rounded border border-[#336699]/60 bg-[#336699]/15 text-sm text-[#cfe2f5]"
        >
          {payments.length} payment{payments.length === 1 ? '' : 's'} waiting to be confirmed ·{' '}
          {money(payments.reduce((sum, p) => sum + p.amountCents, 0))}
        </button>
      )}

      {owner && credits.length > 0 && tab !== 'prices' && (
        <button
          type="button"
          onClick={() => {
            setTab('companies');
            setOpenCompanyId(credits[0].organizationId);
          }}
          className="w-full mb-4 text-left px-4 py-3 rounded border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200"
        >
          {credits.length} credit request{credits.length === 1 ? '' : 's'} waiting for review
        </button>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : tab === 'intake' ? (
        <IntakeQueue
          key={intakeVersion}
          trades={trades}
          openNew={creating === 'lead'}
          onCloseNew={closeCreate}
          onListed={(message) => {
            setNotice(message);
            reload();
          }}
        />
      ) : tab === 'demand' ? (
        <DemandBoard owner={owner} />
      ) : tab === 'delivered' ? (
        <Delivered tradeName={tradeName} />
      ) : tab === 'inbox' ? (
        <div className="space-y-6">
          {inbox.available.length === 0 ? (
            <div className="border border-dashed border-[#333] rounded p-8 text-center">
              <Inbox className="w-8 h-8 mx-auto text-gray-500 mb-2" />
              <p className="text-sm text-gray-400">Nothing listed. Leads get here from Intake once a call confirms them.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="Listed">
              {inbox.available.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-sm font-medium text-white">{lead.name}</p>
                    <p className="text-xs text-gray-400 flex flex-wrap gap-x-3">
                      <span className="inline-flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {tradeName(lead.jobType)}
                      </span>
                      {(lead.city || lead.county) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[lead.city, lead.county ? `${lead.county} County` : ''].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {lead.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </span>
                      )}
                    </p>
                    {lead.notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{lead.notes}</p>}
                    <Confirmed verified={lead.verified} className="mt-1" />
                  </div>
                  <span className="text-right">
                    <span className="block text-sm text-gray-300">{money(lead.price)}</span>
                    {lead.floorCents != null && (
                      <span className="block text-xs text-gray-500 whitespace-nowrap">
                        floor {money(lead.floorCents)}
                        {lead.floorAt && Date.parse(lead.floorAt) > Date.now() ? ` · ${untilFloor(lead.floorAt)} left` : ''}
                        {lead.openBids ? ` · ${lead.openBids} order${lead.openBids === 1 ? '' : 's'}` : ''}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSending(lead)}
                    title="Send to a company by hand (the exception: the Marketplace sells leads on its own)"
                    aria-label={`Send ${lead.name} to a company`}
                    className="p-2 text-gray-400 hover:text-white"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${lead.name}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete ${lead.name}?`)) return;
                      await marketplaceAPI.removeLead(lead.id);
                      await reload();
                    }}
                    className="p-2 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(inbox.older?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-300 mb-2">
                The Vault · {inbox.older!.length}
                <span className="text-xs text-gray-500 font-normal"> · a week old, claimable on the plan; archived at a month</span>
              </h2>
              <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="The Vault">
                {inbox.older!.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{lead.name}</span>
                      <span className="block text-xs text-gray-500">
                        {tradeName(lead.jobType)}
                        {lead.county ? ` · ${lead.county} County` : lead.city ? ` · ${lead.city}` : ''} · listed{' '}
                        {new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      {/* Older leads are re-confirmed before they're worth claiming; say which still need the call. */}
                      {lead.verified ? (
                        <Confirmed verified={lead.verified} className="mt-0.5" />
                      ) : (
                        <span className="block text-xs text-amber-200/80 mt-0.5">Not confirmed yet</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <button type="button" className={secondary} onClick={() => setVerifying(lead)}>
                        {lead.verified ? 'Re-confirm' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        className={secondary}
                        onClick={async () => {
                          await marketplaceAPI.archiveLead(lead.id);
                          reload();
                        }}
                      >
                        Archive
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(inbox.archivedCount ?? 0) > 0 && (
            <p className="text-xs text-gray-500">{inbox.archivedCount} archived lead{inbox.archivedCount === 1 ? '' : 's'}.</p>
          )}
          <PermitsCard />

          {inbox.sold.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-300 mb-2">Sent</h2>
              <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded">
                {inbox.sold.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{lead.name}</span>
                      <span className="block text-xs text-gray-500">
                        {tradeName(lead.jobType)} · to {lead.companyName}
                        {lead.wonBy === 'bid' ? ' · won by bid' : lead.wonBy === 'order' ? ' · buy order' : ''}
                        {lead.assignedAt ? ` · ${new Date(lead.assignedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                      </span>
                    </span>
                    <span className={`text-sm whitespace-nowrap ${lead.status === 'credited' ? 'text-gray-500 line-through' : 'text-emerald-300'}`}>
                      {money(lead.priceCents ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : tab === 'companies' ? (
        companies.length === 0 ? (
          <div className="border border-dashed border-[#333] rounded p-8 text-center">
            <Building2 className="w-8 h-8 mx-auto text-gray-500 mb-2" />
            <p className="text-sm text-gray-400">No companies yet. Add one with the yellow + button.</p>
          </div>
        ) : (
          <div className="space-y-3">
          <div className="border border-[#2A2A2A] rounded overflow-x-auto">
            <table className="w-full text-sm" aria-label="Companies">
              <thead className="text-xs text-gray-500 uppercase tracking-wide">
                <tr className="border-b border-[#2A2A2A]">
                  <th className="text-left font-medium px-4 py-2">Company</th>
                  <th className="text-right font-medium px-4 py-2">Balance</th>
                  <th className="text-right font-medium px-4 py-2 hidden sm:table-cell">Leads (30d)</th>
                  <th className="text-right font-medium px-4 py-2 hidden sm:table-cell">Spent (30d)</th>
                  <th className="text-left font-medium px-4 py-2">Plan</th>
                  <th className="text-right font-medium px-4 py-2">Won</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2A]">
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    onClick={() => setOpenCompanyId(company.id)}
                    className="cursor-pointer [@media(hover:hover)]:hover:bg-[#1A1A1A] active:bg-[#1A1A1A]"
                  >
                    <td className="px-4 py-3">
                      <span className="block text-white">{company.name}</span>
                      <span className="block text-xs text-gray-500 truncate max-w-[16rem]">
                        {company.leadTrades.length ? company.leadTrades.map(tradeName).join(', ') : 'No trades set'}
                        {company.pendingCredits > 0 ? ` · ${company.pendingCredits} credit request` : ''}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right ${company.balanceCents > 0 ? 'text-emerald-300' : 'text-gray-500'}`}>
                      {money(company.balanceCents)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 hidden sm:table-cell">{company.leads30d}</td>
                    <td className="px-4 py-3 text-right text-gray-300 hidden sm:table-cell">{money(company.spent30dCents)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap ${company.plan?.active ? 'text-white' : 'text-gray-500'}`}>{planLabel(company.plan)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{money(company.wonCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {owner && <TeamCard />}
          </div>
        )
      ) : owner ? (
        <PricesTab trades={trades} />
      ) : null}

      {owner && creating === 'company' && <NewCompanyDialog trades={trades} onClose={closeCreate} onSaved={() => reload()} />}
      {verifying && <VerifyDialog lead={verifying} onClose={() => setVerifying(null)} onSaved={() => reload()} />}
      {sending && (
        <SendToDialog
          lead={sending}
          companies={companies}
          tradeName={tradeName}
          onClose={() => setSending(null)}
          onSent={(message) => {
            setNotice(message);
            reload();
          }}
        />
      )}
      {openCompany && (
        <CompanyPanel
          company={openCompany}
          owner={owner}
          trades={trades}
          credits={credits}
          payments={payments}
          onClose={() => setOpenCompanyId(null)}
          onChanged={() => reload()}
        />
      )}
      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10060] bg-[#1D1F25] border border-[#336699] px-4 py-2 text-sm text-white shadow-lg rounded">
          {notice}
        </div>
      )}
    </div>
  );
};

export default LeadMarketPage;
