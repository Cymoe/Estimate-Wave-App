import React, { useState, useEffect } from 'react';
import { X, DollarSign, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';

interface ServiceOption {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  service_id: string;
  organization_id?: string;
  material_quality?: string;
  warranty_months?: number;
  estimated_hours?: number;
  attributes?: Record<string, any>;
  skill_level?: string;
  is_template?: boolean;
}

interface CustomizeServiceOptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceOption: ServiceOption | null;
  organizationId: string;
  onSuccess?: () => void;
}

export const CustomizeServiceOptionModal: React.FC<CustomizeServiceOptionModalProps> = ({
  isOpen,
  onClose,
  serviceOption,
  organizationId,
  onSuccess
}) => {
  const [customPrice, setCustomPrice] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [existingCustom, setExistingCustom] = useState<ServiceOption | null>(null);

  useEffect(() => {
    if (serviceOption && isOpen) {
      // Check if there's already a custom version
      checkExistingCustomization();
      
      // Set initial price value
      setCustomPrice(serviceOption.price.toString());
      setError(null);
      setShowSuccess(false);
    }
  }, [serviceOption, isOpen]);

  const checkExistingCustomization = async () => {
    if (!serviceOption || !organizationId) return;

    try {
      const { data, error } = await supabase
        .from('service_options')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('name', serviceOption.name)
        .eq('service_id', serviceOption.service_id)
        .maybeSingle();

      if (error) {
        // Error in checkExistingCustomization query
      }

      if (data) {
        setExistingCustom(data);
        setCustomPrice(data.price.toString());
      }
    } catch (err) {
      // Error checking existing customization
    }
  };

  const handleSave = async () => {
    if (!serviceOption || !organizationId) return;

    const price = parseFloat(customPrice);

    if (isNaN(price) || price < 0) {
      setError('Please enter a valid price');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // If this service option already belongs to this organization, just update it
      if (serviceOption.organization_id === organizationId || existingCustom) {
        const idToUpdate = existingCustom?.id || serviceOption.id;
        // Debug -'Service already belongs to org or custom exists, updating:', idToUpdate);
        
        const { error: updateError } = await supabase
          .from('service_options')
          .update({
            price: price,
            updated_at: new Date().toISOString()
          })
          .eq('id', idToUpdate);

        if (updateError) throw updateError;
        
        setShowSuccess(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1500);
        return;
      } else {
        // Create new custom version by copying the service option
        const customServiceOption = {
          name: serviceOption.name,
          description: serviceOption.description,
          service_id: serviceOption.service_id,
          organization_id: organizationId,
          price: price,
          unit: serviceOption.unit,
          is_template: true,
          attributes: serviceOption.attributes || {},
          material_quality: serviceOption.material_quality,
          warranty_months: serviceOption.warranty_months,
          estimated_hours: serviceOption.estimated_hours,
          skill_level: serviceOption.skill_level,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        
        // First check if a custom version already exists for this organization
        const { data: existingOptions } = await supabase
          .from('service_options')
          .select('*')
          .eq('name', serviceOption.name)
          .eq('service_id', serviceOption.service_id)
          .eq('organization_id', organizationId);
        
        
        if (existingOptions && existingOptions.length > 0) {
          // Custom version already exists, just update the price
          
          const { error: updateError } = await supabase
            .from('service_options')
            .update({ 
              price: price, 
              updated_at: new Date().toISOString() 
            })
            .eq('id', existingOptions[0].id);
          
          if (updateError) throw updateError;
          
          setShowSuccess(true);
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 1500);
          return;
        }
        
        // No existing option, safe to create
        const { data: insertedOption, error: insertError } = await supabase
          .from('service_options')
          .insert(customServiceOption)
          .select()
          .single();
        
        if (insertError) throw insertError;

        // Also copy the service_option_items relationships
        const { data: items, error: itemsError } = await supabase
          .from('service_option_items')
          .select('*')
          .eq('service_option_id', serviceOption.id);

        if (itemsError) throw itemsError;

        if (items && items.length > 0 && insertedOption) {
          // Copy the line items using the newly created option ID
          const newItems = items.map(item => ({
            service_option_id: insertedOption.id,
            line_item_id: item.line_item_id,
            quantity: item.quantity,
            is_optional: item.is_optional,
            display_order: item.display_order
          }));

          const { error: itemsInsertError } = await supabase
            .from('service_option_items')
            .insert(newItems);

          if (itemsInsertError) throw itemsInsertError;
        }
      }

      setShowSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      // Error saving custom pricing
      setError('Failed to save custom pricing. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !serviceOption) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity bg-black bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-lg px-4 pt-5 pb-4 overflow-hidden text-left align-bottom transition-all transform bg-[#1A1A1A] rounded-lg shadow-xl sm:my-8 sm:align-middle sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#336699]/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-[#336699]" />
              </div>
              <h3 className="text-lg font-semibold text-white">
                {existingCustom ? 'Update Custom Pricing' : 'Set Custom Pricing'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Service Option Info */}
          <div className="mb-6 p-4 bg-[#252525] rounded-lg">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-medium text-white">{serviceOption.name}</h4>
                {serviceOption.description && (
                  <p className="text-sm text-gray-400 mt-1">{serviceOption.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  {serviceOption.material_quality && (
                    <span className="capitalize">{serviceOption.material_quality} Quality</span>
                  )}
                  {serviceOption.warranty_months && (
                    <span>{serviceOption.warranty_months}mo Warranty</span>
                  )}
                  {serviceOption.estimated_hours && (
                    <span>{serviceOption.estimated_hours}h Labor</span>
                  )}
                </div>
              </div>
              <div className="text-right ml-4">
                <p className="text-sm text-gray-400">Standard Price</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(serviceOption.price)}/{serviceOption.unit}
                </p>
              </div>
            </div>
          </div>

          {/* Custom Pricing Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Your Custom Price
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400">$</span>
                </div>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="block w-full pl-8 pr-16 py-2 bg-[#252525] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#336699] focus:border-transparent"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-400">/{serviceOption.unit}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-[#336699]/10 rounded-lg border border-[#336699]/30">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-[#336699] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-white mb-1">How Custom Pricing Works</p>
                <ul className="space-y-1">
                  <li>• Sets your specific price for this service</li>
                  <li>• Overrides the standard pricing</li>
                  <li>• Only applies to your organization</li>
                  <li>• All discounts are handled at the estimate level</li>
                  <li>• Can be updated or removed anytime</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {showSuccess && (
            <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-400" />
                <p className="text-sm text-emerald-400">
                  Custom pricing saved successfully!
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-300 bg-[#252525] rounded-lg hover:bg-[#333333] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || showSuccess}
              className="flex-1 px-4 py-2 text-black bg-[#F59E0B] rounded-lg hover:bg-[#D97706] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? 'Saving...' : existingCustom ? 'Update Custom Price' : 'Save Custom Price'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};