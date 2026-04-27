import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup livestream moderation database tables
 * Supports moderators, warnings, and kick actions
 */
export const setupLiveStreamModeration = async (): Promise<boolean> => {
  try {
    log('🔧 Setting up livestream moderation tables...');
    
    // Create live_stream_moderators table
    const { error: moderatorsError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Table to track moderators for each livestream
        CREATE TABLE IF NOT EXISTS public.live_stream_moderators (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
          moderator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          added_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(stream_id, moderator_id)
        );

        -- Index for faster queries
        CREATE INDEX IF NOT EXISTS idx_live_stream_moderators_stream_id 
          ON public.live_stream_moderators(stream_id);
        
        CREATE INDEX IF NOT EXISTS idx_live_stream_moderators_moderator_id 
          ON public.live_stream_moderators(moderator_id);
      `
    });

    if (moderatorsError) {
      error('❌ Error creating live_stream_moderators table:', moderatorsError);
      return false;
    }
    log('✅ live_stream_moderators table created');

    // Create live_stream_warnings table
    const { error: warningsError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Table to track warnings given to users in livestreams
        CREATE TABLE IF NOT EXISTS public.live_stream_warnings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          warned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Index for faster queries
        CREATE INDEX IF NOT EXISTS idx_live_stream_warnings_stream_id 
          ON public.live_stream_warnings(stream_id);
        
        CREATE INDEX IF NOT EXISTS idx_live_stream_warnings_user_id 
          ON public.live_stream_warnings(user_id);
      `
    });

    if (warningsError) {
      error('❌ Error creating live_stream_warnings table:', warningsError);
      return false;
    }
    log('✅ live_stream_warnings table created');

    // Create live_stream_kicks table
    const { error: kicksError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Table to track users kicked from livestreams
        CREATE TABLE IF NOT EXISTS public.live_stream_kicks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          kicked_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(stream_id, user_id)
        );

        -- Index for faster queries
        CREATE INDEX IF NOT EXISTS idx_live_stream_kicks_stream_id 
          ON public.live_stream_kicks(stream_id);
        
        CREATE INDEX IF NOT EXISTS idx_live_stream_kicks_user_id 
          ON public.live_stream_kicks(user_id);
      `
    });

    if (kicksError) {
      error('❌ Error creating live_stream_kicks table:', kicksError);
      return false;
    }
    log('✅ live_stream_kicks table created');

    // Set up Row Level Security (RLS)
    const { error: rlsError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Enable RLS on moderators table
        ALTER TABLE public.live_stream_moderators ENABLE ROW LEVEL SECURITY;

        -- Policy: Streamers can view moderators for their streams
        DROP POLICY IF EXISTS "Streamers can view moderators" ON public.live_stream_moderators;
        CREATE POLICY "Streamers can view moderators" 
          ON public.live_stream_moderators
          FOR SELECT 
          USING (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE live_streams.id = live_stream_moderators.stream_id 
              AND live_streams.streamer_id = auth.uid()
            )
            OR moderator_id = auth.uid()
          );

        -- Policy: Streamers can add moderators
        DROP POLICY IF EXISTS "Streamers can add moderators" ON public.live_stream_moderators;
        CREATE POLICY "Streamers can add moderators" 
          ON public.live_stream_moderators
          FOR INSERT 
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE live_streams.id = live_stream_moderators.stream_id 
              AND live_streams.streamer_id = auth.uid()
            )
          );

        -- Policy: Streamers can remove moderators
        DROP POLICY IF EXISTS "Streamers can remove moderators" ON public.live_stream_moderators;
        CREATE POLICY "Streamers can remove moderators" 
          ON public.live_stream_moderators
          FOR DELETE 
          USING (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE live_streams.id = live_stream_moderators.stream_id 
              AND live_streams.streamer_id = auth.uid()
            )
          );

        -- Enable RLS on warnings table
        ALTER TABLE public.live_stream_warnings ENABLE ROW LEVEL SECURITY;

        -- Policy: Streamers and moderators can view warnings
        DROP POLICY IF EXISTS "Streamers and moderators can view warnings" ON public.live_stream_warnings;
        CREATE POLICY "Streamers and moderators can view warnings" 
          ON public.live_stream_warnings
          FOR SELECT 
          USING (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE live_streams.id = live_stream_warnings.stream_id 
              AND live_streams.streamer_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.live_stream_moderators 
              WHERE live_stream_moderators.stream_id = live_stream_warnings.stream_id 
              AND live_stream_moderators.moderator_id = auth.uid()
            )
            OR user_id = auth.uid()
          );

        -- Policy: Streamers and moderators can create warnings
        DROP POLICY IF EXISTS "Streamers and moderators can create warnings" ON public.live_stream_warnings;
        CREATE POLICY "Streamers and moderators can create warnings" 
          ON public.live_stream_warnings
          FOR INSERT 
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE live_streams.id = live_stream_warnings.stream_id 
              AND live_streams.streamer_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.live_stream_moderators 
              WHERE live_stream_moderators.stream_id = live_stream_warnings.stream_id 
              AND live_stream_moderators.moderator_id = auth.uid()
            )
          );

        -- Enable RLS on kicks table
        ALTER TABLE public.live_stream_kicks ENABLE ROW LEVEL SECURITY;

        -- Policy: Streamers and moderators can view kicks
        DROP POLICY IF EXISTS "Streamers and moderators can view kicks" ON public.live_stream_kicks;
        CREATE POLICY "Streamers and moderators can view kicks" 
          ON public.live_stream_kicks
          FOR SELECT 
          USING (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE live_streams.id = live_stream_kicks.stream_id 
              AND live_streams.streamer_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.live_stream_moderators 
              WHERE live_stream_moderators.stream_id = live_stream_kicks.stream_id 
              AND live_stream_moderators.moderator_id = auth.uid()
            )
            OR user_id = auth.uid()
          );

        -- Policy: Streamers and moderators can create kicks
        DROP POLICY IF EXISTS "Streamers and moderators can create kicks" ON public.live_stream_kicks;
        CREATE POLICY "Streamers and moderators can create kicks" 
          ON public.live_stream_kicks
          FOR INSERT 
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE live_streams.id = live_stream_kicks.stream_id 
              AND live_streams.streamer_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.live_stream_moderators 
              WHERE live_stream_moderators.stream_id = live_stream_kicks.stream_id 
              AND live_stream_moderators.moderator_id = auth.uid()
            )
          );
      `
    });

    if (rlsError) {
      error('❌ Error setting up RLS policies:', rlsError);
      return false;
    }
    log('✅ RLS policies created');

    return true;
  } catch (error) {
    error('❌ Error setting up livestream moderation:', error);
    return false;
  }
};

