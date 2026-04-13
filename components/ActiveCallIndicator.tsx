import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Phone, Video, X } from 'lucide-react-native';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FAB_SIZE = 64;
const FAB_RADIUS = FAB_SIZE / 2;

/**
 * ActiveCallIndicator - Draggable FAB for minimized calls
 * Shows when a call is active but the user is on a different screen
 */
export default function ActiveCallIndicator() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [activeCall, setActiveCall] = useState<{
    id: string;
    caller_name: string;
    call_type: 'audio' | 'video';
    channel_id: string;
  } | null>(null);
  
  const [callDuration, setCallDuration] = useState(0);

  // Don't show indicator if we're already on the video call screen
  const isOnCallScreen = pathname === '/chat/video-call';
  
  // Position for draggable FAB
  const translateX = useSharedValue(SCREEN_WIDTH - FAB_SIZE - 20);
  const translateY = useSharedValue(SCREEN_HEIGHT / 2 - FAB_RADIUS);
  
  // Animation values for premium effects
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const tooltipOpacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  
  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!user?.id) return;

    // Check for active calls - only show for 'accepted' status
    const checkActiveCall = async () => {
      try {
        const { data, error } = await supabase
          .from('call_notifications')
          .select('id, caller_name, call_type, channel_id, caller_id, recipient_id, status')
          .eq('status', 'accepted') // Only accepted calls are truly active
          .or(`caller_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          error('[ActiveCallIndicator] Error checking active call:', error);
          return;
        }

        if (data && data.status === 'accepted') {
          log('[ActiveCallIndicator] Active call found:', data.id);
          setActiveCall({
            id: data.id,
            caller_name: data.caller_name || 'Unknown',
            call_type: data.call_type as 'audio' | 'video',
            channel_id: data.channel_id
          });
        } else {
          log('[ActiveCallIndicator] No active call');
          setActiveCall(null);
        }
      } catch (error) {
        error('[ActiveCallIndicator] Error in checkActiveCall:', error);
        setActiveCall(null);
      }
    };

    // Check initially
    checkActiveCall();

    // Subscribe to call status changes for this user
    const subscription = supabase
      .channel(`active-call-indicator-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_notifications',
        },
        (payload) => {
          log('[ActiveCallIndicator] Call status changed:', payload);
          // Check if this update involves the current user
          const record = payload.new || payload.old;
          if (record && (record.caller_id === user.id || record.recipient_id === user.id)) {
            checkActiveCall();
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  // Update call duration
  useEffect(() => {
    if (!activeCall) return;
    
    const startTime = Date.now();
    const interval = setInterval(() => {
      // Calculate duration (simplified - in real app, get from call state)
      setCallDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [activeCall]);

  // Premium entrance animation
  useEffect(() => {
    if (activeCall) {
      // Fade in and scale up
      opacity.value = withDelay(100, withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }));
      scale.value = withDelay(100, withSpring(1, { damping: 15, stiffness: 200 }));
      
      // Show tooltip after FAB appears
      tooltipOpacity.value = withDelay(300, withTiming(1, { duration: 300 }));
      
      // Subtle breathing pulse animation
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 2000, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
          withTiming(1, { duration: 2000, easing: Easing.bezier(0.4, 0, 0.2, 1) })
        ),
        -1,
        false
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(0.8, { duration: 200 });
      tooltipOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [activeCall]);

  // Drag gesture
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Constrain to screen bounds
      const maxX = SCREEN_WIDTH - FAB_SIZE;
      const maxY = SCREEN_HEIGHT - FAB_SIZE - insets.bottom;
      
      translateX.value = Math.max(0, Math.min(maxX, e.absoluteX - FAB_RADIUS));
      translateY.value = Math.max(insets.top, Math.min(maxY, e.absoluteY - FAB_RADIUS));
    })
    .onEnd((e) => {
      // Snap to nearest edge
      const centerX = SCREEN_WIDTH / 2;
      const finalX = translateX.value < centerX ? 20 : SCREEN_WIDTH - FAB_SIZE - 20;
      
      translateX.value = withSpring(finalX, {
        damping: 20,
        stiffness: 300,
      });
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const fabPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const tooltipAnimatedStyle = useAnimatedStyle(() => ({
    opacity: tooltipOpacity.value,
    transform: [{ translateY: tooltipOpacity.value === 0 ? 10 : 0 }],
  }));

  // Don't render if no active call or if on call screen
  if (!activeCall || isOnCallScreen) {
    return null;
  }

  const handlePress = () => {
    // Navigate back to the call screen
    router.push({
      pathname: '/chat/video-call',
      params: {
        id: activeCall.channel_id,
        name: activeCall.caller_name,
        callType: activeCall.call_type,
        isIncoming: 'false',
        timestamp: Date.now().toString()
      }
    });
  };

  const handleEndCall = async () => {
    // End the call
    try {
      await supabase
        .from('call_notifications')
        .update({ status: 'ended' })
        .eq('id', activeCall.id);
      setActiveCall(null);
    } catch (error) {
      error('Error ending call:', error);
    }
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.fabContainer, animatedStyle]}>
        <Animated.View style={fabPulseStyle}>
          <TouchableOpacity
            style={styles.fab}
            onPress={handlePress}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={
                activeCall.call_type === 'video'
                  ? ['#10b981', '#059669']
                  : ['#3b82f6', '#2563eb']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradient}
            >
              {activeCall.call_type === 'video' ? (
                <Video size={26} color="white" strokeWidth={2.5} />
              ) : (
                <Phone size={26} color="white" strokeWidth={2.5} />
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
        
        {/* Call info tooltip with premium glassmorphic styling */}
        <Animated.View style={[styles.tooltip, tooltipAnimatedStyle]}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tooltipGradient}
          >
            <Text style={styles.tooltipName} numberOfLines={1}>
              {activeCall.caller_name}
            </Text>
            <Text style={styles.tooltipDuration}>
              {formatDuration(callDuration)}
            </Text>
          </LinearGradient>
        </Animated.View>
        
        {/* End call button with premium styling */}
        <TouchableOpacity
          style={styles.endCallButton}
          onPress={handleEndCall}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.endCallGradient}
          >
            <X size={14} color="white" strokeWidth={3} />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  gradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: FAB_RADIUS,
  },
  tooltip: {
    position: 'absolute',
    bottom: FAB_SIZE + 12,
    borderRadius: 16,
    minWidth: 120,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  tooltipGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  tooltipName: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  tooltipDuration: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  endCallButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  endCallGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
});

