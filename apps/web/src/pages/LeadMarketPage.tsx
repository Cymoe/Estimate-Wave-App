import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Building2, Check, ChevronDown, ChevronUp, Inbox, Link2, MapPin, Phone, Plus, Send, Tag, Trash2, X } from 'lucide-react';
import { applicationsAPI, fundingAPI, industriesAPI, leadsAPI, marketplaceAPI, permitsAPI, walletAPI } from '../lib/api';
import { copyText } from '../components/estimates/estimateActions';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, ErrorLine, Field, ago, describeError, input, primary, secondary, tap, usePanel } from '../components/ops/ui';
import { IntakeQueue } from '../components/ops/IntakeQueue';
import { Delivered, type DeliveredRow } from '../components/ops/Delivered';
import { DemandBoard, type DemandBoardData } from '../components/ops/DemandBoard';
import { useApplications, useCompanies, useCompanyLeads, useDelivered, useDemandBoard, useInbox, useIntakeQueue, useLiveErrors, usePaymentsMode, usePendingCredits, useWallet } from '../lib/live';
import { OpsErrorBoundary } from '../components/ops/OpsErrorBoundary';
import { isStaff, isSuperAdmin } from '../lib/roles';
import { TeamCard } from '../components/ops/TeamCard';
import { useConfirm } from '../components/common/ConfirmDialog';
import { Confirmed } from '../components/market/Confirmed';
import { STATUSES, type Lead } from '../components/leads/leadTypes';
import type { WalletSummary } from '../components/market/WalletBar';
import { CREDIT_REASON_LABELS, WalletHistory, leadOrigin, money, planLabel, suggestedBonus, type PlanSummary } from '../components/market/wallet';
import { dropsToFloor, pricingFor } from '../services/auction';

interface Trade {
  id: string;
  name: string;
}

/** A company that applied from the landing page and is waiting on the owner. */
interface Application {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  trades: string[];
  county: string;
  jobsPerMonth?: string;
  notes?: string;
  createdAt: string;
}

/** The plan mix in the totals row, in the order it reads best. */
const PLAN_STATES = ['Pro', 'trial', 'no plan', 'paused', 'ending', 'ended'] as const;
function planState(plan: PlanSummary | null | undefined): (typeof PLAN_STATES)[number] {
  if (!plan) return 'no plan';
  switch (plan.status) {
    case 'active':
      return 'Pro';
    case 'trial':
      return plan.active ? 'trial' : 'ended';
    case 'past_due':
      return 'paused';
    case 'cancelled':
      return plan.active ? 'ending' : 'ended';
  }
}

/** How strong a company's plan is, for sorting: paying Pro first, no plan last. */
function planRank(plan: PlanSummary | null | undefined): number {
  if (!plan) return 0;
  switch (plan.status) {
    case 'active':
      return plan.monthlyCents > 0 ? 6 : 5;
    case 'trial':
      return plan.active ? 4 : 1;
    case 'cancelled':
      return plan.active ? 3 : 1;
    case 'past_due':
      return 2;
  }
}

type CompanySortKey = 'name' | 'balance' | 'leads' | 'spent' | 'plan' | 'won';
type CompanySort = { key: CompanySortKey; desc: boolean } | null;

/** Compares two companies by one column, strongest or biggest first. Ties go A to Z by name. */
function compareCompanies(a: Company, b: Company, key: CompanySortKey, desc: boolean): number {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (key === 'name') return desc ? -byName : byName;
  let diff: number;
  switch (key) {
    case 'balance':
      diff = a.balanceCents - b.balanceCents;
      break;
    case 'leads':
      diff = a.leads30d - b.leads30d;
      break;
    case 'spent':
      diff = a.spent30dCents - b.spent30dCents;
      break;
    case 'won':
      diff = a.wonCents - b.wonCents;
      break;
    case 'plan':
      diff = planRank(a.plan) - planRank(b.plan);
      // Two trials, or two plans ending: the one with more time left is stronger.
      if (diff === 0 && a.plan && b.plan && a.plan.active && b.plan.active && a.plan.status === b.plan.status) {
        diff = Date.parse(a.plan.nextChargeAt) - Date.parse(b.plan.nextChargeAt);
      }
      break;
  }
  if (diff === 0) return byName;
  return desc ? -diff : diff;
}

/** A column heading you can tap to sort by it; tap again to flip it. */
const SortHeading: React.FC<{
  label: string;
  column: CompanySortKey;
  sort: CompanySort;
  onSort: (column: CompanySortKey) => void;
  align: 'left' | 'right';
  className?: string;
}> = ({ label, column, sort, onSort, align, className = '' }) => {
  const on = sort?.key === column;
  const Arrow = on && sort?.desc ? ChevronDown : ChevronUp;
  return (
    <th
      scope="col"
      aria-sort={on ? (sort?.desc ? 'descending' : 'ascending') : 'none'}
      className={`font-medium px-2 py-0 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 min-h-[44px] px-2 w-full uppercase tracking-wide ${align === 'right' ? 'justify-end' : 'justify-start'} ${on ? 'text-white' : '[@media(hover:hover)]:hover:text-white'}`}
      >
        {label}
        <Arrow aria-hidden="true" className={`w-3 h-3 shrink-0 ${on ? '' : 'invisible'}`} />
      </button>
    </th>
  );
};

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
  assignedAt?: string;
  companyName?: string;
  /** A person confirmed it with the homeowner: when, and what they said. */
  verified?: { at: string; note?: string };
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
  /** The latest payment link: open (not paid yet), submitted (at checkout), confirmed (paid). */
  fundingLink?: { status: 'open' | 'submitted' | 'confirmed' | 'cancelled'; amountCents?: number; createdAt: string; confirmedAt?: string } | null;
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

type Tab = 'demand' | 'intake' | 'forsale' | 'sold' | 'companies' | 'prices';
const TABS: Tab[] = ['demand', 'intake', 'forsale', 'sold', 'companies', 'prices'];
/** Old names in links that were already sent (emails, bookmarks) still open the right tab. */
const OLD_TAB_NAMES: Record<string, Tab> = { delivered: 'sold', inbox: 'forsale', listed: 'forsale' };
const isTab = (value: string | null): value is Tab => TABS.includes(value as Tab);

/** What each live query on the Ops page is, for "Couldn't load …". */
const LIVE_LABELS: Record<string, string> = {
  'demand:board': 'the demand board',
  'demand:slot': 'this county and trade',
  'intake:queue': 'the intake queue',
  'intake:recentLog': 'the webhook log',
  'marketplace:listInbox': 'the leads for sale',
  'delivery:recent': 'the sold leads',
  'marketplace:companiesOverview': 'the companies',
  'marketplace:pendingCredits': 'the credit requests',
  'applications:list': 'the applications',
  'funding:mode': 'the payments setting',
  'intake:destination': 'the lead webhook address',
  'marketplace:wallet': "a company's balance",
  'leads:list': "a company's leads",
};

const TAB_TITLES: Record<Tab, string> = {
  demand: 'Demand',
  intake: 'Intake',
  forsale: 'For sale',
  sold: 'Sold',
  companies: 'Companies',
  prices: 'Prices',
};

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word === 'company' ? 'companies' : `${word}s`}`;
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();


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
  const load = useCallback(() => permitsAPI.status().then(setStatus).catch((err) => setNote(`The permit status couldn't be read: ${describeError(err, 'server error')}`)), []);
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
  // Pick a company first, then confirm: one stray tap must not charge anyone.
  const [picked, setPicked] = useState<Company | null>(null);
  const send = async (company: Company) => {
    setSending(company.id);
    setError(null);
    try {
      // The price can have dropped since the list loaded: say what was really charged.
      const { priceCents } = await marketplaceAPI.assign(lead.id, company.id);
      onSent(`Sold to ${company.name} by hand · ${money(priceCents)} charged`);
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
        Only one company gets it. Pick one, then confirm.
      </p>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" role="radiogroup" aria-label="Send to">
        {sorted.map((company) => {
          const affordable = company.balanceCents >= lead.price;
          const takes = Boolean(lead.jobType && company.leadTrades.includes(lead.jobType));
          const selected = picked?.id === company.id;
          return (
            <li key={company.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!affordable || sending !== null}
                onClick={() => setPicked(company)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:opacity-40 [@media(hover:hover)]:hover:bg-[#1E1E1E] active:bg-[#1E1E1E] ${selected ? 'bg-[#336699]/15 border-l-2 border-[#336699]' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm text-white truncate">{company.name}</span>
                  <span className="block text-xs text-gray-500">
                    {takes ? 'Buys this trade' : 'Other trades'}
                    {company.city ? ` · ${company.city}` : ''}
                    {!affordable ? ` · needs ${money(lead.price - company.balanceCents)} more` : ''}
                  </span>
                </span>
                <span className={`text-sm whitespace-nowrap ${affordable ? 'text-emerald-300' : 'text-red-400'}`}>{money(company.balanceCents)}</span>
              </button>
            </li>
          );
        })}
        {sorted.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">Add a company first.</li>}
      </ul>
      <button
        type="button"
        disabled={!picked || sending !== null}
        onClick={() => picked && send(picked)}
        className={`${primary} mt-4 w-full justify-center`}
      >
        {sending ? 'Sending…' : picked ? `Send to ${picked.name} · charge ${money(lead.price)}` : 'Pick a company'}
      </button>
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
function PlanSection({ company }: { company: Company }) {
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
            No plan
          </option>
          <option value="trial">Trial</option>
          <option value="active">Pro</option>
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
          Save plan
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}

/** What the company panel reads from a company's wallet and leads. */
type CompanyWallet = WalletSummary;
type CompanyLead = Lead;

function CompanyPanel({
  company,
  owner,
  trades,
  credits,
  onClose,
}: {
  company: Company;
  /** The platform owner sees and changes money and setup; staff only read. */
  owner: boolean;
  trades: Trade[];
  credits: CreditRequest[];
  onClose: () => void;
}) {
  // Live: a payment, a credit or a sale shows here as it happens. The one-shot read below
  // fills in until the live answer arrives (and is what tests without a backend see).
  const walletLive = useWallet<CompanyWallet>(company.id);
  const leadsLive = useCompanyLeads<CompanyLead[]>(company.id);
  const panelRef = usePanel<HTMLElement>(onClose);
  const [walletOnce, setWallet] = useState<CompanyWallet | null>(null);
  const [leadsOnce, setLeads] = useState<CompanyLead[]>([]);
  const wallet = walletLive ?? walletOnce;
  const leads = leadsLive ?? leadsOnce;
  const [loadError, setLoadError] = useState<string | null>(null);
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
    load().catch((err) => setLoadError(`Couldn't load this company's balance and leads: ${describeError(err, 'server error')}`));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment couldn't be recorded");
    } finally {
      setBusy(false);
    }
  };

  const review = async (orgLeadId: string, approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await marketplaceAPI.reviewCredit(orgLeadId, approve);
      const lead = leads.find((l) => l.id === orgLeadId);
      setCredited(
        approve
          ? `Credited ${money(lead?.pricePaidCents ?? 0)} back to ${company.name}${lead ? ` for ${lead.name}` : ''}.`
          : `Credit declined${lead ? ` for ${lead.name}` : ''}.`,
      );
      await load();
    } catch (err) {
      setError(`The credit request wasn't ${approve ? 'approved' : 'declined'}: ${describeError(err, 'server error')}`);
    } finally {
      setBusy(false);
    }
  };

  // Crediting a bad lead: the company told us by phone, so the owner does it from here.
  const [crediting, setCrediting] = useState<string | null>(null);
  const [creditReason, setCreditReason] = useState('wrong_number');
  const [creditNote, setCreditNote] = useState('');
  const [credited, setCredited] = useState<string | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const creditLead = async (lead: { id: string; name: string; pricePaidCents?: number }) => {
    setBusy(true);
    setCreditError(null);
    try {
      const { amountCents } = await marketplaceAPI.creditLead(lead.id, creditReason, creditNote || undefined);
      setCrediting(null);
      setCreditNote('');
      setCredited(`Credited ${money(amountCents)} back to ${company.name} for ${lead.name}.`);
      await load();
    } catch (err) {
      // Said in the credit form, next to the button that was tapped.
      setCreditError(`The credit didn't go through: ${describeError(err, 'server error')}`);
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
        title: `Remove ${names}?`,
        message: `${company.name} has ${dropped.length} bid${dropped.length === 1 ? '' : 's'} there. ${dropped.length === 1 ? 'It goes' : 'They go'} too.`,
        confirmLabel: 'Remove trade',
        cancelLabel: 'Keep it',
      });
      if (!yes) return;
    }
    const before = leadTrades;
    setLeadTrades(next);
    try {
      await marketplaceAPI.setCompanyTrades(company.id, next);
    } catch (err) {
      // Put the chips back the way the server has them.
      setLeadTrades(before);
      setError(`The trades didn't save: ${describeError(err, 'server error')}`);
    }
  };

  const mine = credits.filter((c) => c.organizationId === company.id);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  /** Shares the company's funding page (or copies it where there's no share sheet). */
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const sendFundingLink = async () => {
    setLinkNote(null);
    let url: string;
    try {
      url = fundingAPI.url(await fundingAPI.createLink(company.id));
    } catch (err) {
      setError(`The payment link couldn't be made: ${describeError(err, 'server error')}`);
      return;
    }
    // Shown too, so it can be copied by hand when sharing or the clipboard is blocked.
    setLinkUrl(url);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Load your FieldQuote lead balance', text: `Here's the link to load ${company.name}'s lead balance:`, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await copyText(url);
      setLinkNote('Payment link copied');
      setTimeout(() => setLinkNote(null), 2500);
    } catch {
      setLinkNote('Copy the link below');
    }
  };
  const linkStatus = (() => {
    const link = company.fundingLink;
    if (!link || link.status === 'cancelled') return null;
    if (link.status === 'confirmed') return `Last payment link: paid ${money(link.amountCents ?? 0)}${link.confirmedAt ? ` ${ago(link.confirmedAt)}` : ''}`;
    if (link.status === 'submitted') return `Payment link: they're at checkout${link.amountCents ? ` for ${money(link.amountCents)}` : ''}`;
    return `Payment link: sent ${ago(link.createdAt)}, not paid yet`;
  })();

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
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={company.name}
        className="fixed right-0 top-0 h-[100dvh] w-full md:w-[480px] bg-[#121212] border-l border-[#2A2A2A] z-[10001] flex flex-col outline-none"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{company.name}</h2>
            <p className="text-xs text-gray-500 truncate">
              {[company.email, company.phone, company.city].filter(Boolean).join(' · ') || 'No contact details'}
              {company.invitePending ? ` · invite waiting for ${company.invitePending}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`${tap} -m-3 text-gray-400 hover:text-white`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* A live answer arriving later replaces a failed first read, so the line goes when the data comes. */}
          <ErrorLine error={walletLive || leadsLive ? null : loadError} onDismiss={() => setLoadError(null)} />
          <section>
            <p className="text-xs uppercase tracking-wide text-gray-500">Balance</p>
            <p className="text-3xl font-semibold text-white" data-testid="company-balance">
              {money(wallet?.balanceCents ?? company.balanceCents)}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {plural(company.leadsTotal, 'lead')} from FieldQuote · {money(company.wonCents)} of jobs from them
            </p>
          </section>

          {owner && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={sendFundingLink} className={secondary}>
                <Link2 className="w-4 h-4" />
                Send payment link
              </button>
              {linkNote && <span className="text-xs text-emerald-300">{linkNote}</span>}
              {linkStatus && <span className="text-xs text-gray-400" data-testid="link-status">{linkStatus}</span>}
            </div>
          )}
          {owner && linkUrl && (
            <input
              readOnly
              value={linkUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Payment link"
              className={`${input} py-1.5 text-xs`}
            />
          )}

          {owner && (
          <form onSubmit={recordPayment} className="border border-[#2A2A2A] rounded p-4">
            <h3 className="text-sm font-medium text-white mb-3">Record a payment</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount received ($)">
                <input inputMode="decimal" value={amount} onChange={(e) => changeAmount(e.target.value)} className={input} placeholder="5000" />
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

          {owner && <PlanSection company={company} />}

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
                  const bought = Boolean(lead.marketplaceLeadId);
                  const creditState = lead.creditRequest?.status as 'pending' | 'approved' | 'denied' | undefined;
                  return (
                    <li key={lead.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm text-white truncate">{lead.name}</span>
                          <span className="block text-xs text-gray-500">
                            {leadOrigin(lead) ?? lead.source ?? 'Their own lead'}
                            {creditState === 'approved' ? ' · credited back' : creditState === 'denied' ? ' · credit declined' : creditState === 'pending' ? ' · credit requested' : ''}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`text-xs whitespace-nowrap ${status?.color ?? 'text-gray-400'}`}>{status?.label ?? lead.status}</span>
                          {owner && bought && creditState !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => setCrediting(crediting === lead.id ? null : lead.id)}
                              className="min-h-[44px] px-2 -mx-2 text-xs text-[#cfe2f5] underline underline-offset-2 whitespace-nowrap"
                            >
                              {crediting === lead.id ? 'Cancel' : 'Credit it back'}
                            </button>
                          )}
                        </span>
                      </div>
                      {crediting === lead.id && (
                        <div className="mt-2 rounded border border-[#2A2A2A] bg-[#161616] p-3 space-y-2" data-testid="credit-form">
                          <p className="text-xs text-gray-400">Puts {money(lead.pricePaidCents ?? 0)} back on their balance. The lead stays with them, marked credited.</p>
                          <div className="flex flex-wrap gap-2">
                            <select value={creditReason} onChange={(e) => setCreditReason(e.target.value)} aria-label="Why" className={`${input} py-1.5 text-sm w-auto`}>
                              {Object.entries(CREDIT_REASON_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="Note (optional)" aria-label="Credit note" className={`${input} py-1.5 text-sm flex-1 min-w-[10rem]`} />
                          </div>
                          <button type="button" disabled={busy} onClick={() => creditLead(lead)} className={primary}>
                            Credit {money(lead.pricePaidCents ?? 0)} back
                          </button>
                          <ErrorLine error={creditError} onDismiss={() => setCreditError(null)} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {credited && (
              <p role="status" className="mt-2 text-xs text-emerald-300">
                {credited}
              </p>
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
  // What the server has, so tapping away from an unchanged field saves nothing.
  const [stored, setStored] = useState<Record<string, PriceDraft> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = (await marketplaceAPI.prices()) as { defaultCents: number; prices: Array<{ jobType: string; priceCents: number; floorCents?: number; dropCents?: number; dropEveryMinutes?: number }> };
      const next: Record<string, PriceDraft> = { default: { ...emptyDraft, price: String(result.defaultCents / 100) } };
      for (const row of result.prices) next[row.jobType] = fromRow(row);
      setDrafts(next);
      setStored(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Prices couldn't be loaded");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const same = (a: PriceDraft, b: PriceDraft) => (['price', 'floor', 'drop', 'every'] as const).every((k) => a[k].trim() === b[k].trim());
  const save = async (jobType: string) => {
    if (stored === null) return;
    setError(null);
    const d = drafts[jobType] ?? emptyDraft;
    const was = stored[jobType] ?? emptyDraft;
    if (same(d, was)) return;
    // A blank start price would delete the trade's row (floor, drop and interval with it): never do that by accident.
    if (d.price.trim() === '' && jobType !== 'default' && (d.floor.trim() || d.drop.trim() || d.every.trim())) return;
    const num = (raw: string) => (raw.trim() === '' ? null : Number(raw));
    try {
      await marketplaceAPI.setPrice(jobType, num(d.price), { floor: num(d.floor), drop: num(d.drop), dropEveryMinutes: num(d.every) });
      setStored({ ...stored, [jobType]: d });
      setSaved(jobType);
      setTimeout(() => setSaved((s) => (s === jobType ? null : s)), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The price couldn't be saved");
    }
  };
  const needsStart = (jobType: string) => {
    const d = drafts[jobType];
    return Boolean(d && jobType !== 'default' && d.price.trim() === '' && (d.floor.trim() || d.drop.trim() || d.every.trim()));
  };
  const field = (jobType: string, key: keyof PriceDraft, label: string, placeholder: string, width = 'w-20') => (
    <input
      inputMode="decimal"
      aria-label={label}
      value={drafts[jobType]?.[key] ?? ''}
      placeholder={placeholder}
      onChange={(e) => setDrafts({ ...drafts, [jobType]: { ...(drafts[jobType] ?? emptyDraft), [key]: e.target.value } })}
      onBlur={() => save(jobType)}
      disabled={stored === null}
      className={`${width} bg-[#1A1A1A] border border-[#333] rounded px-2 py-1.5 text-right text-white text-base md:text-sm focus:outline-none focus:border-[#336699] disabled:opacity-50`}
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
      {needsStart(jobType) && (
        <p className="text-xs text-amber-300 mt-1 text-right" role="alert">
          Start price needed: with it blank, nothing is saved. Clear the other boxes too to go back to the default.
        </p>
      )}
    </li>
  );
  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-400 mb-3">
        A lead with a standing bid for its county and trade is sold to the highest bidder the moment it's confirmed. The rest go up for sale at the start price ($200 or more) and drop to the floor over the day, where they stay until bought. Trades left blank use the default row.
      </p>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {loadError ? (
        <p className="text-sm text-red-400 mb-3">
          Couldn't load prices: {loadError}{' '}
          <button type="button" onClick={load} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : stored === null ? (
        <p className="text-sm text-gray-500 mb-3">Loading prices…</p>
      ) : null}
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [sending, setSending] = useState<MarketLead | null>(null);
  const [verifying, setVerifying] = useState<MarketLead | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Staff run the page; only the owner sees money, prices, demo data and companies' setup.
  const staff = isStaff(user);
  const owner = isSuperAdmin(user);
  // Where you are lives in the address (?tab=…&company=…), so Back works, a
  // refresh keeps the tab, and a link in an email opens the right panel.
  const creating = searchParams.get('new');
  const tabParam = OLD_TAB_NAMES[searchParams.get('tab') ?? ''] ?? searchParams.get('tab');
  const tab: Tab =
    isTab(tabParam) && (tabParam !== 'prices' || owner) ? tabParam : creating === 'company' ? 'companies' : 'intake';
  const openCompanyId = searchParams.get('company');
  const liveProblems = Object.entries(useLiveErrors());
  const go = (changes: { tab?: Tab; company?: string | null }, { replace = false } = {}) => {
    const next = new URLSearchParams(searchParams);
    if (changes.tab) next.set('tab', changes.tab);
    if (changes.company !== undefined) {
      if (changes.company) next.set('company', changes.company);
      else next.delete('company');
    }
    setSearchParams(next, { replace });
  };
  const setTab = (value: Tab) => go({ tab: value, company: null });
  const setOpenCompanyId = (id: string | null) => go({ company: id }, { replace: id === null });
  // A failed action says so here and stays until dismissed; the notice below is for things that worked.
  const [error, setError] = useState<string | null>(null);
  const attempt = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      setError(`${what}: ${describeError(err, 'something went wrong on the server')}`);
    }
  };
  const openNewCompany = () => {
    const next = new URLSearchParams(searchParams);
    next.set('new', 'company');
    setSearchParams(next, { replace: true });
  };
  const closeCreate = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  };

  // Everything on the page is a live subscription: a sale, a payment, an
  // application or a credit shows the moment it lands, from any device.
  const inboxLive = useInbox<{ available: MarketLead[]; older?: MarketLead[]; archivedCount?: number; sold: MarketLead[] }>(staff);
  const companiesLive = useCompanies<Company[]>(staff);
  const creditsLive = usePendingCredits<CreditRequest[]>(staff);
  const applicationsLive = useApplications<Application[]>(staff);
  const inbox = inboxLive ?? { available: [], sold: [] };
  const companies = useMemo(() => companiesLive ?? [], [companiesLive]);
  // Tap a heading on the Companies table to sort by it. Until then, newest company first.
  const [companySort, setCompanySort] = useState<CompanySort>(null);
  const sortCompaniesBy = (column: CompanySortKey) =>
    setCompanySort((current) => (current?.key === column ? { key: column, desc: !current.desc } : { key: column, desc: column !== 'name' }));
  const sortedCompanies = useMemo(
    () => (companySort ? [...companies].sort((a, b) => compareCompanies(a, b, companySort.key, companySort.desc)) : companies),
    [companies, companySort],
  );
  const credits = creditsLive ?? [];
  const applications = applicationsLive ?? [];
  const loading = inboxLive === undefined || companiesLive === undefined;

  /** Approve sets the company up and opens its panel, so the payment link can go out next. */
  const [deciding, setDeciding] = useState<string | null>(null);
  const [confirmAction, confirmActionDialog] = useConfirm();
  const decideApplication = async (application: { id: string; companyName: string }, approve: boolean) => {
    if (!approve) {
      const yes = await confirmAction({
        title: `Decline ${application.companyName}?`,
        message: "They come off the list. Nothing is emailed to them: call them if they should hear why.",
        confirmLabel: 'Decline',
        cancelLabel: 'Keep it',
      });
      if (!yes) return;
    }
    setDeciding(application.id);
    try {
      await attempt(approve ? "The application couldn't be approved" : "The application couldn't be declined", async () => {
        if (approve) {
          const { organizationId } = await applicationsAPI.approve(application.id);
          setOpenCompanyId(organizationId);
          setNotice('Company set up. Send the payment link when you have spoken to them.');
        } else {
          await applicationsAPI.decline(application.id);
          setNotice(`${application.companyName} declined.`);
        }
      });
    } finally {
      setDeciding(null);
    }
  };

  useEffect(() => {
    if (!staff) return;
    industriesAPI.list().then(setTrades).catch(() => setTrades([]));
  }, [staff]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const tradeName = useCallback((id?: string) => trades.find((t) => t.id === id)?.name ?? (id ? id : 'Any trade'), [trades]);
  const openCompany = companies.find((c) => c.id === openCompanyId) ?? null;
  // The header's one line of numbers follows the open tab, from the same live
  // data the tab shows (Convex shares a subscription the tab already holds).
  const demandData = useDemandBoard<DemandBoardData>();
  const playMoney = usePaymentsMode<{ playMoney: boolean }>()?.playMoney === true;
  const intakeOpen = useIntakeQueue<Array<{ duplicateOf?: string }>>('open');
  const deliveredRows = useDelivered<DeliveredRow[]>();
  // The whole book: the header line and the totals row under the companies table.
  const book = useMemo(() => {
    const sum = (pick: (c: Company) => number) => companies.reduce((n, c) => n + pick(c), 0);
    const mix: Record<string, number> = {};
    for (const c of companies) {
      const key = planState(c.plan);
      mix[key] = (mix[key] ?? 0) + 1;
    }
    return {
      balanceCents: sum((c) => c.balanceCents),
      leads30d: sum((c) => c.leads30d),
      spent30dCents: sum((c) => c.spent30dCents),
      wonCents: sum((c) => c.wonCents),
      plans: PLAN_STATES.filter((state) => mix[state]).map((state) => `${mix[state]} ${state}`).join(' · '),
    };
  }, [companies]);

  // The numbers on the tabs, so nothing waits behind a tab you have not opened.
  const counts = {
    demandOpen: demandData ? demandData.slots.filter((s) => s.state === 'open').length : null,
    demandTotal: demandData?.slots.length ?? 0,
    intake: intakeOpen ? intakeOpen.length : null,
    overdue: (deliveredRows ?? []).filter((r) => !r.acknowledgedAt && r.overdue).length,
  };
  // The browser tab says where you are, and leads with the overdue count when there is one.
  useEffect(() => {
    if (!staff) return;
    const before = document.title;
    document.title = `${counts.overdue > 0 ? `(${counts.overdue}) ` : ''}${TAB_TITLES[tab]} · Ops · FieldQuote`;
    return () => {
      document.title = before;
    };
  }, [staff, tab, counts.overdue]);

  if (!staff) {
    return <div className="p-8 text-gray-400">The Ops page is only for FieldQuote staff.</div>;
  }

  const summary = (() => {
    switch (tab) {
      case 'demand': {
        const slots = demandData?.slots ?? [];
        const open = slots.filter((s) => s.state === 'open').length;
        const unknown = slots.filter((s) => s.state === 'unknown').length;
        const loss = slots.filter((s) => s.state === 'loss').length;
        const unsold = slots.filter((s) => s.state === 'oversupplied').length;
        const nobody = slots.filter((s) => s.state === 'nobuyers').length;
        const unfunded = slots.filter((s) => s.state === 'unfunded').length;
        const quiet = slots.filter((s) => s.state === 'quiet').length;
        const parts = [`${open} of ${slots.length} worth running ads`];
        if (unknown > 0) parts.push(`${unknown} need an ad cost per lead`);
        if (loss > 0) parts.push(`${loss} would lose money`);
        if (unsold > 0) parts.push(`${unsold} sitting unsold`);
        if (nobody > 0) parts.push(`${nobody} nobody buys`);
        // Every state is counted, so the parts add up to the total.
        if (unfunded > 0) parts.push(`${unfunded} with bids nobody can pay`);
        if (quiet > 0) parts.push(`${quiet} quiet`);
        return parts.join(' · ');
      }
      case 'intake': {
        const rows = intakeOpen ?? [];
        const duplicates = rows.filter((r) => r.duplicateOf).length;
        return `${rows.length} to confirm${duplicates > 0 ? ` · ${plural(duplicates, 'possible duplicate')}` : ''}`;
      }
      case 'forsale':
        return `${inbox.available.length} for sale · ${money(book.spent30dCents)} sold in 30 days`;
      case 'sold': {
        const rows = deliveredRows ?? [];
        const today = rows.filter((r) => isToday(r.assignedAt)).length;
        const waiting = rows.filter((r) => !r.acknowledgedAt).length;
        const overdue = rows.filter((r) => !r.acknowledgedAt && r.overdue).length;
        return `${today} sold today · ${overdue > 0 ? `${overdue} overdue for “Got it”` : `${waiting} waiting on “Got it”`}`;
      }
      case 'companies': {
        const pro = companies.filter((c) => c.plan?.status === 'active').length;
        return `${plural(companies.length, 'company')} · ${money(book.balanceCents)} in lead balances${playMoney ? ' (play money)' : ''} · ${pro} Pro`;
      }
      case 'prices':
        return `Start and floor price for ${plural(trades.length, 'trade')}`;
    }
  })();

  return (
    <div className="px-4 md:px-6 py-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Ops</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{TAB_TITLES[tab]}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full border border-[#336699]/60 bg-[#336699]/15 text-[#cfe2f5]">
              {owner ? 'Platform owner' : 'FieldQuote staff'}
            </span>
          </div>
          <p className="text-sm text-gray-400" data-testid="ops-summary">
            {summary}
          </p>
        </div>
        <div className="flex max-w-full rounded border border-[#333] overflow-x-auto" role="tablist" aria-label="Ops tabs">
          {(
            [
              ['demand', 'Demand', counts.demandOpen !== null ? `${counts.demandOpen}/${counts.demandTotal}` : ''],
              ['intake', 'Intake', counts.intake !== null ? `${counts.intake}` : ''],
              ['forsale', 'For sale', `${inbox.available.length}`],
              ['sold', 'Sold', counts.overdue > 0 ? `${counts.overdue}` : ''],
              ['companies', 'Companies', `${companies.length}`, applications.length > 0 ? `${applications.length} applied` : ''],
              ...(owner ? ([['prices', 'Prices', '']] as Array<[Tab, string, string]>) : []),
            ] as Array<[Tab, string, string, string?]>
          ).map(([value, label, count, extra]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm ${tab === value ? 'bg-[#336699] text-white' : 'text-gray-300 [@media(hover:hover)]:hover:bg-[#222]'}`}
            >
              {label}
              {count && (
                <>
                  {' '}
                  {/* Sold's number is the overdue count: red, because each one is a phone call to make. */}
                  <span className={value === 'sold' ? 'px-1.5 rounded-full bg-red-500/90 text-white text-xs' : 'text-xs opacity-80'}>
                    {value === 'sold' ? count : `(${count})`}
                  </span>
                </>
              )}
              {extra && <span className="text-xs opacity-80"> · {extra}</span>}
            </button>
          ))}
        </div>
      </div>

      <ErrorLine error={error} onDismiss={() => setError(null)} className="mb-4" />
      {liveProblems.map(([name, message]) => (
        <p key={name} role="alert" className="mb-2 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-sm text-red-200 break-words">
          Couldn't load {LIVE_LABELS[name] ?? name}: {message}
        </p>
      ))}

      {owner && credits.length > 0 && tab !== 'prices' && (
        <button
          type="button"
          onClick={() => go({ tab: 'companies', company: credits[0].organizationId })}
          className="w-full mb-4 text-left px-4 py-3 rounded border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200"
        >
          {credits.length} credit request{credits.length === 1 ? '' : 's'} waiting for review
        </button>
      )}

      {/* A tab that crashes stays inside this box: the tabs above keep working. */}
      <OpsErrorBoundary key={tab} onHome={() => go({ tab: 'intake' })}>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : tab === 'intake' ? (
        <IntakeQueue
          trades={trades}
          openNew={creating === 'lead'}
          onCloseNew={closeCreate}
          onListed={setNotice}
        />
      ) : tab === 'demand' ? (
        <DemandBoard owner={owner} />
      ) : tab === 'sold' ? (
        <Delivered tradeName={tradeName} />
      ) : tab === 'forsale' ? (
        <div className="space-y-6">
          {inbox.available.length === 0 ? (
            <div className="border border-dashed border-[#333] rounded p-8 text-center">
              <Inbox className="w-8 h-8 mx-auto text-gray-500 mb-2" />
              <p className="text-sm text-gray-400">Nothing for sale. Leads get here from Intake once a call confirms them.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#2A2A2A] border border-[#2A2A2A] rounded" aria-label="For sale">
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
                    className={`${tap} text-gray-400 hover:text-white`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${lead.name}`}
                    onClick={async () => {
                      const yes = await confirmAction({
                        title: `Delete ${lead.name}?`,
                        message: 'It leaves the Marketplace for good. Any company with a buy order on it sees the order closed.',
                        confirmLabel: 'Delete',
                      });
                      if (!yes) return;
                      await attempt(`${lead.name} wasn't deleted`, async () => {
                        await marketplaceAPI.removeLead(lead.id);
                        setNotice(`${lead.name} deleted.`);
                      });
                    }}
                    className={`${tap} text-gray-500 hover:text-red-400`}
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
                        {lead.county ? ` · ${lead.county} County` : lead.city ? ` · ${lead.city}` : ''} · for sale since{' '}
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
                        onClick={() =>
                          attempt(`${lead.name} wasn't archived`, async () => {
                            await marketplaceAPI.archiveLead(lead.id);
                            setNotice(`${lead.name} archived. It's out of the Vault.`);
                          })
                        }
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
        </div>
      ) : tab === 'companies' ? (
        <div className="space-y-3">
          {owner && (
            <div className="flex justify-end">
              <button type="button" onClick={openNewCompany} className={secondary}>
                <Plus className="w-4 h-4" />
                New company
              </button>
            </div>
          )}
          {owner && applications.length > 0 && (
            <section aria-label="Applications" className="border border-emerald-500/40 bg-emerald-500/5 rounded">
              <h2 className="px-4 pt-3 pb-1 text-sm font-medium text-emerald-200">
                {applications.length} {applications.length === 1 ? 'company' : 'companies'} applied from the landing page
              </h2>
              <ul className="divide-y divide-[#2A2A2A]">
                {applications.map((a) => (
                  <li key={a.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white">
                        {a.companyName} <span className="text-gray-400">· {a.contactName}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {a.trades.map(tradeName).join(', ')} · {a.county} County
                        {a.jobsPerMonth ? ` · ${a.jobsPerMonth} jobs a month` : ''} · {ago(a.createdAt)}
                      </p>
                      <p className="text-xs text-gray-400">
                        <a href={`tel:${a.phone}`} className="underline">{a.phone}</a> · <a href={`mailto:${a.email}`} className="underline">{a.email}</a>
                      </p>
                      {a.notes && <p className="text-xs text-gray-500 mt-1">{a.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled={deciding === a.id} onClick={() => decideApplication(a, false)} className={secondary}>
                        Decline
                      </button>
                      <button type="button" disabled={deciding === a.id} onClick={() => decideApplication(a, true)} className={primary}>
                        {deciding === a.id ? 'Setting up…' : 'Approve'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {companies.length === 0 ? (
            <div className="border border-dashed border-[#333] rounded p-8 text-center">
              <Building2 className="w-8 h-8 mx-auto text-gray-500 mb-2" />
              <p className="text-sm text-gray-400">
                {owner ? 'No companies yet. Tap New company, or approve an application above when one comes in.' : 'No companies yet.'}
              </p>
            </div>
          ) : (
          <div className="border border-[#2A2A2A] rounded overflow-x-auto">
            <table className="w-full text-sm" aria-label="Companies">
              <thead className="text-xs text-gray-500 uppercase tracking-wide">
                <tr className="border-b border-[#2A2A2A]">
                  <SortHeading label="Company" column="name" sort={companySort} onSort={sortCompaniesBy} align="left" />
                  <SortHeading label="Balance" column="balance" sort={companySort} onSort={sortCompaniesBy} align="right" />
                  <SortHeading label="Leads (30d)" column="leads" sort={companySort} onSort={sortCompaniesBy} align="right" className="hidden sm:table-cell" />
                  <SortHeading label="Spent (30d)" column="spent" sort={companySort} onSort={sortCompaniesBy} align="right" className="hidden sm:table-cell" />
                  <SortHeading label="Plan" column="plan" sort={companySort} onSort={sortCompaniesBy} align="left" />
                  <SortHeading label="Jobs won, all time" column="won" sort={companySort} onSort={sortCompaniesBy} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2A]">
                {sortedCompanies.map((company) => (
                  <tr
                    key={company.id}
                    onClick={() => setOpenCompanyId(company.id)}
                    className="cursor-pointer [@media(hover:hover)]:hover:bg-[#1A1A1A] active:bg-[#1A1A1A]"
                  >
                    <td className="px-4 py-3">
                      {/* A real button, so the row opens from the keyboard too. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenCompanyId(company.id);
                        }}
                        className="block text-left text-white [@media(hover:hover)]:hover:underline underline-offset-2"
                      >
                        {company.name}
                      </button>
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
              <tfoot className="border-t border-[#2A2A2A] bg-[#151515] text-white">
                <tr data-testid="companies-totals">
                  <td className="px-4 py-3">
                    <span className="block">Total</span>
                    <span className="block text-xs text-gray-500">{plural(companies.length, 'company')}</span>
                  </td>
                  <td className={`px-4 py-3 text-right ${book.balanceCents > 0 ? 'text-emerald-300' : 'text-gray-500'}`}>
                    {money(book.balanceCents)}
                    {playMoney && <span className="block text-[10px] text-amber-300">play money</span>}
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">{book.leads30d}</td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">{money(book.spent30dCents)}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs sm:text-sm whitespace-nowrap">{book.plans}</td>
                  <td className="px-4 py-3 text-right">{money(book.wonCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}
          {owner && <TeamCard />}
        </div>
      ) : owner ? (
        <PricesTab trades={trades} />
      ) : null}
      </OpsErrorBoundary>

      {confirmActionDialog}
      {owner && creating === 'company' && <NewCompanyDialog trades={trades} onClose={closeCreate} onSaved={() => setNotice('Company added.')} />}
      {verifying && <VerifyDialog lead={verifying} onClose={() => setVerifying(null)} onSaved={() => setNotice(`${verifying.name} confirmed.`)} />}
      {sending && (
        <SendToDialog
          lead={sending}
          companies={companies}
          tradeName={tradeName}
          onClose={() => setSending(null)}
          onSent={setNotice}
        />
      )}
      {openCompany && (
        <CompanyPanel
          company={openCompany}
          owner={owner}
          trades={trades}
          credits={credits}
          onClose={() => setOpenCompanyId(null)}
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
