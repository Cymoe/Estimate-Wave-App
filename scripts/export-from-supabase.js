/**
 * Export Price Book Data from Supabase
 * 
 * Prerequisites:
 *   - Supabase project must be running (unpaused)
 *   - Set SUPABASE_URL and SUPABASE_ANON_KEY in .env
 * 
 * Usage:
 *   node scripts/export-from-supabase.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../apps/web/.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials. Please set:');
  console.error('  VITE_SUPABASE_URL');
  console.error('  VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

async function fetchFromSupabase(table, select = '*') {
  console.log(`Fetching ${table}...`);
  
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ Fetched ${data.length} records from ${table}`);
  return data;
}

async function main() {
  console.log('📦 Exporting Price Book from Supabase\n');
  console.log(`URL: ${SUPABASE_URL}\n`);

  try {
    // Create exports directory
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir);
    }

    // Export cost codes
    console.log('\n📝 Exporting cost codes...');
    const costCodes = await fetchFromSupabase('cost_codes');
    const costCodesFile = path.join(exportsDir, 'cost_codes.json');
    fs.writeFileSync(costCodesFile, JSON.stringify(costCodes, null, 2));
    console.log(`Saved to ${costCodesFile}`);

    // Export line items with cost code details
    console.log('\n📝 Exporting line items...');
    const lineItems = await fetchFromSupabase('line_items', '*,cost_code:cost_codes(name,code)');
    const lineItemsFile = path.join(exportsDir, 'line_items.json');
    fs.writeFileSync(lineItemsFile, JSON.stringify(lineItems, null, 2));
    console.log(`Saved to ${lineItemsFile}`);

    // Create summary
    console.log('\n📊 Export Summary:');
    console.log(`  Cost Codes: ${costCodes.length}`);
    console.log(`  Line Items: ${lineItems.length}`);
    
    // Show pricing statistics
    const withRedLine = lineItems.filter(item => item.red_line_price !== null);
    const withCap = lineItems.filter(item => item.cap_price !== null);
    console.log(`\n💰 Pricing Data:`);
    console.log(`  Items with Red Line: ${withRedLine.length}`);
    console.log(`  Items with Cap: ${withCap.length}`);

    console.log('\n✅ Export complete!');
    console.log('\nNext steps:');
    console.log('  1. Review the exported files in exports/');
    console.log('  2. Import to MongoDB:');
    console.log('     node scripts/import-price-book.js \\');
    console.log('       --cost-codes exports/cost_codes.json \\');
    console.log('       --line-items exports/line_items.json');
    
  } catch (error) {
    console.error('\n❌ Export failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  - Is your Supabase project running (not paused)?');
    console.error('  - Are your credentials correct in .env?');
    console.error('  - Try accessing the Supabase dashboard to verify');
    process.exit(1);
  }
}

main();

