import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Gift {
  id: string;
  name: string;
  emoji: string;
  price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface GiftAnimationProps {
  gift: Gift;
  onComplete: () => void;
}

const RARITY_COLORS = {
  common: '#808080',
  rare: '#00BFFF',
  epic: '#9370DB',
  legendary: '#FFD700',
};

export default function GiftAnimation({ gift, onComplete }: GiftAnimationProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  // Removed rotateAnim since we're using pulse instead of rotation

  useEffect(() => {
    // Start animation
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: -50,
        duration: 2000,
        useNativeDriver: true,
      }),
      // Removed rotation animation for better readability
    ]).start();

    // Auto remove after 3 seconds
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
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // Removed rotation interpolation since we're using pulse instead

  const getRarityStyle = () => ({
    borderColor: RARITY_COLORS[gift.rarity],
    shadowColor: RARITY_COLORS[gift.rarity],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { scale: scaleAnim },
            { translateY: translateYAnim },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.giftContainer, getRarityStyle()]}>
        <Text style={styles.giftEmoji}>{gift.emoji}</Text>
        <Text style={styles.giftName}>{gift.name}</Text>
        <Text style={styles.giftPrice}>{gift.price} coins</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -75,
    marginTop: -50,
    zIndex: 1000,
  },
  giftContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    minWidth: 150,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  giftEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  giftName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  giftPrice: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '600',
  },
});
