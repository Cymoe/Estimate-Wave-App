import { expensesAPI } from '../lib/api';

export type ExpenseStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export const EXPENSE_CATEGORIES = [
  'Materials',
  'Labor',
  'Equipment',
  'Service',
  'Permits',
  'Subcontractor',
  'Disposal',
  'Other',
] as const;

export interface Expense {
  id: string;
  organization_id: string;
  user_id?: string;
  project_id?: string;
  description: string;
  amount: number;
  category: string;
  vendor?: string;
  date: string;
  status: ExpenseStatus;
  cost_code_id?: string;
  receipt_url?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseSummary {
  count: number;
  total: number;
  paid: number;
  pending: number;
  unpaid: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

/** A Convex expense in the snake_case shape the screens read. */
export function toExpense(doc: Doc): Expense {
  return {
    id: doc._id,
    organization_id: doc.organizationId,
    user_id: doc.userId,
    project_id: doc.projectId,
    description: doc.description,
    amount: doc.amount,
    category: doc.category,
    vendor: doc.vendor,
    date: doc.date,
    status: doc.status,
    cost_code_id: doc.costCodeId,
    receipt_url: doc.receiptUrl,
    notes: doc.notes,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

/** The screens' fields as Convex fields (empty strings clear a field). */
function toConvex(expense: Partial<Expense>) {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value === undefined) return;
    out[key] = typeof value === 'string' && value.trim() === '' ? null : value;
  };
  set('projectId', expense.project_id);
  set('description', expense.description);
  if (expense.amount !== undefined) out.amount = Number(expense.amount);
  set('category', expense.category);
  set('vendor', expense.vendor);
  set('date', expense.date);
  set('status', expense.status);
  set('costCodeId', expense.cost_code_id);
  set('receiptUrl', expense.receipt_url);
  set('notes', expense.notes);
  return out;
}

/** Paid counts as paid; pending and approved as pending; rejected as unpaid. */
export function paymentState(status: ExpenseStatus): 'paid' | 'pending' | 'unpaid' {
  if (status === 'paid') return 'paid';
  if (status === 'pending' || status === 'approved') return 'pending';
  return 'unpaid';
}

export function summarize(expenses: Expense[]): ExpenseSummary {
  const sum = (state: 'paid' | 'pending' | 'unpaid') =>
    expenses.filter((e) => paymentState(e.status) === state).reduce((total, e) => total + e.amount, 0);
  return {
    count: expenses.length,
    total: expenses.reduce((total, e) => total + e.amount, 0),
    paid: sum('paid'),
    pending: sum('pending'),
    unpaid: sum('unpaid'),
  };
}

/** Expenses, stored in Convex. */
export class ExpenseService {
  static async list(organizationId: string, projectId?: string): Promise<Expense[]> {
    return (await expensesAPI.list(organizationId, projectId)).map(toExpense);
  }

  static async create(expense: Omit<Expense, 'id' | 'created_at' | 'updated_at'>): Promise<Expense> {
    return toExpense(await expensesAPI.create(expense.organization_id, toConvex(expense)));
  }

  static async update(id: string, updates: Partial<Expense>): Promise<Expense> {
    return toExpense(await expensesAPI.update(id, toConvex(updates)));
  }

  static async delete(id: string): Promise<void> {
    await expensesAPI.delete(id);
  }
}
