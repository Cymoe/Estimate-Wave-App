import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
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
  onRemoveItem: (id: string) => void;
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
  onRemoveItem,
  isEditable = false,
  subtotal,
  tax = 0,
  total,
  marginIndicator,
  capTotal = 0,
  redlineTotal = 0,
  showStickyFooter = true
}) => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

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
        const fields: (keyof AirtableItem)[] = ['quantity', 'price']; // name removed - not editable
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
    <div className="w-full bg-[#1d1f25] flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto pb-12">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0 z-10">
              <tr className="bg-[#25263a] border-b border-[#3c3d51]">
            <th className="text-left py-2 px-3 font-medium text-gray-300 text-[13px] border-r border-[#3c3d51]">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">A</span>
                <span>Description</span>
              </div>
            </th>
            <th className="text-right py-2 px-3 font-medium text-gray-300 text-[13px] w-32 border-r border-[#3c3d51]">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-gray-500">$</span>
                <span>Unit Price</span>
              </div>
            </th>
            <th className="text-center py-2 px-3 font-medium text-gray-300 text-[13px] w-28 border-r border-[#3c3d51]">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-gray-500">123</span>
                <span>Quantity</span>
              </div>
            </th>
            <th className="text-right py-2 px-3 font-medium text-gray-300 text-[13px] w-32 border-r border-[#3c3d51]">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-gray-500">ƒ</span>
                <span>Total</span>
              </div>
            </th>
            <th className="w-10 border-r border-[#3c3d51] bg-[#25263a]">
              {isEditable && (
                <button className="w-full h-full flex items-center justify-center text-gray-400 hover:text-gray-300">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
              <tr 
                key={item.id}
                className="border-b border-[#3c3d51] bg-[#1d1f25] hover:bg-[#25263a] transition-colors"
                onMouseEnter={() => setHoveredRow(item.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
              
              {/* Name Cell - Read Only */}
              <td className="py-1.5 px-3 text-white text-[13px] font-normal border-r border-[#3c3d51]">
                <div className='px-1 py-0.5 -mx-1 -my-0.5'>
                  {item.name}
                </div>
              </td>
              
              {/* Price Cell */}
              <td 
                className="py-1.5 px-3 text-right text-white text-[13px] font-normal cursor-pointer border-r border-[#3c3d51]"
                onClick={() => handleCellClick(item.id, 'price', item.price)}
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
                    className="w-full px-1 py-0.5 bg-[#15161f] border border-blue-500 rounded-sm outline-none text-white text-right text-[13px]"
                  />
                ) : (
                  <div className='hover:bg-[#2a2b3e] px-1 py-0.5 -mx-1 -my-0.5 rounded-sm inline-block cursor-pointer'>
                    {formatCurrency(item.price)}
                  </div>
                )}
              </td>
              
              {/* Quantity Cell */}
              <td 
                className="py-1.5 px-3 text-center text-white text-[13px] font-normal cursor-pointer border-r border-[#3c3d51]"
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
                    className="w-full px-1 py-0.5 bg-[#15161f] border border-blue-500 rounded-sm outline-none text-white text-center text-[13px]"
                  />
                ) : (
                  <div className='hover:bg-[#2a2b3e] px-1 py-0.5 -mx-1 -my-0.5 rounded-sm inline-block cursor-pointer'>
                    {item.quantity}
                  </div>
                )}
              </td>
              
              {/* Total Cell */}
              <td className="py-1.5 px-3 text-right text-white text-[13px] font-normal border-r border-[#3c3d51]">
                {formatCurrency(item.total)}
              </td>
              
              {/* Actions */}
              <td className="py-1.5 px-2 border-r border-[#3c3d51]">
                {isEditable && hoveredRow === item.id && (
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </td>
            </tr>
          ))}
          
            {/* Add Row Button */}
            {isEditable && (
              <tr className="border-b border-[#3c3d51] hover:bg-[#25263a]">
                <td colSpan={6} className="border-r border-[#3c3d51]">
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
        <div className="sticky bottom-0 left-0 right-0 bg-[#15161f] border-t border-[#3c3d51] z-20 flex-shrink-0">
          <div className="flex items-center text-[12px] font-medium">
            <div className="w-20 py-2 px-3 text-gray-500 border-r border-[#3c3d51] text-center">
              {items.length} items
            </div>
            <div className="flex-1 py-2 px-3 text-right text-gray-500 border-r border-[#3c3d51]">
              Sum
            </div>
            <div className="w-32 py-2 px-3 text-right text-gray-300 border-r border-[#3c3d51]">
              {formatCurrency(subtotal)}
            </div>
            <div className="w-28 py-2 px-3 text-center text-gray-300 border-r border-[#3c3d51]">
              {items.reduce((sum, item) => sum + (item.quantity || 0), 0)}
            </div>
            <div className="w-32 py-2 px-3 text-right border-r border-[#3c3d51] flex flex-col items-end">
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
            <div className="w-10"></div>
          </div>
        </div>
      )}
    </div>
  );
};