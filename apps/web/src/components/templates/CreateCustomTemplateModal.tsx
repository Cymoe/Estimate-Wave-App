import React, { useState } from 'react';
import { X, Plus, Trash2, Save, Package, Brain, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';
import { SmartSuggestions } from './SmartSuggestions';

interface CreateCustomTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateCreated: () => void;
}

interface TemplateItem {
  name: string;
  description?: string;
  quantity: number;
  unit?: string;
  pricePerUnit: number;
}

const CATEGORIES = [
  { id: 'home-improvement', name: 'Home Improvement' },
  { id: 'plumbing', name: 'Plumbing' },
  { id: 'electrical', name: 'Electrical' },
  { id: 'painting', name: 'Painting' },
  { id: 'roofing', name: 'Roofing' },
  { id: 'hvac', name: 'HVAC' },
  { id: 'landscaping', name: 'Landscaping' },
  { id: 'custom', name: 'Other' }
];

const UNITS = [
  'unit', 'units', 'hours', 'sq ft', 'linear ft', 'cubic yd',
  'gallons', 'pieces', 'bags', 'boxes', 'rolls', 'sheets',
  'visits', 'service', 'package', 'kit', 'set', 'days', 'weeks'
];

export const CreateCustomTemplateModal: React.FC<CreateCustomTemplateModalProps> = ({
  isOpen,
  onClose,
  onTemplateCreated
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showSmartSuggestions, setShowSmartSuggestions] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'home-improvement',
    description: '',
    items: [] as TemplateItem[]
  });

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        name: '',
        description: '',
        quantity: 1,
        unit: 'unit',
        pricePerUnit: 0
      }]
    }));
  };

  const updateItem = (index: number, field: keyof TemplateItem, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.pricePerUnit), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('custom_templates')
        .insert([{
          user_id: user.id,
          name: formData.name,
          category: formData.category,
          description: formData.description,
          items: formData.items,
          is_favorite: false,
          usage_count: 0
        }]);

      if (error) throw error;

      onTemplateCreated();
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        category: 'home-improvement',
        description: '',
        items: []
      });
    } catch (error) {
      console.error('Error creating template:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplySuggestion = (suggestion: any) => {
    if (suggestion.type === 'price') {
      const itemIndex = formData.items.findIndex(item => item.name === suggestion.itemName);
      if (itemIndex !== -1) {
        updateItem(itemIndex, 'pricePerUnit', suggestion.value);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#333333] rounded-[4px] w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1E1E1E]">
          <h2 className="text-xl font-bold">CREATE CUSTOM TEMPLATE</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#404040] rounded-[4px] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">TEMPLATE NAME</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full h-10 px-3 bg-[#1E1E1E] border border-[#555555] rounded-[4px] text-white focus:outline-none focus:border-[#336699]"
                  placeholder="e.g., Kitchen Renovation Package"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">CATEGORY</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full h-10 px-3 bg-[#1E1E1E] border border-[#555555] rounded-[4px] text-white focus:outline-none focus:border-[#336699]"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">DESCRIPTION</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1E1E1E] border border-[#555555] rounded-[4px] text-white focus:outline-none focus:border-[#336699]"
                placeholder="Describe what this template includes..."
                rows={3}
                required
              />
            </div>

            {/* Smart Suggestions Toggle */}
            {formData.items.length > 0 && (
              <div className="border-t border-b border-[#555555] py-4">
                <button
                  type="button"
                  onClick={() => setShowSmartSuggestions(!showSmartSuggestions)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-[#336699]" />
                    <span className="text-lg font-medium">AI-POWERED SUGGESTIONS</span>
                    <span className="text-xs bg-[#336699] text-white px-2 py-0.5 rounded-[2px] font-bold">BETA</span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showSmartSuggestions ? 'rotate-180' : ''}`} />
                </button>

                {showSmartSuggestions && (
                  <div className="mt-4">
                    <SmartSuggestions
                      templateCategory={formData.category}
                      templateItems={formData.items}
                      onApplySuggestion={handleApplySuggestion}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Items Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">TEMPLATE ITEMS</h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  ADD ITEM
                </button>
              </div>

              {formData.items.length === 0 ? (
                <div className="bg-[#1E1E1E] rounded-[4px] p-8 text-center">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">No items added yet</p>
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors mx-auto font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    ADD FIRST ITEM
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div key={index} className="bg-[#1E1E1E] rounded-[4px] p-4">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* Item Name */}
                        <div className="md:col-span-4">
                          <label className="block text-xs text-gray-400 mb-1">ITEM NAME</label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItem(index, 'name', e.target.value)}
                            className="w-full h-8 px-2 bg-[#333333] border border-[#555555] rounded-[2px] text-white text-sm focus:outline-none focus:border-[#336699]"
                            placeholder="e.g., Labor"
                            required
                          />
                        </div>

                        {/* Quantity */}
                        <div className="md:col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">QUANTITY</label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full h-8 px-2 bg-[#333333] border border-[#555555] rounded-[2px] text-white text-sm focus:outline-none focus:border-[#336699]"
                            min="0"
                            step="0.01"
                            required
                          />
                        </div>

                        {/* Unit */}
                        <div className="md:col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">UNIT</label>
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(index, 'unit', e.target.value)}
                            className="w-full h-8 px-2 bg-[#333333] border border-[#555555] rounded-[2px] text-white text-sm focus:outline-none focus:border-[#336699]"
                          >
                            {UNITS.map(unit => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </div>

                        {/* Price per Unit */}
                        <div className="md:col-span-3">
                          <label className="block text-xs text-gray-400 mb-1">PRICE/UNIT</label>
                          <input
                            type="number"
                            value={item.pricePerUnit}
                            onChange={(e) => updateItem(index, 'pricePerUnit', parseFloat(e.target.value) || 0)}
                            className="w-full h-8 px-2 bg-[#333333] border border-[#555555] rounded-[2px] text-white text-sm focus:outline-none focus:border-[#336699]"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            required
                          />
                        </div>

                        {/* Delete */}
                        <div className="md:col-span-1 flex items-end">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-2 text-gray-400 hover:text-[#D32F2F] hover:bg-[#333333] rounded-[2px] transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Description (optional) */}
                      <div className="mt-3">
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          className="w-full h-8 px-2 bg-[#333333] border border-[#555555] rounded-[2px] text-white text-sm focus:outline-none focus:border-[#336699]"
                          placeholder="Optional description..."
                        />
                      </div>

                      {/* Item Total */}
                      <div className="mt-3 text-right">
                        <span className="text-sm text-gray-400">Subtotal: </span>
                        <span className="text-sm font-mono font-medium text-white">
                          {formatCurrency(item.quantity * item.pricePerUnit)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="bg-[#1E1E1E] rounded-[4px] p-4 flex items-center justify-between">
                    <span className="text-lg font-medium">TEMPLATE TOTAL</span>
                    <span className="text-xl font-mono font-bold text-[#336699]">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-[#1E1E1E] p-6 bg-[#333333]">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#555555] text-white rounded-[4px] hover:bg-[#404040] transition-colors"
              disabled={loading}
            >
              CANCEL
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading || formData.items.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {loading ? 'CREATING...' : 'CREATE TEMPLATE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 