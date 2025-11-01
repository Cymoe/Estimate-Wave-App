import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Globe, 
  Edit3, 
  MoreVertical,
  Star,
  Shield,
  Award,
  Clock,
  Phone,
  Mail,
  MapPin,
  Heart,
  CheckCircle,
  TrendingUp,
  Calendar,
  ChevronDown,
  DollarSign,
  Users,
  HardHat,
  Plus
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { SubcontractorService, type Subcontractor } from '../services/subcontractorService';
import { formatCurrency } from '../utils/format';

export const SubcontractorDetailPage: React.FC = () => {
  const { subcontractorId } = useParams<{ subcontractorId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [subcontractor, setSubcontractor] = useState<Subcontractor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Load subcontractor data
  useEffect(() => {
    const loadSubcontractor = async () => {
      if (!subcontractorId) {
        setError('Subcontractor ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const data = await SubcontractorService.getSubcontractor(subcontractorId);
        if (!data) {
          setError('Subcontractor not found');
          setLoading(false);
          return;
        }

        // Load stats
        const stats = await SubcontractorService.getSubcontractorStats(subcontractorId);
        const subcontractorWithStats = {
          ...data,
          totalValue: stats.totalValue,
          projectCount: stats.projectCount,
          lastProjectDate: stats.lastProjectDate
        };

        setSubcontractor(subcontractorWithStats);
      } catch (error) {
        console.error('Error loading subcontractor:', error);
        setError('Failed to load subcontractor details');
      } finally {
        setLoading(false);
      }
    };

    loadSubcontractor();
  }, [subcontractorId]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      // Could add toast notification here
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const getStatusColor = (isPreferred: boolean) => {
    return isPreferred 
      ? 'bg-yellow-900/20 text-yellow-400 border-yellow-900'
      : 'bg-gray-900/20 text-gray-400 border-gray-900';
  };

  const handleBackClick = () => {
    navigate('/team');
  };

  // Mock recent projects data
  const recentProjects = [
    {
      id: "1",
      name: "Kitchen Renovation - Oak Street",
      status: "active",
      value: 8500,
      progress: 75,
      startDate: "Feb 15, 2025",
    },
    {
      id: "2", 
      name: "Bathroom Remodel - Pine Avenue",
      status: "completed",
      value: 4200,
      progress: 100,
      startDate: "Jan 8, 2025",
    },
    {
      id: "3",
      name: "Living Room Flooring - Main St", 
      status: "planned",
      value: 6800,
      progress: 0,
      startDate: "Mar 10, 2025",
    },
  ];

  // Mock recent expenses data
  const recentExpenses = [
    {
      id: "1",
      description: "Materials for Oak Street Kitchen",
      amount: 2400,
      date: "Feb 20, 2025",
      category: "Materials"
    },
    {
      id: "2",
      description: "Labor - Pine Avenue Project",
      amount: 3200,
      date: "Feb 18, 2025", 
      category: "Labor"
    }
  ];

  const getProjectStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-900/20 text-green-400 border-green-900';
      case 'completed':
        return 'bg-blue-900/20 text-blue-400 border-blue-900';
      case 'planned':
        return 'bg-purple-900/20 text-purple-400 border-purple-900';
      default:
        return 'bg-gray-900/20 text-gray-400 border-gray-900';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#336699] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading subcontractor data...</p>
        </div>
      </div>
    );
  }

  if (error || !subcontractor) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#333333] rounded-[4px] flex items-center justify-center mx-auto mb-4">
            <HardHat className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-white font-medium text-xl mb-2">Subcontractor Not Found</h2>
          <p className="text-gray-400 mb-6">The requested subcontractor could not be located</p>
          <button
            onClick={handleBackClick}
            className="bg-[#336699] hover:bg-[#336699]/80 text-white px-6 py-3 rounded-[4px] text-sm font-medium transition-colors"
          >
            Back to People
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
              onClick={handleBackClick}
              className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white truncate mb-1">{subcontractor.name}</h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select 
                    value={subcontractor.is_preferred ? 'preferred' : 'active'} 
                    className={`appearance-none bg-transparent border rounded px-3 py-1 text-xs font-medium uppercase tracking-wide cursor-pointer ${getStatusColor(subcontractor.is_preferred).replace('bg-', 'border-').replace('/20', '')}`}
                  >
                    <option value="preferred">PREFERRED</option>
                    <option value="active">ACTIVE</option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
                <span className="text-gray-400">{subcontractor.company_name}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button 
              onClick={handleShare}
              className="border border-[#333333] bg-[#1E1E1E] hover:bg-[#333333] text-gray-300 px-4 py-2 rounded text-sm transition-colors flex items-center gap-2"
            >
              <Globe className="h-4 w-4" />
              Share
            </button>
            <button className="border border-[#333333] bg-[#1E1E1E] hover:bg-[#333333] text-gray-300 px-4 py-2 rounded text-sm transition-colors flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Edit
            </button>
            <button className="text-gray-400 hover:text-white p-2 hover:bg-[#333333] rounded transition-colors">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b border-[#333333]">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'projects', label: 'Projects', count: recentProjects.length },
            { key: 'expenses', label: 'Expenses', count: recentExpenses.length },
            { key: 'certifications', label: 'Certifications' }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-[#336699] text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {label}
              {count !== undefined && (
                <span className="ml-2 text-xs text-gray-500">{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-4 min-w-0">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 min-w-0">
            {/* Left Column */}
            <div className="xl:col-span-2 space-y-6 min-w-0">
              {/* Performance Summary */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                  Performance Summary
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <TrendingUp className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Total Value</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-green-400 truncate">{formatCurrency(subcontractor.totalValue || 0)}</div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <Calendar className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Projects</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-white truncate">{subcontractor.projectCount || 0}</div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <Clock className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Hourly Rate</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-yellow-400 truncate">${subcontractor.hourly_rate || 0}/hr</div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <Star className="h-4 w-4 text-purple-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Rating</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-purple-400 truncate">{subcontractor.rating || 0}/5</div>
                  </div>
                </div>
              </div>

              {/* Recent Projects */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">Recent Projects</h3>
                  <button className="text-[#336699] text-sm hover:text-[#336699]/80 transition-colors">
                    View All Projects
                  </button>
                </div>
                <div className="space-y-4">
                  {recentProjects.map((project) => (
                    <div
                      key={project.id}
                      className="p-3 bg-[#1E1E1E]/30 rounded border border-[#333333]/50 hover:bg-[#1E1E1E]/50 transition-colors overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                          <div className="font-medium text-white text-sm truncate flex-1 min-w-0">{project.name}</div>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0 whitespace-nowrap ${getProjectStatusColor(project.status)}`}>
                            {project.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-white flex-shrink-0 whitespace-nowrap">${project.value.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="text-xs text-gray-400 min-w-0 flex-1 truncate">Started {project.startDate}</div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="text-xs text-gray-400 whitespace-nowrap">{project.progress}%</div>
                          <div className="w-12 h-1 bg-[#333333] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#336699] rounded-full transition-all duration-300"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Expenses */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">
                    Recent Expenses
                  </h3>
                  <button className="bg-[#336699] hover:bg-[#336699]/80 text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
                <div className="space-y-4">
                  {recentExpenses.map((expense) => (
                    <div key={expense.id} className="p-4 bg-[#1E1E1E]/30 rounded border border-[#333333]/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white mb-1 break-words">{expense.description}</div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span>{expense.date}</span>
                            <span>{expense.category}</span>
                          </div>
                        </div>
                        <div className="text-lg font-bold text-green-400 flex-shrink-0">
                          {formatCurrency(expense.amount)}
                        </div>
                      </div>
                    </div>
                  ))}
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
                <div className="space-y-4">
                  {subcontractor.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400">Phone</div>
                        <div className="text-sm text-white break-all">{subcontractor.phone}</div>
                      </div>
                    </div>
                  )}
                  {subcontractor.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400">Email</div>
                        <div className="text-sm text-white break-all">{subcontractor.email}</div>
                      </div>
                    </div>
                  )}
                  {(subcontractor.address || subcontractor.city || subcontractor.state) && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400">Address</div>
                        <div className="text-sm text-white">
                          {subcontractor.address && <div className="break-all">{subcontractor.address}</div>}
                          {(subcontractor.city || subcontractor.state || subcontractor.zip) && (
                            <div className="break-all">
                              {[subcontractor.city, subcontractor.state, subcontractor.zip].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Trade Information */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                  Trade Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-400">Trade Category</div>
                    <div className="text-sm text-white">{subcontractor.trade_category}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Specialty</div>
                    <div className="text-sm text-white">{subcontractor.specialty}</div>
                  </div>
                  {subcontractor.license_number && (
                    <div>
                      <div className="text-xs text-gray-400">License Number</div>
                      <div className="text-sm text-white break-all">{subcontractor.license_number}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                  Quick Stats
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Rating</span>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < (subcontractor.rating || 0) 
                              ? 'text-yellow-400 fill-current' 
                              : 'text-gray-600'
                          }`}
                        />
                      ))}
                      <span className="text-sm text-white ml-1">({subcontractor.rating || 0})</span>
                    </div>
                  </div>
                  {subcontractor.is_preferred && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Status</span>
                      <div className="flex items-center gap-1">
                        <Heart className="w-3 h-3 text-yellow-400 fill-current" />
                        <span className="text-sm text-yellow-400">Preferred</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {subcontractor.notes && (
                <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">Notes</h3>
                  <p className="text-sm text-gray-300 break-words">{subcontractor.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Project History</h3>
            <p className="text-gray-400">Project history will be displayed here when project tracking is implemented.</p>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Expense History</h3>
            <p className="text-gray-400">Expense history will be displayed here when expense tracking is implemented.</p>
          </div>
        )}

        {activeTab === 'certifications' && (
          <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Certifications & Credentials</h3>
            <div className="space-y-4">
              {subcontractor.license_number && (
                <div className="flex items-center gap-3 p-4 bg-[#1E1E1E]/30 rounded border border-[#333333]/50">
                  <Shield className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-white font-medium">License</p>
                    <p className="text-sm text-gray-400">{subcontractor.license_number}</p>
                  </div>
                </div>
              )}
              {subcontractor.certification_info && (
                <div className="flex items-center gap-3 p-4 bg-[#1E1E1E]/30 rounded border border-[#333333]/50">
                  <Award className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-white font-medium">Certifications</p>
                    <p className="text-sm text-gray-400">{subcontractor.certification_info}</p>
                  </div>
                </div>
              )}
              {subcontractor.insurance_info && (
                <div className="flex items-center gap-3 p-4 bg-[#1E1E1E]/30 rounded border border-[#333333]/50">
                  <CheckCircle className="w-5 h-5 text-yellow-400" />
                  <div>
                    <p className="text-white font-medium">Insurance</p>
                    <p className="text-sm text-gray-400">{subcontractor.insurance_info}</p>
                  </div>
                </div>
              )}
              {!subcontractor.license_number && !subcontractor.certification_info && !subcontractor.insurance_info && (
                <p className="text-gray-400">No certifications or credentials on file.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 