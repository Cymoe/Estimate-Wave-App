import React, { useState, useEffect, useContext } from 'react';
import { format } from 'date-fns';
import { 
  Clock, 
  Filter, 
  Download, 
  Search,
  Calendar,
  User,
  FileText,
  RefreshCw
} from 'lucide-react';
import { ActivityLogService, ActivityLog, EntityType, ActionType } from '../../services/ActivityLogService';
import { OrganizationContext } from '../layouts/DashboardLayout';
import { ActivityFeed } from './ActivityFeed';

export const ActivityPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    entityType: '' as EntityType | '',
    action: '' as ActionType | '',
    userId: '',
    startDate: '',
    endDate: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  useEffect(() => {
    if (selectedOrg?.id) {
      loadActivities(true);
    }
  }, [selectedOrg?.id, filters]);

  useEffect(() => {
    if (!selectedOrg?.id) return;
    
    // Subscribe to real-time updates
    const unsubscribe = ActivityLogService.subscribeToActivity(selectedOrg.id, (newActivity) => {
      setActivities(prev => [newActivity, ...prev]);
    });

    return () => {
      unsubscribe();
    };
  }, [selectedOrg?.id]);

  const loadActivities = async (reset = false) => {
    if (!selectedOrg?.id) return;
    
    try {
      setLoading(true);
      const offset = reset ? 0 : page * limit;
      
      const data = await ActivityLogService.list({
        organizationId: selectedOrg.id,
        entityType: filters.entityType || undefined,
        action: filters.action || undefined,
        userId: filters.userId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        limit,
        offset
      });

      if (reset) {
        setActivities(data);
        setPage(0);
      } else {
        setActivities(prev => [...prev, ...data]);
      }
      
      setHasMore(data.length === limit);
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      const blob = await ActivityLogService.export({
        organizationId: selectedOrg.id,
        entityType: filters.entityType || undefined,
        action: filters.action || undefined,
        userId: filters.userId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export activities:', error);
    }
  };

  const entityTypes: Array<{ value: EntityType | '', label: string }> = [
    { value: '', label: 'All Types' },
    { value: 'estimate', label: 'Estimates' },
    { value: 'client', label: 'Clients' },
    { value: 'project', label: 'Projects' },
    { value: 'product', label: 'Products' },
    { value: 'payment', label: 'Payments' },
    { value: 'expense', label: 'Expenses' },
    { value: 'team_member', label: 'Team Members' }
  ];

  const actionTypes: Array<{ value: ActionType | '', label: string }> = [
    { value: '', label: 'All Actions' },
    { value: 'created', label: 'Created' },
    { value: 'updated', label: 'Updated' },
    { value: 'deleted', label: 'Deleted' },
    { value: 'sent', label: 'Sent' },
    { value: 'paid', label: 'Paid' },
    { value: 'status_changed', label: 'Status Changed' }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Activity Log</h1>
          <p className="text-gray-400">Track all actions and changes in your organization</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
              showFilters 
                ? 'bg-[#336699] text-white' 
                : 'bg-[#2A2A2A] text-gray-300 hover:bg-[#333333]'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
          
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-[#2A2A2A] text-gray-300 rounded-lg hover:bg-[#333333] transition-colors flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-[#1E1E1E] border border-[#333333] rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Entity Type
              </label>
              <select
                value={filters.entityType}
                onChange={(e) => setFilters({ ...filters, entityType: e.target.value as EntityType | '' })}
                className="w-full bg-[#2A2A2A] border border-[#404040] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#336699]"
              >
                {entityTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Action
              </label>
              <select
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value as ActionType | '' })}
                className="w-full bg-[#2A2A2A] border border-[#404040] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#336699]"
              >
                {actionTypes.map(action => (
                  <option key={action.value} value={action.value}>{action.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Date Range
              </label>
              <div className="flex space-x-2">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="flex-1 bg-[#2A2A2A] border border-[#404040] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#336699]"
                />
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="flex-1 bg-[#2A2A2A] border border-[#404040] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#336699]"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setFilters({
                  entityType: '',
                  action: '',
                  userId: '',
                  startDate: '',
                  endDate: '',
                  search: ''
                });
              }}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#1E1E1E] border border-[#333333] rounded-lg">
        {loading && activities.length === 0 ? (
          <div className="p-8">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-gray-700 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activities.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No Activity Found</h3>
            <p className="text-gray-500">Try adjusting your filters or check back later</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#333333]">
              {activities.map((activity) => (
                <div key={activity.id} className="p-6 hover:bg-[#2A2A2A] transition-colors">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      {activity.user_avatar ? (
                        <img 
                          src={activity.user_avatar} 
                          alt={activity.user_name || 'User'} 
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#336699] flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="font-medium text-white">
                            {activity.user_name || activity.user_email?.split('@')[0] || 'Unknown User'}
                          </span>
                          <span className="text-gray-400 ml-2">{activity.description}</span>
                        </div>
                        
                        <span className="text-xs text-gray-500">
                          {format(new Date(activity.created_at!), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      
                      {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                        <div className="mt-2 text-sm text-gray-500">
                          {activity.metadata.amount && (
                            <span className="mr-4">Amount: ${activity.metadata.amount}</span>
                          )}
                          {activity.metadata.oldStatus && activity.metadata.newStatus && (
                            <span>Status: {activity.metadata.oldStatus} → {activity.metadata.newStatus}</span>
                          )}
                          {activity.metadata.recipientEmail && (
                            <span>Sent to: {activity.metadata.recipientEmail}</span>
                          )}
                        </div>
                      )}
                      
                      <div className="mt-2 flex items-center space-x-4 text-xs">
                        <span className="px-2 py-1 bg-[#2A2A2A] rounded text-gray-400">
                          {activity.entity_type}
                        </span>
                        <span className="px-2 py-1 bg-[#2A2A2A] rounded text-gray-400">
                          {activity.action.replace('_', ' ')}
                        </span>
                        {activity.ip_address && (
                          <span className="text-gray-500">IP: {activity.ip_address}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="p-4 text-center border-t border-[#333333]">
                <button
                  onClick={() => {
                    setPage(prev => prev + 1);
                    loadActivities();
                  }}
                  disabled={loading}
                  className="px-6 py-2 bg-[#336699] text-white rounded-lg hover:bg-[#2A5580] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <span>Load More</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};