import React, { useState, useEffect, useContext } from 'react';
import { ServiceCatalogService } from '../../services/ServiceCatalogService';
import { CostCodeService } from '../../services/CostCodeService';
import { LineItemService } from '../../services/LineItemService';
import { IndustryService } from '../../services/IndustryService';
import { formatCurrency } from '../../utils/format';
import { Search, Plus, Minus, X, Save } from 'lucide-react';
import { OrganizationContext } from '../layouts/DashboardLayout';

interface LineItem {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  type: string;
  cost_code_id?: string;
}

interface CostCode {
  id: string;
  name: string;
  code: string;
}

interface SelectedLineItem extends LineItem {
  quantity: number;
}

interface CreateServiceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preSelectedItemIds?: string[];
}

export const CreateServiceDrawer: React.FC<CreateServiceDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preSelectedItemIds = []
}) => {
  const { selectedOrg } = useContext(OrganizationContext);
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [category, setCategory] = useState('installation');
  const [industryId, setIndustryId] = useState('');
  const [markupPercentage, setMarkupPercentage] = useState(0);
  const [selectedItems, setSelectedItems] = useState<SelectedLineItem[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [industries, setIndustries] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(false);
  const [groupedItems, setGroupedItems] = useState<{ [key: string]: LineItem[] }>({});

  useEffect(() => {
    if (isOpen && selectedOrg?.id) {
      loadData();
    }
  }, [isOpen, selectedOrg?.id]);

  useEffect(() => {
    if (preSelectedItemIds.length > 0 && lineItems.length > 0) {
      const preSelected = lineItems
        .filter(item => preSelectedItemIds.includes(item.id))
        .map(item => ({ ...item, quantity: 1 }));
      setSelectedItems(preSelected);
    }
  }, [preSelectedItemIds, lineItems]);

  useEffect(() => {
    groupItemsByCostCode();
  }, [lineItems, searchTerm, selectedFilter]);

  const loadData = async () => {
    if (!selectedOrg?.id) return;
    
    setIsLoading(true);
    try {
      const [itemsData, codesData, industriesData] = await Promise.all([
        LineItemService.list(selectedOrg.id),
        CostCodeService.list(selectedOrg.id),
        IndustryService.getOrganizationIndustries(selectedOrg.id)
      ]);
      
      setLineItems(itemsData || []);
      setCostCodes(codesData || []);
      setIndustries(industriesData || []);
      
      // Set first industry as default
      if (industriesData && industriesData.length > 0 && !industryId) {
        setIndustryId(industriesData[0].id);
      }
    } catch (error) {
      // Error loading data
    } finally {
      setIsLoading(false);
    }
  };

  const groupItemsByCostCode = () => {
    const filtered = lineItems.filter(item => {
      const matchesSearch = !searchTerm || 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = selectedFilter === 'All' || item.type === selectedFilter.toLowerCase();
      
      return matchesSearch && matchesFilter;
    });

    const grouped = filtered.reduce((acc, item) => {
      const costCode = costCodes.find(cc => cc.id === item.cost_code_id);
      const groupName = costCode ? `${costCode.name} (${costCode.code})` : 'Uncategorized';
      
      if (!acc[groupName]) {
        acc[groupName] = [];
      }
      acc[groupName].push(item);
      return acc;
    }, {} as { [key: string]: LineItem[] });

    setGroupedItems(grouped);
  };

  const toggleItemSelection = (item: LineItem) => {
    const existing = selectedItems.find(si => si.id === item.id);
    
    if (existing) {
      setSelectedItems(selectedItems.filter(si => si.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, { ...item, quantity: 1 }]);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setSelectedItems(selectedItems.map(item => {
      if (item.id === itemId) {
        const newQuantity = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const removeItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter(item => item.id !== itemId));
  };

  const calculateSubtotal = () => {
    return selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const markupAmount = (subtotal * markupPercentage) / 100;
    return subtotal + markupAmount;
  };

  const handleSave = async () => {
    if (!serviceName.trim() || selectedItems.length === 0 || !selectedOrg?.id || !industryId) {
      alert('Please provide a service name, select at least one item, and choose an industry.');
      return;
    }

    try {
      setIsLoading(true);
      
      // Create the service
      const newService = await ServiceCatalogService.createService({
        organization_id: selectedOrg.id,
        name: serviceName,
        description: serviceDescription || undefined,
        category: category as any,
        industry_id: industryId,
        icon: undefined,
        is_active: true,
        display_order: 0
      });

      // Create the base service option with properly formatted materials
      const totalPrice = calculateTotal();
      
      // Format materials list for future migration: "ID:Name:Quantity:Unit"
      const formattedMaterials = selectedItems.map(item => 
        `${item.id}:${item.name}:${item.quantity}:${item.unit}`
      );
      
      await ServiceCatalogService.createServiceOption({
        service_id: newService.id,
        organization_id: selectedOrg.id,
        name: 'Standard', // Base option is always "Standard"
        description: `Includes ${selectedItems.length} items with ${markupPercentage}% markup`,
        price: totalPrice,
        unit: 'service',
        estimated_hours: undefined,
        materials_list: formattedMaterials,
        skill_level: 'intermediate',
        material_quality: 'standard',
        warranty_months: undefined,
        is_active: true,
        is_popular: true, // Base option is the popular/default choice
        display_order: 0
      });

      onSuccess();
      resetForm();
    } catch (error) {
      // Error creating service
      alert('Failed to create service. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setServiceName('');
    setServiceDescription('');
    setCategory('installation');
    setMarkupPercentage(0);
    setSelectedItems([]);
    setSearchTerm('');
    setSelectedFilter('All');
  };

  const categories = [
    { value: 'installation', label: 'Installation' },
    { value: 'repair', label: 'Repair' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'consultation', label: 'Consultation' },
    { value: 'preparation', label: 'Preparation' },
    { value: 'finishing', label: 'Finishing' }
  ];

  const filterTypes = ['All', 'Material', 'Labor', 'Equipment', 'Service', 'Subcontractor'];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with blur effect */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[9998] ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-[80%] max-w-[1200px] bg-[#121212] shadow-xl transform transition-transform z-[9999] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full">
          {/* Left Panel - Line Items */}
          <div className="w-[40%] border-r border-[#333333] flex flex-col">
            {/* Search and Filters */}
            <div className="p-3 border-b border-[#333333] space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search cost code items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                />
              </div>
              
              {/* Type Filter Pills */}
              <div className="flex gap-1 overflow-x-auto">
                {filterTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => setSelectedFilter(type)}
                    className={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors whitespace-nowrap ${
                      selectedFilter === type
                        ? 'bg-[#336699] text-white'
                        : 'bg-[#333333] text-gray-300 hover:bg-[#404040]'
                    }`}
                  >
                    {type === 'All' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Items List - Compact */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
              ) : Object.keys(groupedItems).length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  {searchTerm ? 'No items found' : 'No items available'}
                </div>
              ) : (
                <div>
                  {Object.entries(groupedItems).map(([groupName, items]) => (
                    <div key={groupName}>
                      {/* Cost Code Header */}
                      <div className="sticky top-0 bg-[#336699]/20 backdrop-blur-sm border-b border-[#336699]/30 px-3 py-2 z-10">
                        <h4 className="text-xs font-semibold text-blue-200 uppercase tracking-wider">
                          {groupName} ({items.length})
                        </h4>
                      </div>
                      
                      {/* Cost Code Items */}
                      <div className="divide-y divide-[#333333]">
                        {items.map(item => {
                          const isSelected = selectedItems.some(si => si.id === item.id);
                          return (
                            <div
                              key={item.id}
                              className="px-3 py-2 hover:bg-[#1E1E1E] cursor-pointer transition-colors"
                              onClick={() => toggleItemSelection(item)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-white truncate">{item.name}</div>
                                  {item.description && (
                                    <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>
                                  )}
                                </div>
                                <div className="text-right ml-3 flex-shrink-0">
                                  <div className="font-mono text-sm text-white">
                                    {formatCurrency(item.price)}
                                  </div>
                                  <div className="text-xs text-gray-400">/{item.unit}</div>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="mt-1 text-xs text-[#336699]">
                                  ✓ Added to service
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

          {/* Right Panel - Service Details */}
          <div className="flex-1 flex flex-col">
            {/* Compact Header */}
            <div className="bg-[#1E1E1E] border-b border-[#333333] px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <h1 className="text-lg font-semibold">Create Service</h1>
                </div>
                <button
                  onClick={handleSave}
                  disabled={!serviceName.trim() || selectedItems.length === 0 || isLoading}
                  className="px-4 py-1.5 bg-[#336699] text-white rounded-[4px] hover:bg-[#2A5580] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                >
                  <Save className="w-3 h-3" />
                  {isLoading ? 'Creating...' : 'Create Service'}
                </button>
              </div>
            </div>

            {/* Service Info Section */}
            <div className="p-4 border-b border-[#333333]">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    placeholder="Service Name *"
                    className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Be specific: "Modern Kitchen Remodel" not "Kitchen Remodel"
                  </p>
                </div>
                <div className="col-span-2">
                  <textarea
                    value={serviceDescription}
                    onChange={(e) => setServiceDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699] resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Service Type
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Industry
                  </label>
                  <select
                    value={industryId}
                    onChange={(e) => setIndustryId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                  >
                    {industries.map(ind => (
                      <option key={ind.id} value={ind.id}>{ind.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Markup %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={markupPercentage}
                      onChange={(e) => setMarkupPercentage(parseFloat(e.target.value) || 0)}
                      min="0"
                      max="100"
                      placeholder="Markup %"
                      className="flex-1 px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                    />
                    <span className="text-gray-400 text-sm">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Items Section */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Selected Items ({selectedItems.length})
                </h3>
                {selectedItems.length > 0 && (
                  <button
                    onClick={() => setSelectedItems([])}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Clear All
                  </button>
                )}
              </div>
              
              {selectedItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Click items on the left to add them
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 bg-[#1E1E1E] rounded-[4px]">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{item.name}</div>
                        <div className="text-xs text-gray-400">
                          {formatCurrency(item.price)} × {item.quantity} = {formatCurrency(item.price * item.quantity)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-6 h-6 flex items-center justify-center bg-[#333333] hover:bg-[#404040] rounded-[2px] transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.id, Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-12 text-center px-1 py-1 bg-[#333333] border border-[#555555] rounded-[2px] text-white text-sm"
                        />
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-6 h-6 flex items-center justify-center bg-[#333333] hover:bg-[#404040] rounded-[2px] transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="w-6 h-6 flex items-center justify-center text-red-400 hover:bg-red-400/20 rounded-[2px] transition-colors ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pricing Summary - Fixed at bottom */}
            <div className="border-t border-[#333333] p-4 bg-[#1E1E1E]">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="font-mono text-white">{formatCurrency(calculateSubtotal())}</span>
                </div>
                {markupPercentage > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Markup ({markupPercentage}%)</span>
                    <span className="font-mono text-white">
                      {formatCurrency(calculateSubtotal() * (markupPercentage / 100))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold pt-2 border-t border-[#333333]">
                  <span className="text-white">Total</span>
                  <span className="font-mono text-white">{formatCurrency(calculateTotal())}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};