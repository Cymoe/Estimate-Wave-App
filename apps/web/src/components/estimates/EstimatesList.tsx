import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  FileText, Filter, MoreVertical, Plus, Search,
  Eye, Edit, Send, CheckCircle,
  XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Download, FileSpreadsheet
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EstimateService, Estimate } from '../../services/EstimateService';
import { OrganizationContext, LayoutContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';
import { advancedSearch, SearchableField } from '../../utils/searchUtils';
import { TableSkeleton } from '../skeletons/TableSkeleton';
import { EstimateExportService } from '../../services/EstimateExportService';
import { EstimateActionsMenu, EstimateAction } from './EstimateActionsMenu';
import { confirmApproval, copyText, duplicateEstimate, estimateStatusLabel, sendEstimateLink } from './estimateActions';
import { createPortal } from 'react-dom';
import { Toast, useToast } from '../common/Notice';
import { isPlaceholderTitle } from '../../../convex/lib/jobName';
import { notify } from '../common/appDialogs';

/** Estimate, client, status, date, amount: shared by the header and every row. */
const ROW_GRID = 'grid grid-cols-[minmax(8.5rem,1fr)_minmax(0,2fr)_6.5rem_7rem_minmax(7rem,1fr)] gap-4 items-center';

/** "Waiting" covers both sent and opened: the client has it and hasn't answered. */
type StatusFilter = 'all' | 'waiting' | Estimate['status'];
type DateRange = 'all' | '7d' | '30d' | '90d';
const RANGE_DAYS: Record<DateRange, number> = { all: 0, '7d': 7, '30d': 30, '90d': 90 };

const matchesStatusFilter = (status: Estimate['status'], filter: StatusFilter) =>
  filter === 'all' || (filter === 'waiting' ? status === 'sent' || status === 'opened' : status === filter);

interface EstimatesListProps {
  onCreateEstimate?: () => void;
  searchTerm?: string;
  refreshTrigger?: number;
  /** The estimate open in the drawer; its row stays highlighted behind it. */
  selectedId?: string;
}


export const EstimatesList: React.FC<EstimatesListProps> = ({ onCreateEstimate, searchTerm: outsideSearch = '', refreshTrigger, selectedId }) => {
  // The search box lives in the list's own toolbar; a page can still pass one in.
  const [searchInput, setSearchInput] = useState('');
  const [typedSearch, setTypedSearch] = useState('');
  useEffect(() => {
    const handler = setTimeout(() => setTypedSearch(searchInput), 300);
    return () => clearTimeout(handler);
  }, [searchInput]);
  const searchTerm = outsideSearch || typedSearch;
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const { isConstrained } = useContext(LayoutContext);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  
  // Sort state
  const [sortField, setSortField] = useState<'amount' | 'date' | 'estimate_number' | 'client'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Holding a row down (or right-clicking it) opens its actions menu.
  const [menuFor, setMenuFor] = useState<{ estimate: Estimate; x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Estimate | null>(null);
  const { toast, show: showNotice } = useToast();
  const press = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number; opened: boolean }>({ x: 0, y: 0, opened: false });

  const pressHandlers = (estimate: Estimate) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      clearTimeout(press.current.timer);
      press.current = {
        x: touch.clientX,
        y: touch.clientY,
        opened: false,
        timer: setTimeout(() => {
          press.current.opened = true;
          navigator.vibrate?.(10);
          setMenuFor({ estimate, x: touch.clientX, y: touch.clientY });
        }, 500),
      };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      // Scrolling isn't holding.
      if (Math.abs(touch.clientX - press.current.x) > 10 || Math.abs(touch.clientY - press.current.y) > 10) {
        clearTimeout(press.current.timer);
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      clearTimeout(press.current.timer);
      // The finger lifting after a hold shouldn't also open the estimate.
      if (press.current.opened) e.preventDefault();
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clearTimeout(press.current.timer);
      setMenuFor({ estimate, x: e.clientX, y: e.clientY });
    },
  });

  const runAction = async (estimate: Estimate, action: EstimateAction) => {
    if (!estimate.id) return;
    try {
      switch (action) {
        case 'send':
          if (await sendEstimateLink(estimate)) await loadEstimates();
          break;
        case 'copy-link':
          await copyText(await EstimateService.shareUrl(estimate.id));
          showNotice('Client link copied');
          break;
        case 'duplicate': {
          if (!selectedOrg?.id) return;
          const copy = await duplicateEstimate(estimate, selectedOrg.id);
          await loadEstimates();
          if (copy.id) navigate(`/estimates/${copy.id}`);
          break;
        }
        case 'accept':
          if (!(await confirmApproval(estimate))) return;
          await EstimateService.approve(estimate.id);
          await loadEstimates();
          showNotice(`${estimate.estimate_number} approved`);
          break;
        case 'decline':
          await EstimateService.updateStatus(estimate.id, 'rejected');
          await loadEstimates();
          break;
        case 'delete':
          setConfirmDelete(estimate);
          break;
      }
    } catch (error) {
      console.error('Estimate action failed:', error);
      notify(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  };

  const deleteConfirmed = async () => {
    const estimate = confirmDelete;
    setConfirmDelete(null);
    if (!estimate?.id) return;
    try {
      await EstimateService.delete(estimate.id);
      await loadEstimates();
      showNotice(`${estimate.estimate_number} deleted`);
    } catch (error) {
      console.error('Error deleting estimate:', error);
      notify("The estimate couldn't be deleted. Please try again.");
    }
  };

  // Refs for click outside
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedOrg?.id) {
      loadEstimates();
    }
  }, [selectedOrg?.id, refreshTrigger]);

  // The org whose estimates are on screen; reloading the same org (after closing
  // an estimate) updates the rows quietly instead of showing the loading skeleton.
  const loadedOrg = useRef<string | null>(null);

  const loadEstimates = async () => {
    if (!selectedOrg?.id) return;
    const orgId = selectedOrg.id;
    const quiet = loadedOrg.current === orgId;
    try {
      if (!quiet) setLoading(true);
      const estimatesData = await EstimateService.list(orgId);
      setEstimates(estimatesData);
      loadedOrg.current = orgId;
    } catch (error) {
      console.error('Error loading estimates:', error);
      // A failed quiet refresh keeps the rows already shown.
      if (!quiet) setEstimates([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: Estimate['status']) => {
    switch (status) {
      case 'draft': return <Edit className="w-4 h-4" />;
      case 'sent': return <Send className="w-4 h-4" />;
      case 'opened': return <Eye className="w-4 h-4" />;
      case 'accepted': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'expired': return <AlertTriangle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: Estimate['status']) => {
    switch (status) {
      case 'draft': return 'bg-gray-500/15 text-gray-300';
      case 'sent': return 'bg-blue-500/15 text-blue-300';
      case 'opened': return 'bg-purple-500/15 text-purple-300';
      case 'accepted': return 'bg-green-500/15 text-green-300';
      case 'rejected': return 'bg-red-500/15 text-red-300';
      case 'expired': return 'bg-orange-500/15 text-orange-300';
      default: return 'bg-gray-500/15 text-gray-300';
    }
  };


  const filteredEstimates = estimates.filter(estimate => {
    // Advanced search filter
    let matchesSearch = true;
    if (searchTerm) {
      const searchableFields: SearchableField[] = [
        { 
          key: 'estimate_number', 
          weight: 2.0, // Higher weight for estimate numbers
          transform: (est) => est.estimate_number || ''
        },
        { 
          key: 'title', 
          weight: 1.5, // High weight for titles
          transform: (est) => est.title || ''
        },
        { 
          key: 'client_name', 
          weight: 1.5, // High weight for client names
          transform: (est) => est.client?.name || ''
        },
        { 
          key: 'amount', 
          weight: 1.0,
          transform: (est) => formatCurrency(est.total_amount)
        },
        { 
          key: 'status', 
          weight: 0.8,
          transform: (est) => est.status
        },
        { 
          key: 'description', 
          weight: 0.6,
          transform: (est) => est.description || ''
        }
      ];

      const searchResults = advancedSearch([estimate], searchTerm, searchableFields, {
        minScore: 0.2, // Lower threshold for more inclusive results
        requireAllTerms: false // Allow partial matches
      });

      matchesSearch = searchResults.length > 0;
    }
    
    const matchesStatus = matchesStatusFilter(estimate.status, statusFilter);
    const days = RANGE_DAYS[dateRange];
    const matchesDate =
      !days || (!!estimate.created_at && Date.now() - new Date(estimate.created_at).getTime() <= days * 86_400_000);

    return matchesSearch && matchesStatus && matchesDate;
  }).sort((a, b) => {
    // Sort by selected field and direction
    let aValue: any, bValue: any;
    
    switch (sortField) {
      case 'amount':
        aValue = a.total_amount;
        bValue = b.total_amount;
        break;
      case 'date':
        aValue = new Date(a.created_at || '').getTime();
        bValue = new Date(b.created_at || '').getTime();
        break;
      case 'estimate_number':
        aValue = a.estimate_number || '';
        bValue = b.estimate_number || '';
        break;
      case 'client':
        aValue = a.client?.name || '';
        bValue = b.client?.name || '';
        break;
      default:
        aValue = a.total_amount;
        bValue = b.total_amount;
    }
    
    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
    } else {
      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
    }
  });

  // Functions for the options menu
  const handleExportToCSV = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      const estimateIds = filteredEstimates
        .map(est => est.id)
        .filter((id): id is string => id !== undefined);
      
      if (estimateIds.length === 0) {
        notify('No estimates available to export.');
        return;
      }
      
      await EstimateExportService.export({
        format: 'csv',
        estimateIds,
        includeItems: true,
        organizationId: selectedOrg.id
      });
    } catch (error) {
      console.error('Error exporting estimates:', error);
      notify(`Failed to export estimates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExportToExcel = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      const estimateIds = filteredEstimates
        .map(est => est.id)
        .filter((id): id is string => id !== undefined);
      
      if (estimateIds.length === 0) {
        notify('No estimates available to export.');
        return;
      }
      
      await EstimateExportService.export({
        format: 'excel',
        estimateIds,
        includeItems: true,
        organizationId: selectedOrg.id
      });
    } catch (error) {
      console.error('Error exporting estimates:', error);
      notify(`Failed to export estimates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };





  const statusCounts = estimates.reduce((acc, estimate) => {
    acc[estimate.status] = (acc[estimate.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const sumOf = (filter: StatusFilter) =>
    estimates.filter((e) => matchesStatusFilter(e.status, filter)).reduce((sum, e) => sum + (e.total_amount || 0), 0);
  const waitingCount = (statusCounts.sent || 0) + (statusCounts.opened || 0);
  // Win rate counts only estimates the client has seen: drafts haven't had a chance yet.
  const sentEver = estimates.length - (statusCounts.draft || 0);
  const winRate = sentEver ? Math.round(((statusCounts.accepted || 0) / sentEver) * 100) : null;
  const filtersOn = statusFilter !== 'all' || dateRange !== 'all';
  const statusOptions: [StatusFilter, string, number][] = [
    ['all', 'All', estimates.length],
    ['draft', 'Drafts', statusCounts.draft || 0],
    ['waiting', 'Waiting on client', waitingCount],
    ['accepted', 'Accepted', statusCounts.accepted || 0],
    ['rejected', 'Declined', statusCounts.rejected || 0],
    ['expired', 'Expired', statusCounts.expired || 0],
  ];
  /** Tapping a stat filters to it; tapping the same one again shows everything. */
  const toggleStatus = (filter: StatusFilter) => setStatusFilter((now) => (now === filter ? 'all' : filter));

  const handleSort = (field: 'amount' | 'date' | 'estimate_number' | 'client') => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection(field === 'amount' ? 'desc' : 'asc'); // Amount defaults to desc (highest first)
    }
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setDateRange('all');
    setSortField('date');
    setSortDirection('desc');
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }

    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div>
        <div className="bg-transparent border border-[#333333]">
          <TableSkeleton rows={5} variant="estimate" />
        </div>
      </div>
    );
  }

  if (estimates.length === 0) {
    // A faded example of what an estimate looks like, and where new ones come from.
    const example = [
      ['Demo and haul-off', '$850'],
      ['Cabinet install', '$4,200'],
      ['Quartz countertops', '$3,600'],
    ];
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12" data-testid="estimates-empty">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto w-72 bg-[#121212] border border-[#262626] text-left opacity-60 select-none" aria-hidden>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626]">
              <span className="text-sm text-white">Kitchen remodel</span>
              <span className="text-[11px] px-1.5 py-0.5 border border-[#333] text-gray-400">Draft</span>
            </div>
            {example.map(([name, price]) => (
              <div key={name} className="flex items-center justify-between px-4 py-2 text-xs border-b border-[#262626]">
                <span className="text-gray-400">{name}</span>
                <span className="font-mono text-gray-300">{price}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-400">Total</span>
              <span className="font-mono text-white">$8,650</span>
            </div>
          </div>

          <h2 className="mt-8 text-lg font-semibold text-white">No estimates yet</h2>
          <p className="mt-1 text-sm text-gray-400">
            Price a job from your price book and send the link. The client signs on their phone.
          </p>
          {onCreateEstimate ? (
            <button
              type="button"
              onClick={onCreateEstimate}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#336699] text-white hover:bg-[#2a5580] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New estimate
            </button>
          ) : (
            <p className="mt-5 inline-flex items-center gap-2 text-sm text-gray-300">
              Tap
              <span className="inline-flex w-6 h-6 rounded-full bg-[#336699] text-white items-center justify-center" aria-label="the blue +">
                <Plus className="w-3.5 h-3.5" />
              </span>
              and choose Estimate
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-[#0A0A0A]">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Unified Container */}
        <div className="bg-transparent border border-[#333333] flex flex-col">
        {/* Controls Section */}
        <div className={`${isConstrained ? 'px-4 py-1.5' : 'px-4 py-2'} border-b border-[#333333]/50`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3 min-w-0">
              <label className="relative flex-1 max-w-md min-w-[10rem]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search estimates, clients…"
                  aria-label="Search estimates"
                  className="w-full bg-[#1E1E1E] border border-[#333333] rounded-[4px] pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
                />
              </label>
              <div className="relative" ref={filterMenuRef}>
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  aria-label="Filters"
                  title="Filters"
                  aria-expanded={showFilterMenu}
                  className={`relative h-10 px-3 bg-[#1E1E1E] hover:bg-[#252525] text-white border rounded-[4px] transition-colors flex items-center gap-2 text-sm ${filtersOn ? 'border-[#336699]' : 'border-[#333333]'} ${showFilterMenu ? 'bg-[#252525]' : ''}`}
                >
                  <Filter className="w-4 h-4" />
                  {filtersOn && (
                    <span className="w-2 h-2 rounded-full bg-[#3B82F6]" data-testid="filters-on" aria-label="Filters on" />
                  )}
                </button>

                {showFilterMenu && (
                  <div className={`absolute top-full mt-1 ${isConstrained ? 'right-0 w-[280px]' : 'left-0 w-80'} bg-[#1E1E1E] border border-[#333333] rounded-[4px] shadow-lg z-50 p-3 md:p-4`}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-medium text-gray-300 mb-2">Status</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {statusOptions.map(([value, label, count]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setStatusFilter(value)}
                              aria-pressed={statusFilter === value}
                              className={`min-h-[40px] px-3 py-2 text-left text-sm rounded-[4px] border transition-colors ${statusFilter === value ? 'border-[#336699] bg-[#336699]/20 text-white' : 'border-[#333333] text-gray-300 hover:bg-[#252525]'}`}
                            >
                              {label} <span className="text-gray-500 tabular-nums">{count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="estimate-date-range" className="block text-sm font-medium text-gray-300 mb-2">Created</label>
                        <select
                          id="estimate-date-range"
                          value={dateRange}
                          onChange={(e) => setDateRange(e.target.value as DateRange)}
                          className="w-full min-h-[40px] px-3 py-2 bg-[#333333] border border-[#404040] rounded-[4px] text-white focus:outline-none focus:border-[#336699]"
                        >
                          <option value="all">Any time</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                          <option value="90d">Last 90 days</option>
                        </select>
                      </div>
                      {filtersOn && (
                        <div className="pt-3 border-t border-[#333333]">
                          <button
                            onClick={() => {
                              resetFilters();
                              setShowFilterMenu(false);
                            }}
                            className="w-full min-h-[40px] bg-[#333333] hover:bg-[#404040] text-white px-3 rounded-[4px] text-sm font-medium transition-colors"
                          >
                            Clear filters
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Options menu */}
              <div className="relative" ref={optionsMenuRef}>
                              <button
                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                className="p-2 bg-[#1E1E1E] border border-[#333333] hover:bg-[#333333] rounded-[4px] transition-colors text-gray-400"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

                {showOptionsMenu && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-[#1E1E1E] border border-[#333333] rounded-[4px] shadow-lg z-50 py-1">
                    <button
                      onClick={() => {
                        handleExportToCSV();
                        setShowOptionsMenu(false);
                      }}
                      className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#333333] transition-colors"
                    >
                      <Download className="w-3 h-3 mr-3 text-gray-400" />
                      Export to CSV
                    </button>
                    <button
                      onClick={() => {
                        handleExportToExcel();
                        setShowOptionsMenu(false);
                      }}
                      className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-[#333333] transition-colors"
                    >
                      <FileSpreadsheet className="w-3 h-3 mr-3 text-gray-400" />
                      Export to Excel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats: each one is a filter. */}
        <div className={`${isConstrained ? 'px-2 py-1.5' : 'px-2 py-2'} border-b border-[#333333]/50`}>
          <div className="grid grid-cols-4 gap-1">
            {([
              ['draft', 'Drafts', String(statusCounts.draft || 0), 'text-white', formatCurrency(sumOf('draft'))],
              ['waiting', isConstrained ? 'Waiting' : 'Waiting on client', String(waitingCount), 'text-blue-400', formatCurrency(sumOf('waiting'))],
              ['accepted', 'Accepted', String(statusCounts.accepted || 0), 'text-green-400', winRate === null ? 'nothing sent yet' : `${winRate}% win rate`],
              ['accepted', isConstrained ? 'Won' : 'Accepted value', formatCurrency(sumOf('accepted')), 'text-green-400', 'signed work'],
            ] as const).map(([filter, label, value, tone, sub], i) => {
              const on = statusFilter === filter;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleStatus(filter)}
                  aria-pressed={on}
                  data-testid={`stat-${i}`}
                  className={`min-h-[44px] rounded-[4px] px-2 py-1.5 text-left transition-colors ${isConstrained ? 'text-center' : ''} ${on ? 'bg-[#336699]/20 ring-1 ring-inset ring-[#336699]' : 'hover:bg-[#1A1A1A]'}`}
                >
                  <div className="text-xs text-gray-400 uppercase tracking-wider truncate">{label}</div>
                  <div className={`${isConstrained ? 'text-base' : 'text-lg'} font-semibold tabular-nums mt-0.5 truncate ${tone}`}>{value}</div>
                  {!isConstrained && (
                    <div className="text-xs text-gray-500 truncate">{sub}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-visible min-h-[400px]">
          {filteredEstimates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No estimates found</h3>
              <p className="text-gray-400 mb-6">
                {searchTerm || filtersOn 
                  ? 'Try adjusting your search or filters.'
                  : onCreateEstimate
                    ? 'Get started by creating your first estimate.'
                    : 'Tap the blue + and choose Estimate to create one.'
                }
              </p>
              {(!searchTerm && !filtersOn && onCreateEstimate) && (
                <button
                  onClick={onCreateEstimate}
                  className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-[8px] font-medium hover:bg-[#2d5a87] transition-colors mx-auto"
                >
                  <FileText className="w-4 h-4" />
                  Create Estimate
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Table Column Headers */}
              <div className={`${ROW_GRID} px-4 py-2 border-b border-[#333333]/50 text-[11px] font-medium text-gray-500 uppercase tracking-wider`}>
                {([
                  ['estimate_number', 'Estimate', ''],
                  ['client', 'Client', ''],
                  [null, 'Status', ''],
                  ['date', 'Date', ''],
                  ['amount', 'Amount', 'justify-end'],
                ] as const).map(([field, label, align]) =>
                  field ? (
                    <button
                      key={label}
                      onClick={() => handleSort(field)}
                      className={`flex items-center gap-1 uppercase tracking-wider hover:text-white transition-colors ${align} ${sortField === field ? 'text-white' : ''}`}
                    >
                      {label}
                      {sortField === field && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </button>
                  ) : (
                    <span key={label}>{label}</span>
                  ),
                )}
              </div>
              
              {/* Table Content */}
              <div className="overflow-hidden rounded-b-[4px]">
                <div>
                  {filteredEstimates.map((estimate) => (
                    <div
                      key={estimate.id}
                      {...pressHandlers(estimate)}
                      onClick={() => {
                        if (press.current.opened) {
                          press.current.opened = false;
                          return;
                        }
                        navigate(`/estimates/${estimate.id}`);
                      }}
                      className={`group ${ROW_GRID} select-none [-webkit-touch-callout:none] px-4 py-3 min-h-[52px] text-sm [@media(hover:hover)]:hover:bg-[#1A1A1A] active:bg-[#1A1A1A] ${estimate.id === selectedId || estimate.id === menuFor?.estimate.id ? 'bg-[#1A1A1A]' : ''} transition-colors cursor-pointer border-b border-[#333333]/50 last:border-b-0`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{estimate.estimate_number}</div>
                        {!isPlaceholderTitle(estimate.title) && (
                          <div className="text-xs text-gray-400 truncate" data-testid="estimate-title">{estimate.title}</div>
                        )}
                      </div>

                      <div className="min-w-0 truncate">
                        {estimate.client?.name ? (
                          <span className="text-gray-200">{estimate.client.name}</span>
                        ) : (
                          <span className="text-gray-500">No client</span>
                        )}
                      </div>

                      <div>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(estimate.status)}`}>
                          {estimateStatusLabel(estimate.status)}
                        </span>
                      </div>

                      <div className="text-gray-400 text-xs whitespace-nowrap">
                        {estimate.created_at
                          ? new Date(estimate.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </div>

                      <div className="text-right font-semibold text-white tabular-nums whitespace-nowrap">
                        {formatCurrency(estimate.total_amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      {menuFor && (
        <EstimateActionsMenu
          estimate={menuFor.estimate}
          x={menuFor.x}
          y={menuFor.y}
          onClose={() => setMenuFor(null)}
          onAction={(action) => runAction(menuFor.estimate, action)}
        />
      )}
      {confirmDelete &&
        createPortal(
          <div role="dialog" className="fixed inset-0 z-[10030] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
            <div className="relative bg-[#1E1E1E] rounded-lg border border-[#333333] p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-white mb-2">Delete {confirmDelete.estimate_number}?</h3>
              <p className="text-sm text-gray-400 mb-6">This can't be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-gray-300 hover:text-white">
                  Cancel
                </button>
                <button onClick={deleteConfirmed} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      <Toast text={toast} />
    </div>
  );
};
