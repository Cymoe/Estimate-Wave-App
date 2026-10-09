import React, { useState } from 'react';
import { formatCurrency } from '../../utils/format';

interface View {
  id: string;
  name: string;
  position: number; // Price position: 0.0 (redline) to 1.0 (cap)
}

interface AirtableSidebarProps {
  onViewChange: (viewId: string, position: number) => void;
  itemsTotal?: number; // Current total of the line items (before tax)
  capTotal?: number; // CAP pricing total
  redlineTotal?: number; // Redline pricing total
}

export const AirtableSidebar: React.FC<AirtableSidebarProps> = ({
  onViewChange,
  itemsTotal = 0,
  capTotal = 0,
  redlineTotal = 0
}) => {
  const [hoveredView, setHoveredView] = useState<string | null>(null);
  
  // Calculate commission (margin above redline)
  const calculateCommission = (position: number) => {
    if (redlineTotal === 0) return 0;
    // Calculate the current total based on position
    const currentTotal = redlineTotal + (capTotal - redlineTotal) * position;
    // Commission is simply Current Total - Redline Total
    return Math.max(0, currentTotal - redlineTotal);
  };
  const views: View[] = [
    { 
      id: 'cap', 
      name: 'CAP Price (100%)', 
      position: 1.0 // CAP pricing (maximum)
    },
    { 
      id: 'busy', 
      name: 'Busy Season (60%)', 
      position: 0.6 // Busy season pricing (+20% margin)
    },
    { 
      id: 'competitive', 
      name: 'Competitive (35%)', 
      position: 0.35 // Competitive pricing
    },
    { 
      id: 'slow', 
      name: 'Slow Season (25%)', 
      position: 0.25 // Slow season discount
    },
    { 
      id: 'need', 
      name: 'Need Job (10%)', 
      position: 0.1 // Need this job (minimal margin)
    },
    { 
      id: 'redline', 
      name: 'Redline (0%)', 
      position: 0.0 // Redline (sales rep makes $0)
    }
  ];

  // Highlight the option the current prices match (none after manual price edits).
  const currentPosition = capTotal > redlineTotal ? (itemsTotal - redlineTotal) / (capTotal - redlineTotal) : null;
  const selectedView = currentPosition === null
    ? null
    : views.find(view => Math.abs(view.position - currentPosition) < 0.005)?.id ?? null;

  return (
    <div className="w-[220px] bg-[#1d1f25] border-r border-[#3c3d51] flex flex-col h-screen">
      {/* Views List */}
      <div className="flex-1 overflow-y-auto py-1">
        {views.map((view) => (
          <div key={view.id} className="relative">
            <button
              onClick={() => onViewChange(view.id, view.position)}
              onMouseEnter={() => setHoveredView(view.id)}
              onMouseLeave={() => setHoveredView(null)}
              className={`w-full px-3 py-1.5 flex items-center gap-2 text-[13px] transition-colors ${
                selectedView === view.id 
                  ? 'bg-[#2563eb] text-white' 
                  : 'text-gray-300 hover:bg-[#2a2b3e] hover:text-white'
              }`}
            >
              <span className="flex-1 text-left">{view.name}</span>
            </button>
            
            {/* Commission Tooltip */}
            {hoveredView === view.id && capTotal > 0 && redlineTotal > 0 && (
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
                <div className="bg-black/90 text-white text-xs px-3 py-2 rounded-md whitespace-nowrap border border-gray-700">
                  <div className="font-medium mb-1">Commission</div>
                  <div className={`text-sm font-mono ${
                    view.position === 0 ? 'text-red-400' : 
                    view.position > 0.6 ? 'text-green-400' : 
                    view.position > 0.3 ? 'text-yellow-400' : 'text-orange-400'
                  }`}>
                    {formatCurrency(calculateCommission(view.position))}
                  </div>
                  {view.position === 0 && (
                    <div className="text-[10px] text-gray-400 mt-1">No commission at redline</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
};