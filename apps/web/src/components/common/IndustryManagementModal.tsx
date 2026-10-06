import React, { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Settings, Info, Check, Crown } from 'lucide-react';
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

interface IndustryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IndustryManagementModal: React.FC<IndustryManagementModalProps> = ({
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
  const [isClosing, setIsClosing] = useState(false);
  const [planData, setPlanData] = useState<{
    planName: string;
    industryLimit: number | null;
    currentCount: number;
    canAddMore: boolean;
  } | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Debug logging
  useEffect(() => {
    if (isOpen) {
      console.log('IndustryManagementModal opened', {
        user: !!user,
        selectedOrg: !!selectedOrg,
        industriesCount: industries.length,
        isLoading
      });
    }
  }, [isOpen, user, selectedOrg, industries.length, isLoading]);

  useEffect(() => {
    if (isOpen && user && selectedOrg) {
      loadIndustries();
    }
  }, [isOpen, user, selectedOrg]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

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
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      // Reset search after modal is closed
      setSearchQuery('');
    }, 200);
  };

  // Filter industries based on search query
  const filteredIndustries = industries.filter(industry =>
    industry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    industry.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  const modalContent = (
    <>
      {/* Overlay - using the Carbon Black color with opacity and blur for dark overlay */}
      <div 
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] transition-all duration-200 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />
      
      {/* Modal Container */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <div className={`bg-[#1F2937] rounded-lg shadow-[0_25px_50px_-12px_rgb(0_0_0_/_0.5)] max-w-2xl w-full h-[85vh] flex flex-col border border-[#374151] transition-all duration-200 pointer-events-auto transform ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#374151] flex-shrink-0">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-[#3B82F6]" />
              <h2 className="text-lg font-semibold text-white">Manage Industries</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-[#374151] rounded-lg transition-colors group"
            >
              <X className="w-5 h-5 text-gray-400 group-hover:text-white" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-4 border-b border-[#374151] flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search industries..."
                className="w-full pl-10 pr-4 py-2 bg-[#111827] border border-[#374151] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
              />
            </div>
          </div>

          {/* Info Section */}
          <div className="px-6 py-4 bg-[#111827] border-b border-[#374151] flex-shrink-0">
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
          
          {/* Content - explicit height instead of flex-1 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="p-6">
                <div className="animate-pulse space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#374151] rounded-lg"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-[#374151] rounded w-1/3"></div>
                        <div className="h-3 bg-[#374151] rounded w-2/3"></div>
                      </div>
                      <div className="w-6 h-6 bg-[#374151] rounded"></div>
                    </div>
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
                        className={`py-4 px-6 transition-all duration-200 relative group ${
                          isPrimary 
                            ? 'opacity-75 bg-[#111827]/50 cursor-default' 
                            : canSelect 
                              ? 'hover:bg-[#111827]/50 cursor-pointer' 
                              : 'opacity-50 cursor-not-allowed'
                        } ${
                          isSelected && !isPrimary ? 'bg-[#111827]/30 border-l-2 border-[#3B82F6]' : ''
                        }`}
                        onClick={() => canSelect && !isPrimary && toggleIndustry(industry.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${
                                  isSelected ? 'bg-[#3B82F6]/20 text-[#3B82F6]' : 'bg-[#374151] text-gray-400'
                                }`}>
                                  {industry.icon || industry.name.charAt(0).toUpperCase()}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className={`text-sm font-medium truncate transition-colors ${
                                    isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'
                                  }`}>
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
                              <div className="w-6 h-6 rounded bg-[#3B82F6] flex items-center justify-center transition-transform group-hover:scale-110">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <div className={`w-6 h-6 rounded border-2 transition-all ${
                                canSelect 
                                  ? 'border-gray-400 group-hover:border-[#3B82F6] group-hover:bg-[#3B82F6]/10' 
                                  : 'border-gray-600'
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
          <div className="border-t border-[#374151] p-4 bg-[#1F2937] flex-shrink-0">
            <div className="flex items-center justify-between">
              <button
                onClick={() => window.location.href = '/settings/industries'}
                className="text-sm text-[#3B82F6] hover:text-[#60A5FA] transition-colors hover:underline"
              >
                Advanced Settings
              </button>
              <button
                onClick={handleClose}
                disabled={isSaving}
                className="px-6 py-2.5 bg-[#EAB308] text-black text-sm font-medium rounded-lg hover:bg-[#D97706] transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#EAB308] focus:ring-offset-2 focus:ring-offset-[#1F2937] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSaving ? 'Saving...' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // Render using portal to ensure proper isolation
  return (
    <>
      {createPortal(modalContent, document.body)}
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