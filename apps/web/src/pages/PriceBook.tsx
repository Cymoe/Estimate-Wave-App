import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ShoppingCart,
  List,
  Plus,
  Search,
  Layers,
} from 'lucide-react';
import { PriceBook as ItemsPage } from '../components/price-book/PriceBook';
import CostCodesPage from './CostCodesPage';
// import { LineItemService } from '../services/LineItemService'; // Old Supabase
// import { CostCodeService } from '../services/CostCodeService'; // Old Supabase
import { MongoLineItemService as LineItemService } from '../services/MongoLineItemService'; // MongoDB version
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
// import { supabase } from '../lib/supabase'; // Removed
import { costCodesAPI } from '../lib/api';

type TabType = 'items' | 'cost-codes';

interface PriceBookStats {
  itemsCount: number;
  costCodesCount: number;
}

export const PriceBook: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const itemsPageRef = useRef<any>(null);
  const costCodesPageRef = useRef<any>(null);
  const getTabFromPath = (path: string): TabType => {
    if (path.includes('/price-book/items')) {
      return 'items';
    } else if (path.includes('/price-book/cost-codes')) {
      return 'cost-codes';
    } else {
      return 'items';
    }
  };

  const [activeTab, setActiveTab] = useState<TabType>(() => getTabFromPath(location.pathname));
  const [stats, setStats] = useState<PriceBookStats>({
    itemsCount: 0,
    costCodesCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [triggerAddItem, setTriggerAddItem] = useState(0);
  const [triggerAddCostCode, setTriggerAddCostCode] = useState(0);
  const [isAddingItem, setIsAddingItem] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Set active tab based on URL path
  useEffect(() => {
    const newTab = getTabFromPath(location.pathname);
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [location.pathname, activeTab]);

  // Update URL when tab changes
  const handleTabChange = (tab: TabType) => {
    if (tab === activeTab) return; // Don't navigate if already on this tab
    
    // Reset all trigger states when changing tabs
    setTriggerAddItem(0);
    setTriggerAddCostCode(0);
    
    setActiveTab(tab);
    const basePath = '/price-book';
    switch (tab) {
      case 'items':
        navigate(`${basePath}/items`);
        break;
      case 'cost-codes':
        navigate(`${basePath}/cost-codes`);
        break;
      default:
        navigate(basePath);
        break;
    }
  };

  // Load stats
  const loadStats = async () => {
    if (!selectedOrg?.id) {
      setLoading(false);
      return;
    }
    
    try {
      const [lineItemsData, costCodesData] = await Promise.all([
        LineItemService.list(selectedOrg.id),
        costCodesAPI.list({ isActive: true })
      ]);

      setStats({
        itemsCount: lineItemsData?.length || 0,
        costCodesCount: costCodesData?.length || 0
      });
    } catch (error) {
      console.error('Error loading price book stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [selectedOrg?.id, refreshTrigger]);

  const getAddButtonText = () => {
    switch (activeTab) {
      case 'cost-codes': return 'Add Code';
      default: return 'Add Item';
    }
  };

  const handleAddClick = () => {
    setIsAddingItem(true);
    
    // Small delay to show loading state
    setTimeout(() => {
      switch (activeTab) {
        case 'cost-codes':
          // Trigger the add cost code modal in CostCodesPage
          setTriggerAddCostCode(prev => prev + 1);
          break;
        case 'items':
          // Trigger the add item modal in ItemsPage
          setTriggerAddItem(prev => prev + 1);
          break;
        default:
          break;
      }
      setIsAddingItem(false);
    }, 100);
  };

  // Render items tab without wrapper for full-screen layout
  if (activeTab === 'items') {
    return <ItemsPage key="items-tab" triggerAddItem={triggerAddItem} />;
  }

  return (
    <div className="max-w-[1600px] mx-auto p-8">
      {/* Single Unified Card */}
      <div className="bg-transparent border border-[#333333]">
        {/* Tabs Navigation */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex">
              <button
                onClick={() => handleTabChange('items')}
                className={`px-6 py-4 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
                  activeTab === 'items'
                    ? 'text-white after:bg-[#336699] bg-[#1A1A1A]'
                    : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699] hover:bg-[#1A1A1A]/50'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                Items
                <span className="text-xs text-gray-500 ml-1">
                  {loading ? (
                    <span className="inline-block w-4 h-4 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    `(${stats.itemsCount})`
                  )}
                </span>
              </button>
              <button
                onClick={() => handleTabChange('cost-codes')}
                className={`px-6 py-4 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors ${
                  activeTab === 'cost-codes'
                    ? 'text-white after:bg-[#336699] bg-[#1A1A1A]'
                    : 'text-gray-500 hover:text-gray-400 after:bg-transparent hover:after:bg-[#336699] hover:bg-[#1A1A1A]/50'
                }`}
              >
                <List className="w-4 h-4" />
                Cost Codes
                <span className="text-xs text-gray-500 ml-1">
                  {loading ? (
                    <span className="inline-block w-4 h-4 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    `(${stats.costCodesCount})`
                  )}
                </span>
              </button>
            </div>
            
            {/* Add button for cost-codes tab */}
            {activeTab === 'cost-codes' && (
              <button
                onClick={handleAddClick}
                disabled={isAddingItem}
                className="bg-white hover:bg-gray-100 text-black px-5 py-2 text-sm font-medium transition-colors flex items-center gap-2 mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAddingItem ? (
                  <>
                    <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Add Code</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area for Cost Codes - with wrapper */}
      <div className="-mt-[1px]">
        <div className="[&>div]:border-t-0 [&>div]:pt-0 [&>div>div]:border-t-0">
          <CostCodesPage 
            key="cost-codes-tab" 
            triggerAddCostCode={triggerAddCostCode}
          />
        </div>
      </div>
    </div>
  );
};