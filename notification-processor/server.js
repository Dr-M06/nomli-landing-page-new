const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Security: Only allow calls with correct secret
const PROCESSOR_SECRET = process.env.NOTIFICATION_PROCESSOR_SECRET;

// Process notifications endpoint
app.post('/process-notifications', async (req, res) => {
  try {
    // Check authorization
    if (req.header('x-processor-secret') !== PROCESSOR_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🔄 Processing notification queue...');

    // Get pending notifications
    const { data: pending, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('❌ Error fetching notifications:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!pending || pending.length === 0) {
      console.log('✅ No pending notifications');
      return res.json({ processed: 0, failed: 0, message: 'No pending notifications' });
    }

    console.log(`📱 Processing ${pending.length} notifications...`);

    let processed = 0;
    let failed = 0;

    // Process each notification
    for (const notification of pending) {
      try {
        console.log(`📤 Processing notification ${notification.id} for user ${notification.recipient_id}`);

        // Prepare notification data
        const notificationData = {
          to: notification.expo_push_token,
          sound: 'default',
          title: getNotificationTitle(notification),
          body: getNotificationBody(notification),
          data: {
            type: notification.notification_type,
            sender_id: notification.sender_id,
            message_id: notification.metadata?.message_id || null,
            conversation_id: notification.metadata?.conversation_id || null,
          },
          badge: 1,
        };

        // Send via Expo Push API
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.data && result.data[0] && result.data[0].status === 'ok') {
          // Mark as sent
          await supabase
            .from('notification_queue')
            .update({ 
              status: 'sent', 
              processed_at: new Date().toISOString() 
            })
            .eq('id', notification.id);
          
          console.log(`✅ Notification ${notification.id} sent successfully`);
          processed++;
        } else {
          throw new Error(`Expo API error: ${JSON.stringify(result)}`);
        }

      } catch (error) {
        console.error(`❌ Failed to process notification ${notification.id}:`, error);
        
        // Increment attempts and mark as failed if max attempts reached
        const newAttempts = notification.attempts + 1;
        const newStatus = newAttempts >= 3 ? 'failed' : 'pending';
        
        await supabase
          .from('notification_queue')
          .update({ 
            attempts: newAttempts,
            status: newStatus,
            error_message: error.message,
            processed_at: newStatus === 'failed' ? new Date().toISOString() : null
          })
          .eq('id', notification.id);
        
        failed++;
      }
    }

    console.log(`✅ Processed ${processed} notifications, ${failed} failed`);

    res.json({ 
      processed, 
      failed, 
      total: pending.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in notification processor:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'notification-processor'
  });
});

// Helper functions
function getNotificationTitle(notification) {
  switch (notification.notification_type) {
    case 'message':
      return `${notification.sender_name} sent you a message`;
    case 'call':
      return `Incoming call from ${notification.sender_name}`;
    default:
      return 'New notification';
  }
}

function getNotificationBody(notification) {
  switch (notification.notification_type) {
    case 'message':
      return notification.message_content || 'You have a new message';
    case 'call':
      return 'Tap to answer';
    default:
      return 'You have a new notification';
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Notification processor running on port ${PORT}`);
  console.log(`🔐 Processor secret: ${PROCESSOR_SECRET ? 'Set' : 'Not set'}`);
});

module.exports = app;
