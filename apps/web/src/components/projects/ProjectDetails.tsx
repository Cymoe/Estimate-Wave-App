import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fullAddress } from '../../lib/mapsLinks';
import { AddressLink } from '../common/AddressLink';
import { pointTo } from '../../lib/pointTo';
import { usePageTitle } from '../../lib/pageTitle';
import { estimateStatusLabel } from '../estimates/estimateActions';
import { createPortal } from 'react-dom';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  DollarSign,
  Globe,
  LayoutTemplate,
  MapPin,
  MoreVertical,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { ProjectService, type Project, type ProjectStatus } from '../../services/ProjectService';
import { ClientService, type Client } from '../../services/ClientService';
import { ExpenseService, paymentState, summarize, type Expense } from '../../services/ExpenseService';
import { EstimateService, type Estimate } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';
import { portalAPI, purchaseOrdersAPI, tasksAPI, templatesAPI, type ProjectTask } from '../../lib/api';
import { PortalPreviewSheet } from './PortalPreviewSheet';
import { ExpensesList } from '../expenses/ExpensesList';
import { JobPhotos } from '../common/JobPhotos';
import { ProjectTasks } from './ProjectTasks';
import { ProjectSelections } from './ProjectSelections';
import { ProjectPurchaseOrders, type OrdersSummary } from './ProjectPurchaseOrders';
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
import { askConfirm, notify } from '../common/appDialogs';

type TabType = 'overview' | 'tasks' | 'money' | 'selections' | 'photos';
const TAB_IDS: TabType[] = ['overview', 'tasks', 'money', 'selections', 'photos'];
const isTab = (value: string | null): value is TabType => TAB_IDS.includes(value as TabType);
/** The Money tab's sections; the old ?tab=estimates, orders and expenses links land on them. */
type MoneySection = 'estimates' | 'orders' | 'expenses';
const MONEY_SECTIONS: MoneySection[] = ['estimates', 'orders', 'expenses'];
const isMoneySection = (value: string | null): value is MoneySection => MONEY_SECTIONS.includes(value as MoneySection);

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

const byCategory = (expenses: Expense[]) => {
  const totals = new Map<string, number>();
  for (const e of expenses) totals.set(e.category || 'Other', (totals.get(e.category || 'Other') ?? 0) + e.amount);
  return [...totals.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
};

const shortDate = (iso: string) => formatProjectDate(iso).replace(/, \d{4}$/, '');

const sectionLabel = 'text-xs font-medium text-gray-400 uppercase tracking-wider';

/** The bar's colours, matched by the squares beside each money row. */
const SWATCH = {
  contract: 'bg-green-500/20 border border-green-500/40',
  budget: 'bg-[#336699]',
  spent: 'bg-[#9cc2ea]',
  committed: 'border border-dashed border-gray-500',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A yyyy-mm-dd date as a local day number, so day counts don't drift across time zones. */
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(new Date(y, (m || 1) - 1, d || 1).getTime() / 86_400_000);
};

/** Where the job is in its dates: "Day 7 of 20", "Starts in 3 days", "Ended Nov 16". */
function scheduleText(start: string | undefined, end: string | undefined, today = new Date()): string | null {
  const now = Math.round(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 86_400_000);
  const days = (n: number) => plural(n, 'day');
  if (start) {
    const s = dayNumber(start);
    if (now < s) return s - now === 1 ? 'Starts tomorrow' : `Starts in ${days(s - now)}`;
    if (end) {
      const e = dayNumber(end);
      if (now > e) return `Ended ${shortDate(end)}`;
      return `Day ${now - s + 1} of ${Math.max(1, e - s + 1)}`;
    }
    return `Day ${now - s + 1}`;
  }
  if (end) {
    const e = dayNumber(end);
    if (now > e) return `Ended ${shortDate(end)}`;
    return now === e ? 'Ends today' : `Ends in ${days(e - now)}`;
  }
  return null;
}

/**
 * The profit the job is heading for: what the client agreed to pay, less the
 * cost budget (or what's spent and committed, once that's more), with a bar
 * from $0 to the contract showing the budget and what's gone so far.
 */
const ProfitSummary: React.FC<{ contract: number; budget: number; spent: number; committed: number }> = ({
  contract,
  budget,
  spent,
  committed,
}) => {
  const soFar = spent + committed;
  const basis = budget > 0 ? Math.max(budget, soFar) : soFar;
  const profit = contract - basis;
  const margin = contract > 0 ? Math.round((profit / contract) * 100) : null;
  const caption =
    contract <= 0
      ? 'Once an estimate is accepted, its total is the contract and the profit shows here.'
      : budget <= 0
        ? 'The contract less what’s spent and committed. Add a cost budget to project it.'
        : soFar > budget
          ? 'Spent and committed are past the cost budget, so this counts them instead.'
          : 'If the job comes in on its cost budget.';
  const scale = Math.max(contract, budget, soFar, 1);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  return (
    <div className="px-4 py-5" data-testid="project-summary">
      <div className="text-sm text-gray-400">{budget > 0 ? 'Projected profit' : 'Profit so far'}</div>
      <div className="mt-1 flex items-baseline gap-3 flex-wrap">
        <span
          className={`text-4xl font-semibold tabular-nums ${margin === null ? 'text-gray-500' : profit >= 0 ? 'text-green-400' : 'text-red-400'}`}
        >
          {margin === null ? '—' : formatCurrency(Math.round(profit)).replace(/\.00$/, '')}
        </span>
        {margin !== null && <span className="text-base text-gray-300">{margin}% margin</span>}
      </div>
      <p className="mt-1 text-sm text-gray-500">{caption}</p>
      {contract > 0 && (
        <div className="mt-4" aria-hidden="true">
          <div className="relative h-3 bg-[#262626]" data-testid="profit-bar">
            <div className={`absolute inset-y-0 left-0 ${SWATCH.contract}`} style={{ width: pct(contract) }} />
            {budget > 0 && <div className={`absolute inset-y-0 left-0 ${SWATCH.budget}`} style={{ width: pct(budget) }} />}
            {committed > 0 && (
              // Striped, like the dashed square beside Committed: ordered, not yet paid.
              <div
                className="absolute inset-y-0"
                style={{
                  left: pct(spent),
                  width: pct(committed),
                  backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 2px, transparent 2px 5px)',
                }}
                data-testid="committed-bar"
              />
            )}
            {spent > 0 && <div className={`absolute inset-y-0 left-0 ${SWATCH.spent}`} style={{ width: pct(spent) }} />}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-gray-500 tabular-nums">
            <span>$0</span>
            <span>Contract {formatCurrency(Math.round(contract)).replace(/\.00$/, '')}</span>
          </div>
        </div>
      )}
    </div>
  );
};

/** One money row on the Overview: a square matching the bar, the name and what's behind it, the amount. */
const MoneyRow: React.FC<{
  swatch?: string;
  label: string;
  detail?: string;
  amount: React.ReactNode;
  strong?: boolean;
  onOpen?: () => void;
  testId?: string;
}> = ({ swatch, label, detail, amount, strong, onOpen, testId }) => {
  const body = (
    <>
      <span className={`w-3 h-3 flex-shrink-0 ${swatch ?? ''}`} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className={`block ${strong ? 'text-gray-300' : 'text-white'}`}>{label}</span>
        {detail && <span className="block text-xs text-gray-500 truncate">{detail}</span>}
      </span>
      <span className={`tabular-nums text-right ${strong ? 'font-semibold' : ''}`}>{amount}</span>
    </>
  );
  const row = 'w-full min-h-[56px] flex items-center gap-3 py-3 text-left text-[15px]';
  return (
    <li data-testid={testId}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className={`${row} hover:bg-[#1a1a1a]`}>
          {body}
        </button>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
};

/** Spent by type: a bar for each kind of cost, longest first. */
const SpentByType: React.FC<{ expenses: Expense[] }> = ({ expenses }) => {
  const rows = byCategory(expenses);
  const largest = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <section className="px-4 py-5" aria-label="Spent by type" data-testid="costs-by-type">
      <h3 className={`${sectionLabel} mb-3`}>Spent by type</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing spent yet. Costs show here by type as they’re logged.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.category} className="grid grid-cols-[7rem_1fr_auto] items-center gap-4 text-[15px]">
              <span className="text-white truncate">{row.category}</span>
              <span className="h-1.5 bg-[#262626]">
                <span className="block h-1.5 bg-[#336699]" style={{ width: `${Math.round((row.amount / largest) * 100)}%` }} />
              </span>
              <span className="tabular-nums text-white text-right">{formatCurrency(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
    <section className="px-4 py-5" aria-label="Details">
      <div className="flex items-center justify-between mb-2 text-xs">
        <h3 className={sectionLabel}>Details</h3>
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
  // ?tab=money (a refresh, a link) starts on that tab, as does opening straight onto one of the
  // project's estimates; after that the tab is just state here. ?tab=estimates, orders and
  // expenses (the tabs Money replaced) open Money on that section.
  const onEstimate = useMatch('/projects/:id/estimates/:estimateId') !== null;
  // Opened on top of one of its estimates (from the estimates page): that estimate is right behind.
  const estimateBehind = useMatch('/estimates/:id/project/:projectId')?.params.id;
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const wanted = searchParams.get('tab');
    return onEstimate || isMoneySection(wanted) ? 'money' : isTab(wanted) ? wanted : 'overview';
  });
  const root = useRef<HTMLDivElement>(null);
  /** Money, scrolled to one of its sections, which is outlined for a moment. */
  const openMoney = useCallback((section: MoneySection) => {
    setActiveTab('money');
    pointTo(() => root.current?.querySelector(`[data-testid="money-${section}"]`));
  }, []);
  useEffect(() => {
    const wanted = searchParams.get('tab');
    if (!onEstimate && isMoneySection(wanted) && wanted !== 'estimates') openMoney(wanted);
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The copy from the projects list (or the last visit) shows at once; the fresh one replaces it.
  const [project, setProject] = useState<Project | null>(() => ProjectService.cached(projectId) ?? null);
  usePageTitle(project?.name);
  const [client, setClient] = useState<Client | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [estimates, setEstimates] = useState<Estimate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const { toast, show: showToast } = useToast();
  const [tasks, setTasks] = useState<ProjectTask[] | null>(null);
  const [openTasks, setOpenTasks] = useState<number | undefined>(undefined);
  const [selectionsToDo, setSelectionsToDo] = useState<number | undefined>(undefined);

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

  // Read again after an estimate opened from here closes (its status or total may have changed),
  // and after one is added here.
  const [estimatesAdded, setEstimatesAdded] = useState(0);
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    EstimateService.getByProject(projectId, orgId)
      .catch(() => [])
      .then((rows) => !cancelled && setEstimates(rows));
    return () => {
      cancelled = true;
    };
  }, [projectId, orgId, estimatesRevision, estimatesAdded]);

  // Estimates made before this project, not yet on any project: this client's first.
  const [unfiled, setUnfiled] = useState<Estimate[] | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (activeTab !== 'money' || !orgId) return;
    let cancelled = false;
    EstimateService.list(orgId)
      .then((rows) => {
        if (cancelled) return;
        // Only this client's: a project isn't the place to pick from every estimate in the company.
        const clientId = project?.client_id;
        setUnfiled(
          clientId
            ? rows.filter((e) => !e.project_id && e.client_id === clientId).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
            : [],
        );
      })
      .catch(() => !cancelled && setUnfiled([]));
    return () => {
      cancelled = true;
    };
  }, [activeTab, orgId, estimatesAdded, project?.client_id]);
  // A new estimate on this project, for its client, opened over the project to fill in.
  const [creatingEstimate, setCreatingEstimate] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [showUnfiled, setShowUnfiled] = useState(false);
  const newEstimate = async () => {
    if (!orgId || !project?.id) return;
    setCreatingEstimate(true);
    setEstimateError(null);
    try {
      const created = await EstimateService.create({
        organization_id: orgId,
        project_id: project.id,
        client_id: project.client_id,
        title: `${project.name} - Estimate`,
        status: 'draft',
        items: [],
      } as Parameters<typeof EstimateService.create>[0]);
      setEstimatesAdded((n) => n + 1);
      navigate(`/projects/${project.id}/estimates/${created.id}`);
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : 'The estimate couldn’t be made');
    } finally {
      setCreatingEstimate(false);
    }
  };
  const addEstimate = async (estimateId: string) => {
    setAdding(true);
    try {
      await EstimateService.update(estimateId, { project_id: projectId });
      setEstimatesAdded((n) => n + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'The estimate couldn’t be added');
    } finally {
      setAdding(false);
    }
  };

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
      notify(err instanceof Error ? err.message : 'Could not change the status');
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
      notify(err instanceof Error ? err.message : 'Could not save the template');
    }
  };

  const deleteProject = async () => {
    setShowMoreMenu(false);
    if (!project?.id || !(await askConfirm({ title: `Delete “${project.name}” and its expenses?`, message: 'Its estimates stay.', confirmLabel: 'Delete' }))) return;
    try {
      await ProjectService.delete(project.id);
      onDeleted?.(project.id);
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the project');
    }
  };

  // The client portal for this project's client: see it, send what's waiting, turn off.
  const [portal, setPortal] = useState<Awaited<ReturnType<typeof portalAPI.forProject>>>(null);
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalRevision, setPortalRevision] = useState(0);
  const refreshPortal = useCallback(() => setPortalRevision((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    portalAPI
      .forProject(projectId)
      .then((p) => live && setPortal(p))
      .catch(() => live && setPortal(null));
    return () => {
      live = false;
    };
  }, [projectId, portalRevision, estimatesRevision, estimatesAdded]);

  // Purchase orders: how many are open and what's committed (ordered, not yet received), for the tab and the totals.
  const [orders, setOrders] = useState<OrdersSummary | null>(null);
  useEffect(() => {
    let live = true;
    purchaseOrdersAPI
      .forProject(projectId)
      .then((data) => {
        if (!live) return;
        const open = data.orders.filter((o) => o.status === 'draft' || o.status === 'ordered').length;
        const ordered = data.orders.filter((o) => o.status === 'ordered').length;
        setOrders({ open, ordered, committed: data.committed, received: data.received });
      })
      .catch(() => live && setOrders(null));
    return () => {
      live = false;
    };
  }, [projectId]);
  const reloadExpenses = useCallback(() => {
    if (orgId) ExpenseService.list(orgId, projectId).then(setExpenses).catch(() => {});
  }, [orgId, projectId]);

  // Whether the tab row runs past the right edge (it scrolls sideways on a phone).
  const tabRow = useRef<HTMLDivElement>(null);
  const [moreTabs, setMoreTabs] = useState(false);
  const checkTabs = useCallback(() => {
    const row = tabRow.current;
    setMoreTabs(Boolean(row && row.scrollLeft + row.clientWidth < row.scrollWidth - 4));
  }, []);
  // After every render (tabs come and go with the project's data), and whenever the row resizes.
  useEffect(() => checkTabs());
  const headerShown = Boolean(project);
  useEffect(() => {
    if (!headerShown || typeof ResizeObserver === 'undefined' || !tabRow.current) return;
    const watcher = new ResizeObserver(checkTabs);
    watcher.observe(tabRow.current);
    return () => watcher.disconnect();
  }, [checkTabs, headerShown]);

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
  const accepted = (estimates ?? []).filter((e) => e.status === 'accepted');
  const contract = accepted.reduce((sum, e) => sum + e.total_amount, 0);
  const committed = orders?.committed ?? 0;
  const left = budget - summary.total - committed;
  // "2 expenses · 1 pending": how many aren't paid yet, by state.
  const unpaid = (['pending', 'unpaid'] as const)
    .map((state) => [state, expenses.filter((e) => paymentState(e.status) === state).length] as const)
    .filter(([, n]) => n > 0)
    .map(([state, n]) => `${n} ${state}`);
  const schedule = scheduleText(project.start_date, project.end_date);
  /** The Details section's budget or date field, brought into view and focused. */
  const pointToField = (label: string) =>
    pointTo(
      () => root.current?.querySelector('section[aria-label="Details"]'),
      () => root.current?.querySelector<HTMLElement>(`[aria-label="${label}"]`),
    );
  const clientLabel = client ? client.company_name || client.name : project.client?.name;
  const place = client ? fullAddress(client.address, client.city, client.state, client.zip) : '';
  const nextUp = (tasks ?? []).filter((t) => !t.done).slice(0, 3);

  const hasSelections = (estimates ?? []).some((e) => e.contract_locked_at && e.items?.some((item) => item.allowance));
  const tabs: Array<{ id: TabType; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks', count: openTasks },
    // The estimates, purchase orders and expenses, one under the other.
    { id: 'money', label: 'Money' },
    // Selections: once a signed estimate has allowance lines for the client to pick.
    ...(hasSelections ? [{ id: 'selections' as const, label: 'Selections', count: selectionsToDo || undefined }] : []),
    { id: 'photos', label: 'Photos' },
  ];

  return (
    <div ref={root} className="h-full bg-[#000000] flex flex-col">
      <div className="sticky top-0 z-30 bg-[#1a1a1a] border-b border-[#333333] flex-shrink-0">
        {/* On a phone the buttons move to a second line when they don't fit, so the name shows and the menu is in reach. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={onClose} aria-label="Close" className="w-11 h-11 -ml-1 flex items-center justify-center hover:bg-[#333333] transition-colors">
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
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* The job site in Apple Maps */}
            {place && (
              <AddressLink address={place} className={`${secondaryAction} px-2.5`} aria-label={`Open ${place} in Apple Maps`}>
                <MapPin className="w-4 h-4" />
              </AddressLink>
            )}
            {/* The client's portal: exactly what they see, and send what's waiting */}
            <button
              type="button"
              onClick={() => setPortalOpen(true)}
              disabled={!portal}
              title={portal ? `Open ${portal.name}'s portal` : 'Add a client first'}
              className={`${secondaryAction} disabled:opacity-50`}
              data-testid="client-portal-button"
              aria-label={(portal?.queued ?? 0) > 0 ? `Client portal, ${portal!.queued} waiting to send` : 'Client portal'}
            >
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Client portal</span>
              {(portal?.queued ?? 0) > 0 && (
                <span
                  className="ml-1 rounded-full bg-[#336699] px-1.5 text-[11px] leading-5 text-white"
                  aria-label={`${portal!.queued} waiting to send`}
                >
                  {portal!.queued}
                </span>
              )}
            </button>
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
          {/* The client's name opens their page: Call, Text, Email and the address are there. */}
          {client?.id && clientLabel ? (
            <button
              type="button"
              onClick={() => navigate(`/clients/${client.id}`)}
              className="text-gray-300 hover:text-white underline-offset-2 hover:underline"
              data-testid="project-client-link"
            >
              {clientLabel}
            </button>
          ) : clientLabel ? (
            clientLabel
          ) : project.client_id ? null : (
            // Only with no client at all (not while a client's name loads). It goes to the
            // Overview's Details, brings it into view and outlines it, with the picker focused.
            <button
              type="button"
              onClick={(e) => {
                const panel = e.currentTarget.closest('[role="dialog"]') ?? document;
                setActiveTab('overview');
                pointTo(
                  () => panel.querySelector('section[aria-label="Details"]'),
                  () => panel.querySelector<HTMLSelectElement>('select[aria-label="Client"]'),
                );
              }}
              className="text-[#6aa3d9] hover:text-white underline underline-offset-2"
            >
              Add client
            </button>
          )}
          {clientLabel || !project.client_id ? ' · ' : ''}
          {dates(project)}
        </div>
        {/* On a phone the tabs scroll sideways; a fade at the right edge shows there are more. */}
        <div className="relative border-t border-[#333333]">
        <div ref={tabRow} onScroll={checkTabs} className="flex items-center overflow-x-auto" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
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
        {moreTabs && (
          <div aria-hidden="true" className="tab-fade pointer-events-none absolute inset-y-0 right-0 w-10" data-testid="more-tabs" />
        )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="divide-y divide-[#333333]">
            <ProfitSummary contract={contract} budget={budget} spent={summary.total} committed={committed} />

            {/* Where the money stands: each row opens its part of Money. */}
            <ul className="px-4 py-2 divide-y divide-[#262626]" aria-label="Money" data-testid="money-rows">
              <MoneyRow
                swatch={SWATCH.contract}
                label="Contract"
                detail={accepted.length ? plural(accepted.length, 'accepted estimate') : 'No accepted estimate yet'}
                amount={<span className={contract > 0 ? 'text-white' : 'text-gray-500'}>{contract > 0 ? formatCurrency(contract) : '—'}</span>}
                onOpen={() => openMoney('estimates')}
              />
              <MoneyRow
                swatch={SWATCH.budget}
                label="Cost budget"
                amount={
                  budget > 0 ? (
                    <span className="text-white">{formatCurrency(budget)}</span>
                  ) : (
                    <span className="text-[#5b8fc7]">Add budget</span>
                  )
                }
                onOpen={() => pointToField('Budget')}
              />
              <MoneyRow
                swatch={SWATCH.spent}
                label="Spent"
                detail={summary.count ? [plural(summary.count, 'expense'), ...unpaid].join(' · ') : 'Nothing logged yet'}
                amount={<span className="text-white">{formatCurrency(summary.total)}</span>}
                onOpen={() => openMoney('expenses')}
              />
              <MoneyRow
                swatch={SWATCH.committed}
                label="Committed"
                detail={orders?.ordered ? plural(orders.ordered, 'purchase order') : 'Nothing ordered yet'}
                amount={<span className="text-white">{formatCurrency(committed)}</span>}
                onOpen={() => openMoney('orders')}
                testId="committed"
              />
              {budget > 0 && (
                <MoneyRow
                  label={left >= 0 ? 'Left in budget' : 'Over budget'}
                  amount={<span className={left >= 0 ? 'text-white' : 'text-red-400'}>{formatCurrency(Math.abs(left))}</span>}
                  strong
                  testId="budget-left"
                />
              )}
            </ul>

            <SpentByType expenses={expenses} />

            <section className="px-4 py-2" aria-label="Next up" data-testid="next-up">
              <div className="min-h-[56px] flex items-center justify-between gap-3 py-3 border-b border-[#262626] text-[15px]">
                <span className="text-white">Schedule</span>
                {schedule ? (
                  <span className="text-gray-400 tabular-nums" data-testid="schedule">{schedule}</span>
                ) : (
                  <button type="button" onClick={() => pointToField('Start date')} className="text-[#5b8fc7] hover:text-white">
                    Add dates
                  </button>
                )}
              </div>
              <div className="min-h-[56px] flex items-center justify-between gap-3 py-3 text-[15px]">
                <span className="text-white">Next up</span>
                <span className="flex items-center gap-3">
                  {nextUp.length === 0 && <span className="text-gray-400">{tasks?.length ? 'Every task is done' : 'No tasks yet'}</span>}
                  <button type="button" onClick={() => setActiveTab('tasks')} className="text-[#5b8fc7] hover:text-white">
                    {tasks?.length ? 'All tasks' : 'Add tasks'}
                  </button>
                </span>
              </div>
              {nextUp.length > 0 && (
                <ul className="-mt-1 pb-2 divide-y divide-[#262626]">
                  {nextUp.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tasks')}
                        className="w-full flex items-center gap-3 py-2.5 text-left text-sm hover:bg-[#1a1a1a]"
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

            <ProjectFields key={project.id} project={project} organizationId={orgId} onSaved={saved} />
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="p-4">
            <ProjectTasks projectId={project.id!} organizationId={orgId} place={place} onCount={setOpenTasks} />
          </div>
        )}

        {activeTab === 'selections' && (
          <div className="p-4">
            <ProjectSelections
              projectId={project.id!}
              onEstimatesChanged={() => setEstimatesAdded((n) => n + 1)}
              onCount={setSelectionsToDo}
              portalClientName={portal?.name}
              onQueueChanged={refreshPortal}
              onPreview={portal ? () => setPortalOpen(true) : undefined}
            />
          </div>
        )}

        {activeTab === 'money' && (
          <div className="divide-y divide-[#333333]">
            <section className="px-4 py-5" aria-label="Estimates section" data-testid="money-estimates">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className={sectionLabel}>
                  Estimates
                  {contract > 0 && <span className="ml-2 normal-case tracking-normal text-gray-500">{formatCurrency(contract)} accepted</span>}
                </h3>
                <button
                  type="button"
                  onClick={newEstimate}
                  disabled={creatingEstimate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> {creatingEstimate ? 'Creating…' : 'New estimate'}
                </button>
              </div>
              {estimateError && (
                <p className="mb-3 text-sm text-red-400" role="alert">
                  {estimateError}
                </p>
              )}
              {estimates === null ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : estimates.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No estimates on this project yet. Start one with New estimate.</p>
              ) : (
                <ul className="bg-[#1a1a1a] border border-[#333] divide-y divide-[#262626]" aria-label="Estimates">
                  {estimates.map((estimate) => (
                    <li key={estimate.id}>
                      <button
                        onClick={() =>
                          estimate.id === estimateBehind ? onClose() : navigate(`/projects/${project.id}/estimates/${estimate.id}`)
                        }
                        className="w-full grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-[#222]"
                      >
                        <span className="truncate text-white">
                          {estimate.estimate_number}
                          {estimate.title && <span className="text-gray-500"> · {estimate.title}</span>}
                        </span>
                        <span className={`px-2 py-0.5 text-xs uppercase font-medium ${ESTIMATE_PILL[estimate.status] ?? ESTIMATE_PILL.draft}`}>
                          {estimateStatusLabel(estimate.status)}
                        </span>
                        <span className="font-mono tabular-nums text-white">{formatCurrency(estimate.total_amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Quoted before the project existed: this client's estimates on no project, tucked behind a link. */}
              {unfiled && unfiled.length > 0 && (
                <div className="mt-4">
                  {!showUnfiled ? (
                    <button type="button" onClick={() => setShowUnfiled(true)} className="text-sm text-gray-400 hover:text-white">
                      or add one made before the project ({unfiled.length})
                    </button>
                  ) : (
                    <select
                      aria-label="Add an existing estimate"
                      value=""
                      autoFocus
                      disabled={adding}
                      onChange={(e) => e.target.value && addEstimate(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-sm text-white"
                    >
                      <option value="">{adding ? 'Adding…' : 'Pick one of their estimates'}</option>
                      {unfiled.map((e) => (
                        <option key={e.id} value={e.id}>
                          {[e.estimate_number, e.title, formatCurrency(e.total_amount)].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </section>

            <section className="px-4 py-5" aria-label="Purchase orders section" data-testid="money-orders">
              <h3 className={`${sectionLabel} mb-3`}>Purchase orders</h3>
              <ProjectPurchaseOrders projectId={project.id!} companyName={selectedOrg?.name} onSummary={setOrders} onExpensesChanged={reloadExpenses} shortList={5} />
            </section>

            <section className="px-4 py-5" aria-label="Expenses section" data-testid="money-expenses">
              <h3 className={`${sectionLabel} mb-3`}>
                Expenses
                <span className="ml-2 normal-case tracking-normal text-gray-500">{formatCurrency(summary.total)}</span>
              </h3>
              <ExpensesList projectId={project.id!} onChange={setExpenses} heading={false} />
            </section>
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="p-4">
            <JobPhotos organizationId={orgId} projectId={project.id!} title="Job photos" />
          </div>
        )}
      </div>

      <Toast text={toast} />
      {portalOpen && portal && <PortalPreviewSheet clientId={portal.clientId} onClose={() => setPortalOpen(false)} onChanged={refreshPortal} />}
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
