import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { IndustryService } from '../../services/IndustryService';

interface Industry {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
}

/**
 * The trade picker shown in the industry modal and drawer: search, the list
 * of trades with checkboxes (each click saves), and Done.
 */
export const IndustryPicker: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && user && selectedOrg) {
      loadIndustries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user, selectedOrg]);

  const loadIndustries = async () => {
    if (!user || !selectedOrg?.id) return;

    try {
      setIsLoading(true);
      const [allIndustries, orgIndustries] = await Promise.all([
        IndustryService.listAll(),
        IndustryService.getOrganizationIndustries(selectedOrg.id)
      ]);
      setIndustries(allIndustries as Industry[]);
      setSelectedIndustries(new Set(orgIndustries.map(industry => industry.id)));
    } catch (error) {
      console.error('Error loading industries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleIndustry = async (industryId: string) => {
    if (!selectedOrg?.id) return;

    const isCurrentlySelected = selectedIndustries.has(industryId);
    setIsSaving(true);

    try {
      if (isCurrentlySelected) {
        await IndustryService.removeFromOrganization(selectedOrg.id, industryId);
        setSelectedIndustries(prev => {
          const newSet = new Set(prev);
          newSet.delete(industryId);
          return newSet;
        });
        // Emit custom event for real-time update
        window.dispatchEvent(new CustomEvent('industryUpdate', {
          detail: { action: 'remove', industryId, organizationId: selectedOrg.id }
        }));
      } else {
        await IndustryService.addToOrganization(selectedOrg.id, industryId);
        setSelectedIndustries(prev => new Set([...prev, industryId]));
        const industry = industries.find(i => i.id === industryId);
        if (industry) {
          window.dispatchEvent(new CustomEvent('industryUpdate', {
            detail: { action: 'add', industry, organizationId: selectedOrg.id }
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
    setSearchQuery('');
  };

  const filteredIndustries = industries.filter(industry =>
    industry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (industry.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#333333] flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">Your trades</h2>
        <button onClick={handleClose} className="p-1 text-gray-400 hover:text-white" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search and summary */}
      <div className="px-6 py-4 border-b border-[#333333] flex-shrink-0 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search trades"
            className="w-full pl-9 pr-3 py-2 bg-[#0A0A0A] border border-[#333333] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
          />
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <p className="text-gray-400">
            Choose the trades you work in. Their cost codes and price-book items appear in your Price Book.
          </p>
          <span className="text-gray-300 whitespace-nowrap">{selectedIndustries.size} selected</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="p-6 animate-pulse space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#333333]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[#333333] w-1/3" />
                  <div className="h-2.5 bg-[#2a2a2a] w-2/3" />
                </div>
                <div className="w-5 h-5 bg-[#333333]" />
              </div>
            ))}
          </div>
        ) : filteredIndustries.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No trades match “{searchQuery}”.</div>
        ) : (
          <div className="divide-y divide-[#2a2a2a]">
            {filteredIndustries.map((industry) => {
              const isSelected = selectedIndustries.has(industry.id);
              return (
                <button
                  type="button"
                  key={industry.id}
                  onClick={() => toggleIndustry(industry.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left px-6 py-3 flex items-center gap-3 border-l-2 transition-colors ${
                    isSelected
                      ? 'border-[#336699] bg-[#336699]/10'
                      : 'border-transparent hover:bg-[#22272d]'
                  }`}
                >
                  <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-[#0A0A0A] border border-[#333333] text-sm">
                    {industry.icon || industry.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${isSelected ? 'text-white' : 'text-gray-300'}`}>{industry.name}</span>
                    {industry.description && (
                      <span className="block text-xs text-gray-500 truncate">{industry.description}</span>
                    )}
                  </span>
                  <span
                    className={`w-5 h-5 flex-shrink-0 flex items-center justify-center border ${
                      isSelected ? 'bg-[#336699] border-[#336699]' : 'border-[#555555]'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[#333333] px-6 py-4 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => {
            handleClose();
            navigate('/settings/industries');
          }}
          className="text-sm text-gray-400 hover:text-white"
        >
          Advanced settings
        </button>
        <button
          onClick={handleClose}
          disabled={isSaving}
          className="px-5 py-2 text-sm text-white bg-[#336699] hover:bg-[#2a5580] disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Done'}
        </button>
      </div>
    </>
  );
};
