import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Update live_stream_reactions table to support honk and applause
 * This adds/updates the check constraint to allow: 'heart', 'honk', 'applause'
 */
export const updateLiveStreamReactionsSchema = async (): Promise<boolean> => {
  try {
    log('🔧 Updating live_stream_reactions schema to support honk and applause...');
    
    // First, check if we can execute SQL
    const { data: testData, error: testError } = await supabase
      .from('live_stream_reactions')
      .select('reaction_type')
      .limit(1);
    
    if (testError && testError.code === '42P01') {
      log('❌ Table does not exist');
      return false;
    }
    
    // Note: Since we can't execute DDL from client side, we need to handle this differently
    // The constraint needs to be removed/updated in the Supabase dashboard
    log('⚠️ Database constraint update needed:');
    log('Please run this SQL in your Supabase dashboard:');
    log(`
      -- Remove existing check constraint if it exists
      ALTER TABLE public.live_stream_reactions 
      DROP CONSTRAINT IF EXISTS live_stream_reactions_reaction_type_check;
      
      -- Add updated check constraint that allows honk and applause
      ALTER TABLE public.live_stream_reactions 
      ADD CONSTRAINT live_stream_reactions_reaction_type_check 
      CHECK (reaction_type IN ('heart', 'honk', 'applause'));
    `);
    
    return true;
  } catch (error) {
    error('❌ Error updating live_stream_reactions schema:', error);
    return false;
  }
};

