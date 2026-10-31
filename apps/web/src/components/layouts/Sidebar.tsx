import React, { Suspense, lazy, useRef, useEffect, useState } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import { NO_TRADES_LABEL } from '../settings/tradesLabels';
import { isStaff, isSuperAdmin } from '../../lib/roles';
// Loaded when opened: it pulls in the application form and its backend calls.
const AddCompanyDialog = lazy(() => import('../settings/AddCompanyDialog').then((m) => ({ default: m.AddCompanyDialog })));
import type { ProjectShortcut } from '../projects/useProjectShortcuts';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  LogOut,
  Activity,
  Sun,
  Moon,
  Plus
} from 'lucide-react';
import { NavShapeMark } from './NavShapes';
import { orgInitials } from './orgInitials';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { FEATURES } from '../../config/features';
import { WalletTile } from '../market/WalletTile';
import { planLabel, usePlan } from '../market/plan';

interface SidebarProps {
  isSidebarCollapsed: boolean;
  setSidebarCollapsedWithLogging: (value: boolean | ((prev: boolean) => boolean)) => void;
  orgDropdownOpen: boolean;
  setOrgDropdownOpen: (value: boolean) => void;
  selectedOrg: { id: string; name: string; industry: string };
  setSelectedOrg: (org: { id: string; name: string; industry: string }) => void;
  organizations: { id: string; name: string; industry: string }[];
  isProjectsSidebarOpen: boolean;
  setIsProjectsSidebarOpen: (value: boolean) => void;
  isProjectsSidebarLocked: boolean;
  setProjectsSidebarLockedWithPersistence?: (value: boolean) => void;
  /** The org's projects, open and most recently touched first. */
  recentProjects: ProjectShortcut[];
  selectedTimePeriod: 'D' | 'W' | 'M' | 'Q' | 'Y';
  setSelectedTimePeriod: (period: 'D' | 'W' | 'M' | 'Q' | 'Y') => void;
  currentData: { revenue: number; profit: number; goal: number; percentage: number };
  timePeriodHeaders: { [key: string]: string };
  isLiveRevenuePopoverOpen: boolean;
  setIsLiveRevenuePopoverOpen: (value: boolean) => void;
  liveRevenueButtonRef: React.RefObject<HTMLDivElement>;
  isProfileMenuOpen: boolean;
  setIsProfileMenuOpen: (value: boolean) => void;
  setShowHelpModal: (value: boolean) => void;
  onActivityClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isSidebarCollapsed,
  setSidebarCollapsedWithLogging,
  orgDropdownOpen,
  setOrgDropdownOpen,
  selectedOrg,
  setSelectedOrg,
  organizations,
  isProjectsSidebarOpen,
  setIsProjectsSidebarOpen,
  isProjectsSidebarLocked,
  recentProjects,
  isProfileMenuOpen,
  setIsProfileMenuOpen,
  setShowHelpModal,
  onActivityClick
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { plan, active: planActive } = usePlan(selectedOrg.id || undefined);
  // "Add another company": owners apply for it (Webb Leads approves); the platform owner adds it in Ops.
  const [addingCompany, setAddingCompany] = useState(false);
  const addCompany = () => {
    setOrgDropdownOpen(false);
    if (isSuperAdmin(user)) navigate('/ops?new=company');
    else setAddingCompany(true);
  };
  // Tiles the plan covers go grey when it isn't on; they still open, to the plan panel.
  const dim = planActive ? '' : ' opacity-40 grayscale';
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  // Handle click outside for profile dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileDropdownRef.current && 
        !profileDropdownRef.current.contains(event.target as Node) &&
        profileButtonRef.current &&
        !profileButtonRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen, setIsProfileMenuOpen]);

  return (
    <>
      {/* Sidebar - part of grid layout, not fixed */}
      <div className={`hidden md:flex ${isSidebarCollapsed ? 'w-12' : 'w-48'} h-[100dvh] bg-[#000000] border-l border-gray-700 flex-col transition-all duration-300`}>
        {/* Organization header and sidebar toggle */}
        <div className={`p-2 border-b border-[#333333] relative flex ${isSidebarCollapsed ? 'flex-col gap-1' : ''} items-center justify-between flex-shrink-0 overflow-visible`}>
          <button
            onClick={() => setSidebarCollapsedWithLogging(!isSidebarCollapsed)}
            className={`${isSidebarCollapsed ? 'w-full' : 'w-8'} h-8 flex items-center justify-center rounded-[4px] bg-[#1E1E1E] text-[#9E9E9E] hover:text-white transition-colors`}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {/* Collapsed: the company's initials, which open the list beside the rail without expanding it. */}
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
              className="w-full h-8 flex items-center justify-center rounded-[4px] bg-[#1A1A1A] border border-[#2A2A2A] text-[11px] font-semibold text-white hover:bg-[#2A2A2A] transition-colors"
              aria-label={`Switch company (now ${selectedOrg.name})`}
              aria-expanded={orgDropdownOpen}
              title={selectedOrg.name}
            >
              {orgInitials(selectedOrg.name)}
            </button>
          )}
          {!isSidebarCollapsed && (
            <button 
              onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
              className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-between ml-1 h-10 px-2 hover:bg-[#2A2A2A] transition-all duration-150 max-w-[140px]"
              title={selectedOrg.name}
            >
              <div className="flex items-center min-w-0 flex-1 overflow-hidden">
                <div className="flex flex-col items-start">
                  <span className="text-white text-xs font-semibold leading-tight truncate max-w-[120px]">{selectedOrg.name}</span>
                  {/* No trades yet: amber. Trades are changed in Company settings → Trades. */}
                  <span className={`text-[10px] leading-tight truncate max-w-[120px] ${selectedOrg.industry === NO_TRADES_LABEL ? 'text-amber-300' : 'text-[#336699]'}`}>{selectedOrg.industry}</span>
                </div>
              </div>
              <ChevronDown className={`text-[#336699] w-3 h-3 transition-transform duration-200 flex-shrink-0 ml-1 ${orgDropdownOpen ? 'transform rotate-180' : ''}`} />
            </button>
          )}
          
          {/* Organization Dropdown */}
          {orgDropdownOpen && (
            <div
              className={`absolute ${isSidebarCollapsed ? 'right-full top-2 mr-1 w-56' : 'left-2 right-2 top-[calc(100%-8px)] mt-1'} bg-[#1A1A1A] border border-[#2A2A2A] shadow-lg z-50 py-1 overflow-hidden`}
              role="menu"
              aria-label="Companies"
            >
              {organizations.map((org) => (
                <button
                  key={org.id}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#2A2A2A] transition-colors ${selectedOrg.id === org.id ? 'bg-[#2A2A2A]' : ''}`}
                  onClick={() => {
                    console.log('Switching to organization:', org.name, 'ID:', org.id, 'Industry:', org.industry);
                    setSelectedOrg(org);
                    localStorage.setItem('selectedOrgId', org.id);
                    setOrgDropdownOpen(false);
                  }}
                >
                  <div className="flex flex-col overflow-hidden flex-1">
                    <span className="text-white text-sm font-medium truncate">{org.name}</span>
                    <span className="text-gray-400 text-xs truncate">{org.industry}</span>
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={addCompany}
                className="w-full text-left px-3 py-2 min-h-[44px] flex items-center gap-2 border-t border-[#2A2A2A] mt-1 text-sm text-[#7fb0e0] hover:bg-[#2A2A2A] transition-colors"
              >
                <Plus className="w-4 h-4 flex-shrink-0" />
                Add another company
              </button>
            </div>
          )}
        </div>
        
        {/* Scrollable Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Grid navigation */}
          <div className={`${isSidebarCollapsed ? 'grid grid-cols-1' : 'grid grid-cols-2'} gap-0`}>
            {/* Profit Tracker (formerly Dashboard) */}

            {/* Leads */}
            <NavLink
              to="/leads"
              className={({ isActive }) =>
                isActive
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Leads - Quote requests from first call to sold or lost" : undefined}
            >
              {({ isActive }) => (
                <div className="relative z-10 flex flex-col items-center">
                  <div className={`mb-1 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                    <NavShapeMark shape="leads" />
                  </div>
                  {!isSidebarCollapsed && (
                    <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      Leads
                    </span>
                  )}
                </div>
              )}
            </NavLink>

            {/* Bids */}
            <NavLink
              to="/bids"
              className={({ isActive }) =>
                isActive
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Bids - Bid on leads in your counties" : undefined}
            >
              {({ isActive }) => (
                <div className="relative z-10 flex flex-col items-center">
                  <div className={`mb-1 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                    <NavShapeMark shape="bids" />
                  </div>
                  {!isSidebarCollapsed && (
                    <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      Bids
                    </span>
                  )}
                </div>
              )}
            </NavLink>
            {/* Marketplace */}
            <NavLink
              to="/marketplace"
              className={({ isActive }) =>
                isActive
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Marketplace - Leads nobody bid on, priced to move" : undefined}
            >
              {({ isActive }) => (
                <div className="relative z-10 flex flex-col items-center">
                  <div className={`mb-1 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                    <NavShapeMark shape="marketplace" />
                  </div>
                  {!isSidebarCollapsed && (
                    <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      Marketplace
                    </span>
                  )}
                </div>
              )}
            </NavLink>
            {/* The Vault: leads nobody bought in a week, for companies on the plan */}
            <NavLink
              to="/vault"
              className={({ isActive }) =>
                isActive
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]${dim}`
                  : `bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95${dim}`
              }
              title={isSidebarCollapsed ? 'The Vault - Members-only leads' : planActive ? undefined : 'On the plan'}
            >
              {({ isActive }) => (
                <div className="relative z-10 flex flex-col items-center">
                  <div className={`mb-1 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                    <NavShapeMark shape="vault" />
                  </div>
                  {!isSidebarCollapsed && (
                    <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      The Vault
                    </span>
                  )}
                </div>
              )}
            </NavLink>
            {/* The Webb Report: the county's week in permits, builders, demand and sales. Wide, it's the flagship. */}
            <NavLink
              to="/report"
              className={({ isActive }) =>
                isActive
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : `bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95`
              }
              title={isSidebarCollapsed ? 'The Webb Report - Permits, builders and demand' : undefined}
            >
              {({ isActive }) => (
                <div className="relative z-10 flex flex-col items-center">
                  <div className={`mb-1 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                    <NavShapeMark shape="report" />
                  </div>
                  {!isSidebarCollapsed && (
                    <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      Webb Report
                    </span>
                  )}
                </div>
              )}
            </NavLink>
            {/* Estimates */}
            <NavLink
              to="/work"
              className={({ isActive }) =>
                isActive || location.pathname.startsWith('/work') || location.pathname.startsWith('/estimates')
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]${dim}`
                  : `bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95${dim}`
              }
              title={isSidebarCollapsed ? "Estimates - Create and Manage Estimates" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive || location.pathname.startsWith('/work') || location.pathname.startsWith('/estimates') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <NavShapeMark shape="estimates" />
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`text-xs font-medium ${isActive || location.pathname.startsWith('/work') || location.pathname.startsWith('/estimates') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                        Estimates
                      </span>
                    )}
                  </div>
                </>
              )}
            </NavLink>

            {/* Price Book */}
            <NavLink
              to="/price-book"
              className={({ isActive }) =>
                isActive || location.pathname.startsWith('/price-book') || location.pathname.startsWith('/items') || location.pathname.startsWith('/cost-codes')
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]${dim}`
                  : `bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95${dim}`
              }
              title={isSidebarCollapsed ? "Price Book - Cost Codes, Items, Services & Packages" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive || location.pathname.startsWith('/price-book') || location.pathname.startsWith('/items') || location.pathname.startsWith('/cost-codes') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <NavShapeMark shape="pricebook" />
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`text-xs font-medium ${isActive || location.pathname.startsWith('/price-book') || location.pathname.startsWith('/items') || location.pathname.startsWith('/cost-codes') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                        Price Book
                      </span>
                    )}
                  </div>
                </>
              )}
            </NavLink>

            {/* Projects */}
            {FEATURES.projects && (
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                isActive || location.pathname.startsWith('/projects')
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center aspect-square relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]${dim}`
                  : `bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center aspect-square hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95${dim}`
              }
              title={isSidebarCollapsed ? "Projects - Manage Your Projects" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive || location.pathname.startsWith('/projects') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <NavShapeMark shape="projects" />
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`text-xs font-medium ${isActive || location.pathname.startsWith('/projects') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                        Projects
                      </span>
                    )}
                  </div>
                </>
              )}
            </NavLink>
            )}

          </div>


          {/* Recent Projects Section */}
          {FEATURES.projects && !isSidebarCollapsed && (
            <div>
              {/* Projects without padding */}
              <div className="mb-2">
                <div className="space-y-0">
                  {recentProjects.slice(0, 2).map((project) => {
                    const path = `/projects/${project.id}`;
                    const here = location.pathname === path;
                    return (
                      <button
                        key={project.id}
                        onClick={() => navigate(path)}
                        title={project.client ? `${project.name} · ${project.client}` : project.name}
                        className={`w-full flex items-center justify-between px-1.5 py-2 transition-colors group border-b border-[#333333] last:border-b-0 hover:bg-[#2A2A2A] first:rounded-t-[4px] last:rounded-b-[4px] ${here ? 'bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 border-l border-[#336699]/50' : ''}`}
                      >
                        <div className="flex items-center flex-1 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full mr-2 flex-shrink-0 ${project.status === 'active' || project.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                          <span className={`text-white text-xs font-medium truncate ${here ? 'text-[#336699]' : 'group-hover:text-[#336699]'} transition-colors leading-tight`}>{project.name}</span>
                        </div>
                        {project.budget ? (
                          <div className="flex-shrink-0 ml-2">
                            <span className={`${project.progress > 100 ? 'text-red-400' : 'text-[#6b7280]'} text-xs font-medium leading-tight`}>{project.progress}%</span>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                  {recentProjects.length === 0 && (
                    <div className="px-1.5 py-2 text-[11px] text-gray-500">No projects yet</div>
                  )}
                </div>
              </div>
              
              {/* View All Projects Link with padding */}
              <div className="px-2 pb-2">
                <div className="mt-3">
                  <button 
                    data-projects-more-button
                    onClick={() => {
                      // Only allow toggle if sidebar is not locked
                      if (!isProjectsSidebarLocked) {
                        if (isProjectsSidebarOpen) {
                          // If sidebar is open, close it with animation
                          window.dispatchEvent(new CustomEvent('closeProjectsSidebar'));
                        } else {
                          // If sidebar is closed, open it
                          setIsProjectsSidebarOpen(true);
                        }
                      }
                    }}
                    className={`${isProjectsSidebarLocked ? 'text-white' : 'text-[#336699]'} text-[10px] font-medium hover:text-white transition-colors flex items-center justify-end uppercase tracking-wide ${isProjectsSidebarLocked ? 'cursor-default' : 'cursor-pointer'} w-full`}
                  >
                    <ChevronLeft className={`w-2.5 h-2.5 mr-1 transition-transform ${isProjectsSidebarOpen && !isProjectsSidebarLocked ? 'rotate-90' : ''}`} />
                    <span className="mr-1">{isProjectsSidebarLocked ? 'locked' : (isProjectsSidebarOpen ? 'close' : 'more')}</span>
                    {isProjectsSidebarOpen && !isProjectsSidebarLocked ? (
                      <span className="flex items-center">×</span>
                    ) : (
                      <span className="flex items-center">⋮⋮</span>
                    )}
                    {isProjectsSidebarLocked && (
                      <svg className="w-2.5 h-2.5 ml-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Activity Button */}
          <div className="px-2 mt-4">
            <button
              onClick={onActivityClick}
              className="w-full flex items-center justify-center h-12 bg-[#1A1A1A] border border-[#2A2A2A] rounded-[4px] hover:bg-[#2A2A2A] transition-all duration-150 group"
              title={isSidebarCollapsed ? "Activity Log - View Recent Actions" : undefined}
            >
              <Activity className={`w-4 h-4 ${isSidebarCollapsed ? '' : 'mr-2'} text-gray-400 group-hover:text-white transition-colors`} />
              {!isSidebarCollapsed && (
                <span className="text-xs font-medium text-gray-400 group-hover:text-white transition-colors">
                  Activity Log
                </span>
              )}
            </button>
          </div>
        </div>
        
        <div className="mt-auto flex-shrink-0">
          {/* Live Revenue (part of the Profit Tracker, switched off for now) */}

          {/* Lead balance: always in view, opens the panel on the right */}
          <WalletTile organizationId={selectedOrg.id || undefined} collapsed={isSidebarCollapsed} />

          {/* User Profile Section */}
          <div className="relative border-t border-gray-700">
            {/* Profile Dropdown Menu - positioned with fixed to escape overflow constraints */}
            {isProfileMenuOpen && (
              <div 
                ref={profileDropdownRef}
                className={`fixed ${isSidebarCollapsed ? 'w-48' : 'w-48'} mb-1 bg-[#252525] border border-[#404040] rounded-[4px] shadow-xl overflow-hidden z-[100]`}
                style={{
                  bottom: '80px',
                  right: isSidebarCollapsed ? '16px' : '16px'
                }}
              >
                {isStaff(user) && (
                  <button
                    onClick={() => {
                      navigate('/ops');
                      setIsProfileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200 border-b border-[#404040]"
                  >
                    <span className="font-['Roboto']">Ops</span>
                    <span className="block text-xs text-gray-400">Leads, companies, permits</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    navigate('/settings/organization');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <span className="font-['Roboto']">Company settings</span>
                </button>
                
                <button
                  onClick={() => {
                    navigate('/plan');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <span className="font-['Roboto']">Pro plan</span>
                </button>
                
                <div className="border-t border-[#404040]" />
                
                <button
                  onClick={() => {
                    setShowHelpModal(true);
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center px-4 py-3 text-sm text-[#336699] hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <HelpCircle className="w-4 h-4 mr-3 text-[#336699]" />
                  <span className="font-['Roboto']">Help & Tutorials</span>
                </button>
                
                <button
                  onClick={() => {
                    toggleTheme();
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 mr-3 text-[#9E9E9E]" /> : <Moon className="w-4 h-4 mr-3 text-[#9E9E9E]" />}
                  <span className="font-['Roboto']">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                </button>

                <div className="border-t border-[#404040]" />
                
                <button
                  onClick={async () => {
                    try {
                      await signOut();
                      setIsProfileMenuOpen(false);
                    } catch (error) {
                      console.error('Error signing out:', error);
                    }
                  }}
                  className="w-full flex items-center px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <LogOut className="w-4 h-4 mr-3 text-[#9E9E9E]" />
                  <span className="font-['Roboto']">Sign Out</span>
                </button>
              </div>
            )}

            {/* Profile Button - Entire Section Clickable */}
            <button
              ref={profileButtonRef}
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className={`w-full ${isSidebarCollapsed ? 'px-2 py-4 justify-center' : 'p-4'} flex items-center hover:bg-[#252525] transition-colors duration-200 cursor-pointer group`}
              aria-label={isSidebarCollapsed ? 'Account menu' : undefined}
            >
              {/* User Info - only when sidebar expanded */}
              {!isSidebarCollapsed && (
                <div className="flex items-center flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate group-hover:text-[#EAB308] transition-colors">
                      {user?.name || user?.email || 'You'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {planLabel(plan)}
                    </p>
                  </div>
                </div>
              )}

              {/* Avatar */}
              <div className={`${isSidebarCollapsed ? '' : 'ml-3'} flex flex-shrink-0 items-center justify-center w-8 h-8 rounded-full bg-[#336699] text-white group-hover:bg-[#2A5580] transition-all`}>
                <span className="text-sm font-medium">
                  {(user?.name || user?.email || 'You').charAt(0).toUpperCase()}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
      {addingCompany && (
        <Suspense fallback={null}>
          <AddCompanyDialog onClose={() => setAddingCompany(false)} />
        </Suspense>
      )}
    </>
  );
}; 