import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Updates the profiles table schema to add push_token column and set up notification triggers
 */
export const updateProfileSchema = async (): Promise<boolean> => {
  try {
    log('[Schema] Updating profiles table to add push_token column...');
    
    // SQL statements for profile updates
    const profileStatements = [
      // Add date_of_birth column for age-gating (13+/16+ media rules)
      `ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS date_of_birth DATE`,

      // Replace legacy age constraint with DOB-based 13+ constraint.
      // (Keeps backwards compatibility: if DOB is null, passes.)
      `ALTER TABLE profiles
      DROP CONSTRAINT IF EXISTS profiles_age_check`,
      `ALTER TABLE profiles
      ADD CONSTRAINT profiles_age_check
      CHECK (
        date_of_birth IS NULL OR
        (
          date_of_birth <= CURRENT_DATE AND
          date_of_birth <= (CURRENT_DATE - INTERVAL '13 years')
        )
      )`,

      // Add push_token column to profiles table
      `ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS push_token TEXT`,
      
      // Create index on push_token for faster lookups
      `CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token)`,
      
      // RLS Policy to allow users to update their own push_token
      `CREATE POLICY "Users can update their own push_token"
      ON profiles
      FOR UPDATE
      TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid())`,
      
      // Function to register a device token
      `CREATE OR REPLACE FUNCTION register_device_token(user_id UUID, token TEXT)
      RETURNS BOOLEAN
      SECURITY DEFINER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        UPDATE profiles
        SET push_token = token,
            updated_at = NOW()
        WHERE id = user_id;
        
        RETURN FOUND;
      END;
      $$`
    ];
    
    // SQL statements for notification system
    const notificationStatements = [
      // Create a table to store notification events
      `CREATE TABLE IF NOT EXISTS notification_queue (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        message_content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMPTZ
      )`,
      
      // RLS for notification queue
      `ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY`,
      
      // Allow authenticated users to see only their own notifications
      `CREATE POLICY "Users can see their own notifications"
      ON notification_queue
      FOR SELECT
      TO authenticated
      USING (recipient_id = auth.uid())`,
      
      // Allow authenticated users to insert notifications to any recipient
      `CREATE POLICY "Users can send notifications"
      ON notification_queue
      FOR INSERT
      TO authenticated
      WITH CHECK (sender_id = auth.uid())`,
      
      // Create a trigger function to queue notifications when a new private message is inserted
      // Only queue notification if recipient is different from sender (prevents self-notifications)
      `CREATE OR REPLACE FUNCTION queue_message_notification()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        -- Only queue notification if recipient is different from sender
        -- This prevents users from receiving notifications for their own messages
        IF NEW.recipient_id != NEW.sender_id THEN
        INSERT INTO notification_queue (
          recipient_id,
          sender_id,
          message_content
        ) VALUES (
          NEW.recipient_id,
          NEW.sender_id,
          NEW.content
        );
        END IF;
        
        RETURN NEW;
      END;
      $$`,
      
      // Drop existing trigger if any
      `DROP TRIGGER IF EXISTS trigger_message_notification ON private_messages`,
      
      // Create the trigger on private_messages table
      `CREATE TRIGGER trigger_message_notification
      AFTER INSERT ON private_messages
      FOR EACH ROW
      EXECUTE FUNCTION queue_message_notification()`,
      
      // Function to mark notification as processed
      `CREATE OR REPLACE FUNCTION mark_notification_processed(notification_id UUID)
      RETURNS BOOLEAN
      SECURITY DEFINER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        UPDATE notification_queue
        SET processed = TRUE,
            processed_at = NOW()
        WHERE id = notification_id;
        
        RETURN FOUND;
      END;
      $$`
    ];
    
    // Combine all statements
    const allStatements = [...profileStatements, ...notificationStatements];
    
    // Execute each statement
    for (const statement of allStatements) {
      try {
        const { error } = await supabase.rpc('execute_sql', {
          sql: statement + ';'
        });
        
        if (error) {
          // Skip "policy already exists" errors
          if (error.message?.includes('already exists')) {
            log('[Schema] Policy or object already exists, skipping...');
          } else {
            warn(`[Schema] Error executing SQL statement: ${error.message}`);
          }
        }
      } catch (statementError) {
        error('[Schema] Error in statement execution:', statementError);
      }
    }
    
    log('[Schema] Schema update completed');
    return true;
  } catch (error) {
    error('[Schema] Error updating schema:', error);
    return false;
  }
}; 