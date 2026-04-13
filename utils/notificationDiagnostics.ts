/**
 * Notification Diagnostics Tool
 * Helps diagnose why real-time notifications aren't working
 */

import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';

export interface NotificationDiagnostics {
  realtimeEnabled: boolean;
  subscriptionStatus: string;
  pendingNotifications: number;
  recentNotifications: any[];
  processorRunning: boolean;
}

/**
 * Check if Realtime is enabled on notification_queue table
 */
export async function checkRealtimeEnabled(): Promise<boolean> {
  try {
    // Try to subscribe to a test channel
    const testChannel = supabase.channel('test_realtime_check');
    let subscribed = false;
    
    const subscription = testChannel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notification_queue',
      }, () => {
        subscribed = true;
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
        }
        // Clean up test channel
        setTimeout(() => {
          testChannel.unsubscribe();
        }, 1000);
      });
    
    // Wait a bit for subscription
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return subscribed;
  } catch (err) {
    error('[NotificationDiagnostics] Error checking Realtime:', err);
    return false;
  }
}

/**
 * Get pending notifications count
 */
export async function getPendingNotificationsCount(): Promise<number> {
  try {
    const { count, error: countError } = await supabase
      .from('notification_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    if (countError) {
      warn('[NotificationDiagnostics] Error counting notifications:', countError);
      return 0;
    }
    
    return count || 0;
  } catch (err) {
    error('[NotificationDiagnostics] Error getting pending count:', err);
    return 0;
  }
}

/**
 * Get recent notifications
 */
export async function getRecentNotifications(limit: number = 10): Promise<any[]> {
  try {
    const { data, error: fetchError } = await supabase
      .from('notification_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (fetchError) {
      warn('[NotificationDiagnostics] Error fetching notifications:', fetchError);
      return [];
    }
    
    return data || [];
  } catch (err) {
    error('[NotificationDiagnostics] Error getting recent notifications:', err);
    return [];
  }
}

/**
 * Test notification insertion
 */
export async function testNotificationInsert(recipientId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      warn('[NotificationDiagnostics] No authenticated user for test');
      return false;
    }
    
    const { data, error: insertError } = await supabase
      .from('notification_queue')
      .insert({
        recipient_id: recipientId,
        sender_id: user.id,
        notification_type: 'test',
        message_content: 'Test notification - ' + new Date().toISOString(),
        status: 'pending',
      })
      .select()
      .single();
    
    if (insertError) {
      error('[NotificationDiagnostics] Error inserting test notification:', insertError);
      return false;
    }
    
    log('[NotificationDiagnostics] ✅ Test notification inserted:', data?.id);
    return true;
  } catch (err) {
    error('[NotificationDiagnostics] Error in test insert:', err);
    return false;
  }
}

/**
 * Run full diagnostics
 */
export async function runNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  log('[NotificationDiagnostics] 🔍 Running notification diagnostics...');
  
  const diagnostics: NotificationDiagnostics = {
    realtimeEnabled: await checkRealtimeEnabled(),
    subscriptionStatus: 'unknown',
    pendingNotifications: await getPendingNotificationsCount(),
    recentNotifications: await getRecentNotifications(5),
    processorRunning: false, // This would need to be checked from the processor instance
  };
  
  log('[NotificationDiagnostics] Results:', diagnostics);
  
  return diagnostics;
}
