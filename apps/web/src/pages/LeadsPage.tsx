import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarDays, ChevronsDownUp, ChevronsUpDown, Kanban, Mail, MapPin, MessageSquare, Phone, Plus, Search, UserPlus } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { industriesAPI, leadsAPI } from '../lib/api';
import { EstimateService } from '../services/EstimateService';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/format';
import { LeadsCalendar } from '../components/leads/LeadsCalendar';
import { AppointmentField } from '../components/leads/AppointmentField';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { WalletBar } from '../components/market/WalletBar';
import { isWonLead } from '../components/market/wallet';
import { STATUSES, type Lead, type LeadStatus, type Trade } from '../components/leads/leadTypes';
import { appointmentDay, formatAppointmentShort, toLocalInput } from '../utils/appointments';
import { ago, intakeAnswers, leadSummary } from '../components/leads/leadIntake';

const OPEN: LeadStatus[] = ['new', 'no_answer', 'contacted', 'scheduled', 'quoted'];

/** The next day something is due: the follow-up date, else the appointment's day. */
const nextDay = (lead: Lead) => lead.followUpDate || (lead.appointmentAt ? appointmentDay(toLocalInput(lead.appointmentAt)) : undefined);
/** An open lead whose follow-up or appointment day has gone by. */
const isOverdue = (lead: Lead, todayIso: string) => {
  const day = nextDay(lead);
  return !!day && day < todayIso && OPEN.includes(lead.status);
};
type LeadFilter = 'all' | 'appointment' | 'overdue' | 'recent';
const FILTERS: { value: LeadFilter; label: string }[] = [
  { value: 'all', label: 'All leads' },
  { value: 'appointment', label: 'Appointment set' },
  { value: 'overdue', label: 'Follow-up overdue' },
  { value: 'recent', label: 'Added in the last 30 days' },
];
const VIEW_KEY = 'leadsView';
const COMPACT_KEY = 'leadsCompact';

/** Whether a lead matches the search box: name, phone (any format), email, address or notes. */
function matchesSearch(lead: Lead, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && (lead.phone ?? '').replace(/\D/g, '').includes(digits)) return true;
  return [lead.name, lead.email, lead.address, lead.city, lead.county, lead.notes].some((field) => field?.toLowerCase().includes(q));
}

const NO_COUNTY = '__none';

const leadValue = (lead: Lead) => lead.estimate?.totalAmount ?? lead.estimatedValue ?? 0;

type ContactKind = 'call' | 'text' | 'note';

const tel = (phone: string) => phone.replace(/[^\d+]/g, '');
const callButton =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-600/90 text-white text-xs font-medium whitespace-nowrap [@media(hover:hover)]:hover:bg-emerald-600';
const quietButton =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#333333] text-gray-200 text-xs whitespace-nowrap [@media(hover:hover)]:hover:border-[#555555]';

/**
 * One line that says what to do next: the appointment when there is one
 * (amber inside a day), else when the lead was last touched and how many
 * calls so far, else that nobody has called yet.
 */
const LeadStatusLine: React.FC<{ lead: Lead; now: number }> = ({ lead, now }) => {
  if (lead.appointmentAt && Date.parse(lead.appointmentAt) > now - 60 * 60_000) {
    const soon = Date.parse(lead.appointmentAt) - now < 24 * 60 * 60_000;
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${soon ? 'text-amber-300' : 'text-gray-400'}`} data-testid="lead-status-line">
        <CalendarClock className="w-3 h-3 flex-shrink-0" /> Appt {formatAppointmentShort(lead.appointmentAt)}
      </span>
    );
  }
  if (lead.lastContactAt) {
    const calls = lead.contacts ?? 0;
    const texts = lead.texts ?? 0;
    return (
      <span className="text-xs text-gray-400" data-testid="lead-status-line">
        Last touched {ago(lead.lastContactAt, now)}
        {calls > 0 ? ` · ${calls} call${calls === 1 ? '' : 's'}` : ''}
        {texts > 0 ? ` · ${texts} text${texts === 1 ? '' : 's'}` : ''}
      </span>
    );
  }
  if (!OPEN.includes(lead.status)) return null;
  const since = lead.assignedAt ?? lead.createdAt;
  // Past No Answer the company has reached them, even if no call was logged.
  if (lead.status !== 'new' && lead.status !== 'no_answer') {
    return since ? <span className="text-xs text-gray-500" data-testid="lead-status-line">Came in {ago(since, now)}</span> : null;
  }
  // Nobody has called yet: how long it's been sitting is the number that matters.
  const waitingMs = since ? now - Date.parse(since) : 0;
  const tone = waitingMs > 24 * 60 * 60_000 ? 'text-red-400' : waitingMs > 60 * 60_000 ? 'text-amber-300' : 'text-gray-500';
  return (
    <span className={`text-xs ${tone}`} data-testid="lead-status-line">
      {since ? `Came in ${ago(since, now)} · not contacted` : 'Not contacted yet'}
    </span>
  );
};

/**
 * The working part of an open board card: Call and Text, the address as a
 * map link, the appointment, the intake answers, and a one-line box to add
 * a day-stamped note without opening the lead.
 */
const LeadCardDetails: React.FC<{
  lead: Lead;
  onChange: (lead: Lead, data: Partial<Lead>) => void;
  onContact: (lead: Lead, kind: ContactKind, note?: string) => Promise<void>;
}> = ({ lead, onChange, onContact }) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const answers = intakeAnswers(lead.notes);

  // The follow-up date is the company's own reminder; an appointment never sets or clears it.
  const changeAppointment = (iso: string | null) => onChange(lead, { appointmentAt: iso ?? undefined });
  const addNote = async () => {
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await onContact(lead, 'note', text);
      setNote('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 space-y-2" onClick={stop}>
      {lead.phone && (
        <div className="flex flex-wrap items-center gap-2">
          <a href={`tel:${tel(lead.phone)}`} onClick={() => onContact(lead, 'call')} className={callButton}>
            <Phone className="w-3.5 h-3.5" /> Call {lead.phone}
          </a>
          <a href={`sms:${tel(lead.phone)}`} onClick={() => onContact(lead, 'text')} className={quietButton}>
            <MessageSquare className="w-3.5 h-3.5" /> Text
          </a>
        </div>
      )}
      {(lead.email || lead.address) && (
        <div className="space-y-1 text-xs">
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-gray-200 hover:text-white min-w-0">
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" /> <span className="truncate">{lead.email}</span>
            </a>
          )}
          {lead.address && (
            <a
              href={`https://maps.apple.com/?q=${encodeURIComponent(lead.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-gray-200 hover:text-white min-w-0"
            >
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" /> <span className="truncate">{lead.address}</span>
            </a>
          )}
        </div>
      )}
      <AppointmentField value={lead.appointmentAt} onChange={changeAppointment} className="text-xs" />
      {answers.length > 0 ? (
        <ul className="text-xs text-gray-300 space-y-0.5" aria-label="Intake answers">
          {answers.map((answer, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-gray-600">·</span>
              <span>{answer}</span>
            </li>
          ))}
        </ul>
      ) : (
        lead.notes && <p className="text-xs text-gray-300 whitespace-pre-line line-clamp-4">{lead.notes}</p>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addNote();
          }
        }}
        onBlur={addNote}
        placeholder="Add a note: called, left VM…"
        aria-label="Add a note"
        className="w-full bg-[#0A0A0A] border border-[#333333] px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#336699]"
      />
    </div>
  );
};

const LeadsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Lead | 'new' | null>(null);

  // The yellow + button's "Lead" opens /leads?new=1.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setEditing('new');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [quoting, setQuoting] = useState<{ lead: Lead; clientId: string } | null>(null);

  const load = async () => {
    if (!organizationId) return;
    try {
      setLeads(await leadsAPI.list(organizationId));
    } catch (err) {
      console.error('Error loading leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    industriesAPI.list().then(setTrades).catch(() => setTrades([]));
    // Stay live: any saved change (an appointment, a status, a note) shows up
    // on the board and calendar as soon as the server has it.
    if (!organizationId) return;
    // Works out the city for leads that don't have one yet (once per lead).
    leadsAPI.fillMissingCities(organizationId).catch((err) => console.error('Error filling in cities:', err));
    return leadsAPI.watch(organizationId, (rows) => {
      setLeads(rows);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const tradeName = useMemo(() => new Map(trades.map((trade) => [trade.id, trade.name])), [trades]);

  const changeStatus = async (lead: Lead, status: LeadStatus) => {
    let lostReason: string | null = null;
    if (status === 'lost') {
      lostReason = window.prompt('Why was this lead lost? (optional)', lead.lostReason ?? '');
      if (lostReason === null) return;
    }
    setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, status } : row)));
    try {
      await leadsAPI.update(lead.id, { status, ...(status === 'lost' ? { lostReason: lostReason || null } : {}) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not change the status');
    }
    load();
  };

  const saveLead = async (lead: Lead, data: Partial<Lead>) => {
    setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, ...data } : row)));
    try {
      // A field set to undefined is cleared, which the server needs as null.
      await leadsAPI.update(lead.id, Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value ?? null])));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the lead');
      load();
    }
  };

  /** A call, text or card note: the server stamps it and the card's status line follows. */
  const logContact = async (lead: Lead, kind: ContactKind, note?: string) => {
    try {
      const updated = await leadsAPI.logContact(lead.id, kind, note);
      setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, ...updated, id: lead.id } : row)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save that');
    }
  };

  const addSamples = async () => {
    if (!organizationId) return;
    try {
      await leadsAPI.addSamples(organizationId);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not add sample leads');
    }
  };

  const removeSamples = async () => {
    if (!organizationId || !window.confirm('Remove all sample leads? Leads you added yourself are kept.')) return;
    await leadsAPI.removeSamples(organizationId);
    load();
  };

  const hasSamples = leads.some((lead) => lead.isSample);

  const [query, setQuery] = useState('');
  // Compact cards show the name, the gist, a Call button and the status line; the toolbar button opens them all.
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem(COMPACT_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const chooseCompact = (next: boolean) => {
    setCompact(next);
    try {
      localStorage.setItem(COMPACT_KEY, String(next));
    } catch {
      // Not remembered; the cards still switch.
    }
  };
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('all');
  // '' is every county; NO_COUNTY is leads whose county isn't known.
  const [countyFilter, setCountyFilter] = useState('');
  const [view, setView] = useState<'board' | 'calendar'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'board';
    } catch {
      return 'board';
    }
  });
  const chooseView = (next: 'board' | 'calendar') => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered; the view still switches.
    }
  };

  const remove = async (lead: Lead) => {
    if (!window.confirm(`Delete the lead “${lead.name}”?`)) return;
    await leadsAPI.delete(lead.id);
    setEditing(null);
    load();
  };

  const startEstimate = async (lead: Lead) => {
    try {
      setQuoting({ lead, clientId: await leadsAPI.ensureClient(lead.id) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not start the estimate');
    }
  };

  const projectContext = useMemo(
    () =>
      quoting && {
        projectId: '',
        clientId: quoting.clientId,
        projectName: (quoting.lead.jobType && tradeName.get(quoting.lead.jobType)) || quoting.lead.name,
        projectBudget: quoting.lead.estimatedValue ?? 0,
      },
    [quoting, tradeName],
  );

  // Today's date where you are; the UTC date is already tomorrow on US evenings.
  const todayIso = appointmentDay(toLocalInput(new Date().toISOString()));
  // The status lines ("Last touched 35m ago") keep up on their own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  // Counties in the toolbar, busiest first. Bids are placed by county, so the board filters by it too.
  const counties = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) if (lead.county) counts.set(lead.county, (counts.get(lead.county) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [leads]);
  const noCounty = leads.filter((lead) => !lead.county).length;

  const visible = leads.filter((lead) => {
    if (!matchesSearch(lead, query)) return false;
    if (countyFilter === NO_COUNTY ? lead.county : countyFilter && lead.county !== countyFilter) return false;
    if (leadFilter === 'appointment') return !!lead.appointmentAt;
    if (leadFilter === 'overdue') return isOverdue(lead, todayIso);
    if (leadFilter === 'recent') return (lead.createdAt ?? '') >= monthAgo;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="p-6">
        <WalletBar organizationId={organizationId} refreshKey={leads.length} />
        {hasSamples && (
          <div className="mb-4 px-4 py-3 border border-[#336699]/50 bg-[#336699]/10 text-sm flex items-center justify-between gap-3">
            <span className="text-gray-300">You're looking at sample leads. Add your own any time.</span>
            <button onClick={removeSamples} className="text-[#7fb0e0] hover:text-white whitespace-nowrap">
              Remove sample leads
            </button>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading leads…</p>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <UserPlus className="w-12 h-12 mb-4 text-gray-600" />
            <h2 className="text-lg font-semibold mb-2">No leads yet</h2>
            <p className="text-sm text-gray-400 max-w-md mb-6">
              Log every call or message asking for a quote, then turn it into an estimate in one click.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#336699] hover:bg-[#2a5580]">
                  <Plus className="w-4 h-4" /> Add your first lead
                </button>
                <button onClick={addSamples} className="px-4 py-2 text-sm border border-[#333333] text-gray-300 hover:bg-[#1E1E1E]">
                  Add sample leads
                </button>
            </div>
          </div>
        ) : (
          <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, email, address, notes…"
                aria-label="Search leads"
                className="w-full pl-9 pr-3 py-2 bg-[#121212] border border-[#333333] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
              />
            </label>
            <select
              value={leadFilter}
              onChange={(e) => setLeadFilter(e.target.value as LeadFilter)}
              aria-label="Filter leads"
              className="px-3 py-2 bg-[#121212] border border-[#333333] text-sm text-white focus:outline-none focus:border-[#336699]"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              value={countyFilter}
              onChange={(e) => setCountyFilter(e.target.value)}
              aria-label="Filter by county"
              className="px-3 py-2 bg-[#121212] border border-[#333333] text-sm text-white focus:outline-none focus:border-[#336699]"
            >
              <option value="">All counties</option>
              {counties.map(([county, count]) => (
                <option key={county} value={county}>{county} County ({count})</option>
              ))}
              {noCounty > 0 && <option value={NO_COUNTY}>No county ({noCounty})</option>}
            </select>
            {(query || leadFilter !== 'all' || countyFilter) && (
              <span className="text-xs text-gray-400">{visible.length} of {leads.length}</span>
            )}
            {view === 'board' && (
              <button
                onClick={() => chooseCompact(!compact)}
                aria-pressed={compact}
                title={compact ? 'Show every lead in full' : 'Show just names and phones'}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-[#333333] text-gray-300 hover:text-white"
              >
                {compact ? <ChevronsUpDown className="w-4 h-4" /> : <ChevronsDownUp className="w-4 h-4" />}
                {compact ? 'Expand leads' : 'Collapse leads'}
              </button>
            )}
            <div className={`${view === 'board' ? '' : 'ml-auto '}flex border border-[#333333]`} role="group" aria-label="View">
              {([['board', Kanban, 'Board'], ['calendar', CalendarDays, 'Calendar']] as const).map(([key, Icon, label]) => (
                <button
                  key={key}
                  onClick={() => chooseView(key)}
                  aria-pressed={view === key}
                  aria-label={label}
                  title={label}
                  className={`inline-flex items-center justify-center px-3 py-2 ${view === key ? 'bg-[#336699] text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          {view === 'calendar' ? (
            <LeadsCalendar leads={visible} onOpen={(lead) => setEditing(lead)} />
          ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STATUSES.map((column) => {
              const cards = visible.filter((lead) => lead.status === column.value);
              const total = cards.reduce((sum, lead) => sum + leadValue(lead), 0);
              return (
                <div
                  key={column.value}
                  className="flex-shrink-0 w-72 flex flex-col border border-[#333333] bg-[#0A0A0A]"
                >
                  <div className="px-3 py-2 border-b border-[#333333]">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${column.color}`}>{column.label}</span>
                      <span className="text-xs text-gray-500">{cards.length}</span>
                    </div>
                    <div className="text-xs text-gray-400">{formatCurrency(total)}</div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {cards.map((lead) => {
                      const overdue = isOverdue(lead, todayIso);
                      const showFollowUp = !!lead.followUpDate && !lead.appointmentAt && OPEN.includes(lead.status);
                      return (
                        <div
                          key={lead.id}
                          data-lead-card
                          onClick={() => setEditing(lead)}
                          className={`bg-[#121212] border border-[#333333] hover:border-[#555555] cursor-pointer ${compact ? 'px-3 py-2' : 'p-3'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-sm font-medium leading-tight">{lead.name}</span>
                              {leadSummary(lead.notes) && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate" title={leadSummary(lead.notes)}>
                                  {leadSummary(lead.notes)}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {isWonLead(lead) && (
                                <span className="text-[10px] uppercase tracking-wide px-1 border text-emerald-300 border-emerald-500/40 bg-emerald-500/10">
                                  Won
                                </span>
                              )}
                              {lead.isSample && (
                                <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-[#333333] px-1">Sample</span>
                              )}
                            </div>
                          </div>
                          {/* Only the Call link keeps the tap; anywhere else on the card opens the lead. */}
                          {compact && (
                            <div className="flex items-center justify-between gap-2 mt-1.5">
                              {lead.phone ? (
                                <a
                                  href={`tel:${tel(lead.phone)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    logContact(lead, 'call');
                                  }}
                                  className={callButton}
                                >
                                  <Phone className="w-3.5 h-3.5" /> {lead.phone}
                                </a>
                              ) : (
                                <span className="text-xs text-gray-500">No phone</span>
                              )}
                            </div>
                          )}
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <LeadStatusLine lead={lead} now={now} />
                            {/* Trade and value together on the right, so there is no gap between them. */}
                            <span className="text-xs text-right truncate flex-shrink-0">
                              {compact && lead.jobType && (
                                <span className="text-gray-500">
                                  {tradeName.get(lead.jobType) ?? lead.jobType}
                                  {leadValue(lead) > 0 ? ' · ' : ''}
                                </span>
                              )}
                              {leadValue(lead) > 0 && <span className="text-white">{formatCurrency(leadValue(lead))}</span>}
                            </span>
                          </div>
                          {!compact && (
                          <>
                          {lead.jobType && <div className="text-xs text-gray-400 mt-1">{tradeName.get(lead.jobType) ?? lead.jobType}{lead.city ? ` · ${lead.city}` : ''}</div>}
                          {showFollowUp && (
                            <div className="mt-1 text-xs">
                              <span className={overdue ? 'text-red-400' : 'text-gray-400'}>
                                Follow up {overdue ? 'overdue · ' : ''}
                                {new Date(`${lead.followUpDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          )}
                          {lead.status === 'lost' && lead.lostReason && (
                            <div className="text-xs text-gray-500 mt-1">{lead.lostReason}</div>
                          )}
                          <LeadCardDetails lead={lead} onChange={saveLead} onContact={logContact} />
                          </>
                          )}
                        </div>
                      );
                    })}
                    {cards.length === 0 && <p className="text-xs text-gray-600 text-center py-6">No leads here</p>}
                  </div>
                </div>
              );
            })}
          </div>
          )}
          </>
        )}
      </div>

      {editing && organizationId && (
        <LeadDrawer
          // A fresh drawer per lead; the live copy of the lead keeps it up to date.
          key={editing === 'new' ? 'new' : editing.id}
          organizationId={organizationId}
          lead={editing === 'new' ? null : leads.find((row) => row.id === editing.id) ?? editing}
          trades={trades}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null);
            load();
          }}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
          onChanged={(lead, patch) => setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, ...patch } : row)))}
          onStatus={changeStatus}
          onEstimate={(lead) => {
            if (lead.estimate) navigate(`/estimates/${lead.estimate.id}`);
            else startEstimate(lead);
          }}
          onContact={(lead, kind) => logContact(lead, kind)}
        />
      )}

      {quoting && projectContext && (
        <CreateEstimateDrawer
          isOpen
          onClose={() => setQuoting(null)}
          projectContext={projectContext}
          onSave={async (data) => {
            if (!organizationId) return;
            try {
              const estimate = await EstimateService.create({
                user_id: user?.id,
                organization_id: organizationId,
                client_id: data.client_id,
                title: data.title || '',
                description: data.description,
                subtotal: data.total_amount,
                tax_rate: 0,
                tax_amount: 0,
                total_amount: data.total_amount,
                status: data.status as never,
                issue_date: data.issue_date,
                expiry_date: data.valid_until,
                terms: data.terms,
                notes: data.notes,
                items: data.items.map((item, index) => ({
                  description: item.description || item.product_name || '',
                  quantity: item.quantity,
                  unit_price: item.price,
                  red_line_price: item.red_line_price,
                  cap_price: item.cap_price,
                  total_price: item.price * item.quantity,
                  display_order: index,
                })),
              });
              await leadsAPI.update(quoting.lead.id, { estimateId: estimate.id, status: 'quoted' });
              setQuoting(null);
              load();
            } catch (err) {
              console.error('Error creating estimate from lead:', err);
              alert(err instanceof Error ? err.message : 'Could not save the estimate');
            }
          }}
        />
      )}
    </div>
  );
};

export default LeadsPage;
