import React, { useState, useEffect, useContext, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { costCodesAPI } from '../../lib/api'; // MongoDB API for cost codes
import { OrganizationContext } from '../layouts/DashboardLayout';
import { UNIT_OPTIONS } from '../../constants';
import { formatCurrency } from '../../utils/format';
import { PricingModesService, PricingMode } from '../../services/PricingModesService';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { lineItemsAPI } from '../../lib/api';

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
  
  // Direct price state
  const [price, setPrice] = useState(
    initialData?.price?.toString() || '0'
  );
  const [currentCostCodeCategory, setCurrentCostCodeCategory] = useState<string | null>(null);
  const [isApplyingToCategory, setIsApplyingToCategory] = useState(false);
  const [pricingModes, setPricingModes] = useState<PricingMode[]>([]);
  const [isLoadingModes, setIsLoadingModes] = useState(true);
  
  const formValues = watch();
  
  // Calculate pricing based on mode
  const baseCost = initialData?.base_price || initialData?.price || 0;
  const isSharedItem = initialData && !initialData.organization_id;
  const isNewCustomItem = !initialData;
  
  // State for inline markup calculator
  const [showMarkupOptions, setShowMarkupOptions] = useState(false);
  const [selectedMarkup, setSelectedMarkup] = useState<string | null>(null);
  const markupDropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (markupDropdownRef.current && !markupDropdownRef.current.contains(event.target as Node)) {
        setShowMarkupOptions(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    fetchCostCodes();
  }, [user, selectedOrg?.id, initialData?.cost_code_id]);

  // Fetch pricing modes
  useEffect(() => {
    const fetchPricingModes = async () => {
      if (!selectedOrg?.id) return;
      
      setIsLoadingModes(true);
      try {
        const modes = await PricingModesService.getPresets();
        setPricingModes(modes);
      } catch (error) {
        console.error('Error fetching pricing modes:', error);
      } finally {
        setIsLoadingModes(false);
      }
    };
    
    fetchPricingModes();
  }, [selectedOrg?.id]);

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
      
      // Update price state
      setPrice(initialData.price?.toString() || '0');
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
      const finalPrice = parseFloat(price) || 0;
      
      // Calculate markup percentage for shared items (for backend storage)
      let markupToSubmit: number | undefined;
      if (isSharedItem && baseCost > 0) {
        markupToSubmit = ((finalPrice - baseCost) / baseCost) * 100;
      }
      
      const submitData = {
        name: data.name,
        description: data.description,
        price: finalPrice,
        unit: data.unit,
        cost_code_id: data.cost_code_id,
        // Store markup percentage for internal use only
        ...(isSharedItem && markupToSubmit !== undefined ? { markup_percentage: markupToSubmit } : {})
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
              className={`w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 ${
                initialData ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={isLoadingCostCodes || !!initialData}
            >
              <option value="" className="bg-[#333333] text-white">
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
                      className="bg-[#333333] text-white pl-4"
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
          className={`w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 ${
            isSharedItem ? 'opacity-50 cursor-not-allowed' : ''
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
          className={`w-full px-2.5 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 resize-none ${
            isSharedItem ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          placeholder="Enter description"
        />
      </div>

      {/* Price and Unit Configuration */}
      <div className="space-y-2">
        <div className="grid grid-cols-[2fr,1fr] gap-3">
          <div>
            <label htmlFor="price" className="block text-xs font-medium text-gray-400 mb-1">
              Your Price per {formValues.unit || 'unit'}
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm z-10">$</span>
              <input
                type="text"
                id="price"
                value={price}
                onChange={(e) => {
                  // Allow only numbers and decimal point
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  // Prevent multiple decimal points
                  const parts = value.split('.');
                  if (parts.length > 2) return;
                  // Limit to 2 decimal places
                  if (parts[1] && parts[1].length > 2) return;
                  setPrice(value);
                  // Clear markup selection when manually typing
                  setSelectedMarkup(null);
                }}
                onBlur={(e) => {
                  // Format on blur to ensure valid decimal
                  const num = parseFloat(e.target.value) || 0;
                  setPrice(num.toFixed(2));
                }}
                className="w-full pl-7 pr-12 py-1.5 bg-[#333333] border border-[#555555] rounded text-white focus:border-[#0D47A1] focus:outline-none focus:ring-1 focus:ring-[#0D47A1]/40 font-mono text-base"
                placeholder="0.00"
              />
              
              {/* Price adjustment buttons */}
              <div className="absolute right-1 flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    const currentPrice = parseFloat(price) || 0;
                    const increment = currentPrice < 10 ? 0.5 : currentPrice < 100 ? 1 : 5;
                    setPrice((currentPrice + increment).toFixed(2));
                  }}
                  className="px-1 py-0.5 hover:bg-[#444444] rounded transition-colors"
                >
                  <ChevronUp className="w-3 h-3 text-gray-400" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentPrice = parseFloat(price) || 0;
                    const decrement = currentPrice <= 10 ? 0.5 : currentPrice <= 100 ? 1 : 5;
                    const newPrice = Math.max(0, currentPrice - decrement);
                    setPrice(newPrice.toFixed(2));
                  }}
                  className="px-1 py-0.5 hover:bg-[#444444] rounded transition-colors"
                >
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
              </div>
              </div>
              
              {/* Inline markup selector for new custom items */}
              {isNewCustomItem && (
                <div className="relative" ref={markupDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowMarkupOptions(!showMarkupOptions)}
                      className={`px-2 py-1.5 bg-[#333333] border border-[#555555] rounded text-sm text-white hover:bg-[#444444] transition-colors flex items-center gap-1 min-w-[65px] ${
                        selectedMarkup ? 'border-blue-500 bg-blue-900/20' : ''
                      }`}
                    >
                      <span className="text-xs">
                        {selectedMarkup 
                          ? `+${((parseFloat(selectedMarkup) - 1) * 100).toFixed(0)}%`
                          : '+0%'
                        }
                      </span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${showMarkupOptions ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Markup dropdown */}
                    {showMarkupOptions && (
                      <div className="absolute top-full mt-1 left-0 bg-[#333333] border border-[#555555] rounded shadow-lg z-20 min-w-[200px]">
                        <div className="p-2 text-xs text-gray-400 border-b border-[#555555]">
                          Enter cost, then select markup
                        </div>
                        <div className="py-1">
                          <button
                            type="button"
                            onClick={() => {
                              // If we have a current markup, calculate and set the base cost
                              if (selectedMarkup) {
                                const baseCost = parseFloat(price) / parseFloat(selectedMarkup);
                                setPrice(baseCost.toFixed(2));
                              }
                              setSelectedMarkup(null);
                              setShowMarkupOptions(false);
                            }}
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#444444] text-gray-400"
                          >
                            No markup
                          </button>
                          {['1.15', '1.25', '1.35', '1.50', '1.75', '2.00'].map(markup => {
                            const percentage = ((parseFloat(markup) - 1) * 100).toFixed(0);
                            const cost = parseFloat(price) / (selectedMarkup ? parseFloat(selectedMarkup) : 1);
                            const newPrice = cost * parseFloat(markup);
                            
                            return (
                              <button
                                key={markup}
                                type="button"
                                onClick={() => {
                                  // If we have a current selection, calculate the base cost
                                  const baseCost = selectedMarkup 
                                    ? parseFloat(price) / parseFloat(selectedMarkup)
                                    : parseFloat(price);
                                  
                                  // Apply new markup
                                  setPrice((baseCost * parseFloat(markup)).toFixed(2));
                                  setSelectedMarkup(markup);
                                  setShowMarkupOptions(false);
                                }}
                                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[#444444] transition-colors flex justify-between items-center ${
                                  selectedMarkup === markup ? 'bg-blue-900/20 text-blue-400' : 'text-white'
                                }`}
                              >
                                <span>+{percentage}%</span>
                                <span className="text-xs text-gray-500 font-mono">
                                  ${newPrice.toFixed(2)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
              )}
            </div>
            
            {/* Helper text for markup */}
            {isNewCustomItem && selectedMarkup && (
              <p className="text-xs text-gray-500 mt-1">
                Base cost: ${(parseFloat(price) / parseFloat(selectedMarkup)).toFixed(2)} × {((parseFloat(selectedMarkup) - 1) * 100).toFixed(0)}% markup
              </p>
            )}
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
        
        {/* Smart pricing suggestions - show for all items with pricing data */}
        {(initialData?.base_price || initialData?.red_line_price || initialData?.cap_price) && (
          <div className="space-y-2">
            {/* Commission Potential */}
            <div className="bg-[#1E1E1E] rounded-lg p-3 border border-[#333333]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-xs font-medium text-white">Your Commission</h4>
                  <p className="text-xs text-gray-500">Margin above redline</p>
                </div>
                <div className="text-right">
                  {(() => {
                    const currentPrice = parseFloat(price) || 0;
                    const redlinePrice = initialData?.red_line_price || baseCost * 0.7;
                    const capPrice = initialData?.cap_price || baseCost;
                    const maxCommission = capPrice - redlinePrice;
                    const currentCommission = Math.max(0, currentPrice - redlinePrice);
                    const commissionPercent = maxCommission > 0 ? (currentCommission / maxCommission) * 100 : 0;
                    
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-mono font-semibold ${
                            currentCommission === 0 ? 'text-red-400' : 
                            commissionPercent > 80 ? 'text-green-400' : 
                            commissionPercent > 40 ? 'text-yellow-400' : 'text-orange-400'
                          }`}>
                            {formatCurrency(currentCommission)}
                          </span>
                          <span className={`text-sm font-medium ${
                            currentCommission === 0 ? 'text-red-400' : 
                            commissionPercent > 80 ? 'text-green-400' : 
                            commissionPercent > 40 ? 'text-yellow-400' : 'text-orange-400'
                          }`}>
                            ({Math.round(commissionPercent)}%)
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-gray-500">max:</span>
                          <span className="text-gray-400">{formatCurrency(maxCommission)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              
              {/* Pricing strategy buttons */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-1.5">Quick pricing strategies:</p>
                <div className="grid grid-cols-2 gap-2">
                  {isLoadingModes ? (
                    <div className="col-span-2 text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white inline-block"></div>
                    </div>
                  ) : (
                    <>
                      {/* Red Line and Cap buttons (if available) */}
                      {initialData?.red_line_price && (
                        <button
                          type="button"
                          onClick={() => {
                            setPrice(initialData.red_line_price!.toFixed(2));
                          }}
                          className={`p-1.5 rounded text-left transition-all group relative ${
                            Math.abs(parseFloat(price) - initialData.red_line_price) < 0.01
                              ? 'bg-red-900/30 backdrop-blur ring-2 ring-red-500/40'
                              : 'bg-[#252525] hover:bg-red-900/20'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">🔴</span>
                            <div className="text-xs font-medium text-red-400">Red Line</div>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">Minimum acceptable price</div>
                          <div className="text-xs font-mono text-red-400 mt-0.5">{formatCurrency(initialData.red_line_price)}</div>
                        </button>
                      )}
                      
                      {initialData?.cap_price && (
                        <button
                          type="button"
                          onClick={() => {
                            setPrice(initialData.cap_price!.toFixed(2));
                          }}
                          className={`p-1.5 rounded text-left transition-all group relative ${
                            Math.abs(parseFloat(price) - initialData.cap_price) < 0.01
                              ? 'bg-yellow-900/30 backdrop-blur ring-2 ring-yellow-500/40'
                              : 'bg-[#252525] hover:bg-yellow-900/20'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">🟡</span>
                            <div className="text-xs font-medium text-yellow-400">Cap Price</div>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">Maximum premium pricing</div>
                          <div className="text-xs font-mono text-yellow-400 mt-0.5">{formatCurrency(initialData.cap_price)}</div>
                        </button>
                      )}
                      
                      {/* Existing pricing mode buttons */}
                      {pricingModes
                        .filter(mode => mode.name !== 'Market Rate' && mode.name !== 'Cap Price') // Exclude Market Rate and Cap Price
                        .sort((a, b) => {
                          // Put "Reset to Baseline" at the end
                          if (a.name === 'Reset to Baseline') return 1;
                          if (b.name === 'Reset to Baseline') return -1;
                          
                          // Get multipliers for sorting others
                          const aMultiplier = a.adjustments.all || 1;
                          const bMultiplier = b.adjustments.all || 1;
                          
                          // Sort by multiplier (lowest first = biggest discount first)
                          return aMultiplier - bMultiplier;
                        })
                        .map(mode => {
                          // Get the appropriate multiplier based on category or use 'all'
                          let multiplier = mode.adjustments.all || 1;
                          if (currentCostCodeCategory && mode.adjustments[currentCostCodeCategory as keyof typeof mode.adjustments]) {
                            multiplier = mode.adjustments[currentCostCodeCategory as keyof typeof mode.adjustments] || 1;
                          }
                          let modePrice = baseCost * multiplier;
                          
                          // Clamp prices within RED LINE to CAP range (except for special cases)
                          const redLine = initialData?.red_line_price || baseCost;
                          const cap = initialData?.cap_price || baseCost * 2;
                          
                          // Allow "Need This Job" to go down to BASE (break-even)
                          // But all others must respect RED LINE minimum
                          if (mode.name !== 'Need This Job' && mode.name !== 'Reset to Baseline' && modePrice < redLine) {
                            modePrice = redLine;
                          }
                          
                          // Nothing should exceed CAP
                          if (modePrice > cap) {
                            modePrice = cap;
                          }
                          
                          // Show percentage change for clarity
                          const actualPercentage = Math.round(((modePrice / baseCost) - 1) * 100);
                          const changeText = actualPercentage > 0 ? `+${actualPercentage}%` : `${actualPercentage}%`;
                          const isActive = Math.abs(parseFloat(price) - modePrice) < 0.01;
                          
                          // Check if clamped
                          const wasClamped = (multiplier * baseCost !== modePrice);
                          
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => {
                                // For Reset to Baseline, always use the base price
                                if (mode.name === 'Reset to Baseline') {
                                  setPrice(baseCost.toFixed(2));
                                } else {
                                  setPrice(modePrice.toFixed(2));
                                }
                              }}
                              className={`p-1.5 rounded text-left transition-all group relative ${
                                isActive
                                  ? 'bg-white/10 backdrop-blur ring-2 ring-white/20'
                                  : 'bg-[#252525] hover:bg-[#333333]'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">{mode.icon}</span>
                                <div className="text-xs font-medium text-white group-hover:text-blue-400">{mode.name}</div>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {changeText} • {mode.description}
                                {wasClamped && <span className="text-yellow-500 ml-1">(adjusted)</span>}
                              </div>
                              <div className="text-xs font-mono text-gray-300 mt-0.5">{formatCurrency(modePrice)}</div>
                            </button>
                          );
                        })
                      }
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
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
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}; 