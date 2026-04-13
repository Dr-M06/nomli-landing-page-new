import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Video, Phone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import useAuth from '../hooks/useAuth';
import { supabase } from '../utils/supabase';
import { getRecipientFromChatId } from '../utils/chatUtils';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { getUserDmPreference } from '../utils/privacySettings';
import { log, warn, error } from '../utils/productionLogger';


interface VideoCallButtonProps {
  chatId: string;
  recipientName?: string;
}

export default function VideoCallButton({ chatId, recipientName }: VideoCallButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [isLoading, setIsLoading] = useState(false);
  
  const handlePress = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    
    try {
      log('[VideoCallButton - DETAILED DEBUG] ========== Starting handlePress ==========');
      log('[VideoCallButton - DETAILED DEBUG] Input parameters:', { chatId, recipientName });
      log('[VideoCallButton - DETAILED DEBUG] Current user:', user?.id);
      
      if (!user) {
        error('[VideoCallButton - DETAILED DEBUG] No user logged in');
        Alert.alert('Error', 'You must be logged in to make calls.');
        setIsLoading(false);
        return;
      }
      
      // Extract recipient ID from chat ID
      log('[VideoCallButton - DETAILED DEBUG] Extracting recipient ID from chatId:', chatId);
      const { getRecipientFromChatId } = await import('@/utils/chatUtils');
      let recipientId = await getRecipientFromChatId(chatId, user.id);
      log('[VideoCallButton - DETAILED DEBUG] Initial recipient ID from chatUtils:', recipientId);
      
      if (!recipientId) {
        warn('[VideoCallButton - DETAILED DEBUG] Could not determine recipient automatically. Asking user for recipient ID.');
        
        // If we have a recipientName, we can try to find the user by name
        if (recipientName) {
          log('[VideoCallButton - DETAILED DEBUG] Attempting to find recipient by name:', recipientName);
          
          // Try to find user by name
          const { data: users, error: usersError } = await supabase
            .from('profiles')
            .select('id')
            .or(`full_name.ilike.%${recipientName}%,username.ilike.%${recipientName}%`)
            .limit(1);
          
          log('[VideoCallButton - DETAILED DEBUG] Search by name result:', { users, usersError });
          
          if (users && users.length > 0) {
            recipientId = users[0].id;
            log('[VideoCallButton - DETAILED DEBUG] Found recipient by name:', recipientId);
          } else {
            error('[VideoCallButton - DETAILED DEBUG] Could not find recipient by name:', recipientName);
          }
        }
        
        // If we still don't have a recipient, check if this is a group chat
        if (!recipientId && chatId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          log('[VideoCallButton - DETAILED DEBUG] Checking if this is a group chat');
          // Check if this is a group chat
          const { data: chatData } = await supabase
            .from('chats')
            .select('name, type')
            .eq('id', chatId)
            .single();
            
          log('[VideoCallButton - DETAILED DEBUG] Chat data:', chatData);
            
          if (chatData && chatData.type === 'group') {
            log('[VideoCallButton - DETAILED DEBUG] This is a group chat, showing alert');
            Alert.alert(
              'Group Call',
              'Group calls are not supported in this version. Please use direct messages for calls.',
              [{ text: 'OK' }]
            );
            setIsLoading(false);
            return;
          }
        }
        
        // If we still don't have a recipient, ask the user to manually enter the recipient ID
        if (!recipientId) {
          error('[VideoCallButton - DETAILED DEBUG] Still no recipient ID found, showing error alert');
          Alert.alert(
            'Recipient Not Found',
            'Could not automatically determine the call recipient. Please check that you are in a direct chat.',
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => {
                  setIsLoading(false);
                }
              }
            ]
          );
          return;
        }
      }
      
      log('[VideoCallButton - DETAILED DEBUG] Final recipient ID:', recipientId);
      
      // Handle group chat format (group:Name)
      if (recipientId.startsWith('group:')) {
        log('[VideoCallButton - DETAILED DEBUG] Recipient ID is group format, showing alert');
        Alert.alert(
          'Group Call',
          'Group calls are not supported in this version. Please use direct messages for calls.',
          [{ text: 'OK' }]
        );
        setIsLoading(false);
        return;
      }
      
      log('[VideoCallButton - DETAILED DEBUG] Starting call with recipient:', recipientId);
      
      // Check if recipient allows DMs before initiating call
      log('[VideoCallButton - DETAILED DEBUG] Checking if recipient allows DMs:', recipientId);
      const { getUserDmPreference } = await import('@/utils/chat');
      const allowsDms = await getUserDmPreference(recipientId);
      log('[VideoCallButton - DETAILED DEBUG] Recipient DM preference:', allowsDms);
      
      if (!allowsDms) {
        log('[VideoCallButton - DETAILED DEBUG] Call blocked - recipient has disabled DMs:', recipientId);
        Alert.alert(
          'Call Not Allowed',
          'This user has disabled direct messages and calls.',
          [{ text: 'OK' }]
        );
        setIsLoading(false);
        return;
      }
      
      // Clear profile cache to ensure fresh data
      try {
        const { clearProfileCache } = await import('@/utils/chat');
        clearProfileCache(recipientId); // Clear cache for this specific recipient
        log('[VideoCallButton - DETAILED DEBUG] Cleared profile cache for recipient:', recipientId);
      } catch (importError) {
        error('[VideoCallButton - DETAILED DEBUG] Error importing clearProfileCache:', importError);
      }
      
      // Get recipient's name for the call notification
      log('[VideoCallButton - DETAILED DEBUG] Fetching profile for recipientId:', recipientId);
      const { data: recipientProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, full_name')
        .eq('id', recipientId)
        .single();
      
      log('[VideoCallButton - DETAILED DEBUG] Profile fetch result:', { recipientProfile, profileError });
        
      const recipientDisplayName = recipientProfile?.full_name || 
                                   recipientProfile?.username || 
                                   recipientName || 
                                   'User';
      
      log('[VideoCallButton - DETAILED DEBUG] Final recipientDisplayName for navigation:', recipientDisplayName);
      
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
      
      log('[VideoCallButton - DETAILED DEBUG] Caller name for notification:', callerName);
      
      // Create a call notification in the database
      const { error } = await supabase
        .from('call_notifications')
        .insert([{
          caller_id: user.id,
          recipient_id: recipientId,
          channel_id: chatId,
          caller_name: callerName,
          status: 'pending',
          call_type: 'video'
        }]);
      
      if (error) {
        error('[VideoCallButton - DETAILED DEBUG] Error creating call notification:', error);
        
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
        
        setIsLoading(false);
        return;
      }
      
      log('[VideoCallButton - DETAILED DEBUG] Call notification created successfully');
      log('[VideoCallButton - DETAILED DEBUG] About to navigate to video call with params:', {
        id: chatId,
        name: recipientDisplayName,
        callType: 'video'
      });
      
      // Navigate to video call screen with clean parameters
      // Use push so chat stays in stack and call appears as modal overlay (WhatsApp-style)
      
      router.push({
        pathname: '/chat/video-call',
        params: {
          id: chatId,
          name: recipientDisplayName,
          callType: 'video',
          isIncoming: 'false',
          timestamp: Date.now().toString(), // Force parameter refresh
          returnTo: `/chat/${chatId}` // Return location
        }
      });
      
      log('[VideoCallButton - DETAILED DEBUG] Navigation completed');
      
    } catch (error) {
      error('[VideoCallButton - DETAILED DEBUG] Error in handlePress:', error);
      error('[VideoCallButton - DETAILED DEBUG] Error stack:', error.stack);
      Alert.alert('Error', 'Failed to start call. Please try again.');
    } finally {
      log('[VideoCallButton - DETAILED DEBUG] Setting isLoading to false');
      setIsLoading(false);
      log('[VideoCallButton - DETAILED DEBUG] ========== Finished handlePress ==========');
    }
  };
  
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator color={themeColors.primary.main} size="small" />
      ) : (
        <Video size={24} color={themeColors.primary.main} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
}); 