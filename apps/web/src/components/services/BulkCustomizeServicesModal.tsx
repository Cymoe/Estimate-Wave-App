import React, { useState } from 'react';
import { X, Copy, AlertCircle, Check, Package2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';

interface BulkCustomizeServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: any[];
  organizationId: string;
  industryName: string;
  onSuccess?: () => void;
}

export const BulkCustomizeServicesModal: React.FC<BulkCustomizeServicesModalProps> = ({
  isOpen,
  onClose,
  services,
  organizationId,
  industryName,
  onSuccess
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copyProgress, setCopyProgress] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());

  // Calculate total service options across all services
  const totalOptions = services.reduce((sum, service) => sum + (service.templates?.length || 0), 0);
  const selectedCount = Array.from(selectedServices).reduce((sum, serviceId) => {
    const service = services.find(s => s.id === serviceId);
    return sum + (service?.templates?.length || 0);
  }, 0);

  const toggleService = (serviceId: string) => {
    const newSelected = new Set(selectedServices);
    if (newSelected.has(serviceId)) {
      newSelected.delete(serviceId);
    } else {
      newSelected.add(serviceId);
    }
    setSelectedServices(newSelected);
  };

  const toggleAll = () => {
    if (selectedServices.size === services.length) {
      setSelectedServices(new Set());
    } else {
      setSelectedServices(new Set(services.map(s => s.id)));
    }
  };

  const handleBulkCopy = async () => {
    if (selectedServices.size === 0) {
      setError('Please select at least one service to customize');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopyProgress(0);

    try {
      let copiedCount = 0;
      const totalToCopy = selectedCount;

      for (const serviceId of selectedServices) {
        const service = services.find(s => s.id === serviceId);
        if (!service?.templates) continue;

        for (const template of service.templates) {
          // Skip if already customized for this org
          if (template.organization_id === organizationId) {
            copiedCount++;
            setCopyProgress(Math.round((copiedCount / totalToCopy) * 100));
            continue;
          }

          // Create custom copy with only valid database fields
          const customOption = {
            name: template.name,
            description: template.description,
            service_id: template.service_id,
            organization_id: organizationId,
            price: template.price,
            unit: template.unit,
            is_template: true,
            attributes: template.attributes || {},
            material_quality: template.material_quality,
            warranty_months: template.warranty_months,
            estimated_hours: template.estimated_hours,
            skill_level: template.skill_level,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const { data: newOption, error: insertError } = await supabase
            .from('service_options')
            .insert(customOption)
            .select()
            .single();

          if (insertError) throw insertError;

          // Copy service_option_items if they exist
          if (template.service_option_items && template.service_option_items.length > 0) {
            const newItems = template.service_option_items.map((item: any) => ({
              service_option_id: newOption.id,
              line_item_id: item.line_item?.id || item.line_item_id,
              quantity: item.quantity,
              is_optional: item.is_optional,
              display_order: item.display_order
            }));

            const { error: itemsError } = await supabase
              .from('service_option_items')
              .insert(newItems);

            if (itemsError) throw itemsError;
          }

          copiedCount++;
          setCopyProgress(Math.round((copiedCount / totalToCopy) * 100));
        }
      }

      setShowSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error bulk copying services:', err);
      setError('Failed to customize services. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-2xl px-4 pt-5 pb-4 overflow-hidden text-left align-bottom transition-all transform bg-[#1A1A1A] rounded-lg shadow-xl sm:my-8 sm:align-middle sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#336699]/10 rounded-lg">
                <Package2 className="w-5 h-5 text-[#336699]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Bulk Customize {industryName} Services
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Copy shared pricing to create your own custom versions
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Service Selection */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-300">
                Select Services to Customize
              </label>
              <button
                onClick={toggleAll}
                className="text-sm text-[#336699] hover:text-[#4477aa] transition-colors"
              >
                {selectedServices.size === services.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto bg-[#252525] rounded-lg p-3">
              {services.map(service => {
                const isSelected = selectedServices.has(service.id);
                const optionCount = service.templates?.length || 0;
                const customCount = service.templates?.filter((t: any) => 
                  t.organization_id === organizationId
                ).length || 0;

                return (
                  <label
                    key={service.id}
                    className={`flex items-center justify-between p-3 rounded cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#336699]/20' : 'hover:bg-[#333333]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleService(service.id)}
                        className="w-4 h-4 text-[#336699] bg-[#1A1A1A] border-[#333333] rounded focus:ring-[#336699]"
                      />
                      <div>
                        <p className="text-white font-medium">{service.name}</p>
                        <p className="text-xs text-gray-400">
                          {optionCount} options • {customCount} already customized
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">
                      {formatCurrency(service.min_price || 0)} - {formatCurrency(service.max_price || 0)}
                    </span>
                  </label>
                );
              })}
            </div>

            <p className="text-sm text-gray-400 mt-2">
              {selectedCount} service options selected
            </p>
          </div>

          {/* Info Box */}
          <div className="mb-6 p-4 bg-[#336699]/10 rounded-lg border border-[#336699]/30">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-[#336699] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-white mb-1">What This Does</p>
                <ul className="space-y-1">
                  <li>• Creates custom copies of all service options in selected services</li>
                  <li>• Preserves all line items and labor components</li>
                  <li>• You can then adjust individual prices as needed</li>
                  <li>• Existing customizations won't be duplicated</li>
                  <li>• Original shared pricing remains available to other contractors</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {isLoading && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400">Copying services...</span>
                <span className="text-sm text-gray-400">{copyProgress}%</span>
              </div>
              <div className="w-full bg-[#252525] rounded-full h-2">
                <div 
                  className="bg-[#336699] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${copyProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {showSuccess && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-400" />
                <p className="text-sm text-emerald-400">
                  Services customized successfully!
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-gray-300 bg-[#252525] rounded-lg hover:bg-[#333333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkCopy}
              disabled={isLoading || showSuccess || selectedServices.size === 0}
              className="flex-1 px-4 py-2 text-black bg-[#F59E0B] rounded-lg hover:bg-[#D97706] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Customizing...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Create Custom Copies
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};