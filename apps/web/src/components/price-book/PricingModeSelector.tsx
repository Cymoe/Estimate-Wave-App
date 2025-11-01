import React, { useState, useEffect, useContext } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { PricingModesService, PricingMode } from '../../services/PricingModesService';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';

interface PricingModeSelectorProps {
  onModeChange: (mode: PricingMode | null) => void;
  selectedLineItemCount?: number;
  onApplyMode: (modeId: string) => Promise<void>;
}

export const PricingModeSelector: React.FC<PricingModeSelectorProps> = ({
  onModeChange,
  selectedLineItemCount = 0,
  onApplyMode
}) => {
  const { selectedOrg } = useContext(OrganizationContext);
  const [modes, setModes] = useState<PricingMode[]>([]);
  const [currentMode, setCurrentMode] = useState<PricingMode | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [quickModes, setQuickModes] = useState<PricingMode[]>([]);

  useEffect(() => {
    if (selectedOrg?.id) {
      fetchModes();
    }
  }, [selectedOrg?.id]);

  const fetchModes = async () => {
    if (!selectedOrg?.id) return;
    
    setIsLoading(true);
    try {
      const allModes = await PricingModesService.list(selectedOrg.id);
      setModes(allModes);
      
      // Set quick access modes
      const quickModeNames = ['Competitive', 'Slow Season', 'Busy Season'];
      setQuickModes(allModes.filter(m => quickModeNames.includes(m.name)));
      
      // Only set default if no mode is currently selected
      if (!currentMode) {
        const resetToBaseline = allModes.find(m => m.name === 'Reset to Baseline');
        if (resetToBaseline) {
          setCurrentMode(resetToBaseline);
          onModeChange(resetToBaseline);
        }
      } else {
        // Ensure current mode still exists in the list
        const stillExists = allModes.find(m => m.id === currentMode.id);
        if (!stillExists) {
          // Mode was deleted or is no longer available
          const resetToBaseline = allModes.find(m => m.name === 'Reset to Baseline');
          if (resetToBaseline) {
            setCurrentMode(resetToBaseline);
            onModeChange(resetToBaseline);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching pricing modes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMode = async (mode: PricingMode) => {
    setCurrentMode(mode);
    onModeChange(mode);
    setIsOpen(false);
    // Immediately trigger the apply action
    await onApplyMode(mode.id);
  };

  const handleQuickApply = async (mode: PricingMode) => {
    try {
      setCurrentMode(mode);
      onModeChange(mode);
      await onApplyMode(mode.id);
    } catch (error) {
      console.error('Error applying mode:', error);
    }
  };

  const getModeDescription = (mode: PricingMode): string => {
    if (mode.adjustments.all) {
      const percentage = Math.round((mode.adjustments.all - 1) * 100);
      return percentage > 0 ? `+${percentage}%` : `${percentage}%`;
    }
    
    // For complex adjustments, show a summary
    const adjustments = Object.entries(mode.adjustments)
      .filter(([key, value]) => key !== 'all' && value !== 1)
      .map(([key, value]) => {
        const percentage = Math.round((value - 1) * 100);
        return `${key}: ${percentage > 0 ? '+' : ''}${percentage}%`;
      });
    
    return adjustments.slice(0, 2).join(', ') + (adjustments.length > 2 ? '...' : '');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        Loading pricing modes...
      </div>
    );
  }


  const getModeColor = (modeName: string): string => {
    switch (modeName) {
      case 'Hail Mary':
        return 'bg-red-400';
      case 'Busy Season':
        return 'bg-yellow-400';
      case 'Market Rate':
        return 'bg-gray-400';
      case 'Competitive':
        return 'bg-blue-400';
      case 'Slow Season':
        return 'bg-cyan-400';
      case 'Need This Job':
        return 'bg-green-400';
      case 'Reset to Baseline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  // Only show selector when items are selected
  if (selectedLineItemCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      {/* Current Mode Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-[#252525] hover:bg-[#333333] text-white border border-[#333333] transition-colors w-full sm:min-w-[200px]"
        >
          <span className="text-lg">{currentMode?.icon || '📊'}</span>
          <span className="text-sm font-medium flex-1 text-left truncate">{currentMode?.name || 'Select Pricing Mode'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 sm:left-0 sm:right-auto mt-1 w-full sm:w-72 bg-[#1A1A1A] border border-[#333333] shadow-xl z-50 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {/* Preset Modes */}
              <div className="p-2">
                <p className="text-xs text-gray-500 px-2 py-1">System Presets</p>
                {modes.filter(m => m.is_preset && m.name !== 'Market Rate').map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => handleSelectMode(mode)}
                    className={`w-full flex items-start gap-3 p-2 rounded hover:bg-[#252525] transition-colors ${
                      currentMode?.id === mode.id ? 'bg-[#252525]' : ''
                    }`}
                  >
                    <span className="text-lg flex-shrink-0">{mode.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-white">{mode.name}</div>
                      <div className="text-xs text-gray-400">{mode.description}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{getModeDescription(mode)}</div>
                    </div>
                    {mode.win_rate !== undefined && (
                      <div className="text-xs text-green-400">
                        {mode.win_rate}% win
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Custom Modes */}
              {modes.some(m => !m.is_preset) && (
                <>
                  <div className="border-t border-[#333333] my-2"></div>
                  <div className="p-2">
                    <p className="text-xs text-gray-500 px-2 py-1">Custom Modes</p>
                    {modes.filter(m => !m.is_preset).map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => handleSelectMode(mode)}
                        className={`w-full flex items-start gap-3 p-2 rounded hover:bg-[#252525] transition-colors ${
                          currentMode?.id === mode.id ? 'bg-[#252525]' : ''
                        }`}
                      >
                        <span className="text-lg flex-shrink-0">{mode.icon}</span>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium text-white">{mode.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{getModeDescription(mode)}</div>
                        </div>
                        {mode.win_rate !== undefined && (
                          <div className="text-xs text-green-400">
                            {mode.win_rate}% win
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      
      <span className="text-sm text-gray-400 text-center sm:text-left">Apply pricing to {selectedLineItemCount} items</span>
    </div>
  );
};