/**
 * Create Sample Price Book Data
 * Adds common construction items to get started
 * 
 * Usage: node scripts/create-sample-pricebook.js
 */

const API_URL = 'http://localhost:3001';

const sampleCostCodes = [
  { code: '01000', name: 'General Requirements', category: 'General' },
  { code: '02000', name: 'Site Construction', category: 'Site Work' },
  { code: '03000', name: 'Concrete', category: 'Concrete Work' },
  { code: '04000', name: 'Masonry', category: 'Masonry' },
  { code: '05000', name: 'Metals', category: 'Metal Work' },
  { code: '06000', name: 'Wood, Plastics, Composites', category: 'Carpentry' },
  { code: '07000', name: 'Thermal & Moisture Protection', category: 'Waterproofing' },
  { code: '08000', name: 'Openings', category: 'Doors & Windows' },
  { code: '09000', name: 'Finishes', category: 'Finishes' },
  { code: '21000', name: 'Fire Suppression', category: 'MEP' },
  { code: '22000', name: 'Plumbing', category: 'MEP' },
  { code: '23000', name: 'HVAC', category: 'MEP' },
  { code: '26000', name: 'Electrical', category: 'MEP' },
];

const sampleLineItems = [
  // Carpentry
  {
    name: 'Door Installation - Interior Standard',
    description: 'Single interior door with hardware',
    base_price: 250.00,
    red_line_price: 175.00,
    cap_price: 375.00,
    unit: 'each',
    service_category: 'Carpentry',
    estimated_hours: 3,
    skill_level: 'Intermediate'
  },
  {
    name: 'Door Installation - Exterior',
    description: 'Exterior door with weather stripping',
    base_price: 450.00,
    red_line_price: 325.00,
    cap_price: 650.00,
    unit: 'each',
    service_category: 'Carpentry',
    estimated_hours: 4,
    skill_level: 'Advanced'
  },
  {
    name: 'Crown Molding Installation',
    description: 'Crown molding per linear foot',
    base_price: 8.50,
    red_line_price: 6.00,
    cap_price: 12.00,
    unit: 'linear foot',
    service_category: 'Trim Carpentry',
    estimated_hours: 0.15,
    skill_level: 'Advanced'
  },
  {
    name: 'Baseboard Installation',
    description: 'Baseboard trim per linear foot',
    base_price: 5.00,
    red_line_price: 3.50,
    cap_price: 7.50,
    unit: 'linear foot',
    service_category: 'Trim Carpentry',
    estimated_hours: 0.1,
    skill_level: 'Intermediate'
  },
  {
    name: 'Cabinet Installation - Kitchen',
    description: 'Kitchen cabinet installation per linear foot',
    base_price: 150.00,
    red_line_price: 100.00,
    cap_price: 225.00,
    unit: 'linear foot',
    service_category: 'Cabinetry',
    estimated_hours: 2,
    skill_level: 'Advanced'
  },
  
  // Flooring
  {
    name: 'Hardwood Flooring Installation',
    description: 'Solid hardwood flooring per square foot',
    base_price: 12.00,
    red_line_price: 9.00,
    cap_price: 18.00,
    unit: 'square foot',
    service_category: 'Flooring',
    estimated_hours: 0.25,
    skill_level: 'Advanced'
  },
  {
    name: 'Tile Installation - Floor',
    description: 'Ceramic or porcelain tile per square foot',
    base_price: 8.00,
    red_line_price: 6.00,
    cap_price: 12.00,
    unit: 'square foot',
    service_category: 'Flooring',
    estimated_hours: 0.2,
    skill_level: 'Intermediate'
  },
  
  // Painting
  {
    name: 'Interior Painting - Walls',
    description: 'Interior wall painting per square foot',
    base_price: 2.50,
    red_line_price: 1.75,
    cap_price: 4.00,
    unit: 'square foot',
    service_category: 'Painting',
    estimated_hours: 0.05,
    skill_level: 'Beginner'
  },
  {
    name: 'Exterior Painting',
    description: 'Exterior painting per square foot',
    base_price: 3.50,
    red_line_price: 2.50,
    cap_price: 5.00,
    unit: 'square foot',
    service_category: 'Painting',
    estimated_hours: 0.08,
    skill_level: 'Intermediate'
  },
  
  // Drywall
  {
    name: 'Drywall Installation',
    description: 'Drywall installation and finishing per square foot',
    base_price: 2.25,
    red_line_price: 1.50,
    cap_price: 3.50,
    unit: 'square foot',
    service_category: 'Drywall',
    estimated_hours: 0.08,
    skill_level: 'Intermediate'
  },
  {
    name: 'Drywall Repair',
    description: 'Small to medium drywall repair',
    base_price: 125.00,
    red_line_price: 75.00,
    cap_price: 200.00,
    unit: 'each',
    service_category: 'Drywall',
    estimated_hours: 2,
    skill_level: 'Beginner'
  },
  
  // Electrical
  {
    name: 'Outlet Installation',
    description: 'Standard electrical outlet installation',
    base_price: 150.00,
    red_line_price: 100.00,
    cap_price: 225.00,
    unit: 'each',
    service_category: 'Electrical',
    estimated_hours: 1,
    skill_level: 'Licensed'
  },
  {
    name: 'Light Fixture Installation',
    description: 'Standard light fixture installation',
    base_price: 175.00,
    red_line_price: 125.00,
    cap_price: 275.00,
    unit: 'each',
    service_category: 'Electrical',
    estimated_hours: 1.5,
    skill_level: 'Licensed'
  },
  
  // Plumbing
  {
    name: 'Faucet Installation',
    description: 'Kitchen or bathroom faucet installation',
    base_price: 200.00,
    red_line_price: 150.00,
    cap_price: 300.00,
    unit: 'each',
    service_category: 'Plumbing',
    estimated_hours: 2,
    skill_level: 'Licensed'
  },
  {
    name: 'Toilet Installation',
    description: 'Standard toilet installation',
    base_price: 250.00,
    red_line_price: 175.00,
    cap_price: 375.00,
    unit: 'each',
    service_category: 'Plumbing',
    estimated_hours: 2.5,
    skill_level: 'Licensed'
  },
];

async function createCostCodes() {
  console.log('\n📋 Creating cost codes...');
  
  const costCodeMap = {};
  
  for (const code of sampleCostCodes) {
    try {
      const response = await fetch(`${API_URL}/api/cost-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...code, is_active: true }),
      });
      
      const created = await response.json();
      costCodeMap[code.category] = created._id;
      console.log(`  ✅ ${code.name} (${code.code})`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${code.name}:`, error.message);
    }
  }
  
  return costCodeMap;
}

async function createLineItems(costCodeMap) {
  console.log('\n📦 Creating line items...');
  
  const categoryToCostCode = {
    'Carpentry': 'Carpentry',
    'Trim Carpentry': 'Carpentry',
    'Cabinetry': 'Carpentry',
    'Flooring': 'Finishes',
    'Painting': 'Finishes',
    'Drywall': 'Finishes',
    'Electrical': 'MEP',
    'Plumbing': 'MEP',
  };
  
  for (const item of sampleLineItems) {
    try {
      const costCodeCategory = categoryToCostCode[item.service_category] || 'General';
      const cost_code_id = costCodeMap[costCodeCategory] || costCodeMap['General'];
      
      const response = await fetch(`${API_URL}/api/line-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          cost_code_id,
          organization_id: '69019f3f4a8998be12afe670',
          user_id: 'dev-user-123',
          is_active: true,
        }),
      });
      
      await response.json();
      console.log(`  ✅ ${item.name} ($${item.red_line_price}-$${item.cap_price})`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${item.name}:`, error.message);
    }
  }
}

async function main() {
  console.log('🎯 Creating Sample Price Book for RedCap\n');
  console.log('This will add common construction items to get you started.\n');
  
  try {
    const costCodeMap = await createCostCodes();
    await createLineItems(costCodeMap);
    
    console.log('\n✅ Sample price book created!');
    console.log('\n📊 Summary:');
    console.log(`  Cost Codes: ${sampleCostCodes.length}`);
    console.log(`  Line Items: ${sampleLineItems.length}`);
    console.log('\n🎯 Next steps:');
    console.log('  1. Open http://localhost:3000/price-book');
    console.log('  2. Review and customize the items');
    console.log('  3. Add your own specific services');
    console.log('  4. Start creating estimates!');
    
  } catch (error) {
    console.error('\n❌ Failed to create sample data:', error.message);
    console.error('\nMake sure the backend is running:');
    console.error('  cd apps/backend && npm run dev');
  }
}

main();

