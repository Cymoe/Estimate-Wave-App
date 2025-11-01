import { useState, useEffect, useMemo, useRef } from 'react';
import { formatCurrency } from '../../utils/format';
// import { supabase } from '../../lib/supabase'; // Removed - using MongoDB
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../common/Modal';
import { SlideOutDrawer } from '../common/SlideOutDrawer';
import { LineItemForm } from './LineItemForm';
// import { LineItemService } from '../../services/LineItemService'; // Old Supabase
// import { CostCodeService } from '../../services/CostCodeService'; // Old Supabase
import { MongoLineItemService as LineItemService } from '../../services/MongoLineItemService'; // MongoDB version
import { costCodesAPI } from '../../lib/api'; // MongoDB API
import { LineItem } from '../../types';
import { MoreVertical, Filter, Plus, Copy, Star, Trash2, Edit3, Upload, FileText, LayoutGrid, FileSpreadsheet, DollarSign, ChevronRight, ChevronDown, Layers } from 'lucide-react';
import './price-book.css';
import { useNavigate } from 'react-router-dom';
import { LayoutContext, OrganizationContext } from '../layouts/DashboardLayout';
import React from 'react';
import { CostCodeExportService } from '../../services/CostCodeExportService';
import { PricingModeSelector } from './PricingModeSelector';
import { PricingModePreviewModal } from './PricingModePreviewModal';
import { PricingModesService, PricingMode } from '../../services/PricingModesService';
import { PriceRangeCompact } from './PriceRangeDisplay';

// Using LineItem interface from types instead of local Product interface



// Add TypeScript declaration for the window object
declare global {
  interface Window {
    openLineItemModal?: () => void;
  }
}

interface PriceBookProps {
  triggerAddItem?: number;
}

export const PriceBook: React.FC<PriceBookProps> = ({ triggerAddItem }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { } = React.useContext(LayoutContext);
  const { selectedOrg } = React.useContext(OrganizationContext);
  const [showNewLineItemModal, setShowNewLineItemModal] = useState(false);
  const [showEditLineItemModal, setShowEditLineItemModal] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('any');
  const [priceSort, setPriceSort] = useState<'asc' | 'desc'>('desc');
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<{ id: string; name: string; code: string; industry?: { id: string; name: string; icon?: string; color?: string } }[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string>('all');
  const [groupedTrades, setGroupedTrades] = useState<Map<string, typeof trades>>(new Map());
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState('all');
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState('all');
  const [condensed, setCondensed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pricebook-condensed') === 'true';
    }
    return false;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingCostCodes, setIsLoadingCostCodes] = useState(true);
  const [quickFilter, setQuickFilter] = useState<'all' | 'labor' | 'materials' | 'services' | 'installation'>('all');
  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<PricingMode | null>(null);
  const [showModePreview, setShowModePreview] = useState(false);
  const [pendingModeId, setPendingModeId] = useState<string | null>(null);
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [presetCostCodeId, setPresetCostCodeId] = useState<string | null>(null);
  const [presetServiceCategory, setPresetServiceCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lastPricingOperation, setLastPricingOperation] = useState<{
    modeId: string;
    modeName: string;
    lineItemIds: string[];
    previousPrices: Array<{ lineItemId: string; price: number }>;
    timestamp: number;
  } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimeLeft, setUndoTimeLeft] = useState(30);
  const [applyingProgress, setApplyingProgress] = useState<{
    current: number;
    total: number;
    action: 'applying' | 'undoing';
  } | null>(null);
  const [showSuccess, setShowSuccess] = useState<{
    message: string;
    itemCount: number;
  } | null>(null);
  const [showError, setShowError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobPollingInterval, setJobPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Calculate counts for each quick filter
  const quickFilterCounts = useMemo(() => {
    const counts = {
      all: lineItems.length,
      labor: 0,
      materials: 0,
      installation: 0,
      services: 0
    };
    
    lineItems.forEach(item => {
      const costCode = trades.find(t => t.id === item.cost_code_id);
      if (!costCode) return;
      
      const codeNumber = parseInt(costCode.code.replace(/[^0-9]/g, ''));
      if (isNaN(codeNumber)) return;
      
      if (codeNumber >= 100 && codeNumber <= 199) counts.labor++;
      if (codeNumber >= 500 && codeNumber <= 599) counts.materials++;
      if (codeNumber >= 200 && codeNumber <= 299) counts.installation++;
      if ((codeNumber >= 300 && codeNumber <= 399) || (codeNumber >= 600 && codeNumber <= 699)) counts.services++;
    });
    
    return counts;
  }, [lineItems, trades]);
  
  
  // Handle trigger from parent component
  useEffect(() => {
    if (triggerAddItem && triggerAddItem > 0) {
      setShowNewLineItemModal(true);
    }
  }, [triggerAddItem]);
  
  
  const handleEditLineItem = (lineItem: LineItem) => {
    setEditingLineItem(lineItem);
    setShowEditLineItemModal(true);
  };

  const handleSaveEdit = async (data: any) => {
    try {
      if (!editingLineItem?.id || !selectedOrg?.id) return;
      
      // Optimistically update the UI immediately
      setLineItems(prevItems => 
        prevItems.map(item => 
          item.id === editingLineItem.id 
            ? {
                ...item,
                price: data.price,
                name: data.name || item.name,
                description: data.description !== undefined ? data.description : item.description,
                unit: data.unit || item.unit,
                has_override: !editingLineItem.organization_id && data.price !== editingLineItem.base_price,
                markup_percentage: data.markup_percentage,
                base_price: item.base_price // Keep base_price for strategy calculation
              }
            : item
        )
      );
      
      // Trigger animation for the updated item
      setRecentlyUpdatedId(editingLineItem.id);
      setTimeout(() => setRecentlyUpdatedId(null), 1500); // Clear after animation
      
      // Close modal immediately for better UX
      setShowEditLineItemModal(false);
      setEditingLineItem(null);
      
      // Then update the backend
      try {
        // Check if this is a shared item (no organization_id)
        if (!editingLineItem.organization_id) {
          // For shared items, handle markup or custom price
          if (data.markup_percentage !== undefined) {
            // Set markup percentage
            await LineItemService.setMarkupPercentage(editingLineItem.id, selectedOrg.id, data.markup_percentage);
          } else if (data.price && data.price !== editingLineItem.base_price) {
            // Set custom price
            await LineItemService.setOverridePrice(editingLineItem.id, selectedOrg.id, data.price);
          } else if (data.price === editingLineItem.base_price) {
            // Reset to base price
            await LineItemService.removeOverridePrice(editingLineItem.id, selectedOrg.id);
          }
        } else {
          // For organization-owned items, update normally
          await LineItemService.update(editingLineItem.id, {
            name: data.name,
            description: data.description,
            price: data.price,
            unit: data.unit,
            cost_code_id: data.cost_code_id
          }, selectedOrg.id);
        }
      } catch (error) {
        // If backend update fails, revert the optimistic update
        console.error('Error updating line item:', error);
        alert(error instanceof Error ? error.message : 'Failed to update line item');
        await fetchLineItems(); // Reload to get correct state
      }
    } catch (error) {
      console.error('Error in handleSaveEdit:', error);
      alert('Failed to update line item');
    }
  };

  const handleToggleFavorite = async (lineItem: LineItem) => {
    try {
      // Only allow favoriting for organization-owned items or shared items
      await LineItemService.update(lineItem.id, {
        favorite: !lineItem.favorite
      }, selectedOrg?.id);
      await fetchLineItems();
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // For shared items, we might need a different approach
      // For now, just log the error
    }
  };


  const handleDeleteLineItem = async (lineItem: LineItem) => {
    if (confirm('Are you sure you want to delete this line item?')) {
      try {
        await LineItemService.delete(lineItem.id, selectedOrg?.id);
        await fetchLineItems();
      } catch (error) {
        console.error('Error deleting line item:', error);
        alert(error instanceof Error ? error.message : 'Failed to delete line item');
      }
    }
  };

  const handleDuplicateLineItem = async (lineItem: LineItem) => {
    try {
      await LineItemService.create({
        name: `${lineItem.name} (Copy)`,
        description: lineItem.description,
        price: lineItem.price,
        unit: lineItem.unit,
        user_id: user?.id || '',
        organization_id: selectedOrg?.id || '',
        status: lineItem.status,
        favorite: false,
        vendor_id: lineItem.vendor_id,
        cost_code_id: lineItem.cost_code_id
      });

      await fetchLineItems();
    } catch (error) {
      console.error('Error duplicating line item:', error);
    }
  };


  // Functions for the new menu options
  const handleImportItems = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !selectedOrg?.id || !user?.id) return;
      
      try {
        const result = await CostCodeExportService.importFromFile(file, selectedOrg.id, user.id);
        
        if (result.errors.length > 0) {
          console.error('Import errors:', result.errors);
          alert(`Import completed with errors:\n- ${result.success} items imported successfully\n- ${result.errors.length} errors\n\nCheck console for details.`);
        } else {
          alert(`Successfully imported ${result.success} items!`);
        }
        
        // Refresh the line items list
        await fetchLineItems();
      } catch (error) {
        console.error('Error importing file:', error);
        alert('Failed to import file. Please check the format and try again.');
      }
    };
    input.click();
  };

  const handleExportToCSV = async () => {
    try {
      await CostCodeExportService.exportToCSV(filteredLineItems, trades);
      console.log('CSV export completed');
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      alert('Failed to export to CSV');
    }
  };

  const handleExportToExcel = async () => {
    try {
      await CostCodeExportService.exportToExcel(filteredLineItems, trades);
      console.log('Excel export completed');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel');
    }
  };

  const handlePrintPriceBook = () => {
    // Create a print-friendly version
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cost Codes - ${new Date().toLocaleDateString()}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f2f2f2; font-weight: bold; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Cost Codes</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <p>Total Items: ${filteredLineItems.length}</p>
        
        <table>
          <thead>
            <tr>
              <th>Cost Code</th>
              <th>Item Name</th>
              <th>Description</th>
              <th>Price</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            ${filteredLineItems.map(lineItem => {
              const trade = trades.find(t => t.id === lineItem.cost_code_id);
              const costCodeDisplay = trade ? `${trade.code} ${trade.name}` : (lineItem.cost_code ? `${lineItem.cost_code.code} ${lineItem.cost_code.name}` : '—');
              return `
                <tr>
                  <td>${costCodeDisplay}</td>
                  <td>${lineItem.name}</td>
                  <td>${lineItem.description || ''}</td>
                  <td>${lineItem.red_line_price && lineItem.cap_price ? 
                    `RED: ${formatCurrency(lineItem.red_line_price)} | BASE: ${formatCurrency(lineItem.base_price || lineItem.price)} | CAP: ${formatCurrency(lineItem.cap_price)}` :
                    formatCurrency(lineItem.price)
                  }</td>
                  <td>${lineItem.unit}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #333; color: white; border: none; cursor: pointer;">
          Print
        </button>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(false);
      }
      // Removed filter menu click outside handler
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (selectedOrg?.id) {
      fetchLineItems();
      fetchTrades();
    }
  }, [user?.id, selectedOrg?.id]);


  const fetchTrades = async () => {
    try {
      setIsLoadingCostCodes(true);
      console.log('Fetching cost codes for organization:', selectedOrg?.id);
      
      if (!selectedOrg?.id) {
        console.log('No organization selected, skipping cost codes fetch');
        setTrades([]);
        return;
      }

      // Use MongoDB API for cost codes
      const data = await costCodesAPI.list({ isActive: true });
      console.log('Cost codes fetched:', data?.length || 0);
      console.log('First few cost codes:', data?.slice(0, 3));
      setTrades(data || []);
      
      // Group by category for dropdown
      const grouped = new Map();
      data?.forEach((code: any) => {
        const category = code.category || 'Uncategorized';
        if (!grouped.has(category)) {
          grouped.set(category, []);
        }
        grouped.get(category).push(code);
      });
      console.log('Grouped cost codes by category:', Array.from(grouped.keys()));
      setGroupedTrades(grouped);
    } catch (err) {
      console.error('Error in fetchTrades:', err);
      console.error('Error details:', err);
      setTrades([]);
    } finally {
      setIsLoadingCostCodes(false);
    }
  };

  const fetchLineItems = async (smartMerge = false) => {
    try {
      if (!smartMerge) {
        setIsLoading(true);
      }
      setError(null);
      
      if (!selectedOrg?.id) {
        console.error('No organization selected');
        setError('No organization selected');
        setIsLoading(false);
        return;
      }
      
      console.log('Fetching line items for organization:', selectedOrg.id);
      
      // Fetch only line items for smart merge
      const lineItemsResult = await LineItemService.list(selectedOrg.id)
        .then(data => ({ status: 'fulfilled' as const, value: data }))
        .catch(error => ({ status: 'rejected' as const, reason: error }));
      
      // Handle line items result
      if (lineItemsResult.status === 'fulfilled') {
        const data = lineItemsResult.value;
        console.log('Line items fetched successfully:', data?.length || 0, 'items');
        // Debug: Check if price range data is coming through
        if (data && data.length > 0) {
          const sampleItem = data.find((item: LineItem) => item.name === 'Master Carpenter' || item.name === 'Footing');
          if (sampleItem) {
            console.log('Sample item with price ranges:', {
              name: sampleItem.name,
              price: sampleItem.price,
              base_price: sampleItem.base_price,
              red_line_price: sampleItem.red_line_price,
              cap_price: sampleItem.cap_price
            });
          }
        }
        
        if (smartMerge) {
          // Smart merge: only update items that have changed
          setLineItems(currentItems => {
            const updatedItems = currentItems.map(currentItem => {
              const serverItem = data?.find((item: LineItem) => item.id === currentItem.id);
              if (serverItem) {
                // Only update if there are actual differences (more thorough check)
                const hasChanges = 
                  Math.abs(serverItem.price - currentItem.price) > 0.001 || // Float comparison
                  serverItem.applied_mode_name !== currentItem.applied_mode_name ||
                  serverItem.applied_mode_id !== currentItem.applied_mode_id ||
                  serverItem.has_override !== currentItem.has_override ||
                  serverItem.base_price !== currentItem.base_price;
                
                return hasChanges ? serverItem : currentItem;
              }
              return currentItem;
            });
            
            // Add any new items from server that aren't in current state
            const currentIds = new Set(currentItems.map((item: LineItem) => item.id));
            const newItems = data?.filter((item: LineItem) => !currentIds.has(item.id)) || [];
            
            return [...updatedItems, ...newItems];
          });
        } else {
          // Full replace (original behavior)
          setLineItems(data || []);
        }
      } else if (lineItemsResult.status === 'rejected') {
        console.error('Failed to fetch line items:', lineItemsResult.reason);
        setError('Failed to load line items');
      }
    } catch (error) {
      console.error('Error fetching line items:', error);
      console.error('Error details:', error);
      setError(error instanceof Error ? error.message : 'Failed to load line items');
    } finally {
      if (!smartMerge) {
        setIsLoading(false);
      }
    }
  };


  

  // Fetch vendors
  useEffect(() => {
    const fetchVendors = async () => {
      // TODO: Implement vendors API for MongoDB
      const data: any[] = []; // Temporarily empty until vendors migration
      const error = null;
      if (!error && data) setVendors(data);
    };
    fetchVendors();
  }, []);


  const filteredLineItems = useMemo(() => {
    let filtered = [...lineItems];

    // Status filter
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(lineItem => lineItem.status === selectedStatus);
    }
    // Favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter(lineItem => lineItem.favorite);
    }
    // Date added/updated filter
    if (selectedDateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (selectedDateRange === '7d') cutoff.setDate(now.getDate() - 7);
      if (selectedDateRange === '30d') cutoff.setDate(now.getDate() - 30);
      filtered = filtered.filter(lineItem =>
        new Date(lineItem.updated_at || lineItem.created_at || '') >= cutoff
      );
    }
    // Vendor filter
    if (selectedVendorId !== 'all') {
      filtered = filtered.filter(lineItem => lineItem.vendor_id === selectedVendorId);
    }

    // Filter by cost_code_id (if not 'all')
    if (selectedTradeId !== 'all') {
      filtered = filtered.filter(lineItem => lineItem.cost_code_id === selectedTradeId);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(lineItem => {
        return (
          lineItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (lineItem.description && lineItem.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      });
    }

    // Apply quick filter based on cost code ranges
    if (quickFilter !== 'all') {
      filtered = filtered.filter(lineItem => {
        const costCode = trades.find(t => t.id === lineItem.cost_code_id);
        if (!costCode) return false;
        
        // Extract the numeric part of the cost code
        const codeNumber = parseInt(costCode.code.replace(/[^0-9]/g, ''));
        if (isNaN(codeNumber)) return false;
        
        switch (quickFilter) {
          case 'labor':
            return codeNumber >= 100 && codeNumber <= 199;
          case 'materials':
            return codeNumber >= 500 && codeNumber <= 599;
          case 'installation':
            return codeNumber >= 200 && codeNumber <= 299;
          case 'services':
            return (codeNumber >= 300 && codeNumber <= 399) || 
                   (codeNumber >= 600 && codeNumber <= 699);
          default:
            return true;
        }
      });
    }


    // Apply price filter
    if (minPrice !== '') {
      filtered = filtered.filter(lineItem => lineItem.price >= parseFloat(minPrice));
    }

    if (maxPrice !== '') {
      filtered = filtered.filter(lineItem => lineItem.price <= parseFloat(maxPrice));
    }

    // Apply unit filter
    if (selectedUnit !== 'any') {
      filtered = filtered.filter(lineItem => lineItem.unit.toLowerCase() === selectedUnit.toLowerCase());
    }

    // Sort by price
    return filtered.sort((a, b) => {
      if (priceSort === 'asc') {
        return a.price - b.price;
      } else {
        return b.price - a.price;
      }
    });
  }, [lineItems, selectedStatus, showFavoritesOnly, selectedDateRange, selectedVendorId, selectedTradeId, searchTerm, minPrice, maxPrice, selectedUnit, priceSort, quickFilter, trades]);
  
  // Create grouped items by category for sidebar
  const groupedLineItemsByCategory = useMemo(() => {
    const grouped: Record<string, LineItem[]> = {};
    
    filteredLineItems.forEach(item => {
      // Use service_category directly, no need for industry
      const serviceCategory = item.service_category || 'Uncategorized';
      
      if (!grouped[serviceCategory]) {
        grouped[serviceCategory] = [];
      }
      grouped[serviceCategory].push(item);
    });
    
    return grouped;
  }, [filteredLineItems]);
  
  // Filter items based on selected category
  const displayedItems = useMemo(() => {
    if (selectedCategory === 'all') {
      return filteredLineItems;
    }
    return groupedLineItemsByCategory[selectedCategory] || [];
  }, [selectedCategory, filteredLineItems, groupedLineItemsByCategory]);
  
  // Group filtered line items by industry and service category directly
  const groupedLineItems = useMemo(() => {
    const grouped = new Map<string, Map<string, typeof filteredLineItems>>(); 
    
    filteredLineItems.forEach(item => {
      // Find the cost code for this item to get industry info
      const costCode = trades.find(t => t.id === item.cost_code_id);
      if (!costCode) return;
      
      const industryName = costCode.industry?.name || 'Unknown Industry';
      const serviceCategory = item.service_category || 'General';
      
      // Initialize industry map if doesn't exist
      if (!grouped.has(industryName)) {
        grouped.set(industryName, new Map());
      }
      
      const industryGroup = grouped.get(industryName)!;
      
      // Initialize service category if doesn't exist
      if (!industryGroup.has(serviceCategory)) {
        industryGroup.set(serviceCategory, []);
      }
      
      // Add item to the service category
      industryGroup.get(serviceCategory)!.push(item);
    });
    
    // Sort industries and service categories alphabetically
    const sortedMap = new Map<string, Map<string, typeof filteredLineItems>>();
    const sortedIndustries = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
    
    sortedIndustries.forEach(([industryName, serviceCategories]) => {
      const sortedCategories = new Map(
        [...serviceCategories.entries()].sort(([a], [b]) => a.localeCompare(b))
      );
      sortedMap.set(industryName, sortedCategories);
    });
    
    return sortedMap;
  }, [filteredLineItems, trades]);

  useEffect(() => {
    localStorage.setItem('pricebook-condensed', String(condensed));
  }, [condensed]);

  // Auto-hide undo button after 30 seconds with countdown
  useEffect(() => {
    if (showUndo) {
      setUndoTimeLeft(30);
      
      // Update countdown every second
      const countdownInterval = setInterval(() => {
        setUndoTimeLeft(prev => {
          if (prev <= 1) {
            setShowUndo(false);
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdownInterval);
    }
  }, [showUndo]);

  // Auto-hide success message after 5 seconds
  useEffect(() => {
    // Clear any existing timer
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    
    if (showSuccess) {
      successTimerRef.current = setTimeout(() => {
        setShowSuccess(null);
        successTimerRef.current = null;
      }, 5000);
    }
    
    // Cleanup on unmount
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, [showSuccess?.message]); // Only re-run if message actually changes
  
  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (showError) {
      // Clear any existing timer
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      
      // Set new timer
      errorTimerRef.current = setTimeout(() => {
        setShowError(null);
        errorTimerRef.current = null;
      }, 5000);
    }
    
    // Cleanup on unmount
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [showError?.message]);

  // Prevent page refresh during pricing operations
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (applyingProgress) {
        e.preventDefault();
        e.returnValue = 'Pricing changes are still being applied. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [applyingProgress]);

  // Persist undo state to localStorage
  useEffect(() => {
    if (lastPricingOperation && selectedOrg?.id) {
      localStorage.setItem(`pricing-undo-${selectedOrg.id}`, JSON.stringify(lastPricingOperation));
    } else if (selectedOrg?.id) {
      localStorage.removeItem(`pricing-undo-${selectedOrg.id}`);
    }
  }, [lastPricingOperation, selectedOrg?.id]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (jobPollingInterval) {
        clearInterval(jobPollingInterval);
      }
    };
  }, [jobPollingInterval]);

  // Restore undo state from localStorage when component mounts with selectedOrg
  useEffect(() => {
    if (selectedOrg?.id) {
      const stored = localStorage.getItem(`pricing-undo-${selectedOrg.id}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const elapsed = Date.now() - parsed.timestamp;
          // Only restore if less than 30 seconds old
          if (elapsed < 30000) {
            setLastPricingOperation(parsed);
            setShowUndo(true);
            setUndoTimeLeft(Math.max(1, Math.floor((30000 - elapsed) / 1000)));
          } else {
            localStorage.removeItem(`pricing-undo-${selectedOrg.id}`);
          }
        } catch (error) {
          console.error('Error restoring undo state:', error);
          localStorage.removeItem(`pricing-undo-${selectedOrg.id}`);
        }
      }
    }
  }, [selectedOrg?.id]);

  // Check for active jobs on mount/org change
  useEffect(() => {
    if (selectedOrg?.id) {
      checkForActiveJobs();
    }
  }, [selectedOrg?.id]);

  const checkForActiveJobs = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      const activeJobs = await PricingModesService.getActiveJobs(selectedOrg.id);
      
      if (activeJobs.length > 0) {
        // Resume tracking the most recent job
        const mostRecentJob = activeJobs[0];
        const jobAge = Date.now() - new Date(mostRecentJob.created_at).getTime();
        
        console.log('Found active job:', {
          id: mostRecentJob.id,
          status: mostRecentJob.status,
          age: Math.floor(jobAge / 1000) + 's',
          processed: mostRecentJob.processed_items,
          total: mostRecentJob.total_items
        });
        
        // If job is too old or stuck, clean it up
        // Jobs get stuck at multiples of 100 (batch size issue)
        if (jobAge > 2 * 60 * 1000 || 
            (mostRecentJob.processed_items > 0 && mostRecentJob.processed_items % 100 === 0 && jobAge > 30 * 1000)) {
          console.log('Job is stuck or too old, cleaning up...', {
            age: Math.floor(jobAge / 1000) + 's',
            processed: mostRecentJob.processed_items
          });
          
          // Mark as failed to clean up
          try {
            await supabase
              .from('pricing_jobs')
              .update({
                status: 'failed',
                error_message: 'Job timed out or stuck',
                completed_at: new Date().toISOString()
              })
              .eq('id', mostRecentJob.id);
          } catch (error) {
            console.error('Error cleaning up stuck job:', error);
          }
          
          // Don't show any UI, just clean up silently
          return;
        }
        
        setActiveJobId(mostRecentJob.id);
        
        // Set initial progress state immediately
        if (mostRecentJob.status === 'processing' || mostRecentJob.status === 'pending') {
          console.log('Resuming job on page refresh:', mostRecentJob);
          setActiveJobId(mostRecentJob.id);
          
          // Check if it's an undo job
          const isUndoJob = mostRecentJob.operation_type === 'undo_pricing';
          
          setApplyingProgress({
            current: mostRecentJob.processed_items || 0,
            total: mostRecentJob.total_items || 0,
            action: isUndoJob ? 'undoing' : 'applying'
          });
          
          // Resume processing from where it left off
          const { mode_id, line_item_ids, previous_prices, mode_name } = mostRecentJob.job_data;
          
          try {
            if (isUndoJob) {
              // For undo jobs, just resume monitoring since processing happens in background
              await PricingModesService.resumeJob(mostRecentJob.id, selectedOrg.id);
              // Start polling for updates
              startJobPolling(mostRecentJob.id);
            } else {
              // Continue processing regular pricing job
              const result = await PricingModesService.applyModeWithErrorHandling(
                selectedOrg.id,
                mode_id,
                line_item_ids,
                async (current, total) => {
                  setApplyingProgress({
                    current,
                    total,
                    action: 'applying'
                  });
                  // Update job progress
                  await PricingModesService.updateJobProgress(mostRecentJob.id, current, total);
                }
              );
              
              // Mark job as completed
              await PricingModesService.completeJob(mostRecentJob.id, result);
              
              // Small delay before hiding
              await new Promise(resolve => setTimeout(resolve, 500));
              setApplyingProgress(null);
              setActiveJobId(null);
              
              if (result.successCount > 0) {
                // Restore undo state if available
                if (previous_prices) {
                  setLastPricingOperation({
                    modeId: mode_id,
                    modeName: mode_name || 'Pricing Mode',
                    lineItemIds: line_item_ids || [],
                    previousPrices: previous_prices,
                    timestamp: Date.now()
                  });
                  setShowUndo(true);
                }
                
                // Refresh data
                fetchLineItems(true);
              }
            }
          } catch (error) {
            console.error('Error resuming job:', error);
            setApplyingProgress(null);
            await PricingModesService.failJob(
              mostRecentJob.id, 
              error instanceof Error ? error.message : 'Failed to resume processing'
            );
          }
        } else {
          // Check status once in case it just finished
          checkJobStatus(mostRecentJob.id);
        }
      }
    } catch (error) {
      console.error('Error checking for active jobs:', error);
    }
  };

  // Handle pricing mode application
  const handleApplyPricingMode = async (modeId: string) => {
    if (!selectedOrg?.id) return;
    
    // Show preview modal
    setPendingModeId(modeId);
    setShowModePreview(true);
  };
  
  // Handle undo last pricing change
  const handleUndoPricing = async () => {
    if (!lastPricingOperation || !selectedOrg?.id) return;
    
    setShowUndo(false);
    
    // Longer delay to ensure smooth transition
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Track when we started showing progress
    const progressStartTime = Date.now();
    
    setApplyingProgress({ 
      current: 0, 
      total: lastPricingOperation.previousPrices.length,
      action: 'undoing'
    });
    
    try {
      // Create undo job
      const jobId = await PricingModesService.createUndoJob(
        selectedOrg.id,
        lastPricingOperation.previousPrices
      );
      
      // Store job info for recovery
      localStorage.setItem(`active_job_${selectedOrg.id}`, JSON.stringify({
        jobId,
        action: 'undoing',
        timestamp: Date.now()
      }));
      
      setActiveJobId(jobId);
      
      // Poll for job completion
      let attempts = 0;
      const maxAttempts = 600; // 10 minutes
      let lastProgress = 0;
      
      const pollInterval = setInterval(async () => {
        attempts++;
        
        try {
          const job = await PricingModesService.getJobStatus(jobId);
          
          if (!job) {
            clearInterval(pollInterval);
            throw new Error('Job not found');
          }
          
          // Update progress only if changed
          if (job.processed_items !== lastProgress) {
            lastProgress = job.processed_items;
            setApplyingProgress({
              current: job.processed_items,
              total: job.total_items,
              action: 'undoing'
            });
          }
          
          if (job.status === 'completed') {
            clearInterval(pollInterval);
            
            // Clear states
            setLastPricingOperation(null);
            localStorage.removeItem(`pricing-undo-${selectedOrg.id}`);
            localStorage.removeItem(`active_job_${selectedOrg.id}`);
            
            // Ensure minimum display time
            const elapsedTime = Date.now() - progressStartTime;
            const minimumDisplayTime = 1500;
            if (elapsedTime < minimumDisplayTime) {
              await new Promise(resolve => setTimeout(resolve, minimumDisplayTime - elapsedTime));
            }
            
            // Additional delay for smooth transition
            await new Promise(resolve => setTimeout(resolve, 300));
            setApplyingProgress(null);
            setActiveJobId(null);
            
            const summary = job.result_summary;
            if (summary?.failed_count > 0) {
              setShowSuccess({
                message: `Restored ${summary.success_count} items. ${summary.failed_count} items failed.`,
                itemCount: summary.success_count
              });
            }
            
            // Refresh data
            fetchLineItems(true);
          } else if (job.status === 'failed') {
            clearInterval(pollInterval);
            throw new Error(job.error_message || 'Undo operation failed');
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            throw new Error('Operation timed out');
          }
        } catch (error) {
          clearInterval(pollInterval);
          console.error('Error checking undo job status:', error);
          
          // Clean up
          localStorage.removeItem(`active_job_${selectedOrg.id}`);
          setApplyingProgress(null);
          setActiveJobId(null);
          setShowError({
            title: 'Undo Failed',
            message: error instanceof Error ? error.message : 'Failed to undo pricing changes. Please try again.'
          });
        }
      }, 1000);
      
    } catch (error) {
      console.error('Error starting undo operation:', error);
      setApplyingProgress(null);
      localStorage.removeItem(`active_job_${selectedOrg.id}`);
      setShowError({
        title: 'Undo Failed',
        message: 'Could not start the undo operation. Please try again.'
      });
    }
  };

  const handleConfirmPricingMode = async () => {
    if (!selectedOrg?.id || !pendingModeId || !selectedMode) return;
    
    // Close modal immediately for snappy feel
    setShowModePreview(false);
    
    // Store previous prices for undo
    const previousPrices = lineItems
      .filter(item => 
        selectedLineItemIds.length > 0 ? selectedLineItemIds.includes(item.id) : true
      )
      .map(item => ({
        lineItemId: item.id,
        price: item.price
      }));
    
    try {
      // Create a job for recovery on page refresh
      const jobId = await PricingModesService.createPricingJob(
        selectedOrg.id,
        pendingModeId,
        selectedMode.name,
        selectedLineItemIds.length > 0 ? selectedLineItemIds : undefined,
        previousPrices
      );
      
      setActiveJobId(jobId);
      setSelectedLineItemIds([]);
      
      // Store for undo capability
      setShowUndo(false);
      setLastPricingOperation({
        modeId: pendingModeId,
        modeName: selectedMode.name,
        lineItemIds: selectedLineItemIds,
        previousPrices,
        timestamp: Date.now()
      });
      
      // Now process directly with progress updates
      setApplyingProgress({
        current: 0,
        total: previousPrices.length,
        action: 'applying'
      });
      
      const result = await PricingModesService.applyModeWithErrorHandling(
        selectedOrg.id,
        pendingModeId,
        selectedLineItemIds.length > 0 ? selectedLineItemIds : undefined,
        async (current, total) => {
          setApplyingProgress({
            current,
            total,
            action: 'applying'
          });
          // Update job progress in database for recovery
          await PricingModesService.updateJobProgress(jobId, current, total);
        }
      );
      
      // Mark job as completed
      await PricingModesService.completeJob(jobId, result);
      
      // Small delay before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
      setApplyingProgress(null);
      setActiveJobId(null);
      
      if (result.successCount > 0) {
        // Show undo option
        setTimeout(() => {
          setShowUndo(true);
        }, 50);
        
        // Only show success overlay if there were failures
        if (result.failedCount > 0) {
          setShowSuccess({
            message: `Updated ${result.successCount} items. ${result.failedCount} items failed.`,
            itemCount: result.successCount
          });
        }
        
        // Refresh data
        fetchLineItems(true);
      } else {
        setShowError({
          title: 'Update Failed',
          message: 'Failed to apply pricing mode. Please try again.'
        });
      }
      
    } catch (error) {
      console.error('Error applying pricing mode:', error);
      setApplyingProgress(null);
      if (activeJobId) {
        await PricingModesService.failJob(activeJobId, error instanceof Error ? error.message : 'Unknown error');
      }
      setShowError({
        title: 'Update Failed',
        message: 'Failed to apply pricing mode. Please try again.'
      });
    } finally {
      setPendingModeId(null);
    }
  };

  // Function to poll job status
  const startJobPolling = (jobId: string) => {
    // Clear any existing polling
    if (jobPollingInterval) {
      clearInterval(jobPollingInterval);
    }
    
    // Initial check
    checkJobStatus(jobId);
    
    // Poll every 2 seconds
    const interval = setInterval(() => {
      checkJobStatus(jobId);
    }, 2000);
    
    setJobPollingInterval(interval);
  };
  
  const checkJobStatus = async (jobId: string) => {
    const job = await PricingModesService.getJobStatus(jobId);
    
    if (!job) {
      // Job not found, stop polling
      if (jobPollingInterval) {
        clearInterval(jobPollingInterval);
        setJobPollingInterval(null);
      }
      setActiveJobId(null);
      setApplyingProgress(null);
      return;
    }
    
    // Check if job is stale (more than 10 minutes old and still processing with no progress)
    const jobAge = Date.now() - new Date(job.created_at).getTime();
    if (job.status === 'processing' && jobAge > 10 * 60 * 1000 && job.processed_items === 0) {
      // Mark as failed only if truly stuck
      console.log('Job appears to be stuck:', {
        age: Math.floor(jobAge / 1000) + 's',
        processed: job.processed_items,
        total: job.total_items
      });
      
      if (jobPollingInterval) {
        clearInterval(jobPollingInterval);
        setJobPollingInterval(null);
      }
      setActiveJobId(null);
      setApplyingProgress(null);
      setShowError({
        title: 'Update Timed Out',
        message: 'Pricing update timed out. Please try again.'
      });
      fetchLineItems(false);
      return;
    }
    
    // Update progress
    if (job.status === 'processing' || job.status === 'pending') {
      console.log('Job progress update:', {
        id: job.id,
        status: job.status,
        processed: job.processed_items,
        total: job.total_items
      });
      
      const isUndoJob = job.operation_type === 'undo_pricing';
      setApplyingProgress({
        current: job.processed_items || 0,
        total: job.total_items || 0,
        action: isUndoJob ? 'undoing' : 'applying'
      });
    }
    
    // Handle completion
    if (job.status === 'completed' || job.status === 'failed') {
      // Stop polling
      if (jobPollingInterval) {
        clearInterval(jobPollingInterval);
        setJobPollingInterval(null);
      }
      
      setActiveJobId(null);
      setApplyingProgress(null);
      
      if (job.status === 'completed') {
        const summary = job.result_summary;
        const isUndoJob = job.operation_type === 'undo_pricing';
        
        // Only show success overlay if there were failures
        if (summary?.failed_count > 0) {
          setShowSuccess({
            message: isUndoJob 
              ? `Restored ${summary.success_count} items. ${summary.failed_count} items failed.`
              : `Updated ${summary.success_count} items. ${summary.failed_count} items failed.`,
            itemCount: summary.success_count
          });
        }
        
        // Show undo option only for regular pricing jobs (not for undo jobs)
        if (!isUndoJob) {
          setTimeout(() => {
            setShowUndo(true);
          }, 50);
        } else {
          // For undo jobs, clear localStorage since we've successfully reverted
          localStorage.removeItem(`active_job_${selectedOrg?.id}`);
        }
        
        // Refresh data
        fetchLineItems(true);
      } else {
        // Failed
        const isUndoJob = job.operation_type === 'undo_pricing';
        setShowError({
          title: isUndoJob ? 'Undo Failed' : 'Update Failed',
          message: job.error_message || (isUndoJob ? 'Failed to undo pricing changes. Please try again.' : 'Pricing update failed. Please try again.')
        });
        fetchLineItems(false);
      }
    }
  };


  return (
    <div className="flex h-screen bg-[#0A0A0A] overflow-hidden">
      {/* Left Sidebar for Categories - Fixed with own scroll */}
      <div className="w-64 border-r border-[#333333] bg-[#1D1F25] flex flex-col h-full">
        <div className="p-4 border-b border-[#333333] flex-shrink-0">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Categories</h3>
          <div className="text-xs text-gray-500 mt-1">{Object.keys(groupedLineItemsByCategory).length} categories</div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333333] scrollbar-track-transparent">
          <div className="py-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between group transition-colors ${
                selectedCategory === 'all' 
                  ? 'bg-[#22272d] text-white border-l-2 border-[#336699]' 
                  : 'text-gray-400 hover:bg-[#22272d] hover:text-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                All Items
              </span>
              <span className="text-xs text-gray-500">{filteredLineItems.length}</span>
            </button>
            {Object.entries(groupedLineItemsByCategory)
              .sort(([a], [b]) => a.localeCompare(b)) // Sort alphabetically
              .map(([categoryKey, items]) => {
              return (
                <button
                  key={categoryKey}
                  onClick={() => setSelectedCategory(categoryKey)}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between group transition-colors ${
                    selectedCategory === categoryKey 
                      ? 'bg-[#22272d] text-white border-l-2 border-[#336699]' 
                      : 'text-gray-400 hover:bg-[#22272d] hover:text-gray-300'
                  }`}
                >
                  <span className="truncate">{categoryKey}</span>
                  <span className="text-xs text-gray-500 ml-2">{items.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area - Scrollable independently */}
      <div className="flex-1 flex flex-col overflow-hidden">
      {/* Warning Banner - appears when operations are in progress */}
      {applyingProgress && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 z-[13000] py-3 px-4 shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-yellow-900 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-base font-semibold text-yellow-900">
                ⚠️ Pricing update in progress - DO NOT close or refresh this page!
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-24 bg-yellow-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-yellow-900 h-full transition-all duration-300"
                    style={{ width: `${(applyingProgress.current / applyingProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-yellow-900">
                  {Math.round((applyingProgress.current / applyingProgress.total) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Progress Overlay */}
      {applyingProgress && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[12000] flex items-center justify-center">
          <div className="bg-[#1D1F25] border border-[#333333] p-6 shadow-xl">
            <h3 className="text-white font-medium mb-4">
              {applyingProgress.action === 'undoing' ? 'Reverting Prices' : 'Applying Pricing Changes'}
            </h3>
            <div className="w-64 mb-2">
              <div className="bg-[#333333] rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-[#336699] h-full transition-all duration-300"
                  style={{ width: `${(applyingProgress.current / applyingProgress.total) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-gray-400 text-center">
              {applyingProgress.action === 'undoing' 
                ? `Reverting ${applyingProgress.current} of ${applyingProgress.total} items` 
                : `Updating ${applyingProgress.current} of ${applyingProgress.total} items`}
            </p>
            {applyingProgress.total > 100 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                Processing {applyingProgress.total} items - this may take a moment
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-[#333333]">
              <p className="text-xs text-yellow-500 text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Please keep this window open until complete
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Success Confirmation */}
      {showSuccess && !applyingProgress && (
        <div className="fixed inset-0 bg-black/50 z-[12000] flex items-center justify-center pointer-events-none">
          <div className="bg-[#1D1F25] border border-green-600 p-6 shadow-xl pointer-events-auto">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h3 className="text-white font-medium mb-2 text-center">{showSuccess.message}</h3>
            <p className="text-sm text-gray-400 text-center">{showSuccess.itemCount} items updated</p>
          </div>
        </div>
      )}
      
      {/* Error Notification */}
      {showError && (
        <div className="fixed bottom-4 right-4 max-w-md z-[12000]">
          <div className="bg-red-900 border border-red-700 p-4 shadow-xl flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-red-100 font-medium">{showError.title}</h4>
              <p className="text-red-200 text-sm mt-1">{showError.message}</p>
            </div>
            <button
              onClick={() => setShowError(null)}
              className="flex-shrink-0 text-red-400 hover:text-red-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}




      {/* Pricing Mode Selector */}
      {selectedLineItemIds.length > 0 && (
        <div className="border-t border-[#333333] px-6 py-3 bg-[#1D1F25]">
          <PricingModeSelector
            onModeChange={setSelectedMode}
            selectedLineItemCount={selectedLineItemIds.length}
            onApplyMode={handleApplyPricingMode}
          />
        </div>
      )}
      
      {/* Undo Button */}
      {showUndo && lastPricingOperation && selectedLineItemIds.length === 0 && !applyingProgress && (
        <div className="border-t border-[#333333] px-6 py-3 bg-[#1D1F25] flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Applied "{lastPricingOperation.modeName}" to {lastPricingOperation.lineItemIds.length} items
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-sm font-medium ${undoTimeLeft <= 10 ? 'text-orange-400' : 'text-gray-400'}`}>
              {undoTimeLeft}s
            </div>
            <button
              onClick={handleUndoPricing}
              className={`px-4 py-2 text-white text-sm transition-all flex items-center gap-2 font-medium ${
                undoTimeLeft <= 10 
                  ? 'bg-orange-600 hover:bg-orange-700 border-orange-600 animate-pulse' 
                  : 'bg-[#336699] hover:bg-[#336699]/80 border-[#336699]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Undo Changes
            </button>
          </div>
        </div>
      )}

      {/* Sticky Header Section - Contains controls and column headers */}
      <div className="flex-shrink-0 bg-[#1D1F25] border-b border-[#333333] sticky top-0 z-10">
        {/* Table Controls */}
        <div className="px-4 py-3 border-b border-[#333333]">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Filters */}
          <div className="flex items-center gap-3">
            <select
              className="bg-[#1D1F25] border border-[#333333] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699]"
              value={selectedTradeId}
              onChange={(e) => setSelectedTradeId(e.target.value)}
            >
              <option value="all" className="bg-[#1D1F25] text-white">All Cost Codes ({lineItems.length})</option>
              {Array.from(groupedTrades.entries()).map(([industryName, codes]) => (
                <optgroup 
                  key={industryName} 
                  label={`━━━  ${industryName.toUpperCase()}  ━━━`}
                  className="bg-[#1D1F25] text-gray-400 font-bold"
                >
                  {codes.map(trade => (
                    <option 
                      key={trade.id} 
                      value={trade.id} 
                      className="bg-[#1D1F25] text-white pl-4"
                    >
                      {trade.code} — {trade.name} ({lineItems.filter(item => item.cost_code_id === trade.id).length})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Right side - View options */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewLineItemModal(true)}
              className="bg-white hover:bg-gray-100 text-black px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Item</span>
            </button>
            
            <button
              onClick={() => {
                const newCondensed = !condensed;
                setCondensed(newCondensed);
                localStorage.setItem('pricebook-condensed', newCondensed.toString());
              }}
              className="bg-[#1D1F25] border border-[#333333] p-2 text-white hover:bg-[#22272d] transition-colors"
              title="Toggle compact view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            
            <div className="relative" ref={optionsMenuRef}>
              <button
                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                className="bg-[#1D1F25] border border-[#333333] p-2 text-white hover:bg-[#22272d] transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              
              {showOptionsMenu && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1D1F25] border border-[#333333] shadow-lg z-[9999] py-2">
                  <button
                    onClick={handleImportItems}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#22272d] flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import Items
                  </button>
                  <div className="border-t border-[#333333] my-1" />
                  <button
                    onClick={handleExportToCSV}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#22272d] flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Export to CSV
                  </button>
                  <button
                    onClick={handleExportToExcel}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#22272d] flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Export to Excel
                  </button>
                  <div className="border-t border-[#333333] my-1" />
                  <button
                    onClick={handlePrintPriceBook}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#22272d] flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Print Cost Codes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        {/* Table Column Headers */}
        <div className="px-4 py-2 bg-[#1D1F25]/80">
        <div className="grid grid-cols-9 gap-4 text-xs font-medium text-gray-400 uppercase tracking-wider items-center">
          <div className="col-span-1 flex items-center">
            <input
              type="checkbox"
              checked={selectedLineItemIds.length === filteredLineItems.length && filteredLineItems.length > 0}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedLineItemIds(filteredLineItems.map(item => item.id));
                } else {
                  setSelectedLineItemIds([]);
                }
              }}
              className="w-4 h-4 rounded bg-[#333333] border-[#555555] text-[#336699] focus:ring-[#336699] focus:ring-offset-0"
            />
          </div>
          <div className="col-span-5">
            <span>ITEM</span>
          </div>
          <div className="col-span-3 flex justify-end">
            <span className="text-xs text-gray-400">PRICE</span>
          </div>
        </div>
        </div>
      </div>
      
      {/* Table Content - Scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333333] scrollbar-track-transparent">
        {(isLoading || isLoadingCostCodes) ? (
          <div className="animate-pulse">
            {/* Industry Header Skeleton */}
            <div className="px-6 py-3 bg-[#1D1F25] border-y border-[#333333]">
              <div className="h-4 bg-[#333333] rounded w-48 relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
              </div>
            </div>
            
            {/* Cost Code Header Skeleton */}
            <div className="px-6 py-2.5 bg-[#22272d] border-y border-[#333333]/40">
              <div className="flex items-center gap-3">
                <div className="h-4 bg-[#336699]/30 rounded w-16 relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                </div>
                <div className="h-4 bg-[#333333] rounded w-32 relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                </div>
                <div className="h-3 bg-[#333333] rounded w-20 relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                </div>
              </div>
            </div>
            
            {/* Line Items Skeleton */}
            <div className="border-l-2 border-[#336699]/20 ml-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="grid grid-cols-9 gap-4 px-6 py-3 items-center border-b border-[#333333]/20">
                  <div className="col-span-1">
                    <div className="w-4 h-4 bg-[#333333] rounded relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                    </div>
                  </div>
                  <div className="col-span-5">
                    <div className="h-4 bg-[#333333] rounded w-48 mb-1 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                    </div>
                    <div className="h-3 bg-[#333333] rounded w-32 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                    </div>
                  </div>
                  <div className="col-span-3 text-right">
                    <div className="h-5 bg-[#333333] rounded w-20 ml-auto relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Second Industry Skeleton */}
            <div className="mt-4">
              <div className="px-6 py-3 bg-[#1D1F25] border-y border-[#333333]">
                <div className="h-4 bg-[#333333] rounded w-56 relative overflow-hidden">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                </div>
              </div>
              
              <div className="px-6 py-2.5 bg-[#22272d] border-y border-[#333333]/40">
                <div className="flex items-center gap-3">
                  <div className="h-4 bg-[#336699]/30 rounded w-16 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#336699]/50 to-transparent"></div>
                  </div>
                  <div className="h-4 bg-[#333333] rounded w-40 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                  <div className="h-3 bg-[#333333] rounded w-20 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                  </div>
                </div>
              </div>
              
              <div className="border-l-2 border-[#336699]/20 ml-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="grid grid-cols-9 gap-4 px-6 py-3 items-center border-b border-[#333333]/20">
                    <div className="col-span-1">
                      <div className="w-4 h-4 bg-[#333333] rounded relative overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                      </div>
                    </div>
                    <div className="col-span-5">
                      <div className="h-4 bg-[#333333] rounded w-56 mb-1 relative overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                      </div>
                      <div className="h-3 bg-[#333333] rounded w-24 relative overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                      </div>
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="h-5 bg-[#333333] rounded w-24 ml-auto relative overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#444444] to-transparent"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
              <span className="text-red-400 text-2xl">⚠</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Error Loading Cost Codes</h3>
            <p className="text-gray-400 mb-6 max-w-md">{error}</p>
            <button
              onClick={() => fetchLineItems()}
              className="bg-white hover:bg-gray-100 text-black px-6 py-3 rounded-[8px] font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : displayedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-[#333333] rounded-full flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            {selectedCategory === 'all' ? 'No cost code items yet' : 'No items in this category'}
          </h3>
          <p className="text-gray-400 mb-6 max-w-md">
            {selectedCategory === 'all' 
              ? 'Start building your cost codes by adding materials, labor, and services. This will help you create accurate estimates and invoices.'
              : 'This category is empty. Add items or select a different category from the sidebar.'}
          </p>
          <button
            onClick={() => setShowNewLineItemModal(true)}
              className="bg-white hover:bg-gray-100 text-[#121212] px-6 py-3 rounded-[4px] font-medium transition-colors"
          >
            Add Your First Item
          </button>
        </div>
      ) : (
          <div>
          {displayedItems.map((lineItem, index) => (
            <div
              key={lineItem.id}
              onClick={() => handleEditLineItem(lineItem)}
              className={`grid grid-cols-9 gap-4 px-6 ${condensed ? 'py-2' : 'py-3'} items-center bg-[#1D1F25] hover:bg-[#22272d] transition-colors group relative cursor-pointer ${index < displayedItems.length - 1 ? 'border-b border-[#333333]/20' : ''}`}
              >
                {/* Checkbox Column */}
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedLineItemIds.includes(lineItem.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        setSelectedLineItemIds([...selectedLineItemIds, lineItem.id]);
                      } else {
                        setSelectedLineItemIds(selectedLineItemIds.filter(id => id !== lineItem.id));
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded bg-[#333333] border-[#555555] text-[#336699] focus:ring-[#336699] focus:ring-offset-0"
                  />
                </div>
                
                {/* Item Column - reduced to make room */}
                <div className="col-span-5 pr-4">
                  <div className="w-full overflow-hidden">
                    <div className={`flex items-center gap-2 font-medium text-gray-100 ${condensed ? 'text-sm' : ''}`}>
                      <span className="truncate">{lineItem.name}</span>
                      {(lineItem.is_bundle || lineItem.is_package) && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          BUNDLE
                        </span>
                      )}
                    </div>
                    {!condensed && lineItem.description && (
                      <div className="text-xs text-gray-400 truncate mt-0.5" style={{ maxWidth: '100%' }}>
                        {lineItem.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Price Column with strategy indicator - expanded to use available space */}
                <div className="col-span-3 text-right">
                  <div className="flex flex-col items-end">
                    <div className={`flex items-center justify-end gap-2 w-full ${condensed ? 'text-sm' : 'text-base'} ${
                      recentlyUpdatedId === lineItem.id ? 'price-updated' : ''
                    }`}>
                      {/* Price strategy tag */}
                      {(() => {
                        const basePrice = lineItem.base_price || lineItem.price;
                        const redLine = lineItem.red_line_price;
                        const cap = lineItem.cap_price;
                        const currentPrice = lineItem.price;
                        
                        // Check if price matches specific boundaries
                        if (redLine && Math.abs(currentPrice - redLine) < 0.01) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                              RED
                            </span>
                          );
                        }
                        if (cap && Math.abs(currentPrice - cap) < 0.01) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                              CAP
                            </span>
                          );
                        }
                        if (Math.abs(currentPrice - basePrice) < 0.01) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                              BASE
                            </span>
                          );
                        }
                        
                        // Check ratio for strategy tags
                        const ratio = currentPrice / basePrice;
                        if (ratio < 0.88) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                              NEED
                            </span>
                          );
                        }
                        if (ratio >= 0.88 && ratio < 0.92) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                              SLOW
                            </span>
                          );
                        }
                        if (ratio >= 0.93 && ratio < 0.97) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                              COMP
                            </span>
                          );
                        }
                        if (ratio >= 1.18 && ratio < 1.25) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                              BUSY
                            </span>
                          );
                        }
                        if (ratio >= 1.45 && ratio < 1.55) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                              PREM
                            </span>
                          );
                        }
                        if (ratio >= 1.75) {
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                              RUSH
                            </span>
                          );
                        }
                        
                        // Custom price
                        if (ratio !== 1) {
                          const percent = Math.round((ratio - 1) * 100);
                          const text = percent > 0 ? `+${percent}%` : `${percent}%`;
                          return (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">
                              {text}
                            </span>
                          );
                        }
                        
                        return null;
                      })()}
                      
                      <PriceRangeCompact
                        price={lineItem.price}
                        redLinePrice={lineItem.red_line_price}
                        basePrice={lineItem.base_price}
                        capPrice={lineItem.cap_price}
                        viewMode="simple"
                      />
                    </div>
                    {!condensed && (
                      <span className="text-xs text-gray-400 capitalize mt-0.5">{lineItem.unit}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>
        )}
      </div>

      {/* Create Line Item Modal */}
      <Modal
        isOpen={showNewLineItemModal}
          onClose={() => {
            setShowNewLineItemModal(false);
            setPresetCostCodeId(null);
            setPresetServiceCategory(null);
          }}
        title="Add Line Item"
        size="md"
      >
        <LineItemForm
          onSubmit={async (data) => {
            await LineItemService.create({
              name: data.name,
              description: data.description,
              price: data.price,
              unit: data.unit,
              cost_code_id: data.cost_code_id || undefined,
              user_id: user?.id || '',
              organization_id: selectedOrg?.id || '',
              status: 'published',
              favorite: false,
              service_category: data.service_category || presetServiceCategory || undefined
            });
            
            setShowNewLineItemModal(false);
            setPresetCostCodeId(null);
            setPresetServiceCategory(null);
            await fetchLineItems();
          }}
          onCancel={() => {
            setShowNewLineItemModal(false);
            setPresetCostCodeId(null);
            setPresetServiceCategory(null);
          }}
          submitLabel="Add Item"
          defaultCostCodeId={presetCostCodeId}
          defaultServiceCategory={presetServiceCategory}
        />
      </Modal>

      {/* Edit Line Item Drawer */}
      <SlideOutDrawer
        isOpen={showEditLineItemModal}
          onClose={() => {
            setShowEditLineItemModal(false);
            setEditingLineItem(null);
          }}
        title="Edit Line Item"
        width="md"
      >
        {editingLineItem && (
          <LineItemForm
            onSubmit={async (data) => {
              await handleSaveEdit({
                name: data.name,
                description: data.description,
                price: data.price,
                unit: data.unit,
                cost_code_id: data.cost_code_id || editingLineItem.cost_code_id
              });
            }}
            onCancel={() => {
              setShowEditLineItemModal(false);
              setEditingLineItem(null);
            }}
            initialData={editingLineItem}
            submitLabel="Save Changes"
          />
        )}
      </SlideOutDrawer>

      {/* Pricing Mode Preview Modal */}
      {pendingModeId && selectedMode && (
        <PricingModePreviewModal
          isOpen={showModePreview}
          onClose={() => {
            setShowModePreview(false);
            setPendingModeId(null);
          }}
          mode={selectedMode}
          organizationId={selectedOrg?.id || ''}
          lineItemIds={selectedLineItemIds.length > 0 ? selectedLineItemIds : undefined}
          onConfirm={handleConfirmPricingMode}
        />
      )}
      </div>
    </div>
  );
};

export default PriceBook;