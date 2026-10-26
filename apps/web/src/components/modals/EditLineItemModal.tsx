import React, { useState } from 'react';
import { X } from 'lucide-react';
import { UNIT_OPTIONS } from '../../constants';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  user_id: string;
  created_at: string;
};

interface EditLineItemModalProps {
  product: Product | null; // Allow null for new items
  onClose: () => void;
  onSave: (data: Partial<Product>) => void;
}

export const EditLineItemModal: React.FC<EditLineItemModalProps> = ({
  product,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    unit: product?.unit || 'ea'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      onSave(formData);
      handleClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex md:justify-end">
      <div 
        className={`absolute inset-0 bg-black transition-opacity duration-300 z-[10000] ${
          isClosing ? 'opacity-0' : 'opacity-50'
        }`}
        onClick={handleClose}
      />
      
      <div 
        className={`
          fixed w-full md:w-1/2 lg:w-2/5
          transition-transform duration-300 ease-out 
          bg-[#121212] 
          shadow-xl
          overflow-hidden
          top-0 bottom-0 right-0 h-full
          transform
          z-[10001]
          ${isClosing 
            ? 'translate-x-full' 
            : 'translate-x-0'
          }
        `}
      >
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-4 border-b border-[#333333] bg-[#121212] sticky top-0 z-10">
            <h2 className="text-xl font-bold text-white font-['Roboto_Condensed'] uppercase">Edit Line Item</h2>
            <button onClick={handleClose} className="p-2 text-gray-400 hover:text-[#5b8fc7]">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#121212]">
            <form id="product-form" onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-[#333333] border-l-4 border-[#D32F2F] rounded-[4px]">
                  <p className="text-sm text-white font-['Roboto']">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
                  Item Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white h-10 px-3 font-['Roboto']"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white p-3 font-['Roboto']"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
                  Price
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                  className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white h-10 px-3 font-['Roboto_Mono']"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
                  Unit
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white h-10 px-3 font-['Roboto']"
                  required
                >
                  {UNIT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value} className="bg-[#333333] text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

            </form>
          </div>

          <div className="border-t border-[#333333] p-4 bg-[#121212] sticky bottom-0 z-10 mt-auto">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleClose}
                className="w-full px-4 py-2 border border-[#336699] border-opacity-40 rounded-[4px] bg-transparent hover:bg-[#1E1E1E] text-white font-['Roboto'] font-medium uppercase tracking-wider h-10"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="product-form"
                className="w-full px-4 py-2 bg-[#336699] text-white rounded-[4px] hover:bg-opacity-90 disabled:opacity-50 font-['Roboto'] font-medium uppercase tracking-wider h-10"
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Line Item'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};