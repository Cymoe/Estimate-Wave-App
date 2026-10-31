import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CalendarCheck, CalendarDays, DollarSign, LayoutTemplate, Mail, MoreVertical, Phone, Trash2, User, X } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { ProjectService, type Project, type ProjectStatus } from '../../services/ProjectService';
import { ClientService, type Client } from '../../services/ClientService';
import { ExpenseService, paymentState, summarize, type Expense } from '../../services/ExpenseService';
import { EstimateService, type Estimate } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';
import { invoicesAPI, tasksAPI, templatesAPI, type ProjectTask } from '../../lib/api';
import { ExpensesList } from '../expenses/ExpensesList';
import { JobPhotos } from '../common/JobPhotos';
import { ProjectTasks } from './ProjectTasks';
import { taskDays } from './taskDates';
import {
  NoteDate,
  NoteRow,
  SaveStatus,
  dialogOnTopOf,
  noteInput,
  noteSelect,
  noteTextarea,
  useNoteFields,
  useSlideIn,
} from '../common/StructuredNote';
import { Toast, useToast } from '../common/Notice';
import { PROJECT_STATUSES, formatProjectDate, projectStatusInfo } from './projectStatus';

type TabType = 'overview' | 'tasks' | 'estimates' | 'expenses' | 'photos';
const TAB_IDS: TabType[] = ['overview', 'tasks', 'estimates', 'expenses', 'photos'];
const isTab = (value: string | null): value is TabType => TAB_IDS.includes(value as TabType);

const ESTIMATE_PILL: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-300',
  sent: 'bg-blue-500/20 text-blue-300',
  opened: 'bg-purple-500/20 text-purple-300',
  accepted: 'bg-green-500/20 text-green-300',
  rejected: 'bg-red-500/20 text-red-300',
  expired: 'bg-yellow-500/20 text-yellow-300',
};

type Draft = { client_id: string; budget: string; start_date: string; end_date: string; description: string };
const draftOf = (project: Project): Draft => ({
  client_id: project.client_id ?? '',
  budget: project.budget != null ? String(project.budget) : '',
  start_date: project.start_date ?? '',
  end_date: project.end_date ?? '',
  description: project.description ?? '',
});

const dates = (project: Project) => {
  const start = formatProjectDate(project.start_date);
  const end = formatProjectDate(project.end_date);
  if (start && end) return `${start} – ${end}`;
  return start ? `Starts ${start}` : end ? `Ends ${end}` : 'No dates';
};

/** What a job's costs look like once they're in, shown faded until the project has its own. */
const EXAMPLE_COSTS = [
  { category: 'Materials', amount: 7400 },
  { category: 'Labor', amount: 5200 },
  { category: 'Subcontractor', amount: 2800 },
  { category: 'Permits', amount: 650 },
];

const byCategory = (expenses: Expense[]) => {
  const totals = new Map<string, number>();
  for (const e of expenses) totals.set(e.category || 'Other', (totals.get(e.category || 'Other') ?? 0) + e.amount);
  return [...totals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
};

const shortDate = (iso: string) => formatProjectDate(iso).replace(/, \d{4}$/, '');

const PAID_PILL: Record<string, string> = {
  paid: 'text-green-400',
  pending: 'text-yellow-400',
  unpaid: 'text-red-400',
};

/** Where the money goes: costs by type, the budget, and the latest costs. */
const CostsOverview: React.FC<{ expenses: Expense[]; budget: number; onOpen: () => void; onAdd: () => void }> = ({
  expenses,
  budget,
  onOpen,
  onAdd,
}) => {
  const example = expenses.length === 0;
  const rows = example ? EXAMPLE_COSTS : byCategory(expenses);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const largest = Math.max(...rows.map((r) => r.amount), 1);
  const recent = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const left = budget - total;

  return (
    <>
      <section className="bg-[#1a1a1a] border border-[#333] p-4" aria-label="Costs by type" data-testid="costs-by-type">
        <div className="flex items-center justify-between mb-3 text-xs">
          <h3 className="font-medium text-gray-400 uppercase tracking-wide">Costs by type</h3>
          {example ? (
            <span className="px-1.5 py-0.5 border border-[#333] text-gray-500">Example</span>
          ) : (
            <span className="text-gray-500">{formatCurrency(total)}</span>
          )}
        </div>
        <ul className={`space-y-2.5 ${example ? 'opacity-50 select-none' : ''}`} aria-hidden={example || undefined}>
          {rows.map((row) => (
            <li key={row.category} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
              <span className="text-gray-300 truncate">{row.category}</span>
              <span className="h-2 bg-[#262626]">
                <span className="block h-2 bg-[#336699]" style={{ width: `${Math.round((row.amount / largest) * 100)}%` }} />
              </span>
              <span className="font-mono tabular-nums text-white text-right w-36">
                {formatCurrency(row.amount)}
                <span className="text-gray-500"> · {Math.round((row.amount / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
        {example ? (
          <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-400">Log costs as you go to see where the money goes and what the job makes.</span>
            <button type="button" onClick={onAdd} className="flex-shrink-0 px-3 py-1.5 bg-[#336699] hover:bg-[#2a5580] text-white">
              Add a cost
            </button>
          </div>
        ) : (
          budget > 0 && (
            <div className="mt-4 pt-3 border-t border-[#262626]" data-testid="budget">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-gray-400">Budget {formatCurrency(budget)}</span>
                <span className={left >= 0 ? 'text-gray-300' : 'text-red-400'}>
                  {left >= 0 ? `${formatCurrency(left)} left` : `${formatCurrency(-left)} over`}
                </span>
              </div>
              <div className="h-1.5 bg-[#262626]">
                <div
                  className={`h-1.5 ${left >= 0 ? 'bg-[#336699]' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, Math.round((total / budget) * 100))}%` }}
                />
              </div>
            </div>
          )
        )}
      </section>

      {!example && (
        <section className="bg-[#1a1a1a] border border-[#333]" aria-label="Recent costs">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 text-xs">
            <h3 className="font-medium text-gray-400 uppercase tracking-wide">Recent costs</h3>
            <button type="button" onClick={onOpen} className="text-[#336699] hover:text-white">
              See all
            </button>
          </div>
          <ul className="divide-y divide-[#262626]">
            {recent.map((e) => (
              <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-white">{e.description}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {[e.category, e.vendor, shortDate(e.date)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={`text-xs capitalize ${PAID_PILL[paymentState(e.status)]}`}>{paymentState(e.status)}</span>
                <span className="font-mono tabular-nums text-white">{formatCurrency(e.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

const secondaryAction =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-200 bg-[#1E1E1E] border border-[#333] hover:bg-[#2a2a2a] transition-colors';

/** Client, budget, dates and description, each saved as you leave it. */
const ProjectFields: React.FC<{ project: Project; organizationId: string; onSaved: (project: Project) => void }> = ({
  project,
  organizationId,
  onSaved,
}) => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const { draft, set, choose, commit, state, error } = useNoteFields<Draft>(draftOf(project), async (patch) =>
    onSaved(await ProjectService.update(project.id!, patch as Partial<Project>)),
  );

  useEffect(() => {
    ClientService.list(organizationId)
      .then(setClients)
      .catch(() => setClients([]));
  }, [organizationId]);

  return (
    <section className="bg-[#1a1a1a] border border-[#333] p-4" aria-label="Details">
      <div className="flex items-center justify-between mb-2 text-xs">
        <h3 className="font-medium text-gray-400 uppercase tracking-wide">Details</h3>
        <SaveStatus state={state} />
      </div>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      <div className="space-y-0.5">
        <NoteRow icon={User} label="Client">
          <select
            value={draft.client_id}
            onChange={(e) => choose('client_id', e.target.value)}
            aria-label="Client"
            className={`${noteSelect} ${draft.client_id ? '' : 'text-gray-600'}`}
          >
            <option value="">No client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company_name ? `${client.company_name} (${client.name})` : client.name}
              </option>
            ))}
          </select>
          {draft.client_id && (
            <button
              type="button"
              onClick={() => navigate(`/clients/${draft.client_id}`)}
              className="p-1 text-gray-500 hover:text-white"
              aria-label="Open client"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </NoteRow>
        <NoteRow icon={DollarSign} label="Budget">
          {draft.budget && <span className="-mr-1.5 text-[15px] text-gray-400">$</span>}
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={draft.budget}
            onChange={set('budget')}
            onBlur={() => commit('budget')}
            placeholder="Add budget"
            aria-label="Budget"
            className={noteInput}
          />
        </NoteRow>
        <NoteRow icon={CalendarDays} label="Start">
          <NoteDate value={draft.start_date} onChange={(value) => choose('start_date', value)} label="Start date" />
        </NoteRow>
        <NoteRow icon={CalendarCheck} label="End">
          <NoteDate value={draft.end_date} onChange={(value) => choose('end_date', value)} label="End date" />
        </NoteRow>
      </div>
      <div className="mt-3 pt-3 border-t border-[#262626]">
        <textarea
          value={draft.description}
          onChange={set('description')}
          onBlur={() => commit('description')}
          placeholder="What's the job? Scope, access, anything worth remembering…"
          aria-label="Description"
          className={noteTextarea}
        />
      </div>
    </section>
  );
};

/**
 * One project, laid out like an estimate: a header with its status, tabs,
 * an overview of what it's worth, what it has cost and what it makes, and
 * those numbers pinned along the bottom.
 */
export const ProjectPanel: React.FC<{
  projectId: string;
  onClose: () => void;
  /** A saved change, so the list behind can show it. */
  onSaved?: (project: Project) => void;
  onDeleted?: (id: string) => void;
  /** Changes whenever an estimate opened from this project closes, so the estimates are read again. */
  estimatesRevision?: number;
}> = ({ projectId, onClose, onSaved, onDeleted, estimatesRevision = 0 }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedOrg } = useContext(OrganizationContext);
  const orgId: string | undefined = selectedOrg?.id;
  // ?tab=estimates (a refresh, a link) starts on that tab, as does opening straight onto one of the
  // project's estimates; after that the tab is just state here.
  const onEstimate = useMatch('/projects/:id/estimates/:estimateId') !== null;
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const wanted = searchParams.get('tab');
    return onEstimate ? 'estimates' : isTab(wanted) ? wanted : 'overview';
  });
  const [addingExpense, setAddingExpense] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  // What the client has paid so far on the project's signed estimates.
  const [collected, setCollected] = useState<{ paid: number; due: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const { toast, show: showToast } = useToast();
  const [tasks, setTasks] = useState<ProjectTask[] | null>(null);
  const [openTasks, setOpenTasks] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [found, expenseRows] = await Promise.all([ProjectService.getById(projectId), ExpenseService.list(orgId, projectId).catch(() => [])]);
        if (cancelled) return;
        setProject(found);
        setExpenses(expenseRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, orgId]);

  // Read again after an estimate opened from here closes: its status or total may have changed.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    EstimateService.getByProject(projectId, orgId)
      .catch(() => [])
      .then((rows) => !cancelled && setEstimates(rows));
    return () => {
      cancelled = true;
    };
  }, [projectId, orgId, estimatesRevision]);

  useEffect(() => {
    let live = true;
    invoicesAPI
      .forProject(projectId)
      .then((money) => live && setCollected(money))
      .catch(() => live && setCollected(null));
    return () => {
      live = false;
    };
  }, [projectId, estimates]);

  // The next few open tasks, for the Overview; reloaded when the Tasks tab changes the count.
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => tasksAPI.forProject(projectId))
      .then((rows) => {
        if (!live) return;
        setTasks(rows);
        setOpenTasks(rows.filter((t) => !t.done).length);
      })
      .catch(() => live && setTasks([]));
    return () => {
      live = false;
    };
  }, [projectId, activeTab]);

  useEffect(() => {
    if (!project?.client_id) {
      setClient(null);
      return;
    }
    ClientService.getById(project.client_id)
      .then(setClient)
      .catch(() => setClient(null));
  }, [project?.client_id]);

  const saved = (next: Project) => {
    setProject(next);
    onSaved?.(next);
  };

  const changeStatus = async (status: ProjectStatus) => {
    if (!project?.id) return;
    const before = project;
    setProject({ ...project, status });
    try {
      saved(await ProjectService.updateStatus(project.id, status));
    } catch (err) {
      setProject(before);
      alert(err instanceof Error ? err.message : 'Could not change the status');
    }
  };

  /** Keeps this job's estimate lines, tasks and length for the next one like it. */
  const saveAsTemplate = async () => {
    setShowMoreMenu(false);
    if (!project?.id) return;
    const name = window.prompt(
      'Name this template. It keeps the estimate lines, the tasks and how long the job takes.',
      project.category || project.name,
    );
    if (!name?.trim()) return;
    try {
      const template = await templatesAPI.saveFromProject(project.id, name.trim());
      showToast(`Saved “${template.name}”. Pick it under Template when starting a project.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the template');
    }
  };

  const deleteProject = async () => {
    setShowMoreMenu(false);
    if (!project?.id || !window.confirm(`Delete “${project.name}” and its expenses? Its estimates stay.`)) return;
    try {
      await ProjectService.delete(project.id);
      onDeleted?.(project.id);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete the project');
    }
  };

  const openExpenses = (add: boolean) => {
    setAddingExpense(add);
    setActiveTab('expenses');
  };

  if (loading && !project) {
    return (
      <div className="h-full bg-[#000000] flex flex-col" aria-busy="true">
        <div className="bg-[#1a1a1a] border-b border-[#333] px-3 py-4">
          <div className="h-6 w-48 bg-[#262626] animate-pulse" />
        </div>
        <div className="p-4">
          <div className="h-20 bg-[#1a1a1a] border border-[#333] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!project || !orgId) {
    return (
      <div className="h-full bg-[#000000] flex flex-col items-center justify-center gap-3 text-sm">
        <p className="text-white">Project not found</p>
        <button onClick={onClose} className="text-[#336699] hover:underline">
          Back to projects
        </button>
      </div>
    );
  }

  const status = projectStatusInfo(project.status);
  const summary = summarize(expenses);
  const budget = project.budget ?? 0;
  const contract = (estimates ?? []).filter((e) => e.status === 'accepted').reduce((sum, e) => sum + e.total_amount, 0);
  // Profit is what the client agreed to pay, less what the job has cost so far.
  const profit = contract - summary.total;
  const margin = contract > 0 ? Math.round((profit / contract) * 100) : null;
  const spentShare = budget > 0 ? Math.min(100, Math.round((summary.total / budget) * 100)) : 0;
  const clientLabel = client ? client.company_name || client.name : project.client?.name;
  const place = client ? [client.address, client.city].filter(Boolean).join(', ') : '';
  const nextUp = (tasks ?? []).filter((t) => !t.done).slice(0, 3);

  const tabs: Array<{ id: TabType; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks', count: openTasks },
    { id: 'estimates', label: 'Estimates', count: estimates?.length ?? 0 },
    { id: 'expenses', label: 'Expenses', count: summary.count },
    { id: 'photos', label: 'Photos' },
  ];

  return (
    <div className="h-full bg-[#000000] flex flex-col">
      <div className="sticky top-0 z-30 bg-[#1a1a1a] border-b border-[#333333] flex-shrink-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-[#333333] transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
            <h1 className="text-xl font-semibold text-white truncate">{project.name}</h1>
            {/* The status, as a tag; the real picker sits invisibly on top. */}
            <label className={`relative flex-shrink-0 text-xs px-3 py-1 font-medium uppercase cursor-pointer ${status.pill}`}>
              {status.label}
              <select
                value={project.status}
                onChange={(e) => changeStatus(e.target.value as ProjectStatus)}
                aria-label="Status"
                className="absolute inset-0 opacity-0 cursor-pointer text-base"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {client?.phone && (
              <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} className={secondaryAction}>
                <Phone className="w-4 h-4" />
                Call
              </a>
            )}
            {client?.email && (
              <a href={`mailto:${client.email}`} className={`${secondaryAction} px-2.5`} aria-label="Email client">
                <Mail className="w-4 h-4" />
              </a>
            )}
            <div className="relative">
              <button onClick={() => setShowMoreMenu((open) => !open)} aria-label="More actions" className={`${secondaryAction} px-2.5`}>
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-[#1E1E1E] border border-[#333333] shadow-lg z-50 py-1">
                    <button onClick={saveAsTemplate} className="w-full flex items-center px-3 py-2.5 text-sm text-gray-200 hover:bg-[#333333]">
                      <LayoutTemplate className="w-4 h-4 mr-3" />
                      Save as template
                    </button>
                    <button onClick={deleteProject} className="w-full flex items-center px-3 py-2.5 text-sm text-red-400 hover:bg-[#333333]">
                      <Trash2 className="w-4 h-4 mr-3" />
                      Delete project
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-sm text-gray-400 px-3 pb-2">
          {clientLabel || 'No client'} • {dates(project)}
        </div>
        <div className="border-t border-[#333333] flex items-center" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => (tab.id === 'expenses' ? openExpenses(false) : setActiveTab(tab.id))}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-white border-[#336699] bg-[#336699]/10'
                  : 'text-gray-400 border-transparent hover:text-white hover:bg-[#2a2a2a]'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="ml-1.5 text-xs text-gray-500">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="p-4 space-y-4">
            {/* What it's worth, what it has cost, what it makes */}
            <div className="bg-[#1a1a1a] border border-[#333] grid grid-cols-3 divide-x divide-[#333]" data-testid="project-summary">
              <div className="p-4 min-w-0">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Contract</div>
                <div className={`text-lg font-semibold truncate ${contract > 0 ? 'text-white' : 'text-gray-500'}`}>
                  {contract > 0 ? formatCurrency(contract) : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {contract <= 0
                    ? 'no accepted estimate'
                    : collected && (collected.paid > 0 || collected.due > 0)
                      ? `${formatCurrency(collected.paid)} collected${collected.due > 0 ? `, ${formatCurrency(collected.due)} due` : ''}`
                      : 'accepted estimates'}
                </div>
              </div>
              <button type="button" onClick={() => openExpenses(false)} className="p-4 min-w-0 text-left hover:bg-[#222]">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Costs</div>
                <div className="text-lg font-semibold text-white truncate">{formatCurrency(summary.total)}</div>
                {budget > 0 ? (
                  <>
                    <div className="text-xs text-gray-500 mt-0.5">of {formatCurrency(budget)} budget</div>
                    <div className="mt-2 h-1 bg-[#333]">
                      <div className={`h-1 ${summary.total > budget ? 'bg-red-400' : 'bg-[#336699]'}`} style={{ width: `${spentShare}%` }} />
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-500 mt-0.5">no budget set</div>
                )}
              </button>
              <div className="p-4 min-w-0">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Profit</div>
                <div
                  className={`text-lg font-semibold truncate ${margin === null ? 'text-gray-500' : profit >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {margin === null ? '—' : formatCurrency(profit)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{margin === null ? 'once an estimate is accepted' : `${margin}% margin`}</div>
              </div>
            </div>

            <ProjectFields key={project.id} project={project} organizationId={orgId} onSaved={saved} />
            <section className="bg-[#1a1a1a] border border-[#333]" aria-label="Next up" data-testid="next-up">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Next up</h3>
                <button type="button" onClick={() => setActiveTab('tasks')} className="text-sm text-[#5b8fc7] hover:text-white">
                  {nextUp.length ? 'All tasks' : 'Add tasks'}
                </button>
              </div>
              {nextUp.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-gray-500">
                  {tasks?.length ? 'Every task is done.' : 'Plan the job in steps with days and crew; they show on your schedule.'}
                </p>
              ) : (
                <ul className="divide-y divide-[#262626] border-t border-[#262626]">
                  {nextUp.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tasks')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#222]"
                      >
                        <span className="flex-1 min-w-0 truncate text-white">{t.title}</span>
                        <span className="text-xs text-gray-500 truncate max-w-[40%]">{t.crew.map((c) => c.name).join(', ')}</span>
                        <span className="text-xs text-gray-400 w-24 text-right">{taskDays(t) || 'No date'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <CostsOverview expenses={expenses} budget={budget} onOpen={() => openExpenses(false)} onAdd={() => openExpenses(true)} />
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="p-4">
            <ProjectTasks projectId={project.id!} organizationId={orgId} place={place} onCount={setOpenTasks} />
          </div>
        )}

        {activeTab === 'estimates' && (
          <div className="p-4">
            {estimates === null ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : estimates.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">No estimates on this project yet.</p>
            ) : (
              <ul className="bg-[#1a1a1a] border border-[#333] divide-y divide-[#262626]" aria-label="Estimates">
                {estimates.map((estimate) => (
                  <li key={estimate.id}>
                    <button
                      onClick={() => navigate(`/projects/${project.id}/estimates/${estimate.id}`)}
                      className="w-full grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-[#222]"
                    >
                      <span className="truncate text-white">
                        {estimate.estimate_number}
                        {estimate.title && <span className="text-gray-500"> · {estimate.title}</span>}
                      </span>
                      <span className={`px-2 py-0.5 text-xs uppercase font-medium ${ESTIMATE_PILL[estimate.status] ?? ESTIMATE_PILL.draft}`}>
                        {estimate.status}
                      </span>
                      <span className="font-mono tabular-nums text-white">{formatCurrency(estimate.total_amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="p-4">
            <ExpensesList projectId={project.id!} onChange={setExpenses} startAdding={addingExpense} />
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="p-4">
            <JobPhotos organizationId={orgId} projectId={project.id!} title="Job photos" />
          </div>
        )}
      </div>

      {/* The job's numbers, always in view, like an estimate's total bar. */}
      <div className="flex-shrink-0 grid grid-cols-4 divide-x divide-[#333] border-t border-[#333] bg-[#1a1a1a] text-sm" data-testid="project-totals">
        <div className="px-4 py-3 text-gray-400">
          {summary.count} cost{summary.count === 1 ? '' : 's'}
        </div>
        <div className="px-4 py-3 text-right">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">Contract</div>
          <div className="font-mono tabular-nums text-white">{contract > 0 ? formatCurrency(contract) : '—'}</div>
        </div>
        <div className="px-4 py-3 text-right">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">{budget > 0 ? `Costs · ${spentShare}% of budget` : 'Costs'}</div>
          <div className="font-mono tabular-nums text-white">{formatCurrency(summary.total)}</div>
        </div>
        <div className="px-4 py-3 text-right">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">Profit{margin !== null ? ` · ${margin}%` : ''}</div>
          <div className={`font-mono tabular-nums ${margin === null ? 'text-gray-500' : profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {margin === null ? '—' : formatCurrency(profit)}
          </div>
        </div>
      </div>
      <Toast text={toast} />
    </div>
  );
};

/** A project in a drawer over the projects list, like an estimate over the estimates list. */
export const ProjectDetailsDrawer: React.FC<{
  projectId: string;
  onClose: () => void;
  onSaved?: (project: Project) => void;
  onDeleted?: (id: string) => void;
  /** An estimate drawer is open on top: Esc and the backdrop belong to it, not to this one. */
  covered?: boolean;
  estimatesRevision?: number;
}> = ({ projectId, onClose, onSaved, onDeleted, covered = false, estimatesRevision }) => {
  const { shown, slideOut } = useSlideIn();
  const close = () => slideOut(onClose);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (covered) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      // A photo open full screen (or anything else on top) takes the Esc; the drawer stays.
      if (e.key === 'Escape' && !e.defaultPrevented && !typing && !dialogOnTopOf(panel.current)) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      <div
        ref={panel}
        role="dialog"
        aria-label="Project"
        aria-hidden={covered || undefined}
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[720px] max-w-full bg-[#000000] shadow-xl transform transition-transform z-[10001] flex flex-col overflow-hidden ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <ProjectPanel
          key={projectId}
          projectId={projectId}
          onClose={close}
          onSaved={onSaved}
          onDeleted={onDeleted}
          estimatesRevision={estimatesRevision}
        />
      </div>
    </>,
    document.body,
  );
};
