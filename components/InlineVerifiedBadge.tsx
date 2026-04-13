import React from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';

/** Teal → cyan gradient aligned with `VipBadge` verified styling (not a flat blue dot). */
const VERIFIED_GRADIENT = ['#00D4AA', '#00A8CC'] as const;

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function InlineVerifiedBadge({
  size = 15,
  style,
  accessibilityLabel = 'Verified account',
}: Props) {
  const checkSize = Math.max(7, Math.round(size * 0.5));
  const strokeWidth = size >= 14 ? 2.4 : 2;

  return (
    <View
      style={[styles.outer, { width: size, height: size, borderRadius: size / 2 }, style]}
      pointerEvents="none"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <LinearGradient
        colors={[...VERIFIED_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Check color="#FFFFFF" size={checkSize} strokeWidth={strokeWidth} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.35,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
});
