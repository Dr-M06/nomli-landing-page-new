import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export interface LiveStreamCleanupOptions {
  maxAge?: number; // in minutes, default 30
  checkInterval?: number; // in minutes, default 5
}

/**
 * Cleanup dead/stale live streams
 * This will mark streams as inactive if they haven't been updated recently
 */
export const cleanupStaleStreams = async (options: LiveStreamCleanupOptions = {}) => {
  const { maxAge = 30, checkInterval = 5 } = options;
  
  try {
    log('🧹 Starting live stream cleanup...');
    
    // Calculate cutoff time (streams older than maxAge minutes)
    const cutoffTime = new Date(Date.now() - maxAge * 60 * 1000).toISOString();
    
    // Find active streams that haven't been updated recently
    const { data: staleStreams, error: fetchError } = await supabase
      .from('live_streams')
      .select('id, streamer_id, started_at, updated_at')
      .eq('is_live', true)
      .lt('updated_at', cutoffTime);
    
    if (fetchError) {
      error('Error fetching stale streams:', fetchError);
      return;
    }
    
    if (!staleStreams || staleStreams.length === 0) {
      log('✅ No stale streams found');
      return;
    }
    
    log(`🧹 Found ${staleStreams.length} stale streams to cleanup`);
    
    // Mark stale streams as inactive
    // Note: This may fail due to RLS policies if the user doesn't own these streams
    // That's expected - cleanup should ideally run server-side with service role permissions
    const { error: updateError } = await supabase
      .from('live_streams')
      .update({ 
        is_live: false,
        ended_at: new Date().toISOString()
      })
      .in('id', staleStreams.map(stream => stream.id));
    
    if (updateError) {
      // Check if this is an RLS policy violation (expected behavior)
      if (updateError.code === '42501' || updateError.message?.includes('row-level security')) {
        // This is expected - RLS prevents updating streams the user doesn't own
        // Log as warning instead of error to avoid console spam
        warn('⚠️ Stream cleanup skipped (RLS policy restriction - expected behavior)');
        warn('💡 Tip: Run cleanup server-side with service role for full cleanup');
        return;
      }
      // For other errors, log as error
      error('Error cleaning up stale streams:', updateError);
      return;
    }
    
    log(`✅ Successfully cleaned up ${staleStreams.length} stale streams`);
    
    // Also cleanup any orphaned viewer records
    await cleanupOrphanedViewers();
    
  } catch (error) {
    error('Error in cleanupStaleStreams:', error);
  }
};

/**
 * Cleanup orphaned viewer records for inactive streams
 */
export const cleanupOrphanedViewers = async () => {
  try {
    // First, get the IDs of inactive streams
    const { data: inactiveStreams, error: selectError } = await supabase
      .from('live_streams')
      .select('id')
      .eq('is_live', false);
    
    if (selectError) {
      error('Error fetching inactive streams:', selectError);
      return;
    }
    
    if (!inactiveStreams || inactiveStreams.length === 0) {
      log('No inactive streams to clean up');
      return;
    }
    
    // Extract stream IDs
    const streamIds = inactiveStreams.map(stream => stream.id);
    
    // Remove viewer records for inactive streams
    // Note: This may also fail due to RLS policies - handle gracefully
    const { error } = await supabase
      .from('live_stream_viewers')
      .delete()
      .in('stream_id', streamIds);
    
    if (error) {
      // Check if this is an RLS policy violation (expected behavior)
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        warn('⚠️ Viewer cleanup skipped (RLS policy restriction - expected behavior)');
        return;
      }
      // For other errors, log as error
      error('Error cleaning up orphaned viewers:', error);
      return;
    }
    
    log(`✅ Cleaned up orphaned viewer records for ${streamIds.length} inactive streams`);
  } catch (error) {
    error('Error in cleanupOrphanedViewers:', error);
  }
};

/**
 * Update stream heartbeat to keep it alive
 */
export const updateStreamHeartbeat = async (streamId: string, viewerCount?: number) => {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };
    
    if (viewerCount !== undefined) {
      updateData.viewer_count = viewerCount;
    }
    
    const { error } = await supabase
      .from('live_streams')
      .update(updateData)
      .eq('id', streamId)
      .eq('is_live', true);
    
    if (error) {
      error('Error updating stream heartbeat:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    error('Error in updateStreamHeartbeat:', error);
    return false;
  }
};

/**
 * End a live stream gracefully
 */
export const endLiveStream = async (streamId: string, userId: string) => {
  try {
    log(`🔴 Ending live stream ${streamId} for user ${userId}`);
    
    // Mark stream as inactive
    const { error: streamError } = await supabase
      .from('live_streams')
      .update({ 
        is_live: false,
        ended_at: new Date().toISOString()
      })
      .eq('id', streamId)
      .eq('streamer_id', userId);
    
    if (streamError) {
      error('Error ending stream:', streamError);
      return false;
    }
    
    // Remove all viewer records for this stream
    const { error: viewerError } = await supabase
      .from('live_stream_viewers')
      .delete()
      .eq('stream_id', streamId);
    
    if (viewerError) {
      error('Error removing viewers:', viewerError);
      // Don't return false here, stream is already ended
    }
    
    log('✅ Live stream ended successfully');
    return true;
  } catch (error) {
    error('Error in endLiveStream:', error);
    return false;
  }
};

/**
 * Admin-only: close any live stream via RPC (checks is_admin in DB).
 * Use for list card and viewer "End stream" button.
 */
export const adminCloseLivestream = async (streamId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data, error: rpcError } = await supabase.rpc('admin_close_livestream_simple', {
      stream_id: streamId,
    });
    if (rpcError) {
      log('Admin close livestream RPC error:', rpcError);
      return { success: false, error: rpcError.message };
    }
    const result = data as { success?: boolean; error?: string } | null;
    if (result?.success) {
      log('✅ Admin closed livestream:', streamId);
      return { success: true };
    }
    return { success: false, error: result?.error || 'Failed to close stream' };
  } catch (error) {
    error('Error in adminCloseLivestream:', error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Start automatic cleanup service
 * This should be called once when the app starts
 */
export const startLiveStreamCleanupService = (options: LiveStreamCleanupOptions = {}) => {
  const { checkInterval = 5 } = options;
  
  log(`🧹 Starting live stream cleanup service (checks every ${checkInterval} minutes)`);
  
  // Initial cleanup
  cleanupStaleStreams(options);
  
  // Set up periodic cleanup
  const interval = setInterval(() => {
    cleanupStaleStreams(options);
  }, checkInterval * 60 * 1000);
  
  return () => {
    log('🛑 Stopping live stream cleanup service');
    clearInterval(interval);
  };
};

/**
 * Get live stream statistics
 */
export const getLiveStreamStats = async () => {
  try {
    const { data: activeStreams, error: activeError } = await supabase
      .from('live_streams')
      .select('id, viewer_count')
      .eq('is_live', true);
    
    if (activeError) {
      error('Error fetching active streams:', activeError);
      return null;
    }
    
    const totalActiveStreams = activeStreams?.length || 0;
    const totalViewers = activeStreams?.reduce((sum, stream) => sum + (stream.viewer_count || 0), 0) || 0;
    
    return {
      totalActiveStreams,
      totalViewers,
      averageViewersPerStream: totalActiveStreams > 0 ? Math.round(totalViewers / totalActiveStreams) : 0
    };
  } catch (error) {
    error('Error in getLiveStreamStats:', error);
    return null;
  }
};
