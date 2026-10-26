import React, { useContext } from 'react';
import { LayoutContext } from '../layouts/DashboardLayout';

export interface StatItem {
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'default' | 'green' | 'yellow' | 'red';
  isMonospace?: boolean;
  priority?: 'high' | 'medium' | 'low'; // For responsive hiding
}

interface StatsBarProps {
  stats: StatItem[];
  className?: string;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats, className = '' }) => {
  const { isMinimal, isConstrained, isCompact } = useContext(LayoutContext);

  const formatValue = (value: string | number, isMonospace?: boolean) => {
    const className = isMonospace ? 'font-mono' : '';
    return <span className={className}>{value}</span>;
  };

  const getColorClass = (color?: string) => {
    switch (color) {
      case 'green':
        return 'text-green-400';
      case 'yellow':
        return 'text-[#5b8fc7]';
      case 'red':
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };

  // Filter stats based on available space
  const getVisibleStats = () => {
    if (isMinimal) {
      // In minimal mode, show all stats but with very short labels
      return stats.map(stat => ({
        ...stat,
        label: getShortLabel(stat.label),
        subValue: undefined // Hide sub-values to save space
      }));
    } else if (isConstrained) {
      // In constrained mode, show all stats but with shorter labels and no sub-values
      return stats.map(stat => ({
        ...stat,
        label: getMediumLabel(stat.label),
        subValue: undefined
      }));
    } else if (isCompact) {
      // Show all stats but hide subValues in compact mode
      return stats.map(stat => ({ ...stat, subValue: undefined }));
    }
    return stats;
  };

  // Helper functions for responsive labels
  const getShortLabel = (label: string) => {
    const shortLabels: { [key: string]: string } = {
      'OUTSTANDING': 'OUT',
      'OVERDUE': 'DUE',
      'COLLECTED': 'PAID',
      'AVG INVOICE': 'AVG'
    };
    return shortLabels[label] || label.slice(0, 3);
  };

  const getMediumLabel = (label: string) => {
    const mediumLabels: { [key: string]: string } = {
      'OUTSTANDING': 'OUTSTANDING',
      'OVERDUE': 'OVERDUE', 
      'COLLECTED': 'COLLECTED',
      'AVG INVOICE': 'AVG'
    };
    return mediumLabels[label] || label;
  };

  const visibleStats = getVisibleStats();

  return (
    <div className={`bg-[#121212] border-b border-[#333333] ${className}`}>
      <div className={`${isMinimal ? 'px-4 py-2' : isConstrained ? 'px-4 py-2' : 'px-6 py-3'}`}>
        <div className={`flex items-center justify-between ${
          isMinimal ? 'gap-2' : isConstrained ? 'gap-3' : 'gap-6'
        }`}>
          {visibleStats.map((stat, index) => (
            <div key={index} className={`flex flex-col ${
              isMinimal || isConstrained ? 'min-w-0 flex-1' : ''
            }`}>
              <span className={`text-gray-400 uppercase tracking-wide font-medium mb-1 ${
                isMinimal ? 'text-[10px]' : 'text-xs'
              } ${isMinimal || isConstrained ? 'truncate' : ''}`}>
                {stat.label}
              </span>
              <span className={`font-medium ${getColorClass(stat.color)} ${
                isMinimal ? 'text-sm' : isConstrained ? 'text-base' : 'text-lg'
              }`}>
                {formatValue(stat.value, stat.isMonospace)}
              </span>
              {/* Show sub-value below the main value */}
              {stat.subValue && (
                <span className={`text-gray-500 mt-0.5 truncate ${
                  isMinimal ? 'text-[10px]' : 'text-xs'
                }`}>
                  {stat.subValue}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 