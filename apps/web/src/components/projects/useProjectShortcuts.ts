import { useCallback, useEffect, useState } from 'react';
import { ProjectService } from '../../services/ProjectService';
import { ExpenseService } from '../../services/ExpenseService';
import { formatCurrency } from '../../utils/format';

/** A project as the sidebar shortcuts and their hover preview show it. */
export interface ProjectShortcut {
  id: string;
  name: string;
  client: string;
  clientId?: string;
  status: string;
  /** Share of the budget spent so far (0 without a budget). */
  progress: number;
  budget?: number;
  spent: number;
  startDate?: string;
  endDate?: string;
  updatedAt: string;
  recentActivities: { id: string; type: string; description: string; timestamp: string }[];
}

const OPEN = new Set(['active', 'planned', 'on-hold']);

function relativeDay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The organization's projects with what they have spent, for the sidebar:
 * open jobs first, most recently touched first.
 */
export function useProjectShortcuts(organizationId: string | undefined) {
  const [projects, setProjects] = useState<ProjectShortcut[]>([]);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [list, expenses] = await Promise.all([
        ProjectService.list(organizationId),
        ExpenseService.list(organizationId).catch(() => []),
      ]);
      const shortcuts = list.map((project): ProjectShortcut => {
        const own = expenses.filter((e) => e.project_id === project.id);
        const spent = own.reduce((sum, e) => sum + e.amount, 0);
        const touched = [project.updated_at ?? project.created_at ?? '', ...own.map((e) => e.created_at ?? '')].sort().pop() ?? '';
        return {
          id: project.id!,
          name: project.name,
          client: project.client?.company_name || project.client?.name || '',
          clientId: project.client_id,
          status: project.status,
          progress: project.budget ? Math.round((spent / project.budget) * 100) : 0,
          budget: project.budget,
          spent,
          startDate: project.start_date,
          endDate: project.end_date,
          updatedAt: touched,
          recentActivities: own.slice(0, 3).map((e) => ({
            id: e.id,
            type: 'expense',
            description: `${e.description}: ${formatCurrency(e.amount)}${e.status === 'paid' ? ' (paid)' : ''}`,
            timestamp: relativeDay(e.date),
          })),
        };
      });
      shortcuts.sort(
        (a, b) => Number(OPEN.has(b.status)) - Number(OPEN.has(a.status)) || b.updatedAt.localeCompare(a.updatedAt),
      );
      setProjects(shortcuts);
    } catch (error) {
      console.error('Error loading project shortcuts:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    setProjects([]);
    refresh();
  }, [refresh]);

  return { projects, refresh };
}
