import React, { useContext, useEffect } from 'react';
import { X, Activity } from 'lucide-react';
import { ActivityFeed } from './ActivityFeed';
import { OrganizationContext } from '../layouts/DashboardLayout';

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Recent Activity: the side panel from the top bar, over a dimmed page. */
export const ActivityPanel: React.FC<ActivityPanelProps> = ({ isOpen, onClose }) => {
  const { selectedOrg } = useContext(OrganizationContext);

  // Esc closes it, like the other drawers.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* The dim fades in and out with the panel. It's inline: the light theme recolours bg-black. */}
      <div
        className={`fixed inset-0 z-[9999] transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
        onClick={onClose}
        aria-hidden="true"
        data-testid="activity-backdrop"
      />

      {/* The same slide and speed as the estimate and project drawers. */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-[#1E1E1E] border-l border-[#333333] shadow-xl z-[10000] transform transition-transform flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between p-6 border-b border-[#333333] flex-shrink-0">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-[#3B82F6]" />
            <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-[#333333] rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {isOpen && <ActivityFeed organizationId={selectedOrg?.id} limit={100} compact onOpen={onClose} />}
        </div>
      </div>
    </>
  );
};
