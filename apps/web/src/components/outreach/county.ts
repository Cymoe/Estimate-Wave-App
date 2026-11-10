// The county a company's lists are of: one remembered choice, read and changed by every county switch on the
// Outreach page (the empty page's title, the + sheet, a built list's count), so they always agree.

import { useCallback, useEffect, useState } from 'react';
import { COUNTIES } from './presets';

const KEY = (organizationId: string) => `outreach.county.${organizationId}`;
const CHANGED = 'outreach:county-changed';
/** The first county lists can be built in: where a company starts until it picks another. */
const FIRST = COUNTIES.find((c) => c.ready)!.name;
const usable = (name: string | null) => (name && COUNTIES.some((c) => c.name === name && c.ready) ? name : null);

function read(organizationId: string): string {
  try {
    return usable(localStorage.getItem(KEY(organizationId))) ?? FIRST;
  } catch {
    return FIRST;
  }
}

/** The company's working county and a way to change it everywhere at once; remembered on this device. */
export function useCounty(organizationId: string): [string, (name: string) => void] {
  const [county, setCountyState] = useState(() => read(organizationId));
  useEffect(() => {
    setCountyState(read(organizationId));
    const changed = () => setCountyState(read(organizationId));
    window.addEventListener(CHANGED, changed);
    return () => window.removeEventListener(CHANGED, changed);
  }, [organizationId]);
  const setCounty = useCallback(
    (name: string) => {
      if (!usable(name)) return;
      try {
        localStorage.setItem(KEY(organizationId), name);
      } catch {
        // Private browsing: it lasts for this visit.
      }
      setCountyState(name);
      window.dispatchEvent(new Event(CHANGED));
    },
    [organizationId],
  );
  return [county, setCounty];
}

/** The county's entry: its label, and whether its lists are in yet and its city's own records are connected. */
export const countyOf = (name: string) => COUNTIES.find((c) => c.name === name) ?? COUNTIES.find((c) => c.name === FIRST)!;
