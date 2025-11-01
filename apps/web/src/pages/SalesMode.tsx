import React, { useState, useContext } from 'react';
import { 
  Home, 
  Car, 
  TreePine, 
  Droplets, 
  Zap,
  DollarSign,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
// import { EstimateService } from '../services/EstimateService'; // Supabase version
import { MongoEstimateService as EstimateService } from '../services/MongoEstimateService'; // MongoDB version

interface ProjectArchetype {
  id: string;
  name: string;
  icon: React.ReactNode;
  redlinePrice: number;
  capPrice: number;
  description: string;
  commonAddons: string[];
}

const projectArchetypes: ProjectArchetype[] = [
  {
    id: 'kitchen-basic',
    name: 'Kitchen Remodel - Basic',
    icon: <Home className="w-6 h-6" />,
    redlinePrice: 12000,
    capPrice: 18000,
    description: 'Standard cabinets, countertops, basic fixtures',
    commonAddons: ['Premium Countertops (+$2K)', 'Custom Cabinets (+$3K)', 'Island Addition (+$1.5K)']
  },
  {
    id: 'bathroom-mid',
    name: 'Bathroom Renovation - Midrange',
    icon: <Droplets className="w-6 h-6" />,
    redlinePrice: 8000,
    capPrice: 12000,
    description: 'Vanity, toilet, tub/shower, tile work',
    commonAddons: ['Heated Floors (+$1.5K)', 'Premium Fixtures (+$2K)', 'Double Vanity (+$1K)']
  },
  {
    id: 'roof-asphalt',
    name: 'Roof Replacement - Asphalt',
    icon: <Home className="w-6 h-6" />,
    redlinePrice: 15000,
    capPrice: 22000,
    description: 'Standard asphalt shingles, gutters, basic ventilation',
    commonAddons: ['Premium Shingles (+$3K)', 'Gutter Guards (+$1K)', 'Skylights (+$2K)']
  },
  {
    id: 'deck-composite',
    name: 'Deck Construction - Composite',
    icon: <TreePine className="w-6 h-6" />,
    redlinePrice: 10000,
    capPrice: 15000,
    description: 'Composite decking, basic railing, standard size',
    commonAddons: ['Premium Railing (+$2K)', 'Built-in Seating (+$1.5K)', 'Lighting Package (+$1K)']
  },
  {
    id: 'hvac-system',
    name: 'HVAC System Replacement',
    icon: <Zap className="w-6 h-6" />,
    redlinePrice: 8000,
    capPrice: 12000,
    description: 'New furnace, AC unit, basic ductwork',
    commonAddons: ['Smart Thermostat (+$500)', 'Duct Cleaning (+$800)', 'Extended Warranty (+$1K)']
  },
  {
    id: 'garage-door',
    name: 'Garage Door Replacement',
    icon: <Car className="w-6 h-6" />,
    redlinePrice: 2000,
    capPrice: 3500,
    description: 'Standard steel door, basic opener',
    commonAddons: ['Insulated Door (+$800)', 'Smart Opener (+$400)', 'Windows (+$300)']
  }
];

export const SalesMode: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [selectedProject, setSelectedProject] = useState<ProjectArchetype | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [margin, setMargin] = useState<'good' | 'tight' | 'low'>('good');
  const [isCreating, setIsCreating] = useState<string | null>(null);
  const tiers = [
    { key: 'R', label: 'Redline', pct: 0 },
    { key: 'N', label: 'Need Job', pct: 10 },
    { key: 'S', label: 'Slow Season', pct: 25 },
    { key: 'P', label: 'Competitive', pct: 35 },
    { key: 'B', label: 'Busy Season', pct: 60 },
    { key: 'C', label: 'CAP', pct: 100 }
  ];
  const [selectedTierPct, setSelectedTierPct] = useState<number>(0);

  const handleProjectSelect = (project: ProjectArchetype) => {
    // Show pricing UI with slider and addons first
    setSelectedProject(project);
    setCurrentPrice(project.redlinePrice);
    setSelectedTierPct(0);
    setSelectedAddons([]);
    calculateMargin(project.redlinePrice, project.redlinePrice, project.capPrice);
  };

  const priceAtTier = (redline: number, cap: number, pct: number) => {
    const range = Math.max(0, cap - redline);
    return Math.round(redline + (range * (pct / 100)));
  };

  const parseAddonPrice = (label: string): number => {
    // Extract patterns like (+$2K), (+$1.5K), (+$800)
    const match = label.match(/\+\$([\d.,]+)\s*(K)?/i);
    if (!match) return 0;
    const num = parseFloat(match[1].replace(/,/g, ''));
    const isK = !!match[2];
    return isK ? num * 1000 : num;
  };

  const handleGenerateQuote = async () => {
    if (!selectedProject) {
      navigate('/work');
      return;
    }
    if (!user || !selectedOrg?.id) {
      navigate('/work');
      return;
    }

    try {
      setIsCreating(selectedProject.id);
      // Base item + addon items
      const addonItems = selectedAddons.map((a, idx) => {
        const price = parseAddonPrice(a);
        return {
          description: a.replace(/\s*\(\+\$.*\)$/, ''),
          quantity: 1,
          unit_price: price,
          total_price: price,
          display_order: idx + 1
        };
      });
      const subtotal = currentPrice + addonItems.reduce((s, i) => s + i.total_price, 0);
      const estimate = await EstimateService.create({
        organization_id: selectedOrg.id,
        user_id: user.id,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        title: selectedProject.name,
        description: selectedProject.description,
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: subtotal,
        items: [
          {
            description: selectedProject.description,
            quantity: 1,
            unit_price: currentPrice,
            total_price: currentPrice,
            display_order: 0
          },
          ...addonItems
        ]
      });
      navigate(`/estimates/${estimate.id}`);
    } catch (err) {
      console.error('Failed to create estimate on Generate Quote:', err);
      navigate('/work');
    } finally {
      setIsCreating(null);
    }
  };

  const handlePriceChange = (newPrice: number) => {
    if (!selectedProject) return;
    
    setCurrentPrice(newPrice);
    calculateMargin(newPrice, selectedProject.redlinePrice, selectedProject.capPrice);
  };

  const calculateMargin = (price: number, redline: number, cap: number) => {
    const marginPercent = ((price - redline) / redline) * 100;
    if (marginPercent >= 20) setMargin('good');
    else if (marginPercent >= 10) setMargin('tight');
    else setMargin('low');
  };

  const handleAddonToggle = (addon: string) => {
    setSelectedAddons(prev => 
      prev.includes(addon) 
        ? prev.filter(a => a !== addon)
        : [...prev, addon]
    );
  };

  const getMarginColor = () => {
    switch (margin) {
      case 'good': return 'text-green-400 bg-green-500/20';
      case 'tight': return 'text-yellow-400 bg-yellow-500/20';
      case 'low': return 'text-red-400 bg-red-500/20';
    }
  };

  const getMarginIcon = () => {
    switch (margin) {
      case 'good': return <CheckCircle className="w-4 h-4" />;
      case 'tight': return <AlertTriangle className="w-4 h-4" />;
      case 'low': return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-[#333333] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <Zap className="w-6 h-6 text-[#336699]" />
              <h1 className="text-2xl font-bold text-white">Sales Mode</h1>
              <span className="text-sm text-gray-400">Field Sales Tool</span>
            </div>
          </div>
          
          {selectedProject && (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getMarginColor()}`}>
              {getMarginIcon()}
              {margin === 'good' ? 'Good Margin' : margin === 'tight' ? 'Tight Margin' : 'Low Margin'}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {!selectedProject ? (
          // Project Selection View
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-4">Quick Project Templates</h2>
              <p className="text-gray-400 text-lg">Select a project type to start your field quote</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectArchetypes.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectSelect(project)}
                  className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6 text-left hover:border-[#336699] transition-colors group relative"
                >
                  {isCreating === project.id && (
                    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                    </div>
                  )}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-[#336699] group-hover:text-[#4a7bb5] transition-colors">
                      {project.icon}
                    </div>
                    <h3 className="font-semibold text-white text-lg">{project.name}</h3>
                  </div>
                  
                  <p className="text-gray-400 mb-4">{project.description}</p>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-gray-500 text-sm">Redline:</div>
                      <div className="text-red-400 font-mono text-lg">${project.redlinePrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-sm">Cap:</div>
                      <div className="text-green-400 font-mono text-lg">${project.capPrice.toLocaleString()}</div>
                    </div>
                  </div>

                  
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Pricing Interface
          <div>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedProject(null)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Templates
                </button>
                <div className="text-[#336699]">{selectedProject.icon}</div>
                <h2 className="text-2xl font-bold text-white">{selectedProject.name}</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Price Slider */}
              <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-8">
                <h3 className="text-white font-semibold text-xl mb-6">Price Range</h3>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm text-gray-400">Current Price</label>
                      {/* Preset dropdown */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Preset</span>
                        <select
                          value={selectedTierPct}
                          onChange={(e) => {
                            const pct = parseInt(e.target.value);
                            setSelectedTierPct(pct);
                            const price = priceAtTier(selectedProject.redlinePrice, selectedProject.capPrice, pct);
                            handlePriceChange(price);
                          }}
                          className="bg-[#0f0f0f] border border-[#333333] text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#336699]"
                        >
                          {tiers.map(t => (
                            <option key={t.key} value={t.pct}>{t.label} ({t.pct}%)</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="text-4xl font-mono text-white mb-4">
                      ${currentPrice.toLocaleString()}
                    </div>
                    <input
                      type="range"
                      min={selectedProject.redlinePrice}
                      max={selectedProject.capPrice}
                      value={currentPrice}
                      onChange={(e) => handlePriceChange(parseInt(e.target.value))}
                      className="w-full h-3 bg-[#333333] rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-2">
                      <span>Redline: ${selectedProject.redlinePrice.toLocaleString()}</span>
                      <span>Cap: ${selectedProject.capPrice.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handlePriceChange(selectedProject.redlinePrice)}
                      className="bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg py-3 px-4 font-medium hover:bg-red-500/30 transition-colors"
                    >
                      Set to Redline
                    </button>
                    <button
                      onClick={() => handlePriceChange(selectedProject.capPrice)}
                      className="bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg py-3 px-4 font-medium hover:bg-green-500/30 transition-colors"
                    >
                      Set to Cap
                    </button>
                  </div>
                </div>
              </div>

              {/* Add-ons */}
              <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-8">
                <h3 className="text-white font-semibold text-xl mb-6">Common Add-ons</h3>
                
                <div className="space-y-4">
                  {selectedProject.commonAddons.map((addon, index) => (
                    <label key={index} className="flex items-center gap-4 cursor-pointer p-3 rounded-lg hover:bg-[#2a2a2a] transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedAddons.includes(addon)}
                        onChange={() => handleAddonToggle(addon)}
                        className="w-5 h-5 text-[#336699] bg-[#333333] border-[#555555] rounded focus:ring-[#336699] focus:ring-2"
                      />
                      <span className="text-gray-300">{addon}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-6 mt-8">
              <button
                onClick={handleGenerateQuote}
                className="bg-[#336699] hover:bg-[#2a5a8a] text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors flex items-center gap-3"
              >
                <DollarSign className="w-5 h-5" />
                Generate Quote
              </button>
              
              <button className="bg-[#1a1a1a] border border-[#333333] text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-[#2a2a2a] transition-colors flex items-center gap-3">
                <TrendingUp className="w-5 h-5" />
                Save as Template
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

