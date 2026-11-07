import { useEffect } from 'react';

/**
 * The browser tab's name: "Estimates · Webb Leads", or the open record,
 * "EST-2026-002500 · Webb Leads". The layout names the page from the route;
 * a screen showing one record (an estimate, a project) names it on top, and
 * the page's name comes back when that record closes.
 */
const BRAND = 'Webb Leads';
const fallback = typeof document !== 'undefined' ? document.title : BRAND;
let routeTitle: string | null = null;
const recordTitles: string[] = [];

function apply() {
  const name = recordTitles[recordTitles.length - 1] ?? routeTitle;
  document.title = name ? `${name} · ${BRAND}` : fallback;
}

/** The page's own name; set once by the layout from the address. */
export function useRouteTitle(title: string | null) {
  useEffect(() => {
    routeTitle = title;
    apply();
    return () => {
      if (routeTitle === title) routeTitle = null;
      apply();
    };
  }, [title]);
}

/** The record on screen, while it is on screen. Nothing until it has loaded. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    recordTitles.push(title);
    apply();
    return () => {
      const at = recordTitles.lastIndexOf(title);
      if (at !== -1) recordTitles.splice(at, 1);
      apply();
    };
  }, [title]);
}

/** What the layout calls each page, from its address. */
export function titleForPath(pathname: string): string | null {
  const rules: [RegExp, string][] = [
    [/^\/leads/, 'Leads'],
    [/^\/bids/, 'Bids'],
    [/^\/marketplace/, 'Marketplace'],
    [/^\/vault/, 'The Vault'],
    [/^\/report/, 'Webb Report'],
    [/^\/plan/, 'Plan'],
    [/^\/(work|estimates)/, 'Estimates'],
    [/^\/projects/, 'Projects'],
    [/^\/clients/, 'Clients'],
    [/^\/price-book|^\/services|^\/items|^\/cost-codes/, 'Price Book'],
    [/^\/expenses/, 'Expenses'],
    [/^\/settings/, 'Settings'],
    [/^\/calls/, 'Calls'],
  ];
  return rules.find(([re]) => re.test(pathname))?.[1] ?? null;
}
