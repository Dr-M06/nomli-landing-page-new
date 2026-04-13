import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

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

interface GiftNotificationCardProps {
  gift: Gift;
  onComplete: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const RARITY_GRADIENTS = {
  common: ['#FF69B4', '#FF1493'], // Pink gradient
  rare: ['#00BFFF', '#0080FF'], // Blue gradient
  epic: ['#9370DB', '#8A2BE2'], // Purple gradient
  legendary: ['#FFD700', '#FFA500'], // Gold gradient
};

const RARITY_BG_COLORS = {
  common: 'rgba(255, 105, 180, 0.15)',
  rare: 'rgba(0, 191, 255, 0.15)',
  epic: 'rgba(147, 112, 219, 0.15)',
  legendary: 'rgba(255, 215, 0, 0.2)',
};

export default function GiftNotificationCard({ gift, onComplete }: GiftNotificationCardProps) {
  const translateXAnim = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Slide in from left with bounce
    Animated.parallel([
      Animated.spring(translateXAnim, {
        toValue: 0,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto slide out after 5 seconds
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateXAnim, {
          toValue: -SCREEN_WIDTH,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onComplete();
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const rarityGradient = RARITY_GRADIENTS[gift.rarity] || RARITY_GRADIENTS.common;
  const rarityBgColor = RARITY_BG_COLORS[gift.rarity] || RARITY_BG_COLORS.common;
  const displayName = gift.sender_name?.split(' ')[0] || 'Anonymous';
  const quantity = gift.quantity || 1;
  const totalTokens = gift.price * quantity;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateX: translateXAnim },
            { scale: scaleAnim },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.card, { backgroundColor: rarityBgColor }]}>
        {/* Gradient border effect */}
        <LinearGradient
          colors={rarityGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientBorder}
        />
        
        {/* Avatar with glow */}
        <View style={styles.avatarContainer}>
          <View style={[styles.avatarGlow, { shadowColor: rarityGradient[0] }]}>
            {gift.sender_avatar ? (
              <Image
                source={{ uri: gift.sender_avatar }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <LinearGradient
                colors={rarityGradient}
                style={styles.defaultAvatar}
              >
                <Text style={styles.avatarText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.username} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.giftInfo}>
            {/* Quantity badge */}
            {quantity > 1 && (
              <View style={[styles.quantityBadge, { backgroundColor: rarityGradient[0] }]}>
                <Text style={styles.quantityText}>{quantity}x</Text>
              </View>
            )}
            <Text style={styles.giftEmoji}>{gift.emoji}</Text>
            <Text style={styles.giftName} numberOfLines={1}>
              {gift.name}
            </Text>
          </View>
        </View>

        {/* Tokens display */}
        <View style={styles.tokensContainer}>
          <LinearGradient
            colors={rarityGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tokensBadge}
          >
            <Text style={styles.tokensText}>{totalTokens.toLocaleString()}</Text>
            <Text style={styles.tokensLabel}>tokens</Text>
          </LinearGradient>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH * 0.65,
    maxWidth: 220,
    marginLeft: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingLeft: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  gradientBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  avatarContainer: {
    marginRight: 10,
  },
  avatarGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  defaultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  giftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  quantityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 2,
  },
  quantityText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  giftEmoji: {
    fontSize: 18,
  },
  giftName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tokensContainer: {
    marginLeft: 8,
  },
  tokensBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 50,
  },
  tokensText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  tokensLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: -1,
  },
});
