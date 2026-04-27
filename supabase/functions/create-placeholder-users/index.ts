/**
 * 🚀 CREATE PLACEHOLDER USERS EDGE FUNCTION
 * 
 * Creates placeholder user accounts for engagement boosting.
 * This function uses the Supabase Admin API to create auth users,
 * then creates corresponding profiles.
 * 
 * Usage:
 * POST /functions/v1/create-placeholder-users
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLACEHOLDER_USERS = [
  {
    username: 'alexmartinez',
    full_name: 'Alex Martinez',
    avatar_url: 'https://randomuser.me/api/portraits/men/32.jpg',
    bio: 'Building, creating, and sharing real moments.',
    location: 'New York, USA',
  },
  {
    username: 'sarahjones',
    full_name: 'Sarah Jones',
    avatar_url: 'https://randomuser.me/api/portraits/women/44.jpg',
    bio: 'Good energy, good people, and growth mindset.',
    location: 'London, UK',
  },
  {
    username: 'mikechen',
    full_name: 'Mike Chen',
    avatar_url: 'https://randomuser.me/api/portraits/men/75.jpg',
    bio: 'Tech, food, and community events.',
    location: 'Tokyo, Japan',
  },
  {
    username: 'emilywilson',
    full_name: 'Emily Wilson',
    avatar_url: 'https://randomuser.me/api/portraits/women/68.jpg',
    bio: 'Art, ideas, and everyday inspiration.',
    location: 'Paris, France',
  },
  {
    username: 'jamestaylor',
    full_name: 'James Taylor',
    avatar_url: 'https://randomuser.me/api/portraits/men/22.jpg',
    bio: 'Fitness, nature, and healthy routines.',
    location: 'Sydney, Australia',
  },
  {
    username: 'lisabrown',
    full_name: 'Lisa Brown',
    avatar_url: 'https://randomuser.me/api/portraits/women/17.jpg',
    bio: 'Books, creativity, and calm weekends.',
    location: 'Toronto, Canada',
  },
  {
    username: 'davidlee',
    full_name: 'David Lee',
    avatar_url: 'https://randomuser.me/api/portraits/men/45.jpg',
    bio: 'Music, stories, and positive vibes.',
    location: 'Berlin, Germany',
  },
  {
    username: 'amandagarcia',
    full_name: 'Amanda Garcia',
    avatar_url: 'https://randomuser.me/api/portraits/women/63.jpg',
    bio: 'Style, travel, and culture.',
    location: 'Barcelona, Spain',
  },
  {
    username: 'chrisanderson',
    full_name: 'Chris Anderson',
    avatar_url: 'https://randomuser.me/api/portraits/men/86.jpg',
    bio: 'Code, games, and coffee runs.',
    location: 'Dubai, UAE',
  },
  {
    username: 'jessicamoore',
    full_name: 'Jessica Moore',
    avatar_url: 'https://randomuser.me/api/portraits/women/91.jpg',
    bio: 'Exploring cities, food spots, and new hobbies.',
    location: 'Singapore',
  },
];

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ username: string; error: string }> = [];

    for (const user of PLACEHOLDER_USERS) {
      try {
        // Check if profile already exists
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', user.username)
          .single();

        if (existingProfile) {
          skipped.push(user.username);
          continue;
        }

        // Create auth user using Admin API
        const email = `${user.username}@placeholder.nomli.com`;
        const password = crypto.randomUUID(); // Random password (won't be used)

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            username: user.username,
          },
        });

        if (authError) {
          errors.push({ username: user.username, error: authError.message });
          continue;
        }

        if (!authUser.user) {
          errors.push({ username: user.username, error: 'Failed to create auth user' });
          continue;
        }

        // Create profile
        // Note: is_placeholder column will be added by migration
        // If column doesn't exist yet, we'll create profile without it and update later
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authUser.user.id,
            username: user.username,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            bio: user.bio,
            location: user.location,
            // is_placeholder will be set via migration or UPDATE query below
          });

        if (profileError && profileError.message.includes('is_placeholder')) {
          // Column doesn't exist yet, insert without it
          const { error: retryError } = await supabase
            .from('profiles')
            .insert({
              id: authUser.user.id,
              username: user.username,
              full_name: user.full_name,
              avatar_url: user.avatar_url,
              bio: user.bio,
              location: user.location,
            });
          
          if (retryError) {
            errors.push({ username: user.username, error: retryError.message });
            await supabase.auth.admin.deleteUser(authUser.user.id);
            continue;
          }
        } else if (profileError) {
          errors.push({ username: user.username, error: profileError.message });
          await supabase.auth.admin.deleteUser(authUser.user.id);
          continue;
        }

        // Try to set is_placeholder flag (if column exists)
        await supabase
          .from('profiles')
          .update({ is_placeholder: true })
          .eq('id', authUser.user.id);

        if (profileError) {
          errors.push({ username: user.username, error: profileError.message });
          // Try to clean up auth user if profile creation fails
          await supabase.auth.admin.deleteUser(authUser.user.id);
          continue;
        }

        created.push(user.username);
      } catch (error: any) {
        errors.push({ username: user.username, error: error.message || 'Unknown error' });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        created,
        skipped,
        errors,
        message: `Created ${created.length} placeholder users, skipped ${skipped.length}, ${errors.length} errors`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

