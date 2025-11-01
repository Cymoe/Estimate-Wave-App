import { Router, Request, Response } from 'express';
import { Estimate } from '../models';

const router = Router();

// GET all estimates for an organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientId, status } = req.query;
    const query: any = {};
    
    if (organizationId) query.organizationId = organizationId;
    if (clientId) query.clientId = clientId;
    if (status) query.status = status;
    
    const estimates = await Estimate.find(query).sort({ issueDate: -1 });
    res.json(estimates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch estimates' });
  }
});

// GET estimate by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch estimate' });
  }
});

// POST create new estimate
router.post('/', async (req: Request, res: Response) => {
  try {
    const estimate = new Estimate(req.body);
    await estimate.save(); // Pre-save hook will calculate totals
    res.status(201).json(estimate);
  } catch (error) {
    console.error('Create estimate error:', error);
    res.status(400).json({ error: 'Failed to create estimate' });
  }
});

// PATCH update estimate
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }
    
    // Update fields
    Object.assign(estimate, req.body);
    await estimate.save(); // Pre-save hook will recalculate totals
    
    res.json(estimate);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update estimate' });
  }
});

// DELETE estimate
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const estimate = await Estimate.findByIdAndDelete(req.params.id);
    if (!estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }
    res.json({ message: 'Estimate deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete estimate' });
  }
});

// POST sign estimate
router.post('/:id/sign', async (req: Request, res: Response) => {
  try {
    const { signature } = req.body;
    const estimate = await Estimate.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          clientSignature: signature,
          signedAt: new Date(),
          status: 'accepted',
        },
      },
      { new: true }
    );
    
    if (!estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }
    
    res.json(estimate);
  } catch (error) {
    res.status(400).json({ error: 'Failed to sign estimate' });
  }
});

export default router;

