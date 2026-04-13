import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Specifically checks and ensures the post_bookmarks table exists
 */
export const ensurePostBookmarksTable = async (): Promise<boolean> => {
  try {
    log('Checking if post_bookmarks table exists...');
    
    // Check if the table exists by trying to select from it
    const { error: checkError } = await supabase
      .from('post_bookmarks')
      .select('id')
      .limit(1);
    
    // If there's no error, the table exists
    if (!checkError) {
      log('post_bookmarks table already exists');
      return true;
    }
    
    log('post_bookmarks table does not exist - checking if we can create it...');
    
    // Try to check if posts table exists since post_bookmarks depends on it
    const { error: postsCheckError } = await supabase
      .from('posts')
      .select('id')
      .limit(1);
    
    if (postsCheckError) {
      log('posts table does not exist, cannot create post_bookmarks table that references it');
      return false;
    }
    
    // Check if profiles table exists since post_bookmarks also depends on it
    const { error: profilesCheckError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (profilesCheckError) {
      log('profiles table does not exist, cannot create post_bookmarks table that references it');
      return false;
    }
    
    log('Required tables exist, attempting to create post_bookmarks table...');
    
    // If we get here, we can try to create the post_bookmarks table
    try {
      // Fallback: try to create the table directly via the create_post_bookmarks_table function
      log('Trying to create post_bookmarks table via RPC function...');
      const { error: rpcError } = await supabase.rpc('create_post_bookmarks_table', {});
      
      if (rpcError) {
        log('RPC function for creating post_bookmarks table failed - this is expected if function does not exist');
        // We'll try direct SQL approach next
      } else {
        log('post_bookmarks table created successfully via RPC');
        return true;
      }
    } catch (error) {
      log('Error calling create_post_bookmarks_table RPC - this is okay if it does not exist');
    }
    
    // If we're still here, both previous methods failed
    log('Direct methods failed, but app can continue using mock data');
    return false;
  } catch (error) {
    error('Error ensuring post_bookmarks table exists:', error);
    return false;
  }
}; 