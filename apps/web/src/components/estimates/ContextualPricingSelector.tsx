import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Layers, Check, Plus, Minus, Package, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { LineItemService } from '../../services/LineItemService';
import { ServiceCatalogService } from '../../services/ServiceCatalogService';

interface LineItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  base_price?: number;
  red_line_price?: number;
  cap_price?: number;
  unit: string;
  cost_code_id?: string;
  industry_id?: string;
  category?: string;
}

interface SelectedItem {
  lineItemId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  description?: string;
}

interface ProjectContext {
  projectType?: string;
  packageLevel?: string;
  packageId?: string;
  industryId?: string;
  includedCategories?: string[];
}

interface ContextualPricingSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItems: (items: SelectedItem[]) => void;
  organizationId: string;
  projectContext?: ProjectContext;
  existingItems?: SelectedItem[];
}

export const ContextualPricingSelector: React.FC<ContextualPricingSelectorProps> = ({
  isOpen,
  onClose,
  onAddItems,
  organizationId,
  projectContext,
  existingItems = []
}) => {
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [packageItems, setPackageItems] = useState<LineItem[]>([]);

  // Initialize selected items from existing items
  useEffect(() => {
    if (existingItems.length > 0) {
      const itemsMap = new Map<string, SelectedItem>();
      existingItems.forEach(item => {
        itemsMap.set(item.lineItemId, item);
      });
      setSelectedItems(itemsMap);
    }
  }, [existingItems]);

  // Load line items based on context
  useEffect(() => {
    loadContextualItems();
  }, [organizationId, projectContext]);

  const loadContextualItems = async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      // Load all line items for the organization
      const allItems = await LineItemService.list(organizationId);

      // Filter based on project context
      let filteredItems = allItems;
      
      if (projectContext) {
        // Filter by industry if specified
        if (projectContext.industryId) {
          filteredItems = filteredItems.filter(item => 
            item.industry_id === projectContext.industryId
          );
        }

        // Filter by included categories if specified
        if (projectContext.includedCategories && projectContext.includedCategories.length > 0) {
          filteredItems = filteredItems.filter(item => 
            item.category && projectContext.includedCategories!.includes(item.category)
          );
        }

        // Load package items if package is specified
        if (projectContext.packageId) {
          try {
            const packageData = await ServiceCatalogService.getPackageWithItems(projectContext.packageId);
            if (packageData && packageData.items) {
              // Extract line items from package
              const packageLineItems: LineItem[] = [];
              packageData.items.forEach((packageItem: any) => {
                if (packageItem.service_option?.items) {
                  packageItem.service_option.items.forEach((serviceItem: any) => {
                    if (serviceItem.line_item) {
                      packageLineItems.push({
                        ...serviceItem.line_item,
                        quantity: serviceItem.quantity || 1
                      });
                    }
                  });
                }
              });
              setPackageItems(packageLineItems);
            }
          } catch (error) {
            console.error('Error loading package items:', error);
          }
        }
      }

      setLineItems(filteredItems);
    } catch (error) {
      console.error('Error loading line items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group items by category
  const groupedItems = useMemo(() => {
    const filtered = lineItems.filter(item => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          item.name.toLowerCase().includes(search) ||
          item.description?.toLowerCase().includes(search)
        );
      }
      return true;
    });

    const grouped = filtered.reduce((acc, item) => {
      const category = item.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {} as Record<string, LineItem[]>);

    return grouped;
  }, [lineItems, searchTerm]);

  // Get categories for sidebar
  const categories = useMemo(() => {
    const cats = Object.keys(groupedItems).sort();
    return ['all', ...cats];
  }, [groupedItems]);

  // Get displayed items based on selected category
  const displayedItems = useMemo(() => {
    if (selectedCategory === 'all') {
      return lineItems.filter(item => {
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          return (
            item.name.toLowerCase().includes(search) ||
            item.description?.toLowerCase().includes(search)
          );
        }
        return true;
      });
    }
    return groupedItems[selectedCategory] || [];
  }, [selectedCategory, groupedItems, lineItems, searchTerm]);

  // Toggle item selection
  const toggleItem = (item: LineItem) => {
    const newSelected = new Map(selectedItems);
    const itemKey = item.id;
    
    if (newSelected.has(itemKey)) {
      newSelected.delete(itemKey);
    } else {
      newSelected.set(itemKey, {
        lineItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        unit: item.unit,
        description: item.description
      });
    }
    
    setSelectedItems(newSelected);
  };

  // Update quantity
  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      const newSelected = new Map(selectedItems);
      newSelected.delete(itemId);
      setSelectedItems(newSelected);
    } else {
      const newSelected = new Map(selectedItems);
      const item = newSelected.get(itemId);
      if (item) {
        newSelected.set(itemId, { ...item, quantity });
        setSelectedItems(newSelected);
      }
    }
  };

  // Handle add items
  const handleAddItems = () => {
    const itemsArray = Array.from(selectedItems.values());
    onAddItems(itemsArray);
    onClose();
  };

  // Check if item is from package
  const isPackageItem = (itemId: string) => {
    return packageItems.some(pi => pi.id === itemId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-[#1D1F25] w-full max-w-6xl h-[80vh] rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#333333] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Add Items to Estimate</h2>
            {projectContext?.projectType && (
              <p className="text-sm text-gray-400 mt-1">
                {projectContext.projectType} • {projectContext.packageLevel || 'Custom'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-[#333333]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#22272d] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-[#333333] bg-[#1a1a1a] overflow-y-auto">
            <div className="p-3">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Categories</h3>
              <div className="space-y-1">
                {categories.map(category => {
                  const count = category === 'all' 
                    ? lineItems.length 
                    : (groupedItems[category] || []).length;
                  
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between rounded transition-colors ${
                        selectedCategory === category
                          ? 'bg-[#336699] text-white'
                          : 'text-gray-300 hover:bg-[#22272d]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {category === 'all' ? (
                          <Layers className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        {category === 'all' ? 'All Items' : category}
                      </span>
                      <span className="text-xs opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#336699]"></div>
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Package className="w-12 h-12 mb-3 opacity-50" />
                <p>No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedItems.map(item => {
                  const isSelected = selectedItems.has(item.id);
                  const selectedItem = selectedItems.get(item.id);
                  const isPkgItem = isPackageItem(item.id);
                  
                  return (
                    <div
                      key={item.id}
                      className={`border rounded-lg p-4 transition-all ${
                        isSelected
                          ? 'bg-[#336699]/20 border-[#336699]'
                          : 'bg-[#22272d] border-[#333333] hover:border-[#444444]'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="text-white font-medium text-sm">{item.name}</h4>
                          {item.description && (
                            <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => toggleItem(item)}
                          className={`p-1 rounded transition-colors ${
                            isSelected
                              ? 'text-[#336699]'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {isSelected ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <Plus className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-mono">
                            {formatCurrency(item.price)}
                            <span className="text-xs text-gray-400 ml-1">/ {item.unit}</span>
                          </div>
                          {isPkgItem && (
                            <span className="text-xs text-blue-400 flex items-center gap-1 mt-1">
                              <Package className="w-3 h-3" />
                              Included in package
                            </span>
                          )}
                        </div>
                        
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuantity(item.id, (selectedItem?.quantity || 1) - 1);
                              }}
                              className="p-1 text-gray-400 hover:text-white hover:bg-[#333333] rounded"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-white text-sm">
                              {selectedItem?.quantity || 1}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuantity(item.id, (selectedItem?.quantity || 1) + 1);
                              }}
                              className="p-1 text-gray-400 hover:text-white hover:bg-[#333333] rounded"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#333333] flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {selectedItems.size} items selected
            {selectedItems.size > 0 && (
              <span className="ml-3">
                Total: {formatCurrency(
                  Array.from(selectedItems.values()).reduce((sum, item) => 
                    sum + (item.price * item.quantity), 0
                  )
                )}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddItems}
              disabled={selectedItems.size === 0}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                selectedItems.size > 0
                  ? 'bg-[#336699] hover:bg-[#4477aa] text-white'
                  : 'bg-[#333333] text-gray-500 cursor-not-allowed'
              }`}
            >
              Add {selectedItems.size} Items
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};