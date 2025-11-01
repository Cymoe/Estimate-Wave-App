import React, { useState } from 'react';
import { 
  Home, 
  Wrench, 
  Car, 
  TreePine, 
  Droplets, 
  Zap,
  DollarSign,
  TrendingUp,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface SalesModeViewProps {
  onCreateEstimate: () => void;
}

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

export const SalesModeView: React.FC<SalesModeViewProps> = ({ onCreateEstimate }) => {
  const [selectedProject, setSelectedProject] = useState<ProjectArchetype | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [margin, setMargin] = useState<'good' | 'tight' | 'low'>('good');

  const handleProjectSelect = (project: ProjectArchetype) => {
    setSelectedProject(project);
    setCurrentPrice(project.redlinePrice);
    setSelectedAddons([]);
    calculateMargin(project.redlinePrice, project.redlinePrice, project.capPrice);
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
    <div className="bg-[#121212] border border-[#333333] min-h-[600px]">
      <div className="p-6">
        {!selectedProject ? (
          // Project Selection View
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-2">Quick Project Templates</h2>
              <p className="text-gray-400 text-sm">Select a project type to start your field quote</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projectArchetypes.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectSelect(project)}
                  className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-4 text-left hover:border-[#336699] transition-colors group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-[#336699] group-hover:text-[#4a7bb5] transition-colors">
                      {project.icon}
                    </div>
                    <h3 className="font-medium text-white">{project.name}</h3>
                  </div>
                  
                  <p className="text-gray-400 text-sm mb-3">{project.description}</p>
                  
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <div className="text-gray-500">Redline:</div>
                      <div className="text-red-400 font-mono">${project.redlinePrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Cap:</div>
                      <div className="text-green-400 font-mono">${project.capPrice.toLocaleString()}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Pricing Interface
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedProject(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ← Back to Templates
                </button>
                <div className="text-[#336699]">{selectedProject.icon}</div>
                <h2 className="text-lg font-semibold text-white">{selectedProject.name}</h2>
              </div>
              
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getMarginColor()}`}>
                {getMarginIcon()}
                {margin === 'good' ? 'Good Margin' : margin === 'tight' ? 'Tight Margin' : 'Low Margin'}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Price Slider */}
              <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6">
                <h3 className="text-white font-medium mb-4">Price Range</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Current Price</label>
                    <div className="text-3xl font-mono text-white mb-2">
                      ${currentPrice.toLocaleString()}
                    </div>
                    <input
                      type="range"
                      min={selectedProject.redlinePrice}
                      max={selectedProject.capPrice}
                      value={currentPrice}
                      onChange={(e) => handlePriceChange(parseInt(e.target.value))}
                      className="w-full h-2 bg-[#333333] rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Redline: ${selectedProject.redlinePrice.toLocaleString()}</span>
                      <span>Cap: ${selectedProject.capPrice.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handlePriceChange(selectedProject.redlinePrice)}
                      className="bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg py-2 px-3 text-sm font-medium hover:bg-red-500/30 transition-colors"
                    >
                      Set to Redline
                    </button>
                    <button
                      onClick={() => handlePriceChange(selectedProject.capPrice)}
                      className="bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg py-2 px-3 text-sm font-medium hover:bg-green-500/30 transition-colors"
                    >
                      Set to Cap
                    </button>
                  </div>
                </div>
              </div>

              {/* Add-ons */}
              <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6">
                <h3 className="text-white font-medium mb-4">Common Add-ons</h3>
                
                <div className="space-y-3">
                  {selectedProject.commonAddons.map((addon, index) => (
                    <label key={index} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAddons.includes(addon)}
                        onChange={() => handleAddonToggle(addon)}
                        className="w-4 h-4 text-[#336699] bg-[#333333] border-[#555555] rounded focus:ring-[#336699] focus:ring-2"
                      />
                      <span className="text-gray-300 text-sm">{addon}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-6">
              <button
                onClick={onCreateEstimate}
                className="bg-[#336699] hover:bg-[#2a5a8a] text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Generate Quote
              </button>
              
              <button className="bg-[#1a1a1a] border border-[#333333] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#2a2a2a] transition-colors flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Save as Template
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

