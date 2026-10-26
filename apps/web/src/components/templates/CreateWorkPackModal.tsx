import React, { useState, useEffect, useContext } from 'react';
import { X, DollarSign, Package, Plus, Trash2, Settings, Search, Filter } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  category?: { name: string };
  line_items_count?: number;
}

interface Task {
  id: string;
  description: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
}

interface CreateWorkPackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  workPackId?: string | null;
  categories?: any[];
}

export const CreateWorkPackModal: React.FC<CreateWorkPackModalProps> = ({ isOpen, onClose, onSuccess, workPackId, categories: propCategories }) => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Form data
  const [workPackName, setWorkPackName] = useState('');
  const [workPackIndustry, setWorkPackIndustry] = useState('');
  const [workPackProjectType, setWorkPackProjectType] = useState('');
  const [workPackDescription, setWorkPackDescription] = useState('');
  const [workPackTier, setWorkPackTier] = useState<'budget' | 'standard' | 'premium'>('standard');
  
  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [industries, setIndustries] = useState<any[]>([]);
  const [projectTypes, setProjectTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', description: 'Demo existing fixtures and prepare space' },
    { id: '2', description: 'Install plumbing rough-in' },
    { id: '3', description: '' }
  ]);
  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', description: 'Permit - Plumbing', amount: 350 },
    { id: '2', description: 'Dumpster Rental', amount: 500 }
  ]);

  const isEditing = !!workPackId;

  useEffect(() => {
    if (isOpen) {
      loadData();
      
      if (workPackId) {
        // Load existing work pack data for editing
        loadWorkPackData(workPackId);
      } else {
        // Reset form for creating new work pack
        setWorkPackName('');
        setWorkPackIndustry('');
        setWorkPackProjectType('');
        setWorkPackDescription('');
        setWorkPackTier('standard');
        setSelectedProducts([]);
        setTasks([
          { id: '1', description: 'Demo existing fixtures and prepare space' },
          { id: '2', description: 'Install plumbing rough-in' },
          { id: '3', description: '' }
        ]);
        setExpenses([
          { id: '1', description: 'Permit - Plumbing', amount: 350 },
          { id: '2', description: 'Dumpster Rental', amount: 500 }
        ]);
      }
      
      setSearchQuery('');
      setSelectedCategory('all');
    }
  }, [isOpen, workPackId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load industries
      const { data: industriesData, error: industriesError } = await supabase
        .from('industries')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
        
      if (!industriesError && industriesData) {
        setIndustries(industriesData);
        setCategories(industriesData); // Keep for compatibility
      }
      
      // Load project types
      const { data: projectTypesData, error: projectTypesError } = await supabase
        .from('project_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
        
      if (!projectTypesError && projectTypesData) {
        setProjectTypes(projectTypesData);
      }

      // Load products for selection
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user?.id)
        .order('name');
        
      if (!productsError && productsData) {
        setProducts(productsData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  const loadWorkPackData = async (packId: string) => {
    try {
      // Load work pack details
      const { data: workPack } = await supabase
        .from('work_packs')
        .select(`
          *,
          industry:industries(id, name),
          project_type:project_categories!project_type_id(id, name)
        `)
        .eq('id', packId)
        .single();

      if (workPack) {
        setWorkPackName(workPack.name);
        setWorkPackIndustry(workPack.industry_id || '');
        setWorkPackProjectType(workPack.project_type_id || '');
        setWorkPackDescription(workPack.description || '');
        setWorkPackTier(workPack.tier);
      }

      // Load work pack products
      const { data: workPackItems } = await supabase
        .from('work_pack_items')
        .select(`
          *,
          product:products(*)
        `)
        .eq('work_pack_id', packId);

      if (workPackItems) {
        const packProducts = workPackItems.map(item => item.product).filter(Boolean);
        setSelectedProducts(packProducts);
      }

      // Load work pack tasks
      const { data: workPackTasks } = await supabase
        .from('work_pack_tasks')
        .select('*')
        .eq('work_pack_id', packId)
        .order('sort_order');

      if (workPackTasks) {
        const tasksData = workPackTasks.map(task => ({
          id: task.id,
          description: task.title
        }));
        setTasks(tasksData.length > 0 ? tasksData : [{ id: '1', description: '' }]);
      }

      // Load work pack expenses
      const { data: workPackExpenses } = await supabase
        .from('work_pack_expenses')
        .select('*')
        .eq('work_pack_id', packId);

      if (workPackExpenses) {
        const expensesData = workPackExpenses.map(expense => ({
          id: expense.id,
          description: expense.description,
          amount: expense.amount
        }));
        setExpenses(expensesData.length > 0 ? expensesData : []);
      }
    } catch (error) {
      console.error('Error loading work pack data:', error);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category?.name === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const categoryName = product.category?.name || 'Uncategorized';
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }
    acc[categoryName].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  console.log('Products state:', products.length);
  console.log('Filtered products:', filteredProducts.length);
  console.log('Grouped products:', groupedProducts);

  const toggleProductSelection = (product: Product) => {
    setSelectedProducts(prev => {
      const isSelected = prev.find(p => p.id === product.id);
      if (isSelected) {
        return prev.filter(p => p.id !== product.id);
      } else {
        return [...prev, product];
      }
    });
  };

  const addTask = () => {
    const newTask = { id: Date.now().toString(), description: '' };
    setTasks(prev => [...prev, newTask]);
  };

  const updateTask = (id: string, description: string) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, description } : task
    ));
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  const addExpense = () => {
    const newExpense = { id: Date.now().toString(), description: '', amount: 0 };
    setExpenses(prev => [...prev, newExpense]);
  };

  const updateExpense = (id: string, field: 'description' | 'amount', value: string | number) => {
    setExpenses(prev => prev.map(expense => 
      expense.id === id ? { ...expense, [field]: value } : expense
    ));
  };

  const removeExpense = (id: string) => {
    setExpenses(prev => prev.filter(expense => expense.id !== id));
  };

  const calculateTotals = () => {
    const productsTotal = selectedProducts.reduce((sum, product) => sum + product.price, 0);
    const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    return {
      productsTotal,
      expensesTotal,
      total: productsTotal + expensesTotal
    };
  };

  // Filter project types based on selected industry
  const filteredProjectTypes = projectTypes.filter(projectType => 
    !workPackIndustry || projectType.industry_id === workPackIndustry
  );

  const handleIndustryChange = (industryId: string) => {
    setWorkPackIndustry(industryId);
    // Reset project type when industry changes
    setWorkPackProjectType('');
  };

  const handleCreate = async () => {
    if (!workPackName.trim() || selectedProducts.length === 0) {
      alert('Please enter a name and select at least one product');
      return;
    }

    setLoading(true);
    try {
      if (isEditing) {
        // Update existing work pack
        const { error: workPackError } = await supabase
          .from('work_packs')
          .update({
            name: workPackName,
            description: workPackDescription,
            industry_id: workPackIndustry || null,
            project_type_id: workPackProjectType || null,
            tier: workPackTier,
            base_price: calculateTotals().total,
            organization_id: selectedOrg?.id || null
          })
          .eq('id', workPackId);

        if (workPackError) throw workPackError;

        // Delete existing items, tasks, and expenses
        await supabase.from('work_pack_items').delete().eq('work_pack_id', workPackId);
        await supabase.from('work_pack_tasks').delete().eq('work_pack_id', workPackId);
        await supabase.from('work_pack_expenses').delete().eq('work_pack_id', workPackId);

        // Re-add updated items, tasks, and expenses using the existing workPackId
        const currentWorkPackId = workPackId;

        // Add selected products
        if (selectedProducts.length > 0) {
          const { error: itemsError } = await supabase
            .from('work_pack_items')
            .insert(
              selectedProducts.map(product => ({
                work_pack_id: currentWorkPackId,
                product_id: product.id,
                quantity: 1
              }))
            );

          if (itemsError) throw itemsError;
        }

        // Add tasks
        const validTasks = tasks.filter(task => task.description.trim());
        if (validTasks.length > 0) {
          const { error: tasksError } = await supabase
            .from('work_pack_tasks')
            .insert(
              validTasks.map((task, index) => ({
                work_pack_id: currentWorkPackId,
                title: task.description,
                sort_order: index + 1
              }))
            );

          if (tasksError) throw tasksError;
        }

        // Add expenses
        const validExpenses = expenses.filter(expense => expense.description.trim() && expense.amount > 0);
        if (validExpenses.length > 0) {
          const { error: expensesError } = await supabase
            .from('work_pack_expenses')
            .insert(
              validExpenses.map(expense => ({
                work_pack_id: currentWorkPackId,
                description: expense.description,
                amount: expense.amount,
                category: 'General'
              }))
            );

          if (expensesError) throw expensesError;
        }
      } else {
        // Create new work pack (existing logic)
        const { data: workPack, error: workPackError } = await supabase
          .from('work_packs')
          .insert({
            name: workPackName,
            description: workPackDescription,
            industry_id: workPackIndustry || null,
            project_type_id: workPackProjectType || null,
            tier: workPackTier,
            base_price: calculateTotals().total,
            user_id: user?.id,
            organization_id: selectedOrg?.id || null,
            is_active: true
          })
          .select()
          .single();

        if (workPackError) throw workPackError;

        // Add selected products
        if (selectedProducts.length > 0) {
          const { error: itemsError } = await supabase
            .from('work_pack_items')
            .insert(
              selectedProducts.map(product => ({
                work_pack_id: workPack.id,
                product_id: product.id,
                quantity: 1
              }))
            );

          if (itemsError) throw itemsError;
        }

        // Add tasks
        const validTasks = tasks.filter(task => task.description.trim());
        if (validTasks.length > 0) {
          const { error: tasksError } = await supabase
            .from('work_pack_tasks')
            .insert(
              validTasks.map((task, index) => ({
                work_pack_id: workPack.id,
                title: task.description,
                sort_order: index + 1
              }))
            );

          if (tasksError) throw tasksError;
        }

        // Add expenses
        const validExpenses = expenses.filter(expense => expense.description.trim() && expense.amount > 0);
        if (validExpenses.length > 0) {
          const { error: expensesError } = await supabase
            .from('work_pack_expenses')
            .insert(
              validExpenses.map(expense => ({
                work_pack_id: workPack.id,
                description: expense.description,
                amount: expense.amount,
                category: 'General'
              }))
            );

          if (expensesError) throw expensesError;
        }
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} work pack:`, error);
      alert(`Error ${isEditing ? 'updating' : 'creating'} work pack`);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

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
              <h1 className="text-lg font-semibold text-white">
                {isEditing ? 'Edit Work Pack' : 'Create Work Pack'}
              </h1>
            </div>
            <button
              onClick={handleCreate}
              disabled={loading || !workPackName.trim() || selectedProducts.length === 0}
              className="px-4 py-1.5 bg-[#336699] text-white rounded-[4px] hover:bg-[#2A5580] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Work Pack' : 'Create Work Pack')}
            </button>
          </div>
        </div>

        {/* Main Content - Two Panel Layout */}
        <div className="flex h-[calc(100%-64px)]">
          {/* Left Panel - Product Selection (40%) */}
          <div className="w-[40%] bg-[#0a0a0a] border-r border-[#333333] flex flex-col overflow-hidden">
            {/* Search */}
            <div className="p-4 border-b border-[#333333]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search products..."
                  className="w-full pl-10 pr-4 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-white text-sm focus:outline-none focus:border-[#336699]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="p-3 border-b border-[#333333]">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 text-xs ${selectedCategory === 'all' ? 'bg-[#336699] text-white' : 'bg-[#1E1E1E] text-gray-400'} rounded-[4px] transition-colors`}
                >
                  All ({products.length})
                </button>
                {categories.map(category => {
                  const categoryCount = products.filter(p => p.category?.name === category.name).length;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.name)}
                      className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-all border whitespace-nowrap ${
                        selectedCategory === category.name
                          ? 'bg-[#336699] text-white border-[#336699]'
                          : 'bg-[#333333] text-gray-400 border-[#555555] hover:bg-[#404040] hover:border-[#666666]'
                      }`}
                    >
                      {category.name} ({categoryCount})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Products List */}
            <div className="flex-1 overflow-y-auto p-3">
              {Object.entries(groupedProducts).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-sm mb-2">No products found</div>
                  <div className="text-xs">
                    {products.length === 0 
                      ? 'No products in database'
                      : `${products.length} products loaded, but filtered out`
                    }
                  </div>
                  <div className="text-xs mt-2">
                    Search: "{searchQuery}" | Category: {selectedCategory}
                  </div>
                </div>
              ) : (
                Object.entries(groupedProducts).map(([categoryName, categoryProducts]) => (
                  <div key={categoryName} className="mb-4">
                    <div className="px-2 py-1 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                      {categoryName} ({categoryProducts.length})
                    </div>
                    <div className="space-y-2 mt-2">
                      {categoryProducts.map(product => {
                        const isSelected = selectedProducts.find(p => p.id === product.id);
                        return (
                          <div
                            key={product.id}
                            onClick={() => toggleProductSelection(product)}
                            className={`p-3 rounded-[4px] border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-[#336699]/20 border-[#336699]'
                                : 'bg-[#1a1a1a] border-[#333333] hover:bg-[#2a2a2a] hover:border-[#404040]'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-white mb-0.5">{product.name}</div>
                                <div className="text-xs text-gray-400">
                                  {product.line_items_count} line items • {product.description || 'No description'}
                                </div>
                              </div>
                              <div className="text-right ml-3">
                                <div className="text-sm font-semibold text-white">{formatCurrency(product.price)}</div>
                                <div className="text-xs text-gray-400">/{product.unit}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel - Configuration (60%) */}
          <div className="flex-1 bg-[#121212] flex flex-col overflow-hidden">
            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Basic Information */}
              <div className="mb-6">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="Work Pack Name *"
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                      value={workPackName}
                      onChange={(e) => setWorkPackName(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <textarea
                      placeholder="Description (optional)"
                      rows={2}
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699] resize-none"
                      value={workPackDescription}
                      onChange={(e) => setWorkPackDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Industry
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white focus:outline-none focus:border-[#336699]"
                      value={workPackIndustry}
                      onChange={(e) => handleIndustryChange(e.target.value)}
                    >
                      <option value="">Select industry</option>
                      {industries.map(industry => (
                        <option key={industry.id} value={industry.id}>{industry.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Project Type
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white focus:outline-none focus:border-[#336699]"
                      value={workPackProjectType}
                      onChange={(e) => setWorkPackProjectType(e.target.value)}
                    >
                      <option value="">Select project type</option>
                      {filteredProjectTypes.map(projectType => (
                        <option key={projectType.id} value={projectType.id}>{projectType.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Pack Type
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-sm text-white focus:outline-none focus:border-[#336699]"
                      value={workPackTier}
                      onChange={(e) => setWorkPackTier(e.target.value as 'budget' | 'standard' | 'premium')}
                    >
                      <option value="budget">Budget</option>
                      <option value="standard">Standard</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Selected Products */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Selected Products ({selectedProducts.length})
                </label>
                <div className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] p-4">
                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      Select products from the left panel to add them to this work pack
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center pb-2 border-b border-[#333333]">
                        <div className="text-sm font-semibold text-white">Products in this pack</div>
                        <div className="text-sm text-gray-400">Total: {formatCurrency(totals.productsTotal)}</div>
                      </div>
                      {selectedProducts.map(product => (
                        <div key={product.id} className="flex justify-between items-center py-2 border-b border-[#333333]/50 last:border-b-0">
                          <div className="text-sm text-white">{product.name}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{formatCurrency(product.price)}</span>
                            <button
                              onClick={() => toggleProductSelection(product)}
                              className="w-5 h-5 bg-transparent border border-[#555555] rounded text-gray-400 hover:bg-red-600 hover:border-red-600 hover:text-white transition-all flex items-center justify-center text-xs"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Tasks
                </label>
                <div className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] p-4">
                  <div className="space-y-2">
                    {tasks.map((task, index) => (
                      <div key={task.id} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-[#333333] rounded-full flex items-center justify-center text-xs font-semibold text-gray-400">
                          {index + 1}
                        </div>
                        <input
                          type="text"
                          placeholder="Enter task description..."
                          className="flex-1 px-3 py-2 bg-[#333333] border border-[#555555] rounded-[4px] text-white text-sm focus:outline-none focus:border-[#336699]"
                          value={task.description}
                          onChange={(e) => updateTask(task.id, e.target.value)}
                        />
                        {tasks.length > 1 && (
                          <button
                            onClick={() => removeTask(task.id)}
                            className="w-6 h-6 bg-transparent border border-[#555555] rounded text-gray-400 hover:bg-red-600 hover:border-red-600 hover:text-white transition-all flex items-center justify-center text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addTask}
                      className="w-full py-2 border border-dashed border-[#555555] rounded-[4px] text-gray-400 hover:border-[#666666] hover:text-gray-300 transition-all text-sm"
                    >
                      + Add Task
                    </button>
                  </div>
                </div>
              </div>

              {/* Additional Expenses */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Additional Expenses
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {expenses.map(expense => (
                    <div key={expense.id} className="flex justify-between items-center p-3 bg-[#1E1E1E] border border-[#333333] rounded-[4px]">
                      <input
                        type="text"
                        placeholder="Expense description"
                        className="flex-1 bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none mr-2"
                        value={expense.description}
                        onChange={(e) => updateExpense(expense.id, 'description', e.target.value)}
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">$</span>
                        <input
                          type="number"
                          placeholder="0"
                          className="w-16 bg-transparent text-sm font-semibold text-[#5b8fc7] focus:outline-none text-right"
                          value={expense.amount || ''}
                          onChange={(e) => updateExpense(expense.id, 'amount', parseFloat(e.target.value) || 0)}
                        />
                        <button
                          onClick={() => removeExpense(expense.id)}
                          className="w-4 h-4 ml-2 bg-transparent border border-[#555555] rounded text-gray-400 hover:bg-red-600 hover:border-red-600 hover:text-white transition-all flex items-center justify-center text-xs"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addExpense}
                    className="col-span-2 py-3 border border-dashed border-[#555555] rounded-[4px] text-gray-400 hover:border-[#666666] hover:text-gray-300 transition-all text-sm"
                  >
                    + Add Expense
                  </button>
                </div>
              </div>
            </div>

            {/* Summary Footer */}
            <div className="sticky bottom-0 bg-[#1E1E1E] border-t border-[#333333] px-4 py-3 flex justify-between items-center">
              <div className="flex gap-6">
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Products</div>
                  <div className="text-sm font-semibold text-white">{selectedProducts.length}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Tasks</div>
                  <div className="text-sm font-semibold text-white">{tasks.filter(t => t.description.trim()).length}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Expenses</div>
                  <div className="text-sm font-semibold text-white">{expenses.filter(e => e.description.trim() && e.amount > 0).length}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Total Value</div>
                <div className="text-lg font-bold text-[#5b8fc7]">{formatCurrency(totals.total)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};