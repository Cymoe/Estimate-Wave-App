import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building, Phone, Mail, Globe, Star, 
  Plus, Search, Filter, Edit2, Trash2, Eye,
  MapPin, Shield, CreditCard, ChevronRight,
  CheckCircle, Info, ChevronDown, List, LayoutGrid, Rows3,
  ExternalLink, MoreVertical, Upload, FileText, FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutContext, OrganizationContext } from '../layouts/DashboardLayout';
import { VendorService, Vendor, VENDOR_CATEGORIES } from '../../services/vendorService';
import { formatCurrency } from '../../utils/format';
import { advancedSearch, SearchableField } from '../../utils/searchUtils';
import { CreateVendorModal } from './CreateVendorModal';
import { EditVendorDrawer } from './EditVendorDrawer';
import { TableSkeleton } from '../skeletons/TableSkeleton';
import { CardSkeleton } from '../skeletons/CardSkeleton';
import { VendorExportService } from '../../services/VendorExportService';

interface VendorsListProps {
  showAddModal?: boolean;
  setShowAddModal?: (show: boolean) => void;
  hideAddButton?: boolean;
  searchTerm?: string;
}

export const VendorsList: React.FC<VendorsListProps> = ({ 
  showAddModal: externalShowAddModal, 
  setShowAddModal: externalSetShowAddModal, 
  hideAddButton = false,
  searchTerm = ''
}) => {
  const { user } = useAuth();
  const { isConstrained } = useContext(LayoutContext);
  const { selectedOrg } = useContext(OrganizationContext);
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showPreferredOnly, setShowPreferredOnly] = useState(false);
  const [internalCreateModalOpen, setInternalCreateModalOpen] = useState(false);
  
  // Use external modal state if provided, otherwise use internal state
  const isCreateModalOpen = externalShowAddModal !== undefined ? externalShowAddModal : internalCreateModalOpen;
  const setIsCreateModalOpen = externalSetShowAddModal || setInternalCreateModalOpen;

  const [vendorStats, setVendorStats] = useState<Record<string, any>>({});
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'compact'>('compact');
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<string>('all');
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [deletingVendor, setDeletingVendor] = useState<Vendor | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside filter menu
      if (filterMenuRef.current && !filterMenuRef.current.contains(target) && showFilterMenu) {
        setShowFilterMenu(false);
      }
      
      // Check if click is outside options menu
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(target)) {
        setShowOptionsMenu(false);
      }
      
      // Check if click is outside all dropdown menus
      const isOutsideDropdown = Object.values(dropdownRefs.current).every(ref => 
        !ref || !ref.contains(target)
      );
      
      if (isOutsideDropdown && openDropdownId) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu, openDropdownId]);

  // Only reload when user.id or organization changes
  useEffect(() => {
    if (user?.id && selectedOrg?.id && !hasLoadedData) {
      loadVendors();
    }
  }, [user?.id, selectedOrg?.id, hasLoadedData]);

  const loadVendors = async () => {
    if (!user || !selectedOrg?.id) return;
    setLoading(true);
    try {
      const data = await VendorService.getVendors(selectedOrg.id);
      setVendors(data);
      setLoading(false); // Show vendors immediately
      setHasLoadedData(true);
      
      // Load stats for each vendor in parallel (much faster)
      const statsPromises = data.map(async (vendor) => {
        try {
          const stats = await VendorService.getVendorStats(vendor.id);
          setVendorStats(prev => ({ ...prev, [vendor.id]: stats })); // Update stats incrementally
          return { vendorId: vendor.id, stats };
        } catch (error: any) {
          // Handle network errors gracefully
          let fallbackStats;
          if (error.message?.includes('Failed to fetch') || error.code === 'NETWORK_ERROR') {
            console.warn(`Network error loading stats for vendor ${vendor.name}. Skipping stats.`);
            fallbackStats = { totalSpent: 0, projectCount: 0, isOffline: true };
          } else {
            console.error(`Error loading stats for vendor ${vendor.id}:`, error);
            fallbackStats = { totalSpent: 0, projectCount: 0, hasError: true };
          }
          setVendorStats(prev => ({ ...prev, [vendor.id]: fallbackStats }));
          return { vendorId: vendor.id, stats: fallbackStats };
        }
      });
      
      // Wait for all stats to complete in parallel
      Promise.all(statsPromises).catch(error => {
        console.error('Error loading vendor stats:', error);
      });
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      // Handle network connectivity for main vendor list
      if (error.message?.includes('Failed to fetch')) {
        console.warn('Network error: Unable to load vendors. Check internet connection.');
      }
      setLoading(false);
      setHasLoadedData(true);
    }
  };

  const handleDeleteClick = (vendor: Vendor) => {
    setDeletingVendor(vendor);
    setShowDeleteConfirm(true);
    setOpenDropdownId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingVendor) return;
    
    try {
      await VendorService.deleteVendor(deletingVendor.id, selectedOrg?.id || '');
      await loadVendors();
      setShowDeleteConfirm(false);
      setDeletingVendor(null);
    } catch (error) {
      console.error('Error deleting vendor:', error);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeletingVendor(null);
  };

  const forceReloadVendors = async () => {
    setHasLoadedData(false);
    await loadVendors();
  };

  const handleExportToCSV = async () => {
    try {
      await VendorExportService.exportToCSV(filteredVendors);
      console.log('CSV export completed');
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      alert('Failed to export to CSV');
    }
  };

  const handleExportToExcel = async () => {
    try {
      await VendorExportService.exportToExcel(filteredVendors);
      console.log('Excel export completed');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel');
    }
  };

  const handleImportVendors = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !selectedOrg?.id) return;
      
      try {
        const result = await VendorExportService.importFromFile(file, selectedOrg.id);
        
        if (result.errors.length > 0) {
          console.error('Import errors:', result.errors);
          alert(`Import completed with errors:\n- ${result.success} vendors imported successfully\n- ${result.errors.length} errors\n\nCheck console for details.`);
        } else {
          alert(`Successfully imported ${result.success} vendors!`);
        }
        
        // Refresh the vendors list
        await forceReloadVendors();
      } catch (error) {
        console.error('Error importing file:', error);
        alert('Failed to import file. Please check the format and try again.');
      }
    };
    input.click();
  };

  const filteredVendors = vendors.filter(vendor => {
    // Advanced search filter
    let matchesSearch = true;
    if (searchTerm) {
      const searchableFields: SearchableField[] = [
        { 
          key: 'name', 
          weight: 2.0, // Higher weight for vendor names
          transform: (vendor) => vendor.name || ''
        },
        { 
          key: 'contact_name', 
          weight: 1.5, // High weight for contact names
          transform: (vendor) => vendor.contact_name || ''
        },
        { 
          key: 'specialty', 
          weight: 1.3,
          transform: (vendor) => vendor.specialty || ''
        },
        { 
          key: 'category', 
          weight: 1.0,
          transform: (vendor) => vendor.category || ''
        },
        { 
          key: 'email', 
          weight: 0.8,
          transform: (vendor) => vendor.email || ''
        },
        { 
          key: 'phone', 
          weight: 0.7,
          transform: (vendor) => vendor.phone || ''
        },
        { 
          key: 'city', 
          weight: 0.6,
          transform: (vendor) => vendor.city || ''
        },
        { 
          key: 'total_spent', 
          weight: 1.0,
          transform: (vendor) => {
            const stats = vendorStats[vendor.id];
            return formatCurrency(stats?.totalSpent || 0);
          }
        }
      ];

      const searchResults = advancedSearch([vendor], searchTerm, searchableFields, {
        minScore: 0.2, // Lower threshold for more inclusive results
        requireAllTerms: false // Allow partial matches
      });

      matchesSearch = searchResults.length > 0;
    }

    const matchesCategory = selectedCategory === 'all' || vendor.category === selectedCategory;
    const matchesPreferred = !showPreferredOnly || vendor.is_preferred;
    
    // Rating filter
    let matchesRating = true;
    if (selectedRatingFilter !== 'all') {
      const rating = vendor.rating || 0;
      switch (selectedRatingFilter) {
        case 'excellent':
          matchesRating = rating >= 4.5;
          break;
        case 'good':
          matchesRating = rating >= 3.5 && rating < 4.5;
          break;
        case 'fair':
          matchesRating = rating >= 2.5 && rating < 3.5;
          break;
        case 'unrated':
          matchesRating = !vendor.rating;
          break;
      }
    }
    
    return matchesSearch && matchesCategory && matchesPreferred && matchesRating;
  });

  const getCategoryStats = () => {
    const stats: Record<string, number> = {};
    vendors.forEach(vendor => {
      stats[vendor.category] = (stats[vendor.category] || 0) + 1;
    });
    return stats;
  };

  const categoryStats = getCategoryStats();

  const resetFilters = () => {
    setSelectedCategory('all');
    setShowPreferredOnly(false);
    setSelectedRatingFilter('all');
  };

  return (
    <div>
      {/* Vendors Section */}
      <div>
        {/* Unified Container with transparent background */}
                    <div className="bg-transparent">
              {/* Stats Section */}
              <div className={`${isConstrained ? 'px-4 py-3' : 'px-6 py-4'} border-b border-[#333333]/50`}>
            {isConstrained ? (
              // Compact 4-column row for constrained
                              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">SUPPLIERS</div>
                  <div className="text-base font-semibold mt-1">{vendors.length}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">PREFERRED</div>
                  <div className="text-base font-semibold text-yellow-400 mt-1">{vendors.filter(v => v.is_preferred).length}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">PURCHASES</div>
                  <div className="text-base font-semibold text-green-400 mt-1">
                    {formatCurrency(Object.values(vendorStats).reduce((sum, stats) => sum + (stats?.totalSpent || 0), 0))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">CATEGORIES</div>
                  <div className="text-base font-semibold mt-1">{Object.keys(getCategoryStats()).length}</div>
                </div>
              </div>
            ) : (
              // Full 4-column layout for desktop
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">SUPPLIERS</div>
                  <div className="text-lg font-semibold mt-1">{vendors.length}</div>
                  <div className="text-xs text-gray-500">material sources</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">PREFERRED</div>
                  <div className="text-lg font-semibold text-yellow-400 mt-1">{vendors.filter(v => v.is_preferred).length}</div>
                  <div className="text-xs text-gray-500">preferred accounts</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">TOTAL PURCHASES</div>
                  <div className="text-lg font-semibold text-green-400 mt-1">
                    {formatCurrency(Object.values(vendorStats).reduce((sum, stats) => sum + (stats?.totalSpent || 0), 0))}
                  </div>
                  <div className="text-xs text-gray-500">materials & supplies</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">CATEGORIES</div>
                  <div className="text-lg font-semibold mt-1">{Object.keys(getCategoryStats()).length}</div>
                  <div className="text-xs text-gray-500">material types</div>
                </div>
              </div>
            )}
          </div>

          {/* Controls Section */}
          <div className={`${isConstrained ? 'px-4 py-3' : 'px-6 py-4'} border-b border-[#333333]/50`}>
            <div className="flex items-center justify-between">
              {/* Left side - Filters */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select
                    className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699] appearance-none pr-10 min-w-[200px]"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="all">All Categories ({vendors.length})</option>
                    {VENDOR_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat} ({getCategoryStats()[cat] || 0})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                
                <div className="relative" ref={filterMenuRef}>
                  <button 
                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                    className={`px-3 py-2 bg-[#1E1E1E] hover:bg-[#252525] text-white border border-[#333333] rounded-[4px] text-sm font-medium transition-colors flex items-center gap-2 ${showFilterMenu ? 'bg-[#252525]' : ''}`}
                  >
                    <Filter className="w-4 h-4" />
                    <span>{isConstrained ? '' : 'More Filters'}</span>
                  </button>
                  
                  {/* Filter Menu Dropdown */}
                  {showFilterMenu && (
                    <div className={`absolute top-full left-0 mt-1 ${isConstrained ? 'right-0 left-auto w-[280px]' : 'w-80'} bg-[#1E1E1E] border border-[#333333] rounded-[4px] shadow-lg z-50 p-3 md:p-4`}>
                      <div className="space-y-3 md:space-y-4">
                        {/* Preferred Only */}
                        <div>
                          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 md:mb-2">
                            Vendor Preference
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowPreferredOnly(!showPreferredOnly)}
                              className={`px-3 py-2 rounded-[4px] text-sm font-medium transition-colors flex items-center gap-2 border ${
                                showPreferredOnly 
                                  ? 'bg-[#336699] text-white border-[#336699]' 
                                  : 'bg-[#333333] text-white border-[#555555] hover:bg-[#404040]'
                              }`}
                            >
                              <Star className="w-4 h-4" />
                              <span>Preferred Only</span>
                            </button>
                          </div>
                        </div>

                        {/* Rating Filter */}
                        <div>
                          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 md:mb-2">
                            Rating
                          </label>
                          <select
                            className="w-full bg-[#333333] border border-[#555555] rounded-[4px] px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-white focus:outline-none focus:border-[#336699]"
                            value={selectedRatingFilter}
                            onChange={(e) => setSelectedRatingFilter(e.target.value)}
                          >
                            <option value="all">All Ratings</option>
                            <option value="excellent">Excellent (4.5+ stars)</option>
                            <option value="good">Good (3.5-4.5 stars)</option>
                            <option value="fair">Fair (2.5-3.5 stars)</option>
                            <option value="unrated">Unrated</option>
                          </select>
                        </div>

                        {/* Clear Filters */}
                        <div className="pt-2 md:pt-3 border-t border-[#333333]">
                          <button
                            onClick={() => {
                              resetFilters();
                              setShowFilterMenu(false);
                            }}
                            className="w-full bg-[#333333] hover:bg-[#404040] text-white py-1.5 md:py-2 px-2 md:px-3 rounded-[4px] text-xs md:text-sm font-medium transition-colors"
                          >
                            Clear All Filters
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right side - View Toggle and Add Button */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode('compact')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'compact' ? 'bg-[#2A2A2A] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Compact View"
                  >
                    <Rows3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'list' ? 'bg-[#2A2A2A] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="relative" ref={optionsMenuRef}>
                  <button
                    onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                    className="bg-[#1E1E1E] border border-[#333333] p-2 text-white hover:bg-[#333333] transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {showOptionsMenu && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-[#1E1E1E] border border-[#333333] shadow-lg z-[9999] py-2">
                      <button
                        onClick={handleImportVendors}
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#333333] flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Import Vendors
                      </button>
                      <div className="border-t border-[#333333] my-1" />
                      <button
                        onClick={handleExportToCSV}
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#333333] flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        Export to CSV
                      </button>
                      <button
                        onClick={handleExportToExcel}
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#333333] flex items-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Export to Excel
                      </button>
                    </div>
                  )}
                </div>
                
                                  {!hideAddButton && (
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="bg-white hover:bg-gray-100 text-black px-4 py-2 rounded-[8px] text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Vendor</span>
                    </button>
                  )}
              </div>
            </div>
          </div>

          {/* Vendors Content */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="bg-transparent border border-[#333333]">
                <TableSkeleton rows={5} columns={5} />
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="text-center py-12">
                <Building className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400">No vendors found</p>
              </div>
            ) : viewMode === 'compact' ? (
              <div className="bg-[#121212] overflow-hidden">
                <div className="space-y-0">
                  {filteredVendors.map((vendor, index) => {
                    const stats = vendorStats[vendor.id];
                    return (
                      <div key={vendor.id} className="relative">
                        <div
                          onClick={() => navigate(`/vendors/${vendor.id}`)}
                          className="w-full text-left p-2 hover:bg-[#333333] transition-all border-b border-gray-700/30 group cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                {vendor.is_preferred && (
                                  <Star className="w-3 h-3 text-yellow-400 fill-current flex-shrink-0" />
                                )}
                                <div 
                                  className="text-sm font-medium text-white hover:text-blue-400 cursor-pointer truncate"
                                  onClick={() => navigate(`/vendors/${vendor.id}`)}
                                >
                                  {vendor.name}
                                </div>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-400/10 text-green-400 flex-shrink-0">
                                  Active
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-3 text-xs text-gray-400">
                                {vendor.category && (
                                  <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs flex-shrink-0">
                                    {vendor.category}
                                  </span>
                                )}
                                {vendor.contact_name && <span className="truncate">{vendor.contact_name}</span>}
                                {vendor.email && <span className="text-blue-400 truncate">{vendor.email}</span>}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <div className="text-sm font-semibold text-green-400">
                                  {formatCurrency(stats?.totalSpent || 0)}
                                </div>
                                <div className="text-xs text-gray-400">
                                  total spent
                                </div>
                              </div>
                              
                              <div className="relative" ref={(el) => dropdownRefs.current[vendor.id] = el}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenDropdownId(openDropdownId === vendor.id ? null : vendor.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-600 rounded"
                                  title="More options"
                                >
                                  <MoreVertical className="w-3 h-3 text-gray-400" />
                                </button>
                                
                                {openDropdownId === vendor.id && (
                                  <div className="absolute top-full right-0 mt-1 w-48 bg-[#2A2A2A] border border-[#404040] shadow-lg z-[10001] py-1 rounded-[4px]">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/vendors/${vendor.id}`);
                                        setOpenDropdownId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                    >
                                      <Eye className="w-3 h-3 mr-2" />
                                      View Details
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingVendor(vendor);
                                        setOpenDropdownId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                    >
                                      <Edit2 className="w-3 h-3 mr-2" />
                                      Edit
                                    </button>
                                    <div className="border-t border-[#404040] my-1"></div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClick(vendor);
                                      }}
                                      className="w-full text-left px-3 py-2 text-red-400 text-xs hover:bg-red-600/20 transition-colors flex items-center"
                                    >
                                      <Trash2 className="w-3 h-3 mr-2" />
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredVendors.length === 0 && (
                    <div className="text-center py-8">
                      <div className="text-gray-400 text-sm">No vendors found</div>
                      <div className="text-gray-500 text-xs mt-1">Try adjusting your search or filters</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#121212] overflow-hidden">
                <div className="space-y-0">
                  {filteredVendors.map((vendor, index) => {
                    const stats = vendorStats[vendor.id];
                    return (
                      <div key={vendor.id} className="relative">
                        <div
                          onClick={() => navigate(`/vendors/${vendor.id}`)}
                          className="w-full text-left p-3 md:p-4 hover:bg-[#333333] transition-all border-b border-gray-700/30 group cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                {vendor.is_preferred && (
                                  <Star className="w-4 h-4 text-yellow-400 fill-current flex-shrink-0" />
                                )}
                                <div 
                                  className="text-sm font-medium text-white hover:text-blue-400 cursor-pointer"
                                  onClick={() => navigate(`/vendors/${vendor.id}`)}
                                >
                                  {vendor.name}
                                </div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-400/10 text-green-400">
                                  Active
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-4 text-xs text-gray-400 mb-1">
                                {vendor.category && (
                                  <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs">
                                    {vendor.category}
                                  </span>
                                )}
                                                                 {vendor.contact_name && <span>{vendor.contact_name}</span>}
                              </div>
                              
                              <div className="flex items-center gap-4 text-xs text-gray-400">
                                {vendor.email && <span className="text-blue-400">{vendor.email}</span>}
                                {vendor.phone && <span>{vendor.phone}</span>}
                              </div>
                            </div>
                                                          <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-sm font-semibold text-green-400">
                                    {formatCurrency(stats?.totalSpent || 0)}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    total spent
                                  </div>
                                </div>
                                
                                <div className="relative" ref={(el) => dropdownRefs.current[vendor.id] = el}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(openDropdownId === vendor.id ? null : vendor.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-600 rounded"
                                    title="More options"
                                  >
                                    <MoreVertical className="w-4 h-4 text-gray-400" />
                                  </button>
                                  
                                  {openDropdownId === vendor.id && (
                                    <div className="absolute top-full right-0 mt-1 w-48 bg-[#2A2A2A] border border-[#404040] shadow-lg z-[10001] py-1 rounded-[4px]">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/vendors/${vendor.id}`);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <Eye className="w-3 h-3 mr-2" />
                                        View Details
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingVendor(vendor);
                                          setOpenDropdownId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-white text-xs hover:bg-[#336699] transition-colors flex items-center"
                                      >
                                        <Edit2 className="w-3 h-3 mr-2" />
                                        Edit
                                      </button>
                                      <div className="border-t border-[#404040] my-1"></div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteClick(vendor);
                                        }}
                                        className="w-full text-left px-3 py-2 text-red-400 text-xs hover:bg-red-600/20 transition-colors flex items-center"
                                      >
                                        <Trash2 className="w-3 h-3 mr-2" />
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredVendors.length === 0 && (
                    <div className="text-center py-8">
                      <div className="text-gray-400 text-sm">No vendors found</div>
                      <div className="text-gray-500 text-xs mt-1">Try adjusting your search or filters</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateVendorModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onVendorCreated={(newVendor) => {
            if (newVendor) {
              // Add the new vendor to the list immediately (optimistic update)
              setVendors(prevVendors => [newVendor, ...prevVendors]);
              // Initialize empty stats for the new vendor
              setVendorStats(prev => ({ ...prev, [newVendor.id]: { totalSpent: 0, projectCount: 0 } }));
            } else {
              // Fallback to full reload if no vendor data returned
              forceReloadVendors();
            }
          }}
        />
      )}

      {/* Edit Vendor Drawer */}
      <EditVendorDrawer
        vendor={editingVendor}
        onClose={() => setEditingVendor(null)}
        onSuccess={() => {
          forceReloadVendors();
          setEditingVendor(null);
        }}
        onDelete={(vendorId) => {
          setVendors(vendors.filter(v => v.id !== vendorId));
          setEditingVendor(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0a0a0a] rounded-xl max-w-md w-full border border-white/10 shadow-2xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Vendor</h3>
              <p className="text-white/60 mb-6">
                Are you sure you want to delete "{deletingVendor?.name}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={handleDeleteCancel}
                  className="h-12 px-6 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all font-medium border border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="h-12 px-6 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-400 hover:to-red-500 transition-all font-medium flex items-center gap-3 shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
  );
}; 