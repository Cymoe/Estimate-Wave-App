import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Grid, List, Eye, Edit2, MoreVertical,
  Package, DollarSign, CheckSquare, Copy, Download, Archive, Trash2, LayoutGrid
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';
import { CreateWorkPackModal } from './CreateWorkPackModal';
import { useNavigate } from 'react-router-dom';
import { WorkPackService, type WorkPack } from '../../services/WorkPackService';

interface WorkPackTask {
  id: string;
  title: string;
  description: string;
  estimated_hours: number;
  display_order: number;
}

interface WorkPackExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  vendor?: string;
  display_order: number;
}

interface WorkPackItem {
  id: string;
  item_type: 'product' | 'line_item';
  quantity: number;
  price: number;
  line_item?: { name: string; description: string };
  product?: { name: string; description: string };
}

interface WorkPackDocument {
  id: string;
  title: string;
  description: string;
  document_url: string;
  display_order: number;
}

export const WorkPackManager: React.FC = () => {
  const { user } = useAuth();
  const [workPacks, setWorkPacks] = useState<WorkPack[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'archived' | 'recent'>('all');
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedWorkPackId, setSelectedWorkPackId] = useState<string | null>(null);
  const [isCompactTable, setIsCompactTable] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, [user]);

  // Debug modal states
  useEffect(() => {
    console.log('Modal states changed - editModalOpen:', editModalOpen, 'selectedWorkPackId:', selectedWorkPackId);
  }, [editModalOpen, selectedWorkPackId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.dropdown-trigger')) {
        setDropdownOpen(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const organizationId = localStorage.getItem('selectedOrgId');
      if (!organizationId) {
        console.error('No organization ID found');
        return;
      }
      
      // Load industries
      const { data: industriesData, error: industriesError } = await supabase
        .from('industries')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
        
      if (!industriesError && industriesData) {
        setCategories(industriesData);
      }
      
      // Load work packs using the service
      const workPacksData = await WorkPackService.list(organizationId);
      
      // Add mock usage count for now
      const enrichedWorkPacks = workPacksData.map(pack => ({
        ...pack,
        usage_count: Math.floor(Math.random() * 20) + 1
      }));
      
      setWorkPacks(enrichedWorkPacks);
    } catch (error) {
      console.error('Error loading work packs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkPacks = workPacks.filter(pack => {
    const matchesCategory = selectedCategory === 'all' || pack.industry_id === selectedCategory;
    const matchesTier = selectedTier === 'all' || pack.tier === selectedTier;
    const matchesSearch = 
      pack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pack.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pack.industry?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = 
      filterStatus === 'all' ||
      (filterStatus === 'active' && pack.is_active) ||
      (filterStatus === 'archived' && !pack.is_active) ||
      (filterStatus === 'recent' && (pack.usage_count || 0) > 10);
    
    return matchesCategory && matchesTier && matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalValue = filteredWorkPacks.reduce((sum, pack) => sum + pack.base_price, 0);
  const mostUsed = filteredWorkPacks.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))[0];
  const avgProducts = filteredWorkPacks.length > 0 
    ? (filteredWorkPacks.reduce((sum, pack) => sum + (pack.items?.length || 0), 0) / filteredWorkPacks.length).toFixed(1)
    : 0;

  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'budget': return 'bg-[#0d2818] text-[#4ade80] border-[#4ade80]';
      case 'standard': return 'bg-[#1a1a1a] text-[#999] border-[#666]';
      case 'premium': return 'bg-[#2d2006] text-[#5b8fc7] border-[#336699]';
      default: return 'bg-[#1a1a1a] text-[#666] border-[#666]';
    }
  };

  const toggleDropdown = (packId: string) => {
    setDropdownOpen(dropdownOpen === packId ? null : packId);
  };

  const handleViewWorkPack = (packId: string) => {
    console.log('handleViewWorkPack called with packId:', packId);
    alert(`Navigating to work pack detail page for ID: ${packId}`);
    navigate(`/work-packs/${packId}`);
  };

  const handleEditWorkPack = (packId: string) => {
    console.log('handleEditWorkPack called with packId:', packId);
    console.log('Setting editModalOpen to true');
    setSelectedWorkPackId(packId);
    setEditModalOpen(true);
  };

  const handleCreateWorkPack = () => {
    console.log('handleCreateWorkPack called');
    console.log('Setting selectedWorkPackId to null, editModalOpen to true, viewModalOpen to false');
    setSelectedWorkPackId(null);
    setEditModalOpen(true);
  };

  const handleDuplicateWorkPack = async (packId: string) => {
    try {
      const organizationId = localStorage.getItem('selectedOrgId');
      if (!organizationId) {
        console.error('No organization ID found');
        return;
      }
      
      await WorkPackService.duplicate(packId, organizationId);
      
      // Reload data to show the new pack
      loadData();
    } catch (error) {
      console.error('Error duplicating work pack:', error);
      alert('Failed to duplicate work pack');
    }
  };

  const handleArchiveWorkPack = async (packId: string) => {
    try {
      const organizationId = localStorage.getItem('selectedOrgId');
      if (!organizationId) {
        console.error('No organization ID found');
        return;
      }
      
      const updatedPack = await WorkPackService.archive(packId, organizationId);
      
      // Update local state
      setWorkPacks(workPacks.map(p => 
        p.id === packId ? { ...p, is_active: updatedPack.is_active } : p
      ));
    } catch (error) {
      console.error('Error archiving work pack:', error);
      alert('Failed to archive work pack');
    }
  };

  const handleDeleteWorkPack = async (packId: string) => {
    if (!confirm('Are you sure you want to delete this work pack? This action cannot be undone.')) {
      return;
    }
    
    try {
      const organizationId = localStorage.getItem('selectedOrgId');
      if (!organizationId) {
        console.error('No organization ID found');
        return;
      }
      
      await WorkPackService.delete(packId, organizationId);
      
      // Update local state
      setWorkPacks(workPacks.filter(p => p.id !== packId));
    } catch (error) {
      console.error('Error deleting work pack:', error);
      alert('Failed to delete work pack');
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-white mb-2 tracking-tight">Work Packs</h1>
        <p className="text-sm text-gray-500">Pre-configured project templates with products, tasks, and expenses</p>
      </div>

      {/* Stats Bar */}
      <div className="flex gap-10 mb-8">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.5px] text-gray-500 mb-1">Total Packs</span>
          <span className="text-[28px] font-bold text-white tracking-tight">{filteredWorkPacks.length}</span>
          <span className="text-xs text-gray-500">across {categories.length} categories</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.5px] text-gray-500 mb-1">Total Value</span>
          <span className="text-[28px] font-bold text-white tracking-tight">{formatCurrency(totalValue)}</span>
          <span className="text-xs text-gray-500">combined pricing</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.5px] text-gray-500 mb-1">Most Used</span>
          <span className="text-[28px] font-bold text-white tracking-tight">{mostUsed?.name.split(' ')[0] || 'None'}</span>
          <span className="text-xs text-gray-500">{mostUsed?.usage_count || 0} projects</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.5px] text-gray-500 mb-1">Avg Products</span>
          <span className="text-[28px] font-bold text-white tracking-tight">{avgProducts}</span>
          <span className="text-xs text-gray-500">per pack</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-[400px]">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search work packs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 pl-10 pr-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                     text-white placeholder-gray-500 focus:outline-none focus:border-[#3a3a3a] 
                     focus:bg-[#151515] transition-all"
          />
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="h-12 px-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                   text-white focus:outline-none focus:border-[#3a3a3a] 
                   hover:bg-[#151515] transition-all appearance-none cursor-pointer min-w-[150px]"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          value={selectedTier}
          onChange={(e) => setSelectedTier(e.target.value)}
          className="h-12 px-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                   text-white focus:outline-none focus:border-[#3a3a3a] 
                   hover:bg-[#151515] transition-all appearance-none cursor-pointer min-w-[150px]"
        >
          <option value="all">All Types</option>
          <option value="budget">Budget</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>

        {/* Compact Table Toggle - Only show for table view */}
        {viewMode === 'table' && (
          <button
            onClick={() => setIsCompactTable(!isCompactTable)}
            className={`p-2 bg-[#111] border border-[#2a2a2a] hover:bg-[#1a1a1a] rounded-lg transition-colors ${isCompactTable ? 'bg-[#1a1a1a] text-[#3B82F6]' : 'text-gray-400'}`}
            title="Toggle compact view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        )}

        {/* View Toggle */}
        <div className="flex bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-4 py-2 transition-all ${
              viewMode === 'grid' 
                ? 'bg-[#1a1a1a] text-white' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 transition-all ${
              viewMode === 'table' 
                ? 'bg-[#1a1a1a] text-white' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Add Button */}
        <button
          onClick={handleCreateWorkPack}
          className="ml-auto px-6 py-3 bg-[#111] border border-[#2a2a2a] rounded-lg 
                   text-white font-medium hover:bg-[#1a1a1a] hover:border-[#3a3a3a] 
                   transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Work Pack
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-1.5 rounded-full text-[13px] border transition-all cursor-pointer
                    ${filterStatus === 'all'
                      ? 'bg-[#1a1a1a] text-[#5b8fc7] border-[#3a3a3a]'
                      : 'bg-[#111] text-white border-[#2a2a2a] hover:bg-[#151515] hover:border-[#3a3a3a]'
                    }`}
        >
          All<span className="text-gray-500 ml-1">({workPacks.length})</span>
        </button>
        <button
          onClick={() => setFilterStatus('active')}
          className={`px-4 py-1.5 rounded-full text-[13px] border transition-all cursor-pointer
                    ${filterStatus === 'active'
                      ? 'bg-[#1a1a1a] text-[#5b8fc7] border-[#3a3a3a]'
                      : 'bg-[#111] text-white border-[#2a2a2a] hover:bg-[#151515] hover:border-[#3a3a3a]'
                    }`}
        >
          Active<span className="text-gray-500 ml-1">({workPacks.filter(p => p.is_active).length})</span>
        </button>
        <button
          onClick={() => setFilterStatus('archived')}
          className={`px-4 py-1.5 rounded-full text-[13px] border transition-all cursor-pointer
                    ${filterStatus === 'archived'
                      ? 'bg-[#1a1a1a] text-[#5b8fc7] border-[#3a3a3a]'
                      : 'bg-[#111] text-white border-[#2a2a2a] hover:bg-[#151515] hover:border-[#3a3a3a]'
                    }`}
        >
          Archived<span className="text-gray-500 ml-1">({workPacks.filter(p => !p.is_active).length})</span>
        </button>
        <button
          onClick={() => setFilterStatus('recent')}
          className={`px-4 py-1.5 rounded-full text-[13px] border transition-all cursor-pointer
                    ${filterStatus === 'recent'
                      ? 'bg-[#1a1a1a] text-[#5b8fc7] border-[#3a3a3a]'
                      : 'bg-[#111] text-white border-[#2a2a2a] hover:bg-[#151515] hover:border-[#3a3a3a]'
                    }`}
        >
          Recently Used<span className="text-gray-500 ml-1">({workPacks.filter(p => (p.usage_count || 0) > 10).length})</span>
        </button>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-[#2a2a2a] rounded mb-4 w-1/3" />
                <div className="h-6 bg-[#2a2a2a] rounded mb-2" />
                <div className="h-4 bg-[#2a2a2a] rounded w-2/3" />
              </div>
            ))
          ) : (
            filteredWorkPacks.map((pack) => (
              <div 
                key={pack.id} 
                className="bg-[#111] border border-[#1a1a1a] rounded-lg overflow-hidden hover:border-[#2a2a2a] transition-all"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">{pack.name}</h3>
                      <p className="text-sm text-gray-500">{pack.industry?.name || 'Uncategorized'}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${getTierStyle(pack.tier)}`}>
                      {pack.tier}
                    </span>
                  </div>

                  {/* Description */}
                  {pack.description && (
                    <p className="text-sm text-gray-400 mb-6 line-clamp-2">{pack.description}</p>
                  )}

                  {/* Stats */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Base Price</span>
                      <span className="text-lg font-bold text-white">{formatCurrency(pack.base_price || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Products</span>
                      <span className="text-sm font-medium text-white">{pack.items?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Tasks</span>
                      <span className="text-sm font-medium text-white">{pack.tasks?.length || 0}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleViewWorkPack(pack.id!)}
                      className="flex-1 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#2a2a2a] transition-all"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleEditWorkPack(pack.id!)}
                      className="flex-1 px-4 py-2 bg-transparent border border-[#2a2a2a] text-gray-400 rounded-lg text-sm font-medium hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] transition-all"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-[#111] border border-[#1a1a1a] rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[2.5fr,1fr,0.8fr,0.8fr,0.8fr,1fr,0.8fr,100px] gap-4 px-6 py-4 
                        bg-[#0a0a0a] border-b border-[#1a1a1a] text-[11px] uppercase tracking-[0.5px] text-gray-500">
            <div>Work Pack</div>
            <div>Category</div>
            <div className="text-center">Products</div>
            <div className="text-center">Tasks</div>
            <div className="text-center">Expenses</div>
            <div className="text-right">Price</div>
            <div className="text-center">Usage</div>
            <div></div>
          </div>

          {/* Table Rows */}
          {loading ? (
            <div className="px-6 py-12 text-center text-gray-500">Loading...</div>
          ) : (
            filteredWorkPacks.map(pack => (
              <div key={pack.id} 
                   className={`grid grid-cols-[2.5fr,1fr,0.8fr,0.8fr,0.8fr,1fr,0.8fr,100px] gap-4 px-6 
                            border-b border-[#1a1a1a] items-center hover:bg-[#151515] transition-colors group ${isCompactTable ? 'py-2' : 'py-3'}`}
                   >
                {/* Pack Info */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className={`font-semibold text-white tracking-tight ${isCompactTable ? 'text-sm' : 'text-[15px]'}`}>{pack.name}</span>
                    <span className={`text-[10px] uppercase tracking-[0.5px] px-2 py-0.5 rounded ${getTierStyle(pack.tier)}`}>
                      {pack.tier}
                    </span>
                  </div>
                  {!isCompactTable && (
                    <span className="text-[13px] text-gray-500">{pack.description}</span>
                  )}
                </div>

                {/* Category */}
                <div className="text-[13px] text-gray-300">{pack.industry?.name}</div>

                {/* Products Count */}
                <div className="text-sm text-gray-300 text-center">{pack.items?.length || 0}</div>

                {/* Tasks Count */}
                <div className="text-sm text-gray-300 text-center">{pack.tasks?.length || 0}</div>

                {/* Expenses Count */}
                <div className="text-sm text-gray-300 text-center">{pack.expenses?.length || 0}</div>

                {/* Price */}
                <div className="text-base font-semibold text-right">{formatCurrency(pack.base_price)}</div>

                {/* Usage */}
                <div className="text-[13px] text-gray-500 text-center">{pack.usage_count || 0}</div>

                {/* Actions */}
                <div className="flex items-center justify-center">
                  <div className="relative dropdown-trigger">
                    <button 
                      onClick={() => toggleDropdown(pack.id!)}
                      className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-600 rounded"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    
                    {dropdownOpen === pack.id && (
                      <div className="absolute top-full right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] 
                                    rounded-lg p-1 min-w-[160px] z-50 shadow-xl">
                        <button 
                          onClick={() => handleViewWorkPack(pack.id!)}
                          className="w-full px-3 py-2 text-left text-[13px] text-gray-300 
                                         hover:bg-[#2a2a2a] rounded transition-colors flex items-center gap-2">
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        <button 
                          onClick={() => handleEditWorkPack(pack.id!)}
                          className="w-full px-3 py-2 text-left text-[13px] text-gray-300 
                                         hover:bg-[#2a2a2a] rounded transition-colors flex items-center gap-2">
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDuplicateWorkPack(pack.id!)}
                          className="w-full px-3 py-2 text-left text-[13px] text-gray-300 
                                         hover:bg-[#2a2a2a] rounded transition-colors flex items-center gap-2">
                          <Copy className="w-3.5 h-3.5" />
                          Duplicate
                        </button>
                        <button className="w-full px-3 py-2 text-left text-[13px] text-gray-300 
                                         hover:bg-[#2a2a2a] rounded transition-colors flex items-center gap-2">
                          <Download className="w-3.5 h-3.5" />
                          Export
                        </button>
                        <button 
                          onClick={() => handleArchiveWorkPack(pack.id!)}
                          className="w-full px-3 py-2 text-left text-[13px] text-gray-300 
                                         hover:bg-[#2a2a2a] rounded transition-colors flex items-center gap-2">
                          <Archive className="w-3.5 h-3.5" />
                          {pack.is_active ? 'Archive' : 'Restore'}
                        </button>
                        <div className="h-px bg-[#2a2a2a] my-1" />
                        <button 
                          onClick={() => handleDeleteWorkPack(pack.id!)}
                          className="w-full px-3 py-2 text-left text-[13px] text-red-400 
                                         hover:bg-[#2a2a2a] rounded transition-colors flex items-center gap-2">
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {filteredWorkPacks.length === 0 && !loading && (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-[#1a1a1a] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-10 h-10 text-gray-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No work packs found</h3>
          <p className="text-gray-500">Try adjusting your filters or search query</p>
        </div>
      )}

      {/* Edit/Create Work Pack Modal */}
      <CreateWorkPackModal
        isOpen={editModalOpen}
        onClose={() => {
          console.log('CreateWorkPackModal onClose called');
          setEditModalOpen(false);
          setSelectedWorkPackId(null);
        }}
        workPackId={selectedWorkPackId}
        onSuccess={loadData}
      />
    </div>
  );
}; 