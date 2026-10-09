import React from 'react';
import { IndustryPicker } from './IndustryPicker';

interface IndustryManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The trade picker as a side panel in the dashboard layout. */
export const IndustryManagementDrawer: React.FC<IndustryManagementDrawerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return <div className="w-full h-full" />;
  }
  return (
    <div className="w-full h-full bg-[#1D1F25] border-l border-[#333333] flex flex-col overflow-hidden">
      <IndustryPicker isOpen={isOpen} onClose={onClose} />
    </div>
  );
};
