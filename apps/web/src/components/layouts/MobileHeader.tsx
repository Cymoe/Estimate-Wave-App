import React from 'react';
import { Menu, MessageSquare, Plus } from 'lucide-react';

interface MobileHeaderProps {
  onMenuClick: () => void;
  onChatClick: () => void;
  onCreateClick: () => void;
  isChatOpen: boolean;
  title?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  onMenuClick,
  onChatClick,
  onCreateClick,
  isChatOpen,
  title = 'Dashboard'
}) => {
  const [isEstimateCartOpen, setIsEstimateCartOpen] = React.useState(false);

  // Listen for estimate cart toggle events
  React.useEffect(() => {
    const handleCartToggle = (event: CustomEvent) => {
      setIsEstimateCartOpen(event.detail.isOpen);
    };

    window.addEventListener('estimateCartToggle', handleCartToggle as EventListener);
    return () => {
      window.removeEventListener('estimateCartToggle', handleCartToggle as EventListener);
    };
  }, []);

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 bg-[#000000] border-b border-[#333333] z-[9997]">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Menu Button */}
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-[#1E1E1E] rounded-[4px] transition-colors"
        >
          <Menu className="h-5 w-5 text-white" />
        </button>

        {/* Title */}
        <h1 className="text-white font-medium text-lg">{title}</h1>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Create Button - Hide when EstimateCart is open */}
          {!isEstimateCartOpen && (
            <button
              onClick={onCreateClick}
              className="p-2 bg-[#F9D71C] hover:bg-[#e9c91c] rounded-[4px] transition-colors"
            >
              <Plus className="h-4 w-4 text-[#121212]" />
            </button>
          )}

          {/* Chat Button */}
          <button
            onClick={onChatClick}
            className={`relative p-2 ${isChatOpen ? 'bg-[#336699]' : 'bg-[#2A2A2A]'} hover:bg-[#336699] rounded-[4px] transition-colors`}
          >
            <MessageSquare className={`h-4 w-4 ${isChatOpen ? 'text-white' : 'text-gray-400'}`} />
            {!isChatOpen && (
              <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#F9D71C] rounded-full animate-pulse"></div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}; 