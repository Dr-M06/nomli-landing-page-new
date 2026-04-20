#!/usr/bin/env node

/**
 * Agora Setup Script
 * This script helps you configure the Agora App ID for video calls and live streaming
 */

const fs = require('fs');
const path = require('path');

console.log('🎬 Agora Configuration Setup');
console.log('============================');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);

if (!envExists) {
  console.log('📝 Creating .env file...');
  
  const envContent = `# Agora Configuration for Video Calls and Live Streaming
EXPO_PUBLIC_AGORA_APP_ID=ef36215444d4414083baaf7166b5b06b

# Add your other environment variables here
# EXPO_GEOAPIFY_API_KEY=your_geoapify_key
# WHATSAPP_SUPPORT_NUMBER=your_whatsapp_number
`;

  try {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created successfully');
  } catch (error) {
    console.error('❌ Failed to create .env file:', error.message);
    console.log('📝 Please create a .env file manually with:');
    console.log('   EXPO_PUBLIC_AGORA_APP_ID=ef36215444d4414083baaf7166b5b06b');
  }
} else {
  console.log('✅ .env file already exists');
  
  // Check if Agora App ID is set
  const envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('EXPO_PUBLIC_AGORA_APP_ID')) {
    console.log('✅ Agora App ID is already configured');
  } else {
    console.log('⚠️  Agora App ID not found in .env file');
    console.log('📝 Please add this line to your .env file:');
    console.log('   EXPO_PUBLIC_AGORA_APP_ID=ef36215444d4414083baaf7166b5b06b');
  }
}

console.log('\n🔧 Next Steps:');
console.log('1. Make sure your .env file contains: EXPO_PUBLIC_AGORA_APP_ID=ef36215444d4414083baaf7166b5b06b');
console.log('2. Restart your development server: npm start');
console.log('3. Test video calls and live streaming');
console.log('\n📚 For production, get your own Agora App ID from: https://console.agora.io/');
console.log('   Replace the demo App ID with your own in the .env file');
