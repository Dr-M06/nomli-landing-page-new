/**
 * Verify IAP Product IDs Match Between Code and Supabase
 * 
 * This script checks if the product IDs in storeKitService.ts match
 * the iap_product_id values in the token_packages table in Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Product IDs from storeKitService.ts
const CODE_PRODUCT_IDS = [
  'com.nomli.mingle.coins.micro',    // $0.99 - 50 tokens
  'com.nomli.mingle.coins.small',    // $4.99 - 300 tokens
  'com.nomli.mingle.coins.medium',   // $9.99 - 700 tokens
  'com.nomli.mingle.coins.large',    // $24.99 - 2000 tokens
  'com.nomli.mingle.coins.mega',     // $49.99 - 4166 tokens
];

async function verifyProductIds() {
  console.log('🔍 Verifying IAP Product IDs...\n');
  console.log('📦 Product IDs in Code (storeKitService.ts):');
  CODE_PRODUCT_IDS.forEach((id, index) => {
    console.log(`   ${index + 1}. ${id}`);
  });
  console.log('');

  try {
    // Fetch token packages from Supabase
    const { data: packages, error } = await supabase
      .from('token_packages')
      .select('id, name, iap_product_id, token_amount, price_usd, is_active')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('❌ Error fetching token packages:', error);
      return;
    }

    if (!packages || packages.length === 0) {
      console.error('❌ No token packages found in database');
      return;
    }

    console.log('📦 Token Packages in Supabase:');
    packages.forEach((pkg, index) => {
      const status = pkg.is_active ? '✅ Active' : '❌ Inactive';
      const iapId = pkg.iap_product_id || '❌ MISSING';
      console.log(`   ${index + 1}. ${pkg.name}`);
      console.log(`      - ID: ${pkg.id}`);
      console.log(`      - IAP Product ID: ${iapId}`);
      console.log(`      - Tokens: ${pkg.token_amount}, Price: $${pkg.price_usd}`);
      console.log(`      - Status: ${status}`);
      console.log('');
    });

    // Compare
    console.log('🔍 Comparison Results:\n');

    const dbProductIds = packages
      .filter(pkg => pkg.iap_product_id)
      .map(pkg => pkg.iap_product_id!);

    const codeProductIds = CODE_PRODUCT_IDS;

    // Check for missing in database
    const missingInDb = codeProductIds.filter(id => !dbProductIds.includes(id));
    if (missingInDb.length > 0) {
      console.log('❌ Product IDs in CODE but NOT in DATABASE:');
      missingInDb.forEach(id => {
        console.log(`   - ${id}`);
      });
      console.log('');
    }

    // Check for missing in code
    const missingInCode = dbProductIds.filter(id => !codeProductIds.includes(id));
    if (missingInCode.length > 0) {
      console.log('⚠️  Product IDs in DATABASE but NOT in CODE:');
      missingInCode.forEach(id => {
        const pkg = packages.find(p => p.iap_product_id === id);
        console.log(`   - ${id} (Package: ${pkg?.name || 'Unknown'})`);
      });
      console.log('');
    }

    // Check for packages without IAP product IDs
    const packagesWithoutIap = packages.filter(pkg => !pkg.iap_product_id);
    if (packagesWithoutIap.length > 0) {
      console.log('⚠️  Packages WITHOUT IAP Product IDs:');
      packagesWithoutIap.forEach(pkg => {
        console.log(`   - ${pkg.name} (ID: ${pkg.id})`);
      });
      console.log('');
    }

    // Check for exact matches
    const matches = codeProductIds.filter(id => dbProductIds.includes(id));
    if (matches.length > 0) {
      console.log('✅ Matching Product IDs:');
      matches.forEach(id => {
        const pkg = packages.find(p => p.iap_product_id === id);
        console.log(`   - ${id} → ${pkg?.name || 'Unknown'}`);
      });
      console.log('');
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   - Total packages in DB: ${packages.length}`);
    console.log(`   - Packages with IAP IDs: ${dbProductIds.length}`);
    console.log(`   - Product IDs in code: ${codeProductIds.length}`);
    console.log(`   - Matches: ${matches.length}`);
    console.log(`   - Missing in DB: ${missingInDb.length}`);
    console.log(`   - Missing in code: ${missingInCode.length}`);
    console.log(`   - Packages without IAP ID: ${packagesWithoutIap.length}`);

    if (missingInDb.length === 0 && missingInCode.length === 0 && packagesWithoutIap.length === 0) {
      console.log('\n✅ All product IDs match!');
    } else {
      console.log('\n⚠️  Mismatches found. Please update database or code to match.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run verification
verifyProductIds()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
