import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Setup livestream guest/invitation database tables
 * Supports multi-guest livestreaming with invitations and join requests
 */
export const setupLiveStreamGuestTables = async (): Promise<boolean> => {
  try {
    log('🔧 Setting up livestream guest tables...');
    
    // Create live_stream_guests table
    const { error: guestsError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Table to track guests currently in a livestream
        CREATE TABLE IF NOT EXISTS public.live_stream_guests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          left_at TIMESTAMP WITH TIME ZONE,
          is_active BOOLEAN DEFAULT true,
          audio_enabled BOOLEAN DEFAULT false,
          video_enabled BOOLEAN DEFAULT true,
          agora_uid INTEGER,
          UNIQUE(stream_id, user_id, is_active)
        );

        -- Index for faster queries
        CREATE INDEX IF NOT EXISTS idx_live_stream_guests_stream_id 
          ON public.live_stream_guests(stream_id) 
          WHERE is_active = true;
        
        CREATE INDEX IF NOT EXISTS idx_live_stream_guests_user_id 
          ON public.live_stream_guests(user_id);
      `
    });

    if (guestsError) {
      error('❌ Error creating live_stream_guests table:', guestsError);
      return false;
    }
    log('✅ live_stream_guests table created');

    // Create live_stream_invitations table
    const { error: invitationsError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Table to track invitations sent by hosts
        CREATE TABLE IF NOT EXISTS public.live_stream_invitations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
          host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          invited_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          responded_at TIMESTAMP WITH TIME ZONE,
          expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '5 minutes'),
          UNIQUE(stream_id, invited_user_id, status)
        );

        -- Index for faster queries
        CREATE INDEX IF NOT EXISTS idx_live_stream_invitations_invited_user 
          ON public.live_stream_invitations(invited_user_id) 
          WHERE status = 'pending';
        
        CREATE INDEX IF NOT EXISTS idx_live_stream_invitations_stream 
          ON public.live_stream_invitations(stream_id);
      `
    });

    if (invitationsError) {
      error('❌ Error creating live_stream_invitations table:', invitationsError);
      return false;
    }
    log('✅ live_stream_invitations table created');

    // Create live_stream_join_requests table
    const { error: requestsError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Table to track join requests from viewers
        CREATE TABLE IF NOT EXISTS public.live_stream_join_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          responded_at TIMESTAMP WITH TIME ZONE,
          UNIQUE(stream_id, user_id, status)
        );

        -- Index for faster queries
        CREATE INDEX IF NOT EXISTS idx_live_stream_join_requests_stream 
          ON public.live_stream_join_requests(stream_id) 
          WHERE status = 'pending';
        
        CREATE INDEX IF NOT EXISTS idx_live_stream_join_requests_user 
          ON public.live_stream_join_requests(user_id);
      `
    });

    if (requestsError) {
      error('❌ Error creating live_stream_join_requests table:', requestsError);
      return false;
    }
    log('✅ live_stream_join_requests table created');

    // Set up Row Level Security (RLS)
    const { error: rlsError } = await supabase.rpc('execute_sql', {
      sql: `
        -- Enable RLS on all tables
        ALTER TABLE public.live_stream_guests ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.live_stream_invitations ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.live_stream_join_requests ENABLE ROW LEVEL SECURITY;

        -- Policies for live_stream_guests
        DROP POLICY IF EXISTS "Anyone can view active guests" ON public.live_stream_guests;
        CREATE POLICY "Anyone can view active guests" 
          ON public.live_stream_guests FOR SELECT 
          USING (true);

        DROP POLICY IF EXISTS "Hosts can manage guests" ON public.live_stream_guests;
        CREATE POLICY "Hosts can manage guests" 
          ON public.live_stream_guests FOR ALL 
          USING (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE id = stream_id AND streamer_id = auth.uid()
            )
          );

        DROP POLICY IF EXISTS "Guests can update their own status" ON public.live_stream_guests;
        CREATE POLICY "Guests can update their own status" 
          ON public.live_stream_guests FOR UPDATE 
          USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "Guests can insert themselves when invited" ON public.live_stream_guests;
        CREATE POLICY "Guests can insert themselves when invited" 
          ON public.live_stream_guests FOR INSERT 
          WITH CHECK (
            -- User must be inserting themselves
            user_id = auth.uid() AND
            (
              -- User has ANY invitation for this stream (regardless of status, to handle timing)
              EXISTS (
                SELECT 1 FROM public.live_stream_invitations 
                WHERE live_stream_invitations.stream_id = stream_id 
                AND live_stream_invitations.invited_user_id = auth.uid()
              )
              OR
              -- User has a pending or accepted join request for this stream
              EXISTS (
                SELECT 1 FROM public.live_stream_join_requests 
                WHERE live_stream_join_requests.stream_id = stream_id 
                AND live_stream_join_requests.user_id = auth.uid()
                AND live_stream_join_requests.status IN ('pending', 'accepted')
              )
            )
          );

        -- Policies for live_stream_invitations
        DROP POLICY IF EXISTS "Users can view their invitations" ON public.live_stream_invitations;
        CREATE POLICY "Users can view their invitations" 
          ON public.live_stream_invitations FOR SELECT 
          USING (invited_user_id = auth.uid() OR host_id = auth.uid());

        DROP POLICY IF EXISTS "Hosts can send invitations" ON public.live_stream_invitations;
        CREATE POLICY "Hosts can send invitations" 
          ON public.live_stream_invitations FOR INSERT 
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE id = stream_id AND streamer_id = auth.uid()
            )
          );

        DROP POLICY IF EXISTS "Invited users can respond" ON public.live_stream_invitations;
        CREATE POLICY "Invited users can respond" 
          ON public.live_stream_invitations FOR UPDATE 
          USING (invited_user_id = auth.uid());

        -- Policies for live_stream_join_requests
        DROP POLICY IF EXISTS "Hosts can view join requests" ON public.live_stream_join_requests;
        CREATE POLICY "Hosts can view join requests" 
          ON public.live_stream_join_requests FOR SELECT 
          USING (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE id = stream_id AND streamer_id = auth.uid()
            ) OR user_id = auth.uid()
          );

        DROP POLICY IF EXISTS "Viewers can send join requests" ON public.live_stream_join_requests;
        CREATE POLICY "Viewers can send join requests" 
          ON public.live_stream_join_requests FOR INSERT 
          WITH CHECK (user_id = auth.uid());

        DROP POLICY IF EXISTS "Hosts can respond to requests" ON public.live_stream_join_requests;
        CREATE POLICY "Hosts can respond to requests" 
          ON public.live_stream_join_requests FOR UPDATE 
          USING (
            EXISTS (
              SELECT 1 FROM public.live_streams 
              WHERE id = stream_id AND streamer_id = auth.uid()
            )
          );
      `
    });

    if (rlsError) {
      error('❌ Error setting up RLS:', rlsError);
      return false;
    }
    log('✅ RLS policies created');

    log('🎉 All livestream guest tables setup completed successfully!');
    return true;
    
  } catch (error) {
    error('❌ Error setting up livestream guest tables:', error);
    return false;
  }
};

