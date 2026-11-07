import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { lastSeen, remember } from '../lib/lastSeen';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { CalendarClock, CalendarDays, Download, FileSpreadsheet, Kanban, MoreVertical, Plus, Search, UserPlus } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { industriesAPI, leadsAPI } from '../lib/api';
import { EstimateService } from '../services/EstimateService';
import { useAuth } from '../contexts/AuthContext';
import { LeadsCalendar } from '../components/leads/LeadsCalendar';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { WalletBar, WalletPill, openFundingPage, type WalletSummary } from '../components/market/WalletBar';
import { useWallet } from '../lib/live';
import { leadTag } from '../components/market/leadRoute';
import { STATUSES, type Lead, type LeadStatus, type Trade } from '../components/leads/leadTypes';
import { appointmentDay, formatAppointmentShort, toLocalInput } from '../utils/appointments';
import { ago, leadSummary } from '../components/leads/leadIntake';
import { LeadExportService } from '../services/LeadExportService';
import { Toast, useToast } from '../components/common/Notice';
import { useConfirm } from '../components/common/ConfirmDialog';
import { notify } from '../components/common/appDialogs';

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

/** Whether a lead matches the search box: name, phone (any format), email, address or notes. */
function matchesSearch(lead: Lead, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && (lead.phone ?? '').replace(/\D/g, '').includes(digits)) return true;
  return [lead.name, lead.company, lead.email, lead.address, lead.city, lead.county, lead.notes].some((field) => field?.toLowerCase().includes(q));
}

const NO_COUNTY = '__none';

const leadValue = (lead: Lead) => lead.estimate?.totalAmount ?? lead.estimatedValue ?? 0;
/** "$14,500": a lead's value is a rough number, so the board shows whole dollars. */
const dollars = (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`;

type ContactKind = 'call' | 'text' | 'note';

const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** A small dot that leads a status line. */
const Dot: React.FC<{ tone: string }> = ({ tone }) => <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tone}`} aria-hidden="true" />;

/**
 * One line that says what to do next: the appointment when there is one
 * (amber inside a day), else that nobody has called yet, else a follow-up
 * that has gone by, else when the lead was last touched. Amber is the only
 * warning colour on the board; nothing shouts.
 */
const LeadStatusLine: React.FC<{ lead: Lead; now: number; todayIso: string }> = ({ lead, now, todayIso }) => {
  const line = (tone: string, text: React.ReactNode, icon?: React.ReactNode) => (
    <span className={`inline-flex items-start gap-1.5 text-xs leading-4 min-w-0 ${tone}`} data-testid="lead-status-line">
      {icon && <span className="h-4 flex items-center flex-shrink-0">{icon}</span>}
      <span>{text}</span>
    </span>
  );
  if (lead.appointmentAt && Date.parse(lead.appointmentAt) > now - 60 * 60_000) {
    const soon = Date.parse(lead.appointmentAt) - now < 24 * 60 * 60_000;
    return line(
      soon ? 'text-amber-300' : 'text-[#7fb0e0]',
      `Appointment ${formatAppointmentShort(lead.appointmentAt)}`,
      <CalendarClock className="w-3 h-3 flex-shrink-0" />,
    );
  }
  if (lead.status === 'lost') return lead.lostReason ? line('text-gray-400', lead.lostReason) : null;
  const open = OPEN.includes(lead.status);
  const followUpGone = open && !!lead.followUpDate && lead.followUpDate < todayIso;
  const due = followUpGone ? `follow-up was due ${shortDay(lead.followUpDate!)}` : '';
  if (open && !lead.lastContactAt && (lead.status === 'new' || lead.status === 'no_answer')) {
    return line('text-amber-300', `Not contacted yet${due ? ` · ${due}` : ''}`, <Dot tone="bg-amber-300" />);
  }
  if (followUpGone) return line('text-amber-300', due.charAt(0).toUpperCase() + due.slice(1), <Dot tone="bg-amber-300" />);
  if (lead.lastContactAt) {
    const calls = lead.contacts ?? 0;
    const texts = lead.texts ?? 0;
    return line(
      'text-gray-400',
      `Last touched ${ago(lead.lastContactAt, now)}${calls > 0 ? ` · ${calls} call${calls === 1 ? '' : 's'}` : ''}${texts > 0 ? ` · ${texts} text${texts === 1 ? '' : 's'}` : ''}`,
    );
  }
  if (open && lead.followUpDate) return line('text-gray-400', `Follow up ${shortDay(lead.followUpDate)}`);
  return null;
};

const control =
  'h-10 bg-[#121212] border border-[#333333] text-sm text-white focus:outline-none focus:border-[#336699]';
/** One lead on the board: who, how much, the gist and what's next. Tapping it opens the lead; dragging it moves it to another stage. */
const LeadCard: React.FC<{
  lead: Lead;
  now: number;
  todayIso: string;
  trade?: string;
  onOpen: () => void;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}> = ({ lead, now, todayIso, trade, onOpen, dragging, onDragStart, onDragEnd }) => {
  const summary = leadSummary(lead.notes);
  const since = lead.assignedAt ?? lead.createdAt;
  const value = leadValue(lead);
  const chip = 'text-xs px-1.5 border whitespace-nowrap';
  return (
    <div
      data-lead-card
      onClick={onOpen}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      className={`border border-[#333333] bg-[#121212] p-3 cursor-pointer [@media(hover:hover)]:hover:border-[#555555] transition-colors ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-medium leading-tight">{lead.name}</span>
          {/* Where it came from: Webb Leads, and which way (bid, Marketplace, Vault...). */}
          {leadTag(lead) && <span className={`${chip} text-emerald-300 border-emerald-500/40 bg-emerald-500/10`}>{leadTag(lead)}</span>}
          {lead.isSample && <span className={`${chip} text-gray-400 border-[#333333]`}>Sample</span>}
        </div>
        {value > 0 && <span className="text-sm font-medium whitespace-nowrap">{dollars(value)}</span>}
      </div>
      {lead.company && <p className="mt-0.5 text-xs text-gray-500 truncate">{lead.company}</p>}
      {summary && (
        <p className="mt-1 text-xs text-gray-400 truncate" title={summary}>
          {summary}
        </p>
      )}
      <div className="mt-2 min-w-0 space-y-1">
        <div className="flex min-w-0"><LeadStatusLine lead={lead} now={now} todayIso={todayIso} /></div>
        {(trade || since) && (
          <div className="text-xs text-gray-500 truncate">
            {[trade, since ? `came in ${ago(since, now)}` : ''].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
};

const LeadsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { selectedOrg, setSelectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  // A company in the Lead Market that hasn't set bids yet is told where its leads will come from.
  const wallet = useWallet<WalletSummary>(organizationId);
  const buysLeads = (wallet?.leadTrades?.length ?? 0) > 0 && (wallet?.standingBids ?? 0) === 0;
  // Opened again, the last copy shows at once and refreshes quietly.
  const listKey = organizationId ? `leads:${organizationId}` : null;
  const [leads, setLeads] = useState<Lead[]>(() => lastSeen<Lead[]>(listKey) ?? []);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(() => !lastSeen(listKey));
  // The live list has arrived (not just the remembered copy): links to one lead wait for it.
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!loading) remember(listKey, leads);
  }, [listKey, loading, leads]);
  const [editing, setEditing] = useState<Lead | 'new' | null>(null);

  // The blue + button's "Lead" opens /leads?new=1.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setEditing('new');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  // The alert's link: /leads?lead=<id>&ack=1 opens that lead and tells Webb Leads "got it".
  // A lead in another of the user's companies switches to that company first.
  const [elsewhere, setElsewhere] = useState<string | null>(null);
  const looked = useRef<string | null>(null);
  useEffect(() => {
    const id = searchParams.get('lead');
    if (!id || !fresh) return;
    const lead = leads.find((row) => row.id === id);
    if (!lead) {
      if (looked.current === id) return;
      looked.current = id;
      leadsAPI
        .companyOf(id)
        .then((owner) => {
          if (owner && owner.organizationId !== organizationId) {
            try {
              localStorage.setItem('selectedOrgId', owner.organizationId);
            } catch {
              // Private mode: the switch still holds for this visit.
            }
            setSelectedOrg({ id: owner.organizationId, name: owner.name, industry: '' });
          } else {
            setElsewhere("That lead isn't in any company you belong to. Ask the company's owner to add you.");
            setSearchParams({}, { replace: true });
          }
        })
        .catch(() => setSearchParams({}, { replace: true }));
      return;
    }
    setElsewhere(null);
    setEditing(lead);
    if (searchParams.get('ack') === '1' && !lead.acknowledgedAt) {
      leadsAPI.acknowledge(lead.id).then((at) => setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, acknowledgedAt: at } : row)))).catch(() => {});
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, leads, fresh, organizationId, setSelectedOrg]);
  const [quoting, setQuoting] = useState<{ lead: Lead; clientId: string } | null>(null);

  const load = async () => {
    if (!organizationId) return;
    try {
      setLeads(await leadsAPI.list(organizationId));
    } catch (err) {
      console.error('Error loading leads:', err);
    } finally {
      setLoading(false);
      setFresh(true);
    }
  };

  useEffect(() => {
    const known = lastSeen<Lead[]>(listKey);
    if (known) setLeads(known);
    setLoading(!known);
    setFresh(false);
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
      setFresh(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const tradeName = useMemo(() => new Map(trades.map((trade) => [trade.id, trade.name])), [trades]);

  // Moving to Lost needs no pop-up: the drawer's "Lost because" field appears for the reason.
  const changeStatus = async (lead: Lead, status: LeadStatus) => {
    setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, status } : row)));
    try {
      await leadsAPI.update(lead.id, { status });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not change the status');
    }
    load();
  };

  /** A call, text or card note: the server stamps it and the card's status line follows. */
  const logContact = async (lead: Lead, kind: ContactKind, note?: string) => {
    try {
      const updated = await leadsAPI.logContact(lead.id, kind, note);
      setLeads((rows) => rows.map((row) => (row.id === lead.id ? { ...row, ...updated, id: lead.id } : row)));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save that');
    }
  };

  const addSamples = async () => {
    if (!organizationId) return;
    try {
      await leadsAPI.addSamples(organizationId);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add sample leads');
    }
  };

  const [confirm, confirmDialog] = useConfirm();
  const removeSamples = async () => {
    if (!organizationId) return;
    const yes = await confirm({ title: 'Remove all sample leads?', message: 'Leads you added yourself are kept.', confirmLabel: 'Remove samples' });
    if (!yes) return;
    await leadsAPI.removeSamples(organizationId);
    load();
  };

  const hasSamples = leads.some((lead) => lead.isSample);

  const [query, setQuery] = useState('');
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('all');
  // '' is every county; NO_COUNTY is leads whose county isn't known.
  const [countyFilter, setCountyFilter] = useState('');
  // Export menu, like the one on Estimates: the leads on screen, filters included.
  // It opens in a portal at a fixed spot under the button so the board can't paint over it.
  const [menuAt, setMenuAt] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { toast, show: showToast } = useToast();
  const toggleMenu = () => {
    if (menuAt) return setMenuAt(null);
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) setMenuAt({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
  };
  useEffect(() => {
    if (!menuAt) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) setMenuAt(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuAt]);
  // The card being dragged, and the stage it's over.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<LeadStatus | null>(null);
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
    const yes = await confirm({ title: `Delete the lead “${lead.name}”?`, message: "This can't be undone.", confirmLabel: 'Delete lead' });
    if (!yes) return;
    await leadsAPI.delete(lead.id);
    setEditing(null);
    load();
  };

  const startEstimate = async (lead: Lead) => {
    try {
      setQuoting({ lead, clientId: await leadsAPI.ensureClient(lead.id) });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not start the estimate');
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
  const exportLeads = (kind: 'csv' | 'excel') => {
    setMenuAt(null);
    if (visible.length === 0) {
      showToast('No leads to export.');
      return;
    }
    try {
      LeadExportService[kind](visible, (slug) => (slug && tradeName.get(slug)) || slug || '');
    } catch (err) {
      showToast(err instanceof Error ? err.message : "The export didn't work");
    }
  };
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
  // The follow-up line counts every lead the "Follow-up overdue" filter shows, whatever else is filtered.
  const overdue = leads.filter((lead) => isOverdue(lead, todayIso));

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <Toast text={toast} />
      {confirmDialog}
      <div className="p-6">
        {/* Title row: the page name and the quiet staff pill; on the right, the sample leads and their Remove. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
          <h1 className="hidden md:block text-xl font-semibold">Leads</h1>
          <WalletPill organizationId={organizationId} />
          {hasSamples && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="text-gray-400">Showing sample leads</span>
              <button type="button" onClick={removeSamples} className="text-[#7fb0e0] [@media(hover:hover)]:hover:text-white">
                Remove
              </button>
            </div>
          )}
        </div>
        <WalletBar organizationId={organizationId} />
        {elsewhere && (
          <p role="alert" className="mb-4 px-4 py-3 border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200">
            {elsewhere}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading leads…</p>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <UserPlus className="w-12 h-12 mb-4 text-gray-600" />
            <h2 className="text-lg font-semibold mb-2">No leads yet</h2>
            {buysLeads && (
              <>
                <p className="text-sm text-gray-300 max-w-md mb-4">
                  Leads you buy from Webb Leads land here. Add funds, then set your bids.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mb-6">
                  <button
                    onClick={() => organizationId && openFundingPage(organizationId).catch((err) => showToast(err instanceof Error ? err.message : 'The payment page could not open'))}
                    className="px-4 py-2 text-sm bg-[#336699] hover:bg-[#2a5580]"
                  >
                    Add funds
                  </button>
                  <button onClick={() => navigate('/bids')} className="px-4 py-2 text-sm border border-[#336699] text-[#cfe2f5] hover:bg-[#336699]/10">
                    Set your bids
                  </button>
                </div>
              </>
            )}
            <p className="text-sm text-gray-400 max-w-md mb-6">
              {buysLeads ? 'Your own calls go here too: log ' : 'Log '}every call or message asking for a quote, then turn it into an estimate in one click.
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
                placeholder="Search leads"
                title="Name, phone, email, address or notes"
                aria-label="Search leads"
                className={`${control} w-full pl-9 pr-3 placeholder-gray-500`}
              />
            </label>
            <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value as LeadFilter)} aria-label="Filter leads" className={`${control} px-3`}>
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select value={countyFilter} onChange={(e) => setCountyFilter(e.target.value)} aria-label="Filter by county" className={`${control} px-3`}>
              <option value="">All counties</option>
              {counties.map(([county, count]) => (
                <option key={county} value={county}>{county} County ({count})</option>
              ))}
              {noCounty > 0 && <option value={NO_COUNTY}>No county ({noCounty})</option>}
            </select>
            {(query || leadFilter !== 'all' || countyFilter) && (
              <span className="text-sm text-gray-400">{visible.length} of {leads.length}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <div className="flex h-10 border border-[#333333]" role="group" aria-label="View">
                {([['board', Kanban, 'Board'], ['calendar', CalendarDays, 'Calendar']] as const).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    onClick={() => chooseView(key)}
                    aria-pressed={view === key}
                    aria-label={label}
                    title={label}
                    className={`inline-flex items-center justify-center w-10 ${view === key ? 'bg-[#336699] text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={toggleMenu}
                aria-label="More"
                aria-expanded={menuAt !== null}
                className="h-10 w-10 inline-flex items-center justify-center border border-[#333333] text-gray-400 hover:text-white"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            {menuAt &&
              createPortal(
                <div ref={menuRef} role="menu" style={{ top: menuAt.top, right: menuAt.right }} className="fixed z-[10030] w-48 bg-[#1E1E1E] border border-[#333333] shadow-xl py-1">
                  <button type="button" role="menuitem" onClick={() => exportLeads('csv')} className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#333333]">
                    <Download className="w-3 h-3 mr-3 text-gray-400" />
                    Export to CSV
                  </button>
                  <button type="button" role="menuitem" onClick={() => exportLeads('excel')} className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#333333]">
                    <FileSpreadsheet className="w-3 h-3 mr-3 text-gray-400" />
                    Export to Excel
                  </button>
                </div>,
                document.body,
              )}
            </div>
          </div>
          {/* Every follow-up that has gone by, in one line, with a way to see just those. */}
          {overdue.length > 0 && (
            <div className="mb-4 px-4 py-3 border border-amber-500/40 bg-amber-500/10 text-sm flex items-center gap-3" data-testid="follow-up-line">
              <Dot tone="bg-amber-300" />
              <span className="min-w-0 truncate">
                <span className="font-semibold text-white">
                  {overdue.length} {overdue.length === 1 ? 'lead needs' : 'leads need'} a follow-up
                </span>
                <span className="text-gray-400">
                  {' · '}
                  {overdue.slice(0, 3).map((lead) => lead.name).join(', ')}
                  {overdue.length > 3 ? ` +${overdue.length - 3} more` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setLeadFilter(leadFilter === 'overdue' ? 'all' : 'overdue')}
                className="ml-auto text-amber-100 underline underline-offset-2 [@media(hover:hover)]:hover:text-white whitespace-nowrap"
              >
                {leadFilter === 'overdue' ? 'Show all' : 'Show them'}
              </button>
            </div>
          )}
          {view === 'calendar' ? (
            <LeadsCalendar leads={visible} onOpen={(lead) => setEditing(lead)} />
          ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STATUSES.map((column) => {
              const cards = visible.filter((lead) => lead.status === column.value);
              // Drag a card onto any stage, folded ones included, to move it there.
              const drop = {
                onDragOver: (e: React.DragEvent) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropOn !== column.value) setDropOn(column.value);
                },
                onDragLeave: (e: React.DragEvent) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn((on) => (on === column.value ? null : on));
                },
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  const lead = leads.find((row) => row.id === (e.dataTransfer.getData('text/plain') || dragging));
                  setDragging(null);
                  setDropOn(null);
                  if (lead && lead.status !== column.value) changeStatus(lead, column.value);
                },
              };
              const target = dragging && dropOn === column.value ? ' !border-[#336699] bg-[#336699]/10' : '';
              // An empty stage folds to a slim strip, so the busy ones get the room.
              if (cards.length === 0) {
                return (
                  <div
                    key={column.value}
                    data-empty-stage={column.value}
                    title={`${column.label}: no leads`}
                    {...drop}
                    className={`flex-shrink-0 w-11 border border-[#333333] bg-[#0A0A0A] flex flex-col items-center gap-3 py-3 transition-colors${target}`}
                  >
                    <Dot tone={column.dot} />
                    <span className="text-xs text-gray-500">0</span>
                    <span className={`text-sm font-medium [writing-mode:vertical-rl] whitespace-nowrap ${column.color}`}>{column.label}</span>
                  </div>
                );
              }
              const total = cards.reduce((sum, lead) => sum + leadValue(lead), 0);
              return (
                <section
                  key={column.value}
                  aria-label={column.label}
                  {...drop}
                  className={`flex-shrink-0 w-80 flex flex-col border border-[#333333] bg-[#0A0A0A] transition-colors${target}`}
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-[#333333]">
                    <span className={`text-sm font-medium ${column.color}`}>{column.label}</span>
                    <span className="text-xs text-gray-500">{cards.length}</span>
                    {total > 0 && <span className="ml-auto text-xs text-gray-400">{dollars(total)}</span>}
                  </div>
                  <div className="p-2 space-y-2">
                    {cards.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        now={now}
                        todayIso={todayIso}
                        trade={lead.jobType ? tradeName.get(lead.jobType) ?? lead.jobType : undefined}
                        onOpen={() => setEditing(lead)}
                        dragging={dragging === lead.id}
                        onDragStart={() => setDragging(lead.id)}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropOn(null);
                        }}
                      />
                    ))}
                  </div>
                </section>
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
              notify(err instanceof Error ? err.message : 'Could not save the estimate');
            }
          }}
        />
      )}
    </div>
  );
};

export default LeadsPage;
