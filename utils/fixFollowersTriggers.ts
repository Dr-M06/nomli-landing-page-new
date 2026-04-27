import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export const fixFollowersTriggers = async () => {
  try {
    log('Fixing follower count triggers...');
    
    // Drop and recreate the function and trigger
    // Note: exec_sql doesn't exist - these operations should be done via migrations
    // This function is deprecated and should not be called from client-side code
    warn('[fixFollowersTriggers] This function is deprecated. Use database migrations instead.');
    return false;
    
    /* DEPRECATED - Use migrations instead
    const { error: dropError } = await supabase
      .rpc('exec_sql', {
        sql: `
          DROP TRIGGER IF EXISTS trigger_update_follower_counts ON user_followers;
          DROP FUNCTION IF EXISTS update_follower_counts();
          
          CREATE OR REPLACE FUNCTION update_follower_counts()
          RETURNS TRIGGER AS $$
          BEGIN
            IF TG_OP = 'INSERT' THEN
              -- Increment followers count for the user being followed
              UPDATE profiles 
              SET followers_count = followers_count + 1
              WHERE id = NEW.following_id;
              
              -- Increment following count for the user who is following
              UPDATE profiles 
              SET following_count = following_count + 1
              WHERE id = NEW.follower_id;
              
              RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
              -- Decrement followers count for the user being unfollowed
              UPDATE profiles 
              SET followers_count = GREATEST(followers_count - 1, 0)
              WHERE id = OLD.following_id;
              
              -- Decrement following count for the user who is unfollowing
              UPDATE profiles 
              SET following_count = GREATEST(following_count - 1, 0)
              WHERE id = OLD.follower_id;
              
              RETURN OLD;
            END IF;
            
            RETURN NULL;
          END;
          $$ LANGUAGE plpgsql;
          
          CREATE TRIGGER trigger_update_follower_counts
            AFTER INSERT OR DELETE ON user_followers
            FOR EACH ROW
            EXECUTE FUNCTION update_follower_counts();
        `
      });
    
    if (dropError) {
      error('Error fixing triggers:', dropError);
      return false;
    }
    
    log('Triggers fixed successfully!');
    
    // Now let's recalculate the counts for all users
    const { error: recalcError } = await supabase
      .rpc('exec_sql', {
        sql: `
          UPDATE profiles 
          SET followers_count = (
            SELECT COUNT(*) 
            FROM user_followers 
            WHERE following_id = profiles.id
          ),
          following_count = (
            SELECT COUNT(*) 
            FROM user_followers 
            WHERE follower_id = profiles.id
          )
          WHERE id IN (
            SELECT DISTINCT following_id FROM user_followers
            UNION
            SELECT DISTINCT follower_id FROM user_followers
          );
        `
      });
    
    if (recalcError) {
      error('Error recalculating counts:', recalcError);
      return false;
    }
    
    log('Counts recalculated successfully!');
    return true;
    */
    
  } catch (error) {
    error('Error in fixFollowersTriggers:', error);
    return false;
  }
};
