#!/usr/bin/env node

/**
 * Setup Script for Nomli Mingle
 * Automates the setup process for new developers
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Nomli Mingle...\n');

// Check if .env file exists
const envPath = '.env';
const envExampleContent = `# Environment Variables for Nomli Mingle
# Copy this template and fill in your actual values

# ===== REQUIRED CONFIGURATION =====

# Supabase Configuration (required for authentication and database)
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# ===== VIDEO SERVICES =====

# Mux Configuration (for video uploads and streaming)
EXPO_PUBLIC_MUX_ACCESS_TOKEN_ID=your-mux-access-token-id
EXPO_PUBLIC_MUX_ACCESS_TOKEN_SECRET=your-mux-access-token-secret

# ===== MAP SERVICES =====

# Geoapify API (for location services)
EXPO_GEOAPIFY_API_KEY=your-geoapify-api-key

# ===== COMMUNICATION SERVICES =====

# Agora Configuration (for video/voice calls)
EXPO_PUBLIC_AGORA_APP_ID=your-agora-app-id
EXPO_PUBLIC_AGORA_APP_CERTIFICATE=your-agora-app-certificate

# ===== DEVELOPMENT =====
NODE_ENV=development
`;

if (!fs.existsSync(envPath)) {
  try {
    fs.writeFileSync(envPath, envExampleContent);
    console.log('✅ Created .env file with template');
    console.log('📝 Please edit .env and add your actual API keys');
  } catch (error) {
    console.log('❌ Failed to create .env file:', error.message);
  }
} else {
  console.log('✅ .env file already exists');
}

// Check for required packages
console.log('\n📦 Checking dependencies...');

try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredPackages = [
    '@supabase/supabase-js',
    'expo-notifications',
    'react-native-agora',
    'expo-av'
  ];
  
  const missingPackages = requiredPackages.filter(pkg => 
    !packageJson.dependencies[pkg] && !packageJson.devDependencies[pkg]
  );
  
  if (missingPackages.length === 0) {
    console.log('✅ All required packages are installed');
  } else {
    console.log('❌ Missing packages:', missingPackages.join(', '));
  }
} catch (error) {
  console.log('❌ Could not read package.json:', error.message);
}

// Create necessary directories
const requiredDirs = [
  'assets/sounds',
  'migrations',
  'utils'
];

console.log('\n📁 Checking required directories...');
requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    } catch (error) {
      console.log(`❌ Failed to create directory ${dir}:`, error.message);
    }
  } else {
    console.log(`✅ Directory exists: ${dir}`);
  }
});

// Install git hooks to prevent build artifacts
console.log('\n🔧 Installing Git hooks...');
try {
  const { execSync } = require('child_process');
  execSync('./install-git-hooks.sh', { stdio: 'inherit' });
  console.log('✅ Git hooks installed');
} catch (error) {
  console.log('⚠️ Could not install Git hooks:', error.message);
}

// Clean any existing build artifacts
console.log('\n🧹 Cleaning existing build artifacts...');
try {
  const { execSync } = require('child_process');
  execSync('./cleanup.sh', { stdio: 'inherit' });
  console.log('✅ Build artifacts cleaned');
} catch (error) {
  console.log('⚠️ Could not run cleanup script:', error.message);
}

console.log('\n🎯 Setup Summary:');
console.log('1. ✅ Environment file setup');
console.log('2. ✅ Dependencies checked');
console.log('3. ✅ Directory structure verified');
console.log('4. ✅ Git hooks installed (prevents build artifact commits)');
console.log('5. ✅ Build artifacts cleaned');

console.log('\n📋 Next Steps:');
console.log('1. Edit .env file with your actual API keys');
console.log('2. Run: npm install');
console.log('3. Run: npx expo start --clear');
console.log('4. Follow the setup guides in the docs/');

console.log('\n📚 Documentation:');
console.log('- README.md - General setup');
console.log('- NOTIFICATION_SETUP.md - Push notifications');
console.log('- AGORA_SETUP_COMPLETE.md - Video calls');

console.log('\n🔐 Security Reminder:');
console.log('- Never commit your .env file');
console.log('- Keep your API keys secure');
console.log('- Use different keys for development and production');

console.log('\n✨ Setup complete! Happy coding!');
