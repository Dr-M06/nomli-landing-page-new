// Edge Function: Cleanup expired media (24-hour auto-delete)
// This function runs on a schedule to delete media files older than 24 hours
// Can be triggered manually or via CRON job

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExpiredMedia {
  id: string
  file_url: string | null
  thumbnail_url: string | null
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[Cleanup] Starting 24-hour media cleanup...')

    // Create Supabase admin client (needs service role for deletion)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get all expired media and voice notes (older than 24 hours)
    const { data: expiredMedia, error: queryError } = await supabaseAdmin
      .from('private_messages')
      .select('id, file_url, thumbnail_url, media_url, message_type')
      .in('message_type', ['media', 'voice_note'])
      .eq('file_deleted', false)
      .lt('expiry_at', new Date().toISOString())

    if (queryError) {
      console.error('[Cleanup] Error querying expired media:', queryError)
      throw queryError
    }

    if (!expiredMedia || expiredMedia.length === 0) {
      console.log('[Cleanup] No expired media found')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No expired media to clean up',
          deleted: 0 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`[Cleanup] Found ${expiredMedia.length} expired media items`)

    let deletedCount = 0
    let errorCount = 0

    // Delete each media file or voice note from storage
    for (const media of expiredMedia) {
      try {
        const isVoiceNote = media.message_type === 'voice_note'
        
        // For voice notes, use media_url; for media, use file_url
        const fileUrl = isVoiceNote ? media.media_url : media.file_url
        const thumbnailUrl = media.thumbnail_url

        // Delete main file (media or voice note)
        if (fileUrl) {
          // Voice notes are stored in 'audio' bucket, media in 'chat-media'
          const bucketName = isVoiceNote ? 'audio' : 'chat-media'
          const filePath = extractPathFromUrl(fileUrl, isVoiceNote)
          
          if (filePath) {
            const { error: deleteError } = await supabaseAdmin
              .storage
              .from(bucketName)
              .remove([filePath])

            if (deleteError) {
              console.error(`[Cleanup] Error deleting ${isVoiceNote ? 'voice note' : 'file'} ${filePath}:`, deleteError)
              errorCount++
            } else {
              console.log(`[Cleanup] Deleted ${isVoiceNote ? 'voice note' : 'file'}: ${filePath}`)
            }
          }
        }

        // Delete thumbnail (only for media, not voice notes)
        if (thumbnailUrl && !isVoiceNote) {
          const thumbnailPath = extractPathFromUrl(thumbnailUrl)
          if (thumbnailPath) {
            const { error: deleteError } = await supabaseAdmin
              .storage
              .from('chat-media')
              .remove([thumbnailPath])

            if (deleteError) {
              console.error(`[Cleanup] Error deleting thumbnail ${thumbnailPath}:`, deleteError)
            } else {
              console.log(`[Cleanup] Deleted thumbnail: ${thumbnailPath}`)
            }
          }
        }

        // Mark as deleted in database
        const updateData: any = { 
          file_deleted: true, 
          updated_at: new Date().toISOString()
        }
        
        if (isVoiceNote) {
          updateData.media_url = null
        } else {
          updateData.file_url = null
          updateData.thumbnail_url = null
        }
        
        const { error: updateError } = await supabaseAdmin
          .from('private_messages')
          .update(updateData)
          .eq('id', media.id)

        if (updateError) {
          console.error(`[Cleanup] Error updating message ${media.id}:`, updateError)
          errorCount++
        } else {
          deletedCount++
          console.log(`[Cleanup] Marked message ${media.id} as deleted`)
        }
      } catch (error) {
        console.error(`[Cleanup] Error processing media ${media.id}:`, error)
        errorCount++
      }
    }

    console.log(`[Cleanup] Cleanup complete. Deleted: ${deletedCount}, Errors: ${errorCount}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '24-hour cleanup completed',
        deleted: deletedCount,
        errors: errorCount,
        total: expiredMedia.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('[Cleanup] Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

/**
 * Extract storage path from full Supabase URL
 * Example: https://xxx.supabase.co/storage/v1/object/public/chat-media/media/user-id/file.jpg
 * Returns: media/user-id/file.jpg
 * For voice notes: https://xxx.supabase.co/storage/v1/object/public/audio/voice-notes/file.m4a
 * Returns: voice-notes/file.m4a
 */
function extractPathFromUrl(url: string | null, isVoiceNote: boolean = false): string | null {
  if (!url) return null
  
  try {
    if (isVoiceNote) {
      // Voice notes are in 'audio' bucket
      const match = url.match(/\/audio\/(.+)$/)
      return match ? match[1] : null
    } else {
      // Media files are in 'chat-media' bucket
      const match = url.match(/\/chat-media\/(.+)$/)
      return match ? match[1] : null
    }
  } catch (error) {
    console.error('[Cleanup] Error extracting path from URL:', error)
    return null
  }
}

