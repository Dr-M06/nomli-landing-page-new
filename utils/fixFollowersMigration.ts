import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Fix followers migration for existing installations
 * This handles cases where policies already exist or there are conflicts
 */
export const fixFollowersMigration = async (): Promise<boolean> => {
  try {
    log('🔧 [FollowersFix] Fixing existing followers migration...');
    
    // Step 1: Drop existing policies
    log('[FollowersFix] Dropping existing policies...');
    const dropPoliciesSql = `
      DROP POLICY IF EXISTS "Users can view public follower relationships" ON user_followers;
      DROP POLICY IF EXISTS "Users can follow other users" ON user_followers;
      DROP POLICY IF EXISTS "Users can unfollow other users" ON user_followers;
    `;

    const { error: dropError } = await supabase.rpc('execute_sql', {
      sql: dropPoliciesSql
    });

    if (dropError) {
      error('[FollowersFix] Error dropping policies:', dropError);
      // Continue anyway, might just be that policies don't exist
    } else {
      log('[FollowersFix] Policies dropped successfully');
    }

    // Step 2: Recreate policies with correct references
    log('[FollowersFix] Creating updated policies...');
    const createPoliciesSql = `
      -- Create RLS policies for user_followers
      CREATE POLICY "Users can view public follower relationships" ON user_followers
        FOR SELECT USING (true);

      CREATE POLICY "Users can follow other users" ON user_followers
        FOR INSERT WITH CHECK (auth.uid()::text = follower_id::text);

      CREATE POLICY "Users can unfollow other users" ON user_followers
        FOR DELETE USING (auth.uid()::text = follower_id::text);
    `;

    const { error: createError } = await supabase.rpc('execute_sql', {
      sql: createPoliciesSql
    });

    if (createError) {
      error('[FollowersFix] Error creating policies:', createError);
      return false;
    }

    log('[FollowersFix] Policies created successfully');

    // Step 3: Verify table references are correct
    log('[FollowersFix] Verifying table structure...');
    const { data: tableInfo, error: tableError } = await supabase
      .from('user_followers')
      .select('id')
      .limit(1);

    if (tableError) {
      error('[FollowersFix] Table verification error:', tableError);
      return false;
    }

    log('[FollowersFix] Table structure verified');

    // Step 4: Test permissions
    log('[FollowersFix] Testing permissions...');
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Try to read from the table
      const { error: readError } = await supabase
        .from('user_followers')
        .select('*')
        .limit(1);

      if (readError) {
        error('[FollowersFix] Read permission error:', readError);
        return false;
      }

      log('[FollowersFix] Read permissions working');
    }

    log('✅ [FollowersFix] Migration fix completed successfully!');
    log('');
    log('📋 Fix Summary:');
    log('   ✅ Existing policies dropped');
    log('   ✅ Updated policies created');
    log('   ✅ Table structure verified');
    log('   ✅ Permissions tested');
    log('');
    log('🚀 Your followers system should now work without errors!');
    
    return true;
  } catch (error) {
    error('❌ [FollowersFix] Fix failed:', error);
    return false;
  }
};

/**
 * Quick fix for the most common migration issues
 */
export const quickFixPolicies = async (): Promise<boolean> => {
  try {
    log('⚡ [QuickFix] Applying quick policy fix...');
    
    const fixSql = `
      -- Drop and recreate policies in one go
      DROP POLICY IF EXISTS "Users can view public follower relationships" ON user_followers;
      DROP POLICY IF EXISTS "Users can follow other users" ON user_followers;
      DROP POLICY IF EXISTS "Users can unfollow other users" ON user_followers;
      
      CREATE POLICY "Users can view public follower relationships" ON user_followers
        FOR SELECT USING (true);
      CREATE POLICY "Users can follow other users" ON user_followers
        FOR INSERT WITH CHECK (auth.uid()::text = follower_id::text);
      CREATE POLICY "Users can unfollow other users" ON user_followers
        FOR DELETE USING (auth.uid()::text = follower_id::text);
    `;

    const { error } = await supabase.rpc('execute_sql', {
      sql: fixSql
    });

    if (error) {
      error('[QuickFix] Error:', error);
      return false;
    }

    log('✅ [QuickFix] Quick fix applied successfully!');
    return true;
  } catch (error) {
    error('❌ [QuickFix] Quick fix failed:', error);
    return false;
  }
};
