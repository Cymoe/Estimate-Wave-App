import { useEffect, useState } from 'react';
import { realtimeClient, ActivityLogEvent } from '@/lib/realtime';

/**
 * Hook to manage real-time activity log updates
 * Replaces Supabase Realtime subscriptions
 * 
 * @example
 * function Dashboard() {
 *   const { connected, latestActivity } = useRealtime(organizationId, (event) => {
 *     console.log('New activity:', event);
 *     // Update UI, show notification, etc.
 *   });
 * 
 *   return <div>Connected: {connected ? '✅' : '❌'}</div>;
 * }
 */
export function useRealtime(
  organizationId: string | undefined,
  onActivity?: (event: ActivityLogEvent) => void
) {
  const [connected, setConnected] = useState(false);
  const [latestActivity, setLatestActivity] = useState<ActivityLogEvent | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    // Connect to realtime stream
    realtimeClient.connect(organizationId);
    setConnected(realtimeClient.isConnected());

    // Subscribe to updates
    const unsubscribe = realtimeClient.subscribe((event) => {
      setLatestActivity(event);
      setConnected(true);
      
      // Call optional callback
      if (onActivity) {
        onActivity(event);
      }
    });

    // Check connection status periodically
    const checkConnection = setInterval(() => {
      setConnected(realtimeClient.isConnected());
    }, 5000);

    // Cleanup on unmount
    return () => {
      clearInterval(checkConnection);
      unsubscribe();
    };
  }, [organizationId, onActivity]);

  return {
    connected,
    latestActivity,
  };
}

