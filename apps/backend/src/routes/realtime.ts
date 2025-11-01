import { Router, Request, Response } from 'express';
import { registerSSEClient, unregisterSSEClient } from '../services/changeStreams';
import { randomUUID } from 'crypto';

const router = Router();

/**
 * Server-Sent Events (SSE) endpoint for real-time updates
 * Usage: const eventSource = new EventSource('/api/realtime/activity-logs?organizationId=xxx');
 */
router.get('/activity-logs', (req: Request, res: Response) => {
  const { organizationId } = req.query;

  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ error: 'organizationId is required' });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Generate unique client ID
  const clientId = randomUUID();

  // Register this client
  registerSSEClient({
    id: clientId,
    organizationId,
    response: res,
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterSSEClient(clientId);
    res.end();
  });
});

export default router;

