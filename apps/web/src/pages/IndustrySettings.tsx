import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Settings, Info, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { IndustryService } from '../services/IndustryService';

interface Industry {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
}

// Helper functions for dynamic messages
const getLoadingMessage = (industryName: string): string => {
  const messages: Record<string, string[]> = {
    'General Construction': [
      'Building foundation systems...',
      'Mixing concrete templates...',
      'Raising the framework...',
      'Hammering out the details...',
      'Blueprinting your success...',
      'Constructing project pipelines...',
      'Laying the cornerstone...',
      'Framing up workflows...'
    ],
    'Electrical': [
      'Wiring up electrical frameworks...',
      'Charging up the circuits...',
      'Flipping the power switches...',
      'Connecting the grid...',
      'Sparking new workflows...',
      'Amping up capabilities...',
      'Illuminating pathways...',
      'Energizing systems...'
    ],
    'Plumbing': [
      'Connecting plumbing networks...',
      'Turning on the taps...',
      'Pressure testing pipelines...',
      'Flowing into position...',
      'Plumbing the depths...',
      'Unclogging workflows...',
      'Fitting the pieces together...',
      'Opening the valves...'
    ],
    'HVAC': [
      'Installing climate controls...',
      'Adjusting the thermostat...',
      'Calibrating air flow...',
      'Cooling down processes...',
      'Heating up productivity...',
      'Ventilating ideas...',
      'Balancing the atmosphere...',
      'Circulating fresh workflows...'
    ],
    'Landscaping': [
      'Planting project templates...',
      'Cultivating green spaces...',
      'Watering the garden...',
      'Trimming the hedges...',
      'Seeding new ideas...',
      'Growing your toolkit...',
      'Landscaping possibilities...',
      'Fertilizing workflows...'
    ],
    'Roofing': [
      'Raising the roof structure...',
      'Shingling up systems...',
      'Weatherproofing workflows...',
      'Nailing down details...',
      'Climbing to new heights...',
      'Sealing the envelope...',
      'Installing skylights...',
      'Topping off projects...'
    ],
    'Kitchen Remodeling': [
      'Designing culinary workspaces...',
      'Installing the countertops...',
      'Cooking up fresh ideas...',
      'Stirring in new features...',
      'Seasoning the workflow...',
      'Prepping the kitchen...',
      'Plating perfection...',
      'Firing up the range...'
    ],
    'Bathroom Remodeling': [
      'Crafting spa experiences...',
      'Tiling the possibilities...',
      'Installing luxury fixtures...',
      'Polishing the details...',
      'Creating oasis spaces...',
      'Refreshing the suite...',
      'Waterproofing systems...',
      'Reflecting perfection...'
    ],
    'Flooring': [
      'Laying down the groundwork...',
      'Polishing the surface...',
      'Installing foundations...',
      'Leveling the playing field...',
      'Rolling out carpets...',
      'Grouting the gaps...',
      'Sanding smooth workflows...',
      'Stepping up quality...'
    ],
    'Solar': [
      'Harnessing energy systems...',
      'Capturing sunlight...',
      'Charging the batteries...',
      'Converting rays to results...',
      'Powering up panels...',
      'Going off the grid...',
      'Storing sunshine...',
      'Maximizing efficiency...'
    ],
    'Property Management': [
      'Organizing property portfolios...',
      'Unlocking tenant tools...',
      'Managing the keys...',
      'Scheduling inspections...',
      'Collecting rent rolls...',
      'Maintaining excellence...',
      'Securing properties...',
      'Balancing the books...'
    ],
    'Real Estate Investment': [
      'Building investment frameworks...',
      'Calculating ROI tools...',
      'Closing deal workflows...',
      'Analyzing market data...',
      'Leveraging opportunities...',
      'Flipping success switches...',
      'Appreciating assets...',
      'Diversifying portfolios...'
    ]
  };
  
  const industryMessages = messages[industryName] || [`Activating ${industryName} toolkit...`];
  // Pick a random message from the array
  const randomIndex = Math.floor(Math.random() * industryMessages.length);
  return industryMessages[randomIndex];
};

export default function IndustrySettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(new Set());
  const [primaryIndustryId, setPrimaryIndustryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [planData, setPlanData] = useState<{
    planName: string;
    industryLimit: number | null;
    currentCount: number;
    canAddMore: boolean;
  } | null>(null);
  
  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  
  // Clean up toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedOrg?.id) {
      loadIndustries();
    }
  }, [user, selectedOrg]);

  const loadIndustries = async () => {
    if (!user || !selectedOrg?.id) return;

    try {
      const [allIndustries, orgIndustries, planResult] = await Promise.all([
        IndustryService.listAll(),
        IndustryService.getOrganizationIndustries(selectedOrg.id),
        IndustryService.getOrganizationPlan(selectedOrg.id)
      ]);

      setIndustries(allIndustries as Industry[]);
      setPrimaryIndustryId(null);
      setPlanData(planResult);

      const selected = new Set(orgIndustries.map(industry => industry.id));
      setSelectedIndustries(selected);
    } catch (error) {
      console.error('Error loading industries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleIndustry = async (industryId: string) => {
    if (industryId === primaryIndustryId) {
      return;
    }
    
    const newSelected = new Set(selectedIndustries);
    const isAdding = !newSelected.has(industryId);
    
    // Optimistically update UI
    if (isAdding) {
      newSelected.add(industryId);
    } else {
      newSelected.delete(industryId);
    }
    setSelectedIndustries(newSelected);
    
    // Emit event for banner update
    const industry = industries.find(ind => ind.id === industryId);
    if (industry) {
      window.dispatchEvent(new CustomEvent('industryUpdate', {
        detail: {
          action: isAdding ? 'add' : 'remove',
          organizationId: selectedOrg.id,
          industryId: industryId,
          industry: isAdding ? {
            id: industry.id,
            name: industry.name,
            slug: industry.slug,
            icon: industry.icon,
            color: industry.color,
            organizationId: selectedOrg.id,
            organizationName: selectedOrg.name
          } : undefined
        }
      }));
    }
    
    // Show contextual loading message
    if (industry && isAdding) {
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      
      setLoadingMessage(getLoadingMessage(industry.name));
      setToastVisible(true);
    }
    
    try {
      if (isAdding) {
        await IndustryService.addToOrganization(selectedOrg.id, industryId);
      } else {
        await IndustryService.removeFromOrganization(selectedOrg.id, industryId);
      }
    } catch (error) {
      console.error('Error updating industry:', error);
      // Revert on error
      const revertedSelected = new Set(selectedIndustries);
      if (isAdding) {
        revertedSelected.delete(industryId);
      } else {
        revertedSelected.add(industryId);
      }
      setSelectedIndustries(revertedSelected);
    } finally {
      // Only set timeout if we're adding (showing toast)
      if (isAdding) {
        // Keep toast visible for much longer, then fade out
        toastTimeoutRef.current = setTimeout(() => {
          setToastVisible(false);
          // Clean up message after fade animation completes
          setTimeout(() => {
            setLoadingMessage('');
          }, 500);
        }, 6000);
      }
    }
  };

  const filteredIndustries = industries.filter(industry =>
    industry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    industry.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Helper function to highlight search terms
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part) => 
      part.toLowerCase() === query.toLowerCase() ? 
        `<mark class="bg-yellow-600 bg-opacity-30 text-white">${part}</mark>` : 
        part
    ).join('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A]">
        {/* Skeleton loader matching final layout */}
        <div className="bg-[#0A0A0A] border-b border-[#333333]">
          <div className="px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 bg-[#252525] rounded-lg animate-pulse"></div>
              <div>
                <div className="h-6 w-48 bg-[#252525] rounded animate-pulse mb-2"></div>
                <div className="h-4 w-64 bg-[#252525] rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="bg-[#1a1a1a] rounded-lg max-w-7xl mx-auto">
            <div className="p-6 border-b border-[#333333]">
              <div className="h-12 w-full bg-[#252525] rounded-lg animate-pulse"></div>
            </div>
            <div className="divide-y divide-[#333333]">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="py-8 px-6">
                  <div className="flex items-center gap-4">
                    <div className="w-6 h-6 bg-[#252525] rounded animate-pulse"></div>
                    <div className="flex-1">
                      <div className="h-5 w-32 bg-[#252525] rounded animate-pulse mb-2"></div>
                      <div className="h-4 w-48 bg-[#252525] rounded animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen -mx-6">
      {/* Toast notification */}
      {loadingMessage && (
        <div className={`fixed bottom-4 right-4 z-[9999] transition-all duration-500 ${
          toastVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-2'
        }`}>
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-lg px-4 py-3 flex items-center gap-3 shadow-xl shadow-emerald-500/20">
            <CheckCircle className="w-5 h-5 text-white" />
            <span className="text-sm text-white font-medium">{loadingMessage}</span>
          </div>
        </div>
      )}
      {/* Header - Full width between nav boundaries */}
      <div className="bg-[#0A0A0A] border-b border-[#333333]">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-[#252525] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Industry Settings</h1>
              <p className="text-sm text-gray-500">
                Select industries for {selectedOrg?.name || 'organization'}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content Container */}
      <div className="bg-[#0A0A0A] px-6 py-6">
        {/* Content Card */}
        <div className="bg-[#1a1a1a] rounded-lg max-w-7xl mx-auto">
          {/* Search and Info Section */}
          <div className="p-6 border-b border-[#333333]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-white">Available Industries</h2>
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className="p-1 hover:bg-[#252525] rounded-lg transition-colors group relative"
                >
                  <Info className="w-4 h-4 text-gray-400 group-hover:text-white" />
                </button>
              </div>
              <div className="flex flex-col items-end">
                <div className="text-sm text-gray-400">{selectedIndustries.size} selected</div>
              </div>
            </div>
            
            {/* Collapsible help section */}
            {showHelp && (
              <div className="mb-4 p-4 bg-[#0A0A0A] rounded-lg border border-[#333333] animate-in slide-in-from-top duration-200">
                <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#336699]" />
                  How Industries Work
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  Selecting industries customizes your experience by:
                </p>
                <ul className="space-y-1 text-sm text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-[#336699] mt-0.5">•</span>
                    <span>Showing relevant project types and templates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#336699] mt-0.5">•</span>
                    <span>Providing industry-specific work packs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#336699] mt-0.5">•</span>
                    <span>Tailoring product catalogs and pricing</span>
                  </li>
                </ul>
              </div>
            )}
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search industries... (Press / to focus)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    e.currentTarget.blur();
                  }
                }}
                className="w-full pl-10 pr-4 py-3 bg-[#0A0A0A] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  ×
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-sm text-gray-400 mt-2">
                Showing {filteredIndustries.length} of {industries.length} industries
              </p>
            )}
          </div>

          {/* Industries List */}
          <div className="divide-y divide-[#333333]">
            {filteredIndustries.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 mb-2">No industries found matching "{searchQuery}"</p>
                <p className="text-sm text-gray-500">Try searching for: Construction, Electrical, or Plumbing</p>
              </div>
            ) : (
              filteredIndustries.map((industry) => {
                const isSelected = selectedIndustries.has(industry.id);
                const isPrimary = industry.id === primaryIndustryId;

                return (
                  <div
                    key={industry.id}
                    className={`py-8 px-6 transition-all duration-200 relative ${
                      isPrimary ? 'opacity-75' : 'hover:bg-[#252525] cursor-pointer'
                    } ${
                      isSelected && !isPrimary ? 'bg-[#1a1a1a] border-l-2 border-l-[#336699]' : ''
                    }`}
                    onClick={() => !isPrimary && (isSelected || planData?.canAddMore) && toggleIndustry(industry.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Enhanced Checkbox */}
                        <div 
                          className={`relative w-6 h-6 rounded-md ${
                            isSelected ? 'bg-[#336699]' : 'bg-[#0A0A0A] border-2 border-[#333333]'
                          } transition-all duration-200 hover:scale-110 hover:shadow-lg`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isPrimary && (isSelected || planData?.canAddMore)) {
                              toggleIndustry(industry.id);
                            }
                          }}
                        >
                          {isSelected && (
                            <CheckCircle className="w-5 h-5 text-white absolute inset-0 m-auto" strokeWidth={2.5} />
                          )}
                        </div>

                        {/* Industry Info */}
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 
                                className="text-white font-medium"
                                dangerouslySetInnerHTML={{ 
                                  __html: highlightText(industry.name, searchQuery) 
                                }}
                              />
                              {isPrimary && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-amber-600 text-white rounded">
                                  Primary
                                </span>
                              )}
                            </div>
                            <p 
                              className="text-sm text-gray-400 mt-1"
                              dangerouslySetInnerHTML={{ 
                                __html: highlightText(industry.description, searchQuery) 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom info bar */}
          <div className="p-4 bg-[#0A0A0A] border-t border-[#333333] flex items-center justify-between">
            <div className="text-sm text-gray-400">
              {selectedIndustries.size > 0 ? (
                <span>You've selected {selectedIndustries.size} {selectedIndustries.size === 1 ? 'industry' : 'industries'}</span>
              ) : (
                <span>Select industries to customize your experience</span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Press <kbd className="px-1.5 py-0.5 bg-[#252525] rounded border border-[#333333]">/</kbd> to search
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 