import React, { useState } from 'react';
import { 
  Filter, 
  X, 
  ChevronDown, 
  Thermometer, 
  Zap, 
  Shield, 
  Droplets,
  DollarSign,
  Sun,
  Battery,
  Settings,
  Ruler,
  Layers,
  Paintbrush,
  CheckCircle,
  HardHat,
  Package
} from 'lucide-react';

interface FilterConfig {
  key: string;
  label: string;
  type: 'range' | 'boolean' | 'select' | 'multi-select';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  icon?: React.ReactNode;
}

interface ServiceAttributeFiltersProps {
  industry: string;
  onFiltersChange: (filters: Record<string, any>) => void;
  activeFilters: Record<string, any>;
}

// Industry-specific filter configurations
const filterConfigs: Record<string, FilterConfig[]> = {
  'all industries': [
    {
      key: 'warranty_months',
      label: 'Minimum Warranty',
      type: 'range',
      min: 0,
      max: 60,
      step: 6,
      unit: 'months',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'permit_required',
      label: 'Permit Required',
      type: 'boolean',
      icon: <HardHat className="w-4 h-4" />
    },
    {
      key: 'material_quality',
      label: 'Material Quality',
      type: 'multi-select',
      options: [
        { value: 'economy', label: 'Economy' },
        { value: 'standard', label: 'Standard' },
        { value: 'premium', label: 'Premium' },
        { value: 'luxury', label: 'Luxury' }
      ],
      icon: <Layers className="w-4 h-4" />
    },
    {
      key: 'price_range',
      label: 'Price Range',
      type: 'range',
      min: 0,
      max: 1000,
      step: 50,
      unit: '$',
      icon: <DollarSign className="w-4 h-4" />
    }
  ],
  hvac: [
    {
      key: 'btu',
      label: 'BTU Range',
      type: 'range',
      min: 9000,
      max: 100000,
      step: 1000,
      unit: 'BTU',
      icon: <Thermometer className="w-4 h-4" />
    },
    {
      key: 'seer',
      label: 'SEER Rating',
      type: 'range',
      min: 13,
      max: 21,
      step: 1,
      icon: <Zap className="w-4 h-4" />
    },
    {
      key: 'energy_star',
      label: 'Energy Star',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'fuel_type',
      label: 'Fuel Type',
      type: 'select',
      options: [
        { value: 'natural_gas', label: 'Natural Gas' },
        { value: 'electric', label: 'Electric' },
        { value: 'propane', label: 'Propane' },
        { value: 'oil', label: 'Oil' }
      ]
    }
  ],
  painting: [
    {
      key: 'voc_level',
      label: 'VOC Level',
      type: 'select',
      options: [
        { value: 'zero', label: 'Zero VOC' },
        { value: 'low', label: 'Low VOC' },
        { value: 'medium', label: 'Medium VOC' },
        { value: 'high', label: 'High VOC' }
      ],
      icon: <Droplets className="w-4 h-4" />
    },
    {
      key: 'sheen',
      label: 'Sheen',
      type: 'multi-select',
      options: [
        { value: 'flat', label: 'Flat' },
        { value: 'eggshell', label: 'Eggshell' },
        { value: 'satin', label: 'Satin' },
        { value: 'semi_gloss', label: 'Semi-Gloss' },
        { value: 'gloss', label: 'Gloss' }
      ]
    },
    {
      key: 'coverage_sqft_per_gallon',
      label: 'Coverage',
      type: 'range',
      min: 200,
      max: 500,
      step: 25,
      unit: 'sq ft/gal'
    }
  ],
  windows: [
    {
      key: 'energy_star',
      label: 'Energy Star',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'glass_type',
      label: 'Glass Type',
      type: 'select',
      options: [
        { value: 'single_pane', label: 'Single Pane' },
        { value: 'double_pane', label: 'Double Pane' },
        { value: 'triple_pane', label: 'Triple Pane' }
      ]
    },
    {
      key: 'u_factor',
      label: 'U-Factor',
      type: 'range',
      min: 0.15,
      max: 0.50,
      step: 0.01,
      icon: <Thermometer className="w-4 h-4" />
    }
  ],
  flooring: [
    {
      key: 'wood_species',
      label: 'Wood Species',
      type: 'multi-select',
      options: [
        { value: 'oak', label: 'Oak' },
        { value: 'maple', label: 'Maple' },
        { value: 'cherry', label: 'Cherry' },
        { value: 'walnut', label: 'Walnut' },
        { value: 'bamboo', label: 'Bamboo' }
      ]
    },
    {
      key: 'finish',
      label: 'Finish',
      type: 'select',
      options: [
        { value: 'unfinished', label: 'Unfinished' },
        { value: 'prefinished', label: 'Prefinished' }
      ]
    },
    {
      key: 'thickness',
      label: 'Thickness',
      type: 'select',
      options: [
        { value: '1/4', label: '1/4"' },
        { value: '1/2', label: '1/2"' },
        { value: '3/4', label: '3/4"' }
      ]
    }
  ],
  roofing: [
    {
      key: 'material_type',
      label: 'Material Type',
      type: 'multi-select',
      options: [
        { value: 'asphalt_shingles', label: 'Asphalt Shingles' },
        { value: 'metal', label: 'Metal' },
        { value: 'tile', label: 'Tile' },
        { value: 'slate', label: 'Slate' },
        { value: 'flat_membrane', label: 'Flat Membrane' }
      ]
    },
    {
      key: 'wind_rating',
      label: 'Wind Rating',
      type: 'range',
      min: 90,
      max: 200,
      step: 10,
      unit: 'mph',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'fire_rating',
      label: 'Fire Rating',
      type: 'select',
      options: [
        { value: 'class_a', label: 'Class A' },
        { value: 'class_b', label: 'Class B' },
        { value: 'class_c', label: 'Class C' }
      ],
      icon: <Shield className="w-4 h-4" />
    }
  ],
  plumbing: [
    {
      key: 'pipe_diameter',
      label: 'Pipe Size',
      type: 'multi-select',
      options: [
        { value: '1/2 inch', label: '1/2"' },
        { value: '3/4 inch', label: '3/4"' },
        { value: '1 inch', label: '1"' },
        { value: '2 inch', label: '2"' },
        { value: '4 inch', label: '4"' }
      ],
      icon: <Ruler className="w-4 h-4" />
    },
    {
      key: 'pipe_material',
      label: 'Pipe Material',
      type: 'select',
      options: [
        { value: 'copper', label: 'Copper' },
        { value: 'pex', label: 'PEX' },
        { value: 'pvc', label: 'PVC' },
        { value: 'cpvc', label: 'CPVC' }
      ]
    },
    {
      key: 'includes_insulation',
      label: 'Insulation Included',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    }
  ],
  electrical: [
    {
      key: 'voltage',
      label: 'Voltage',
      type: 'multi-select',
      options: [
        { value: '120V', label: '120V' },
        { value: '240V', label: '240V' },
        { value: '480V', label: '480V' }
      ],
      icon: <Zap className="w-4 h-4" />
    },
    {
      key: 'code_compliance',
      label: 'Code Compliant',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'emergency_service',
      label: 'Emergency Service',
      type: 'boolean'
    }
  ],
  solar: [
    {
      key: 'inverter_type',
      label: 'Inverter Type',
      type: 'select',
      options: [
        { value: 'string', label: 'String Inverter' },
        { value: 'microinverter', label: 'Microinverters' },
        { value: 'power_optimizers', label: 'Power Optimizers' }
      ],
      icon: <Settings className="w-4 h-4" />
    },
    {
      key: 'monitoring',
      label: 'Monitoring Level',
      type: 'select',
      options: [
        { value: 'basic', label: 'Basic' },
        { value: 'smart', label: 'Smart' },
        { value: 'advanced', label: 'Advanced' }
      ]
    },
    {
      key: 'battery_included',
      label: 'Battery Storage',
      type: 'boolean',
      icon: <Battery className="w-4 h-4" />
    },
    {
      key: 'permit_included',
      label: 'Permit Included',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    }
  ],
  landscaping: [
    {
      key: 'drought_tolerant',
      label: 'Drought Tolerant',
      type: 'boolean',
      icon: <Droplets className="w-4 h-4" />
    },
    {
      key: 'maintenance_level',
      label: 'Maintenance Level',
      type: 'select',
      options: [
        { value: 'low', label: 'Low Maintenance' },
        { value: 'medium', label: 'Medium Maintenance' },
        { value: 'high', label: 'High Maintenance' }
      ]
    },
    {
      key: 'sun_requirements',
      label: 'Sun Requirements',
      type: 'select',
      options: [
        { value: 'full_sun', label: 'Full Sun' },
        { value: 'partial_sun', label: 'Partial Sun' },
        { value: 'shade', label: 'Shade' }
      ],
      icon: <Sun className="w-4 h-4" />
    },
    {
      key: 'includes_irrigation',
      label: 'Irrigation Included',
      type: 'boolean',
      icon: <Droplets className="w-4 h-4" />
    }
  ],
  carpentry: [
    {
      key: 'cabinet_type',
      label: 'Cabinet Type',
      type: 'multi-select',
      options: [
        { value: 'base', label: 'Base Cabinet' },
        { value: 'upper', label: 'Upper Cabinet' },
        { value: 'island', label: 'Kitchen Island' },
        { value: 'vanity', label: 'Bathroom Vanity' },
        { value: 'pantry', label: 'Pantry' },
        { value: 'corner', label: 'Corner Cabinet' }
      ],
      icon: <Settings className="w-4 h-4" />
    },
    {
      key: 'material',
      label: 'Wood Material',
      type: 'multi-select',
      options: [
        { value: 'oak', label: 'Oak' },
        { value: 'maple', label: 'Maple' },
        { value: 'cherry', label: 'Cherry' },
        { value: 'pine', label: 'Pine' },
        { value: 'MDF', label: 'MDF' },
        { value: 'plywood', label: 'Plywood' },
        { value: 'bamboo', label: 'Bamboo' }
      ]
    },
    {
      key: 'finish',
      label: 'Finish Type',
      type: 'select',
      options: [
        { value: 'natural', label: 'Natural' },
        { value: 'stained', label: 'Stained' },
        { value: 'painted', label: 'Painted' },
        { value: 'lacquered', label: 'Lacquered' }
      ]
    },
    {
      key: 'soft_close',
      label: 'Soft Close',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'project_type',
      label: 'Project Type',
      type: 'multi-select',
      options: [
        { value: 'residential', label: 'Residential' },
        { value: 'commercial', label: 'Commercial' },
        { value: 'custom', label: 'Custom' },
        { value: 'restoration', label: 'Restoration' }
      ]
    }
  ],
  'general construction': [
    {
      key: 'thickness',
      label: 'Thickness',
      type: 'multi-select',
      options: [
        { value: '1/4_inch', label: '1/4"' },
        { value: '1/2_inch', label: '1/2"' },
        { value: '5/8_inch', label: '5/8"' },
        { value: '1/8_inch', label: '1/8"' },
        { value: '4_inches', label: '4"' },
        { value: '6_inches', label: '6"' },
        { value: '8_inches', label: '8"' },
        { value: '10_inches', label: '10"' },
        { value: '12_inches', label: '12"' },
        { value: '24_inches', label: '24"' },
        { value: '3_feet', label: '3 feet' }
      ],
      icon: <Layers className="w-4 h-4" />
    },
    {
      key: 'depth',
      label: 'Depth',
      type: 'multi-select',
      options: [
        { value: 'up_to_2_inches', label: 'Up to 2"' },
        { value: '3/4_inch', label: '3/4"' },
        { value: '12_inches', label: '12"' },
        { value: '18_inches', label: '18"' },
        { value: '24_inches', label: '24"' },
        { value: '4_feet', label: '4 feet' },
        { value: 'up_to_6_feet', label: 'Up to 6 feet' },
        { value: 'up_to_10_feet', label: 'Up to 10 feet' },
        { value: '12_inches_below', label: '12" below' }
      ],
      icon: <Ruler className="w-4 h-4" />
    },
    {
      key: 'type',
      label: 'Type',
      type: 'multi-select',
      options: [
        { value: 'metal', label: 'Metal' },
        { value: 'moisture_resistant', label: 'Moisture Resistant' },
        { value: 'paperless', label: 'Paperless' },
        { value: 'lvl', label: 'LVL' },
        { value: 'tuckpointing', label: 'Tuckpointing' },
        { value: 'shed_dormer', label: 'Shed Dormer' },
        { value: 'boundary_topo', label: 'Boundary/Topo' },
        { value: 'silt_fence_blanket', label: 'Silt Fence/Blanket' },
        { value: 'non_hazardous', label: 'Non-Hazardous' }
      ],
      icon: <HardHat className="w-4 h-4" />
    },
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      options: [
        { value: 'traditional', label: 'Traditional' },
        { value: 'epoxy_injection', label: 'Epoxy Injection' },
        { value: 'jack_and_support', label: 'Jack & Support' },
        { value: 'lime_cement', label: 'Lime/Cement' },
        { value: 'controlled_blasting', label: 'Controlled Blasting' },
        { value: 'ground_penetrating_radar', label: 'Ground Penetrating Radar' },
        { value: 'wellpoint', label: 'Wellpoint' }
      ]
    },
    {
      key: 'sealed',
      label: 'Sealed',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'waterproofed',
      label: 'Waterproofed',
      type: 'boolean',
      icon: <Droplets className="w-4 h-4" />
    },
    {
      key: 'primed',
      label: 'Primed',
      type: 'boolean',
      icon: <Paintbrush className="w-4 h-4" />
    }
  ],
  drywall: [
    {
      key: 'thickness',
      label: 'Thickness',
      type: 'select',
      options: [
        { value: '1/4_inch', label: '1/4"' },
        { value: '1/2_inch', label: '1/2"' },
        { value: '5/8_inch', label: '5/8"' }
      ],
      icon: <Layers className="w-4 h-4" />
    },
    {
      key: 'type',
      label: 'Board Type',
      type: 'multi-select',
      options: [
        { value: 'regular', label: 'Regular' },
        { value: 'moisture_resistant', label: 'Moisture Resistant' },
        { value: 'type_x', label: 'Type X (Fire Rated)' },
        { value: 'soundproof', label: 'Soundproof' },
        { value: 'cement_board', label: 'Cement Board' },
        { value: 'densglass', label: 'DensGlass' }
      ],
      icon: <Package className="w-4 h-4" />
    },
    {
      key: 'texture',
      label: 'Texture',
      type: 'multi-select',
      options: [
        { value: 'orange_peel', label: 'Orange Peel' },
        { value: 'knockdown', label: 'Knockdown' },
        { value: 'skip_trowel', label: 'Skip Trowel' },
        { value: 'hawk_trowel', label: 'Hawk & Trowel' },
        { value: 'slap_brush', label: 'Slap Brush' },
        { value: 'spray_sand', label: 'Spray Sand' },
        { value: 'popcorn', label: 'Popcorn' },
        { value: 'dash', label: 'Dash' }
      ],
      icon: <Paintbrush className="w-4 h-4" />
    },
    {
      key: 'pattern',
      label: 'Pattern',
      type: 'select',
      options: [
        { value: 'straight_lines', label: 'Straight Lines' },
        { value: 'swirl', label: 'Swirl' },
        { value: 'rosebud', label: 'Rosebud' },
        { value: 'random', label: 'Random' }
      ]
    },
    {
      key: 'finish_level',
      label: 'Finish Level',
      type: 'select',
      options: [
        { value: '3', label: 'Level 3' },
        { value: '4', label: 'Level 4' },
        { value: '5', label: 'Level 5' }
      ],
      icon: <CheckCircle className="w-4 h-4" />
    },
    {
      key: 'coverage',
      label: 'Coverage',
      type: 'select',
      options: [
        { value: 'medium', label: 'Medium' },
        { value: 'heavy', label: 'Heavy' },
        { value: 'full', label: 'Full' }
      ]
    },
    {
      key: 'paint_ready',
      label: 'Paint Ready',
      type: 'boolean',
      icon: <Paintbrush className="w-4 h-4" />
    },
    {
      key: 'mold_resistant',
      label: 'Mold Resistant',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'reinforced',
      label: 'Reinforced',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    }
  ],
  handyman: [
    {
      key: 'level',
      label: 'Level/Plumb',
      type: 'boolean',
      icon: <Ruler className="w-4 h-4" />
    },
    {
      key: 'sealed',
      label: 'Sealed',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'weight_tested',
      label: 'Weight Tested',
      type: 'boolean',
      icon: <CheckCircle className="w-4 h-4" />
    },
    {
      key: 'centered',
      label: 'Centered',
      type: 'boolean',
      icon: <CheckCircle className="w-4 h-4" />
    },
    {
      key: 'tested',
      label: 'Tested',
      type: 'boolean',
      icon: <CheckCircle className="w-4 h-4" />
    },
    {
      key: 'color_matched',
      label: 'Color Matched',
      type: 'boolean',
      icon: <Paintbrush className="w-4 h-4" />
    },
    {
      key: 'safety_check',
      label: 'Safety Checked',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'adjustable',
      label: 'Adjustable',
      type: 'boolean',
      icon: <Settings className="w-4 h-4" />
    },
    {
      key: 'hardwired',
      label: 'Hardwired Option',
      type: 'select',
      options: [
        { value: 'true', label: 'Yes' },
        { value: 'optional', label: 'Optional' }
      ],
      icon: <Zap className="w-4 h-4" />
    },
    {
      key: 'efficiency_improved',
      label: 'Efficiency Improved',
      type: 'boolean',
      icon: <Battery className="w-4 h-4" />
    }
  ],
  concrete: [
    {
      key: 'psi_strength',
      label: 'PSI Strength',
      type: 'range',
      min: 2500,
      max: 5000,
      step: 500,
      unit: 'PSI',
      icon: <HardHat className="w-4 h-4" />
    },
    {
      key: 'cure_time_days',
      label: 'Cure Time',
      type: 'range',
      min: 7,
      max: 28,
      step: 7,
      unit: 'days',
      icon: <Settings className="w-4 h-4" />
    },
    {
      key: 'min_temp_fahrenheit',
      label: 'Min Temperature',
      type: 'range',
      min: 30,
      max: 50,
      step: 5,
      unit: '°F',
      icon: <Thermometer className="w-4 h-4" />
    },
    {
      key: 'cold_weather_protection',
      label: 'Cold Weather Protection',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    },
    {
      key: 'requires_sealer',
      label: 'Requires Sealer',
      type: 'boolean',
      icon: <Droplets className="w-4 h-4" />
    },
    {
      key: 'slip_resistant',
      label: 'Slip Resistant',
      type: 'boolean',
      icon: <Shield className="w-4 h-4" />
    }
  ]
};

export const ServiceAttributeFilters: React.FC<ServiceAttributeFiltersProps> = ({
  industry,
  onFiltersChange,
  activeFilters
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const filters = filterConfigs[industry.toLowerCase()] || [];
  const activeFilterCount = Object.keys(activeFilters).length;

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...activeFilters };
    
    if (value === null || value === undefined || value === '') {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-1.5 bg-[#22272d] border border-[#333333] rounded text-sm transition-colors ${
          filters.length === 0 
            ? 'text-gray-600 cursor-not-allowed' 
            : 'text-gray-300 hover:border-[#336699] cursor-pointer'
        }`}
        disabled={filters.length === 0}
      >
        <Filter className="w-4 h-4" />
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="px-1.5 py-0.5 bg-[#336699] text-white text-xs rounded">
            {activeFilterCount}
          </span>
        )}
        {filters.length > 0 && (
          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isExpanded && filters.length > 0 && (
        <div className="mt-3 p-4 bg-[#1D1F25] border border-[#333333] rounded">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">Filter by Specifications</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filters.map(filter => (
              <div key={filter.key} className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                  {filter.icon}
                  {filter.label}
                </label>
                
                {filter.type === 'range' && (
                  <div className="space-y-1">
                    <input
                      type="range"
                      min={filter.min}
                      max={filter.max}
                      step={filter.step}
                      value={activeFilters[filter.key] || filter.min}
                      onChange={(e) => handleFilterChange(filter.key, parseFloat(e.target.value))}
                      className="w-full h-1 bg-[#333333] rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{filter.min} {filter.unit}</span>
                      <span className="text-white">
                        {activeFilters[filter.key] || filter.min} {filter.unit}
                      </span>
                      <span>{filter.max} {filter.unit}</span>
                    </div>
                  </div>
                )}

                {filter.type === 'boolean' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeFilters[filter.key] || false}
                      onChange={(e) => handleFilterChange(filter.key, e.target.checked)}
                      className="w-4 h-4 bg-[#22272d] border-[#333333] text-[#336699] rounded focus:ring-[#336699]"
                    />
                    <span className="text-sm text-gray-300">Only certified</span>
                  </label>
                )}

                {filter.type === 'select' && (
                  <select
                    value={activeFilters[filter.key] || ''}
                    onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                    className="w-full px-2 py-1.5 bg-[#22272d] border border-[#333333] rounded text-sm text-white focus:outline-none focus:border-[#336699]"
                  >
                    <option value="">All</option>
                    {filter.options?.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}

                {filter.type === 'multi-select' && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {filter.options?.map(option => (
                      <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(activeFilters[filter.key] || []).includes(option.value)}
                          onChange={(e) => {
                            const current = activeFilters[filter.key] || [];
                            const newValue = e.target.checked
                              ? [...current, option.value]
                              : current.filter((v: string) => v !== option.value);
                            handleFilterChange(filter.key, newValue.length > 0 ? newValue : null);
                          }}
                          className="w-4 h-4 bg-[#22272d] border-[#333333] text-[#336699] rounded"
                        />
                        <span className="text-sm text-gray-300">{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Active Filters Display */}
          {activeFilterCount > 0 && (
            <div className="mt-4 pt-4 border-t border-[#333333]">
              <div className="flex flex-wrap gap-2">
                {Object.entries(activeFilters).map(([key, value]) => {
                  const filter = filters.find(f => f.key === key);
                  if (!filter) return null;

                  let displayValue = value;
                  if (filter.type === 'boolean') {
                    displayValue = value ? 'Yes' : 'No';
                  } else if (filter.type === 'multi-select' && Array.isArray(value)) {
                    displayValue = value.join(', ');
                  } else if (filter.type === 'range') {
                    displayValue = `${value} ${filter.unit || ''}`;
                  }

                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-[#336699]/20 border border-[#336699]/50 rounded text-xs text-[#6699cc]"
                    >
                      {filter.icon}
                      <span className="font-medium">{filter.label}:</span>
                      <span>{displayValue}</span>
                      <button
                        onClick={() => handleFilterChange(key, null)}
                        className="ml-1 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};