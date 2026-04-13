import React, { useEffect, useState, useRef } from 'react';
import { AppState, Platform, Keyboard } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import CallOverlay from './CallOverlay';
import CallWaitingModal from './CallWaitingModal';
// Background call handler removed - using Expo notifications instead
import { useRouter, usePathname } from 'expo-router';
import { badgeCounter } from '../utils/badgeCounter';
import { log, warn, error } from '../utils/productionLogger';


/**
 * GlobalCallManager - Manages all call-related functionality
 * This component handles:
 * - Background call notifications
 * - Full-screen call overlays
 * - Call state management
 * - Notification responses
 */
export default function GlobalCallManager() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [showCallOverlay, setShowCallOverlay] = useState(false);
  const [currentActiveCall, setCurrentActiveCall] = useState<any>(null);
  const [showCallWaiting, setShowCallWaiting] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  
  // Refs for cleanup
  const callSubscriptionRef = useRef<any>(null);
  const notificationResponseRef = useRef<any>(null);
  const appStateRef = useRef<any>(null);

  useEffect(() => {
    if (!user) {
      log('📞 GlobalCallManager: No user, skipping setup');
      return;
    }

    log('📞 GlobalCallManager: Setting up for user:', user.id);
    
    // Background call handling removed - using Expo notifications instead
    log('✅ Background call handling would be initialized via Expo notifications');

    // Set up call notification subscription
    setupCallSubscription();
    
    // Set up notification response listener
    setupNotificationResponseListener();
    
    // Set up app state listener
    setupAppStateListener();

    return () => {
      cleanup();
    };
  }, [user]);

  const setupCallSubscription = () => {
    if (!user) return;

    log('📞 Setting up call subscription for user:', user.id);

    callSubscriptionRef.current = supabase
      .channel('call_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          log('📞 New call notification received:', payload.new);
          handleIncomingCall(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          log('📞 Call status updated:', payload.new);
          handleCallStatusUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log('📞 Call subscription active');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Only log once to prevent spam - errors are already silenced by error interceptor
          warn('📞 Call subscription failed, using fallback:', status);
        } else {
        log('📞 Call subscription status:', status);
        }
      });
  };

  const setupNotificationResponseListener = () => {
    notificationResponseRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        log('📞 Notification response received:', response);
        log('📞 Notification response would be handled via Expo notifications');
        
        // If it's a call notification, handle the response
        const callData = response.notification.request.content.data;
        if (callData && callData.type === 'incoming_call') {
          handleNotificationCallResponse(response, callData);
        }
      }
    );
  };

  const setupAppStateListener = () => {
    appStateRef.current = AppState.addEventListener('change', (nextAppState) => {
      log('📞 App state changed:', appState, '->', nextAppState);
      setAppState(nextAppState);
      
      // If app becomes active and there's an incoming call, show overlay
      if (nextAppState === 'active' && incomingCall) {
        setShowCallOverlay(true);
      }
    });
  };

  // Check if user is currently in an active call
  // This checks both database status, recent call activity, and if user is on call screen
  const checkActiveCall = async (): Promise<any> => {
    if (!user) return null;
    
    // First check: If user is on the video call screen, they're definitely in a call
    const isOnCallScreen = pathname === '/chat/video-call';
    if (isOnCallScreen) {
      log('[GlobalCallManager] User is on call screen - checking for active call in database');
    }
    
    try {
      // Check for calls with status 'accepted' OR 'pending' (in case call is still being set up)
      // Also check calls from the last 10 minutes to catch recently started calls
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('call_notifications')
        .select('id, caller_name, call_type, channel_id, caller_id, recipient_id, status, created_at')
        .or(`caller_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .in('status', ['accepted', 'pending'])
        .gte('created_at', tenMinutesAgo) // Check recent calls (last 10 minutes)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        error('[GlobalCallManager] Error checking active call:', error);
        return null;
      }

      if (data) {
        log('[GlobalCallManager] ✅ Found active call:', data.id, 'status:', data.status, 'isOnCallScreen:', isOnCallScreen);
        return data;
      } else {
        // If user is on call screen but no call found in DB, still consider them in a call
        // (might be a timing issue where call hasn't been saved yet)
        if (isOnCallScreen) {
          log('[GlobalCallManager] ⚠️ User is on call screen but no active call found in DB - assuming call is active');
          // Return a placeholder to indicate user is in a call
          return { id: 'on-call-screen', status: 'accepted', isOnCallScreen: true };
        }
        log('[GlobalCallManager] No active call found');
        return null;
      }
    } catch (error) {
      error('[GlobalCallManager] Error in checkActiveCall:', error);
      // If user is on call screen, still return a placeholder
      if (isOnCallScreen) {
        return { id: 'on-call-screen', status: 'accepted', isOnCallScreen: true };
      }
      return null;
    }
  };

  const handleIncomingCall = async (callData: any) => {
    if (!user) {
      log('📞 GlobalCallManager: No user, skipping incoming call handling');
      return;
    }
    log('🔍 [INCOMING CALL DEBUG] Raw call data:', callData);
    log('🔍 [INCOMING CALL DEBUG] sender_id:', callData.sender_id);
    log('🔍 [INCOMING CALL DEBUG] caller_id:', callData.caller_id);

    // Prevent processing duplicate calls
    if (callData.id === incomingCall?.id) {
      log('🔍 [INCOMING CALL DEBUG] Duplicate call ID received, ignoring:', callData.id);
      return;
    }

    // Check if user is already in a call
    const activeCall = await checkActiveCall();
    if (activeCall && activeCall.id !== callData.id) {
      log('📞 [CALL WAITING] User is already in a call:', activeCall.id);
      setCurrentActiveCall(activeCall);
    } else {
      setCurrentActiveCall(null);
    }

    try {
      // Use caller_id instead of sender_id (sender_id might be undefined)
      const callerId = callData.caller_id || callData.sender_id;
      
      if (!callerId) {
        error('❌ No caller_id or sender_id found in call data:', callData);
        return;
      }

      // Fetch sender profile to get full name and avatar
      const { data: senderProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', callerId)
        .single();

      if (profileError || !senderProfile) {
        error('❌ Error fetching sender profile:', profileError);
        return;
      }

      const callerName = senderProfile.full_name || 'Unknown Caller';
      const callerAvatar = senderProfile.avatar_url;

      const enrichedCallData = {
        ...callData,
        caller_name: callerName,
        caller_avatar: callerAvatar
      };

      log('🔍 [INCOMING CALL DEBUG] Final enriched call data:', enrichedCallData);

      // Foreground vs background behavior for calls
      if (appState === 'active') {
        // Re-check active call right before showing UI to ensure we have latest state
        const latestActiveCall = await checkActiveCall();
        const hasActiveCall = latestActiveCall && latestActiveCall.id !== callData.id;
        
        log('[GlobalCallManager] 📞 Active call check before showing UI:', {
          hasActiveCall,
          activeCallId: latestActiveCall?.id,
          incomingCallId: callData.id,
          activeCallStatus: latestActiveCall?.status,
          isOnCallScreen: pathname === '/chat/video-call',
          pathname
        });
        
        // Dismiss keyboard when call comes in so user can interact with call buttons
        Keyboard.dismiss();
        
        if (hasActiveCall) {
          // User is already in a call - show call waiting modal
          log('[GlobalCallManager] 📞 User is in a call - showing call waiting modal');
          setCurrentActiveCall(latestActiveCall);
          setIncomingCall(enrichedCallData);
          setShowCallWaiting(true);
        } else {
          // No active call - show regular call overlay
          log('[GlobalCallManager] App in foreground - showing in-app call overlay');
          setIncomingCall(enrichedCallData);
          setShowCallOverlay(true);
        }
      } else {
        // Background: update badge only (system push handled elsewhere)
        log('[GlobalCallManager] App in background - badge updated, system notification will show');
        try {
          await badgeCounter.updateBadgeCount();
          log('[GlobalCallManager] Badge count updated for incoming call (background)');
        } catch (badgeError) {
          error('[GlobalCallManager] Error updating badge count (background):', badgeError);
        }
      }

    } catch (error) {
      error('❌ Error handling incoming call:', error);
    }
  };

  const handleCallStatusUpdate = async (callData: any) => {
    log('📞 Call status updated:', callData.status);
    
    if (callData.status === 'accepted' || callData.status === 'rejected' || callData.status === 'ended') {
      // Foreground vs background cleanup
      if (appState === 'active') {
        // App open: clear in-app overlay/state
        log('📞 Clearing call state after status update (foreground):', callData.status);
        clearCallState();
      } else {
        // Background: update badge only and let system notification be dismissed
        try {
          await badgeCounter.updateBadgeCount();
          log('[GlobalCallManager] Badge count updated after call status update (background)');
        } catch (badgeError) {
          error('[GlobalCallManager] Error updating badge count after call status update (background):', badgeError);
        }
        Notifications.dismissAllNotificationsAsync();
      }
    }
  };

  // Clear all call-related state
  const clearCallState = () => {
    log('📞 Clearing all call state');
    setShowCallOverlay(false);
    setShowCallWaiting(false);
    setIncomingCall(null);
    setCurrentActiveCall(null);
    log('📞 Call vibration would be stopped via Expo notifications');
    
    // Clear any pending notifications
    Notifications.dismissAllNotificationsAsync();
  };

  // Handle accepting new call while on another call (put current on hold)
  const handleAcceptWithHold = async () => {
    if (!incomingCall) return;
    
    try {
      // Update incoming call status to accepted
      const { error } = await supabase
        .from('call_notifications')
        .update({ 
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', incomingCall.id);

      if (error) {
        error('Error accepting call:', error);
        return;
      }

      // Put current call on hold (update status to 'on_hold' if that status exists, or keep as accepted)
      // For now, we'll navigate to the new call and let the user switch back
      log('📞 Accepting new call, current call will be on hold');
      
      // Navigate to new call
      router.push({
        pathname: '/chat/video-call',
        params: {
          id: incomingCall.channel_id || incomingCall.id,
          name: incomingCall.caller_name || 'Unknown',
          callType: incomingCall.call_type,
          isIncoming: 'true',
          timestamp: Date.now().toString(),
        }
      });

      clearCallState();
    } catch (error) {
      error('Error accepting call with hold:', error);
    }
  };

  // Handle ending current call and accepting new one
  const handleEndAndAccept = async () => {
    if (!incomingCall || !currentActiveCall) return;
    
    try {
      // End current call (skip if it's a placeholder)
      if (currentActiveCall.id !== 'on-call-screen' && !currentActiveCall.isOnCallScreen) {
        const { error: endError } = await supabase
          .from('call_notifications')
          .update({ 
            status: 'ended',
            updated_at: new Date().toISOString()
          })
          .eq('id', currentActiveCall.id);

        if (endError) {
          error('Error ending current call:', endError);
        }
      } else {
        log('[GlobalCallManager] Current call is placeholder (user on call screen) - skipping DB update');
      }

      // Accept new call
      const { error: acceptError } = await supabase
        .from('call_notifications')
        .update({ 
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', incomingCall.id);

      if (acceptError) {
        error('Error accepting new call:', acceptError);
        return;
      }

      // Navigate to new call
      router.push({
        pathname: '/chat/video-call',
        params: {
          id: incomingCall.channel_id || incomingCall.id,
          name: incomingCall.caller_name || 'Unknown',
          callType: incomingCall.call_type,
          isIncoming: 'true',
          timestamp: Date.now().toString(),
        }
      });

      clearCallState();
    } catch (error) {
      error('Error ending and accepting call:', error);
    }
  };

  const handleNotificationCallResponse = async (response: any, callData: any) => {
    try {
      log('📞 Handling notification call response:', response.actionIdentifier);
      
      switch (response.actionIdentifier) {
        case 'ANSWER_CALL':
        case Notifications.DEFAULT_ACTION_IDENTIFIER:
          // Navigate to call screen
          router.push({
            pathname: '/chat/video-call',
            params: {
              id: callData.channelId,
              name: callData.callerName,
              callType: callData.callType,
              isIncoming: 'true'
            }
          });
          break;
        case 'REJECT_CALL':
          // Call is already rejected by the background handler
          break;
      }
      
      // Clear the overlay
      clearCallState();
      
    } catch (error) {
      error('❌ Error handling notification call response:', error);
    }
  };

  const handleAnswer = async () => {
    log('📞 Call answered from overlay');
    if (incomingCall) {
      // Update call status
      await supabase
        .from('call_notifications')
        .update({
          status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', incomingCall.id);
      
      // Navigate to call screen
      router.push({
        pathname: '/chat/video-call',
        params: {
          id: incomingCall.channel_id || incomingCall.id,
          name: incomingCall.caller_name,
          callType: incomingCall.call_type,
          isIncoming: 'true',
        },
      });
    }
    clearCallState();
  };

  const handleReject = async () => {
    log('📞 Call rejected from overlay');
    if (incomingCall) {
      // Update call status
      await supabase
        .from('call_notifications')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', incomingCall.id);
    }
    clearCallState();
  };

  const handleClose = () => {
    log('📞 Call overlay closed');
    clearCallState();
  };

  const cleanup = () => {
    log('📞 GlobalCallManager: Cleaning up...');
    
    // Clear any active call state
    clearCallState();
    
    // Unsubscribe from call notifications
    if (callSubscriptionRef.current) {
      callSubscriptionRef.current.unsubscribe();
      callSubscriptionRef.current = null;
    }
    
    // Remove notification response listener
    if (notificationResponseRef.current) {
      notificationResponseRef.current.remove();
      notificationResponseRef.current = null;
    }
    
    // Remove app state listener
    if (appStateRef.current) {
      appStateRef.current.remove();
      appStateRef.current = null;
    }
    
    // Cleanup background call handling
    log('📞 Background call handling would be cleaned up via Expo notifications');
  };

  return (
    <>
      {/* Incoming call answer UI disabled intentionally.
      <CallOverlay
        visible={showCallOverlay}
        callData={incomingCall}
        onAnswer={handleAnswer}
        onReject={handleReject}
        onClose={handleClose}
      />
      
      <CallWaitingModal
        visible={showCallWaiting}
        incomingCall={incomingCall}
        currentCall={currentActiveCall}
        onAccept={handleAcceptWithHold}
        onReject={handleReject}
        onEndAndAccept={handleEndAndAccept}
        onClose={handleClose}
      />
      */}
    </>
  );
}
