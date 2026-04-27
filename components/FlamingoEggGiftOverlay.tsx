import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

type CrackLevel = 0 | 1 | 2 | 3;

interface FlamingoEggGiftOverlayProps {
  senderName?: string;
  senderAvatar?: string | null;
  tapCount: number;
  tapsRequired: number;
  crackLevel: CrackLevel;
  isOpening: boolean;
  canTap: boolean;
  onTap: () => void;
  // Animation values driven by the parent (so we reuse the exact same egg UI)
  scaleAnim: Animated.Value;
  pulseAnim: Animated.Value;
  rotateInterpolate: Animated.AnimatedInterpolation<string>;
  shakeInterpolate: Animated.AnimatedInterpolation<number>;
  glowInterpolate: Animated.AnimatedInterpolation<number>;
  crackOpacityAnim: Animated.Value;
  showParticles: boolean;
  particleAnims: Array<{
    translateX: Animated.Value;
    translateY: Animated.Value;
    opacity: Animated.Value;
    scale: Animated.Value;
  }>;
  getCrackLines: () => React.ReactNode;
  getCrackEmoji: () => string;
}

export default function FlamingoEggGiftOverlay(props: FlamingoEggGiftOverlayProps) {
  const {
    senderName,
    senderAvatar,
    tapCount,
    tapsRequired,
    crackLevel,
    isOpening,
    canTap,
    onTap,
    scaleAnim,
    pulseAnim,
    rotateInterpolate,
    shakeInterpolate,
    glowInterpolate,
    crackOpacityAnim,
    showParticles,
    particleAnims,
    getCrackLines,
    getCrackEmoji,
  } = props;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {!!senderName && (
        <View style={styles.senderPill}>
          {senderAvatar ? (
            <Image source={{ uri: senderAvatar }} style={styles.senderAvatar} contentFit="cover" />
          ) : (
            <View style={styles.defaultSenderAvatar}>
              <Text style={styles.senderAvatarText}>{senderName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.senderText} numberOfLines={1}>
            {senderName}
          </Text>
          <Text style={styles.senderTextMuted}>sent a Flamingo Egg</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={onTap}
        activeOpacity={0.9}
        disabled={isOpening || !canTap}
        style={styles.eggButton}
      >
        <Animated.View
          style={[
            styles.egg,
            {
              transform: [
                { scale: Animated.multiply(scaleAnim, pulseAnim) },
                { rotate: rotateInterpolate },
                { translateX: shakeInterpolate.interpolate({ inputRange: [0, 15], outputRange: [0, 0] }) },
                { translateY: shakeInterpolate.interpolate({ inputRange: [0, 15], outputRange: [0, 0] }) },
              ],
            },
          ]}
        >
          {/* Glow */}
          {tapCount >= tapsRequired * 0.5 && (
            <Animated.View
              style={[
                styles.eggGlow,
                {
                  opacity: glowInterpolate,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
              pointerEvents="none"
            />
          )}

          <LinearGradient
            colors={
              tapCount >= tapsRequired * 0.75
                ? ['#FF8FB3', '#E85A7F', '#FFB84D', '#FF8FB3']
                : ['#FF6B9D', '#C44569', '#F8B500', '#FF6B9D']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.eggGradient}
          >
            <Text style={styles.eggEmoji}>🥚</Text>

            {/* Crack lines */}
            {crackLevel > 0 && <View style={styles.crackOverlay}>{getCrackLines()}</View>}

            {/* Crack indicator */}
            {tapCount > 0 && (
              <Animated.View
                style={[
                  styles.crackContainer,
                  {
                    opacity: crackOpacityAnim,
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.crackEmoji}>{getCrackEmoji()}</Text>
              </Animated.View>
            )}
          </LinearGradient>

          {/* Particles */}
          {showParticles && (
            <View style={styles.particlesContainer} pointerEvents="none">
              {particleAnims.map((particle, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.particle,
                    {
                      transform: [
                        { translateX: particle.translateX },
                        { translateY: particle.translateY },
                        { scale: particle.scale },
                      ],
                      opacity: particle.opacity,
                    },
                  ]}
                >
                  <Text style={styles.particleEmoji}>
                    {['✨', '⭐', '💫', '🌟', '✨', '⭐', '💫', '🌟'][index]}
                  </Text>
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Small progress, no big text */}
      {tapCount > 0 && (
        <View style={styles.progressPill}>
          <Text style={styles.progressText}>
            {tapCount}/{tapsRequired}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  senderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: 220,
  },
  senderAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  defaultSenderAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  senderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 110,
  },
  senderTextMuted: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
  },
  eggButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  egg: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eggGlow: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255, 107, 157, 0.28)',
  },
  eggGradient: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  eggEmoji: {
    fontSize: 38,
  },
  crackOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crackContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  crackEmoji: {
    fontSize: 12,
  },
  particlesContainer: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
  },
  particle: {
    position: 'absolute',
    top: 30,
    left: 30,
  },
  particleEmoji: {
    fontSize: 14,
  },
  progressPill: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  progressText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});

