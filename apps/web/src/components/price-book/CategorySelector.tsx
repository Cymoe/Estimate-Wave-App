import React, { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';

interface CategorySelectorProps {
  value: string;
  onChange: (category: string) => void;
  availableCategories: string[];
  onAddCategory?: (newCategory: string) => void;
  label?: string;
  required?: boolean;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  value,
  onChange,
  availableCategories,
  onAddCategory,
  label = 'Service Category',
  required = false
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleAddNewCategory = () => {
    if (newCategoryName.trim() && onAddCategory) {
      onAddCategory(newCategoryName.trim());
      onChange(newCategoryName.trim());
      setNewCategoryName('');
      setIsAddingNew(false);
    }
  };

  const sortedCategories = [...availableCategories].sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      
      {isAddingNew ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddNewCategory();
              } else if (e.key === 'Escape') {
                setIsAddingNew(false);
                setNewCategoryName('');
              }
            }}
            placeholder="Enter new category name"
            className="flex-1 px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddNewCategory}
            className="px-2.5 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            title="Add category"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAddingNew(false);
              setNewCategoryName('');
            }}
            className="px-2.5 py-1.5 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            className="flex-1 px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40"
          >
            <option value="">Select a category...</option>
            {sortedCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          
          {onAddCategory && (
            <button
              type="button"
              onClick={() => setIsAddingNew(true)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-sm"
              title="Add new category"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          )}
        </div>
      )}
    </div>
  );
};

