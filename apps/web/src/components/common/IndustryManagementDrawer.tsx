import React, { useState, useEffect, useContext } from 'react';
import { X, Search, Settings, Info, CheckCircle, Check, Crown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { IndustryService } from '../../services/IndustryService';
import { UpgradePromptModal } from './UpgradePromptModal';

interface Industry {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
}

interface IndustryManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IndustryManagementDrawer: React.FC<IndustryManagementDrawerProps> = ({
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(new Set());
  const [primaryIndustryId, setPrimaryIndustryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const [planData, setPlanData] = useState<{
    planName: string;
    industryLimit: number | null;
    currentCount: number;
    canAddMore: boolean;
  } | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  useEffect(() => {
    if (isOpen && user && selectedOrg) {
      loadIndustries();
      // Allow scrolling after animation completes
      const timer = setTimeout(() => setCanScroll(true), 200);
      return () => clearTimeout(timer);
    } else {
      setCanScroll(false);
    }
  }, [isOpen, user, selectedOrg]);

  const loadIndustries = async () => {
    if (!user || !selectedOrg?.id) return;

    try {
      setIsLoading(true);
      
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
    if (!selectedOrg?.id || primaryIndustryId === industryId || !planData) return;

    const isCurrentlySelected = selectedIndustries.has(industryId);
    
    // Check limits using dynamic plan data
    if (!isCurrentlySelected && !planData.canAddMore) {
      // Show upgrade prompt for non-unlimited plans
      if (planData.planName !== 'Unlimited') {
        setShowUpgradePrompt(true);
      }
      return;
    }

    setIsSaving(true);
    
    try {
      if (isCurrentlySelected) {
        // Remove industry
        await IndustryService.removeFromOrganization(selectedOrg.id, industryId);

        setSelectedIndustries(prev => {
          const newSet = new Set(prev);
          newSet.delete(industryId);
          return newSet;
        });

        // Emit custom event for real-time update
        window.dispatchEvent(new CustomEvent('industryUpdate', {
          detail: {
            action: 'remove',
            industryId,
            organizationId: selectedOrg.id
          }
        }));

      } else {
        // Add industry
        await IndustryService.addToOrganization(selectedOrg.id, industryId);

        setSelectedIndustries(prev => new Set([...prev, industryId]));

        // Get the industry details for the event
        const industry = industries.find(i => i.id === industryId);
        if (industry) {
          window.dispatchEvent(new CustomEvent('industryUpdate', {
            detail: {
              action: 'add',
              industry,
              organizationId: selectedOrg.id
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error toggling industry:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset search after a delay to avoid visual jump
    setTimeout(() => {
      setSearchQuery('');
    }, 200);
  };

  // Filter industries based on search query
  const filteredIndustries = industries.filter(industry =>
    industry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    industry.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) {
    return <div className="w-full h-full" />;
  }

  return (
    <>
      <div className="w-full h-full bg-[#1F2937] flex flex-col relative overflow-hidden transition-opacity duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#374151]">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-[#3B82F6]" />
            <h2 className="text-lg font-semibold text-white">Manage Industries</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-[#374151] rounded-[4px] transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-[#374151]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search industries..."
              className="w-full pl-10 pr-4 py-2 bg-[#374151] border border-[#4B5563] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
            />
          </div>
        </div>

        {/* Info Section */}
        <div className="px-6 py-4 bg-[#1a1a1a] border-b border-[#374151]">
          <div className="flex items-start gap-3">
            {planData?.planName === 'Unlimited' ? (
              <Crown className="h-4 w-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
            ) : (
              <Info className="h-4 w-4 text-[#EAB308] mt-0.5 flex-shrink-0" />
            )}
            <div className="text-sm flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-300">
                  {planData?.planName === 'Unlimited' 
                    ? 'Select unlimited industries with your plan'
                    : `Select up to ${planData?.industryLimit || 5} industries that match your business`
                  }
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  planData?.planName === 'Unlimited' 
                    ? 'bg-[#F59E0B]/10 text-[#F59E0B]' 
                    : 'bg-[#3B82F6]/10 text-[#3B82F6]'
                }`}>
                  {planData?.planName || 'Free'} Plan
                </span>
              </div>
              <p className="text-gray-400 text-xs">
                {planData?.currentCount || selectedIndustries.size}/
                {planData?.industryLimit === null ? '∞' : planData?.industryLimit || 5} industries selected
              </p>
              {planData?.planName !== 'Unlimited' && !planData?.canAddMore && (
                <p className="text-amber-400 text-xs mt-1">
                  Industry limit reached. Upgrade to add more industries.
                </p>
              )}
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div 
          className={`flex-1 min-h-0 mb-[72px] ${canScroll ? 'overflow-y-auto' : 'overflow-hidden'} industry-drawer-content`}
        >
          {isLoading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-[#374151] rounded-lg"></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#374151]">
              {filteredIndustries.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-400 mb-2">No industries found matching "{searchQuery}"</p>
                  <p className="text-sm text-gray-500">Try searching for: Construction, Electrical, or Plumbing</p>
                </div>
              ) : (
                filteredIndustries.map((industry) => {
                  const isSelected = selectedIndustries.has(industry.id);
                  const isPrimary = industry.id === primaryIndustryId;
                  const canSelect = isSelected || (planData?.canAddMore ?? false);

                  return (
                    <div
                      key={industry.id}
                      className={`py-4 px-6 transition-all duration-200 relative ${
                        isPrimary 
                          ? 'opacity-75 bg-[#252525]' 
                          : canSelect 
                            ? 'hover:bg-[#252525] cursor-pointer' 
                            : 'opacity-50 cursor-not-allowed'
                      } ${
                        isSelected && !isPrimary ? 'bg-[#1a1a1a] border-l-2 border-l-[#3B82F6]' : ''
                      }`}
                      onClick={() => canSelect && !isPrimary && toggleIndustry(industry.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 rounded-full bg-[#374151] flex items-center justify-center text-sm">
                                {industry.icon || industry.name.charAt(0).toUpperCase()}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-white truncate">
                                  {industry.name}
                                </h3>
                                {isPrimary && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#3B82F6] text-white">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                {industry.description}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex-shrink-0 ml-4">
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full bg-[#3B82F6] flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          ) : (
                            <div className={`w-5 h-5 rounded-full border-2 ${
                              canSelect ? 'border-gray-400' : 'border-gray-600'
                            }`} />
                          )}
                        </div>
                      </div>
                      
                      {isPrimary && (
                        <div className="mt-2 text-xs text-gray-500">
                          This is your primary industry and cannot be removed
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-[#374151] p-4 bg-[#1F2937] z-10">
          <div className="flex items-center justify-between">
            <button
              onClick={() => window.location.href = '/settings/industries'}
              className="text-sm text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
            >
              Advanced Settings
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-[#EAB308] text-black text-sm font-medium rounded-lg hover:bg-[#D97706] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
      
      <UpgradePromptModal
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        currentPlan={planData?.planName}
        currentLimit={planData?.industryLimit || 5}
        onUpgrade={() => {
          window.location.href = '/settings/billing';
        }}
      />
    </>
  );
}; 