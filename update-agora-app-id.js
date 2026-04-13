#!/usr/bin/env node

// Script to update Agora App ID in .env file
const fs = require('fs');
const path = require('path');

const newAppId = process.argv[2];

if (!newAppId) {
  console.log('Usage: node update-agora-app-id.js YOUR_NEW_APP_ID');
  console.log('Example: node update-agora-app-id.js 1234567890abcdef1234567890abcdef');
  process.exit(1);
}

// Validate App ID format (32 hex characters)
if (!/^[a-f0-9]{32}$/i.test(newAppId)) {
  console.error('❌ Invalid App ID format. Should be 32 hex characters.');
  console.error('❌ Example: 1234567890abcdef1234567890abcdef');
  process.exit(1);
}

const envPath = path.join(__dirname, '.env');

try {
  // Read current .env file
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Update both App IDs
  envContent = envContent.replace(
    /EXPO_PUBLIC_AGORA_APP_ID=.*/,
    `EXPO_PUBLIC_AGORA_APP_ID=${newAppId}`
  );
  envContent = envContent.replace(
    /AGORA_APP_ID=.*/,
    `AGORA_APP_ID=${newAppId}`
  );
  
  // Write back to .env file
  fs.writeFileSync(envPath, envContent);
  
  console.log('✅ Successfully updated Agora App ID in .env file');
  console.log('🔍 New App ID:', newAppId);
  console.log('📱 Please restart Metro bundler: npx expo start --clear');
  
} catch (error) {
  console.error('❌ Error updating .env file:', error.message);
  process.exit(1);
}
