import React from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useQuickCreateOptions } from '../common/quickCreateOptions';

interface MobileCreateMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const HINTS: Record<string, string> = {
  lead: 'Someone asking about work',
  estimate: 'Price a job',
  project: 'Start a job',
};

export const MobileCreateMenu: React.FC<MobileCreateMenuProps> = ({ isOpen, onClose }) => {
  const options = useQuickCreateOptions();
  if (!isOpen) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="md:hidden fixed inset-0 z-[10002]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      {/* Menu Sheet - slides up from bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#1A2332] rounded-t-[16px] shadow-xl">
        {/* Handle */}
        <div className="flex justify-center py-2">
          <div className="w-12 h-1 bg-gray-400 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-4">
          <h2 className="text-white font-medium text-lg">Create New</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#232D3F] rounded-[4px] transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* The same choices as the yellow + button on a wider screen. */}
        <div className="px-4 pb-8 space-y-2">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => handleAction(option.action)}
                className="flex items-center w-full px-4 py-4 text-white hover:bg-[#232D3F] transition-colors rounded-[4px]"
              >
                <span className="text-[#336699] mr-4 w-8 h-8 flex items-center justify-center">
                  <Icon size={20} />
                </span>
                <div className="text-left flex-1">
                  <div className="font-medium">New {option.name.toLowerCase()}</div>
                  <div className="text-sm text-gray-400">{HINTS[option.id]}</div>
                </div>
                <ChevronRight className="ml-auto text-gray-400" size={20} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}; 