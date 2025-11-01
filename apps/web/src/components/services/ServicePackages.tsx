import React, { useState, useEffect, useContext } from 'react';
import { Package, ChevronRight, ChevronDown, Plus, Star, Clock, Shield, Layers, Check } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { ServiceCatalogService, ServicePackage, ServicePackageItem } from '../../services/ServiceCatalogService';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { NewButton } from '../common/NewButton';
import { CreatePackageDrawer } from './CreatePackageDrawer';

interface PackagesByLevel {
  essentials: ServicePackage[];
  complete: ServicePackage[];
  deluxe: ServicePackage[];
}

export const ServicePackages: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [packagesByLevel, setPackagesByLevel] = useState<PackagesByLevel>({
    essentials: [],
    complete: [],
    deluxe: []
  });
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);

  useEffect(() => {
    loadPackages();
  }, [selectedOrg?.id]);

  const loadPackages = async () => {
    if (!selectedOrg?.id) return;

    try {
      setIsLoading(true);
      const data = await ServiceCatalogService.listPackages(selectedOrg.id);
      setPackages(data);

      // Group by level
      const grouped = data.reduce((acc, pkg) => {
        acc[pkg.level].push(pkg);
        return acc;
      }, {
        essentials: [],
        complete: [],
        deluxe: []
      } as PackagesByLevel);

      setPackagesByLevel(grouped);
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePackage = async (packageId: string) => {
    const newExpanded = new Set(expandedPackages);
    if (newExpanded.has(packageId)) {
      newExpanded.delete(packageId);
    } else {
      newExpanded.add(packageId);
      // Load package items if not already loaded
      const pkg = packages.find(p => p.id === packageId);
      if (pkg && !pkg.items) {
        try {
          const data = await ServiceCatalogService.getPackageWithItems(packageId);
          setPackages(packages.map(p => p.id === packageId ? { ...p, items: data.items } : p));
        } catch (error) {
          console.error('Error loading package items:', error);
        }
      }
    }
    setExpandedPackages(newExpanded);
  };

  const selectPackage = (pkg: ServicePackage) => {
    setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg);
  };

  const getLevelColor = (level: string) => {
    const colors = {
      essentials: { bg: 'bg-gray-600/20', text: 'text-gray-400', border: 'border-gray-600' },
      complete: { bg: 'bg-blue-600/20', text: 'text-blue-400', border: 'border-blue-600' },
      deluxe: { bg: 'bg-purple-600/20', text: 'text-purple-400', border: 'border-purple-600' }
    };
    return colors[level as keyof typeof colors] || colors.complete;
  };

  const getLevelIcon = (level: string) => {
    const icons = {
      essentials: '⭐',
      complete: '⭐⭐',
      deluxe: '⭐⭐⭐'
    };
    return icons[level as keyof typeof icons] || '⭐⭐';
  };

  const filteredPackages = (levelPackages: ServicePackage[]) => {
    if (!searchTerm) return levelPackages;
    
    const lower = searchTerm.toLowerCase();
    return levelPackages.filter(pkg => 
      pkg.name.toLowerCase().includes(lower) ||
      pkg.description?.toLowerCase().includes(lower)
    );
  };

  return (
    <div className="min-h-screen bg-[#1D1F25]">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-[#333333] px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Service Packages</h1>
          <NewButton onClick={() => setShowCreateDrawer(true)} />
        </div>

        <p className="text-gray-400 mb-4">
          Pre-configured bundles of services for complete projects
        </p>

        <div className="relative">
          <input
            type="text"
            placeholder="Search packages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#222222] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
          />
          <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
      </div>

      {/* Packages Grid */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#336699]"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Essentials Column */}
            <PackageColumn
              level="essentials"
              packages={filteredPackages(packagesByLevel.essentials)}
              expandedPackages={expandedPackages}
              selectedPackage={selectedPackage}
              onTogglePackage={togglePackage}
              onSelectPackage={selectPackage}
            />

            {/* Complete Column */}
            <PackageColumn
              level="complete"
              packages={filteredPackages(packagesByLevel.complete)}
              expandedPackages={expandedPackages}
              selectedPackage={selectedPackage}
              onTogglePackage={togglePackage}
              onSelectPackage={selectPackage}
            />

            {/* Deluxe Column */}
            <PackageColumn
              level="deluxe"
              packages={filteredPackages(packagesByLevel.deluxe)}
              expandedPackages={expandedPackages}
              selectedPackage={selectedPackage}
              onTogglePackage={togglePackage}
              onSelectPackage={selectPackage}
            />
          </div>
        )}
      </div>

      {/* Create Package Drawer */}
      <CreatePackageDrawer
        isOpen={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        onSuccess={() => {
          setShowCreateDrawer(false);
          loadPackages();
        }}
      />
    </div>
  );
};

// Package Column Component
const PackageColumn: React.FC<{
  level: 'essentials' | 'complete' | 'deluxe';
  packages: ServicePackage[];
  expandedPackages: Set<string>;
  selectedPackage: ServicePackage | null;
  onTogglePackage: (id: string) => void;
  onSelectPackage: (pkg: ServicePackage) => void;
}> = ({ level, packages, expandedPackages, selectedPackage, onTogglePackage, onSelectPackage }) => {
  const colors = getLevelColor(level);
  const icon = getLevelIcon(level);
  const labels = {
    essentials: 'Essentials',
    complete: 'Complete',
    deluxe: 'Deluxe'
  };

  return (
    <div className="space-y-4">
      {/* Column Header */}
      <div className={`p-4 rounded-lg ${colors.bg} border ${colors.border}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={`text-lg font-semibold ${colors.text}`}>
            {labels[level]}
          </h3>
          <span className="text-2xl">{icon}</span>
        </div>
        <p className="text-sm text-gray-400">
          {level === 'essentials' && 'Budget-friendly basics'}
          {level === 'complete' && 'Full-featured solutions'}
          {level === 'deluxe' && 'Premium experience'}
        </p>
      </div>

      {/* Packages */}
      <div className="space-y-4">
        {packages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No {labels[level].toLowerCase()} packages</p>
          </div>
        ) : (
          packages.map(pkg => (
            <PackageCard
              key={pkg.id}
              package={pkg}
              isExpanded={expandedPackages.has(pkg.id)}
              isSelected={selectedPackage?.id === pkg.id}
              onToggle={() => onTogglePackage(pkg.id)}
              onSelect={() => onSelectPackage(pkg)}
              levelColors={colors}
            />
          ))
        )}
      </div>
    </div>
  );
};

// Package Card Component
const PackageCard: React.FC<{
  package: ServicePackage;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  levelColors: any;
}> = ({ package: pkg, isExpanded, isSelected, onToggle, onSelect, levelColors }) => {
  return (
    <div 
      className={`bg-[#1a1a1a] rounded-lg overflow-hidden border transition-all ${
        isSelected ? `border-[#336699] ${levelColors.bg}` : 'border-[#333333]'
      }`}
    >
      {/* Package Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-white font-medium">{pkg.name}</h4>
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {pkg.description && (
          <p className="text-sm text-gray-400 mb-3">{pkg.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="text-2xl font-mono text-white">
            {formatCurrency(pkg.package_price || pkg.calculated_price || pkg.base_price || 0)}
          </div>
          <button
            onClick={onSelect}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              isSelected 
                ? 'bg-[#336699] text-white' 
                : 'bg-[#222222] text-gray-400 hover:bg-[#333333]'
            }`}
          >
            {isSelected ? 'Selected' : 'Select'}
          </button>
        </div>

        {/* Package Metadata */}
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
          {pkg.item_count !== undefined && (
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {pkg.item_count} services
            </span>
          )}
          {pkg.project_duration_days && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {pkg.project_duration_days} days
            </span>
          )}
          {pkg.includes_warranty && (
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Warranty
            </span>
          )}
        </div>

        {/* Ideal For Tags */}
        {pkg.ideal_for && pkg.ideal_for.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {pkg.ideal_for.map((tag, index) => (
              <span 
                key={index}
                className="px-2 py-1 text-xs bg-[#222222] text-gray-400 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Package Items (Expanded View) */}
      {isExpanded && pkg.items && (
        <div className="border-t border-[#333333] p-4 space-y-2">
          <h5 className="text-sm font-medium text-gray-400 mb-2">Included Services:</h5>
          {pkg.items.map((item: ServicePackageItem) => (
            <div 
              key={item.id}
              className="flex items-center justify-between py-1"
            >
              <div className="flex items-center gap-2">
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-sm text-gray-300">
                  {item.service_option?.name}
                  {item.quantity > 1 && ` (×${item.quantity})`}
                </span>
                {item.is_optional && (
                  <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                    Optional
                  </span>
                )}
                {item.is_upgrade && (
                  <span className="text-xs bg-blue-700 text-blue-300 px-1.5 py-0.5 rounded">
                    Upgrade
                  </span>
                )}
              </div>
              {item.service_option?.price && (
                <span className="text-sm font-mono text-gray-400">
                  {formatCurrency(item.service_option.price * item.quantity)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper function
const getLevelColor = (level: string) => {
  const colors = {
    essentials: { bg: 'bg-gray-600/10', text: 'text-gray-400', border: 'border-gray-600/50' },
    complete: { bg: 'bg-blue-600/10', text: 'text-blue-400', border: 'border-blue-600/50' },
    deluxe: { bg: 'bg-purple-600/10', text: 'text-purple-400', border: 'border-purple-600/50' }
  };
  return colors[level as keyof typeof colors] || colors.complete;
};

const getLevelIcon = (level: string) => {
  const icons = {
    essentials: '⭐',
    complete: '⭐⭐',
    deluxe: '⭐⭐⭐'
  };
  return icons[level as keyof typeof icons] || '⭐⭐';
};