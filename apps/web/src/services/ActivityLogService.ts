import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

// Define a more specific type for user_metadata if possible, for now, 'any' is used for flexibility.
export interface ActivityLogUser {
  email: string;
  user_metadata: { [key: string]: any };
}

export interface ActivityLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null; // This was 'description' in some older versions, now 'entity_name'
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: ActivityLogUser; // For enriched logs
}

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'converted'
  | 'signed'
  | 'viewed'
  | 'downloaded'
  | 'shared'
  | 'archived'
  | 'restored'
  | 'invited'
  | 'removed'
  | 'completed'
  | 'cancelled'
  | 'approved'
  | 'rejected'
  | 'status_changed'
  | 'payment_received'
  | 'apply';

export type EntityType =
  | 'invoice'
  | 'estimate'
  | 'client'
  | 'project'
  | 'product'
  | 'expense'
  | 'vendor'
  | 'subcontractor'
  | 'team_member'
  | 'work_pack'
  | 'template'
  | 'service'
  | 'service_option'
  | 'service_package'
  | 'line_item'
  | 'line_item_override'
  | 'pricing_mode';

export interface ActivityFilter {
  entity_type?: EntityType;
  action?: ActivityAction;
  user_id?: string;
  organization_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export class ActivityLogService {

  static getActivityIcon(activity: ActivityLog): string {
    switch (activity.entity_type) {
      case 'invoice':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          case 'sent': return 'Send';
          case 'paid': return 'DollarSign';
          case 'payment_received': return 'DollarSign';
          case 'viewed': return 'Eye';
          case 'overdue': return 'AlertCircle';
          default: return 'FileText';
        }
      case 'estimate':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          case 'sent': return 'Send';
          case 'signed': return 'PenTool';
          case 'accepted': return 'CheckCircle';
          case 'declined': return 'XCircle';
          case 'viewed': return 'Eye';
          case 'converted': return 'RefreshCw';
          default: return 'FileText';
        }
      case 'client':
        switch (activity.action) {
          case 'created': return 'UserPlus';
          case 'updated': return 'Edit';
          case 'deleted': return 'UserMinus';
          default: return 'User';
        }
      case 'project':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          case 'status_changed': return 'RefreshCw';
          case 'completed': return 'CheckCircle';
          case 'cancelled': return 'XCircle';
          default: return 'Briefcase';
        }
      case 'product':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          case 'archived': return 'Archive';
          case 'restored': return 'RotateCcw';
          default: return 'Package';
        }
      case 'expense':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          case 'approved': return 'CheckCircle';
          case 'rejected': return 'XCircle';
          case 'paid': return 'DollarSign';
          case 'status_changed': return 'RefreshCw';
          default: return 'DollarSign';
        }
      case 'vendor':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          default: return 'Building';
        }
      case 'subcontractor':
        switch (activity.action) {
          case 'created': return 'UserPlus';
          case 'updated': return 'Edit';
          case 'deleted': return 'UserMinus';
          default: return 'User';
        }
      case 'team_member':
        switch (activity.action) {
          case 'created': return 'UserPlus';
          case 'updated': return 'Edit';
          case 'deleted': return 'UserMinus';
          case 'invited': return 'Send';
          case 'removed': return 'UserX';
          default: return 'Users';
        }
      case 'work_pack':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          default: return 'FileStack';
        }
      case 'service':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          default: return 'Settings';
        }
      case 'service_option':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          default: return 'List';
        }
      case 'service_package':
        switch (activity.action) {
          case 'created': return 'Plus';
          case 'updated': return 'Edit';
          case 'deleted': return 'Trash2';
          default: return 'Package';
        }
      default: return 'Activity';
    }
  }

  static getActivityColor(activity: ActivityLog): string {
    switch (activity.action) {
      case 'created': return 'text-green-400';
      case 'updated': return 'text-blue-400';
      case 'deleted': return 'text-red-400';
      case 'sent': return 'text-indigo-400';
      case 'paid': return 'text-green-400';
      case 'payment_received': return 'text-green-400';
      case 'accepted': return 'text-green-400';
      case 'declined': return 'text-red-400';
      case 'rejected': return 'text-red-400';
      case 'approved': return 'text-green-400';
      case 'completed': return 'text-green-400';
      case 'cancelled': return 'text-red-400';
      case 'viewed': return 'text-gray-400';
      case 'signed': return 'text-purple-400';
      case 'converted': return 'text-cyan-400';
      case 'archived': return 'text-yellow-400';
      case 'restored': return 'text-blue-400';
      case 'status_changed': return 'text-orange-400';
      case 'invited': return 'text-indigo-400';
      case 'removed': return 'text-red-400';
      case 'overdue': return 'text-red-400';
      default: return 'text-gray-400';
    }
  }

  static getActivityDescription(activity: ActivityLog): string {
    return activity.entity_name || `${activity.entity_type} ${activity.action}`;
  }


  /**
   * Logs an activity by calling a database procedure.
   * This is the primary method for recording activities.
   * Metadata is stringified to be passed as a JSON object to the procedure.
   */
  static async logActivity(
    action: ActivityAction,
    entityType: EntityType,
    entityId?: string,
    entityName?: string, // This corresponds to p_entity_name in RPC
    metadata: Record<string, any> = {},
    organizationId?: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('log_activity', {
        p_action: action,
        p_entity_type: entityType,
        p_entity_id: entityId || null,
        p_entity_name: entityName || null, // Pass entityName here
        p_metadata: JSON.stringify(metadata), // Ensure metadata is stringified
        p_organization_id: organizationId || null
      });

      if (error) {
        // [ActivityLogService] RPC error
        throw error;
      }

      return data; // RPC typically returns the ID of the created log or a status
    } catch (err) {
      if (err instanceof Error) {
        // [ActivityLogService] Exception in logActivity
      }
      throw err; // Re-throw to allow caller to handle
    }
  }

  /**
   * A wrapper for logActivity that automatically enriches metadata with user information.
   * The 'description' parameter here is used as 'entityName' for the logActivity call.
   */
  static async log(params: {
    organizationId: string;
    entityType: EntityType;
    entityId?: string;
    action: ActivityAction | string; // Allow string for flexibility, cast to ActivityAction
    description?: string; // This will be used as entity_name
    metadata?: Record<string, any>;
    actor?: 'user' | 'system' | 'ai-agent'; // Optional actor override
  }): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    const enhancedMetadata = {
      ...params.metadata,
      ...(params.actor === 'system' && { actor: 'System' }),
      ...(params.actor === 'ai-agent' && { actor: 'Breeze' }),
      ...(params.actor === 'user' && user && {
        user_email: user.email,
        user_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email
      }),
      ...(!params.actor && user && {
        user_email: user.email,
        user_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email
      })
    };
    
    // Use params.description as entityName for logActivity
    const entityNameForLog = params.description || undefined; 
    
    return this.logActivity(
      params.action as ActivityAction, // Cast to ActivityAction
      params.entityType,
      params.entityId,
      entityNameForLog, // Pass the description as entityName
      enhancedMetadata,
      params.organizationId
    );
  }

  /**
   * Convenience method for logging AI agent activities
   */
  static async logAsAgent(params: {
    organizationId: string;
    entityType: EntityType;
    entityId?: string;
    action: ActivityAction | string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<string | null> {
    return this.log({
      ...params,
      actor: 'ai-agent'
    });
  }

  /**
   * Convenience method for logging system activities
   */
  static async logAsSystem(params: {
    organizationId: string;
    entityType: EntityType;
    entityId?: string;
    action: ActivityAction | string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<string | null> {
    return this.log({
      ...params,
      actor: 'system'
    });
  }

  /**
   * Fetches a list of activities with optional filters and enriches them with user data.
   */
  static async getActivities(filter: ActivityFilter = {}): Promise<ActivityLog[]> {
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filter.organization_id) {
        query = query.eq('organization_id', filter.organization_id);
      }
      if (filter.entity_type) {
        query = query.eq('entity_type', filter.entity_type);
      }
      if (filter.action) {
        query = query.eq('action', filter.action);
      }
      if (filter.user_id) {
        query = query.eq('user_id', filter.user_id);
      }
      if (filter.from_date) {
        query = query.gte('created_at', filter.from_date);
      }
      if (filter.to_date) {
        query = query.lte('created_at', filter.to_date);
      }
      if (filter.limit) {
        query = query.limit(filter.limit);
      }
      if (filter.offset) {
        query = query.range(filter.offset, filter.offset + (filter.limit || 100) -1 ); // Corrected range
      }

      const { data: activities, error } = await query;

      if (error) {
        // Error fetching activities
        return [];
      }
      if (!activities) {
        return [];
      }

      // Enrich activities with user data from metadata
      // This avoids the dependency on a profiles table
      activities.forEach(activity => {
        if (activity.user_id) {
          // Use metadata if available (most reliable)
          if (activity.metadata?.user_email) {
            activity.user = {
              email: activity.metadata.user_email as string,
              user_metadata: {
                name: activity.metadata.user_name as string || activity.metadata.user_email as string
              }
            };
          } else {
            // Fallback to generic user display
            activity.user = {
              email: 'User',
              user_metadata: {
                name: 'User'
              }
            };
          }
        }
      });
      return activities as ActivityLog[]; // Cast to ActivityLog[]
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      // Error in getActivities
      return [];
    }
  }

  /**
   * Subscribes to real-time activity log insertions for a given organization.
   */
  static subscribeToActivities(
    organizationId: string,
    callback: (activity: ActivityLog) => void
  ): RealtimeChannel {
    const channel = supabase.channel(`activity-logs:${organizationId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `organization_id=eq.${organizationId}`
        },
        async (payload) => {
          const newActivity = payload.new as ActivityLog;

          // Fetch user data for the new activity
          if (newActivity.user_id) {
            // Try to get user data from metadata first (most reliable)
            if (newActivity.metadata?.user_email) {
              newActivity.user = {
                email: newActivity.metadata.user_email as string,
                user_metadata: {
                  name: newActivity.metadata.user_name as string || newActivity.metadata.user_email as string
                }
              };
            } else {
              // If no metadata, we'll just show the user_id
              // This avoids the profiles table dependency
              newActivity.user = {
                email: 'User',
                user_metadata: {
                  name: 'User'
                }
              };
            }
          }
          callback(newActivity);
        }
      )
      .subscribe((status, err) => { // Add status and err parameters
        if (status === 'SUBSCRIBED') {
          // Subscribed to activity logs
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
          // Error subscribing to activity logs
        }
      });

    return channel;
  }
}