import React, { useState, useEffect, useRef, createContext, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { QuickCreateButton } from '../common/QuickCreateButton';
import { QuickCreateMenu } from '../common/QuickCreateMenu';
import {
  Plus,
  Menu, 
  X, 
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  TrendingUp,
  DollarSign,
  Target,
  Clock,
  FileStack,
  Zap,
  AlertTriangle,
  ChevronUp,
  CheckCircle2,
  User,
  Settings,
  Building,
  CreditCard,
  HelpCircle,
  Search,
  UserPlus,
  UserCheck,
  UserX,
  Users,
  Activity
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { organizationsAPI } from '../../lib/api';
import { LineItemModal } from '../modals/LineItemModal';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileMenu } from './MobileMenu';
import { MobileCreateMenu } from './MobileCreateMenu';
import { PageHeaderBar } from '../common/PageHeaderBar';
// Supabase removed - using MongoDB
// import { supabase } from '../../lib/supabase';
import { ActivityPanel } from '../activity/ActivityPanel';
import { IndustryBanner } from '../common/IndustryBanner';
import { IndustryManagementDrawer } from '../common/IndustryManagementDrawer';

interface DashboardLayoutProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

// Add types for organizations
interface Organization {
  id: string;
  name: string;
  industry: string;
  industry_id?: string;
  role?: string;
  is_default?: boolean;
}

export const IndustryContext = createContext<{ selectedIndustry: string; setSelectedIndustry: (v: string) => void }>({ selectedIndustry: 'All Trades', setSelectedIndustry: () => {} });

// Context for selected organization
export const OrganizationContext = createContext<{ 
  selectedOrg: { id: string; name: string; industry: string; industry_id?: string }; 
  setSelectedOrg: (org: { id: string; name: string; industry: string; industry_id?: string }) => void;
}>({ 
  selectedOrg: { id: '', name: 'Loading...', industry: 'General Construction' }, 
  setSelectedOrg: () => {} 
});

// Context for mobile menu state
export const MobileMenuContext = createContext<{ isMobileMenuOpen: boolean; setIsMobileMenuOpen: (v: boolean) => void }>({ isMobileMenuOpen: false, setIsMobileMenuOpen: () => {} });

// Context for mobile create menu state
export const MobileCreateMenuContext = createContext<{ isCreateMenuOpen: boolean; setIsCreateMenuOpen: (v: boolean) => void }>({ isCreateMenuOpen: false, setIsCreateMenuOpen: () => {} });

// Context for layout constraints
export const LayoutContext = createContext<{ 
  isConstrained: boolean; 
  isMinimal: boolean;
  isCompact: boolean;
  isProjectsOpen: boolean;
  availableWidth: 'full' | 'constrained' | 'minimal' | 'compact';
}>({ 
  isConstrained: false, 
  isMinimal: false,
  isCompact: false,
  isProjectsOpen: false,
  availableWidth: 'full'
});

/** Whether the screen is at least Tailwind's md width, kept up to date as it changes. */
function useIsDesktop() {
  const query = '(min-width: 768px)';
  const [isDesktop, setIsDesktop] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(query).matches));
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setIsDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, fullWidth = false }) => {
  const { user, signOut, session, isLoading } = useAuth();
  const isAuthenticated = !!session;
  const location = useLocation();
  // The page renders once, in the desktop or the phone layout. Rendering it in
  // both (one hidden) ran every page twice and stacked two of each pop-up.
  const isDesktop = useIsDesktop();
  
  // Only show industry banner on pages where it's useful for filtering content
  const shouldShowIndustryBanner = 
    location.pathname === '/estimates' ||
    location.pathname === '/services' ||
    location.pathname === '/price-book' ||
    location.pathname.startsWith('/services/') ||
    location.pathname.startsWith('/price-book/');
  
  const shouldHideIndustryBanner = !shouldShowIndustryBanner;
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [showLineItemDrawer, setShowLineItemDrawer] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
    const [showActivityPanel, setShowActivityPanel] = useState(false);
    const navigate = useNavigate();
    const profileMenuRef = useRef<HTMLDivElement>(null);
  const [selectedIndustry, setSelectedIndustry] = useState('All Trades');
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [isProjectsSidebarOpen, setIsProjectsSidebarOpen] = useState(false);
  const [isProjectsSidebarClosing, setIsProjectsSidebarClosing] = useState(false);
  const [isProjectsSidebarLocked, setIsProjectsSidebarLocked] = useState(false);
  const [isIndustryDrawerOpen, setIsIndustryDrawerOpen] = useState(false);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<'D' | 'W' | 'M' | 'Q' | 'Y'>('D');
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isLiveRevenuePopoverOpen, setIsLiveRevenuePopoverOpen] = useState(false);
  const liveRevenueButtonRef = useRef<HTMLDivElement>(null);
  const liveRevenuePopoverRef = useRef<HTMLDivElement>(null);
  const projectsSidebarRef = useRef<HTMLDivElement>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [availableContentWidth, setAvailableContentWidth] = useState<'full' | 'constrained' | 'minimal' | 'compact'>('full');
  
  // Real organizations state
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; industry: string; industry_id: string }>>([]);
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string; industry: string; industry_id?: string }>({ 
    id: '', 
    name: 'Loading...', 
    industry: 'General Construction' 
  });
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // Load user's organizations
  useEffect(() => {
    
    const loadOrganizations = async () => {
      if (!user) {
        console.log('No user, skipping organization load');
        return;
      }
      
      try {
        setLoadingOrgs(true);
        console.log('Loading organizations for user:', user.id);
        
        // Organizations the signed-in user belongs to
        const orgsData = await organizationsAPI.list();
        
        // Transform to match expected format
        const formattedOrgs = orgsData.map((org: any) => ({
          id: org._id,
          name: org.name,
          industry: org.industryId || 'General Construction',
          industry_id: org.industryId || 'general-construction'
        }));
        
        console.log('Loaded organizations from API:', formattedOrgs);
        
        setOrganizations(formattedOrgs);
        
        // Set selected org to first one, or previously selected
        const savedOrgId = localStorage.getItem('selectedOrgId');
        const selected = formattedOrgs.find((o: any) => o.id === savedOrgId) || formattedOrgs[0];
        
        if (selected) {
          setSelectedOrg(selected);
          localStorage.setItem('selectedOrgId', selected.id);
        }
        
        setLoadingOrgs(false);
      } catch (error) {
        console.error('Error loading organizations:', error);
        setSelectedOrg({ 
          id: '', 
          name: 'Error Loading', 
          industry: 'General Construction',
          industry_id: ''
        });
        setLoadingOrgs(false);
      }
    };
    
    loadOrganizations();
  }, [user]);

  // Save selected org to localStorage when it changes
  useEffect(() => {
    if (selectedOrg.id) {
      localStorage.setItem('selectedOrgId', selectedOrg.id);
    }
  }, [selectedOrg]);

  // Listen for industry drawer state changes
  useEffect(() => {
    const handleIndustryDrawerStateChange = (event: CustomEvent) => {
      setIsIndustryDrawerOpen(event.detail.isOpen);
    };

    window.addEventListener('industryDrawerStateChange', handleIndustryDrawerStateChange as EventListener);
    return () => {
      window.removeEventListener('industryDrawerStateChange', handleIndustryDrawerStateChange as EventListener);
    };
  }, []);

  // Listen for projects sidebar close event
  useEffect(() => {
    const handleCloseProjectsSidebar = () => {
      setIsProjectsSidebarClosing(true);
      setTimeout(() => {
        setIsProjectsSidebarOpen(false);
        setIsProjectsSidebarClosing(false);
      }, 100);
    };

    window.addEventListener('closeProjectsSidebar', handleCloseProjectsSidebar);
    return () => {
      window.removeEventListener('closeProjectsSidebar', handleCloseProjectsSidebar);
    };
  }, []);

  // When the drawer closes, notify the banner to reset its state
  useEffect(() => {
    if (!isIndustryDrawerOpen) {
      window.dispatchEvent(new CustomEvent('industryDrawerClosed'));
    }
  }, [isIndustryDrawerOpen]);

  // Handle click outside for live revenue popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        liveRevenuePopoverRef.current && 
        !liveRevenuePopoverRef.current.contains(event.target as Node) &&
        liveRevenueButtonRef.current &&
        !liveRevenueButtonRef.current.contains(event.target as Node)
      ) {
        setIsLiveRevenuePopoverOpen(false);
      }
    };

    if (isLiveRevenuePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLiveRevenuePopoverOpen]);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path.startsWith('/clients')) return 'Clients';
    if (path.startsWith('/projects')) return 'Projects';
    if (path.startsWith('/products')) return 'Products';
    if (path.startsWith('/items')) return 'Price Book';
    if (path.startsWith('/price-book')) return 'Price Book';
    if (path.startsWith('/cost-codes')) return 'Price Book';
    if (path.startsWith('/leads')) return 'Leads';
    return 'Dashboard';
  };

  const moneyPulseData = {
    D: { revenue: 24500, profit: 7623, goal: 33500, percentage: 73 },
    W: { revenue: 127800, profit: 38340, goal: 150000, percentage: 85 },
    M: { revenue: 485200, profit: 145560, goal: 500000, percentage: 97 },
    Q: { revenue: 1425600, profit: 427680, goal: 1500000, percentage: 95 },
    Y: { revenue: 5234800, profit: 1570440, goal: 6000000, percentage: 87 }
  };

  const currentData = moneyPulseData[selectedTimePeriod];
  const timePeriodHeaders = {
    D: "Today's Revenue",
    W: "Week Revenue", 
    M: "Month Revenue",
    Q: "Quarter Revenue",
    Y: "Year Revenue"
  };

  const timePeriodLabels = {
    D: "Today's",
    W: "This Week's", 
    M: "This Month's",
    Q: "This Quarter's",
    Y: "This Year's"
  };

  const goalPeriodLabels = {
    D: "daily",
    W: "weekly", 
    M: "monthly",
    Q: "quarterly",
    Y: "yearly"
  };


  const cycleTimePeriod = () => {
    const periods: Array<'D' | 'W' | 'M' | 'Q' | 'Y'> = ['D', 'W', 'M', 'Q', 'Y'];
    const currentIndex = periods.indexOf(selectedTimePeriod);
    const nextIndex = (currentIndex + 1) % periods.length;
    setSelectedTimePeriod(periods[nextIndex]);
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when no input is focused and no modal is open
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.getAttribute('contenteditable') === 'true'
      );
      
      if (isInputFocused || showLineItemDrawer || showHelpModal) {
        return;
      }

      // Check for Cmd/Ctrl + key combinations
      if (e.metaKey || e.ctrlKey) {
        // ⌘K for quick create menu (this one is usually safe)
        if (e.key.toLowerCase() === 'k' && !e.shiftKey) {
          e.preventDefault();
          setIsCreateMenuOpen(!isCreateMenuOpen);
          return;
        }
        
        // All other shortcuts require Shift to avoid browser conflicts
        if (e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'e':
              e.preventDefault();
              setIsCreateMenuOpen(false);
              navigate('/work?new=1');
              break;
            case 'c':
              e.preventDefault();
              setIsCreateMenuOpen(false);
              navigate('/clients/new');
              break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, isCreateMenuOpen, showLineItemDrawer, showHelpModal]);

  useEffect(() => {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    const sidebarWidth = isProjectsSidebarOpen ? (isSidebarCollapsed ? 48 : 256) : 48;
    mainContent.style.marginLeft = `${sidebarWidth}px`;
  }, [isProjectsSidebarOpen, isSidebarCollapsed]);

  // Calculate actual available width for content
  const calculateAvailableWidth = useCallback(() => {
    if (typeof window === 'undefined') return 'full';
    
    const viewportWidth = window.innerWidth;
    const leftSpace = 0;
    const rightSpace = (() => {
      if (isProjectsSidebarLocked || isProjectsSidebarOpen) {
        return isSidebarCollapsed ? 368 : 512; // projects + main sidebar
      }
      return isSidebarCollapsed ? 48 : 192; // just main sidebar
    })();
    
    const availableSpace = viewportWidth - leftSpace - rightSpace;
    
    // Debug logging
    console.log('Layout calculation:', {
      viewportWidth,
      leftSpace,
      rightSpace,
      availableSpace,
      isProjectsSidebarLocked,
      isProjectsSidebarOpen,
      isSidebarCollapsed
    });
    
    // Adjusted breakpoints - more aggressive when projects sidebar is open
    const isProjectsOpen = isProjectsSidebarLocked || isProjectsSidebarOpen;
    
    // When projects sidebar is open, be much more conservative with space
    if (isProjectsOpen) {
      if (availableSpace < 700) return 'minimal';      // Switch to minimal sooner when projects open
      if (availableSpace < 900) return 'constrained';  // Cramped when projects open  
      if (availableSpace < 1100) return 'compact';     // Slightly tight when projects open
    } else {
      // Normal breakpoints when projects sidebar is closed
      if (availableSpace < 400) return 'minimal';      // Very cramped
      if (availableSpace < 600) return 'constrained';  // Cramped
      if (availableSpace < 800) return 'compact';      // Slightly tight
    }
    
    return 'full';                                   // Full width - show everything
  }, [isProjectsSidebarLocked, isProjectsSidebarOpen, isSidebarCollapsed]);

  // Update available width when dependencies change
  useEffect(() => {
    const updateWidth = () => {
      setAvailableContentWidth(calculateAvailableWidth());
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    
    return () => window.removeEventListener('resize', updateWidth);
  }, [calculateAvailableWidth]);

  const isConstrained = availableContentWidth === 'constrained' || availableContentWidth === 'minimal';
  const isMinimal = availableContentWidth === 'minimal';
  const isCompact = availableContentWidth === 'compact';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  const setSidebarCollapsedWithLogging = (value: boolean | ((prev: boolean) => boolean)) => {
    const newValue = typeof value === 'function' ? value(isSidebarCollapsed) : value;
    console.log('Sidebar state changing:', { from: isSidebarCollapsed, to: newValue, stack: new Error().stack });
    setIsSidebarCollapsed(value);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newValue));
  };

  const setProjectsSidebarLockedWithPersistence = (value: boolean) => {
    setIsProjectsSidebarLocked(value);
    localStorage.setItem('projectsSidebarLocked', JSON.stringify(value));
  };

  const calculateContentClass = () => {
    let classes = 'flex-1 pt-14 md:pt-0 pb-16 md:pb-0 transition-all duration-300 ease-out';
    
    if (isSidebarCollapsed) {
      classes += isProjectsSidebarLocked ? ' md:mr-[22rem]' : ' md:mr-14';
    } else {
      classes += isProjectsSidebarLocked ? ' md:mr-[32rem]' : ' md:mr-48';
    }
    
    return classes;
  };
  
  return (
    <IndustryContext.Provider value={{ selectedIndustry, setSelectedIndustry }}>
      <OrganizationContext.Provider value={{ selectedOrg, setSelectedOrg }}>
        <MobileMenuContext.Provider value={{ isMobileMenuOpen, setIsMobileMenuOpen }}>
          <MobileCreateMenuContext.Provider value={{ isCreateMenuOpen, setIsCreateMenuOpen }}>
            <LayoutContext.Provider value={{ 
              isConstrained: isConstrained, 
              isMinimal: isMinimal,
              isCompact: isCompact,
              isProjectsOpen: isProjectsSidebarLocked || isProjectsSidebarOpen,
              availableWidth: availableContentWidth
            }}>
              <div className="min-h-[100dvh] bg-[#000000] flex overflow-x-hidden">
                  <MobileHeader
                    onMenuClick={() => setIsMobileMenuOpen(true)}
                    onCreateClick={() => setIsCreateMenuOpen(true)}
                    title={getPageTitle()}
                  />

                  {/* Quick Create Menu */}
                  <QuickCreateButton 
                    isOpen={isCreateMenuOpen} 
                    onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
                    isSidebarCollapsed={isSidebarCollapsed}
                    isProjectsSidebarLocked={isProjectsSidebarLocked}
                    isProjectsSidebarOpen={isProjectsSidebarOpen}
                    isIndustryDrawerOpen={isIndustryDrawerOpen}
                    hidden={/^\/estimates\/[^/]+/.test(location.pathname)}
                  >
                    <QuickCreateMenu 
                      isOpen={isCreateMenuOpen} 
                      onClose={() => setIsCreateMenuOpen(false)} 
                    />
                  </QuickCreateButton>

                  {/* Desktop Layout Container */}
                  <div className="hidden md:grid w-full h-[100dvh] overflow-hidden" 
                    style={{
                      gridTemplateColumns: `minmax(400px, 1fr) ${isIndustryDrawerOpen ? '400px' : '0px'} ${(isProjectsSidebarLocked || isProjectsSidebarOpen || isProjectsSidebarClosing) ? '320px' : '0px'} ${isSidebarCollapsed ? '48px' : '192px'}`,
                      transition: 'grid-template-columns 100ms ease-out'
                    }}
                  >
                    {/* Main Content Area */}
                    <div className="min-h-full overflow-y-auto">
                      {/* Industry Banner - Hidden on estimate detail pages */}
                      {!shouldHideIndustryBanner && <IndustryBanner />}
                      <div className={`min-h-full ${fullWidth ? '' : 'max-w-5xl mx-auto px-4'}`}>
                        {isDesktop && children}
                      </div>
                    </div>
                    
                    {/* Industry Management Drawer */}
                    <div 
                      className={`h-[100dvh] bg-[#1F2937] transition-all duration-200 ${
                        isIndustryDrawerOpen ? 'w-[400px] border-l border-[#374151]' : 'w-0 overflow-hidden'
                      }`}
                    >
                      <IndustryManagementDrawer 
                        isOpen={isIndustryDrawerOpen} 
                        onClose={() => setIsIndustryDrawerOpen(false)} 
                      />
                    </div>
                    
                    {/* Grid column the projects pane used to fill */}
                    <div ref={projectsSidebarRef} className="w-0" />

                    {/* Main Sidebar */}
                    <Sidebar
                      isSidebarCollapsed={isSidebarCollapsed}
                      setSidebarCollapsedWithLogging={setSidebarCollapsedWithLogging}
                      orgDropdownOpen={orgDropdownOpen}
                      setOrgDropdownOpen={setOrgDropdownOpen}
                      selectedOrg={selectedOrg}
                      setSelectedOrg={setSelectedOrg}
                      organizations={organizations}
                      isProjectsSidebarOpen={isProjectsSidebarOpen}
                      setIsProjectsSidebarOpen={setIsProjectsSidebarOpen}
                      isProjectsSidebarLocked={isProjectsSidebarLocked}
                      setProjectsSidebarLockedWithPersistence={setProjectsSidebarLockedWithPersistence}
                      selectedTimePeriod={selectedTimePeriod}
                      setSelectedTimePeriod={setSelectedTimePeriod}
                      currentData={currentData}
                      timePeriodHeaders={timePeriodHeaders}
                      isLiveRevenuePopoverOpen={isLiveRevenuePopoverOpen}
                      setIsLiveRevenuePopoverOpen={setIsLiveRevenuePopoverOpen}
                      liveRevenueButtonRef={liveRevenueButtonRef}
                      isProfileMenuOpen={isProfileMenuOpen}
                      setIsProfileMenuOpen={setIsProfileMenuOpen}
                      setShowHelpModal={setShowHelpModal}
                      onActivityClick={() => setShowActivityPanel(true)}
                    />
                  </div>

                  {/* Mobile Layout - unchanged */}
                  <div className="md:hidden flex-1 pt-14 pb-16">
                    <div className="px-4">
                      {!isDesktop && children}
                    </div>
                  </div>

                  {isLiveRevenuePopoverOpen && (
                    <div 
                      ref={liveRevenuePopoverRef}
                      className={`fixed ${
                        isSidebarCollapsed 
                          ? 'right-16' 
                          : 'right-52'
                      } bottom-32 w-64 bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 backdrop-blur-md rounded-lg border border-[#336699]/50 shadow-[0_0_10px_rgba(51,102,153,0.15)] z-[10000] p-4`}
                      style={{ 
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      <div className="mb-3">
                        <h3 className="text-white/90 text-sm font-medium mb-3">{timePeriodHeaders[selectedTimePeriod]}</h3>
                        
                        <div className="text-white text-2xl font-bold mb-2">
                          ${currentData.revenue.toLocaleString()}
                        </div>
                        
                        <div className="flex items-center justify-start space-x-1 mb-3">
                          {(['D', 'W', 'M', 'Q', 'Y'] as const).map((period) => (
                            <button
                              key={period}
                              onClick={() => setSelectedTimePeriod(period)}
                              className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-colors ${
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

                      <div className="flex items-center justify-between text-sm mb-3">
                        <div className="flex items-center text-green-300">
                          <span className="mr-1">↗</span>
                          <span>up 12% • Profit: ${currentData.profit.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="w-full bg-white/20 rounded-full h-2">
                          <div 
                            className="bg-[#336699] h-2 rounded-full transition-all duration-300" 
                            style={{width: `${currentData.percentage}%`}}
                          ></div>
                        </div>
                      </div>

                      <div className="text-center">
                        <span className="text-white/90 text-sm">{currentData.percentage}% of {goalPeriodLabels[selectedTimePeriod]} goal (${(currentData.revenue / (currentData.percentage / 100)).toLocaleString()})</span>
                      </div>
                    </div>
                  )}

                  {showLineItemDrawer && (
                    <LineItemModal
                      onClose={() => setShowLineItemDrawer(false)}
                      onSave={async (data) => {
                        console.log('New line item created:', data);
                        setShowLineItemDrawer(false);
                        // Could refresh data here if needed
                      }}
                    />
                  )}

                  {showHelpModal && (
                    <div className="fixed inset-0 z-[11000] flex items-center justify-center">
                      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowHelpModal(false)} />
                      <div className="relative bg-[#1E1E1E] rounded-[4px] shadow-xl border border-[#333333] w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-[#333333]">
                          <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Help & Tutorials</h2>
                            <p className="text-gray-400">Learn how to use each section of your construction business app</p>
                          </div>
                          <button
                            onClick={() => setShowHelpModal(false)}
                            className="text-gray-400 hover:text-white transition-colors"
                          >
                            <X className="w-6 h-6" />
                          </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                          <div className="mb-8">
                            <h3 className="text-white font-bold mb-4">
                              Quick Start Tutorials
                            </h3>
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div className="bg-[#333333] rounded-[4px] p-4 border border-[#404040] hover:border-[#336699] transition-colors cursor-pointer"
                                   onClick={() => {
                                     setShowHelpModal(false);
                                     navigate('/clients?tutorial=true');
                                   }}>
                                <div className="flex items-center mb-3">
                                  <div className="w-10 h-10 bg-[#336699] rounded-[4px] flex items-center justify-center mr-3">
                                    <span className="text-base">👤</span>
                                  </div>
                                  <div>
                                    <h4 className="text-white font-medium">Client Management</h4>
                                    <p className="text-gray-400 text-sm">3 min tutorial</p>
                                  </div>
                                </div>
                                <p className="text-gray-300 text-sm mb-3">
                                  Learn how to add clients, track their project history, and manage relationships.
                                </p>
                                <div className="flex items-center text-[#336699] text-sm font-medium">
                                  <span>Start Tutorial</span>
                                  <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                              </div>

                              <div className="bg-[#333333] rounded-[4px] p-4 border border-[#404040] hover:border-[#336699] transition-colors cursor-pointer"
                                   onClick={() => {
                                     setShowHelpModal(false);
                                     navigate('/projects?tutorial=true');
                                   }}>
                                <div className="flex items-center mb-3">
                                  <div className="w-10 h-10 bg-[#336699] rounded-[4px] flex items-center justify-center mr-3">
                                    <span className="text-base">📁</span>
                                  </div>
                                  <div>
                                    <h4 className="text-white font-medium">Project Management</h4>
                                    <p className="text-gray-400 text-sm">4 min tutorial</p>
                                  </div>
                                </div>
                                <p className="text-gray-300 text-sm mb-3">
                                  Create projects, track progress, manage budgets, and keep everything organized.
                                </p>
                                <div className="flex items-center text-[#336699] text-sm font-medium">
                                  <span>Start Tutorial</span>
                                  <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                              </div>

                              <div className="bg-[#333333] rounded-[4px] p-4 border border-[#404040] hover:border-[#336699] transition-colors cursor-pointer"
                                   onClick={() => {
                                     setShowHelpModal(false);
                                     navigate('/products?tutorial=true');
                                   }}>
                                <div className="flex items-center mb-3">
                                  <div className="w-10 h-10 bg-[#336699] rounded-[4px] flex items-center justify-center mr-3">
                                    <span className="text-base">📦</span>
                                  </div>
                                  <div>
                                    <h4 className="text-white font-medium">Product Catalog</h4>
                                    <p className="text-gray-400 text-sm">6 min tutorial</p>
                                  </div>
                                </div>
                                <p className="text-gray-300 text-sm mb-3">
                                  Build your product catalog with materials, labor, and services.
                                </p>
                                <div className="flex items-center text-[#336699] text-sm font-medium">
                                  <span>Start Tutorial</span>
                                  <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                              </div>

                              <div className="bg-[#333333] rounded-[4px] p-4 border border-[#404040] hover:border-[#336699] transition-colors cursor-pointer"
                                   onClick={() => {
                                     setShowHelpModal(false);
                                     navigate('/price-book?tutorial=true');
                                   }}>
                                <div className="flex items-center mb-3">
                                  <div className="w-10 h-10 bg-[#336699] rounded-[4px] flex items-center justify-center mr-3">
                                    <span className="text-base">📘</span>
                                  </div>
                                  <div>
                                    <h4 className="text-white font-medium">Price Book</h4>
                                    <p className="text-gray-400 text-sm">7 min tutorial</p>
                                  </div>
                                </div>
                                <p className="text-gray-300 text-sm mb-3">
                                  Build your competitive advantage with a comprehensive price book.
                                </p>
                                <div className="flex items-center text-[#336699] text-sm font-medium">
                                  <span>Start Tutorial</span>
                                  <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                              </div>

                              <div className="bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 rounded-[4px] p-4 border border-[#336699]/50 cursor-pointer"
                                   onClick={() => {
                                     setShowHelpModal(false);
                                     navigate('/clients?tutorial=true');
                                   }}>
                                <div className="flex items-center mb-3">
                                  <div className="w-10 h-10 bg-[#F9D71C] rounded-[4px] flex items-center justify-center mr-3">
                                    <span className="text-base">⠿</span>
                                  </div>
                                  <div>
                                    <h4 className="text-white font-medium">Complete Walkthrough</h4>
                                    <p className="text-gray-400 text-sm">15 min full tour</p>
                                  </div>
                                </div>
                                <p className="text-gray-300 text-sm mb-3">
                                  Take a complete tour through all features and see how they work together.
                                </p>
                                <div className="flex items-center text-[#F9D71C] text-sm font-medium">
                                  <span>Start Full Tour</span>
                                  <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mb-8">
                            <h3 className="text-white font-bold mb-4 flex items-center">
                              <span className="text-[#336699] mr-2">📚</span>
                              Additional Resources
                            </h3>
                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="bg-[#333333] rounded-[4px] p-4 border border-[#404040]">
                                <h4 className="text-white font-medium mb-2">Video Library</h4>
                                <p className="text-gray-300 text-sm mb-3">
                                  Access our complete library of construction business tutorials and best practices.
                                </p>
                                <button className="text-[#336699] text-sm font-medium hover:text-white transition-colors">
                                  Browse Videos →
                                </button>
                              </div>
                              
                              <div className="bg-[#333333] rounded-[4px] p-4 border border-[#404040]">
                                <h4 className="text-white font-medium mb-2">Knowledge Base</h4>
                                <p className="text-gray-300 text-sm mb-3">
                                  Find answers to common questions and detailed feature documentation.
                                </p>
                                <button className="text-[#336699] text-sm font-medium hover:text-white transition-colors">
                                  Search Articles →
                                </button>
                              </div>
                              
                              <div className="bg-[#333333] rounded-[4px] p-4 border border-[#404040]">
                                <h4 className="text-white font-medium mb-2">Live Support</h4>
                                <p className="text-gray-300 text-sm mb-3">
                                  Get help from our construction industry experts via chat or phone.
                                </p>
                                <button className="text-[#336699] text-sm font-medium hover:text-white transition-colors">
                                  Contact Support →
                                </button>
                              </div>
                              
                            </div>
                          </div>

                          <div className="bg-[#1E1E1E] rounded-[4px] p-4 border border-[#333333]">
                            <h3 className="text-white font-bold mb-3 flex items-center">
                              <span className="text-[#9E9E9E] mr-2">🔄</span>
                              Reset Tutorials
                            </h3>
                            <p className="text-gray-400 text-sm mb-4">
                              Want to see the onboarding tutorials again? You can reset them to show up on each page.
                            </p>
                            <button 
                              onClick={() => {
                                localStorage.removeItem('clientsOnboardingCompleted');
                                localStorage.removeItem('projectsOnboardingCompleted');
                                localStorage.removeItem('productsOnboardingCompleted');
                                localStorage.removeItem('priceBookOnboardingCompleted');
                                setShowHelpModal(false);
                                window.location.reload();
                              }}
                              className="bg-white text-black px-4 py-2 rounded-[8px] hover:bg-gray-100 transition-colors font-medium"
                            >
                              Reset All Tutorials
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <MobileMenu
                    isOpen={isMobileMenuOpen}
                    onClose={() => setIsMobileMenuOpen(false)}
                    selectedOrg={selectedOrg}
                    organizations={organizations}
                    onOrgChange={setSelectedOrg}
                    onShowHelp={() => setShowHelpModal(true)}
                  />

                  <MobileCreateMenu
                    isOpen={isCreateMenuOpen}
                    onClose={() => setIsCreateMenuOpen(false)}
                    onCreateClient={() => navigate('/clients/new')}
                    onCreateLineItem={() => setShowLineItemDrawer(true)}
                  />

                {/* Activity Panel */}
                <ActivityPanel 
                  isOpen={showActivityPanel} 
                  onClose={() => setShowActivityPanel(false)} 
                />
                </div>
            </LayoutContext.Provider>
          </MobileCreateMenuContext.Provider>
        </MobileMenuContext.Provider>
      </OrganizationContext.Provider>
    </IndustryContext.Provider>
  );
};