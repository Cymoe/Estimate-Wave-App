import React, { useState, useEffect } from 'react';
import { X, TrendingUp, DollarSign, Target, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface PricingItem {
  id: string;
  name: string;
  capPrice: number;
  currentPrice: number;
  redlinePrice: number;
  quantity: number;
  currentTotal: number;
  capTotal: number;
  redlineTotal: number;
}

interface PricingStrategyModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PricingItem[];
  onUpdatePrice: (itemId: string, newPrice: number) => void;
  onBulkAdjust: (position: number) => void;
}

export const PricingStrategyModal: React.FC<PricingStrategyModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdatePrice,
  onBulkAdjust
}) => {
  const [globalPosition, setGlobalPosition] = useState(1.0); // Start at CAP price
  const [showMargins, setShowMargins] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('cap');

  // Calculate totals
  const capTotal = items.reduce((sum, item) => sum + item.capTotal, 0);
  const currentTotal = items.reduce((sum, item) => sum + item.currentTotal, 0);
  const redlineTotal = items.reduce((sum, item) => sum + item.redlineTotal, 0);
  
  // Commission calculation (15% of margin)
  const margin = currentTotal - redlineTotal;
  const commission = margin * 0.15;
  const negotiationRoom = capTotal - currentTotal;

  const handleGlobalPositionChange = (position: number, strategy?: string) => {
    setGlobalPosition(position);
    if (strategy) {
      setSelectedStrategy(strategy);
    }
    onBulkAdjust(position);
  };

  const getPositionColor = (currentPrice: number, capPrice: number, redlinePrice: number) => {
    const position = (currentPrice - redlinePrice) / (capPrice - redlinePrice);
    if (position < 0.2) return 'text-red-400';
    if (position < 0.5) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getMarginPercentage = (currentPrice: number, redlinePrice: number) => {
    return ((currentPrice - redlinePrice) / redlinePrice * 100).toFixed(1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10002] flex items-center justify-center p-4">
      <div className="bg-[#1d1f25] rounded-sm border border-[#3c3d51] w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#3c3d51]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#336699] rounded-sm flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Pricing Strategy Center</h2>
              <p className="text-sm text-gray-400">Analyze margins and optimize pricing for maximum profit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#2a2a2a] rounded-sm transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="p-6 border-b border-[#3c3d51]">
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-[#25263a] rounded-sm p-4 border border-[#3c3d51]">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">CAP Total</span>
              </div>
              <div className="text-lg font-semibold text-white">{formatCurrency(capTotal)}</div>
              <div className="text-xs text-gray-500">Anchor price</div>
            </div>
            
            <div className="bg-[#25263a] rounded-sm p-4 border border-[#3c3d51]">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">Current Total</span>
              </div>
              <div className="text-lg font-semibold text-white">{formatCurrency(currentTotal)}</div>
              <div className="text-xs text-gray-500">{((currentTotal / capTotal) * 100).toFixed(0)}% of CAP</div>
            </div>
            
            <div className="bg-[#25263a] rounded-sm p-4 border border-[#3c3d51]">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">Redline Total</span>
              </div>
              <div className="text-lg font-semibold text-white">{formatCurrency(redlineTotal)}</div>
              <div className="text-xs text-gray-500">Floor price</div>
            </div>
            
            <div className="bg-[#25263a] rounded-sm p-4 border border-[#3c3d51]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">Your Commission</span>
              </div>
              <div className="text-lg font-semibold text-white">{formatCurrency(commission)}</div>
              <div className="text-xs text-gray-500">15% of margin</div>
            </div>
            
            <div className="bg-[#25263a] rounded-sm p-4 border border-[#3c3d51]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Negotiation Room</span>
              </div>
              <div className="text-lg font-semibold text-white">{formatCurrency(negotiationRoom)}</div>
              <div className="text-xs text-gray-500">Room to discount</div>
            </div>
          </div>
        </div>

        {/* Global Position Slider */}
        <div className="p-6 border-b border-[#3c3d51]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Fine-tune pricing position</h3>
          </div>
          
          <div className="relative">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={globalPosition}
              onChange={(e) => handleGlobalPositionChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>Redline (0%)</span>
              <span className="font-medium text-white">{Math.round(globalPosition * 100)}% Position</span>
              <span>CAP (100%)</span>
            </div>
          </div>
        </div>

        {/* Pricing Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#25263a] border-b border-[#3c3d51]">
                <th className="text-left py-3 px-4 font-medium text-gray-300 text-[13px] border-r border-[#3c3d51]">
                  Description
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-300 text-[13px] w-24 border-r border-[#3c3d51]">
                  Qty
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-300 text-[13px] w-32 border-r border-[#3c3d51]">
                  CAP Price
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-300 text-[13px] w-32 border-r border-[#3c3d51]">
                  Current Price
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-300 text-[13px] w-32 border-r border-[#3c3d51]">
                  Redline Price
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-300 text-[13px] w-20 border-r border-[#3c3d51]">
                  Margin %
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-300 text-[13px] w-32">
                  Current Total
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#3c3d51] bg-[#1d1f25] hover:bg-[#25263a] transition-colors">
                  <td className="py-3 px-4 text-white text-[13px] border-r border-[#3c3d51]">
                    {item.name}
                  </td>
                  <td className="py-3 px-4 text-center text-white text-[13px] border-r border-[#3c3d51]">
                    {item.quantity}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-400 text-[13px] border-r border-[#3c3d51]">
                    {formatCurrency(item.capPrice)}
                  </td>
                  <td className="py-3 px-4 text-right border-r border-[#3c3d51]">
                    <input
                      type="number"
                      step="0.01"
                      value={item.currentPrice}
                      onChange={(e) => onUpdatePrice(item.id, parseFloat(e.target.value) || 0)}
                      className={`w-full text-right bg-transparent border-none outline-none text-[13px] ${getPositionColor(item.currentPrice, item.capPrice, item.redlinePrice)}`}
                    />
                  </td>
                  <td className="py-3 px-4 text-right text-red-400 text-[13px] border-r border-[#3c3d51]">
                    {formatCurrency(item.redlinePrice)}
                  </td>
                  <td className="py-3 px-4 text-right border-r border-[#3c3d51]">
                    <span className={`text-[13px] ${getPositionColor(item.currentPrice, item.capPrice, item.redlinePrice)}`}>
                      {getMarginPercentage(item.currentPrice, item.redlinePrice)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-white text-[13px] font-medium">
                    {formatCurrency(item.currentTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[#3c3d51] flex items-center justify-between">
          <div className="text-sm text-gray-400">
            <span className="font-medium text-white">{items.length}</span> items • 
            Current position: <span className="font-medium text-white">{Math.round(globalPosition * 100)}%</span> • 
            Commission: <span className="font-medium text-green-400">{formatCurrency(commission)}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#2a2a2a] border border-[#404040] text-white rounded-sm hover:bg-[#333333] transition-colors text-sm"
            >
              Close
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#336699] text-white rounded-sm hover:bg-[#2A5580] transition-colors text-sm font-medium"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
