#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up environment variables...\n');

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists!');
  console.log('   If you want to recreate it, delete the existing .env file first.\n');
  process.exit(0);
}

// Create .env.example if it doesn't exist
const envExampleContent = `# Agora Configuration
# Get your Agora App ID from: https://console.agora.io/
EXPO_PUBLIC_AGORA_APP_ID=your_agora_app_id_here

# Supabase Configuration
# Get these from your Supabase project settings
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Optional: WhatsApp support
# WHATSAPP_SUPPORT_NUMBER=your_whatsapp_number

# Optional: Agora token server (for production)
# EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL=your_token_server_url
`;

if (!fs.existsSync(envExamplePath)) {
  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log('✅ Created .env.example file');
}

// Create .env file
const envContent = `# Agora Configuration
# Get your Agora App ID from: https://console.agora.io/
EXPO_PUBLIC_AGORA_APP_ID=your_agora_app_id_here

# Supabase Configuration
# Get these from your Supabase project settings
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Optional: WhatsApp support
# WHATSAPP_SUPPORT_NUMBER=your_whatsapp_number

# Optional: Agora token server (for production)
# EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL=your_token_server_url
`;

fs.writeFileSync(envPath, envContent);

console.log('✅ Created .env file with default Agora App ID');
console.log('📝 Please update the following variables in your .env file:');
console.log('   - EXPO_PUBLIC_SUPABASE_URL');
console.log('   - EXPO_PUBLIC_SUPABASE_ANON_KEY');
console.log('   - Any other optional variables you need\n');

console.log('🔗 Get your credentials from:');
console.log('   - Agora: https://console.agora.io/');
console.log('   - Supabase: https://supabase.com/dashboard\n');

console.log('⚠️  Remember to restart your development server after updating .env');
