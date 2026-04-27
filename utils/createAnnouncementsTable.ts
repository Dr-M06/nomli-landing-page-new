import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


export async function createAnnouncementsTable() {
  try {
    log('Checking if announcements table exists...');

    // Only check for the main announcements table, as we'll use local storage for reads
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('id')
        .limit(1);
        
      if (!error) {
        log('announcements table exists and can be queried');
        return true;
      } else {
        log('Could not query announcements table:', error);
      }
    } catch (checkError) {
      log('Error checking announcements table:', checkError);
    }
    
    // Execute the SQL to create the announcements table only
    try {
      log('Creating announcements table...');
      
      // We only need to create the announcements table
      const { error } = await supabase.rpc('create_announcements_table');
      
      if (error) {
        log('Error creating announcements table:', error);
        log('Please run the migration SQL manually or check database permissions');
        return false;
      }
      
      log('Successfully created announcements table');
      return true;
    } catch (createError) {
      log('Error calling create_announcements_table RPC:', createError);
      log('Please ensure you have run the migration SQL file manually');
      return false;
    }
  } catch (error) {
    log('Error in createAnnouncementsTable - continuing anyway:', error);
    return false;
  }
}

// SQL function to create only the announcements table
export const createAnnouncementsTableSQL = `
CREATE OR REPLACE FUNCTION create_announcements_table()
RETURNS void AS $$
BEGIN
  -- Create announcements table if it doesn't exist
  CREATE TABLE IF NOT EXISTS announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    active BOOLEAN DEFAULT true,
    target_user_id UUID REFERENCES profiles(id), -- NULL means for all users
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE -- Optional expiration date
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active);
  CREATE INDEX IF NOT EXISTS idx_announcements_target_user ON announcements(target_user_id);
  CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_announcements_expires_at ON announcements(expires_at);

  -- Enable RLS
  ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

  -- Drop existing policies if they exist (to prevent errors on recreation)
  DROP POLICY IF EXISTS "Users can view announcements targeted to them or public announcements" ON announcements;
  DROP POLICY IF EXISTS "Only admins can manage announcements" ON announcements;
  
  -- Create policies
  CREATE POLICY "Users can view announcements targeted to them or public announcements"
    ON announcements FOR SELECT
    USING (
      target_user_id IS NULL OR 
      target_user_id = auth.uid() OR
      auth.role() = 'service_role'
    );
    
  -- Only admins can insert/update/delete announcements
  CREATE POLICY "Only admins can manage announcements"
    ON announcements FOR ALL
    USING (auth.role() = 'service_role');

END;
$$ LANGUAGE plpgsql;
`; 