import React, { forwardRef, useImperativeHandle, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Animated, StyleSheet, Alert, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import { useRouter } from 'expo-router';
import { log, warn, error } from '../utils/productionLogger';
import { getFloatingTabBarExtraAboveInset } from '../utils/tabBarInset';


const MAX_CONCURRENT_REACTIONS = 20; // Cap to avoid heavy UI when many hearts sent in burst
/** Keep bubbles on-screen (honk/applause scale up; need margin). */
const REACTION_EDGE_MARGIN = 40;
const REACTION_TAP_THROTTLE_MS = 120; // Min ms between reaction sends to reduce bubble/DB spam when viewer tap-spams

export interface FloatingReactionsRef {
  addHeart: (x: number) => void;
  addHonk: (x: number) => void;
  addApplause: (x: number) => void;
  addLaugh: (x: number) => void;
}

interface FloatingReactionsProps {
  streamId: string;
  onReactionSend?: (reaction: { type: string; x?: number }) => void;
}

interface ReactionAnimation {
  id: string;
  type: 'heart' | 'honk' | 'applause' | 'laugh';
  x: number;
  translateY: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  rotate: Animated.Value;
}

const FloatingReactions = forwardRef<FloatingReactionsRef, FloatingReactionsProps>(
  ({ streamId, onReactionSend }, ref) => {
    const { user } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: winW } = useWindowDimensions();
    const reactionSpawnBottom = 168 + getFloatingTabBarExtraAboveInset(insets.bottom);

    const clampReactionX = useCallback(
      (x: number) => {
        const w = Math.max(1, winW);
        return Math.max(REACTION_EDGE_MARGIN, Math.min(w - REACTION_EDGE_MARGIN, x));
      },
      [winW],
    );
    const [reactions, setReactions] = useState<ReactionAnimation[]>([]);
    const reactionIdCounter = useRef(0);
    const concurrentReactionsRef = useRef(0);
    const lastReactionTapTimeRef = useRef(0);

    const createReactionAnimation = useCallback((reactionId: string, type: 'heart' | 'honk' | 'applause' | 'laugh', x: number) => {
      if (concurrentReactionsRef.current >= MAX_CONCURRENT_REACTIONS) return; // Cap to avoid heavy bursts
      concurrentReactionsRef.current += 1;

      const cx = clampReactionX(x);

      const translateY = new Animated.Value(0);
      const opacity = new Animated.Value(1);
      const scale = new Animated.Value(0.8);
      const rotate = new Animated.Value(0);

      const newReaction: ReactionAnimation = {
        id: reactionId,
        type,
        x: cx,
        translateY,
        opacity,
        scale,
        rotate,
      };

      setReactions(prev => [...prev, newReaction]);

      // Different animation durations based on type (hearts smooth and steady)
      const duration = type === 'applause' ? 2200 : type === 'honk' ? 1800 : type === 'laugh' ? 2100 : 2000;
      const translateDistance = type === 'applause' ? -280 : type === 'honk' ? -220 : type === 'laugh' ? -250 : -240;

      // Start animations
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: translateDistance,
          duration,
          easing: type === 'heart' 
            ? require('react-native').Easing.out(require('react-native').Easing.cubic)
            : require('react-native').Easing.inOut(require('react-native').Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          // Smooth pop in with subtle bounce
          Animated.spring(scale, {
            toValue: type === 'honk' ? 1.8 : type === 'applause' ? 1.5 : type === 'laugh' ? 1.4 : 1.15,
            tension: type === 'heart' ? 80 : type === 'laugh' ? 90 : 80,
            friction: type === 'heart' ? 7 : type === 'laugh' ? 6 : 4, // Higher friction for smoother heart
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: type === 'honk' ? 1.2 : type === 'heart' ? 1 : type === 'laugh' ? 1.1 : 1,
            duration: type === 'honk' ? 150 : type === 'laugh' ? 300 : 400,
            easing: type === 'heart' ? require('react-native').Easing.bezier(0.25, 0.1, 0.25, 1) : undefined,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(opacity, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: type === 'honk' ? 0.5 : type === 'heart' ? 0.8 : type === 'laugh' ? 0.6 : 1,
          duration,
          easing: type === 'heart'
            ? require('react-native').Easing.inOut(require('react-native').Easing.ease)
            : type === 'laugh'
            ? require('react-native').Easing.inOut(require('react-native').Easing.ease)
            : undefined,
          useNativeDriver: true,
        }),
      ]).start(() => {
        concurrentReactionsRef.current = Math.max(0, concurrentReactionsRef.current - 1);
        setReactions(prev => prev.filter(reaction => reaction.id !== reactionId));
      });
    }, [clampReactionX]);

    // Subscribe to real-time reactions from all users
    useEffect(() => {
      if (!streamId) {
        warn('💖 Cannot set up reaction subscription - streamId is missing:', streamId);
        return;
      }

      if (__DEV__) log('💖 Setting up real-time reaction subscription for stream:', streamId, 'user:', user?.id);
      
      const handleReaction = (payload: any) => {
        const fromUserId = payload.new?.user_id;
        // Skip creating a second bubble for the sender – they already see the local animation
        if (fromUserId && user?.id && fromUserId === user.id) return;

        if (__DEV__) log('💖 Received new reaction:', payload.new, 'current user:', user?.id);

        const reactionType = payload.new.reaction_type;
        const rawX = payload.new.x_position ?? 50 + Math.random() * (Math.max(120, winW - 100));
        const x = clampReactionX(rawX);

        const reactionId = `remote_${payload.new.id}_${payload.new.user_id}_${Date.now()}`;

        if (__DEV__) log('💖 Creating animation for reaction:', reactionType, 'at x:', x, 'reactionId:', reactionId);
        if (reactionType === 'heart') {
          createReactionAnimation(reactionId, 'heart', x);
        } else if (reactionType === 'honk') {
          createReactionAnimation(reactionId, 'honk', x);
        } else if (reactionType === 'applause') {
          createReactionAnimation(reactionId, 'applause', x);
        } else if (reactionType === 'laugh') {
          createReactionAnimation(reactionId, 'laugh', x);
        }
      };

      let subscription: any;
      try {
        subscription = supabase
          .channel(`stream_reactions_${streamId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'live_stream_reactions',
              filter: `stream_id=eq.${streamId}`,
            },
            handleReaction
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              log('💖 ✅ Real-time reaction subscription active for stream:', streamId, 'user:', user?.id);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              warn('💖 ⚠️ Real-time subscription issue:', status, 'for stream:', streamId, 'user:', user?.id);
              // Try to resubscribe after a delay
              setTimeout(() => {
                log('💖 Attempting to resubscribe to reactions...');
                // The useEffect will re-run if streamId changes, but we can't force it here
                // The subscription should auto-retry
              }, 2000);
            } else {
              log('💖 Real-time subscription status:', status, 'for stream:', streamId, 'user:', user?.id);
            }
          });
      } catch (error) {
        error('💖 Error setting up real-time subscription:', error);
        return;
      }

      return () => {
        log('💖 Unsubscribing from reaction updates for stream:', streamId);
        if (subscription) {
          try {
            subscription.unsubscribe();
            supabase.removeChannel(subscription);
          } catch (error) {
            warn('💖 Error unsubscribing:', error);
          }
        }
      };
    }, [streamId, createReactionAnimation, clampReactionX, winW]);

    const addHeart = async (x: number) => {
      if (!user) {
        Alert.alert(
          'Login Required',
          'You need to login to react to live streams. Would you like to login now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Login', onPress: () => router.push('/auth/signin') }
          ]
        );
        return;
      }
      if (!streamId) {
        warn('💖 Cannot add heart: missing streamId');
        return;
      }

      const now = Date.now();
      if (now - lastReactionTapTimeRef.current < REACTION_TAP_THROTTLE_MS) {
        return; // Throttle rapid taps to reduce bubbles and DB writes
      }
      lastReactionTapTimeRef.current = now;

      const localReactionId = `local_${reactionIdCounter.current++}`;
      createReactionAnimation(localReactionId, 'heart', x);

      try {
        // Try to save reaction with x_position first
        let insertData: any = {
          stream_id: streamId,
          user_id: user.id,
          reaction_type: 'heart',
          x_position: x,
        };

        let { data, error } = await supabase
          .from('live_stream_reactions')
          .insert(insertData)
          .select()
          .single();

        // If x_position column doesn't exist, try without it
        if (error && error.message?.includes('x_position')) {
          log('💖 x_position column not found, saving without position data');
          insertData = {
            stream_id: streamId,
            user_id: user.id,
            reaction_type: 'heart',
          };

          const fallbackResult = await supabase
            .from('live_stream_reactions')
            .insert(insertData)
            .select()
            .single();

          data = fallbackResult.data;
          error = fallbackResult.error;
        }

        if (error) {
          error('💖 Failed to save reaction:', error);
        } else {
          log('💖 Reaction saved successfully:', data);
        }

        // Send reaction event for any additional handling
        if (onReactionSend) {
          onReactionSend({ type: 'heart', x });
        }
      } catch (error) {
        error('💖 Error adding heart reaction:', error);
      }
    };

    const addHonk = async (x: number) => {
      if (!user || !streamId) {
        if (!user) {
          Alert.alert('Login Required', 'You need to login to react to live streams. Would you like to login now?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Login', onPress: () => router.push('/auth/signin') }
          ]);
        } else if (!streamId) warn('🔊 Cannot add honk: missing streamId');
        return;
      }
      const now = Date.now();
      if (now - lastReactionTapTimeRef.current < REACTION_TAP_THROTTLE_MS) return;
      lastReactionTapTimeRef.current = now;

      try {
        // Try to save with x_position first
        let insertData: any = {
          stream_id: streamId,
          user_id: user.id,
          reaction_type: 'honk',
          x_position: x,
        };

        let { error } = await supabase
          .from('live_stream_reactions')
          .insert(insertData);

        // If x_position column doesn't exist, try without it
        if (error && error.message?.includes('x_position')) {
          log('🔊 x_position column not found, saving without position data');
          insertData = {
            stream_id: streamId,
            user_id: user.id,
            reaction_type: 'honk',
          };

          const fallbackResult = await supabase
            .from('live_stream_reactions')
            .insert(insertData);

          error = fallbackResult.error;
        }

        if (error) {
          error('🔊 Failed to save honk:', error);
        }

        // Always show local animation
        createReactionAnimation(`local_${reactionIdCounter.current++}`, 'honk', x);

        if (onReactionSend) {
          onReactionSend({ type: 'honk', x });
        }
      } catch (error) {
        error('🔊 Error adding honk:', error);
        createReactionAnimation(`local_${reactionIdCounter.current++}`, 'honk', x);
      }
    };

    const addApplause = async (x: number) => {
      if (!user || !streamId) {
        if (!user) {
          Alert.alert('Login Required', 'You need to login to react to live streams. Would you like to login now?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Login', onPress: () => router.push('/auth/signin') }
          ]);
        } else if (!streamId) warn('👏 Cannot add applause: missing streamId');
        return;
      }
      const now = Date.now();
      if (now - lastReactionTapTimeRef.current < REACTION_TAP_THROTTLE_MS) return;
      lastReactionTapTimeRef.current = now;

      try {
        // Try to save with x_position first
        let insertData: any = {
          stream_id: streamId,
          user_id: user.id,
          reaction_type: 'applause',
          x_position: x,
        };

        let { error } = await supabase
          .from('live_stream_reactions')
          .insert(insertData);

        // If x_position column doesn't exist, try without it
        if (error && error.message?.includes('x_position')) {
          log('👏 x_position column not found, saving without position data');
          insertData = {
            stream_id: streamId,
            user_id: user.id,
            reaction_type: 'applause',
          };

          const fallbackResult = await supabase
            .from('live_stream_reactions')
            .insert(insertData);

          error = fallbackResult.error;
        }

        if (error) {
          error('👏 Failed to save applause:', error);
        }

        // Always show local animation
        createReactionAnimation(`local_${reactionIdCounter.current++}`, 'applause', x);

        if (onReactionSend) {
          onReactionSend({ type: 'applause', x });
        }
      } catch (error) {
        error('👏 Error adding applause:', error);
        createReactionAnimation(`local_${reactionIdCounter.current++}`, 'applause', x);
      }
    };

    const addLaugh = async (x: number) => {
      if (!user) {
        Alert.alert(
          'Login Required',
          'You need to login to react to live streams. Would you like to login now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Login', onPress: () => router.push('/auth/signin') }
          ]
        );
        return;
      }
      if (!streamId) {
        warn('😂 Cannot add laugh: missing streamId');
        return;
      }
      const nowLaugh = Date.now();
      if (nowLaugh - lastReactionTapTimeRef.current < REACTION_TAP_THROTTLE_MS) return;
      lastReactionTapTimeRef.current = nowLaugh;

      try {
        let insertData: any = {
          stream_id: streamId,
          user_id: user.id,
          reaction_type: 'laugh',
          x_position: x,
        };

        let { error } = await supabase
          .from('live_stream_reactions')
          .insert(insertData);

        // If x_position column doesn't exist, try without it
        if (error && error.message?.includes('x_position')) {
          log('😂 x_position column not found, saving without position data');
          insertData = {
            stream_id: streamId,
            user_id: user.id,
            reaction_type: 'laugh',
          };

          const fallbackResult = await supabase
            .from('live_stream_reactions')
            .insert(insertData);

          error = fallbackResult.error;
        }

        if (error) {
          error('😂 Failed to save laugh:', error);
        }

        // Always show local animation
        createReactionAnimation(`local_${reactionIdCounter.current++}`, 'laugh', x);

        if (onReactionSend) {
          onReactionSend({ type: 'laugh', x });
        }
      } catch (error) {
        error('😂 Error adding laugh:', error);
        createReactionAnimation(`local_${reactionIdCounter.current++}`, 'laugh', x);
      }
    };

    useImperativeHandle(ref, () => ({
      addHeart,
      addHonk,
      addApplause,
      addLaugh,
    }));

    // Gen Z vibrant gradient colors - more saturated and bold
    const heartColors = [
      '#FF0080', // Hot pink
      '#FF1744', // Bright red
      '#E91E63', // Pink
      '#9C27B0', // Purple
      '#673AB7', // Deep purple
      '#3F51B5', // Indigo
      '#2196F3', // Blue
      '#00BCD4', // Cyan
      '#FF6B35', // Coral
      '#FFD60A', // Yellow
      '#4CAF50', // Green
      '#FF3B30', // iOS red
    ];
    const randomHeart = () => heartColors[Math.floor(Math.random() * heartColors.length)];

    const getReactionEmoji = (type: 'heart' | 'honk' | 'applause' | 'laugh') => {
      switch (type) {
        case 'heart':
          return '❤';
        case 'honk':
          return '📢'; // Horn/megaphone emoji
        case 'applause':
          return '✨'; // Sparkles emoji
        case 'laugh':
          return '😂'; // Clean laughing emoji
        default:
          return '❤';
      }
    };

    const getReactionColor = (type: 'heart' | 'honk' | 'applause' | 'laugh') => {
      switch (type) {
        case 'heart':
          return randomHeart();
        case 'honk':
          return '#FF3B30'; // Red/Orange - vibrant horn color
        case 'applause':
          return '#FFD60A'; // Gold/Yellow - sparkle color
        case 'laugh':
          return '#FFD60A'; // Yellow/Gold - happy laugh color
        default:
          return randomHeart();
      }
    };

    return (
      <View style={styles.container} pointerEvents="none">
        {reactions.map(reaction => {
          // Smooth rotation for all reactions
          const rotateInterpolate = reaction.rotate.interpolate({
            inputRange: [0, 1],
            outputRange: reaction.type === 'honk' 
              ? ['-10deg', '10deg'] 
              : reaction.type === 'laugh' 
              ? ['-5deg', '5deg'] 
              : ['0deg', '10deg'],
          });

          // Smooth horizontal movement for hearts and laughs
          const translateXValue = reaction.type === 'heart' || reaction.type === 'laugh' 
            ? ((reaction.x % 10) - 5) * 2 
            : 0;
          const translateX = reaction.translateY.interpolate({
            inputRange: [-250, 0],
            outputRange: [translateXValue, 0],
          });

          return (
            <Animated.View
              key={reaction.id}
              style={[
                styles.reaction,
                {
                  bottom: reactionSpawnBottom,
                  left: reaction.x - 25,
                  transform: [
                    { translateY: reaction.translateY },
                    { translateX: reaction.type === 'heart' || reaction.type === 'laugh' ? translateX : 0 },
                    { scale: reaction.scale },
                    { rotate: rotateInterpolate },
                  ],
                  opacity: reaction.opacity,
                },
              ]}
            >
              {reaction.type === 'heart' ? (
                // Gen Z minimalistic heart with gradient effect
                <View style={styles.heartContainer}>
                  <Text style={[styles.reactionEmoji, styles.heartEmoji, { color: getReactionColor(reaction.type) }]}>
                    {getReactionEmoji(reaction.type)}
                  </Text>
                  {/* Glow effect for hearts */}
                  <View style={[styles.heartGlow, { backgroundColor: getReactionColor(reaction.type) }]} />
                </View>
              ) : (
                <Text style={[styles.reactionEmoji, { color: getReactionColor(reaction.type) }]}>
                  {getReactionEmoji(reaction.type)}
                </Text>
              )}
            </Animated.View>
          );
        })}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10050,
    elevation: 24,
    overflow: 'visible',
  },
  heart: {
    position: 'absolute',
    bottom: 200,
    width: 50, // Larger to prevent cropping
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reaction: {
    position: 'absolute',
    bottom: 200,
    width: 50, // Larger to prevent cropping
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible', // Prevent cropping
  },
  heartContainer: {
    position: 'relative',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartEmoji: {
    fontSize: 24, // Balanced size
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heartGlow: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    opacity: 0.2,
    zIndex: -1,
    shadowColor: '#FF1744',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  reactionEmoji: {
    fontSize: 28,
    textAlign: 'center',
    fontWeight: 'bold',
  },
});

export default FloatingReactions;
