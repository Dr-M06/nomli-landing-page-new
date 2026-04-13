import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../utils/supabase';
import { log, warn, error } from '../utils/productionLogger';


const { width, height } = Dimensions.get('window');

interface SoundBubble {
  id: string;
  x: Animated.Value;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
  pulse: Animated.Value;
}

export interface DiscoSoundBubblesRef {
  triggerBubble: (x?: number, color?: string) => void;
}

interface DiscoSoundBubblesProps {
  streamId: string;
  visible?: boolean;
}

const DiscoSoundBubbles = forwardRef<DiscoSoundBubblesRef, DiscoSoundBubblesProps>(
  ({ streamId, visible = true }, ref) => {
    const [bubbles, setBubbles] = useState<SoundBubble[]>([]);
    const bubbleIdCounter = useRef(0);

    // Disco colors palette
    const discoColors = [
      '#FF0050', // Hot pink
      '#D946EF', // Purple
      '#00D9FF', // Cyan
      '#FF6B00', // Orange
      '#FFD700', // Gold
      '#FF1493', // Deep pink
      '#8A2BE2', // Blue violet
      '#00FF7F', // Spring green
    ];

    const createBubble = useCallback((x: number, color?: string): SoundBubble => {
      const bubbleId = `bubble_${bubbleIdCounter.current++}`;
      const size = 30 + Math.random() * 40; // Random size between 30-70
      const bubbleColor = color || discoColors[Math.floor(Math.random() * discoColors.length)];
      
      const bubble: SoundBubble = {
        id: bubbleId,
        x: new Animated.Value(x),
        y: new Animated.Value(height + size), // Start from bottom
        scale: new Animated.Value(0),
        opacity: new Animated.Value(0),
        color: bubbleColor,
        size,
        pulse: new Animated.Value(0),
      };

      // Animate bubble rising and fading
      Animated.parallel([
        // Rise up
        Animated.sequence([
          Animated.parallel([
            Animated.timing(bubble.y, {
              toValue: -size,
              duration: 3000 + Math.random() * 2000,
              useNativeDriver: true,
            }),
            Animated.timing(bubble.opacity, {
              toValue: 0.9,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(bubble.scale, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(bubble.opacity, {
              toValue: 0,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(bubble.scale, {
              toValue: 1.5,
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
        ]),
        // Horizontal drift
        Animated.sequence([
          Animated.timing(bubble.x, {
            toValue: x + (Math.random() - 0.5) * 100,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(bubble.x, {
            toValue: x + (Math.random() - 0.5) * 150,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
        // Pulsing effect
        Animated.loop(
          Animated.sequence([
            Animated.timing(bubble.pulse, {
              toValue: 1,
              duration: 800 + Math.random() * 400,
              useNativeDriver: true,
            }),
            Animated.timing(bubble.pulse, {
              toValue: 0,
              duration: 800 + Math.random() * 400,
              useNativeDriver: true,
            }),
          ])
        ),
      ]).start(() => {
        // Remove bubble when animation completes
        setBubbles(prev => prev.filter(b => b.id !== bubbleId));
      });

      return bubble;
    }, []);

    const MAX_BUBBLES = 10; // Cap for performance

    // Expose triggerBubble method via ref
    useImperativeHandle(ref, () => ({
      triggerBubble: (x?: number, color?: string) => {
        const bubbleX = x || Math.random() * (width - 100) + 50;
        const bubble = createBubble(bubbleX, color);
        setBubbles(prev => (prev.length >= MAX_BUBBLES ? [...prev.slice(-MAX_BUBBLES + 1), bubble] : [...prev, bubble]));
      },
    }), [createBubble]);

    // Subscribe to reactions
    useEffect(() => {
      if (!streamId || !visible) return;

      log('🎵 [DISCO_BUBBLES] Setting up reaction subscription for stream:', streamId);

      const reactionChannel = supabase
        .channel(`disco_reactions_${streamId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'live_stream_reactions',
            filter: `stream_id=eq.${streamId}`,
          },
          (payload: any) => {
            const x = payload.new?.x_position ?? Math.random() * (width - 100) + 50;
            const bubble = createBubble(x);
            setBubbles(prev => (prev.length >= 10 ? [...prev.slice(-9), bubble] : [...prev, bubble]));
          }
        )
        .subscribe();

      // Subscribe to gifts
      const giftChannel = supabase
        .channel(`disco_gifts_${streamId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'live_stream_gifts',
            filter: `stream_id=eq.${streamId}`,
          },
          (payload: any) => {
            const giftX = Math.random() * (width - 100) + 50;
            for (let i = 0; i < 2; i++) {
              setTimeout(() => {
                const bubble = createBubble(giftX + (Math.random() - 0.5) * 60, '#FFD700');
                setBubbles(prev => (prev.length >= 10 ? [...prev.slice(-9), bubble] : [...prev, bubble]));
              }, i * 100);
            }
          }
        )
        .subscribe();

      // Subscribe to comments (smaller bubbles)
      const commentChannel = supabase
        .channel(`disco_comments_${streamId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'live_stream_comments',
            filter: `stream_id=eq.${streamId}`,
          },
          (payload: any) => {
            // Only show bubbles for song requests or frequent comments
            if (payload.new.message?.includes('🎵') || Math.random() > 0.7) {
              log('🎵 [DISCO_BUBBLES] Comment received (showing bubble):', payload.new);
              const x = Math.random() * (width - 100) + 50;
              const bubble = createBubble(x, '#00D9FF'); // Cyan for comments
              setBubbles(prev => [...prev, bubble]);
            }
          }
        )
        .subscribe();

      return () => {
        log('🎵 [DISCO_BUBBLES] Cleaning up subscriptions');
        reactionChannel.unsubscribe();
        giftChannel.unsubscribe();
        commentChannel.unsubscribe();
      };
    }, [streamId, visible, createBubble]);

    if (!visible) return null;

    return (
      <View style={styles.container} pointerEvents="none">
        {bubbles.map(bubble => {
          const pulseScale = bubble.pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.3],
          });

          const pulseOpacity = bubble.pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1],
          });

          return (
            <Animated.View
              key={bubble.id}
              style={[
                styles.bubbleContainer,
                {
                  transform: [
                    { translateX: bubble.x },
                    { translateY: bubble.y },
                    { scale: Animated.multiply(bubble.scale, pulseScale) },
                  ],
                  opacity: Animated.multiply(bubble.opacity, pulseOpacity),
                },
              ]}
            >
              {/* Outer glow ring */}
              <Animated.View
                style={[
                  styles.bubbleGlow,
                  {
                    width: bubble.size * 2,
                    height: bubble.size * 2,
                    borderRadius: bubble.size,
                    backgroundColor: bubble.color,
                    opacity: pulseOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.2, 0.5],
                    }),
                  },
                ]}
              />
              
              {/* Main bubble */}
              <LinearGradient
                colors={[bubble.color, `${bubble.color}80`, `${bubble.color}40`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.bubble,
                  {
                    width: bubble.size,
                    height: bubble.size,
                    borderRadius: bubble.size / 2,
                  },
                ]}
              >
                {/* Inner highlight */}
                <View
                  style={[
                    styles.bubbleHighlight,
                    {
                      width: bubble.size * 0.4,
                      height: bubble.size * 0.4,
                      borderRadius: bubble.size * 0.2,
                    },
                  ]}
                />
              </LinearGradient>
            </Animated.View>
          );
        })}
      </View>
    );
  }
);

DiscoSoundBubbles.displayName = 'DiscoSoundBubbles';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 5000, // Higher than comments (1000) but lower than FloatingReactions (10000) so effects are visible
  },
  bubbleContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleGlow: {
    position: 'absolute',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  bubbleHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    position: 'absolute',
    top: '20%',
    left: '20%',
  },
});

export default DiscoSoundBubbles;
