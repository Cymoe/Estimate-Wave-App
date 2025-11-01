import { supabase } from '../lib/supabase';
import { ActivityLogService } from './ActivityLogService';

interface ExpenseTemplate {
  id: string;
  category_id: string;
  description: string;
  typical_amount: number;
  expense_category: string;
  vendor: string;
  display_order: number;
}

interface ProjectExpense {
  user_id: string;
  organization_id: string;
  project_id: string;
  description: string;
  amount: number;
  category: string;
  vendor: string;
  date: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  category_id: string;
}

export interface Expense {
  id: string;
  user_id: string;
  organization_id: string;
  project_id?: string;
  description: string;
  amount: number;
  category: string;
  vendor?: string;
  date: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  category_id?: string;
  receipt_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
  };
}

export class ExpenseService {
  /**
   * Create a new expense
   */
  static async create(expense: Omit<Expense, 'id' | 'created_at' | 'updated_at'>): Promise<Expense> {
    const { data, error } = await supabase
      .from('expenses')
      .insert(expense)
      .select(`
        *,
        project:projects(id, name)
      `)
      .single();

    if (error) throw error;

    // Log activity
    await ActivityLogService.log({
      organizationId: expense.organization_id,
      entityType: 'expense',
      entityId: data.id,
      action: 'created',
      description: `created expense ${data.description}`,
      metadata: {
        amount: data.amount,
        category: data.category,
        vendor: data.vendor || 'Unknown',
        project_name: data.project?.name || 'No project',
        status: data.status
      }
    });

    return data;
  }

  /**
   * Update an expense
   */
  static async update(id: string, updates: Partial<Expense> & { organization_id: string }): Promise<Expense> {
    // Get current expense for comparison
    const { data: currentExpense, error: fetchError } = await supabase
      .from('expenses')
      .select('*, project:projects(id, name)')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Update the expense
    const { data, error } = await supabase
      .from('expenses')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        project:projects(id, name)
      `)
      .single();

    if (error) throw error;

    // Build metadata for what changed
    const metadata: Record<string, any> = {};
    if (updates.amount !== undefined && updates.amount !== currentExpense.amount) {
      metadata.old_amount = currentExpense.amount;
      metadata.new_amount = updates.amount;
    }
    if (updates.status && updates.status !== currentExpense.status) {
      metadata.old_status = currentExpense.status;
      metadata.new_status = updates.status;
    }
    if (updates.description && updates.description !== currentExpense.description) {
      metadata.old_description = currentExpense.description;
      metadata.new_description = updates.description;
    }

    // Log activity
    await ActivityLogService.log({
      organizationId: updates.organization_id,
      entityType: 'expense',
      entityId: id,
      action: 'updated',
      description: `updated expense ${data.description}`,
      metadata
    });

    return data;
  }

  /**
   * Delete an expense
   */
  static async delete(id: string, organizationId: string): Promise<void> {
    // Get expense info before deletion
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('description, amount, category, vendor')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Delete the expense
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Log activity
    await ActivityLogService.log({
      organizationId,
      entityType: 'expense',
      entityId: id,
      action: 'deleted',
      description: `deleted expense ${expense.description}`,
      metadata: {
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        vendor: expense.vendor || 'Unknown'
      }
    });
  }

  /**
   * Generate expenses for a project based on its category templates
   */
  static async generateExpensesFromTemplates(
    projectId: string,
    categoryId: string,
    userId: string,
    organizationId: string,
    startDate: string
  ): Promise<void> {
    try {
      // Fetch expense templates for the category
      const { data: templates, error: templatesError } = await supabase
        .from('expense_templates')
        .select('*')
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .order('display_order');

      if (templatesError) throw templatesError;
      if (!templates || templates.length === 0) return;

      // Get project info for logging
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();

      // Generate expenses from templates
      const expenses: ProjectExpense[] = templates.map((template, index) => {
        // Stagger expense dates based on typical project timeline
        const expenseDate = this.calculateExpenseDate(startDate, index, templates.length);
        
        return {
          user_id: userId,
          organization_id: organizationId,
          project_id: projectId,
          description: template.description,
          amount: template.typical_amount,
          category: template.expense_category,
          vendor: template.vendor || '',
          date: expenseDate,
          status: 'pending' as const,
          category_id: categoryId
        };
      });

      // Insert all expenses
      const { data: createdExpenses, error: insertError } = await supabase
        .from('expenses')
        .insert(expenses)
        .select();

      if (insertError) throw insertError;

      // Log activity for batch creation
      await ActivityLogService.log({
        organizationId,
        entityType: 'expense',
        entityId: projectId,
        action: 'created',
        description: `generated ${expenses.length} expenses for project ${project?.name || projectId}`,
        metadata: {
          count: expenses.length,
          project_name: project?.name || 'Unknown',
          total_amount: expenses.reduce((sum, e) => sum + e.amount, 0)
        }
      });

      // Generated expenses for project
    } catch (error) {
      // Error generating expenses from templates
      throw error;
    }
  }

  /**
   * Calculate expense date based on project start date and expense order
   */
  private static calculateExpenseDate(startDate: string, index: number, totalExpenses: number): string {
    const start = new Date(startDate);
    // Distribute expenses across a typical 30-day project timeline
    const daysToAdd = Math.floor((index / totalExpenses) * 30);
    start.setDate(start.getDate() + daysToAdd);
    return start.toISOString().split('T')[0];
  }

  /**
   * Get all expenses for a project
   */
  static async getProjectExpenses(projectId: string) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: true });

    if (error) throw error;
    return data;
  }

  /**
   * Update expense status
   */
  static async updateExpenseStatus(
    expenseId: string,
    status: 'pending' | 'approved' | 'paid' | 'rejected',
    organizationId: string
  ) {
    // Get expense info for logging
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('description, status')
      .eq('id', expenseId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('expenses')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', expenseId);

    if (error) throw error;

    // Log activity
    await ActivityLogService.log({
      organizationId,
      entityType: 'expense',
      entityId: expenseId,
      action: 'status_changed',
      description: `changed expense ${expense.description} status from ${expense.status} to ${status}`,
      metadata: {
        old_status: expense.status,
        new_status: status
      }
    });
  }

  /**
   * Get expense summary for a project
   */
  static async getProjectExpenseSummary(projectId: string) {
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('amount, category, status')
      .eq('project_id', projectId);

    if (error) throw error;

    const summary = {
      total: 0,
      byCategory: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      paidTotal: 0,
      pendingTotal: 0
    };

    expenses?.forEach(expense => {
      summary.total += expense.amount;
      
      // By category
      if (!summary.byCategory[expense.category]) {
        summary.byCategory[expense.category] = 0;
      }
      summary.byCategory[expense.category] += expense.amount;

      // By status
      if (!summary.byStatus[expense.status]) {
        summary.byStatus[expense.status] = 0;
      }
      summary.byStatus[expense.status] += expense.amount;

      // Paid vs pending
      if (expense.status === 'paid') {
        summary.paidTotal += expense.amount;
      } else if (expense.status === 'pending' || expense.status === 'approved') {
        summary.pendingTotal += expense.amount;
      }
    });

    return summary;
  }
} 