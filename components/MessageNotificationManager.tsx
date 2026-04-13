import React, { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { supabase } from '../utils/supabase';
import MessageNotificationPopup from './MessageNotificationPopup';
import { badgeCounter } from '../utils/badgeCounter';
import { log, warn, error } from '../utils/productionLogger';


interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  created_at: string;
}

export default function MessageNotificationManager() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const lastMessageId = useRef<string | null>(null);

  useEffect(() => {
    // Only listen for messages when not on a chat screen
    if (pathname?.startsWith('/chat/')) {
      return;
    }

    const channel = supabase
      .channel('private_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
        },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Don't show notification for messages sent by current user
          const { data: { user } } = await supabase.auth.getUser();
          if (user && newMessage.sender_id === user.id) {
            return;
          }

          // Don't show duplicate notifications
          if (newMessage.id === lastMessageId.current) {
            return;
          }

          lastMessageId.current = newMessage.id;

          // Get sender profile information
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', newMessage.sender_id)
            .single();

          if (profile) {
            // Format message content based on type
            let displayContent = newMessage.content;
            
            // For media messages
            if (newMessage.message_type === 'media') {
              const mediaType = newMessage.file_type?.startsWith('video/') ? '🎥 Video' : '📷 Photo';
              displayContent = mediaType; // Don't show caption in notification
            }
            // For voice notes
            else if (newMessage.message_type === 'voice_note') {
              displayContent = '🎤 Voice message';
            }
            
            const message: Message = {
              id: newMessage.id,
              content: displayContent,
              sender_id: newMessage.sender_id,
              sender_name: profile.full_name || 'Unknown User',
              sender_avatar: profile.avatar_url,
              created_at: newMessage.created_at,
            };

            // Foreground vs background behavior
            if (AppState.currentState === 'active') {
              // App is open: show in-app popup and sound only
              setCurrentMessage(message);
              setIsPopupVisible(true);
            } else {
              // App in background: update badge only (system push handled elsewhere)
              try {
                await badgeCounter.updateBadgeCount();
                log('[MessageNotificationManager] Badge count updated for new background message');
              } catch (badgeError) {
                error('[MessageNotificationManager] Error updating badge count (background):', badgeError);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pathname]);

  const handleClosePopup = () => {
    setIsPopupVisible(false);
    setCurrentMessage(null);
  };

  const handleOpenChat = () => {
    if (currentMessage) {
      // Navigate to the chat with this user
      router.push(`/chat/${currentMessage.sender_id}`);
    }
  };

  if (!currentMessage || !isPopupVisible) {
    return null;
  }

  return (
    <MessageNotificationPopup
      message={currentMessage}
      isVisible={isPopupVisible}
      onClose={handleClosePopup}
      onOpenChat={handleOpenChat}
    />
  );
}
