import React, { useState } from 'react';
import { ChevronDown, Grid3x3, Table, List, Calendar, TrendingUp, Filter, Users, FileText } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface View {
  id: string;
  name: string;
  icon: React.ReactNode;
  shortcut?: string;
  position: number; // Price position: 0.0 (redline) to 1.0 (cap)
}

interface AirtableSidebarProps {
  selectedView: string;
  onViewChange: (viewId: string, position: number) => void;
  estimateTotal?: number; // Pass in the current estimate total
  capTotal?: number; // CAP pricing total
  redlineTotal?: number; // Redline pricing total
}

export const AirtableSidebar: React.FC<AirtableSidebarProps> = ({
  selectedView,
  onViewChange,
  estimateTotal = 0,
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
      icon: <Grid3x3 className="w-3.5 h-3.5" />,
      shortcut: 'C',
      position: 1.0 // CAP pricing (maximum)
    },
    { 
      id: 'busy', 
      name: 'Busy Season (60%)', 
      icon: <Calendar className="w-3.5 h-3.5" />,
      shortcut: 'B',
      position: 0.6 // Busy season pricing (+20% margin)
    },
    { 
      id: 'competitive', 
      name: 'Competitive (35%)', 
      icon: <List className="w-3.5 h-3.5" />,
      shortcut: 'P',
      position: 0.35 // Competitive pricing
    },
    { 
      id: 'slow', 
      name: 'Slow Season (25%)', 
      icon: <Calendar className="w-3.5 h-3.5" />,
      shortcut: 'S',
      position: 0.25 // Slow season discount
    },
    { 
      id: 'need', 
      name: 'Need Job (10%)', 
      icon: <Filter className="w-3.5 h-3.5" />,
      shortcut: 'N',
      position: 0.1 // Need this job (minimal margin)
    },
    { 
      id: 'redline', 
      name: 'Redline (0%)', 
      icon: <Users className="w-3.5 h-3.5" />,
      shortcut: 'R',
      position: 0.0 // Redline (sales rep makes $0)
    }
  ];

  return (
    <div className="w-[220px] bg-[#1d1f25] border-r border-[#3c3d51] flex flex-col h-screen">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#3c3d51]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-gray-300">Views</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <button className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

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
              <span className="opacity-60">{view.icon}</span>
              <span className="flex-1 text-left">{view.name}</span>
              {view.shortcut && (
                <span className={`text-[10px] px-1 py-0.5 rounded ${
                  selectedView === view.id 
                    ? 'bg-white/20 text-white/80' 
                    : 'bg-[#3c3d51] text-gray-500'
                }`}>
                  {view.shortcut}
                </span>
              )}
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

      {/* Bottom Actions */}
      <div className="border-t border-[#3c3d51] p-3 space-y-2">
        <button className="w-full px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          <span>Share view</span>
        </button>
        <button className="w-full px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" />
          <span>View settings</span>
        </button>
      </div>
    </div>
  );
};