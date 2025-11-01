/**
 * Seed Roofing Cost Codes and Line Items
 * Run with: node apps/backend/scripts/seed-roofing-data.js
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

// Pristine Roofing org ID
const PRISTINE_ROOFING_ORG_ID = '690579990e88456eed28453f';

// Define schemas inline
const costCodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  category: String,
  unit: String,
  is_active: { type: Boolean, default: true },
  display_order: Number,
  industry_id: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const lineItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  cost_code_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCode' },
  unit: String,
  unit_cost: Number,
  retail_price: Number,
  price: Number, // Current price (defaults to retail_price)
  base_price: Number, // Base/standard price
  red_line_price: Number, // Minimum price (redline)
  cap_price: Number, // Maximum price (cap)
  labor_hours: Number,
  organization_id: { type: String, default: null }, // null = shared/industry-standard
  service_category: String,
  is_active: { type: Boolean, default: true },
  display_order: Number,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const CostCode = mongoose.model('CostCode', costCodeSchema);
const LineItem = mongoose.model('LineItem', lineItemSchema);

const roofingCostCodes = [
  {
    code: 'ROOF-LAB',
    name: 'Roofing Labor',
    description: 'Labor costs for roofing installation and repair',
    category: 'Labor',
    unit: 'hour',
    industry_id: 'roofing',
    display_order: 1
  },
  {
    code: 'ROOF-MAT',
    name: 'Roofing Materials',
    description: 'Shingles, underlayment, and roofing materials',
    category: 'Materials',
    unit: 'square',
    industry_id: 'roofing',
    display_order: 2
  },
  {
    code: 'ROOF-TEAR',
    name: 'Tear-off & Disposal',
    description: 'Removal of old roofing and disposal',
    category: 'Labor',
    unit: 'square',
    industry_id: 'roofing',
    display_order: 3
  },
  {
    code: 'ROOF-FLASH',
    name: 'Flashing & Trim',
    description: 'Metal flashing, drip edge, and trim work',
    category: 'Materials',
    unit: 'linear_foot',
    industry_id: 'roofing',
    display_order: 4
  },
  {
    code: 'ROOF-VENT',
    name: 'Ventilation',
    description: 'Ridge vents, soffit vents, and ventilation components',
    category: 'Materials',
    unit: 'unit',
    industry_id: 'roofing',
    display_order: 5
  }
];

async function seedRoofingData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME
    });
    console.log('✅ Connected to MongoDB');

    // Clear existing roofing data for Pristine Roofing
    console.log('\n🗑️  Clearing existing data for Pristine Roofing...');
    await LineItem.deleteMany({ organization_id: PRISTINE_ROOFING_ORG_ID });
    await CostCode.deleteMany({ industry_id: 'roofing' });
    console.log('✅ Cleared existing data');

    // Create cost codes
    console.log('\n📋 Creating roofing cost codes...');
    const createdCostCodes = [];
    for (const ccData of roofingCostCodes) {
      const costCode = await CostCode.create(ccData);
      createdCostCodes.push(costCode);
      console.log(`   ✅ ${costCode.code} - ${costCode.name}`);
    }

    // Create line items for each cost code
    console.log('\n🛠️  Creating roofing line items...');

    // Roofing Labor items
    const laborCode = createdCostCodes.find(cc => cc.code === 'ROOF-LAB');
    const laborItems = [
      {
        name: 'Shingle Installation - Standard',
        description: 'Standard 3-tab or architectural shingle installation',
        cost_code_id: laborCode._id,
        unit: 'square',
        unit_cost: 150,
        retail_price: 250,
        price: 250,
        base_price: 250,
        red_line_price: 200,
        cap_price: 300,
        labor_hours: 4,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 1
      },
      {
        name: 'Shingle Installation - Premium',
        description: 'Premium architectural or designer shingle installation',
        cost_code_id: laborCode._id,
        unit: 'square',
        unit_cost: 200,
        retail_price: 350,
        price: 350,
        base_price: 350,
        red_line_price: 280,
        cap_price: 420,
        labor_hours: 6,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 2
      },
      {
        name: 'Roof Repair - Small',
        description: 'Small roof repairs, leaks, or shingle replacement',
        cost_code_id: laborCode._id,
        unit: 'hour',
        unit_cost: 75,
        retail_price: 125,
        price: 125,
        base_price: 125,
        red_line_price: 100,
        cap_price: 150,
        labor_hours: 1,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 3
      }
    ];

    // Roofing Materials items
    const materialsCode = createdCostCodes.find(cc => cc.code === 'ROOF-MAT');
    const materialItems = [
      {
        name: 'Asphalt Shingles - 3-Tab',
        description: 'Standard 3-tab asphalt shingles (25-year warranty)',
        cost_code_id: materialsCode._id,
        unit: 'square',
        unit_cost: 85,
        retail_price: 120,
        price: 120,
        base_price: 120,
        red_line_price: 95,
        cap_price: 145,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 1
      },
      {
        name: 'Architectural Shingles',
        description: 'Premium architectural shingles (30-year warranty)',
        cost_code_id: materialsCode._id,
        unit: 'square',
        unit_cost: 125,
        retail_price: 185,
        price: 185,
        base_price: 185,
        red_line_price: 148,
        cap_price: 222,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 2
      },
      {
        name: 'Designer Shingles',
        description: 'High-end designer shingles (50-year warranty)',
        cost_code_id: materialsCode._id,
        unit: 'square',
        unit_cost: 200,
        retail_price: 300,
        price: 300,
        base_price: 300,
        red_line_price: 240,
        cap_price: 360,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 3
      },
      {
        name: 'Underlayment - Synthetic',
        description: 'Premium synthetic underlayment',
        cost_code_id: materialsCode._id,
        unit: 'square',
        unit_cost: 30,
        retail_price: 50,
        price: 50,
        base_price: 50,
        red_line_price: 40,
        cap_price: 60,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 4
      }
    ];

    // Tear-off items
    const tearoffCode = createdCostCodes.find(cc => cc.code === 'ROOF-TEAR');
    const tearoffItems = [
      {
        name: 'Single Layer Tear-off',
        description: 'Remove one layer of existing shingles and dispose',
        cost_code_id: tearoffCode._id,
        unit: 'square',
        unit_cost: 50,
        retail_price: 85,
        price: 85,
        base_price: 85,
        red_line_price: 68,
        cap_price: 102,
        labor_hours: 2,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 1
      },
      {
        name: 'Double Layer Tear-off',
        description: 'Remove two layers of existing shingles and dispose',
        cost_code_id: tearoffCode._id,
        unit: 'square',
        unit_cost: 75,
        retail_price: 125,
        price: 125,
        base_price: 125,
        red_line_price: 100,
        cap_price: 150,
        labor_hours: 3,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 2
      }
    ];

    // Flashing items
    const flashingCode = createdCostCodes.find(cc => cc.code === 'ROOF-FLASH');
    const flashingItems = [
      {
        name: 'Drip Edge',
        description: 'Aluminum or galvanized drip edge',
        cost_code_id: flashingCode._id,
        unit: 'linear_foot',
        unit_cost: 2.5,
        retail_price: 4.5,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 1
      },
      {
        name: 'Valley Flashing',
        description: 'Metal valley flashing installation',
        cost_code_id: flashingCode._id,
        unit: 'linear_foot',
        unit_cost: 8,
        retail_price: 15,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 2
      },
      {
        name: 'Chimney Flashing',
        description: 'Custom chimney flashing and counter-flashing',
        cost_code_id: flashingCode._id,
        unit: 'unit',
        unit_cost: 150,
        retail_price: 300,
        labor_hours: 3,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 3
      }
    ];

    // Ventilation items
    const ventCode = createdCostCodes.find(cc => cc.code === 'ROOF-VENT');
    const ventItems = [
      {
        name: 'Ridge Vent',
        description: 'Continuous ridge vent with filter',
        cost_code_id: ventCode._id,
        unit: 'linear_foot',
        unit_cost: 3,
        retail_price: 6,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 1
      },
      {
        name: 'Roof Vent - Static',
        description: 'Static roof vent (turtle vent)',
        cost_code_id: ventCode._id,
        unit: 'unit',
        unit_cost: 25,
        retail_price: 50,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 2
      },
      {
        name: 'Power Attic Vent',
        description: 'Electric-powered attic ventilation fan',
        cost_code_id: ventCode._id,
        unit: 'unit',
        unit_cost: 200,
        retail_price: 400,
        labor_hours: 2,
        organization_id: PRISTINE_ROOFING_ORG_ID,
        service_category: 'roofing',
        display_order: 3
      }
    ];

    // Helper function to add pricing fields to items that don't have them
    const addPricingFields = (item) => {
      const retailPrice = item.retail_price;
      return {
        ...item,
        price: item.price || retailPrice,
        base_price: item.base_price || retailPrice,
        red_line_price: item.red_line_price || Math.round(retailPrice * 0.8),
        cap_price: item.cap_price || Math.round(retailPrice * 1.2)
      };
    };

    // Insert all line items
    const allLineItems = [
      ...laborItems,
      ...materialItems,
      ...tearoffItems,
      ...flashingItems,
      ...ventItems
    ].map(addPricingFields);

    for (const item of allLineItems) {
      const lineItem = await LineItem.create(item);
      console.log(`   ✅ ${lineItem.name} - $${lineItem.price}/${lineItem.unit} (RED: $${lineItem.red_line_price} | CAP: $${lineItem.cap_price})`);
    }

    console.log('\n✅ Seeding complete!');
    console.log(`\n📊 Summary:`);
    console.log(`   • ${createdCostCodes.length} cost codes created`);
    console.log(`   • ${allLineItems.length} line items created`);
    console.log(`   • Organization: Pristine Roofing (${PRISTINE_ROOFING_ORG_ID})`);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedRoofingData();

