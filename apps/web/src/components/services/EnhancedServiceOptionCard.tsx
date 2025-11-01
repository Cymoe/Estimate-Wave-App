import React, { useState } from 'react';
import { 
  Clock, 
  Shield, 
  Package, 
  Star, 
  ChevronDown, 
  ChevronUp,
  ChevronRight,
  Award,
  Wrench,
  CheckCircle,
  Users
} from 'lucide-react';

import { ServiceOption } from '../../services/ServiceCatalogService';
import { formatCurrency } from '../../utils/format';

interface EnhancedServiceOptionCardProps {
  option: ServiceOption;
  isSelected: boolean;
  onSelect: () => void;
  industryName?: string;
  lineItems?: Array<{
    line_item: {
      id: string;
      name: string;
      description: string;
      price: number;
      unit: string;
    };
    quantity: number;
    is_optional: boolean;
  }>;
  layoutMode?: 'tabs' | 'collapsible' | 'cards' | 'columns' | 'default';
}

export const EnhancedServiceOptionCard: React.FC<EnhancedServiceOptionCardProps> = ({ 
  option, 
  isSelected, 
  onSelect,
  lineItems = [],
  layoutMode = 'default'
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'labor' | 'materials' | 'equipment' | 'services'>('labor');
  const [showModal, setShowModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const isBaseOption = option.name === 'Standard' || option.is_popular;
  
  // Toggle section for collapsible layout
  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };
  
  // Categorize line items by type
  const categorizedItems = {
    labor: [] as any[],
    materials: [] as any[],
    equipment: [] as any[],
    services: [] as any[]
  };

  if (lineItems.length > 0) {
    // Line items loaded
    // Group line items by category
    lineItems.filter(item => !item.is_optional).forEach(item => {
      const itemData = {
        name: item.line_item.name,
        quantity: item.quantity.toString(),
        unit: item.line_item.unit,
        price: item.line_item.price,
        total: item.line_item.price * item.quantity
      };
      
      // Categorize by actual category from database
      const category = item.line_item.category || 'material';
      
      switch (category) {
        case 'labor':
          categorizedItems.labor.push(itemData);
          break;
        case 'equipment':
          categorizedItems.equipment.push(itemData);
          break;
        case 'service':
          categorizedItems.services.push(itemData);
          break;
        case 'material':
        default:
          categorizedItems.materials.push(itemData);
          break;
      }
    });
  } else if (option.materials_list) {
    // Fall back to old materials list
    categorizedItems.materials = option.materials_list.map(material => {
      const [name, quantity, unit] = material.split(':');
      return { name, quantity, unit };
    });
  }

  const totalLineItems = Object.values(categorizedItems).reduce((sum, items) => sum + items.length, 0);

  // Get quality badge color
  const getQualityColor = (quality?: string) => {
    switch (quality) {
      case 'economy': return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
      case 'standard': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'premium': return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
      case 'luxury': return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  // Format attribute key for display
  const formatAttributeKey = (key: string): string => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Format attribute value for display
  const formatAttributeValue = (value: any): string => {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'string') return value.replace(/_/g, ' ');
    return String(value);
  };

  // Identify key attributes to highlight
  const getKeyAttributes = () => {
    if (!option.attributes) return [];
    
    const priorityKeys = [
      'fire_rating', 'wind_rating', 'energy_rating', 'warranty_type', 
      'coverage', 'thickness', 'insulation_value', 'efficiency_rating',
      'voc_level', 'ada_compliant', 'lead_time', 'noise_reduction'
    ];
    
    return Object.entries(option.attributes)
      .filter(([key]) => priorityKeys.includes(key))
      .slice(0, 3);
  };

  const keyAttributes = getKeyAttributes();

  // Calculate category subtotals
  const categorySubtotals = {
    labor: categorizedItems.labor.reduce((sum, item) => sum + (item.total || 0), 0),
    materials: categorizedItems.materials.reduce((sum, item) => sum + (item.total || 0), 0),
    equipment: categorizedItems.equipment.reduce((sum, item) => sum + (item.total || 0), 0),
    services: categorizedItems.services.reduce((sum, item) => sum + (item.total || 0), 0)
  };

  // Layout Mode: Tabbed Categories
  const renderTabbedLayout = () => (
    <div className="border-t border-[#333333] p-4 bg-[#1D1F25]">
      {/* Tab Navigation */}
      <div className="flex border-b border-[#444444] mb-4">
        {(['labor', 'materials', 'equipment', 'services'] as const).map((category) => {
          const items = categorizedItems[category];
          const isActive = activeTab === category;
          if (items.length === 0) return null;
          
          return (
            <button
              key={category}
              onClick={() => setActiveTab(category)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive 
                  ? 'border-[#336699] text-white bg-[#336699]/10' 
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {category === 'labor' && <Users className="w-4 h-4" />}
                {category === 'materials' && <Package className="w-4 h-4" />}
                {category === 'equipment' && <Wrench className="w-4 h-4" />}
                {category === 'services' && <CheckCircle className="w-4 h-4" />}
                <span className="capitalize">{category}</span>
                <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">
                  {formatCurrency(categorySubtotals[category])}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Active Tab Content */}
      <div className="space-y-2">
        {categorizedItems[activeTab].map((item, index) => (
          <div key={index} className="flex items-center justify-between text-sm p-2 bg-[#222222] rounded">
            <span className="text-gray-300">{item.name}</span>
            <span className="text-white font-mono">
              {item.quantity} {item.unit}
              <span className="text-gray-500 ml-2">
                (${item.price.toFixed(2)}/{item.unit})
              </span>
            </span>
          </div>
        ))}
      </div>
      
      {/* Total Summary */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex justify-between font-semibold">
          <span className="text-gray-300">Total:</span>
          <span className="text-white font-mono">
            {formatCurrency(Object.values(categorySubtotals).reduce((sum, val) => sum + val, 0))}
          </span>
        </div>
      </div>
    </div>
  );

  // Layout Mode: Collapsible Sections
  const renderCollapsibleLayout = () => (
      <div className="border-t border-[#333333] p-4 bg-[#1D1F25]">
        <div className="space-y-2">
          {(['labor', 'materials', 'equipment', 'services'] as const).map((category) => {
            const items = categorizedItems[category];
            if (items.length === 0) return null;
            
            const isExpanded = expandedSections.has(category);
            
            return (
              <div key={category} className="border border-[#444444] rounded">
                <button
                  onClick={() => toggleSection(category)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#252525] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {category === 'labor' && <Users className="w-4 h-4" />}
                    {category === 'materials' && <Package className="w-4 h-4" />}
                    {category === 'equipment' && <Wrench className="w-4 h-4" />}
                    {category === 'services' && <CheckCircle className="w-4 h-4" />}
                    <span className="capitalize text-gray-300">{category}</span>
                    <span className="text-xs text-gray-500">({items.length} items)</span>
                  </div>
                  <span className="text-white font-mono">
                    {formatCurrency(categorySubtotals[category])}
                  </span>
                </button>
                
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-2 bg-[#1E1E1E]">
                    {items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">{item.name}</span>
                        <span className="text-white font-mono">
                          {item.quantity} {item.unit}
                          <span className="text-gray-500 ml-2">
                            (${item.price.toFixed(2)})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Total Summary */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex justify-between font-semibold">
            <span className="text-gray-300">Total:</span>
            <span className="text-white font-mono">
              {formatCurrency(Object.values(categorySubtotals).reduce((sum, val) => sum + val, 0))}
            </span>
          </div>
        </div>
      </div>
    );

  // Layout Mode: Summary Cards
  const renderCardsLayout = () => (
    <div className="border-t border-[#333333] p-4 bg-[#1D1F25]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {(['labor', 'materials', 'equipment', 'services'] as const).map((category) => {
          const items = categorizedItems[category];
          if (items.length === 0) return null;
          
          return (
            <button
              key={category}
              onClick={() => setShowModal(true)}
              className="p-3 bg-[#252525] hover:bg-[#2A2A2A] border border-[#444444] rounded transition-colors text-center"
            >
              <div className="flex flex-col items-center gap-2">
                {category === 'labor' && <Users className="w-5 h-5 text-blue-400" />}
                {category === 'materials' && <Package className="w-5 h-5 text-green-400" />}
                {category === 'equipment' && <Wrench className="w-5 h-5 text-orange-400" />}
                {category === 'services' && <CheckCircle className="w-5 h-5 text-purple-400" />}
                <div className="text-xs text-gray-400 capitalize">{category}</div>
                <div className="text-sm font-mono text-white">
                  {formatCurrency(categorySubtotals[category])}
                </div>
                <div className="text-xs text-gray-500">{items.length} items</div>
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Total Summary */}
      <div className="pt-3 border-t border-gray-700">
        <div className="flex justify-between font-semibold">
          <span className="text-gray-300">Total:</span>
          <span className="text-white font-mono">
            {formatCurrency(Object.values(categorySubtotals).reduce((sum, val) => sum + val, 0))}
          </span>
        </div>
      </div>
      
      <div className="text-center mt-3">
        <button
          onClick={() => setShowModal(true)}
          className="text-[#336699] text-sm hover:text-[#4477aa] transition-colors"
        >
          View detailed breakdown →
        </button>
      </div>
    </div>
  );

  // Layout Mode: Horizontal Columns
  const renderColumnsLayout = () => (
    <div className="border-t border-[#333333] p-4 bg-[#1D1F25]">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(['labor', 'materials', 'equipment', 'services'] as const).map((category) => {
          const items = categorizedItems[category];
          if (items.length === 0) return null;
          
          return (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-300 border-b border-[#444444] pb-2">
                {category === 'labor' && <Users className="w-4 h-4" />}
                {category === 'materials' && <Package className="w-4 h-4" />}
                {category === 'equipment' && <Wrench className="w-4 h-4" />}
                {category === 'services' && <CheckCircle className="w-4 h-4" />}
                <span className="capitalize">{category}</span>
              </div>
              
              <div className="space-y-1 text-xs">
                {items.map((item, index) => (
                  <div key={index} className="flex flex-col">
                    <span className="text-gray-400">{item.name}</span>
                    <span className="text-white font-mono">
                      {item.quantity} {item.unit} • ${item.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              
              <div className="pt-2 border-t border-[#444444]">
                <div className="text-xs text-gray-400">Subtotal:</div>
                <div className="text-sm font-mono text-white">
                  {formatCurrency(categorySubtotals[category])}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Total Summary */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex justify-between font-semibold">
          <span className="text-gray-300">Total:</span>
          <span className="text-white font-mono">
            {formatCurrency(Object.values(categorySubtotals).reduce((sum, val) => sum + val, 0))}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`border transition-all ${
        isSelected 
          ? 'border-[#336699] bg-[#336699]/10' 
          : 'border-[#333333] bg-[#1D1F25] hover:border-[#444444]'
      }`}
    >
      {/* Main Card Content */}
      <div
        onClick={onSelect}
        className="p-4 cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-white font-medium">
                {option.name}
              </h4>
              
              {/* Quality Badge */}
              {option.material_quality && (
                <span className={`px-2 py-0.5 text-xs rounded-full border ${getQualityColor(option.material_quality)}`}>
                  {option.material_quality.charAt(0).toUpperCase() + option.material_quality.slice(1)}
                </span>
              )}
              
              {/* Popular Badge */}
              {isBaseOption && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-[#336699]/20 text-[#336699] border border-[#336699]/50">
                  <Star className="w-3 h-3 inline mr-1" />
                  Popular
                </span>
              )}
              
              {/* Key Attributes as Badges */}
              {keyAttributes.map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 text-xs rounded bg-gray-700/50 text-gray-300">
                  {formatAttributeKey(key)}: {formatAttributeValue(value)}
                </span>
              ))}
            </div>
            
            {option.description && (
              <p className="text-sm text-gray-400 mt-1">{option.description}</p>
            )}

            {/* Quick Stats */}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              {option.estimated_hours && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {option.estimated_hours}h
                </span>
              )}
              {option.warranty_months && (
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {option.warranty_months}mo warranty
                </span>
              )}
              {totalLineItems > 0 && (
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {totalLineItems} items
                </span>
              )}
              {option.skill_level && (
                <span className="flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  {option.skill_level}
                </span>
              )}
            </div>
          </div>

          <div className="text-right ml-4">
            <div className="font-mono text-lg text-white">
              {formatCurrency(option.price)}
            </div>
            <div className="text-xs text-gray-400">
              per {option.unit.replace(/_/g, ' ')}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Details Section */}
      <div className="border-t border-[#333333] px-4 py-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
          className="w-full flex items-center justify-between text-sm text-gray-400 hover:text-white transition-colors"
        >
          <span>View Details</span>
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Detailed Information - Conditional Layout */}
      {showDetails && (
        <>
          {layoutMode === 'tabs' && renderTabbedLayout()}
          {layoutMode === 'collapsible' && renderCollapsibleLayout()}
          {layoutMode === 'cards' && renderCardsLayout()}
          {layoutMode === 'columns' && renderColumnsLayout()}
          {layoutMode === 'default' && (
            <div className="border-t border-[#333333] p-4 bg-[#1D1F25]">
              <div className="space-y-4">
                {/* Labor */}
                {categorizedItems.labor.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Labor
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.labor.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white font-mono">
                            {item.quantity} {item.unit}
                            <span className="text-gray-500 ml-2">
                              (${item.price.toFixed(2)}/{item.unit})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Materials List */}
                {categorizedItems.materials.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Materials
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.materials.map((material, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{material.name}</span>
                          <span className="text-white font-mono">
                            {material.quantity} {material.unit}
                            {material.price && (
                              <span className="text-gray-500 ml-2">
                                (${material.price.toFixed(2)})
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Equipment */}
                {categorizedItems.equipment.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      Equipment
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.equipment.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white font-mono">
                            {item.quantity} {item.unit}
                            <span className="text-gray-500 ml-2">
                              (${item.price.toFixed(2)}/{item.unit})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Services */}
                {categorizedItems.services.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Services
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.services.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white font-mono">
                            {item.quantity} {item.unit}
                            <span className="text-gray-500 ml-2">
                              (${item.price.toFixed(2)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total Cost Summary */}
                {lineItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="space-y-1">
                      {categorizedItems.labor.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Labor:</span>
                          <span className="text-white font-mono">
                            {formatCurrency(categorizedItems.labor.reduce((sum, m) => sum + (m.total || 0), 0))}
                          </span>
                        </div>
                      )}
                      {categorizedItems.materials.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Materials:</span>
                          <span className="text-white font-mono">
                            {formatCurrency(categorizedItems.materials.reduce((sum, m) => sum + (m.total || 0), 0))}
                          </span>
                        </div>
                      )}
                      {categorizedItems.equipment.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Equipment:</span>
                          <span className="text-white font-mono">
                            {formatCurrency(categorizedItems.equipment.reduce((sum, m) => sum + (m.total || 0), 0))}
                          </span>
                        </div>
                      )}
                      {categorizedItems.services.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Services:</span>
                          <span className="text-white font-mono">
                            {formatCurrency(categorizedItems.services.reduce((sum, m) => sum + (m.total || 0), 0))}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-semibold pt-1 border-t border-gray-700">
                        <span className="text-gray-300">Total:</span>
                        <span className="text-white font-mono">
                          {formatCurrency(
                            Object.values(categorizedItems).flat().reduce((sum, item) => sum + (item.total || 0), 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal for Cards Layout */}
      {showModal && layoutMode === 'cards' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1D1F25] border border-[#333333] rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-[#333333] flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{option.name} - Detailed Breakdown</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="space-y-4">
                {/* Labor */}
                {categorizedItems.labor.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Labor
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.labor.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm p-2 bg-[#222222] rounded">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white font-mono">
                            {item.quantity} {item.unit}
                            <span className="text-gray-500 ml-2">
                              (${item.price.toFixed(2)}/{item.unit})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Materials */}
                {categorizedItems.materials.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Materials
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.materials.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm p-2 bg-[#222222] rounded">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white font-mono">
                            {item.quantity} {item.unit}
                            <span className="text-gray-500 ml-2">
                              (${item.price.toFixed(2)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Equipment */}
                {categorizedItems.equipment.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      Equipment
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.equipment.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm p-2 bg-[#222222] rounded">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white font-mono">
                            {item.quantity} {item.unit}
                            <span className="text-gray-500 ml-2">
                              (${item.price.toFixed(2)}/{item.unit})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Services */}
                {categorizedItems.services.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Services
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {categorizedItems.services.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm p-2 bg-[#222222] rounded">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white font-mono">
                            {item.quantity} {item.unit}
                            <span className="text-gray-500 ml-2">
                              (${item.price.toFixed(2)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total Summary */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="space-y-1">
                    {categorizedItems.labor.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Labor:</span>
                        <span className="text-white font-mono">
                          {formatCurrency(categorySubtotals.labor)}
                        </span>
                      </div>
                    )}
                    {categorizedItems.materials.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Materials:</span>
                        <span className="text-white font-mono">
                          {formatCurrency(categorySubtotals.materials)}
                        </span>
                      </div>
                    )}
                    {categorizedItems.equipment.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Equipment:</span>
                        <span className="text-white font-mono">
                          {formatCurrency(categorySubtotals.equipment)}
                        </span>
                      </div>
                    )}
                    {categorizedItems.services.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Services:</span>
                        <span className="text-white font-mono">
                          {formatCurrency(categorySubtotals.services)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold pt-1 border-t border-gray-700">
                      <span className="text-gray-300">Total:</span>
                      <span className="text-white font-mono">
                        {formatCurrency(Object.values(categorySubtotals).reduce((sum, val) => sum + val, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};