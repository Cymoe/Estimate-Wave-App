import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, DollarSign, Clock, Users, Briefcase, Calendar, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/format';
import { format } from 'date-fns';

interface CategoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string;
  categoryName: string;
  dateRange: { days: number | null; label: string };
}

interface ProjectDetail {
  id: string;
  name: string;
  client_name: string;
  status: string;
  budget: number;
  actual_cost: number;
  profit: number;
  profit_margin: number;
  start_date: string;
  end_date: string;
  completion_percentage: number;
  task_count: number;
  completed_tasks: number;
}

interface ExpenseBreakdown {
  category: string;
  amount: number;
  percentage: number;
  project_count: number;
}

export const CategoryDetailModal: React.FC<CategoryDetailModalProps> = ({
  isOpen,
  onClose,
  categoryId,
  categoryName,
  dateRange
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdown[]>([]);
  const [categoryStats, setCategoryStats] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    totalProfit: 0,
    avgProfitMargin: 0,
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    avgProjectDuration: 0,
    totalTasks: 0,
    completedTasks: 0,
    topClient: { name: '', revenue: 0 },
    bestPerformingProject: { name: '', profit: 0 }
  });
  const [selectedTab, setSelectedTab] = useState<'overview' | 'projects' | 'expenses' | 'timeline'>('overview');

  useEffect(() => {
    if (isOpen && categoryId && user) {
      loadCategoryDetails();
    }
  }, [isOpen, categoryId, user, dateRange]);

  const loadCategoryDetails = async () => {
    try {
      setLoading(true);

      // Get date filter
      const startDate = dateRange.days 
        ? new Date(Date.now() - dateRange.days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Get all projects for this category
      let projectQuery = supabase
        .from('projects')
        .select(`
          *,
          client:clients(name),
          tasks(id, status),
          expenses(amount, expense_category)
        `)
        .eq('user_id', user?.id)
        .eq('category_id', categoryId);

      if (startDate) {
        projectQuery = projectQuery.gte('created_at', startDate);
      }

      const { data: projectsData, error: projError } = await projectQuery;
      if (projError) throw projError;

      // Process project data
      const processedProjects: ProjectDetail[] = [];
      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalTasks = 0;
      let completedTasks = 0;
      const expenseMap: Record<string, { amount: number; count: number }> = {};
      const clientRevenue: Record<string, number> = {};

      for (const project of projectsData || []) {
        const projectExpenses = project.expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0;
        const projectRevenue = project.budget || 0;
        const profit = projectRevenue - projectExpenses;
        const profitMargin = projectRevenue > 0 ? (profit / projectRevenue) * 100 : 0;
        const projectTasks = project.tasks || [];
        const projectCompletedTasks = projectTasks.filter((t: any) => t.status === 'completed').length;

        // Aggregate expense categories
        project.expenses?.forEach((expense: any) => {
          if (!expenseMap[expense.expense_category]) {
            expenseMap[expense.expense_category] = { amount: 0, count: 0 };
          }
          expenseMap[expense.expense_category].amount += expense.amount;
          expenseMap[expense.expense_category].count += 1;
        });

        // Track client revenue
        const clientName = project.client?.name || 'Unknown';
        clientRevenue[clientName] = (clientRevenue[clientName] || 0) + projectRevenue;

        processedProjects.push({
          id: project.id,
          name: project.name,
          client_name: clientName,
          status: project.status,
          budget: projectRevenue,
          actual_cost: projectExpenses,
          profit,
          profit_margin: profitMargin,
          start_date: project.start_date,
          end_date: project.end_date,
          completion_percentage: project.completion_percentage || 0,
          task_count: projectTasks.length,
          completed_tasks: projectCompletedTasks
        });

        totalRevenue += projectRevenue;
        totalExpenses += projectExpenses;
        totalTasks += projectTasks.length;
        completedTasks += projectCompletedTasks;
      }

      setProjects(processedProjects);

      // Calculate expense breakdown
      const expenseBreakdownData = Object.entries(expenseMap)
        .map(([category, data]) => ({
          category,
          amount: data.amount,
          percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
          project_count: data.count
        }))
        .sort((a, b) => b.amount - a.amount);

      setExpenseBreakdown(expenseBreakdownData);

      // Find top client and best project
      const topClient = Object.entries(clientRevenue)
        .sort(([, a], [, b]) => b - a)[0] || ['', 0];
      
      const bestProject = processedProjects
        .sort((a, b) => b.profit - a.profit)[0];

      // Calculate average project duration
      const durations = processedProjects.map(p => {
        const start = new Date(p.start_date);
        const end = new Date(p.end_date);
        return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      });
      const avgDuration = durations.length > 0 
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
        : 0;

      setCategoryStats({
        totalRevenue,
        totalExpenses,
        totalProfit: totalRevenue - totalExpenses,
        avgProfitMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
        totalProjects: processedProjects.length,
        activeProjects: processedProjects.filter(p => p.status === 'active').length,
        completedProjects: processedProjects.filter(p => p.status === 'completed').length,
        avgProjectDuration: avgDuration,
        totalTasks,
        completedTasks,
        topClient: { name: topClient[0], revenue: topClient[1] as number },
        bestPerformingProject: { 
          name: bestProject?.name || '', 
          profit: bestProject?.profit || 0 
        }
      });

    } catch (error) {
      console.error('Error loading category details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#333333] rounded-[4px] w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1E1E1E]">
          <div>
            <h2 className="text-xl font-bold">{categoryName.toUpperCase()} CATEGORY DETAILS</h2>
            <p className="text-sm text-gray-400 mt-1">{dateRange.label}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#404040] rounded-[4px] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1E1E1E]">
          {(['overview', 'projects', 'expenses', 'timeline'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-6 py-3 text-sm font-medium uppercase transition-colors relative ${
                selectedTab === tab
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
              {selectedTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#336699]" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#336699]"></div>
            </div>
          ) : (
            <>
              {selectedTab === 'overview' && (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <DollarSign className="w-5 h-5 text-[#336699]" />
                        <span className="text-xs text-[#388E3C]">
                          +{((categoryStats.totalRevenue / categoryStats.totalProjects) * 0.12).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Total Revenue</p>
                      <p className="text-xl font-mono font-semibold">{formatCurrency(categoryStats.totalRevenue)}</p>
                    </div>

                    <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                      <TrendingUp className="w-5 h-5 text-[#388E3C] mb-2" />
                      <p className="text-xs text-gray-400 uppercase mb-1">Net Profit</p>
                      <p className="text-xl font-mono font-semibold text-[#388E3C]">
                        {formatCurrency(categoryStats.totalProfit)}
                      </p>
                      <p className="text-xs text-gray-400">{categoryStats.avgProfitMargin.toFixed(1)}% margin</p>
                    </div>

                    <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                      <Briefcase className="w-5 h-5 text-[#5b8fc7] mb-2" />
                      <p className="text-xs text-gray-400 uppercase mb-1">Active Projects</p>
                      <p className="text-xl font-semibold">{categoryStats.activeProjects}</p>
                      <p className="text-xs text-gray-400">of {categoryStats.totalProjects} total</p>
                    </div>

                    <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                      <Clock className="w-5 h-5 text-[#9E9E9E] mb-2" />
                      <p className="text-xs text-gray-400 uppercase mb-1">Avg Duration</p>
                      <p className="text-xl font-semibold">{Math.round(categoryStats.avgProjectDuration)} days</p>
                      <p className="text-xs text-gray-400">per project</p>
                    </div>
                  </div>

                  {/* Highlights */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                      <h4 className="font-medium mb-3">TOP CLIENT</h4>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg">{categoryStats.topClient.name || 'No data'}</p>
                          <p className="text-sm text-gray-400">Revenue generated</p>
                        </div>
                        <p className="text-xl font-mono text-[#336699]">
                          {formatCurrency(categoryStats.topClient.revenue)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                      <h4 className="font-medium mb-3">BEST PERFORMING PROJECT</h4>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg">{categoryStats.bestPerformingProject.name || 'No data'}</p>
                          <p className="text-sm text-gray-400">Profit generated</p>
                        </div>
                        <p className="text-xl font-mono text-[#388E3C]">
                          {formatCurrency(categoryStats.bestPerformingProject.profit)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Task Completion */}
                  <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                    <h4 className="font-medium mb-3">TASK COMPLETION RATE</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Completed Tasks</span>
                        <span className="font-mono">{categoryStats.completedTasks} / {categoryStats.totalTasks}</span>
                      </div>
                      <div className="w-full h-3 bg-[#333333] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#336699] transition-all duration-300"
                          style={{ 
                            width: `${categoryStats.totalTasks > 0 
                              ? (categoryStats.completedTasks / categoryStats.totalTasks) * 100 
                              : 0}%` 
                          }}
                        />
                      </div>
                      <p className="text-right text-sm font-medium">
                        {categoryStats.totalTasks > 0 
                          ? ((categoryStats.completedTasks / categoryStats.totalTasks) * 100).toFixed(1)
                          : 0}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {selectedTab === 'projects' && (
                <div className="space-y-4">
                  {projects.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No projects found in this category</p>
                    </div>
                  ) : (
                    projects.map((project) => (
                      <div key={project.id} className="bg-[#1E1E1E] rounded-[4px] p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-medium text-lg">{project.name}</h3>
                            <p className="text-sm text-gray-400">{project.client_name}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-[2px] text-xs font-medium ${
                            project.status === 'completed' 
                              ? 'bg-[#388E3C]/20 text-[#388E3C]'
                              : project.status === 'active'
                              ? 'bg-[#336699]/20 text-[#336699]'
                              : 'bg-[#9E9E9E]/20 text-[#9E9E9E]'
                          }`}>
                            {project.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-gray-400 uppercase mb-1">Budget</p>
                            <p className="font-mono">{formatCurrency(project.budget)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase mb-1">Actual Cost</p>
                            <p className="font-mono">{formatCurrency(project.actual_cost)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase mb-1">Profit</p>
                            <p className={`font-mono ${project.profit >= 0 ? 'text-[#388E3C]' : 'text-[#D32F2F]'}`}>
                              {formatCurrency(project.profit)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase mb-1">Margin</p>
                            <p className="font-semibold">{project.profit_margin.toFixed(1)}%</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">
                            {format(new Date(project.start_date), 'MMM d, yyyy')} - {format(new Date(project.end_date), 'MMM d, yyyy')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">Tasks: {project.completed_tasks}/{project.task_count}</span>
                            <button className="text-[#336699] hover:text-white transition-colors">
                              View Details <ChevronRight className="inline w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedTab === 'expenses' && (
                <div className="space-y-6">
                  <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                    <h4 className="font-medium mb-4">EXPENSE BREAKDOWN BY CATEGORY</h4>
                    <div className="space-y-3">
                      {expenseBreakdown.map((expense, index) => (
                        <div key={expense.category}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm">{expense.category}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-gray-400">
                                {expense.project_count} project{expense.project_count !== 1 ? 's' : ''}
                              </span>
                              <span className="font-mono">{formatCurrency(expense.amount)}</span>
                            </div>
                          </div>
                          <div className="w-full h-2 bg-[#333333] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#336699] transition-all duration-300"
                              style={{ width: `${expense.percentage}%` }}
                            />
                          </div>
                          <p className="text-right text-xs text-gray-400 mt-1">
                            {expense.percentage.toFixed(1)}% of total
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                    <h4 className="font-medium mb-3">EXPENSE SUMMARY</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Total Expenses</p>
                        <p className="text-xl font-mono">{formatCurrency(categoryStats.totalExpenses)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Avg per Project</p>
                        <p className="text-xl font-mono">
                          {formatCurrency(categoryStats.totalProjects > 0 
                            ? categoryStats.totalExpenses / categoryStats.totalProjects 
                            : 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="bg-[#1E1E1E] rounded-[4px] p-4">
                    <h4 className="font-medium mb-4">PROJECT TIMELINE</h4>
                    <div className="space-y-3">
                      {projects
                        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                        .map((project, index) => (
                          <div key={project.id} className="flex items-center gap-4">
                            <div className="flex-shrink-0 w-32 text-right text-sm text-gray-400">
                              {format(new Date(project.start_date), 'MMM d, yyyy')}
                            </div>
                            <div className="flex-shrink-0 w-2 h-2 bg-[#336699] rounded-full" />
                            <div className="flex-1">
                              <p className="font-medium">{project.name}</p>
                              <p className="text-sm text-gray-400">
                                Duration: {Math.round((new Date(project.end_date).getTime() - new Date(project.start_date).getTime()) / (1000 * 60 * 60 * 24))} days
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              <span className={`text-sm font-mono ${
                                project.profit >= 0 ? 'text-[#388E3C]' : 'text-[#D32F2F]'
                              }`}>
                                {formatCurrency(project.profit)}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}; 