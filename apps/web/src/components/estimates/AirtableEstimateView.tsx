import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../../utils/format';

interface AirtableItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  original_price?: number;
  unit?: string;
  total: number;
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
  onEditPrice
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
    <div className="w-full bg-[#0A0A0A] flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto pb-12">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0 z-10">
              <tr className="bg-[#1D1F25] border-b border-[#333333]">
            <th className="text-left py-2 px-3 font-medium text-gray-300 text-[13px] border-r border-[#333333]">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">A</span>
                <span>Description</span>
              </div>
            </th>
            <th className="text-right py-2 px-3 font-medium text-gray-300 text-[13px] w-32 border-r border-[#333333]">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-gray-500">$</span>
                <span>Unit Price</span>
              </div>
            </th>
            <th className="text-center py-2 px-3 font-medium text-gray-300 text-[13px] w-28 border-r border-[#333333]">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-gray-500">123</span>
                <span>Quantity</span>
              </div>
            </th>
            <th className="text-right py-2 px-3 font-medium text-gray-300 text-[13px] w-32 border-r border-[#333333]">
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
                className="border-b border-[#333333] bg-[#0A0A0A] hover:bg-[#22272d] transition-colors"
              >
              
              {/* Name Cell - opens the item's pricing editor when there is one */}
              <td
                className={`py-1.5 px-3 text-white text-[13px] font-normal border-r border-[#333333] ${onEditPrice ? 'cursor-pointer' : ''}`}
                onClick={onEditPrice ? () => onEditPrice(item.id) : undefined}
              >
                <div className={`px-1 py-0.5 -mx-1 -my-0.5 ${onEditPrice ? 'hover:bg-[#22272d] rounded-sm' : ''}`}>
                  {item.name}
                </div>
              </td>
              
              {/* Price Cell */}
              <td 
                className="py-1.5 px-3 text-right text-white text-[13px] font-normal cursor-pointer border-r border-[#333333]"
                onClick={() => onEditPrice ? onEditPrice(item.id) : handleCellClick(item.id, 'price', item.price)}
              >
                {editingCell?.itemId === item.id && editingCell?.field === 'price' ? (
                  <input
                    ref={inputRef}
                    type="number"
                    step="0.01"
                    value={editingCell.value}
                    onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                    onBlur={handleCellUpdate}
                    onKeyDown={handleKeyDown}
                    className="w-full px-1 py-0.5 bg-[#0A0A0A] border border-[#336699] rounded-sm outline-none text-white text-right text-[13px]"
                  />
                ) : (
                  <div className='hover:bg-[#22272d] px-1 py-0.5 -mx-1 -my-0.5 rounded-sm inline-block cursor-pointer'>
                    {formatCurrency(item.price)}
                  </div>
                )}
              </td>
              
              {/* Quantity Cell */}
              <td 
                className="py-1.5 px-3 text-center text-white text-[13px] font-normal cursor-pointer border-r border-[#333333]"
                onClick={() => handleCellClick(item.id, 'quantity', item.quantity)}
              >
                {editingCell?.itemId === item.id && editingCell?.field === 'quantity' ? (
                  <input
                    ref={inputRef}
                    type="number"
                    step="1"
                    value={editingCell.value}
                    onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                    onBlur={handleCellUpdate}
                    onKeyDown={handleKeyDown}
                    className="w-full px-1 py-0.5 bg-[#0A0A0A] border border-[#336699] rounded-sm outline-none text-white text-center text-[13px]"
                  />
                ) : (
                  <div className='hover:bg-[#22272d] px-1 py-0.5 -mx-1 -my-0.5 rounded-sm inline-block cursor-pointer'>
                    {item.quantity}
                  </div>
                )}
              </td>
              
              {/* Total Cell */}
              <td className="py-1.5 px-3 text-right text-white text-[13px] font-normal border-r border-[#333333]">
                {formatCurrency(item.total)}
              </td>
              
            </tr>
          ))}
          
            {/* Add Row Button */}
            {isEditable && (
              <tr className="border-b border-[#333333] hover:bg-[#22272d]">
                <td colSpan={6} className="border-r border-[#333333]">
                <button
                  onClick={onAddItem}
                  className="w-full text-left py-1.5 px-3 text-gray-500 text-[13px] hover:text-gray-300 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">Add...</span>
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
          <div className="flex items-center text-[12px] font-medium">
            <div className="w-20 py-2 px-3 text-gray-500 border-r border-[#333333] text-center">
              {items.length} items
            </div>
            <div className="flex-1 py-2 px-3 text-right text-gray-500 border-r border-[#333333]">
              Sum
            </div>
            <div className="w-32 py-2 px-3 text-right text-gray-300 border-r border-[#333333]">
              {formatCurrency(subtotal)}
            </div>
            <div className="w-28 py-2 px-3 text-center text-gray-300 border-r border-[#333333]">
              {items.reduce((sum, item) => sum + (item.quantity || 0), 0)}
            </div>
            <div className="w-32 py-2 px-3 text-right border-r border-[#333333] flex flex-col items-end">
              <span className="text-gray-300">{formatCurrency(total)}</span>
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