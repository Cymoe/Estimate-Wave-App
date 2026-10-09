import React, { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, FileText, LayoutGrid, List, Mail, MapPin, Pencil, Phone, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { industriesAPI, leadsAPI } from '../lib/api';
import { EstimateService } from '../services/EstimateService';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/format';

type LeadStatus = 'new' | 'no_answer' | 'contacted' | 'scheduled' | 'quoted' | 'won' | 'lost';

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  jobType?: string;
  source?: string;
  estimatedValue?: number;
  followUpDate?: string;
  appointmentAt?: string;
  formAnswers?: string;
  notes?: string;
  status: LeadStatus;
  lostReason?: string;
  clientId?: string;
  isSample?: boolean;
  estimate: { id: string; estimateNumber: string; status: string; totalAmount: number } | null;
}

interface Trade {
  id: string;
  name: string;
}

const STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'text-sky-300' },
  { value: 'no_answer', label: 'No Answer', color: 'text-rose-300' },
  { value: 'contacted', label: 'Contacted', color: 'text-amber-300' },
  { value: 'scheduled', label: 'Estimate Scheduled', color: 'text-orange-300' },
  { value: 'quoted', label: 'Estimate Sent', color: 'text-violet-300' },
  { value: 'won', label: 'Won', color: 'text-emerald-300' },
  { value: 'lost', label: 'Lost', color: 'text-gray-500' },
];
const OPEN: LeadStatus[] = ['new', 'no_answer', 'contacted', 'scheduled', 'quoted'];
const leadValue = (lead: Lead) => lead.estimate?.totalAmount ?? lead.estimatedValue ?? 0;
const VIEW_KEY = 'leadsView';

/** ISO time to the value a datetime-local input wants, in local time. */
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const formatAppointment = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** The local calendar date of an appointment, for the follow-up date. */
const appointmentDay = (value: string) => value.slice(0, 10);

const SOURCES = ['Referral', 'Google', 'Facebook', 'Website', 'Yard sign', 'Repeat customer', 'Other'];

const inputClass =
  'w-full bg-[#0A0A0A] border border-[#333333] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]';

const LeadForm: React.FC<{
  organizationId: string;
  lead: Lead | null;
  trades: Trade[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ organizationId, lead, trades, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: lead?.name ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    address: lead?.address ?? '',
    jobType: lead?.jobType ?? '',
    source: lead?.source ?? '',
    estimatedValue: lead?.estimatedValue?.toString() ?? '',
    followUpDate: lead?.followUpDate ?? '',
    appointmentAt: toLocalInput(lead?.appointmentAt),
    formAnswers: lead?.formAnswers ?? '',
    notes: lead?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    // Empty fields are sent as null so editing can clear them.
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(form)) data[key] = value.trim() === '' ? null : value.trim();
    data.estimatedValue = form.estimatedValue === '' ? null : Number(form.estimatedValue);
    data.appointmentAt = fromLocalInput(form.appointmentAt);
    try {
      if (lead) await leadsAPI.update(lead.id, data);
      else await leadsAPI.create(organizationId, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the lead');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={save} className="relative w-full md:w-[520px] h-full bg-[#1D1F25] border-l border-[#333333] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333333]">
          <h2 className="text-lg font-semibold text-white">{lead ? 'Edit lead' : 'New lead'}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-400 border border-red-900 bg-red-950/40 px-3 py-2">{error}</p>}
          <input className={inputClass} placeholder="Name *" value={form.name} onChange={set('name')} required />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputClass} placeholder="Phone" value={form.phone} onChange={set('phone')} />
            <input className={inputClass} type="email" placeholder="Email" value={form.email} onChange={set('email')} />
          </div>
          <input className={inputClass} placeholder="Job address" value={form.address} onChange={set('address')} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-400 space-y-1">
              <span>Job type</span>
              <select className={inputClass} value={form.jobType} onChange={set('jobType')}>
                <option value="">Choose a trade</option>
                {trades.map((trade) => (
                  <option key={trade.id} value={trade.id}>{trade.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-400 space-y-1">
              <span>Source</span>
              <select className={inputClass} value={form.source} onChange={set('source')}>
                <option value="">How did they find you?</option>
                {SOURCES.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-400 space-y-1">
              <span>Estimated value</span>
              <input className={inputClass} type="number" min="0" step="1" placeholder="$" value={form.estimatedValue} onChange={set('estimatedValue')} />
            </label>
            <label className="text-xs text-gray-400 space-y-1">
              <span>Follow up on</span>
              <input className={inputClass} type="date" value={form.followUpDate} onChange={set('followUpDate')} />
            </label>
          </div>
          <label className="block text-xs text-gray-400 space-y-1">
            <span>Estimate appointment</span>
            <input className={inputClass} type="datetime-local" value={form.appointmentAt} onChange={set('appointmentAt')} />
          </label>
          <label className="block text-xs text-gray-400 space-y-1">
            <span>Form answers</span>
            <textarea className={inputClass} rows={3} placeholder="What they asked for on the request form" value={form.formAnswers} onChange={set('formAnswers')} />
          </label>
          <label className="block text-xs text-gray-400 space-y-1">
            <span>My notes</span>
            <textarea className={inputClass} rows={4} placeholder="Called, left VM, best time to call…" value={form.notes} onChange={set('notes')} />
          </label>
        </div>
        <div className="px-6 py-4 border-t border-[#333333] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-[#336699] hover:bg-[#2a5580] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save lead'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

/**
 * The working part of a board card: what they asked for, the booked
 * appointment, your notes and a box to add a note without opening the lead.
 */
const LeadCardDetails: React.FC<{ lead: Lead; onChange: (lead: Lead, data: Partial<Lead>) => void }> = ({ lead, onChange }) => {
  const [note, setNote] = useState('');
  const [pickingTime, setPickingTime] = useState(false);
  const answers = (lead.formAnswers ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    onChange(lead, { notes: [`${stamp}: ${text}`, lead.notes].filter(Boolean).join('\n') });
    setNote('');
  };

  const setAppointment = (value: string) => {
    setPickingTime(false);
    const appointmentAt = fromLocalInput(value);
    onChange(lead, {
      appointmentAt: appointmentAt ?? undefined,
      ...(appointmentAt ? { followUpDate: appointmentDay(value) } : {}),
    });
  };

  return (
    <div className="mt-2 space-y-2" onClick={stop}>
      {(lead.phone || lead.email || lead.address) && (
        <div className="space-y-1 text-xs">
          {lead.phone && (
            <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-[#7fb0e0] hover:text-white">
              <Phone className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" /> {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-[#7fb0e0] hover:text-white min-w-0">
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" /> <span className="truncate">{lead.email}</span>
            </a>
          )}
          {lead.address && (
            <a
              href={`https://maps.apple.com/?q=${encodeURIComponent(lead.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[#7fb0e0] hover:text-white min-w-0"
            >
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" /> <span className="truncate">{lead.address}</span>
            </a>
          )}
        </div>
      )}
      {answers.length > 0 && (
        <ul className="list-disc pl-4 space-y-0.5 text-xs text-gray-300 bg-[#0A0A0A] border border-[#2a2a2a] py-2 pr-2">
          {answers.map((answer, index) => (
            <li key={index}>{answer}</li>
          ))}
        </ul>
      )}
      {pickingTime ? (
        <input
          type="datetime-local"
          autoFocus
          defaultValue={toLocalInput(lead.appointmentAt)}
          onBlur={(e) => setAppointment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setAppointment(e.currentTarget.value);
            if (e.key === 'Escape') setPickingTime(false);
          }}
          className="w-full bg-[#0A0A0A] border border-[#336699] px-2 py-1.5 text-xs text-white"
          aria-label="Appointment"
        />
      ) : lead.appointmentAt ? (
        <button
          onClick={() => setPickingTime(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-white border border-[#336699]/60 bg-[#336699]/10 text-left"
        >
          <CalendarClock className="w-3.5 h-3.5 text-[#7fb0e0]" /> {formatAppointment(lead.appointmentAt)}
        </button>
      ) : (
        <button
          onClick={() => setPickingTime(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400 border border-dashed border-[#333333] hover:text-white text-left"
        >
          <CalendarClock className="w-3.5 h-3.5" /> Set appointment
        </button>
      )}
      {lead.notes && (
        <p className="text-xs text-gray-300 whitespace-pre-line line-clamp-4 border border-[#2a2a2a] px-2 py-1.5">{lead.notes}</p>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addNote();
        }}
        onBlur={addNote}
        draggable
        onDragStart={(e) => e.preventDefault()}
        placeholder="+ Add a note (called, left VM…)"
        className="w-full bg-[#0A0A0A] border border-[#333333] px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
      />
    </div>
  );
};

const LeadsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | LeadStatus>('open');
  const [editing, setEditing] = useState<Lead | 'new' | null>(null);
  const [quoting, setQuoting] = useState<{ lead: Lead; clientId: string } | null>(null);
  const [view, setView] = useState<'list' | 'board'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
    } catch {
      return 'list';
    }
  });
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  const chooseView = (next: 'list' | 'board') => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered; the view still switches.
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const tradeName = useMemo(() => new Map(trades.map((trade) => [trade.id, trade.name])), [trades]);

  const tabs = useMemo(() => {
    const summary = (match: (lead: Lead) => boolean) => {
      const rows = leads.filter(match);
      return { count: rows.length, value: rows.reduce((sum, lead) => sum + leadValue(lead), 0) };
    };
    return [
      { key: 'open' as const, label: 'All open', ...summary((lead) => OPEN.includes(lead.status)) },
      ...STATUSES.map((status) => ({ key: status.value, label: status.label, ...summary((lead) => lead.status === status.value) })),
    ];
  }, [leads]);

  const shown = leads.filter((lead) => (filter === 'open' ? OPEN.includes(lead.status) : lead.status === filter));

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
      await leadsAPI.update(lead.id, { ...data, ...('appointmentAt' in data ? { appointmentAt: data.appointmentAt ?? null } : {}) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the lead');
      load();
    }
  };

  const addSamples = async () => {
    if (!organizationId) return;
    try {
      await leadsAPI.addSamples(organizationId);
      setFilter('open');
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

  const remove = async (lead: Lead) => {
    if (!window.confirm(`Delete the lead “${lead.name}”?`)) return;
    await leadsAPI.delete(lead.id);
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

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="px-6 py-5 border-b border-[#333333] bg-[#1D1F25]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Leads</h1>
            <p className="text-sm text-gray-400">Everyone who asked for a quote, from first call to won or lost.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-[#333333]" role="group" aria-label="View">
              {([['list', List, 'List'], ['board', LayoutGrid, 'Board']] as const).map(([key, Icon, label]) => (
                <button
                  key={key}
                  onClick={() => chooseView(key)}
                  aria-pressed={view === key}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm ${
                    view === key ? 'bg-[#336699]/25 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#336699] hover:bg-[#2a5580]">
              <Plus className="w-4 h-4" /> New lead
            </button>
          </div>
        </div>
        {view === 'list' && (
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2 text-left border whitespace-nowrap ${
                filter === tab.key ? 'border-[#336699] bg-[#336699]/15' : 'border-[#333333] hover:bg-[#262830]'
              }`}
            >
              <span className="block text-xs text-gray-400">{tab.label}</span>
              <span className="block text-sm">
                {tab.count} <span className="text-gray-500">· {formatCurrency(tab.value)}</span>
              </span>
            </button>
          ))}
        </div>
        )}
      </div>

      <div className="p-6">
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
        ) : (view === 'board' ? leads.length === 0 : shown.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <UserPlus className="w-12 h-12 mb-4 text-gray-600" />
            <h2 className="text-lg font-semibold mb-2">{leads.length === 0 ? 'No leads yet' : 'Nothing here'}</h2>
            <p className="text-sm text-gray-400 max-w-md mb-6">
              {leads.length === 0
                ? 'Log every call or message asking for a quote, then turn it into an estimate in one click.'
                : 'No leads in this stage.'}
            </p>
            {leads.length === 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#336699] hover:bg-[#2a5580]">
                  <Plus className="w-4 h-4" /> Add your first lead
                </button>
                <button onClick={addSamples} className="px-4 py-2 text-sm border border-[#333333] text-gray-300 hover:bg-[#262830]">
                  Add sample leads
                </button>
              </div>
            )}
          </div>
        ) : view === 'board' ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STATUSES.map((column) => {
              const cards = leads.filter((lead) => lead.status === column.value);
              const total = cards.reduce((sum, lead) => sum + leadValue(lead), 0);
              return (
                <div
                  key={column.value}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(column.value);
                  }}
                  onDragLeave={() => setDragOver((current) => (current === column.value ? null : current))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const lead = leads.find((row) => row.id === e.dataTransfer.getData('text/plain'));
                    if (lead && lead.status !== column.value) changeStatus(lead, column.value);
                  }}
                  className={`flex-shrink-0 w-72 flex flex-col border ${
                    dragOver === column.value ? 'border-[#336699] bg-[#336699]/10' : 'border-[#333333] bg-[#121316]'
                  }`}
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
                      const overdue = !!lead.followUpDate && lead.followUpDate < todayIso && OPEN.includes(lead.status);
                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', lead.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => setEditing(lead)}
                          className="bg-[#1D1F25] border border-[#333333] hover:border-[#4a4d55] p-3 cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium leading-tight">{lead.name}</span>
                            {lead.isSample && (
                              <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-[#333333] px-1">Sample</span>
                            )}
                          </div>
                          {lead.jobType && <div className="text-xs text-gray-400 mt-0.5">{tradeName.get(lead.jobType) ?? lead.jobType}</div>}
                          <div className="flex items-center justify-between mt-2 text-xs">
                            <span className="text-white">{leadValue(lead) ? formatCurrency(leadValue(lead)) : '—'}</span>
                            {lead.followUpDate && !lead.appointmentAt && OPEN.includes(lead.status) && (
                              <span className={overdue ? 'text-red-400' : 'text-gray-400'}>
                                {overdue ? 'Overdue ' : ''}
                                {new Date(`${lead.followUpDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {lead.status === 'lost' && lead.lostReason && (
                            <div className="text-xs text-gray-500 mt-1">{lead.lostReason}</div>
                          )}
                          <LeadCardDetails lead={lead} onChange={saveLead} />
                          <div className="flex items-center justify-between gap-2 mt-2">
                            {lead.estimate ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/estimates/${lead.estimate!.id}`);
                                }}
                                className="inline-flex items-center gap-1 text-xs text-[#7fb0e0] hover:text-white"
                              >
                                <FileText className="w-3.5 h-3.5" /> {lead.estimate.estimateNumber}
                              </button>
                            ) : OPEN.includes(lead.status) ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEstimate(lead);
                                }}
                                className="inline-flex items-center gap-1 text-xs text-[#7fb0e0] hover:text-white"
                              >
                                <FileText className="w-3.5 h-3.5" /> Create estimate
                              </button>
                            ) : (
                              <span />
                            )}
                            {/* Touch screens can't drag, so the stage is also picked here. */}
                            <select
                              value={lead.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => changeStatus(lead, e.target.value as LeadStatus)}
                              className="bg-[#0A0A0A] border border-[#333333] text-xs px-1 py-0.5"
                              aria-label="Status"
                            >
                              {STATUSES.map((status) => (
                                <option key={status.value} value={status.value}>{status.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                    {cards.length === 0 && <p className="text-xs text-gray-600 text-center py-6">Drop a lead here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-[#333333] divide-y divide-[#2a2a2a]">
            {shown.map((lead) => {
              const overdue = !!lead.followUpDate && lead.followUpDate < todayIso && OPEN.includes(lead.status);
              return (
                <div key={lead.id} className="bg-[#1D1F25] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{lead.name}</span>
                      {lead.isSample && <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-[#333333] px-1">Sample</span>}
                      {lead.jobType && <span className="text-xs text-gray-400">· {tradeName.get(lead.jobType) ?? lead.jobType}</span>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {[lead.phone, lead.email, lead.source && `via ${lead.source}`].filter(Boolean).join(' · ') || 'No contact details'}
                    </div>
                    {lead.status === 'lost' && lead.lostReason && <div className="text-xs text-gray-500">Lost: {lead.lostReason}</div>}
                  </div>
                  <div className="text-sm md:w-44">
                    {lead.appointmentAt ? (
                      <span className="text-gray-300">{formatAppointment(lead.appointmentAt)}</span>
                    ) : lead.followUpDate ? (
                      <span className={overdue ? 'text-red-400' : 'text-gray-300'}>
                        {overdue ? 'Overdue ' : 'Follow up '}
                        {new Date(`${lead.followUpDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    ) : (
                      <span className="text-gray-600">No follow-up</span>
                    )}
                  </div>
                  <div className="text-sm md:w-28 md:text-right">
                    {leadValue(lead) ? formatCurrency(leadValue(lead)) : '—'}
                  </div>
                  <select
                    value={lead.status}
                    onChange={(e) => changeStatus(lead, e.target.value as LeadStatus)}
                    className={`bg-[#0A0A0A] border border-[#333333] px-2 py-1.5 text-sm md:w-32 ${STATUSES.find((s) => s.value === lead.status)?.color}`}
                    aria-label="Status"
                  >
                    {STATUSES.map((status) => (
                      <option key={status.value} value={status.value} className="text-white">{status.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    {lead.estimate ? (
                      <button
                        onClick={() => navigate(`/estimates/${lead.estimate!.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[#333333] hover:bg-[#262830]"
                      >
                        <FileText className="w-3.5 h-3.5" /> {lead.estimate.estimateNumber}
                      </button>
                    ) : (
                      <button
                        onClick={() => startEstimate(lead)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-[#336699] hover:bg-[#2a5580]"
                      >
                        <FileText className="w-3.5 h-3.5" /> Create estimate
                      </button>
                    )}
                    <button onClick={() => setEditing(lead)} className="p-1.5 text-gray-500 hover:text-white" aria-label="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(lead)} className="p-1.5 text-gray-500 hover:text-red-400" aria-label="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && organizationId && (
        <LeadForm
          organizationId={organizationId}
          lead={editing === 'new' ? null : editing}
          trades={trades}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
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
