import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../utils/format';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  BarChart3
} from 'lucide-react';

interface ProjectUsage {
  id: string;
  name: string;
  client_name: string;
  status: 'planning' | 'active' | 'completed' | 'on-hold';
  created_at: string;
  estimated_total: number;
  actual_total?: number;
  completion_percentage: number;
}

interface WorkPackAnalyticsProps {
  workPackId: string;
  workPackName: string;
}

export const WorkPackAnalytics: React.FC<WorkPackAnalyticsProps> = ({ workPackId, workPackName }) => {
  const [projects, setProjects] = useState<ProjectUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'performance'>('overview');
  const [timeFilter, setTimeFilter] = useState<'all' | '30d' | '90d' | '1y'>('all');

  useEffect(() => {
    if (workPackId) {
      loadAnalyticsData();
    }
  }, [workPackId, timeFilter]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      
      // Mock data for now - in real implementation would query projects table
      // where work_pack_template_id = workPackId
      const mockProjects: ProjectUsage[] = [
        {
          id: '1',
          name: 'Johnson Kitchen Remodel',
          client_name: 'Sarah Johnson',
          status: 'active',
          created_at: '2024-01-15T10:30:00Z',
          estimated_total: 24850,
          actual_total: 18200,
          completion_percentage: 65
        },
        {
          id: '2', 
          name: 'Downtown Condo Kitchen',
          client_name: 'Mike Chen',
          status: 'planning',
          created_at: '2024-01-08T14:20:00Z',
          estimated_total: 31200,
          completion_percentage: 15
        },
        {
          id: '3',
          name: 'Suburban Kitchen Update',
          client_name: 'Lisa Davis',
          status: 'completed',
          created_at: '2023-12-01T09:15:00Z',
          estimated_total: 22500,
          actual_total: 21800,
          completion_percentage: 100
        },
        {
          id: '4',
          name: 'Modern Loft Kitchen',
          client_name: 'David Kim',
          status: 'active',
          created_at: '2024-01-20T16:45:00Z',
          estimated_total: 28900,
          actual_total: 12400,
          completion_percentage: 40
        },
        {
          id: '5',
          name: 'Traditional Family Kitchen',
          client_name: 'Jennifer Smith',
          status: 'completed',
          created_at: '2023-11-15T11:30:00Z',
          estimated_total: 26800,
          actual_total: 25900,
          completion_percentage: 100
        }
      ];

      setProjects(mockProjects);
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/40';
      case 'planning':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
      case 'completed':
        return 'bg-[#336699]/20 text-[#336699] border-[#336699]/40';
      case 'on-hold':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/40';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'ACTIVE';
      case 'planning':
        return 'PLANNED';
      case 'completed':
        return 'COMPLETED';
      case 'on-hold':
        return 'ON HOLD';
      default:
        return status.toUpperCase();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? 's' : ''} ago`;
  };

  // Calculate metrics
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const completedProjects = projects.filter(p => p.status === 'completed').length;
  const totalRevenue = projects.reduce((sum, p) => sum + (p.actual_total || p.estimated_total), 0);
  const avgProjectValue = totalProjects > 0 ? totalRevenue / totalProjects : 0;
  const completionRate = totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#336699]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-gray-400">Template Analytics</h2>
        <div className="flex items-center gap-2">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as any)}
            className="bg-[#111827]/50 border border-gray-700 rounded-[4px] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699]"
          >
            <option value="all">All Time</option>
            <option value="1y">Last Year</option>
            <option value="90d">Last 90 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2a2a]">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'overview'
              ? 'text-white border-b-2 border-[#336699]'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === 'projects'
              ? 'text-white border-b-2 border-[#336699]'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          Created Projects
          <span className="text-xs bg-[#336699]/20 text-[#5b8fc7] px-1.5 py-0.5 rounded">
            {totalProjects}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'performance'
              ? 'text-white border-b-2 border-[#336699]'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          Performance
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111827]/50 border border-gray-800 rounded-[4px] p-4">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-4 h-4 text-[#336699]" />
                <div className="text-xs text-gray-400 uppercase tracking-wider">Total Projects</div>
              </div>
              <div className="text-2xl font-bold text-white">{totalProjects}</div>
              <div className="text-xs text-green-400 mt-1">+2 this month</div>
            </div>

            <div className="bg-[#111827]/50 border border-gray-800 rounded-[4px] p-4">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <div className="text-xs text-gray-400 uppercase tracking-wider">Completion Rate</div>
              </div>
              <div className="text-2xl font-bold text-white">{completionRate.toFixed(0)}%</div>
              <div className="text-xs text-gray-400 mt-1">{completedProjects} completed</div>
            </div>

            <div className="bg-[#111827]/50 border border-gray-800 rounded-[4px] p-4">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-4 h-4 text-[#5b8fc7]" />
                <div className="text-xs text-gray-400 uppercase tracking-wider">Total Revenue</div>
              </div>
              <div className="text-2xl font-bold text-white">{formatCurrency(totalRevenue)}</div>
              <div className="text-xs text-gray-400 mt-1">from template</div>
            </div>

            <div className="bg-[#111827]/50 border border-gray-800 rounded-[4px] p-4">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <div className="text-xs text-gray-400 uppercase tracking-wider">Avg Project Value</div>
              </div>
              <div className="text-2xl font-bold text-white">{formatCurrency(avgProjectValue)}</div>
              <div className="text-xs text-gray-400 mt-1">per project</div>
            </div>
          </div>

          {/* Recent Usage */}
          <div className="bg-[#111827]/50 border border-gray-800 rounded-[4px] p-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Recent Template Usage</h3>
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => (
                <div key={project.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#336699]"></div>
                    <div>
                      <div className="text-sm text-white font-medium">{project.name}</div>
                      <div className="text-xs text-gray-400">{project.client_name} • Created {formatDate(project.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-300">{formatCurrency(project.estimated_total)}</div>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400 uppercase tracking-wider">
              Projects Created from Template
            </div>
          </div>

          {/* Projects List */}
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="bg-[#111827]/50 border border-gray-800 rounded-[4px] p-4 hover:bg-[#111827]/70 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-[#336699]"></div>
                    <div>
                      <div className="text-white font-medium">{project.name}</div>
                      <div className="text-sm text-gray-400">
                        {project.client_name} • Created {formatDate(project.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-white font-semibold">{formatCurrency(project.estimated_total)}</div>
                      {project.actual_total && (
                        <div className="text-xs text-gray-400">
                          Actual: {formatCurrency(project.actual_total)}
                        </div>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-medium border ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                    <button className="p-1 text-gray-400 hover:text-white">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {project.completion_percentage > 0 && project.completion_percentage < 100 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{project.completion_percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div 
                        className="bg-[#336699] h-1.5 rounded-full" 
                        style={{ width: `${project.completion_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Performance analytics coming soon</p>
            <p className="text-gray-600 text-xs mt-1">ROI analysis, template effectiveness metrics, and more</p>
          </div>
        </div>
      )}
    </div>
  );
}; 