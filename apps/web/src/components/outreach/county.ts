// The county a company's lists are of: one remembered choice, read and changed by every county switch on the
// Outreach page (the empty page's title, the + sheet, a built list's count), so they always agree.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { outreachAPI } from '../../lib/api';
import { COUNTIES } from './presets';

const KEY = (organizationId: string) => `outreach.county.${organizationId}`;
const CHANGED = 'outreach:county-changed';
/** The first county lists can be built in: where a company starts until it picks another. */
const FIRST = COUNTIES.find((c) => c.ready)!.name;

// The counties the server says have their owners in (outreach.contacts readyCounties), on top of those always ready.
let arrived: ReadonlySet<string> = new Set();
const READY = 'outreach:counties-ready';
/** Takes the server's list of ready counties; every switch on the page hears it. */
export function setReadyCounties(names: string[] | undefined) {
  if (!names) return;
  const next = new Set(names);
  if (next.size === arrived.size && [...next].every((n) => arrived.has(n))) return;
  arrived = next;
  window.dispatchEvent(new Event(READY));
}
/** Lists can be built in the county: always for Midland, and for another once its owners are in. */
export const isReady = (name: string) => COUNTIES.some((c) => c.name === name && (c.ready || arrived.has(name)));
/** Re-renders when the ready counties change. */
export function useReadyCounties(): ReadonlySet<string> {
  return useSyncExternalStore(
    (changed) => {
      window.addEventListener(READY, changed);
      return () => window.removeEventListener(READY, changed);
    },
    () => arrived,
  );
}
const usable = (name: string | null) => (name && isReady(name) ? name : null);

function read(organizationId: string): string {
  try {
    return usable(localStorage.getItem(KEY(organizationId))) ?? FIRST;
  } catch {
    return FIRST;
  }
}

/** This device's copy, so the county shows at once before the company's arrives; every switch on the page hears a change. */
function remember(organizationId: string, name: string) {
  try {
    localStorage.setItem(KEY(organizationId), name);
  } catch {
    // Private browsing: it lasts for this visit.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * The company's working county and a way to change it everywhere at once. `saved` is the company's own (from the
 * server, the same on every device): taken whenever it changes. A change is saved on the company, and kept on this
 * device so the page has it at once next time.
 */
export function useCounty(organizationId: string, saved?: string): [string, (name: string) => void] {
  const [county, setCountyState] = useState(() => usable(saved ?? null) ?? read(organizationId));
  // The company's county may be one whose owners the server says are in only after the page loads.
  const ready = useReadyCounties();
  useEffect(() => {
    setCountyState(usable(saved ?? null) ?? read(organizationId));
    const changed = () => setCountyState(read(organizationId));
    window.addEventListener(CHANGED, changed);
    return () => window.removeEventListener(CHANGED, changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, ready]);
  // The company's county, when it arrives or changes elsewhere: only on a change of it, so a pick here isn't undone while it saves.
  useEffect(() => {
    const name = usable(saved ?? null);
    if (name && name !== read(organizationId)) remember(organizationId, name);
  }, [organizationId, saved, ready]);
  const setCounty = useCallback(
    (name: string) => {
      if (!usable(name)) return;
      remember(organizationId, name);
      setCountyState(name);
      void outreachAPI.setCounty?.(organizationId, name).catch(() => {});
    },
    [organizationId],
  );
  return [county, setCounty];
}

/** The county's entry: its label, and whether its lists are in yet and its city's own records are connected. */
export const countyOf = (name: string) => COUNTIES.find((c) => c.name === name) ?? COUNTIES.find((c) => c.name === FIRST)!;
