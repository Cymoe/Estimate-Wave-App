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
import { PriceRangeCompact } from './PriceRangeDisplay';
import { priceRange } from '../../utils/priceRange';
import { IndustryService } from '../../services/IndustryService';
import { TRADES_CHANGED } from '../settings/TradesEditor';
import { allOutsideMyTrades, inMyTrades } from './tradeScope';

/** Price-book items are priced at their red line. */
const withRedLinePrice = (item: LineItem): LineItem => ({ ...item, price: priceRange(item).redLine });

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
  const [trades, setTrades] = useState<{ id: string; name: string; code: string; industry_id?: string; industry?: { id: string; name: string; icon?: string; color?: string } | null }[]>([]);
  // The company's trades: the Price Book opens on their items, with "All trades" one tap away.
  const [myTrades, setMyTrades] = useState<Set<string>>(new Set());
  const [myTradeNames, setMyTradeNames] = useState('');
  const [tradeScope, setTradeScope] = useState<'mine' | 'all'>('mine');
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [presetCostCodeId, setPresetCostCodeId] = useState<string | null>(null);
  const [presetServiceCategory, setPresetServiceCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
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
    if (!editingLineItem?.id || !selectedOrg?.id) return;
    const editedId = editingLineItem.id;

    // Show the change right away, then save it.
    setLineItems(prevItems =>
      prevItems.map(item =>
        item.id === editedId
          ? withRedLinePrice({
              ...item,
              name: data.name || item.name,
              description: data.description !== undefined ? data.description : item.description,
              unit: data.unit || item.unit,
              ...(data.red_line_price !== undefined ? { red_line_price: data.red_line_price, base_price: data.red_line_price } : {}),
              ...(data.cap_price !== undefined ? { cap_price: data.cap_price } : {})
            })
          : item
      )
    );
    setRecentlyUpdatedId(editedId);
    setTimeout(() => setRecentlyUpdatedId(null), 1500);
    setShowEditLineItemModal(false);
    setEditingLineItem(null);

    try {
      await LineItemService.update(editedId, data, selectedOrg.id);
    } catch (error) {
      console.error('Error updating line item:', error);
      alert(error instanceof Error ? error.message : 'Failed to update line item');
      await fetchLineItems(); // Back to what's saved
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
        red_line_price: priceRange(lineItem).redLine,
        cap_price: priceRange(lineItem).cap,
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
      // The price book shows each item at its red line, the fixed price.
      const lineItemsResult = await LineItemService.list(selectedOrg.id)
        .then(data => ({ status: 'fulfilled' as const, value: data.map(item => withRedLinePrice(item)) }))
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


  useEffect(() => {
    const orgId = selectedOrg?.id;
    if (!orgId) return;
    const load = () =>
      IndustryService.getOrganizationIndustries(orgId)
        .then((rows: Array<{ id: string; name?: string }>) => {
          setMyTrades(new Set(rows.map((r) => r.id)));
          setMyTradeNames(rows.map((r) => r.name ?? r.id).join(', '));
        })
        .catch(() => {
          setMyTrades(new Set());
          setMyTradeNames('');
        });
    load();
    window.addEventListener(TRADES_CHANGED, load);
    return () => window.removeEventListener(TRADES_CHANGED, load);
  }, [selectedOrg?.id]);

  const filteredLineItems = useMemo(() => {
    let filtered = [...lineItems];

    // My trades: items under a cost code for one of the company's trades (and any without a cost code).
    if (tradeScope === 'mine') filtered = inMyTrades(filtered, trades, myTrades);

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
  }, [lineItems, selectedStatus, showFavoritesOnly, selectedDateRange, selectedVendorId, selectedTradeId, searchTerm, minPrice, maxPrice, selectedUnit, priceSort, quickFilter, trades, tradeScope, myTrades]);
  
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
  
  // The left column: each category under the trade its items' cost codes belong to.
  const sidebarGroups = useMemo(() => {
    const byTrade = new Map<string, Array<[string, number]>>();
    Object.entries(groupedLineItemsByCategory).forEach(([category, items]) => {
      const costCode = trades.find((t) => t.id === items[0]?.cost_code_id);
      const tradeName = costCode?.industry?.name || 'Other';
      byTrade.set(tradeName, [...(byTrade.get(tradeName) ?? []), [category, items.length]]);
    });
    return [...byTrade.entries()]
      .map(([trade, categories]) => [trade, categories.sort(([a], [b]) => a.localeCompare(b))] as [string, Array<[string, number]>])
      .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  }, [groupedLineItemsByCategory, trades]);

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

  // One row of the left column; the pl-6 clears the projects handle on the screen's left edge.
  const categoryButton = (key: string, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setSelectedCategory(key)}
      aria-pressed={selectedCategory === key}
      className={`w-full pl-6 pr-3 py-1.5 text-left text-[13px] flex items-center justify-between gap-2 transition-colors ${
        selectedCategory === key ? 'bg-[#336699] text-white' : 'text-gray-300 hover:bg-[#22272d] hover:text-white'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`text-[11px] ${selectedCategory === key ? 'text-white/80' : 'text-gray-500'}`}>{count}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-[#121212] overflow-hidden">
      {/* Left column: trades, each with its categories. Styled like the estimate's pricing-options column. */}
      <div className="w-56 border-r border-[#333333] bg-[#0A0A0A] flex flex-col h-full flex-shrink-0" role="group" aria-label="Categories">
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333333] scrollbar-track-transparent py-1">
          {categoryButton('all', 'All items', filteredLineItems.length)}
          {sidebarGroups.map(([tradeName, categories]) => (
            <div key={tradeName} className="mt-2">
              <div className="pl-6 pr-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-gray-500">{tradeName}</div>
              {categories.map(([categoryKey, count]) => categoryButton(categoryKey, categoryKey, count))}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area - Scrollable independently */}
      <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky Header Section - Contains controls and column headers */}
      <div className="flex-shrink-0 bg-[#121212] border-b border-[#333333] sticky top-0 z-10">
        {/* Table Controls */}
        <div className="px-4 py-3 border-b border-[#333333]">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Filters */}
          <div className="flex items-center gap-3">
            {myTrades.size > 0 && (
              <div role="group" aria-label="Which trades" className="inline-flex border border-[#333333]">
                {(['mine', 'all'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={tradeScope === scope}
                    title={scope === 'mine' ? myTradeNames : undefined}
                    onClick={() => setTradeScope(scope)}
                    className={`px-3 py-2 text-sm whitespace-nowrap ${tradeScope === scope ? 'bg-[#336699] text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    {scope === 'mine' ? 'My trades' : 'All trades'}
                  </button>
                ))}
              </div>
            )}
            <select
              className="bg-[#0A0A0A] border border-[#333333] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699]"
              value={selectedTradeId}
              onChange={(e) => setSelectedTradeId(e.target.value)}
            >
              <option value="all" className="bg-[#121212] text-white">All Cost Codes ({lineItems.length})</option>
              {Array.from(groupedTrades.entries()).map(([industryName, codes]) => (
                <optgroup 
                  key={industryName} 
                  label={`━━━  ${industryName.toUpperCase()}  ━━━`}
                  className="bg-[#121212] text-gray-400 font-bold"
                >
                  {codes.map(trade => (
                    <option 
                      key={trade.id} 
                      value={trade.id} 
                      className="bg-[#121212] text-white pl-4"
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
              className="bg-[#336699] hover:bg-[#2a5580] text-white px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
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
              className="border border-[#333333] p-2 text-gray-300 hover:bg-[#1E1E1E] hover:text-white transition-colors"
              title="Toggle compact view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            
            <div className="relative" ref={optionsMenuRef}>
              <button
                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                className="border border-[#333333] p-2 text-gray-300 hover:bg-[#1E1E1E] hover:text-white transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              
              {showOptionsMenu && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333333] shadow-lg z-[9999] py-1">
                  <button
                    onClick={handleImportItems}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#252525] flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import Items
                  </button>
                  <div className="border-t border-[#333333] my-1" />
                  <button
                    onClick={handleExportToCSV}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#252525] flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Export to CSV
                  </button>
                  <button
                    onClick={handleExportToExcel}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#252525] flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Export to Excel
                  </button>
                  <div className="border-t border-[#333333] my-1" />
                  <button
                    onClick={handlePrintPriceBook}
                    className="w-full px-4 py-2 text-left text-sm text-white hover:bg-[#252525] flex items-center gap-2"
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
        <div className="px-6 py-2 bg-[#121212]">
        <div className="grid grid-cols-9 gap-4 text-[11px] font-medium text-gray-500 uppercase tracking-wide items-center">
          <div className="col-span-6">
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
            <div className="px-6 py-3 bg-[#121212] border-y border-[#333333]">
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
              <div className="px-6 py-3 bg-[#121212] border-y border-[#333333]">
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
              className="bg-[#336699] hover:bg-[#2a5580] text-white px-6 py-3 font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : displayedItems.length === 0 && tradeScope === 'mine' && allOutsideMyTrades(lineItems, trades, myTrades) ? (
        // The book has items, just none in this company's trades: say so, and offer the rest.
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-lg font-medium text-white mb-2">None of your items are in your trades yet</h3>
          <p className="text-gray-400 mb-6 max-w-md">
            Your trades are {myTradeNames}. You can change them in Company settings → Trades.
          </p>
          <button
            type="button"
            onClick={() => setTradeScope('all')}
            className="bg-[#336699] hover:bg-[#2a5580] text-white px-6 py-3 font-medium transition-colors"
          >
            Show all trades ({lineItems.length})
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
              className="bg-[#336699] hover:bg-[#2a5580] text-white px-6 py-3 font-medium transition-colors"
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
              className={`grid grid-cols-9 gap-4 px-6 ${condensed ? 'py-1.5' : 'py-2.5'} items-center bg-[#121212] hover:bg-[#1A1A1A] transition-colors group relative cursor-pointer ${index < displayedItems.length - 1 ? 'border-b border-[#262626]' : ''}`}
              >
                <div className="col-span-6 pr-4">
                  <div className="w-full overflow-hidden">
                    <div className="flex items-center gap-2 text-sm text-white">
                      <span className="truncate">{lineItem.name}</span>
                      {(lineItem.is_bundle || lineItem.is_package) && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          BUNDLE
                        </span>
                      )}
                    </div>
                    {!condensed && lineItem.description && (
                      <div className="text-xs text-gray-500 truncate mt-0.5" style={{ maxWidth: '100%' }}>
                        {lineItem.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Price Column with strategy indicator - expanded to use available space */}
                <div className="col-span-3 text-right">
                  <div className="flex flex-col items-end">
                    <div className={`flex items-center justify-end gap-2 w-full text-sm ${
                      recentlyUpdatedId === lineItem.id ? 'price-updated' : ''
                    }`}>
                      <PriceRangeCompact
                        price={lineItem.price}
                        redLinePrice={lineItem.red_line_price}
                        basePrice={lineItem.base_price}
                        capPrice={lineItem.cap_price}
                        viewMode="simple"
                      />
                    </div>
                    {!condensed && (
                      <span className="text-[11px] text-gray-500 mt-0.5">per {lineItem.unit || 'each'}</span>
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
              red_line_price: data.red_line_price,
              cap_price: data.cap_price,
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
                unit: data.unit,
                cost_code_id: data.cost_code_id || editingLineItem.cost_code_id,
                red_line_price: data.red_line_price,
                cap_price: data.cap_price
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

      </div>
    </div>
  );
};

export default PriceBook;