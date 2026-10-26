import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CalendarCheck, CalendarDays, DollarSign, Mail, MoreVertical, Phone, Trash2, User, X } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { ProjectService, type Project, type ProjectStatus } from '../../services/ProjectService';
import { ClientService, type Client } from '../../services/ClientService';
import { ExpenseService, summarize, type Expense } from '../../services/ExpenseService';
import { EstimateService, type Estimate } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';
import { ExpensesList } from '../expenses/ExpensesList';
import { NoteDate, NoteRow, SaveStatus, noteInput, noteSelect, noteTextarea, useNoteFields, useSlideIn } from '../common/StructuredNote';
import { PROJECT_STATUSES, formatProjectDate, projectStatusInfo } from './projectStatus';

type TabType = 'overview' | 'estimates' | 'expenses';

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
    ClientService.list(organizationId).then(setClients).catch(() => setClients([]));
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
            <button type="button" onClick={() => navigate(`/clients/${draft.client_id}`)} className="p-1 text-gray-500 hover:text-white" aria-label="Open client">
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
 * and an overview of what it's worth, what it has cost and what's left.
 */
export const ProjectPanel: React.FC<{
  projectId: string;
  onClose: () => void;
  /** A saved change, so the list behind can show it. */
  onSaved?: (project: Project) => void;
  onDeleted?: (id: string) => void;
}> = ({ projectId, onClose, onSaved, onDeleted }) => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const orgId: string | undefined = selectedOrg?.id;
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [addingExpense, setAddingExpense] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [found, expenseRows, estimateRows] = await Promise.all([
          ProjectService.getById(projectId),
          ExpenseService.list(orgId, projectId).catch(() => []),
          EstimateService.getByProject(projectId, orgId).catch(() => []),
        ]);
        if (cancelled) return;
        setProject(found);
        setExpenses(expenseRows);
        setEstimates(estimateRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, orgId]);

  useEffect(() => {
    if (!project?.client_id) {
      setClient(null);
      return;
    }
    ClientService.getById(project.client_id).then(setClient).catch(() => setClient(null));
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
  // What's left is measured against what the client agreed to pay, or the budget before there's an agreement.
  const against = contract > 0 ? contract : budget;
  const left = against - summary.total;
  const spentShare = budget > 0 ? Math.min(100, Math.round((summary.total / budget) * 100)) : 0;
  const clientLabel = client ? client.company_name || client.name : project.client?.name;

  const tabs: Array<{ id: TabType; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'estimates', label: 'Estimates', count: estimates?.length ?? 0 },
    { id: 'expenses', label: 'Expenses', count: summary.count },
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
                activeTab === tab.id ? 'text-white border-[#336699] bg-[#336699]/10' : 'text-gray-400 border-transparent hover:text-white hover:bg-[#2a2a2a]'
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
            {/* What it's worth, what it has cost, what's left */}
            <div className="bg-[#1a1a1a] border border-[#333] grid grid-cols-3 divide-x divide-[#333]" data-testid="project-summary">
              <div className="p-4 min-w-0">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Contract</div>
                <div className={`text-lg font-semibold truncate ${contract > 0 ? 'text-white' : 'text-gray-500'}`}>
                  {contract > 0 ? formatCurrency(contract) : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{contract > 0 ? 'accepted estimates' : 'no accepted estimate'}</div>
              </div>
              <button type="button" onClick={() => openExpenses(false)} className="p-4 min-w-0 text-left hover:bg-[#222]">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Spent</div>
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
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Left</div>
                <div className={`text-lg font-semibold truncate ${against <= 0 ? 'text-gray-500' : left >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {against > 0 ? formatCurrency(left) : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {against <= 0 ? 'add a budget or an estimate' : contract > 0 ? 'of the contract' : 'of the budget'}
                </div>
              </div>
            </div>

            <ProjectFields key={project.id} project={project} organizationId={orgId} onSaved={saved} />
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
                      onClick={() => navigate(`/estimates/${estimate.id}`, { state: { closeTo: `/projects/${project.id}` } })}
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
      </div>
    </div>
  );
};

/** A project in a drawer over the projects list, like an estimate over the estimates list. */
export const ProjectDetailsDrawer: React.FC<{
  projectId: string;
  onClose: () => void;
  onSaved?: (project: Project) => void;
  onDeleted?: (id: string) => void;
}> = ({ projectId, onClose, onSaved, onDeleted }) => {
  const { shown, slideOut } = useSlideIn();
  const close = () => slideOut(onClose);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === 'Escape' && !e.defaultPrevented && !typing) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <>
      <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={close} />
      <div
        ref={panel}
        role="dialog"
        aria-label="Project"
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[720px] max-w-full bg-[#000000] shadow-xl transform transition-transform z-[10001] flex flex-col overflow-hidden ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <ProjectPanel key={projectId} projectId={projectId} onClose={close} onSaved={onSaved} onDeleted={onDeleted} />
      </div>
    </>,
    document.body,
  );
};
