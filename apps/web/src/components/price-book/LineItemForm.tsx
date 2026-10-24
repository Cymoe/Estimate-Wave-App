import React, { useState, useEffect, useContext } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { costCodesAPI } from '../../lib/api'; // MongoDB API for cost codes
import { OrganizationContext } from '../layouts/DashboardLayout';
import { UNIT_OPTIONS } from '../../constants';
import { organizationsAPI } from '../../lib/api';
import { priceRange } from '../../utils/priceRange';

interface LineItemFormData {
  name: string;
  description: string;
  price: number;
  unit: string;
  cost_code_id: string;
  markup_percentage?: number;
  red_line_price?: number;
  cap_price?: number;
  service_category?: string;
}

interface CostCode {
  id: string;
  name: string;
  code: string;
  category?: string;
  industry_id?: string;
}

interface LineItemFormProps {
  onSubmit: (data: LineItemFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<LineItemFormData>;
  submitLabel?: string;
  showSuccessMessage?: boolean;
  defaultCostCodeId?: string | null;
  defaultServiceCategory?: string | null;
}

export const LineItemForm: React.FC<LineItemFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  submitLabel = 'Save',
  defaultCostCodeId,
  defaultServiceCategory
}) => {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset, setValue, control, watch } = useForm({
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      price: initialData?.price?.toString() || '0',
      unit: initialData?.unit || 'hour',
      cost_code_id: initialData?.cost_code_id || ''
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [groupedCostCodes, setGroupedCostCodes] = useState<Map<string, CostCode[]>>(new Map());
  const [isLoadingCostCodes, setIsLoadingCostCodes] = useState(true);
  
  // Price-book prices: red line (the item's fixed price) and cap.
  const initialRange = initialData ? priceRange(initialData) : null;
  const [redLine, setRedLine] = useState(initialRange ? initialRange.redLine.toFixed(2) : '');
  const [cap, setCap] = useState(initialRange ? initialRange.cap.toFixed(2) : '');
  const [currentCostCodeCategory, setCurrentCostCodeCategory] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  
  const formValues = watch();
  
  const isSharedItem = initialData && !initialData.organization_id;
  const isNewCustomItem = !initialData;
  // Admins set prices on their own items; the shared starter catalog is fixed
  // (only super admins can change it).
  const isSuperAdmin = user?.role === 'super_admin';
  const canEditPrices = isSharedItem ? isSuperAdmin : isSuperAdmin || role === 'owner' || role === 'admin';

  useEffect(() => {
    if (!selectedOrg?.id) return;
    organizationsAPI.myRole(selectedOrg.id).then(setRole).catch(() => setRole('member'));
  }, [selectedOrg?.id]);

  useEffect(() => {
    fetchCostCodes();
  }, [user, selectedOrg?.id, initialData?.cost_code_id]);

  // Determine category from cost code number
  useEffect(() => {
    const costCodeId = formValues.cost_code_id || initialData?.cost_code_id;
    if (costCodeId && costCodes.length > 0) {
      const costCode = costCodes.find(cc => cc.id === costCodeId);
      if (costCode) {
        const codeNumber = parseInt(costCode.code.replace(/[^0-9]/g, ''));
        if (!isNaN(codeNumber)) {
          let category: string | null = null;
          if (codeNumber >= 100 && codeNumber <= 199) category = 'labor';
          else if (codeNumber >= 500 && codeNumber <= 599) category = 'materials';
          else if (codeNumber >= 200 && codeNumber <= 299) category = 'installation';
          else if ((codeNumber >= 300 && codeNumber <= 399) || (codeNumber >= 600 && codeNumber <= 699)) category = 'services';
          setCurrentCostCodeCategory(category);
        }
      }
    }
  }, [formValues.cost_code_id, initialData?.cost_code_id, costCodes]);

  // Update form values when initialData changes
  useEffect(() => {
    if (initialData) {
      console.log('🔍 LineItemForm - initialData:', {
        name: initialData.name,
        cost_code_id: initialData.cost_code_id,
        has_cost_code_id: !!initialData.cost_code_id,
        full_initialData: initialData
      });
      
      reset({
        name: initialData.name || '',
        description: initialData.description || '',
        price: initialData.price?.toString() || '0',
        unit: initialData.unit || 'hour',
        cost_code_id: initialData.cost_code_id || ''
      });
      
      const range = priceRange(initialData);
      setRedLine(range.redLine.toFixed(2));
      setCap(range.cap.toFixed(2));
    }
  }, [initialData, reset]);

  const fetchCostCodes = async () => {
    if (!selectedOrg?.id) return;
    
    setIsLoadingCostCodes(true);
    try {
      // Use MongoDB API to get cost codes
      const fetchedCostCodes = await costCodesAPI.list({ isActive: true });
      
      const mappedCostCodes = fetchedCostCodes.map((cc: any) => ({ 
        id: cc._id || cc.id, 
        name: cc.name, 
        code: cc.code,
        category: cc.category,
        industry_id: cc.industry_id
      }));
      setCostCodes(mappedCostCodes);
      
      // Group by category for dropdown
      const grouped = new Map<string, CostCode[]>();
      mappedCostCodes.forEach((cc: CostCode) => {
        const category = cc.category || 'Uncategorized';
        if (!grouped.has(category)) {
          grouped.set(category, []);
        }
        grouped.get(category)!.push(cc);
      });
      setGroupedCostCodes(grouped);
      
    } catch (error) {
      console.error('Error fetching cost codes:', error);
    } finally {
      setIsLoadingCostCodes(false);
    }
  };

  const onFormSubmit = async (data: any) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setIsLoading(true);
    
    try {
      const prices: { red_line_price?: number; cap_price?: number } = {};
      if (canEditPrices) {
        const redLinePrice = parseFloat(redLine);
        const capPrice = cap.trim() === '' ? redLinePrice : parseFloat(cap);
        if (!Number.isFinite(redLinePrice) || redLinePrice < 0) throw new Error('Enter a red line price.');
        if (!Number.isFinite(capPrice) || capPrice < redLinePrice) {
          throw new Error("Cap price can't be below the red line price.");
        }
        prices.red_line_price = redLinePrice;
        prices.cap_price = capPrice;
      }

      const submitData = {
        name: data.name,
        description: data.description,
        unit: data.unit,
        cost_code_id: data.cost_code_id,
        ...prices
      };
      
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting line item:', error);
      // Set user-friendly error message
      if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError('Failed to save line item. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col h-full">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Error Alert */}
        {submitError && (
          <div className="bg-red-500/10 border border-red-500 rounded-[4px] p-3 mb-4">
            <p className="text-sm text-red-400">{submitError}</p>
          </div>
        )}
      
      <div>
        <label htmlFor="cost_code_id" className="block text-xs font-medium text-gray-400 mb-1">
          Cost Code {initialData && <span className="text-xs text-gray-500">(Pre-assigned)</span>}
        </label>
        <Controller
          name="cost_code_id"
          control={control}
          rules={{ required: 'Cost Code selection is required' }}
          render={({ field }) => (
            <select
              {...field}
              id="cost_code_id"
              className={`w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 ${
                initialData ? 'text-gray-400 cursor-not-allowed' : 'text-white'
              }`}
              disabled={isLoadingCostCodes || !!initialData}
            >
              <option value="" className={`bg-[#333333] ${initialData ? 'text-gray-400' : 'text-white'}`}>
                {isLoadingCostCodes ? 'Loading cost codes...' : 'Select Cost Code'}
              </option>
              {!isLoadingCostCodes && Array.from(groupedCostCodes.entries()).map(([categoryName, codes]) => (
                <optgroup 
                  key={categoryName} 
                  label={`━━━  ${categoryName.toUpperCase()}  ━━━`}
                  className="bg-[#1E1E1E] text-gray-400 font-bold"
                >
                  {codes.map(code => (
                    <option 
                      key={code.id} 
                      value={code.id} 
                      className={`bg-[#333333] pl-4 ${initialData ? 'text-gray-400' : 'text-white'}`}
                    >
                      {code.code} — {code.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        />
        {errors.cost_code_id && (
          <p className="mt-1 text-sm text-[#D32F2F]">{errors.cost_code_id.message as string}</p>
        )}
      </div>

      <div>
        <label htmlFor="name" className="block text-xs font-medium text-gray-400 mb-1">
          Item Name {isSharedItem && <span className="text-xs text-gray-500">(Industry Standard)</span>}
        </label>
        <input
          {...register('name', { 
            required: 'Name is required',
            minLength: {
              value: 2,
              message: 'Name must be at least 2 characters'
            },
            maxLength: {
              value: 100,
              message: 'Name must be 100 characters or less'
            }
          })}
          type="text"
          id="name"
          disabled={isSharedItem}
          className={`w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 ${
            isSharedItem ? 'text-gray-400 cursor-not-allowed' : 'text-white'
          }`}
          placeholder="Enter name"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-[#D32F2F]">{errors.name.message as string}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-xs font-medium text-gray-400 mb-1">
          Description {isSharedItem && <span className="text-xs text-gray-500">(Industry Standard)</span>}
        </label>
        <textarea
          {...register('description')}
          id="description"
          rows={2}
          disabled={isSharedItem}
          className={`w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 resize-none ${
            isSharedItem ? 'text-gray-400 cursor-not-allowed' : 'text-white'
          }`}
          placeholder="Enter description"
        />
      </div>

      {/* Pricing: the red line is the item's fixed price-book price; estimates start each item at cap. */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="red_line_price" className="block text-xs font-medium text-gray-400 mb-1">
              Red line price
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="text"
                inputMode="decimal"
                id="red_line_price"
                value={redLine}
                onChange={(e) => setRedLine(e.target.value)}
                disabled={!canEditPrices}
                className={`w-full pl-6 pr-2 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm font-mono focus:border-[#336699] focus:outline-none ${
                  canEditPrices ? 'text-white' : 'text-gray-400 cursor-not-allowed'
                }`}
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label htmlFor="cap_price" className="block text-xs font-medium text-gray-400 mb-1">
              Cap price
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="text"
                inputMode="decimal"
                id="cap_price"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                disabled={!canEditPrices}
                className={`w-full pl-6 pr-2 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm font-mono focus:border-[#336699] focus:outline-none ${
                  canEditPrices ? 'text-white' : 'text-gray-400 cursor-not-allowed'
                }`}
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label htmlFor="unit" className="block text-xs font-medium text-gray-400 mb-1">
              Unit {isSharedItem && <span className="text-xs text-gray-500">(Industry Standard)</span>}
            </label>
            <select
              {...register('unit')}
              id="unit"
              disabled={isSharedItem}
              className={`w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 ${
                isSharedItem ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {UNIT_OPTIONS.map(option => (
                <option key={option.value} value={option.value} className="bg-[#333333] text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {canEditPrices
            ? 'Red line is the lowest price an estimate can use. New estimates start at cap.'
            : isSharedItem
              ? 'Starter catalog prices are fixed.'
              : 'Only admins can change prices.'}
        </p>

        {/* Pricing guidance for new custom items */}
        {isNewCustomItem && (
          <div className="space-y-2">
            <div className="bg-[#1E1E1E] rounded-lg p-3 border border-[#333333]">
              <h4 className="text-xs font-medium text-white mb-2">Pricing Guidance</h4>
              
              {/* Category-specific pricing hints */}
              {currentCostCodeCategory === 'labor' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Typical hourly labor rates:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#252525] p-1.5 rounded">
                      <span className="text-gray-500">Apprentice:</span> <span className="text-white">$35-50/hr</span>
                    </div>
                    <div className="bg-[#252525] p-1.5 rounded">
                      <span className="text-gray-500">Journeyman:</span> <span className="text-white">$50-75/hr</span>
                    </div>
                    <div className="bg-[#252525] p-1.5 rounded">
                      <span className="text-gray-500">Master:</span> <span className="text-white">$75-125/hr</span>
                    </div>
                    <div className="bg-[#252525] p-1.5 rounded">
                      <span className="text-gray-500">Specialist:</span> <span className="text-white">$100-200/hr</span>
                    </div>
                  </div>
                </div>
              )}
              
              {currentCostCodeCategory === 'materials' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Material pricing tips:</p>
                  <div className="bg-[#252525] p-2 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Base cost:</span>
                      <span className="text-white">Your supplier cost</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Standard markup:</span>
                      <span className="text-white">15-50%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Consider:</span>
                      <span className="text-white">Delivery, waste, warranties</span>
                    </div>
                  </div>
                </div>
              )}
              
              {currentCostCodeCategory === 'installation' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Installation pricing:</p>
                  <div className="bg-[#252525] p-2 rounded text-xs space-y-1">
                    <div className="text-gray-500">Common units & ranges:</div>
                    <div className="ml-2 space-y-0.5">
                      <div>• Per sqft: $2-15 (varies by complexity)</div>
                      <div>• Per opening: $100-500</div>
                      <div>• Per unit: $50-1000</div>
                    </div>
                  </div>
                </div>
              )}
              
              {currentCostCodeCategory === 'services' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Service pricing:</p>
                  <div className="bg-[#252525] p-2 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Service call:</span>
                      <span className="text-white">$75-150</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Maintenance:</span>
                      <span className="text-white">$100-300/visit</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Emergency:</span>
                      <span className="text-white">1.5-2x normal rate</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Default guidance when no specific category */}
              {!currentCostCodeCategory && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">General pricing guidance:</p>
                  <div className="bg-[#252525] p-2 rounded text-xs space-y-1">
                    <div>• Research competitor pricing in your area</div>
                    <div>• Consider your costs: materials + labor + overhead</div>
                    <div>• Add profit margin: typically 10-35%</div>
                    <div>• Adjust for market conditions and demand</div>
                  </div>
                </div>
              )}
              
              {/* General pricing tip */}
              <div className="mt-2 pt-2 border-t border-[#333333]">
                <p className="text-xs text-gray-400">
                  💡 Price based on value delivered, not just costs. Factor in your expertise, quality, and local market rates.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Sticky footer with buttons */}
      <div className="border-t border-[#333333] p-3 bg-[#121212] sticky bottom-0">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 border border-[#336699]/40 rounded text-sm text-white hover:bg-[#333333] transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-3 py-1.5 bg-white text-black rounded text-sm hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting || (isSharedItem && !canEditPrices)}
          >
            {isSubmitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}; 