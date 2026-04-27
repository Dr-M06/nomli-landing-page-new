import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup livestream database tables
 * This function creates the necessary tables for livestream functionality
 */
export const setupLiveStreamTables = async (): Promise<boolean> => {
  try {
    log('🔧 Setting up livestream tables...');
    
    // Check if live_streams table exists
    const { error: streamsCheck } = await supabase.from('live_streams').select('count').limit(1);
    
    if (streamsCheck && streamsCheck.code === '42P01') {
      log('🔧 Creating live_streams table...');
      
      // Try to create the table using execute_sql
      const { error: createError } = await supabase.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.live_streams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            streamer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            title TEXT,
            description TEXT,
            is_public BOOLEAN DEFAULT true,
            is_live BOOLEAN DEFAULT false,
            started_at TIMESTAMP WITH TIME ZONE,
            viewer_count INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            ended_at TIMESTAMP WITH TIME ZONE
          );
        `
      });
      
      if (createError) {
        error('❌ Error creating live_streams table:', createError);
        return false;
      }
      
      log('✅ live_streams table created successfully');
    } else {
      log('✅ live_streams table already exists');
    }
    
    // Check if live_stream_comments table exists
    const { error: commentsCheck } = await supabase.from('live_stream_comments').select('count').limit(1);
    
    if (commentsCheck && commentsCheck.code === '42P01') {
      log('🔧 Creating live_stream_comments table...');
      
      // Create live_stream_comments table
      const { error: commentsError } = await supabase.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.live_stream_comments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            reply_to UUID REFERENCES public.live_stream_comments(id) ON DELETE SET NULL,
            reply_to_username TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          
          -- Create index for faster queries on replies
          CREATE INDEX IF NOT EXISTS idx_live_stream_comments_reply_to 
          ON public.live_stream_comments(reply_to) 
          WHERE reply_to IS NOT NULL;
        `
      });
      
      if (commentsError) {
        error('❌ Error creating live_stream_comments table:', commentsError);
        return false;
      }
      
      log('✅ live_stream_comments table created successfully');
    } else {
      log('✅ live_stream_comments table already exists');
    }
    
    // Check if live_stream_reactions table exists
    const { error: reactionsCheck } = await supabase.from('live_stream_reactions').select('count').limit(1);
    
    if (reactionsCheck && reactionsCheck.code === '42P01') {
      log('🔧 Creating live_stream_reactions table...');
      
      // Create live_stream_reactions table
      const { error: reactionsError } = await supabase.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.live_stream_reactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            reaction_type TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `
      });
      
      if (reactionsError) {
        error('❌ Error creating live_stream_reactions table:', reactionsError);
        return false;
      }
      
      log('✅ live_stream_reactions table created successfully');
    } else {
      log('✅ live_stream_reactions table already exists');
    }
    
    // Check if live_stream_rewards table exists
    const { error: rewardsCheck } = await supabase.from('live_stream_rewards').select('count').limit(1);
    
    if (rewardsCheck && rewardsCheck.code === '42P01') {
      log('🔧 Creating live_stream_rewards table...');
      
      // Create live_stream_rewards table (consistent naming with other tables)
      const { error: rewardsError } = await supabase.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.live_stream_rewards (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
            streamer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            viewer_count INTEGER NOT NULL,
            reward_amount INTEGER NOT NULL,
            credited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          
          -- Create index for faster queries on recent rewards
          CREATE INDEX IF NOT EXISTS idx_live_stream_rewards_stream_credited 
          ON public.live_stream_rewards(stream_id, credited_at DESC);
          
          -- Create index for streamer rewards
          CREATE INDEX IF NOT EXISTS idx_live_stream_rewards_streamer 
          ON public.live_stream_rewards(streamer_id, credited_at DESC);
        `
      });
      
      if (rewardsError) {
        error('❌ Error creating live_stream_rewards table:', rewardsError);
        return false;
      }
      
      log('✅ live_stream_rewards table created successfully');
    } else {
      log('✅ live_stream_rewards table already exists');
    }
    
    log('🎉 All livestream tables setup completed successfully!');
    return true;
    
  } catch (error) {
    error('❌ Error setting up livestream tables:', error);
    return false;
  }
};
