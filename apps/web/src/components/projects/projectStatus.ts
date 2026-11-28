import type { ProjectStatus } from '../../services/ProjectService';
export { formatNoteDate as formatProjectDate } from '../common/StructuredNote';

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; pill: string }[] = [
  { value: 'planned', label: 'Planned', pill: 'bg-gray-500/15 text-gray-300' },
  { value: 'active', label: 'Active', pill: 'bg-blue-500/15 text-blue-300' },
  { value: 'on-hold', label: 'On hold', pill: 'bg-yellow-500/15 text-yellow-300' },
  { value: 'completed', label: 'Completed', pill: 'bg-green-500/15 text-green-300' },
  { value: 'cancelled', label: 'Cancelled', pill: 'bg-red-500/15 text-red-300' },
];

export function projectStatusInfo(status: string) {
  return PROJECT_STATUSES.find((s) => s.value === status) ?? PROJECT_STATUSES[0];
}
