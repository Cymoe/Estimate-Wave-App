import React, { useRef, useEffect } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  LogOut,
  Activity,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
  selectedTimePeriod,
  setSelectedTimePeriod,
  currentData,
  timePeriodHeaders,
  isLiveRevenuePopoverOpen,
  setIsLiveRevenuePopoverOpen,
  liveRevenueButtonRef,
  isProfileMenuOpen,
  setIsProfileMenuOpen,
  setShowHelpModal,
  onActivityClick
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
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
      <div className={`hidden md:flex ${isSidebarCollapsed ? 'w-14' : 'w-48'} h-screen bg-[#000000] border-l border-gray-700 flex-col transition-all duration-300`}>
        {/* Organization header and sidebar toggle */}
        <div className="p-2 border-b border-[#333333] relative flex items-center justify-between flex-shrink-0 overflow-visible">
          <button
            onClick={() => setSidebarCollapsedWithLogging(!isSidebarCollapsed)}
            className={`${isSidebarCollapsed ? 'w-full' : 'w-8'} h-8 flex items-center justify-center rounded-[4px] bg-[#1E1E1E] text-[#9E9E9E] hover:text-white transition-colors`}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {!isSidebarCollapsed && (
            <button 
              onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
              className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-between ml-1 h-10 px-2 hover:bg-[#2A2A2A] transition-all duration-150 max-w-[140px]"
              title={selectedOrg.name}
            >
              <div className="flex items-center min-w-0 flex-1 overflow-hidden">
                <div className="flex flex-col items-start">
                  <span className="text-white text-xs font-semibold leading-tight truncate max-w-[120px]">{selectedOrg.name}</span>
                  <span className="text-[#336699] text-[10px] leading-tight">{selectedOrg.industry}</span>
                </div>
              </div>
              <ChevronDown className={`text-[#336699] w-3 h-3 transition-transform duration-200 flex-shrink-0 ml-1 ${orgDropdownOpen ? 'transform rotate-180' : ''}`} />
            </button>
          )}
          
          {/* Organization Dropdown */}
          {orgDropdownOpen && !isSidebarCollapsed && (
            <div className="absolute left-2 right-2 top-[calc(100%-8px)] mt-1 bg-[#1A1A1A] border border-[#2A2A2A] shadow-lg z-50 py-1 overflow-hidden">
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
                  <div className={`text-white w-7 h-7 flex items-center justify-center text-sm font-bold ${selectedOrg.id === org.id ? 'bg-[#336699]' : 'bg-[#333333]'}`}>
                    {org.name.charAt(0)}
                  </div>
                  <div className="flex flex-col overflow-hidden flex-1">
                    <span className="text-white text-sm font-medium truncate">{org.name}</span>
                    <span className="text-gray-400 text-xs truncate">{org.industry}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Grid navigation */}
          <div className={`${isSidebarCollapsed ? 'grid grid-cols-1' : 'grid grid-cols-2'} gap-0`}>
            {/* Profit Tracker (formerly Dashboard) */}
            <NavLink
              to="/profit-tracker"
              className={({ isActive }) =>
                isActive
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center h-16 relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center h-16 hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Profit Tracker" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <span className="text-base">◆</span>
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                        Profit Tracker
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
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center h-16 relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center h-16 hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Price Book - Cost Codes, Items, Services & Packages" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive || location.pathname.startsWith('/price-book') || location.pathname.startsWith('/items') || location.pathname.startsWith('/cost-codes') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <span className="text-base">□</span>
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

            {/* Estimates */}
            <NavLink
              to="/work"
              className={({ isActive }) =>
                isActive || location.pathname.startsWith('/work') || location.pathname.startsWith('/estimates')
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center h-16 relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center h-16 hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Estimates - Create and Manage Estimates" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive || location.pathname.startsWith('/work') || location.pathname.startsWith('/estimates') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <span className="text-base">▲</span>
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

            {/* Sales Mode */}
            <NavLink
              to="/sales-mode"
              className={({ isActive }) =>
                isActive || location.pathname.startsWith('/sales-mode')
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center h-16 relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center h-16 hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Sales Mode - Field Sales Tool" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive || location.pathname.startsWith('/sales-mode') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <span className="text-base">⚡</span>
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`text-xs font-medium ${isActive || location.pathname.startsWith('/sales-mode') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                        Sales Mode
                      </span>
                    )}
                  </div>
                </>
              )}
            </NavLink>

            {/* Projects */}
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                isActive || location.pathname.startsWith('/projects')
                  ? `bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md border border-[#336699]/50 flex flex-col items-center justify-center h-16 relative overflow-hidden group shadow-[0_0_10px_rgba(51,102,153,0.15)]`
                  : "bg-[#1A1A1A] border border-[#2A2A2A] flex flex-col items-center justify-center h-16 hover:bg-[#2A2A2A] transition-all duration-150 relative overflow-hidden group active:scale-95"
              }
              title={isSidebarCollapsed ? "Projects - Manage Your Projects" : undefined}
            >
              {({ isActive }) => (
                <>
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`mb-1 ${isActive || location.pathname.startsWith('/projects') ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'} transition-colors`}>
                      <span className="text-base">◉</span>
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

          </div>

          {/* Recent Projects Section */}
          {!isSidebarCollapsed && (
            <div>
              {/* Projects without padding */}
              <div className="mb-2">
                <div className="space-y-0">
                  {/* Kitchen Renovation Row */}
                  <button 
                    onClick={() => navigate('/projects/1')}
                    className={`w-full flex items-center justify-between px-1.5 py-2 transition-colors group border-b border-[#333333] last:border-b-0 hover:bg-[#2A2A2A] first:rounded-t-[4px] last:rounded-b-[4px] ${location.pathname === '/projects/1' ? 'bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 border-l border-[#336699]/50' : ''}`}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 flex-shrink-0"></div>
                      <span className={`text-white text-xs font-medium truncate ${location.pathname === '/projects/1' ? 'text-[#336699]' : 'group-hover:text-[#336699]'} transition-colors leading-tight`}>Kitchen Renovation</span>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="text-[#6b7280] text-xs font-medium leading-tight">75%</span>
                    </div>
                  </button>

                  {/* HVAC Install Row */}
                  <button 
                    onClick={() => navigate('/projects/2')}
                    className={`w-full flex items-center justify-between px-1.5 py-2 transition-colors group border-b border-[#333333] last:border-b-0 hover:bg-[#2A2A2A] first:rounded-t-[4px] last:rounded-b-[4px] ${location.pathname === '/projects/2' ? 'bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 border-l border-[#336699]/50' : ''}`}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 flex-shrink-0"></div>
                      <span className={`text-white text-xs font-medium truncate ${location.pathname === '/projects/2' ? 'text-[#336699]' : 'group-hover:text-[#336699]'} transition-colors leading-tight`}>HVAC Install</span>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="text-[#6b7280] text-xs font-medium leading-tight">45%</span>
                    </div>
                  </button>


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
                    className={`${isProjectsSidebarLocked ? 'text-[#F9D71C]' : 'text-[#336699]'} text-[10px] font-medium hover:text-white transition-colors flex items-center justify-end uppercase tracking-wide ${isProjectsSidebarLocked ? 'cursor-default' : 'cursor-pointer'} w-full`}
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
          {/* Live Revenue - visible in both expanded and collapsed states */}
          <div className="p-2">
            {!isSidebarCollapsed ? (
              <div className="bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md p-2.5 rounded-[2px] border border-[#336699]/50 shadow-[0_0_10px_rgba(51,102,153,0.15)]">
                {/* Header */}
                <div className="mb-2">
                  <h3 className="text-white/90 text-[10px] font-medium mb-1.5 uppercase tracking-wide">{timePeriodHeaders[selectedTimePeriod]}</h3>
                  
                  {/* Main Revenue Amount */}
                  <div className="text-white text-base font-bold mb-1.5 leading-tight">
                    ${currentData.revenue.toLocaleString()}
                  </div>
                
                  {/* Time Period Selector */}
                  <div className="flex items-center justify-start space-x-1 mb-3">
                    {(['D', 'W', 'M', 'Q', 'Y'] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setSelectedTimePeriod(period)}
                        className={`w-7 h-7 rounded-[4px] flex items-center justify-center text-xs font-bold transition-colors ${
                          selectedTimePeriod === period
                            ? 'bg-[#336699] text-white border border-[#336699]'
                            : 'bg-white/10 text-white/70 hover:bg-white/15'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center justify-between text-sm mb-3">
                  <div className="flex items-center text-green-300">
                    <span className="mr-1">↗</span>
                    <span className="text-[10px] leading-tight">up 12%</span>
                  </div>
                  <div className="text-white/90 text-[10px] leading-tight">
                    Profit: ${currentData.profit.toLocaleString()}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div 
                      className="bg-[#336699] h-2 rounded-full transition-all duration-300" 
                      style={{width: `${currentData.percentage}%`}}
                    ></div>
                  </div>
                </div>

                {/* Goal Progress */}
                <div className="text-center">
                  <span className="text-white/90 text-[10px] leading-tight">{currentData.percentage}% of goal</span>
                </div>
              </div>
            ) : (
              <div 
                ref={liveRevenueButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLiveRevenuePopoverOpen(!isLiveRevenuePopoverOpen);
                }}
                className="bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md p-2 rounded-[2px] border border-[#336699]/50 shadow-[0_0_10px_rgba(51,102,153,0.15)] cursor-pointer hover:from-[#336699]/30 hover:to-[#336699]/10 transition-all group"
                title={`Revenue: $${currentData.revenue.toLocaleString()} (${currentData.percentage}% of goal)`}
              >
                <div className="flex flex-col items-center justify-center">
                  <div className="text-[#336699] mb-1">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="text-white text-[10px] font-bold">
                    {currentData.percentage}%
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-1 mt-1">
                    <div 
                      className="bg-[#336699] h-1 rounded-full transition-all duration-300" 
                      style={{width: `${currentData.percentage}%`}}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                <button
                  onClick={() => {
                    navigate('/profile');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <span className="font-['Roboto']">Profile Settings</span>
                </button>
                
                <button
                  onClick={() => {
                    navigate('/settings/industries');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <span className="font-['Roboto']">Industry Settings</span>
                </button>
                
                <button
                  onClick={() => {
                    navigate('/settings/organization');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <span className="font-['Roboto']">Company Settings</span>
                </button>
                
                <button
                  onClick={() => {
                    navigate('/billing');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#3A3A3A] transition-colors duration-200"
                >
                  <span className="font-['Roboto']">Billing & Plan</span>
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
              className="w-full p-4 flex items-center hover:bg-[#252525] transition-colors duration-200 cursor-pointer group"
            >
              {/* User Info - only when sidebar expanded */}
              {!isSidebarCollapsed && (
                <div className="flex items-center flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate group-hover:text-[#EAB308] transition-colors">
                      {user?.user_metadata?.full_name || 'User'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      Admin • Pro Plan
                    </p>
                  </div>
                </div>
              )}

              {/* Avatar */}
              <div className={`${isSidebarCollapsed ? 'w-full' : 'ml-3'} flex items-center justify-center w-8 h-8 rounded-full bg-[#336699] text-white group-hover:bg-[#2A5580] transition-all`}>
                <span className="text-sm font-medium">
                  {(user?.user_metadata?.full_name || 'User').charAt(0).toUpperCase()}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}; 