#!/usr/bin/env node

/**
 * Setup script for notification processor
 * This will help you get the service role key and set up the processor
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 NOTIFICATION PROCESSOR SETUP');
console.log('================================\n');

console.log('📋 Your Supabase Configuration:');
console.log(`   URL: https://kankyfankhhwqalvilen.supabase.co`);
console.log(`   Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n`);

console.log('🔑 You need to get your SERVICE ROLE KEY:');
console.log('   1. Go to https://supabase.com/dashboard');
console.log('   2. Select your project: kankyfankhhwqalvilen');
console.log('   3. Go to Settings → API');
console.log('   4. Copy the "service_role" key (starts with "eyJ...")');
console.log('   5. This key has admin access - keep it secret!\n');

rl.question('📝 Paste your SERVICE ROLE KEY here: ', (serviceRoleKey) => {
  if (!serviceRoleKey || !serviceRoleKey.startsWith('eyJ')) {
    console.log('❌ Invalid service role key. Please try again.');
    rl.close();
    return;
  }

  // Generate a random secret
  const processorSecret = 'np_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  console.log('\n✅ SETUP COMPLETE!');
  console.log('==================\n');
  
  console.log('🌐 RENDER DEPLOYMENT SETTINGS:');
  console.log('   Name: nomli-notification-processor');
  console.log('   Root Directory: notification-processor');
  console.log('   Build Command: npm install');
  console.log('   Start Command: npm start\n');
  
  console.log('🔧 ENVIRONMENT VARIABLES FOR RENDER:');
  console.log('   SUPABASE_URL=https://kankyfankhhwqalvilen.supabase.co');
  console.log(`   SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`);
  console.log(`   NOTIFICATION_PROCESSOR_SECRET=${processorSecret}\n`);
  
  console.log('📱 APP ENVIRONMENT VARIABLES:');
  console.log('   Add these to your .env file:');
  console.log(`   EXPO_PUBLIC_NOTIFICATION_PROCESSOR_URL=https://nomli-notification-processor.onrender.com`);
  console.log(`   EXPO_PUBLIC_NOTIFICATION_PROCESSOR_SECRET=${processorSecret}\n`);
  
  console.log('🚀 NEXT STEPS:');
  console.log('   1. Deploy to Render with the settings above');
  console.log('   2. Add the app environment variables to your .env');
  console.log('   3. Test the processor endpoint');
  console.log('   4. Set up the database trigger\n');
  
  console.log('🧪 TEST COMMAND (after deployment):');
  console.log(`   curl -X POST https://nomli-notification-processor.onrender.com/process-notifications \\`);
  console.log(`     -H "x-processor-secret: ${processorSecret}" \\`);
  console.log(`     -H "Content-Type: application/json"`);
  
  rl.close();
});
