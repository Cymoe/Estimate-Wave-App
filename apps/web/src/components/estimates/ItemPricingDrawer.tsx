import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { priceAt, PriceRange, PRICING_OPTIONS } from '../../utils/priceRange';

export interface PricedItem {
  description: string;
  quantity: number;
  unit_price: number;
  red_line_price?: number;
  cap_price?: number;
}

interface ItemPricingDrawerProps {
  item: PricedItem | null;
  onClose: () => void;
  onSave: (changes: { unit_price: number; quantity: number }) => void;
}

/** The item's range. Items saved before ranges were stored have no red line (floor 0) and their price as cap. */
function rangeOf(item: PricedItem): PriceRange {
  const redLine = item.red_line_price ?? 0;
  return { redLine, cap: Math.max(item.cap_price ?? item.unit_price, redLine) };
}

/**
 * Prices one estimate item between its red line and cap: price, quantity,
 * the salesperson's commission and the pricing options. The price can't go
 * below red line.
 */
export const ItemPricingDrawer: React.FC<ItemPricingDrawerProps> = ({ item, onClose, onSave }) => {
  const [priceText, setPriceText] = useState('');
  const [quantity, setQuantity] = useState(1);
  // The drawer stays mounted and slides like the estimate drawer. It keeps
  // showing the last item while sliding out.
  const [shownItem, setShownItem] = useState<PricedItem | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!item) {
      setVisible(false);
      return;
    }
    setShownItem(item);
    setPriceText(item.unit_price.toFixed(2));
    setQuantity(item.quantity || 1);
    // Wait for the closed position to paint so the slide-in animates.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [item]);

  if (!shownItem) return null;

  const open = visible && item !== null;
  const range = rangeOf(shownItem);
  const typed = parseFloat(priceText);
  const enteredPrice = Number.isFinite(typed) ? typed : 0;
  const belowRedLine = enteredPrice < range.redLine;
  const price = Math.max(enteredPrice, range.redLine);
  const commission = (price - range.redLine) * quantity;
  const maxCommission = Math.max(range.cap - range.redLine, 0) * quantity;
  const share = maxCommission > 0 ? Math.min(commission / maxCommission, 1) : 0;

  const save = () => {
    onSave({ unit_price: price, quantity });
    onClose();
  };

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={`Price ${shownItem.description}`}
        aria-hidden={!open}
        className={`fixed right-0 top-0 h-[100dvh] w-full max-w-md bg-[#1D1F25] border-l border-[#333333] shadow-xl transform transition-transform z-[10001] flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#333333] flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">{shownItem.description}</h2>
            <p className="text-xs text-gray-400 mt-1">
              Red line {formatCurrency(range.redLine)} · Cap {formatCurrency(range.cap)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={save} className="px-5 py-2 text-sm text-white bg-[#336699] hover:bg-[#2a5580]">
              Save
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {/* Price and quantity */}
          <div className="flex gap-3">
            <label className="flex-1 min-w-0">
              <span className="block text-xs text-gray-400 mb-1.5">Price each</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value)}
                  onBlur={() => setPriceText(price.toFixed(2))}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  className="w-full pl-7 pr-3 py-2.5 bg-[#0A0A0A] border border-[#333333] text-white font-mono focus:outline-none focus:border-[#336699]"
                />
              </div>
            </label>
            <div>
              <span className="block text-xs text-gray-400 mb-1.5">Quantity</span>
              <div className="flex items-center border border-[#333333]">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="p-2.5 text-gray-300 hover:bg-[#22272d]"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setQuantity(Number.isFinite(n) && n > 0 ? n : 1);
                  }}
                  aria-label="Quantity"
                  className="w-12 py-2 bg-transparent text-center text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(q => q + 1)}
                  className="p-2.5 text-gray-300 hover:bg-[#22272d]"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          {belowRedLine && (
            <p className="text-xs text-red-400 -mt-4">
              The price can't go below red line ({formatCurrency(range.redLine)}).
            </p>
          )}

          {/* Commission */}
          <div className="border border-[#333333] p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-300">Your commission</span>
              <span className={`font-mono text-lg ${commission > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(commission)}
              </span>
            </div>
            <div className="h-1.5 bg-[#333333] mt-3">
              <div className="h-full bg-[#336699]" style={{ width: `${share * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1.5">
              <span>Red line</span>
              <span>Max at cap {formatCurrency(maxCommission)}</span>
            </div>
          </div>

          {/* Pricing options */}
          <div className="divide-y divide-[#2a2a2a] border border-[#333333]">
            {PRICING_OPTIONS.map(option => {
              const optionPrice = priceAt(range, option.position);
              const selected = Math.abs(optionPrice - price) < 0.005;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPriceText(optionPrice.toFixed(2))}
                  aria-pressed={selected}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm border-l-2 transition-colors ${
                    selected ? 'border-[#336699] bg-[#336699]/10 text-white' : 'border-transparent text-gray-300 hover:bg-[#22272d]'
                  }`}
                >
                  <span>{option.name}</span>
                  <span className="font-mono">{formatCurrency(optionPrice)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#333333] px-6 py-4 flex items-center justify-between flex-shrink-0 text-sm text-gray-400">
          <span>Total</span>
          <span className="font-mono text-white">{formatCurrency(price * quantity)}</span>
        </div>
      </div>
    </>,
    document.body,
  );
};
