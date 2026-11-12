import type { ProjectTemplate } from './api';

/** "2 estimate lines · 3 tasks · 5 days", or what there is of it. */
export const templateSummary = (t: ProjectTemplate) =>
  [
    t.itemCount > 0 ? `${t.itemCount} estimate line${t.itemCount === 1 ? '' : 's'}` : null,
    t.taskCount > 0 ? `${t.taskCount} task${t.taskCount === 1 ? '' : 's'}` : null,
    t.days ? `${t.days} day${t.days === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Just the name and category';
