import React, { useState, useEffect, useContext } from 'react';
import { Settings, ChevronDown, ChevronUp, Building } from 'lucide-react';
import { IndustryService } from '../../services/IndustryService';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { IndustryManagementModal } from './IndustryManagementModal';

interface Industry {
  id: string;
  name: string;
  slug: string;
  icon?: string;
}

export const IndustryBanner: React.FC = () => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [primaryIndustry, setPrimaryIndustry] = useState<Industry | null>(null);
  const [secondaryIndustries, setSecondaryIndustries] = useState<Industry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompact, setIsCompact] = useState(() => {
    // Remember compact state in localStorage
    return localStorage.getItem('industryBannerCompact') === 'true';
  });

  useEffect(() => {
    if (user && selectedOrg?.id) {
      loadIndustries();
    }
  }, [user, selectedOrg]);

  useEffect(() => {
    const handleIndustryUpdate = () => {
      loadIndustries();
    };

    window.addEventListener('industryUpdate', handleIndustryUpdate);
    return () => window.removeEventListener('industryUpdate', handleIndustryUpdate);
  }, []);

  const loadIndustries = async () => {
    if (!user || !selectedOrg?.id) return;

    try {
      setIsLoading(true);
      
      // No primary trade in Convex yet; every chosen trade is listed.
      setPrimaryIndustry(null);
      const secondaries = await IndustryService.getOrganizationIndustries(selectedOrg.id);
      setSecondaryIndustries(secondaries);
    } catch (error) {
      console.error('Error loading industries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCompact = () => {
    const newCompact = !isCompact;
    setIsCompact(newCompact);
    localStorage.setItem('industryBannerCompact', newCompact.toString());
  };

  // Dispatch event when modal state changes
  useEffect(() => {
    const event = new CustomEvent('industryModalToggle', { 
      detail: { isOpen: showManagementModal } 
    });
    window.dispatchEvent(event);
  }, [showManagementModal]);

  // Don't show banner if no industries selected
  if (!primaryIndustry && secondaryIndustries.length === 0) {
    if (isLoading) return null; // Don't show anything while loading
    
    // Show prompt to select industries
    return (
      <div className="bg-[#1A1A1A]/80 backdrop-blur-xl backdrop-saturate-150 border-b border-[#333333]/50 relative z-40">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-400">No industries selected</span>
          </div>
          <button
            onClick={() => setShowManagementModal(true)}
            className="text-xs text-[#3B82F6] hover:text-[#60A5FA] transition-colors flex items-center gap-1"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Select Industries</span>
          </button>
        </div>
        
        <IndustryManagementModal
          isOpen={showManagementModal}
          onClose={() => setShowManagementModal(false)}
        />
      </div>
    );
  }

  const activeIndustries = [
    ...(primaryIndustry ? [primaryIndustry] : []),
    ...secondaryIndustries
  ];

  const displayedIndustries = isExpanded ? activeIndustries : activeIndustries.slice(0, 3);
  const hiddenCount = activeIndustries.length - 3;

  // Compact view - single line with abbreviated names
  if (isCompact) {
    return (
      <div className="bg-[#1A1A1A]/80 backdrop-blur-xl backdrop-saturate-150 border-b border-[#333333]/50 relative z-40 sticky top-0">
        <div className="px-6 py-1 flex items-center justify-between gap-3 overflow-hidden">
          <button
            onClick={toggleCompact}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 flex-shrink-0"
            title="Expand to full view"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          
          <div className="flex-1 overflow-x-auto scrollbar-hide relative" style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}>
            {/* Left fade indicator */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#1A1A1A]/80 to-transparent pointer-events-none z-10" />
            
            {/* Right fade indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#1A1A1A]/80 to-transparent pointer-events-none z-10" />
            
            <div className="flex items-center gap-2 text-xs px-2">
              {activeIndustries.map((industry, index) => (
                <React.Fragment key={industry.id}>
                  {index > 0 && <span className="text-gray-600 flex-shrink-0">•</span>}
                  <div 
                    className={`flex items-center gap-1 transition-colors cursor-default flex-shrink-0 ${
                      industry.id === primaryIndustry?.id 
                        ? 'text-[#60A5FA]' 
                        : 'text-gray-400 hover:text-gray-300'
                    }`} 
                    title={industry.name}
                  >
                    <span className="whitespace-nowrap">{industry.name}</span>
                    {industry.id === primaryIndustry?.id && (
                      <span className="text-[9px] text-[#3B82F6] ml-0.5">(P)</span>
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
          
          <button
            onClick={() => setShowManagementModal(true)}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 flex-shrink-0"
            title="Manage Industries"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
        
        <IndustryManagementModal
          isOpen={showManagementModal}
          onClose={() => setShowManagementModal(false)}
        />
      </div>
    );
  }

  // Full view
  return (
    <div className="bg-[#1A1A1A]/80 backdrop-blur-xl backdrop-saturate-150 border-b border-[#333333]/50 relative z-40 sticky top-0">
      <div className="px-6 py-3 flex items-center gap-2">
        {/* Collapse button */}
        <button
          onClick={toggleCompact}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1 flex-shrink-0"
          title="Collapse to compact view"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        
        {/* Industries container with flex-1 to take remaining space */}
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          {displayedIndustries.map((industry, index) => (
            <div
              key={industry.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                industry.id === primaryIndustry?.id
                  ? 'bg-transparent border border-[#3B82F6] text-[#60A5FA]'
                  : 'bg-[#333333] text-gray-300 hover:bg-[#404040]'
              }`}
            >
              <span>{industry.name}</span>
              {industry.id === primaryIndustry?.id && (
                <span className="text-[10px] uppercase tracking-wide ml-1 text-[#3B82F6]">Primary</span>
              )}
            </div>
          ))}
          
          {!isExpanded && hiddenCount > 0 && (
            <button
              onClick={() => setIsExpanded(true)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              +{hiddenCount} more
            </button>
          )}
          
          {activeIndustries.length > 3 && isExpanded && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Show Less
            </button>
          )}
        </div>

        {/* Manage button - always stays in fixed position */}
        <button
          onClick={() => setShowManagementModal(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 flex-shrink-0 ml-2"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Manage</span>
        </button>
      </div>
      
      <IndustryManagementModal
        isOpen={showManagementModal}
        onClose={() => setShowManagementModal(false)}
      />
    </div>
  );
}; 