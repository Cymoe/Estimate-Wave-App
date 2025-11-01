import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ChevronDown, ChevronRight, Plus, Package } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { ServiceCatalogService, Service, ServiceOption } from '../../services/ServiceCatalogService';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { CreateServiceDrawer } from './CreateServiceDrawer';
import { CreateServiceOptionModal } from './CreateServiceOptionModal';
import { EnhancedServiceOptionCard } from './EnhancedServiceOptionCard';
import { supabase } from '../../lib/supabase';

interface ServicesByCategory {
  [category: string]: Service[];
}

interface ServicesByIndustry {
  [industryId: string]: {
    industryName: string;
    services: Service[];
  };
}

interface ServiceCatalogProps {
  triggerAddService?: number;
}

export const ServiceCatalog: React.FC<ServiceCatalogProps> = ({ triggerAddService }) => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesByCategory, setServicesByCategory] = useState<ServicesByCategory>({});
  const [servicesByIndustry, setServicesByIndustry] = useState<ServicesByIndustry>({});
  const [selectedIndustries, setSelectedIndustries] = useState<Array<{id: string, name: string}>>([]);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedIndustries, setExpandedIndustries] = useState<Set<string>>(new Set());
  const [selectedOptions, setSelectedOptions] = useState<Map<string, ServiceOption>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [showCreateOptionModal, setShowCreateOptionModal] = useState(false);
  const [selectedServiceForOption, setSelectedServiceForOption] = useState<Service | null>(null);

  useEffect(() => {
    loadServices();
  }, [selectedOrg?.id]);

  // Handle trigger from parent component
  useEffect(() => {
    if (triggerAddService && triggerAddService > 0) {
      setShowCreateDrawer(true);
    }
  }, [triggerAddService]);

  const loadServices = async () => {
    if (!selectedOrg?.id) return;

    try {
      setIsLoading(true);
      
      // Load selected industries first
      const { data: orgIndustries, error: indError } = await supabase
        .from('organization_industries')
        .select('industry_id, industries(id, name)')
        .eq('organization_id', selectedOrg.id);
      
      if (!indError && orgIndustries) {
        const industries = orgIndustries.map(oi => ({
          id: oi.industries.id,
          name: oi.industries.name
        })).sort((a, b) => a.name.localeCompare(b.name));
        setSelectedIndustries(industries);
      }
      
      // Load services
      const data = await ServiceCatalogService.listServices(selectedOrg.id);
      setServices(data);

      // Group by category
      const grouped = data.reduce((acc, service) => {
        const category = service.category || 'uncategorized';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(service);
        return acc;
      }, {} as ServicesByCategory);

      setServicesByCategory(grouped);

      // Group by industry - but include ALL selected industries
      const groupedByIndustry: ServicesByIndustry = {};
      
      // First, add all selected industries (even if they have no services)
      if (orgIndustries) {
        orgIndustries.forEach(oi => {
          groupedByIndustry[oi.industries.id] = {
            industryName: oi.industries.name,
            services: []
          };
        });
      }
      
      // Then add the services to their respective industries
      data.forEach(service => {
        const industryId = service.industry_id || 'uncategorized';
        const industryName = service.industry_name || 'Other';
        
        if (groupedByIndustry[industryId]) {
          groupedByIndustry[industryId].services.push(service);
        } else {
          // This handles services from industries not selected (like Roofing)
          // We'll skip these for now since user wants to see only selected industries
        }
      });

      setServicesByIndustry(groupedByIndustry);
      
      // Start with all industries collapsed for cleaner initial view
      setExpandedIndustries(new Set());
      // Start with all categories collapsed
      setExpandedCategories(new Set());
    } catch (error) {
      // Error loading services
    } finally {
      setIsLoading(false);
    }
  };

  const toggleService = async (serviceId: string) => {
    const newExpanded = new Set(expandedServices);
    if (newExpanded.has(serviceId)) {
      newExpanded.delete(serviceId);
      setExpandedServices(newExpanded);
    } else {
      newExpanded.add(serviceId);
      setExpandedServices(newExpanded);
      
      // Load options if not already loaded
      const service = services.find(s => s.id === serviceId);
      if (service && !service.options) {
        try {
          const data = await ServiceCatalogService.getServiceWithOptions(serviceId);
          
          // Update the services state with the loaded options
          setServices(prevServices => 
            prevServices.map(s => 
              s.id === serviceId 
                ? { ...s, options: data.options } 
                : s
            )
          );
          
          // Also update the servicesByCategory
          const updatedService = { ...service, options: data.options };
          setServicesByCategory(prev => {
            const category = updatedService.category || 'uncategorized';
            return {
              ...prev,
              [category]: prev[category].map(s => 
                s.id === serviceId ? updatedService : s
              )
            };
          });
          
          // Also update the servicesByIndustry
          setServicesByIndustry(prev => {
            const industryId = updatedService.industry_id || 'uncategorized';
            return {
              ...prev,
              [industryId]: {
                ...prev[industryId],
                services: prev[industryId].services.map(s => 
                  s.id === serviceId ? updatedService : s
                )
              }
            };
          });
        } catch (error) {
          // Error loading service options
        }
      }
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleIndustry = (industryId: string) => {
    const newExpanded = new Set(expandedIndustries);
    if (newExpanded.has(industryId)) {
      newExpanded.delete(industryId);
    } else {
      newExpanded.add(industryId);
    }
    setExpandedIndustries(newExpanded);
  };

  const selectOption = (option: ServiceOption) => {
    const newSelected = new Map(selectedOptions);
    if (newSelected.has(option.id)) {
      newSelected.delete(option.id);
    } else {
      newSelected.set(option.id, option);
    }
    setSelectedOptions(newSelected);
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      installation: 'Installation Services',
      repair: 'Repair Services',
      maintenance: 'Maintenance Services',
      inspection: 'Inspection Services',
      consultation: 'Consultation Services',
      preparation: 'Preparation Services',
      finishing: 'Finishing Services',
      uncategorized: 'Other Services'
    };
    return labels[category] || category;
  };




  const filteredServices = (services: Service[]) => {
    let filtered = services;
    
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(service => 
        service.name.toLowerCase().includes(lower) ||
        service.description?.toLowerCase().includes(lower)
      );
    }
    
    if (filterCategory !== 'all') {
      filtered = filtered.filter(service => service.category === filterCategory);
    }
    
    return filtered;
  };

  const expandAllIndustries = () => {
    setExpandedIndustries(new Set(Object.keys(servicesByIndustry)));
  };

  const collapseAllIndustries = () => {
    setExpandedIndustries(new Set());
  };

  const areAllExpanded = expandedIndustries.size === Object.keys(servicesByIndustry).length;

  // Get unique industries with counts
  const industries = Object.entries(servicesByIndustry).map(([id, data]) => {
    const services = data.services;
    const optionCount = services.reduce((sum, service) => {
      return sum + (service.option_count || 0);
    }, 0);
    return {
      id,
      name: data.industryName,
      serviceCount: services.length,
      optionCount
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex-1 bg-[#1D1F25]">


      {/* Content */}
      <div className="border-t border-[#333333]">
        {/* Expand/Collapse All Button */}
        {!isLoading && services.length > 0 && industries.length > 0 && (
          <div className="px-6 py-3 bg-[#1D1F25] border-b border-[#333333] flex items-center justify-between">
            <div className="text-sm text-gray-400">
              {industries.length} {industries.length === 1 ? 'industry' : 'industries'} with services
            </div>
            <button
              onClick={areAllExpanded ? collapseAllIndustries : expandAllIndustries}
              className="px-3 py-1.5 text-sm text-[#336699] hover:text-[#4477aa] hover:bg-[#22272d] rounded transition-colors flex items-center gap-2"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${areAllExpanded ? '' : '-rotate-90'}`} />
              {areAllExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading services...</div>
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-gray-400 mb-4">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No services available</p>
              <p className="text-sm mt-2">Services will appear here once industries are selected in settings.</p>
            </div>
            <button
              onClick={() => navigate('/settings/industries')}
              className="px-4 py-2 bg-[#336699] text-white text-sm font-medium hover:bg-[#4477aa] transition-colors"
            >
              Configure Industries
            </button>
          </div>
        ) : industries.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Processing services data...</div>
          </div>
        ) : (
          /* List View - Grouped by Industry with Accordion */
          <div>
            {industries.map((industry) => {
              const industryData = servicesByIndustry[industry.id];
              const isExpanded = expandedIndustries.has(industry.id);
              const filtered = filteredServices(industryData.services);
              
              if (filtered.length === 0 && searchTerm) return null;
              
              return (
                <div key={industry.id} className="border-b border-[#333333] last:border-b-0">
                  {/* Industry Header - Clickable */}
                  <button
                    onClick={() => toggleIndustry(industry.id)}
                    className="w-full px-6 py-4 bg-[#1D1F25] hover:bg-[#22272d] transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight 
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        {industry.name}
                      </h3>
                    </div>
                    <div className="text-sm text-gray-400 group-hover:text-gray-300">
                      {isExpanded ? 'Click to collapse' : 'Click to expand'}
                    </div>
                  </button>
                  
                  {/* Services for this Industry - Only show when expanded */}
                  {isExpanded && (
                    <div className="divide-y divide-[#333333] bg-[#1D1F25]">
                      {filtered.length === 0 ? (
                        <div className="px-6 py-8 text-center">
                          <div className="text-gray-500">
                            <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No services defined for {industryData.industryName} yet</p>
                            <p className="text-xs mt-1 mb-4">Start by creating your first service</p>
                            <button
                              onClick={() => setShowCreateDrawer(true)}
                              className="px-4 py-2 bg-[#336699] text-white text-sm font-medium hover:bg-[#4477aa] transition-colors inline-flex items-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Create First Service
                            </button>
                          </div>
                        </div>
                      ) : (
                        filtered.map((service) => (
                          <div
                            key={service.id}
                            className="px-6 py-4 hover:bg-[#22272d] transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <h3 className="text-white font-medium">{service.name}</h3>
                                  {service.category && (
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      service.category === 'installation' ? 'bg-blue-400/20 text-blue-400' :
                                      service.category === 'repair' ? 'bg-green-400/20 text-green-400' :
                                      service.category === 'maintenance' ? 'bg-yellow-400/20 text-yellow-400' :
                                      'bg-orange-400/20 text-orange-400'
                                    }`}>
                                      {getCategoryLabel(service.category)}
                                    </span>
                                  )}
                                </div>
                                {service.description && (
                                  <p className="text-gray-400 text-sm mt-1">{service.description}</p>
                                )}
                                <div className="mt-2 flex items-center gap-3">
                                  {service.option_count > 0 ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleService(service.id);
                                      }}
                                      className="text-[#336699] text-sm hover:text-[#4477aa] flex items-center gap-1"
                                    >
                                      {expandedServices.has(service.id) ? (
                                        <>
                                          <ChevronDown className="w-3 h-3" />
                                          Hide {service.option_count} options
                                        </>
                                      ) : (
                                        <>
                                          <ChevronRight className="w-3 h-3" />
                                          Show {service.option_count} options
                                        </>
                                      )}
                                    </button>
                                  ) : (
                                    <span className="text-gray-500 text-sm">No options yet</span>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedServiceForOption(service);
                                      setShowCreateOptionModal(true);
                                    }}
                                    className={`text-sm flex items-center gap-1 transition-colors ${
                                      service.option_count === 0 
                                        ? 'text-[#336699] hover:text-[#4477aa] font-medium' 
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                                  >
                                    <Plus className="w-3 h-3" />
                                    {service.option_count === 0 ? 'Add First Option' : 'Add Option'}
                                  </button>
                                </div>
                              </div>
                              
                              <div className="text-right ml-4">
                                {service.option_count > 0 && (
                                  <div className="text-gray-400 text-sm">{service.option_count} options</div>
                                )}
                              </div>
                            </div>
                            
                            {/* Service Options - Show when expanded */}
                            {expandedServices.has(service.id) && service.options && service.options.length > 0 && (
                              <div className="mt-4 ml-4 space-y-2 border-l-2 border-[#333333] pl-4">
                                {service.options.map((option, index) => {
                                  // Assign different layout modes to first 4 options for A/B testing
                                  const layoutModes = ['tabs', 'collapsible', 'cards', 'columns'] as const;
                                  const layoutMode = index < 4 ? layoutModes[index] : 'default';
                                  
                                  return (
                                    <EnhancedServiceOptionCard
                                      key={option.id}
                                      option={option}
                                      isSelected={selectedOptions.has(option.id)}
                                      onSelect={() => selectOption(option)}
                                      industryName={service.industry_name}
                                      lineItems={option.service_option_items}
                                      layoutMode={layoutMode}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Service Drawer */}
      <CreateServiceDrawer
        isOpen={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        onSuccess={() => {
          setShowCreateDrawer(false);
          loadServices();
        }}
      />

      {/* Create Service Option Modal */}
      {selectedServiceForOption && (
        <CreateServiceOptionModal
          isOpen={showCreateOptionModal}
          onClose={() => {
            setShowCreateOptionModal(false);
            setSelectedServiceForOption(null);
          }}
          onSuccess={() => {
            setShowCreateOptionModal(false);
            setSelectedServiceForOption(null);
            loadServices();
          }}
          service={selectedServiceForOption}
        />
      )}
    </div>
  );
};



