import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../utils/supabase';
import { error as logError } from '../utils/productionLogger';

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

interface FloatingGiftBoxProps {
  giftTransactionId?: string; // ID of the gift_transaction for flamingo egg
  senderId?: string; // ID of the person who sent the box
  senderName?: string; // Name of the sender
  senderAvatar?: string; // Avatar of the sender
  isReceiver?: boolean; // Whether current user is the receiver (can tap)
  onUnboxed?: (gift: Gift, tokens: number) => void;
  onComplete?: () => void;
}

const TAPS_REQUIRED = 10;

function crackEmojiForTaps(tapCount: number): string {
  if (tapCount >= 8) return '💥';
  if (tapCount >= 5) return '💢';
  if (tapCount >= 2) return '⚡';
  return '';
}

export default function FloatingGiftBox({
  giftTransactionId,
  senderId,
  senderName,
  senderAvatar,
  isReceiver = false,
  onUnboxed,
  onComplete,
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
        const { data, error: fetchErr } = await supabase
          .from('gift_transactions')
          .select('*')
          .eq('id', giftTransactionId)
          .single();

        if (fetchErr || !data) {
          logError('Error fetching stored gift:', fetchErr);
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
      } catch (e) {
        logError('Error in fetchStoredGift:', e);
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

  const handleTap = async () => {
    const next = tapCount + 1;
    setTapCount(next);

    if (next >= TAPS_REQUIRED && isReceiver && !isUnboxed) {
      const tokens = EGG_TOKENS_REWARD;

      if (giftTransactionId) {
        const { error: updateErr } = await supabase
          .from('gift_transactions')
          .update({
            gift_id: 'flamingo_egg_tokens',
            gift_name: 'Nomli Tokens',
            gift_emoji: '🥚',
            gift_rarity: 'common',
            gift_price: tokens,
          })
          .eq('id', giftTransactionId);

        if (updateErr) {
          logError('Error updating gift transaction:', updateErr);
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
  };

  const crackHint = crackEmojiForTaps(tapCount);

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
      <Pressable
        style={styles.card}
        onPress={handleTap}
        disabled={isUnboxed}
      >
        <View style={styles.senderRow}>
          {senderAvatar ? (
            <Image source={{ uri: senderAvatar }} style={styles.avatar} contentFit="cover" />
          ) : null}
          {senderName ? <Text style={styles.senderName} numberOfLines={1}>{senderName}</Text> : null}
        </View>
        <Text style={styles.egg}>🥚</Text>
        {isUnboxed && revealedTokens != null ? (
          <Text style={styles.tokensText}>+{revealedTokens} Nomli tokens 🪙</Text>
        ) : (
          <>
            <Text style={styles.tapProgress}>
              {tapCount}/{TAPS_REQUIRED} taps
              {!isReceiver ? ' (viewer)' : ''}
            </Text>
            {crackHint ? <Text style={styles.crackHint}>{crackHint}</Text> : null}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 2000,
  },
  card: {
    minWidth: 140,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,182,193,0.6)',
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 160,
    marginBottom: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  senderName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  egg: {
    fontSize: 44,
    marginVertical: 4,
  },
  tapProgress: {
    color: '#ffb6c1',
    fontSize: 12,
    fontWeight: '600',
  },
  crackHint: {
    fontSize: 20,
    marginTop: 4,
  },
  tokensText: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
});
