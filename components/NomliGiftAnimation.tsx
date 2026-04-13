import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Gift {
  id: string;
  name: string;
  emoji: string;
  price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  quantity?: number;
  sender_name?: string;
  sender_avatar?: string;
}

interface NomliGiftAnimationProps {
  gift: Gift;
  onComplete: () => void;
}

const RARITY_COLORS = {
  common: '#FF69B4', // Nomli Pink
  rare: '#00BFFF',   // Mingle Blue
  epic: '#9370DB',   // Purple
  legendary: '#FFD700', // Gold
};

const RARITY_EFFECTS = {
  common: { scale: 0.9, glow: 0 },
  rare: { scale: 0.95, glow: 3 },
  epic: { scale: 1, glow: 5 },
  legendary: { scale: 1.05, glow: 8 },
};

export default function NomliGiftAnimation({ gift, onComplete }: NomliGiftAnimationProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  // Removed rotateAnim since we're using pulse instead of rotation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const effects = RARITY_EFFECTS[gift.rarity];
    
    // Start animation sequence
    Animated.sequence([
      // Initial pop-in
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: effects.scale,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Float up
      Animated.timing(translateYAnim, {
        toValue: -80,
        duration: 2500,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation for epic/legendary instead of rotation
    if (gift.rarity === 'epic' || gift.rarity === 'legendary') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    // Pulse effect for rare+ items
    if (gift.rarity !== 'common') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    // Auto remove after duration based on rarity
    const duration = gift.rarity === 'legendary' ? 5000 : 
                   gift.rarity === 'epic' ? 4000 : 
                   gift.rarity === 'rare' ? 3500 : 3000;
    
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onComplete();
      });
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  // Removed rotation interpolation since we're using pulse instead

  const getRarityStyle = () => {
    const color = RARITY_COLORS[gift.rarity];
    const effects = RARITY_EFFECTS[gift.rarity];
    
    return {
      borderColor: color,
      shadowColor: color,
      shadowOpacity: effects.glow / 10,
      shadowRadius: effects.glow,
      elevation: effects.glow,
    };
  };

  const isNomliBranded = gift.name.includes('Nomli') || gift.name.includes('Mingle');

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { scale: Animated.multiply(scaleAnim, pulseAnim) },
            { translateY: translateYAnim },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.giftContainer, getRarityStyle()]}>
        {isNomliBranded && (
          <View style={styles.brandBadge}>
            <Text style={styles.brandText}>NOMLI</Text>
          </View>
        )}
        
        {/* Sender Name */}
        {gift.sender_name && (
          <View style={styles.senderContainer}>
            <Text style={styles.senderName}>from {gift.sender_name}</Text>
          </View>
        )}
        
        <Text style={styles.giftEmoji}>{gift.emoji}</Text>
        <Text style={styles.giftName}>
          {gift.quantity && gift.quantity > 1 ? `${gift.quantity}x ` : ''}{gift.name}
        </Text>
        <Text style={styles.giftPrice}>
          {gift.quantity && gift.quantity > 1 ? `${gift.price * gift.quantity}` : gift.price} coins
        </Text>
        {gift.rarity === 'legendary' && (
          <View style={styles.sparkleContainer}>
            <Text style={styles.sparkle}>✨</Text>
            <Text style={styles.sparkle}>✨</Text>
            <Text style={styles.sparkle}>✨</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '20%', // Moved up to avoid blocking main content
    alignSelf: 'center',
    zIndex: 1000,
  },
  giftContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0,
    alignItems: 'center',
    minWidth: 100,
    maxWidth: 140,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  brandBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF69B4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  brandText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  senderContainer: {
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    borderWidth: 0,
  },
  senderName: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFD700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  giftEmoji: {
    fontSize: 32,
    marginBottom: 2,
  },
  giftName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  giftPrice: {
    fontSize: 10,
    color: '#FFD700',
    fontWeight: '600',
  },
  sparkleContainer: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  sparkle: {
    fontSize: 14,
    color: '#FFD700',
  },
});
