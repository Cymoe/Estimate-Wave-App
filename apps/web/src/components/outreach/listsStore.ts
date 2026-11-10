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

/** "125 owners · 2 done · 1 sent · 0 sold": how far a list has got. */
export const listProgress = (l: OutreachListSummary) =>
  [`${l.rowCount.toLocaleString('en-US')} owners`, `${l.done} done`, ...(l.results && l.results.sent > 0 ? [`${l.results.sent} sent`, `${l.results.sold} sold`] : [])].join(' · ');
