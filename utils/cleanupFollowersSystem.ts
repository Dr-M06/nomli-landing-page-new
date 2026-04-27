import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Cleanup/reset the followers system
 * WARNING: This will delete all follower data!
 * Use this only for development or if you need to completely reset the system
 */
export const cleanupFollowersSystem = async (): Promise<boolean> => {
  try {
    log('⚠️  [FollowersCleanup] Starting cleanup (this will delete all follower data)...');
    
    // Step 1: Drop all functions
    const dropFunctionsSql = `
      DROP FUNCTION IF EXISTS get_user_followers(uuid);
      DROP FUNCTION IF EXISTS get_user_following(uuid);
      DROP FUNCTION IF EXISTS is_following(uuid, uuid);
      DROP FUNCTION IF EXISTS get_mutual_followers(uuid, uuid);
      DROP FUNCTION IF EXISTS update_follower_counts();
    `;

    const { error: functionsError } = await supabase.rpc('execute_sql', {
      sql: dropFunctionsSql
    });

    if (functionsError) {
      error('[FollowersCleanup] Error dropping functions:', functionsError);
      return false;
    }

    log('[FollowersCleanup] Functions dropped successfully');

    // Step 2: Drop trigger
    const dropTriggerSql = `
      DROP TRIGGER IF EXISTS trigger_update_follower_counts ON user_followers;
    `;

    const { error: triggerError } = await supabase.rpc('execute_sql', {
      sql: dropTriggerSql
    });

    if (triggerError) {
      error('[FollowersCleanup] Error dropping trigger:', triggerError);
      return false;
    }

    log('[FollowersCleanup] Trigger dropped successfully');

    // Step 3: Drop table (this will delete all follower data)
    const dropTableSql = `
      DROP TABLE IF EXISTS user_followers CASCADE;
    `;

    const { error: tableError } = await supabase.rpc('execute_sql', {
      sql: dropTableSql
    });

    if (tableError) {
      error('[FollowersCleanup] Error dropping table:', tableError);
      return false;
    }

    log('[FollowersCleanup] Table dropped successfully');

    // Step 4: Remove columns from profiles table
    const removeColumnsSql = `
      ALTER TABLE profiles 
      DROP COLUMN IF EXISTS followers_count,
      DROP COLUMN IF EXISTS following_count;
    `;

    const { error: columnsError } = await supabase.rpc('execute_sql', {
      sql: removeColumnsSql
    });

    if (columnsError) {
      error('[FollowersCleanup] Error removing columns:', columnsError);
      return false;
    }

    log('[FollowersCleanup] Columns removed successfully');
    log('✅ [FollowersCleanup] Cleanup completed successfully');
    log('');
    log('📋 Cleanup Summary:');
    log('   ✅ Functions dropped');
    log('   ✅ Trigger dropped');
    log('   ✅ Table dropped (all follower data deleted)');
    log('   ✅ Columns removed from profiles');
    log('');
    log('💡 You can now run setupFollowersSystem() to recreate everything fresh');
    
    return true;
  } catch (error) {
    error('❌ [FollowersCleanup] Cleanup failed:', error);
    return false;
  }
};

/**
 * Reset follower counts only (keeps relationships)
 * This is safer than full cleanup and just resets the count columns
 */
export const resetFollowerCounts = async (): Promise<boolean> => {
  try {
    log('[FollowersReset] Resetting follower counts...');
    
    const resetSql = `
      -- Reset all counts to 0 first
      UPDATE profiles 
      SET followers_count = 0, following_count = 0
      WHERE followers_count IS NOT NULL OR following_count IS NOT NULL;
      
      -- Recalculate actual counts from relationships
      UPDATE profiles 
      SET 
        followers_count = COALESCE((
          SELECT COUNT(*) 
          FROM user_followers 
          WHERE following_id = profiles.id
        ), 0),
        following_count = COALESCE((
          SELECT COUNT(*) 
          FROM user_followers 
          WHERE follower_id = profiles.id
        ), 0);
    `;

    const { error } = await supabase.rpc('execute_sql', {
      sql: resetSql
    });

    if (error) {
      error('[FollowersReset] Error resetting counts:', error);
      return false;
    }

    log('✅ [FollowersReset] Follower counts reset successfully');
    return true;
  } catch (error) {
    error('❌ [FollowersReset] Reset failed:', error);
    return false;
  }
};
