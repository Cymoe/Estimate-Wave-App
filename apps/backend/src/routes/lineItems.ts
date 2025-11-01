import express from 'express';
import { LineItem, CostCode } from '../models';

const router = express.Router();

/**
 * GET /api/line-items
 * List line items for an organization
 * Supports filtering by cost code, category, search, etc.
 */
router.get('/', async (req, res) => {
  try {
    const { 
      organizationId, 
      costCodeId, 
      category, 
      search, 
      isActive = 'true',
      includeShared = 'true' // Include industry-standard shared items
    } = req.query;

    // Build query
    const query: any = {};
    
    // Organization filter - include org-specific AND shared (null org_id)
    if (organizationId && includeShared === 'true') {
      query.$or = [
        { organization_id: organizationId },
        { organization_id: null } // Shared items
      ];
    } else if (organizationId) {
      query.organization_id = organizationId;
    }

    if (costCodeId) query.cost_code_id = costCodeId;
    if (category) query.service_category = category;
    if (isActive === 'true') query.is_active = true;
    
    // Text search
    if (search) {
      query.$text = { $search: search as string };
    }

    const lineItems = await LineItem.find(query)
      .sort({ display_order: 1, name: 1 })
      .lean();

    // Optionally populate cost code info
    const lineItemsWithCostCodes = await Promise.all(
      lineItems.map(async (item) => {
        const costCode = await CostCode.findById(item.cost_code_id).lean();
        return {
          ...item,
          cost_code: costCode ? {
            id: costCode._id,
            name: costCode.name,
            code: costCode.code,
            category: costCode.category
          } : null
        };
      })
    );

    res.json(lineItemsWithCostCodes);
  } catch (error: any) {
    console.error('Error fetching line items:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/line-items/:id
 * Get a single line item by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const lineItem = await LineItem.findById(req.params.id).lean();
    
    if (!lineItem) {
      return res.status(404).json({ error: 'Line item not found' });
    }

    // Populate cost code
    const costCode = await CostCode.findById(lineItem.cost_code_id).lean();
    
    res.json({
      ...lineItem,
      cost_code: costCode ? {
        id: costCode._id,
        name: costCode.name,
        code: costCode.code,
        category: costCode.category
      } : null
    });
  } catch (error: any) {
    console.error('Error fetching line item:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/line-items
 * Create a new line item
 */
router.post('/', async (req, res) => {
  try {
    const lineItem = new LineItem(req.body);
    await lineItem.save();
    
    res.status(201).json(lineItem);
  } catch (error: any) {
    console.error('Error creating line item:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/line-items/:id
 * Update a line item
 */
router.put('/:id', async (req, res) => {
  try {
    const lineItem = await LineItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!lineItem) {
      return res.status(404).json({ error: 'Line item not found' });
    }
    
    res.json(lineItem);
  } catch (error: any) {
    console.error('Error updating line item:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/line-items/:id
 * Delete a line item (soft delete - set is_active = false)
 */
router.delete('/:id', async (req, res) => {
  try {
    const lineItem = await LineItem.findByIdAndUpdate(
      req.params.id,
      { is_active: false },
      { new: true }
    );
    
    if (!lineItem) {
      return res.status(404).json({ error: 'Line item not found' });
    }
    
    res.json({ message: 'Line item deleted', lineItem });
  } catch (error: any) {
    console.error('Error deleting line item:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/line-items/bulk
 * Bulk create line items (for data import)
 */
router.post('/bulk', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }
    
    const lineItems = await LineItem.insertMany(items, { ordered: false });
    
    res.status(201).json({
      message: `Successfully imported ${lineItems.length} line items`,
      count: lineItems.length,
      items: lineItems
    });
  } catch (error: any) {
    console.error('Error bulk creating line items:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;

