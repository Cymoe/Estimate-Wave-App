import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FolderOpen, Plus, MoreVertical, Filter,
  BarChart, Calendar, List, Grid3X3
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { formatCurrency } from '../../utils/format';
import { TableSkeleton } from '../skeletons/TableSkeleton';

interface Project {
  id: string;
  name: string;
  client_id: string;
  client?: {
    name: string;
  };
  budget: number;
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  progress?: number;
}

export const WorkProjectsView: React.FC = () => {
  const navigate = useNavigate();
  const { selectedOrg } = useContext(OrganizationContext);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Project['status']>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    if (selectedOrg?.id) {
      loadProjects();
    }
  }, [selectedOrg?.id]);

  const loadProjects = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          clients (
            name
          )
        `)
        .eq('organization_id', selectedOrg.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error: any) {
      console.error('Error loading projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(project => {
    const matchesSearch = 
      project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.client?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusCounts = projects.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalBudget = projects.reduce((sum, project) => sum + (project.budget || 0), 0);
  const averageBudget = projects.length > 0 ? totalBudget / projects.length : 0;
  const activeProjects = projects.filter(p => p.status === 'active').length;

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'planned': return 'text-gray-400 bg-gray-400/10';
      case 'active': return 'text-green-400 bg-green-400/10';
      case 'on_hold': return 'text-yellow-400 bg-yellow-400/10';
      case 'completed': return 'text-blue-400 bg-blue-400/10';
      case 'cancelled': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with title and add button */}
      <div className="px-6 py-4 border-b border-[#1E1E1E] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Projects</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 bg-[#1E1E1E] border border-[#333] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F9D71C]"
          />
          <button
            onClick={() => setShowProjectWizard(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-100 rounded-lg text-black text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-4 bg-[#1E1E1E]/50 grid grid-cols-4 gap-6 min-h-[88px]">
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Total</div>
          <div className="text-xl font-semibold text-white mt-1">{projects.length}</div>
          <div className="text-xs text-gray-500 mt-auto">projects</div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Total Budget</div>
          <div className="text-xl font-semibold text-[#F9D71C] mt-1">
            {formatCurrency(totalBudget)}
          </div>
          <div className="text-xs text-gray-500 mt-auto">all projects</div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Active</div>
          <div className="text-xl font-semibold text-green-400 mt-1">{activeProjects}</div>
          <div className="text-xs text-gray-500 mt-auto">
            {Math.round((activeProjects / Math.max(projects.length, 1)) * 100)}%
          </div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs text-gray-400 uppercase">Avg Budget</div>
          <div className="text-xl font-semibold text-white mt-1">
            {formatCurrency(averageBudget)}
          </div>
          <div className="text-xs text-gray-500 mt-auto">per project</div>
        </div>
      </div>

      {/* Filters and view controls */}
      <div className="px-6 py-3 border-b border-[#1E1E1E] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            className="bg-[#1E1E1E] border border-[#333] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#F9D71C]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All Projects ({projects.length})</option>
            <option value="planned">Planned ({statusCounts.planned || 0})</option>
            <option value="active">Active ({statusCounts.active || 0})</option>
            <option value="on_hold">On Hold ({statusCounts.on_hold || 0})</option>
            <option value="completed">Completed ({statusCounts.completed || 0})</option>
            <option value="cancelled">Cancelled ({statusCounts.cancelled || 0})</option>
          </select>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-[#1E1E1E] hover:bg-[#2A2A2A] border border-[#333] rounded-lg text-sm text-white transition-colors">
            <Filter className="w-4 h-4" />
            More Filters
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'list' ? 'bg-[#2A2A2A] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'grid' ? 'bg-[#2A2A2A] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button className="ml-2 p-1.5 rounded hover:bg-[#2A2A2A] transition-colors">
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={5} variant="project" />
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <FolderOpen className="w-12 h-12 text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No projects found</h3>
            <p className="text-gray-400 text-center mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your filters' 
                : 'Create your first project to get started'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <table className="w-full">
                            <thead className="bg-[#1E1E1E] sticky top-0">
              <tr className="text-xs text-gray-400 uppercase">
                <th className="text-left px-6 py-3 font-medium">Project</th>
                <th className="text-center px-6 py-3 font-medium">Status</th>
                <th className="text-right px-6 py-3 font-medium">Budget</th>
                <th className="text-left px-6 py-3 font-medium">Client</th>
                <th className="text-center px-6 py-3 font-medium">Progress</th>
                <th className="text-right px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-[#1E1E1E] hover:bg-[#1E1E1E]/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{project.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(project.start_date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(project.status)}`}>
                      {project.status.charAt(0).toUpperCase() + project.status.slice(1).replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-mono text-white">
                      {formatCurrency(project.budget)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-white">
                      {project.client?.name || 'No client'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[#1E1E1E] rounded-full h-2">
                        <div 
                          className="bg-[#F9D71C] h-2 rounded-full"
                          style={{ width: `${project.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{project.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Handle menu
                      }}
                      className="p-1 hover:bg-[#2A2A2A] rounded transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="bg-[#1E1E1E] border border-[#333] rounded-lg p-4 hover:border-[#F9D71C] cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium text-white group-hover:text-[#F9D71C] transition-colors">
                    {project.name}
                  </h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status.charAt(0).toUpperCase() + project.status.slice(1).replace('_', ' ')}
                  </span>
                </div>
                <div className="text-sm text-gray-400 mb-2">
                  {project.client?.name || 'No client'}
                </div>
                <div className="text-xl font-mono font-semibold text-white mb-3">
                  {formatCurrency(project.budget)}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Calendar className="w-3 h-3" />
                  {new Date(project.start_date).toLocaleDateString()}
                </div>
                <div className="mt-3">
                  <div className="bg-[#0a0a0a] rounded-full h-2">
                    <div 
                      className="bg-[#F9D71C] h-2 rounded-full"
                      style={{ width: `${project.progress || 0}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{project.progress || 0}% complete</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
    </div>
  );
};