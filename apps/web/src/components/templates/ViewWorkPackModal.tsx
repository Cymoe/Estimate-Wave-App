import React, { useState, useEffect } from 'react';
import { X, Package, DollarSign, CheckSquare, FileText, Clock, Building, MoreVertical, TrendingUp, Calendar, Layers } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { supabase } from '../../lib/supabase';

interface ViewWorkPackModalProps {
  isOpen: boolean;
  onClose: () => void;
  workPackId: string | null;
  onEdit?: (packId: string) => void;
}

export const ViewWorkPackModal: React.FC<ViewWorkPackModalProps> = ({ isOpen, onClose, workPackId, onEdit }) => {
  const [workPack, setWorkPack] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'tasks' | 'expenses' | 'analytics'>('products');

  console.log('ViewWorkPackModal render - isOpen:', isOpen, 'workPackId:', workPackId);

  useEffect(() => {
    if (isOpen && workPackId) {
      console.log('ViewWorkPackModal: Loading work pack details for ID:', workPackId);
      loadWorkPackDetails();
    }
  }, [isOpen, workPackId]);

  const loadWorkPackDetails = async () => {
    try {
      setLoading(true);
      
      // Load work pack with all related data
      const { data: workPackData, error } = await supabase
        .from('work_packs')
        .select(`
          *,
          category:project_categories(name, icon),
          tasks:work_pack_tasks(*),
          expenses:work_pack_expenses(*),
          items:work_pack_items(
            *,
            line_item:line_items(*),
            product:products(*)
          ),
          documents:work_pack_document_templates(
            *,
            document_template:document_templates(*)
          )
        `)
        .eq('id', workPackId)
        .single();

      if (!error && workPackData) {
        setWorkPack(workPackData);
      }
    } catch (error) {
      console.error('Error loading work pack details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'budget':
        return 'bg-[#0d2818] text-[#4ade80] border-[#4ade80]/20';
      case 'standard':
        return 'bg-[#1a1a1a] text-[#999] border-[#666]/20';
      case 'premium':
        return 'bg-[#2d2006] text-[#5b8fc7] border-[#336699]/20';
      default:
        return 'bg-[#1a1a1a] text-[#666] border-[#666]/20';
    }
  };

  const getCategoryIcon = (category?: string) => {
    const icons: Record<string, string> = {
      'Bathroom': '🚿',
      'Kitchen': '🍳',
      'Flooring': '🏠',
      'Electrical': '⚡',
      'Plumbing': '🔧',
      'Painting': '🎨',
      'Roofing': '🏗️',
      'HVAC': '❄️'
    };
    return icons[category || ''] || '📦';
  };

  const getExpenseIcon = (category: string) => {
    const icons: Record<string, string> = {
      'Material': '🧱',
      'Labor': '👷',
      'Equipment': '🔨',
      'Permits': '📋',
      'Subcontractor': '🤝',
      'Other': '📦'
    };
    return icons[category] || '💰';
  };

  if (!isOpen) {
    console.log('ViewWorkPackModal: Not rendering because isOpen is false');
    return null;
  }

  console.log('ViewWorkPackModal: Rendering modal');

  const stats = {
    totalValue: workPack?.base_price || 0,
    productsCount: workPack?.items?.length || 0,
    tasksCount: workPack?.tasks?.length || 0,
    expensesCount: workPack?.expenses?.length || 0,
    usageCount: 15 // Mock for now
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[10001]" onClick={onClose}>
      <div className="fixed inset-0 flex items-center justify-center z-[10002] p-4">
        <div 
          className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl w-full max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699]"></div>
            </div>
          ) : (
            <>
              {/* DEBUG BANNER - REMOVE AFTER TESTING */}
              <div className="bg-blue-600 text-white text-center py-2 text-sm font-bold">
                VIEW WORK PACK MODAL - READ ONLY
              </div>

              {/* Header */}
              <div className="px-8 py-6 border-b border-[#1a1a1a]">
                <div className="flex justify-between items-start">
                  <div className="flex gap-6">
                    {/* Icon */}
                    <div className="w-20 h-20 border border-[#2a2a2a] rounded-xl bg-[#111] flex items-center justify-center text-3xl font-bold text-[#666]">
                      {workPack?.name?.substring(0, 2).toUpperCase()}
                    </div>
                    
                    {/* Info */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-4">
                        <h1 className="text-[32px] font-bold text-white tracking-tight">{workPack?.name}</h1>
                        <span className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md border ${getTierStyle(workPack?.tier)}`}>
                          {workPack?.tier}
                        </span>
                      </div>
                      <div className="text-base text-[#666]">{workPack?.category?.name}</div>
                      <p className="text-sm text-[#999] max-w-[600px] leading-relaxed">{workPack?.description}</p>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        // TODO: Implement use in project
                        onClose();
                      }}
                      className="px-5 py-2.5 bg-[#336699] text-white rounded-lg text-sm font-semibold hover:bg-[#2a5580] transition-all"
                    >
                      Use in Project
                    </button>
                    <button
                      onClick={() => {
                        if (onEdit && workPackId) {
                          onEdit(workPackId);
                        }
                      }}
                      className="px-5 py-2.5 bg-transparent border border-[#2a2a2a] text-[#999] hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] rounded-lg text-sm font-medium transition-all"
                    >
                      Edit
                    </button>
                    <button className="w-10 h-10 bg-transparent border border-[#2a2a2a] text-[#999] hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] rounded-lg flex items-center justify-center transition-all">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="px-8 py-6 bg-[#111] border-b border-[#1a1a1a]">
                <div className="grid grid-cols-5 gap-6">
                  <div className="flex flex-col gap-1 pr-6 border-r border-[#1a1a1a]">
                    <span className="text-[11px] uppercase tracking-[0.5px] text-[#666]">Total Value</span>
                    <span className="text-2xl font-bold text-white">{formatCurrency(stats.totalValue)}</span>
                    <span className="text-xs text-[#666]">base price</span>
                  </div>
                  <div className="flex flex-col gap-1 pr-6 border-r border-[#1a1a1a]">
                    <span className="text-[11px] uppercase tracking-[0.5px] text-[#666]">Products</span>
                    <span className="text-2xl font-bold text-white">{stats.productsCount}</span>
                    <span className="text-xs text-[#666]">included</span>
                  </div>
                  <div className="flex flex-col gap-1 pr-6 border-r border-[#1a1a1a]">
                    <span className="text-[11px] uppercase tracking-[0.5px] text-[#666]">Tasks</span>
                    <span className="text-2xl font-bold text-white">{stats.tasksCount}</span>
                    <span className="text-xs text-[#666]">to complete</span>
                  </div>
                  <div className="flex flex-col gap-1 pr-6 border-r border-[#1a1a1a]">
                    <span className="text-[11px] uppercase tracking-[0.5px] text-[#666]">Expenses</span>
                    <span className="text-2xl font-bold text-white">{stats.expensesCount}</span>
                    <span className="text-xs text-[#666]">additional</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-[0.5px] text-[#666]">Used In</span>
                    <span className="text-2xl font-bold text-white">{stats.usageCount}</span>
                    <span className="text-xs text-[#666]">projects</span>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="px-8 border-b border-[#2a2a2a]">
                <div className="flex gap-8">
                  {[
                    { id: 'products', label: 'Products', count: stats.productsCount },
                    { id: 'tasks', label: 'Tasks', count: stats.tasksCount },
                    { id: 'expenses', label: 'Expenses', count: stats.expensesCount },
                    { id: 'analytics', label: 'Analytics', count: null }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`relative py-3 text-sm font-medium transition-all flex items-center gap-2 ${
                        activeTab === tab.id
                          ? 'text-white'
                          : 'text-[#666] hover:text-[#999]'
                      }`}
                    >
                      {tab.label}
                      {tab.count !== null && (
                        <span className="text-xs text-[#666]">({tab.count})</span>
                      )}
                      {activeTab === tab.id && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#336699]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                {/* Products Tab */}
                {activeTab === 'products' && (
                  <div className="grid gap-4">
                    {workPack?.items?.map((item: any) => (
                      <div key={item.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6 hover:bg-[#151515] hover:border-[#2a2a2a] transition-all">
                        <div className="flex justify-between items-start mb-5">
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-1">
                              {item.product?.name || item.line_item?.name || 'Unknown Item'}
                            </h3>
                            <div className="text-[13px] text-[#666]">
                              Quantity: {item.quantity} • {item.product?.category || 'Product'}
                            </div>
                          </div>
                          <div className="text-2xl font-bold text-[#5b8fc7]">
                            {formatCurrency(item.price * item.quantity)}
                          </div>
                        </div>
                        
                        {item.product?.description && (
                          <div className="pt-5 border-t border-[#1a1a1a]">
                            <div className="text-xs uppercase tracking-[0.5px] text-[#666] mb-3">Product Details</div>
                            <p className="text-sm text-[#999] leading-relaxed">{item.product.description}</p>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {(!workPack?.items || workPack.items.length === 0) && (
                      <div className="text-center py-12 text-[#666]">
                        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">No products included in this work pack</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tasks Tab */}
                {activeTab === 'tasks' && (
                  <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6">
                    {workPack?.tasks?.map((task: any, index: number) => (
                      <div key={task.id} className={`flex gap-4 py-4 ${index < workPack.tasks.length - 1 ? 'border-b border-[#1a1a1a]' : ''}`}>
                        <div className="w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center text-sm font-semibold text-[#666]">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="text-[15px] text-white mb-1">{task.title}</div>
                          {task.description && (
                            <div className="text-[13px] text-[#666] leading-relaxed">{task.description}</div>
                          )}
                        </div>
                        {task.estimated_hours > 0 && (
                          <div className="text-[13px] text-[#666] flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {task.estimated_hours} {task.estimated_hours === 1 ? 'hour' : 'hours'}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {(!workPack?.tasks || workPack.tasks.length === 0) && (
                      <div className="text-center py-12 text-[#666]">
                        <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">No tasks defined for this work pack</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Expenses Tab */}
                {activeTab === 'expenses' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {workPack?.expenses?.map((expense: any) => (
                      <div key={expense.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-5 hover:bg-[#151515] hover:border-[#2a2a2a] transition-all">
                        <div className="w-10 h-10 bg-[#1a1a1a] rounded-lg flex items-center justify-center text-xl mb-3">
                          {getExpenseIcon(expense.category)}
                        </div>
                        <div className="text-[15px] font-semibold text-white mb-1">{expense.description}</div>
                        <div className="text-[13px] text-[#666] mb-3">{expense.vendor || expense.category}</div>
                        <div className="text-xl font-bold text-[#5b8fc7]">{formatCurrency(expense.amount)}</div>
                      </div>
                    ))}
                    
                    {(!workPack?.expenses || workPack.expenses.length === 0) && (
                      <div className="col-span-full text-center py-12 text-[#666]">
                        <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">No additional expenses defined</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Analytics Tab */}
                {activeTab === 'analytics' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Usage Chart Placeholder */}
                    <div className="lg:col-span-2 bg-[#111] border border-[#1a1a1a] rounded-xl p-6 h-[300px] flex items-center justify-center text-[#666]">
                      <div className="text-center">
                        <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">Usage analytics coming soon</p>
                      </div>
                    </div>
                    
                    {/* Recent Projects */}
                    <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6">
                      <div className="text-sm font-semibold uppercase tracking-[0.5px] mb-5 pb-3 border-b border-[#1a1a1a]">
                        Recent Projects Using This Pack
                      </div>
                      <div className="space-y-3">
                        {[
                          { name: 'Johnson Master Bath', date: '2 days ago', amount: 13450 },
                          { name: 'Chen Bathroom Remodel', date: '1 week ago', amount: 12800 },
                          { name: 'Williams Guest Bath', date: '2 weeks ago', amount: 11200 }
                        ].map((project, idx) => (
                          <div key={idx} className="flex justify-between items-center py-3 border-b border-[#1a1a1a] last:border-0">
                            <div>
                              <div className="text-sm text-white">{project.name}</div>
                              <div className="text-xs text-[#666]">{project.date}</div>
                            </div>
                            <span className="text-sm font-medium">{formatCurrency(project.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-8 py-4 border-t border-[#2a2a2a] flex items-center justify-between">
                <div className="text-[13px] text-[#666]">
                  Last updated 3 days ago • Work Pack ID: {workPackId?.substring(0, 8)}...
                </div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-transparent border border-[#2a2a2a] text-[#999] hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] rounded-lg text-sm font-medium transition-all">
                    Duplicate Pack
                  </button>
                  <button className="px-4 py-2 bg-transparent border border-[#2a2a2a] text-[#999] hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] rounded-lg text-sm font-medium transition-all">
                    Export Template
                  </button>
                  <button className="px-4 py-2 bg-transparent border border-[#2a2a2a] text-[#999] hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] rounded-lg text-sm font-medium transition-all">
                    Version History
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}; 