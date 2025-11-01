import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Package, 
  Plus,
  Minus,
  Trash2,
  Search,
  Check,
  RefreshCw,
  Save,
  Calculator,
  ChevronDown,
  Undo2,
  Redo2,
  Keyboard,
  GitCompare,
  Clock,
  Sparkles,
  History,
  Eye,
  EyeOff,
  TrendingUp,
  Share2,
  Copy,
  CheckCircle,
  ExternalLink
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { supabase } from '../../lib/supabase';
import { ServiceCatalogService } from '../../services/ServiceCatalogService';

interface ServiceOption {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  service_id?: string;
  service_option_items?: ServiceOptionItem[];
  organization_id?: string;
  attributes?: any;
}

interface ServiceOptionItem {
  id: string;
  quantity: number;
  calculation_type?: 'multiply' | 'fixed' | 'per_unit';
  coverage_amount?: number;
  coverage_unit?: string;
  line_item?: LineItem;
}

interface LineItem {
  id: string;
  name: string;
  price: number;
  unit: string;
  cost_code_id?: string;
  cost_code?: {
    code: string;
    name: string;
    category: string;
  };
}

interface BundlePreset {
  name: string;
  description: string;
  itemIds: string[];
}

interface RecentCustomization {
  id: string;
  name: string;
  timestamp: string;
  items: ServiceOptionItem[];
  totalPrice: number;
  totalHours: number;
}

interface CustomizeServiceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  serviceOption: ServiceOption;
  organizationId: string;
  onSave: () => void;
}

// Get relevant cost codes based on service name
const getRelevantCostCodes = (serviceName: string): string[] => {
  // For now, let's be more permissive and just return empty array
  // This will show all items but won't apply the "recommended" filtering
  // We'll update this once we see what cost codes actually exist
  return [];
};

// Define bundle presets based on service option
const getBundlePresets = (serviceOption: ServiceOption, availableItems: LineItem[]): BundlePreset[] => {
  // Get labor items (typically have 'hour' or 'hr' in unit)
  const laborItems = availableItems.filter(item => 
    item.unit.toLowerCase().includes('hour') || 
    item.unit.toLowerCase().includes('hr') ||
    item.cost_code?.category === 'labor'
  );
  
  // Get material items
  const materialItems = availableItems.filter(item =>
    item.cost_code?.category === 'material' ||
    item.cost_code?.code?.includes('500') || // 500 codes are typically materials
    (!laborItems.find(l => l.id === item.id) && !item.unit.toLowerCase().includes('hour'))
  );
  
  return [
    {
      name: 'Budget',
      description: 'Essential items only',
      itemIds: [
        // First labor item (usually the cheapest)
        laborItems[0]?.id,
        // First 2 material items
        ...materialItems.slice(0, 2).map(m => m.id)
      ].filter(Boolean)
    },
    {
      name: 'Standard',
      description: 'Most common selection',
      itemIds: [
        // First 2 labor items
        ...laborItems.slice(0, 2).map(l => l.id),
        // First 3 material items
        ...materialItems.slice(0, 3).map(m => m.id)
      ].filter(Boolean)
    },
    {
      name: 'Premium',
      description: 'Complete package',
      itemIds: [
        // All labor items (up to 3)
        ...laborItems.slice(0, 3).map(l => l.id),
        // First 5 material items
        ...materialItems.slice(0, 5).map(m => m.id)
      ].filter(Boolean)
    }
  ];
};


export const CustomizeServiceDrawer: React.FC<CustomizeServiceDrawerProps> = ({
  isOpen,
  onClose,
  serviceOption,
  organizationId,
  onSave
}) => {
  const [currentItems, setCurrentItems] = useState<ServiceOptionItem[]>([]);
  const [availableItems, setAvailableItems] = useState<LineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    // Load saved filter preference
    try {
      const saved = localStorage.getItem('service-option-filter-category');
      return saved || 'all';
    } catch {
      return 'all';
    }
  });
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1);
  const [showComparison, setShowComparison] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  // Track original items and changes
  const [originalItems, setOriginalItems] = useState<ServiceOptionItem[]>([]);
  const [changesHistory, setChangesHistory] = useState<ServiceOptionItem[][]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [hasDraftLoaded, setHasDraftLoaded] = useState(false);
  
  // New features state
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [recentCustomizations, setRecentCustomizations] = useState<RecentCustomization[]>([]);
  const [showRecentSection, setShowRecentSection] = useState(false);
  const [clientPreviewMode, setClientPreviewMode] = useState(false);
  const [shareLink, setShareLink] = useState<string>('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Get draft key for localStorage
  const getDraftKey = () => `service-option-draft-${serviceOption.id}-${organizationId}`;

  // Save draft to localStorage
  const saveDraft = (items: ServiceOptionItem[]) => {
    try {
      const draft = {
        items,
        timestamp: Date.now(),
        serviceOptionId: serviceOption.id,
        organizationId
      };
      localStorage.setItem(getDraftKey(), JSON.stringify(draft));
    } catch (e) {
      // Failed to save draft
    }
  };

  // Load draft from localStorage
  const loadDraft = () => {
    try {
      const draftStr = localStorage.getItem(getDraftKey());
      if (!draftStr) return null;
      
      const draft = JSON.parse(draftStr);
      // Check if draft is less than 24 hours old
      if (Date.now() - draft.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(getDraftKey());
        return null;
      }
      
      return draft.items;
    } catch (e) {
      // Failed to load draft
      return null;
    }
  };
  
  // Get recent customizations key
  const getRecentKey = () => `recent-customizations-${serviceOption.service_id || serviceOption.id}-${organizationId}`;
  
  // Save recent customization
  const saveRecentCustomization = (items: ServiceOptionItem[]) => {
    try {
      const recent: RecentCustomization = {
        id: `${Date.now()}`,
        name: `${new Date().toLocaleDateString()} - ${calculatePrice().toFixed(2)}`,
        timestamp: new Date().toISOString(),
        items: items,
        totalPrice: calculatePrice(),
        totalHours: calculateTotalHours()
      };
      
      const recentStr = localStorage.getItem(getRecentKey());
      let recents: RecentCustomization[] = recentStr ? JSON.parse(recentStr) : [];
      
      // Add new customization and keep only last 5
      recents = [recent, ...recents.slice(0, 4)];
      
      localStorage.setItem(getRecentKey(), JSON.stringify(recents));
      setRecentCustomizations(recents);
    } catch {
      // Silently fail
    }
  };
  
  // Load recent customizations
  const loadRecentCustomizations = () => {
    try {
      const recentStr = localStorage.getItem(getRecentKey());
      if (recentStr) {
        const recents: RecentCustomization[] = JSON.parse(recentStr);
        setRecentCustomizations(recents);
        if (recents.length > 0) {
          setShowRecentSection(true);
        }
      }
    } catch {
      // Silently fail
    }
  };

  // Clear draft
  const clearDraft = () => {
    try {
      localStorage.removeItem(getDraftKey());
    } catch (e) {
      console.error('Failed to clear draft:', e);
    }
  };

  // Initialize current items when drawer opens
  useEffect(() => {
    if (isOpen && serviceOption.service_option_items && !hasDraftLoaded) {
      const items = [...serviceOption.service_option_items];
      
      // Check for saved draft
      const draftItems = loadDraft();
      if (draftItems && draftItems.length > 0) {
        // Ask user if they want to restore draft
        const restore = window.confirm('You have unsaved changes from a previous session. Would you like to restore them?');
        if (restore) {
          setCurrentItems(draftItems);
          setChangesHistory([items, draftItems]);
          setCurrentHistoryIndex(1);
        } else {
          clearDraft();
          setCurrentItems(items);
          setChangesHistory([items]);
          setCurrentHistoryIndex(0);
        }
      } else {
        setCurrentItems(items);
        setChangesHistory([items]);
        setCurrentHistoryIndex(0);
      }
      
      setOriginalItems(items);
      setHasDraftLoaded(true);
      loadAvailableItems();
      
      // Load recent customizations
      loadRecentCustomizations();
    }
  }, [isOpen, serviceOption, organizationId, hasDraftLoaded]);

  // Reset draft loaded flag when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setHasDraftLoaded(false);
      setIsVisible(false);
      // Delay unmounting to allow close animation
      setTimeout(() => setIsMounted(false), 300);
    } else {
      // Mount immediately
      setIsMounted(true);
      // Small delay to ensure drawer starts off-screen
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    }
  }, [isOpen]);

  // Load available line items
  const loadAvailableItems = async () => {
    setIsLoading(true);
    // Loading items for service option
    
    try {
      let industryId: string | null = null;
      
      // Get industry_id from service or organization
      if (serviceOption.service_id) {
        const { data: service } = await supabase
          .from('services')
          .select('industry_id')
          .eq('id', serviceOption.service_id)
          .single();
        
        industryId = service?.industry_id;
        // Found industry from service
      } else {
        // No service_id, checking organization
        const { data: org } = await supabase
          .from('organizations')
          .select('industry_id')
          .eq('id', organizationId)
          .single();
          
        industryId = org?.industry_id;
        // Found industry from organization
      }
      
      if (!industryId) {
        // No industry_id found
        setAvailableItems([]);
        return;
      }
      
      // Get cost codes for this industry
      const { data: costCodes } = await supabase
        .from('cost_codes')
        .select('id')
        .eq('industry_id', industryId)
        .is('organization_id', null); // System cost codes only
      
      // Cost codes found
      // Cost code error
      
      if (!costCodes || costCodes.length === 0) {
        // No cost codes found for industry
        setAvailableItems([]);
        return;
      }
      
      const costCodeIds = costCodes.map(cc => cc.id);
      
      // Get line items for these cost codes
      const { data: items, error: itemsError } = await supabase
        .from('line_items')
        .select(`
          *,
          cost_code:cost_codes(code, name, category)
        `)
        .in('cost_code_id', costCodeIds)
        .is('organization_id', null) // System line items only for now
        .order('name');

      // Available items loaded
      if (itemsError) console.error('Items error:', itemsError);
      
      if (items && items.length > 0) {
        // Items loaded successfully
      }
      
      setAvailableItems(items || []);
    } catch (error) {
      console.error('Error loading available items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get relevant cost codes for the current service
  const relevantCostCodes = useMemo(() => {
    return getRelevantCostCodes(serviceOption.name);
  }, [serviceOption.name]);

  // Filter available items
  const filteredItems = useMemo(() => {
    let items = availableItems;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.cost_code?.name?.toLowerCase().includes(query) ||
        item.cost_code?.code?.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      items = items.filter(item => item.cost_code?.category === selectedCategory);
    }

    return items;
  }, [availableItems, searchQuery, selectedCategory]);

  // Get appropriate quantity step based on unit
  const getQuantityStep = (unit?: string) => {
    if (!unit) return 0.1;
    const lowerUnit = unit.toLowerCase();
    if (lowerUnit === 'each' || lowerUnit === 'unit' || lowerUnit === 'ea') return 1;
    return 0.1;
  };

  // Add item to service
  const handleAddItem = (lineItem: LineItem) => {
    const newItem: ServiceOptionItem = {
      id: `temp-${Date.now()}`,
      quantity: 1,
      calculation_type: 'multiply',
      line_item: lineItem
    };
    const newItems = [...currentItems, newItem];
    updateItemsWithHistory(newItems);
  };

  // Reset selected index when search or category changes
  useEffect(() => {
    setSelectedItemIndex(-1);
  }, [searchQuery, selectedCategory]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC - Close drawer
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
      
      // Cmd/Ctrl + S - Save
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && !isSaving && !showSuccessMessage) {
        e.preventDefault();
        handleSave();
      }
      
      // Cmd/Ctrl + Z - Undo
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z' && currentHistoryIndex > 0) {
        e.preventDefault();
        handleUndo();
      }
      
      // Cmd/Ctrl + Shift + Z - Redo
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z' && currentHistoryIndex < changesHistory.length - 1) {
        e.preventDefault();
        handleRedo();
      }
      
      // Cmd/Ctrl + Shift + R - Reset to original
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'r') {
        e.preventDefault();
        handleReset();
      }
      
      // Cmd/Ctrl + F - Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder="Search items..."]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      
      // ? - Toggle keyboard shortcuts help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowKeyboardShortcuts(prev => !prev);
      }
      
      // Arrow Up/Down - Navigate available items
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedItemIndex(prev => {
          const max = filteredItems.length - 1;
          const newIndex = prev < max ? prev + 1 : 0;
          // Scroll selected item into view
          setTimeout(() => {
            const selectedElement = document.querySelector(`[data-item-index="${newIndex}"]`);
            selectedElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 0);
          return newIndex;
        });
      }
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedItemIndex(prev => {
          const max = filteredItems.length - 1;
          const newIndex = prev > 0 ? prev - 1 : max;
          // Scroll selected item into view
          setTimeout(() => {
            const selectedElement = document.querySelector(`[data-item-index="${newIndex}"]`);
            selectedElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 0);
          return newIndex;
        });
      }
      
      // Enter - Add selected item
      if (e.key === 'Enter' && selectedItemIndex >= 0 && selectedItemIndex < filteredItems.length) {
        e.preventDefault();
        const selectedItem = filteredItems[selectedItemIndex];
        if (selectedItem && !currentItems.some(ci => ci.line_item?.id === selectedItem.id)) {
          handleAddItem(selectedItem);
        }
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isSaving, showSuccessMessage, currentHistoryIndex, selectedItemIndex, filteredItems, currentItems, changesHistory]);

  // Remove item from service
  const handleRemoveItem = (itemId: string) => {
    const newItems = currentItems.filter(item => item.id !== itemId);
    updateItemsWithHistory(newItems);
  };

  // Update item quantity
  const handleQuantityChange = (itemId: string, quantity: number) => {
    const newItems = currentItems.map(item => 
      item.id === itemId ? { ...item, quantity } : item
    );
    updateItemsWithHistory(newItems);
  };

  // Update calculation type
  const handleCalcTypeChange = (itemId: string, calcType: 'multiply' | 'fixed' | 'per_unit') => {
    const newItems = currentItems.map(item => 
      item.id === itemId ? { ...item, calculation_type: calcType } : item
    );
    updateItemsWithHistory(newItems);
  };

  // Helper to update items with history tracking
  const updateItemsWithHistory = (newItems: ServiceOptionItem[]) => {
    setCurrentItems(newItems);
    // Add to history, removing any forward history if we're not at the end
    const newHistory = [...changesHistory.slice(0, currentHistoryIndex + 1), newItems];
    setChangesHistory(newHistory);
    setCurrentHistoryIndex(newHistory.length - 1);
    
    // Auto-save draft
    saveDraft(newItems);
  };

  // Undo last change
  const handleUndo = () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      setCurrentItems(changesHistory[newIndex]);
      saveDraft(changesHistory[newIndex]);
    }
  };
  
  // Redo last undone change
  const handleRedo = () => {
    if (currentHistoryIndex < changesHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      setCurrentItems(changesHistory[newIndex]);
      saveDraft(changesHistory[newIndex]);
    }
  };

  // Check if an item has been modified
  const isItemModified = (item: ServiceOptionItem) => {
    const originalItem = originalItems.find(oi => oi.id === item.id);
    if (!originalItem) return true; // New item
    return originalItem.quantity !== item.quantity || 
           originalItem.calculation_type !== item.calculation_type;
  };

  // Calculate subtotals by category
  const calculateSubtotals = () => {
    const subtotals = {
      labor: 0,
      material: 0,
      equipment: 0,
      service: 0,
      other: 0
    };

    currentItems.forEach(item => {
      const basePrice = item.line_item?.price || 0;
      const category = item.line_item?.cost_code?.category || 'other';
      
      let itemTotal = 0;
      // All calculation types should multiply by the item quantity
      // The calculation type affects how it scales with the service option quantity
      // when added to an estimate (not visible in this customization UI)
      itemTotal = basePrice * item.quantity;
      
      
      if (category in subtotals) {
        subtotals[category as keyof typeof subtotals] += itemTotal;
      } else {
        subtotals.other += itemTotal;
      }
    });

    return subtotals;
  };

  // Calculate total price
  const calculatePrice = () => {
    const subtotals = calculateSubtotals();
    const total = Object.values(subtotals).reduce((sum, val) => sum + val, 0);
    return total;
  };
  
  // Calculate total estimated hours
  const calculateTotalHours = () => {
    // Disabled - estimated_hours field doesn't exist in database
    return 0;
  };
  
  // Apply bundle preset
  const applyBundlePreset = (preset: BundlePreset) => {
    const newItems: ServiceOptionItem[] = [];
    
    preset.itemIds.forEach(itemId => {
      const lineItem = availableItems.find(li => li.id === itemId);
      if (lineItem) {
        newItems.push({
          id: `${Date.now()}-${itemId}`,
          line_item: lineItem,
          quantity: 1,
          calculation_type: 'multiply',
        });
      }
    });
    
    updateItemsWithHistory(newItems);
    setSelectedPreset(preset.name);
  };
  
  // Apply recent customization
  const applyRecentCustomization = (recent: RecentCustomization) => {
    updateItemsWithHistory(recent.items);
  };
  
  // Calculate profit health indicator
  const getProfitHealth = () => {
    const currentPrice = calculatePrice();
    const originalPrice = serviceOption.price;
    const margin = ((currentPrice - originalPrice) / originalPrice) * 100;
    
    if (margin >= 20) return { color: 'text-green-500', level: 'Healthy' };
    if (margin >= 10) return { color: 'text-yellow-500', level: 'Moderate' };
    return { color: 'text-red-500', level: 'Low' };
  };
  
  // Generate shareable link
  const generateShareLink = () => {
    // Create a shareable configuration object
    const config = {
      serviceOptionId: serviceOption.id,
      serviceOptionName: serviceOption.name,
      items: currentItems.map(item => ({
        id: item.line_item?.id,
        name: item.line_item?.name,
        price: item.line_item?.price,
        unit: item.line_item?.unit,
        quantity: item.quantity,
        calculationType: item.calculation_type
      })),
      totalPrice: calculatePrice(),
      timestamp: new Date().toISOString()
    };
    
    // Encode configuration to base64 URL-safe encoding
    const encoded = btoa(JSON.stringify(config))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Generate link
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/share/service-option/${encoded}`;
    
    setShareLink(link);
    setShowShareModal(true);
  };
  
  // Copy link to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };


  // Save customization
  const handleSave = async () => {
    // Validate at least one item
    if (currentItems.length === 0) {
      setErrorMessage('Service option must have at least one item');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    setIsSaving(true);
    try {
      // Build customization data
      const swappedItems: Record<string, string> = {};
      const removedItems: string[] = [];
      const addedItems: Array<{ line_item_id: string; quantity: number; calculation_type: string }> = [];

      // Find swapped items (items that replaced original ones)
      const originalItemIds = new Set(serviceOption.service_option_items?.map(soi => soi.line_item?.id) || []);
      const currentItemIds = new Set(currentItems.map(ci => ci.line_item?.id));

      // Find removed items
      serviceOption.service_option_items?.forEach(soi => {
        if (soi.line_item && !currentItemIds.has(soi.line_item.id)) {
          removedItems.push(soi.id);
        }
      });

      // Find added items
      currentItems.forEach(ci => {
        if (ci.line_item && !originalItemIds.has(ci.line_item.id)) {
          addedItems.push({
            line_item_id: ci.line_item.id,
            quantity: ci.quantity,
            calculation_type: ci.calculation_type || 'multiply'
          });
        }
      });

      // Call the customization API
      await ServiceCatalogService.customizeOption(
        serviceOption.id,
        organizationId,
        {
          swappedItems,
          removedItems,
          addedItems,
          priceOverride: calculatePrice()
        }
      );

      // Show success message
      setShowSuccessMessage(true);
      
      // Save as recent customization
      saveRecentCustomization(currentItems);
      
      // Clear draft after successful save
      clearDraft();
      
      // Wait a moment then close
      setTimeout(() => {
        onSave();
        onClose();
        setShowSuccessMessage(false);
      }, 1500);
    } catch (error) {
      // Error saving customization
      setErrorMessage('Failed to save customization. Please try again.');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to original
  const handleReset = () => {
    if (originalItems.length > 0) {
      updateItemsWithHistory([...originalItems]);
    }
  };

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(availableItems.map(item => item.cost_code?.category).filter(Boolean));
    return Array.from(cats);
  }, [availableItems]);

  // Get smart suggestions based on current items

  if (!isMounted) return null;

  return (
    <>
      {/* Backdrop with blur */}
      <div 
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={`fixed right-0 top-0 bottom-0 h-screen w-[600px] bg-[#1A1A1A] border-l border-[#333333] shadow-2xl z-[10000] flex flex-col transition-transform duration-300 ease-out ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
      
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-[10001] animate-fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5" />
            <span className="font-medium">Service option customized successfully!</span>
          </div>
        </div>
      )}
      
      {/* Share Modal */}
      {showShareModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/70 z-[10001]" 
            onClick={() => setShowShareModal(false)}
          />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#252525] border border-[#333333] rounded-lg p-6 z-[10002] w-[500px] max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Share This Configuration</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-400 mb-4">
              Share this link with your client to show them this exact service configuration:
            </p>
            
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 px-3 py-2 bg-[#1A1A1A] border border-[#333333] rounded-md text-sm text-white font-mono"
                onClick={(e) => e.currentTarget.select()}
              />
              <button
                onClick={copyToClipboard}
                className={`px-4 py-2 rounded-md transition-all flex items-center gap-2 ${
                  linkCopied 
                    ? 'bg-green-500 text-white' 
                    : 'bg-[#336699] hover:bg-[#4477AA] text-white'
                }`}
              >
                {linkCopied ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={() => window.open(shareLink, '_blank')}
                className="px-4 py-2 bg-[#252525] hover:bg-[#333333] text-white rounded-md transition-all flex items-center gap-2"
                title="Preview how clients will see this"
              >
                <ExternalLink className="w-4 h-4" />
                Preview
              </button>
            </div>
            
            <div className="text-xs text-gray-500">
              <p>This link includes:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>All selected items and quantities</li>
                <li>Custom pricing: {formatCurrency(calculatePrice())}</li>
                <li>Configuration timestamp</li>
              </ul>
            </div>
          </div>
        </>
      )}
      
      {/* Header */}
      <div className="p-4 border-b border-[#333333]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Customize Service Option</h2>
            <p className="text-sm text-gray-400">{serviceOption.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generateShareLink}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-[#333333] transition-all"
              title="Generate shareable link"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setClientPreviewMode(!clientPreviewMode)}
              className={`p-2 rounded-md transition-all ${clientPreviewMode ? 'bg-[#EAB308]/20 text-[#EAB308]' : 'text-gray-400 hover:text-white hover:bg-[#333333]'}`}
              title={clientPreviewMode ? 'Exit client view' : 'Preview client view'}
            >
              {clientPreviewMode ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className={`p-2 rounded-md transition-all ${showComparison ? 'bg-[#336699]/20 text-[#336699]' : 'text-gray-400 hover:text-white hover:bg-[#333333]'}`}
              title="Compare changes"
            >
              <GitCompare className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-[#333333] transition-all"
              title="Keyboard shortcuts"
            >
              <Keyboard className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-[#333333] transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Keyboard Shortcuts Help */}
        {showKeyboardShortcuts && (
          <div className="mb-3 p-3 bg-[#252525] rounded-md">
            <h3 className="text-xs font-medium text-gray-400 mb-2">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Save</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">
                  {navigator.platform.includes('Mac') ? '⌘S' : 'Ctrl+S'}
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Close</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">ESC</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Undo</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">
                  {navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl+Z'}
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Redo</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">
                  {navigator.platform.includes('Mac') ? '⌘⇧Z' : 'Ctrl+Shift+Z'}
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Reset</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">
                  {navigator.platform.includes('Mac') ? '⌘⇧R' : 'Ctrl+Shift+R'}
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Search</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">
                  {navigator.platform.includes('Mac') ? '⌘F' : 'Ctrl+F'}
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Help</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">?</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Navigate</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">↑↓</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Add Item</span>
                <kbd className="px-2 py-0.5 bg-[#333333] rounded text-gray-300 font-mono text-[10px]">Enter</kbd>
              </div>
            </div>
          </div>
        )}
        
        {/* Quick Bundle Presets */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Quick Bundles</span>
          </div>
          <div className="flex gap-2">
            {getBundlePresets(serviceOption, availableItems).map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyBundlePreset(preset)}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-all ${
                  selectedPreset === preset.name
                    ? 'bg-[#336699] border-[#336699] text-white'
                    : 'bg-[#252525] border-[#333333] text-gray-300 hover:border-[#444444]'
                }`}
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
        
        {/* Recently Used */}
        {recentCustomizations.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setShowRecentSection(!showRecentSection)}
              className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors mb-2"
            >
              <History className="w-4 h-4" />
              <span>Recently Used</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showRecentSection ? 'rotate-180' : ''}`} />
            </button>
            {showRecentSection && (
              <div className="space-y-1">
                {recentCustomizations.slice(0, 3).map((recent) => (
                  <button
                    key={recent.id}
                    onClick={() => applyRecentCustomization(recent)}
                    className="w-full p-2 text-left bg-[#252525] hover:bg-[#2A2A2A] rounded-md transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{recent.name}</span>
                      <span className="text-xs font-mono text-gray-500">
                        {formatCurrency(recent.totalPrice)} • {recent.totalHours.toFixed(1)}h
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Client Preview Banner */}
        {clientPreviewMode && (
          <div className="mb-3 px-3 py-2 bg-[#EAB308]/10 border border-[#EAB308]/30 rounded-md">
            <p className="text-xs text-[#EAB308] text-center">Client Preview Mode - Costs Hidden</p>
          </div>
        )}
        
        {/* Price & Time Summary */}
        <div className="bg-[#252525] rounded-md px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">Total Price:</span>
              </div>
              {calculateTotalHours() > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-400">Est. Time:</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="font-mono font-semibold text-white">
                  {formatCurrency(calculatePrice())}
                </span>
                <span className="text-xs text-gray-500 ml-1">/{serviceOption.unit}</span>
              </div>
              {calculateTotalHours() > 0 && (
                <div className="text-right">
                  <span className="font-mono font-semibold text-[#EAB308]">
                    {calculateTotalHours().toFixed(1)}h
                  </span>
                </div>
              )}
              {/* Profit Health Indicator */}
              {!clientPreviewMode && (
                <div className="flex items-center gap-2 ml-4">
                  <TrendingUp className={`w-4 h-4 ${getProfitHealth().color}`} />
                  <span className={`text-xs ${getProfitHealth().color}`}>
                    {getProfitHealth().level} Margin
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* Subtotals breakdown */}
          {!clientPreviewMode && (
            <div className="pt-2 border-t border-[#333333]/50 space-y-1">
            {(() => {
              const subtotals = calculateSubtotals();
              return Object.entries(subtotals)
                .filter(([_, value]) => value > 0)
                .map(([category, value]) => (
                  <div key={category} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 capitalize">{category}:</span>
                    <span className="text-gray-400 font-mono">{formatCurrency(value)}</span>
                  </div>
                ));
            })()}
            </div>
          )}
        </div>
      </div>

      {/* Comparison View */}
      {showComparison && (
        <div className="p-4 bg-[#252525] border-b border-[#333333]">
          <div className="grid grid-cols-2 gap-4">
            {/* Original */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">Original</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Price:</span>
                  <span className="font-mono text-gray-400">{formatCurrency(serviceOption.price)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Item Count:</span>
                  <span className="font-mono text-gray-400">{originalItems.length}</span>
                </div>
              </div>
            </div>
            
            {/* Current */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">Customized</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Price:</span>
                  <span className={`font-mono ${calculatePrice() !== serviceOption.price ? 'text-[#EAB308]' : 'text-gray-400'}`}>
                    {formatCurrency(calculatePrice())}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Item Count:</span>
                  <span className={`font-mono ${currentItems.length !== originalItems.length ? 'text-[#EAB308]' : 'text-gray-400'}`}>
                    {currentItems.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Changes Summary */}
          <div className="mt-3 pt-3 border-t border-[#333333]/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Price Difference:</span>
              <span className={`font-mono font-medium ${
                calculatePrice() > serviceOption.price ? 'text-red-400' : 
                calculatePrice() < serviceOption.price ? 'text-green-400' : 
                'text-gray-400'
              }`}>
                {calculatePrice() !== serviceOption.price && (calculatePrice() > serviceOption.price ? '+' : '')}
                {formatCurrency(calculatePrice() - serviceOption.price)}
                {calculatePrice() !== serviceOption.price && ` (${((calculatePrice() - serviceOption.price) / serviceOption.price * 100).toFixed(0)}%)`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Current Items */}
        <div className="w-1/2 border-r border-[#333333] flex flex-col">
          <div className="p-4 border-b border-[#333333]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">Current Items</h3>
              <button
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="text-xs text-gray-400 hover:text-[#336699] transition-colors flex items-center gap-1"
              >
                <span>{showAdvancedOptions ? 'Hide' : 'Show'} advanced options</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {currentItems.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-2">No items in this service package</p>
                <p className="text-xs text-gray-600">Add items from the right panel to customize this service</p>
              </div>
            ) : (
              currentItems.map((item) => (
                <div key={item.id} className="group bg-[#252525] rounded-md p-3 mb-2 hover:bg-[#2A2A2A] transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium">{item.line_item?.name}</p>
                        {isItemModified(item) && (
                          <span className="w-2 h-2 bg-[#EAB308] rounded-full" title="Modified" />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {item.line_item?.cost_code?.name} {!clientPreviewMode && `• ${formatCurrency(item.line_item?.price || 0)}/${item.line_item?.unit}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className={`p-1 transition-colors ${
                        currentItems.length <= 1
                          ? 'text-gray-600 cursor-not-allowed opacity-0 group-hover:opacity-50'
                          : 'text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100'
                      }`}
                      disabled={currentItems.length <= 1}
                      title={currentItems.length <= 1 ? 'At least one item must remain' : 'Remove item'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Quantity and Calc Type */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleQuantityChange(item.id, Math.max(getQuantityStep(item.line_item?.unit), item.quantity - getQuantityStep(item.line_item?.unit)))}
                        className="p-1 bg-[#333333] hover:bg-[#404040] rounded text-gray-400 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item.id, parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 bg-[#333333] border border-[#444444] rounded text-sm text-white text-center focus:border-[#336699] focus:outline-none"
                        step={getQuantityStep(item.line_item?.unit)}
                      />
                      <button
                        onClick={() => handleQuantityChange(item.id, item.quantity + getQuantityStep(item.line_item?.unit))}
                        className="p-1 bg-[#333333] hover:bg-[#404040] rounded text-gray-400 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {showAdvancedOptions ? (
                      <select
                        value={item.calculation_type}
                        onChange={(e) => handleCalcTypeChange(item.id, e.target.value as any)}
                        className="flex-1 px-2 py-1 bg-[#333333] border border-[#444444] rounded text-sm text-white"
                      >
                        <option value="multiply">Per {serviceOption.unit}</option>
                        <option value="fixed">Fixed Amount</option>
                        <option value="per_unit">Per Unit</option>
                      </select>
                    ) : (
                      <div className="flex-1 px-2 py-1 text-sm text-gray-400">
                        {item.calculation_type === 'fixed' ? 'Fixed Amount' : 
                         item.calculation_type === 'per_unit' ? 'Per Unit' : 
                         `Per ${serviceOption.unit}`}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available Items */}
        {!clientPreviewMode ? (
          <div className="w-1/2 flex flex-col">
          <div className="p-4 border-b border-[#333333]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-300">Available Items</h3>
                {availableItems.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 bg-[#252525] text-gray-400 rounded">
                    {filteredItems.length} of {availableItems.length}
                  </span>
                )}
              </div>
              {/* Temporarily removed the show all button until we fix the filtering */}
            </div>
            
            
            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 py-2 bg-[#252525] border border-[#333333] rounded-md text-sm text-white placeholder-gray-500 ${
                  searchQuery ? 'pr-10' : 'pr-3'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            
            {/* Category Filter */}
            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  try {
                    localStorage.setItem('service-option-filter-category', e.target.value);
                  } catch {}
                }}
                className="w-full px-3 py-2 bg-[#252525] border border-[#333333] rounded-md text-sm text-white hover:border-[#444444] focus:border-[#336699] focus:outline-none focus:ring-1 focus:ring-[#336699]/20 transition-colors"
              >
                <option value="all">All Categories ({availableItems.length})</option>
                {categories.map(cat => {
                  const count = availableItems.filter(item => item.cost_code?.category === cat).length;
                  return (
                    <option key={cat} value={cat}>
                      {cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : ''} ({count})
                    </option>
                  );
                })}
              </select>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {isLoading ? (
              <p className="text-sm text-gray-500 text-center py-8">Loading...</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No items found
              </p>
            ) : (
              <>
                {filteredItems.map((item, index) => {
                  const isAlreadyIncluded = currentItems.some(ci => ci.line_item?.id === item.id);
                  const isSelected = index === selectedItemIndex;
                  
                  return (
                    <div 
                      key={item.id}
                      data-item-index={index}
                      className={`group bg-[#1F1F1F] rounded p-2 mb-1 hover:bg-[#252525] transition-all cursor-pointer ${
                        isAlreadyIncluded ? 'opacity-50' : ''
                      } ${isSelected ? 'ring-1 ring-[#336699] bg-[#252525]' : ''}`}
                      onClick={() => setSelectedItemIndex(index)}
                      onDoubleClick={() => {
                        if (!isAlreadyIncluded) {
                          handleAddItem(item);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-white truncate">{item.name}</p>
                            {isAlreadyIncluded && (
                              <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            <span className="font-mono text-gray-600">{item.cost_code?.code || ''}</span> • {item.cost_code?.name || ''} • {formatCurrency(item.price)}/{item.unit}
                          </p>
                        </div>
                        <Plus className={`w-3 h-3 ${isSelected ? 'text-[#336699] opacity-100' : 'text-[#336699] opacity-50 group-hover:opacity-100'} ml-2 flex-shrink-0`} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
          
          {/* Keyboard navigation hint */}
          {filteredItems.length > 0 && (
            <div className="px-3 py-2 border-t border-[#333333] text-xs text-gray-500 text-center">
              Use ↑↓ to navigate • Enter to add • Double-click to add
            </div>
          )}
        </div>
        ) : (
          <div className="w-1/2 flex items-center justify-center bg-[#1A1A1A] border-l border-[#333333]">
            <div className="text-center p-8">
              <EyeOff className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Item details hidden in client view</p>
              <button
                onClick={() => setClientPreviewMode(false)}
                className="mt-4 px-4 py-2 bg-[#252525] hover:bg-[#333333] text-white rounded-md transition-colors text-sm"
              >
                Exit Client View
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#333333] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
          
          {currentHistoryIndex > 0 && (
            <button
              onClick={handleUndo}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </button>
          )}
          
          {currentHistoryIndex < changesHistory.length - 1 && (
            <button
              onClick={handleRedo}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <Redo2 className="w-4 h-4" />
              Redo
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {showSuccessMessage && (
            <div className="flex items-center gap-2 text-green-400 animate-pulse">
              <Check className="w-4 h-4" />
              <span className="text-sm">Saved!</span>
            </div>
          )}
          {errorMessage && (
            <div className="flex items-center gap-2 text-red-400">
              <X className="w-4 h-4" />
              <span className="text-sm">{errorMessage}</span>
            </div>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#252525] hover:bg-[#333333] text-white rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || showSuccessMessage}
            className="px-4 py-2 bg-[#EAB308] hover:bg-[#D97706] text-black rounded-md transition-colors flex items-center gap-2 disabled:opacity-50 font-medium"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : showSuccessMessage ? 'Saved!' : 'Save Customization'}
          </button>
        </div>
      </div>
      
    </div>
    </>
  );
};