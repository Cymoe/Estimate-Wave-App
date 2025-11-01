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
      <label className="block text-sm font-medium text-gray-400 mb-2">
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
            className="flex-1 px-3 py-2 bg-[#1E1E1E] border border-[#555555] rounded text-white focus:outline-none focus:border-[#336699]"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddNewCategory}
            className="px-3 py-2 bg-[#336699] text-white rounded hover:bg-[#2a5580] transition-colors"
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
            className="px-3 py-2 bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors"
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
            className="flex-1 px-3 py-2 bg-[#1E1E1E] border border-[#555555] rounded text-white focus:outline-none focus:border-[#336699]"
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
              className="px-3 py-2 bg-[#336699] text-white rounded hover:bg-[#2a5580] transition-colors flex items-center gap-2"
              title="Add new category"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </button>
          )}
        </div>
      )}
      
      {availableCategories.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 mb-2">Existing categories:</p>
          <div className="flex flex-wrap gap-2">
            {sortedCategories.slice(0, 6).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onChange(category)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  value === category
                    ? 'bg-[#336699] text-white'
                    : 'bg-[#2a2a2a] text-gray-400 hover:bg-[#333333]'
                }`}
              >
                {category}
              </button>
            ))}
            {sortedCategories.length > 6 && (
              <span className="px-2 py-1 text-xs text-gray-500">
                +{sortedCategories.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

