/**
 * Create 3 test organizations in MongoDB
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

// Organization Schema (simplified)
const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  industryId: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  zip: String,
  country: { type: String, default: 'US' },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'organizations',
});

const Organization = mongoose.model('Organization', organizationSchema);

// 3 Organizations
const testOrgs = [
  {
    name: 'Campos Family Services',
    slug: 'campos-family-services',
    industryId: 'general-construction',
    email: 'contact@camposfamily.com',
    phone: '(555) 100-0001',
    address: '100 Service Street',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90001',
    country: 'US',
    settings: {
      defaultTaxRate: 9.5,
      currency: 'USD',
    },
    isActive: true,
  },
  {
    name: 'Vivo Painting',
    slug: 'vivo-painting',
    industryId: 'painting',
    email: 'info@vivopainting.com',
    phone: '(555) 200-0002',
    address: '200 Painter Lane',
    city: 'San Diego',
    state: 'CA',
    zip: '92101',
    country: 'US',
    settings: {
      defaultTaxRate: 9.5,
      currency: 'USD',
    },
    isActive: true,
  },
  {
    name: 'Pristine Roofing',
    slug: 'pristine-roofing',
    industryId: 'roofing',
    email: 'hello@pristineroofing.com',
    phone: '(555) 300-0003',
    address: '300 Roof Ridge Road',
    city: 'San Francisco',
    state: 'CA',
    zip: '94102',
    country: 'US',
    settings: {
      defaultTaxRate: 9.5,
      currency: 'USD',
    },
    isActive: true,
  },
];

async function createTestOrgs() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('URI:', process.env.MONGODB_URI?.replace(/:[^:]*@/, ':****@')); // Hide password
    
    await mongoose.connect(process.env.MONGODB_URI || '', {
      dbName: process.env.DB_NAME || 'redcap',
    });

    console.log('✅ Connected to MongoDB\n');

    // Check if orgs already exist
    for (const orgData of testOrgs) {
      const existing = await Organization.findOne({ slug: orgData.slug });
      
      if (existing) {
        console.log(`⏭️  Skipping "${orgData.name}" - already exists (ID: ${existing._id})`);
      } else {
        const org = await Organization.create(orgData);
        console.log(`✅ Created "${orgData.name}"`);
        console.log(`   ID: ${org._id}`);
        console.log(`   Slug: ${org.slug}`);
        console.log(`   Email: ${org.email}`);
        console.log(`   Location: ${org.city}, ${org.state}\n`);
      }
    }

    console.log('\n🎉 Done! Test organizations ready.');
    console.log('\nTo view all organizations:');
    console.log('curl https://redlinebackend.vercel.app/api/organizations\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createTestOrgs();

