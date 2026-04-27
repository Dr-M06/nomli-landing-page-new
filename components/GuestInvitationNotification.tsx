import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, X, Sparkles } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { log, warn, error } from '../utils/productionLogger';
import {
  LiveStreamInvitation,
  acceptGuestInvitation,
  declineGuestInvitation,
} from '../utils/guestService';

const { width } = Dimensions.get('window');

interface GuestInvitationNotificationProps {
  invitation: LiveStreamInvitation;
  onAccept: () => void;
  onDecline: () => void;
  onExpire: () => void;
}

export default function GuestInvitationNotification({
  invitation,
  onAccept,
  onDecline,
  onExpire,
}: GuestInvitationNotificationProps) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (__DEV__) {
      log('[GuestInvitationNotification] mounted:', invitation?.id, !!invitation?.host_profile, !!invitation?.stream);
    }
  }, [invitation]);

  useEffect(() => {
    // Sleek slide-in with scale animation
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle pulse animation for the video icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Shimmer effect for premium feel
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Glow pulse for the join button
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Calculate time left
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const expiresAt = new Date(invitation.expires_at).getTime();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0) {
        onExpire();
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [invitation.expires_at]);

  const handleAccept = async () => {
    setLoading(true);
    const result = await acceptGuestInvitation(invitation.id);
    setLoading(false);

    if (result.success) {
      onAccept();
    } else {
      // Only show user-friendly errors, hide technical database errors
      const errorMessage = result.error || 'Failed to accept invitation';
      if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint') || errorMessage.includes('unique_active_guest')) {
        // User is already a guest, treat as success
        log('✅ [INVITATION] User already a guest, treating as success');
        onAccept();
      } else {
        // Show other errors that are user-friendly
        alert(errorMessage);
      }
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    const result = await declineGuestInvitation(invitation.id);
    setLoading(false);

    if (result.success) {
      onDecline();
    } else {
      alert(result.error || 'Failed to decline invitation');
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hostName = invitation.host_profile?.full_name || invitation.host_profile?.username || 'Someone';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim }
          ],
        },
      ]}
    >
      {/* Premium glassmorphic card */}
      <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
        {/* Gradient border effect */}
        <LinearGradient
          colors={['rgba(0, 217, 255, 0.3)', 'rgba(255, 59, 255, 0.2)', 'rgba(0, 217, 255, 0.3)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        />
        
        {/* Animated shimmer overlay */}
        <Animated.View
          style={[
            styles.shimmerOverlay,
            {
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.15, 0],
              }),
              transform: [
                {
                  translateX: shimmerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-width, width],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255, 255, 255, 0.3)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>

        <View style={styles.content}>
          {/* Enhanced header with gradient avatar ring */}
          <View style={styles.header}>
            <View style={styles.avatarContainer}>
              {/* Gradient ring around avatar */}
              <LinearGradient
                colors={['#00D9FF', '#FF3BFF', '#00D9FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGradientRing}
              />
              <Image
                source={{
                  uri: invitation.host_profile?.avatar_url || 'https://via.placeholder.com/36',
                }}
                style={styles.avatar}
                contentFit="cover"
              />
              {/* Pulsing live indicator */}
              <Animated.View
                style={[
                  styles.liveIndicator,
                  {
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ]}
              >
                <LinearGradient
                  colors={['#FF3B30', '#FF0080']}
                  style={styles.liveIndicatorGradient}
                >
                  <View style={styles.liveDot} />
                </LinearGradient>
              </Animated.View>
            </View>
            
            <View style={styles.textContainer}>
              <View style={styles.nameRow}>
                <Text style={styles.hostName} numberOfLines={1}>
                  {hostName}
                </Text>
                <Sparkles size={12} color="#FFD700" fill="#FFD700" strokeWidth={2} />
              </View>
              <Text style={styles.inviteText} numberOfLines={1}>
                wants you to join live
              </Text>
            </View>

            {/* Premium timer badge */}
            <View style={styles.timerBadge}>
              <LinearGradient
                colors={['rgba(0, 217, 255, 0.2)', 'rgba(0, 150, 255, 0.2)']}
                style={styles.timerBadgeGradient}
              >
                <Text style={styles.timer}>{formatTime(timeLeft)}</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Premium action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={handleDecline}
              disabled={loading}
              activeOpacity={0.7}
            >
              <X size={16} color="rgba(255, 255, 255, 0.8)" strokeWidth={2.5} />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.acceptButtonContainer}
              onPress={handleAccept}
              disabled={loading}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#00D9FF', '#0096FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.acceptButton}
              >
                {/* Animated glow effect */}
                <Animated.View
                  style={[
                    styles.buttonGlow,
                    {
                      opacity: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 0.7],
                      }),
                    },
                  ]}
                />
                <Video size={16} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
                <Text style={styles.acceptText}>Join Live</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10000,
    maxWidth: width - 32,
  },
  blurContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  gradientBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width * 0.5,
    height: '100%',
    zIndex: 1,
  },
  shimmerGradient: {
    flex: 1,
  },
  content: {
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    margin: 1, // Space for gradient border
    borderRadius: 19,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatarGradientRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 22,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2.5,
    borderColor: 'rgba(10, 10, 15, 0.95)',
  },
  liveIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(10, 10, 15, 0.95)',
    overflow: 'hidden',
  },
  liveIndicatorGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  textContainer: {
    flex: 1,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  hostName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  inviteText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  timerBadge: {
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  timerBadgeGradient: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.3)',
  },
  timer: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00D9FF',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  declineButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  acceptButtonContainer: {
    flex: 1,
    borderRadius: 21,
    overflow: 'hidden',
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    gap: 6,
    paddingHorizontal: 16,
    position: 'relative',
  },
  buttonGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  acceptText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

