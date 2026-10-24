/**
 * Real-time activity updates using a Convex live query.
 * Same interface as the old Server-Sent Events client.
 */

import { api } from "../../convex/_generated/api";
import { convex } from "./convex";

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

const WATCH_LIMIT = 25;

export class RealtimeClient {
  private unwatch: (() => void) | null = null;
  private organizationId: string | null = null;
  private seen = new Set<string>();
  private callbacks: RealtimeEventCallback[] = [];

  /**
   * Subscribe to the organization's activity log. Entries that exist at
   * connect time are treated as history; later ones are broadcast.
   */
  connect(organizationId: string) {
    if (this.unwatch && this.organizationId === organizationId) return;
    this.close();
    this.organizationId = organizationId;

    const watch = convex.watchQuery(api.activityLogs.list, {
      organizationId: organizationId as any,
      limit: WATCH_LIMIT,
    });
    let initialized = false;

    this.unwatch = watch.onUpdate(() => {
      let logs: ActivityLogEvent[] | undefined;
      try {
        logs = watch.localQueryResult() as ActivityLogEvent[] | undefined;
      } catch (error) {
        console.error('❌ Realtime subscription error:', error);
        return;
      }
      if (!logs) return;

      const fresh = logs.filter((log) => !this.seen.has(log._id));
      fresh.forEach((log) => this.seen.add(log._id));
      if (!initialized) {
        initialized = true;
        return;
      }

      // Oldest first, matching the order events happened.
      for (const event of fresh.reverse()) {
        this.callbacks.forEach((callback) => {
          try {
            callback(event);
          } catch (error) {
            console.error('Error in realtime callback:', error);
          }
        });
      }
    });
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
   * Disconnect from real-time updates
   */
  disconnect() {
    this.close();
    this.callbacks = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.unwatch !== null && convex.connectionState().isWebSocketConnected;
  }

  private close() {
    this.unwatch?.();
    this.unwatch = null;
    this.organizationId = null;
    this.seen.clear();
  }
}

// Export singleton instance
export const realtimeClient = new RealtimeClient();
