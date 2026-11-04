import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface AirtableItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  original_price?: number;
  unit?: string;
  total: number;
  /** The line's type of work, shown under its name. */
  category?: string;
  /** The client picks the product for this line. */
  allowance?: boolean;
}

interface AirtableEstimateViewProps {
  items: AirtableItem[];
  onUpdateItem: (id: string, field: keyof AirtableItem, value: any) => void;
  onAddItem: () => void;
  isEditable?: boolean;
  subtotal: number;
  tax?: number;
  total: number;
  marginIndicator?: {
    position: number;
    color: string;
  };
  capTotal?: number;
  redlineTotal?: number;
  showStickyFooter?: boolean;
  /** Opens a pricing editor for the item instead of editing the price inline. */
  onEditPrice?: (itemId: string) => void;
  /** Fill the parent's height instead of the screen's. */
  fill?: boolean;
  /** The Add item row after the last line; off when the page pins its own. */
  showAddRow?: boolean;
}

interface EditingCell {
  itemId: string;
  field: keyof AirtableItem;
  value: string;
}

export const AirtableEstimateView: React.FC<AirtableEstimateViewProps> = ({
  items,
  onUpdateItem,
  onAddItem,
  isEditable = false,
  subtotal,
  tax = 0,
  total,
  marginIndicator,
  capTotal = 0,
  redlineTotal = 0,
  showStickyFooter = true,
  onEditPrice,
  fill = false,
  showAddRow = true
}) => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select once when a cell opens, not on every keystroke
  // (re-selecting made each digit replace the previous one).
  const editingKey = editingCell ? `${editingCell.itemId}:${editingCell.field}` : null;
  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingKey]);

  const handleCellClick = (itemId: string, field: keyof AirtableItem, currentValue: any) => {
    if (field === 'total' || field === 'name') return; // Total is calculated, name comes from price book - both not editable
    
    setEditingCell({
      itemId,
      field,
      value: String(currentValue)
    });
  };

  const handleCellUpdate = () => {
    if (!editingCell) return;
    
    const { itemId, field, value } = editingCell;
    
    if (field === 'quantity' || field === 'price') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        onUpdateItem(itemId, field, numValue);
      }
    } else if (field === 'name') {
      onUpdateItem(itemId, field, value);
    }
    
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleCellUpdate();
      
      // Move to next cell on Tab
      if (e.key === 'Tab' && editingCell) {
        const currentIndex = items.findIndex(item => item.id === editingCell.itemId);
        const fields: (keyof AirtableItem)[] = onEditPrice ? ['quantity'] : ['quantity', 'price']; // name isn't editable
        const fieldIndex = fields.indexOf(editingCell.field);
        
        let nextField = fields[(fieldIndex + 1) % fields.length];
        let nextItemId = editingCell.itemId;
        
        if (fieldIndex === fields.length - 1 && currentIndex < items.length - 1) {
          nextItemId = items[currentIndex + 1].id;
          nextField = fields[0];
        }
        
        const nextItem = items.find(item => item.id === nextItemId);
        if (nextItem) {
          setTimeout(() => {
            handleCellClick(nextItemId, nextField, nextItem[nextField]);
          }, 0);
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  return (
    <div className={`w-full bg-[#0A0A0A] flex flex-col ${fill ? 'h-full' : 'h-screen'}`}>
      <div className="flex-1 overflow-y-auto pb-12">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0 z-10">
              <tr className="bg-[#1D1F25] border-b border-[#333333]">
            <th className="text-left py-2.5 px-3 font-medium text-gray-300 text-[13px] sm:text-[14px] border-r border-[#333333]">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">A</span>
                <span>Description</span>
              </div>
            </th>
            <th className="text-right py-2.5 px-2 sm:px-3 font-medium text-gray-300 text-[13px] sm:text-[14px] w-24 sm:w-28 border-r border-[#333333]">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-gray-500">$</span>
                <span>Price</span>
              </div>
            </th>
            <th className="text-center py-2.5 px-2 font-medium text-gray-300 text-[13px] sm:text-[14px] w-12 sm:w-14 border-r border-[#333333]">
              <div className="flex items-center justify-center gap-1.5">
                <span>Qty</span>
              </div>
            </th>
            <th className="text-right py-2.5 px-3 font-medium text-gray-300 text-[13px] sm:text-[14px] w-28 sm:w-32 border-r border-[#333333]">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-gray-500">ƒ</span>
                <span>Total</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
              <tr
                key={item.id}
                // With a pricing drawer, the whole row opens it: items are edited there, not in the table.
                onClick={onEditPrice ? () => onEditPrice(item.id) : undefined}
                className={`border-b border-[#333333] bg-[#0A0A0A] [@media(hover:hover)]:hover:bg-[#22272d] active:bg-[#22272d] transition-colors ${onEditPrice ? 'cursor-pointer' : ''}`}
              >
              
              {/* Name Cell - opens the item's pricing editor when there is one */}
              <td className="py-3 px-3 text-white text-[15px] sm:text-[17px] leading-snug font-normal border-r border-[#333333]">
                {item.name}
                {(item.category || item.allowance) && (
                  <span className="block mt-0.5 text-[13px] sm:text-[14px] text-gray-400" data-testid="item-category">
                    {item.category}
                    {item.allowance && <span className="text-amber-300" data-testid="item-allowance">{item.category ? ' · ' : ''}Allowance</span>}
                  </span>
                )}
              </td>
              
              {/* Price Cell */}
              <td 
                className="py-3 px-2 sm:px-3 text-right text-white text-[15px] sm:text-[17px] tabular-nums whitespace-nowrap font-normal cursor-pointer border-r border-[#333333]"
                onClick={onEditPrice ? undefined : () => handleCellClick(item.id, 'price', item.price)}
              >
                {editingCell?.itemId === item.id && editingCell?.field === 'price' ? (
                  <input
                    ref={inputRef}
                    type="number" inputMode="decimal"
                    step="0.01"
                    value={editingCell.value}
                    onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                    onBlur={handleCellUpdate}
                    onKeyDown={handleKeyDown}
                    className="w-full px-1 py-0.5 bg-[#0A0A0A] border border-[#336699] rounded-sm outline-none text-white text-right text-[15px] sm:text-[17px]"
                  />
                ) : (
                  <div className={`px-1 py-0.5 -mx-1 -my-0.5 rounded-sm inline-block ${onEditPrice ? '' : 'hover:bg-[#22272d] cursor-pointer'}`}>
                    {formatCurrency(item.price)}
                  </div>
                )}
              </td>
              
              {/* Quantity Cell */}
              <td 
                className="py-3 px-2 text-center text-white text-[15px] sm:text-[17px] tabular-nums font-normal cursor-pointer border-r border-[#333333]"
                onClick={onEditPrice ? undefined : () => handleCellClick(item.id, 'quantity', item.quantity)}
              >
                {editingCell?.itemId === item.id && editingCell?.field === 'quantity' ? (
                  <input
                    ref={inputRef}
                    type="number" inputMode="decimal"
                    step="1"
                    value={editingCell.value}
                    onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                    onBlur={handleCellUpdate}
                    onKeyDown={handleKeyDown}
                    className="w-full px-1 py-0.5 bg-[#0A0A0A] border border-[#336699] rounded-sm outline-none text-white text-center text-[15px] sm:text-[17px]"
                  />
                ) : (
                  <div className={`px-1 py-0.5 -mx-1 -my-0.5 rounded-sm inline-block ${onEditPrice ? '' : 'hover:bg-[#22272d] cursor-pointer'}`}>
                    {item.quantity}
                  </div>
                )}
              </td>
              
              {/* Total Cell */}
              <td className="py-3 px-3 text-right text-white text-[15px] sm:text-[17px] tabular-nums whitespace-nowrap font-normal border-r border-[#333333]">
                {formatCurrency(item.total)}
              </td>
              
            </tr>
          ))}
          
            {/* Add Row Button */}
            {isEditable && showAddRow && (
              <tr className="border-b border-[#333333] hover:bg-[#22272d]">
                <td colSpan={6} className="border-r border-[#333333]">
                <button
                  type="button"
                  onClick={onAddItem}
                  className="w-full text-left py-3 px-3 text-[#6aa3d9] text-[15px] sm:text-[16px] font-medium hover:text-white transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add item</span>
                </button>
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
      
      {/* Fixed Summary Footer - Always visible at bottom, full width but respects sidebars */}
      {showStickyFooter && (
        <div className="sticky bottom-0 left-0 right-0 bg-[#1D1F25] border-t border-[#333333] z-20 flex-shrink-0">
          <div className="flex items-center text-[13px] sm:text-[15px] font-medium tabular-nums">
            <div className="flex-1 py-2.5 px-3 text-right text-gray-400 border-r border-[#333333]">
              {items.length} {items.length === 1 ? 'item' : 'items'} · Sum
            </div>
            <div className="w-24 sm:w-28 py-2.5 px-2 sm:px-3 text-right text-gray-300 whitespace-nowrap border-r border-[#333333]">
              {formatCurrency(subtotal)}
            </div>
            <div className="w-12 sm:w-14 py-2.5 px-2 text-center text-gray-300 border-r border-[#333333]">
              {items.reduce((sum, item) => sum + (item.quantity || 0), 0)}
            </div>
            <div className="w-28 sm:w-32 py-2.5 px-3 text-right border-r border-[#333333] flex flex-col items-end">
              <span className="text-white font-bold text-[15px] sm:text-[17px] whitespace-nowrap">{formatCurrency(total)}</span>
              {marginIndicator && redlineTotal > 0 && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-gray-500">Comm:</span>
                  <span className={`text-[11px] font-medium ${
                    total <= redlineTotal ? 'text-red-400' : 
                    total - redlineTotal > (capTotal - redlineTotal) * 0.6 ? 'text-green-400' : 
                    total - redlineTotal > (capTotal - redlineTotal) * 0.3 ? 'text-yellow-400' : 'text-orange-400'
                  }`}>
                    {formatCurrency(Math.max(0, total - redlineTotal))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};