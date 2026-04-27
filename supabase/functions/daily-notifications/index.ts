import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationData {
  userId: string
  email: string
  fullName: string
  likes: number
  missedCalls: number
  upcomingEvents: number
  newFollowers: number
  comments: number
  gifts: number
  date: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get all active users who have email notifications enabled
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        email_notifications_enabled,
        last_email_notification_sent
      `)
      .eq('email_notifications_enabled', true)
      .not('email', 'is', null)

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const notifications: NotificationData[] = []
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0))
    const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999))

    console.log(`Processing notifications for ${users.length} users`)

    for (const user of users) {
      // Skip if user received notification in last 24 hours
      if (user.last_email_notification_sent) {
        const lastSent = new Date(user.last_email_notification_sent)
        const hoursSinceLastSent = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60)
        if (hoursSinceLastSent < 24) {
          continue
        }
      }

      const notificationData = await generateUserNotificationData(
        supabase,
        user.id,
        user.email,
        user.full_name,
        yesterdayStart,
        yesterdayEnd
      )

      if (notificationData && hasActivity(notificationData)) {
        notifications.push(notificationData)
      }
    }

    console.log(`Found ${notifications.length} users with activity to notify`)

    // Send emails
    const emailResults = await Promise.allSettled(
      notifications.map(notification => sendDailyNotificationEmail(notification))
    )

    // Update last notification sent timestamp for successful sends
    const successfulSends = emailResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === 'fulfilled')

    for (const { index } of successfulSends) {
      const notification = notifications[index]
      await supabase
        .from('profiles')
        .update({ last_email_notification_sent: new Date().toISOString() })
        .eq('id', notification.userId)
    }

    const successCount = successfulSends.length
    const failureCount = emailResults.length - successCount

    return new Response(JSON.stringify({
      success: true,
      processed: notifications.length,
      sent: successCount,
      failed: failureCount,
      message: `Daily notifications processed: ${successCount} sent, ${failureCount} failed`
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in daily notifications function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function generateUserNotificationData(
  supabase: any,
  userId: string,
  email: string,
  fullName: string,
  startDate: Date,
  endDate: Date
): Promise<NotificationData | null> {
  try {
    // Get likes received
    const { count: likes } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_owner_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get missed calls (calls that were not answered)
    const { count: missedCalls } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('status', 'missed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get upcoming events (events starting in next 24 hours)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const { count: upcomingEvents } = await supabase
      .from('event_attendees')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'attending')
      .gte('events.start_date', new Date().toISOString())
      .lte('events.start_date', tomorrow.toISOString())

    // Get new followers
    const { count: newFollowers } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get comments on user's posts
    const { count: comments } = await supabase
      .from('post_comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_owner_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get gifts received
    const { count: gifts } = await supabase
      .from('gifts')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    return {
      userId,
      email,
      fullName,
      likes: likes || 0,
      missedCalls: missedCalls || 0,
      upcomingEvents: upcomingEvents || 0,
      newFollowers: newFollowers || 0,
      comments: comments || 0,
      gifts: gifts || 0,
      date: startDate.toISOString().split('T')[0]
    }
  } catch (error) {
    console.error(`Error generating notification data for user ${userId}:`, error)
    return null
  }
}

function hasActivity(data: NotificationData): boolean {
  return data.likes > 0 || 
         data.missedCalls > 0 || 
         data.upcomingEvents > 0 || 
         data.newFollowers > 0 || 
         data.comments > 0 || 
         data.gifts > 0
}

async function sendDailyNotificationEmail(data: NotificationData): Promise<void> {
  const emailContent = generateEmailHTML(data)
  
  // Using Resend API (you can replace with SendGrid, Mailgun, etc.)
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY not configured')
  }

  // Support email for "from" field (should be a verified domain in Resend)
  // Set SUPPORT_EMAIL environment variable in Supabase dashboard
  const supportEmail = Deno.env.get('SUPPORT_EMAIL') || 'hello@nomli.cc'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Nomli Mingle <${supportEmail}>`,
      to: [data.email],
      subject: `Your Daily Nomli Mingle Update - ${data.date}`,
      html: emailContent,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to send email: ${error}`)
  }
}

function generateEmailHTML(data: NotificationData): string {
  const activities = []
  
  if (data.likes > 0) {
    activities.push(`❤️ <strong>${data.likes}</strong> new like${data.likes > 1 ? 's' : ''} on your posts`)
  }
  
  if (data.newFollowers > 0) {
    activities.push(`👥 <strong>${data.newFollowers}</strong> new follower${data.newFollowers > 1 ? 's' : ''}`)
  }
  
  if (data.comments > 0) {
    activities.push(`💬 <strong>${data.comments}</strong> new comment${data.comments > 1 ? 's' : ''} on your posts`)
  }
  
  if (data.gifts > 0) {
    activities.push(`🎁 <strong>${data.gifts}</strong> gift${data.gifts > 1 ? 's' : ''} received`)
  }
  
  if (data.missedCalls > 0) {
    activities.push(`📞 <strong>${data.missedCalls}</strong> missed call${data.missedCalls > 1 ? 's' : ''}`)
  }
  
  if (data.upcomingEvents > 0) {
    activities.push(`📅 <strong>${data.upcomingEvents}</strong> upcoming event${data.upcomingEvents > 1 ? 's' : ''}`)
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Daily Nomli Mingle Update</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
        .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px; }
        .content { padding: 40px 20px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 30px; }
        .activity-list { list-style: none; padding: 0; margin: 0; }
        .activity-item { background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 15px 20px; margin-bottom: 15px; border-radius: 0 8px 8px 0; }
        .activity-item:last-child { margin-bottom: 0; }
        .cta { text-align: center; margin: 40px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; font-weight: 600; }
        .footer { background-color: #f8f9fa; padding: 30px 20px; text-align: center; color: #666; font-size: 14px; }
        .footer a { color: #667eea; text-decoration: none; }
        .no-reply { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin-bottom: 20px; color: #856404; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Nomli Mingle</h1>
          <p>Your Daily Activity Summary</p>
        </div>
        
        <div class="content">
          <div class="no-reply">
            <strong>📧 Do Not Reply:</strong> This is an automated message. Please do not reply to this email.
          </div>
          
          <div class="greeting">
            Hi ${data.fullName || 'there'}! 👋<br>
            Here's what happened in your Nomli Mingle world yesterday:
          </div>
          
          <ul class="activity-list">
            ${activities.map(activity => `<li class="activity-item">${activity}</li>`).join('')}
          </ul>
          
          <div class="cta">
            <a href="https://nomli.com" class="cta-button">Open Nomli Mingle</a>
          </div>
        </div>
        
        <div class="footer">
          <p>
            You're receiving this because you have email notifications enabled.<br>
            <a href="https://nomli.com/settings">Update your notification preferences</a>
          </p>
          <p>
            © 2024 Nomli Mingle. All rights reserved.<br>
            <a href="https://nomli.com/privacy">Privacy Policy</a> | <a href="https://nomli.com/terms">Terms of Service</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}
