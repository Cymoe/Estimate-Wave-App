import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Plus,
  Search,
  Zap,
  List
} from 'lucide-react';
import { EstimatesList } from '../components/estimates/EstimatesList';
import { CreateEstimateDrawer } from '../components/estimates/CreateEstimateDrawer';
import { SalesModeView } from '../components/estimates/SalesModeView';
import { EstimateService } from '../services/EstimateService';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { supabase } from '../lib/supabase';

export const Work: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [estimatesCount, setEstimatesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateEstimate, setShowCreateEstimate] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<'list' | 'sales'>('list');

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Function to load estimates count
  const loadEstimatesCount = async () => {
    if (!selectedOrg?.id) {
      setLoading(false);
      return;
    }

    try {
      const { count } = await supabase
        .from('estimates')
        .select('id', { count: 'exact' })
        .eq('organization_id', selectedOrg.id);

      setEstimatesCount(count || 0);
    } catch (error) {
      console.error('Error fetching estimates count:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch estimates count
  useEffect(() => {
    loadEstimatesCount();
  }, [selectedOrg]);

  const handleCreateEstimate = () => {
    setShowCreateEstimate(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Single Unified Card */}
      <div className="bg-transparent border border-[#333333]">
        {/* Header Section */}
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-white" />
              <h1 className="text-xl font-semibold text-white">Estimates</h1>
              <span className="text-sm text-gray-500">({estimatesCount})</span>
            </div>
            
            <div className="flex items-center gap-5">
              {activeTab === 'list' && (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search estimates..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="bg-[#1E1E1E] border border-[#333333] pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699] w-[300px]"
                  />
                </div>
              )}
              
              <button
                onClick={handleCreateEstimate}
                className="bg-white hover:bg-gray-100 text-black px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{activeTab === 'sales' ? 'Quick Quote' : 'Create Estimate'}</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#333333]">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'list'
                  ? 'text-white border-b-2 border-[#336699]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
              All Estimates
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'sales'
                  ? 'text-white border-b-2 border-[#336699]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              Sales Mode
            </button>
          </div>
        </div>

      </div>

      {/* Content Area - Visually connected */}
      <div className="-mt-[1px]">
        <div className="[&>div]:border-t-0">
          {activeTab === 'list' ? (
            <EstimatesList 
              onCreateEstimate={handleCreateEstimate} 
              searchTerm={searchTerm}
              refreshTrigger={refreshTrigger}
            />
          ) : (
            <SalesModeView onCreateEstimate={handleCreateEstimate} />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateEstimateDrawer
        isOpen={showCreateEstimate}
        onClose={() => setShowCreateEstimate(false)}
        onSave={async (data) => {
          try {
            if (!user) {
              throw new Error('User not authenticated');
            }

            console.log('Creating estimate with data:', data);
            console.log('Selected org:', selectedOrg);
            console.log('User:', user);

            // Calculate subtotal and tax
            const subtotal = data.total_amount;
            const tax_rate = 0; // Can be configured later
            const tax_amount = subtotal * (tax_rate / 100);
            const total_with_tax = subtotal + tax_amount;

            // Validate required fields
            if (!data.issue_date) {
              throw new Error('Issue date is required');
            }
            
            if (!selectedOrg.id) {
              throw new Error('No organization selected');
            }

            const estimateData = {
              user_id: user.id,
              organization_id: selectedOrg.id,
              client_id: data.client_id || null,
              title: data.title || '',
              description: data.description || '',
              subtotal: subtotal,
              tax_rate: tax_rate,
              tax_amount: tax_amount,
              total_amount: total_with_tax,
              status: data.status as any,
              issue_date: data.issue_date,
              expiry_date: data.valid_until || null,
              terms: data.terms || null,
              notes: data.notes || null,
              items: (data.items || []).map((item: any, index: number) => ({
                description: item.description || item.product_name || '',
                quantity: item.quantity || 1,
                unit_price: item.price || item.unit_price || 0,
                total_price: (item.quantity || 1) * (item.price || item.unit_price || 0),
                display_order: index
              }))
            };

            console.log('Final estimate data being sent:', estimateData);

            // Create the estimate with items
            const estimate = await EstimateService.create(estimateData);

            console.log('✅ Estimate created successfully:', estimate);
            console.log('🚀 Navigating to estimate detail page:', `/estimates/${estimate.id}`);

            setShowCreateEstimate(false);
            
            // Navigate to the estimate detail page for immediate review
            navigate(`/estimates/${estimate.id}`);
          } catch (error) {
            console.error('Error creating estimate:', error);
            console.error('Error details:', {
              message: error instanceof Error ? error.message : 'No message',
              stack: error instanceof Error ? error.stack : 'No stack',
              raw: error
            });
            
            // Try to extract more useful error information
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else if (error && typeof error === 'object') {
              // Check for Supabase error format
              if ('message' in error && error.message) {
                errorMessage = error.message as string;
              } else if ('error' in error && error.error) {
                errorMessage = error.error as string;
              } else if ('details' in error && error.details) {
                errorMessage = error.details as string;
              } else {
                errorMessage = JSON.stringify(error);
              }
            }
            
            alert(`Failed to create estimate: ${errorMessage}`);
            throw error; // Re-throw so the drawer doesn't close
          }
        }}
      />
    </div>
  );
};