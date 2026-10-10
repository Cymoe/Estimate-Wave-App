import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, FolderOpen, MoreVertical, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { ProjectService, type Project, type ProjectStatus } from '../../services/ProjectService';
import { ProjectExportService } from '../../services/ProjectExportService';
import { formatCurrency } from '../../utils/format';
import { TableSkeleton } from '../skeletons/TableSkeleton';
import { PROJECT_STATUSES, formatProjectDate, projectStatusInfo } from './projectStatus';
import { CreateProjectWizard } from './CreateProjectWizard';

/** Project, client, status, dates, budget: shared by the header and every row. */
const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_6.5rem_minmax(9rem,1.2fr)_minmax(6rem,1fr)] gap-4 items-center';

type SortField = 'name' | 'client' | 'start' | 'budget';

const clientName = (p: Project) => p.client?.company_name || p.client?.name || '';

export const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [sortField, setSortField] = useState<SortField>('start');
  const [sortAsc, setSortAsc] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  // ?new=1 (the + menu) opens the new-project wizard.
  const [searchParams] = useSearchParams();
  const creating = searchParams.get('new') === '1';

  useEffect(() => {
    const handler = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    if (!selectedOrg?.id) return;
    let cancelled = false;
    setLoading(true);
    ProjectService.list(selectedOrg.id)
      .then((list) => !cancelled && setProjects(list))
      .catch((error) => console.error('Error loading projects:', error))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedOrg?.id]);

  useEffect(() => {
    if (!showOptions) return;
    const close = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) setShowOptions(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showOptions]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of projects) out[p.status] = (out[p.status] || 0) + 1;
    return out;
  }, [projects]);

  const shown = useMemo(() => {
    const list = projects.filter(
      (p) =>
        (statusFilter === 'all' || p.status === statusFilter) &&
        (!search || [p.name, clientName(p), p.description, p.category].some((v) => v?.toLowerCase().includes(search))),
    );
    const dir = sortAsc ? 1 : -1;
    return list.sort((a, b) => {
      switch (sortField) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'client':
          return clientName(a).localeCompare(clientName(b)) * dir;
        case 'budget':
          return ((a.budget ?? 0) - (b.budget ?? 0)) * dir;
        default:
          return (a.start_date || a.created_at || '').localeCompare(b.start_date || b.created_at || '') * dir;
      }
    });
  }, [projects, statusFilter, search, sortField, sortAsc]);

  const sortBy = (field: SortField) => {
    if (field === sortField) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(field === 'name' || field === 'client');
    }
  };

  const exportAs = async (format: 'csv' | 'excel') => {
    setShowOptions(false);
    if (!selectedOrg?.id) return;
    try {
      await ProjectExportService.export(
        shown.map((p) => ({ ...p, client_name: clientName(p) })),
        { format, organizationId: selectedOrg.id },
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Export failed');
    }
  };

  const openBudget = projects
    .filter((p) => p.status === 'active' || p.status === 'planned')
    .reduce((sum, p) => sum + (p.budget ?? 0), 0);

  const dates = (p: Project) => {
    const start = formatProjectDate(p.start_date);
    const end = formatProjectDate(p.end_date);
    if (start && end) return `${start} – ${end}`;
    return start || (end ? `Ends ${end}` : '—');
  };

  return (
    <div className="bg-transparent border border-[#333333] flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-[#333333]/50 flex items-center gap-3">
        <label className="relative flex-1 max-w-md min-w-[10rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search projects, clients…"
            aria-label="Search projects"
            className="w-full bg-[#1E1E1E] border border-[#333333] rounded-[4px] pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
          />
        </label>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | ProjectStatus)}
            aria-label="Status"
            className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699] appearance-none pr-10 min-w-[180px]"
          >
            <option value="all">All Projects ({projects.length})</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} ({counts[s.value] || 0})
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative ml-auto" ref={optionsRef}>
          <button
            onClick={() => setShowOptions(!showOptions)}
            aria-label="More"
            className="p-2 bg-[#1E1E1E] border border-[#333333] hover:bg-[#333333] rounded-[4px] transition-colors text-gray-400"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showOptions && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-[#1E1E1E] border border-[#333333] rounded-[4px] shadow-lg z-50 py-1">
              <button
                onClick={() => exportAs('csv')}
                className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#333333] transition-colors"
              >
                <Download className="w-3 h-3 mr-3 text-gray-400" />
                Export to CSV
              </button>
              <button
                onClick={() => exportAs('excel')}
                className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#333333] transition-colors"
              >
                <FileSpreadsheet className="w-3 h-3 mr-3 text-gray-400" />
                Export to Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 border-b border-[#333333]/50 grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Projects</div>
          <div className="text-lg font-semibold mt-1">{projects.length}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Active</div>
          <div className="text-lg font-semibold text-blue-400 mt-1">{counts.active || 0}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Open budget</div>
          <div className="text-lg font-semibold text-yellow-400 mt-1">{formatCurrency(openBudget)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-[400px] pb-32">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : shown.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No projects found</h3>
            <p className="text-gray-400">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Tap the yellow + and choose Project to create one.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className={`${ROW_GRID} px-4 py-2 border-b border-[#333333]/50 text-[11px] font-medium text-gray-500 uppercase tracking-wider`}>
              {(
                [
                  ['name', 'Project', ''],
                  ['client', 'Client', ''],
                  [null, 'Status', ''],
                  ['start', 'Dates', ''],
                  ['budget', 'Budget', 'justify-end'],
                ] as const
              ).map(([field, label, align]) =>
                field ? (
                  <button
                    key={label}
                    onClick={() => sortBy(field)}
                    className={`flex items-center gap-1 uppercase tracking-wider hover:text-white transition-colors ${align} ${sortField === field ? 'text-white' : ''}`}
                  >
                    {label}
                    {sortField === field && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </button>
                ) : (
                  <span key={label}>{label}</span>
                ),
              )}
            </div>
            {shown.map((project) => {
              const status = projectStatusInfo(project.status);
              const client = clientName(project);
              return (
                <div
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className={`${ROW_GRID} px-4 py-2.5 text-sm hover:bg-[#1A1A1A] transition-colors cursor-pointer border-b border-[#333333]/50 last:border-b-0`}
                >
                  <div className="font-medium text-white truncate">{project.name}</div>
                  <div className={`truncate ${client ? 'text-gray-200' : 'text-gray-500'}`}>{client || 'No client'}</div>
                  <div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${status.pill}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs truncate">{dates(project)}</div>
                  <div className="text-right font-semibold text-white tabular-nums whitespace-nowrap">
                    {project.budget != null ? formatCurrency(project.budget) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <CreateProjectWizard
          onClose={() => navigate('/projects', { replace: true })}
          onProjectCreated={(project) => setProjects((current) => [project, ...current])}
        />
      )}

    </div>
  );
};
