import React, { useEffect, useState, useMemo, useRef, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MoreVertical, LayoutGrid, List, Calendar, DollarSign, Briefcase, FolderKanban, MapPin, User, CheckCircle, Search, Plus, ChevronDown, Filter, Download, Upload, Settings, BarChart3, FileText, Columns, Map, FileSpreadsheet, Trash2, Check, Zap } from 'lucide-react';
import { ViewToggle, ViewMode } from '../common/ViewToggle';
import { db } from '../../lib/database';
import type { Tables } from '../../lib/database';
import { PageHeader } from '../common/PageHeader';

import { NewButton } from '../common/NewButton';
import { TableSkeleton } from '../skeletons/TableSkeleton';
import { Dropdown } from '../common/Dropdown';
import { formatCurrency } from '../../utils/format';
import { advancedSearch, SearchableField } from '../../utils/searchUtils';
import { LayoutContext, OrganizationContext } from '../layouts/DashboardLayout';
import { StatusBadge } from './StatusBadge';
import { ProjectsOverviewMap } from '../maps/ProjectsOverviewMap';
import { ProjectExportService } from '../../services/ProjectExportService';
import { SimpleGanttChart } from './SimpleGanttChart';
import { CreateProjectWizard } from './CreateProjectWizard';

type Project = Tables['projects'];

interface ProjectListProps {
  searchTerm?: string;
}

export const ProjectList: React.FC<ProjectListProps> = ({ searchTerm: initialSearchTerm = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConstrained, availableWidth } = useContext(LayoutContext);
  const { selectedOrg } = useContext(OrganizationContext);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'planned' | 'active' | 'on-hold' | 'completed' | 'cancelled'>('all');
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  
  // Additional filter states
  const [dateRange, setDateRange] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [budgetRange, setBudgetRange] = useState<'all' | 'under-10k' | '10k-50k' | '50k-100k' | 'over-100k'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'budget' | 'status'>('date');
  
  // Load view preference from localStorage - default to 'list'
  const [viewType, setViewType] = useState<'list' | 'gantt' | 'map'>('list');
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  
  // Dropdown state management
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showMainOptions, setShowMainOptions] = useState(false);
  const [showProjectWizard, setShowProjectWizard] = useState(false);
  
  // Delete confirmation modal state
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [deletedProjectName, setDeletedProjectName] = useState<string>('');
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const moreFiltersRef = useRef<HTMLDivElement>(null);
  const mainOptionsRef = useRef<HTMLDivElement>(null);

  // Save view preference when it changes
  useEffect(() => {
    localStorage.setItem('projectsViewType', viewType);
  }, [viewType]);

  // Close dropdown menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      
      // Check if click is outside all dropdown menus
      const isOutsideDropdown = Object.values(dropdownRefs.current).every(ref => 
        !ref || !ref.contains(target)
      );
      
      if (isOutsideDropdown && openDropdownId) {
        setOpenDropdownId(null);
      }

      // Check if click is outside more filters dropdown
      if (moreFiltersRef.current && !moreFiltersRef.current.contains(target) && showFilters) {
        setShowFilters(false);
      }

      // Check if click is outside main options dropdown
      if (mainOptionsRef.current && !mainOptionsRef.current.contains(target) && showMainOptions) {
        setShowMainOptions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdownId, showFilters, showMainOptions]);

  // Check URL parameters
  const searchParams = new URLSearchParams(location.search);
  
  // Handle status filtering from URL parameters
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && ['planned', 'active', 'on-hold', 'completed', 'cancelled'].includes(statusParam)) {
      setSelectedStatus(statusParam as any);
    }
  }, [location.search]);

  // Delete confirmation handlers
  const handleDeleteClick = (project: Project) => {
    setDeletingProject(project);
    setShowDeleteConfirm(true);
    setOpenDropdownId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProject?.id) return;
    
    try {
      const projectName = deletingProject.name || 'Project';
      const successMessage = `${projectName} and all associated data`;
      
      await db.projects.delete(deletingProject.id);
      await fetchProjects(false);
      setShowDeleteConfirm(false);
      setDeletingProject(null);
      
      // Show success message with full context
      setDeletedProjectName(successMessage);
      setShowDeleteSuccess(true);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setShowDeleteSuccess(false);
        setDeletedProjectName('');
      }, 3000);
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeletingProject(null);
  };

  // Function to fetch projects
  const fetchProjects = async (showLoading = true) => {
    if (!selectedOrg?.id) {
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      if (showLoading) {
        setLoading(true);
      }
      const projectsData = await db.projects.list(selectedOrg.id);
      setProjects(projectsData);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Initial load and refresh on navigation/visibility changes
  useEffect(() => {
    if (selectedOrg?.id) {
      fetchProjects(true); // Show loading on initial load
    }
  }, [selectedOrg?.id]);

  // Refresh when the page becomes visible again or window regains focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && selectedOrg?.id) {
        fetchProjects(false); // Don't show loading on refresh
      }
    };

    const handleFocus = () => {
      if (selectedOrg?.id) {
        fetchProjects(false); // Don't show loading on refresh
      }
    };

    // Listen to page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedOrg?.id]);

  // Also refresh when location changes (navigation)
  useEffect(() => {
    if (selectedOrg?.id) {
      fetchProjects(false); // Don't show loading on navigation
    }
  }, [location.pathname, selectedOrg?.id]);

  // Construction project categories
  const categories = [
    { id: 'all', name: 'All Projects' },
    { id: 'kitchen-bath', name: 'Kitchen & Bath' },
    { id: 'outdoor', name: 'Outdoor' },
    { id: 'structural', name: 'Structural' },
    { id: 'systems', name: 'Systems' },
    { id: 'renovation', name: 'Renovation' },
    { id: 'commercial', name: 'Commercial' },
    { id: 'new-construction', name: 'New Construction' },
    { id: 'general', name: 'General' },
  ];

  // Filter projects by category, status, search, date, and budget
  const filteredProjects = useMemo(() => {
    const filtered = projects.filter(project => {
      const matchesCategory = selectedCategory === 'all' || project.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || project.status === selectedStatus;
      
      // Advanced search filter
      let matchesSearch = true;
      if (searchTerm) {
        const searchableFields: SearchableField[] = [
          { 
            key: 'name', 
            weight: 2.0, // Higher weight for project names
            transform: (project) => project.name || ''
          },
          { 
            key: 'description', 
            weight: 1.5, // High weight for descriptions
            transform: (project) => project.description || ''
          },
          { 
            key: 'category', 
            weight: 1.2,
            transform: (project) => project.category || ''
          },
          { 
            key: 'status', 
            weight: 1.0,
            transform: (project) => project.status || ''
          },
          { 
            key: 'budget', 
            weight: 1.0,
            transform: (project) => formatCurrency(project.budget || 0)
          },
          { 
            key: 'location', 
            weight: 0.8,
            transform: (project) => project.location || ''
          },
          { 
            key: 'client_name', 
            weight: 1.3,
            transform: (project) => project.client?.name || ''
          }
        ];

        const searchResults = advancedSearch([project], searchTerm, searchableFields, {
          minScore: 0.2, // Lower threshold for more inclusive results
          requireAllTerms: false // Allow partial matches
        });

        matchesSearch = searchResults.length > 0;
      }
      
      // Date range filter
      let matchesDate = true;
      if (dateRange !== 'all') {
        const projectDate = new Date(project.start_date);
        const now = new Date();
        const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const cutoffDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        matchesDate = projectDate >= cutoffDate;
      }
      
      // Budget range filter
      let matchesBudget = true;
      if (budgetRange !== 'all') {
        const budget = project.budget;
        switch (budgetRange) {
          case 'under-10k':
            matchesBudget = budget < 10000;
            break;
          case '10k-50k':
            matchesBudget = budget >= 10000 && budget < 50000;
            break;
          case '50k-100k':
            matchesBudget = budget >= 50000 && budget < 100000;
            break;
          case 'over-100k':
            matchesBudget = budget >= 100000;
            break;
        }
      }
      
      return matchesCategory && matchesStatus && matchesSearch && matchesDate && matchesBudget;
    });

    // Sort the filtered results
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'budget':
          return b.budget - a.budget;
        case 'status':
          return a.status.localeCompare(b.status);
        case 'date':
        default:
          return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
      }
    });

    return filtered;
  }, [projects, selectedCategory, selectedStatus, searchTerm, dateRange, budgetRange, sortBy]);

  // Get count for each category
  const getCategoryCount = (categoryId: string) => {
    if (categoryId === 'all') return projects.length;
    return projects.filter(project => project.category === categoryId).length;
  };

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'planned':
        return 'bg-[#a855f7] text-[#a855f7]';
      case 'active':
        return 'bg-[#10b981] text-[#10b981]';
      case 'completed':
        return 'bg-[#3b82f6] text-[#3b82f6]';
      case 'on-hold':
        return 'bg-[#f59e0b] text-[#f59e0b]';
      case 'cancelled':
        return 'bg-[#ef4444] text-[#ef4444]';
      default:
        return 'bg-[#6b7280] text-[#6b7280]';
    }
  };

  // Project summary statistics
  const activeProjects = projects.filter(project => project.status === 'active');
  const completedProjects = projects.filter(project => project.status === 'completed');
  const onHoldProjects = projects.filter(project => project.status === 'on-hold');
  
  const totalBudget = projects.reduce((sum, project) => sum + project.budget, 0);
  const activeBudget = activeProjects.reduce((sum, project) => sum + project.budget, 0);
  const onHoldBudget = onHoldProjects.reduce((sum, project) => sum + project.budget, 0);
  const completedBudget = completedProjects.reduce((sum, project) => sum + project.budget, 0);

  // Get progress percentage based on status
  const getProjectProgress = (status: Project['status']) => {
    switch (status) {
      case 'completed':
        return 100;
      case 'active':
        return 65; // Mock progress for demo
      case 'on-hold':
        return 15;
      default:
        return 0;
    }
  };

  if (loading) {
    return (
      <div>
        <div className="bg-transparent border border-[#333333]">
          <div className="p-6">
            <TableSkeleton rows={5} columns={6} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <div>
      {/* Header */}

        
        {/* Projects Section */}
        <div>
          {/* Unified Container with transparent background */}
          <div className="bg-transparent border border-[#333333]">
            {/* Stats Section */}
            <div className={`${isConstrained ? 'px-4 py-1.5' : 'px-4 py-2'} border-b border-[#333333]/50`}>
              {isConstrained ? (
                // Compact 4-column row for constrained
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider">TOTAL</div>
                    <div className="text-base font-semibold mt-1">{projects.length}</div>
          </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider">BUDGET</div>
                    <div className="text-base font-semibold mt-1">{formatCurrency(projects.reduce((sum, p) => sum + p.budget, 0))}</div>
          </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider">ACTIVE</div>
                    <div className="text-base font-semibold text-green-400 mt-1">{projects.filter(p => p.status === 'active').length}</div>
          </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider">AVG</div>
                    <div className="text-base font-semibold mt-1">{formatCurrency(projects.length > 0 ? projects.reduce((sum, p) => sum + p.budget, 0) / projects.length : 0)}</div>
                  </div>
                </div>
              ) : (
                // Full 4-column layout for desktop
                <div className="grid grid-cols-4 gap-6">
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">TOTAL</div>
                    <div className="text-lg font-semibold mt-1">{projects.length}</div>
                    <div className="text-xs text-gray-500">projects</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">TOTAL BUDGET</div>
                    <div className="text-lg font-semibold mt-1">{formatCurrency(projects.reduce((sum, p) => sum + p.budget, 0))}</div>
                    <div className="text-xs text-gray-500">all projects</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">ACTIVE</div>
                    <div className="text-lg font-semibold text-green-400 mt-1">{projects.filter(p => p.status === 'active').length}</div>
                    <div className="text-xs text-gray-500">({Math.round((projects.filter(p => p.status === 'active').length / (projects.length || 1)) * 100)}%)</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">AVG BUDGET</div>
                    <div className="text-lg font-semibold mt-1">{formatCurrency(projects.length > 0 ? projects.reduce((sum, p) => sum + p.budget, 0) / projects.length : 0)}</div>
                    <div className="text-xs text-gray-500">per project</div>
                  </div>
                </div>
              )}
        </div>

            {/* Controls Section */}
            <div className={`${isConstrained ? 'px-4 py-3' : 'px-4 py-4'} border-b border-[#333333]/50`}>
              <div className="flex items-center justify-between">
                {/* Left side - Search, Create button, and Filters */}
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-[#1E1E1E] border border-[#333333] rounded-[4px] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] w-64"
              />
            </div>
            
            {/* Create Project Button */}
            <button
              onClick={() => setShowProjectWizard(true)}
              className="px-4 py-2 bg-[#fbbf24] text-black rounded-[4px] text-sm font-medium hover:bg-[#f59e0b] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
            
            <div className="relative">
              <select
                      className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699] appearance-none pr-10 min-w-[200px]"
                value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value as any)}
              >
                      <option value="all">All Projects ({projects.length})</option>
                      {categories.slice(1).map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({getCategoryCount(cat.id)})
                    </option>
                      ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
                  
            <div className="relative" ref={moreFiltersRef}>
              <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`px-3 py-2 bg-[#1E1E1E] hover:bg-[#252525] text-white border border-[#333333] rounded-[4px] text-sm font-medium transition-colors flex items-center gap-2 ${showFilters ? 'bg-[#252525]' : ''}`}
              >
                <Filter className="w-4 h-4" />
                      <span>{isConstrained ? '' : 'More Filters'}</span>
              </button>
              
                    {/* Filters Dropdown */}
                    {showFilters && (
                      <div className={`absolute top-full left-0 mt-1 ${isConstrained ? 'right-0 left-auto w-[280px]' : 'w-80'} bg-[#1E1E1E] border border-[#333333] rounded-[4px] shadow-lg z-50 p-3 md:p-4`}>
                        <div className="space-y-3 md:space-y-4">
                    {/* Date Range Filter */}
                    <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 md:mb-2">
                        Date Range
                      </label>
                      <select
                              className="w-full bg-[#333333] border border-[#555555] rounded-[4px] px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-white focus:outline-none focus:border-[#336699]"
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value as 'all' | '7d' | '30d' | '90d')}
                      >
                        <option value="all">All Time</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                      </select>
                    </div>

                    {/* Budget Range Filter */}
                    <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 md:mb-2">
                        Budget Range
                      </label>
                      <select
                              className="w-full bg-[#333333] border border-[#555555] rounded-[4px] px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-white focus:outline-none focus:border-[#336699]"
                        value={budgetRange}
                        onChange={(e) => setBudgetRange(e.target.value as 'all' | 'under-10k' | '10k-50k' | '50k-100k' | 'over-100k')}
                      >
                        <option value="all">All Budgets</option>
                              <option value="under-10k">Under $10K</option>
                              <option value="10k-50k">$10K - $50K</option>
                              <option value="50k-100k">$50K - $100K</option>
                              <option value="over-100k">Over $100K</option>
                      </select>
                    </div>

                    {/* Sort By */}
                    <div>
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 md:mb-2">
                        Sort By
                      </label>
                      <select
                              className="w-full bg-[#333333] border border-[#555555] rounded-[4px] px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-white focus:outline-none focus:border-[#336699]"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'budget' | 'status')}
                      >
                              <option value="date">Date (Newest)</option>
                              <option value="name">Name (A-Z)</option>
                              <option value="budget">Budget (High)</option>
                        <option value="status">Status</option>
                      </select>
                    </div>

                    {/* Clear Filters */}
                          <div className="pt-2 md:pt-3 border-t border-[#333333]">
                      <button
                        onClick={() => {
                          setDateRange('all');
                          setBudgetRange('all');
                          setSortBy('date');
                                                      setSelectedCategory('all');
                            setSelectedStatus('all');
                            setShowFilters(false);
                        }}
                              className="w-full bg-[#333333] hover:bg-[#404040] text-white py-1.5 md:py-2 px-2 md:px-3 rounded-[4px] text-xs md:text-sm font-medium transition-colors"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
                
                {/* Right side - View toggle and options */}
          <div className="flex items-center gap-6">
            {/* View Type Toggle Group */}
            <div className="flex bg-[#1E1E1E] border border-[#333333] overflow-hidden">
              <button
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        viewType === 'list' ? 'bg-white text-[#121212]' : 'text-gray-400 hover:bg-[#252525]'
                }`}
                onClick={() => setViewType('list')}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        viewType === 'gantt' ? 'bg-white text-[#121212]' : 'text-gray-400 hover:bg-[#252525]'
                }`}
                onClick={() => setViewType('gantt')}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <button
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        viewType === 'map' ? 'bg-white text-[#121212]' : 'text-gray-400 hover:bg-[#252525]'
                }`}
                onClick={() => setViewType('map')}
              >
                <Map className="w-4 h-4" />
              </button>
            </div>

            {/* View Toggle and More Options grouped together */}
            <div className="flex items-center gap-2">
              <ViewToggle 
                viewMode={viewMode} 
                onViewModeChange={setViewMode}
              />
                  
              <div className="relative" ref={mainOptionsRef}>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMainOptions(!showMainOptions);
                  }}
                  className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] w-8 h-8 flex items-center justify-center hover:bg-[#252525] transition-colors relative"
                >
                  <MoreVertical className="w-4 h-4 text-gray-400" />
                </button>

                    {/* Main Options Dropdown */}
                    {showMainOptions && (
                      <div className={`absolute top-full right-0 mt-1 ${isConstrained ? 'w-[200px]' : 'w-56'} bg-[#1E1E1E] border border-[#333333] rounded-[4px] shadow-lg z-[10001] py-1`}>
                        {/* Export Options - Simplified for MVP */}
                        <div className="px-3 py-2">
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Export Options</div>
                          <button
                            onClick={async () => {
                              try {
                                await ProjectExportService.export(filteredProjects, {
                                  format: 'csv',
                                  organizationId: selectedOrg?.id || ''
                                });
                              } catch (error) {
                                console.error('Export failed:', error);
                              }
                              setShowMainOptions(false);
                            }}
                            className="w-full text-left px-2 py-2 text-white text-sm hover:bg-[#336699] transition-colors flex items-center rounded-[2px]"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export to CSV
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await ProjectExportService.export(filteredProjects, {
                                  format: 'excel',
                                  organizationId: selectedOrg?.id || ''
                                });
                              } catch (error) {
                                console.error('Export failed:', error);
                              }
                              setShowMainOptions(false);
                            }}
                            className="w-full text-left px-2 py-2 text-white text-sm hover:bg-[#336699] transition-colors flex items-center rounded-[2px]"
                          >
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            Export to Excel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Status Categories Section */}
            <div className={`${isConstrained ? 'px-4 py-3' : 'px-4 py-4'} border-b border-[#333333]/50`}>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide min-w-0">
                <button
                  onClick={() => setSelectedStatus('all')}
                  className={`${isConstrained ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'} rounded-[4px] font-medium transition-colors flex-shrink-0 ${
                    selectedStatus === 'all'
                      ? 'bg-white/20 text-white border border-white/30'
                      : 'bg-[#1E1E1E] text-gray-300 hover:bg-[#333333] border border-[#555555]'
                  }`}
                >
                  {isConstrained ? (
                    `All (${projects.length})`
                  ) : (
                    <div className="flex flex-col items-center">
                      <span>All</span>
                      <span className="text-xs opacity-70">({projects.length})</span>
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setSelectedStatus('planned')}
                  className={`${isConstrained ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'} rounded-[4px] font-medium transition-colors flex-shrink-0 ${
                    selectedStatus === 'planned'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-[#1E1E1E] text-gray-300 hover:bg-[#333333] border border-[#555555]'
                  }`}
                >
                  {isConstrained ? (
                    `Planned (${projects.filter(p => p.status === 'planned').length})`
                  ) : (
                    <div className="flex flex-col items-center">
                      <span>Planned</span>
                      <span className="text-xs opacity-70">({projects.filter(p => p.status === 'planned').length})</span>
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setSelectedStatus('active')}
                  className={`${isConstrained ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'} rounded-[4px] font-medium transition-colors flex-shrink-0 ${
                    selectedStatus === 'active'
                      ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                      : 'bg-[#1E1E1E] text-gray-300 hover:bg-[#333333] border border-[#555555]'
                  }`}
                >
                  {isConstrained ? (
                    `Active (${projects.filter(p => p.status === 'active').length})`
                  ) : (
                    <div className="flex flex-col items-center">
                      <span>Active</span>
                      <span className="text-xs opacity-70">({projects.filter(p => p.status === 'active').length})</span>
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setSelectedStatus('on-hold')}
                  className={`${isConstrained ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'} rounded-[4px] font-medium transition-colors flex-shrink-0 ${
                    selectedStatus === 'on-hold'
                      ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                      : 'bg-[#1E1E1E] text-gray-300 hover:bg-[#333333] border border-[#555555]'
                  }`}
                >
                  {isConstrained ? (
                    `On Hold (${projects.filter(p => p.status === 'on-hold').length})`
                  ) : (
                    <div className="flex flex-col items-center">
                      <span>On Hold</span>
                      <span className="text-xs opacity-70">({projects.filter(p => p.status === 'on-hold').length})</span>
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setSelectedStatus('completed')}
                  className={`${isConstrained ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'} rounded-[4px] font-medium transition-colors flex-shrink-0 ${
                    selectedStatus === 'completed'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-[#1E1E1E] text-gray-300 hover:bg-[#333333] border border-[#555555]'
                  }`}
                >
                  {isConstrained ? (
                    `Completed (${projects.filter(p => p.status === 'completed').length})`
                  ) : (
                    <div className="flex flex-col items-center">
                      <span>Completed</span>
                      <span className="text-xs opacity-70">({projects.filter(p => p.status === 'completed').length})</span>
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setSelectedStatus('cancelled')}
                  className={`${isConstrained ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'} rounded-[4px] font-medium transition-colors flex-shrink-0 ${
                    selectedStatus === 'cancelled'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-[#1E1E1E] text-gray-300 hover:bg-[#333333] border border-[#555555]'
                  }`}
                >
                  {isConstrained ? (
                    `Cancelled (${projects.filter(p => p.status === 'cancelled').length})`
                  ) : (
                    <div className="flex flex-col items-center">
                      <span>Cancelled</span>
                      <span className="text-xs opacity-70">({projects.filter(p => p.status === 'cancelled').length})</span>
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="overflow-hidden rounded-b-[4px]">

      {loading ? (
                <div className="p-6">
        <TableSkeleton rows={5} columns={6} />
                </div>
        ) : projects.length === 0 ? (
          // Simple empty state
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">No projects found</div>
            <div className="text-gray-500 text-sm">Projects will appear here when they are created from accepted estimates</div>
          </div>
        ) : (
          <>
            {viewType === 'list' ? (
              // List View - Mimics the sidebar projects list
                    <div className="bg-[#121212] border-b border-[#333333] overflow-hidden">
                <div className="space-y-0">
                  {filteredProjects.map((project, index) => {
                    const progress = getProjectProgress(project.status);
                    return (
                      <div key={project.id} className="relative">
                        <div
                          onClick={() => navigate(`/projects/${project.id}`)}
                          className={`w-full text-left ${viewMode === 'compact' ? 'p-2' : 'p-3 md:p-4'} hover:bg-[#333333] transition-colors border-b border-gray-700/30 group cursor-pointer ${index === filteredProjects.length - 1 ? 'border-b-0' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                                                  <div className={`flex items-center gap-3 ${viewMode === 'compact' ? 'mb-0.5' : 'mb-1'}`}>
                                <div className={`${viewMode === 'compact' ? 'w-1 h-1' : 'w-1.5 h-1.5 md:w-2 md:h-2'} rounded-full flex-shrink-0 ${
                                        project.status === 'completed' ? 'bg-[#3b82f6]' :
                                        project.status === 'active' ? 'bg-[#10b981]' :
                                        project.status === 'on-hold' ? 'bg-[#f59e0b]' :
                                        'bg-[#ef4444]'
                                }`}></div>
                                                                      <span className={`text-white ${viewMode === 'compact' ? 'text-sm' : 'text-sm md:text-base'} font-medium truncate`}>{project.name}</span>
                                <StatusBadge status={project.status} className={viewMode === 'compact' ? 'scale-50' : 'scale-75'} />
                              </div>
                              {viewMode !== 'compact' && (
                                      <div className="flex items-center gap-3 md:gap-4 text-gray-400 text-xs md:text-sm ml-3.5 md:ml-5">
                                        <span className="uppercase tracking-wide text-[10px] md:text-xs">Client Name</span>
                                        {availableWidth === 'full' && (
                                          <>
                                            <span className="font-mono">{formatCurrency(project.budget)}</span>
                                            <span>{new Date(project.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                          </>
                                        )}
                                      </div>
                                    )}
                            </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    {viewMode !== 'compact' && <span className="text-[#6b7280] text-sm md:text-base font-medium font-mono">{progress}%</span>}
                              
                                    {/* Three dots menu - always visible */}
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const dropdownId = `project-${project.id}`;
                                      setOpenDropdownId(openDropdownId === dropdownId ? null : dropdownId);
                                    }}
                                                                                className={`${viewMode === 'compact' ? 'w-6 h-6' : 'w-8 h-8'} flex items-center justify-center rounded hover:bg-[#252525] transition-all opacity-0 group-hover:opacity-100`}
                                        title="More options"
                                      >
                                        <MoreVertical className={`${viewMode === 'compact' ? 'w-3 h-3' : 'w-4 h-4'} text-gray-400`} />
                                  </button>
                                  
                                  {/* Dropdown Menu - Simplified for MVP */}
                                  {openDropdownId === `project-${project.id}` && (
                                    <div 
                                      ref={(el) => dropdownRefs.current[`project-${project.id}`] = el}
                                      className="absolute right-0 top-full mt-1 w-48 bg-[#2A2A2A] border border-[#404040] shadow-lg z-[10001] py-1"
                                    >
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/projects/${project.id}`);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        View Details
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/projects/${project.id}/edit`);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Edit
                                      </button>
                                      {project.status !== 'completed' && (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (confirm(`Mark "${project.name}" as complete?`)) {
                                              try {
                                                await db.projects.update(project.id, { status: 'completed' });
                                                await fetchProjects(false);
                                              } catch (error) {
                                                console.error('Error updating project status:', error);
                                              }
                                            }
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-3 py-2 text-green-400 text-xs hover:bg-[#336699] transition-colors flex items-center"
                                        >
                                          <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                          </svg>
                                          Mark Complete
                                        </button>
                                      )}
                                      <div className="border-t border-[#404040] my-1"></div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteClick(project);
                                        }}
                                        className="w-full text-left px-3 py-2 text-red-400 text-xs hover:bg-red-600/20 transition-colors flex items-center"
                                      >
                                        <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete
                                      </button>
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredProjects.length === 0 && (
                    <div className="text-center py-8">
                      <div className="text-gray-400 text-sm">No projects found</div>
                      <div className="text-gray-500 text-xs mt-1">Try adjusting your search or filters</div>
                    </div>
                  )}
                </div>
              </div>
            ) : viewType === 'gantt' ? (
              // Gantt Chart View
              <div className="p-6">
                <SimpleGanttChart projects={filteredProjects} />
              </div>
            ) : (
              // Map View
              <div>
                <div className="h-[600px] rounded-lg overflow-hidden border border-[#333]">
                  <ProjectsOverviewMap 
                    selectedStatus={selectedStatus}
                    filteredProjectIds={filteredProjects.map(p => p.id)}
                  />
                </div>
              </div>
            )}

            {/* Empty State for filtered results - only show in list/gantt view */}
            {viewType !== 'map' && filteredProjects.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-[#1a1a1a] rounded-lg flex items-center justify-center mb-4">
                  <FolderKanban className="w-8 h-8 text-[#666666]" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Projects Found</h3>
                <p className="text-gray-500 text-sm mb-6">No projects match your search or filters</p>
                <button 
                  onClick={() => {
                                          setSelectedCategory('all');
                      setSelectedStatus('all');
                  }}
                  className="px-4 py-2 bg-white text-black rounded-[8px] font-medium hover:bg-gray-100 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </>
        )}
            </div>
          </div>
        </div>
      </div>
      

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-white/10 shadow-2xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Project</h3>
              <p className="text-white/60 mb-6">
                Are you sure you want to delete project <strong>"{deletingProject?.name}"</strong>? This action cannot be undone and will remove all associated data.
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={handleDeleteCancel}
                  className="h-12 px-6 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all font-medium border border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="h-12 px-6 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-400 hover:to-red-500 transition-all font-medium flex items-center gap-3 shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showDeleteSuccess && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-green-500/20 shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Project Deleted</h3>
              <p className="text-white/60 mb-6">
                <strong>"{deletedProjectName}"</strong> has been successfully deleted.
              </p>
              <button
                onClick={() => {
                  setShowDeleteSuccess(false);
                  setDeletedProjectName('');
                }}
                className="h-10 px-6 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-all font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Wizard */}
      {showProjectWizard && (
        <CreateProjectWizard
          isOpen={showProjectWizard}
          onClose={() => setShowProjectWizard(false)}
          onSuccess={() => {
            setShowProjectWizard(false);
            // Refresh the projects list
            loadProjects();
          }}
        />
      )}
    </div>
  );
};

export default ProjectList;
