/**
 * Real-time updates using Server-Sent Events (SSE)
 * Replaces Supabase Realtime
 */

const REALTIME_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export interface ActivityLogEvent {
  _id: string;
  organizationId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: string;
}

export type RealtimeEventCallback = (event: ActivityLogEvent) => void;

export class RealtimeClient {
  private eventSource: EventSource | null = null;
  private callbacks: RealtimeEventCallback[] = [];

  /**
   * Connect to real-time activity logs stream
   */
  connect(organizationId: string) {
    if (this.eventSource) {
      console.warn('Already connected to realtime stream');
      return;
    }

    const url = `${REALTIME_BASE_URL}/api/realtime/activity-logs?organizationId=${organizationId}`;
    console.log('🔗 Connecting to realtime stream:', url);

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('✅ Realtime connection established');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Skip heartbeat and connection messages
        if (data.type === 'heartbeat' || data.type === 'connected') {
          return;
        }

        // Broadcast to all callbacks
        this.callbacks.forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error('Error in realtime callback:', error);
          }
        });
      } catch (error) {
        console.error('Error parsing realtime event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('❌ Realtime connection error:', error);
      
      // Automatically reconnect after 5 seconds
      setTimeout(() => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          console.log('🔄 Attempting to reconnect...');
          this.disconnect();
          this.connect(organizationId);
        }
      }, 5000);
    };
  }

  /**
   * Subscribe to activity log events
   */
  subscribe(callback: RealtimeEventCallback): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Disconnect from real-time stream
   */
  disconnect() {
    if (this.eventSource) {
      console.log('🔌 Disconnecting from realtime stream');
      this.eventSource.close();
      this.eventSource = null;
    }
    this.callbacks = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Export singleton instance
export const realtimeClient = new RealtimeClient();

