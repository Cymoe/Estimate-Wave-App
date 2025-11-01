import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, Check, Sparkles, Home, Paintbrush, Hammer, Wrench, Building, TreePine, Bath, Package, ChevronLeft, Briefcase, Building2, Zap, Wind, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';
import { ExpenseService } from '../../services/expenseService';
import { ActivityLogService } from '../../services/ActivityLogService';
// import WorkPackSelector from './WorkPackSelector'; // TODO: Create ServicePackageSelector

// Map category names to IDs from the database
const categoryNameToId: Record<string, string> = {
  'Kitchen Remodel': '6008fc0f-134f-4d76-90aa-b5870c1851a7',
  'Bathroom Remodel': 'c06256b1-b884-4d7a-b0ce-6ec0a3c77959',
  'Flooring Installation': '344b6b62-0935-4b31-8d6f-e63770906246',
  'Roof Repair': 'afefa73c-8247-4244-8a22-bbc10ab7c941',
  'Deck Construction': '35bff790-8c05-4d14-ab76-4038072ba33c',
  'Electrical': 'c2447e6c-38c0-4ee6-87be-289dd0c4879a',
  'Exterior Painting': '0f3b5a2b-bd6d-4d4d-99b1-c59ef50cd0f6',
  'Interior Painting': '5d7e0297-6be0-4067-88eb-aa01760399b6',
  'Landscaping': 'c733df7e-31ba-444f-b6ab-7f4f3f58dc7c',
  'General Repair': '5b405cd8-37a0-4fe8-bd3a-6a84259e84dd',
  'Plumbing': 'eca821b2-153f-437b-9e20-e098fb26816c',
  'HVAC': 'bd658a77-e238-4a4b-9457-00d9a2284c2b'
};

// Interfaces
interface Industry {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
}

interface ProjectCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  industry_id: string;
  industry: Industry;
}

interface Template {
  id: string;
  name: string;
  description: string;
  projectType: string;
  totalAmount: number;
  itemCount: number;
  estimatedDuration: string;
  popularity?: number;
  lastUsed?: string;
  lineItems: { description: string; quantity: number; price: number }[];
}

interface ProjectFormData {
  name: string;
  description: string;
  client_id: string;
  template_id: string;
  start_date: string;
  end_date: string;
}

interface CreateProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Map icon names to components
const iconMap: Record<string, React.FC<any>> = {
  'Home': Home,
  'Bath': Bath,
  'Package': Package,
  'TreePine': TreePine,
  'Paintbrush': Paintbrush,
  'Wrench': Wrench,
  'Zap': Zap,
  'Wind': Wind,
  'Tool': Settings
};

export const CreateProjectWizard: React.FC<CreateProjectWizardProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null);
  const [selectedProjectType, setSelectedProjectType] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedServicePackage, setSelectedServicePackage] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [customBudget, setCustomBudget] = useState('');
  const [userIndustries, setUserIndustries] = useState<Industry[]>([]);
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const [servicePackages, setServicePackages] = useState<any[]>([]);
  const [projectStatus, setProjectStatus] = useState<'lead' | 'planned' | 'quoted'>('planned');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    client_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
  });
  const { selectedOrg } = useContext(OrganizationContext);

  useEffect(() => {
    if (isOpen && selectedOrg?.id) {
      loadData();
    }
  }, [isOpen, selectedOrg?.id]);

  useEffect(() => {
    // Reset wizard state when modal opens
    if (isOpen) {
      setCurrentStep(1);
      setSelectedIndustry(null);
      setSelectedProjectType('');
      setSelectedCategory(null);
      setSelectedServicePackage(null);
      setCustomBudget('');
      setProjectStatus('planned');
      setFormData({
        name: '',
        description: '',
        client_id: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: ''
      });
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setIsCreating(true);
      
      if (!selectedOrg?.id) {
        console.log('No organization selected');
        setUserIndustries([]);
        setProjectCategories([]);
        return;
      }
      
      // Load organization's selected industries
      const { data: orgIndustriesData, error: orgIndustriesError } = await supabase
        .from('organization_industries')
        .select(`
          industry:industries(*)
        `)
        .eq('organization_id', selectedOrg.id);

      if (orgIndustriesError) throw orgIndustriesError;
      
      const industries = orgIndustriesData?.map((oi: any) => oi.industry).filter(Boolean) || [];
      setUserIndustries(industries);
      
      console.log('Organization industries loaded:', industries);

      // Load project categories for organization's industries
      const industryIds = industries.map((i: any) => i.id);
      if (industryIds.length > 0) {
        const { data: categoriesRes, error: categoriesError } = await supabase
          .from('project_categories')
          .select(`
            *,
            industry:industries!inner(*)
          `)
          .in('industry_id', industryIds)
          .eq('is_active', true)
          .order('name');

        if (categoriesError) throw categoriesError;
        setProjectCategories(categoriesRes || []);
        console.log('Project categories loaded:', categoriesRes);
      } else {
        setProjectCategories([]);
      }
      
      // Service packages removed - using invoice templates instead
      setServicePackages([]);
      
      // Load clients
      const { data: clientsRes, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user?.id);

      if (clientsError) throw clientsError;
      
      setClients(clientsRes || []);
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white">Select an industry</h3>
              <p className="text-sm text-gray-500">Choose the industry for your project</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {userIndustries.map((industry) => {
                const isSelected = selectedIndustry?.id === industry.id;
                // Filter categories for this industry
                const industryCategories = projectCategories.filter(c => c.industry_id === industry.id);
                
                return (
                  <button
                    key={industry.id}
                    onClick={() => {
                      setSelectedIndustry(industry);
                      // If only one project type in this industry, auto-advance
                      if (industryCategories.length === 1) {
                        setSelectedCategory(industryCategories[0]);
                        setSelectedProjectType(industryCategories[0].id);
                        setCurrentStep(2);
                      } else {
                        setCurrentStep(1.5); // Show project type selection
                      }
                    }}
                    className={`relative flex flex-col items-start p-6 rounded-lg border transition-all duration-200
                              ${isSelected 
                                ? 'bg-[#0f1729] border-[#fbbf24]'
                                : 'bg-transparent border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#111]'}`}
                  >
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 border transition-colors
                                  ${isSelected
                                    ? 'border-[#fbbf24] text-[#fbbf24]'
                                    : 'border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a] hover:text-[#999]'}`}
                         style={{ borderColor: isSelected ? industry.color : undefined }}>
                      <span className="text-2xl">{industry.icon}</span>
                    </div>

                    {/* Content */}
                    <h3 className="text-lg font-semibold text-white mb-1">{industry.name}</h3>
                    <p className="text-sm text-gray-500">{industry.description}</p>
                    <p className="text-xs text-gray-600 mt-2">{industryCategories.length} project types</p>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <div className="absolute top-4 right-4">
                        <div className="w-6 h-6 bg-[#fbbf24] rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-black" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {userIndustries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">You haven't selected any industries yet.</p>
                <button
                  onClick={() => navigate('/settings/industries')}
                  className="px-6 py-2 bg-[#fbbf24] text-black rounded-lg hover:bg-[#fbbf24]/90 transition-colors font-medium"
                >
                  Manage Industries
                </button>
              </div>
            )}
          </div>
        );

      case 1.5:
        // Project type selection within selected industry
        const industryCategories = projectCategories.filter(c => c.industry_id === selectedIndustry?.id);
        
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white">Select project type</h3>
              <p className="text-sm text-gray-500">Choose a project type in {selectedIndustry?.name || 'selected industry'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {industryCategories.map((category) => {
                const isSelected = selectedProjectType === category.id;
                
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedProjectType(category.id);
                      setSelectedCategory(category);
                      setCurrentStep(2);
                    }}
                    className={`relative flex flex-col items-start p-6 rounded-lg border transition-all duration-200
                              ${isSelected 
                                ? 'bg-[#0f1729] border-[#fbbf24]'
                                : 'bg-transparent border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#111]'}`}
                  >
                    {/* Content */}
                    <h3 className="text-lg font-semibold text-white mb-1">{category.name}</h3>
                    <p className="text-sm text-gray-500">{category.description || 'No description'}</p>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <div className="absolute top-4 right-4">
                        <div className="w-6 h-6 bg-[#fbbf24] rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-black" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 2:
        // Filter service packages for the selected industry
        const industryPackages = servicePackages.filter(pkg => pkg.industry_id === selectedIndustry?.id);
        const essentialPackages = industryPackages.filter(pkg => pkg.level === 'essentials');
        const completePackages = industryPackages.filter(pkg => pkg.level === 'complete');
        const deluxePackages = industryPackages.filter(pkg => pkg.level === 'deluxe');
        
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white">Select Service Package</h3>
              <p className="text-sm text-gray-500">Choose a pre-configured service package or create a custom project</p>
            </div>
            
            {industryPackages.length > 0 ? (
              <div className="space-y-6">
                {/* Essentials Packages */}
                {essentialPackages.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-3">ESSENTIALS</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {essentialPackages.map(pkg => (
                        <button
                          key={pkg.id}
                          onClick={() => {
                            setSelectedServicePackage(pkg);
                            setCurrentStep(3);
                          }}
                          className={`p-4 border rounded-lg text-left transition-all ${
                            selectedServicePackage?.id === pkg.id
                              ? 'bg-[#0f1729] border-[#fbbf24] text-white'
                              : 'bg-transparent border-[#2a2a2a] text-white hover:border-[#3a3a3a] hover:bg-[#111]'
                          }`}
                        >
                          <div className="font-medium mb-1">{pkg.name}</div>
                          <div className="text-xs text-gray-500">{pkg.description}</div>
                          <div className="text-xs text-gray-600 mt-2">{pkg.completion_days} days</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Complete Packages */}
                {completePackages.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-3">COMPLETE</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {completePackages.map(pkg => (
                        <button
                          key={pkg.id}
                          onClick={() => {
                            setSelectedServicePackage(pkg);
                            setCurrentStep(3);
                          }}
                          className={`p-4 border rounded-lg text-left transition-all ${
                            selectedServicePackage?.id === pkg.id
                              ? 'bg-[#0f1729] border-[#fbbf24] text-white'
                              : 'bg-transparent border-[#2a2a2a] text-white hover:border-[#3a3a3a] hover:bg-[#111]'
                          }`}
                        >
                          <div className="font-medium mb-1">{pkg.name}</div>
                          <div className="text-xs text-gray-500">{pkg.description}</div>
                          <div className="text-xs text-gray-600 mt-2">{pkg.completion_days} days</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Deluxe Packages */}
                {deluxePackages.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-3">DELUXE</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {deluxePackages.map(pkg => (
                        <button
                          key={pkg.id}
                          onClick={() => {
                            setSelectedServicePackage(pkg);
                            setCurrentStep(3);
                          }}
                          className={`p-4 border rounded-lg text-left transition-all ${
                            selectedServicePackage?.id === pkg.id
                              ? 'bg-[#0f1729] border-[#fbbf24] text-white'
                              : 'bg-transparent border-[#2a2a2a] text-white hover:border-[#3a3a3a] hover:bg-[#111]'
                          }`}
                        >
                          <div className="font-medium mb-1">{pkg.name}</div>
                          <div className="text-xs text-gray-500">{pkg.description}</div>
                          <div className="text-xs text-gray-600 mt-2">{pkg.completion_days} days</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Start from Scratch Option */}
                <div className="border-t border-[#333333] pt-6">
                  <button
                    onClick={() => {
                      setSelectedServicePackage({ id: 'custom', name: 'Custom Project' });
                      setCurrentStep(3);
                    }}
                    className="w-full p-6 border border-[#2a2a2a] rounded-lg text-center hover:bg-[#111] hover:border-[#3a3a3a] transition-all"
                  >
                    <h4 className="text-lg font-semibold text-white mb-2">Start from Scratch</h4>
                    <p className="text-sm text-gray-500">Create a custom project without a template</p>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
                <p className="text-yellow-700 dark:text-yellow-300 mb-4">
                  No service packages available for this industry yet.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedServicePackage({ id: 'custom', name: 'Custom Service Package' });
                    setCurrentStep(3);
                  }}
                  className="w-full py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Continue without package
                </button>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-8">
            <h3 className="text-2xl font-bold text-white tracking-tight uppercase">Project Details</h3>

            {/* Project Type Selector */}
            <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
              <label className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-3 block">
                Project Type
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setProjectStatus('lead')}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    projectStatus === 'lead'
                      ? 'bg-[#F9D71C]/10 border-[#F9D71C] text-[#F9D71C]'
                      : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                  }`}
                >
                  <div className="font-medium text-sm">💡 Lead</div>
                  <div className="text-xs mt-1 opacity-75">Initial inquiry</div>
                  {projectStatus === 'lead' && (
                    <div className="text-xs mt-2 p-2 bg-[#F9D71C]/5 border border-[#F9D71C]/20 rounded text-[#F9D71C]">
                      📝 Will create project for lead tracking
                      <div className="text-xs mt-1 opacity-75">
                        No invoices or estimates created
                      </div>
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setProjectStatus('quoted')}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    projectStatus === 'quoted'
                      ? 'bg-[#336699]/10 border-[#336699] text-[#336699]'
                      : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                  }`}
                >
                  <div className="font-medium text-sm">📋 Quote</div>
                  <div className="text-xs mt-1 opacity-75">Generate estimate</div>
                  {projectStatus === 'quoted' && (
                    <div className="text-xs mt-2 p-2 bg-[#336699]/5 border border-[#336699]/20 rounded text-[#336699]">
                      ✨ Will create project + estimate automatically
                      {!formData.client_id && (
                        <div className="text-orange-400 mt-1">
                          ⚠️ Client required for estimates
                        </div>
                      )}
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setProjectStatus('planned')}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    projectStatus === 'planned'
                      ? 'bg-[#388E3C]/10 border-[#388E3C] text-[#388E3C]'
                      : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                  }`}
                >
                  <div className="font-medium text-sm">🏗️ Project</div>
                  <div className="text-xs mt-1 opacity-75">Sold & planned</div>
                  {projectStatus === 'planned' && (
                    <div className="text-xs mt-2 p-2 bg-[#388E3C]/5 border border-[#388E3C]/20 rounded text-[#388E3C]">
                      🚀 Will create project + invoice automatically
                      <div className="text-xs mt-1 opacity-75">
                        Ready to start work
                      </div>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Project Name */}
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                  Project Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full h-12 px-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                           text-white placeholder-gray-500 focus:outline-none focus:border-[#3a3a3a] 
                           focus:bg-[#151515] transition-all text-sm"
                  placeholder="e.g., Johnson Kitchen Remodel"
                />
              </div>

              {/* Client */}
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                  Client
                </label>
                <div className="relative">
                  <select
                    value={formData.client_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                    className="w-full h-12 px-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                             text-white focus:outline-none focus:border-[#3a3a3a] focus:bg-[#151515] 
                             transition-all appearance-none pr-12 text-sm"
                  >
                    <option value="">Select a client</option>
                    {clients.map((client: any) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs
                             text-gray-500 border border-[#2a2a2a] rounded hover:bg-[#1a1a1a]
                             hover:text-white hover:border-[#3a3a3a] transition-all"
                  >
                    + New
                  </button>
                </div>
              </div>

              {/* Start Date */}
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                  Start Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full h-12 px-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                             text-white focus:outline-none focus:border-[#3a3a3a] focus:bg-[#151515] 
                             transition-all appearance-none text-sm"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">📅</span>
                </div>
              </div>

              {/* End Date */}
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                  {selectedServicePackage ? 'Estimated End Date' : 'Target End Date'}
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full h-12 px-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                             text-white focus:outline-none focus:border-[#3a3a3a] focus:bg-[#151515] 
                             transition-all appearance-none text-sm"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">📅</span>
                </div>
              </div>

              {/* Budget */}
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                  Budget
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={selectedServicePackage ? formatCurrency(selectedServicePackage.base_price).replace('$', '') : customBudget}
                    onChange={(e) => setCustomBudget(e.target.value)}
                    className="w-full h-12 pl-8 pr-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                             text-white focus:outline-none focus:border-[#3a3a3a] focus:bg-[#151515] 
                             transition-all text-sm"
                    placeholder="0.00"
                    readOnly={!!selectedServicePackage}
                  />
                </div>
              </div>

              {/* Duration (Auto-calculated) */}
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                  Duration
                </label>
                <input
                  type="text"
                  value={formData.end_date ? 
                    `${Math.ceil((new Date(formData.end_date).getTime() - new Date(formData.start_date).getTime()) / (1000 * 60 * 60 * 24))} days` 
                    : ''}
                  className="w-full h-12 px-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg 
                           text-gray-500 cursor-not-allowed text-sm"
                  readOnly
                />
              </div>

              {/* Description */}
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                  Project Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full min-h-[120px] p-4 bg-[#111] border border-[#2a2a2a] rounded-lg 
                           text-white placeholder-gray-500 focus:outline-none focus:border-[#3a3a3a] 
                           focus:bg-[#151515] transition-all resize-none text-sm"
                  placeholder="Describe the project scope and requirements..."
                />
              </div>
            </div>

            {/* Summary Box */}
            {selectedServicePackage && selectedServicePackage.id !== 'custom' && (
              <div className="mt-8 bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
                <h4 className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-4">
                  Project Summary
                </h4>
                
                <div className="space-y-4 divide-y divide-[#1a1a1a]">
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-400">Selected Type</span>
                    <span className="text-sm font-semibold text-white">{selectedCategory?.name}</span>
                  </div>
                  
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-400">Work Pack</span>
                    <span className="text-sm font-semibold text-white">{selectedServicePackage.name}</span>
                  </div>
                  
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-400">Products Included</span>
                    <span className="text-sm font-semibold text-white">{selectedServicePackage.items?.[0]?.count || 0} products</span>
                  </div>
                  
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-400">Total Work Pack Value</span>
                    <span className="text-sm font-semibold text-white">{formatCurrency(selectedServicePackage.base_price)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const handleNext = async () => {
    console.log('=== handleNext called ===');
    console.log('Current step:', currentStep);
    console.log('Form data:', formData);
    console.log('Selected service package:', selectedServicePackage);
    console.log('User:', user?.id);
    
    if (currentStep === 3) {
      console.log('=== STARTING PROJECT CREATION ===');
      // Create project
      setIsCreating(true);
      try {
        console.log('Creating project with data:', {
          formData,
          selectedServicePackage,
          selectedCategory
        });

        // Create the project with correct field names matching the database schema
        const projectData = {
          name: formData.name || 'Untitled Project',
          description: formData.description || '',
          client_id: formData.client_id || null,
          user_id: user?.id,
          organization_id: selectedOrg?.id,
          start_date: formData.start_date,
          end_date: formData.end_date || formData.start_date,
          status: projectStatus,
          budget: selectedServicePackage?.base_price || parseInt(customBudget) || 0,
          category: selectedCategory?.name || 'Custom Project'
        };

        console.log('Attempting to create project with correct schema:', projectData);

        const { data: project, error: projectError } = await supabase
          .from('projects')
          .insert(projectData)
          .select()
          .single();

        if (projectError) {
          console.error('Project creation error:', projectError);
          throw projectError;
        }

        console.log('Project created successfully:', project);

        // Log the activity
        try {
          await ActivityLogService.log({
            organizationId: selectedOrg.id,
            entityType: 'project',
            entityId: project.id,
            action: 'created',
            description: `created project ${project.name}`,
            metadata: {
              client_id: project.client_id,
              client_name: formData.client_id ? clients.find(c => c.id === formData.client_id)?.name : null,
              status: project.status,
              budget: project.budget,
              category: selectedCategory?.name
            }
          });
        } catch (logError) {
          console.error('Failed to log project creation activity:', logError);
        }

        // If project status is 'quoted', create an estimate
        if (projectStatus === 'quoted' && project) {
          // Validate that client is selected for quotes
          if (!formData.client_id) {
            alert('⚠️ A client must be selected to create estimates.\n\nPlease select a client and try again.');
            setIsCreating(false);
            return;
          }
          // Check if we have a service package with items to create estimate from
          if (!selectedServicePackage || selectedServicePackage.id === 'custom' || !selectedServicePackage.items || selectedServicePackage.items.length === 0) {
            console.log('Quote selected but no service package items available - creating empty estimate');
            
            // Import EstimateService for empty estimate
            const { EstimateService } = await import('../../services/EstimateService');
            
            try {
              const estimate = await EstimateService.create({
                organization_id: selectedOrg?.id!,
                user_id: user?.id!,
                client_id: formData.client_id,
                project_id: project.id,
                title: `${project.name} - Estimate`,
                description: formData.description || 'Project estimate ready for customization',
                status: 'draft',
                issue_date: new Date().toISOString().split('T')[0],
                expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                subtotal: 0,
                tax_rate: 0,
                tax_amount: 0,
                total_amount: 0,
                items: []
              });
              
              console.log('✅ Empty estimate created successfully:', estimate);
              
              setTimeout(() => {
                alert(`🎉 Project "${project.name}" created successfully!\n\n📋 Empty estimate "${estimate.title}" has been created and is ready for you to add items.\n\nYou'll be redirected to the estimates page.`);
                navigate('/estimates');
              }, 1000);
              
              onSuccess?.();
              onClose();
              return;
              
            } catch (estimateError: any) {
              console.error('Empty estimate creation error:', estimateError);
              const errorMessage = estimateError?.message || 'Unknown error occurred';
              alert(`⚠️ Project "${project.name}" was created successfully, but estimate creation failed.\n\nError: ${errorMessage}\n\nYou can create an estimate manually from the project page.`);
              navigate(`/projects/${project.id}`);
              onSuccess?.();
              onClose();
              return;
            }
          }
          
          // If we reach here, we have a service package with items - create estimate from service package
          console.log('=== ESTIMATE CREATION FOR QUOTED PROJECT ===');
          console.log('Creating estimate for quoted project:', project.name);
          
          // Import EstimateService dynamically to avoid circular imports
          const { EstimateService } = await import('../../services/EstimateService');
          
          try {
            const estimate = await EstimateService.createFromWorkPack({
              organization_id: selectedOrg?.id!,
              user_id: user?.id!,
              client_id: formData.client_id,
              project_id: project.id,
              title: `${project.name} - Estimate`,
              description: formData.description,
              service_package_id: selectedServicePackage?.id,
              service_package_items: selectedServicePackage?.items || []
            });
            
            console.log('✅ Estimate created successfully:', estimate);
            
            // Success feedback and navigation
            setTimeout(() => {
              alert(`🎉 Project "${project.name}" created successfully!\n\n📋 Estimate "${estimate.title}" has been generated and is ready for review.\n\nYou'll be redirected to the estimates page.`);
              navigate('/estimates');
            }, 1000);
            
            onSuccess?.();
            onClose();
            return; // Exit early to avoid the project navigation
            
          } catch (estimateError: any) {
            console.error('Estimate creation error:', estimateError);
            console.warn('Project created but estimate creation failed');
            
            // Better error messaging
            const errorMessage = estimateError?.message || 'Unknown error occurred';
            alert(`⚠️ Project "${project.name}" was created successfully, but estimate creation failed.\n\nError: ${errorMessage}\n\nYou can create an estimate manually from the project page.`);
            
            // Still navigate to the project since it was created successfully
            navigate(`/projects/${project.id}`);
            onSuccess?.();
            onClose();
            return;
          }
        }
        // If project status is 'lead', just create the project without any additional documents
        else if (projectStatus === 'lead' && project) {
          console.log('=== LEAD PROJECT CREATION ===');
          console.log('Lead project created:', project.name);
          
          // Success feedback for lead
          setTimeout(() => {
            alert(`💡 Lead "${project.name}" created successfully!\n\n📝 Your lead is now being tracked and ready for follow-up.\n\nNext steps:\n• Follow up with client\n• Convert to Quote when ready\n• Add notes and communications\n\nYou'll be redirected to the project page.`);
            navigate(`/projects/${project.id}`);
          }, 1000);
          
          onSuccess?.();
          onClose();
          return;
        }
        // If a service package was selected and it's a planned project (not lead or quote), create invoice with service package items
        else if (projectStatus === 'planned' && project && selectedServicePackage && selectedServicePackage.id !== 'custom') {
          console.log('=== WORK PACK INVOICE CREATION ===');
          console.log('Selected service package:', selectedServicePackage);
          console.log('Work pack has items?', selectedServicePackage.items);
          console.log('Work pack items length:', selectedServicePackage.items?.length);
          
          if (selectedServicePackage.items && selectedServicePackage.items.length > 0) {
            console.log('Creating invoice for service package:', selectedServicePackage.name);
            console.log('Work pack base price:', selectedServicePackage.base_price);
            console.log('Work pack items:', selectedServicePackage.items);
            console.log('Work pack items details:', selectedServicePackage.items.map((item: any) => ({
              id: item.id,
              type: item.item_type,
              line_item: item.line_item,
              product: item.product,
              name: item.line_item?.name || item.product?.name || 'Unknown',
              quantity: item.quantity,
              price: item.price
            })));
            
            // Create invoice with correct field names matching database schema
            const invoiceData = {
              user_id: user?.id,
              client_id: formData.client_id || null,
              project_id: project.id, // Link to project immediately
              status: 'draft' as const,
              issue_date: new Date().toISOString().split('T')[0], // Today's date
              due_date: formData.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
              amount: selectedServicePackage.base_price
            };

            console.log('Creating invoice with data:', invoiceData);

            const { data: invoice, error: invoiceError } = await supabase
              .from('invoices')
              .insert(invoiceData)
              .select()
              .single();

            if (invoiceError) {
              console.error('Invoice creation error:', invoiceError);
              // Don't throw here - project was created successfully
              console.warn('Project created but invoice creation failed');
              alert(`Project created but invoice creation failed: ${invoiceError.message}`);
            } else if (invoice && invoice.id) {
              console.log('Invoice created successfully:', invoice);

              // Create invoice line items from service package items
              const lineItemsData = selectedServicePackage.items.map((item: any, index: number) => ({
                invoice_id: invoice.id,
                description: item.line_item?.name || item.product?.name || `Work Pack Item ${index + 1}`,
                quantity: item.quantity,
                unit_price: item.price,
                total_price: item.price * item.quantity
              }));

              console.log('Creating invoice items:', lineItemsData);

              const { error: lineItemsError } = await supabase
                .from('invoice_items')
                .insert(lineItemsData);

              if (lineItemsError) {
                console.error('Invoice line items creation error:', lineItemsError);
                console.warn('Invoice created but line items creation failed');
                alert(`Invoice created but line items creation failed: ${lineItemsError.message}`);
              } else {
                console.log('Invoice line items created successfully:', lineItemsData.length, 'items');
                console.log('✅ Project created with service package invoice and line items!');
              }
            } else {
              console.error('Invoice creation returned no data');
              alert('Invoice creation returned no data');
            }
          } else {
            console.log('No service package selected or service package has no items');
          }
        } else {
          console.log('No service package selected or service package has no items');
        }

        // Create tasks and expenses from service package for planned projects only
        if (projectStatus === 'planned' && selectedServicePackage && selectedServicePackage.id !== 'custom') {
          console.log('=== TASK AND EXPENSE CREATION FROM SERVICE PACKAGE ===');
          console.log('Service package:', selectedServicePackage.name, 'ID:', selectedServicePackage.id);
          
          // TODO: Update to use service_package_tasks when table is migrated
          const { data: packageTasks, error: tasksError } = await supabase
            .from('work_pack_tasks') // temporary - will be migrated
            .select('*')
            .eq('work_pack_id', selectedServicePackage.id)
            .order('display_order');
            
          if (tasksError) {
            console.error('Error fetching service package tasks:', tasksError);
          } else if (packageTasks && packageTasks.length > 0) {
            console.log(`Found ${packageTasks.length} tasks in service package`);
            
            // Create tasks from service package
            const tasksData = packageTasks.map((task) => ({
              user_id: user?.id,
              project_id: project.id,
              title: task.title,
              description: task.description,
              status: 'pending',
              priority: 'medium', // Default priority
              due_date: task.estimated_hours 
                ? new Date(Date.now() + Math.ceil(task.estimated_hours / 8) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                : null,
              category_id: categoryNameToId[selectedCategory?.name] || null
            }));
            
            console.log('Creating tasks:', tasksData);
            
            const { error: tasksInsertError } = await supabase
              .from('tasks')
              .insert(tasksData);
              
            if (tasksInsertError) {
              console.error('Tasks creation error:', tasksInsertError);
              console.warn('Tasks creation failed but project continues');
            } else {
              console.log(`✅ Created ${tasksData.length} tasks from service package!`);
            }
          } else {
            console.log('No tasks found in service package');
          }
          
          // TODO: Update to use service_package_expenses when table is migrated
          const { data: packageExpenses, error: expensesError } = await supabase
            .from('work_pack_expenses') // temporary - will be migrated
            .select('*')
            .eq('work_pack_id', selectedServicePackage.id)
            .order('display_order');
            
          if (expensesError) {
            console.error('Error fetching service package expenses:', expensesError);
          } else if (packageExpenses && packageExpenses.length > 0) {
            console.log(`Found ${packageExpenses.length} expenses in service package`);
            
            // Create expenses from service package
            const expensesData = packageExpenses.map((expense) => ({
              user_id: user?.id,
              project_id: project.id,
              description: expense.description,
              amount: expense.amount,
              category: expense.category,
              vendor: expense.vendor || 'TBD',
              date: new Date().toISOString().split('T')[0], // Today's date for now
              status: 'pending',
              category_id: categoryNameToId[selectedCategory?.name] || null
            }));
            
            console.log('Creating expenses:', expensesData);
            
            const { error: expensesInsertError } = await supabase
              .from('expenses')
              .insert(expensesData);
              
            if (expensesInsertError) {
              console.error('Expenses creation error:', expensesInsertError);
              console.warn('Expenses creation failed but project continues');
            } else {
              console.log(`✅ Created ${expensesData.length} expenses from service package!`);
            }
          } else {
            console.log('No expenses found in service package');
          }
          
          // TODO: Update to use service_package_documents when table is migrated
          const { data: packageDocuments, error: documentsError } = await supabase
            .from('work_pack_document_templates') // temporary - will be migrated
            .select(`
              *,
              document_template:document_templates(*)
            `)
            .eq('work_pack_id', selectedServicePackage.id)
            .order('display_order');
            
          if (documentsError) {
            console.error('Error fetching service package documents:', documentsError);
          } else if (packageDocuments && packageDocuments.length > 0) {
            console.log(`Found ${packageDocuments.length} document templates in service package`);
            
            // Create project documents from templates
            const documentsData = packageDocuments.map((wpDoc) => ({
              project_id: project.id,
              document_template_id: wpDoc.document_template_id,
              name: wpDoc.document_template.name,
              type: wpDoc.document_template.type,
              content: wpDoc.document_template.content,
              status: 'draft',
              display_order: wpDoc.display_order
            }));
            
            console.log('Creating project documents:', documentsData);
            
            const { error: documentsInsertError } = await supabase
              .from('project_documents')
              .insert(documentsData);
              
            if (documentsInsertError) {
              console.error('Documents creation error:', documentsInsertError);
              console.warn('Documents creation failed but project continues');
            } else {
              console.log(`✅ Created ${documentsData.length} project documents from service package!`);
            }
          } else {
            console.log('No document templates found in service package');
          }
        } else {
          console.log('No service package selected or service package has no items');
        }

        // Success for planned projects (Lead and Quote already handled above)
        if (projectStatus === 'planned') {
          console.log('Project creation completed successfully');
          
          // Verify invoice creation
          const { data: projectInvoices } = await supabase
            .from('invoices')
            .select('*')
            .eq('project_id', project.id);
          
          console.log('=== INVOICE VERIFICATION ===');
          console.log('Invoices found for project:', projectInvoices);
          console.log('Number of invoices:', projectInvoices?.length || 0);
          
          // Success feedback for planned project
          setTimeout(() => {
            const invoiceCount = projectInvoices?.length || 0;
            const message = invoiceCount > 0 
              ? `🏗️ Project "${project.name}" created successfully!\n\n📄 ${invoiceCount} invoice(s) generated and ready for review.\n\n✅ Tasks and expenses have been set up from your service package.\n\nYou'll be redirected to the project page.`
              : `🏗️ Project "${project.name}" created successfully!\n\n📝 Your project is ready to start.\n\nYou'll be redirected to the project page.`;
            
            alert(message);
            navigate(`/projects/${project.id}`);
          }, 1000);
          
          onSuccess?.();
          onClose();
        }
      } catch (error: any) {
        console.error('Error creating project:', error);
        console.error('Error details:', {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          formData,
          selectedServicePackage,
          user: user?.id
        });
        alert(`Failed to create project: ${error?.message || 'Unknown error'}. Check console for details.`);
      } finally {
        setIsCreating(false);
      }
    } else {
      console.log('Moving to next step:', currentStep + 1);
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep === 1.5) {
      // Going from project type selection back to industry selection
      setCurrentStep(1);
      setSelectedProjectType('');
      setSelectedCategory(null);
    } else if (currentStep === 2) {
      // Going from service package selection back to either project type or industry
      const industryCategories = projectCategories.filter(c => c.industry_id === selectedIndustry?.id);
      if (industryCategories.length > 1) {
        setCurrentStep(1.5); // Go back to project type selection
      } else {
        setCurrentStep(1); // Go back to industry selection
      }
      setSelectedServicePackage(null);
    } else if (currentStep === 3) {
      // Going from project details back to service package selection
      setCurrentStep(2);
    }
  };

  // Helper function to get total steps
  const getTotalSteps = () => {
    const industryCategories = projectCategories.filter(c => c.industry_id === selectedIndustry?.id);
    return industryCategories.length > 1 ? 4 : 3;
  };

  // Helper function to get current step number for display
  const getDisplayStep = () => {
    if (currentStep === 1) return 1;
    if (currentStep === 1.5) return 2;
    if (currentStep === 2) return getTotalSteps() === 4 ? 3 : 2;
    if (currentStep === 3) return getTotalSteps();
  };

  // Helper function to get step name
  const getStepName = () => {
    if (currentStep === 1) return 'Industry';
    if (currentStep === 1.5) return 'Project Type';
    if (currentStep === 2) return 'Work Pack';
    if (currentStep === 3) return 'Details';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9998]" onClick={onClose}>
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
        <div 
          className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          
          {/* Header */}
          <div className="px-8 py-6 border-b border-[#1a1a1a] flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white tracking-tight">Create New Project</h2>
              <p className="text-sm text-gray-500 mt-1">
                Step {getDisplayStep()} of {getTotalSteps()} — {getStepName()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-transparent border border-[#2a2a2a] text-gray-500 hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] transition-all duration-200 flex items-center justify-center text-lg"
            >
              ×
            </button>
          </div>

          {/* Progress Bar */}
          <div className="h-1 bg-[#1a1a1a] relative overflow-hidden">
            <div 
              className="absolute left-0 top-0 h-full bg-[#fbbf24] transition-all duration-300"
              style={{ width: `${(getDisplayStep() / getTotalSteps()) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="flex-1 px-8 py-12 overflow-y-auto">
            {renderStepContent()}
          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-[#1a1a1a] flex items-center justify-between">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              Step {getDisplayStep()} of {getTotalSteps()}
            </div>
            <div className="flex gap-3">
              <button
                onClick={currentStep === 1 ? onClose : handleBack}
                className="px-5 py-2.5 bg-transparent border border-[#2a2a2a] text-gray-400 hover:bg-[#1a1a1a] hover:text-white hover:border-[#3a3a3a] rounded-lg text-sm font-medium transition-all duration-200"
              >
                {currentStep === 1 ? 'Cancel' : 'Back'}
              </button>
              <button
                onClick={(e) => {
                  console.log('=== IMMEDIATE BUTTON CLICK DEBUG ===');
                  console.log('Event triggered:', e);
                  console.log('Button disabled?', isCreating);
                  console.log('Current step:', currentStep);
                  console.log('Form data present:', !!formData.name);
                  console.log('Selected service package:', !!selectedServicePackage);
                  console.log('About to call handleNext...');
                  
                  try {
                    handleNext();
                  } catch (error) {
                    console.error('Error in handleNext:', error);
                  }
                }}
                disabled={isCreating || 
                         (currentStep === 2 && !selectedServicePackage) ||
                         (currentStep === 3 && projectStatus === 'quoted' && !formData.client_id)}
                className="px-5 py-2.5 bg-[#fbbf24] text-black rounded-lg text-sm font-semibold hover:bg-[#f59e0b] hover:-translate-y-px transition-all duration-200 disabled:bg-[#2a2a2a] disabled:text-gray-600 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
                style={{
                  pointerEvents: isCreating ? 'none' : 'auto'
                }}
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                    Creating...
                  </>
                ) : currentStep === 3 ? (
                  'Create Project'
                ) : (
                  <>
                    Continue
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
