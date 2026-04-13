/**
 * Node.js script to clean out the Nigeria country chat room
 * Run with: node scripts/cleanNigeriaChat.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Try to load from .env file
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials.');
  console.error('Please ensure your .env file contains:');
  console.error('  EXPO_PUBLIC_SUPABASE_URL=your_url');
  console.error('  EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key');
  console.error('\nOr set them as environment variables before running:');
  console.error('  export EXPO_PUBLIC_SUPABASE_URL=your_url');
  console.error('  export EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanNigeriaChatRoom() {
  try {
    console.log('[CleanNigeriaChat] Starting cleanup of Nigeria chat room...');

    // Step 1: Find the Nigeria chat room ID
    const { data: nigeriaRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id, country_code, description')
      .eq('country_code', 'NG')
      .single();

    if (roomError || !nigeriaRoom) {
      console.error('[CleanNigeriaChat] Error finding Nigeria room:', roomError);
      return { success: false, error: `Failed to find Nigeria chat room: ${roomError?.message || 'Room not found'}` };
    }

    console.log(`[CleanNigeriaChat] Found Nigeria room: ${nigeriaRoom.id} (${nigeriaRoom.description || nigeriaRoom.country_code})`);

    const roomId = nigeriaRoom.id;

    // Step 2: Get all message IDs first
    const { data: messages, error: fetchError } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('room_id', roomId);

    if (fetchError) {
      console.error('[CleanNigeriaChat] Error fetching messages:', fetchError);
      return { success: false, error: `Failed to fetch messages: ${fetchError.message}` };
    }

    const messageIds = messages?.map(m => m.id) || [];
    console.log(`[CleanNigeriaChat] Found ${messageIds.length} messages to delete`);

    if (messageIds.length === 0) {
      console.log('[CleanNigeriaChat] No messages to delete. Room is already clean.');
      return { success: true, deletedCount: 0 };
    }

    // Step 3: Delete message reactions first (if they exist)
    if (messageIds.length > 0) {
      const { error: reactionsError } = await supabase
        .from('message_reactions')
        .delete()
        .in('message_id', messageIds);

      if (reactionsError) {
        console.warn('[CleanNigeriaChat] Warning deleting reactions (may not exist):', reactionsError);
      } else {
        console.log('[CleanNigeriaChat] Deleted message reactions');
      }
    }

    // Step 4: Delete bookmarked messages related to Nigeria chat
    if (messageIds.length > 0) {
      const { error: bookmarksError } = await supabase
        .from('bookmarked_messages')
        .delete()
        .eq('message_type', 'country_chat')
        .in('message_id', messageIds);

      if (bookmarksError) {
        console.warn('[CleanNigeriaChat] Warning deleting bookmarks (may not exist):', bookmarksError);
      } else {
        console.log('[CleanNigeriaChat] Deleted bookmarked messages');
      }
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
  } catch (error) {
    console.error('[CleanNigeriaChat] Exception:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

// Run the script
if (require.main === module) {
  cleanNigeriaChatRoom()
    .then(result => {
      if (result.success) {
        console.log(`\n✅ Successfully cleaned Nigeria chat room. Deleted ${result.deletedCount || 0} messages.`);
        process.exit(0);
      } else {
        console.error(`\n❌ Failed to clean Nigeria chat room: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { cleanNigeriaChatRoom };

