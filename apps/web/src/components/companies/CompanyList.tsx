import React, { useState, useEffect, useContext } from 'react';
import { 
  Building, Users, Plus, Search, Edit2, Trash2, 
  List, LayoutGrid, Rows3, ExternalLink, MapPin
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LayoutContext, OrganizationContext } from '../layouts/DashboardLayout';
import { CompanyService, Company, INDUSTRIES } from '../../services/CompanyService';
import { formatCurrency } from '../../utils/format';
import { TableSkeleton } from '../skeletons/TableSkeleton';
import { CardSkeleton } from '../skeletons/CardSkeleton';

interface CompanyListProps {
  showAddModal?: boolean;
  setShowAddModal?: (show: boolean) => void;
  hideAddButton?: boolean;
}

export const CompanyList: React.FC<CompanyListProps> = ({ 
  showAddModal: externalShowAddModal, 
  setShowAddModal: externalSetShowAddModal, 
  hideAddButton = false 
}) => {
  const { user } = useAuth();
  const { isConstrained } = useContext(LayoutContext);
  const { selectedOrg } = useContext(OrganizationContext);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'condensed' | 'cards'>('list');
  const [internalShowNewModal, setInternalShowNewModal] = useState(false);
  
  // Use external modal state if provided, otherwise use internal state
  const showNewModal = externalShowAddModal !== undefined ? externalShowAddModal : internalShowNewModal;
  const setShowNewModal = externalSetShowAddModal || setInternalShowNewModal;

  // Load companies data from database
  useEffect(() => {
    if (selectedOrg?.id) {
      loadCompanies();
    } else {
      setCompanies([]);
      setLoading(false);
    }
  }, [selectedOrg?.id]);

  const loadCompanies = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      setLoading(true);
      const data = await CompanyService.getCompanies(selectedOrg.id);
      setCompanies(data);
    } catch (error) {
      console.error('Error loading companies:', error);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (company.industry || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIndustry = selectedIndustry === 'all' || company.industry === selectedIndustry;
    
    return matchesSearch && matchesIndustry;
  });

  const getIndustryStats = () => {
    const stats: Record<string, number> = {};
    companies.forEach(company => {
      const industry = company.industry || 'Other';
      stats[industry] = (stats[industry] || 0) + 1;
    });
    return stats;
  };

  // Calculate metrics
  const totalClients = companies.reduce((sum, c) => sum + (c.clientCount || 0), 0);
  const avgClientsPerCompany = companies.length > 0 ? totalClients / companies.length : 0;
  const industriesCount = Object.keys(getIndustryStats()).length;

  return (
    <div>
      {loading ? (
        <div className="pb-8">
          <div className="bg-transparent border border-[#333333] rounded-[4px]">
            {viewMode === 'list' || viewMode === 'condensed' ? (
              <TableSkeleton rows={5} columns={4} />
            ) : (
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            )}
          </div>
        </div>
      ) : companies.length === 0 ? (
        // Onboarding/Empty State
        <div className="max-w-4xl mx-auto p-8">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[#336699]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building className="w-8 h-8 text-[#336699]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Company Management</h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-8">
              Organize your clients by company to better manage business relationships and multiple contacts.
            </p>
            
            <button 
              onClick={() => setShowNewModal(true)}
              className="px-6 py-3 bg-white text-black rounded-[8px] font-medium hover:bg-gray-100 transition-colors"
            >
              ADD FIRST COMPANY
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Companies Section */}
          <div className="pb-8">
            {/* Unified Container */}
            <div className="bg-transparent border border-[#333333] rounded-[4px]">
              {/* Stats Section */}
              <div className={`${isConstrained ? 'px-4 py-3' : 'px-6 py-4'} border-b border-[#333333]/50 rounded-t-[4px]`}>
                <div className="grid grid-cols-4 gap-6">
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">COMPANIES</div>
                    <div className="text-lg font-semibold mt-1">{companies.length}</div>
                    <div className="text-xs text-gray-500">organizations</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">TOTAL CLIENTS</div>
                    <div className="text-lg font-semibold text-blue-400 mt-1">{totalClients}</div>
                    <div className="text-xs text-gray-500">across companies</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">AVG CONTACTS</div>
                    <div className="text-lg font-semibold text-yellow-400 mt-1">{avgClientsPerCompany.toFixed(1)}</div>
                    <div className="text-xs text-gray-500">per company</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">INDUSTRIES</div>
                    <div className="text-lg font-semibold mt-1">{industriesCount}</div>
                    <div className="text-xs text-gray-500">sectors served</div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-[#1E1E1E]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Company</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Industry</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Contact Info</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Clients</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#333333]">
                      {filteredCompanies.map((company) => (
                        <tr key={company.id} className="hover:bg-[#1E1E1E] transition-colors cursor-pointer">
                          <td className="px-6 py-4">
                            <div>
                              <div className="text-sm font-medium text-white">{company.name}</div>
                              <div className="text-xs text-gray-400">{company.billing_city}, {company.billing_state}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-[#5b8fc7] font-medium">{company.industry || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-300">{company.main_phone}</div>
                            <div className="text-xs text-blue-400">{company.main_email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-blue-400 flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {company.clientCount || 0}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredCompanies.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-gray-400">No companies match your filters</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}; 