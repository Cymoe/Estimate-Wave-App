import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FolderOpen, Gavel, Package, UserPlus } from 'lucide-react';
import { FEATURES } from '../../config/features';

// Springs a little past where it lands, then settles.
export const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export interface QuickCreateOption {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  action: () => void;
}

/**
 * What the blue + button creates, on desktop and phone alike: the work
 * and what prices it. Clients, Lead Market leads and companies are added
 * from their own pages.
 */
export function useQuickCreateOptions(): QuickCreateOption[] {
  const navigate = useNavigate();
  return [
    { id: 'lead', name: 'Lead', icon: UserPlus, action: () => navigate('/leads?new=1') },
    { id: 'estimate', name: 'Estimate', icon: FileText, action: () => navigate('/work?new=1') },
    { id: 'bid', name: 'Bid', icon: Gavel, action: () => navigate('/bids?new=1') },
    ...(FEATURES.projects
      ? [{ id: 'project', name: 'Project', icon: FolderOpen, action: () => navigate('/projects?new=1') }]
      : []),
    { id: 'item', name: 'Price book item', icon: Package, action: () => navigate('/price-book/items?new=1') },
  ];
}
