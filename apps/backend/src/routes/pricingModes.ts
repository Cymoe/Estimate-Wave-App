import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Define PricingMode schema inline
const pricingModeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  icon: String,
  description: String,
  adjustments: {
    all: Number,
    labor: Number,
    materials: Number,
    services: Number,
    installation: Number,
    equipment: Number,
    subcontractor: Number
  },
  is_preset: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  usage_count: { type: Number, default: 0 },
  successful_estimates: { type: Number, default: 0 },
  total_estimates: { type: Number, default: 0 },
  organization_id: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const PricingMode = mongoose.models.PricingMode || mongoose.model('PricingMode', pricingModeSchema);

/**
 * GET /api/pricing-modes
 * List all pricing modes (presets + org-specific)
 */
router.get('/', async (req, res) => {
  try {
    const { organizationId } = req.query;

    const query: any = { is_active: true };
    
    // Get presets OR organization-specific modes
    if (organizationId) {
      query.$or = [
        { is_preset: true },
        { organization_id: organizationId }
      ];
    } else {
      query.is_preset = true;
    }

    const modes = await PricingMode.find(query)
      .sort({ is_preset: -1, usage_count: -1 })
      .lean();

    // Calculate win rates
    const modesWithWinRate = modes.map(mode => ({
      ...mode,
      id: mode._id.toString(),
      win_rate: mode.total_estimates > 0
        ? Math.round((mode.successful_estimates / mode.total_estimates) * 100)
        : undefined
    }));

    res.json(modesWithWinRate);
  } catch (error: any) {
    console.error('Error fetching pricing modes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pricing-modes/presets
 * Get preset pricing modes only
 */
router.get('/presets', async (req, res) => {
  try {
    const modes = await PricingMode.find({
      is_preset: true,
      is_active: true
    })
      .sort({ name: 1 })
      .lean();

    const formatted = modes.map(mode => ({
      ...mode,
      id: mode._id.toString()
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('Error fetching preset pricing modes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pricing-modes
 * Create a custom pricing mode
 */
router.post('/', async (req, res) => {
  try {
    const mode = new PricingMode({
      ...req.body,
      is_preset: false
    });
    
    await mode.save();
    
    res.status(201).json({
      ...mode.toObject(),
      id: mode._id.toString()
    });
  } catch (error: any) {
    console.error('Error creating pricing mode:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;

