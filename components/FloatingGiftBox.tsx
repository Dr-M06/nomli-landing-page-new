import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../utils/supabase';
import FlamingoEggGiftOverlay from './FlamingoEggGiftOverlay';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Gift {
  id: string;
  name: string;
  emoji: string;
  usdPrice: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// Flamingo Egg token reward (no random gift inside)
const EGG_TOKENS_REWARD = 25;

const RARITY_GRADIENTS = {
  common: ['#FF69B4', '#FF1493'],
  rare: ['#00BFFF', '#0080FF'],
  epic: ['#9370DB', '#8A2BE2'],
  legendary: ['#FFD700', '#FFA500'],
};

const RARITY_COLORS = {
  common: '#FF69B4',
  rare: '#00BFFF',
  epic: '#9370DB',
  legendary: '#FFD700',
};

interface FloatingGiftBoxProps {
  giftTransactionId?: string; // ID of the gift_transaction for flamingo egg
  senderId?: string; // ID of the person who sent the box
  senderName?: string; // Name of the sender
  senderAvatar?: string; // Avatar of the sender
  isReceiver?: boolean; // Whether current user is the receiver (can tap)
  onUnboxed?: (gift: Gift, tokens: number) => void;
  onComplete?: () => void;
}

export default function FloatingGiftBox({ 
  giftTransactionId, 
  senderId,
  senderName,
  senderAvatar,
  isReceiver = false,
  onUnboxed, 
  onComplete 
}: FloatingGiftBoxProps) {
  const [tapCount, setTapCount] = useState(0);
  const [isUnboxed, setIsUnboxed] = useState(false);
  const [revealedTokens, setRevealedTokens] = useState<number | null>(null);
  const [position] = useState({
    x: Math.random() * (SCREEN_WIDTH - 100) + 50,
    y: Math.random() * (SCREEN_HEIGHT - 200) + 100,
  });

  // Fetch the stored egg status from database and check if already cracked
  useEffect(() => {
    if (!giftTransactionId) return;

    const fetchStoredGift = async () => {
      try {
        const { data, error } = await supabase
          .from('gift_transactions')
          .select('*')
          .eq('id', giftTransactionId)
          .single();

        if (error || !data) {
          error('Error fetching stored gift:', error);
          return;
        }

        // Treat as cracked once the receiver converts it to the token reveal row
        if (data.gift_id === 'flamingo_egg_tokens') {
          // Prefer DB-stored token amount (gift_price), fallback to fixed reward
          const tokens = typeof data.gift_price === 'number' ? data.gift_price : EGG_TOKENS_REWARD;
          setRevealedTokens(tokens);
          setIsUnboxed(true);
          // Auto-complete after a short delay (let users see it first)
          setTimeout(() => {
            onComplete?.();
          }, 2500);
        }
      } catch (error) {
        error('Error in fetchStoredGift:', error);
      }
    };

    fetchStoredGift();

    // Poll for updates if not unboxed yet (to catch when receiver unboxes it)
    const pollInterval = setInterval(() => {
      if (!isUnboxed) {
        fetchStoredGift();
      }
    }, 1000); // Check every second

    return () => clearInterval(pollInterval);
  }, [giftTransactionId, isUnboxed]);

  const floatAnim = useRef(new Animated.Value(0)).current;

  // Floating animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -15],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          left: position.x,
          top: position.y,
          transform: [{ translateY: floatY }],
        },
      ]}
    >
      {/* Livestream: treat as a gift overlay (no blur/background, show sender). */}
      <FlamingoEggGiftOverlay
        senderName={senderName}
        senderAvatar={senderAvatar}
        tapCount={tapCount}
        tapsRequired={10}
        crackLevel={tapCount >= 8 ? 3 : tapCount >= 5 ? 2 : tapCount >= 2 ? 1 : 0}
        isOpening={false}
        // Sender should also be able to tap for the animation, but only receiver finalizes the DB update
        canTap={true}
        onTap={async () => {
          const next = tapCount + 1;
          setTapCount(next);

          if (next >= 10 && isReceiver && !isUnboxed) {
            const tokens = EGG_TOKENS_REWARD;

            if (giftTransactionId) {
              const { error } = await supabase
                .from('gift_transactions')
                .update({
                  gift_id: 'flamingo_egg_tokens',
                  gift_name: 'Nomli Tokens',
                  gift_emoji: '🥚',
                  gift_rarity: 'common',
                  gift_price: tokens,
                })
                .eq('id', giftTransactionId);

              if (error) {
                error('Error updating gift transaction:', error);
              }
            }

            setRevealedTokens(tokens);
            setIsUnboxed(true);
            onUnboxed?.(
              { id: 'tokens', name: 'Nomli Tokens', emoji: '🪙', usdPrice: tokens / 100, rarity: 'common' },
              tokens
            );
            setTimeout(() => onComplete?.(), 1800);
          }
        }}
        // NOTE: For now, this overlay uses simple crack/particles animations from the component itself.
        // We pass noop animated values (keeps it lightweight for livestream overlays).
        scaleAnim={new Animated.Value(1)}
        pulseAnim={new Animated.Value(1)}
        rotateInterpolate={new Animated.Value(0).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '0deg'] })}
        shakeInterpolate={new Animated.Value(0).interpolate({ inputRange: [0, 1], outputRange: [0, 0] })}
        glowInterpolate={new Animated.Value(0).interpolate({ inputRange: [0, 1], outputRange: [0, 0] })}
        crackOpacityAnim={new Animated.Value(1)}
        showParticles={false}
        particleAnims={Array.from({ length: 8 }, () => ({
          translateX: new Animated.Value(0),
          translateY: new Animated.Value(0),
          opacity: new Animated.Value(0),
          scale: new Animated.Value(0),
        }))}
        getCrackLines={() => null}
        getCrackEmoji={() => (tapCount >= 8 ? '💥' : tapCount >= 5 ? '💢' : tapCount >= 2 ? '⚡' : '')}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 2000,
  },
});
