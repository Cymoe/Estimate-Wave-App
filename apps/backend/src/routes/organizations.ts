import { Router, Request, Response } from 'express';
import { Organization } from '../models';

const router = Router();

// GET all organizations for a user (will add auth later)
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizations = await Organization.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(organizations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// GET organization by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(organization);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// POST create new organization
router.post('/', async (req: Request, res: Response) => {
  try {
    const organization = new Organization(req.body);
    await organization.save();
    res.status(201).json(organization);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create organization' });
  }
});

// PATCH update organization
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(organization);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update organization' });
  }
});

// DELETE organization (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

export default router;

