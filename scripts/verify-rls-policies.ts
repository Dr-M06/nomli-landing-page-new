/**
 * Supabase RLS Policy Verification Script
 * 
 * This script verifies that all critical tables have proper Row Level Security (RLS) policies
 * 
 * Usage:
 * 1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment
 * 2. Run: npx ts-node scripts/verify-rls-policies.ts
 * 
 * Note: This script may show "RLS not enabled" even when RLS is enabled if it cannot
 * query pg_policies via the REST API. For definitive verification, use SQL queries:
 * 
 * SELECT tablename, rowsecurity FROM pg_tables 
 * WHERE schemaname = 'public' 
 * AND tablename IN ('events', 'posts', 'chat_messages', 'profiles');
 * 
 * Or use with Deno:
 * deno run --allow-net --allow-env scripts/verify-rls-policies.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create client with service role key for admin access
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Critical tables and their expected RLS policies
const CRITICAL_TABLES = {
  events: {
    description: 'Events table - users should only update/delete their own events',
    expectedPolicies: [
      {
        name: 'Users can only update their own events',
        check: (policies: any[]) => {
          return policies.some(p => 
            p.definition?.includes('host_id') && 
            p.definition?.includes('auth.uid()') &&
            p.cmd === 'UPDATE'
          );
        },
      },
      {
        name: 'Users can only delete their own events',
        check: (policies: any[]) => {
          return policies.some(p => 
            p.definition?.includes('host_id') && 
            p.definition?.includes('auth.uid()') &&
            p.cmd === 'DELETE'
          );
        },
      },
    ],
  },
  posts: {
    description: 'Posts table - users should only update/delete their own posts',
    expectedPolicies: [
      {
        name: 'Users can only update their own posts',
        check: (policies: any[]) => {
          return policies.some(p => 
            p.definition?.includes('user_id') && 
            p.definition?.includes('auth.uid()') &&
            p.cmd === 'UPDATE'
          );
        },
      },
      {
        name: 'Users can only delete their own posts',
        check: (policies: any[]) => {
          return policies.some(p => 
            p.definition?.includes('user_id') && 
            p.definition?.includes('auth.uid()') &&
            p.cmd === 'DELETE'
          );
        },
      },
    ],
  },
  chat_messages: {
    description: 'Chat messages table - users should only update their own messages',
    expectedPolicies: [
      {
        name: 'Users can only update their own messages',
        check: (policies: any[]) => {
          return policies.some(p => 
            p.definition?.includes('user_id') && 
            p.definition?.includes('auth.uid()') &&
            p.cmd === 'UPDATE'
          );
        },
      },
    ],
  },
  profiles: {
    description: 'Profiles table - users should only update their own profile',
    expectedPolicies: [
      {
        name: 'Users can only update their own profile',
        check: (policies: any[]) => {
          return policies.some(p => 
            (p.definition?.includes('id') || p.definition?.includes('user_id')) && 
            p.definition?.includes('auth.uid()') &&
            p.cmd === 'UPDATE'
          );
        },
      },
    ],
  },
};

// Type for table names
type TableName = keyof typeof CRITICAL_TABLES;

// Type for table config
type TableConfig = typeof CRITICAL_TABLES[TableName];

async function checkRLSEnabled(tableName: string): Promise<boolean> {
  try {
    // Query pg_policies to check if policies exist
    // If policies exist, RLS must be enabled (RLS is required for policies to work)
    const { data: policies, error: policyError } = await supabase
      .from('pg_policies')
      .select('policyname')
      .eq('schemaname', 'public')
      .eq('tablename', tableName)
      .limit(1);
    
    if (policyError) {
      // If query fails, it might be a permissions issue
      // But we know from manual SQL queries that policies exist
      // So RLS must be enabled - return true if we can't verify
      console.warn(`⚠️  Could not query policies for ${tableName}: ${policyError.message}`);
      console.warn(`   Note: If policies exist (verified via SQL), RLS is enabled`);
      // Return false to flag for manual verification
      return false;
    }
    
    // If policies exist, RLS is enabled
    if (policies && policies.length > 0) {
      return true;
    }
    
    // No policies found
    return false;
  } catch (err: any) {
    console.warn(`⚠️  Error checking RLS status for ${tableName}:`, err?.message || err);
    return false;
  }
}

async function getPolicies(tableName: string): Promise<any[]> {
  try {
    // Query pg_policies view
    const { data, error } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('schemaname', 'public')
      .eq('tablename', tableName);
    
    if (error) {
      console.warn(`⚠️  Could not fetch policies for ${tableName}:`, error.message);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.warn(`⚠️  Error fetching policies for ${tableName}:`, err);
    return [];
  }
}

async function verifyTable(tableName: TableName, config: TableConfig) {
  console.log(`\n📋 Checking ${tableName}...`);
  console.log(`   ${config.description}`);
  
  // Check if RLS is enabled
  const rlsEnabled = await checkRLSEnabled(tableName);
  if (!rlsEnabled) {
    console.log(`   ❌ RLS is NOT enabled for ${tableName}`);
    console.log(`   ⚠️  CRITICAL: Enable RLS with: ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
    return { tableName, status: 'FAILED', issues: ['RLS not enabled'] };
  }
  
  console.log(`   ✅ RLS is enabled`);
  
  // Get policies
  const policies = await getPolicies(tableName);
  console.log(`   📝 Found ${policies.length} policies`);
  
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // Check each expected policy
  for (const expectedPolicy of config.expectedPolicies) {
    const hasPolicy = expectedPolicy.check(policies);
    if (hasPolicy) {
      console.log(`   ✅ ${expectedPolicy.name}`);
    } else {
      console.log(`   ❌ Missing: ${expectedPolicy.name}`);
      issues.push(`Missing policy: ${expectedPolicy.name}`);
    }
  }
  
  // Check for overly permissive policies
  const permissivePolicies = policies.filter(p => p.permissive === 'PERMISSIVE' && p.qual === null);
  if (permissivePolicies.length > 0) {
    warnings.push(`Found ${permissivePolicies.length} permissive policies without qualifiers`);
    console.log(`   ⚠️  Warning: Found permissive policies without qualifiers`);
  }
  
  if (issues.length === 0 && warnings.length === 0) {
    return { tableName, status: 'PASSED', issues: [] };
  }
  
  return { tableName, status: issues.length > 0 ? 'FAILED' : 'WARNING', issues, warnings };
}

async function main() {
  console.log('🔒 Supabase RLS Policy Verification\n');
  console.log('=' .repeat(50));
  
  const results = [];
  
  for (const [tableName, config] of Object.entries(CRITICAL_TABLES) as [TableName, TableConfig][]) {
    const result = await verifyTable(tableName, config);
    results.push(result);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary:\n');
  
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  
  if (failed > 0) {
    console.log('\n❌ CRITICAL ISSUES FOUND:');
    results
      .filter(r => r.status === 'FAILED')
      .forEach(r => {
        console.log(`\n   ${r.tableName}:`);
        r.issues.forEach(issue => console.log(`     - ${issue}`));
      });
    
    console.log('\n⚠️  ACTION REQUIRED: Fix RLS policies before deploying to production');
    process.exit(1);
  }
  
  if (warnings > 0) {
    console.log('\n⚠️  WARNINGS:');
    results
      .filter(r => r.status === 'WARNING')
      .forEach(r => {
        console.log(`\n   ${r.tableName}:`);
        r.warnings?.forEach(warning => console.log(`     - ${warning}`));
      });
  }
  
  if (failed === 0 && warnings === 0) {
    console.log('\n✅ All RLS policies are properly configured!');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}

export { verifyTable, checkRLSEnabled, getPolicies };
