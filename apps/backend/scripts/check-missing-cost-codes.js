const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const lineItemSchema = new mongoose.Schema({}, { strict: false });
const LineItem = mongoose.model('LineItem', lineItemSchema);

mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME || 'redcap' })
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    // Check Architectural Shingles
    const item = await LineItem.findOne({
      organization_id: '690579990e88456eed28453f',
      name: { $regex: /Architectural/i }
    });
    
    if (item) {
      console.log('📋 Found:', item.name);
      console.log('   _id:', item._id);
      console.log('   cost_code_id:', item.cost_code_id);
      console.log('   Has cost_code_id?', !!item.cost_code_id);
    } else {
      console.log('❌ No item found matching "Architectural"');
    }
    
    // List ALL items for this org
    console.log('\n📋 All line items for Pristine Roofing:');
    const allItems = await LineItem.find({
      organization_id: '690579990e88456eed28453f'
    }).select('name cost_code_id');
    
    allItems.forEach(item => {
      const hasCostCode = !!item.cost_code_id;
      const icon = hasCostCode ? '✅' : '❌';
      console.log(`   ${icon} ${item.name} - cost_code_id: ${item.cost_code_id || 'MISSING'}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Done');
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

