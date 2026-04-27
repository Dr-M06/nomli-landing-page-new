import { supabase } from './supabase';
import { warn, error } from './productionLogger';

const PROCESS_FN = 'process-notifications';
const INSTANT_CHAT_FN = 'send-instant-chat-push';
const INSTANT_PUSH_TIMEOUT_MS = 15000;

/**
 * Fire-and-forget Edge Function invoke with one retry. Failures used to be swallowed; if the
 * invoke fails and Supabase cron is not enabled on process-notifications, rows stay pending until
 * the recipient opens the app (feels like "next day" delivery).
 */
function invokeProcessNotifications(body: Record<string, unknown>): void {
  const run = (attempt: 1 | 2) => {
    supabase.functions
      .invoke(PROCESS_FN, { body })
      .then(({ error: fnError }) => {
        if (fnError) {
          const msg = fnError.message || String(fnError);
          if (attempt === 1) {
            warn(
              `[PushTrigger] ${PROCESS_FN} failed (attempt 1): ${msg}. Retrying in 2s…`
            );
            setTimeout(() => run(2), 2000);
          } else {
            error(
              `[PushTrigger] ${PROCESS_FN} failed after retry: ${msg}. In Supabase Dashboard enable Edge Function cron on ${PROCESS_FN} (see supabase/functions/process-notifications/cron.json) or add a Database Webhook on notification_queue INSERT so pushes still send when this invoke fails.`
            );
          }
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt === 1) {
          warn(`[PushTrigger] ${PROCESS_FN} threw (attempt 1): ${msg}. Retrying in 2s…`);
          setTimeout(() => run(2), 2000);
        } else {
          error(`[PushTrigger] ${PROCESS_FN} threw after retry: ${msg}`);
        }
      });
  };
  run(1);
}

/**
 * Process a notification_queue row via the Edge Function immediately (fire-and-forget).
 * When the recipient's app is fully closed, no client code runs; the server must send the push.
 */
export function triggerProcessNotification(notificationId: string | null | undefined): void {
  if (!notificationId) return;
  invokeProcessNotifications({ notification_id: notificationId });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t!)) as Promise<T>;
}

/**
 * Sends DM push directly via Edge Function (no notification_queue pending row).
 * Await after insert so delivery starts before the UI shows “sent”.
 */
export async function sendInstantPrivateMessagePush(message: {
  id: string;
  sender_id: string;
  recipient_id: string;
}): Promise<void> {
  if (!message?.id || !message.sender_id || !message.recipient_id) return;
  try {
    await withTimeout(
      (async () => {
        const { error: fnError } = await supabase.functions.invoke(INSTANT_CHAT_FN, {
          body: {
            action: 'private_message',
            message_id: message.id,
            sender_id: message.sender_id,
            recipient_id: message.recipient_id,
          },
        });
        if (fnError) throw fnError;
      })(),
      INSTANT_PUSH_TIMEOUT_MS
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`[PushTrigger] ${INSTANT_CHAT_FN} (DM) failed: ${msg}; retrying once…`);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      const { error: fnError } = await supabase.functions.invoke(INSTANT_CHAT_FN, {
        body: {
          action: 'private_message',
          message_id: message.id,
          sender_id: message.sender_id,
          recipient_id: message.recipient_id,
        },
      });
      if (fnError) throw fnError;
    } catch (e2) {
      error(
        `[PushTrigger] ${INSTANT_CHAT_FN} (DM) failed after retry. Deploy this Edge Function and apply migration 20260414120000_dm_push_no_queue.sql (DMs no longer enqueue).`,
        e2
      );
    }
  }
}

/** @deprecated Prefer sendInstantPrivateMessagePush (direct Expo send, no queue). */
export function requestImmediateMessagePush(message: {
  id: string;
  sender_id: string;
  recipient_id: string;
}): void {
  void sendInstantPrivateMessagePush(message);
}

/**
 * Reaction push: direct Expo send (no notification_queue).
 */
export async function sendInstantReactionPush(payload: {
  sender_id: string;
  recipient_id: string;
  message_id: string;
  emoji: string;
  sender_name: string;
  message_preview: string;
}): Promise<void> {
  if (
    !payload?.sender_id ||
    !payload.recipient_id ||
    !payload.message_id ||
    !payload.emoji
  ) {
    return;
  }
  try {
    await withTimeout(
      (async () => {
        const { error: fnError } = await supabase.functions.invoke(INSTANT_CHAT_FN, {
          body: {
            action: 'message_reaction',
            sender_id: payload.sender_id,
            recipient_id: payload.recipient_id,
            message_id: payload.message_id,
            emoji: payload.emoji,
            sender_name: payload.sender_name,
            message_preview: payload.message_preview,
          },
        });
        if (fnError) throw fnError;
      })(),
      INSTANT_PUSH_TIMEOUT_MS
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`[PushTrigger] ${INSTANT_CHAT_FN} (reaction) failed: ${msg}`);
  }
}
