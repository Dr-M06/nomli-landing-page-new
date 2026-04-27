import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  FlatList, 
  TextInput, 
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Animated,
  Alert,
  Easing,
  Modal,
  Dimensions,
  Linking,
  AppState,
  DeviceEventEmitter,
  TouchableWithoutFeedback,
  Keyboard,
  StatusBar
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Send, Trash2, CornerUpLeft, X, MessageSquare, Reply, Mic, CheckCircle, Image as ImageIcon, Play, Copy, Heart } from 'lucide-react-native';
import useChatStore from '../../app/store/useChatStore';
import VoiceRecorder from '../../components/VoiceRecorder';
import { periodicMemoryCleanup } from '../../utils/memoryManager';
import VoiceNotePlayer from '../../components/VoiceNotePlayer';
// Calls removed
import MediaMessage from '../../components/MediaMessage';
import PremiumMediaPicker from '../../components/PremiumMediaPicker';
import { getAutoSaveMediaSetting } from '../../utils/mediaSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../utils/supabase';
import { Profile } from '../../utils/supabase';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Shadow, Spacing } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import {
  Message,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  subscribeToMessages,
  getUserProfile,
  deleteMessage,
  refreshMessageStatus,
  evaluateDmGateWithLocalPersistence,
  shouldAwaitReciprocityAfterOutbound,
} from '../../utils/chat';
import { setDmAwaitingReciprocity } from '../../utils/dmAwaitingStorage';
import { getCachedMessages, cacheMessages, addMessageToCache, updateMessageInCache, removeMessageFromCache } from '../../utils/messageCache';
import { formatTimeAgo } from '../../utils/formatters';
import { usePresence } from '../../hooks/usePresence';
import { isUserOnline, formatLastSeen } from '../../utils/presenceUtils';
// Calls removed
import { addPrivateMessageReaction, removePrivateMessageReaction } from '../../utils/privateMessageReactions';
import { ensurePrivateReactionsTable } from '../../utils/ensurePrivateReactionsTable';
import { sanitizeUsernameForDisplay, getSafeDisplayName, stripAtSymbol } from '../../utils/contentFilter';
// Calls removed
import { OFFICIAL_ACCOUNT_ID } from '../../constants/ContactEmails';
import { getUserDmPreference, ensurePrivacySchema } from '../../utils/privacySettings';
import ExternalLinkModal from '../../components/ExternalLinkModal';
// Gifts/credits removed post-pivot
import CallButton from '../../components/CallButton';

import { checkOnlineStatusMigration, applyOnlineStatusMigration } from '../../utils/applyOnlineStatusMigration';

import { format } from '../../utils/dateFormatters';
import ChatBackgroundPattern from '../../components/ChatBackgroundPattern';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  checkPrivateMessageContent, 
  censorMessage, 
  logModerationAction, 
  analyzeUserBehavior,
  getModeratorResponse,
  ModerationResult
} from '../../utils/contentModerator';
import EnhancedAvatar from '../../components/EnhancedAvatar';
import * as FileSystem from 'expo-file-system';
import { badgeCounter } from '../../utils/badgeCounter';
import { log, warn, error } from '../../utils/productionLogger';
import { sendInstantReactionPush } from '../../utils/triggerProcessNotification';
import { getOngoingCallSession, getOngoingCallSessionEventName, type OngoingCallSession } from '../../utils/ongoingCallSession';




// Simple function to generate a random ID for temporary messages
const generateTempId = () => {
  return 'temp_' + Math.random().toString(36).substring(2, 15);
};

// Helper function to generate DiceBear URL
const generateDiceBearUrl = (style: string, userId?: string) => {
  const userSeed = userId || 'default';
  return `https://api.dicebear.com/9.x/${style}/png?seed=${userSeed}&size=120`;
};

// Helper function to get the correct avatar URL
const getAvatarUrl = (avatarUrl?: string | null, userId?: string) => {
  log('[Private Chat] getAvatarUrl called with:', avatarUrl, 'userId:', userId);
  
  if (!avatarUrl) {
    log('[Private Chat] No avatar URL provided');
    return null;
  }
  
  // Handle DiceBear avatars
  if (avatarUrl.startsWith('dicebear:')) {
    const avatarData = avatarUrl.replace('dicebear:', '');
    if (avatarData.includes(':')) {
      const [style, seed] = avatarData.split(':');
      return generateDiceBearUrl(style, seed);
    } else {
      // Handle old format (style only) - use userId as seed
      return generateDiceBearUrl(avatarData, userId);
    }
  }
  
  // Handle regular URLs - DON'T add cache busting here as it causes constant reloading
  // The EnhancedAvatar component should handle caching internally
  log('[Private Chat] Returning storage URL without cache busting:', avatarUrl);
  return avatarUrl;
};

// Removed unused TypingIndicator component that was causing animation conflicts // Removed memo wrapper

// Add this URL regex pattern
const URL_PATTERN = /https?:\/\/\S+|www\.\S+|\S+\.\S+\/\S+|\S+\.(?:com|org|net|edu|io|co|me|app|dev)(?:\/\S*)?/gi;

// Helper function to detect and parse voice note from content
const parseVoiceNote = (content: string): { isVoiceNote: boolean; url?: string; duration?: number } => {
  if (!content || !content.startsWith('🎤 Voice Message')) {
    return { isVoiceNote: false };
  }
  
  // Extract URL from content (format: "🎤 Voice Message\n{URL}\nDuration: {duration}s")
  const lines = content.split('\n');
  const urlLine = lines.find(line => line.startsWith('http://') || line.startsWith('https://'));
  const durationLine = lines.find(line => line.includes('Duration:'));
  
  if (!urlLine) {
    return { isVoiceNote: false };
  }
  
  let duration = 0;
  if (durationLine) {
    const durationMatch = durationLine.match(/Duration:\s*(\d+(?:\.\d+)?)s?/i);
    if (durationMatch) {
      duration = parseFloat(durationMatch[1]);
    }
  }
  
  return {
    isVoiceNote: true,
    url: urlLine.trim(),
    duration: duration || 0,
  };
};

// Add this function to render message text with clickable links
const renderTextWithLinks = (text: string, textStyle: any, themeColors: any, isUserMessage: boolean, onLinkPress: (url: string) => void) => {
  if (!text) return null;
  
  // Find all URLs in the text
  const matches = Array.from(text.matchAll(URL_PATTERN));
  
  if (matches.length === 0) {
    // No links, just return the text
    return <Text style={textStyle}>{text}</Text>;
  }
  
  // Split text into parts (text and links)
  const parts = [];
  let lastIndex = 0;
  
  matches.forEach((match, i) => {
    const linkStart = match.index || 0;
    const linkEnd = linkStart + match[0].length;
    
    // Add text before the link
    if (linkStart > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, linkStart),
        key: `text-${i}`
      });
    }
    
    // Add the link
    parts.push({
      type: 'link',
      content: match[0],
      key: `link-${i}`
    });
    
    lastIndex = linkEnd;
  });
  
  // Add any remaining text after the last link
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
      key: `text-${parts.length}`
    });
  }
  
  // Choose appropriate link color based on message background
  const linkStyle = isUserMessage 
    ? { color: '#FFFFFF', textDecorationLine: 'underline', fontWeight: 'bold' }  // White bold underlined text for user messages (dark background)
    : { color: themeColors.primary.main, textDecorationLine: 'underline' };      // Theme color for other messages (light background)
  
  // Render each part
  return (
    <Text style={textStyle}>
      {parts.map(part => {
        if (part.type === 'link') {
          return (
            <Text
              key={part.key}
              style={[textStyle, linkStyle]}
              onPress={(e) => {
                // Stop propagation to prevent triggering the bubble's onPress
                e.stopPropagation();
                onLinkPress(part.content);
              }}
            >
              {part.content}
            </Text>
          );
        } else {
          return <Text key={part.key}>{part.content}</Text>;
        }
      })}
    </Text>
  );
};


// Add this function near the top of the file, before the ChatScreen component
const preventNotificationTriggerLoop = async () => {
  try {
    // Set a flag to prevent notification triggers from running in this screen
    await AsyncStorage.setItem('skip_notification_triggers', 'true');
    
    // Clear the flag after 10 seconds to allow it to run elsewhere if needed
    setTimeout(async () => {
      await AsyncStorage.removeItem('skip_notification_triggers');
    }, 10000);
  } catch (error) {
    error('[Chat] Error setting notification trigger prevention flag:', error);
  }
};



// Add this near the top of the file, after imports
const areMessagePropsEqual = (prevProps, nextProps) => {
  // Optimized equality check - fail fast on most common changes
  if (prevProps.item.id !== nextProps.item.id) return false;
  if (prevProps.item.content !== nextProps.item.content) return false;
  if (prevProps.activeMessageMenuId !== nextProps.activeMessageMenuId) return false;
  if (prevProps.item.delivered !== nextProps.item.delivered) return false;
  if (prevProps.item.read !== nextProps.item.read) return false;
  
  // Only check reaction changes if they exist
  const prevReactions = prevProps.item.reactions?.length || 0;
  const nextReactions = nextProps.item.reactions?.length || 0;
  if (prevReactions !== nextReactions) return false;
  
  return true; // Props are equal, prevent re-render
};

// Optimized Message list component with React.memo for better performance
const MessageList = React.memo(({ 
  messages, 
  otherUser, 
  user, 
  handleReply, 
  handleReaction,
  handleRemoveReaction,
  activeMessageMenuId,
  setActiveMessageMenuId,
  handleDeleteMessage,
  themeColors,
  onLoadMore,
  loadingMore,
  flatListRef,
  renderMessage,
  onScroll
}) => {
  if (__DEV__ && messages.length > 0 && messages.length % 50 === 0) {
    log('[Private Chat] Rendering messages:', messages.length, 'total messages');
  }
  
  // Combine messages into a single array (store _index to avoid findIndex in renderItem)
  const combinedData = React.useMemo(() => {
    const allItems: any[] = [];
    
    // Add messages with type marker and index for O(1) lookup in renderItem
    messages.forEach((msg, idx) => {
      if (msg && msg.id && msg.created_at) {
        allItems.push({ ...msg, _type: 'message', _index: idx });
      }
    });
    
    // Sort by timestamp (newest first, since list is inverted)
    allItems.sort((a, b) => {
      const timeA = new Date(a.created_at || a.timestamp || 0).getTime();
      const timeB = new Date(b.created_at || b.timestamp || 0).getTime();
      return timeB - timeA;
    });
    
    return allItems;
  }, [messages]);

  const scrollToMessageId = React.useCallback((messageId: string) => {
    const idx = combinedData.findIndex((d) => d.id === messageId);
    if (idx >= 0 && flatListRef?.current) {
      try {
        flatListRef.current.scrollToIndex({ index: idx, animated: true });
      } catch (_) {}
    }
  }, [combinedData]);
  
  // Render item function that handles both messages and calls
  const renderItem = ({ item, index }) => {
    // Safety check
    if (!item) {
      return null;
    }
    
    // Calls removed
    
    // It's a message - use _index for O(1) lookup (no findIndex)
    if (!item.created_at) {
      if (__DEV__) warn('[Message] Invalid message item:', item);
      return null;
    }
    const messageIndex = item._index ?? messages.findIndex(msg => msg.id === item.id);
    if (messageIndex === -1) {
      if (__DEV__) warn('[Message] Message not found in messages array:', item.id);
      return null;
    }
    const originalMessage = messages[messageIndex];
    return renderMessage({ item: originalMessage, index: messageIndex, scrollToMessageId });
  };
  
  return (
    <FlatList
      ref={flatListRef}
      data={combinedData}
      extraData={messages}
      keyExtractor={(item, index) => {
        if (!item) {
          error('[FlatList] Invalid item (undefined):', index);
          return `invalid-${index}`;
        }
        
        if (!item.id) {
          error('[FlatList] Invalid item without ID:', item);
          return `invalid-${index}`;
        }
        
      // Calls removed
      return item.id.startsWith('temp_') ? `temp-${item.id}` : `${item.id}`;
      }}
      renderItem={renderItem}
      inverted
      contentContainerStyle={styles.messageListContent}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.3}
      onScroll={onScroll}
      scrollEventThrottle={16}
                    ListFooterComponent={loadingMore ? <ActivityIndicator color={themeColors.primary} style={styles.loadingMore} /> : null}
              ListHeaderComponent={null}

      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      updateCellsBatchingPeriod={100}
      // Variable-height rows (reactions/media/replies). Fixed getItemLayout causes offset
      // miscalculations and visible "jump" when a message height changes (e.g. reacting).
      removeClippedSubviews={false}
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
        autoscrollToTopThreshold: 10,
      }}

    />
  );
}, (prevProps, nextProps) => {
  // Only skip re-render when the *messages array reference* is unchanged.
  // Length-only checks break real-time updates like reactions/read/delivered that
  // update items in-place (new array, same length).
  return (
    prevProps.messages === nextProps.messages &&
    prevProps.user?.id === nextProps.user?.id &&
    prevProps.activeMessageMenuId === nextProps.activeMessageMenuId
  );
});

// Add this beautiful WhatsApp-style typing indicator component before the main ChatScreen component
const WhatsAppTypingIndicator = () => {
  const [dotState, setDotState] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setDotState(prev => (prev + 1) % 4);
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getDotOpacity = (index: number) => {
    // Create a pulsing effect based on dotState
    const phase = (dotState - index + 4) % 4;
    return phase === 0 ? 1 : phase === 1 ? 0.7 : 0.3;
  };

  return (
    <View style={{ 
      flexDirection: 'row', 
      alignItems: 'flex-end',
      marginLeft: 16,
      marginRight: 50,
    }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
      }}>
        {/* Side pointer/tail */}
        <View
          style={{
            width: 0,
            height: 0,
            borderStyle: 'solid',
            borderTopWidth: 6,
            borderTopColor: 'transparent',
            borderBottomWidth: 0,
            borderBottomColor: 'transparent',
            borderRightWidth: 5,
            borderRightColor: themeColors.surface,
            borderLeftWidth: 0,
            borderLeftColor: 'transparent',
            marginRight: -1,
          }}
        />
        
        {/* Main bubble */}
        <View
          style={{
            backgroundColor: themeColors.surface,
            borderRadius: 14,
            paddingHorizontal: 10,
            paddingVertical: 6,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08,
            shadowRadius: 2,
            elevation: 2,
            minWidth: 45,
          }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 12,
          }}>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: themeColors.neutral.subtext,
                  marginHorizontal: 1.5,
                  opacity: getDotOpacity(index),
                }}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

// Message Input Container Component with proper send button debouncing and optimized memoization
const MessageInputContainer = React.memo(({
  inputMessage,
  setInputMessage,
  handleSend,
  handleVoiceNotePress,
  messageInputRef,
  themeColors,
  activeMessageMenuId,
  setActiveMessageMenuId,
  handleTypingChange,
  onMediaPress,
  pendingMedia,
  inputPlaceholder,
  sendBlockedByRecipient,
}: {
  inputMessage: string | undefined;
  setInputMessage: (text: string) => void;
  handleSend: () => Promise<void> | void;
  handleVoiceNotePress: () => void;
  messageInputRef: any;
  themeColors: any;
  activeMessageMenuId: string | null;
  setActiveMessageMenuId: (id: string | null) => void;
  handleTypingChange?: (typing: boolean) => void;
  onMediaPress?: () => void;
  pendingMedia?: Array<{ fileUrl: string; thumbnailUrl: string | null; fileType: string }>;
  inputPlaceholder?: string;
  sendBlockedByRecipient?: { reason: 'not_mutual_follow' | 'missing_context' | 'awaiting_reciprocity' | 'dms_disabled' } | null;
}) => {
  
  // Debug logging to track prop values and re-renders
  log('[MessageInputContainer] Rendered with props:', {
    inputMessage,
    inputMessageType: typeof inputMessage,
    inputMessageValue: inputMessage,
    hasSetInputMessage: !!setInputMessage,
    hasHandleSend: !!handleSend,
    hasHandleTypingChange: !!handleTypingChange,
    renderTimestamp: new Date().toISOString()
  });
  
  // Add safety checks for required functions
  if (!setInputMessage || !handleSend) {
    error('[MessageInputContainer] Missing required props:', {
      setInputMessage: !!setInputMessage,
      handleSend: !!handleSend,
      handleTypingChange: !!handleTypingChange
    });
    return null;
  }
  
  const handleSendPress = useCallback(async () => {
    const messageText = (inputMessage && typeof inputMessage === 'string') ? inputMessage : '';
    const hasPendingMedia = pendingMedia && pendingMedia.length > 0;
    
    // Allow sending if there's pending media OR message text
    if (!messageText.trim() && !hasPendingMedia) {
      log('[InputContainer] Send blocked - no message text and no pending media');
      return;
    }
    
    try {
      log('[InputContainer] Sending message...', { hasPendingMedia });
      await handleSend();
      log('[InputContainer] Message sent successfully');
    } catch (error) {
      error('[InputContainer] Error sending message:', error);
    }
  }, [inputMessage, handleSend, pendingMedia]);
  
  // Ensure messageText is always a string
  const messageText = (inputMessage && typeof inputMessage === 'string') ? inputMessage : '';
  const hasPendingMedia = pendingMedia && pendingMedia.length > 0;
  const blocked = sendBlockedByRecipient != null;
  // Enable send button if there's message text OR pending media; always disabled when blocked
  const isSendDisabled = blocked || (!messageText.trim() && !hasPendingMedia);
  
  return (
    <View style={[
      styles.inputContainer, 
      { 
        backgroundColor: themeColors.surface,
        borderTopColor: themeColors.border,
      }
    ]}>
      {blocked && (
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: themeColors.surfaceVariant || 'rgba(0,0,0,0.06)', borderBottomWidth: 1, borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, color: themeColors.textSecondary, flex: 1 }}>
            {sendBlockedByRecipient?.reason === 'not_mutual_follow'
              ? 'You can send one first message. Wait for their reply to continue, or follow each other to chat freely.'
              : sendBlockedByRecipient?.reason === 'awaiting_reciprocity'
                ? 'You sent the first message. Wait for them to reply to continue — or follow each other to chat freely.'
              : sendBlockedByRecipient?.reason === 'missing_context'
                ? 'You can send one first message. Wait for their reply to continue, or follow each other to chat freely.'
                : 'Direct messages are disabled'}
          </Text>
        </View>
      )}
      {/* Media preview carousel if media is pending */}
      {hasPendingMedia && (
        <View style={{
          paddingVertical: 12,
          paddingHorizontal: 8,
          backgroundColor: themeColors.surface,
          borderBottomWidth: 1,
          borderBottomColor: themeColors.border,
        }}>
          <FlatList
            data={pendingMedia}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, index) => `pending-${index}`}
            renderItem={({ item, index }) => (
              <View style={{
                marginRight: 8,
                position: 'relative',
              }}>
                <Image
                  source={{ uri: item.thumbnailUrl || item.fileUrl }}
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 12,
                  }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => 
                    setPendingMedia(prev => prev.filter((_, i) => i !== index))
                  }
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: '#FF3B30',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={12} color="#fff" />
                </TouchableOpacity>
                {item.fileType?.startsWith('video/') && (
                  <View style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    borderRadius: 8,
                    padding: 2,
                  }}>
                    <Play size={12} color="#fff" fill="#fff" />
                  </View>
                )}
              </View>
            )}
            ListFooterComponent={
              <View style={{
                justifyContent: 'center',
                paddingLeft: 8,
              }}>
                <Text style={{
                  color: themeColors.textSecondary,
                  fontSize: 12,
                  fontWeight: '600',
                }}>
                  {pendingMedia.length} {pendingMedia.length === 1 ? 'item' : 'items'}
                </Text>
              </View>
            }
          />
        </View>
      )}
      
      <View style={[
        styles.inputWrapper,
        { 
          backgroundColor: 'transparent',
          borderColor: themeColors.border,
        }
      ]}>
        <TextInput
          ref={messageInputRef}
          style={[styles.messageInput, { color: themeColors.text }]}
          placeholder={blocked ? 'Messaging is restricted' : (inputPlaceholder ?? 'Type a message...')}
          placeholderTextColor={themeColors.textSecondary}
          value={messageText}
          editable={!blocked}
          onChangeText={(text) => {
            const safeText = (text && typeof text === 'string') ? text : '';
            log('[MessageInputContainer] onChangeText called with:', { 
              text, 
              safeText, 
              currentInputMessage: inputMessage,
              textLength: safeText.length,
              timestamp: new Date().toISOString() 
            });
            
            // Add delay to see if multiple calls happen rapidly
            setTimeout(() => {
              log('[MessageInputContainer] Input state after 100ms:', inputMessage);
            }, 100);
            
            setInputMessage(safeText);
            // Safe call to handleTypingChange with proper error handling
            if (handleTypingChange && typeof handleTypingChange === 'function') {
              try {
                const isTyping = safeText.length > 0;
                log('[MessageInputContainer] Calling handleTypingChange with isTyping:', isTyping, 'text length:', safeText.length);
                handleTypingChange(isTyping);
              } catch (error) {
                warn('[MessageInputContainer] Error in handleTypingChange:', error);
              }
            } else {
              warn('[MessageInputContainer] handleTypingChange not available:', {
                handleTypingChange: !!handleTypingChange,
                type: typeof handleTypingChange
              });
            }
          }}
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={handleSendPress}
          onFocus={() => {
            if (activeMessageMenuId) {
              setActiveMessageMenuId(null);
            }
          }}
        />
        
        <View style={styles.inputActions}>
          {/* Media button */}
          {onMediaPress && (
            <TouchableOpacity
              style={[styles.actionButton, { opacity: blocked ? 0.4 : 0.7, marginRight: 8 }]}
              onPress={onMediaPress}
              disabled={blocked}
            >
              <ImageIcon size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionButton, { opacity: blocked ? 0.4 : 0.7 }]}
            onPress={handleVoiceNotePress}
            disabled={blocked}
          >
            <Mic size={20} color={themeColors.textSecondary} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: isSendDisabled 
                  ? themeColors.surfaceVariant 
                  : themeColors.primary.main,
                opacity: isSendDisabled ? 0.5 : 1,
              }
            ]}
            onPress={handleSendPress}
            disabled={isSendDisabled}
          >
            <Send 
              size={16} 
              color={isSendDisabled ? themeColors.textSecondary : "white"} 
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  // Only re-render if essential props change
  const sendBlockedSame = (prevProps.sendBlockedByRecipient == null) === (nextProps.sendBlockedByRecipient == null) &&
    prevProps.sendBlockedByRecipient?.reason === nextProps.sendBlockedByRecipient?.reason;
  return (
    prevProps.inputMessage === nextProps.inputMessage &&
    prevProps.activeMessageMenuId === nextProps.activeMessageMenuId &&
    sendBlockedSame &&
    prevProps.setInputMessage === nextProps.setInputMessage &&
    prevProps.handleSend === nextProps.handleSend
  );
});

// Default typing handler to prevent inline function creation on every render
const defaultTypingHandler = (isTyping: boolean) => {
  log('[Chat] Typing status changed:', isTyping);
};

export default function ChatScreen() {
  const router = useRouter();
  const { id, initialMessage, contextPostId } = useLocalSearchParams<{ id: string; initialMessage?: string; contextPostId?: string }>();
  const { user, session } = useAuth();
  const insets = useSafeAreaInsets();

  // Presence: update last_seen while user is in this chat (60s heartbeat; 90s online threshold elsewhere)
  usePresence(user?.id ?? null, true);

  // Debug: Log component mount and key values
  useEffect(() => {
    log('[Chat] 🎯 ChatScreen component mounted/updated:', { id, userId: user?.id, hasId: !!id, hasUser: !!user });
  }, [id, user?.id]);
  
  // Track keyboard state to ensure proper layout restoration
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Context-based messaging guardrails (post-pivot)
  const [contextStarterText, setContextStarterText] = useState<string | null>(null);
  const [messagingBlockedReason, setMessagingBlockedReason] = useState<'not_mutual_follow' | 'missing_context' | 'awaiting_reciprocity' | null>(null);
  
  // External link modal state
  const [externalLinkModalVisible, setExternalLinkModalVisible] = useState(false);
  const [externalLinkUrl, setExternalLinkUrl] = useState<string>('');
  
  // Handle showing external link warning
  const showLinkWarning = useCallback((url: string) => {
    setExternalLinkUrl(url);
    setExternalLinkModalVisible(true);
  }, []);
  
  // Handle opening external link
  const handleOpenExternalLink = useCallback(() => {
    setExternalLinkModalVisible(false);
    
    // Add http:// prefix if missing
    let fullUrl = externalLinkUrl;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = 'https://' + fullUrl;
    }
    
    Linking.openURL(fullUrl).catch(err => {
      error('Error opening URL:', err);
      Alert.alert("Error", "Could not open this link.");
    });
    
    // Clear URL after opening
    setExternalLinkUrl('');
  }, [externalLinkUrl]);
  
  // Handle canceling external link
  const handleCancelExternalLink = useCallback(() => {
    setExternalLinkModalVisible(false);
    setExternalLinkUrl('');
  }, []);
  
  // Fallback user object if user is not available but session is
  const currentUser = user || session?.user;

  // Official/support chat if either side is the official account
  const isSupportChat = (currentUser?.id === OFFICIAL_ACCOUNT_ID) || (id === OFFICIAL_ACCOUNT_ID);
  
  // Import store to prevent errors but don't use it
  const _ = useChatStore; // Unused but prevents import errors
  
  // Track keyboard visibility to ensure proper layout restoration
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);
  
  // Add this at the beginning of the component
  useEffect(() => {
    // Prevent notification trigger setup from running while in chat screen
    preventNotificationTriggerLoop();
    
    // Check and apply online status migration
    const checkMigration = async () => {
      try {
        const migrationApplied = await checkOnlineStatusMigration();
        if (!migrationApplied) {
          log('[Chat] Online status migration not applied, applying now...');
          await applyOnlineStatusMigration();
        } else {
          log('[Chat] Online status migration already applied');
        }
      } catch (error) {
        error('[Chat] Error checking/applying migration:', error);
      }
    };
    
    checkMigration();
    
    // Clean up when leaving the screen
    return () => {
      // Remove the flag when leaving the screen
      AsyncStorage.removeItem('skip_notification_triggers')
        .catch(error => error('[Chat] Error removing notification trigger prevention flag:', error));
    };
  }, []);
  
  // Mark messages as read when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id && id) {
        log('[Private Chat] Screen focused, marking messages as read for user:', id);
        
        if (user?.id && id) {
          markMessagesAsRead(user.id, id).then(() => {
            log('[Private Chat] Messages marked as read successfully');
          }).catch(error => {
            error('[Private Chat] Error marking messages as read:', error);
          });
        }
      } else {
        log('[Private Chat] Screen focused but missing user or id:', { userId: user?.id, chatId: id });
      }
    }, [user?.id, id])
  );
  const { isDarkMode, toggleTheme } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  // Get only essential chat store functions (removed complex message store integration)
  const { 
    isConversationDeleted, 
    markConversationAsDeleted,
    deletedConversationIds
  } = useChatStore();
  
  // Track which message has its menu open
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  // Calls removed post-pivot
  
  // Clear otherUser state when chat ID changes to prevent stale user data
  // Use a ref to track the previous chat ID to avoid clearing on every focus
  const prevChatIdRef = useRef<string | null>(null);
  const vibeAlertShownForChatRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Only clear if the chat ID actually changed (not just a refocus)
    if (prevChatIdRef.current !== id) {
    setOtherUser(null);
    setLoadingProfile(true);
      prevChatIdRef.current = id;
      vibeAlertShownForChatRef.current = null;
    }
  }, [id, user?.id]);

  // Only refresh messages on focus if real-time is not active AND cache is stale (fallback only)
  // Real-time subscriptions handle all updates, so we don't need to refetch on every focus
  useFocusEffect(
    useCallback(() => {
      if (id && user?.id) {
        // Only refresh if real-time is not active AND we don't have messages (fallback mechanism)
        setTimeout(async () => {
          if (!realtimeActiveRef.current && messages.length === 0) {
            if (__DEV__) log('[Private Chat] Screen focused, real-time not active, no messages - refreshing as fallback');
            silentlyRefreshMessages();
          } else {
            if (__DEV__) {
              log('[Private Chat] Screen focused - skipping refresh:', {
                realtimeActive: realtimeActiveRef.current,
                hasMessages: messages.length > 0
              });
            }
          }
        }, 300);
      }
    }, [id, user?.id, messages.length])
  );

  // Refresh messages when app comes back from background (only if real-time is not active)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active' && id && user?.id) {
        // Only refresh if real-time is not active (fallback mechanism)
        setTimeout(() => {
          if (!realtimeActiveRef.current) {
            if (__DEV__) log('[Private Chat] App became active, real-time not active - refreshing as fallback');
            silentlyRefreshMessages();
          } else {
            if (__DEV__) log('[Private Chat] App became active, real-time active - skipping refresh');
          }
        }, 500);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, [id, user?.id]);
  
  // Calls removed post-pivot
  
  // Create stable typing handler to prevent MessageInputContainer re-renders
  const stableTypingHandler = useCallback((isTyping: boolean) => {
    if (__DEV__) {
      log('[Chat] Typing status changed:', isTyping);
    }
    if (!currentUser) return;
    if (disableTypingIndicator) return;
    
    if (isTyping) {
      startTyping();
    } else {
      stopTyping();
    }
  }, [disableTypingIndicator, currentUser]);
  
  // REMOVED: Redundant presence API tracking
  // Database subscription (lines 2579-2622) is the primary and only system for tracking online status
  // Presence API was causing conflicts and unreliable status updates
  
  // REMOVED: Redundant current user presence tracking
  // onlineStatusManager handles current user's online status via database updates
  // No need for separate presence API tracking - it was causing conflicts
  
  // Start shimmer animation
  useEffect(() => {
    const startShimmerAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(shimmerAnimation, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      ).start();
    };

    startShimmerAnimation();
  }, []);
  
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isFetchingFreshMessages, setIsFetchingFreshMessages] = useState(false);
  // Removed sending state for instant messaging experience
  const [refreshing, setRefreshing] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [ongoingCallSession, setOngoingCallSessionState] = useState<OngoingCallSession | null>(getOngoingCallSession());
  
  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    if (!id || refreshing) return;
    
    setRefreshing(true);
    try {
      log('[Private Chat] Pull to refresh - fetching latest messages');
      await silentlyRefreshMessages();
    } catch (error) {
      error('[Private Chat] Error during pull to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [id, refreshing]);

  useEffect(() => {
    const eventName = getOngoingCallSessionEventName();
    const sub = DeviceEventEmitter.addListener(eventName, (next: OngoingCallSession | null) => {
      setOngoingCallSessionState(next);
    });
    return () => sub.remove();
  }, []);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [sendBlockedByRecipient, setSendBlockedByRecipient] = useState<{ reason: 'not_mutual_follow' | 'missing_context' | 'awaiting_reciprocity' | 'dms_disabled' } | null>(null);
  const [startLoadTime] = useState(Date.now());
  const [isModerationEnabled, setIsModerationEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disableTypingIndicator, setDisableTypingIndicator] = useState(false); // Start with typing indicators enabled
  

  
  // Add state for online status
  const [isOtherUserOnline, setIsOtherUserOnline] = useState<boolean>(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  

  
  // Toast animation values
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;
  
  // Shimmer animation for loading screen
  const shimmerAnimation = useRef(new Animated.Value(0)).current;
  
  // Track deleted messages to prevent them from reappearing during refresh
  const deletedMessageIds = useRef<Set<string>>(new Set());
  // Track processed message IDs to prevent duplicates
  const processedMessageIdsRef = useRef<Set<string>>(new Set());
  // Use ref to access messages without causing re-renders
  const messagesRef = useRef<Message[]>([]);
  // Track real-time subscription status
  const realtimeActiveRef = useRef(false);
  const retryCountRef = useRef(0); // Track retry attempts to prevent infinite loops
  const lastRetryTimeRef = useRef(0); // Track last retry time for debouncing
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track retry timeout to prevent multiple simultaneous retries
  const MAX_RETRIES = 3; // Maximum retry attempts before giving up
  const RETRY_COOLDOWN_MS = 5000; // Minimum 5 seconds between retries
  
  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
    // Initialize processed IDs with current messages
    messages.forEach(msg => processedMessageIdsRef.current.add(msg.id));
  }, [messages]);

  // Detect contextual starter message (context-based chats only)
  useEffect(() => {
    const contextual = [...messages]
      .reverse()
      .find(m => typeof m.content === 'string' && m.content.startsWith('Replying to:'));
    setContextStarterText(contextual?.content ?? null);
    const hasContext = !!contextPostId || !!contextual;
    setMessagingBlockedReason(hasContext ? null : 'missing_context');
  }, [messages, contextPostId]);
  const lastDeletionTime = useRef<number>(0);
  
  // Reply functionality
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [reactionPickerMessage, setReactionPickerMessage] = useState<Message | null>(null);
  
  // Voice note functionality
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  
  // Media functionality
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  // Gifts removed post-pivot
  const [pendingMedia, setPendingMedia] = useState<Array<{
    fileUrl: string;
    thumbnailUrl: string | null;
    fileType: string;
    fileSize?: number;
    expiryAt: string;
  }>>([]);
  
  const flatListRef = useRef<FlatList>(null);
  /** Kept fresh below `checkCanSendToRecipient`; used from realtime handlers defined earlier in the file. */
  const checkCanSendRef = useRef<
    (recipientId: string) => Promise<{
      allowed: boolean;
      reason: 'not_mutual_follow' | 'missing_context' | 'awaiting_reciprocity' | 'dms_disabled' | null;
    }>
  >(async () => ({ allowed: true, reason: null }));
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Separate timeout for stopping typing
  const typingChannelRef = useRef<any>(null);
  const typingHandlerRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);
  // Deterministic conversation channel (shared by both users) for broadcast events like reactions.
  // This provides realtime reaction UI even if DB replication for reactions isn't enabled yet.
  const conversationChannelRef = useRef<any>(null);
  const messageInputRef = useRef<TextInput>(null);
  const lastTypingStateUpdateRef = useRef<number>(0); // Track last typing state update time for throttling
  const otherUserTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout for auto-hiding other user typing

  // WhatsApp-style: if user is scrolled up, show a "new messages" pill
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  
  // Popular emojis for quick reactions
  const popularEmojis = ['😀', '😂', '❤️', '👍', '👎', '😢', '😮', '😡', '🎉', '🔥', '💯', '🙏'];
  
  // Add this near other refs

  
  useEffect(() => {
    let shimmerLoop: any = null;
    
    if (isInitialLoad || loadingProfile) {
      shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnimation, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(shimmerAnimation, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ])
      );
      shimmerLoop.start();
    }
    
    return () => {
      if (shimmerLoop) {
        shimmerLoop.stop();
      }
    };
  }, [isInitialLoad, loadingProfile, shimmerAnimation]);

  // Force clear loading states when coming back from calls or other screens
  useFocusEffect(
    useCallback(() => {
      const clearLoadingStatesTimeout = setTimeout(() => {
        // If we're still loading after coming back to the screen, force clear it
        if (isInitialLoad || loadingProfile || !initialDataLoaded) {
          log('[Private Chat] Force clearing loading states on screen focus');
          setIsInitialLoad(false);
          setLoadingProfile(false);
          setInitialDataLoaded(true);
          
          // Ensure typing indicator is still enabled after clearing loading states
          setDisableTypingIndicator(false);
        }
      }, 2000); // Wait 2 seconds after focus before forcing clear

      return () => clearTimeout(clearLoadingStatesTimeout);
    }, [isInitialLoad, loadingProfile, initialDataLoaded])
  );
  
  // Close message menu when tapping on the FlatList
  const handleFlatListPress = () => {
    if (activeMessageMenuId) {
      setActiveMessageMenuId(null);
    }
  };


  

  
  // Load initial data (messages and profile) before showing the chat
  const loadInitialData = useCallback(async () => {
    if (!id || !user) return;
    
    try {
      log('[Private Chat] Loading initial data...');
      setIsInitialLoad(true);
      setLoadingProfile(true);
      
      // 🚀 AGGRESSIVE CACHING: Load cached messages INSTANTLY, then fetch fresh in background
      let cachedMessages: Message[] | null = null;
      try {
        const { getCachedChatMessages } = await import('../../utils/chatCacheOptimizer');
        cachedMessages = await getCachedChatMessages(id);
        if (cachedMessages && cachedMessages.length > 0) {
          log('[Private Chat] 🚀 Loaded', cachedMessages.length, 'cached messages instantly');
          setMessages(cachedMessages);
          setIsInitialLoad(false); // Show cached messages immediately
        }
      } catch (cacheError) {
        warn('[Private Chat] Cache load failed (non-critical):', cacheError);
      }

      ensurePrivateReactionsTable().catch(() => {});
      const [profileResult, messagesResult] = await Promise.allSettled([
        getUserProfile(id),
        getMessages(user.id, id),
      ]);
      
      // Handle profile result
      if (profileResult.status === 'fulfilled' && profileResult.value) {
        log('[Private Chat] Profile loaded successfully:', profileResult.value);
        setOtherUser(profileResult.value);
        setLoadingProfile(false);
      } else {
        error('[Private Chat] Failed to load profile:', profileResult.status === 'rejected' ? profileResult.reason : 'No profile data');
        // Set fallback profile to prevent loading forever
        setOtherUser({
          id: id,
          username: 'Unknown User',
          full_name: 'Unknown User',
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        setLoadingProfile(false);
      }
      
      // Handle messages result
      if (messagesResult.status === 'fulfilled' && messagesResult.value) {
        log('[Private Chat] Messages loaded successfully:', messagesResult.value.length, 'messages');
        log('[Private Chat] First message:', messagesResult.value[0]);
        log('[Private Chat] Last message:', messagesResult.value[messagesResult.value.length - 1]);
        setMessages(messagesResult.value);
        
        // 🚀 AGGRESSIVE CACHING: Cache fresh messages for next time
        try {
          await cacheMessages(id, messagesResult.value);
          log('[Private Chat] 💾 Messages cached for instant loading next time');
        } catch (cacheError) {
          warn('[Private Chat] Failed to cache messages (non-critical):', cacheError);
        }
        
        log('[Private Chat] Messages state set, checking in next render...');
      } else {
        error('[Private Chat] Failed to load messages:', messagesResult.status === 'rejected' ? messagesResult.reason : 'No messages data');
        setMessages([]); // Set empty array so we don't stay loading forever
      }
      
      // Mark initial loading as complete
      setIsInitialLoad(false);
      setInitialDataLoaded(true);
      
      log('[Private Chat] Initial data loading completed');
      
    } catch (error) {
      error('[Private Chat] Error during initial data load:', error);
      
      // Set fallback data to prevent infinite loading
      setOtherUser({
        id: id,
        username: 'Unknown User',
        full_name: 'Unknown User',
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      setMessages([]);
      setLoadingProfile(false);
      setIsInitialLoad(false);
      setInitialDataLoaded(true);
    }
  }, [id, user]);

  // Get avatar URL without memoization for real-time updates
  const getAvatarUrlForUser = () => {
    if (!otherUser) {
      log('[Private Chat] No otherUser, returning null avatar URL');
      return null;
    }
    const url = getAvatarUrl(otherUser.avatar_url, otherUser.id);
    log('[Private Chat] Avatar URL generated:', url);
    return url;
  };

  // Icebreaker/gifts removed post-pivot

  // Check if this conversation was deleted
  const [wasConversationDeleted, setWasConversationDeleted] = useState(false);
  
  // Toast notification function
  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    
    // Set the message
    setToastMessage(message);
    
    // Reset animations
    toastOpacity.setValue(0);
    toastTranslateY.setValue(50);
    
    // Animate in
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(toastTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
    
    // Set timeout to hide toast
    toastTimeoutRef.current = setTimeout(() => {
      // Animate out
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(toastTranslateY, {
          toValue: 50,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start(() => {
        setToastMessage(null);
      });
    }, 3000);
  };
  
  // Typing indicator functions
  const startTyping = () => {
    if (!currentUser || disableTypingIndicator) return;
    if (!typingChannelRef.current) {
      if (__DEV__) warn('[Private Chat] Typing channel not initialized');
      return;
    }
    if (isTyping) return;
    try {
      setIsTyping(true);
      const typingPayload = {
        user_id: currentUser.id,
        typing: true,
        timestamp: new Date().toISOString(),
        chat_partner: id
      };
      if (__DEV__) log('[Private Chat] Sending typing start');
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: typingPayload
      }).then(() => {}).catch(() => {});
    } catch (error) {
      error('[Private Chat] Error starting typing indicator:', error);
    }
  };
  
  const stopTyping = () => {
    if (!currentUser || disableTypingIndicator) return;
    if (!typingChannelRef.current) return;
    if (!isTyping) return;
    try {
      setIsTyping(false);
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: currentUser.id, typing: false, timestamp: new Date().toISOString(), chat_partner: id }
      }).then(() => {}).catch(() => {});
    } catch (_) {}
  };
  
  const handleTypingChange = (text: string) => {
    setInputMessage(text);

    // Skip typing indicator if disabled
    if (disableTypingIndicator) {
      log('[Private Chat] handleTypingChange: Typing indicator disabled, skipping');
      return;
    }
    
    // Handle typing indicator
    if (text.trim()) {
      log('[Private Chat] handleTypingChange: Text has content, checking if should start typing');
      
      // Clear any pending stop typing timeout (user is typing again)
      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
        stopTypingTimeoutRef.current = null;
      }
      
      // User is typing
      if (!isTyping) {
        log('[Private Chat] handleTypingChange: Not currently typing, calling startTyping');
        startTyping();
      } else {
        log('[Private Chat] handleTypingChange: Already typing, just resetting timeout');
      }
      
      // Reset typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Stop typing after 3 seconds of inactivity (increased from 2s to reduce flicker)
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping();
      }, 3000);
    } else {
      // User cleared the input - delay stopping to prevent flicker when rapidly deleting
      // Clear the typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // Clear any existing stop timeout
      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
      }
      
      // Delay stopping typing by 500ms to prevent flicker when user is rapidly deleting text
      // This gives the user time to continue typing if they're just clearing to start over
      stopTypingTimeoutRef.current = setTimeout(() => {
        stopTyping();
        stopTypingTimeoutRef.current = null;
      }, 500);
    }
  };

  
  
  // Handle reply to message
  const handleReply = (message: Message) => {
    log('[Private Chat] Setting reply to message:', message);
    if (!message || !message.id) {
      error('[Private Chat] Cannot reply to invalid message');
      return;
    }
    
    setReplyToMessage(message);
    
    // Close any open message menu
    if (activeMessageMenuId) {
      setActiveMessageMenuId(null);
    }
    
    // Focus the input field
    const inputRef = messageInputRef.current;
    if (inputRef) {
      setTimeout(() => {
        inputRef.focus();
      }, 100);
    }
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      log('Haptics not available:', error);
    }
  };
  
  const cancelReply = () => setReplyToMessage(null);

  const handleReaction = useCallback(async (message: Message, emoji: string) => {
    if (!user?.id || message.id.startsWith('temp_')) return;
    
    // Check if user already has this reaction
    const existingUserReaction = message.reactions?.find(r => r.user_id === user.id);
    const isTogglingOff = existingUserReaction?.emoji === emoji;
    
    // Optimistic update: remove all user reactions, then add new one if not toggling off
    // The AnimatedReactionChip component will handle smooth animations
    setMessages(prev => prev.map(m => {
      if (m.id !== message.id) return m;
      const filteredReactions = (m.reactions ?? []).filter(r => r.user_id !== user.id);
      if (isTogglingOff) {
        // Removing reaction - let it animate out smoothly
        return { ...m, reactions: filteredReactions };
      } else {
        // Adding/switching reaction - new reaction will animate in smoothly
        const opt = { id: `opt-${Date.now()}`, emoji, user_id: user.id, created_at: new Date().toISOString() };
        return { ...m, reactions: [...filteredReactions, opt] };
      }
    }));
    
    const result = await addPrivateMessageReaction(message.id, user.id, emoji);
    
    // If failed, revert optimistic update
    if (!result.success) {
      setMessages(prev => prev.map(m => {
        if (m.id !== message.id) return m;
        // Restore original reactions
        return { ...m, reactions: message.reactions ?? [] };
      }));
      return;
    }

    // Broadcast reaction for realtime UI on the other device (fallback if DB realtime isn't streaming reactions)
    try {
      conversationChannelRef.current?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: {
          op: result.action === 'removed' ? 'DELETE' : 'INSERT',
          message_id: message.id,
          user_id: user.id,
          emoji: result.action === 'removed' ? existingUserReaction?.emoji : emoji,
        }
      }).then(() => {}).catch(() => {});
    } catch (_) {}

    // Instant push for reaction (no notification_queue — Edge Function sends Expo directly).
    if (result.success && result.action !== 'removed') {
      try {
        const recipientId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null;
        if (recipientId && recipientId !== user.id && !recipientId.startsWith('placeholder-user-')) {
          const senderName =
            (user.user_metadata?.full_name as string) ||
            (user.user_metadata?.user_name as string) ||
            'Someone';
          const previewSource = (message.content || '').trim();
          const preview = previewSource.length > 80 ? previewSource.slice(0, 80) + '...' : previewSource;

          await sendInstantReactionPush({
            sender_id: user.id,
            recipient_id: recipientId,
            message_id: message.id,
            emoji,
            sender_name: senderName,
            message_preview: preview,
          });
        }
      } catch (_) {
        // Best-effort only: reactions should still work even if notification fails
      }
    }
  }, [user?.id]);

  const handleRemoveReaction = useCallback(async (message: Message, emoji: string) => {
    if (!user?.id || message.id.startsWith('temp_')) return;
    setMessages(prev => prev.map(m => m.id !== message.id ? m : { ...m, reactions: (m.reactions ?? []).filter(r => !(r.user_id === user.id && r.emoji === emoji)) }));
    const ok = await removePrivateMessageReaction(message.id, user.id, emoji);
    if (!ok) setMessages(prev => prev.map(m => m.id !== message.id ? m : { ...m, reactions: [...(m.reactions ?? []), { id: `opt-${Date.now()}`, emoji, user_id: user.id, created_at: new Date().toISOString() }] }));

    // Broadcast removal for realtime UI on the other device (fallback if DB realtime isn't streaming reactions)
    try {
      conversationChannelRef.current?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: {
          op: 'DELETE',
          message_id: message.id,
          user_id: user.id,
          emoji,
        }
      }).then(() => {}).catch(() => {});
    } catch (_) {}
  }, [user?.id]);

  // Gifts removed post-pivot

  // Load initial data when component mounts OR when chat ID changes (not on every focus)
  // Use AsyncStorage to persist which chats have been loaded (survives remounts)
  const loadedChatIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const prevIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Only load if chat ID changed (not just a refocus)
    if (!id || !user?.id) return;
    
    // Check if chat ID actually changed
    const chatIdChanged = prevIdRef.current !== id;
    prevIdRef.current = id;
    
    // If chat ID changed, always load (new chat)
    if (chatIdChanged) {
      loadedChatIdRef.current = null; // Reset for new chat
      isLoadingRef.current = false;
    }
    
    // Skip if we've already loaded for this chat ID AND chat ID hasn't changed
    if (!chatIdChanged && loadedChatIdRef.current === id) {
      if (__DEV__) log('[Chat] ✅ Skipping reload - already loaded for chat:', id);
      return;
    }
    
    // Skip if already loading
    if (isLoadingRef.current) {
      if (__DEV__) log('[Chat] ⏳ Skipping reload - already loading');
      return;
    }
    
    loadedChatIdRef.current = id;
    isLoadingRef.current = true;
    
    if (__DEV__) {
      log('[Chat] 🚀 Loading initial data for chat:', id, chatIdChanged ? '(new chat)' : '(remount)');
    }
    
    let isMounted = true;
    
    // Enhanced fallback timeout to ensure loading screen doesn't stay forever
    const fallbackTimeout = setTimeout(() => {
      if (isMounted) {
        log('[Private Chat] Fallback timeout: Force hiding loading screen after 8 seconds');
        setIsInitialLoad(false);
        setLoadingProfile(false);
        setInitialDataLoaded(true);
        
        // Ensure typing indicator is enabled after fallback
        setDisableTypingIndicator(false);
        
        // Set minimal fallback data if still empty
        if (!otherUser) {
          setOtherUser({
            id: id,
            username: 'User',
            full_name: 'User',
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    }, 8000); // 8 second fallback (reduced from 10)
    
    const loadInitialData = async () => {
      try {
        if (!id || !user) {
          setError('Missing conversation ID or user not authenticated');
          clearTimeout(fallbackTimeout);
          setIsInitialLoad(false);
          isLoadingRef.current = false;
          return;
        }

        // Note: We don't check messages.length here because if component remounted,
        // messages would be empty. The ref check above handles preventing reloads.

        // 🚀 AGGRESSIVE CACHING: Load cached messages FIRST (before anything else)
        // Try optimized cache first (fastest), then fallback to regular cache
        let cachedMessages: Message[] | null = null;
        try {
          const { getCachedChatMessages } = await import('../../utils/chatCacheOptimizer');
          cachedMessages = await getCachedChatMessages(id as string);
        } catch (optimizerError) {
          // Fallback to regular cache
          cachedMessages = await getCachedMessages(id as string);
        }
        
        // If we have cached messages, use them and skip server fetch (real-time will update)
        if (cachedMessages && cachedMessages.length > 0 && isMounted) {
          log(`[Chat] 🚀 Loaded ${cachedMessages.length} cached messages INSTANTLY - skipping server fetch`);
          setMessages(cachedMessages);
          
          // Hide loading screen immediately with cached data
          clearTimeout(fallbackTimeout);
          setIsInitialLoad(false);
          isLoadingRef.current = false;
          log('[Private Chat] ⚡ Screen shown instantly with cached data - real-time will handle updates');
          
          // Still load profile in background
          const profileLoad = await Promise.allSettled([
            getUserProfile(id)
          ]);
          
          if (profileLoad[0].status === 'fulfilled' && profileLoad[0].value && isMounted) {
            setOtherUser(profileLoad[0].value);
            setLoadingProfile(false);
          }
          
          // Mark as read in background
          if (user?.id && id) {
            markMessagesAsRead(user.id, id).catch(() => {});
          }
          
          return; // Skip server fetch - cache + real-time is enough
        }

        // PARALLEL: Do all checks and loads in parallel (non-blocking)
        const [blockCheck, profileLoad] = await Promise.allSettled([
          // Check if users are blocked
          (async () => {
            try {
              const blockUserModule = await import('../../utils/blockUser');
              const blocked = await blockUserModule.isUserBlocked(user.id, id as string);
              if (blocked) {
                log(`[Chat] Users are blocked, redirecting away: ${user.id} <-> ${id}`);
                clearTimeout(fallbackTimeout);
                setIsInitialLoad(false);
                Alert.alert(
                  'Cannot View Conversation',
                  'This conversation is not available due to blocking restrictions.',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.back()
                    }
                  ]
                );
                return { blocked: true };
              }
              return { blocked: false };
            } catch (error) {
              error('[Chat] Error checking block status:', error);
              return { blocked: false };
            }
          })(),
          
          // Load user profile
          (async () => {
            try {
              const profile = await getUserProfile(id);
              return profile;
            } catch (error) {
              error('[Private Chat] Error loading profile:', error);
              return null;
            }
          })()
        ]);

        // Handle block check result
        if (blockCheck.status === 'fulfilled' && blockCheck.value?.blocked) {
          return; // Stop if blocked
        }

        // Handle profile result
        if (profileLoad.status === 'fulfilled' && profileLoad.value && isMounted) {
          log('[Private Chat] Profile loaded:', profileLoad.value.username || profileLoad.value.full_name);
          setOtherUser(profileLoad.value);
          setLoadingProfile(false);
        } else if (isMounted) {
          // Fallback profile
          setOtherUser({
            id: id,
            username: `user_${id.substring(0, 8)}`,
            full_name: `User ${id.substring(0, 8)}`,
            avatar_url: null
          } as any);
          setLoadingProfile(false);
        }
        
        // Check if conversation was deleted
        const isDeleted = isConversationDeleted(id);
        setWasConversationDeleted(isDeleted);
        
        // Mark as read in background (non-blocking)
        if (user?.id && id) {
          markMessagesAsRead(user.id, id).catch(error => {
            error('[Chat] Error marking messages as read:', error);
          });
        }
        
        // Step 2: Fetch fresh messages from server in background
        try {
          const fetchedMessages = await getMessages(user.id, id);
          
          if (isMounted) {
            log(`[Chat] 📡 Loaded ${fetchedMessages.length} messages from server`);
            
            // Optimized: Remove duplicates using Set for O(n) performance
            const messageIds = new Set();
            const uniqueMessages = fetchedMessages.filter(message => {
              if (messageIds.has(message.id)) {
                return false;
              }
              messageIds.add(message.id);
              return true;
            });
            
            if (uniqueMessages.length !== fetchedMessages.length) {
              log(`[Chat] Removed ${fetchedMessages.length - uniqueMessages.length} duplicate messages during initial load`);
            }
            
            // Update UI with fresh data (will be seamless if cache was good)
            setMessages(uniqueMessages);
            
            // Cache the fresh messages for next time
            await cacheMessages(id as string, uniqueMessages);
            log('[Chat] 💾 Messages cached for next load');
            
            // Mark loading as complete
            isLoadingRef.current = false;
            
            // Hide loading screen if not already hidden
            if (!cachedMessages || cachedMessages.length === 0) {
              clearTimeout(fallbackTimeout);
              setIsInitialLoad(false);
              log('[Private Chat] Loading screen hidden - fresh messages ready');
            }
          }
        } catch (error) {
          error('[Chat] Error fetching messages:', error);
          isLoadingRef.current = false;
          if (isMounted) {
            // If we have cached messages, we're good - just log the error
            if (cachedMessages && cachedMessages.length > 0) {
              log('[Chat] Using cached messages due to fetch error');
            } else {
              // No cache and error - hide loading after delay
              setTimeout(() => {
                clearTimeout(fallbackTimeout);
                setIsInitialLoad(false);
                log('[Private Chat] Loading screen hidden after error');
              }, 500);
            }
          }
        }
      } catch (error) {
        error('Error loading initial data:', error);
        isLoadingRef.current = false;
        if (isMounted) {
          clearTimeout(fallbackTimeout);
          setIsInitialLoad(false);
          setLoadingProfile(false);
        }
      }
    };
    
    loadInitialData();
    
    // Cleanup function
    return () => {
      isMounted = false;
      isLoadingRef.current = false;
      clearTimeout(fallbackTimeout);
      // DON'T reset loaded ref on cleanup - keep it so we don't reload on remount
      // Only reset when chat ID actually changes (handled by dependency array)
    };
  }, [id, user?.id]);

  // Handle initial message from query params (for icebreaker messages)
  useEffect(() => {
    if (initialMessage && typeof initialMessage === 'string') {
      const decodedMessage = decodeURIComponent(initialMessage);
      setInputMessage(decodedMessage);
      // Focus the input after a short delay to ensure it's rendered
      setTimeout(() => {
        // The input will be focused when the screen loads
      }, 300);
    }
  }, [initialMessage]);
  
  // Function to scroll to the bottom of the chat
  const scrollToBottom = () => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  };
  
  // Function to silently refresh messages without disrupting UI - no memoization
  const silentlyRefreshMessages = async () => {
      if (!id) return;
      
      // Skip if we already have messages (cache + real-time is enough)
      if (messages.length > 0) {
        if (__DEV__) log('[Private Chat] Skipping silent refresh - messages already exist:', messages.length);
        return;
      }
      
      // Only refresh if real-time subscription is not active (fallback)
      // Real-time should handle all updates, so this is just a safety net
      if (realtimeActiveRef.current) {
        if (__DEV__) log('[Private Chat] Skipping silent refresh - real-time is active');
        return;
      }
      
      log('[Private Chat] Silently refreshing messages for latest data (fallback only)');
      const freshMessages = await getMessages(user.id, id);
      
      // Filter out any messages that were recently deleted to prevent them from reappearing
      const timeSinceLastDeletion = Date.now() - lastDeletionTime.current;
      const filteredMessages = freshMessages.filter(msg => {
        const wasDeleted = deletedMessageIds.current.has(msg.id);
        if (wasDeleted && timeSinceLastDeletion < 30000) { // 30 seconds grace period
          log(`[Private Chat] Filtered out deleted message ${msg.id} from refresh`);
          return false;
        }
        // Clean up old deleted message IDs if enough time has passed
        if (wasDeleted && timeSinceLastDeletion > 60000) { // 1 minute
          deletedMessageIds.current.delete(msg.id);
          log(`[Private Chat] Cleaned up old deleted message ID ${msg.id}`);
        }
        return true;
      });
      
      // IMPROVED: Merge with current messages to preserve optimistic updates but add new messages
      setMessages(prevMessages => {
        // Get all temp messages (optimistic updates)
        const tempMessages = prevMessages.filter(msg => msg.id.startsWith('temp_'));
        
        // Find new messages that aren't in current messages (using filtered messages)
        const currentMessageIds = new Set(prevMessages.map(msg => msg.id));
        const newMessages = filteredMessages.filter(freshMsg => !currentMessageIds.has(freshMsg.id));
        
        if (newMessages.length > 0) {
          log(`[Private Chat] Found ${newMessages.length} new messages during refresh`);
        }
        
        // Update existing messages with fresh data (especially reactions)
        const updatedMessages = prevMessages.map(existingMsg => {
          if (existingMsg.id.startsWith('temp_')) {
            return existingMsg; // Keep temp messages unchanged
          }
          
          // Find corresponding fresh message (using filtered messages)
          const freshMsg = filteredMessages.find(f => f.id === existingMsg.id);
          if (freshMsg) {
            return {
              ...existingMsg,
              ...freshMsg,
              reactions: freshMsg.reactions ?? existingMsg.reactions,
              delivered: existingMsg.delivered || freshMsg.delivered,
              read: existingMsg.read || freshMsg.read
            };
          }
          return existingMsg;
        });
        
        // Combine temp messages, new messages, and updated existing messages
        const finalMessages = [...tempMessages, ...newMessages, ...updatedMessages.filter(msg => !msg.id.startsWith('temp_'))]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        // Remove duplicates by ID
        const uniqueMessages = finalMessages.filter((msg, index, self) => 
          index === self.findIndex(m => m.id === msg.id)
        );
        
        log(`[Private Chat] Silent refresh: Updated ${uniqueMessages.length} messages`);
        if (newMessages.length > 0) {
          log(`[Private Chat] Added ${newMessages.length} new messages to chat`);
        }
          
        // Store update removed for simplicity - using only local state
          
        return uniqueMessages;
      });
      
    // Removed try-catch to prevent swallowing real-time errors
  };
  
  // Initialize typing indicator state from storage
  useEffect(() => {
    const initializeTypingIndicator = async () => {
        // Reset typing indicator to always be enabled
        log('[Private Chat] Enabling typing indicators');
        setDisableTypingIndicator(false);
        await AsyncStorage.removeItem('disableTypingIndicator');
        await AsyncStorage.removeItem('chatMountCount');
    };
    
    initializeTypingIndicator();
  }, []);
  
  // Load initial data when component mounts
  useEffect(() => {
    if (id && user?.id && !initialDataLoaded) {
      log('[Chat] Component mounted, loading initial data for chat:', id);
      loadInitialData();
    }
  }, [id, user?.id, initialDataLoaded, loadInitialData]);
  
  // Debug: Monitor messages state changes
  useEffect(() => {
    if (!__DEV__) return;
    log('[Chat] Messages state changed:', {
      messagesLength: messages.length,
      isInitialLoad,
      initialDataLoaded,
      loadingProfile,
      chatId: id
    });

    if (messages.length > 0) {
      const first = messages[0];
      const last = messages[messages.length - 1];
      log('[Chat] First/Last message snapshot:', {
        firstId: first?.id,
        firstType: first?.message_type,
        firstReactions: first?.reactions?.length || 0,
        lastId: last?.id,
        lastType: last?.message_type,
        lastReactions: last?.reactions?.length || 0,
      });
    }
  }, [messages, isInitialLoad, initialDataLoaded, loadingProfile, id]);

  // Real-time subscription - simple and reliable for both iOS and Android
  useEffect(() => {
    if (__DEV__) log('[Chat] Real-time subscription setup:', !!id, !!user?.id);
    if (!id || !user?.id) return;
    const partnerId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
    if (!partnerId) return;

    let alive = true;
    const channelName = `private_messages:${user.id}:${partnerId}`;
    if (__DEV__) log('[Chat] Channel:', channelName);

    // Defensive cleanup: if a channel with the same topic exists from a prior mount,
    // remove it before creating a new one. Otherwise Supabase can return a joined
    // channel instance, and adding .on(...) handlers throws "after subscribe()".
    try {
      const existingChannels = (supabase as any).getChannels?.() || [];
      existingChannels
        .filter((ch: any) => ch?.topic === `realtime:${channelName}` || ch?.topic === channelName)
        .forEach((ch: any) => {
          supabase.removeChannel(ch).catch(() => {});
        });
    } catch (_) {}

    const channel = supabase.channel(channelName, {
      config: {
        // iOS-specific: Ensure WebSocket stays connected
        presence: { key: user.id },
        broadcast: { self: true },
      }
    });
    realtimeActiveRef.current = false;

    // Subscribe to INSERT events (new messages)
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          // Realtime filter syntax: `column=eq.value` (avoid OR filters; they're unreliable)
          // Conversation-scoped filter (fewer events; RLS still applies)
          filter: `sender_id=eq.${partnerId}`,
        },
        async (payload) => {
          try {
            const message = payload.new;
            if (!message || !message.id) return;

            if (__DEV__) {
              log('[Chat] Real-time INSERT (incoming filter):', {
                messageId: message.id,
                senderId: message.sender_id,
                recipientId: message.recipient_id,
                partnerId,
                userId: user.id,
                matches: message.sender_id === partnerId && message.recipient_id === user.id
              });
            }

            if (processedMessageIdsRef.current.has(message.id)) return;

            // Mark as processed
            processedMessageIdsRef.current.add(message.id);

            // Only process messages from the other user (not our own - those are handled optimistically)
            if (message.sender_id === partnerId && message.recipient_id === user.id) {
              // WhatsApp-style: if user isn't at bottom, show a "new messages" pill
              if (!isAtBottomRef.current) {
                setNewMessagesCount((c) => c + 1);
              }

              // INSTANT: Use already-loaded profile data (no API call delay!)
              const senderProfile = otherUser ? {
                id: otherUser.id,
                full_name: otherUser.full_name,
                username: otherUser.username,
                avatar_url: otherUser.avatar_url,
              } : undefined;

              const receiverProfile = user ? {
                id: user.id,
                full_name: user.full_name,
                username: user.username,
                avatar_url: user.avatar_url,
              } : undefined;

              const enrichedMessage: Message = {
                id: message.id,
                sender_id: message.sender_id,
                recipient_id: message.recipient_id,
                content: message.content,
                created_at: message.created_at,
                read: message.read || false,
                sender: senderProfile,
                receiver: receiverProfile,
                message_type: message.message_type || 'text',
                file_url: message.file_url,
                thumbnail_url: message.thumbnail_url,
                file_type: message.file_type,
                file_size: message.file_size,
                expiry_at: message.expiry_at,
                downloaded: message.downloaded || false,
                file_deleted: message.file_deleted || false,
                media_url: message.media_url,
                media_duration: message.media_duration,
                reply_to_id: message.reply_to_id ?? undefined,
              };

              // Add message to state IMMEDIATELY (no async delay!)
              setMessages(prevMessages => {
                const existingIds = new Set(prevMessages.map(m => m.id));
                if (existingIds.has(enrichedMessage.id)) {
                  return prevMessages;
                }

                let withReply = enrichedMessage;
                if (message.reply_to_id) {
                  const replied = prevMessages.find(m => m.id === message.reply_to_id);
                  if (replied) {
                    const profile = replied.sender_id === user?.id ? user : otherUser;
                    withReply = {
                      ...enrichedMessage,
                      reply_to_message: {
                        id: replied.id,
                        content: replied.content,
                        user_id: replied.sender_id,
                        username: profile?.username,
                      },
                    };
                  }
                }

                const updated = [{ ...withReply, delivered: true }, ...prevMessages];
                messagesRef.current = updated;

                // Update cache (non-blocking)
                addMessageToCache(id as string, { ...withReply, delivered: true });

                // Update store (non-blocking)
                const currentStoreMessages = useChatStore.getState().privateMessages[id as string] || [];
                useChatStore.getState().setPrivateMessages(id as string, [{ ...withReply, delivered: true }, ...currentStoreMessages]);

                // Scroll to top immediately
                requestAnimationFrame(() => {
                  flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                });

                return updated;
              });

              if (alive) {
                checkCanSendRef.current(partnerId).then((result) => {
                  if (!alive) return;
                  setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
                });
              }

              // Fetch fresh profiles in background (non-blocking, for future messages)
              supabase
                .from('profiles')
                .select('id, full_name, username, avatar_url')
                .in('id', [message.sender_id, message.recipient_id])
                .then(({ data: profiles }) => {
                  if (!alive || !profiles || profiles.length === 0) return;
                  const profileMap = new Map<string, Partial<Profile>>();
                  profiles.forEach(profile => {
                    profileMap.set(profile.id, profile);
                  });

                  // Update message with fresh profile data if different
                  setMessages(prevMessages => {
                    const messageIndex = prevMessages.findIndex(m => m.id === message.id);
                    if (messageIndex === -1) return prevMessages;

                    const currentMessage = prevMessages[messageIndex];
                    const freshSender = profileMap.get(message.sender_id);
                    const freshReceiver = profileMap.get(message.recipient_id);

                    // Only update if profile data changed
                    if (
                      (freshSender && (!currentMessage.sender || 
                        currentMessage.sender.avatar_url !== freshSender.avatar_url ||
                        currentMessage.sender.username !== freshSender.username)) ||
                      (freshReceiver && (!currentMessage.receiver ||
                        currentMessage.receiver.avatar_url !== freshReceiver.avatar_url ||
                        currentMessage.receiver.username !== freshReceiver.username))
                    ) {
                      const updated = [...prevMessages];
                      updated[messageIndex] = {
                        ...currentMessage,
                        sender: freshSender || currentMessage.sender,
                        receiver: freshReceiver || currentMessage.receiver,
                      };
                      messagesRef.current = updated;
                      return updated;
                    }

                    return prevMessages;
                  });
                })
                .catch(error => {
                  warn('[Chat] Background profile fetch failed (non-critical):', error);
                });

              // Mark as read (non-blocking)
              markMessagesAsRead(user.id, id).catch(() => {});
            }
            // Handle own messages (replace optimistic with real)
            else if (message.sender_id === user.id && message.recipient_id === partnerId) {
              setMessages(prevMessages => {
                // Check if real message already exists
                const realExists = prevMessages.some(msg => msg.id === message.id);
                if (realExists) {
                  return prevMessages.map(msg =>
                    msg.id === message.id ? { ...msg, ...message, delivered: true } : msg
                  );
                }

                // Replace temp message if exists
                const tempIndex = prevMessages.findIndex(msg =>
                  msg.id.startsWith('temp_') &&
                  msg.sender_id === user.id &&
                  msg.content === message.content
                );

                if (tempIndex !== -1) {
                  const updated = [...prevMessages];
                  const tempMsg = prevMessages[tempIndex];
                  const realMessage = {
                    ...message,
                    delivered: true,
                    reply_to_id: message.reply_to_id ?? tempMsg.reply_to_id,
                    reply_to_message: (message as Message).reply_to_message ?? tempMsg.reply_to_message,
                  };
                  updated[tempIndex] = realMessage;
                  addMessageToCache(id as string, realMessage);
                  return updated;
                }

                // Add real message (hydrate reply from state if needed)
                const replied = message.reply_to_id ? prevMessages.find(m => m.id === message.reply_to_id) : null;
                const realMessage = {
                  ...message,
                  delivered: true,
                  reply_to_id: message.reply_to_id ?? undefined,
                  reply_to_message: (message as Message).reply_to_message ?? (replied ? {
                    id: replied.id,
                    content: replied.content,
                    user_id: replied.sender_id,
                    username: replied.sender_id === user?.id ? user?.username : otherUser?.username,
                  } : undefined),
                };
                addMessageToCache(id as string, realMessage);
                return [realMessage, ...prevMessages];
              });
            }
          } catch (error) {
            error('[Chat] Error processing message:', error);
          }
        }
      )
      // Also listen for messages we SENT (separate filter; avoids unsupported OR filters)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `recipient_id=eq.${partnerId}`,
        },
        async (payload) => {
          try {
            const message = payload.new;
            if (!message || !message.id) return;

            if (__DEV__) {
              log('[Chat] Real-time INSERT (outgoing filter):', {
                messageId: message.id,
                senderId: message.sender_id,
                recipientId: message.recipient_id,
                partnerId,
                userId: user.id,
                matches: message.sender_id === user.id && message.recipient_id === partnerId
              });
            }

            if (processedMessageIdsRef.current.has(message.id)) return;
            processedMessageIdsRef.current.add(message.id);

            // The existing handler logic below already checks sender/recipient to match this chat.
            // Reuse the same logic by falling through to the same checks.
            if (message.sender_id === partnerId && message.recipient_id === user.id) {
              // Incoming (shouldn't happen for recipient_id filter, but safe)
              return;
            } else if (message.sender_id === user.id && message.recipient_id === partnerId) {
              setMessages(prevMessages => {
                // Check if real message already exists
                const realExists = prevMessages.some(msg => msg.id === message.id);
                if (realExists) {
                  return prevMessages.map(msg =>
                    msg.id === message.id ? { ...msg, ...message, delivered: true } : msg
                  );
                }

                // Replace temp message if exists
                const tempIndex = prevMessages.findIndex(msg =>
                  msg.id.startsWith('temp_') &&
                  msg.sender_id === user.id &&
                  msg.content === message.content
                );

                if (tempIndex !== -1) {
                  const updated = [...prevMessages];
                  const tempMsg = prevMessages[tempIndex];
                  const realMessage = {
                    ...message,
                    delivered: true,
                    reply_to_id: message.reply_to_id ?? tempMsg.reply_to_id,
                    reply_to_message: (message as Message).reply_to_message ?? tempMsg.reply_to_message,
                  };
                  updated[tempIndex] = realMessage;
                  addMessageToCache(id as string, realMessage);
                  return updated;
                }

                const replied = message.reply_to_id ? prevMessages.find(m => m.id === message.reply_to_id) : null;
                const realMessage = {
                  ...message,
                  delivered: true,
                  reply_to_id: message.reply_to_id ?? undefined,
                  reply_to_message: (message as Message).reply_to_message ?? (replied ? {
                    id: replied.id,
                    content: replied.content,
                    user_id: replied.sender_id,
                    username: replied.sender_id === user?.id ? user?.username : otherUser?.username,
                  } : undefined),
                };
                addMessageToCache(id as string, realMessage);
                return [realMessage, ...prevMessages];
              });
            }
          } catch (error) {
            error('[Chat] Error processing sent message:', error);
          }
        }
      )
      // Subscribe to UPDATE events (read status)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `sender_id=eq.${partnerId}`,
        },
        (payload) => {
          const message = payload.new;
          if (!message || !message.id) return;

          setMessages(prevMessages => {
            const exists = prevMessages.some(msg => msg.id === message.id);
            if (!exists) return prevMessages;

            return prevMessages.map(msg =>
              msg.id === message.id
                ? { ...msg, read: message.read ?? msg.read, delivered: message.delivered ?? msg.delivered ?? true }
                : msg
            );
          });
        }
      )
      // Also listen for UPDATE events for messages we SENT (delivered/read flags may change)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `recipient_id=eq.${partnerId}`,
        },
        (payload) => {
          const message = payload.new;
          if (!message || !message.id) return;

          setMessages(prevMessages => {
            const exists = prevMessages.some(msg => msg.id === message.id);
            if (!exists) return prevMessages;

            return prevMessages.map(msg =>
              msg.id === message.id
                ? { ...msg, read: message.read ?? msg.read, delivered: message.delivered ?? msg.delivered ?? true }
                : msg
            );
          });
        }
      )
      // Subscribe to DELETE events (messages deleted by the other user)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'private_messages',
          filter: `sender_id=eq.${partnerId}`,
        },
        (payload) => {
          const message = payload.old;
          if (!message || !message.id) return;

          if (__DEV__) {
            log('[Chat] Real-time DELETE (incoming):', {
              messageId: message.id,
              senderId: message.sender_id,
              recipientId: message.recipient_id,
              partnerId,
              userId: user.id
            });
          }

          setMessages(prevMessages => prevMessages.filter(msg => msg.id !== message.id));
          removeMessageFromCache(id as string, message.id);
        }
      )
      // Also listen for DELETE events for messages we SENT (deleted by us)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'private_messages',
          filter: `recipient_id=eq.${partnerId}`,
        },
        (payload) => {
          const message = payload.old;
          if (!message || !message.id) return;

          if (__DEV__) {
            log('[Chat] Real-time DELETE (outgoing):', {
              messageId: message.id,
              senderId: message.sender_id,
              recipientId: message.recipient_id,
              partnerId,
              userId: user.id
            });
          }

          setMessages(prevMessages => prevMessages.filter(msg => msg.id !== message.id));
          removeMessageFromCache(id as string, message.id);
        }
      )
      // Reactions: same channel as messages
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_message_reactions' }, (payload) => {
        const r = payload.new as { id: string; message_id: string; user_id: string; emoji: string; created_at: string };
        if (!r?.message_id || !r?.id) return;
        setMessages(prev => prev.map(m => {
          if (m.id !== r.message_id) return m;
          const list = m.reactions ?? [];
          const sameUserEmoji = (x: { user_id?: string; emoji?: string }) => x.user_id === r.user_id && x.emoji === r.emoji;
          const next = list.some(x => x.id === r.id) ? list : list.filter(x => !sameUserEmoji(x)).concat([{ id: r.id, emoji: r.emoji, user_id: r.user_id, created_at: r.created_at }]);
          return { ...m, reactions: next };
        }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'private_message_reactions' }, (payload) => {
        const r = payload.old as { id: string; user_id?: string; emoji?: string };
        if (!r?.id) return;
        setMessages(prev => prev.map(m => ({
          ...m,
          reactions: (m.reactions ?? []).filter(x => x.id !== r.id && !(r.user_id && r.emoji && x.user_id === r.user_id && x.emoji === r.emoji))
        })));
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          realtimeActiveRef.current = true;
          retryCountRef.current = 0;
          lastRetryTimeRef.current = 0;
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
          }
          if (__DEV__) {
            log('[Chat] Real-time ACTIVE', {
              channel: channelName,
              partnerId,
              userId: user.id,
              filters: {
                incoming: `sender_id=eq.${partnerId}`,
                outgoing: `recipient_id=eq.${partnerId}`
              }
            });
          }
        } else if (status === 'CHANNEL_ERROR') {
          realtimeActiveRef.current = false;
          if (__DEV__) error('[Chat] Real-time error:', err?.message);
          
          // FIX: Don't auto-retry on error - let user manually refresh or wait for next mount
          // Auto-retry was causing infinite loops
          warn('[Chat] ⚠️ Not auto-retrying on error to prevent infinite loops. Subscription will remain closed.');
        } else if (status === 'TIMED_OUT') {
          realtimeActiveRef.current = false;
          // Use console.warn instead of console.error - timeouts are common on mobile networks
          warn('[Chat] ⏱️ Real-time subscription timed out - using polling fallback');
          warn('[Chat] ℹ️ This is normal on slow/unstable networks. Messages will still sync.');
          
          // FIX: Don't auto-retry on timeout - let user manually refresh or wait for next mount
          // Auto-retry was causing infinite loops
        } else if (status === 'CLOSED') {
          realtimeActiveRef.current = false;
          warn('[Chat] ⚠️ Real-time subscription CLOSED');
          // IMPORTANT: Don't attempt to re-join the same channel instance.
          // Supabase realtime channels can only join once; retrying subscribe() on the same instance throws:
          // "tried to join multiple times. 'join' can only be called a single time per channel instance"
          // We'll rely on the next mount / app restart to create a fresh channel, and fallback refreshes keep UI usable.
          warn('[Chat] ℹ️ Skipping auto-resubscribe on CLOSED to avoid duplicate join errors. Messages will still sync via refresh/fallback.');
        } else {
          log('[Chat] Subscription status:', status);
        }
      });

    // Cleanup
    return () => {
      alive = false;
      log('[Chat] 🧹 Cleaning up real-time subscription');
      // Clear retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      // Reset retry counters
      retryCountRef.current = 0;
      lastRetryTimeRef.current = 0;
      supabase.removeChannel(channel).catch(() => {});
      processedMessageIdsRef.current.clear();
      realtimeActiveRef.current = false;
    };
  }, [id, user?.id]);

  // iOS-specific: Re-establish subscription when app becomes active
  // This handles cases where iOS closes WebSocket connections when app goes to background
  // FIX: Removed aggressive re-subscription to prevent infinite loops
  // The main subscription effect will handle reconnection with proper retry limits
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!id || !user?.id) return;

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        log('[Chat] 📱 iOS: App became active, checking real-time subscription status');
        // Check subscription status after a delay to allow main subscription to reconnect
        // Don't force re-subscription here - let the main effect handle it with retry limits
        setTimeout(() => {
          if (!realtimeActiveRef.current) {
            log('[Chat] ⚠️ iOS: Real-time subscription not active after app became active');
            log('[Chat] 📱 iOS: Main subscription effect will handle reconnection with retry limits');
            // Fallback: Refresh messages if subscription is not active (non-blocking)
            silentlyRefreshMessages();
          } else {
            log('[Chat] ✅ iOS: Real-time subscription is active after app became active');
          }
        }, 1000);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [id, user?.id]);
  
  // Handle screen focus to refresh status
  useFocusEffect(
    useCallback(() => {
      log('[Private Chat] Screen focused, refreshing online status');
      
      // Refresh the other user's last_seen when screen comes into focus
      if (id) {
        supabase
          .from('profiles')
          .select('last_seen')
          .eq('id', id)
          .single()
          .then(({ data }) => {
            if (data?.last_seen != null) {
              setIsOtherUserOnline(isUserOnline(data.last_seen));
              setLastSeen(data.last_seen);
            }
          })
          .catch((err) => error('[Private Chat] Error refreshing last_seen on focus:', err));
      }
    }, [id, user])
  );
  
  // Handle typing indicator state changes
  useEffect(() => {
    if (disableTypingIndicator && typingChannelRef.current) {
      log('[Private Chat] Typing indicators disabled, cleaning up typing channel');
      try {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      } catch (error) {
        error('[Private Chat] Error removing typing channel:', error);
      }
    }
  }, [disableTypingIndicator]);
  

  
  // Add periodic silent refresh for messages (fallback only if real-time is not active)
  useEffect(() => {
    if (!id || !user) return;
    
    // Only set up periodic refresh if real-time is not active (fallback mechanism)
    const refreshInterval = setInterval(() => {
      // Only refresh if real-time is not active (fallback)
      if (!realtimeActiveRef.current) {
        if (__DEV__) log('[Chat] Real-time not active, using periodic refresh fallback');
        silentlyRefreshMessages();
      } else {
        // Real-time is active, skip periodic refresh to avoid interference
        if (__DEV__) log('[Chat] Real-time active, skipping periodic refresh');
      }
    }, 120000); // 2 minutes - only used as fallback if real-time fails
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [id, user]);

  // Shared conversation broadcast channel (reactions fallback)
  useEffect(() => {
    if (!id || !currentUser) return;

    const sortedIds = [currentUser.id, id].sort();
    const channelName = `pm_${sortedIds[0]}_${sortedIds[1]}`;

    // Clean up existing channel
    if (conversationChannelRef.current) {
      try {
        supabase.removeChannel(conversationChannelRef.current);
      } catch (_) {}
      conversationChannelRef.current = null;
    }

    conversationChannelRef.current = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
        presence: { key: channelName },
      }
    });

    conversationChannelRef.current
      .on('broadcast', { event: 'reaction' }, (evt) => {
        const p = evt?.payload;
        if (!p?.message_id || !p?.emoji || !p?.user_id || !p?.op) return;

        setMessages(prev => prev.map((m) => {
          if (m.id !== p.message_id) return m;
          const list = m.reactions ?? [];

          if (p.op === 'INSERT') {
            const next = list
              .filter(r => !(r.user_id === p.user_id && r.emoji === p.emoji))
              .concat([{ id: p.id || `bcast-${Date.now()}`, emoji: p.emoji, user_id: p.user_id, created_at: p.created_at }]);
            return { ...m, reactions: next };
          }

          if (p.op === 'DELETE') {
            const next = list.filter(r => !(r.user_id === p.user_id && r.emoji === p.emoji) && (p.id ? r.id !== p.id : true));
            return { ...m, reactions: next };
          }

          return m;
        }));
      })
      // Fallback: broadcast messages too (in case Postgres realtime fails for one side)
      .on('broadcast', { event: 'message' }, (evt) => {
        const p = evt?.payload;
        if (!p?.id || !p?.sender_id || !p?.recipient_id || !p?.content) return;
        // Only process if it's for this conversation
        const partnerId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
        if (!partnerId) return;
        const isForThisChat = (p.sender_id === partnerId && p.recipient_id === user?.id) || (p.sender_id === user?.id && p.recipient_id === partnerId);
        if (!isForThisChat) return;

        if (processedMessageIdsRef.current.has(p.id)) return;
        processedMessageIdsRef.current.add(p.id);

        const isIncoming = p.sender_id === partnerId && p.recipient_id === user?.id;
        if (isIncoming) {
          // WhatsApp-style: if user isn't at bottom, show a "new messages" pill
          if (!isAtBottomRef.current) {
            setNewMessagesCount((c) => c + 1);
          }

          const enrichedMessage: Message = {
            id: p.id,
            sender_id: p.sender_id,
            recipient_id: p.recipient_id,
            content: p.content,
            created_at: p.created_at || new Date().toISOString(),
            read: false,
            sender: otherUser ? { id: otherUser.id, full_name: otherUser.full_name, username: otherUser.username, avatar_url: otherUser.avatar_url } : undefined,
            receiver: user ? { id: user.id, full_name: user.full_name, username: user.username, avatar_url: user.avatar_url } : undefined,
            message_type: p.message_type || 'text',
            file_url: p.file_url,
            thumbnail_url: p.thumbnail_url,
            reactions: p.reactions || [],
            reply_to_id: p.reply_to_id ?? undefined,
            reply_to_message: p.reply_to_message,
          };

          setMessages(prevMessages => {
            const exists = prevMessages.some(msg => msg.id === p.id);
            if (exists) return prevMessages;
            const withReply = p.reply_to_id && !enrichedMessage.reply_to_message
              ? {
                  ...enrichedMessage,
                  reply_to_message: (() => {
                    const replied = prevMessages.find(m => m.id === p.reply_to_id);
                    if (!replied) return undefined;
                    const profile = replied.sender_id === user?.id ? user : otherUser;
                    return {
                      id: replied.id,
                      content: replied.content,
                      user_id: replied.sender_id,
                      username: profile?.username,
                    };
                  })(),
                }
              : enrichedMessage;
            addMessageToCache(partnerId, { ...withReply, delivered: true });
            return [{ ...withReply, delivered: true }, ...prevMessages];
          });

          markMessagesAsRead(user.id, partnerId).catch(() => {});
        }
      })
      // Fallback: broadcast message deletions too (in case Postgres realtime fails)
      .on('broadcast', { event: 'message_delete' }, (evt) => {
        const p = evt?.payload;
        if (!p?.message_id) return;
        // Only process if it's for this conversation
        const partnerId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
        if (!partnerId) return;

        if (__DEV__) {
          log('[Chat] Broadcast DELETE received:', {
            messageId: p.message_id,
            partnerId,
            userId: user?.id
          });
        }

        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== p.message_id));
        removeMessageFromCache(partnerId, p.message_id);
      })
      .subscribe((status: string) => {
        if (__DEV__) log('[Private Chat] Conversation channel status:', channelName, status);
      });

    return () => {
      if (conversationChannelRef.current) {
        try {
          supabase.removeChannel(conversationChannelRef.current);
        } catch (_) {}
        conversationChannelRef.current = null;
      }
    };
  }, [id, currentUser?.id, user?.id, otherUser]);
  
  // Set up typing indicator channel
  useEffect(() => {
    log('[Private Chat] Typing channel effect running - id:', id, 'currentUser:', !!currentUser, 'disableTypingIndicator:', disableTypingIndicator);
    
    if (!id || !currentUser || disableTypingIndicator) {
      log('[Private Chat] Skipping typing channel setup due to missing requirements');
      return;
    }

    log('[Private Chat] Setting up typing indicator channel');
    
    // Create consistent channel name for both users in this conversation
    // Sort the IDs to ensure both users connect to the same channel
    const sortedIds = [currentUser.id, id].sort();
    const channelName = `typing_${sortedIds[0]}_${sortedIds[1]}`;
    
    log('[Private Chat] Creating typing channel:', channelName);
    
    // Clean up existing typing channel first
    if (typingChannelRef.current) {
      log('[Private Chat] Cleaning up existing typing channel');
      try {
        supabase.removeChannel(typingChannelRef.current);
      } catch (error) {
        error('[Chat] Error cleaning up typing channel:', error);
      }
      typingChannelRef.current = null;
    }
    
    // Create the typing channel
    typingChannelRef.current = supabase.channel(channelName, {
      config: {
        broadcast: { self: true }, // Allow receiving our own typing events for debugging
        presence: { key: channelName },
      }
    });
    
    // Listen for typing events
    typingChannelRef.current
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (!payload.payload) {
          if (__DEV__) error('[Private Chat] No payload.payload in typing event');
          return;
        }
        const { user_id, typing } = payload.payload;
        if (__DEV__) {
          log('[Private Chat] Typing event:', user_id === id ? (typing ? 'other typing' : 'other stopped') : 'ignored');
        }
        // Handle typing events
        if (user_id === id) {
          // This is the other user typing
          const now = Date.now();
          const timeSinceLastUpdate = now - lastTypingStateUpdateRef.current;
          const THROTTLE_MS = 300; // Only update state at most once every 300ms
          
          // Clear any existing auto-hide timeout
          if (otherUserTypingTimeoutRef.current) {
            clearTimeout(otherUserTypingTimeoutRef.current);
            otherUserTypingTimeoutRef.current = null;
          }
          
          // Throttle state updates to prevent flicker from rapid events
          if (typing) {
            if (timeSinceLastUpdate >= THROTTLE_MS || !otherUserTyping) {
              setOtherUserTyping(true);
              lastTypingStateUpdateRef.current = now;
              setIsOtherUserOnline(true);
              setLastSeen(null);
            }
            otherUserTypingTimeoutRef.current = setTimeout(() => {
              setOtherUserTyping(false);
              lastTypingStateUpdateRef.current = Date.now();
              silentlyRefreshMessages().catch(() => {});
            }, 4000);
          } else {
            setOtherUserTyping(false);
            lastTypingStateUpdateRef.current = now;
            silentlyRefreshMessages().catch(() => {});
          }
        } else if (__DEV__ && user_id === currentUser?.id) {
          log('[Private Chat] Own typing event:', typing);
        }
      })
      .subscribe((status) => {
        if (__DEV__) {
          if (status === 'SUBSCRIBED') log('[Private Chat] Typing channel subscribed');
          else if (status === 'CHANNEL_ERROR') error('[Private Chat] Typing channel error:', channelName);
        }
      });

    return () => {
      // Cleanup typing timeouts
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (stopTypingTimeoutRef.current) {
        clearTimeout(stopTypingTimeoutRef.current);
        stopTypingTimeoutRef.current = null;
      }
      if (otherUserTypingTimeoutRef.current) {
        clearTimeout(otherUserTypingTimeoutRef.current);
        otherUserTypingTimeoutRef.current = null;
      }
      
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
    };
  }, [id, currentUser?.id, disableTypingIndicator]);

  
  // Other user presence: derive from profiles.last_seen (90s threshold), subscribe to updates
  useEffect(() => {
    if (!id || !otherUser) return;

    const partnerId = id as string;

    // Initial from loaded profile (getUserProfile uses select('*'), so last_seen is included)
    const initialLastSeen = otherUser.last_seen ?? null;
    setIsOtherUserOnline(isUserOnline(initialLastSeen));
    setLastSeen(initialLastSeen);

    // Defensive cleanup so we never attach callbacks on an already-subscribed channel.
    if (presenceChannelRef.current) {
      supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }

    const channel = supabase
      .channel(`presence_profile_${partnerId}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${partnerId}` },
        (payload: { new: { last_seen?: string | null } }) => {
          const lastSeenVal = payload.new?.last_seen ?? null;
          setIsOtherUserOnline(isUserOnline(lastSeenVal));
          setLastSeen(lastSeenVal);
        }
      )
      .subscribe();

    presenceChannelRef.current = channel;

    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      } else {
        supabase.removeChannel(channel);
      }
    };
  }, [id, otherUser?.id, otherUser?.last_seen]);
  
  // Periodic refresh of message status (use messagesRef so interval is stable; deps omit messages)
  useEffect(() => {
    if (!id || !user) return;
    const statusRefreshInterval = setInterval(() => {
      const currentMessages = messagesRef.current;
      const messageIds = currentMessages.map(msg => msg.id).filter(Boolean);
      if (messageIds.length === 0) return;
      refreshMessageStatus(messageIds).then((statusMap) => {
        setMessages(prev => prev.map(msg => ({ ...msg, read: statusMap.get(msg.id) ?? msg.read })));
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(statusRefreshInterval);
  }, [id, user?.id]);

  // Refresh message status when screen comes into focus
  useEffect(() => {
    if (!id || !user) return;

    const handleFocus = () => {
      if (__DEV__) log('[Private Chat] Screen focused, refreshing message status');
      const messageIds = messages.map(msg => msg.id).filter(Boolean);
      if (messageIds.length === 0) return;
      
      refreshMessageStatus(messageIds).then((statusMap) => {
        // Update messages with refreshed read status
        setMessages(prevMessages => 
          prevMessages.map(msg => ({
            ...msg,
            read: statusMap.get(msg.id) ?? msg.read
          }))
        );
      }).catch(error => {
        error('[Private Chat] Error refreshing status on focus:', error);
      });
    };

    // Refresh immediately when component mounts/updates
    handleFocus();

    // Set up focus listener for when user returns to the app
    const focusListener = () => handleFocus();
    
    // Note: In a real React Native app, you'd use AppState.addEventListener
    // For now, we'll just do the initial refresh
    
    return () => {
      // Cleanup would go here
    };
  }, [id, user]); // Removed messages.length to prevent infinite loop

  const fetchMoreMessages = async (beforeTimestamp?: string) => {
    if (!id || isLoadingMore) return;
    
    try {
      setIsLoadingMore(true);
      
      // Use the oldest message timestamp as the beforeTimestamp if not provided
      const oldestMessage = messages[messages.length - 1];
      const timestamp = beforeTimestamp || (oldestMessage?.created_at || undefined);
      
      log(`[Private Chat] Fetching more messages before: ${timestamp}`);
      
      const olderMessages = await getMessages(user.id, id);
      
      if (olderMessages.length > 0) {
        log(`[Private Chat] Fetched ${olderMessages.length} older messages`);
        
        // Merge with existing messages, avoiding duplicates
        setMessages(prevMessages => {
          // Create a map of existing message IDs for quick lookup
          const existingMessageIds = new Set(prevMessages.map(msg => msg.id));
          
          // Filter out messages that already exist
          const newMessages = olderMessages.filter(msg => !existingMessageIds.has(msg.id));
          
          if (newMessages.length === 0) {
            // No new messages, return the current state
            return prevMessages;
          }
          
          // Append older messages to the end (they're older)
          const allMessages = [...prevMessages, ...newMessages].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          
          log(`[Private Chat] Added ${newMessages.length} older messages`);
          
          // Store update removed for simplicity
          
          return allMessages;
        });
        
        setHasMoreMessages(olderMessages.length === 50); // If we got a full page, there might be more
      } else {
        log('[Private Chat] No more messages to fetch');
        setHasMoreMessages(false);
      }
    } catch (error) {
      error('[Private Chat] Error fetching more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };
  
  // Non-dating messaging rule:
  // - Non-mutual users can send one first message
  // - Further outbound messages require recipient reciprocity
  // - Mutual followers can chat freely
  // - Recipient can still disable DMs via privacy setting
  const checkCanSendToRecipient = useCallback(async (recipientId: string): Promise<{ allowed: boolean; reason: 'not_mutual_follow' | 'missing_context' | 'awaiting_reciprocity' | 'dms_disabled' | null }> => {
    if (!user?.id) return { allowed: false, reason: 'dms_disabled' };
    const canBypass = user.id === OFFICIAL_ACCOUNT_ID;
    if (canBypass) return { allowed: true, reason: null };

    // Everyone can message the official/support handle (no context needed)
    if (recipientId === OFFICIAL_ACCOUNT_ID) return { allowed: true, reason: null };

    const gate = await evaluateDmGateWithLocalPersistence(user.id, recipientId);
    if (!gate.allowed) return { allowed: false, reason: gate.reason ?? 'awaiting_reciprocity' };

    const allowDms = await getUserDmPreference(recipientId);
    if (!allowDms) return { allowed: false, reason: 'dms_disabled' };

    return { allowed: true, reason: null };
  }, [user?.id]);

  checkCanSendRef.current = checkCanSendToRecipient;

  // Keep sendBlockedByRecipient in sync so input is disabled when user can't send
  useEffect(() => {
    if (!id || !user?.id || id.startsWith('placeholder-user-')) {
      setSendBlockedByRecipient(null);
      return;
    }
    let cancelled = false;
    checkCanSendToRecipient(id as string).then((result) => {
      if (cancelled) return;
      setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
    });
    return () => { cancelled = true; };
  }, [id, user?.id, checkCanSendToRecipient]);

  // Handle send message - Optimized for instant delivery like WhatsApp
  const handleSend = async () => {
    // If there's pending media, send all media messages
    if (pendingMedia && pendingMedia.length > 0) {
      await handleSendMediaBatch(pendingMedia);
      return;
    }
    
    if (!inputMessage.trim() || !user) return;
    
    // Check if users are blocked (bidirectional blocking)
    try {
      const blockUserModule = await import('../../utils/blockUser');
      const blocked = await blockUserModule.isUserBlocked(user.id, id as string);
      if (blocked) {
        Alert.alert(
          'Cannot Send Message',
          'You cannot send messages to this user due to blocking restrictions.',
          [{ text: 'OK' }]
        );
        return;
      }
    } catch (error) {
      error('[ChatScreen] Error checking block status:', error);
      // Continue if check fails (fail open)
    }

    // Enforce non-dating DM guardrails
    const sendCheck = await checkCanSendToRecipient(id as string);
    if (!sendCheck.allowed) {
      if (sendCheck.reason === 'not_mutual_follow') {
        Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
      } else if (sendCheck.reason === 'awaiting_reciprocity') {
        Alert.alert(
          'Waiting for a reply',
          'You already sent the first message. They need to reply before you can send more — or follow each other to chat freely.',
        );
      } else if (sendCheck.reason === 'missing_context') {
        Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
      } else {
        Alert.alert('Direct Messages Disabled', 'This user has disabled direct messages.');
      }
      return;
    }
    
    // Content moderation check (quick local check only)
    if (isModerationEnabled) {
      const moderationResult = checkPrivateMessageContent(inputMessage);
      if (moderationResult.isInappropriate) {
        logModerationAction({
          type: 'message_blocked',
          userId: user.id,
          roomId: id,
          messageContent: inputMessage,
          moderationResult,
          timestamp: new Date().toISOString()
        });
        
        showToast(moderationResult.reason || 'Your message contains inappropriate content.');
        return;
      }
    }

    const willNeedReciprocityWait = await shouldAwaitReciprocityAfterOutbound(id as string);
    
    const tempId = generateTempId();
    const messageToSend = inputMessage.trim();
    const currentReplyToMessage = replyToMessage;
    
    // Clear input INSTANTLY for better UX
    log('[HandleSend] Clearing input immediately');
    setInputMessage('');
    setReplyToMessage(null);
    if (activeMessageMenuId) {
      setActiveMessageMenuId(null);
    }
    stopTyping();
    
    // Create optimistic message with instant delivery status
    const optimisticMessage: Message = {
      id: tempId,
      sender_id: user.id,
      recipient_id: id as string,
      content: messageToSend,
      read: false,
      created_at: new Date().toISOString(),
      delivered: true // Show as delivered immediately like WhatsApp
    };
    
    // Add reply information if replying to a message
    if (currentReplyToMessage) {
      optimisticMessage.reply_to_id = currentReplyToMessage.id;
      optimisticMessage.reply_to_message = {
        id: currentReplyToMessage.id,
        content: currentReplyToMessage.content,
        user_id: currentReplyToMessage.sender_id,
        username: otherUser?.username || otherUser?.full_name?.split(' ')[0] || 'User'
      };
    }
    
    log(`[Chat] Sending message: ${tempId}`);
    
    // Add optimistic message to UI INSTANTLY
    setMessages(prevMessages => {
      const currentMessages = Array.isArray(prevMessages) ? prevMessages : [];
      return [optimisticMessage, ...currentMessages];
    });

    if (willNeedReciprocityWait) {
      setSendBlockedByRecipient({ reason: 'awaiting_reciprocity' });
      void setDmAwaitingReciprocity(user.id, id as string);
    }
    
    // Auto-scroll immediately for instant feedback
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 25); // Reduced delay for instant feel
    
    // Send to server in background (non-blocking)
    sendMessageToServerAsync(tempId, messageToSend, currentReplyToMessage?.id);
  };
  
  // Handle sending multiple media messages in batch
  const handleSendMediaBatch = async (mediaItems: Array<{
    fileUrl: string;
    thumbnailUrl: string | null;
    fileType: string;
    fileSize?: number;
    expiryAt: string;
  }>) => {
    if (!user || !mediaItems.length || !id) return;

    const sendCheck = await checkCanSendToRecipient(id as string);
    if (!sendCheck.allowed) {
      if (sendCheck.reason === 'not_mutual_follow') {
        Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
      } else if (sendCheck.reason === 'awaiting_reciprocity') {
        Alert.alert(
          'Waiting for a reply',
          'You already sent the first message. They need to reply before you can send more — or follow each other to chat freely.',
        );
      } else if (sendCheck.reason === 'missing_context') {
        Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
      } else {
        Alert.alert('Direct Messages Disabled', 'This user has disabled direct messages.');
      }
      return;
    }

    const willNeedReciprocityWaitMedia = await shouldAwaitReciprocityAfterOutbound(id as string);
    
    // Show first-time info about auto-deletion (only once per session)
    const hasSeenMediaInfo = await AsyncStorage.getItem('hasSeenMediaInfo');
    if (!hasSeenMediaInfo) {
      Alert.alert(
        '📸 About Media Messages',
        'Photos and videos auto-delete after 24 hours for privacy. Tap the download button to manually save important media to your device — we don\'t auto-save for your privacy!',
        [
          { 
            text: 'Got it!', 
            onPress: () => AsyncStorage.setItem('hasSeenMediaInfo', 'true')
          }
        ]
      );
    }
    
    const caption = inputMessage.trim() || '';
    
    // Calculate expiry_at (24 hours from NOW - when message is sent, not when upload URL was requested)
    const expiryAt = new Date();
    expiryAt.setHours(expiryAt.getHours() + 24);
    const expiryAtISO = expiryAt.toISOString();
    
    // Create optimistic messages for all media
    const tempMessages: Message[] = mediaItems.map((mediaData) => {
      const tempId = generateTempId();
      return {
        id: tempId,
        sender_id: user.id,
        recipient_id: id as string,
        content: caption,
        read: false,
        created_at: new Date().toISOString(),
        message_type: 'media',
        file_url: mediaData.fileUrl,
        thumbnail_url: mediaData.thumbnailUrl,
        file_type: mediaData.fileType,
        file_size: mediaData.fileSize,
        expiry_at: expiryAtISO, // Use calculated expiry from send time, not upload time
        delivered: true,
      };
    });
    
    // Add all optimistic messages to UI immediately
    setMessages(prev => [...tempMessages, ...prev]);
    setInputMessage('');
    setPendingMedia([]);

    if (willNeedReciprocityWaitMedia) {
      setSendBlockedByRecipient({ reason: 'awaiting_reciprocity' });
      void setDmAwaitingReciprocity(user.id, id as string);
    }
    
    // Auto-scroll to newest
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 25);
    
    // Send each media message to server
    await Promise.all(
      tempMessages.map(async (tempMsg, index) => {
        const mediaData = mediaItems[index];
        try {
          // Override expiryAt to use the calculated one from send time
          const sentMessage = await sendMessage(
            user.id,
            id as string,
            caption,
            {
              ...mediaData,
              expiryAt: expiryAtISO // Use calculated expiry from send time
            }
          );
          
          if (sentMessage) {
            setMessages(prev =>
              prev.map(msg => msg.id === tempMsg.id ? sentMessage : msg)
            );
          } else {
            setMessages(prev => prev.filter(msg => msg.id !== tempMsg.id));
            showToast('Failed to send some media');
          }
        } catch (error) {
          error('[Private Chat] Error sending media message:', error);
          setMessages(prev => prev.filter(msg => msg.id !== tempMsg.id));
        }
      })
    );

    if (user?.id && id) {
      checkCanSendRef.current(id as string).then((result) => {
        setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
      });
    }
  };
  
  // Send message to server asynchronously (non-blocking for instant UX)
  const sendMessageToServerAsync = async (tempId: string, messageToSend: string, replyToId?: string) => {
    try {
      // Safety check: ensure user and id are valid UUIDs
      if (!user?.id || !id) {
        error('[Private Chat] Cannot send message - missing user.id or chat id');
        throw new Error('Missing user ID or chat ID');
      }
      
      // Validate that messageToSend is actually a string (not a UUID)
      if (typeof messageToSend !== 'string' || !messageToSend.trim()) {
        error('[Private Chat] Cannot send message - invalid message content');
        throw new Error('Invalid message content');
      }
      
      log(`[Private Chat] 📤 Sending message to server in background...`);
      const sentMessage = await sendMessage(
        user.id,
        id as string,
        messageToSend,
        undefined,
        replyToId
      );
      
      if (!sentMessage) {
        error('[Private Chat] sendMessage returned null/undefined');
        throw new Error('Message sending failed - no response from server');
      }
      
      log(`[Private Chat] ✅ Message confirmed by server: ${sentMessage.id}`);
      
      // Broadcast message for realtime UI on the other device (fallback if Postgres realtime fails)
      try {
        conversationChannelRef.current?.send({
          type: 'broadcast',
          event: 'message',
          payload: {
            id: sentMessage.id,
            sender_id: sentMessage.sender_id,
            recipient_id: sentMessage.recipient_id,
            content: sentMessage.content,
            created_at: sentMessage.created_at,
            message_type: sentMessage.message_type,
            file_url: sentMessage.file_url,
            thumbnail_url: sentMessage.thumbnail_url,
            reactions: sentMessage.reactions || [],
            reply_to_id: sentMessage.reply_to_id ?? undefined,
          }
        }).then(() => {
          if (__DEV__) log('[Chat] ✅ Broadcasted message for realtime fallback');
        }).catch(() => {});
      } catch (_) {}
      
      // Replace optimistic message with real message (preserve reply quote from optimistic)
      setMessages(prevMessages => {
        const optimistic = prevMessages.find(m => m.id === tempId);
        return prevMessages.map(msg => {
          if (msg.id === tempId) {
            const realMessage = {
              ...sentMessage,
              reply_to_id: sentMessage.reply_to_id ?? optimistic?.reply_to_id,
              reply_to_message: sentMessage.reply_to_message ?? optimistic?.reply_to_message,
              delivered: true,
              delivered_at: sentMessage.delivered_at || new Date().toISOString(),
            };
            log(`[Chat] Replaced optimistic message ${tempId} with real message:`, {
              tempId,
              realId: realMessage.id,
              delivered: realMessage.delivered,
              delivered_at: realMessage.delivered_at
            });
            return realMessage;
          }
          return msg;
        });
      });
      
      // Mark messages as read asynchronously
      if (user?.id && id) {
        markMessagesAsRead(user.id, id).catch(error => {
          warn('[Private Chat] Error marking messages as read:', error);
        });
      }

      if (user?.id && id) {
        checkCanSendRef.current(id as string).then((result) => {
          setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
        });
      }
    } catch (error: any) {
      error('[Private Chat] ❌ Error sending message to server:', error);
      
      // Check if this is a privacy error (user has DMs disabled)
      if (error?.name === 'PrivacyError' || error?.message?.includes('disabled direct messages')) {
        // Remove the failed message from the UI
        setMessages(prevMessages => {
          return prevMessages.filter(msg => msg.id !== tempId);
        });
        
        // Show alert instead of retrying
        Alert.alert(
          'Direct Messages Disabled',
          'This user has disabled direct messages. You cannot send messages to them.',
          [{ text: 'OK' }]
        );
        if (user?.id && id) {
          checkCanSendRef.current(id as string).then((result) => {
            setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
          });
        }
        return;
      }
      
      // For other errors, mark as failed and retry
      setMessages(prevMessages => {
        return prevMessages.map(msg => 
          msg.id === tempId 
            ? { ...msg, delivered: false, failed: true }
            : msg
        );
      });

      if (user?.id && id) {
        checkCanSendRef.current(id as string).then((result) => {
          setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
        });
      }
      
      showToast('Message failed to send. Retrying...');
      
      // Auto-retry after 2 seconds
      setTimeout(() => {
        log('[Private Chat] 🔄 Auto-retrying failed message...');
        retryFailedMessage(tempId, messageToSend, replyToId);
      }, 2000);
    }
  };
  
  // Retry failed message
  const retryFailedMessage = async (tempId: string, messageToSend: string, replyToId?: string) => {
    log('[Private Chat] 🔄 Retrying failed message:', tempId);
    
    // Reset message status for retry
    setMessages(prevMessages => {
      return prevMessages.map(msg => 
        msg.id === tempId 
          ? { ...msg, failed: false, delivered: false }
          : msg
      );
    });
    
    // Retry sending
    await sendMessageToServerAsync(tempId, messageToSend, replyToId);
  };
  
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) {
      return;
    }
    
    // handleSend already has proper error handling, no need to catch here
    await handleSend();
  };
  
  // Handle voice note button press
  const handleVoiceNotePress = async () => {
    // Enforce DM / Require gift to message before opening the recorder
    try {
      const sendCheck = await checkCanSendToRecipient(id as string);
      if (!sendCheck.allowed) {
        if (sendCheck.reason === 'not_mutual_follow') {
          Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
        } else if (sendCheck.reason === 'awaiting_reciprocity') {
          Alert.alert('Waiting for a reply', 'You already sent the first message. They need to reply before you can send more — or follow each other to chat freely.');
        } else if (sendCheck.reason === 'missing_context') {
          Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
        } else {
          Alert.alert('Direct Messages Disabled', 'This user has disabled direct messages.');
        }
        return;
      }
    } catch (privacyError) {
      warn('[Voice Note] Error checking send permission:', privacyError);
    }
    
    // Close any active message menu
    if (activeMessageMenuId) {
      setActiveMessageMenuId(null);
    }
    
    // Show voice recorder modal
    setShowVoiceRecorder(true);
  };
  
  // Handle voice note send
  const handleVoiceNoteSend = async (audioUri: string, isCloudUrl: boolean = false, actualDuration?: number) => {
    if (!user || !id) return;
    
    // Enforce DM / Require gift to message before sending
    try {
      const sendCheck = await checkCanSendToRecipient(id as string);
      if (!sendCheck.allowed) {
        if (sendCheck.reason === 'not_mutual_follow') {
          Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
        } else if (sendCheck.reason === 'awaiting_reciprocity') {
          Alert.alert(
            'Waiting for a reply',
            'You already sent the first message. They need to reply before you can send more — or follow each other to chat freely.',
          );
        } else if (sendCheck.reason === 'missing_context') {
          Alert.alert('Waiting for a reply', 'You can send one message first. Send another after they reply, or follow each other to chat freely.');
        } else {
          Alert.alert('Direct Messages Disabled', 'This user has disabled direct messages.');
        }
        setShowVoiceRecorder(false);
        return;
      }
    } catch (privacyError) {
      warn('[Voice Note] Error checking DM preferences:', privacyError);
      // Continue anyway if privacy check fails
    }

    const willNeedVoice = await shouldAwaitReciprocityAfterOutbound(id as string);
      
    // Generate a temporary ID for optimistic update - moved outside try block so it's accessible in catch
      const tempId = generateTempId();
    
    try {
      // Removed setSending for instant messaging
      
      // Get audio file information to extract duration for optimistic update
      let initialDuration = actualDuration || null; // Use actual duration from recorder if available
      
      if (!initialDuration) {
        try {
          // If it's a cloud URL, we might not be able to get the duration immediately
          if (!isCloudUrl) {
            const soundObject = new Audio.Sound();
            await soundObject.loadAsync({ uri: audioUri });
            const status = await soundObject.getStatusAsync();
            if (status.isLoaded && status.durationMillis) {
              initialDuration = status.durationMillis / 1000; // Convert to seconds
            }
            await soundObject.unloadAsync();
          } else {
            // For cloud URLs, use the actual duration if we have it
            initialDuration = actualDuration || 10; // Fallback to 10 seconds if no duration
          }
        } catch (err) {
          log('[Voice Note] Error getting initial duration:', err);
          initialDuration = actualDuration || 10; // Use actual duration or fallback
        }
      }
      
      log('[Voice Note] Using initial duration:', initialDuration, 'seconds');
      
      // For cloud URLs, we don't need to extract the filename
      // For local files, extract just the filename if it's a full path
      let mediaUrl = audioUri;
      
      log('[Voice Note] Using URL for message:', mediaUrl);
      
      // Calculate expiry_at (24 hours from now) for optimistic message
      const expiryAt = new Date();
      expiryAt.setHours(expiryAt.getHours() + 24);
      
      // Create an optimistic message
      const optimisticMessage: Message = {
        id: tempId,
        sender_id: user.id,
        recipient_id: id,
        content: '🎤 Voice Message', // Fallback text content
        read: false,
        created_at: new Date().toISOString(),
        delivered: false,
        message_type: 'voice_note',
        media_url: mediaUrl,
        media_duration: initialDuration,
        expiry_at: expiryAt.toISOString(), // Include expiry for timer ring
        // Remove conversation_id since it's generated on the server
      };
      
      // Add reply information if replying to a message
      if (replyToMessage) {
        optimisticMessage.reply_to_id = replyToMessage.id;
        optimisticMessage.reply_to_message = {
          id: replyToMessage.id,
          content: replyToMessage.content,
          user_id: replyToMessage.sender_id,
          username: otherUser?.username || otherUser?.full_name?.split(' ')[0] || 'User'
        };
      }
      
      // Update local state
      setMessages(prevMessages => [optimisticMessage, ...prevMessages]);
      if (willNeedVoice) {
        setSendBlockedByRecipient({ reason: 'awaiting_reciprocity' });
        void setDmAwaitingReciprocity(user.id, id as string);
      }
      setReplyToMessage(null); // Clear reply state
      setShowVoiceRecorder(false); // Hide recorder
      
      // Close any open message menu
      if (activeMessageMenuId) {
        setActiveMessageMenuId(null);
      }
      
      // For cloud URLs, we don't need to verify the file locally
      let mediaDuration = initialDuration;
      
      // If it's not a cloud URL, verify the file and get its duration
      if (!isCloudUrl) {
        // Ensure we have the full path for the local file
        let fullPath = audioUri;
        
        // If we just have a filename, construct the full path
        if (!audioUri.includes('/')) {
          const directory = FileSystem.documentDirectory + 'voice_notes/';
          fullPath = directory + audioUri;
        }
        
        try {
          // Verify the file exists
          const fileInfo = await FileSystem.getInfoAsync(fullPath);
          if (!fileInfo.exists) {
            throw new Error('Voice note file does not exist: ' + fullPath);
          }
          log('[Voice Note] File verified, size:', fileInfo.size, 'bytes');
          
          // Try to get the duration using expo-av
          const soundObject = new Audio.Sound();
          await soundObject.loadAsync({ uri: fullPath });
          const status = await soundObject.getStatusAsync();
          if (status.isLoaded && status.durationMillis) {
            mediaDuration = status.durationMillis / 1000; // Convert to seconds
            log('[Voice Note] Duration:', mediaDuration, 'seconds');
          }
          await soundObject.unloadAsync();
        } catch (err) {
          log('[Voice Note] Error getting file info:', err);
          // Continue anyway, we'll use the initial duration
          mediaDuration = initialDuration;
        }
      }
      
      // Send the voice note with 24-hour expiry
      if (!user?.id || !id) {
        throw new Error('Missing user ID or chat ID');
      }
      
      // Reuse expiryAt that was calculated earlier for optimistic message
      const { sendVoiceNote } = await import('../../utils/chat');
      const sentMessage = await sendVoiceNote(
        user.id,
        id as string,
        mediaUrl,
        mediaDuration,
        expiryAt.toISOString()
      );
      
      if (!sentMessage) {
        throw new Error('Failed to send voice note message');
      }
      
      log('[Voice Note] Message sent successfully:', sentMessage);
      
      // Replace optimistic message with actual message and mark as delivered
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === tempId ? {...sentMessage, delivered: true, delivered_at: new Date().toISOString()} : msg
        )
      );

      if (user?.id && id) {
        checkCanSendRef.current(id as string).then((result) => {
          setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
        });
      }
      
      log('[Voice Note] Successfully replaced optimistic message with sent message');
      
    } catch (error: any) {
      error('[Voice Note] Error sending voice note:', error);
      
      // Check if this is a privacy error (user has DMs disabled)
      if (error?.name === 'PrivacyError' || error?.message?.includes('disabled direct messages')) {
        // Remove optimistic message
        setMessages(prevMessages =>
          prevMessages.filter(msg => msg.id !== tempId)
        );
        
        // Show alert instead of generic toast
        Alert.alert(
          'Direct Messages Disabled',
          'This user has disabled direct messages. You cannot send voice notes to them.',
          [{ text: 'OK' }]
        );
        if (user?.id && id) {
          checkCanSendRef.current(id as string).then((result) => {
            setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
          });
        }
        return;
      }
      
      // For other errors, show generic toast
      showToast('Failed to send voice note');
      
      // Remove optimistic message on error
      setMessages(prevMessages =>
        prevMessages.filter(msg => msg.id !== tempId)
      );

      if (user?.id && id) {
        checkCanSendRef.current(id as string).then((result) => {
          setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
        });
      }
    } finally {
      // Removed setSending for instant messaging
    }
  };
  
  const loadMoreMessages = () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    
    const oldestMessage = messages[messages.length - 1];
    fetchMoreMessages(oldestMessage.created_at);
  };
  
  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return format(date, 'h:mm a');
  };
  
  const formatMessageDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return format(date, 'MMMM d, yyyy');
  };
  
  // Ref to store message position info
  const messagePositionRef = useRef<{messageId: string, isNearTop: boolean} | null>(null);
  
  // Update the renderMessage function to use the memoized component (scrollToMessageId from MessageList for reply tap)
  const renderMessage = ({ item, index, scrollToMessageId }) => {
    return <MessageItem item={item} index={index} scrollToMessageId={scrollToMessageId} />;
  };

  const handleMessageListScroll = useCallback((e) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    // In an inverted FlatList, offset ~0 means user is at the bottom (latest messages)
    const atBottom = y <= 60;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setNewMessagesCount(0);
    }
  }, []);

  const jumpToBottom = useCallback(() => {
    try {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (_) {}
    setNewMessagesCount(0);
    setIsAtBottom(true);
    isAtBottomRef.current = true;
  }, []);
  

  
  // Handle navigating back with prefetch parameter
  const handleGoBack = () => {
    router.back();
  };
  

  const showDeleteConfirmation = (message: Message) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => handleDeleteMessage(message)
        }
      ]
    );
  };

  // Calls removed post-pivot

  const handleDeleteMessage = async (message: Message) => {
    if (!user) return;
    
    // For temporary messages, just remove from UI immediately (no server call)
    if (message.id.startsWith('temp_')) {
      log(`[Private Chat] Deleting temporary message immediately: ${message.id}`);
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== message.id));
      showToast('Message deleted');
      return;
    }
    
    // Check if user owns the message
    const isUserMessage = message.sender_id === user.id;
    
    if (!isUserMessage) {
      // For other users' messages, just hide locally (don't delete from server)
      log(`[Private Chat] Hiding other user's message locally: ${message.id}`);
      setMessages(prevMessages => {
        const filteredMessages = prevMessages.filter(msg => msg.id !== message.id);
        log(`[Private Chat] Removed message from UI, ${prevMessages.length} -> ${filteredMessages.length} messages`);
        return filteredMessages;
      });
      
      // Track this message as deleted to prevent reappearing during refresh
      deletedMessageIds.current.add(message.id);
      lastDeletionTime.current = Date.now();
      
      // Update Zustand store
      const currentStoreMessages = useChatStore.getState().privateMessages[id as string] || [];
      const updatedStoreMessages = currentStoreMessages.filter(msg => msg.id !== message.id);
      useChatStore.getState().setPrivateMessages(id as string, updatedStoreMessages);
      
      showToast('Message deleted');
      return;
    }
    
    log(`[Private Chat] === DELETING MESSAGE ===`);
    log(`[Private Chat] Message ID: ${message.id}`);
    log(`[Private Chat] Message content: ${message.content.substring(0, 50)}...`);
    
    // Optimistic update: Remove from UI immediately
    setMessages(prevMessages => {
      const filteredMessages = prevMessages.filter(msg => msg.id !== message.id);
      log(`[Private Chat] Optimistically removed message from UI, ${prevMessages.length} -> ${filteredMessages.length} messages`);
      return filteredMessages;
    });
    
    // Track this message as deleted to prevent reappearing during refresh
    deletedMessageIds.current.add(message.id);
    lastDeletionTime.current = Date.now();
    log(`[Private Chat] Added message ${message.id} to deleted messages tracker`);
    
    // Update Zustand store immediately to prevent re-appearance
    const currentStoreMessages = useChatStore.getState().privateMessages[id as string] || [];
    const updatedStoreMessages = currentStoreMessages.filter(msg => msg.id !== message.id);
    useChatStore.getState().setPrivateMessages(id as string, updatedStoreMessages);
    log(`[Private Chat] Updated store immediately, removed message from cache (${currentStoreMessages.length} -> ${updatedStoreMessages.length})`);
    
    showToast('Message deleted');
    
    // Then sync with server in background
    try {
      log(`[Private Chat] Sending delete request to server for message: ${message.id}`);
      const success = await deleteMessage(message.id, user.id);
      
      if (success) {
        log(`[Private Chat] ✓ Successfully deleted message ${message.id} from server`);
        log(`[Private Chat] Real-time subscription will handle removal for other user`);

        if (user?.id && id) {
          checkCanSendRef.current(id as string).then((result) => {
            setSendBlockedByRecipient(result.allowed ? null : { reason: result.reason! });
          });
        }
        
        // Broadcast deletion for realtime UI on the other device (fallback if Postgres realtime fails)
        try {
          conversationChannelRef.current?.send({
            type: 'broadcast',
            event: 'message_delete',
            payload: {
              message_id: message.id,
              sender_id: message.sender_id,
              recipient_id: message.recipient_id,
            }
          }).then(() => {
            if (__DEV__) log('[Chat] ✅ Broadcasted message deletion for realtime fallback');
          }).catch(() => {});
        } catch (_) {}
        
        // Verify deletion by checking if message still exists
        setTimeout(async () => {
          try {
            log(`[Private Chat] Verifying deletion by fetching fresh messages...`);
            const freshMessages = await getMessages(user.id, id);
            const stillExists = freshMessages.find(msg => msg.id === message.id);
            
            if (stillExists) {
              error(`[Private Chat] ⚠️ DELETION FAILED: Message ${message.id} still exists in database!`);
              showToast('Message deletion failed, trying again...');
              
              // Try deleting again
              const retrySuccess = await deleteMessage(message.id, user.id);
              if (!retrySuccess) {
                error(`[Private Chat] Retry deletion also failed for message ${message.id}`);
                showToast('Unable to delete message permanently');
              }
            } else {
              log(`[Private Chat] ✅ Deletion verified: Message ${message.id} successfully removed from database`);
            }
          } catch (verifyError) {
            error(`[Private Chat] Error verifying deletion:`, verifyError);
          }
        }, 1500);
        
      } else {
        log(`[Private Chat] ✗ Failed to delete message ${message.id} from server`);
        log(`[Private Chat] Keeping message deleted from UI - will retry in background`);
        
        // Don't revert the optimistic update - keep message deleted from UI
        // Try deleting again in background
        setTimeout(async () => {
          log(`[Private Chat] Retrying deletion for message ${message.id}`);
          try {
            const retrySuccess = await deleteMessage(message.id, user.id);
            if (retrySuccess) {
              log(`[Private Chat] ✓ Retry deletion succeeded for message ${message.id}`);
              showToast('Message deleted successfully');
            } else {
              log(`[Private Chat] ✗ Retry deletion also failed for message ${message.id}`);
              showToast('Message removed from view (deletion may be pending)');
            }
          } catch (retryError) {
            error(`[Private Chat] Retry deletion error for message ${message.id}:`, retryError);
          }
        }, 2000);
        
        showToast('Message deleted from view');
      }
    } catch (error) {
      error('[Private Chat] Error deleting message:', error);
      error('[Private Chat] Full error details:', JSON.stringify(error, null, 2));
      
      // Don't revert the optimistic update - keep message deleted from UI
      log(`[Private Chat] Keeping message ${message.id} deleted from UI despite error`);
      
      // Try deleting again in background
      setTimeout(async () => {
        log(`[Private Chat] Retrying deletion after error for message ${message.id}`);
        try {
          const retrySuccess = await deleteMessage(message.id, user.id);
          if (retrySuccess) {
            log(`[Private Chat] ✓ Error retry deletion succeeded for message ${message.id}`);
            showToast('Message deleted successfully');
          } else {
            log(`[Private Chat] ✗ Error retry deletion also failed for message ${message.id}`);
          }
        } catch (retryError) {
          error(`[Private Chat] Error retry deletion failed for message ${message.id}:`, retryError);
        }
      }, 3000);
      
      showToast('Message deleted from view');
    }
    
    // DON'T call silentlyRefreshMessages() here as it causes the deleted message to reappear
    // The real-time subscription will handle syncing deletions across users
  };
  
  const appStateRef = useRef(AppState.currentState);

  // Force refresh messages when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appStateRef.current.match(/inactive|background/) && 
        nextAppState === 'active' && 
        id && 
        user
      ) {
        log('[Private Chat] App came to foreground, refreshing messages');
        refreshMessages();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
      // Trigger memory cleanup when leaving chat
      periodicMemoryCleanup();
    };
  }, [id, user]); // Removed refreshMessages since it's no longer memoized
  
  // Function to refresh messages from the server - no memoization
  const refreshMessages = async (silent: boolean = false) => {
    if (!id || !user) return;
    
    try {
      if (!silent) setLoading(true);
      log('[Private Chat] Silently refreshing messages');
      
      // Force a fresh fetch from the server but with a smaller limit to improve performance
      const freshMessages = await getMessages(user.id, id);
      
      // Filter out recently deleted messages
      const timeSinceLastDeletion = Date.now() - lastDeletionTime.current;
      const filteredMessages = freshMessages.filter(msg => {
        const wasDeleted = deletedMessageIds.current.has(msg.id);
        if (wasDeleted && timeSinceLastDeletion < 30000) { // 30 seconds grace period
          log(`[Private Chat] Filtered out deleted message ${msg.id} from full refresh`);
          return false;
        }
        // Clean up old deleted message IDs if enough time has passed
        if (wasDeleted && timeSinceLastDeletion > 60000) { // 1 minute
          deletedMessageIds.current.delete(msg.id);
          log(`[Private Chat] Cleaned up old deleted message ID ${msg.id} from full refresh`);
        }
        return true;
      });
      
      if (filteredMessages.length > 0) {
        if (!silent) {
          log('[Private Chat] Loaded fresh messages with reactions:', 
            freshMessages.reduce((count, msg) => count + (msg.reactions?.length || 0), 0));
        }
        
        // Update both local state and Zustand store
        setMessages(filteredMessages);
        // Defer store update to prevent render cycle conflicts
        setTimeout(() => {
              useChatStore.getState().setPrivateMessages(id, filteredMessages);
        }, 0);
        log('[Private Chat] Silent refresh: Updated store with', filteredMessages.length, 'messages');
      }
    } catch (error) {
      error('[Private Chat] Error refreshing messages:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };
  
  const renderHeaderRight = () => {
    log('Rendering header with chat ID:', id);
    if (!id || Array.isArray(id)) {
      return <View style={{ flexDirection: 'row', alignItems: 'center' }} />;
    }
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {!isSupportChat && !ongoingCallSession ? (
          <CallButton
            chatId={id}
            recipientName={otherUser?.full_name || otherUser?.username || undefined}
          />
        ) : null}
      </View>
    );
  };
  

  
  // Lightweight animated reaction chip component (for smooth, performant animations)
  const AnimatedReactionChip = React.memo(({ reaction, isOwn, onRemove, themeColors, delay = 0 }) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const isRemovingRef = useRef(false);
    const hasAnimatedInRef = useRef(false);

    useEffect(() => {
      // Only animate in once when component first mounts
      if (!hasAnimatedInRef.current) {
        hasAnimatedInRef.current = true;
        // Animate in: scale from 0 to 1 with smooth bounce, fade in
        // Stagger animations slightly for multiple reactions
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 180,
            friction: 8,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 250,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        // If already animated in, just set values immediately
        scaleAnim.setValue(1);
        opacityAnim.setValue(1);
      }
    }, []);

    const handleRemove = () => {
      if (isRemovingRef.current) return; // Prevent double-tap
      isRemovingRef.current = true;

      // Animate out: scale to 0, fade out with smooth easing
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0,
          tension: 200,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        onRemove();
      });
    };

    return (
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }}
      >
        <TouchableOpacity
          style={[styles.reactionChip, { backgroundColor: themeColors.neutral.surface }]}
          onPress={isOwn ? handleRemove : undefined}
          disabled={!isOwn || isRemovingRef.current}
          activeOpacity={0.7}
        >
          <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }, (prevProps, nextProps) => {
    return prevProps.reaction.id === nextProps.reaction.id &&
           prevProps.reaction.emoji === nextProps.reaction.emoji &&
           prevProps.isOwn === nextProps.isOwn;
  });

  // Animated reactions row container (slides in smoothly; transform/opacity only for native driver)
  const AnimatedReactionsRow = React.memo(({ reactions, isUserMessage, onRemoveReaction, themeColors, userId }) => {
    const hasReactions = reactions.length > 0;
    const slideAnim = useRef(new Animated.Value(hasReactions ? 0 : -10)).current;
    const opacityAnim = useRef(new Animated.Value(hasReactions ? 1 : 0)).current;
    const prevReactionsLengthRef = useRef(reactions.length);

    useEffect(() => {
      const reactionsChanged = prevReactionsLengthRef.current !== reactions.length;
      prevReactionsLengthRef.current = reactions.length;

      if (hasReactions) {
        if (reactionsChanged) {
          // Slide in from top and fade in when reactions appear or change
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              tension: 150,
              friction: 9,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 250,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        }
      } else {
        // Fade out and slide up when reactions disappear
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: -10,
            tension: 200,
            friction: 10,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 200,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      }
    }, [hasReactions, reactions.length]);

    if (!hasReactions) return null;

    return (
      <Animated.View
        style={[
          styles.reactionsRow,
          isUserMessage ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
          {
            transform: [{ translateY: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {reactions.map((r, index) => {
          const isOwn = r.user_id === userId;
          return (
            <AnimatedReactionChip
              key={`${r.id}-${r.emoji}`} // Include emoji in key to force re-animation when switching
              reaction={r}
              isOwn={isOwn}
              onRemove={() => onRemoveReaction(r.emoji)}
              themeColors={themeColors}
              delay={index * 50} // Increased stagger for smoother appearance
            />
          );
        })}
      </Animated.View>
    );
  }, (prevProps, nextProps) => {
    // Only re-render if reactions array changes
    const prevIds = prevProps.reactions.map(r => r.id).join(',');
    const nextIds = nextProps.reactions.map(r => r.id).join(',');
    return prevIds === nextIds && prevProps.userId === nextProps.userId;
  });

  // MessageItem component inside ChatScreen to access all state and functions
  const MessageItem = React.memo(({ item, index, scrollToMessageId }) => {
    const swipeableRef = useRef(null);
    const isUserMessage = item.sender_id === user?.id;
    const isTempMessage = item.id.startsWith('temp_');
    
    // Check message type
    const isMediaMessage = item.message_type === 'media' && (item.file_url || item.thumbnail_url);
    const isVoiceNote = item.message_type === 'voice_note' && item.media_url;
    
    // Check if this message's menu is open
    const isMenuOpen = activeMessageMenuId === item.id;
    
    // Check if we should show date separator
    const showDateSeparator = index === messages.length - 1 || 
      formatMessageDate(item.created_at) !== formatMessageDate(messages[index + 1].created_at);

    // WhatsApp-style grouping: tighten spacing + adjust bubble corners for consecutive messages
    const olderMsg = index < messages.length - 1 ? messages[index + 1] : null; // appears above (older)
    const newerMsg = index > 0 ? messages[index - 1] : null; // appears below (newer)
    const within2Min = (a?: string, b?: string) => {
      if (!a || !b) return false;
      return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= 2 * 60 * 1000;
    };
    const groupedWithOlder =
      !!olderMsg &&
      olderMsg.sender_id === item.sender_id &&
      within2Min(item.created_at, olderMsg.created_at) &&
      formatMessageDate(item.created_at) === formatMessageDate(olderMsg.created_at);
    const groupedWithNewer =
      !!newerMsg &&
      newerMsg.sender_id === item.sender_id &&
      within2Min(item.created_at, newerMsg.created_at) &&
      formatMessageDate(item.created_at) === formatMessageDate(newerMsg.created_at);
    
    // All messages can be deleted (user's own messages delete from server, others hide locally)
    const canDelete = true;
    
    // Show delivery status for user's messages
    const showDeliveryStatus = isUserMessage && !isTempMessage;
    
    // Check if message is delivered
    const isDelivered = item.delivered || false;
    
    // Check if message is read
    const isRead = item.read || false;
    
    // Check if message is unread (for styling)
    const isUnread = !isUserMessage && !isRead;
    
    // Toggle message actions menu
    const toggleMessageActions = () => {
      // If this message's menu is already open, close it
      if (isMenuOpen) {
        setActiveMessageMenuId(null);
      } else {
        // Otherwise, close any open menu and open this one
        setActiveMessageMenuId(item.id);
        
        // Determine if message is near the top of the screen
        // For simplicity, we'll use the index as a proxy for position
        const isNearTop = index < 3;
        
        // Store position info in a ref to use when rendering
        messagePositionRef.current = {
          messageId: item.id,
          isNearTop
        };
      }
      
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        log('Haptics not available:', error);
      }
    };
    
    // Handle reply action from menu
    const handleReplyFromMenu = () => {
      setActiveMessageMenuId(null);
      handleReply(item);
    };
    
    // Handle copy action from menu
    const handleCopyFromMenu = async () => {
      setActiveMessageMenuId(null);
      
      // Get message text content
      const textToCopy = item.content || '';
      
      if (!textToCopy.trim()) {
        showToast('No text to copy');
        return;
      }
      
      try {
        await Clipboard.setStringAsync(textToCopy);
        showToast('Copied to clipboard');
        
        // Haptic feedback
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          log('Haptics not available:', error);
        }
      } catch (error) {
        error('[Chat] Error copying text:', error);
        showToast('Failed to copy text');
      }
    };
    
    // Handle reaction from menu: show emoji picker then add reaction
    const handleReactionFromMenu = () => {
      setActiveMessageMenuId(null);
      setReactionPickerMessage(item);
    };
    
    // Handle long press on message bubble - show context menu
    const handleLongPress = (event) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        log('Haptics not available:', error);
      }
      
      // For media messages, show context menu with Expire (for testing), Download, and Delete options
      if (isMediaMessage || isVoiceNote) {
        const buttons = ['Expire Media (Test)', 'Delete', 'Cancel'];
        const cancelButtonIndex = 2;
        
        Alert.alert(
          'Media Options',
          'Choose an action',
          [
            {
              text: 'Expire Media (Test)',
              onPress: async () => {
                // Manually expire the media for testing
                const { expireMediaManually } = await import('../../utils/mediaStorage');
                const success = await expireMediaManually(item.id);
                if (success) {
                  // Update local state immediately to show expired state
                  setMessages(prevMessages =>
                    prevMessages.map(msg =>
                      msg.id === item.id
                        ? { ...msg, expiry_at: new Date(Date.now() - 1000).toISOString() }
                        : msg
                    )
                  );
                  Alert.alert('✅ Success', 'Media has been expired. You should see the expired state now.');
                } else {
                  Alert.alert('Error', 'Failed to expire media. Check console for details.');
                }
              }
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => showDeleteConfirmation(item)
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ],
          { cancelable: true }
        );
        return;
      }
      
      // For text messages, show context menu with Copy and Delete options
      if (!isMediaMessage && !isVoiceNote) {
        const buttons = ['Copy', 'Delete', 'Cancel'];
        const cancelButtonIndex = 2;
        const destructiveButtonIndex = 1;
        
        Alert.alert(
          'Message Options',
          '',
          [
            {
              text: 'Copy',
              onPress: () => handleCopyFromMenu()
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                if (isTempMessage) {
                  log(`[Chat] Deleting temp message immediately: ${item.id}`);
                  setMessages(prevMessages => prevMessages.filter(msg => msg.id !== item.id));
                } else {
                  showDeleteConfirmation(item);
                }
              }
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        );
        return;
      }
      
      // For media/voice notes, just show delete confirmation
      if (isTempMessage) {
        log(`[Chat] Deleting temp message immediately: ${item.id}`);
        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== item.id));
        return;
      }
      showDeleteConfirmation(item);
    };
    
    // Render right swipe actions (delete)
    const renderRightActions = (progress) => {
      const trans = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [100, 0],
      });
      
      return (
        <Animated.View 
          style={[
            styles.deleteContainer,
            {
              transform: [{ translateX: trans }],
            },
          ]}
        >
          <TouchableOpacity 
            style={[styles.deleteButton, { backgroundColor: themeColors.error.main }]}
            onPress={() => {
              // For temp messages, delete immediately without confirmation
              if (isTempMessage) {
                log(`[Chat] Swipe delete temp message: ${item.id}`);
                setMessages(prevMessages => prevMessages.filter(msg => msg.id !== item.id));
              } else {
                showDeleteConfirmation(item);
              }
            }}
          >
            <Trash2 size={20} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>
      );
    };
    
    // Determine menu position based on message position
    const isNearTop = messagePositionRef.current?.messageId === item.id ? 
      messagePositionRef.current.isNearTop : false;
    // Message content that will be wrapped in Swipeable if needed
    const MessageContent = (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { color: themeColors.neutral.subtext }]}>
              {formatMessageDate(item.created_at)}
            </Text>
          </View>
        )}
        <View 
          style={[
            styles.messageContainer,
            isUserMessage ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' },
            // Reduce vertical gap for grouped messages (WhatsApp feel)
            groupedWithOlder ? { marginBottom: 8 } : null
          ]}
        >
          {/* Render media message without bubble */}
          {isMediaMessage ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onLongPress={handleLongPress}
              delayLongPress={250}
            >
              <MediaMessage
                message={item}
                isOwnMessage={isUserMessage}
                onDownload={() => {
                  // Optional: refresh or show success
                }}
              />
            </TouchableOpacity>
          ) : (
            <View style={[
              styles.messageBubbleContainer,
              isUserMessage ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
            ]}>
              <TouchableOpacity
              style={[
                styles.messageBubble,
                isUserMessage ? 
                  [styles.userMessageBubble, { backgroundColor: themeColors.primary.main }] : 
                  [styles.otherMessageBubble, { backgroundColor: themeColors.neutral.card }],
                // Grouping: flatten top/bottom corners between consecutive messages
                groupedWithOlder ? { borderTopLeftRadius: BorderRadius.xs, borderTopRightRadius: BorderRadius.xs } : null,
                groupedWithNewer ? { borderBottomLeftRadius: BorderRadius.xs, borderBottomRightRadius: BorderRadius.xs } : null,
                // Tail only on the newest message in a group (bottom-most visually)
                groupedWithNewer && isUserMessage ? { borderBottomRightRadius: BorderRadius.lg } : null,
                groupedWithNewer && !isUserMessage ? { borderBottomLeftRadius: BorderRadius.lg } : null,
                isTempMessage && styles.tempMessageBubble
              ]}
              activeOpacity={0.7}
              onLongPress={handleLongPress}
              delayLongPress={250}
            >
              {/* Reply content if this is a reply - original chat bubble style (match country chat) */}
              {item.reply_to_message && (
                <TouchableOpacity
                  style={[
                    styles.replyContainer,
                    {
                      backgroundColor: isUserMessage
                        ? 'rgba(255, 255, 255, 0.25)'
                        : 'rgba(0, 0, 0, 0.08)',
                      borderLeftColor: isUserMessage
                        ? 'rgba(255, 255, 255, 0.7)'
                        : themeColors.primary.main,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.reply_to_message?.id && scrollToMessageId) {
                      scrollToMessageId(item.reply_to_message.id);
                    }
                  }}
                >
                  <View style={styles.replyHeader}>
                    <CornerUpLeft size={12} color={isUserMessage ? 'rgba(255, 255, 255, 0.9)' : themeColors.primary.main} />
                    <Text
                      style={[
                        styles.replyName,
                        { color: isUserMessage ? 'rgba(255, 255, 255, 0.95)' : themeColors.primary.main },
                      ]}
                      numberOfLines={1}
                    >
                      {item.reply_to_message.user_id === user?.id ? 'You' : item.reply_to_message.username || 'User'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.replyText,
                      { color: isUserMessage ? 'rgba(255, 255, 255, 0.9)' : themeColors.neutral.text },
                    ]}
                    numberOfLines={1}
                  >
                    {item.reply_to_message.content}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Message content - media, voice note, or text */}
              {(() => {
                // Media messages are rendered outside the bubble
                if (item.message_type === 'media' && (item.file_url || item.thumbnail_url)) {
                  return null;
                }
                
                // Check if message has voice note fields (new format)
                if (item.message_type === 'voice_note' && item.media_url) {
                  return (
                    <View pointerEvents="box-none" style={{ overflow: 'visible', zIndex: 1 }}>
                      <VoiceNotePlayer 
                        audioUri={item.media_url} 
                        isUserMessage={isUserMessage}
                        duration={item.media_duration || 0}
                        expiryAt={item.expiry_at || null}
                        messageId={item.id}
                      />
                    </View>
                  );
                }
                
                // Check if content is a voice note (legacy format with URL in content)
                const voiceNote = parseVoiceNote(item.content);
                if (voiceNote.isVoiceNote && voiceNote.url) {
                  return (
                    <View pointerEvents="box-none">
                      <VoiceNotePlayer 
                        audioUri={voiceNote.url} 
                        isUserMessage={isUserMessage}
                        duration={voiceNote.duration || 0}
                      />
                    </View>
                  );
                }
                
                // Regular text message with links
                return renderTextWithLinks(
                  item.content,
                  [
                    styles.messageText,
                    isUserMessage ? styles.userMessageText : [
                      styles.otherMessageText, 
                      { 
                        color: isUnread ? themeColors.primary.main : themeColors.neutral.text,
                        fontWeight: isUnread ? '600' : '400'
                      }
                    ]
                  ],
                  themeColors,
                  isUserMessage,
                  showLinkWarning
                );
              })()}
              
              <View style={styles.messageFooter}>
                <Text 
                  style={[
                    styles.messageTime,
                    isUserMessage ? styles.userMessageTime : [
                      styles.otherMessageTime, 
                      { 
                        color: isUnread ? themeColors.primary.main : themeColors.neutral.subtext,
                        fontWeight: isUnread ? '600' : '400'
                      }
                    ]
                  ]}
                >
                  {formatMessageTime(item.created_at)}
                </Text>
                {/* Message status indicator - Show delivered tick, blue when read (seen) */}
                {isUserMessage && !isTempMessage && (
                  <View style={styles.messageStatusIndicator}>
                    {(item.delivered !== false) && (
                      <View style={[
                        styles.tickContainer,
                        { 
                          backgroundColor: item.read ? 'rgba(255, 111, 174, 0.26)' : 'rgba(255, 255, 255, 0.15)',
                          shadowColor: item.read ? '#FF6FAE' : '#000',
                        }
                      ]}>
                        <CheckCircle 
                          size={14} 
                          color={item.read ? '#FFD1E6' : '#FFFFFF'} 
                          strokeWidth={2.5}
                        />
                      </View>
                    )}
                  </View>
                )}
                
                {/* Reply button */}
                <TouchableOpacity
                  style={[
                    styles.replyButton,
                    { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.05)' }
                  ]}
                  onPress={() => handleReply(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <CornerUpLeft size={14} color={isUserMessage ? 'rgba(255, 255, 255, 0.9)' : themeColors.primary.main} />
                </TouchableOpacity>
                {/* React button - empty heart icon, tap to add emoji */}
                {!isTempMessage && (
                  <TouchableOpacity
                    style={[
                      styles.replyButton,
                      { backgroundColor: isUserMessage ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.05)' }
                    ]}
                    onPress={handleReactionFromMenu}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Heart size={14} color={isUserMessage ? 'rgba(255, 255, 255, 0.9)' : themeColors.primary.main} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
            {/* Reactions overlay (absolute) so it doesn't push bubble */}
            {(item.reactions?.length ?? 0) > 0 && (
              <View
                style={[
                  styles.reactionsRowAbsolute,
                  isUserMessage ? { right: 0 } : { left: 0 },
                ]}
              >
                <AnimatedReactionsRow
                  reactions={item.reactions ?? []}
                  isUserMessage={isUserMessage}
                  onRemoveReaction={(emoji) => handleRemoveReaction(item, emoji)}
                  themeColors={themeColors}
                  userId={user?.id}
                />
              </View>
            )}
            
            {/* Message actions menu (similar to WhatsApp) */}
            {isMenuOpen && (
              <View 
                style={[
                  styles.messageActionsMenu,
                  { 
                    backgroundColor: themeColors.neutral.card,
                    ...Shadow.md,
                  },
                  isUserMessage ? { right: 0 } : { left: 0 },
                  // Position based on message position
                  isNearTop ? { bottom: -80 } : { top: -80 }
                ]}
              >
                <TouchableOpacity 
                  style={styles.messageActionItem} 
                  onPress={handleReplyFromMenu}
                >
                  <MessageSquare size={16} color={themeColors.primary.main} />
                  <Text style={[styles.messageActionText, { color: themeColors.neutral.text }]}>Reply</Text>
                </TouchableOpacity>
                {/* Copy option - only show for text messages */}
                {item.message_type === 'text' && item.content && item.content.trim() && (
                  <TouchableOpacity 
                    style={styles.messageActionItem} 
                    onPress={handleCopyFromMenu}
                  >
                    <Copy size={16} color={themeColors.primary.main} />
                    <Text style={[styles.messageActionText, { color: themeColors.neutral.text }]}>Copy</Text>
                  </TouchableOpacity>
                )}

                
                {canDelete && (
                  <TouchableOpacity 
                    style={styles.messageActionItem}
                    onPress={() => {
                      setActiveMessageMenuId(null);
                      showDeleteConfirmation(item);
                    }}
                  >
                    <Trash2 size={16} color={themeColors.error.main} />
                    <Text style={[styles.messageActionText, { color: themeColors.error.main }]}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          )}

        </View>
      </View>
    );
    
    // Return swipeable wrapper for all messages (user can delete any message)
    return (
      <Swipeable
        ref={swipeableRef}
        key={`swipeable-${item.id}-${isTempMessage ? 'temp' : 'real'}`}
        rightThreshold={40}
        friction={2}
        renderRightActions={renderRightActions}
      >
        {MessageContent}
      </Swipeable>
    );
  }, (prevProps, nextProps) => {
    // Re-render if item ID changes (temp -> real), content changes, or status changes
    // Return true if props are EQUAL (don't re-render), false if DIFFERENT (re-render)
    const idChanged = prevProps.item.id !== nextProps.item.id;
    const contentChanged = prevProps.item.content !== nextProps.item.content;
    const deliveredChanged = prevProps.item.delivered !== nextProps.item.delivered;
    const readChanged = prevProps.item.read !== nextProps.item.read;
    const indexChanged = prevProps.index !== nextProps.index;
    const prevReactions = prevProps.item.reactions ?? [];
    const nextReactions = nextProps.item.reactions ?? [];
    const reactionCountChanged = prevReactions.length !== nextReactions.length;
    
    // If anything important changed, re-render (return false)
    if (idChanged || contentChanged || deliveredChanged || readChanged || indexChanged || reactionCountChanged) {
      return false;
    }

    // If reaction count is same, still re-render if reaction content changed.
    // This fixes the "reactions only update after leaving and coming back" issue
    // when a reaction is swapped/updated without changing array length.
    for (let i = 0; i < prevReactions.length; i++) {
      const a = prevReactions[i];
      const b = nextReactions[i];
      if (!a || !b) return false;
      if (a.id !== b.id || a.emoji !== b.emoji || a.user_id !== b.user_id) {
        return false;
      }
    }
    
    // Otherwise, don't re-render (return true)
    return true;
  });
  
  // Loading indicator component for fresh message fetch (moved before conditional return)
  const FreshMessagesLoadingIndicator = () => {
    // Always return a view to prevent hook count changes
    return (
      <View style={[
        styles.freshMessagesLoadingContainer, 
        { 
          backgroundColor: themeColors.neutral.surface,
          borderBottomColor: themeColors.neutral.border,
          display: isFetchingFreshMessages ? 'flex' : 'none' // Use display instead of conditional return
        }
      ]}>
        <View style={styles.freshMessagesLoadingContent}>
          <ActivityIndicator size="small" color={themeColors.primary.main} />
          <Text style={[styles.freshMessagesLoadingText, { color: themeColors.neutral.subtext }]}>
            Fetching new messages...
          </Text>
        </View>
      </View>
    );
  };
  
  // Load disabled typing indicator state from storage (moved before conditional return)
  useEffect(() => {
    const loadDisabledState = async () => {
      try {
        const value = await AsyncStorage.getItem('disableTypingIndicator');
        if (value !== null) {
          setDisableTypingIndicator(value === 'true');
        }
        
        // Also check for error count
        const errorCount = await AsyncStorage.getItem('typingErrorCount');
        if (errorCount && parseInt(errorCount, 10) > 5) {
          warn('[Private Chat] Too many typing errors detected, disabling typing indicators');
          setDisableTypingIndicator(true);
          await AsyncStorage.setItem('disableTypingIndicator', 'true');
        }
      } catch (error) {
        error('[Private Chat] Error loading typing indicator state:', error);
      }
    };
    
    loadDisabledState();
  }, []);
  
  // Save disabled typing indicator state to storage (moved before conditional return)
  useEffect(() => {
    const saveDisabledState = async () => {
      try {
        await AsyncStorage.setItem('disableTypingIndicator', String(disableTypingIndicator));
      } catch (error) {
        error('[Private Chat] Error saving typing indicator state:', error);
      }
    };
    
    if (disableTypingIndicator) {
      saveDisabledState();
    }
  }, [disableTypingIndicator]);
  
  // Function to reset typing indicator state (temporarily disabled)
  const resetTypingIndicator = async () => {
    try {
      // Just show a message that typing indicators are disabled
      log('[Private Chat] Typing indicators are temporarily disabled');
      showToast('Typing indicators are temporarily disabled');
      
      // Force disable typing indicators
      setDisableTypingIndicator(true);
      await AsyncStorage.setItem('disableTypingIndicator', 'true');
    } catch (error) {
      error('[Private Chat] Error in resetTypingIndicator:', error);
    }
  };

  // Show shimmer loading during initial load - with timeout protection
  if ((isInitialLoad || loadingProfile || !initialDataLoaded) && Date.now() - startLoadTime < 10000) {
    return (
      <ChatBackgroundPattern>
        <SafeAreaView style={[GlobalStyles.safeArea, { backgroundColor: 'transparent', paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { 
          backgroundColor: themeColors.surface,
          borderBottomColor: themeColors.border
        }]}>
            <TouchableOpacity 
            style={styles.backButton}
            onPress={handleGoBack}
            activeOpacity={0.6}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <View style={[styles.backButtonContainer, { backgroundColor: themeColors.surface + '80' }]}>
              <ChevronLeft size={16} color={themeColors.text} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
            
            {/* Shimmer header */}
            <View style={styles.profileContainer}>
              <Animated.View 
                style={[
                  styles.shimmerAvatar, 
                  { 
                    backgroundColor: themeColors.border,
                    opacity: shimmerAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.2, 0.8],
                    })
                  }
                ]} 
              />
              <View style={styles.profileInfo}>
                <Animated.View 
                  style={[
                    styles.shimmerText, 
                    styles.shimmerTitle,
                    { 
                      backgroundColor: themeColors.border,
                      opacity: shimmerAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 0.8],
                      })
                    }
                  ]} 
                />
                <Animated.View 
                  style={[
                    styles.shimmerText, 
                    styles.shimmerSubtitle,
                    { 
                      backgroundColor: themeColors.border,
                      opacity: shimmerAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 0.8],
                      })
                    }
                  ]} 
                />
        </View>
            </View>
          </View>
          
          {/* Shimmer messages */}
          <View style={[styles.messagesList, styles.messagesContainer]}>
            {[1, 2, 3, 4, 5].map((index) => (
              <View key={index} style={styles.shimmerMessageContainer}>
                {index % 2 === 0 ? (
                  // Other user message
                  <View style={styles.shimmerOtherMessage}>
                    <Animated.View 
                      style={[
                        styles.shimmerAvatar, 
                        styles.shimmerMessageAvatar,
                        { 
                          backgroundColor: themeColors.border,
                          opacity: shimmerAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.2, 0.8],
                          })
                        }
                      ]} 
                    />
                    <Animated.View 
                      style={[
                        styles.shimmerMessageBubble,
                        styles.shimmerOtherMessageBubble,
                        { 
                          backgroundColor: themeColors.border,
                          opacity: shimmerAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.2, 0.8],
                          })
                        }
                      ]} 
                    />
                  </View>
                ) : (
                  // User message
                  <View style={styles.shimmerUserMessage}>
                    <Animated.View 
                      style={[
                        styles.shimmerMessageBubble,
                        styles.shimmerUserMessageBubble,
                        { 
                          backgroundColor: themeColors.border,
                          opacity: shimmerAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.2, 0.8],
                          })
                        }
                      ]} 
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
          
          {/* Shimmer input */}
          <View style={[styles.shimmerContainer, { 
            backgroundColor: themeColors.surface,
            borderTopColor: themeColors.border
          }]}>
            <View style={[styles.inputWrapper, { 
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
            }]}>
              <Animated.View 
                style={[
                  styles.shimmerInput,
                  { 
                    backgroundColor: themeColors.border,
                    opacity: shimmerAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.2, 0.8],
                    })
                  }
                ]} 
              />
              <Animated.View 
                style={[
                  styles.shimmerSendButton,
                  { 
                    backgroundColor: themeColors.border,
                    opacity: shimmerAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.2, 0.8],
                    })
                  }
                ]} 
              />
            </View>
          </View>
      </SafeAreaView>
      </ChatBackgroundPattern>
    );
  }
  
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ChatBackgroundPattern>
        <SafeAreaView style={[GlobalStyles.safeArea, { 
          backgroundColor: 'transparent', 
          paddingBottom: insets.bottom,
          paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0
        }]}>
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: 'transparent' }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.header, { 
            backgroundColor: themeColors.surface,
            borderBottomColor: themeColors.border
          }]}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleGoBack}
              activeOpacity={0.6}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <View style={[styles.backButtonContainer, { backgroundColor: themeColors.surface + '80' }]}>
                <ChevronLeft size={16} color={themeColors.text} strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
            
            {loadingProfile ? (
              <View style={styles.loadingProfileContainer}>
                <View style={[styles.loadingAvatarPlaceholder, { backgroundColor: themeColors.border }]} />
                <View style={styles.loadingTextContainer}>
                  <ActivityIndicator size="small" color={themeColors.primary.main} />
                  <Text style={[styles.loadingProfileText, { color: themeColors.textSecondary }]}>Loading profile...</Text>
                </View>
              </View>
            ) : otherUser ? (
              <TouchableOpacity 
                style={styles.profileContainer}
                onPress={() => router.push(`/profile/${otherUser.id}`)}
              >
                <EnhancedAvatar
                  avatarUrl={getAvatarUrl(otherUser.avatar_url, otherUser.id)}
                  size={32}
                  isDarkMode={isDarkMode}
                  showBorder={true}
                  userId={otherUser.id}
                  fullName={otherUser.full_name || ''}
                  username={otherUser.username || ''}
                  isStatic={true}
                  showVerifiedBadge={isSupportChat}
                  isVerified={isSupportChat}
                  email={isSupportChat ? 'hello@nomli.cc' : undefined}
                />
                <View style={styles.profileInfo}>
                  <View style={styles.headerTitleRow}>
                    <Text 
                      style={[styles.headerTitle, { color: themeColors.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      @{stripAtSymbol(sanitizeUsernameForDisplay(otherUser.username) || getSafeDisplayName(otherUser.username, otherUser.full_name)?.split(' ')[0] || 'Chat')}
                    </Text>
                    {isSupportChat && (
                      <View style={styles.officialBadge}>
                        <Text style={styles.officialBadgeText}>Official</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.onlineStatusContainer}>
                    {isOtherUserOnline && (
                      <View style={[styles.onlineStatusDot, { backgroundColor: '#4CAF50' }]} />
                    )}
                    <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
                      {isSupportChat 
                        ? (isOtherUserOnline ? 'Online • Support Team' : 'Support Team')
                        : (isOtherUserOnline ? 'Online' : formatLastSeen(lastSeen))
                      }
                  </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.loadingProfileContainer}>
                <View style={[styles.loadingAvatarPlaceholder, { backgroundColor: themeColors.border }]} />
                <View style={styles.loadingTextContainer}>
                  <ActivityIndicator size="small" color={themeColors.primary.main} />
                  <Text style={[styles.loadingProfileText, { color: themeColors.textSecondary }]}>Loading profile...</Text>
                </View>
              </View>
            )}
            
            {renderHeaderRight()}
          </View>
          
          {/* Messages list */}
          {isInitialLoad ? (
            <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
              <Text style={[styles.loadingText, { color: themeColors.textSecondary, marginTop: 16 }]}>
                Loading messages...
              </Text>
              <Text style={[styles.loadingSubText, { color: themeColors.textSecondary, marginTop: 8 }]}>
                Please wait while we fetch your conversation
              </Text>
            </View>
          ) : (
            <MessageList
                messages={messages}
                otherUser={otherUser}
                user={user}
                handleReply={handleReply}
                handleReaction={handleReaction}
                handleRemoveReaction={handleRemoveReaction}
                activeMessageMenuId={activeMessageMenuId}
                setActiveMessageMenuId={setActiveMessageMenuId}
                handleDeleteMessage={handleDeleteMessage}
                themeColors={themeColors}
                onLoadMore={loadMoreMessages}
                loadingMore={loadingMore}
                flatListRef={flatListRef}
                renderEmptyComponent={null}
                renderMessage={renderMessage}
                onScroll={handleMessageListScroll}
              />
          )}

          {/* WhatsApp-style "new messages" pill when user is scrolled up */}
          {!isAtBottom && newMessagesCount > 0 && (
            <TouchableOpacity
              style={[styles.newMessagesPill, { backgroundColor: themeColors.neutral.card }]}
              onPress={jumpToBottom}
              activeOpacity={0.85}
            >
              <Text style={[styles.newMessagesPillText, { color: themeColors.neutral.text }]}>
                {newMessagesCount} new message{newMessagesCount === 1 ? '' : 's'}
              </Text>
              <Text style={[styles.newMessagesPillArrow, { color: themeColors.primary.main }]}>↓</Text>
            </TouchableOpacity>
          )}
          
          {/* Empty state overlay - positioned absolutely but not blocking input */}
          {messages.length === 0 && !isInitialLoad && (
            <View style={styles.emptyStateOverlay} pointerEvents="none">
              <View style={styles.emptyStateContent}>
                <View style={[
                  styles.emptyStateIcon, 
                  { backgroundColor: isSupportChat ? '#FF6B9D20' : themeColors.primary.main + '20' }
                ]}>
                  <Text style={[styles.emptyStateIconText, { color: isSupportChat ? '#FF6B9D' : themeColors.primary.main }]}>
                    {isSupportChat ? '🦩' : '💬'}
                  </Text>
                </View>
                <Text style={[styles.emptyStateTitle, { color: themeColors.neutral.text }]} numberOfLines={2}>
                  {wasConversationDeleted 
                    ? 'Previous conversation was deleted' 
                    : isSupportChat 
                      ? "Nomli Mingle Official" 
                      : 'No messages yet'}
                </Text>
                <Text style={[styles.emptyStateMessage, { color: themeColors.neutral.subtext }]} numberOfLines={3}>
                  {wasConversationDeleted 
                    ? 'Send a message to start a new conversation' 
                    : isSupportChat 
                      ? "Contact us for ads, events, or support.\nOur team will respond shortly."
                      : 'Start the conversation by sending a message'
                  }
                </Text>
                {/* Trust line for official chat */}
                {isSupportChat && !wasConversationDeleted && (
                  <View style={styles.trustLineContainer}>
                    <Text style={[styles.trustLineText, { color: themeColors.neutral.subtext }]} numberOfLines={2}>
                      🔒 We'll never request calls or payments outside the app.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
          
          {/* WhatsApp-style typing indicator - Always reserve space to prevent layout shifts */}
          <View 
            style={styles.typingIndicatorContainer}
            pointerEvents={(!disableTypingIndicator && otherUserTyping) ? 'auto' : 'none'}
            collapsable={false}
            removeClippedSubviews={false}
          >
            <View
              style={{
                opacity: (!disableTypingIndicator && otherUserTyping) ? 1 : 0,
              }}
              collapsable={false}
              removeClippedSubviews={false}
            >
              <WhatsAppTypingIndicator />
            </View>
          </View>
          
          {replyToMessage && (
            <View 
              style={[
                styles.replyPreview, 
                { 
                  backgroundColor: themeColors.surface,
                  borderTopColor: themeColors.border,
                  borderBottomColor: themeColors.border,
                }
              ]}
            >
              <View style={styles.replyPreviewContent}>
                <View style={[styles.replyPreviewBar, { backgroundColor: themeColors.primary.main }]} />
                <View style={styles.replyPreviewTextContainer}>
                  <Text style={[styles.replyPreviewName, { color: themeColors.primary.main }]}>
                    {replyToMessage.sender_id === user?.id ? 'You' : otherUser?.username || 'User'}
                  </Text>
                  <Text style={[styles.replyPreviewText, { color: themeColors.text }]} numberOfLines={1}>
                    {replyToMessage.content}
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.replyPreviewClose}
                onPress={cancelReply}
              >
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          
          {/* Use the memoized input container */}
          <MessageInputContainer
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            handleSend={handleSend}
            handleVoiceNotePress={handleVoiceNotePress}
            messageInputRef={messageInputRef}
            themeColors={themeColors}
            activeMessageMenuId={activeMessageMenuId}
            setActiveMessageMenuId={setActiveMessageMenuId}
            handleTypingChange={stableTypingHandler}
            onMediaPress={() => setShowMediaPicker(true)}
            pendingMedia={pendingMedia}
            inputPlaceholder={isSupportChat ? 'Message the official team...' : undefined}
            sendBlockedByRecipient={sendBlockedByRecipient}
          />
          
          {/* Premium Media Picker Modal */}
          <PremiumMediaPicker
            visible={showMediaPicker}
            onClose={() => setShowMediaPicker(false)}
            onMediaSelected={(mediaItems) => {
              setPendingMedia(mediaItems);
              // Don't set any placeholder - keep input empty
            }}
          />
        </KeyboardAvoidingView>
        
        {/* Toast message */}
        {toastMessage && (
          <Animated.View 
            style={[
              styles.toastContainer,
              { backgroundColor: themeColors.primary.dark },
              {
                opacity: toastOpacity,
                transform: [{ translateY: toastTranslateY }]
              }
            ]}
          >
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}
        
        {/* Voice recorder modal */}
        {showVoiceRecorder && (
          <Modal
            transparent={true}
            visible={showVoiceRecorder}
            animationType="slide"
            onRequestClose={() => setShowVoiceRecorder(false)}
          >
            <TouchableWithoutFeedback onPress={() => setShowVoiceRecorder(false)}>
              <View style={styles.voiceRecorderModalOverlay}>
                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                  <View style={[styles.voiceRecorderModalContainer, { backgroundColor: themeColors.surface }]}>
                    <VoiceRecorder
                      onSend={handleVoiceNoteSend}
                      onCancel={() => setShowVoiceRecorder(false)}
                      maxDuration={120} // 2 minutes max
                      userId={user?.id}
                    />
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}
        
        {/* External Link Modal */}
        <ExternalLinkModal
          visible={externalLinkModalVisible}
          url={externalLinkUrl}
          onCancel={handleCancelExternalLink}
          onOpen={handleOpenExternalLink}
        />

        {/* Compact reaction picker - single row */}
        <Modal visible={reactionPickerMessage !== null} transparent animationType="fade">
          <View style={styles.reactionPickerBackdrop}>
            <TouchableWithoutFeedback onPress={() => setReactionPickerMessage(null)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View style={[styles.reactionPickerStrip, { backgroundColor: themeColors.neutral.card }]} pointerEvents="box-none">
              {['❤️', '👍', '😂', '😮', '😢', '🙏'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionPickerEmoji}
                  onPress={() => {
                    if (reactionPickerMessage) {
                      handleReaction(reactionPickerMessage, emoji);
                      setReactionPickerMessage(null);
                    }
                  }}
                >
                  <Text style={styles.reactionPickerEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </ChatBackgroundPattern>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    zIndex: 2, // Above background doodles
    // Ensure container can properly restore position when keyboard dismisses
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
  },
  loadingSubText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    opacity: 0.7,
  },
  safeAreaView: {
    flex: 1,
  },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 0,
    marginRight: Spacing.sm,
  },
  backButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  profileContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  profileInfo: {
    marginLeft: 10,
    flex: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    maxWidth: 120, // Reduced to make room for official badge
    letterSpacing: -0.1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  officialBadge: {
    backgroundColor: '#FF6B9D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  officialBadgeText: {
    fontSize: 9,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  onlineStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.round,
    marginLeft: Spacing.sm,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  messageListContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  messageContainer: {
    marginBottom: 28,
    width: '100%',
    position: 'relative',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
    marginLeft: 50,
    alignSelf: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
    marginRight: 50,
    alignSelf: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: Spacing.md + 1,
    paddingVertical: Spacing.sm + 1,
    borderRadius: 18,
    maxWidth: '80%',
    minWidth: 60,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userMessageBubble: {
    borderBottomRightRadius: 8,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 8,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  tempMessageBubble: {
    opacity: 0.8,
  },
  messageText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#FFF',
  },
  otherMessageText: {
    // Color will be set dynamically
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    gap: Spacing.xs,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionsRowAbsolute: {
    position: 'absolute',
    bottom: -28, // Position below the bubble
    zIndex: 10,
  },
  reactionChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionPickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reactionPickerStrip: {
    flexDirection: 'row',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
    ...Shadow.md,
  },
  reactionPickerEmoji: {
    padding: 10,
    borderRadius: 20,
  },
  reactionPickerEmojiText: {
    fontSize: 24,
  },
  newMessagesPill: {
    position: 'absolute',
    right: Spacing.md,
    bottom: 140, // above input + typing indicator
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...Shadow.md,
  },
  newMessagesPillText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
  },
  newMessagesPillArrow: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
  },
  messageTime: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherMessageTime: {
    // Color will be set dynamically
  },
  messageStatusIndicator: {
    marginLeft: Spacing.xs, // Add spacing between time and status indicator
  },
  tickContainer: {
    borderRadius: 10,
    padding: 2,
    ...(Platform.OS === 'ios' ? {
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
    } : {
      elevation: 2,
    }),
  },
  inputContainer: {
    padding: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? Spacing.sm : Spacing.md,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    maxHeight: 100,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
    marginBottom: 4,
  },
  voiceButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    marginBottom: 4,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  loadingMore: {
    paddingVertical: 16,
  },
  typingIndicatorContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-start', // Align to left like received messages
    backgroundColor: 'transparent',
    height: 40, // Fixed height - NEVER changes to prevent layout shifts
    minHeight: 40, // Ensure minimum height
    maxHeight: 40, // Ensure maximum height
    justifyContent: 'center', // Center content vertically
  },
  loadingProfileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  loadingAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  loadingTextContainer: {
    marginLeft: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingProfileText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginLeft: Spacing.sm,
  },
  sendingIndicator: {
    marginRight: Spacing.sm,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  dateSeparatorText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(255,111,174,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,111,174,0.38)',
  },
  themeToggle: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.round,
  },
  headerButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.round,
    marginRight: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyAnimation: {
    width: 200,
    height: 200,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginHorizontal: Spacing.lg,
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: Spacing.lg,
    right: Spacing.lg,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.md,
    zIndex: 1000,
  },
  toastText: {
    color: 'white',
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },

  deleteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
  },
  deleteButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  replyContainer: {
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderRadius: 8,
    marginTop: 0,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  replyName: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.semibold,
    marginBottom: 2,
  },
  replyText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
  },
  messageBubbleContainer: {
    position: 'relative',
    marginVertical: 4,
  },
  messageActionsMenu: {
    position: 'absolute',
    padding: Spacing.xs,
    borderRadius: BorderRadius.lg,
    ...Shadow.md,
    zIndex: 10,
    minWidth: 140,
    marginTop: 0,
  },
  messageActionItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  messageActionText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.sm,
  },

  replyPreview: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  replyPreviewContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyPreviewBar: {
    width: 3,
    height: 40,
    borderRadius: 2,
    marginRight: Spacing.sm,
  },
  replyPreviewTextContainer: {
    flex: 1,
  },
  replyPreviewName: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    marginBottom: 2,
  },
  replyPreviewText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  replyPreviewClose: {
    padding: Spacing.sm,
  },
  voiceRecorderModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  voiceRecorderModalContainer: {
    margin: Spacing.lg,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },

  shimmerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  shimmerInput: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.xl,
    marginRight: Spacing.sm,
  },
  shimmerSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  replyButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm, // Add specific margin for the reply button
  },
  // InputContainer styles
  inputContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    minHeight: 40,
  },
  messageInput: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    maxHeight: 120, // Limit height for multiline
    minHeight: 20,
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Spacing.xs,
  },
  actionButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.round,
    marginRight: Spacing.xs,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  
  // Shimmer loading styles
  shimmerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  shimmerText: {
    height: 16,
    borderRadius: 8,
    marginVertical: 2,
  },
  shimmerTitle: {
    width: 120,
    height: 18,
    marginBottom: 4,
  },
  shimmerSubtitle: {
    width: 80,
    height: 14,
  },
  shimmerMessageContainer: {
    marginVertical: 8,
    paddingHorizontal: Spacing.md,
  },
  shimmerOtherMessage: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  shimmerUserMessage: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  shimmerMessageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  shimmerMessageBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  shimmerOtherMessageBubble: {
    height: 40,
    width: 180,
    alignSelf: 'flex-start',
  },
  shimmerUserMessageBubble: {
    height: 40,
    width: 150,
    alignSelf: 'flex-end',
  },
  shimmerContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  shimmerInput: {
    height: 40,
    flex: 1,
    borderRadius: 20,
    marginRight: 8,
  },
  shimmerSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  // Empty state styles
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    minHeight: 300,
  },
  emptyStateOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 100, // Leave space for input area
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 1, // Lower z-index to avoid blocking input
    padding: Spacing.xl,
  },
  emptyStateContent: {
    alignItems: 'center',
    maxWidth: 300,
    paddingHorizontal: Spacing.md,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyStateIconText: {
    fontSize: 40,
  },
  emptyStateTitle: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  emptyStateMessage: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
    flexWrap: 'wrap',
  },
  trustLineContainer: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    width: '100%',
  },
  trustLineText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.7,
    flexWrap: 'wrap',
  },
});

export default ChatScreen;