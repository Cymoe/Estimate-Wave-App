import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDatabase } from './config/database';
import routes from './routes';
import realtimeRouter from './routes/realtime';
import { startActivityLogChangeStream, closeAllChangeStreams } from './services/changeStreams';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize database connection
let dbInitialized = false;
async function initializeDatabase() {
  if (!dbInitialized) {
    await connectDatabase();
    // Only start change streams in non-serverless environments
    if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production') {
      startActivityLogChangeStream();
    }
    dbInitialized = true;
  }
}

// Database initialization middleware (must be before routes)
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    console.error('Database initialization failed:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Mount API routes
app.use('/api', routes);
app.use('/api/realtime', realtimeRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'RedCap Sales & Pricing API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      organizations: '/api/organizations',
      clients: '/api/clients',
      estimates: '/api/estimates',
      invoices: '/api/invoices',
      projects: '/api/projects',
      activityLogs: '/api/activity-logs',
      realtime: '/api/realtime/activity-logs?organizationId=xxx',
    },
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server (for local development)
async function startServer() {
  try {
    // Connect to MongoDB
    await initializeDatabase();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API: http://localhost:${PORT}/api`);
      console.log(`💓 Health: http://localhost:${PORT}/api/health`);
      console.log(`📊 Realtime: http://localhost:${PORT}/api/realtime/activity-logs\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing gracefully...');
  await closeAllChangeStreams();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Closing gracefully...');
  await closeAllChangeStreams();
  process.exit(0);
});

// Start the server for local development only
if (process.env.VERCEL !== '1') {
  startServer();
}

// Export for Vercel serverless (must be at top level)
export default app;

