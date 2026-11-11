// The list picker's helpers: the lists opened lately on this device, and a list's progress in words.

import type { OutreachListSummary } from '../../lib/api';

const RECENT_KEY = 'outreach.recentLists';

/** The lists opened last on this device, newest first. */
export function recentLists(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function rememberList(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentLists().filter((x) => x !== id)].slice(0, 6)));
  } catch {
    // Private browsing: no recents.
  }
}

/** How many owners a list reaches: its whole ask, not just the ones loaded so far ("569", or "1,000+" for the top of a longer one). */
export const ownerTotal = (l: OutreachListSummary) => `${Math.max(l.total ?? 0, l.rowCount).toLocaleString('en-US')}${l.truncated ? '+' : ''}`;

/** "125 owners · 4 new · 2 worked · 1 sent · 0 sold": how far a list has got, and what it picked up on its own lately. */
export const listProgress = (l: OutreachListSummary) =>
  [`${ownerTotal(l)} owners`, ...(l.fresh ? [`${l.fresh.count} new`] : []), `${l.done} worked`, ...(l.results && l.results.sent > 0 ? [`${l.results.sent} sent`, `${l.results.sold} sold`] : [])].join(' · ');

/** The page's name for the owners on no list (kept from deleted lists because they were worked), in place of a list's id. */
export const UNLISTED = 'unlisted';
