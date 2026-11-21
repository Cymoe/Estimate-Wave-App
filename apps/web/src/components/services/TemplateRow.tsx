import React, { useState } from 'react';
import { 
  Plus, 
  Minus, 
  Info, 
  Package,
  Clock,
  Shield,
  DollarSign,
  ChevronRight,
  Settings2
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { ServiceAttributesDisplay } from './ServiceAttributesDisplay';

interface ServiceTemplate {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  estimated_hours?: number;
  warranty_months?: number;
  material_quality?: 'economy' | 'standard' | 'premium' | 'luxury';
  is_template: boolean;
  template_category?: string;
  template_context?: string;
  service_name?: string;
  line_item_count?: number;
  attributes?: Record<string, any>;
  industry_name?: string;
  materials_list?: string[];
  skill_level?: 'basic' | 'intermediate' | 'advanced' | 'expert';
  service_option_items?: Array<{
    id: string;
    quantity: number;
    line_item?: {
      id: string;
      name: string;
      price: number;
      unit: string;
    };
  }>;
}

interface TemplateRowProps {
  template: ServiceTemplate;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onShowDetails?: () => void;
  isInCart?: boolean;
  allowRemove?: boolean;
  onCustomizePricing?: () => void;
  hasCustomPricing?: boolean;
  organizationId?: string;
}

export const TemplateRow: React.FC<TemplateRowProps> = ({ 
  template, 
  quantity,
  onQuantityChange,
  onShowDetails,
  isInCart = false,
  allowRemove = true,
  onCustomizePricing,
  hasCustomPricing = false,
  organizationId
}) => {
  const [showQuickInfo, setShowQuickInfo] = useState(false);
  const [showExpandedAttributes, setShowExpandedAttributes] = useState(false);
  const [showLineItems, setShowLineItems] = useState(false);

  const getQualityColor = (quality?: string) => {
    switch (quality) {
      case 'economy': return 'text-gray-400';
      case 'standard': return 'text-blue-400';
      case 'premium': return 'text-purple-400';
      case 'luxury': return 'text-amber-400';
      default: return 'text-gray-400';
    }
  };

  const handleQuantityChange = (delta: number) => {
    const newQuantity = Math.max(0, quantity + delta);
    if (allowRemove || newQuantity > 0) {
      onQuantityChange(newQuantity);
    }
  };

  const handleInputChange = (value: string) => {
    const num = parseFloat(value) || 0;
    if (allowRemove || num > 0) {
      onQuantityChange(Math.max(0, num));
    }
  };

  const totalPrice = template.price * quantity;

  return (
    <div 
      className={`border rounded transition-all ${
        isInCart 
          ? 'border-[#336699] bg-[#336699]/5' 
          : 'border-[#333333] hover:border-[#444444]'
      }`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          {/* Template Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium">{template.name}</h4>
              
              {/* Quality Badge */}
              {template.material_quality && (
                <span className={`text-xs ${getQualityColor(template.material_quality)}`}>
                  {template.material_quality.charAt(0).toUpperCase() + template.material_quality.slice(1)}
                </span>
              )}

              {/* Service Name */}
              {template.service_name && (
                <span className="text-xs text-gray-500">
                  {template.service_name}
                </span>
              )}
            </div>

            {/* Description */}
            {template.description && (
              <p className="text-sm text-gray-400 mt-1">{template.description}</p>
            )}

            {/* Quick Stats */}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              {(hasCustomPricing || template.organization_id) && (
                <span className="text-[#F59E0B]">(customized pricing)</span>
              )}

              {template.estimated_hours && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {template.estimated_hours}h
                </span>
              )}

              {template.warranty_months && (
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {template.warranty_months}mo
                </span>
              )}

              {template.skill_level && (
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${
                    template.skill_level === 'basic' ? 'bg-green-500' :
                    template.skill_level === 'intermediate' ? 'bg-yellow-500' :
                    template.skill_level === 'advanced' ? 'bg-orange-500' :
                    'bg-red-500'
                  }`} />
                  {template.skill_level}
                </span>
              )}

              {template.line_item_count && template.line_item_count > 0 && (
                <button
                  onClick={() => setShowLineItems(!showLineItems)}
                  className="flex items-center gap-1 text-[#336699] hover:text-[#4477aa] transition-colors"
                >
                  <Package className="w-3 h-3" />
                  {template.line_item_count} items
                  <ChevronRight className={`w-3 h-3 transition-transform ${showLineItems ? 'rotate-90' : ''}`} />
                </button>
              )}
              
              {/* Key attribute badges */}
              {template.attributes?.permit_required && (
                <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded text-xs font-medium">
                  Permit Required
                </span>
              )}
              
              {template.attributes?.energy_star && (
                <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-xs font-medium">
                  Energy Star
                </span>
              )}
              
              {template.attributes?.code_compliance && (
                <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded text-xs font-medium">
                  Code Compliant
                </span>
              )}
            </div>

            {/* Materials List - Show for enhanced industries */}
            {template.materials_list && template.materials_list.length > 0 && 
             (['Flooring', 'Roofing', 'Plumbing', 'Solar', 'Electrical', 'Landscaping'].includes(template.industry_name || '')) && (
              <div className="mt-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-gray-400">Materials:</span>
                  <div className="flex flex-wrap gap-1">
                    {template.materials_list.slice(0, 4).map((material, idx) => (
                      <span 
                        key={idx} 
                        className="text-xs bg-[#252525] text-gray-300 px-2 py-0.5 rounded"
                      >
                        {material}
                      </span>
                    ))}
                    {template.materials_list.length > 4 && (
                      <span className="text-xs text-gray-500">
                        +{template.materials_list.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Context/Category Tags */}
            {(template.template_context || template.template_category) && (
              <div className="flex items-center gap-2 mt-2">
                {template.template_context && (
                  <span className="text-xs bg-gray-700/30 text-gray-400 px-2 py-0.5 rounded">
                    {template.template_context}
                  </span>
                )}
                {template.template_category && (
                  <span className="text-xs bg-gray-700/30 text-gray-400 px-2 py-0.5 rounded">
                    {template.template_category}
                  </span>
                )}
              </div>
            )}

            {/* Technical Attributes */}
            {template.attributes && Object.keys(template.attributes).length > 0 && (
              <ServiceAttributesDisplay
                attributes={template.attributes}
                industry={template.industry_name}
                showAll={false}
                isExpanded={showExpandedAttributes}
                onToggle={() => setShowExpandedAttributes(!showExpandedAttributes)}
              />
            )}

            {/* Line Items Breakdown */}
            {showLineItems && template.service_option_items && template.service_option_items.length > 0 && (
              <div className="mt-3 p-3 bg-[#252525]/50 rounded border border-[#333333]">
                <div className="space-y-1">
                  {template.service_option_items.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-300">
                          {item.quantity} × {item.line_item?.name || 'Unknown item'}
                        </span>
                        <span className="text-gray-500">
                          @ {formatCurrency(item.line_item?.price || 0)}
                        </span>
                      </div>
                      <span className="text-gray-400 font-mono">
                        {formatCurrency((item.line_item?.price || 0) * item.quantity)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-1 mt-1 border-t border-[#333333] flex justify-between text-xs">
                    <span className="text-gray-400">Total calculated price:</span>
                    <span className="text-white font-mono">
                      {formatCurrency(
                        template.service_option_items.reduce(
                          (sum, item) => sum + (item.line_item?.price || 0) * item.quantity,
                          0
                        )
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quantity Controls and Price */}
          <div className="flex items-center gap-3">
            {/* Quantity Controls */}
            <div className="flex items-center gap-1 bg-[#1A1A1A] rounded border border-[#333333]">
              <button
                onClick={() => handleQuantityChange(-1)}
                disabled={!allowRemove && quantity <= 1}
                className={`p-1.5 transition-colors ${
                  (!allowRemove && quantity <= 1)
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>
              
              <input
                type="number" inputMode="decimal"
                value={quantity}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-16 text-center bg-transparent text-white text-sm focus:outline-none"
                min={allowRemove ? 0 : 1}
                step="1"
              />
              
              <button
                onClick={() => handleQuantityChange(1)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-[#252525] transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Total Price */}
            <div className="text-right min-w-[100px]">
              <div className="text-white font-mono font-medium">
                {formatCurrency(totalPrice)}
              </div>
              {quantity > 1 && (
                <div className="text-xs text-gray-500">
                  {quantity} × {formatCurrency(template.price)}
                </div>
              )}
            </div>

            {/* Info/Details Button */}
            <div className="flex items-center gap-1">
              {/* Customize Pricing Button */}
              {onCustomizePricing && organizationId && (
                <button
                  onClick={onCustomizePricing}
                  className={`p-1.5 transition-colors ${
                    hasCustomPricing || template.organization_id
                      ? 'text-[#F59E0B] hover:text-[#D97706]' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title={hasCustomPricing || template.organization_id ? 'Update custom pricing' : 'Customize pricing for your business'}
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              )}
              <button
                onMouseEnter={() => setShowQuickInfo(true)}
                onMouseLeave={() => setShowQuickInfo(false)}
                className="p-1.5 text-gray-400 hover:text-white transition-colors relative"
              >
                <Info className="w-4 h-4" />
                
                {/* Quick Info Tooltip */}
                {showQuickInfo && (
                  <div className="absolute right-0 top-8 w-64 p-3 bg-[#252525] border border-[#444444] rounded shadow-lg z-10">
                    <div className="text-xs text-gray-300">
                      <div className="font-medium text-white mb-2">{template.name}</div>
                      {template.description && (
                        <p className="mb-2">{template.description}</p>
                      )}
                      <div className="space-y-1">
                        <div>Base Price: {formatCurrency(template.price)}</div>
                        {template.estimated_hours && (
                          <div>Est. Time: {template.estimated_hours} hours</div>
                        )}
                        {template.warranty_months && (
                          <div>Warranty: {template.warranty_months} months</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </button>

              {onShowDetails && (
                <button
                  onClick={onShowDetails}
                  className="p-1.5 text-gray-400 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};