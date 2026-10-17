import React, { useState, useEffect, useContext } from 'react';
import { Plus, Calendar, ChevronDown, ChevronRight, Receipt, DollarSign, Building2 } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { costCodesAPI } from '../lib/api';
import { ProjectService } from '../services/ProjectService';
import { ExpenseService, type Expense as StoredExpense } from '../services/ExpenseService';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface CostCode {
  id: string;
  name: string;
  code: string;
  category: string;
}

interface Project {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  vendor: string;
  date: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  receipt_url?: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  cost_code_id?: string;
  cost_code?: CostCode;
  project?: Project;
}

export const Expenses: React.FC = () => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [stored, setStored] = useState<StoredExpense[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaid, setShowPaid] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    today: true,
    thisWeek: true,
    earlier: true
  });
  const [isCreating, setIsCreating] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    vendor: '',
    category: '',
    cost_code_id: '',
    project_id: '',
    date: todayIso()
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [selectedCostCode, setSelectedCostCode] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'date' | 'costcode' | 'project'>('date');

  useEffect(() => {
    if (user && selectedOrg?.id) {
      loadExpenses();
      loadCostCodes();
      loadProjects();
    }
  }, [user, selectedOrg?.id]);

  const loadProjects = async () => {
    if (!selectedOrg?.id) return;
    try {
      const list = await ProjectService.list(selectedOrg.id);
      setProjects(list.map((p) => ({ id: p.id!, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const loadCostCodes = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codes: any[] = await costCodesAPI.list();
      setCostCodes(codes.map((cc) => ({ id: cc._id, name: cc.name, code: cc.code, category: cc.category })));
    } catch (error) {
      console.error('Error loading cost codes:', error);
    }
  };

  /** Adds the cost code and project each expense points at. */
  const withLinks = (rows: StoredExpense[]): Expense[] =>
    rows.map((row) => ({
      ...row,
      vendor: row.vendor ?? '',
      project_id: row.project_id ?? '',
      created_at: row.created_at ?? '',
      updated_at: row.updated_at ?? '',
      cost_code: costCodes.find((cc) => cc.id === row.cost_code_id),
      project: projects.find((p) => p.id === row.project_id),
    }));
  const expenses = withLinks(stored);

  const loadExpenses = async () => {
    if (!selectedOrg?.id) return;
    try {
      setLoading(true);
      setStored(await ExpenseService.list(selectedOrg.id));
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpenseStatus = async (expenseId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    try {
      await ExpenseService.update(expenseId, { status: newStatus });
      setStored((rows) => rows.map((row) => (row.id === expenseId ? { ...row, status: newStatus } : row)));
    } catch (error) {
      console.error('Error updating expense:', error);
    }
  };

  const createExpense = async () => {
    if (!newExpense.description.trim() || !newExpense.amount) return;
    if (!selectedOrg?.id) return;
    try {
      const created = await ExpenseService.create({
        organization_id: selectedOrg.id,
        description: newExpense.description.trim(),
        amount: parseFloat(newExpense.amount),
        vendor: newExpense.vendor,
        category: newExpense.category || 'Materials',
        cost_code_id: newExpense.cost_code_id,
        date: newExpense.date,
        status: 'pending',
        project_id: newExpense.project_id,
      });
      setStored((rows) => [created, ...rows]);
      setNewExpense({
        description: '',
        amount: '',
        vendor: '',
        category: '',
        cost_code_id: '',
        project_id: '',
        date: todayIso()
      });
      setIsCreating(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not add the expense');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      createExpense();
    }
    if (e.key === 'Escape') {
      setIsCreating(false);
      setNewExpense({
        description: '',
        amount: '',
        vendor: '',
        category: '',
        cost_code_id: '',
        project_id: '',
        date: todayIso()
      });
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Materials': '#3b82f6',
      'Material': '#3b82f6',
      'Labor': '#f59e0b',
      'Equipment': '#8b5cf6',
      'Service': '#06b6d4',
      'Permits': '#10b981',
      'Subcontractor': '#ec4899',
      'Other': '#6b7280'
    };
    return colors[category] || '#6b7280';
  };

  const groupExpensesByDate = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups = {
      today: [] as Expense[],
      thisWeek: [] as Expense[],
      earlier: [] as Expense[],
      paid: [] as Expense[]
    };

    filteredExpenses.forEach(expense => {
      if (expense.status === 'paid') {
        groups.paid.push(expense);
      } else {
        const [y, m, d] = expense.date.split('-').map(Number);
        const expenseDate = new Date(y, m - 1, d);
        expenseDate.setHours(0, 0, 0, 0);
        
        if (expenseDate.getTime() === now.getTime()) {
          groups.today.push(expense);
        } else if (expenseDate > weekAgo) {
          groups.thisWeek.push(expense);
        } else {
          groups.earlier.push(expense);
        }
      }
    });

    return groups;
  };

  const setQuickDate = (option: string) => {
    const today = new Date();
    let targetDate = new Date();

    switch (option) {
      case 'today':
        targetDate = today;
        break;
      case 'yesterday':
        targetDate.setDate(today.getDate() - 1);
        break;
      case 'lastWeek':
        targetDate.setDate(today.getDate() - 7);
        break;
    }

    setNewExpense({
      ...newExpense,
      date: `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    });
    setShowDatePicker(false);
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const formatExpenseDate = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const expenseDate = new Date(y, m - 1, d);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffTime = now.getTime() - expenseDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return expenseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Filter expenses based on selected project and cost code
  const filteredExpenses = expenses.filter(expense => {
    const projectMatch = selectedProject === 'all' || expense.project_id === selectedProject;
    const costCodeMatch = selectedCostCode === 'all' || 
      expense.cost_code_id === selectedCostCode || 
      (selectedCostCode === 'no-cost-code' && !expense.cost_code_id);
    return projectMatch && costCodeMatch;
  });

  const groupedExpenses = groupExpensesByDate();
  const totalPending = filteredExpenses.filter(e => e.status !== 'paid').reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = filteredExpenses.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0);
  const totalExpenses = totalPending + totalPaid;

  // Calculate category totals
  const categoryTotals = filteredExpenses.reduce((acc, expense) => {
    const category = expense.category || 'Other';
    acc[category] = (acc[category] || 0) + expense.amount;
    return acc;
  }, {} as Record<string, number>);

  // Sort categories by total amount
  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3); // Top 3 categories

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">All Expenses</h1>
          <p className="text-gray-400">Track expenses across all your projects</p>
        </div>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-black rounded-[8px] font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            ADD EXPENSE
          </button>
        )}
      </div>

      {/* KPI Header Strip */}
      <div className="flex divide-x divide-[#2a2a2a] mb-6">
        <div className="pr-6">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Expenses</div>
          <div className="text-2xl font-semibold">{formatCurrency(totalExpenses)}</div>
          <div className="text-xs text-gray-500">({filteredExpenses.length} items)</div>
        </div>

        <div className="px-6">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Paid</div>
          <div className="text-2xl font-semibold text-green-500">{formatCurrency(totalPaid)}</div>
          <div className="text-xs text-gray-500">({totalExpenses > 0 ? Math.round((totalPaid / totalExpenses) * 100) : 0}% of total)</div>
        </div>

        <div className="px-6">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pending</div>
          <div className="text-2xl font-semibold text-yellow-500">{formatCurrency(totalPending)}</div>
          <div className="text-xs text-gray-500">(awaiting payment)</div>
        </div>

        <div className="pl-6">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Top Category</div>
          <div className="text-2xl font-semibold">
            {sortedCategories.length > 0 ? formatCurrency(sortedCategories[0][1]) : '$0.00'}
          </div>
          <div className="text-xs text-gray-500">
            ({sortedCategories.length > 0 ? sortedCategories[0][0] : 'none'})
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center bg-[#1a1a1a] rounded-lg p-1">
          <button
            onClick={() => setViewMode('date')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              viewMode === 'date' 
                ? 'bg-[#336699] text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            By Date
          </button>
          <button
            onClick={() => setViewMode('project')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              viewMode === 'project' 
                ? 'bg-[#336699] text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            By Project
          </button>
          <button
            onClick={() => setViewMode('costcode')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              viewMode === 'costcode' 
                ? 'bg-[#336699] text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            By Cost Code
          </button>
        </div>
        
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699]"
        >
          <option value="all">All Projects</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <select
          value={selectedCostCode}
          onChange={(e) => setSelectedCostCode(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699]"
        >
          <option value="all">All Cost Codes</option>
          <option value="no-cost-code">No Cost Code</option>
          {costCodes.map(cc => (
            <option key={cc.id} value={cc.id}>
              {cc.code} {cc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Expense Creation Form */}
      {isCreating && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-gray-600 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-3 h-3 text-gray-600" />
            </div>
            
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                  onKeyDown={handleKeyPress}
                  placeholder="What did you pay for?"
                  className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm min-w-0"
                  autoFocus
                />
                <input
                  type="number"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                  onKeyDown={handleKeyPress}
                  placeholder="0.00"
                  step="0.01"
                  className="w-24 bg-transparent text-white placeholder-gray-500 outline-none text-sm text-right flex-shrink-0"
                />
              </div>
              
              <div className="space-y-3">
                <input
                  type="text"
                  value={newExpense.vendor}
                  onChange={(e) => setNewExpense({...newExpense, vendor: e.target.value})}
                  onKeyDown={handleKeyPress}
                  placeholder="Vendor (optional)"
                  className="w-full bg-transparent text-gray-400 placeholder-gray-600 outline-none text-xs"
                />
                
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="flex items-center gap-1 px-3 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[4px] text-xs text-gray-300 hover:text-white focus:border-[#336699] transition-colors min-w-[90px]"
                    >
                      <Calendar className="w-3 h-3" />
                      {(() => { const [y, m, d] = newExpense.date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })()}
                    </button>
                    
                    {showDatePicker && (
                      <div className="absolute top-full mt-1 left-0 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 z-10 min-w-[160px]">
                        <div className="space-y-1">
                          <button
                            onClick={() => setQuickDate('today')}
                            className="block w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] rounded"
                          >
                            Today
                          </button>
                          <button
                            onClick={() => setQuickDate('yesterday')}
                            className="block w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] rounded"
                          >
                            Yesterday
                          </button>
                          <button
                            onClick={() => setQuickDate('lastWeek')}
                            className="block w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] rounded"
                          >
                            Last week
                          </button>
                          <div className="border-t border-[#2a2a2a] my-1"></div>
                          <input
                            type="date"
                            value={newExpense.date}
                            onChange={(e) => {
                              setNewExpense({...newExpense, date: e.target.value});
                              setShowDatePicker(false);
                            }}
                            className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded text-xs text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <select
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                    className="px-3 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[4px] text-xs text-gray-300 hover:text-white focus:border-[#336699] outline-none cursor-pointer min-w-[100px]"
                  >
                    <option value="">Materials</option>
                    <option value="Labor">Labor</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Service">Service</option>
                    <option value="Permits">Permits</option>
                    <option value="Subcontractor">Subcontractor</option>
                    <option value="Other">Other</option>
                  </select>

                  <select
                    value={newExpense.project_id}
                    onChange={(e) => setNewExpense({...newExpense, project_id: e.target.value})}
                    className="px-3 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[4px] text-xs text-gray-300 hover:text-white focus:border-[#336699] outline-none cursor-pointer min-w-[150px]"
                  >
                    <option value="">No project</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  
                  <select
                    value={newExpense.cost_code_id}
                    onChange={(e) => setNewExpense({...newExpense, cost_code_id: e.target.value})}
                    className="px-3 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-[4px] text-xs text-gray-300 hover:text-white focus:border-[#336699] outline-none cursor-pointer min-w-[200px]"
                  >
                    <option value="">No Cost Code</option>
                    {costCodes.map(cc => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code} {cc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={createExpense}
                className="px-3 py-1 bg-white hover:bg-gray-100 text-black rounded-[8px] text-xs font-medium transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewExpense({
                    description: '',
                    amount: '',
                    vendor: '',
                    category: '',
                    cost_code_id: '',
                    project_id: '',
                    date: todayIso()
                  });
                }}
                className="px-3 py-1 text-gray-500 hover:text-gray-400 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Display */}
      <div className="space-y-6">
        {/* Today's Expenses */}
        {groupedExpenses.today.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('today')}
              className="flex items-center gap-2 text-sm text-gray-400 mb-3"
            >
              {expandedSections.today ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              today
            </button>
            {expandedSections.today && (
              <div className="space-y-2">
                {groupedExpenses.today.map(expense => (
                  <ExpenseItem 
                    key={expense.id} 
                    expense={expense} 
                    onToggle={toggleExpenseStatus} 
                    formatDate={formatExpenseDate} 
                    getCategoryColor={getCategoryColor}
                    showProject={selectedProject === 'all'}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* This Week's Expenses */}
        {groupedExpenses.thisWeek.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('thisWeek')}
              className="flex items-center gap-2 text-sm text-gray-400 mb-3"
            >
              {expandedSections.thisWeek ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              this week
            </button>
            {expandedSections.thisWeek && (
              <div className="space-y-2">
                {groupedExpenses.thisWeek.map(expense => (
                  <ExpenseItem 
                    key={expense.id} 
                    expense={expense} 
                    onToggle={toggleExpenseStatus} 
                    formatDate={formatExpenseDate} 
                    getCategoryColor={getCategoryColor}
                    showProject={selectedProject === 'all'}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Earlier Expenses */}
        {groupedExpenses.earlier.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('earlier')}
              className="flex items-center gap-2 text-sm text-gray-400 mb-3"
            >
              {expandedSections.earlier ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              earlier
            </button>
            {expandedSections.earlier && (
              <div className="space-y-2">
                {groupedExpenses.earlier.map(expense => (
                  <ExpenseItem 
                    key={expense.id} 
                    expense={expense} 
                    onToggle={toggleExpenseStatus} 
                    formatDate={formatExpenseDate} 
                    getCategoryColor={getCategoryColor}
                    showProject={selectedProject === 'all'}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paid Expenses */}
        {groupedExpenses.paid.length > 0 && (
          <div className="mt-8 pt-8 border-t border-[#2a2a2a]">
            <button
              onClick={() => setShowPaid(!showPaid)}
              className="flex items-center gap-2 text-sm text-gray-500 mb-3"
            >
              {showPaid ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              paid expenses ({groupedExpenses.paid.length})
            </button>
            {showPaid && (
              <div className="space-y-2 opacity-50">
                {groupedExpenses.paid.map(expense => (
                  <ExpenseItem 
                    key={expense.id} 
                    expense={expense} 
                    onToggle={toggleExpenseStatus} 
                    formatDate={formatExpenseDate} 
                    getCategoryColor={getCategoryColor}
                    showProject={selectedProject === 'all'}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredExpenses.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No expenses found</p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-black rounded-[8px] text-sm font-medium transition-colors"
          >
            Add First Expense
          </button>
        </div>
      )}
    </div>
  );
};

// Expense Item Component
const ExpenseItem: React.FC<{
  expense: Expense;
  onToggle: (id: string, status: string) => void;
  formatDate: (date: string) => string;
  getCategoryColor: (category: string) => string;
  showProject?: boolean;
}> = ({ expense, onToggle, formatDate, getCategoryColor, showProject = false }) => {
  const isPaid = expense.status === 'paid';
  
  return (
    <div className="flex items-start gap-3 group hover:bg-[#0a0a0a] p-2 -mx-2 rounded transition-colors">
      <button
        onClick={() => onToggle(expense.id, expense.status)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          isPaid
            ? 'bg-green-500 border-green-500'
            : 'border-gray-600 hover:border-gray-400'
        }`}
      >
        {isPaid && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <span className={`text-sm ${isPaid ? 'line-through text-gray-500' : 'text-white'}`}>
            {expense.description}
          </span>
          <span className={`text-sm font-semibold ${isPaid ? 'text-gray-500' : 'text-white'}`}>
            {formatCurrency(expense.amount)}
          </span>
        </div>
        
        <div className="flex items-center gap-3 mt-1">
          {showProject && expense.project && (
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {expense.project.name}
            </span>
          )}
          {expense.vendor && (
            <span className="text-xs text-gray-500">{expense.vendor}</span>
          )}
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(expense.date)}
          </span>
          {expense.category && (
            <span 
              className="text-xs px-2 py-0.5 rounded"
              style={{ 
                backgroundColor: `${getCategoryColor(expense.category)}20`,
                color: getCategoryColor(expense.category)
              }}
            >
              {expense.category}
            </span>
          )}
          {expense.cost_code && (
            <span 
              className="text-xs px-2 py-0.5 rounded"
              style={{ 
                backgroundColor: `${getCategoryColor(expense.cost_code.category)}20`,
                color: getCategoryColor(expense.cost_code.category)
              }}
            >
              {expense.cost_code.code}
            </span>
          )}
          {expense.receipt_url && (
            <a 
              href={expense.receipt_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1"
            >
              <Receipt className="w-3 h-3" />
              Receipt
            </a>
          )}
        </div>
      </div>
    </div>
  );
}; 