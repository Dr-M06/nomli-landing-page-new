import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('🧹 Starting story cleanup...')

    // Get all expired stories (older than 24 hours)
    const { data: expiredStories, error: queryError } = await supabaseAdmin
      .from('stories')
      .select('id, user_id, media_url, media_type, mux_asset_id')
      .lt('expires_at', new Date().toISOString())

    if (queryError) {
      console.error('Error querying expired stories:', queryError)
      throw queryError
    }

    console.log(`Found ${expiredStories?.length || 0} expired stories`)

    if (!expiredStories || expiredStories.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No expired stories to clean up',
          deletedCount: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    let deletedFromStorage = 0
    let deletedFromMux = 0
    let deletedFromDb = 0

    // Helper function to delete Mux video asset
    const deleteMuxVideo = async (assetId: string): Promise<boolean> => {
      try {
        const muxTokenId = Deno.env.get('MUX_ACCESS_TOKEN_ID')
        const muxTokenSecret = Deno.env.get('MUX_ACCESS_TOKEN_SECRET')
        
        if (!muxTokenId || !muxTokenSecret) {
          console.error('⚠️ Mux credentials not configured in edge function environment')
          return false
        }

        // Create Basic Auth header for Mux API
        const credentials = btoa(`${muxTokenId}:${muxTokenSecret}`)
        
        const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          console.error(`Failed to delete Mux asset ${assetId}:`, response.status, errorText)
          return false
        }

        console.log(`✅ Deleted Mux video asset: ${assetId}`)
        return true
      } catch (error) {
        console.error(`Error deleting Mux asset ${assetId}:`, error)
        return false
      }
    }

    // Helper function to delete from Bunny.net Storage
    const deleteBunnyNetFile = async (imageUrl: string): Promise<boolean> => {
      try {
        const storageZone = Deno.env.get('BUNNY_NET_STORAGE_ZONE')
        const storagePassword = Deno.env.get('BUNNY_NET_STORAGE_PASSWORD')
        const storageEndpoint = Deno.env.get('BUNNY_NET_STORAGE_ENDPOINT') || 'storage.bunnycdn.com'
        
        if (!storageZone || !storagePassword) {
          console.error('⚠️ Bunny.net credentials not configured in edge function environment')
          return false
        }

        // Extract storage path from CDN URL
        // Example: https://nomli-mingle-images.b-cdn.net/story-photos/user-id/timestamp.jpg
        // Path: story-photos/user-id/timestamp.jpg
        const url = new URL(imageUrl)
        const storagePath = url.pathname.substring(1) // Remove leading slash
        
        const storageUrl = `https://${storageEndpoint}/${storageZone}/${storagePath}`
        
        const trimmedPassword = storagePassword?.trim() || ''
        
        const deleteResponse = await fetch(storageUrl, {
          method: 'DELETE',
          headers: {
            'AccessKey': trimmedPassword,
          },
        })

        if (deleteResponse.ok) {
          console.log(`✅ Deleted from Bunny.net: ${storagePath}`)
          return true
        } else {
          const errorText = await deleteResponse.text().catch(() => 'Unknown error')
          console.error(`Failed to delete from Bunny.net ${storagePath}:`, deleteResponse.status, errorText)
          return false
        }
      } catch (error) {
        console.error(`Error deleting from Bunny.net:`, error)
        return false
      }
    }

    // Delete media files from storage/Mux
    for (const story of expiredStories) {
      try {
        // Check if this is a Mux video (has mux_asset_id)
        if (story.media_type === 'video' && story.mux_asset_id) {
          // Delete video from Mux
          const deleted = await deleteMuxVideo(story.mux_asset_id)
          if (deleted) {
            deletedFromMux++
          }
        } else if (story.media_type === 'photo') {
          // Check if this is a Bunny.net URL
          const cdnHostname = Deno.env.get('BUNNY_NET_CDN_HOSTNAME') || ''
          const storageZone = Deno.env.get('BUNNY_NET_STORAGE_ZONE') || ''
          const isBunnyNetUrl = 
            (cdnHostname && story.media_url.includes(cdnHostname)) ||
            (storageZone && story.media_url.includes(`${storageZone}.b-cdn.net`))
          
          if (isBunnyNetUrl) {
            // Delete from Bunny.net Storage
            const deleted = await deleteBunnyNetFile(story.media_url)
            if (deleted) {
              deletedFromStorage++
            }
          } else {
            // Delete photos from Supabase Storage
            const bucket = 'story-photos'
            const filePath = story.media_url.split(`/${bucket}/`)[1] || story.media_url.split(`story-photos/`)[1]
            
            if (filePath) {
              const { error: storageError } = await supabaseAdmin.storage
                .from(bucket)
                .remove([filePath])

              if (storageError) {
                console.error(`Failed to delete ${filePath}:`, storageError)
              } else {
                deletedFromStorage++
                console.log(`✅ Deleted photo from Supabase storage: ${filePath}`)
              }
            }
          }
        } else {
          console.warn(`⚠️ Story ${story.id} has no mux_asset_id for video or invalid media type`)
        }
      } catch (err) {
        console.error('Error deleting story media:', err)
      }
    }

    // Delete reactions for expired stories first (before deleting stories)
    // This ensures reactions are cleaned up even if story deletion fails
    const { error: reactionsDeleteError } = await supabaseAdmin
      .from('story_reactions')
      .delete()
      .in('story_id', expiredStories.map(s => s.id))

    if (reactionsDeleteError) {
      console.error('Error deleting story reactions:', reactionsDeleteError)
      // Don't throw - continue with story deletion even if reaction deletion fails
    } else {
      console.log(`✅ Deleted reactions for ${expiredStories.length} expired stories`)
    }

    // Delete story records from database
    // Note: Due to CASCADE, reactions will also be deleted automatically,
    // but we delete them explicitly above for better logging and to ensure cleanup
    const { error: deleteError } = await supabaseAdmin
      .from('stories')
      .delete()
      .lt('expires_at', new Date().toISOString())

    if (deleteError) {
      console.error('Error deleting stories from database:', deleteError)
      throw deleteError
    }

    deletedFromDb = expiredStories.length

    console.log(`✅ Cleanup complete:`)
    console.log(`  - Deleted ${deletedFromStorage} photos from storage`)
    console.log(`  - Deleted ${deletedFromMux} videos from Mux`)
    console.log(`  - Deleted reactions for ${expiredStories.length} expired stories`)
    console.log(`  - Deleted ${deletedFromDb} story records from database`)

    return new Response(
      JSON.stringify({ 
        success: true,
        deletedFromStorage,
        deletedFromMux,
        deletedFromDb,
        deletedReactions: expiredStories.length,
        message: `Successfully cleaned up ${deletedFromDb} expired stories (${deletedFromStorage} photos, ${deletedFromMux} videos) and their reactions`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Story cleanup error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

