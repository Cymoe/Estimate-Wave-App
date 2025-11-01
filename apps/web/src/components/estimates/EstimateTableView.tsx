import React from 'react';
import { Trash2, Plus, Minus } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface EstimateItem {
  id: string;
  product_id?: string;
  product_name?: string;
  name?: string;
  quantity: number;
  price: number;
  original_price?: number;
  description?: string;
  unit?: string;
  is_service?: boolean;
  service_items?: any[];
  line_item_count?: number;
  subtotal?: number;
}

interface EstimateTableViewProps {
  items: EstimateItem[];
  onUpdateQuantity?: (itemId: string, quantity: number) => void;
  onUpdatePrice?: (itemId: string, price: number) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddItems?: () => void;
  isEditable?: boolean;
  condensed?: boolean;
  showTotals?: boolean;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
}

export const EstimateTableView: React.FC<EstimateTableViewProps> = ({
  items,
  onUpdateQuantity,
  onUpdatePrice,
  onRemoveItem,
  onAddItems,
  isEditable = false,
  condensed = false,
  showTotals = true,
  subtotal: propSubtotal,
  discount = 0,
  tax = 0,
  total: propTotal
}) => {
  const [editingPriceId, setEditingPriceId] = React.useState<string | null>(null);
  const [tempPrice, setTempPrice] = React.useState<string>('');
  // Calculate totals if not provided
  const calculatedSubtotal = propSubtotal ?? items.reduce((sum, item) => {
    return sum + (item.subtotal || (item.price * item.quantity));
  }, 0);

  const calculatedTotal = propTotal ?? (calculatedSubtotal - discount + tax);

  return (
    <div className="bg-[#1D1F25] rounded-lg overflow-hidden">
      {/* Clean Table Header */}
      <div className="border-b border-[#333333]">
        <div className="px-6 py-4 bg-[#1a1a1a]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">Line Items</h3>
            {isEditable && onAddItems && (
              <button
                onClick={onAddItems}
                className="flex items-center gap-2 px-4 py-2 bg-[#336699] hover:bg-[#4477aa] text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Items
              </button>
            )}
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider bg-[#22272d]">
          <div className="col-span-6">Item</div>
          <div className="col-span-2 text-center">Quantity</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-[#333333]/50">
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 mb-4">No items added yet</p>
            {isEditable && onAddItems && (
              <button
                onClick={onAddItems}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#336699] hover:bg-[#4477aa] text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Your First Item
              </button>
            )}
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id || index}
              className={`grid grid-cols-12 gap-4 px-6 ${condensed ? 'py-2' : 'py-4'} items-center hover:bg-[#22272d]/50 transition-colors`}
            >
              {/* Item Details */}
              <div className="col-span-6">
                <div className="flex flex-col">
                  <span className="text-white font-medium">
                    {item.name || item.product_name || 'Unnamed Item'}
                  </span>
                  {!condensed && item.description && (
                    <span className="text-xs text-gray-400 mt-1">{item.description}</span>
                  )}
                  {item.is_service && item.line_item_count && (
                    <span className="text-xs text-blue-400 mt-1">
                      Service Package • {item.line_item_count} items
                    </span>
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div className="col-span-2">
                {isEditable && onUpdateQuantity ? (
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onUpdateQuantity(item.id, Math.max(0, item.quantity - 1))}
                      className="p-1 text-gray-400 hover:text-white hover:bg-[#333333] rounded transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-12 text-center text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      className="p-1 text-gray-400 hover:text-white hover:bg-[#333333] rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-white">
                    {item.quantity} {item.unit || ''}
                  </div>
                )}
              </div>

              {/* Unit Price - Editable */}
              <div className="col-span-2 text-right">
                {isEditable && onUpdatePrice ? (
                  editingPriceId === item.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        value={tempPrice}
                        onChange={(e) => setTempPrice(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const newPrice = parseFloat(tempPrice);
                            if (!isNaN(newPrice) && newPrice >= 0) {
                              onUpdatePrice(item.id, newPrice);
                              setEditingPriceId(null);
                            }
                          } else if (e.key === 'Escape') {
                            setEditingPriceId(null);
                          }
                        }}
                        onBlur={() => {
                          const newPrice = parseFloat(tempPrice);
                          if (!isNaN(newPrice) && newPrice >= 0) {
                            onUpdatePrice(item.id, newPrice);
                          }
                          setEditingPriceId(null);
                        }}
                        className="w-24 px-2 py-1 bg-[#333333] border border-[#555555] rounded text-white text-right font-mono text-sm focus:outline-none focus:border-[#336699]"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingPriceId(item.id);
                        setTempPrice(item.price.toString());
                      }}
                      className="text-white font-mono hover:bg-[#333333] px-2 py-1 rounded transition-colors inline-flex items-center gap-1 group"
                    >
                      <div className="flex flex-col items-end">
                        <span className={item.original_price && item.price !== item.original_price ? 'text-yellow-400' : ''}>
                          {formatCurrency(item.price)}
                        </span>
                        {item.original_price && item.price !== item.original_price && (
                          <span className="text-xs text-gray-500 line-through">
                            {formatCurrency(item.original_price)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 group-hover:text-gray-400">✎</span>
                    </button>
                  )
                ) : (
                  <div className="flex flex-col items-end">
                    <span className={`text-white font-mono ${item.original_price && item.price !== item.original_price ? 'text-yellow-400' : ''}`}>
                      {formatCurrency(item.price)}
                    </span>
                    {item.original_price && item.price !== item.original_price && (
                      <span className="text-xs text-gray-500 line-through font-mono">
                        {formatCurrency(item.original_price)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Line Total */}
              <div className="col-span-2 flex items-center justify-end gap-2">
                <span className="text-white font-mono">
                  {formatCurrency(item.subtotal || (item.price * item.quantity))}
                </span>
                {isEditable && onRemoveItem && (
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals Section */}
      {showTotals && items.length > 0 && (
        <div className="border-t-2 border-[#333333] bg-[#1a1a1a] px-6 py-4">
          <div className="space-y-2 max-w-xs ml-auto">
            {/* Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Subtotal</span>
              <span className="text-white font-mono">{formatCurrency(calculatedSubtotal)}</span>
            </div>

            {/* Discount */}
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Discount</span>
                <span className="text-red-400 font-mono">-{formatCurrency(discount)}</span>
              </div>
            )}

            {/* Tax */}
            {tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tax</span>
                <span className="text-white font-mono">{formatCurrency(tax)}</span>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between text-lg font-semibold pt-2 border-t border-[#333333]">
              <span className="text-white">Total</span>
              <span className="text-white font-mono">{formatCurrency(calculatedTotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};