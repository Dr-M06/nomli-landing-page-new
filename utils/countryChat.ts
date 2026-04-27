import { supabase } from './supabase';
import { AppState } from 'react-native';
import { log, warn, error } from './productionLogger';

// Local notifications removed - using Expo notifications instead

/**
 * Adapted types based on the existing database schema
 */
export type ChatRoom = {
  id: string;
  country_code: string;
  name: string; // Changed from country_name to name to match database schema
  description: string;
  created_at: string;
  isFavorite?: boolean;
};

// Add reaction type to support emoji reactions
export type MessageReaction = {
  id?: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
};

// Update ChatMessage type to include reactions
export type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string; // Optional updated_at for message edits
  is_ai_message: boolean;
  is_ai: boolean;
  is_pinned?: boolean; // Optional pinned status
  username: string;
  // Reply functionality
  reply_to_id?: string;
  reply_to_message?: {
    id: string;
    content: string;
    user_id: string;
    username: string;
  };
  // Add a profile field for user data join
  profile?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
  // Optional field to track bookmark status
  isBookmarked?: boolean;
  // Reactions to messages
  reactions?: MessageReaction[];
};

export type OnlineUser = {
  id: string;
  username: string;
  avatar_url?: string;
  last_seen: string;
};

export type TypingUser = {
  id: string;
  username: string;
};

/**
 * Fetch all countries (chat rooms)
 * @param includeInterestRooms Whether to include interest-based chat rooms (default: false)
 * @param retryCount Internal parameter for retry logic
 */
export const fetchAllCountries = async (includeInterestRooms = false, retryCount = 0): Promise<ChatRoom[]> => {
  try {
    log(`Fetching countries from chat_rooms table... (attempt ${retryCount + 1})`);
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    // Add a small delay on retries to prevent hammering the database
    if (retryCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
    
    // Build the query - first check what columns exist
    // Try to select specific columns that should exist
    let query = supabase
      .from('chat_rooms')
      .select('id, country_code, description, created_at, is_interest_based');
    
    // Filter by is_interest_based if not including interest rooms
    if (!includeInterestRooms) {
      query = query.is('is_interest_based', false);
    }
    
    // Try ordering by country_code instead of name (more likely to exist)
    const { data, error } = await query.order('country_code');
    
    if (error) {
      error('Error fetching chat rooms:', error);
      error('Error details:', error.message);
      
      // Retry up to 2 times if we get a specific kind of error
      if (retryCount < 2 && (error.code === 'PGRST116' || error.code === '23505' || error.code.startsWith('20'))) {
        log(`Retrying fetchAllCountries (attempt ${retryCount + 2})...`);
        return fetchAllCountries(includeInterestRooms, retryCount + 1);
      }
      
      return [];
    }
    
    if (!data || data.length === 0) {
      log('No countries found in database. This might indicate a data issue.');
      
      // Only retry if this appears to be an empty result but should have data
      if (retryCount < 1) {
        log('Retrying once to confirm empty result...');
        return fetchAllCountries(includeInterestRooms, retryCount + 1);
      }
    }
    
    // Transform data to match expected format
    // The chat_rooms table might not have a 'name' column, so we'll derive it from country_code
    const transformedData = (data || []).map(room => {
      // If name doesn't exist, create it from country_code or use description
      if (!room.name) {
        // Try to get country name from countries table or use country_code
        room.name = room.description || `${room.country_code} Chat` || 'Chat Room';
      }
      return room;
    });
    
    // Add additional validation to ensure the data is structured as expected
    const validatedData = transformedData.filter(room => {
      if (!room || typeof room !== 'object') return false;
      if (!room.id || !room.country_code) {
        warn('Found invalid chat room entry:', room);
        return false;
      }
      // Ensure name exists (we just added it above)
      if (!room.name) {
        room.name = `${room.country_code} Chat`;
      }
      return true;
    });
    
    log(`Successfully fetched ${validatedData.length} valid chat rooms`);
    
    // If user is not logged in, return rooms without favorite info
    if (!user) {
      return validatedData;
    }
    
    // Fetch user's favorites
    const { data: favorites, error: favoritesError } = await supabase
      .from('favorite_countries')
      .select('country_id')
      .eq('user_id', user.id);
    
    if (favoritesError) {
      error('Error fetching favorites:', favoritesError);
      return validatedData;
    }
    
    // Create a set of favorite country IDs for quick lookup
    const favoriteCountryIds = new Set(favorites?.map(fav => fav.country_id) || []);
    
    // Mark favorite rooms and sort them to the top
    const roomsWithFavorites = validatedData.map(room => ({
      ...room,
      isFavorite: favoriteCountryIds.has(room.id)
    }));
    
    // Sort favorites to the top, then by country name
    return roomsWithFavorites.sort((a, b) => {
      // First by favorite status (favorites first)
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      
      // Then alphabetically by country name
      return (a.name || '').localeCompare(b.name || '');
    });
  } catch (error) {
    error('Exception in fetchAllCountries:', error);
    
    // Add specific error handling for network errors, which are common
    if (error instanceof Error) {
      error('Error type:', error.name);
      error('Error message:', error.message);
      
      // For network errors, retry once
      if ((error.message && error.message.includes('network')) && retryCount < 1) {
        log('Network error detected, retrying once...');
        return fetchAllCountries(includeInterestRooms, retryCount + 1);
      }
    }
    
    return [];
  }
};

/**
 * Fetch countries by region (not implemented in current schema)
 */
export const fetchCountriesByRegion = async (region: string): Promise<ChatRoom[]> => {
  // Since we don't have region in the current schema, just return all countries
  return fetchAllCountries();
};

/**
 * Fetch country by code
 */
export const fetchCountryByCode = async (code: string): Promise<ChatRoom | null> => {
  try {
    // Select only columns that exist (no 'name' column)
    const { data, error } = await supabase
      .from('chat_rooms')
      .select('id, country_code, description, created_at, is_interest_based')
      .eq('country_code', code.toUpperCase())
      .maybeSingle();
    
    if (error) {
      error('Error fetching country by code:', error);
      return null;
    }
    
    if (!data) {
      return null;
    }
    
    // Transform to match ChatRoom type (add name field)
    const transformed: ChatRoom = {
      ...data,
      name: data.description || `${code} Chat`,
    };
    
    return transformed;
  } catch (error) {
    error('Exception in fetchCountryByCode:', error);
    return null;
  }
};

/**
 * Fetch messages for a specific chat room
 */
export const fetchCountryChatMessages = async (
  roomId: string,
  limit: number = 30 // Reduced from 50 to 30 for faster loading on slow connections
): Promise<ChatMessage[]> => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`
        *,
        profile:user_id(
          id,
          username,
          full_name,
          avatar_url
        ),
        reply_to_message:reply_to_id(
          id,
          content,
          user_id,
          profile:user_id(username, full_name, avatar_url)
        ),
        reactions:message_reactions(
          id,
          user_id,
          emoji,
          created_at
        )
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      error('Error fetching chat messages:', error);
      return [];
    }

    // Transform the data to match the expected ChatMessage format
    // Set username from profile table (same as community posts)
    const transformedData = (data || []).map(message => {
      // Get username from profile table, with fallbacks (same pattern as community posts)
      let username = 'Unknown User';
      if (message.profile?.username) {
        username = message.profile.username;
      } else if (message.username) {
        // Fallback to stored username if profile doesn't have one
        username = message.username;
      } else if (message.user_email) {
        // Extract username from email (part before @)
        username = message.user_email.split('@')[0];
      }
      
      const transformedMessage: ChatMessage = {
        ...message,
        username, // Use username from profile table
        reply_to_message: message.reply_to_message ? {
          id: message.reply_to_message.id,
          content: message.reply_to_message.content,
          user_id: message.reply_to_message.user_id,
          // Get reply username from profile table too
          username: message.reply_to_message.profile?.username || 
                   message.reply_to_message.username || 
                   (message.reply_to_message.user_email ? message.reply_to_message.user_email.split('@')[0] : 'Unknown')
        } : undefined,
        reactions: message.reactions || []
      };
      return transformedMessage;
    });

    log(`[FetchMessages] Fetched ${transformedData.length} messages with reactions`);
    return transformedData;
  } catch (error) {
    error('Exception in fetchCountryChatMessages:', error);
    return [];
  }
};

/**
 * Send a message to a country chat room, with optional reply to another message
 */
export const sendCountryChatMessage = async (
  roomId: string,
  userId: string,
  content: string,
  username?: string,
  replyToMessageId?: string
): Promise<boolean> => {
  try {
    // Validate room ID
    if (!isValidUuid(roomId)) {
      error(`[Chat] Error: Invalid room UUID format '${roomId}'`);
      return false;
    }
    
    // Validate user ID
    if (!isValidUuid(userId)) {
      error(`[Chat] Error: Invalid user UUID format '${userId}'`);
      return false;
    }
    
    // Get room info for notification
    let countryName = 'Chat';
    try {
      const { data: room } = await supabase
        .from('chat_rooms')
        .select('name')
        .eq('id', roomId)
        .single();
      
      if (room?.name) {
        countryName = room.name;
      }
    } catch (error) {
      error('Error fetching room name:', error);
      // Continue with default name
    }
    
    // Create message data
    const messageData: any = {
      room_id: roomId,
      user_id: userId,
      content,
      username,
      is_ai_message: false
    };
    
    // Handle reply functionality
    let originalMessageUserId: string | null = null;
    let originalMessageUsername: string | null = null;
    let shouldSendNotification = false;
    
    if (replyToMessageId) {
      // Add reply_to_id to the message data
      messageData.reply_to_id = replyToMessageId;
      
      // Fetch the original message to get the user ID for notification
      try {
        const { data: originalMessage, error } = await supabase
          .from('chat_messages')
          .select(`
            id,
            user_id,
            content,
            profile:profiles(username, full_name)
          `)
          .eq('id', replyToMessageId)
          .single();
        
        if (error) {
          error('Error fetching original message:', error);
        }
        
        if (originalMessage) {
          // Get the username from the profile or use a default
          const originalUsername = originalMessage.profile?.username || 
                                 originalMessage.profile?.full_name || 
                                 'User';
          
          // Save the original message user ID for notification
          originalMessageUserId = originalMessage.user_id;
          originalMessageUsername = originalUsername;
          
          // Don't send notification if user is replying to their own message
          shouldSendNotification = originalMessageUserId !== userId;
          
          if (shouldSendNotification) {
            log(`[Reply] Will notify user ${originalMessageUserId} about reply from ${userId}`);
          } else {
            log(`[Reply] User replying to their own message, no notification needed`);
          }
        } else {
          log(`[Reply] Original message not found for ${replyToMessageId}`);
        }
      } catch (error) {
        error('Error fetching original message for reply:', error);
        // Continue without reply_to_user if fetch fails
      }
    }

    // Insert the message
    const { data, error } = await supabase
      .from('chat_messages')
      .insert(messageData)
      .select()
      .single();
    
    if (error) {
      error('Error sending message:', error);
      return false;
    }
    
    log('Message sent successfully:', data.id);
    
    // Send notification if this is a reply to another user's message
    if (shouldSendNotification && originalMessageUserId) {
      try {
        // Simplified approach: Just check if the app is in foreground
        // This will send notifications when the app is not active,
        // which is better than missing notifications
        const appState = AppState.currentState;
        const isAppActive = appState === 'active';
        
        // Always send the notification unless app is in foreground and they're in the chat
        // The user's presence in the specific chat is harder to determine reliably,
        // so we'll err on the side of sending notifications
        log(`[Reply] Sending notification to ${originalMessageUserId} for reply in ${countryName}`);
        
        // Update the recipient's reply notification counter in the database
        try {
          const { error: updateError } = await supabase.rpc('increment_reply_notification_count', {
            for_user_id: originalMessageUserId
          });
          
          if (updateError) {
            error('[Reply] Error incrementing notification count:', updateError);
            
            // Fallback: Direct update if RPC fails
            await supabase
              .from('profiles')
              .update({ 
                reply_notification_count: supabase.sql`reply_notification_count + 1` 
              })
              .eq('id', originalMessageUserId);
          } else {
            log(`[Reply] Successfully incremented reply notification count for ${originalMessageUserId}`);
          }
        } catch (countError) {
          error('[Reply] Error updating notification count:', countError);
        }
        
        // Send the notification using Expo notifications
        log(`[Reply] Would send notification via Expo: Reply from ${username || 'User'}`);
      } catch (notifError) {
        error('Error sending country chat reply notification:', notifError);
      }
    }

    return true;
  } catch (error) {
    error('Exception in sendCountryChatMessage:', error);
    return false;
  }
};

/**
 * Track online users in a chat room using Supabase presence
 */
export const trackOnlineUsers = (
  roomId: string,
  userId: string,
  username: string,
  avatarUrl?: string,
  callback?: (onlineUsers: OnlineUser[]) => void
) => {
  try {
    // Validate room ID
    if (!isValidUuid(roomId)) {
      error(`[TrackOnlineUsers] Error: Invalid room UUID format '${roomId}'`);
      return null;
    }
    
    // Get a safe ID for presence tracking
    const presenceUserId = getSafePresenceId(userId);
    
    // Log whether we're using a real UUID or a temporary ID
    if (!isValidUuid(userId)) {
      log(`[TrackOnlineUsers] Warning: Invalid UUID format '${userId}', using temporary ID: ${presenceUserId}`);
    }
    
    // Ensure consistent channel naming across all platforms
    const channelName = `room:${roomId}`;
    
    // First, check if a channel with this name already exists
    const existingChannels = supabase.getChannels();
    const existingChannel = existingChannels.find(channel => 
      channel.topic === channelName || 
      channel.topic === `realtime:${channelName}`
    );
    
    if (existingChannel) {
      log(`[TrackOnlineUsers] Found existing room channel for ${channelName}, reusing it`);
      
      // Attempt to update the user's presence on the existing channel
      try {
        existingChannel.track({
          user_id: presenceUserId,
          username: username,
          avatar_url: avatarUrl || null,
          online_at: new Date().toISOString()
        });
        log(`[TrackOnlineUsers] Updated presence on existing channel for user ${username}`);
      } catch (error) {
        error(`[TrackOnlineUsers] Error updating presence on existing channel:`, error);
      }
      
      return existingChannel;
    }
    
    log(`[TrackOnlineUsers] Setting up presence tracking for user ${username} in room ${roomId}`);
    const roomChannel = supabase.channel(channelName);
    
    // Set up presence tracking
    roomChannel
      .on('presence', { event: 'sync' }, () => {
        // Get the current state of online users
        const state = roomChannel.presenceState();
        log(`[TrackOnlineUsers] Presence state updated for room ${roomId}:`, state);
        
        // Convert the presence state to an array of online users
        const onlineUsers = Object.keys(state).map(presenceId => {
          const presences = state[presenceId] as any[];
          const userPresence = presences[0]; // Take the first presence for each user
          
          return {
            id: userPresence.user_id,
            username: userPresence.username,
            avatar_url: userPresence.avatar_url,
            last_seen: new Date().toISOString()
          };
        });
        
        // Filter out any stale presence data (older than 5 minutes)
        const currentTime = new Date().getTime();
        const activeUsers = onlineUsers.filter(user => {
          // If the user has no online_at timestamp, consider them active
          if (!user.last_seen) return true;
          
          // Calculate how long ago they were last seen
          const lastSeenTime = new Date(user.last_seen).getTime();
          const timeDifference = currentTime - lastSeenTime;
          
          // Keep users who were active in the last 5 minutes
          return timeDifference < 5 * 60 * 1000; // 5 minutes in milliseconds
        });
        
        log(`[TrackOnlineUsers] Found ${activeUsers.length} active users in room ${roomId} (filtered from ${onlineUsers.length})`);
        
        // Call the callback with the current list of online users
        if (callback) {
          callback(activeUsers);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        log(`[TrackOnlineUsers] User joined: ${key}`, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        log(`[TrackOnlineUsers] User left: ${key}`, leftPresences);
      })
      .subscribe(async (status) => {
        log(`[TrackOnlineUsers] Channel status: ${status}`);
        if (status === 'SUBSCRIBED') {
          log(`[TrackOnlineUsers] Successfully subscribed to room ${roomId}, sending presence`);
          // Send user presence once subscribed
          await roomChannel.track({
            user_id: presenceUserId, // Use the validated or temporary ID
            username: username,
            avatar_url: avatarUrl || null,
            online_at: new Date().toISOString()
          });
          log(`[TrackOnlineUsers] User ${username} presence sent`);
        } else if (status === 'CHANNEL_ERROR') {
          error(`[TrackOnlineUsers] Error subscribing to room ${roomId}`);
        }
      });
      
    // Return the channel so it can be unsubscribed later
    return roomChannel;
  } catch (error) {
    error('Exception in trackOnlineUsers:', error);
    return null;
  }
};

/**
 * Track user typing status in a chat room and provide methods to start/stop typing indicator
 * @param roomId The ID of the chat room
 * @param userId The ID of the user who is typing
 * @param username The username of the user who is typing
 * @returns The presence channel for cleanup
 */
export const trackUserTyping = (
  roomId: string,
  userId: string,
  username: string
) => {
  try {
    // Validate room ID
    if (!isValidUuid(roomId)) {
      error(`[Typing] Error: Invalid room UUID format '${roomId}'`);
      return {
        channel: null,
        startTyping: () => {},
        stopTyping: () => {}
      };
    }
    
    // Get a safe ID for presence tracking
    const presenceUserId = getSafePresenceId(userId);
    
    // Log warning if the user ID is not a valid UUID
    if (!isValidUuid(userId)) {
      log(`[Typing] Warning: Invalid UUID format '${userId}', using temporary ID: ${presenceUserId}`);
    }
    
    // Ensure consistent channel naming across all platforms
    const channelName = `typing:${roomId}`;
    
    // First, check if a channel with this name already exists
    const existingChannels = supabase.getChannels();
    const existingChannel = existingChannels.find(channel => 
      channel.topic === channelName || 
      channel.topic === `realtime:${channelName}`
    );
    
    // Use a flag to track if we reused an existing channel
    let isReusedChannel = false;
    let typingChannel: any;
    
    if (existingChannel) {
      log(`[Typing] Found existing typing channel for ${channelName}, reusing it`);
      typingChannel = existingChannel;
      isReusedChannel = true;
    } else {
      // Now create a new channel
      log(`[Typing] Creating new typing channel for ${channelName}`);
      typingChannel = supabase.channel(channelName);
      
      // Only subscribe if this is a new channel (not reused) and not already subscribed
      if (typingChannel.state !== 'subscribed' && typingChannel.state !== 'joining') {
      typingChannel.subscribe(async (status) => {
        log(`[Typing] Channel subscription status: ${status} for ${channelName}`);
        if (status === 'SUBSCRIBED') {
          log(`[Typing] Successfully subscribed to typing channel: ${channelName}`);
        }
      });
      } else {
        log(`[Typing] Channel ${channelName} is already in state: ${typingChannel.state}, not subscribing again`);
      }
    }
    
    let typingTimeout: NodeJS.Timeout | null = null;
    let isCurrentlyTyping = false;
    
    // Function to broadcast typing status using presence
    const broadcastTyping = async (isTyping: boolean) => {
      try {
        log(`[Typing] Broadcasting typing status: ${isTyping} for user ${username}`);
        
        if (isTyping && !isCurrentlyTyping) {
          // Start tracking presence when typing
          await typingChannel.track({
            user_id: presenceUserId, // Use the validated or temporary ID
            username: username,
            is_typing: true,
            timestamp: new Date().toISOString(),
            platform: 'mobile'
          });
          isCurrentlyTyping = true;
        } else if (!isTyping && isCurrentlyTyping) {
          // Stop tracking presence when not typing
          await typingChannel.untrack();
          isCurrentlyTyping = false;
        }
      } catch (error) {
        error('Error broadcasting typing status:', error);
      }
    };
    
    // Return an object with methods to update typing status
    return {
      channel: typingChannel,
      
      // Call this when the user starts typing
      startTyping: () => {
        log(`[Typing] ${username} started typing`);
        
        // Clear existing timeout if any
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }
        
        // Broadcast typing status
        broadcastTyping(true);
        
        // Set timeout to automatically stop typing indicator after 3 seconds
        typingTimeout = setTimeout(() => {
          log(`[Typing] Auto-stopping typing for ${username} after timeout`);
          broadcastTyping(false);
          typingTimeout = null;
        }, 3000) as unknown as NodeJS.Timeout;
      },
      
      // Call this when the user explicitly stops typing (e.g., sends a message)
      stopTyping: () => {
        log(`[Typing] ${username} stopped typing`);
        
        if (typingTimeout) {
          clearTimeout(typingTimeout);
          typingTimeout = null;
        }
        broadcastTyping(false);
      }
    };
  } catch (error) {
    error('Exception in trackUserTyping:', error);
    return {
      channel: null,
      startTyping: () => {},
      stopTyping: () => {}
    };
  }
};

/**
 * Subscribe to user typing indicators in a chat room
 * @param roomId The ID of the chat room
 * @param callback Callback function that receives the list of currently typing users
 * @returns The presence channel for cleanup
 */
export const subscribeToUserTyping = (
  roomId: string,
  callback: (typingUsers: {id: string; username: string}[]) => void
) => {
  try {
    // Validate room ID
    if (!isValidUuid(roomId)) {
      error(`[Typing] Error: Invalid room UUID format '${roomId}'`);
      // Call callback with empty array and return null channel
      callback([]);
      return null;
    }
    
    // Ensure consistent channel naming across all platforms
    const channelName = `typing:${roomId}`;
    
    // First, check if a channel with this name already exists
    const existingChannels = supabase.getChannels();
    const existingChannel = existingChannels.find(channel => 
      channel.topic === channelName || 
      channel.topic === `realtime:${channelName}`
    );
    
    let typingChannel: any;
    
    if (existingChannel) {
      log(`[Typing] Found existing subscription channel for ${channelName}, reusing it`);
      typingChannel = existingChannel;
      
      // Return the existing channel immediately
      // The callback will be triggered by the existing presence handlers
      return typingChannel;
    }
    
    // Create a new channel
    log(`[Typing] Creating new subscription channel for ${channelName}`);
    typingChannel = supabase.channel(channelName);
    
    log(`[Typing] Setting up typing subscription for channel: ${channelName}`);
    
    // Set up presence handler for typing status
    typingChannel
      .on('presence', { event: 'sync' }, () => {
        log('[Typing] Received presence sync event');
        // Get the current state
        const state = typingChannel.presenceState();
        log('[Typing] Presence state:', JSON.stringify(state, null, 2));
        
        // Extract users who are currently typing
        const typingUsers: {id: string; username: string}[] = [];
        
        Object.keys(state).forEach(presenceId => {
            const presences = state[presenceId] as any[];
          if (presences && presences.length > 0) {
            const userPresence = presences[0]; // Take the first presence for each user
            
            log(`[Typing] Checking user presence:`, userPresence);
            
            // Only include users who are actually typing
            if (userPresence && userPresence.is_typing === true) {
              typingUsers.push({
                id: userPresence.user_id,
                username: userPresence.username
              });
            }
          }
        });
        
        log('[Typing] Currently typing users:', JSON.stringify(typingUsers));
        
        // Call the callback with the list of typing users
        callback(typingUsers);
      })
      .on('presence', { event: 'join' }, (payload) => {
        log('[Typing] User joined typing channel:', payload);
      })
      .on('presence', { event: 'leave' }, (payload) => {
        log('[Typing] User left typing channel:', payload);
      });
    
    // Check if the channel is already subscribed
    if (typingChannel.state !== 'subscribed' && typingChannel.state !== 'joining') {
      log(`[Typing] Subscribing to channel ${channelName}`);
      typingChannel.subscribe((status) => {
        log(`[Typing] Subscription status for channel ${channelName}: ${status}`);
      });
    } else {
      log(`[Typing] Channel ${channelName} is already in state: ${typingChannel.state}`);
    }
    
    // Return the channel for cleanup
    return typingChannel;
  } catch (error) {
    error('Exception in subscribeToUserTyping:', error);
    return null;
  }
};

/**
 * Stop tracking online users and cleanup channels when leaving a chat room
 * @param channel The channel to remove
 */
export const stopTrackingOnlineUsers = (channel: any) => {
  try {
    if (!channel) {
      log('[Cleanup] No channel provided for cleanup');
      return;
    }
    
    log('[Cleanup] Removing channel:', channel.topic || 'unknown topic');
    
    // Try to untrack presence first to prevent presence state from lingering
    if (typeof channel.untrack === 'function') {
      try {
        channel.untrack();
        log('[Cleanup] Successfully untracked presence');
      } catch (untrackError) {
        log('[Cleanup] Error untracking presence:', untrackError);
      }
    }
    
    // Now remove the channel
    try {
      supabase.removeChannel(channel);
      log('[Cleanup] Successfully removed channel');
    } catch (error) {
      error('[Cleanup] Error removing channel:', error);
    }
  } catch (error) {
    error('[Cleanup] Exception in stopTrackingOnlineUsers:', error);
  }
};

/**
 * Get all online users in a chat room (useful for initial load)
 */
export const getOnlineUsers = async (
  roomId: string,
  currentUserId?: string,
  currentUsername?: string,
  currentUserAvatarUrl?: string
): Promise<OnlineUser[]> => {
  try {
    log(`[GetOnlineUsers] Starting for room ${roomId} with user ${currentUsername || 'unknown'}`);
    
    // Validate room ID
    if (!isValidUuid(roomId)) {
      error(`[GetOnlineUsers] Error: Invalid room UUID format '${roomId}'`);
      return [];
    }
    
    // Get a safe ID for presence if we have a user ID
    const presenceUserId = currentUserId ? getSafePresenceId(currentUserId) : undefined;
    
    // Log warning if the user ID is not a valid UUID
    if (currentUserId && !isValidUuid(currentUserId)) {
      log(`[GetOnlineUsers] Warning: Invalid UUID format '${currentUserId}', using temporary ID: ${presenceUserId}`);
    }
    
    // Always include current user in results if available
    const currentUserOnline: OnlineUser[] = currentUserId && currentUsername ? [{
      id: currentUserId,
      username: currentUsername,
      avatar_url: currentUserAvatarUrl,
      last_seen: new Date().toISOString()
    }] : [];
    
    // Return a Promise so we can handle the async operations
    return new Promise((resolve) => {
      // Create a new channel for presence tracking
      const channelName = `room:${roomId}`;
      log(`[GetOnlineUsers] Creating new channel: ${channelName}`);
      const channel = supabase.channel(channelName);
      
      let hasResolvedOnce = false;
      let resolveTimeoutId: NodeJS.Timeout | null = null;
      
      // Set up presence handlers
      channel
        .on('presence', { event: 'sync' }, () => {
          // Get the current state
          const state = channel.presenceState();
          log(`[GetOnlineUsers] Got presence state for room ${roomId}:`, state);
          
          // If no users found in presence state, return current user
          if (!state || Object.keys(state).length === 0) {
            log(`[GetOnlineUsers] No users found in presence state, using current user`);
            if (!hasResolvedOnce && currentUserOnline.length > 0) {
              hasResolvedOnce = true;
              resolve(currentUserOnline);
              
              // Clean up
              setTimeout(() => {
                log(`[GetOnlineUsers] Cleaning up empty channel`);
                supabase.removeChannel(channel);
              }, 1000);
              
              return;
            }
          }
          
          // Convert the presence state to an array of online users
          const onlineUsers = Object.keys(state).map(presenceId => {
            const presences = state[presenceId] as any[];
            const userPresence = presences[0]; // Take the first presence for each user
            
            return {
              id: userPresence.user_id,
              username: userPresence.username,
              avatar_url: userPresence.avatar_url,
              last_seen: userPresence.online_at || new Date().toISOString()
            };
          });
          
          log(`[GetOnlineUsers] Found ${onlineUsers.length} users in presence state`);
          
          // Filter out any stale presence data (older than 5 minutes)
          const currentTime = new Date().getTime();
          const activeUsers = onlineUsers.filter(user => {
            // If the user has no last_seen timestamp, consider them active
            if (!user.last_seen) return true;
            
            // Calculate how long ago they were last seen
            const lastSeenTime = new Date(user.last_seen).getTime();
            const timeDifference = currentTime - lastSeenTime;
            
            // Keep users who were active in the last 5 minutes
            return timeDifference < 5 * 60 * 1000; // 5 minutes in milliseconds
          });
          
          log(`[GetOnlineUsers] Found ${activeUsers.length} active users (filtered from ${onlineUsers.length})`);
          
          // Only resolve if we haven't already
          if (!hasResolvedOnce) {
            hasResolvedOnce = true;
            
            // Make sure current user is included in the results
            let finalUsers = [...activeUsers];
            
            // Add current user if not already in the list
            if (currentUserId && currentUsername) {
              const isCurrentUserIncluded = finalUsers.some(u => u.id === currentUserId);
              if (!isCurrentUserIncluded) {
                log(`[GetOnlineUsers] Adding current user to results`);
                finalUsers = [...finalUsers, ...currentUserOnline];
              }
            }
            
            log(`[GetOnlineUsers] Resolving with ${finalUsers.length} online users`);
            
            // Clear timeout if it exists
            if (resolveTimeoutId) {
              clearTimeout(resolveTimeoutId);
              resolveTimeoutId = null;
            }
            
            // Resolve with the final list of users
            resolve(finalUsers);
            
            // Clean up the channel after a short delay
            setTimeout(() => {
              log(`[GetOnlineUsers] Cleaning up channel after successful sync`);
              supabase.removeChannel(channel);
            }, 1000);
          }
        })
        .subscribe(async (status) => {
          log(`[GetOnlineUsers] Channel status: ${status} for room ${roomId}`);
          
          if (status === 'SUBSCRIBED') {
            // If we have a current user, add them to presence
            if (currentUserId && currentUsername) {
              log(`[GetOnlineUsers] Adding current user ${currentUsername} to presence`);
              try {
                await channel.track({
                  user_id: presenceUserId, // Use the validated or temporary ID
                  username: currentUsername,
                  avatar_url: currentUserAvatarUrl || null,
                  online_at: new Date().toISOString()
                });
                log(`[GetOnlineUsers] Successfully added ${currentUsername} to presence`);
              } catch (presenceError) {
                error(`[GetOnlineUsers] Error tracking presence for current user:`, presenceError);
                
                // If we fail to track presence, still make sure to return the current user
                if (!hasResolvedOnce) {
                  log(`[GetOnlineUsers] Resolving with current user after presence error`);
                  hasResolvedOnce = true;
                  resolve(currentUserOnline);
                  
                  // Clean up
                  setTimeout(() => {
                    supabase.removeChannel(channel);
                  }, 1000);
                }
              }
            }
            
            // Set a shorter timeout to resolve faster
            resolveTimeoutId = setTimeout(() => {
              if (!hasResolvedOnce) {
                log(`[GetOnlineUsers] Resolving after timeout with current user as online`);
                hasResolvedOnce = true;
                resolve(currentUserOnline);
                
                // Clean up
                setTimeout(() => {
                  supabase.removeChannel(channel);
                }, 1000);
              }
            }, 1500); // 1.5 second timeout - much faster than before
          } else if (status === 'CHANNEL_ERROR') {
            error(`[GetOnlineUsers] Channel error for room ${roomId}`);
            
            // On error, still resolve with current user
            if (!hasResolvedOnce) {
              hasResolvedOnce = true;
              resolve(currentUserOnline);
              
              // Clean up
              setTimeout(() => {
                supabase.removeChannel(channel);
              }, 1000);
            }
          }
        });
    });
  } catch (error) {
    error('Exception in getOnlineUsers:', error);
    
    // Even on exception, return current user if available
    return currentUserId && currentUsername ? [{
      id: currentUserId,
      username: currentUsername,
      avatar_url: currentUserAvatarUrl,
      last_seen: new Date().toISOString()
    }] : [];
  }
};

/**
 * Bookmark a message
 */
export const bookmarkMessage = async (
  userId: string,
  messageId: string,
  roomId: string
): Promise<boolean> => {
  try {
    // Check if we have a valid UUID for user
    if (!isValidUuid(userId)) {
      log(`[BookmarkMessage] Warning: Invalid UUID format '${userId}', skipping database operation`);
      return false;
    }
    
    // Validate room ID
    if (!isValidUuid(roomId)) {
      error(`[BookmarkMessage] Error: Invalid room UUID format '${roomId}'`);
      return false;
    }
    
    // Check if already bookmarked
    const { data: existingBookmark, error: checkError } = await supabase
      .from('bookmarked_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('message_id', messageId)
      .maybeSingle();
    
    if (checkError) {
      error('Error checking bookmarked message:', checkError);
      return false;
    }
    
    // If already bookmarked, return true
    if (existingBookmark) {
      return true;
    }
    
    // Insert new bookmark
    const { error: insertError } = await supabase
      .from('bookmarked_messages')
      .insert({
        user_id: userId,
        message_id: messageId,
        room_id: roomId
      });
    
    if (insertError) {
      error('Error bookmarking message:', insertError);
      return false;
    }
    
    return true;
  } catch (error) {
    error('Exception in bookmarkMessage:', error);
    return false;
  }
};

/**
 * Remove bookmark
 */
export const removeBookmark = async (
  userId: string,
  messageId: string
): Promise<boolean> => {
  try {
    // Check if we have a valid UUID for user
    if (!isValidUuid(userId)) {
      log(`[RemoveBookmark] Warning: Invalid UUID format '${userId}', skipping database operation`);
      return false;
    }
    
    // Validate message ID
    if (!isValidUuid(messageId)) {
      error(`[RemoveBookmark] Error: Invalid message UUID format '${messageId}'`);
      return false;
    }
    
    const { error } = await supabase
      .from('bookmarked_messages')
      .delete()
      .eq('user_id', userId)
      .eq('message_id', messageId);
    
    if (error) {
      error('Error removing bookmark:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    error('Exception in removeBookmark:', error);
    return false;
  }
};

/**
 * Get bookmarked messages
 */
export const getBookmarkedMessages = async (
  userId: string
): Promise<any[]> => {
  try {
    // Fetch all bookmarks for the user
    const { data: bookmarks, error: bookmarksError } = await supabase
      .from('bookmarked_messages')
      .select(`
        id,
        message_id,
        room_id,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (bookmarksError) {
      error('Error fetching bookmarks:', bookmarksError);
      return [];
    }
    
    if (!bookmarks || bookmarks.length === 0) {
      return [];
    }
    
    // Fetch message details for each bookmark
    const messageDetails = await Promise.all(
      bookmarks.map(async (bookmark) => {
        const { data: message, error: messageError } = await supabase
          .from('chat_messages')
          .select(`
            id,
            content,
            created_at,
            user_id,
            username,
            room_id
          `)
          .eq('id', bookmark.message_id)
          .single();
        
        if (messageError) {
          error(`Error fetching message ${bookmark.message_id}:`, messageError);
          return null;
        }
        
        // Fetch room info
        const { data: room, error: roomError } = await supabase
          .from('chat_rooms')
          .select('id, name, country_code')
          .eq('id', bookmark.room_id)
          .single();
        
        if (roomError) {
          error(`Error fetching room ${bookmark.room_id}:`, roomError);
        }
        
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', message.user_id)
          .single();
        
        if (profileError) {
          error(`Error fetching profile for user ${message.user_id}:`, profileError);
        }
        
        return {
          bookmark_id: bookmark.id,
          bookmark_created_at: bookmark.created_at,
          message: message,
          room: room || { id: bookmark.room_id },
          profile: profile || { id: message.user_id, username: message.username }
        };
      })
    );
    
    // Filter out any null results from failed message fetches
    return messageDetails.filter(item => item !== null);
  } catch (error) {
    error('Exception in getBookmarkedMessages:', error);
    return [];
  }
};

/**
 * Update user's current country
 */
export const updateUserCurrentCountry = async (
  userId: string,
  countryCode: string
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ current_country: countryCode })
      .eq('id', userId);
    
    if (error) {
      error('Error updating user current country:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    error('Exception in updateUserCurrentCountry:', error);
    return false;
  }
};

/**
 * Join a chat room (placeholder implementation)
 */
export const joinCountryChat = async (
  roomId: string,
  userId: string
): Promise<boolean> => {
  try {
    // Validate room ID
    if (!isValidUuid(roomId)) {
      log(`[JoinCountryChat] Skipping join for invalid room UUID format '${roomId}'`);
      return true; // Return true to prevent UI errors
    }
    
    // Check if we have a valid UUID
    if (!isValidUuid(userId)) {
      log(`[JoinCountryChat] Skipping join for invalid user UUID format '${userId}'`);
      return true; // Return true to prevent UI errors
    }
    
    // Auto-cleanup old participants for security (remove users inactive for more than 24 hours)
    const cleanupCutoff = new Date();
    cleanupCutoff.setHours(cleanupCutoff.getHours() - 24); // 24 hours ago
    
    // Get all participant user IDs for this room
    const { data: allParticipants } = await supabase
      .from('country_chat_participants')
      .select('user_id')
      .eq('country_chat_id', roomId);
      
    if (allParticipants && allParticipants.length > 0) {
      const participantIds = allParticipants.map(p => p.user_id);
      
      // Get profiles to check last_active times
      const { data: profilesForCleanup } = await supabase
        .from('profiles')
        .select('id, last_active')
        .in('id', participantIds);
        
      if (profilesForCleanup) {
        // Find users who haven't been active in the last 24 hours
        const inactiveUserIds = profilesForCleanup
          .filter(profile => {
            if (!profile.last_active) return true; // No last_active means very old
            const lastActive = new Date(profile.last_active);
            return lastActive < cleanupCutoff;
          })
          .map(profile => profile.id);
          
        // Remove inactive participants
        if (inactiveUserIds.length > 0) {
          log(`[JoinCountryChat] Auto-cleaning ${inactiveUserIds.length} inactive participants from room ${roomId}`);
          await supabase
            .from('country_chat_participants')
            .delete()
            .eq('country_chat_id', roomId)
            .in('user_id', inactiveUserIds);
        }
      }
    }
    
    // Insert a record to indicate the user has joined this chat room
    const { error } = await supabase
      .from('country_chat_participants')
      .upsert({
        user_id: userId,
        country_chat_id: roomId,
        joined_at: new Date().toISOString()
      });
    
    if (error) {
      // Log as a debug message instead of error to avoid showing in UI
      log('[JoinCountryChat] Could not record chat join:', error);
      // Return true anyway to prevent UI errors
      return true;
    }
    
    return true;
  } catch (error) {
    // Log as a debug message instead of error to avoid showing in UI
    log('[JoinCountryChat] Exception:', error);
    // Return true anyway to prevent UI errors
    return true;
  }
};

/**
 * Clean up old participants from all country chat rooms for security
 * Removes users who haven't been active in the last 24 hours
 */
export const cleanupOldParticipants = async (): Promise<void> => {
  try {
    log('[CleanupOldParticipants] Starting global cleanup of inactive participants');
    
    const cleanupCutoff = new Date();
    cleanupCutoff.setHours(cleanupCutoff.getHours() - 24); // 24 hours ago
    
    // Get all participants from all rooms
    const { data: allParticipants, error: participantsError } = await supabase
      .from('country_chat_participants')
      .select('user_id, country_chat_id');
      
    if (participantsError) {
      error('[CleanupOldParticipants] Error fetching participants:', participantsError);
      return;
    }
    
    if (!allParticipants || allParticipants.length === 0) {
      log('[CleanupOldParticipants] No participants found to clean up');
      return;
    }
    
    // Get unique user IDs
    const uniqueUserIds = [...new Set(allParticipants.map(p => p.user_id))];
    log(`[CleanupOldParticipants] Checking ${uniqueUserIds.length} unique users across ${allParticipants.length} participant records`);
    
    // Get profiles to check last_active times
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, last_active')
      .in('id', uniqueUserIds);
      
    if (profilesError) {
      error('[CleanupOldParticipants] Error fetching profiles:', profilesError);
      return;
    }
    
    if (!profiles) {
      log('[CleanupOldParticipants] No profiles found');
      return;
    }
    
    // Find users who haven't been active in the last 24 hours
    const inactiveUserIds = profiles
      .filter(profile => {
        if (!profile.last_active) return true; // No last_active means very old
        const lastActive = new Date(profile.last_active);
        return lastActive < cleanupCutoff;
      })
      .map(profile => profile.id);
      
    if (inactiveUserIds.length === 0) {
      log('[CleanupOldParticipants] No inactive users found to clean up');
      return;
    }
    
    log(`[CleanupOldParticipants] Removing ${inactiveUserIds.length} inactive users from all chat rooms`);
    
    // Remove inactive participants from all rooms
    const { error: cleanupError } = await supabase
      .from('country_chat_participants')
      .delete()
      .in('user_id', inactiveUserIds);
      
    if (cleanupError) {
      error('[CleanupOldParticipants] Error during cleanup:', cleanupError);
    } else {
      log(`[CleanupOldParticipants] Successfully cleaned up ${inactiveUserIds.length} inactive participants`);
    }
    
  } catch (error) {
    error('[CleanupOldParticipants] Exception during cleanup:', error);
  }
};

/**
 * Delete a chat message (only if the user is the author)
 */
export const deleteMessage = async (
  messageId: string,
  userId: string
): Promise<boolean> => {
  try {
    log(`[Delete] Attempting to delete message ${messageId} by user ${userId}`);
    
    // Validate inputs
    if (!messageId || !userId) {
      error('[DeleteMessage] Missing messageId or userId');
      return false;
    }
    
    // Check if we have a valid UUID for user
    if (!isValidUuid(userId)) {
      error(`[DeleteMessage] Invalid UUID format for user '${userId}'`);
      return false;
    }
    
    // Validate message ID
    if (!isValidUuid(messageId)) {
      error(`[DeleteMessage] Invalid UUID format for message '${messageId}'`);
      return false;
    }
    
    // First verify the message exists and belongs to the user
    const { data: messageData, error: messageError } = await supabase
      .from('chat_messages')
      .select('id, user_id')
      .eq('id', messageId)
      .single();
    
    if (messageError) {
      error('[DeleteMessage] Error fetching message:', messageError);
      return false;
    }
    
    if (!messageData) {
      error(`[DeleteMessage] Message ${messageId} not found in database`);
      return false;
    }
    
    if (messageData.user_id !== userId) {
      error(`[DeleteMessage] User ${userId} is not the author of message ${messageId}`);
      return false;
    }
    
    // Delete the message with user authorization check
    const { data, error: deleteError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', userId) // Double-check only delete if user is the author
      .select(); // Return deleted rows to confirm deletion
    
    if (deleteError) {
      error('[DeleteMessage] Error deleting message:', deleteError);
      error('[DeleteMessage] Error details:', {
        code: deleteError.code,
        message: deleteError.message,
        details: deleteError.details,
        hint: deleteError.hint
      });
      return false;
    }
    
    // Check if any rows were actually deleted
    if (!data || data.length === 0) {
      error('[DeleteMessage] No message was deleted - database operation failed');
      return false;
    }
    
    // Also clean up any reactions to this message
    try {
      const { error: reactionError } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId);
      
      if (reactionError) {
        error('[DeleteMessage] Error cleaning up reactions:', reactionError);
        // Don't fail the whole operation just because reactions cleanup failed
      } else {
        log(`[DeleteMessage] Successfully cleaned up reactions for message ${messageId}`);
      }
    } catch (reactionError) {
      error('[DeleteMessage] Exception cleaning up reactions:', reactionError);
    }
    
    log(`[DeleteMessage] Successfully deleted message ${messageId}`);
    return true;
  } catch (error) {
    error('[DeleteMessage] Exception in deleteMessage:', error);
    return false;
  }
};

/**
 * Update a chat message (only if the user is the author)
 */
export const updateMessage = async (
  messageId: string,
  userId: string,
  newContent: string
): Promise<boolean> => {
  try {
    log(`[UpdateMessage] Attempting to update message ${messageId} by user ${userId}`);
    
    // Validate inputs
    if (!messageId || !userId || !newContent || !newContent.trim()) {
      error('[UpdateMessage] Missing messageId, userId, or newContent');
      return false;
    }
    
    // Check if we have a valid UUID for user
    if (!isValidUuid(userId)) {
      error(`[UpdateMessage] Invalid UUID format for user '${userId}'`);
      return false;
    }
    
    // Validate message ID
    if (!isValidUuid(messageId)) {
      error(`[UpdateMessage] Invalid UUID format for message '${messageId}'`);
      return false;
    }
    
    // First verify the message exists and belongs to the user
    const { data: messageData, error: messageError } = await supabase
      .from('chat_messages')
      .select('id, user_id')
      .eq('id', messageId)
      .single();
    
    if (messageError) {
      error('[UpdateMessage] Error fetching message:', messageError);
      return false;
    }
    
    if (!messageData) {
      error(`[UpdateMessage] Message ${messageId} not found in database`);
      return false;
    }
    
    if (messageData.user_id !== userId) {
      error(`[UpdateMessage] User ${userId} is not the author of message ${messageId}`);
      return false;
    }
    
    // Update the message content
    // Note: chat_messages table doesn't have updated_at column, only update content
    const { data, error: updateError } = await supabase
      .from('chat_messages')
      .update({ 
        content: newContent.trim()
      })
      .eq('id', messageId)
      .eq('user_id', userId) // Double-check only update if user is the author
      .select();
    
    if (updateError) {
      error('[UpdateMessage] Error updating message:', updateError);
      return false;
    }
    
    if (!data || data.length === 0) {
      error('[UpdateMessage] No message was updated - database operation failed');
      return false;
    }
    
    log(`[UpdateMessage] Successfully updated message ${messageId}`);
    return true;
  } catch (error) {
    error('[UpdateMessage] Exception in updateMessage:', error);
    return false;
  }
};

/**
 * Convert a country code to flag emoji
 */
export const countryCodeToFlag = (countryCode: string): string => {
  if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
    return '🌍'; // Default world emoji for invalid codes
  }
  
  // Convert country code to regional indicator symbols
  // Each letter is transformed into a regional indicator symbol by adding 127397 to its UTF-16 code
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
};

/**
 * Check if messages are bookmarked by a user
 */
export const checkBookmarkedMessages = async (
  userId: string,
  messageIds: string[]
): Promise<Record<string, boolean>> => {
  // Default result: all messages not bookmarked
  const result: Record<string, boolean> = messageIds.reduce((acc, id) => {
    acc[id] = false;
    return acc;
  }, {} as Record<string, boolean>);
  
  try {
    // Check if we have a valid UUID
    if (!isValidUuid(userId)) {
      log(`[CheckBookmarkedMessages] Warning: Invalid UUID format '${userId}', skipping database query`);
      return result;
    }
    
    if (messageIds.length === 0) {
      return result;
    }
    
    // Fetch bookmarks for this user matching the message IDs
    const { data, error } = await supabase
      .from('bookmarked_messages')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', messageIds);
    
    if (error) {
      error('Error checking bookmarked messages:', error);
      return result;
    }
    
    // Mark messages as bookmarked in the result object
    if (data && data.length > 0) {
      data.forEach(bookmark => {
        if (bookmark.message_id) {
          result[bookmark.message_id] = true;
        }
      });
    }
    
    return result;
  } catch (error) {
    error('Exception in checkBookmarkedMessages:', error);
    return result;
  }
};

/**
 * Get all bookmarked message IDs for a specific room
 */
export const getBookmarkedMessagesForRoom = async (
  userId: string,
  roomId: string
): Promise<string[]> => {
  try {
    // Check if we have a valid UUID for user
    if (!isValidUuid(userId)) {
      log(`[GetBookmarkedMessagesForRoom] Warning: Invalid UUID format '${userId}', skipping database query`);
      return [];
    }
    
    // Validate room ID
    if (!isValidUuid(roomId)) {
      error(`[GetBookmarkedMessagesForRoom] Error: Invalid room UUID format '${roomId}'`);
      return [];
    }
    
    // Fetch all bookmark IDs for the user in this room
    const { data, error } = await supabase
      .from('bookmarked_messages')
      .select('message_id')
      .eq('user_id', userId)
      .eq('room_id', roomId);
    
    if (error) {
      error('Error fetching bookmarked messages for room:', error);
      return [];
    }
    
    // Extract the message IDs
    return (data || []).map(bookmark => bookmark.message_id).filter(Boolean);
  } catch (error) {
    error('Exception in getBookmarkedMessagesForRoom:', error);
    return [];
  }
};

/**
 * Add a reaction to a message
 */
export const addReaction = async (
  messageId: string,
  userId: string,
  emoji: string
): Promise<boolean> => {
  try {
    // Check if we have a valid UUID for user
    if (!isValidUuid(userId)) {
      log(`[AddReaction] Warning: Invalid UUID format '${userId}', skipping database operation`);
      return false;
    }
    
    // Validate message ID
    if (!isValidUuid(messageId)) {
      error(`[AddReaction] Error: Invalid message UUID format '${messageId}'`);
      return false;
    }
    
    // Check if the reaction already exists
    const { data: existingReaction, error: checkError } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .maybeSingle();
    
    if (checkError) {
      error('Error checking existing reaction:', checkError);
      return false;
    }
    
    // If already exists, return true
    if (existingReaction) {
      return true;
    }

    // Check if the user has any other reactions on this message
    const { data: userReactions, error: userReactionsError } = await supabase
      .from('message_reactions')
      .select('id, emoji')
      .eq('message_id', messageId)
      .eq('user_id', userId);
    
    if (userReactionsError) {
      error('Error checking user reactions:', userReactionsError);
      return false;
    }

    // If user has other reactions, remove them first
    if (userReactions && userReactions.length > 0) {
      log(`[AddReaction] User ${userId} already has ${userReactions.length} reactions on message ${messageId}, removing them first`);
      
      const { error: deleteError } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId);
      
      if (deleteError) {
        error('Error removing existing reactions:', deleteError);
        return false;
      }
    }
    
    // Add the new reaction
    const { error } = await supabase
      .from('message_reactions')
      .insert({
        message_id: messageId,
        user_id: userId,
        emoji: emoji
      });
    
    if (error) {
      error('Error adding reaction:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    error('Exception in addReaction:', error);
    return false;
  }
};

/**
 * Remove a reaction from a message
 */
export const removeReaction = async (
  messageId: string,
  userId: string,
  emoji: string
): Promise<boolean> => {
  try {
    // Check if we have a valid UUID for user
    if (!isValidUuid(userId)) {
      log(`[RemoveReaction] Warning: Invalid UUID format '${userId}', skipping database operation`);
      return false;
    }
    
    // Validate message ID
    if (!isValidUuid(messageId)) {
      error(`[RemoveReaction] Error: Invalid message UUID format '${messageId}'`);
      return false;
    }
    
    // Remove the reaction
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji);
    
    if (error) {
      error('Error removing reaction:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    error('Exception in removeReaction:', error);
    return false;
  }
};

/**
 * Get reactions for a message
 */
export const getMessageReactions = async (
  messageId: string
): Promise<MessageReaction[]> => {
  try {
    if (!messageId) {
      error('Invalid messageId for getMessageReactions');
      return [];
    }
    
    // Validate message ID
    if (!isValidUuid(messageId)) {
      error(`[GetMessageReactions] Error: Invalid message UUID format '${messageId}'`);
      return [];
    }

    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', messageId);

    if (error) {
      error('Error getting message reactions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    error('Exception in getMessageReactions:', error);
    return [];
  }
};

/**
 * Fetch interest-based chat rooms
 */
export const fetchInterestChatRooms = async (userId?: string): Promise<ChatRoom[]> => {
  try {
    log(`Fetching interest-based chat rooms...`);
    
    // Get current user if userId not provided
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    }
    
    // Fetch interest rooms from database
    const { data, error } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('is_interest_based', true)
      .order('name');
    
    if (error) {
      error('Error fetching interest chat rooms:', error);
      return [];
    }
    
    // If no user is logged in, return rooms without favorite info
    if (!userId) {
      log(`Found ${data?.length || 0} interest rooms`);
      return data || [];
    }
    
    // Fetch user's favorites
    const { data: favorites, error: favoritesError } = await supabase
      .from('favorite_countries')
      .select('country_id')
      .eq('user_id', userId);
    
    if (favoritesError) {
      error('Error fetching favorites for interest rooms:', favoritesError);
      return data || [];
    }
    
    // Create a set of favorite country IDs for quick lookup
    const favoriteCountryIds = new Set(favorites?.map(fav => fav.country_id) || []);
    
    // Mark favorite rooms and sort them to the top
    const roomsWithFavorites = (data || []).map(room => ({
      ...room,
      isFavorite: favoriteCountryIds.has(room.id)
    }));
    
    // Sort favorites to the top, then by country name
    const sortedRooms = roomsWithFavorites.sort((a, b) => {
      // First by favorite status (favorites first)
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      
      // Then alphabetically by country name
      return (a.name || '').localeCompare(b.name || '');
    });
    
    log(`Found ${sortedRooms.length} interest rooms, including ${favorites?.length || 0} favorites`);
    return sortedRooms;
  } catch (error) {
    error('Exception in fetchInterestChatRooms:', error);
    return [];
  }
};

// Helper function to validate UUID format
const isValidUuid = (id: string): boolean => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Helper function to get a safe ID for presence (real UUID or temporary ID)
const getSafePresenceId = (userId: string): string => {
  if (isValidUuid(userId)) return userId;
  // Generate a more unique temporary ID that includes timestamp
  return `temp-${userId.replace(/[^a-z0-9]/gi, '')}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Subscribe to favorite changes in real-time
 * @param userId User ID to track favorites for
 * @param callback Function to call when favorites change
 * @returns Supabase channel that can be used to unsubscribe
 */
export const subscribeToFavorites = (
  userId: string,
  callback: () => void
) => {
  if (!userId) {
    error('[SubscribeToFavorites] Missing userId');
    return null;
  }

  try {
    log(`[SubscribeToFavorites] Setting up subscription for user ${userId}`);
    
    // Create a channel with a unique name
    const channelName = `favorites:${userId}`;
    const channel = supabase.channel(channelName);
    
    // Subscribe to all changes for the user's favorites
    channel
      .on('postgres_changes', {
        event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'favorite_countries',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        log('[SubscribeToFavorites] Favorites changed:', payload);
        
        // Call the callback to refresh favorites
        if (callback) {
          callback();
        }
      })
      .subscribe((status) => {
        log(`[SubscribeToFavorites] Subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          log('[SubscribeToFavorites] Successfully subscribed to favorites changes');
        } else if (status === 'CHANNEL_ERROR') {
          error('[SubscribeToFavorites] Error subscribing to favorites changes');
        }
      });
    
    return channel;
  } catch (error) {
    error('[SubscribeToFavorites] Exception:', error);
    return null;
  }
};







 