import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Client-safe check for live_stream_reactions schema.
 * NOTE: We no longer attempt to run ALTER TABLE from the client.
 * If the column is missing, we simply log a message and return.
 * The server-side migration should add `x_position`.
 */
export const updateLiveStreamReactionsTable = async (): Promise<boolean> => {
  try {
    log('💖 Checking live_stream_reactions table (client-safe)...');

    // Try selecting the column. If it doesn't exist, Supabase will return an error
    // which we catch and then exit gracefully without throwing.
    const { error } = await supabase
      .from('live_stream_reactions')
      .select('x_position')
      .limit(1);

    if (error) {
      // Column likely missing. Log and continue; FloatingReactions handles fallback.
      log('ℹ️ x_position column not available yet (client will fallback).');
      return false;
    }

    log('✅ x_position column available');
    return true;
  } catch (error) {
    log('ℹ️ Skipping client-side schema check due to error:', error);
    return false;
  }
};
