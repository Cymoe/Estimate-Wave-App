import React, { useState, useEffect, useContext, useMemo } from 'react';
import { 
  Package, 
  Search, 
  ShoppingCart,
  X,
  ChevronDown,
  ChevronRight,
  Star,
  List,
  SlidersHorizontal,
  Eye,
  CheckCircle,
  Plus,
  Copy
} from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { EstimateCart } from '../components/services/EstimateCart';
import { PackageDetailsModal } from '../components/services/PackageDetailsModal';
import { ServiceAttributeFilters } from '../components/services/ServiceAttributeFilters';
import { ServiceQuickRow } from '../components/services/ServiceQuickRow';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { EstimateService } from '../services/EstimateService';
import { ServiceCatalogService } from '../services/ServiceCatalogService';
import { formatCurrency } from '../utils/format';
import { BulkCustomizeServicesModal } from '../components/services/BulkCustomizeServicesModal';

interface CartItem {
  id: string;
  type: 'package' | 'template';
  name: string;
  price: number;
  quantity: number;
  unit: string;
  packageId?: string;
  templateId?: string;
  subtotal: number;
  fullData?: any;
}

export const ServicesPackages: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'packages' | 'services'>('packages');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [showPackageDetails, setShowPackageDetails] = useState(false);
  const [showEstimateDrawer, setShowEstimateDrawer] = useState(false);
  const [attributeFilters, setAttributeFilters] = useState<Record<string, any>>({});
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'warranty' | 'skill_level' | 'material_quality'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  
  // Data states
  const [packages, setPackages] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [industries, setIndustries] = useState<any[]>([]);
  
  const [showBulkCustomizeModal, setShowBulkCustomizeModal] = useState(false);
  const [condensedView, setCondensedView] = useState(false);

  useEffect(() => {
    if (selectedOrg?.id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrg?.id]);

  const loadData = async () => {
    if (!selectedOrg?.id) return;
    
    setIsLoading(true);
    try {
      // Load organization's selected industries (primary + secondary)
      const [orgResult, orgIndustriesResult] = await Promise.all([
        supabase
          .from('organizations')
          .select(`
            industry_id,
            industry:industries!organizations_industry_id_fkey (
              id,
              name,
              slug,
              icon
            )
          `)
          .eq('id', selectedOrg.id)
          .single(),
        
        supabase
          .from('organization_industries')
          .select(`
            industry:industries!organization_industries_industry_id_fkey (
              id,
              name,
              slug,
              icon
            )
          `)
          .eq('organization_id', selectedOrg.id)
      ]);

      if (orgResult.error) throw orgResult.error;
      if (orgIndustriesResult.error) throw orgIndustriesResult.error;

      // Combine primary and secondary industries
      const selectedIndustries = [];
      
      // Add primary industry if exists
      if (orgResult.data?.industry) {
        selectedIndustries.push(orgResult.data.industry);
      }
      
      // Add secondary industries
      const secondaries = (orgIndustriesResult.data || [])
        .map((oi: any) => oi.industry)
        .filter((industry: any) => 
          industry !== null && 
          industry !== undefined && 
          industry.id !== orgResult.data?.industry_id // Exclude primary to avoid duplicates
        );
      
      selectedIndustries.push(...secondaries);
      
      // Set industries for the dropdown
      setIndustries(selectedIndustries);
      
      // Load packages
      const packagesData = await ServiceCatalogService.listPackages(selectedOrg.id);
      setPackages(packagesData);
      
      // Load service templates (service options with is_template=true)
      // Use the new efficient method to get all templates at once
      try {
        const allTemplates = await ServiceCatalogService.listTemplates(selectedOrg.id);
        // Loaded templates
        setTemplates(allTemplates);
      } catch (templateError) {
        // Error loading templates
        setTemplates([]); // Set empty array so page doesn't stay in loading state
      }
    } catch (error) {
      // Error loading data
    } finally {
      setIsLoading(false);
    }
  };


  // Removed loadCustomPrices - service options get pricing from line items

  const addToCart = (item: any, type: 'package' | 'template') => {
    const quantity = item.quantity || 1;
    const price = type === 'package' ? (item.calculated_price || 0) : item.price;
    
    const cartItem: CartItem = {
      id: `${type}-${item.id}`,
      type,
      name: item.name,
      price,
      quantity,
      unit: type === 'package' ? 'package' : item.unit,
      packageId: type === 'package' ? item.id : undefined,
      templateId: type === 'template' ? item.id : undefined,
      subtotal: price * quantity,
      // Store the full item data for later expansion
      fullData: item
    };
    
    setCartItems(prev => {
      const existing = prev.find(i => i.id === cartItem.id);
      if (existing) {
        // Replace the existing item with new quantity
        return prev.map(i => 
          i.id === cartItem.id 
            ? cartItem
            : i
        );
      }
      return [...prev, cartItem];
    });
    
    setShowCart(true);
  };

  const updateCartQuantity = (itemId: string, quantity: number) => {
    setCartItems(prev => {
      const updatedItems = prev.map(item => 
        item.id === itemId 
          ? { ...item, quantity, subtotal: item.price * quantity }
          : item
      ).filter(item => item.quantity > 0);
      
      // Auto-close cart if it becomes empty
      if (updatedItems.length === 0) {
        setShowCart(false);
      }
      
      return updatedItems;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCartItems(prev => {
      const updatedItems = prev.filter(item => item.id !== itemId);
      
      // Auto-close cart if it becomes empty
      if (updatedItems.length === 0) {
        setShowCart(false);
      }
      
      return updatedItems;
    });
  };

  const clearCart = () => {
    setCartItems([]);
    setShowCart(false); // Auto-close cart when emptied
  };

  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Filter data
  const filteredPackages = packages.filter(pkg => {
    const matchesIndustry = selectedIndustry === 'all' || pkg.industry_id === selectedIndustry;
    const matchesLevel = selectedLevel === 'all' || pkg.level === selectedLevel;
    const matchesSearch = !searchQuery || 
      pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesIndustry && matchesLevel && matchesSearch;
  });

  const filteredAndSortedTemplates = templates
    .filter(template => {
      const matchesIndustry = selectedIndustry === 'all' || 
        template.industry_id === selectedIndustry;
      const matchesSearch = !searchQuery || 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.service_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        // Search through attributes
        (template.attributes && Object.entries(template.attributes).some(([key, value]) => {
          const searchLower = searchQuery.toLowerCase();
          // Search attribute keys (e.g., "permit_required" matches "permit")
          if (key.toLowerCase().includes(searchLower)) return true;
          // Search attribute values
          if (typeof value === 'string' && value.toLowerCase().includes(searchLower)) return true;
          if (typeof value === 'boolean' && value && searchLower.includes(key.replace(/_/g, ' ').toLowerCase())) return true;
          if (typeof value === 'number' && value.toString().includes(searchLower)) return true;
          // Special handling for common searches
          if (searchLower === 'permit' && key === 'permit_required' && value === true) return true;
          if (searchLower === 'energy star' && key === 'energy_star' && value === true) return true;
          if (searchLower === 'code compliant' && key === 'code_compliance' && value === true) return true;
          return false;
        }));
      
      // Check attribute filters
      const matchesAttributes = Object.entries(attributeFilters).every(([key, filterValue]) => {
        if (!template.attributes || !template.attributes[key]) return false;
        
        const attrValue = template.attributes[key];
        
        // Handle different filter types
        if (typeof filterValue === 'boolean') {
          return attrValue === filterValue;
        } else if (Array.isArray(filterValue)) {
          // Multi-select filter
          return filterValue.includes(attrValue);
        } else if (typeof filterValue === 'number') {
          // Range filter - for now, show items >= the selected value
          return attrValue >= filterValue;
        } else {
          // String comparison
          return attrValue === filterValue;
        }
      });
      
      return matchesIndustry && matchesSearch && matchesAttributes;
    })
    .sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'price':
          aValue = a.price || 0;
          bValue = b.price || 0;
          break;
        case 'warranty':
          aValue = a.warranty_months || 0;
          bValue = b.warranty_months || 0;
          break;
        case 'skill_level':
          const skillOrder = { 'basic': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
          aValue = skillOrder[a.skill_level as keyof typeof skillOrder] || 0;
          bValue = skillOrder[b.skill_level as keyof typeof skillOrder] || 0;
          break;
        case 'material_quality':
          const qualityOrder = { 'economy': 1, 'standard': 2, 'premium': 3, 'luxury': 4 };
          aValue = qualityOrder[a.material_quality as keyof typeof qualityOrder] || 0;
          bValue = qualityOrder[b.material_quality as keyof typeof qualityOrder] || 0;
          break;
        default: // name
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (sortOrder === 'desc') {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

  // Group templates by service
  const templatesByService = useMemo(() => {
    const grouped = new Map<string, any[]>();
    
    filteredAndSortedTemplates.forEach(template => {
      const serviceId = template.service?.id;
      if (serviceId) {
        if (!grouped.has(serviceId)) {
          grouped.set(serviceId, []);
        }
        grouped.get(serviceId)!.push(template);
      }
    });
    
    return grouped;
  }, [filteredAndSortedTemplates]);

  // Get unique services with their templates
  const servicesWithTemplates = useMemo(() => {
    const services = new Map<string, any>();
    
    filteredAndSortedTemplates.forEach(template => {
      const service = template.service;
      if (service && service.id && !services.has(service.id)) {
        services.set(service.id, {
          ...service,
          templates: templatesByService.get(service.id) || [],
          min_price: Math.min(...(templatesByService.get(service.id) || []).map(t => t.price || 0)),
          max_price: Math.max(...(templatesByService.get(service.id) || []).map(t => t.price || 0))
        });
      }
    });
    
    // Sort services by category priority, then by template count, then by name
    const categoryPriority: Record<string, number> = {
      'consultation': 1,
      'inspection': 2,
      'preparation': 3,
      'installation': 4,
      'repair': 5,
      'maintenance': 6,
      'finishing': 7
    };
    
    return Array.from(services.values()).sort((a, b) => {
      // First by category
      const categoryDiff = (categoryPriority[a.category] || 99) - (categoryPriority[b.category] || 99);
      if (categoryDiff !== 0) return categoryDiff;
      
      // Then by template count (descending)
      const countDiff = (b.templates?.length || 0) - (a.templates?.length || 0);
      if (countDiff !== 0) return countDiff;
      
      // Then alphabetical
      return a.name.localeCompare(b.name);
    });
  }, [filteredAndSortedTemplates, templatesByService]);

  // Group services by category
  const servicesByCategory = useMemo(() => {
    const grouped = new Map<string, any[]>();
    
    servicesWithTemplates.forEach(service => {
      const category = service.category || 'uncategorized';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(service);
    });
    
    return grouped;
  }, [servicesWithTemplates]);

  // Group services by industry (for multi-industry view)
  const servicesByIndustry = useMemo(() => {
    const grouped = new Map<string, { industryName: string; services: any[] }>();
    
    servicesWithTemplates.forEach(service => {
      const industryId = service.industry_id;
      const industryName = service.industry?.name || service.industry_name || 'Other';
      
      if (!grouped.has(industryId)) {
        grouped.set(industryId, {
          industryName,
          services: []
        });
      }
      grouped.get(industryId)!.services.push(service);
    });
    
    // Sort industries alphabetically
    return new Map([...grouped.entries()].sort((a, b) => 
      a[1].industryName.localeCompare(b[1].industryName)
    ));
  }, [servicesWithTemplates]);

  // Determine if we should show industry grouping
  const showIndustryGrouping = selectedIndustry === 'all' || industries.filter(i => i.id !== 'all').length > 1;

  // Toggle service expansion
  const toggleService = (serviceId: string) => {
    setExpandedServices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serviceId)) {
        newSet.delete(serviceId);
      } else {
        newSet.add(serviceId);
      }
      return newSet;
    });
  };


  // Expand/collapse all services
  const toggleAllServices = () => {
    if (expandedServices.size === servicesWithTemplates.length) {
      setExpandedServices(new Set());
    } else {
      setExpandedServices(new Set(servicesWithTemplates.map(s => s.id)));
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      installation: 'Installation',
      repair: 'Repair',
      maintenance: 'Maintenance',
      inspection: 'Inspection',
      consultation: 'Consultation',
      preparation: 'Preparation',
      finishing: 'Finishing',
      uncategorized: 'Other'
    };
    return labels[category] || category;
  };


  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className={`transition-all duration-300 ${showCart ? 'pr-96' : ''}`}>
        {/* Header Section - with top spacing to match Price Book */}
        <div className="bg-transparent pt-6">
          {/* Header */}
          <div className="px-6 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <Package className="w-7 h-7 text-[#336699]" />
                Services & Packages
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Build estimates quickly with pre-configured packages or individual services
              </p>
            </div>
            
            {/* Cart Button */}
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative px-4 py-2 bg-[#336699] text-white font-medium rounded hover:bg-[#4477aa] transition-colors flex items-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Cart</span>
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>

          {/* Tabs Navigation - subtle separator */}
          <div className="border-t border-[#333333]/20">
            <div className="flex">
              <button
                onClick={() => setActiveTab('packages')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
                  activeTab === 'packages'
                    ? 'text-white after:bg-[#336699] bg-[#1A1A1A]/50'
                    : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]/50 hover:bg-[#1A1A1A]/30'
                }`}
              >
                <Package className="w-4 h-4" />
                Service Packages
                <span className="text-[11px] text-gray-600">
                  {packages.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('services')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
                  activeTab === 'services'
                    ? 'text-white after:bg-[#336699] bg-[#1A1A1A]/50'
                    : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699]/50 hover:bg-[#1A1A1A]/30'
                }`}
              >
                <List className="w-4 h-4" />
                Individual Services
                <span className="text-[11px] text-gray-600">
                  {templates.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Filters Bar - seamless connection */}
        <div className="border-t border-[#333333]/20 bg-[#1A1A1A]/30 backdrop-blur-sm">
          <div className="px-4 py-1.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeTab === 'packages' ? 'packages' : 'services'}...`}
                  className="w-full pl-10 pr-4 py-2 bg-[#252525]/80 border border-[#333333] rounded text-white text-sm focus:outline-none focus:border-[#336699]"
                />
              </div>

              {/* Industry Filter */}
              <select
                value={selectedIndustry}
                onChange={(e) => {
                  setSelectedIndustry(e.target.value);
                  setAttributeFilters({}); // Clear attribute filters when industry changes
                }}
                className="px-3 py-2 bg-[#252525]/80 border border-[#333333] rounded text-white text-sm focus:outline-none focus:border-[#336699]"
              >
                <option value="all">All Industries</option>
                {industries.map(industry => (
                  <option key={industry.id} value={industry.id}>
                    {industry.name}
                  </option>
                ))}
              </select>

              {/* Level Filter (Packages only) */}
              {activeTab === 'packages' && (
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="px-3 py-2 bg-[#252525]/80 border border-[#333333] rounded text-white text-sm focus:outline-none focus:border-[#336699]"
                >
                  <option value="all">All Levels</option>
                  <option value="essentials">Essentials</option>
                  <option value="complete">Complete</option>
                  <option value="deluxe">Deluxe</option>
                </select>
              )}

              {/* Sort Controls (Services only) */}
              {activeTab === 'services' && (
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field as any);
                    setSortOrder(order as 'asc' | 'desc');
                  }}
                  className="px-3 py-2 bg-[#252525]/80 border border-[#333333] rounded text-white text-sm focus:outline-none focus:border-[#336699]"
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="price-asc">Price (Low to High)</option>
                  <option value="price-desc">Price (High to Low)</option>
                  <option value="warranty-asc">Warranty (Short to Long)</option>
                  <option value="warranty-desc">Warranty (Long to Short)</option>
                  <option value="skill_level-asc">Skill Level (Basic to Expert)</option>
                  <option value="skill_level-desc">Skill Level (Expert to Basic)</option>
                  <option value="material_quality-asc">Quality (Economy to Luxury)</option>
                  <option value="material_quality-desc">Quality (Luxury to Economy)</option>
                </select>
              )}
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-3">
              {/* Services Controls */}
              {activeTab === 'services' && (
                <div className="flex items-center gap-3">
                  {/* Condensed View Toggle */}
                  <button
                    onClick={() => setCondensedView(!condensedView)}
                    className={`p-2 rounded transition-colors ${
                      condensedView
                        ? 'bg-[#336699] text-white'
                        : 'bg-[#252525] text-gray-300 hover:text-white'
                    }`}
                    title={condensedView ? 'Expanded View' : 'Condensed View'}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                  
                  {/* Bulk Customize Button */}
                  {selectedIndustry !== 'all' && servicesWithTemplates.length > 0 && (
                    <button
                      onClick={() => setShowBulkCustomizeModal(true)}
                      className="px-3 py-2 bg-[#336699] text-white text-sm font-medium rounded hover:bg-[#4477aa] transition-colors flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Bulk Customize
                    </button>
                  )}
                  
                  {/* Expand/Collapse All Button */}
                  {servicesWithTemplates.length > 0 && (
                    <button
                      onClick={toggleAllServices}
                      className="px-3 py-1.5 text-sm text-[#336699] hover:text-[#4477aa] hover:bg-[#252525] rounded transition-colors flex items-center gap-2"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedServices.size === servicesWithTemplates.length ? '' : '-rotate-90'}`} />
                      {expandedServices.size === servicesWithTemplates.length ? 'Collapse All' : 'Expand All'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="animate-pulse">
            {activeTab === 'packages' ? (
              // Package loading skeleton
              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="bg-[#1A1A1A] rounded-lg p-6 border border-[#333333]/20">
                      <div className="h-6 bg-[#252525] rounded w-3/4 mb-4"></div>
                      <div className="h-4 bg-[#252525] rounded w-full mb-3"></div>
                      <div className="h-4 bg-[#252525] rounded w-2/3 mb-6"></div>
                      <div className="flex justify-between items-center">
                        <div className="h-8 bg-[#252525] rounded w-24"></div>
                        <div className="h-10 bg-[#252525] rounded w-32"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Services loading skeleton
              <div>
                <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A] border-b border-[#333333]/20">
                  <div className="h-4 bg-[#252525] rounded w-32"></div>
                  <div className="h-8 bg-[#252525] rounded w-28"></div>
                </div>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i}>
                    <div className="py-2">
                      <div className="h-3 bg-[#252525] rounded w-24 mx-auto"></div>
                    </div>
                    <div className="border-t border-[#333333]">
                      <div className="py-4 px-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 bg-[#252525] rounded"></div>
                          <div>
                            <div className="h-5 bg-[#252525] rounded w-48 mb-2"></div>
                            <div className="h-3 bg-[#252525] rounded w-64"></div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="h-4 bg-[#252525] rounded w-20"></div>
                          <div className="h-5 bg-[#252525] rounded w-32"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'packages' ? (
          // Packages View - full width with responsive padding
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            {filteredPackages.length > 0 ? (
              <>
                {/* Featured Packages */}
                {filteredPackages.filter(p => p.is_featured).length > 0 && (
                                  <div className="mb-4">
                  <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Star className="w-5 h-5 text-[#336699]" />
                      Featured Packages
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-3 lg:gap-4">
                      {filteredPackages
                        .filter(p => p.is_featured)
                        .map(pkg => (
                          <PackageCard
                            key={pkg.id}
                            pkg={pkg}
                            onAddToCart={(item) => addToCart(item, 'package')}
                            isInCart={cartItems.some(i => i.id === `${'package'}-${pkg.id}`)}
                          />
                        ))}
                    </div>
                  </div>
                )}

              {/* All Packages */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-3">
                  All Packages
                </h2>
                {filteredPackages.filter(p => !p.is_featured).length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-3 lg:gap-4">
                    {filteredPackages
                      .filter(p => !p.is_featured)
                      .map(pkg => (
                        <PackageCard
                          key={pkg.id}
                          pkg={pkg}
                          onAddToCart={(item) => addToCart(item, 'package')}
                          isInCart={cartItems.some(i => i.id === `${'package'}-${pkg.id}`)}
                        />
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-16 border border-dashed border-[#333333]/20 rounded-lg">
                    <Package className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No packages available</h3>
                    <p className="text-gray-400 max-w-md mx-auto">
                      {searchQuery 
                        ? `No packages match "${searchQuery}"`
                        : selectedIndustry !== 'all'
                        ? 'No packages for the selected industry'
                        : 'Service packages will appear here once created'}
                    </p>
                  </div>
                )}
              </div>
              </>
            ) : (
              // No packages at all
              <div className="text-center py-24">
                <Package className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">No packages found</h3>
                <p className="text-gray-400 max-w-md mx-auto mb-6">
                  {searchQuery 
                    ? `No packages match "${searchQuery}"`
                    : selectedIndustry !== 'all'
                    ? 'No packages available for the selected industry'
                    : 'Get started by creating your first service package'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2 bg-[#336699] text-white text-sm font-medium hover:bg-[#4477aa] transition-colors"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          // Services View - no padding for full width
          <>
            {/* Attribute Filters */}
            <div className="px-4 sm:px-6 lg:px-8 py-3 border-b border-[#333333]/20">
              <ServiceAttributeFilters
                industry={selectedIndustry === 'all' ? 'All Industries' : industries.find(i => i.id === selectedIndustry)?.name || ''}
                activeFilters={attributeFilters}
                onFiltersChange={setAttributeFilters}
              />
            </div>
            
            {/* Services List */}
            <div>
                {servicesWithTemplates.length > 0 ? (
                  showIndustryGrouping ? (
                    // Multi-industry view - group by industry first
                    Array.from(servicesByIndustry.entries()).map(([industryId, { industryName, services }]) => (
                      <div key={industryId}>
                        {/* Industry Section Header */}
                        <div className="py-1.5 px-4 bg-[#1A1A1A] border-t border-[#333333]/20">
                          <h3 className="text-sm font-medium text-gray-300">
                            {industryName}
                          </h3>
                        </div>
                        
                        {/* Services in this Industry */}
                        {services.map(service => (
                          <div key={service.id} className="border-t border-[#333333]/20">
                            {/* Service Header */}
                            <button
                              onClick={() => toggleService(service.id)}
                              className={`w-full py-2.5 transition-colors flex items-center justify-between ${
                                expandedServices.has(service.id) 
                                  ? 'bg-[#1A1A1A]/50 hover:bg-[#1A1A1A]/60' 
                                  : 'bg-transparent hover:bg-[#1A1A1A]/40'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 pl-8">
                                <ChevronRight 
                                  className={`w-4 h-4 transition-all ${
                                    expandedServices.has(service.id) ? 'rotate-90 text-[#336699]' : 'text-gray-500'
                                  }`}
                                />
                                <div className="text-left">
                                  <h3 className="text-white font-medium">{service.name}</h3>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 pr-4">
                                <span className={`text-sm px-2 py-0.5 rounded transition-all ${
                                  expandedServices.has(service.id) 
                                    ? 'text-[#336699] bg-[#336699]/10' 
                                    : 'text-gray-500 bg-[#252525]'
                                }`}>
                                  {service.templates?.length || 0}
                                </span>
                              </div>
                            </button>
                            
                            {/* Service Options (Templates) - Only show when expanded */}
                            {expandedServices.has(service.id) && service.templates && (
                              <div className="transition-all duration-200">
                                {/* Show description when expanded */}
                                {service.description && (
                                  <p className="text-gray-400 text-sm px-8 pt-2 pb-2">{service.description}</p>
                                )}
                                {/* Options with subtle connection line and indentation */}
                                {service.templates.map((template: any, idx: number) => {
                                  const cartItem = cartItems.find(item => item.id === `template-${template.id}`);
                                  const cartQuantity = cartItem?.quantity || 0;
                                  
                                  return (
                                    <ServiceQuickRow
                                      key={template.id}
                                      template={template}
                                      cartQuantity={cartQuantity}
                                      onQuantityChange={(templateId, quantity) => {
                                        if (quantity === 0) {
                                          removeFromCart(`template-${templateId}`);
                                        } else {
                                          updateCartQuantity(`template-${templateId}`, quantity);
                                        }
                                      }}
                                      onAddToCart={(template, quantity) => {
                                        addToCart({ ...template, quantity }, 'template');
                                      }}
                                      isCondensed={condensedView}
                                      isHighlighted={false}
                                      onCustomized={() => {
                                        // Skip full reload to prevent page refresh
                                        // User will see customized option on next visit
                                        // Service customized successfully
                                      }}
                                      organizationId={selectedOrg?.id}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    // Single industry view - group by category
                    Array.from(servicesByCategory.entries()).map(([category, services]) => (
                      <div key={category}>
                        {/* Category Label */}
                        <div className="py-1 px-4 bg-[#1A1A1A]/50">
                          <div className="text-xs font-medium text-gray-400">
                            {getCategoryLabel(category)}
                          </div>
                        </div>
                        
                        {/* Services in Category */}
                        {services.map(service => (
                          <div key={service.id} className="border-t border-[#333333]/20 last:border-b last:border-[#333333]/20">
                            {/* Service Header */}
                            <button
                              onClick={() => toggleService(service.id)}
                              className={`w-full py-2.5 transition-colors flex items-center justify-between ${
                                expandedServices.has(service.id) 
                                  ? 'bg-[#252525]/50 hover:bg-[#252525]/60' 
                                  : 'bg-transparent hover:bg-[#252525]/40'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 pl-4">
                                <ChevronRight 
                                  className={`w-4 h-4 transition-all ${
                                    expandedServices.has(service.id) ? 'rotate-90 text-[#336699]' : 'text-gray-500'
                                  }`}
                                />
                                <div className="text-left">
                                  <h3 className="text-white font-medium">{service.name}</h3>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 pr-4">
                                <span className={`text-sm px-2 py-0.5 rounded transition-all ${
                                  expandedServices.has(service.id) 
                                    ? 'text-[#336699] bg-[#336699]/10' 
                                    : 'text-gray-500 bg-[#252525]'
                                }`}>
                                  {service.templates?.length || 0}
                                </span>
                              </div>
                            </button>
                            
                            {/* Service Options (Templates) - Only show when expanded */}
                            {expandedServices.has(service.id) && service.templates && (
                              <div className="transition-all duration-200">
                                {/* Show description when expanded */}
                                {service.description && (
                                  <p className="text-gray-400 text-sm px-4 pt-2 pb-2">{service.description}</p>
                                )}
                                {service.templates.map((template: any, idx: number) => {
                                  const cartItem = cartItems.find(item => item.id === `template-${template.id}`);
                                  const cartQuantity = cartItem?.quantity || 0;
                                  
                                  return (
                                    <ServiceQuickRow
                                      key={template.id}
                                      template={template}
                                      cartQuantity={cartQuantity}
                                      onQuantityChange={(templateId, quantity) => {
                                        if (quantity === 0) {
                                          removeFromCart(`template-${templateId}`);
                                        } else {
                                          updateCartQuantity(`template-${templateId}`, quantity);
                                        }
                                      }}
                                      onAddToCart={(template, quantity) => {
                                        addToCart({ ...template, quantity }, 'template');
                                      }}
                                      isCondensed={condensedView}
                                      isHighlighted={false}
                                      onCustomized={() => {
                                        // Skip full reload to prevent page refresh
                                        // User will see customized option on next visit
                                        // Service customized successfully
                                      }}
                                      organizationId={selectedOrg?.id}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))
                  )
                ) : (
                  <div className="text-center py-16">
                    <div className="max-w-md mx-auto">
                      <Package className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-white mb-2">No services found</h3>
                      <p className="text-gray-400 mb-6">
                        {searchQuery 
                          ? `No services match "${searchQuery}"`
                          : selectedIndustry !== 'all'
                          ? 'No services available for the selected industry'
                          : 'No services have been created yet'}
                      </p>
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="px-4 py-2 bg-[#336699] text-white text-sm font-medium hover:bg-[#4477aa] transition-colors"
                        >
                          Clear Search
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
          </>
        )}

        {/* Estimate Cart */}
        <EstimateCart
          isOpen={showCart}
          onClose={() => setShowCart(false)}
          items={cartItems}
          onUpdateQuantity={updateCartQuantity}
          onRemoveItem={removeFromCart}
          onClearCart={clearCart}
          onCreateEstimate={() => {
            setShowCart(false);
            setShowEstimateDrawer(true);
          }}
          onSaveTemplate={() => {
            // Save current cart as a custom package
            // Saving as template
          }}
        />

        {/* Package Details Modal */}
        <PackageDetailsModal
          isOpen={showPackageDetails}
          onClose={() => {
            setShowPackageDetails(false);
            setSelectedPackage(null);
          }}
          package={selectedPackage}
          onAddToCart={() => {
            if (selectedPackage) {
              addToCart(selectedPackage, 'package');
            }
          }}
        />

        {/* Create Estimate Drawer */}
        <CreateEstimateDrawer
          isOpen={showEstimateDrawer}
          onClose={() => {
            setShowEstimateDrawer(false);
          }}
          preloadedItems={cartItems.map(item => ({
            product_id: item.id,
            product_name: item.name,
            quantity: item.quantity,
            price: item.price,
            description: item.name,
            unit: item.unit,
            // Pass the full data so we can expand if needed
            // For packages, we need to transform the templates to service_option_items format
            service_data: item.type === 'package' && item.fullData?.service_package_templates
              ? {
                  ...item.fullData,
                  service_option_items: item.fullData.service_package_templates
                    .filter((t: any) => t.template && !t.is_optional)
                    .map((t: any) => ({
                      id: t.id,
                      quantity: t.quantity,
                      line_item: {
                        name: t.template.name,
                        price: t.template.price,
                        unit: t.template.unit
                      }
                    }))
                }
              : item.fullData
          } as any))}
          onSave={async (estimateData) => {
            try {
              // Calculate subtotal and totals
              const subtotal = estimateData.total_amount;
              const tax_rate = 0; // Can be configured later
              const tax_amount = subtotal * (tax_rate / 100);
              const total_amount = subtotal + tax_amount;
              
              // Map items to include required fields
              const items = estimateData.items?.map((item: any) => ({
                ...item,
                unit_price: item.price || 0,
                total_price: (item.price || 0) * (item.quantity || 1)
              })) || [];
              
              // Create the estimate using EstimateService
              const result = await EstimateService.create({
                ...estimateData,
                items,
                organization_id: selectedOrg.id,
                user_id: user?.id || '',
                subtotal,
                tax_rate,
                tax_amount,
                total_amount,
                status: estimateData.status as "draft" | "sent" | "opened" | "accepted" | "rejected" | "expired"
              });
              
              if (result.id) {
                setShowEstimateDrawer(false);
                setCartItems([]); // Clear the cart
                // Navigate to the created estimate
                window.location.href = `/work/estimates/${result.id}`;
              }
            } catch (error) {
              // Error creating estimate
            }
          }}
        />


        {/* Bulk Customize Services Modal */}
        <BulkCustomizeServicesModal
          isOpen={showBulkCustomizeModal}
          onClose={() => setShowBulkCustomizeModal(false)}
          services={servicesWithTemplates.filter(s => 
            selectedIndustry === 'all' || s.industry_id === selectedIndustry
          )}
          organizationId={selectedOrg?.id || ''}
          industryName={industries.find(i => i.id === selectedIndustry)?.name || 'Selected'}
          onSuccess={() => {
            // Reload templates to show the custom pricing
            loadData();
          }}
        />
      </div>
    </div>
  );
};

// PackageCard Component
const PackageCard: React.FC<{
  pkg: any;
  onAddToCart: (item: CartItem) => void;
  isInCart: boolean;
}> = ({ pkg, onAddToCart, isInCart }) => {
  const [showDetails, setShowDetails] = useState(false);

  const handleAddToCart = () => {
    onAddToCart({
      id: `package-${pkg.id}`,
      name: pkg.name,
      price: pkg.calculated_price || 0,
      quantity: 1,
      type: 'package',
      packageId: pkg.id,
      unit: 'package',
      subtotal: pkg.calculated_price || 0,
      fullData: pkg
    });
  };

  // Extract services from service_package_templates
  const services = pkg.service_package_templates?.filter((t: any) => t.template && !t.is_optional) || [];
  const optionalServices = pkg.service_package_templates?.filter((t: any) => t.template && t.is_optional) || [];

  return (
    <>
      <div className="bg-[#252525] border border-[#333333] rounded-lg hover:border-[#336699]/50 transition-all duration-200 hover:shadow-lg hover:shadow-[#336699]/10 flex flex-col overflow-hidden">
        {/* Header Section */}
        <div className="p-3">
          {/* Badges */}
          <div className="flex items-center gap-1.5 mb-2">
            {pkg.is_featured && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#336699]/20 text-[#336699] rounded text-xs">
                <Star className="w-2.5 h-2.5" />
                Featured
              </span>
            )}
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs capitalize ${
              pkg.level === 'essentials' 
                ? 'bg-blue-500/20 text-blue-400' 
                : pkg.level === 'deluxe' 
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-green-500/20 text-green-400'
            }`}>
              {pkg.level || 'Complete'}
            </span>
          </div>
          
          {/* Title */}
          <h3 className="text-white font-semibold text-sm leading-tight mb-1 line-clamp-2">
            {pkg.name}
          </h3>
          
          {/* Industry */}
          <p className="text-xs text-gray-400">
            {pkg.industry_name || 'General'}
          </p>
        </div>

        {/* Description */}
        <div className="px-3 pb-2">
          <p className="text-gray-400 text-xs line-clamp-2 leading-relaxed">
            {pkg.description || `Complete ${pkg.name.toLowerCase()} package`}
          </p>
        </div>

        {/* Includes Section - Show more items */}
        <div className="px-3 pb-3 flex-1">
          {services.length > 0 && (
            <div className="space-y-1">
              {services.slice(0, 5).map((item: any, index: number) => (
                <div key={item.id || index} className="flex items-start gap-1.5">
                  <CheckCircle className="w-3 h-3 text-[#10B981] flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-gray-400 leading-tight line-clamp-1">
                    {item.template?.name || 'Service'}
                  </span>
                </div>
              ))}
              {services.length > 5 && (
                <div className="text-xs text-gray-500 pl-4.5">
                  +{services.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Section - Pricing & Actions */}
        <div className="border-t border-[#333333] p-3 bg-[#1A1A1A]">
          <div className="flex flex-col gap-2">
            {/* Price */}
            <div>
              <div className="text-base font-bold text-white">
                ${(pkg.calculated_price || 0).toLocaleString()}
              </div>
              <p className="text-xs text-gray-500">Starting at</p>
            </div>
            
            {/* Actions */}
            <div className="flex gap-1">
              <button
                onClick={() => setShowDetails(true)}
                className="p-1.5 hover:bg-[#252525] text-gray-400 hover:text-white rounded transition-colors"
                title="View Details"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleAddToCart}
                disabled={isInCart}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-all flex items-center justify-center gap-1 whitespace-nowrap ${
                  isInCart 
                    ? 'bg-[#10B981]/20 text-[#10B981] cursor-not-allowed' 
                    : 'bg-[#336699] hover:bg-[#4477aa] text-white'
                }`}
              >
                <Plus className="w-2.5 h-2.5" />
                {isInCart ? 'In Cart' : 'Add to Cart'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Package Details Modal */}
      <PackageDetailsModal
        package={pkg}
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        onAddToCart={handleAddToCart}
      />
    </>
  );
};
