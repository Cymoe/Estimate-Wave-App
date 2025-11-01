/**
 * Seed Pricing Modes
 * Run with: npx tsx scripts/seed-pricing-modes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'redcap';

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

const PricingMode = mongoose.model('PricingMode', pricingModeSchema);

const presetModes = [
  {
    name: 'Need This Job',
    icon: '💰',
    description: 'Aggressive pricing to secure work',
    adjustments: { all: 0.85 },
    is_preset: true
  },
  {
    name: 'Competitive',
    icon: '🎯',
    description: 'Win more bids with lower margins',
    adjustments: { all: 0.90 },
    is_preset: true
  },
  {
    name: 'Busy Season',
    icon: '☀️',
    description: 'Peak demand pricing',
    adjustments: { all: 1.15 },
    is_preset: true
  }
];

async function seedPricingModes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME
    });
    console.log('✅ Connected to MongoDB');

    // Clear existing preset pricing modes
    console.log('\n🗑️  Clearing existing preset pricing modes...');
    await PricingMode.deleteMany({ is_preset: true });
    console.log('✅ Cleared existing presets');

    // Create pricing modes
    console.log('\n📋 Creating pricing modes...');
    for (const modeData of presetModes) {
      const mode = await PricingMode.create(modeData);
      const adjustment = mode.adjustments.all || Object.values(mode.adjustments).find(v => v) || 1.0;
      const percent = Math.round((adjustment - 1) * 100);
      const sign = percent > 0 ? '+' : '';
      console.log(`   ${mode.icon} ${mode.name.padEnd(20)} (${sign}${percent}%)`);
    }

    console.log('\n✅ Seeding complete!');
    console.log(`\n📊 Summary:`);
    console.log(`   • ${presetModes.length} pricing modes created`);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedPricingModes();

