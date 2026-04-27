// Edge Function: Cleanup expired media files
// This should be run as a cron job every 12 hours

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify this is called from a cron job or with service key
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role for admin access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get expired media
    const { data: expiredMedia, error: fetchError } = await supabaseAdmin
      .rpc('get_expired_media')

    if (fetchError) {
      console.error('Error fetching expired media:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch expired media' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!expiredMedia || expiredMedia.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No expired media to clean up', deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let deletedCount = 0
    const errors: string[] = []

    // Delete each expired file from storage
    for (const media of expiredMedia) {
      try {
        // Extract file path from URL
        const filePath = media.file_url?.split('/storage/v1/object/public/chat-media/')[1]
        const thumbnailPath = media.thumbnail_url?.split('/storage/v1/object/public/chat-media/')[1]

        // Delete main file
        if (filePath) {
          const { error: deleteError } = await supabaseAdmin
            .storage
            .from('chat-media')
            .remove([filePath])

          if (deleteError) {
            console.error(`Error deleting file ${filePath}:`, deleteError)
            errors.push(`Failed to delete ${filePath}`)
          }
        }

        // Delete thumbnail (optional - we might want to keep thumbnails)
        // Uncomment if you want to delete thumbnails too:
        // if (thumbnailPath && thumbnailPath.startsWith('thumbnails/')) {
        //   await supabaseAdmin.storage.from('chat-media').remove([thumbnailPath])
        // }

        // Mark as deleted in database
        const { error: markError } = await supabaseAdmin
          .rpc('mark_media_deleted', { message_id: media.id })

        if (markError) {
          console.error(`Error marking media as deleted ${media.id}:`, markError)
          errors.push(`Failed to mark ${media.id} as deleted`)
        } else {
          deletedCount++
        }
      } catch (error) {
        console.error(`Error processing media ${media.id}:`, error)
        errors.push(`Error processing ${media.id}`)
      }
    }

    return new Response(
      JSON.stringify({
        message: `Cleanup completed`,
        deleted: deletedCount,
        total: expiredMedia.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in cleanup-expired-media function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

