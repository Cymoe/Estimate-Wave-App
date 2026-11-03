import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export type ActivityRow = {
  id: string;
  at: string;
  who: string;
  text: string;
  link?: string;
  icon: string;
  tone: string;
};

/** The rows the feed shows: live from Convex, so new activity appears as it happens. */
export function useActivity(organizationId: string | undefined, resourceType?: string, limit = 50): ActivityRow[] | undefined {
  return useQuery(
    api.activityLogs.feed,
    organizationId ? { organizationId: organizationId as Id<'organizations'>, limit, ...(resourceType ? { resourceType } : {}) } : 'skip',
  ) as ActivityRow[] | undefined;
}
