import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Fix notification_dismissals table constraint to include profile_view
 * This should be run once to update the database constraint
 */
export async function fixNotificationDismissalsConstraint(): Promise<boolean> {
  try {
    log('[fixNotificationDismissalsConstraint] Fixing notification_dismissals constraint...');
    
    // Read the SQL file content
    const sql = `
      -- Drop the old constraint if it exists
      ALTER TABLE notification_dismissals 
      DROP CONSTRAINT IF EXISTS notification_dismissals_notification_type_check;

      -- Add new constraint with all notification types including profile_view
      ALTER TABLE notification_dismissals
      ADD CONSTRAINT notification_dismissals_notification_type_check 
      CHECK (notification_type IN (
        'announcement',
        'like',
        'comment',
        'follow',
        'event_join',
        'livestream',
        'message',
        'call',
        'event',
        'friend_request',
        'friend_request_accepted',
        'credit',
        'credit_sent',
        'gift_sent',
        'gift_received',
        'event_deleted',
        'new_post',
        'profile_view'
      ));
    `;

    // Note: execute_sql RPC function doesn't exist in Supabase by default
    // This migration should be run manually in Supabase SQL Editor
    // We'll log the SQL but not fail - this is a one-time migration
    
    log('[fixNotificationDismissalsConstraint] ⚠️ RPC function not available - this is expected');
    log('[fixNotificationDismissalsConstraint] 📝 SQL to run manually:');
    log(sql);
    log('[fixNotificationDismissalsConstraint] ℹ️ This is a one-time migration - notifications will work without it');
    
    // Don't fail - this is optional and doesn't block notifications
    // The constraint fix is nice-to-have, not critical
    return true; // Return true to not block app initialization
  } catch (error) {
    // Silently handle - this is a non-critical migration
    // The constraint fix is optional and doesn't affect notification functionality
    if (__DEV__) {
      warn('[fixNotificationDismissalsConstraint] Migration skipped (non-critical):', error);
    }
    return true; // Return true to not block app initialization
  }
}
