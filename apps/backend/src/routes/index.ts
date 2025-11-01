import { Router } from 'express';
import authRouter from './auth';
import organizationsRouter from './organizations';
import clientsRouter from './clients';
import estimatesRouter from './estimates';
import invoicesRouter from './invoices';
import projectsRouter from './projects';
import activityLogsRouter from './activityLogs';
import lineItemsRouter from './lineItems';
import costCodesRouter from './costCodes';

const router = Router();

// Mount all routes
router.use('/auth', authRouter);
router.use('/organizations', organizationsRouter);
router.use('/clients', clientsRouter);
router.use('/estimates', estimatesRouter);
router.use('/invoices', invoicesRouter);
router.use('/projects', projectsRouter);
router.use('/activity-logs', activityLogsRouter);
router.use('/line-items', lineItemsRouter);
router.use('/cost-codes', costCodesRouter);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;

