import express from 'express';
import { CostCode } from '../models';

const router = express.Router();

/**
 * GET /api/cost-codes
 * List all cost codes
 */
router.get('/', async (req, res) => {
  try {
    const { industryId, category, isActive = 'true' } = req.query;

    const query: any = {};
    if (industryId) query.industry_id = industryId;
    if (category) query.category = category;
    if (isActive === 'true') query.is_active = true;

    const costCodes = await CostCode.find(query)
      .sort({ display_order: 1, code: 1 })
      .lean();

    res.json(costCodes);
  } catch (error: any) {
    console.error('Error fetching cost codes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cost-codes/:id
 * Get a single cost code
 */
router.get('/:id', async (req, res) => {
  try {
    const costCode = await CostCode.findById(req.params.id).lean();
    
    if (!costCode) {
      return res.status(404).json({ error: 'Cost code not found' });
    }
    
    res.json(costCode);
  } catch (error: any) {
    console.error('Error fetching cost code:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/cost-codes
 * Create a new cost code
 */
router.post('/', async (req, res) => {
  try {
    const costCode = new CostCode(req.body);
    await costCode.save();
    
    res.status(201).json(costCode);
  } catch (error: any) {
    console.error('Error creating cost code:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/cost-codes/:id
 * Update a cost code
 */
router.put('/:id', async (req, res) => {
  try {
    const costCode = await CostCode.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!costCode) {
      return res.status(404).json({ error: 'Cost code not found' });
    }
    
    res.json(costCode);
  } catch (error: any) {
    console.error('Error updating cost code:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/cost-codes/:id
 * Delete a cost code
 */
router.delete('/:id', async (req, res) => {
  try {
    const costCode = await CostCode.findByIdAndUpdate(
      req.params.id,
      { is_active: false },
      { new: true }
    );
    
    if (!costCode) {
      return res.status(404).json({ error: 'Cost code not found' });
    }
    
    res.json({ message: 'Cost code deleted', costCode });
  } catch (error: any) {
    console.error('Error deleting cost code:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/cost-codes/bulk
 * Bulk create cost codes (for data import)
 */
router.post('/bulk', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }
    
    const costCodes = await CostCode.insertMany(items, { ordered: false });
    
    res.status(201).json({
      message: `Successfully imported ${costCodes.length} cost codes`,
      count: costCodes.length,
      items: costCodes
    });
  } catch (error: any) {
    console.error('Error bulk creating cost codes:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;

