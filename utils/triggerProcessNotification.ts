import { supabase } from './supabase';

/**
 * Process a notification_queue row via the Edge Function immediately (fire-and-forget).
 * When the recipient's app is fully closed, no client code runs; the server must send the push.
 */
export function triggerProcessNotification(notificationId: string | null | undefined): void {
  if (!notificationId) return;
  supabase.functions
    .invoke('process-notifications', { body: { notification_id: notificationId } })
    .then(() => {})
    .catch(() => {});
}

/**
 * After a private message is inserted, the DB trigger queues a push row, but RLS blocks the
 * sender from reading notification_queue. The Edge Function (service role) resolves the row
 * from message_id + sender/recipient and processes it immediately — WhatsApp-style delivery.
 */
export function requestImmediateMessagePush(message: {
  id: string;
  sender_id: string;
  recipient_id: string;
}): void {
  if (!message?.id || !message.sender_id || !message.recipient_id) return;
  supabase.functions
    .invoke('process-notifications', {
      body: {
        message_id: message.id,
        sender_id: message.sender_id,
        recipient_id: message.recipient_id,
      },
    })
    .then(() => {})
    .catch(() => {});
}
