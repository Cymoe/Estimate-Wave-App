import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, Download, Upload, ChevronRight, ChevronDown, ChevronLeft, Package, Wrench, Truck, Users, Briefcase, Grid, List, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { PageHeader } from '../components/common/PageHeader';
import { PageHeaderBar } from '../components/common/PageHeaderBar';
import { NewButton } from '../components/common/NewButton';
import { formatCurrency } from '../utils/format';
import { Modal } from '../components/common/Modal';
import { CostCodeService } from '../services/CostCodeService';
import { CostCodeForm } from '../components/cost-codes/CostCodeForm';
import { askConfirm, notify } from '../components/common/appDialogs';

interface CostCode {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: 'labor' | 'material' | 'equipment' | 'subcontractor' | 'service';
  organization_id?: string;
  industry_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  industry?: {
    id: string;
    name: string;
    icon?: string;
    color?: string;
  };
}

interface TradeCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  code_range_start: string;
  code_range_end: string;
  icon: string;
  color: string;
  category_type: 'construction' | 'specialty_trade' | 'service' | 'home_service' | 'business_ops';
}

const categoryIcons = {
  labor: Users,
  material: Package,
  equipment: Wrench,
  subcontractor: Truck,
  service: Briefcase
};

const categoryColors = {
  labor: 'text-blue-400',
  material: 'text-green-400',
  equipment: 'text-yellow-400',
  subcontractor: 'text-purple-400',
  service: 'text-orange-400'
};

interface CostCodesPageProps {
  triggerAddCostCode?: number;
}

export default function CostCodesPage({ triggerAddCostCode }: CostCodesPageProps) {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const navigate = useNavigate();
  
  // State
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [selectedCostCode, setSelectedCostCode] = useState<CostCode | null>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loadingLineItems, setLoadingLineItems] = useState(false);
  const [tradeCategories, setTradeCategories] = useState<TradeCategory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCostCodes, setSelectedCostCodes] = useState<Set<string>>(new Set());
  const [costCodeItemCounts, setCostCodeItemCounts] = useState<Record<string, number>>({});
  const [availableIndustries, setAvailableIndustries] = useState<Array<{id: string, name: string, count: number}>>([]);
  const [expandedIndustries, setExpandedIndustries] = useState<Set<string>>(new Set());
  const [showNewCostCodeModal, setShowNewCostCodeModal] = useState(false);
  
  // Handle trigger from parent component
  useEffect(() => {
    if (triggerAddCostCode && triggerAddCostCode > 0) {
      setShowNewCostCodeModal(true);
    }
  }, [triggerAddCostCode]);
  
  // Load data
  useEffect(() => {
    if (selectedOrg?.id) {
      loadCostCodes();
      loadTradeCategories();
    }
  }, [selectedOrg?.id, selectedOrg?.industry_id]);
  
  // Update available industries when cost codes change
  useEffect(() => {
    const industries = new Map<string, {id: string, name: string, count: number}>();
    
    costCodes.forEach(code => {
      if (code.industry) {
        const key = code.industry.id;
        if (!industries.has(key)) {
          industries.set(key, {
            id: code.industry.id,
            name: code.industry.name,
            count: 0
          });
        }
        industries.get(key)!.count++;
      }
    });
    
    setAvailableIndustries(Array.from(industries.values()).sort((a, b) => a.name.localeCompare(b.name)));
  }, [costCodes]);

  const loadCostCodes = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      setIsLoading(true);
      
      // Use CostCodeService which handles industry filtering and merging
      const costCodes = await CostCodeService.list(selectedOrg.id);
      setCostCodes(costCodes);
      
      // Update cost code item counts from the data
      const counts: Record<string, number> = {};
      costCodes.forEach(code => {
        if (code.item_count !== undefined) {
          counts[code.id] = code.item_count;
        }
      });
      setCostCodeItemCounts(counts);
    } catch (error) {
      console.error('Error loading cost codes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTradeCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('trade_categories')
        .select('*')
        .eq('is_active', true)
        .order('code_range_start');

      if (error) throw error;
      setTradeCategories(data || []);
    } catch (error) {
      console.error('Error loading trade categories:', error);
    }
  };


  // Filter and sort cost codes based on search, selected industry, and sorting options
  const filteredCostCodes = useMemo(() => {
    let filtered = costCodes;

    // Filter by selected industry
    if (selectedIndustry !== 'all') {
      filtered = filtered.filter(code => code.industry?.id === selectedIndustry);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(code => 
        code.code.toLowerCase().includes(term) ||
        code.name.toLowerCase().includes(term) ||
        (code.description && code.description.toLowerCase().includes(term))
      );
    }

    return filtered;
  }, [costCodes, selectedIndustry, searchTerm]);

  // Group filtered cost codes by industry
  const groupedFilteredCostCodes = useMemo(() => {
    const grouped = new Map<string, CostCode[]>();
    
    filteredCostCodes.forEach(code => {
      const industryName = code.industry?.name || 'Unknown Industry';
      if (!grouped.has(industryName)) {
        grouped.set(industryName, []);
      }
      grouped.get(industryName)!.push(code);
    });
    
    // Sort industries alphabetically
    return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [filteredCostCodes]);

  const toggleCostCode = (codeId: string) => {
    const newSelected = new Set(selectedCostCodes);
    if (newSelected.has(codeId)) {
      newSelected.delete(codeId);
    } else {
      newSelected.add(codeId);
    }
    setSelectedCostCodes(newSelected);
  };

  const handleExportCSV = async () => {
    const csv = [
      ['Code', 'Name', 'Description', 'Category'],
      ...filteredCostCodes.map(code => [
        code.code,
        code.name,
        code.description || '',
        code.category
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cost-codes-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCostCodeClick = async (costCode: CostCode) => {
    setSelectedCostCode(costCode);
    setLoadingLineItems(true);
    
    // Ensure the industry is expanded when viewing a cost code
    if (costCode.industry?.name && !expandedIndustries.has(costCode.industry.name)) {
      setExpandedIndustries(new Set([...expandedIndustries, costCode.industry.name]));
    }
    
    try {
      // Line items are now standard and tied only to cost codes
      const { data, error } = await supabase
        .from('line_items')
        .select(`
          *,
          cost_code:cost_codes(name, code)
        `)
        .eq('cost_code_id', costCode.id)
        .order('name');

      if (error) throw error;
      setLineItems(data || []);
    } catch (error) {
      console.error('Error loading line items for cost code:', error);
      setLineItems([]);
    } finally {
      setLoadingLineItems(false);
    }
  };

  const handleBackToCostCodes = () => {
    setSelectedCostCode(null);
    setLineItems([]);
  };
  
  const handleBulkDelete = async () => {
    if (selectedCostCodes.size === 0) return;
    
    const count = selectedCostCodes.size;
    if (!(await askConfirm({ title: `Delete ${count} cost code${count > 1 ? 's' : ''}?`, message: "This can't be undone.", confirmLabel: 'Delete' }))) return;
    
    try {
      // Delete each selected cost code
      const deletePromises = Array.from(selectedCostCodes).map(id => 
        CostCodeService.delete(id)
      );
      
      await Promise.all(deletePromises);
      
      // Clear selection and reload
      setSelectedCostCodes(new Set());
      await loadCostCodes();
    } catch (error) {
      console.error('Error deleting cost codes:', error);
      notify('Failed to delete some cost codes. Please try again.');
    }
  };
  
  const toggleIndustryExpanded = (industryName: string) => {
    const newExpanded = new Set(expandedIndustries);
    if (newExpanded.has(industryName)) {
      newExpanded.delete(industryName);
    } else {
      newExpanded.add(industryName);
    }
    setExpandedIndustries(newExpanded);
  };

  // Calculate previous and next cost codes within the same industry
  const navigationContext = useMemo(() => {
    if (!selectedCostCode || !selectedCostCode.industry) return null;
    
    // Get all cost codes in the same industry
    const industryCodes = costCodes.filter(
      code => code.industry?.id === selectedCostCode.industry?.id
    ).sort((a, b) => a.code.localeCompare(b.code));
    
    const currentIndex = industryCodes.findIndex(code => code.id === selectedCostCode.id);
    
    return {
      previous: currentIndex > 0 ? industryCodes[currentIndex - 1] : null,
      next: currentIndex < industryCodes.length - 1 ? industryCodes[currentIndex + 1] : null,
      currentIndex,
      totalCount: industryCodes.length
    };
  }, [selectedCostCode, costCodes]);

  return (
    <div className="bg-transparent border border-[#333333] border-t-0">
      
      {/* Filters Section - Only show when not in drill-down view */}
      {!selectedCostCode && (
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search cost codes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#1E1E1E] border border-[#333333] pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] w-full"
              />
            </div>

            {/* Right side - View toggle and actions */}
            <div className="flex items-center gap-3">
              {/* Expand/Collapse All button */}
              <button
                onClick={() => {
                  if (expandedIndustries.size === 0) {
                    // Expand all
                    const allIndustries = new Set(Array.from(groupedFilteredCostCodes.keys()));
                    setExpandedIndustries(allIndustries);
                  } else {
                    // Collapse all
                    setExpandedIndustries(new Set());
                  }
                }}
                className="bg-[#1E1E1E] border border-[#333333] px-3 py-2 text-sm text-white hover:bg-[#333333] transition-colors flex items-center gap-2"
              >
                {expandedIndustries.size === 0 ? (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    Expand All
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Collapse All
                  </>
                )}
              </button>
              
              <button
                onClick={handleExportCSV}
                className="bg-[#1E1E1E] border border-[#333333] p-2 text-white hover:bg-[#333333] transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Content */}
      <div className="border-t border-[#333333]">
        {selectedCostCode ? (
          /* Line Items View */
          <div>
            {/* Breadcrumb */}
            <div className="px-6 py-4 bg-[#1A1A1A] border-b border-[#333333] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBackToCostCodes}
                  className="text-[#336699] hover:text-[#4A7BB7] transition-colors text-sm flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to {selectedCostCode.industry?.name || 'Cost Codes'}
                </button>
                <span className="text-gray-600">&gt;</span>
                <span className="text-white font-medium">
                  {selectedCostCode.code} • {selectedCostCode.name}
                </span>
              </div>
              <div className="text-sm text-gray-400">
                {loadingLineItems ? 'Loading...' : `${lineItems.length} items`}
              </div>
            </div>

            {/* Industry Context Bar */}
            <div className="px-6 py-3 bg-[#1E1E1E] border-b border-[#333333] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {selectedCostCode.industry?.name && (
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {selectedCostCode.industry.name}
                    </span>
                  )}
                  {selectedCostCode.category && (
                    <>
                      <span className="text-gray-600">•</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        selectedCostCode.category === 'labor' ? 'bg-blue-400/20 text-blue-400' :
                        selectedCostCode.category === 'material' ? 'bg-green-400/20 text-green-400' :
                        selectedCostCode.category === 'equipment' ? 'bg-yellow-400/20 text-yellow-400' :
                        selectedCostCode.category === 'subcontractor' ? 'bg-purple-400/20 text-purple-400' :
                        'bg-orange-400/20 text-orange-400'
                      }`}>
                        {selectedCostCode.category.charAt(0).toUpperCase() + selectedCostCode.category.slice(1)}
                      </span>
                    </>
                  )}
                  {selectedCostCode.organization_id && (
                    <>
                      <span className="text-gray-600">•</span>
                      <span className="text-xs px-2 py-0.5 bg-[#336699]/20 text-[#336699] rounded">
                        Custom
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {navigationContext && (
                  <>
                    <span className="text-xs text-gray-500">
                      {navigationContext.currentIndex + 1} of {navigationContext.totalCount}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigationContext.previous && handleCostCodeClick(navigationContext.previous)}
                        disabled={!navigationContext.previous}
                        className={`p-1 rounded transition-colors ${
                          navigationContext.previous 
                            ? 'text-gray-400 hover:bg-[#333333] hover:text-white' 
                            : 'text-gray-600 cursor-not-allowed'
                        }`}
                        title={navigationContext.previous ? `Previous: ${navigationContext.previous.name}` : 'No previous code'}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigationContext.next && handleCostCodeClick(navigationContext.next)}
                        disabled={!navigationContext.next}
                        className={`p-1 rounded transition-colors ${
                          navigationContext.next 
                            ? 'text-gray-400 hover:bg-[#333333] hover:text-white' 
                            : 'text-gray-600 cursor-not-allowed'
                        }`}
                        title={navigationContext.next ? `Next: ${navigationContext.next.name}` : 'No next code'}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Line Items Content */}
            <div className="bg-[#0A0A0A]">
              {loadingLineItems ? (
                <div className="animate-pulse">
                  {/* Line Item Skeletons */}
                  <div className="divide-y divide-[#333333]">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 flex-1">
                            {/* Icon Skeleton */}
                            <div className="p-2 bg-[#1E1E1E] rounded">
                              <div className="w-5 h-5 bg-[#336699]/30 rounded relative overflow-hidden">
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                              </div>
                            </div>
                            
                            {/* Title and Description Skeleton */}
                            <div className="flex-1">
                              <div className="h-4 bg-[#333333] rounded w-64 mb-2 relative overflow-hidden">
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                              </div>
                              <div className="h-3 bg-[#333333]/70 rounded w-96 relative overflow-hidden">
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                              </div>
                            </div>
                            
                            {/* Price and Unit Skeleton */}
                            <div className="text-right">
                              <div className="h-4 bg-[#333333] rounded w-20 mb-1 ml-auto relative overflow-hidden">
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                              </div>
                              <div className="h-3 bg-[#333333]/70 rounded w-12 ml-auto relative overflow-hidden">
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : lineItems.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-center">
                  <div>
                    <div className="text-gray-400 mb-2">No items found for this cost code</div>
                    <button className="text-[#336699] hover:text-[#4A7BB7] text-sm">
                      + Add first item
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#333333]">
                {lineItems.map((item) => (
                  <div
                    key={item.id}
                    className="px-6 py-4 hover:bg-[#1E1E1E] transition-colors flex items-center gap-4"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="p-2 bg-[#1E1E1E] rounded text-blue-400">
                        <Package className="w-5 h-5" />
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="text-white font-medium">{item.name}</h3>
                        {item.description && (
                          <p className="text-gray-400 text-sm mt-1">{item.description}</p>
                        )}
                      </div>
                      
                      <div className="text-right">
                        <div className="text-white font-medium">
                          {formatCurrency(item.price)}
                        </div>
                        <div className="text-gray-400 text-sm">{item.unit}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        ) : isLoading ? (
          <div className="animate-pulse">
            {/* Industry Group Skeleton 1 */}
            <div className="border-b border-[#333333]">
              <div className="px-6 py-4 bg-[#1A1A1A]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-[#333333] rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                  <div className="h-4 bg-[#333333] rounded w-32 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                  <div className="h-3 bg-[#333333] rounded w-24 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                </div>
              </div>
              
              {/* Cost Code Items Skeleton */}
              <div className="divide-y divide-[#333333]">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-4 bg-[#336699]/30 rounded w-16 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                        </div>
                        <div className="h-4 bg-[#333333] rounded w-48 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-4 bg-[#336699]/30 rounded w-8 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                        </div>
                        <div className="w-5 h-5 bg-[#333333] rounded relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Industry Group Skeleton 2 */}
            <div className="border-b border-[#333333]">
              <div className="px-6 py-4 bg-[#1A1A1A]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-[#333333] rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                  <div className="h-4 bg-[#333333] rounded w-40 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                  <div className="h-3 bg-[#333333] rounded w-28 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                </div>
              </div>
              
              <div className="divide-y divide-[#333333]">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-4 bg-[#336699]/30 rounded w-16 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                        </div>
                        <div className="h-4 bg-[#333333] rounded w-56 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-4 bg-[#336699]/30 rounded w-8 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                        </div>
                        <div className="w-5 h-5 bg-[#333333] rounded relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Industry Group Skeleton 3 */}
            <div className="border-b border-[#333333]">
              <div className="px-6 py-4 bg-[#1A1A1A]">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-[#333333] rounded relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                  <div className="h-4 bg-[#333333] rounded w-36 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                  <div className="h-3 bg-[#333333] rounded w-20 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                </div>
              </div>
              
              {/* Add some cost code items to the third skeleton */}
              <div className="divide-y divide-[#333333]">
                {[1, 2].map((i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-4 bg-[#336699]/30 rounded w-16 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                        </div>
                        <div className="h-4 bg-[#333333] rounded w-44 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-4 bg-[#336699]/30 rounded w-8 relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                        </div>
                        <div className="w-5 h-5 bg-[#333333] rounded relative overflow-hidden">
                          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* List View - Grouped by Industry with Accordion */
          <div>
            {Array.from(groupedFilteredCostCodes.entries()).map(([industryName, codes], index) => {
              const isExpanded = expandedIndustries.has(industryName);
              const itemCount = codes.reduce((sum, code) => sum + (costCodeItemCounts[code.id] || 0), 0);
              
              return (
                <div key={industryName} className="border-b border-[#333333] last:border-b-0">
                  {/* Industry Header - Clickable */}
                  <button
                    onClick={() => toggleIndustryExpanded(industryName)}
                    className="w-full px-6 py-4 bg-[#1A1A1A] hover:bg-[#222222] transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight 
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        {industryName}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {codes.length} codes • {itemCount} items
                      </span>
                    </div>
                  </button>
                  
                  {/* Cost Codes for this Industry - Only show when expanded */}
                  {isExpanded && (
                    <div className="divide-y divide-[#333333]">
                      {codes.map((code) => (
                    <div
                      key={code.id}
                      className="px-6 py-4 hover:bg-[#1E1E1E] transition-colors flex items-center gap-4"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-[#336699] font-mono text-sm">{code.code}</span>
                            <h3 className="text-white font-medium">{code.name}</h3>
                            {code.organization_id && (
                              <span className="text-xs px-2 py-0.5 bg-[#336699]/20 text-[#336699] rounded">Custom</span>
                            )}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleCostCodeClick(code)}
                          className="flex items-center gap-2 text-[#336699] hover:text-[#4477aa] transition-colors group"
                        >
                          <span className="font-medium text-sm">
                            {costCodeItemCounts[code.id] || '-'} items
                          </span>
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#336699] transition-colors" />
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Cost Code Modal */}
      <Modal
        isOpen={showNewCostCodeModal}
        onClose={() => setShowNewCostCodeModal(false)}
        title="Add Cost Code"
        size="md"
      >
        <CostCodeForm
          onSubmit={async (data) => {
            await CostCodeService.create({
              name: data.name,
              code: data.code,
              description: data.description,
              category: data.category as 'labor' | 'material' | 'equipment' | 'subcontractor' | 'service',
              industry_id: data.industry_id,
              organization_id: selectedOrg?.id,
              is_active: true
            });
            
            setShowNewCostCodeModal(false);
            await loadCostCodes();
          }}
          onCancel={() => setShowNewCostCodeModal(false)}
          submitLabel="Add Cost Code"
        />
      </Modal>
    </div>
  );
}