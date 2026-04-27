/**
 * Generate Apple Client Secret JWT for Supabase
 * 
 * Usage: node scripts/generate-apple-secret.js
 * 
 * Before running, update the values below:
 * - TEAM_ID: Your Apple Team ID
 * - KEY_ID: Your Apple Key ID  
 * - SERVICE_ID: Your Apple Service ID
 * - KEY_FILE: Path to your .p8 key file
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ===== UPDATE THESE VALUES =====
const TEAM_ID = 'R39KBVYLZ8';
const KEY_ID = '3T3786QX69';
const SERVICE_ID = 'com.nomli.mingle2.signin';
const KEY_FILE = '/Users/nomli/Desktop/AuthKey_3T3786QX69.p8';
// ================================

if (!KEY_ID) {
  console.error('❌ Please set KEY_ID in the script');
  process.exit(1);
}

if (!KEY_FILE) {
  console.error('❌ Please set KEY_FILE path in the script');
  process.exit(1);
}

// Read the .p8 private key
const keyPath = path.resolve(KEY_FILE);
if (!fs.existsSync(keyPath)) {
  console.error(`❌ Key file not found: ${keyPath}`);
  process.exit(1);
}

const privateKey = fs.readFileSync(keyPath, 'utf8');

// Create JWT header
const header = {
  alg: 'ES256',
  kid: KEY_ID,
  typ: 'JWT',
};

// Create JWT payload (valid for 6 months)
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + (86400 * 180), // 180 days (6 months)
  aud: 'https://appleid.apple.com',
  sub: SERVICE_ID,
};

// Base64url encode
function base64url(data) {
  return Buffer.from(JSON.stringify(data))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Sign the JWT
const headerEncoded = base64url(header);
const payloadEncoded = base64url(payload);
const signatureInput = `${headerEncoded}.${payloadEncoded}`;

const sign = crypto.createSign('SHA256');
sign.update(signatureInput);
const signature = sign.sign(privateKey, 'base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const jwt = `${signatureInput}.${signature}`;

console.log('\n✅ Apple Client Secret JWT generated!\n');
console.log('Copy this entire value and paste it into Supabase:\n');
console.log(jwt);
console.log('\n⚠️  This secret expires in 6 months. Set a reminder to regenerate it.\n');
