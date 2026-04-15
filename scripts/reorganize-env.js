#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read current .env file
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Parse environment variables
const envVars = {};
const lines = envContent.split('\n');

lines.forEach(line => {
  line = line.trim();
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      envVars[key] = valueParts.join('=');
    }
  }
});

// Categorize variables
const publicVars = {};
const serverVars = {};
const devVars = {};

Object.entries(envVars).forEach(([key, value]) => {
  if (key.startsWith('EXPO_PUBLIC_')) {
    if (key.includes('AGORA')) {
      devVars[key] = value; // Agora should be server-side only
    } else {
      publicVars[key] = value;
    }
  } else if (key.includes('AGORA') || key.includes('TOKEN')) {
    serverVars[key] = value;
  } else {
    publicVars[key] = value;
  }
});

// Generate new .env content
const newEnvContent = `# ===========================================
# NOMLI MINGLE - ENVIRONMENT VARIABLES
# ===========================================
# This file contains all environment variables organized by security level

# ===========================================
# PUBLIC VARIABLES (Visible in client-side code)
# ===========================================
# These variables are accessible in React Native/Expo client code
# Use EXPO_PUBLIC_ prefix for client-side access

${Object.entries(publicVars).map(([key, value]) => `${key}=${value}`).join('\n')}

# ===========================================
# SERVER-SIDE VARIABLES (NOT visible in client)
# ===========================================
# These variables are only accessible on the server-side
# Use without EXPO_PUBLIC_ prefix for security

${Object.entries(serverVars).map(([key, value]) => `${key}=${value}`).join('\n')}

# ===========================================
# DEVELOPMENT OVERRIDES (TEMPORARY - NOT SECURE)
# ===========================================
# These are for development/testing only
# Remove or comment out for production

${Object.entries(devVars).map(([key, value]) => `# ${key}=${value}`).join('\n')}
`;

// Write new .env file
fs.writeFileSync(envPath, newEnvContent);

console.log('✅ Environment variables reorganized!');
console.log('📁 Public variables:', Object.keys(publicVars).length);
console.log('🔒 Server variables:', Object.keys(serverVars).length);
console.log('⚠️  Development variables (commented):', Object.keys(devVars).length);
console.log('\n🔍 Check your .env file for the new organization!');
