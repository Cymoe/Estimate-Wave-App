import React, { useState } from 'react';
import { 
  ShoppingCart, 
  X, 
  Package,
  FileText,
  Download,
  Trash2,
  Calculator,
  AlertCircle,
  Plus,
  Minus
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { TemplateRow } from './TemplateRow';

interface CartItem {
  id: string;
  type: 'package' | 'template';
  name: string;
  price: number;
  quantity: number;
  unit: string;
  packageId?: string;
  templateId?: string;
  subtotal: number;
}

interface EstimateCartProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
  onCreateEstimate: () => void;
  onSaveTemplate?: () => void;
}

export const EstimateCart: React.FC<EstimateCartProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCreateEstimate,
  onSaveTemplate
}) => {
  const [showTaxOptions, setShowTaxOptions] = useState(false);
  const [taxRate, setTaxRate] = useState(8.25); // Default tax rate
  const [includeTax, setIncludeTax] = useState(true);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [notes, setNotes] = useState('');

  // Dispatch custom events when cart state changes
  React.useEffect(() => {
    const event = new CustomEvent('estimateCartToggle', { 
      detail: { isOpen } 
    });
    window.dispatchEvent(event);
  }, [isOpen]);

  // Group items by type
  const packageItems = items.filter(item => item.type === 'package');
  const templateItems = items.filter(item => item.type === 'template');

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = includeTax ? taxableAmount * (taxRate / 100) : 0;
  const total = taxableAmount + taxAmount;

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-[#1A1A1A] border-l border-[#333333] shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#333333] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-[#336699]" />
          <h2 className="text-lg font-semibold text-white">Estimate Cart</h2>
          <span className="text-sm text-gray-400">({itemCount} items)</span>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={onClearCart}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
              title="Empty cart"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <ShoppingCart className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">Your cart is empty</p>
            <p className="text-xs mt-1">Add packages or services to get started</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Packages Section */}
            {packageItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Packages
                </h3>
                <div className="space-y-2">
                  {packageItems.map(item => (
                    <div key={item.id} className="bg-[#252525] border border-[#333333] rounded p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="text-white font-medium text-sm">{item.name}</h4>
                          <div className="text-xs text-gray-400 mt-1">
                            {item.quantity} × {formatCurrency(item.price)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-white font-mono text-sm">
                            {formatCurrency(item.subtotal)}
                          </div>
                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Services Section */}
            {templateItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Individual Services
                </h3>
                <div className="space-y-2">
                  {templateItems.map(item => (
                    <div key={item.id} className="bg-[#252525] border border-[#333333] rounded p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium text-sm truncate">{item.name}</h4>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {formatCurrency(item.price)} per {item.unit}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-[#1A1A1A] rounded border border-[#333333]">
                            <button
                              onClick={() => onUpdateQuantity(item.id, Math.max(0, item.quantity - 1))}
                              className="p-1 text-gray-400 hover:text-white hover:bg-[#252525] transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 text-sm text-white min-w-[2rem] text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                              className="p-1 text-gray-400 hover:text-white hover:bg-[#252525] transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-white font-mono text-sm min-w-[4rem] text-right">
                            {formatCurrency(item.subtotal)}
                          </div>
                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">Project Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any special notes or requirements..."
                className="w-full h-20 px-3 py-2 bg-[#252525] border border-[#333333] rounded text-white text-sm focus:outline-none focus:border-[#336699] resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Pricing Summary */}
      {items.length > 0 && (
        <div className="border-t border-[#333333] p-4 space-y-3">
          {/* Subtotal */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Subtotal</span>
            <span className="text-white font-mono">{formatCurrency(subtotal)}</span>
          </div>

          {/* Discount */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Discount</span>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                className="w-12 px-1 py-0.5 bg-[#252525] border border-[#333333] rounded text-white text-xs text-center"
                min="0"
                max="100"
              />
              <span className="text-xs text-gray-500">%</span>
            </div>
            <span className="text-white font-mono">-{formatCurrency(discountAmount)}</span>
          </div>

          {/* Tax */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeTax}
                onChange={(e) => setIncludeTax(e.target.checked)}
                className="rounded border-[#333333] bg-[#252525] text-[#336699]"
              />
              <span className="text-gray-400">Tax</span>
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(Math.max(0, parseFloat(e.target.value) || 0))}
                disabled={!includeTax}
                className="w-12 px-1 py-0.5 bg-[#252525] border border-[#333333] rounded text-white text-xs text-center disabled:opacity-50"
                step="0.25"
              />
              <span className="text-xs text-gray-500">%</span>
            </div>
            <span className="text-white font-mono">
              {includeTax ? formatCurrency(taxAmount) : '$0.00'}
            </span>
          </div>

          {/* Total */}
          <div className="flex justify-between text-lg font-semibold pt-3 border-t border-[#333333]">
            <span className="text-white">Total</span>
            <span className="text-white font-mono">{formatCurrency(total)}</span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-3">
            <button
              onClick={onCreateEstimate}
              className="w-full py-2.5 bg-[#336699] text-white font-medium rounded hover:bg-[#4477aa] transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Create Estimate
            </button>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onSaveTemplate}
                className="py-2 border border-[#333333] text-gray-300 font-medium rounded hover:bg-[#252525] transition-colors flex items-center justify-center gap-1 text-sm"
              >
                <Package className="w-4 h-4" />
                Save as Template
              </button>
              
              <button
                className="py-2 border border-[#333333] text-gray-300 font-medium rounded hover:bg-[#252525] transition-colors flex items-center justify-center gap-1 text-sm"
              >
                <Download className="w-4 h-4" />
                Export Quote
              </button>
            </div>
          </div>

          {/* Help Text */}
          <div className="flex items-start gap-2 text-xs text-gray-500 pt-2">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <p>This estimate is valid for 30 days. Prices subject to change based on site conditions.</p>
          </div>
        </div>
      )}
    </div>
  );
};