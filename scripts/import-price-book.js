/**
 * Import Price Book Data to MongoDB
 * 
 * Usage:
 *   node scripts/import-price-book.js --cost-codes cost_codes.json --line-items line_items.json
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

async function importData(endpoint, data) {
  console.log(`Importing to ${endpoint}...`);
  
  const response = await fetch(`${API_URL}/api/${endpoint}/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items: data }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Import failed: ${error.error || response.statusText}`);
  }

  const result = await response.json();
  console.log(`✅ Successfully imported ${result.count} items to ${endpoint}`);
  return result;
}

function transformSupabaseToMongo(item) {
  // Transform Supabase UUID to MongoDB ObjectId-compatible string
  // MongoDB will generate new _id on insert
  const transformed = { ...item };
  delete transformed.id; // Remove Supabase ID, let MongoDB generate new one
  return transformed;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let costCodesFile, lineItemsFile;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cost-codes' && i + 1 < args.length) {
      costCodesFile = args[i + 1];
    }
    if (args[i] === '--line-items' && i + 1 < args.length) {
      lineItemsFile = args[i + 1];
    }
  }

  if (!costCodesFile && !lineItemsFile) {
    console.log(`
📦 Price Book Import Tool

Usage:
  node scripts/import-price-book.js --cost-codes cost_codes.json --line-items line_items.json

Options:
  --cost-codes <file>    JSON file with cost codes data
  --line-items <file>    JSON file with line items data

Example:
  node scripts/import-price-book.js \\
    --cost-codes exports/cost_codes.json \\
    --line-items exports/line_items.json

Note: Import cost codes BEFORE line items (line items reference cost codes)
`);
    process.exit(1);
  }

  try {
    // Import cost codes first (line items reference them)
    if (costCodesFile) {
      console.log(`\n📝 Reading cost codes from ${costCodesFile}...`);
      const costCodesData = JSON.parse(fs.readFileSync(costCodesFile, 'utf8'));
      
      // Handle both array and single object
      const costCodes = Array.isArray(costCodesData) ? costCodesData : [costCodesData];
      
      console.log(`Found ${costCodes.length} cost codes`);
      const transformed = costCodes.map(transformSupabaseToMongo);
      await importData('cost-codes', transformed);
    }

    // Import line items
    if (lineItemsFile) {
      console.log(`\n📝 Reading line items from ${lineItemsFile}...`);
      const lineItemsData = JSON.parse(fs.readFileSync(lineItemsFile, 'utf8'));
      
      // Handle both array and single object
      const lineItems = Array.isArray(lineItemsData) ? lineItemsData : [lineItemsData];
      
      console.log(`Found ${lineItems.length} line items`);
      const transformed = lineItems.map(transformSupabaseToMongo);
      await importData('line-items', transformed);
    }

    console.log('\n✅ Import complete! Your Price Book is now in MongoDB.');
    console.log('\nNext steps:');
    console.log('  1. Open http://localhost:3000/price-book');
    console.log('  2. Verify your data looks correct');
    console.log('  3. Test creating a new estimate with your line items');
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    process.exit(1);
  }
}

main();

