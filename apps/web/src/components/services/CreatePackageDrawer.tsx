import React, { useState, useEffect, useContext } from 'react';
import { X, Plus, Minus, Package, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { ServiceCatalogService, ServiceOption, Service } from '../../services/ServiceCatalogService';
import { formatCurrency } from '../../utils/format';
import { OrganizationContext } from '../layouts/DashboardLayout';

interface SelectedServiceOption {
  service_option_id: string;
  service_name: string;
  option_name: string;
  price: number;
  quantity: number;
  is_optional: boolean;
  is_upgrade: boolean;
}

interface CreatePackageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  industryId?: string;
}

export const CreatePackageDrawer: React.FC<CreatePackageDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  industryId
}) => {
  const { selectedOrg } = useContext(OrganizationContext);
  const [packageName, setPackageName] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [packageLevel, setPackageLevel] = useState<'essentials' | 'complete' | 'deluxe'>('complete');
  const [projectDurationDays, setProjectDurationDays] = useState(1);
  const [includesWarranty, setIncludesWarranty] = useState(true);
  const [idealFor, setIdealFor] = useState<string[]>([]);
  const [newIdealFor, setNewIdealFor] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<SelectedServiceOption[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen && selectedOrg?.id) {
      loadServices();
    }
  }, [isOpen, selectedOrg?.id, industryId]);

  const loadServices = async () => {
    if (!selectedOrg?.id) return;
    
    setIsLoading(true);
    try {
      const allServices = await ServiceCatalogService.listServices(selectedOrg.id);
      // Filter by industry if provided
      const filteredServices = industryId 
        ? allServices.filter(s => s.industry_id === industryId)
        : allServices;
      
      // Load options for each service
      const servicesWithOptions = await Promise.all(
        filteredServices.map(async (service) => {
          const options = await ServiceCatalogService.listServiceOptions(service.id, selectedOrg.id);
          return { ...service, options };
        })
      );
      
      setServices(servicesWithOptions);
    } catch (error) {
      // Error loading services
    } finally {
      setIsLoading(false);
    }
  };

  const toggleService = (serviceId: string) => {
    const newExpanded = new Set(expandedServices);
    if (newExpanded.has(serviceId)) {
      newExpanded.delete(serviceId);
    } else {
      newExpanded.add(serviceId);
    }
    setExpandedServices(newExpanded);
  };

  const toggleOption = (service: Service, option: ServiceOption) => {
    const existingIndex = selectedOptions.findIndex(
      so => so.service_option_id === option.id
    );

    if (existingIndex >= 0) {
      // Remove if already selected
      setSelectedOptions(selectedOptions.filter((_, i) => i !== existingIndex));
    } else {
      // Add new option
      setSelectedOptions([
        ...selectedOptions,
        {
          service_option_id: option.id,
          service_name: service.name,
          option_name: option.name,
          price: option.price,
          quantity: 1,
          is_optional: false,
          is_upgrade: false
        }
      ]);
    }
  };

  const updateQuantity = (optionId: string, delta: number) => {
    setSelectedOptions(
      selectedOptions.map(opt => 
        opt.service_option_id === optionId
          ? { ...opt, quantity: Math.max(1, opt.quantity + delta) }
          : opt
      )
    );
  };

  const toggleOptional = (optionId: string) => {
    setSelectedOptions(
      selectedOptions.map(opt => 
        opt.service_option_id === optionId
          ? { ...opt, is_optional: !opt.is_optional }
          : opt
      )
    );
  };

  const toggleUpgrade = (optionId: string) => {
    setSelectedOptions(
      selectedOptions.map(opt => 
        opt.service_option_id === optionId
          ? { ...opt, is_upgrade: !opt.is_upgrade }
          : opt
      )
    );
  };

  const removeOption = (optionId: string) => {
    setSelectedOptions(selectedOptions.filter(opt => opt.service_option_id !== optionId));
  };

  const addIdealFor = () => {
    if (newIdealFor.trim() && !idealFor.includes(newIdealFor.trim())) {
      setIdealFor([...idealFor, newIdealFor.trim()]);
      setNewIdealFor('');
    }
  };

  const removeIdealFor = (tag: string) => {
    setIdealFor(idealFor.filter(t => t !== tag));
  };

  const calculateTotalPrice = () => {
    return selectedOptions.reduce((sum, opt) => sum + (opt.price * opt.quantity), 0);
  };

  const handleSave = async () => {
    if (!packageName || selectedOptions.length === 0 || !selectedOrg?.id) return;

    setIsSaving(true);
    try {
      const packageData = {
        organization_id: selectedOrg.id,
        name: packageName,
        description: packageDescription,
        level: packageLevel,
        industry_id: industryId || null,
        project_duration_days: projectDurationDays,
        ideal_for: idealFor,
        includes_warranty: includesWarranty,
        is_active: true,
        display_order: 0,
        items: selectedOptions.map((opt, index) => ({
          service_option_id: opt.service_option_id,
          quantity: opt.quantity,
          is_optional: opt.is_optional,
          is_upgrade: opt.is_upgrade,
          display_order: index
        }))
      };

      await ServiceCatalogService.createPackage(packageData);
      onSuccess();
      handleClose();
    } catch (error) {
      // Error creating package
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setPackageName('');
    setPackageDescription('');
    setPackageLevel('complete');
    setProjectDurationDays(1);
    setIncludesWarranty(true);
    setIdealFor([]);
    setNewIdealFor('');
    setSelectedOptions([]);
    setExpandedServices(new Set());
    setSearchTerm('');
    onClose();
  };

  const filteredServices = services.filter(service =>
    service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.options?.some(opt => 
      opt.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      
      <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-[#1a1a1a] shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#333333] px-6 py-4">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-[#336699]" />
              <h2 className="text-xl font-semibold text-white">Create Service Package</h2>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-[#222222] hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Package Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Package Name
                  </label>
                  <input
                    type="text"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    placeholder="e.g., Complete Kitchen Renovation"
                    className="w-full px-4 py-2 bg-[#222222] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Description
                  </label>
                  <textarea
                    value={packageDescription}
                    onChange={(e) => setPackageDescription(e.target.value)}
                    placeholder="Describe what's included in this package..."
                    rows={3}
                    className="w-full px-4 py-2 bg-[#222222] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Package Level
                    </label>
                    <select
                      value={packageLevel}
                      onChange={(e) => setPackageLevel(e.target.value as any)}
                      className="w-full px-4 py-2 bg-[#222222] border border-[#333333] rounded-lg text-white focus:outline-none focus:border-[#336699]"
                    >
                      <option value="essentials">Essentials</option>
                      <option value="complete">Complete</option>
                      <option value="deluxe">Deluxe</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Duration (days)
                    </label>
                    <input
                      type="number"
                      value={projectDurationDays}
                      onChange={(e) => setProjectDurationDays(parseInt(e.target.value) || 1)}
                      min="1"
                      className="w-full px-4 py-2 bg-[#222222] border border-[#333333] rounded-lg text-white focus:outline-none focus:border-[#336699]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Warranty
                    </label>
                    <button
                      onClick={() => setIncludesWarranty(!includesWarranty)}
                      className={`w-full px-4 py-2 rounded-lg border transition-colors ${
                        includesWarranty
                          ? 'bg-[#336699] border-[#336699] text-white'
                          : 'bg-[#222222] border-[#333333] text-gray-400'
                      }`}
                    >
                      {includesWarranty ? 'Included' : 'Not Included'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Ideal For
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newIdealFor}
                      onChange={(e) => setNewIdealFor(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addIdealFor()}
                      placeholder="e.g., First-time homeowners"
                      className="flex-1 px-4 py-2 bg-[#222222] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
                    />
                    <button
                      onClick={addIdealFor}
                      className="px-4 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#4477aa] transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {idealFor.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-[#222222] text-gray-300 rounded-full text-sm flex items-center gap-2"
                      >
                        {tag}
                        <button
                          onClick={() => removeIdealFor(tag)}
                          className="hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Service Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-white">Select Services</h3>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search services..."
                    className="px-4 py-2 bg-[#222222] border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
                  />
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#336699]"></div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredServices.map((service) => (
                      <div key={service.id} className="border border-[#333333] rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleService(service.id)}
                          className="w-full px-4 py-3 bg-[#222222] hover:bg-[#2a2a2a] transition-colors flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-white font-medium">{service.name}</span>
                            <span className="text-sm text-gray-500">
                              ({service.options?.length || 0} options)
                            </span>
                          </div>
                          {expandedServices.has(service.id) ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>

                        {expandedServices.has(service.id) && service.options && (
                          <div className="p-4 space-y-2 bg-[#1a1a1a]">
                            {service.options.map((option) => {
                              const isSelected = selectedOptions.some(
                                so => so.service_option_id === option.id
                              );
                              return (
                                <div
                                  key={option.id}
                                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'border-[#336699] bg-[#336699]/10'
                                      : 'border-[#333333] hover:border-[#444444]'
                                  }`}
                                  onClick={() => toggleOption(service, option)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h5 className="text-white font-medium">{option.name}</h5>
                                      {option.description && (
                                        <p className="text-sm text-gray-400 mt-1">{option.description}</p>
                                      )}
                                    </div>
                                    <div className="text-white font-mono">
                                      {formatCurrency(option.price)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Options */}
              {selectedOptions.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-white">Selected Services</h3>
                  <div className="space-y-2">
                    {selectedOptions.map((option) => (
                      <div
                        key={option.service_option_id}
                        className="p-4 bg-[#222222] rounded-lg border border-[#333333]"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h5 className="text-white font-medium">{option.option_name}</h5>
                            <p className="text-sm text-gray-400">{option.service_name}</p>
                          </div>
                          <button
                            onClick={() => removeOption(option.service_option_id)}
                            className="text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-4 mt-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(option.service_option_id, -1)}
                              className="p-1 rounded bg-[#333333] hover:bg-[#444444] transition-colors"
                            >
                              <Minus className="w-3 h-3 text-white" />
                            </button>
                            <span className="text-white w-8 text-center">{option.quantity}</span>
                            <button
                              onClick={() => updateQuantity(option.service_option_id, 1)}
                              className="p-1 rounded bg-[#333333] hover:bg-[#444444] transition-colors"
                            >
                              <Plus className="w-3 h-3 text-white" />
                            </button>
                          </div>

                          <button
                            onClick={() => toggleOptional(option.service_option_id)}
                            className={`px-3 py-1 rounded text-sm transition-colors ${
                              option.is_optional
                                ? 'bg-yellow-600/20 text-yellow-400'
                                : 'bg-[#333333] text-gray-400 hover:bg-[#444444]'
                            }`}
                          >
                            Optional
                          </button>

                          <button
                            onClick={() => toggleUpgrade(option.service_option_id)}
                            className={`px-3 py-1 rounded text-sm transition-colors ${
                              option.is_upgrade
                                ? 'bg-purple-600/20 text-purple-400'
                                : 'bg-[#333333] text-gray-400 hover:bg-[#444444]'
                            }`}
                          >
                            Upgrade
                          </button>

                          <div className="ml-auto text-white font-mono">
                            {formatCurrency(option.price * option.quantity)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-[#333333] px-6 py-4 bg-[#1a1a1a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Package Price</p>
                <p className="text-2xl font-mono text-white">{formatCurrency(calculateTotalPrice())}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!packageName || selectedOptions.length === 0 || isSaving}
                  className="px-6 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#4477aa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Creating...' : 'Create Package'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};