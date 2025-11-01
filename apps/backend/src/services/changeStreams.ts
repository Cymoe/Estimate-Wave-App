import { ActivityLog } from '../models';
import { ChangeStream, ChangeStreamDocument } from 'mongodb';

// Store active change stream listeners
const activeStreams: ChangeStream[] = [];

// Type for SSE clients
export interface SSEClient {
  id: string;
  organizationId: string;
  response: any; // Express Response
}

const sseClients: SSEClient[] = [];

/**
 * Start watching activity_logs collection for changes
 * This will emit real-time updates to connected SSE clients
 */
export function startActivityLogChangeStream() {
  console.log('🔄 Starting MongoDB Change Stream for activity_logs...');

  const changeStream = ActivityLog.watch([], {
    fullDocument: 'updateLookup',
  });

  activeStreams.push(changeStream);

  changeStream.on('change', (change: ChangeStreamDocument) => {
    console.log('📡 Change detected in activity_logs:', change.operationType);

    // Extract the full document
    let document = null;
    if (change.operationType === 'insert') {
      document = (change as any).fullDocument;
    } else if (change.operationType === 'update' || change.operationType === 'replace') {
      document = (change as any).fullDocument;
    }

    if (!document) return;

    const organizationId = document.organizationId;

    // Broadcast to all SSE clients in the same organization
    sseClients.forEach((client) => {
      if (client.organizationId === organizationId) {
        try {
          client.response.write(`data: ${JSON.stringify(document)}\n\n`);
        } catch (error) {
          console.error('Error sending SSE update:', error);
        }
      }
    });
  });

  changeStream.on('error', (error) => {
    console.error('❌ Change stream error:', error);
  });

  changeStream.on('end', () => {
    console.log('🔴 Change stream ended');
  });

  return changeStream;
}

/**
 * Register an SSE client to receive real-time updates
 */
export function registerSSEClient(client: SSEClient) {
  sseClients.push(client);
  console.log(`✅ SSE client registered: ${client.id} (Org: ${client.organizationId})`);
  console.log(`👥 Total SSE clients: ${sseClients.length}`);
}

/**
 * Unregister an SSE client
 */
export function unregisterSSEClient(clientId: string) {
  const index = sseClients.findIndex((c) => c.id === clientId);
  if (index !== -1) {
    sseClients.splice(index, 1);
    console.log(`❌ SSE client unregistered: ${clientId}`);
    console.log(`👥 Total SSE clients: ${sseClients.length}`);
  }
}

/**
 * Close all change streams
 */
export async function closeAllChangeStreams() {
  console.log('🛑 Closing all change streams...');
  for (const stream of activeStreams) {
    await stream.close();
  }
  activeStreams.length = 0;
  sseClients.length = 0;
}

