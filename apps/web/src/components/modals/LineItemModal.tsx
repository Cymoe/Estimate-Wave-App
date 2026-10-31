import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import { UNIT_OPTIONS } from '../../constants';

interface LineItemModalProps {
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    price: number;
    unit: string;
  }) => void;
}

export const LineItemModal: React.FC<LineItemModalProps> = ({ onClose, onSave }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name: '',
      description: '',
      price: '0',
      unit: 'hour'
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (data: any) => {
    setIsLoading(true);
    try {
      // Ensure price is a valid number and never null
      const price = data.price ? parseFloat(data.price) : 0;
      
      await onSave({
        name: data.name,
        description: data.description,
        price: isNaN(price) ? 0 : price, // Default to 0 if NaN
        unit: data.unit
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex md:justify-end">
      <div 
        className="absolute inset-0 bg-black transition-opacity duration-300 z-[10000] opacity-50"
        onClick={onClose}
      />
      <div className="fixed w-full md:w-1/2 lg:w-2/5 bg-[#121212] shadow-xl overflow-hidden top-0 bottom-0 right-0 h-full z-[10001] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-[#333333] bg-[#121212] flex-shrink-0">
          <h2 className="text-xl font-bold text-white font-['Roboto_Condensed'] uppercase">New Line Item</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-[#5b8fc7]">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#121212]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" id="line-item-form">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
              Item Name
            </label>
            <input
              {...register('name', { required: 'Name is required' })}
              type="text"
              id="name"
              className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white h-10 px-3 font-['Roboto']"
              placeholder="Enter name"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-[#D32F2F] font-['Roboto']">{errors.name.message as string}</p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
              Description
            </label>
            <textarea
              {...register('description')}
              id="description"
              rows={3}
              className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white p-3 font-['Roboto']"
              placeholder="Enter description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
                Price
              </label>
              <input
                {...register('price', {
                  required: 'Price is required',
                  pattern: {
                    value: /^\d*\.?\d*$/,
                    message: 'Please enter a valid number',
                  },
                  setValueAs: value => value === '' ? '0' : value, // Ensure empty values become '0'
                })}
                type="text"
                id="price"
                className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white h-10 px-3 font-['Roboto_Mono']"
                placeholder="0.00"
              />
              {errors.price && (
                <p className="mt-1 text-sm text-[#D32F2F] font-['Roboto']">{errors.price.message as string}</p>
              )}
            </div>

            <div>
              <label htmlFor="unit" className="block text-sm font-medium text-white font-['Roboto_Condensed'] uppercase mb-2">
                Unit
              </label>
              <select
                {...register('unit')}
                id="unit"
                className="w-full rounded-[4px] border border-[#555555] shadow-sm focus:border-[#0D47A1] focus:ring focus:ring-[#0D47A1] focus:ring-opacity-40 bg-[#333333] text-white h-10 px-3 font-['Roboto']"
              >
                {UNIT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value} className="bg-[#333333] text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {errors.unit && (
              <p className="mt-1 text-sm text-red-500">{errors.unit.message as string}</p>
            )}
          </div>

          </form>
        </div>

        <div className="border-t border-[#333333] p-4 bg-[#121212] flex-shrink-0">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2 border border-[#336699] border-opacity-40 rounded-[4px] bg-transparent hover:bg-[#1E1E1E] text-white font-['Roboto'] font-medium uppercase tracking-wider h-10"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="line-item-form"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-[#336699] text-white rounded-[4px] hover:bg-opacity-90 disabled:opacity-50 font-['Roboto'] font-medium uppercase tracking-wider h-10"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
