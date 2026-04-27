import { log, warn, error } from './productionLogger';
// Script to fix the database triggers related to the conversation_id issue
const { createClient } = require('@supabase/supabase-js');

// Get your Supabase URL and anon key from environment variables or config
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create a Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fixTriggers() {
  log('Starting to fix triggers...');
  
  try {
    // Drop existing triggers
    log('Dropping existing triggers...');
    await supabase.rpc('execute_sql', {
      sql: 'DROP TRIGGER IF EXISTS trigger_message_notification ON private_messages;'
    });
    
    await supabase.rpc('execute_sql', {
      sql: 'DROP TRIGGER IF EXISTS set_updated_at ON private_messages;'
    });
    
    // Create or replace the queue_message_notification function
    log('Creating queue_message_notification function...');
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
    
    // Recreate the message notification trigger
    log('Creating message notification trigger...');
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE TRIGGER trigger_message_notification
        AFTER INSERT ON private_messages
        FOR EACH ROW
        EXECUTE FUNCTION queue_message_notification();
      `
    });
    
    // Recreate the updated_at trigger function
    log('Creating update_updated_at function...');
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION update_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    
    // Recreate the updated_at trigger
    log('Creating set_updated_at trigger...');
    await supabase.rpc('execute_sql', {
      sql: `
        CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON private_messages
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at();
      `
    });
    
    log('Triggers fixed successfully!');
  } catch (error) {
    error('Error fixing triggers:', error);
  }
}

// Run the function
fixTriggers(); 