import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Save, Star, Phone, Mail, Globe, MapPin, 
  Shield, CheckCircle, Edit2, DollarSign, 
  Briefcase, TrendingUp, FileText, Users,
  Building, Copy, ExternalLink, Target, Edit3,
  MoreVertical, ChevronDown
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { VendorService, Vendor, VendorFormData, VENDOR_CATEGORIES } from '../services/vendorService';
import { formatCurrency } from '../utils/format';
import { VendorContactsList } from '../components/vendors/VendorContactsList';

export const VendorDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'projects' | 'expenses'>('overview');

  const [formData, setFormData] = useState<VendorFormData>({
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    category: VENDOR_CATEGORIES[0],
    specialty: '',
    notes: '',
    rating: undefined,
    is_preferred: false,
    license_number: '',
    insurance_info: '',
    tax_id: '',
    payment_terms: 'Net 30'
  });

  useEffect(() => {
    if (id && user && selectedOrg?.id) {
      loadVendorData();
    }
  }, [id, user, selectedOrg?.id]);

  const loadVendorData = async () => {
    if (!id || !user || !selectedOrg?.id) return;
    
    try {
      setLoading(true);
      
      const vendors = await VendorService.getVendors(selectedOrg.id);
      const foundVendor = vendors.find(v => v.id === id);
      
      if (!foundVendor) {
        navigate('/vendors', { replace: true });
        return;
      }
      
      setVendor(foundVendor);
      setFormData({
        name: foundVendor.name,
        contact_name: foundVendor.contact_name || '',
        phone: foundVendor.phone || '',
        email: foundVendor.email || '',
        website: foundVendor.website || '',
        address: foundVendor.address || '',
        category: foundVendor.category,
        specialty: foundVendor.specialty || '',
        notes: foundVendor.notes || '',
        rating: foundVendor.rating,
        is_preferred: foundVendor.is_preferred,
        license_number: foundVendor.license_number || '',
        insurance_info: foundVendor.insurance_info || '',
        tax_id: foundVendor.tax_id || '',
        payment_terms: foundVendor.payment_terms || 'Net 30'
      });

      try {
        const vendorStats = await VendorService.getVendorStats(foundVendor.id);
        setStats(vendorStats);
      } catch (error) {
        console.error('Error loading vendor stats:', error);
        setStats({ totalSpent: 0, projectCount: 0, expenseCount: 0, averageExpense: 0 });
      }
      
    } catch (error) {
      console.error('Error loading vendor:', error);
      navigate('/vendors', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !vendor) return;

    setSaving(true);
    try {
      await VendorService.updateVendor(vendor.id, formData);
      await loadVendorData();
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating vendor:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#336699] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading vendor data...</p>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#333333] rounded flex items-center justify-center mx-auto mb-4">
            <Building className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-white font-medium text-xl mb-2">Vendor Not Found</h2>
          <p className="text-gray-400 mb-6">The requested vendor could not be located</p>
          <button 
            onClick={() => navigate('/vendors')}
            className="bg-[#336699] hover:bg-[#336699]/80 text-white px-6 py-3 rounded text-sm font-medium transition-colors"
          >
            Back to Vendors
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-gray-300 overflow-x-hidden">
      {/* Header */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between min-w-0 mb-6">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <button
              onClick={() => navigate('/vendors')}
              className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white truncate mb-1">{vendor.name}</h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select 
                    value={vendor.category} 
                    className="appearance-none bg-transparent border border-green-400 text-green-400 rounded px-3 py-1 text-xs font-medium cursor-pointer"
                  >
                    {VENDOR_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-green-400" />
                </div>
                {vendor.is_preferred && (
                  <div className="flex items-center gap-1 bg-yellow-900/20 text-yellow-400 border border-yellow-900 px-2 py-1 rounded text-xs font-medium">
                    <Star className="w-3 h-3 fill-current" />
                    Preferred
                  </div>
                )}
                {vendor.specialty && (
                  <span className="text-gray-400">{vendor.specialty}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="border border-[#333333] bg-[#1E1E1E] hover:bg-[#333333] text-gray-300 px-4 py-2 rounded text-sm transition-colors flex items-center gap-2"
            >
              <Globe className="h-4 w-4" />
              Share
            </button>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="border border-[#333333] bg-[#1E1E1E] hover:bg-[#333333] text-gray-300 px-4 py-2 rounded text-sm transition-colors flex items-center gap-2"
              >
                <Edit3 className="h-4 w-4" />
                Edit
              </button>
            )}
            <button className="text-gray-400 hover:text-white p-2 hover:bg-[#333333] rounded transition-colors">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {!isEditing && (
          <div className="flex gap-8 border-b border-[#333333]">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'contacts', label: 'Contacts' },
              { key: 'projects', label: 'Projects' },
              { key: 'expenses', label: 'Expenses' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === key
                    ? 'border-[#336699] text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-4 min-w-0">
        {isEditing ? (
          /* Edit Mode */
          <div className="max-w-4xl mx-auto">
            <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6">
              <h2 className="text-lg font-medium text-white mb-6">
                Edit Vendor Information
              </h2>
              
              <form onSubmit={handleUpdate} className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm text-gray-400 mb-2">
                        Company Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 bg-[#333333] text-white rounded border border-[#555555] focus:outline-none focus:border-[#336699]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Category *
                      </label>
                      <select
                        required
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-3 py-2 bg-[#333333] text-white rounded border border-[#555555] focus:outline-none focus:border-[#336699]"
                      >
                        {VENDOR_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Specialty
                      </label>
                      <input
                        type="text"
                        value={formData.specialty || ''}
                        onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                        className="w-full px-3 py-2 bg-[#333333] text-white rounded border border-[#555555] focus:outline-none focus:border-[#336699]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#333333]">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-white border border-[#333333] rounded hover:bg-[#333333] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !formData.name}
                    className="px-4 py-2 bg-[#336699] text-white rounded hover:bg-[#336699]/80 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* View Mode */
          <div className="space-y-8">
            {activeTab === 'overview' ? (
              <div className="space-y-6">
                {/* Performance Stats */}
                {stats && (
                  <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                      Vendor Summary
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 mb-2">
                          <DollarSign className="h-4 w-4 text-green-400 flex-shrink-0" />
                          <div className="text-xs text-gray-400 truncate">Total Spent</div>
                        </div>
                        <div className="text-base md:text-lg font-bold text-green-400 truncate">{formatCurrency(stats.totalSpent)}</div>
                      </div>
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 mb-2">
                          <Briefcase className="h-4 w-4 text-blue-400 flex-shrink-0" />
                          <div className="text-xs text-gray-400 truncate">Projects</div>
                        </div>
                        <div className="text-base md:text-lg font-bold text-white truncate">{stats.projectCount}</div>
                      </div>
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 mb-2">
                          <FileText className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                          <div className="text-xs text-gray-400 truncate">Expenses</div>
                        </div>
                        <div className="text-base md:text-lg font-bold text-yellow-400 truncate">{stats.expenseCount}</div>
                      </div>
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 mb-2">
                          <TrendingUp className="h-4 w-4 text-purple-400 flex-shrink-0" />
                          <div className="text-xs text-gray-400 truncate">Avg Order</div>
                        </div>
                        <div className="text-base md:text-lg font-bold text-purple-400 truncate">{formatCurrency(stats.averageExpense)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Vendor Details Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 min-w-0">
                  {/* Left Column */}
                  <div className="xl:col-span-2 space-y-6 min-w-0">
                    {/* Business Credentials */}
                    <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                      <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                        Business Information
                      </h3>
                      <div className="space-y-4">
                        {vendor.rating && (
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Rating</div>
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-4 h-4 ${
                                      i < vendor.rating!
                                        ? 'text-[#F9D71C] fill-current'
                                        : 'text-gray-600'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-white text-sm">{vendor.rating}.0</span>
                            </div>
                          </div>
                        )}
                        
                        {vendor.license_number && (
                          <div>
                            <div className="text-xs text-gray-400 mb-1">License Number</div>
                            <div className="text-white text-sm">{vendor.license_number}</div>
                          </div>
                        )}
                        
                        {vendor.insurance_info && (
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Insurance</div>
                            <div className="text-white text-sm">{vendor.insurance_info}</div>
                          </div>
                        )}
                        
                        {vendor.payment_terms && (
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Payment Terms</div>
                            <div className="text-white text-sm">{vendor.payment_terms}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6 min-w-0">
                    {/* Contact Information */}
                    <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                      <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                        Contact Information
                      </h3>
                      <div className="space-y-3 overflow-hidden">
                        {vendor.contact_name && (
                          <div className="flex items-start gap-2 min-w-0">
                            <Users className="h-4 w-4 text-[#336699] flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="text-xs text-gray-400 mb-1">Primary Contact</div>
                              <div className="text-white text-xs truncate overflow-hidden">{vendor.contact_name}</div>
                            </div>
                          </div>
                        )}
                        
                        {vendor.phone && (
                          <div className="flex items-start gap-2 min-w-0">
                            <Phone className="h-4 w-4 text-[#336699] flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="text-xs text-gray-400 mb-1">Phone</div>
                              <div className="text-white text-xs truncate overflow-hidden">{vendor.phone}</div>
                            </div>
                          </div>
                        )}
                        
                        {vendor.email && (
                          <div className="flex items-start gap-2 min-w-0">
                            <Mail className="h-4 w-4 text-[#336699] flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="text-xs text-gray-400 mb-1">Email</div>
                              <div className="text-[#336699] text-xs truncate overflow-hidden">{vendor.email}</div>
                            </div>
                          </div>
                        )}
                        
                        {vendor.address && (
                          <div className="flex items-start gap-2 min-w-0">
                            <MapPin className="h-4 w-4 text-[#336699] flex-shrink-0 mt-1" />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="text-xs text-gray-400 mb-1">Address</div>
                              <div className="text-white text-xs leading-relaxed overflow-hidden">
                                <div className="truncate">{vendor.address}</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                {vendor.notes && (
                  <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                    <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                      Notes
                    </h3>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{vendor.notes}</div>
                  </div>
                )}
              </div>
            ) : activeTab === 'contacts' ? (
              <VendorContactsList 
                vendorId={vendor.id} 
                vendorName={vendor.name}
              />
            ) : (
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-8 text-center">
                <div className="text-gray-400">Tab content coming soon</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}; 