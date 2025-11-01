import React from 'react';
import { formatCurrency } from '../../utils/format';

interface PriceRangeDisplayProps {
  price: number;
  redLinePrice?: number | null;
  basePrice?: number | null;
  capPrice?: number | null;
  condensed?: boolean;
  className?: string;
  showPosition?: boolean;
  pricePosition?: number | null;
  viewMode?: 'full' | 'simple';
}

export const PriceRangeDisplay: React.FC<PriceRangeDisplayProps> = ({
  price,
  redLinePrice,
  basePrice,
  capPrice,
  condensed = false,
  className = '',
  showPosition = false,
  pricePosition
}) => {
  // If no price range data, show single price
  const hasRange = redLinePrice !== null && redLinePrice !== undefined && 
                  capPrice !== null && capPrice !== undefined;
  
  if (!hasRange) {
    return (
      <span className={className}>
        {formatCurrency(price)}
      </span>
    );
  }

  const effectiveBase = basePrice || price;
  
  // Calculate position if not provided
  let position = pricePosition;
  if (position === null || position === undefined) {
    if (price <= redLinePrice) {
      position = 0;
    } else if (price >= capPrice) {
      position = 1;
    } else {
      // Calculate position between red line and cap
      position = (price - redLinePrice) / (capPrice - redLinePrice);
    }
  }

  // Condensed view for small spaces
  if (condensed) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <span className="text-red-400 text-xs">{formatCurrency(redLinePrice)}</span>
        <span className="text-gray-400 text-xs">–</span>
        <span className="text-green-400 font-medium">{formatCurrency(effectiveBase)}</span>
        <span className="text-gray-400 text-xs">–</span>
        <span className="text-yellow-400 text-xs">{formatCurrency(capPrice)}</span>
      </div>
    );
  }

  // Full view with labels
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-3">
        {/* RED LINE */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 uppercase">Red:</span>
          <span className="text-red-400 font-medium">{formatCurrency(redLinePrice)}</span>
        </div>
        
        {/* BASE */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 uppercase">Base:</span>
          <span className="text-green-400 font-semibold">{formatCurrency(effectiveBase)}</span>
        </div>
        
        {/* CAP */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 uppercase">Cap:</span>
          <span className="text-yellow-400 font-medium">{formatCurrency(capPrice)}</span>
        </div>
      </div>
      
      {/* Optional position indicator */}
      {showPosition && (
        <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="flex-1 bg-gradient-to-r from-red-500 to-green-500"></div>
            <div className="flex-1 bg-gradient-to-r from-green-500 to-yellow-500"></div>
          </div>
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-gray-900"
            style={{ left: `${(position * 100)}%`, marginLeft: '-6px' }}
          />
        </div>
      )}
    </div>
  );
};

// Compact version for table cells - horizontal layout
export const PriceRangeCompact: React.FC<PriceRangeDisplayProps> = (props) => {
  const { redLinePrice, basePrice, capPrice, price, viewMode = 'full' } = props;
  const hasRange = redLinePrice !== null && redLinePrice !== undefined && 
                  capPrice !== null && capPrice !== undefined;
  
  const effectiveBase = basePrice || price;
  
  // Simple mode - just show BASE price
  if (viewMode === 'simple' || !hasRange) {
    return (
      <div className="w-full flex items-center justify-end">
        <span className="font-mono font-semibold text-gray-100 text-sm">
          {formatCurrency(hasRange ? effectiveBase : price)}
        </span>
      </div>
    );
  }
  
  // Full mode - show BASE | RED | CAP
  return (
    <div className="w-full flex items-center justify-end gap-1.5 text-sm font-mono">
      <span className="text-green-400 font-semibold">{formatCurrency(effectiveBase)}</span>
      <span className="text-gray-500 text-xs">|</span>
      <span className="text-red-400/70 text-xs">{formatCurrency(redLinePrice)}</span>
      <span className="text-gray-500 text-xs">|</span>
      <span className="text-yellow-400/70 text-xs">{formatCurrency(capPrice)}</span>
    </div>
  );
};

// Tooltip content for price range
export const PriceRangeTooltip: React.FC<{
  redLinePrice: number;
  basePrice: number;
  capPrice: number;
  currentPrice: number;
}> = ({ redLinePrice, basePrice, capPrice, currentPrice }) => {
  const percentFromRedLine = ((currentPrice - redLinePrice) / (capPrice - redLinePrice) * 100).toFixed(1);
  const percentFromBase = ((currentPrice - basePrice) / basePrice * 100).toFixed(1);
  
  return (
    <div className="p-3 space-y-2">
      <div className="font-semibold text-white mb-2">Price Range Analysis</div>
      
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-gray-400">Red Line (Floor):</span>
        <span className="text-red-400">{formatCurrency(redLinePrice)}</span>
        
        <span className="text-gray-400">Base (Standard):</span>
        <span className="text-green-400">{formatCurrency(basePrice)}</span>
        
        <span className="text-gray-400">Cap (Ceiling):</span>
        <span className="text-yellow-400">{formatCurrency(capPrice)}</span>
        
        <span className="text-gray-400">Current Price:</span>
        <span className="text-white font-medium">{formatCurrency(currentPrice)}</span>
      </div>
      
      <div className="pt-2 border-t border-gray-700 text-sm">
        <div className="text-gray-400">Position in Range: <span className="text-white">{percentFromRedLine}%</span></div>
        <div className="text-gray-400">Variance from Base: <span className="text-white">{percentFromBase}%</span></div>
      </div>
    </div>
  );
};