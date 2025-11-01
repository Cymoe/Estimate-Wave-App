import { Router, Request, Response } from 'express';
import { ActivityLog } from '../models';

const router = Router();

// GET all activity logs for an organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, userId, resourceType, limit = '50' } = req.query;
    const query: any = {};
    
    if (organizationId) query.organizationId = organizationId;
    if (userId) query.userId = userId;
    if (resourceType) query.resourceType = resourceType;
    
    const logs = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string));
    
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// GET activity log by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const log = await ActivityLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Activity log not found' });
    }
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

// POST create new activity log
router.post('/', async (req: Request, res: Response) => {
  try {
    const log = new ActivityLog(req.body);
    await log.save();
    res.status(201).json(log);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create activity log' });
  }
});

export default router;

