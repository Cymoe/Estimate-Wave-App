/**
 * Make a user a super admin (can see all organizations)
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const userSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  name: String,
  picture: String,
  organizationId: String,
  role: {
    type: String,
    enum: ['user', 'admin', 'super_admin'],
    default: 'user',
  },
  lastLogin: Date,
}, {
  timestamps: true,
});

const User = mongoose.model('User', userSchema);

async function makeSuperAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    
    await mongoose.connect(process.env.MONGODB_URI || '', {
      dbName: process.env.DB_NAME || 'redcap',
    });

    console.log('✅ Connected to MongoDB\n');

    // Get your user ID from command line or find by email
    const userIdOrEmail = process.argv[2];

    if (!userIdOrEmail) {
      console.error('❌ Please provide a user ID or email:');
      console.log('   npm run make-admin <userId>');
      console.log('   OR');
      console.log('   npm run make-admin <email>');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Find user by ID or email
    let user;
    if (userIdOrEmail.includes('@')) {
      user = await User.findOne({ email: userIdOrEmail });
    } else {
      user = await User.findById(userIdOrEmail);
    }

    if (!user) {
      console.error(`❌ User not found: ${userIdOrEmail}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Update to super admin
    user.role = 'super_admin';
    await user.save();

    console.log('🎉 User promoted to SUPER ADMIN!\n');
    console.log(`👤 Name: ${user.name}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🆔 ID: ${user._id}`);
    console.log(`👑 Role: ${user.role}`);
    console.log(`🏢 Organization: ${user.organizationId || 'None (can see all)'}\n`);
    console.log('✅ This user can now see and manage ALL organizations!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

makeSuperAdmin();

