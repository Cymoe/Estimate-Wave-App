import React from 'react';
import { 
  X, 
  Package, 
  Clock,
  Shield,
  CheckCircle,
  AlertCircle,
  Hash,
  Sparkles
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface PackageDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  package: any;
  onAddToCart?: () => void;
}

// Helper functions outside components
const getLevelColor = (level: string) => {
  switch (level) {
    case 'essentials': return 'text-blue-400';
    case 'complete': return 'text-purple-400';
    case 'deluxe': return 'text-amber-400';
    default: return 'text-gray-400';
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'labor': return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
    case 'material': return 'text-green-400 bg-green-400/10 border-green-400/30';
    case 'equipment': return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
    case 'service': return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
  }
};

const getCategoryLabel = (category: string) => {
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Other';
};

export const PackageDetailsModal: React.FC<PackageDetailsModalProps> = ({
  isOpen,
  onClose,
  package: pkg,
  onAddToCart
}) => {
  if (!isOpen || !pkg) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1A1A1A] border border-[#333333] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#333333] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-6 h-6 text-[#336699]" />
              <h2 className="text-2xl font-semibold text-white">{pkg.name}</h2>
              <span className={`text-sm font-medium ${getLevelColor(pkg.level)}`}>
                {pkg.level?.charAt(0).toUpperCase() + pkg.level?.slice(1)}
              </span>
            </div>
            {pkg.description && (
              <p className="text-gray-400 text-sm">{pkg.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              {pkg.industry_name && (
                <span>Industry: {pkg.industry_name}</span>
              )}
              {pkg.typical_project_size && (
                <span>• {pkg.typical_project_size} projects</span>
              )}
              {pkg.completion_days && (
                <span>• {pkg.completion_days} days typical</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {(pkg.templates || pkg.service_package_templates) && (pkg.templates || pkg.service_package_templates).length > 0 ? (
            <div className="space-y-6">
              {/* Required Services */}
              {(pkg.templates || pkg.service_package_templates).filter((t: any) => !t.is_optional).length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    Included Services
                  </h3>
                  <div className="space-y-4">
                    {(pkg.templates || pkg.service_package_templates)
                      .filter((t: any) => !t.is_optional)
                      .map((item: any) => (
                        <ServiceTemplateDetail key={item.id} item={item} />
                      ))}
                  </div>
                </div>
              )}

              {/* Optional Services */}
              {(pkg.templates || pkg.service_package_templates).filter((t: any) => t.is_optional).length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    Optional Add-ons
                    <span className="text-sm text-gray-400 font-normal">
                      • Enhance your package
                    </span>
                  </h3>
                  <div className="space-y-4">
                    {(pkg.templates || pkg.service_package_templates)
                      .filter((t: any) => t.is_optional)
                      .map((item: any) => (
                        <ServiceTemplateDetail key={item.id} item={item} isOptional />
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No service details available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#333333] bg-[#0A0A0A]">
          <div className="flex items-end justify-between">
            <div className="flex-1">
              {(() => {
                // Calculate totals
                let requiredTotal = 0;
                let optionalTotal = 0;
                
                const templates = pkg.templates || pkg.service_package_templates;
                if (templates) {
                  templates.forEach((templateItem: any) => {
                    if (templateItem.template) {
                      // Use the template's price (now corrected in database)
                      const templatePrice = templateItem.template.price || 0;
                      const total = templatePrice * (templateItem.quantity || 1);
                      
                      if (templateItem.is_optional) {
                        optionalTotal += total;
                      } else {
                        requiredTotal += total;
                      }
                    }
                  });
                }
                
                const hasOptionals = optionalTotal > 0;
                const potentialTotal = requiredTotal + optionalTotal;
                
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Current Selection</div>
                      <div className="text-2xl font-semibold text-white">
                        {formatCurrency(requiredTotal)}
                      </div>
                      {hasOptionals && (
                        <div className="text-xs text-gray-400 mt-1">
                          Base package only
                        </div>
                      )}
                    </div>
                    {hasOptionals && (
                      <div className="border-l border-[#333333] pl-4">
                        <div className="text-xs text-gray-500 mb-1">With All Add-ons</div>
                        <div className="text-2xl font-semibold text-green-400">
                          {formatCurrency(potentialTotal)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Includes all optional items
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-[#333333] text-gray-300 font-medium rounded hover:bg-[#252525] transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onAddToCart?.();
                  onClose();
                }}
                className="px-4 py-2 bg-[#336699] text-white font-medium rounded hover:bg-[#4477aa] transition-colors flex items-center gap-2"
              >
                <Package className="w-4 h-4" />
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-component for template details
const ServiceTemplateDetail: React.FC<{ item: any; isOptional?: boolean }> = ({ 
  item, 
  isOptional = false 
}) => {
  const template = item.template;
  if (!template) return null;

  // Use the stored template price (now corrected in database)
  const templatePrice = template.price || 0;

  return (
    <div className={`border rounded-lg ${isOptional ? 'border-amber-500/30 bg-amber-500/5' : 'border-[#333333] bg-[#252525]'} p-4 relative`}>
      {isOptional && (
        <div className="absolute -top-2 -right-2">
          <span className="bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
            OPTIONAL
          </span>
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-white font-medium flex items-center gap-2">
            {template.name}
            {item.quantity > 1 && (
              <span className="text-xs bg-[#336699] text-white px-2 py-0.5 rounded">
                ×{item.quantity}
              </span>
            )}
            {isOptional && (
              <span className="text-xs text-amber-400">• Optional</span>
            )}
          </h4>
          {template.description && (
            <p className="text-sm text-gray-400 mt-1">{template.description}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-white font-mono">
            {formatCurrency(templatePrice * (item.quantity || 1))}
          </div>
          <div className="text-xs text-gray-500">
            Total price
          </div>
        </div>
      </div>

      {/* Line Items Breakdown */}
      {template.service_option_items && template.service_option_items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#333333]">
          <div className="text-xs font-medium text-gray-400 mb-2">Contains:</div>
          <div className="space-y-3">
            {/* Group items by category */}
            {(() => {
              const grouped = template.service_option_items.reduce((acc: any, soi: any) => {
                const category = soi.line_item?.cost_code?.category || 'other';
                if (!acc[category]) acc[category] = [];
                acc[category].push(soi);
                return acc;
              }, {});

              // Calculate line items total for display purposes (currently not used but could be useful for validation)
              // const lineItemsTotal = template.service_option_items.reduce((sum: number, soi: any) => {
              //   return sum + (soi.line_item?.price || 0) * (soi.quantity || 0);
              // }, 0);

              return (
                <>
                  {Object.entries(grouped).map(([category, items]: [string, any]) => {
                    // Calculate category subtotal
                    const categoryTotal = items.reduce((sum: number, soi: any) => {
                      return sum + (soi.line_item?.price || 0) * (soi.quantity || 0);
                    }, 0);

                    return (
                      <div key={category}>
                        <div className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded border mb-2 ${getCategoryColor(category)}`}>
                          {getCategoryLabel(category)} ({items.length})
                        </div>
                        <div className="space-y-1 ml-2">
                          {items.map((soi: any) => {
                            const lineItem = soi.line_item;
                            const costCode = lineItem?.cost_code;
                            
                            return (
                              <div key={soi.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-3">
                                  <span className="text-gray-300">{lineItem?.name}</span>
                                  <span className="text-gray-500">
                                    ({soi.quantity} {lineItem?.unit})
                                  </span>
                                  {costCode && (
                                    <span className="text-gray-600 flex items-center gap-1">
                                      <Hash className="w-3 h-3" />
                                      {costCode.code}
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-400 font-mono">
                                  {formatCurrency(lineItem?.price * soi.quantity)}
                                </div>
                              </div>
                            );
                          })}
                          {/* Category Subtotal */}
                          <div className="flex items-center justify-between text-xs pt-1 mt-1 border-t border-[#2A2A2A]">
                            <span className="text-gray-500 font-medium">{getCategoryLabel(category)} Total</span>
                            <span className="text-gray-300 font-mono font-medium">
                              {formatCurrency(categoryTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Additional Info */}
      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
        {template.estimated_hours && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {template.estimated_hours}h
          </span>
        )}
        {template.warranty_months && (
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {template.warranty_months}mo warranty
          </span>
        )}
        {template.material_quality && (
          <span className="text-xs">
            {template.material_quality} quality
          </span>
        )}
      </div>
    </div>
  );
};