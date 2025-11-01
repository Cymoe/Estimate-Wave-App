import React, { useState, useEffect, useContext } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';
import { Search, Plus, Minus, X, Save, Package, ArrowRight, CheckCircle, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { EstimateTableView } from './EstimateTableView';
import { ContextualPricingSelector } from './ContextualPricingSelector';
import { ClientSelector } from './ClientSelector';
import { NewClientModal } from '../clients/NewClientModal';
// import { ServiceCatalogService } from '../../services/ServiceCatalogService'; // Removed - using line items only
import { LineItemService } from '../../services/LineItemService';

interface EstimateItem {
  product_id: string;
  product_name?: string;
  quantity: number;
  price: number;
  description?: string;
  unit?: string;
  is_service?: boolean;
  service_items?: any[];
  line_item_count?: number;
  service_data?: any;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  total_amount: number;
  created_at?: string;
  content?: {
    description?: string;
    total_amount?: number;
  };
  items?: Array<{
    product_id: string;
    quantity: number;
    price: number;
    description?: string;
    product?: any;
  }>;
  category_id?: string;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  type: string;
  category?: string;
  is_base_product: boolean;
  items?: any[];
  trade_id?: string;
  cost_code?: {
    id: string;
    code: string;
    name: string;
    category?: string;
  };
}

interface Client {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  discount_percentage?: number;
}

interface Trade {
  id: string;
  name: string;
}


interface EstimateFormData {
  client_id: string;
  items: EstimateItem[];
  total_amount: number;
  description: string;
  valid_until: string;
  status: string;
  issue_date: string;
  title?: string;
  terms?: string;
  notes?: string;
  subtotal?: number;
  discount_percentage?: number;
  discount_amount?: number;
  additional_discount_percentage?: number;
  additional_discount_amount?: number;
  discount_reason?: string;
}

interface CreateEstimateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EstimateFormData) => void;
  editingEstimate?: any; // Estimate being edited
  projectContext?: {
    projectId: string;
    clientId: string;
    projectName: string;
    projectBudget: number;
    projectType?: string;
    packageLevel?: string;
    packageId?: string;
  };
  preloadedItems?: EstimateItem[]; // Pre-populated items from cart
  useCleanView?: boolean; // Use clean table view instead of sidebar layout
}

export const CreateEstimateDrawer: React.FC<CreateEstimateDrawerProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEstimate,
  projectContext,
  preloadedItems,
  useCleanView = false
}) => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [sourceType, setSourceType] = useState<'scratch' | 'template' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Concrete & Masonry', 'Fencing & Gates', 'Turf & Landscaping'])); // Start with main cost code categories expanded
  const [allExpanded, setAllExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [projectCategory, setProjectCategory] = useState<string | null>(null);
  
  // Form data
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [estimateTitle, setEstimateTitle] = useState('');
  const [estimateDescription, setEstimateDescription] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [selectedItems, setSelectedItems] = useState<EstimateItem[]>([]);
  const [estimateNumber, setEstimateNumber] = useState('');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  
  // Validity period in days
  const [validityDays, setValidityDays] = useState(30);
  
  // Estimate-level discount
  const [additionalDiscount, setAdditionalDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  
  // Data
  const [clients, setClients] = useState<Client[]>([]);
  // Services removed - using line items only
  const [lineItems, setLineItems] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [addedTemplateId, setAddedTemplateId] = useState<string | null>(null);
  const [showPricingSelector, setShowPricingSelector] = useState(false);
  const [viewMode, setViewMode] = useState<'clean' | 'sidebar'>('sidebar');
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  useEffect(() => {
    // Only load data when drawer opens and we have a valid organization
    if (isOpen && user && selectedOrg?.id && selectedOrg.name !== 'Loading...') {
      loadData();
    }
  }, [isOpen, user?.id, selectedOrg?.id, projectCategory, editingEstimate]);

  // Load estimate data when editing - but only after data is loaded
  useEffect(() => {
    if (isOpen && editingEstimate) {
      console.log('Setting form data from editing estimate:', {
        estimateId: editingEstimate.id
      });
      
      // Set form data from existing estimate
      setSelectedClient(editingEstimate.client_id || '');
      setEstimateTitle(editingEstimate.title || '');
      setEstimateDescription(editingEstimate.description || '');
      setIssueDate(editingEstimate.issue_date ? editingEstimate.issue_date.split('T')[0] : new Date().toISOString().split('T')[0]);
      setValidUntil(editingEstimate.valid_until ? editingEstimate.valid_until.split('T')[0] : '');
      setTerms(editingEstimate.terms || '');
      setNotes(editingEstimate.notes || '');
      setAdditionalDiscount(editingEstimate.additional_discount_percentage || 0);
      setDiscountReason(editingEstimate.discount_reason || '');
      
      // Load estimate items
      loadEstimateItems();
    }
  }, [isOpen, editingEstimate]);

  // Handle project context
  useEffect(() => {
    if (isOpen && projectContext && !editingEstimate) {
      // Pre-fill with project information
      if (projectContext.clientId) {
        setSelectedClient(projectContext.clientId);
      }
      if (projectContext.projectName) {
        setEstimateTitle(`Estimate for ${projectContext.projectName}`);
      }
      // Set source type to scratch to show the items selection
      setSourceType('scratch');
    }
  }, [isOpen, projectContext, editingEstimate]);

  // Handle preloaded items from cart
  useEffect(() => {
    if (isOpen && preloadedItems && preloadedItems.length > 0 && !editingEstimate) {
      console.log('Loading preloaded items:', preloadedItems);
      // Process preloaded items - services removed, all are line items now
      const processedItems = preloadedItems;
      setSelectedItems(processedItems);
      setSourceType('scratch'); // Use scratch mode when we have preloaded items
    }
  }, [isOpen, preloadedItems, editingEstimate]);

  // Load project category when project context is provided
  useEffect(() => {
    if (isOpen && projectContext?.projectId && user && selectedOrg?.id) {
      loadProjectCategory();
    }
  }, [isOpen, projectContext?.projectId, user, selectedOrg?.id]);

  // Auto-calculate validity date based on days
  useEffect(() => {
    if (issueDate && validityDays) {
      const issue = new Date(issueDate);
      const valid = new Date(issue);
      valid.setDate(valid.getDate() + validityDays);
      setValidUntil(valid.toISOString().split('T')[0]);
    }
  }, [issueDate, validityDays]);


  // Generate estimate number when opening
  useEffect(() => {
    if (isOpen && !editingEstimate && !estimateNumber) {
      generateEstimateNumber();
    }
  }, [isOpen, editingEstimate]);

  // Initialize expand all state based on device type and user preference
  useEffect(() => {
    if (!isOpen || !lineItems.length) return;
    
    // Check if it's a tablet/iPad based on screen width
    const isTablet = window.innerWidth >= 768; // iPad minimum width
    
    // Get user preference from localStorage
    const savedPreference = localStorage.getItem('estimate-drawer-expanded-all');
    
    // Default to expanded on tablets, collapsed on mobile
    const shouldExpandAll = savedPreference !== null 
      ? savedPreference === 'true' 
      : isTablet;
    
    // Calculate category names here to avoid dependency issues
    const categoryNames = Array.from(new Set(
      lineItems.map(item => item.cost_code?.name || 'Other')
    )).sort((a, b) => {
      if (a === 'Other' && b !== 'Other') return 1;
      if (b === 'Other' && a !== 'Other') return -1;
      return a.localeCompare(b);
    });
    
    if (shouldExpandAll && categoryNames.length > 0) {
      setExpandedCategories(new Set(categoryNames));
      setAllExpanded(true);
    } else {
      // Keep the default partially expanded state for mobile
      setAllExpanded(false);
    }
  }, [isOpen, lineItems.length]);

  const generateEstimateNumber = async () => {
    // Professional fallback: Use current year and timestamp
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const timestamp = Date.now().toString().slice(-6);
    const generatedNumber = `EST-${currentYear}-${timestamp}`;
    
    setEstimateNumber(generatedNumber);
  };

  const loadEstimateItems = async () => {
    if (!editingEstimate || !user) return;
    
    try {
      const { data: items, error } = await supabase
        .from('estimate_items')
        .select('*, product:products(*)')
        .eq('estimate_id', editingEstimate.id);
        
      if (error) throw error;
      
      const estimateItems: EstimateItem[] = (items || []).map(item => ({
        product_id: item.product_id,
        product_name: item.product?.name || 'Unknown Item',
        quantity: item.quantity,
        price: item.price || item.unit_price || item.product?.price || 0,
        unit: item.product?.unit || 'ea',
        description: item.description || item.product?.description
      }));
      
      setSelectedItems(estimateItems);
      setSourceType('scratch'); // Default to scratch mode when editing
    } catch (error) {
      console.error('Error loading estimate items:', error);
    }
  };

  const loadProjectCategory = async () => {
    if (!projectContext?.projectId) return;
    
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('category_id')
        .eq('id', projectContext.projectId)
        .single();
        
      if (error) throw error;
      
      setProjectCategory(project?.category_id || null);
    } catch (error) {
      console.error('Error loading project category:', error);
    }
  };


  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Get organization ID - fallback to localStorage if context not ready
      let orgId = selectedOrg.id;
      if (!orgId || selectedOrg.name === 'Loading...') {
        orgId = localStorage.getItem('selectedOrgId') || '';
        console.log('Using fallback organization ID from localStorage:', orgId);
      }
      
      if (!orgId) {
        console.error('No organization ID available');
        setIsLoading(false);
        return;
      }
      
      // Build base queries array
      const queries = [
        supabase.from('clients').select('*').eq('organization_id', orgId)
      ];

      // Load organization's selected industries first
      const { data: orgIndustries, error: indError } = await supabase
        .from('organization_industries')
        .select('industry_id, industries(id, name)')
        .eq('organization_id', orgId);
      
      if (indError) {
        console.error('Error loading organization industries:', indError);
      }
      
      // Get industry IDs for filtering
      const industryIds = orgIndustries?.map(oi => oi.industry_id) || [];
      
      // Note: We'll use invoice templates for now until estimate templates are created
      console.log('Loading templates for org:', orgId, 'with industries:', industryIds);
      
      let templateQuery = supabase.from('invoice_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Filter templates by organization's selected industries
      if (industryIds.length > 0) {
        templateQuery = templateQuery.in('industry_id', industryIds);
      }
      
      console.log('Template query built with industry filtering');
      
      // If we have a project category, filter templates by it
      if (projectCategory) {
        templateQuery = templateQuery.eq('category_id', projectCategory);
      }
      
      // Execute all queries including the template query
      const [clientsRes, templatesRes] = await Promise.all([
        ...queries,
        templateQuery
      ]);
      console.log('Template query executed, result:', templatesRes);

      if (clientsRes.error) throw clientsRes.error;
      if (templatesRes.error) {
        console.error('Templates error:', templatesRes.error);
        console.error('Full templatesRes:', templatesRes);
      }
      
      console.log('Templates query result data:', templatesRes.data);
      console.log('Organization industries:', orgIndustries?.map(oi => (oi as any).industries?.name));
      console.log('Filtered templates count:', templatesRes.data?.length || 0);
      console.log('Templates query result count:', templatesRes.data?.length);
      
      // Load line items for organization
      let lineItemsData: any[] = [];
      try {
        lineItemsData = await LineItemService.list(orgId);
      } catch (error) {
        console.error('Error loading line items:', error);
      }
      
      // Load service templates using ServiceCatalogService
      let servicesData: any[] = [];
      try {
        // Get bundle items from line_items instead
        const { data } = await supabase
          .from('line_items')
          .select('*')
          .eq('is_bundle', true)
          .order('name');
        servicesData = data || [];
        console.log('Loaded services:', servicesData.length);
      } catch (error) {
        console.error('Error loading services:', error);
      }
      
      // Process line items - convert to Product format for compatibility
      const allLineItems = lineItemsData.map((item: any) => ({
        ...item,
        // Price is already resolved based on project context
        unit: item.unit || 'ea',
        trade_id: item.trade_id || null,
        // Add category from cost code
        type: item.cost_code?.category || 'material'
      }));
      
      // Process templates and fetch their items separately
      let processedTemplates: Template[] = [];
      if (templatesRes.data && templatesRes.data.length > 0) {
        console.log('Processing templates, fetching items for:', templatesRes.data.map(t => t.id));
        // Fetch items for all templates - these don't have line_item references
        const { data: allTemplateItems, error: itemsError } = await supabase
          .from('invoice_template_items')
          .select('*')
          .in('template_id', templatesRes.data.map(t => t.id));
          
        console.log('Template items result:', allTemplateItems);
        if (itemsError) {
          console.error('Template items error:', itemsError);
        }
        
        processedTemplates = templatesRes.data.map(template => {
          // Find items for this template
          const templateItems = allTemplateItems?.filter(item => item.template_id === template.id) || [];
          
          // Calculate total from items if not in content
          const itemsTotal = templateItems.reduce((sum: number, item: any) => 
            sum + (item.price * item.quantity), 0) || 0;
          
          return {
            ...template,
            description: template.content?.description || '',
            total_amount: template.content?.total_amount || itemsTotal,
            items: templateItems
          };
        });
      }
      
      setClients(clientsRes.data || []);
      // Services removed - bundles are in line_items now
      setLineItems(allLineItems as Product[]);
      setTemplates(processedTemplates);
      
      // Debug logging
      console.log('CreateEstimateDrawer - Data loaded:', {
        organizationId: orgId,
        clients: clientsRes.data?.length || 0,
        lineItems: allLineItems.length,
        templates: processedTemplates.length
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = (template: Template) => {
    console.log('Template selected:', template);
    console.log('Template items:', template.items);
    
    // Add template items to existing items
    if (template.items && template.items.length > 0) {
      const newItems: EstimateItem[] = template.items.map((item, index) => {
        // Template items don't have line_item references, just price and quantity
        return {
          product_id: `template-item-${template.id}-${index}`,
          product_name: `Template Item ${index + 1}`,
          quantity: item.quantity,
          price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0)),
          unit: 'ea',
          description: `From template: ${template.name}`
        };
      });
      console.log('Adding items to estimate:', newItems);
      // Add to existing items
      setSelectedItems([...selectedItems, ...newItems]);
      
      // Show feedback
      setAddedTemplateId(template.id);
      setTimeout(() => setAddedTemplateId(null), 2000);
    } else {
      console.log('No items in template to add');
      // Still show feedback even if no items
      setAddedTemplateId(template.id);
      setTimeout(() => setAddedTemplateId(null), 2000);
    }
  };


  const addLineItem = (item: Product) => {
    setSelectedItems([...selectedItems, {
      product_id: item.id,
      product_name: item.name,
      quantity: 1,
      price: item.price,
      unit: item.unit,
      description: item.description
    }]);
  };

  const handleAddItemsFromSelector = (items: any[]) => {
    const newItems: EstimateItem[] = items.map(item => ({
      product_id: item.lineItemId,
      product_name: item.name,
      quantity: item.quantity,
      price: item.price,
      unit: item.unit,
      description: item.description
    }));
    setSelectedItems([...selectedItems, ...newItems]);
    setShowPricingSelector(false);
  };

  const handleUpdateItemQuantity = (itemId: string, quantity: number) => {
    const index = selectedItems.findIndex(item => item.product_id === itemId);
    if (index >= 0) {
      updateItemQuantity(index, quantity);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    const index = selectedItems.findIndex(item => item.product_id === itemId);
    if (index >= 0) {
      removeItem(index);
    }
  };

  const removeItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) return;
    const updated = [...selectedItems];
    updated[index].quantity = quantity;
    setSelectedItems(updated);
  };


  const calculateSubtotal = () => {
    return selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const getClientDiscount = () => {
    if (!selectedClient) return 0;
    const client = clients.find(c => c.id === selectedClient);
    return client?.discount_percentage || 0;
  };

  const calculateCustomerDiscount = () => {
    const subtotal = calculateSubtotal();
    const discountPercentage = getClientDiscount();
    return subtotal * (discountPercentage / 100);
  };

  const calculateAdditionalDiscount = () => {
    const subtotal = calculateSubtotal();
    const customerDiscount = calculateCustomerDiscount();
    // Apply additional discount to the already discounted amount
    const afterCustomerDiscount = subtotal - customerDiscount;
    return afterCustomerDiscount * (additionalDiscount / 100);
  };

  const calculateTotalDiscount = () => {
    return calculateCustomerDiscount() + calculateAdditionalDiscount();
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const totalDiscount = calculateTotalDiscount();
    return subtotal - totalDiscount;
  };

  const handleSave = async () => {
    console.log('🚀 HANDLE SAVE CALLED!');
    console.log('🔍 Selected items:', selectedItems);
    console.log('📊 Selected items length:', selectedItems.length);
    console.log('👤 Selected client:', selectedClient);
    console.log('📝 Estimate title:', estimateTitle);
    console.log('📅 Issue date:', issueDate);
    
    // Only require items for initial creation - everything else can be filled later
    if (selectedItems.length === 0) {
      console.log('❌ No items selected - showing alert');
      alert('Please add at least one item to the estimate.');
      return;
    }
    
    console.log('✅ Items validation passed, proceeding with save...');

    const formData: EstimateFormData = {
      client_id: selectedClient || '', // Allow empty - can be filled later
      items: selectedItems,
      total_amount: calculateTotal(),
      title: estimateTitle || `Estimate ${Date.now().toString().slice(-6)}`, // Auto-generate if empty
      description: estimateDescription,
      valid_until: validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default 30 days
      status: 'draft',
      issue_date: issueDate,
      terms: terms,
      notes: notes,
      // Include discount information
      subtotal: calculateSubtotal(),
      discount_percentage: getClientDiscount(),
      discount_amount: calculateCustomerDiscount(),
      additional_discount_percentage: additionalDiscount,
      additional_discount_amount: calculateAdditionalDiscount(),
      discount_reason: discountReason
    };

    // Enhanced data with estimate number
    const enhancedFormData = {
      ...formData,
      estimate_number: estimateNumber || `EST-${Date.now().toString().slice(-6)}`,
      validity_days: validityDays,
      // Add professional metadata
      created_via: 'professional_drawer',
      template_used: sourceType === 'template'
    };

    setIsSaving(true);
    try {
      console.log('Saving enhanced estimate:', enhancedFormData);
      await onSave(enhancedFormData);
      handleClose();
    } catch (error) {
      console.error('Error saving estimate:', error);
      alert('Failed to save estimate. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewClientSave = async (clientData: any) => {
    try {
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert([{
          ...clientData,
          organization_id: selectedOrg?.id
        }])
        .select()
        .single();

      if (error) throw error;

      // Add to clients list and select the new client
      setClients(prev => [...prev, newClient]);
      setSelectedClient(newClient.id);
      setShowNewClientModal(false);
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Failed to create client. Please try again.');
    }
  };

  const handleClose = () => {
    // Reset form
    setSourceType(null);
    setSelectedClient('');
    setEstimateTitle('');
    setEstimateDescription('');
    setIssueDate(new Date().toISOString().split('T')[0]);
    setValidUntil('');
    setSelectedItems([]);
    setSearchTerm('');
    setAddedTemplateId(null);
    setEstimateNumber('');
    setTerms('');
    setNotes('');
    setValidityDays(30);
    setAdditionalDiscount(0);
    setDiscountReason('');
    setShowNewClientModal(false);
    
    onClose();
  };

  // Filter logic

  const filteredLineItems = lineItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );


  // Group line items by cost code name (like PriceBook does)
  const groupedLineItems = filteredLineItems.reduce((groups, item) => {
    // Get category from cost code name if available, fallback to 'Other'
    const categoryName = item.cost_code?.name || 'Other';
    
    if (!groups[categoryName]) {
      groups[categoryName] = [];
    }
    groups[categoryName].push(item);
    return groups;
  }, {} as Record<string, Product[]>);

  // Sort category names alphabetically (like PriceBook)
  const sortedCategoryNames = Object.keys(groupedLineItems).sort((a, b) => {
    // Put 'Other' last
    if (a === 'Other' && b !== 'Other') return 1;
    if (b === 'Other' && a !== 'Other') return -1;
    return a.localeCompare(b);
  });
  
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
    
    // Update allExpanded state based on whether all categories are expanded
    const allCategoriesExpanded = sortedCategoryNames.every(cat => newExpanded.has(cat));
    setAllExpanded(allCategoriesExpanded);
    
    // Update localStorage to reflect the new state
    localStorage.setItem('estimate-drawer-expanded-all', allCategoriesExpanded.toString());
  };

  // Toggle all categories expanded/collapsed
  const toggleAllCategories = () => {
    if (allExpanded) {
      // Collapse all
      setExpandedCategories(new Set());
      setAllExpanded(false);
      localStorage.setItem('estimate-drawer-expanded-all', 'false');
    } else {
      // Expand all
      setExpandedCategories(new Set(sortedCategoryNames));
      setAllExpanded(true);
      localStorage.setItem('estimate-drawer-expanded-all', 'true');
    }
  };

  // Categories removed - line items don't have type field

  // If clean view mode, show the clean table view
  if (viewMode === 'clean' && sourceType === 'scratch') {
    return (
      <>
        {/* Backdrop with blur effect */}
        <div
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={handleClose}
        />

        {/* Clean View Drawer */}
        <div
          className={`fixed right-0 top-0 h-full w-[90%] max-w-[1400px] bg-[#1D1F25] shadow-xl transform transition-transform z-[10001] ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Header */}
          <div className="bg-[#1a1a1a] border-b border-[#333333] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold text-white">
                    {editingEstimate ? 'Edit Estimate' : 'New Estimate'}
                  </h1>
                  {projectContext?.projectType && (
                    <p className="text-sm text-gray-400 mt-0.5">
                      {projectContext.projectType} • {projectContext.packageLevel || 'Custom'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewMode('sidebar')}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Switch to Classic View
                </button>
                <button
                  onClick={handleSave}
                  disabled={selectedItems.length === 0 || isSaving}
                  className="px-6 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Estimate'}
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex flex-col h-[calc(100%-80px)] overflow-hidden">
            {/* Client & Project Info Bar */}
            <div className="px-6 py-4 bg-[#22272d] border-b border-[#333333]">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-white mb-2">
                    Who is this estimate for? *
                  </label>
                  <div className="space-y-2">
                    <ClientSelector
                      clients={clients.map(client => ({
                        id: client.id,
                        name: client.name,
                        company_name: client.company_name || client.name,
                        email: client.email,
                        phone: client.phone,
                        address: client.address,
                        discount_percentage: client.discount_percentage
                      }))}
                      value={selectedClient}
                      onChange={setSelectedClient}
                      onAddNewClient={() => setShowNewClientModal(true)}
                      onClientCreated={(newClient) => {
                        setClients(prev => [...prev, newClient]);
                      }}
                      placeholder="Select a client..."
                    />
                    <button
                      onClick={() => setShowNewClientModal(true)}
                      className="w-full px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2a5a8a] transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add New Client
                    </button>
                  </div>
                  
                  {/* Client Preview/Summary Section */}
                  {selectedClient && (() => {
                    const client = clients.find(c => c.id === selectedClient);
                    return client ? (
                      <div className="mt-3 p-3 bg-[#1a1a1a] border border-[#444444] rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-medium text-white">
                                {client.company_name || client.name}
                              </h4>
                              {client.discount_percentage && client.discount_percentage > 0 && (
                                <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-medium">
                                  {client.discount_percentage}% discount
                                </span>
                              )}
                            </div>
                            {client.name !== (client.company_name || client.name) && (
                              <p className="text-xs text-gray-400 mb-1">Contact: {client.name}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              {client.email && <span>{client.email}</span>}
                              {client.phone && <span>{client.phone}</span>}
                            </div>
                            {client.address && (
                              <p className="text-xs text-gray-400 mt-1">{client.address}</p>
                            )}
                          </div>
                          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        </div>
                        {client.discount_percentage && client.discount_percentage > 0 && (
                          <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded text-xs text-green-400">
                            Good customer discount will be automatically applied to this estimate
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Estimate Title *
                  </label>
                  <input
                    type="text"
                    value={estimateTitle}
                    onChange={(e) => setEstimateTitle(e.target.value)}
                    placeholder="e.g., Bathroom Renovation"
                    className="w-full px-3 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:outline-none focus:border-[#336699]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Valid For
                  </label>
                  <select
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:outline-none focus:border-[#336699]"
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Table View */}
            <div className="flex-1 overflow-y-auto p-6">
              <EstimateTableView
                items={selectedItems.map(item => ({
                  id: item.product_id,
                  ...item,
                  name: item.product_name,
                  subtotal: item.price * item.quantity
                }))}
                onUpdateQuantity={handleUpdateItemQuantity}
                onRemoveItem={handleRemoveItem}
                onAddItems={() => setShowPricingSelector(true)}
                isEditable={true}
                showTotals={true}
                subtotal={calculateSubtotal()}
                discount={calculateTotalDiscount()}
                total={calculateTotal()}
              />
            </div>
          </div>
        </div>

        {/* Contextual Pricing Selector */}
        <ContextualPricingSelector
          isOpen={showPricingSelector}
          onClose={() => setShowPricingSelector(false)}
          onAddItems={handleAddItemsFromSelector}
          organizationId={selectedOrg?.id || ''}
          projectContext={{
            projectType: projectContext?.projectType,
            packageLevel: projectContext?.packageLevel,
            packageId: projectContext?.packageId,
            industryId: projectCategory || undefined
          }}
        />

        {/* New Client Modal */}
        {showNewClientModal && (() => {
          console.log('Rendering NewClientModal, showNewClientModal:', showNewClientModal);
          return (
            <NewClientModal
              onClose={() => setShowNewClientModal(false)}
              onSave={handleNewClientSave}
            />
          );
        })()}
      </>
    );
  }

  // Original sidebar view
  return (
    <>
      {/* Backdrop with blur effect */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-[80%] max-w-[1200px] bg-[#121212] shadow-xl transform transition-transform z-[10001] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Compact Header */}
        <div className="bg-[#1E1E1E] border-b border-[#333333] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-semibold">{editingEstimate ? 'Edit Estimate' : 'Create Estimate'}</h1>
            </div>
            <button
              onClick={handleSave}
              disabled={selectedItems.length === 0 || isSaving}
              className="px-4 py-1.5 bg-[#336699] text-white rounded-[4px] hover:bg-[#2A5580] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
            >
              <Save className="w-3 h-3" />
              {isSaving ? (editingEstimate ? 'Updating...' : 'Creating...') : (editingEstimate ? 'Update Estimate' : 'Create Estimate')}
            </button>
          </div>
        </div>

        {/* Client Selection Bar - Always Visible */}
        <div className="px-4 py-3 border-b border-[#333333] bg-[#1A1A1A] flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-white mb-2">
                Client for this Estimate
              </label>
              <ClientSelector
                clients={clients.map(client => ({
                  id: client.id,
                  name: client.name,
                  company_name: client.company_name || client.name,
                  email: client.email,
                  phone: client.phone,
                  address: client.address,
                  discount_percentage: client.discount_percentage
                }))}
                value={selectedClient}
                onChange={setSelectedClient}
                onAddNewClient={() => setShowNewClientModal(true)}
                onClientCreated={(newClient) => {
                  setClients(prev => [...prev, newClient]);
                }}
                placeholder="Select a client..."
              />
            </div>
            
            {/* Client Preview - Inline */}
            {selectedClient && (() => {
              const client = clients.find(c => c.id === selectedClient);
              return client ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-[#1E1E1E] border border-[#333333] rounded-lg">
                  <div className="w-6 h-6 bg-[#336699] rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </div>
                  <div className="text-sm text-white font-medium">
                    {client.company_name || client.name}
                  </div>
                  {client.discount_percentage && client.discount_percentage > 0 && (
                    <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-xs font-medium">
                      {client.discount_percentage}%
                    </span>
                  )}
                </div>
              ) : null;
            })()}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex h-[calc(100%-120px)]">
          {/* Left Column - Items Selection (40% width) */}
          <div className="w-[40%] border-r border-[#333333] flex flex-col">
            {/* Source Type Selection */}
            {!sourceType && !editingEstimate && (
              <div className="p-4 border-b border-[#333333]">
                <p className="text-sm text-gray-400 mb-3">Choose how to create your estimate:</p>
                <div className="space-y-3">
                  <button
                    onClick={() => setSourceType('scratch')}
                    className="w-full p-3 bg-[#333333] hover:bg-[#404040] border border-[#555555] rounded-[4px] text-left transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Plus className="w-5 h-5 text-gray-400 group-hover:text-[#336699]" />
                        <div>
                          <div className="text-sm font-medium text-white">Start from Scratch</div>
                          <div className="text-xs text-gray-400">Build your estimate item by item</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#336699]" />
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setSourceType('template')}
                    className="w-full p-3 bg-[#333333] hover:bg-[#404040] border border-[#555555] rounded-[4px] text-left transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-gray-400 group-hover:text-[#F9D71C]" />
                        <div>
                          <div className="text-sm font-medium text-white">Use a Template</div>
                          <div className="text-xs text-gray-400">Start with saved templates</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#F9D71C]" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Items Selection */}
            {(sourceType === 'scratch' || editingEstimate) && (
              <>
                {/* Back to options button */}
                {!editingEstimate && (
                  <div className="p-3 pb-0">
                    <button
                      onClick={() => setSourceType(null)}
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-3"
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" />
                      Back to options
                    </button>
                  </div>
                )}
                
                {/* No tabs needed - only line items now */}

                {/* Search and Filters - iPad optimized */}
                <div className="p-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search line items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-[#333333] border border-[#555555] rounded-lg text-base text-white placeholder-gray-400 focus:outline-none focus:border-[#336699] focus:ring-2 focus:ring-[#336699]/20"
                    />
                  </div>
                  
                  {/* Expand All / Collapse All Button */}
                  <button
                    onClick={toggleAllCategories}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#555555] rounded-lg text-sm text-gray-300 hover:text-white transition-all duration-200 active:bg-[#3A3A3A]"
                  >
                    {allExpanded ? (
                      <>
                        <div className="flex items-center">
                          <ChevronRight className="w-4 h-4" />
                          <ChevronRight className="w-4 h-4 -ml-2" />
                        </div>
                        <span>Collapse All Categories</span>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center">
                          <ChevronDown className="w-4 h-4" />
                          <ChevronDown className="w-4 h-4 -ml-2" />
                        </div>
                        <span>Expand All Categories</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699]"></div>
                    </div>
                  ) : (
                    filteredLineItems.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        {searchTerm ? 'No items found' : (
                          <div>
                            <p className="mb-2">No line items available</p>
                            <p className="text-xs">Create line items in the Price Book first</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {sortedCategoryNames.map(categoryName => (
                          <div key={categoryName} className="border-b border-[#2A2A2A]">
                            {/* Category Header - iPad optimized with larger touch target */}
                            <div 
                              className="sticky top-0 bg-[#2A2A2A] hover:bg-[#333333] border-b border-[#336699]/30 px-4 py-4 z-10 cursor-pointer transition-colors"
                              onClick={() => toggleCategory(categoryName)}
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-3">
                                  {expandedCategories.has(categoryName) ? (
                                    <ChevronDown className="w-5 h-5" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5" />
                                  )}
                                  {categoryName} 
                                  <span className="text-gray-500 font-normal">({groupedLineItems[categoryName].length})</span>
                                </h4>
                              </div>
                            </div>
                            
                            {/* Category Items - iPad optimized with larger touch targets */}
                            {expandedCategories.has(categoryName) && (
                              <div className="divide-y divide-[#2A2A2A]">
                                {groupedLineItems[categoryName].map(item => (
                                <div
                                  key={item.id}
                                  className="px-4 py-4 bg-[#333333] hover:bg-[#404040] cursor-pointer transition-colors group active:bg-[#4A4A4A]"
                                  onClick={() => addLineItem(item)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-base text-white font-medium">
                                        {item.name}
                                      </div>
                                      {item.cost_code && (
                                        <div className="text-sm text-gray-500 mt-1">[{item.cost_code.code}]</div>
                                      )}
                                      {item.description && (
                                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                                      )}
                                    </div>
                                    <div className="text-right ml-4 flex-shrink-0">
                                      <div className="font-mono text-lg font-semibold text-white">
                                        {formatCurrency(item.price)}
                                      </div>
                                      <div className="text-sm text-gray-400">per {item.unit}</div>
                                      <div className="text-sm text-[#336699] font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        + Add Item
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </>
            )}

            {/* Template Selection */}
            {sourceType === 'template' && (
              <>
                <div className="p-3 flex-shrink-0">
                  {/* Back button */}
                  <button
                    onClick={() => setSourceType(null)}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-3"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                    Back to options
                  </button>
                  
                  {/* Search */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search templates..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                    />
                  </div>

                  {/* Category notice if filtered */}
                  {projectCategory && (
                    <div className="mb-3 p-2 bg-[#336699]/10 border border-[#336699]/30 rounded-[4px]">
                      <p className="text-xs text-[#336699]">
                        Showing templates for this project's category
                      </p>
                    </div>
                  )}
                </div>

                  {/* Templates List */}
                  <div className="flex-1 overflow-y-auto px-3 pb-3">
                    <div className="space-y-2">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699]"></div>
                      </div>
                    ) : filteredTemplates.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm space-y-2">
                        {searchTerm ? (
                          'No templates found matching your search'
                        ) : projectCategory ? (
                          'No templates for this project category'
                        ) : (
                          <>
                            <div>No templates available for your selected industries</div>
                            <div className="text-xs text-gray-500 mt-1">
                              Templates are filtered by your organization's industry selections
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      filteredTemplates.map((template) => (
                        <div
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          className={`p-3 bg-[#333333] hover:bg-[#404040] border rounded-[4px] cursor-pointer transition-all ${
                            addedTemplateId === template.id ? 'border-[#388E3C] bg-[#388E3C]/10' : 'border-[#555555]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-white truncate">{template.name}</h4>
                              {template.description && (
                                <p className="text-xs text-gray-400 truncate mt-0.5">{template.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-gray-500">
                                  {template.items?.length || 0} items
                                </span>
                                <span className="text-xs text-[#336699] font-mono">
                                  {formatCurrency(template.total_amount)}
                                </span>
                              </div>
                            </div>
                            {addedTemplateId === template.id ? (
                              <Check className="w-4 h-4 text-[#388E3C] flex-shrink-0 mt-0.5" />
                            ) : (
                              <Plus className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    </div>
                  </div>
              </>
            )}
          </div>

          {/* Right Column - Estimate Details (60% width) */}
          <div className="flex-1 flex flex-col">
            {/* Selected Items Section - Now with proper flex growth and scrolling */}
            <div className="flex-1 min-h-0 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-sm font-medium text-gray-300">
                  Estimate Items ({selectedItems.length})
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
              
              {/* Scrollable items container */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {selectedItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {!sourceType ? 'Select a method to add items' : 'Click items on the left to add them'}
                  </div>
                ) : (
                  <div className="space-y-3 pb-4">
                    {selectedItems.map((item, index) => {
                      return (
                        <div 
                          key={index} 
                          className="rounded-[4px] p-3 bg-[#1E1E1E]"
                        >
                          <div className="flex items-start gap-3">
                            
                            {/* Product info section - better width management */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="text-sm text-white font-medium">
                                  {item.product_name || 'Unknown Item'}
                                </div>
                              </div>
                              {item.description && (
                                <div className="text-xs text-gray-400 mb-2 line-clamp-2">
                                  {item.description}
                                </div>
                              )}
                              <div className="text-xs text-gray-500">
                                {formatCurrency(item.price)} × {item.quantity} = 
                                <span className="text-[#388E3C] font-medium ml-1">
                                  {formatCurrency(item.price * item.quantity)}
                                </span>
                              </div>
                            </div>
                            
                            {/* Quantity controls - stacked vertically for space */}
                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateItemQuantity(index, item.quantity - 1)}
                                className="w-6 h-6 flex items-center justify-center bg-[#333333] hover:bg-[#404040] rounded-[2px] transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateItemQuantity(index, Number(e.target.value))}
                                className="w-12 text-center px-1 py-1 bg-[#333333] border border-[#555555] rounded-[2px] text-white text-sm font-medium"
                              />
                              <button
                                onClick={() => updateItemQuantity(index, item.quantity + 1)}
                                className="w-6 h-6 flex items-center justify-center bg-[#333333] hover:bg-[#404040] rounded-[2px] transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeItem(index)}
                              className="w-full py-1 text-xs text-red-400 hover:bg-red-400/20 rounded-[2px] transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>


            {/* Total Summary - Compact and fixed at bottom */}
            <div className="border-t border-[#333333] px-4 py-3 bg-[#1E1E1E] flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Valid for {validityDays} days</span>
                  {validUntil && (
                    <span>Until {new Date(validUntil).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="text-right">
                  {/* Show subtotal and discounts if applicable */}
                  {(getClientDiscount() > 0 || additionalDiscount > 0) && (
                    <div className="space-y-1 mb-1">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-400">Subtotal:</span>
                        <span className="font-mono text-sm text-gray-300">{formatCurrency(calculateSubtotal())}</span>
                      </div>
                      {getClientDiscount() > 0 && (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-purple-400">Good Customer Discount ({getClientDiscount()}%):</span>
                          <span className="font-mono text-sm text-purple-400">-{formatCurrency(calculateCustomerDiscount())}</span>
                        </div>
                      )}
                      {additionalDiscount > 0 && (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-orange-400">
                            Additional Discount ({additionalDiscount}%{discountReason ? ` - ${discountReason.replace('_', ' ')}` : ''}):
                          </span>
                          <span className="font-mono text-sm text-orange-400">-{formatCurrency(calculateAdditionalDiscount())}</span>
                        </div>
                      )}
                      {(getClientDiscount() > 0 || additionalDiscount > 0) && (
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#333333]">
                          <span className="text-xs text-gray-400">They're Saving:</span>
                          <span className="font-mono text-sm text-green-400">-{formatCurrency(calculateTotalDiscount())}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="font-mono text-lg font-bold text-white">{formatCurrency(calculateTotal())}</div>
                  <div className="text-xs text-gray-400">{selectedItems.length} items</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Client Modal */}
      {showNewClientModal && (
        <NewClientModal
          onClose={() => setShowNewClientModal(false)}
          onSave={handleNewClientSave}
        />
      )}
    </>
  );
};