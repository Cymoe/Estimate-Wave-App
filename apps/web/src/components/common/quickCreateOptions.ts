import { createElement, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavShapeMark, type NavShape } from '../layouts/NavShapes';
import { FEATURES } from '../../config/features';

// Springs a little past where it lands, then settles.
export const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export interface QuickCreateOption {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  action: () => void;
}

/** The nav tile's shape as an icon, so each choice looks like the section it lands in. */
function shapeIcon(shape: NavShape): ComponentType<{ className?: string }> {
  const Icon = ({ className = 'w-5 h-5' }: { className?: string }) => createElement(NavShapeMark, { shape, className });
  Icon.displayName = `ShapeIcon(${shape})`;
  return Icon;
}
const ICONS = {
  lead: shapeIcon('leads'),
  estimate: shapeIcon('estimates'),
  bid: shapeIcon('bids'),
  project: shapeIcon('projects'),
  item: shapeIcon('pricebook'),
};

/**
 * What the blue + button creates, on desktop and phone alike: the work
 * and what prices it. Clients, Lead Market leads and companies are added
 * from their own pages.
 */
export function useQuickCreateOptions(): QuickCreateOption[] {
  const navigate = useNavigate();
  return [
    { id: 'lead', name: 'Lead', icon: ICONS.lead, action: () => navigate('/leads?new=1') },
    { id: 'estimate', name: 'Estimate', icon: ICONS.estimate, action: () => navigate('/work?new=1') },
    { id: 'bid', name: 'Bid', icon: ICONS.bid, action: () => navigate('/bids?new=1') },
    ...(FEATURES.projects
      ? [{ id: 'project', name: 'Project', icon: ICONS.project, action: () => navigate('/projects?new=1') }]
      : []),
    { id: 'item', name: 'Price book item', icon: ICONS.item, action: () => navigate('/price-book/items?new=1') },
  ];
}
