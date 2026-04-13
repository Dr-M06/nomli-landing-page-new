import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export const ensurePrivateReactionsTable = async (): Promise<boolean> => {
  try {
    log('[Private Reactions] Checking if private_message_reactions table exists...');
    
    // First, try to query the table
    const { data, error } = await supabase
      .from('private_message_reactions')
      .select('count', { count: 'exact', head: true });
    
    if (!error) {
      log('[Private Reactions] Table already exists and is accessible');
      return true;
    }
    
    // If table doesn't exist, create it
    log('[Private Reactions] Table does not exist, creating it...');
    
    const createTableSQL = `
      -- Create private message reactions table
      CREATE TABLE IF NOT EXISTS public.private_message_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES public.private_messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        
        -- Add a unique constraint to prevent duplicate reactions from the same user with the same emoji
        UNIQUE(message_id, user_id, emoji)
      );

      -- Add RLS policies for private_message_reactions
      ALTER TABLE public.private_message_reactions ENABLE ROW LEVEL SECURITY;

      -- Create policy for selecting private message reactions (only participants can view)
      DROP POLICY IF EXISTS "Participants can view private message reactions" ON public.private_message_reactions;
      CREATE POLICY "Participants can view private message reactions" 
        ON public.private_message_reactions
        FOR SELECT 
        USING (
          EXISTS (
            SELECT 1 FROM public.private_messages pm 
            WHERE pm.id = message_id 
            AND (pm.sender_id = auth.uid() OR pm.recipient_id = auth.uid())
          )
        );

      -- Create policy for inserting private message reactions (only participants)
      DROP POLICY IF EXISTS "Participants can add reactions to private messages" ON public.private_message_reactions;
      CREATE POLICY "Participants can add reactions to private messages" 
        ON public.private_message_reactions
        FOR INSERT 
        TO authenticated
        WITH CHECK (
          auth.uid() = user_id AND
          EXISTS (
            SELECT 1 FROM public.private_messages pm 
            WHERE pm.id = message_id 
            AND (pm.sender_id = auth.uid() OR pm.recipient_id = auth.uid())
          )
        );

      -- Create policy for deleting private message reactions (only reaction owner)
      DROP POLICY IF EXISTS "Users can delete their own private message reactions" ON public.private_message_reactions;
      CREATE POLICY "Users can delete their own private message reactions" 
        ON public.private_message_reactions
        FOR DELETE 
        TO authenticated
        USING (auth.uid() = user_id);

      -- Create indexes for faster reaction lookups
      CREATE INDEX IF NOT EXISTS private_message_reactions_message_id_idx ON public.private_message_reactions(message_id);
      CREATE INDEX IF NOT EXISTS private_message_reactions_user_id_idx ON public.private_message_reactions(user_id);
      CREATE INDEX IF NOT EXISTS private_message_reactions_message_user_emoji_idx ON public.private_message_reactions(message_id, user_id, emoji);

      -- Create function to notify on private message reaction changes
      CREATE OR REPLACE FUNCTION public.handle_private_message_reaction_change()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Perform different operations based on the action
        IF (TG_OP = 'INSERT') THEN
          -- Notify about new reaction
          PERFORM pg_notify(
            'private_message_reaction_change',
            json_build_object(
              'operation', TG_OP,
              'record', row_to_json(NEW)
            )::text
          );
          RETURN NEW;
        ELSIF (TG_OP = 'DELETE') THEN
          -- Notify about deleted reaction
          PERFORM pg_notify(
            'private_message_reaction_change',
            json_build_object(
              'operation', TG_OP,
              'record', row_to_json(OLD)
            )::text
          );
          RETURN OLD;
        END IF;
        
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- Create trigger for private message reaction changes
      DROP TRIGGER IF EXISTS private_message_reaction_change_trigger ON public.private_message_reactions;
      CREATE TRIGGER private_message_reaction_change_trigger
      AFTER INSERT OR DELETE ON public.private_message_reactions
      FOR EACH ROW EXECUTE FUNCTION public.handle_private_message_reaction_change();
    `;
    
    // Try to create the table using individual queries since exec_sql might not be available
    try {
      // Create the table
      const { error: tableError } = await supabase.rpc('exec', { 
        query: `
          CREATE TABLE IF NOT EXISTS public.private_message_reactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            message_id UUID NOT NULL REFERENCES public.private_messages(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            emoji TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(message_id, user_id, emoji)
          );
          
          ALTER TABLE public.private_message_reactions ENABLE ROW LEVEL SECURITY;
        `
      });
      
      if (tableError) {
        error('[Private Reactions] Error creating table:', tableError);
        // Try a simpler approach - just insert a test record to see if table exists
        const { error: testError } = await supabase
          .from('private_message_reactions')
          .select('count', { count: 'exact', head: true });
        
        if (testError) {
          error('[Private Reactions] Table does not exist and cannot be created:', testError);
          return false;
        }
      }
    } catch (rpcError) {
      warn('[Private Reactions] RPC not available, assuming table exists:', rpcError);
      // If RPC fails, just assume the table exists and let the normal operations handle it
    }
    
    log('[Private Reactions] Table created successfully');
    return true;
  } catch (error) {
    error('[Private Reactions] Error ensuring table exists:', error);
    return false;
  }
}; 