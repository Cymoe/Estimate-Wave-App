import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, Grid, List, Save, Copy, 
  Edit2, Trash2, Star, FileText, Package, Home, 
  Wrench, Brush, Lightbulb, Palette, Building, 
  Truck, Computer, Scissors, Trees, Shield, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/format';
import { CreateCustomTemplateModal } from './CreateCustomTemplateModal';

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  items: TemplateItem[];
  isCustom: boolean;
  isFavorite?: boolean;
  usageCount?: number;
  createdAt: string;
}

interface TemplateItem {
  name: string;
  description?: string;
  quantity: number;
  unit?: string;
  pricePerUnit: number;
}

// Predefined templates for each category
const PREDEFINED_TEMPLATES: Template[] = [
  // Home Improvement Templates
  {
    id: 'template-bathroom-remodel',
    name: 'Bathroom Remodel - Standard',
    category: 'home-improvement',
    description: 'Complete bathroom renovation including fixtures, tiling, and labor',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Toilet Installation', quantity: 1, unit: 'unit', pricePerUnit: 450 },
      { name: 'Vanity & Sink Installation', quantity: 1, unit: 'unit', pricePerUnit: 850 },
      { name: 'Shower/Tub Installation', quantity: 1, unit: 'unit', pricePerUnit: 1200 },
      { name: 'Tile Installation', quantity: 120, unit: 'sq ft', pricePerUnit: 12 },
      { name: 'Plumbing Labor', quantity: 16, unit: 'hours', pricePerUnit: 85 },
      { name: 'Electrical Work', quantity: 8, unit: 'hours', pricePerUnit: 75 },
      { name: 'Permits & Inspections', quantity: 1, unit: 'package', pricePerUnit: 350 }
    ]
  },
  {
    id: 'template-kitchen-cabinet',
    name: 'Kitchen Cabinet Installation',
    category: 'home-improvement',
    description: 'Cabinet installation including hardware and adjustments',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Upper Cabinet Installation', quantity: 8, unit: 'units', pricePerUnit: 125 },
      { name: 'Lower Cabinet Installation', quantity: 10, unit: 'units', pricePerUnit: 150 },
      { name: 'Cabinet Hardware Installation', quantity: 18, unit: 'handles', pricePerUnit: 15 },
      { name: 'Crown Molding', quantity: 24, unit: 'linear ft', pricePerUnit: 18 },
      { name: 'Toe Kick Installation', quantity: 20, unit: 'linear ft', pricePerUnit: 12 }
    ]
  },
  {
    id: 'template-flooring-install',
    name: 'Hardwood Flooring Installation',
    category: 'home-improvement',
    description: 'Professional hardwood floor installation with finishing',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Hardwood Flooring Material', quantity: 500, unit: 'sq ft', pricePerUnit: 8 },
      { name: 'Floor Preparation', quantity: 500, unit: 'sq ft', pricePerUnit: 2 },
      { name: 'Installation Labor', quantity: 500, unit: 'sq ft', pricePerUnit: 4 },
      { name: 'Stain & Finish', quantity: 500, unit: 'sq ft', pricePerUnit: 3 },
      { name: 'Baseboards', quantity: 120, unit: 'linear ft', pricePerUnit: 6 },
      { name: 'Transition Strips', quantity: 5, unit: 'pieces', pricePerUnit: 35 }
    ]
  },

  // Plumbing Templates
  {
    id: 'template-water-heater',
    name: 'Water Heater Replacement',
    category: 'plumbing',
    description: 'Standard 40-gallon water heater replacement',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: '40-Gallon Water Heater', quantity: 1, unit: 'unit', pricePerUnit: 650 },
      { name: 'Installation Labor', quantity: 3, unit: 'hours', pricePerUnit: 95 },
      { name: 'Expansion Tank', quantity: 1, unit: 'unit', pricePerUnit: 85 },
      { name: 'Shut-off Valves', quantity: 2, unit: 'units', pricePerUnit: 25 },
      { name: 'Pipe Fittings & Connectors', quantity: 1, unit: 'set', pricePerUnit: 75 },
      { name: 'Disposal of Old Unit', quantity: 1, unit: 'service', pricePerUnit: 50 }
    ]
  },
  {
    id: 'template-drain-cleaning',
    name: 'Drain Cleaning Service',
    category: 'plumbing',
    description: 'Professional drain cleaning with camera inspection',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Service Call', quantity: 1, unit: 'visit', pricePerUnit: 95 },
      { name: 'Drain Snake Service', quantity: 1, unit: 'service', pricePerUnit: 185 },
      { name: 'Camera Inspection', quantity: 1, unit: 'service', pricePerUnit: 125 },
      { name: 'Hydro Jetting (if needed)', quantity: 1, unit: 'service', pricePerUnit: 350 }
    ]
  },
  {
    id: 'template-faucet-install',
    name: 'Kitchen Faucet Installation',
    category: 'plumbing',
    description: 'New kitchen faucet installation with shut-off valves',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Kitchen Faucet (Customer Provided)', quantity: 0, unit: 'unit', pricePerUnit: 0 },
      { name: 'Installation Labor', quantity: 2, unit: 'hours', pricePerUnit: 85 },
      { name: 'Shut-off Valves', quantity: 2, unit: 'units', pricePerUnit: 25 },
      { name: 'Supply Lines', quantity: 2, unit: 'units', pricePerUnit: 15 },
      { name: 'Plumber\'s Putty & Teflon', quantity: 1, unit: 'kit', pricePerUnit: 12 }
    ]
  },

  // Electrical Templates
  {
    id: 'template-panel-upgrade',
    name: 'Electrical Panel Upgrade',
    category: 'electrical',
    description: '200 Amp service panel upgrade with new breakers',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: '200 Amp Panel', quantity: 1, unit: 'unit', pricePerUnit: 450 },
      { name: 'Circuit Breakers', quantity: 20, unit: 'units', pricePerUnit: 35 },
      { name: 'Installation Labor', quantity: 8, unit: 'hours', pricePerUnit: 110 },
      { name: 'Permit & Inspection', quantity: 1, unit: 'service', pricePerUnit: 150 },
      { name: 'Wire & Connectors', quantity: 1, unit: 'kit', pricePerUnit: 200 }
    ]
  },
  {
    id: 'template-outlet-install',
    name: 'Outlet Installation Package',
    category: 'electrical',
    description: 'Installation of 5 new electrical outlets',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Standard Outlets', quantity: 5, unit: 'units', pricePerUnit: 15 },
      { name: 'Installation Labor', quantity: 2.5, unit: 'hours', pricePerUnit: 85 },
      { name: 'Wire (14 AWG)', quantity: 100, unit: 'feet', pricePerUnit: 1.5 },
      { name: 'Junction Boxes', quantity: 5, unit: 'units', pricePerUnit: 8 },
      { name: 'Wire Nuts & Supplies', quantity: 1, unit: 'kit', pricePerUnit: 25 }
    ]
  },
  {
    id: 'template-lighting-install',
    name: 'Recessed Lighting Installation',
    category: 'electrical',
    description: 'Installation of 6 LED recessed lights',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'LED Recessed Lights', quantity: 6, unit: 'units', pricePerUnit: 45 },
      { name: 'Installation Labor', quantity: 4, unit: 'hours', pricePerUnit: 95 },
      { name: 'Dimmer Switch', quantity: 1, unit: 'unit', pricePerUnit: 35 },
      { name: 'Wire & Connectors', quantity: 1, unit: 'kit', pricePerUnit: 75 },
      { name: 'Drywall Patching', quantity: 1, unit: 'service', pricePerUnit: 50 }
    ]
  },

  // Painting Templates
  {
    id: 'template-interior-paint',
    name: 'Interior Room Painting',
    category: 'painting',
    description: 'Complete painting of a 12x14 room with prep work',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Wall Preparation', quantity: 400, unit: 'sq ft', pricePerUnit: 0.75 },
      { name: 'Primer Application', quantity: 400, unit: 'sq ft', pricePerUnit: 0.50 },
      { name: 'Paint (2 coats)', quantity: 400, unit: 'sq ft', pricePerUnit: 1.25 },
      { name: 'Ceiling Paint', quantity: 168, unit: 'sq ft', pricePerUnit: 1.00 },
      { name: 'Trim & Baseboard Paint', quantity: 60, unit: 'linear ft', pricePerUnit: 3.50 },
      { name: 'Drop Cloths & Supplies', quantity: 1, unit: 'kit', pricePerUnit: 45 }
    ]
  },
  {
    id: 'template-exterior-paint',
    name: 'Exterior House Painting',
    category: 'painting',
    description: 'Complete exterior painting for 2000 sq ft home',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Pressure Washing', quantity: 2000, unit: 'sq ft', pricePerUnit: 0.35 },
      { name: 'Scraping & Prep', quantity: 2000, unit: 'sq ft', pricePerUnit: 0.85 },
      { name: 'Primer Application', quantity: 2000, unit: 'sq ft', pricePerUnit: 0.75 },
      { name: 'Paint (2 coats)', quantity: 2000, unit: 'sq ft', pricePerUnit: 1.50 },
      { name: 'Trim Paint', quantity: 300, unit: 'linear ft', pricePerUnit: 4.00 },
      { name: 'Ladder & Equipment Rental', quantity: 3, unit: 'days', pricePerUnit: 85 }
    ]
  },

  // Roofing Templates
  {
    id: 'template-roof-repair',
    name: 'Roof Repair - Shingle Replacement',
    category: 'roofing',
    description: 'Repair of damaged area (100 sq ft) with matching shingles',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Shingles', quantity: 1, unit: 'square', pricePerUnit: 120 },
      { name: 'Underlayment', quantity: 100, unit: 'sq ft', pricePerUnit: 0.50 },
      { name: 'Labor', quantity: 4, unit: 'hours', pricePerUnit: 75 },
      { name: 'Flashing Repair', quantity: 1, unit: 'service', pricePerUnit: 150 },
      { name: 'Sealant & Nails', quantity: 1, unit: 'kit', pricePerUnit: 35 }
    ]
  },
  {
    id: 'template-gutter-install',
    name: 'Gutter Installation',
    category: 'roofing',
    description: 'Complete gutter system installation for average home',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Aluminum Gutters', quantity: 150, unit: 'linear ft', pricePerUnit: 8 },
      { name: 'Downspouts', quantity: 4, unit: 'units', pricePerUnit: 45 },
      { name: 'Gutter Guards', quantity: 150, unit: 'linear ft', pricePerUnit: 6 },
      { name: 'Installation Labor', quantity: 8, unit: 'hours', pricePerUnit: 65 },
      { name: 'Hangers & Hardware', quantity: 1, unit: 'kit', pricePerUnit: 150 }
    ]
  },

  // HVAC Templates
  {
    id: 'template-ac-service',
    name: 'AC System Service',
    category: 'hvac',
    description: 'Annual AC maintenance and tune-up',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'System Inspection', quantity: 1, unit: 'service', pricePerUnit: 89 },
      { name: 'Filter Replacement', quantity: 1, unit: 'filter', pricePerUnit: 25 },
      { name: 'Coil Cleaning', quantity: 1, unit: 'service', pricePerUnit: 125 },
      { name: 'Refrigerant Check', quantity: 1, unit: 'service', pricePerUnit: 45 },
      { name: 'Capacitor Test', quantity: 1, unit: 'service', pricePerUnit: 35 }
    ]
  },
  {
    id: 'template-furnace-install',
    name: 'Furnace Installation',
    category: 'hvac',
    description: 'High-efficiency furnace installation',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'High-Efficiency Furnace', quantity: 1, unit: 'unit', pricePerUnit: 2500 },
      { name: 'Installation Labor', quantity: 8, unit: 'hours', pricePerUnit: 125 },
      { name: 'Ductwork Modifications', quantity: 1, unit: 'service', pricePerUnit: 350 },
      { name: 'Thermostat Upgrade', quantity: 1, unit: 'unit', pricePerUnit: 250 },
      { name: 'Permit & Inspection', quantity: 1, unit: 'service', pricePerUnit: 150 },
      { name: 'Old Unit Disposal', quantity: 1, unit: 'service', pricePerUnit: 75 }
    ]
  },

  // Landscaping Templates
  {
    id: 'template-lawn-service',
    name: 'Monthly Lawn Maintenance',
    category: 'landscaping',
    description: 'Complete monthly lawn care package',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Lawn Mowing', quantity: 4, unit: 'visits', pricePerUnit: 45 },
      { name: 'Edging & Trimming', quantity: 4, unit: 'visits', pricePerUnit: 25 },
      { name: 'Leaf Removal', quantity: 2, unit: 'visits', pricePerUnit: 65 },
      { name: 'Fertilizer Application', quantity: 1, unit: 'treatment', pricePerUnit: 85 },
      { name: 'Weed Control', quantity: 1, unit: 'treatment', pricePerUnit: 55 }
    ]
  },
  {
    id: 'template-tree-service',
    name: 'Tree Trimming Service',
    category: 'landscaping',
    description: 'Professional tree trimming for large trees',
    isCustom: false,
    createdAt: new Date().toISOString(),
    items: [
      { name: 'Tree Assessment', quantity: 1, unit: 'visit', pricePerUnit: 75 },
      { name: 'Tree Trimming (per tree)', quantity: 3, unit: 'trees', pricePerUnit: 250 },
      { name: 'Branch Removal & Chipping', quantity: 1, unit: 'service', pricePerUnit: 150 },
      { name: 'Stump Grinding', quantity: 1, unit: 'stump', pricePerUnit: 125 },
      { name: 'Cleanup & Disposal', quantity: 1, unit: 'service', pricePerUnit: 100 }
    ]
  }
];

const CATEGORIES = [
  { id: 'all', name: 'All Templates', icon: Grid },
  { id: 'home-improvement', name: 'Home Improvement', icon: Home },
  { id: 'plumbing', name: 'Plumbing', icon: Wrench },
  { id: 'electrical', name: 'Electrical', icon: Lightbulb },
  { id: 'painting', name: 'Painting', icon: Brush },
  { id: 'roofing', name: 'Roofing', icon: Home },
  { id: 'hvac', name: 'HVAC', icon: Building },
  { id: 'landscaping', name: 'Landscaping', icon: Trees },
  { id: 'custom', name: 'My Custom Templates', icon: Star }
];

export const TemplateManager: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [user]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      
      // Load custom templates from Supabase
      if (user) {
        const { data, error } = await supabase
          .from('custom_templates')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const formattedTemplates = data.map(t => ({
            id: t.id,
            name: t.name,
            category: t.category || 'custom',
            description: t.description,
            items: t.items || [],
            isCustom: true,
            isFavorite: t.is_favorite,
            usageCount: t.usage_count || 0,
            createdAt: t.created_at
          }));
          setCustomTemplates(formattedTemplates);
        }
      }

      // Combine predefined and custom templates
      setTemplates([...PREDEFINED_TEMPLATES, ...customTemplates]);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || 
      (selectedCategory === 'custom' && template.isCustom) ||
      template.category === selectedCategory;
    
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  const calculateTemplateTotal = (items: TemplateItem[]) => {
    return items.reduce((total, item) => total + (item.quantity * item.pricePerUnit), 0);
  };

  const handleToggleFavorite = async (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template || !template.isCustom) return;

    try {
      const { error } = await supabase
        .from('custom_templates')
        .update({ is_favorite: !template.isFavorite })
        .eq('id', templateId);

      if (!error) {
        setTemplates(prev => prev.map(t => 
          t.id === templateId ? { ...t, isFavorite: !t.isFavorite } : t
        ));
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('custom_templates')
        .delete()
        .eq('id', templateId);

      if (!error) {
        setTemplates(prev => prev.filter(t => t.id !== templateId));
        setCustomTemplates(prev => prev.filter(t => t.id !== templateId));
      }
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleDuplicateTemplate = async (template: Template) => {
    try {
      const newTemplate = {
        ...template,
        id: `custom-${Date.now()}`,
        name: `${template.name} (Copy)`,
        isCustom: true,
        isFavorite: false,
        usageCount: 0,
        createdAt: new Date().toISOString()
      };

      if (user) {
        const { data, error } = await supabase
          .from('custom_templates')
          .insert([{
            user_id: user.id,
            name: newTemplate.name,
            category: newTemplate.category,
            description: newTemplate.description,
            items: newTemplate.items,
            is_favorite: false,
            usage_count: 0
          }])
          .select()
          .single();

        if (!error && data) {
          newTemplate.id = data.id;
          setTemplates(prev => [...prev, newTemplate]);
          setCustomTemplates(prev => [...prev, newTemplate]);
        }
      }
    } catch (error) {
      console.error('Error duplicating template:', error);
    }
  };

  const getCategoryIcon = (categoryId: string) => {
    const category = CATEGORIES.find(c => c.id === categoryId);
    return category?.icon || Grid;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">INVOICE TEMPLATES</h1>
          <p className="text-gray-400 mt-1">Use predefined templates or create your own</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#336699] text-white rounded-[4px] hover:bg-[#2a5580] transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">CREATE CUSTOM TEMPLATE</span>
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-[#333333] border border-[#555555] rounded-[4px] text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
          />
        </div>

        {/* View Mode */}
        <div className="flex items-center gap-2 bg-[#333333] rounded-[4px] p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-[2px] transition-colors ${
              viewMode === 'grid' ? 'bg-[#336699] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-[2px] transition-colors ${
              viewMode === 'list' ? 'bg-[#336699] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-[4px] whitespace-nowrap transition-colors ${
                selectedCategory === category.id
                  ? 'bg-[#336699] text-white'
                  : 'bg-[#333333] text-gray-400 hover:text-white hover:bg-[#404040]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{category.name}</span>
            </button>
          );
        })}
      </div>

      {/* Templates */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#336699]"></div>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
          {filteredTemplates.map((template) => {
            const Icon = getCategoryIcon(template.category);
            const total = calculateTemplateTotal(template.items);

            return (
              <div
                key={template.id}
                className={`bg-[#333333] rounded-[4px] overflow-hidden hover:bg-[#404040] transition-colors ${
                  viewMode === 'list' ? 'p-4' : ''
                }`}
              >
                {viewMode === 'grid' ? (
                  <div>
                    {/* Grid View */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#1E1E1E] rounded-[4px]">
                            <Icon className="w-5 h-5 text-[#336699]" />
                          </div>
                          <div>
                            <h3 className="font-medium text-white">{template.name}</h3>
                            <p className="text-xs text-gray-400">{template.category}</p>
                          </div>
                        </div>
                        {template.isCustom && (
                          <button
                            onClick={() => handleToggleFavorite(template.id)}
                            className="p-1 hover:bg-[#1E1E1E] rounded-[4px] transition-colors"
                          >
                            <Star className={`w-4 h-4 ${template.isFavorite ? 'fill-[#5b8fc7] text-yellow-400' : 'text-gray-400'}`} />
                          </button>
                        )}
                      </div>

                      <p className="text-sm text-gray-300 mb-3 line-clamp-2">{template.description}</p>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Items</span>
                          <span className="text-white">{template.items.length}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Total</span>
                          <span className="text-white font-mono">{formatCurrency(total)}</span>
                        </div>
                        {template.usageCount !== undefined && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Used</span>
                            <span className="text-white">{template.usageCount} times</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedTemplate(template);
                            // Use template logic here
                          }}
                          className="flex-1 px-3 py-2 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors text-sm font-medium"
                        >
                          USE TEMPLATE
                        </button>
                        <button
                          onClick={() => handleDuplicateTemplate(template)}
                          className="p-2 bg-[#1E1E1E] text-gray-400 rounded-[4px] hover:text-white hover:bg-[#252525] transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {template.isCustom && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedTemplate(template);
                                setShowEditModal(true);
                              }}
                              className="p-2 bg-[#1E1E1E] text-gray-400 rounded-[4px] hover:text-white hover:bg-[#252525] transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="p-2 bg-[#1E1E1E] text-gray-400 rounded-[4px] hover:text-[#D32F2F] hover:bg-[#252525] transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  // List View
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="p-2 bg-[#1E1E1E] rounded-[4px]">
                        <Icon className="w-5 h-5 text-[#336699]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-white">{template.name}</h3>
                        <p className="text-sm text-gray-400">{template.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">{template.items.length} items</p>
                        <p className="font-mono font-medium">{formatCurrency(total)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => {
                          setSelectedTemplate(template);
                          // Use template logic here
                        }}
                        className="px-3 py-2 bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors text-sm font-medium"
                      >
                        USE
                      </button>
                      <button
                        onClick={() => handleDuplicateTemplate(template)}
                        className="p-2 bg-[#1E1E1E] text-gray-400 rounded-[4px] hover:text-white hover:bg-[#252525] transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {template.isCustom && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowEditModal(true);
                            }}
                            className="p-2 bg-[#1E1E1E] text-gray-400 rounded-[4px] hover:text-white hover:bg-[#252525] transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="p-2 bg-[#1E1E1E] text-gray-400 rounded-[4px] hover:text-[#D32F2F] hover:bg-[#252525] transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredTemplates.length === 0 && !loading && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-400">No templates found</p>
          <p className="text-sm text-gray-500 mt-2">
            {selectedCategory === 'custom' ? 'Create your first custom template' : 'Try adjusting your search or category'}
          </p>
        </div>
      )}

      {/* Create Custom Template Modal */}
      <CreateCustomTemplateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onTemplateCreated={loadTemplates}
      />
    </div>
  );
}; 