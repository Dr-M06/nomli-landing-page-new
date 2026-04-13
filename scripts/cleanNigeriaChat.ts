import { supabase } from '../utils/supabase';

/**
 * Clean out all messages from the Nigeria country chat room
 * This will delete all messages, reactions, and related data
 */
export const cleanNigeriaChatRoom = async (): Promise<{ success: boolean; deletedCount?: number; error?: string }> => {
  try {
    console.log('[CleanNigeriaChat] Starting cleanup of Nigeria chat room...');

    // Step 1: Find the Nigeria chat room ID
    const { data: nigeriaRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id, country_code, name')
      .eq('country_code', 'NG')
      .single();

    if (roomError || !nigeriaRoom) {
      console.error('[CleanNigeriaChat] Error finding Nigeria room:', roomError);
      return { success: false, error: `Failed to find Nigeria chat room: ${roomError?.message || 'Room not found'}` };
    }

    console.log(`[CleanNigeriaChat] Found Nigeria room: ${nigeriaRoom.id} (${nigeriaRoom.name})`);

    const roomId = nigeriaRoom.id;

    // Step 2: Get count of messages before deletion (for reporting)
    const { count: messageCount } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId);

    console.log(`[CleanNigeriaChat] Found ${messageCount || 0} messages to delete`);

    // Step 3: Delete message reactions first (foreign key constraint)
    const { error: reactionsError } = await supabase
      .from('message_reactions')
      .delete()
      .in('message_id', 
        supabase
          .from('chat_messages')
          .select('id')
          .eq('room_id', roomId)
      );

    if (reactionsError) {
      console.warn('[CleanNigeriaChat] Warning deleting reactions (may not exist):', reactionsError);
    } else {
      console.log('[CleanNigeriaChat] Deleted message reactions');
    }

    // Step 4: Delete bookmarked messages related to Nigeria chat
    const { error: bookmarksError } = await supabase
      .from('bookmarked_messages')
      .delete()
      .eq('message_type', 'country_chat')
      .in('message_id',
        supabase
          .from('chat_messages')
          .select('id')
          .eq('room_id', roomId)
      );

    if (bookmarksError) {
      console.warn('[CleanNigeriaChat] Warning deleting bookmarks (may not exist):', bookmarksError);
    } else {
      console.log('[CleanNigeriaChat] Deleted bookmarked messages');
    }

    // Step 5: Delete all messages from the Nigeria chat room
    const { error: messagesError, count: deletedCount } = await supabase
      .from('chat_messages')
      .delete({ count: 'exact' })
      .eq('room_id', roomId);

    if (messagesError) {
      console.error('[CleanNigeriaChat] Error deleting messages:', messagesError);
      return { success: false, error: `Failed to delete messages: ${messagesError.message}` };
    }

    console.log(`[CleanNigeriaChat] Successfully deleted ${deletedCount || 0} messages from Nigeria chat room`);

    // Step 6: Update the chat room's last_message and last_message_at to null
    const { error: updateError } = await supabase
      .from('chat_rooms')
      .update({
        last_message: null,
        last_message_at: null
      })
      .eq('id', roomId);

    if (updateError) {
      console.warn('[CleanNigeriaChat] Warning updating room metadata:', updateError);
    } else {
      console.log('[CleanNigeriaChat] Updated room metadata');
    }

    return {
      success: true,
      deletedCount: deletedCount || 0
    };
  } catch (error: any) {
    console.error('[CleanNigeriaChat] Exception:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
};

/**
 * Alternative approach: Delete messages using a direct SQL query
 * This is more efficient for large deletions
 */
export const cleanNigeriaChatRoomSQL = async (): Promise<{ success: boolean; deletedCount?: number; error?: string }> => {
  try {
    console.log('[CleanNigeriaChat] Starting SQL-based cleanup of Nigeria chat room...');

    // Use RPC function or direct SQL to delete all messages
    const { data, error } = await supabase.rpc('clean_nigeria_chat', {});

    if (error) {
      // If RPC doesn't exist, fall back to the regular method
      console.log('[CleanNigeriaChat] RPC function not found, using regular method...');
      return await cleanNigeriaChatRoom();
    }

    return {
      success: true,
      deletedCount: data?.deleted_count || 0
    };
  } catch (error: any) {
    console.error('[CleanNigeriaChat] SQL Exception:', error);
    // Fall back to regular method
    return await cleanNigeriaChatRoom();
  }
};

// If running as a script
if (require.main === module) {
  cleanNigeriaChatRoom()
    .then(result => {
      if (result.success) {
        console.log(`✅ Successfully cleaned Nigeria chat room. Deleted ${result.deletedCount || 0} messages.`);
        process.exit(0);
      } else {
        console.error(`❌ Failed to clean Nigeria chat room: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

