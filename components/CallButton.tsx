import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert, View, Text, Modal, TouchableWithoutFeedback } from 'react-native';
import { Video, Phone, PhoneCall } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import useAuth from '../hooks/useAuth';
import { supabase } from '../utils/supabase';
import { getRecipientFromChatId } from '../utils/chatUtils';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { getUserDmPreference } from '../utils/privacySettings';
import { log, warn, error } from '../utils/productionLogger';



interface CallButtonProps {
  chatId: string;
  recipientName?: string;
}

export default function CallButton({ chatId, recipientName }: CallButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  // No popup menu; show direct audio/video buttons in header
  
  const initCall = async (callType: 'audio' | 'video') => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to make calls');
      return;
    }
    
    if (!chatId) {
      Alert.alert('Error', 'Invalid chat ID');
      return;
    }
    
    // Set loading state for the specific call type
    if (callType === 'audio') {
      setIsLoadingAudio(true);
    } else {
      setIsLoadingVideo(true);
    }
    // No menu to close
    
    // Clear any existing notifications and call state to prevent conflicts with new call
    log('📞 Clearing existing notifications and call state before initiating new call');
    try {
      await Notifications.dismissAllNotificationsAsync();
      
      // Clear profile cache to ensure we get fresh user data
      log('📞 Clearing profile cache to prevent cached user data conflicts');
      try {
        const { clearProfileCache } = await import('@/utils/chat');
        clearProfileCache(); // Clear all cached profiles
        log('📞 Profile cache cleared successfully');
      } catch (cacheError) {
        log('📞 Note: Could not clear profile cache:', cacheError);
      }
      
      // Clear conversation cache to ensure fresh chat data
      log('📞 Clearing conversation cache for chatId:', chatId);
      try {
        const { useChatStore } = await import('@/app/store/useChatStore');
        useChatStore.getState().clearConversationCache(chatId);
        log('📞 Conversation cache cleared successfully');
      } catch (storeError) {
        log('📞 Note: Could not clear conversation cache:', storeError);
      }
      
      // Also clear any pending call notifications from this user to prevent conflicts
      const { error: clearError } = await supabase
        .from('call_notifications')
        .update({ status: 'ended' })
        .eq('caller_id', user.id)
        .in('status', ['pending', 'connecting']);
        
      if (clearError) {
        log('📞 Note: Could not clear pending calls:', clearError);
      } else {
        log('📞 Cleared any pending calls from this user');
      }
    } catch (error) {
      log('📞 Note: Could not clear existing notifications/calls:', error);
    }
    
    try {
      // Get recipient ID from chat ID

      
      let recipientId = await getRecipientFromChatId(chatId, user.id);

      
      // Check: Make sure we're not calling ourselves!
      if (recipientId === user.id) {
        Alert.alert('Call Error', 'Cannot call yourself. Please check the recipient.');
        if (callType === 'audio') {
          setIsLoadingAudio(false);
        } else {
          setIsLoadingVideo(false);
        }
        return;
      }
      
      if (!recipientId) {
        // If we have a recipientName, we can try to find the user by name
        if (recipientName) {
          
          // Try to find user by name
          const { data: users, error: usersError } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .or(`full_name.ilike.%${recipientName}%,username.ilike.%${recipientName}%`)
            .neq('id', user.id) // Exclude current user from search
            .limit(1);
          
          if (users && users.length > 0) {
            recipientId = users[0].id;
            
            // Double check we're not selecting ourselves
            if (recipientId === user.id) {
              recipientId = null;
            }
          }
        }
        
        // If we still don't have a recipient, check if this is a group chat
        if (!recipientId && chatId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          // Check if this is a group chat
          const { data: chatData } = await supabase
            .from('chats')
            .select('name, type')
            .eq('id', chatId)
            .single();
            
          if (chatData && chatData.type === 'group') {
            Alert.alert(
              'Group Call',
              'Group calls are not supported in this version. Please use direct messages for calls.',
              [{ text: 'OK' }]
            );
            if (callType === 'audio') {
              setIsLoadingAudio(false);
            } else {
              setIsLoadingVideo(false);
            }
            return;
          }
        }
        
        // If we still don't have a recipient, ask the user to manually enter the recipient ID
        if (!recipientId) {
          Alert.alert(
            'Recipient Not Found',
            'Could not automatically determine the call recipient. Please check that you are in a direct chat.',
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => {
                  if (callType === 'audio') {
                    setIsLoadingAudio(false);
                  } else {
                    setIsLoadingVideo(false);
                  }
                }
              }
            ]
          );
          return;
        }
      }
      
      // Handle group chat format (group:Name)
      if (recipientId.startsWith('group:')) {
        Alert.alert(
          'Group Call',
          'Group calls are not supported in this version. Please use direct messages for calls.',
          [{ text: 'OK' }]
        );
        if (callType === 'audio') {
          setIsLoadingAudio(false);
        } else {
          setIsLoadingVideo(false);
        }
        return;
      }
      

      
      // Check if recipient allows DMs before initiating call
      const allowsDms = await getUserDmPreference(recipientId);
      
      if (!allowsDms) {
        Alert.alert(
          'Call Not Allowed',
          'This user has disabled direct messages and calls.',
          [{ text: 'OK' }]
        );
        if (callType === 'audio') {
          setIsLoadingAudio(false);
        } else {
          setIsLoadingVideo(false);
        }
        return;
      }
      
      // Get recipient's name for the call notification
      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', recipientId)
        .single();
        
      const recipientDisplayName = recipientProfile?.full_name || 
                                   recipientProfile?.username || 
                                   recipientName || 
                                   'User';
      
      // Get caller's profile information
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', user.id)
        .single();
      
      const callerName = callerProfile?.full_name || 
                         callerProfile?.username || 
                         user.user_metadata?.full_name || 
                         user.user_metadata?.username || 
                         'User';
      

      
      // Final safety check: Make sure we're not calling ourselves
      if (recipientId === user.id) {
        Alert.alert('Call Error', 'Cannot call yourself. There seems to be an issue with recipient detection.');
        if (callType === 'audio') {
          setIsLoadingAudio(false);
        } else {
          setIsLoadingVideo(false);
        }
        return;
      }
      
      // Create a call notification in the database

      const callNotificationData = {
        caller_id: user.id,
        recipient_id: recipientId,
        channel_id: chatId,
        caller_name: callerName,
        status: 'pending',
        call_type: callType // 'audio' or 'video'
      };

      const { data, error } = await supabase
        .from('call_notifications')
        .insert([callNotificationData])
        .select();
      

      
      if (error) {
        error('Error creating call notification:', error);
        
        // Check for specific error types
        if (error.message?.includes('policy') || error.message?.includes('permission denied')) {
          Alert.alert(
            'Call Not Allowed',
            'This user has disabled direct messages and calls.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', 'Failed to initiate call. Please try again.');
        }
        
        if (callType === 'audio') {
          setIsLoadingAudio(false);
        } else {
          setIsLoadingVideo(false);
        }
        return;
      }
      
      // Navigate to call screen with call type parameter
      
      // Use push to keep chat screen in the stack (WhatsApp-style)
      const navigationParams = { 
        id: chatId, 
        name: recipientDisplayName,
        callType: callType,
        isIncoming: 'false',
        // Add timestamp to force parameter refresh
        timestamp: Date.now().toString(),
        // Add return location for proper navigation back
        returnTo: `/chat/${chatId}`
      };
      


      // Use push so chat stays in stack and call appears as modal overlay
      router.push({
        pathname: '/chat/video-call',
        params: navigationParams
      });
    } catch (error) {
      error('Error initiating call:', error);
      
      // Check if this is a privacy-related error
      const errorMessage = error.message || '';
      if (
        errorMessage.includes('disabled direct messages') || 
        errorMessage.includes('PrivacyError') ||
        errorMessage.includes('permission denied') ||
        errorMessage.includes('policy')
      ) {
        Alert.alert(
          'Call Not Allowed',
          'This user has disabled direct messages and calls.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to initiate call. Please try again.');
      }
    } finally {
      if (callType === 'audio') {
        setIsLoadingAudio(false);
      } else {
        setIsLoadingVideo(false);
      }
    }
  };
  
  // Deprecated menu handlers removed
  
  return (
    <View style={styles.inlineContainer}>
      {/* Audio Call Button */}
      <TouchableOpacity
        onPress={() => initCall('audio')}
        disabled={isLoadingAudio || isLoadingVideo}
        accessibilityLabel="Start audio call"
        activeOpacity={0.8}
        style={{ marginRight: 6 }}
      >
        <LinearGradient
          colors={isDarkMode ? ['#00D9FF', '#0099CC'] : ['#00D9FF', '#00B8E6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientButton,
            {
              shadowColor: '#00D9FF',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 4,
            }
          ]}
        >
          {isLoadingAudio ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Phone size={16} color="#FFFFFF" strokeWidth={2.5} />
          )}
        </LinearGradient>
      </TouchableOpacity>

      {/* Video Call Button */}
      <TouchableOpacity
        onPress={() => initCall('video')}
        disabled={isLoadingAudio || isLoadingVideo}
        accessibilityLabel="Start video call"
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#A78BFA', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientButton,
            {
              shadowColor: '#A78BFA',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 4,
            }
          ]}
        >
          {isLoadingVideo ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Video size={16} color="#FFFFFF" strokeWidth={2.5} />
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  gradientButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    // Gradient provides the background color
  },
});