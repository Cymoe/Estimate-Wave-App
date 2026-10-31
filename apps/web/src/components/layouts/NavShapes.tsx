import React from 'react';

/**
 * Plain geometric marks for the nav tiles: one simple shape per section,
 * drawn in the tile's text color so the active tile goes white with its label.
 */
export type NavShape = 'profit' | 'leads' | 'bids' | 'marketplace' | 'vault' | 'report' | 'estimates' | 'pricebook' | 'projects';

const SHAPES: Record<NavShape, React.ReactNode> = {
  // A rising line: money over time.
  profit: <polyline points="3,17 9,11 13,14 21,6" />,
  // A dot in a ring: a lead coming in.
  leads: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </>
  ),
  // A triangle pointing up: a bid going up.
  bids: <polygon points="12,4 20,19 4,19" />,
  // A diamond: something traded.
  marketplace: <polygon points="12,3 21,12 12,21 3,12" />,
  // A square inside a square: a safe.
  vault: (
    <>
      <rect x="4" y="4" width="16" height="16" />
      <rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" />
    </>
  ),
  // Three bars, short to tall: the numbers.
  report: (
    <>
      <rect x="4" y="13" width="4" height="7" />
      <rect x="10" y="9" width="4" height="11" />
      <rect x="16" y="4" width="4" height="16" />
    </>
  ),
  // A tall rectangle: a page.
  estimates: <rect x="6" y="3" width="12" height="18" />,
  // Two stacked rectangles: pages in a book.
  pricebook: (
    <>
      <rect x="4" y="7" width="12" height="14" />
      <polyline points="8,3 20,3 20,17" />
    </>
  ),
  // A house outline: a job site.
  projects: <polygon points="12,3 21,11 21,21 3,21 3,11" />,
};

export function NavShapeMark({ shape, className = 'w-5 h-5' }: { shape: NavShape; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      data-shape={shape}
    >
      {SHAPES[shape]}
    </svg>
  );
}
