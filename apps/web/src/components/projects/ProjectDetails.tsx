import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, DollarSign, Edit, ExternalLink, FileText, Mail, MapPin, MoreVertical, Phone, Plus } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { ProjectService, type Project, type ProjectStatus } from '../../services/ProjectService';
import { ClientService, type Client } from '../../services/ClientService';
import { ExpenseService, summarize, type Expense } from '../../services/ExpenseService';
import { EstimateService, type Estimate } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';
import { ExpensesList } from '../expenses/ExpensesList';
import { ProjectDrawer } from './ProjectDrawer';
import { PROJECT_STATUSES, formatProjectDate, projectStatusInfo } from './projectStatus';

type TabType = 'overview' | 'expenses';

const ESTIMATE_PILL: Record<string, string> = {
  draft: 'bg-gray-500/15 text-gray-300',
  sent: 'bg-blue-500/15 text-blue-300',
  opened: 'bg-purple-500/15 text-purple-300',
  accepted: 'bg-green-500/15 text-green-300',
  rejected: 'bg-red-500/15 text-red-300',
  expired: 'bg-yellow-500/15 text-yellow-300',
};

const DAY = 86_400_000;
const localDay = (iso?: string) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : null;
};
const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};
const shortMoney = (amount: number) =>
  Math.abs(amount) >= 1000 ? `${amount < 0 ? '-' : ''}$${(Math.abs(amount) / 1000).toFixed(1)}K` : formatCurrency(amount);

/**
 * Where the job stands: how it is doing against budget and schedule, what has
 * been spent and paid, its estimates and details.
 */
export function projectHealth(project: Project, spent: number) {
  let score = 100;
  // Over budget costs up to 40 points.
  if (project.budget && spent > project.budget) {
    score -= Math.min(((spent - project.budget) / project.budget) * 100 * 2, 40);
  }
  // Past the end date and not finished costs 20.
  const end = localDay(project.end_date);
  if (end !== null && today() > end && project.status !== 'completed' && project.status !== 'cancelled') score -= 20;
  return Math.max(0, Math.round(score));
}

export const ProjectDetails: React.FC = () => {
  const { id } = useParams();
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
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!id || !orgId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [found, expenseRows, estimateRows] = await Promise.all([
          ProjectService.getById(id),
          ExpenseService.list(orgId, id).catch(() => []),
          EstimateService.getByProject(id, orgId).catch(() => []),
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
  }, [id, orgId]);

  useEffect(() => {
    if (!project?.client_id) {
      setClient(null);
      return;
    }
    ClientService.getById(project.client_id).then(setClient);
  }, [project?.client_id]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.client-dropdown') && !target.closest('.client-dropdown-trigger')) setShowClientDropdown(false);
      if (!target.closest('.more-menu') && !target.closest('.more-menu-trigger')) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const changeStatus = async (status: ProjectStatus) => {
    if (!project?.id) return;
    const before = project;
    setProject({ ...project, status });
    try {
      setProject(await ProjectService.updateStatus(project.id, status));
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
      navigate('/projects');
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
      <div className="max-w-[1600px] mx-auto p-4 md:p-8">
        <div className="h-8 w-64 bg-[#1a1a1a] rounded mb-8 animate-pulse" />
        <div className="h-10 bg-[#1a1a1a] rounded mb-8 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-[#1a1a1a] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-white text-lg mb-4">Project not found</p>
          <button onClick={() => navigate('/projects')} className="text-[#336699] hover:underline">
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  const status = projectStatusInfo(project.status);
  const summary = summarize(expenses);
  const budget = project.budget ?? 0;
  const hasBudget = budget > 0;
  const overBudget = hasBudget && summary.total > budget;
  const spentPercent = hasBudget ? Math.round((summary.total / budget) * 100) : 0;
  const paidPercent = summary.total > 0 ? Math.round((summary.paid / summary.total) * 100) : 0;
  const health = projectHealth(project, summary.total);
  const end = localDay(project.end_date);
  const start = localDay(project.start_date);
  const daysLeft = end !== null ? Math.round((end - today()) / DAY) : null;
  const finished = project.status === 'completed' || project.status === 'cancelled';
  const accepted = (estimates ?? []).filter((e) => e.status === 'accepted').reduce((sum, e) => sum + e.total_amount, 0);

  const tabClass = (tab: TabType) =>
    `flex-1 pb-4 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
      activeTab === tab ? 'text-white after:bg-[#336699]' : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]'
    }`;

  const quickActions = [
    {
      icon: <Plus className="w-5 h-5" />,
      label: 'Add Expense',
      action: () => openExpenses(true),
      colorClass: 'group-hover:text-[#F9D71C]',
      primary: true,
      disabled: false,
    },
    {
      icon: <Phone className="w-5 h-5" />,
      label: 'Contact Client',
      action: () => client?.phone && (window.location.href = `tel:${client.phone.replace(/[^\d+]/g, '')}`),
      colorClass: 'group-hover:text-[#336699]',
      primary: false,
      disabled: !client?.phone,
    },
    {
      icon: <FileText className="w-5 h-5" />,
      label: 'Edit Project',
      action: () => setEditing(true),
      colorClass: 'group-hover:text-[#336699]',
      primary: false,
      disabled: false,
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => navigate('/projects')} className="p-2 hover:bg-[#1a1a1a] rounded transition-colors" aria-label="Back to projects">
              <ArrowLeft className="w-6 h-6 text-gray-500" />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-white mb-1 truncate">{project.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Status, as a pill; the real picker sits invisibly on top. */}
                <label className={`relative inline-flex items-center px-2.5 py-0.5 rounded-full text-sm cursor-pointer ${status.pill}`}>
                  {status.label}
                  <select
                    value={project.status}
                    onChange={(e) => changeStatus(e.target.value as ProjectStatus)}
                    aria-label="Status"
                    className="absolute inset-0 opacity-0 cursor-pointer text-base"
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
                {client ? (
                  <div className="relative">
                    <button
                      onClick={() => setShowClientDropdown(!showClientDropdown)}
                      className="client-dropdown-trigger text-gray-500 hover:text-gray-300 transition-colors underline-offset-2 hover:underline"
                    >
                      {client.company_name || client.name}
                    </button>
                    {showClientDropdown && (
                      <div className="client-dropdown absolute top-full left-0 mt-2 w-64 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg z-50 p-4">
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Client</div>
                            <div className="text-sm font-medium text-white">{client.name}</div>
                          </div>
                          {client.phone && (
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Phone</div>
                              <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} className="text-sm text-[#336699] hover:text-[#5A8BB8] flex items-center gap-2">
                                <Phone className="w-3 h-3" />
                                {client.phone}
                              </a>
                            </div>
                          )}
                          {client.email && (
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Email</div>
                              <a href={`mailto:${client.email}`} className="text-sm text-[#336699] hover:text-[#5A8BB8] break-all flex items-center gap-2">
                                <Mail className="w-3 h-3 flex-shrink-0" />
                                {client.email}
                              </a>
                            </div>
                          )}
                          {client.address && (
                            <div>
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Address</div>
                              <a
                                href={`https://maps.apple.com/?q=${encodeURIComponent([client.address, client.city, client.state].filter(Boolean).join(', '))}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-gray-300 hover:text-white flex items-start gap-2"
                              >
                                <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                {[client.address, client.city].filter(Boolean).join(', ')}
                              </a>
                            </div>
                          )}
                          <div className="border-t border-[#2a2a2a] pt-3 mt-3">
                            <button
                              onClick={() => navigate(`/clients/${client.id}`)}
                              className="w-full text-center text-sm text-[#336699] hover:text-[#5A8BB8] flex items-center justify-center gap-1"
                            >
                              View Full Client Details
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-500">No client assigned</span>
                )}
                {project.category && <span className="text-gray-600 text-sm">{project.category}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-sm hover:bg-[#2a2a2a] transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                aria-label="More"
                className="more-menu-trigger w-10 h-10 flex items-center justify-center border border-[#2a2a2a] rounded-sm hover:bg-[#1a1a1a] transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {showMoreMenu && (
                <div className="more-menu absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm shadow-lg z-50">
                  <button onClick={deleteProject} className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-[#2a2a2a] transition-colors">
                    Delete Project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex justify-between mb-8 border-b border-[#2a2a2a]">
        <button onClick={() => setActiveTab('overview')} className={tabClass('overview')}>
          Overview
        </button>
        <button onClick={() => openExpenses(false)} className={tabClass('expenses')}>
          Expenses
          <span className="text-xs text-gray-500">{summary.count}</span>
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="bg-gradient-to-r from-[#181818] to-[#1a1a1a] rounded-xl p-1 mb-6">
            <div className="grid grid-cols-3 gap-1">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.action}
                  disabled={action.disabled}
                  className={`relative flex flex-col items-center justify-center py-4 px-2 rounded-lg transition-all group disabled:opacity-40 ${
                    action.primary ? 'bg-[#0f1729] border border-[#336699] hover:bg-[#1a2940] hover:border-[#5A8BB8]' : 'bg-[#121212] hover:bg-[#1a1a1a]'
                  }`}
                >
                  <div className={`w-5 h-5 mb-1.5 text-gray-400 ${action.colorClass} transition-colors`}>{action.icon}</div>
                  <span className="text-xs font-medium">{action.label}</span>
                  {action.primary && (
                    <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-[#F9D71C] hidden md:inline">Most Used</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Project health */}
          <section className="bg-[#181818] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Project Health</h2>
              <div
                className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
                  health >= 80 ? 'bg-[#1a3a1a] text-green-400' : health >= 60 ? 'bg-[#3a3a1a] text-yellow-400' : 'bg-[#3a1a1a] text-red-400'
                }`}
              >
                ● {health >= 80 ? `${health}% Healthy` : health >= 60 ? `${health}% Fair` : `${health}% Needs Attention`}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button onClick={() => openExpenses(false)} className="bg-[#121212] rounded-lg p-4 text-center hover:bg-[#1a1a1a] transition-all">
                <div className={`text-lg font-bold mb-1 ${!hasBudget ? 'text-gray-400' : overBudget ? 'text-red-400' : 'text-green-400'}`}>
                  {hasBudget ? shortMoney(budget - summary.total) : '—'}
                </div>
                <div className="text-[11px] text-gray-300 uppercase tracking-wide">
                  {!hasBudget ? 'No Budget Set' : overBudget ? 'Over Budget' : 'Under Budget'}
                </div>
              </button>

              <div className="bg-[#121212] rounded-lg p-4 text-center">
                <div
                  className={`text-lg font-bold mb-1 ${
                    daysLeft === null || finished ? 'text-gray-400' : daysLeft < 0 ? 'text-red-400' : daysLeft <= 3 ? 'text-yellow-400' : 'text-green-400'
                  }`}
                >
                  {finished ? status.label : daysLeft === null ? '—' : daysLeft < 0 ? `${-daysLeft}d late` : `${daysLeft}d`}
                </div>
                <div className="text-[11px] text-gray-300 uppercase tracking-wide">
                  {finished ? 'Status' : daysLeft === null ? 'No End Date' : daysLeft < 0 ? 'Past End Date' : 'Days Left'}
                </div>
              </div>

              <button onClick={() => openExpenses(false)} className="bg-[#121212] rounded-lg p-4 text-center hover:bg-[#1a1a1a] transition-all">
                <div
                  className={`text-lg font-bold mb-1 ${
                    summary.count === 0 ? 'text-gray-400' : paidPercent >= 80 ? 'text-green-400' : paidPercent >= 50 ? 'text-[#F9D71C]' : 'text-red-400'
                  }`}
                >
                  {paidPercent}%
                </div>
                <div className="text-[11px] text-gray-300 uppercase tracking-wide">Expenses Paid</div>
              </button>
            </div>

            {summary.count > 0 && (
              <div className="mt-4 pt-4 border-t border-[#2a2a2a] flex flex-wrap items-center gap-4 text-xs">
                <span className="text-green-400">{formatCurrency(summary.paid)} paid expenses</span>
                <span className="text-[#F9D71C]">{formatCurrency(summary.pending)} pending</span>
                {summary.unpaid > 0 && <span className="text-red-400">{formatCurrency(summary.unpaid)} unpaid</span>}
              </div>
            )}
          </section>

          {/* Budget & expenses */}
          <section className="bg-[#181818] rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider">Budget & Expenses</h3>
              {hasBudget && <span className="text-xs text-gray-500">Budget {formatCurrency(budget)}</span>}
            </div>
            {summary.count > 0 || hasBudget ? (
              <div className="space-y-3">
                <div className="bg-[#121212] rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium mb-1">Total Expenses</div>
                      <div className="text-xs text-gray-500">
                        {summary.count} expense{summary.count !== 1 ? 's' : ''}
                        {hasBudget ? ` • ${spentPercent}% of budget` : ' • no budget set'}
                      </div>
                    </div>
                    <div className={`text-lg font-medium tabular-nums ${overBudget ? 'text-red-400' : 'text-green-400'}`}>
                      {formatCurrency(summary.total)}
                    </div>
                  </div>
                  {hasBudget && (
                    <div className="mt-3 w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${overBudget ? 'bg-red-400' : 'bg-green-400'}`}
                        style={{ width: `${Math.min(spentPercent, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#121212] rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium mb-1 text-green-400">Paid</div>
                      <div className="text-xs text-gray-500">{paidPercent}% of total</div>
                    </div>
                    <div className="text-lg font-medium text-green-400 tabular-nums">{formatCurrency(summary.paid)}</div>
                  </div>
                  <div className="bg-[#121212] rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium mb-1 text-[#F9D71C]">Pending</div>
                      <div className="text-xs text-gray-500">awaiting payment</div>
                    </div>
                    <div className="text-lg font-medium text-[#F9D71C] tabular-nums">{formatCurrency(summary.pending)}</div>
                  </div>
                </div>

                {accepted > 0 && (
                  <div className="bg-[#121212] rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium mb-1">Accepted estimates</div>
                      <div className="text-xs text-gray-500">what the client agreed to pay, less expenses so far</div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-lg font-medium text-white">{formatCurrency(accepted)}</div>
                      <div className={`text-xs ${accepted - summary.total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(accepted - summary.total)} left
                      </div>
                    </div>
                  </div>
                )}

                <button onClick={() => openExpenses(false)} className="w-full bg-[#121212] hover:bg-[#1a1a1a] rounded-lg p-4 text-left transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">View all expenses</span>
                    <span className="text-xs text-[#F9D71C]">→</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="text-center py-8">
                <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">No expenses or budget yet</p>
                <button onClick={() => openExpenses(true)} className="px-4 py-2 bg-white hover:bg-gray-100 text-black rounded-[8px] text-sm font-medium">
                  Add First Expense
                </button>
              </div>
            )}
          </section>

          {/* Estimates */}
          <section className="bg-[#181818] rounded-xl p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Estimates</h3>
            {estimates === null ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : estimates.length === 0 ? (
              <p className="text-center py-6 text-gray-500 text-sm">No estimates for this project yet</p>
            ) : (
              <div className="space-y-2">
                {estimates.map((estimate) => (
                  <button
                    key={estimate.id}
                    onClick={() => navigate(`/estimates/${estimate.id}`)}
                    className="w-full grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-[#121212] hover:bg-[#1a1a1a] rounded-lg p-4 text-left text-sm"
                  >
                    <span className="truncate text-white">
                      {estimate.estimate_number}
                      {estimate.title && <span className="text-gray-500"> · {estimate.title}</span>}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${ESTIMATE_PILL[estimate.status] ?? ESTIMATE_PILL.draft}`}>
                      {estimate.status}
                    </span>
                    <span className="tabular-nums text-white">{formatCurrency(estimate.total_amount)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Project details */}
          <section className="bg-[#181818] rounded-xl p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-6">Project Details</h3>
            <div className="mb-6">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Description</div>
              <div className={project.description ? 'text-white whitespace-pre-wrap' : 'text-gray-500'}>
                {project.description || 'No description yet'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Start Date</div>
                <div className="text-white">{formatProjectDate(project.start_date) || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">End Date</div>
                <div className="text-white">{formatProjectDate(project.end_date) || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Duration</div>
                <div className="text-white">
                  {start !== null && end !== null ? `${Math.round((end - start) / DAY)} days` : '—'}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 md:p-6">
          <ExpensesList projectId={project.id!} onChange={setExpenses} startAdding={addingExpense} />
        </div>
      )}

      {editing && orgId && (
        <ProjectDrawer
          organizationId={orgId}
          project={project}
          onClose={() => setEditing(false)}
          onSaved={setProject}
          onDeleted={() => navigate('/projects')}
        />
      )}
    </div>
  );
};

export default ProjectDetails;
