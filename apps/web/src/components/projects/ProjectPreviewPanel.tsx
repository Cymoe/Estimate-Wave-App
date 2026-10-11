import React from 'react';
import { Calendar, DollarSign, User, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProjectShortcut } from './useProjectShortcuts';
import { formatProjectDate, projectStatusInfo } from './projectStatus';

interface ProjectPreviewPanelProps {
  project: ProjectShortcut | null;
  isVisible: boolean;
  position: { top: number };
  /** Keeps the card open while the pointer is over it. */
  onHover?: (hovering: boolean) => void;
  /** Width of the main sidebar to the right of the projects pane. */
  sidebarWidth?: number;
}

export const ProjectPreviewPanel: React.FC<ProjectPreviewPanelProps> = ({ 
  project, 
  isVisible,
  position,
  onHover,
  sidebarWidth = 192,
}) => {
  const navigate = useNavigate();
  
  if (!project) return null;

  const budgetPercentage = project.progress;
  const status = projectStatusInfo(project.status);

  const isOverBudget = budgetPercentage > 100;

  // Calculate days remaining
  const daysRemaining = (() => {
    if (!project.endDate) return null;
    const [y, m, d] = project.endDate.slice(0, 10).split('-').map(Number);
    const now = new Date();
    return Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  })();

  // Sits just left of the projects pane (main sidebar + pane on the right).
  const baseLeft = 320 + sidebarWidth;
  
  return (
    <div 
      className={`fixed w-[320px] bg-[#1F2937] border border-[#374151] rounded-r-lg shadow-2xl z-[9999] transition-all duration-150 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
      }`}
      style={{ 
        top: `${position.top}px`,
        right: `${baseLeft}px`,
        maxHeight: `calc(100dvh - ${position.top}px - 8px)`,
        overflowY: 'auto',
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {/* Header */}
      <div className="p-4 border-b border-[#374151]">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="text-white font-medium text-sm mb-1">{project.name}</h3>
            <p className="text-gray-400 text-xs">{project.client || 'No client'}</p>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${status.pill}`}>
            {status.label}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">Budget used</span>
            <span className="text-white font-medium">{project.budget ? `${project.progress}%` : 'No budget'}</span>
          </div>
          <div className="w-full h-2 bg-[#374151] rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${isOverBudget ? 'bg-red-500' : 'bg-[#3B82F6]'}`}
              style={{ width: `${Math.min(project.progress, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Budget */}
        <div className="bg-[#111827] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-400">Budget</span>
          </div>
          <div className="text-white font-medium text-sm">
            ${(project.spent / 1000).toFixed(1)}k / {project.budget ? `$${(project.budget / 1000).toFixed(1)}k` : '—'}
          </div>
          <div className="mt-2">
            <div className="w-full h-1 bg-[#374151] rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverBudget ? 'bg-red-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-[#111827] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-400">Timeline</span>
          </div>
          <div className="text-white font-medium text-sm">
            {daysRemaining !== null ? (
              daysRemaining > 0 ? `${daysRemaining} days left` : daysRemaining === 0 ? 'Due today' : 'Overdue'
            ) : 'No deadline'}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {project.endDate ? formatProjectDate(project.endDate) : 'Ongoing'}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-400 font-medium">Recent Expenses</span>
        </div>
        <div className="space-y-2">
          {project.recentActivities.length === 0 && <p className="text-xs text-gray-500 italic">No expenses yet</p>}
          {project.recentActivities.slice(0, 3).map((activity) => (
            <div key={activity.id} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 leading-relaxed">{activity.description}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{activity.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-t border-[#374151] flex items-center gap-2">
        <button 
          onClick={() => navigate(`/projects/${project.id}`)}
          className="flex-1 px-3 py-2 bg-[#3B82F6] text-white text-xs font-medium rounded-lg hover:bg-[#2563EB] transition-colors"
        >
          View Project
        </button>
        {project.clientId && (
          <button 
            onClick={() => navigate(`/clients/${project.clientId}`)}
            className="px-3 py-2 bg-[#374151] text-white text-xs font-medium rounded-lg hover:bg-[#4B5563] transition-colors"
            title="View Client"
          >
            <User className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}; 