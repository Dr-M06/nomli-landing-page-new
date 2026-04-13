import { log, warn, error } from './productionLogger';
const { createClient } = require('@supabase/supabase-js');

// Get environment variables - REQUIRED, no fallbacks for security
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_KEY');
  console.error('\nPlease set these in your .env file or environment');
  process.exit(1);
}

// Create Supabase client with service key for admin privileges
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Sets up the private messaging system by running SQL statements
 */
async function setupPrivateMessaging() {
  try {
    log('Setting up private messaging system...');
    
    // SQL statements to execute
    const statements = [
      // Create the private messages table
      `CREATE TABLE IF NOT EXISTS private_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      
      // Create indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_private_messages_sender_id ON private_messages(sender_id)`,
      `CREATE INDEX IF NOT EXISTS idx_private_messages_recipient_id ON private_messages(recipient_id)`,
      `CREATE INDEX IF NOT EXISTS idx_private_messages_created_at ON private_messages(created_at)`,
      
      // Create a view to organize conversations
      `CREATE OR REPLACE VIEW conversations AS
      WITH unique_conversations AS (
          SELECT 
              CASE WHEN sender_id < recipient_id THEN sender_id ELSE recipient_id END AS user1_id,
              CASE WHEN sender_id < recipient_id THEN recipient_id ELSE sender_id END AS user2_id,
              MAX(created_at) as last_message_at
          FROM 
              private_messages
          GROUP BY 
              user1_id, user2_id
      )
      SELECT 
          uc.user1_id,
          uc.user2_id,
          p1.full_name AS user1_name,
          p2.full_name AS user2_name,
          p1.avatar_url AS user1_avatar,
          p2.avatar_url AS user2_avatar,
          uc.last_message_at
      FROM 
          unique_conversations uc
      JOIN 
          profiles p1 ON uc.user1_id = p1.id
      JOIN 
          profiles p2 ON uc.user2_id = p2.id
      ORDER BY 
          uc.last_message_at DESC`,
      
      // Create a function to get conversations for a specific user
      `CREATE OR REPLACE FUNCTION get_user_conversations(user_id UUID)
      RETURNS TABLE (
          conversation_with UUID,
          conversation_with_name TEXT,
          conversation_with_avatar TEXT,
          last_message_at TIMESTAMPTZ,
          unread_count BIGINT
      ) 
      SECURITY DEFINER
      AS $$
      BEGIN
          RETURN QUERY
          WITH conversation_partners AS (
              SELECT 
                  CASE 
                      WHEN uc.user1_id = user_id THEN uc.user2_id 
                      ELSE uc.user1_id 
                  END AS partner_id,
                  uc.last_message_at
              FROM 
                  conversations uc
              WHERE 
                  uc.user1_id = user_id OR uc.user2_id = user_id
          )
          SELECT 
              cp.partner_id,
              p.full_name,
              p.avatar_url,
              cp.last_message_at,
              COUNT(pm.id) FILTER (WHERE pm.read = FALSE AND pm.recipient_id = user_id) AS unread_count
          FROM 
              conversation_partners cp
          JOIN 
              profiles p ON cp.partner_id = p.id
          LEFT JOIN 
              private_messages pm ON 
                  (pm.sender_id = cp.partner_id AND pm.recipient_id = user_id) OR
                  (pm.sender_id = user_id AND pm.recipient_id = cp.partner_id)
          GROUP BY 
              cp.partner_id, p.full_name, p.avatar_url, cp.last_message_at
          ORDER BY 
              cp.last_message_at DESC;
      END;
      $$ LANGUAGE plpgsql`,
      
      // Create a function to mark messages as read
      `CREATE OR REPLACE FUNCTION mark_messages_as_read(for_user_id UUID, from_user_id UUID)
      RETURNS BOOLEAN
      SECURITY DEFINER
      AS $$
      BEGIN
          UPDATE 
              private_messages
          SET 
              read = TRUE,
              updated_at = NOW()
          WHERE 
              recipient_id = for_user_id AND
              sender_id = from_user_id AND
              read = FALSE;
              
          RETURN TRUE;
      END;
      $$ LANGUAGE plpgsql`,
      
      // Enable RLS on the private_messages table
      `ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY`,
      
      // Allow users to view messages they've sent or received
      `DROP POLICY IF EXISTS "Users can view their own messages" ON private_messages`,
      `CREATE POLICY "Users can view their own messages"
      ON private_messages FOR SELECT
      TO authenticated
      USING (sender_id = auth.uid() OR recipient_id = auth.uid())`,
      
      // Allow users to send messages
      `DROP POLICY IF EXISTS "Users can send messages" ON private_messages`,
      `CREATE POLICY "Users can send messages"
      ON private_messages FOR INSERT
      TO authenticated
      WITH CHECK (sender_id = auth.uid())`,
      
      // Allow users to update only messages they've sent
      `DROP POLICY IF EXISTS "Users can update their sent messages" ON private_messages`,
      `CREATE POLICY "Users can update their sent messages"
      ON private_messages FOR UPDATE
      TO authenticated
      USING (sender_id = auth.uid())`,
      
      // Allow users to delete only messages they've sent
      `DROP POLICY IF EXISTS "Users can delete their sent messages" ON private_messages`,
      `CREATE POLICY "Users can delete their sent messages"
      ON private_messages FOR DELETE
      TO authenticated
      USING (sender_id = auth.uid())`,
      
      // Create a function to update the updated_at timestamp
      `CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`,
      
      // Add a trigger to set updated_at on update
      `DROP TRIGGER IF EXISTS set_updated_at ON private_messages`,
      `CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON private_messages
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at()`
    ];
    
    // Execute each statement
    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc('execute_sql', {
          sql: statement
        });
        
        if (error) {
          warn(`Error executing SQL statement: ${error.message}`);
          warn(`Statement: ${statement.substring(0, 100)}...`);
        }
      } catch (statementError) {
        error(`Failed to execute statement: ${statementError.message}`);
        error(`Statement: ${statement.substring(0, 100)}...`);
      }
    }
    
    log('Private messaging system set up successfully');
    return { success: true };
  } catch (error) {
    error('Error setting up private messaging:', error);
    return { success: false, error };
  }
}

// Run the setup
setupPrivateMessaging()
  .then(result => {
    log('Setup completed:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    error('Setup failed:', error);
    process.exit(1);
  }); 