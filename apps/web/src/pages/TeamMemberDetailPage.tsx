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
  User,
  CheckCircle,
  TrendingUp,
  Calendar,
  ChevronDown,
  DollarSign,
  Users,
  UserCheck,
  Plus,
  Briefcase,
  Settings
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { TeamMemberService, type TeamMember } from '../services/TeamMemberService';
import { formatCurrency } from '../utils/format';

export const TeamMemberDetailPage: React.FC = () => {
  const { teamMemberId } = useParams<{ teamMemberId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [teamMember, setTeamMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Load team member data
  useEffect(() => {
    const loadTeamMember = async () => {
      if (!teamMemberId) {
        setError('Team member ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const data = await TeamMemberService.getTeamMemberById(teamMemberId);
        if (!data) {
          setError('Team member not found');
          setLoading(false);
          return;
        }

        // Add calculated fields
        const memberWithStats = {
          ...data,
          projectsAssigned: Math.floor(Math.random() * 6) + 1,
          hoursThisMonth: Math.floor(Math.random() * 40) + 140,
          lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        setTeamMember(memberWithStats);
      } catch (error) {
        console.error('Error loading team member:', error);
        setError('Failed to load team member details');
      } finally {
        setLoading(false);
      }
    };

    loadTeamMember();
  }, [teamMemberId]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      // Could add toast notification here
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const getStatusColor = (status: TeamMember['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-900/20 text-green-400 border-green-900';
      case 'inactive':
        return 'bg-gray-900/20 text-gray-400 border-gray-900';
      case 'on-leave':
        return 'bg-yellow-900/20 text-yellow-400 border-yellow-900';
      default:
        return 'bg-gray-900/20 text-gray-400 border-gray-900';
    }
  };

  const handleBackClick = () => {
    navigate('/team');
  };

  // Mock recent projects data
  const recentProjects = [
    {
      id: "1",
      name: "Office Renovation - Downtown",
      status: "active",
      role: "Project Manager",
      startDate: "Feb 15, 2025",
      progress: 75,
    },
    {
      id: "2", 
      name: "Warehouse Construction",
      status: "completed",
      role: "Site Supervisor",
      startDate: "Jan 8, 2025",
      progress: 100,
    },
    {
      id: "3",
      name: "Retail Space Buildout", 
      status: "planned",
      role: "Team Lead",
      startDate: "Mar 10, 2025",
      progress: 0,
    },
  ];

  // Mock recent activities data
  const recentActivities = [
    {
      id: "1",
      description: "Completed safety inspection for Downtown project",
      date: "Feb 20, 2025",
      type: "Inspection"
    },
    {
      id: "2",
      description: "Submitted weekly progress report",
      date: "Feb 18, 2025", 
      type: "Report"
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
          <p className="text-gray-400">Loading team member data...</p>
        </div>
      </div>
    );
  }

  if (error || !teamMember) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#333333] rounded-[4px] flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-white font-medium text-xl mb-2">Team Member Not Found</h2>
          <p className="text-gray-400 mb-6">The requested team member could not be located</p>
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
              <h1 className="text-2xl font-bold text-white truncate mb-1">{teamMember.name}</h1>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select 
                    value={teamMember.status} 
                    className={`appearance-none bg-transparent border rounded px-3 py-1 text-xs font-medium uppercase tracking-wide cursor-pointer ${getStatusColor(teamMember.status).replace('bg-', 'border-').replace('/20', '')}`}
                  >
                    <option value="active">ACTIVE</option>
                    <option value="inactive">INACTIVE</option>
                    <option value="on-leave">ON LEAVE</option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
                <span className="text-gray-400">{teamMember.job_title}</span>
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
            { key: 'activities', label: 'Activities', count: recentActivities.length },
            { key: 'permissions', label: 'Permissions' }
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
                      <Briefcase className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Projects</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-blue-400 truncate">{teamMember.projectsAssigned || 0}</div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <Clock className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Hours This Month</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-yellow-400 truncate">{teamMember.hoursThisMonth || 0}h</div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <DollarSign className="h-4 w-4 text-green-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Rate</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-green-400 truncate">
                      {teamMember.hourly_rate ? `$${teamMember.hourly_rate}/hr` : teamMember.salary ? formatCurrency(teamMember.salary) : 'N/A'}
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 mb-2">
                      <Calendar className="h-4 w-4 text-purple-400 flex-shrink-0" />
                      <div className="text-xs text-gray-400 truncate">Tenure</div>
                    </div>
                    <div className="text-base md:text-lg font-bold text-purple-400 truncate">
                      {teamMember.hire_date ? 
                        `${Math.floor((Date.now() - new Date(teamMember.hire_date).getTime()) / (1000 * 60 * 60 * 24 * 365))}y` : 
                        'N/A'
                      }
                    </div>
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
                      </div>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="text-xs text-gray-400 min-w-0 flex-1 truncate">
                          {project.role} • Started {project.startDate}
                        </div>
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

              {/* Recent Activities */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400">
                    Recent Activities
                  </h3>
                  <button className="bg-[#336699] hover:bg-[#336699]/80 text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
                <div className="space-y-4">
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="p-4 bg-[#1E1E1E]/30 rounded border border-[#333333]/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white mb-1 break-words">{activity.description}</div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span>{activity.date}</span>
                            <span>{activity.type}</span>
                          </div>
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
                  {teamMember.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400">Phone</div>
                        <div className="text-sm text-white break-all">{teamMember.phone}</div>
                      </div>
                    </div>
                  )}
                  {teamMember.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400">Email</div>
                        <div className="text-sm text-white break-all">{teamMember.email}</div>
                      </div>
                    </div>
                  )}
                  {teamMember.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400">Address</div>
                        <div className="text-sm text-white break-all">{teamMember.address}</div>
                      </div>
                    </div>
                  )}
                  {teamMember.emergency_contact && (
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-400">Emergency Contact</div>
                        <div className="text-sm text-white break-all">{teamMember.emergency_contact}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Employment Information */}
              <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6 overflow-hidden">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-400 mb-4">
                  Employment Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-400">Department</div>
                    <div className="text-sm text-white">{teamMember.department}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Employment Type</div>
                    <div className="text-sm text-white capitalize">{teamMember.employment_type}</div>
                  </div>
                  {teamMember.hire_date && (
                    <div>
                      <div className="text-xs text-gray-400">Hire Date</div>
                      <div className="text-sm text-white">{new Date(teamMember.hire_date).toLocaleDateString()}</div>
                    </div>
                  )}
                  {teamMember.manager_id && (
                    <div>
                      <div className="text-xs text-gray-400">Reports To</div>
                      <div className="text-sm text-white">Manager (ID: {teamMember.manager_id})</div>
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
                    <span className="text-sm text-gray-400">Status</span>
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${getStatusColor(teamMember.status)}`}>
                        {teamMember.status}
                      </span>
                    </div>
                  </div>
                  {teamMember.lastActivity && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Last Activity</span>
                      <span className="text-sm text-white">
                        {new Date(teamMember.lastActivity).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Project History</h3>
            <p className="text-gray-400">Detailed project history will be displayed here when project tracking is implemented.</p>
          </div>
        )}

        {activeTab === 'activities' && (
          <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Activity History</h3>
            <p className="text-gray-400">Detailed activity history will be displayed here when activity tracking is implemented.</p>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="bg-[#1E1E1E]/50 border border-[#333333] rounded p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Permissions & Access</h3>
            <div className="space-y-4">
              {teamMember.permissions && teamMember.permissions.length > 0 ? (
                <div className="space-y-2">
                  {teamMember.permissions.map((permission, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-[#1E1E1E]/30 rounded border border-[#333333]/50">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-white">{permission}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400">No specific permissions assigned.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 