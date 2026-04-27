import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Gifts with total value >= this (tokens) or rarity epic/legendary get the big announcement */
export const EXPENSIVE_GIFT_THRESHOLD_TOKENS = 500;
export const EXPENSIVE_GIFT_RARITIES = ['epic', 'legendary'];

export function isExpensiveGift(gift: { price: number; quantity?: number; rarity?: string }): boolean {
  const total = (gift.price || 0) * (gift.quantity || 1);
  return total >= EXPENSIVE_GIFT_THRESHOLD_TOKENS || EXPENSIVE_GIFT_RARITIES.includes((gift.rarity || '').toLowerCase());
}

export interface ExpensiveGiftAnnouncementGift {
  sender_name?: string;
  name: string;
  emoji: string;
  price: number;
  rarity?: string;
  quantity?: number;
}

interface ExpensiveGiftAnnouncementProps {
  gift: ExpensiveGiftAnnouncementGift;
  onComplete: () => void;
  visible: boolean;
}

const RARITY_GRADIENTS: Record<string, [string, string]> = {
  common: ['#6B7280', '#4B5563'],
  rare: ['#0EA5E9', '#0284C7'],
  epic: ['#A855F7', '#7C3AED'],
  legendary: ['#F59E0B', '#D97706'],
};

const DURATION_MS = 4500;

export default function ExpensiveGiftAnnouncement({
  gift,
  onComplete,
  visible,
}: ExpensiveGiftAnnouncementProps) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => onComplete());
    }, DURATION_MS);

    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const sender = gift.sender_name?.split(' ')[0] || 'Someone';
  const quantity = gift.quantity || 1;
  const total = gift.price * quantity;
  const rarityKey = (gift.rarity || 'epic').toLowerCase();
  const gradient = RARITY_GRADIENTS[rarityKey] || RARITY_GRADIENTS.epic;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={[gradient[0] + 'E6', gradient[1] + 'E6']}
        style={styles.banner}
      >
        <Text style={styles.emoji}>{gift.emoji}</Text>
        <Text style={styles.message} numberOfLines={2}>
          <Text style={styles.sender}>{sender}</Text>
          <Text style={styles.sent}> sent </Text>
          <Text style={styles.giftName}>{gift.name}</Text>
          {quantity > 1 && (
            <Text style={styles.quantity}> x{quantity}</Text>
          )}
          <Text style={styles.sent}>!</Text>
        </Text>
        <Text style={styles.tokens}>{total} tokens</Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '28%',
    alignItems: 'center',
    zIndex: 1100,
  },
  banner: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: SCREEN_WIDTH * 0.7,
    maxWidth: SCREEN_WIDTH * 0.9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  emoji: {
    fontSize: 40,
    marginBottom: 4,
  },
  message: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  sender: {
    color: '#fff',
    fontWeight: '800',
  },
  sent: {
    color: 'rgba(255,255,255,0.95)',
  },
  giftName: {
    color: '#fff',
    fontWeight: '800',
  },
  quantity: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
  },
  tokens: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    fontWeight: '600',
  },
});
