import { log, warn, error } from './productionLogger';
// Script to add conversation_id field to private_messages table
const { supabase } = require('./supabase');

async function addConversationIdField() {
  log('Starting to add conversation_id field...');
  
  try {
    // Check if the column already exists
    log('Checking if conversation_id column exists...');
    const { data: columns, error: columnsError } = await supabase.rpc('execute_sql', {
      sql: `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'private_messages'
        AND column_name = 'conversation_id';
      `
    });
    
    if (columnsError) {
      error('Error checking column:', columnsError);
      return;
    }
    
    // Add the column if it doesn't exist
    if (!columns || (columns?.length || 0) === 0) {
      log('Adding conversation_id column...');
      await supabase.rpc('execute_sql', {
        sql: 'ALTER TABLE private_messages ADD COLUMN conversation_id UUID;'
      });
      
      log('Creating index on conversation_id...');
      await supabase.rpc('execute_sql', {
        sql: 'CREATE INDEX IF NOT EXISTS idx_private_messages_conversation_id ON private_messages(conversation_id);'
      });
      
      // Update existing messages with a conversation_id
      log('Updating existing messages with conversation_id...');
      await supabase.rpc('execute_sql', {
        sql: `
          UPDATE private_messages
          SET conversation_id = uuid_generate_v4()
          WHERE conversation_id IS NULL;
        `
      });
      
      log('conversation_id field added successfully!');
    } else {
      log('conversation_id column already exists.');
    }
    
    // Update the queue_message_notification function to handle conversation_id
    log('Updating queue_message_notification function...');
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION queue_message_notification()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
          -- Insert a record into the notification queue
          INSERT INTO notification_queue (
            recipient_id,
            sender_id,
            message_content
          ) VALUES (
            NEW.recipient_id,
            NEW.sender_id,
            NEW.content
          );
          
          RETURN NEW;
        END;
        $$;
      `
    });
    
    // Recreate the trigger
    log('Recreating trigger...');
    await supabase.rpc('execute_sql', {
      sql: 'DROP TRIGGER IF EXISTS trigger_message_notification ON private_messages;'
    });
    
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE TRIGGER trigger_message_notification
        AFTER INSERT ON private_messages
        FOR EACH ROW
        EXECUTE FUNCTION queue_message_notification();
      `
    });
    
    log('All changes applied successfully!');
  } catch (error) {
    error('Error adding conversation_id field:', error);
  }
}

// Run the function
addConversationIdField(); 