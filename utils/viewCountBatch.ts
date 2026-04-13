import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


const VIEW_COUNT_QUEUE_KEY = 'video_view_count_queue';
const BATCH_UPDATE_INTERVAL = 30000; // 30 seconds
const MAX_BATCH_SIZE = 50;

interface ViewCountUpdate {
  postId: string;
  count: number; // Number of views to add
  timestamp: number;
}

let viewCountQueue: ViewCountUpdate[] = [];
let batchUpdateTimer: NodeJS.Timeout | null = null;
let isProcessingBatch = false;

/**
 * Add view count to queue (silent, batched update)
 */
export async function queueViewCount(postId: string, count: number = 1): Promise<void> {
  try {
    // Load existing queue
    const existingQueue = await getViewCountQueue();
    
    // Check if post already in queue
    const existingIndex = existingQueue.findIndex(item => item.postId === postId);
    
    if (existingIndex >= 0) {
      // Add to existing count
      existingQueue[existingIndex].count += count;
      existingQueue[existingIndex].timestamp = Date.now();
    } else {
      // Add new entry
      existingQueue.push({
        postId,
        count,
        timestamp: Date.now(),
      });
    }
    
    // Limit queue size
    if (existingQueue.length > MAX_BATCH_SIZE) {
      existingQueue = existingQueue.slice(-MAX_BATCH_SIZE);
    }
    
    // Save queue
    await AsyncStorage.setItem(VIEW_COUNT_QUEUE_KEY, JSON.stringify(existingQueue));
    viewCountQueue = existingQueue;
    
    // Start batch timer if not already running
    if (!batchUpdateTimer && !isProcessingBatch) {
      startBatchTimer();
    }
  } catch (error) {
    error('[ViewCountBatch] Error queueing view count:', error);
  }
}

/**
 * Get current view count queue from storage
 */
async function getViewCountQueue(): Promise<ViewCountUpdate[]> {
  try {
    const queueString = await AsyncStorage.getItem(VIEW_COUNT_QUEUE_KEY);
    if (queueString) {
      return JSON.parse(queueString);
    }
  } catch (error) {
    error('[ViewCountBatch] Error loading view count queue:', error);
  }
  return [];
}

/**
 * Process batched view count updates
 */
export async function processBatchViewCounts(): Promise<void> {
  if (isProcessingBatch) {
    return;
  }
  
  isProcessingBatch = true;
  
  try {
    const queue = await getViewCountQueue();
    
    if (queue.length === 0) {
      isProcessingBatch = false;
      return;
    }
    
    log(`[ViewCountBatch] Processing ${queue.length} view count updates...`);
    
    // Group by post ID and sum counts
    const viewCountMap: Record<string, number> = {};
    for (const item of queue) {
      viewCountMap[item.postId] = (viewCountMap[item.postId] || 0) + item.count;
    }
    
    // Process each post - use RPC function like old system (atomic increment)
    const updatePromises = Object.entries(viewCountMap).map(async ([postId, totalCount]) => {
      try {
        // Use the old RPC function approach - call increment_post_views RPC
        // This matches the old working logic exactly
        let successCount = 0;
        let lastCount: number | null = null;
        
        // Get initial count for logging
        const { data: initialPost } = await supabase
          .from('posts')
          .select('views_count')
          .eq('id', postId)
          .single();
        const initialCount = (initialPost?.views_count as number) || 0;
        
        log(`[ViewCountBatch] Processing ${postId}: ${initialCount} -> +${totalCount} views`);
        
        // Try RPC function first (like old system)
        try {
          // Call RPC once per view (allows multiple views per user)
          for (let i = 0; i < totalCount; i++) {
            const { data: newCount, error: rpcError } = await supabase
              .rpc('increment_post_views', { post_id: postId });
            
            if (rpcError) {
              // If RPC doesn't exist, fallback to direct update
              if (rpcError.code === '42883' || rpcError.message?.includes('function') || rpcError.message?.includes('does not exist')) {
                log(`[ViewCountBatch] ⚠️ RPC function 'increment_post_views' not found for ${postId}, using direct update`);
                break;
              } else {
                error(`[ViewCountBatch] ❌ RPC error for ${postId}:`, rpcError.code, rpcError.message);
                break;
              }
            } else if (newCount !== null && newCount !== undefined) {
              lastCount = newCount as number;
              successCount++;
              if (i === 0) {
                log(`[ViewCountBatch] RPC call ${i + 1}/${totalCount} succeeded: ${initialCount} -> ${lastCount}`);
              }
            } else {
              warn(`[ViewCountBatch] RPC returned null/undefined for ${postId} (call ${i + 1}/${totalCount})`);
            }
          }
        } catch (error) {
          error(`[ViewCountBatch] Exception calling RPC for ${postId}:`, error);
        }
        
        // Fallback to direct update if RPC failed or doesn't exist
        if (successCount < totalCount) {
          const remainingCount = totalCount - successCount;
          log(`[ViewCountBatch] Using direct update for ${postId}: ${remainingCount} remaining views`);
          
          try {
            // Get current count (might have changed from RPC calls)
            const { data: post } = await supabase
              .from('posts')
              .select('views_count')
              .eq('id', postId)
              .single();
            
            if (post) {
              const currentCount = (post.views_count as number) || 0;
              const newCount = currentCount + remainingCount;
              
              log(`[ViewCountBatch] Direct update: ${currentCount} -> ${newCount} (+${remainingCount})`);
              
              const { error: updateError } = await supabase
                .from('posts')
                .update({ views_count: newCount })
                .eq('id', postId);
              
              if (updateError) {
                error(`[ViewCountBatch] ❌ Direct update error for ${postId}:`, updateError);
              } else {
                // Verify the update worked
                const { data: verifyPost } = await supabase
                  .from('posts')
                  .select('views_count')
                  .eq('id', postId)
                  .single();
                const verifiedCount = (verifyPost?.views_count as number) || 0;
                
                if (verifiedCount === newCount) {
                  log(`[ViewCountBatch] ✅ Direct update verified for ${postId}: ${verifiedCount} views`);
                } else {
                  warn(`[ViewCountBatch] ⚠️ Direct update mismatch for ${postId}: expected ${newCount}, got ${verifiedCount}`);
                }
                
                successCount += remainingCount;
                lastCount = verifiedCount;
              }
            } else {
              error(`[ViewCountBatch] ❌ Post not found for direct update: ${postId}`);
            }
          } catch (error) {
            error(`[ViewCountBatch] Exception in direct update for ${postId}:`, error);
          }
        }
        
        // Final verification
        if (successCount > 0) {
          const { data: finalPost } = await supabase
            .from('posts')
            .select('views_count')
            .eq('id', postId)
            .single();
          const finalCount = (finalPost?.views_count as number) || 0;
          
          log(`[ViewCountBatch] ✅ Final result for ${postId}: ${initialCount} -> ${finalCount} (+${successCount} processed, ${totalCount} queued)`);
          
          if (finalCount < initialCount) {
            error(`[ViewCountBatch] ❌ CRITICAL: View count decreased! ${initialCount} -> ${finalCount}`);
          }
        } else {
          warn(`[ViewCountBatch] ⚠️ Failed to update ${postId}: 0 views processed out of ${totalCount} queued`);
        }
      } catch (error) {
        error(`[ViewCountBatch] Exception updating views for ${postId}:`, error);
      }
    });
    
    await Promise.all(updatePromises);
    
    // Clear queue after successful processing
    await AsyncStorage.removeItem(VIEW_COUNT_QUEUE_KEY);
    viewCountQueue = [];
    
    log(`[ViewCountBatch] ✅ Processed ${queue.length} view count updates`);
  } catch (error) {
    error('[ViewCountBatch] Error processing batch:', error);
  } finally {
    isProcessingBatch = false;
  }
}

/**
 * Start batch timer for periodic updates
 */
function startBatchTimer(): void {
  if (batchUpdateTimer) {
    return;
  }
  
  batchUpdateTimer = setInterval(() => {
    processBatchViewCounts().catch(error => {
      error('[ViewCountBatch] Batch timer error:', error);
    });
  }, BATCH_UPDATE_INTERVAL);
}

/**
 * Stop batch timer
 */
export function stopBatchTimer(): void {
  if (batchUpdateTimer) {
    clearInterval(batchUpdateTimer);
    batchUpdateTimer = null;
  }
}

/**
 * Initialize batch system (call on app start)
 */
export async function initializeViewCountBatch(): Promise<void> {
  // Process any pending updates from previous session
  await processBatchViewCounts();
  
  // Start batch timer
  startBatchTimer();
}

/**
 * Force immediate batch processing (call on app foreground/load)
 */
export async function flushViewCountBatch(): Promise<void> {
  await processBatchViewCounts();
}
