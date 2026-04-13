import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

/**
 * Full-bleed placeholder for the TikTok-style home slot: same flex layout as the real feed
 * so swapping skeleton → FlatList does not resize the header or tab area.
 */
export default function HomeFeedSkeleton({ isDark }: { isDark: boolean }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.72,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const base = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={styles.root} pointerEvents="none" accessibilityLabel="Loading feed">
      <Animated.View style={[styles.media, { backgroundColor: base, opacity: pulse }]} />
      <View style={styles.rail}>
        {[0, 1, 2, 3].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.railDot,
              { backgroundColor: base, opacity: pulse },
              i < 3 ? styles.railDotSpaced : null,
            ]}
          />
        ))}
      </View>
      <View style={styles.bottomBar}>
        <Animated.View style={[styles.lineShort, { backgroundColor: base, opacity: pulse }]} />
        <Animated.View style={[styles.lineLong, { backgroundColor: base, opacity: pulse }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    minHeight: 120,
    position: 'relative',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
  },
  rail: {
    position: 'absolute',
    right: 14,
    bottom: 140,
    alignItems: 'center',
  },
  railDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  railDotSpaced: {
    marginBottom: 18,
  },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 88,
    bottom: 36,
  },
  lineShort: {
    height: 14,
    width: '38%',
    borderRadius: 7,
    marginBottom: 8,
  },
  lineLong: {
    height: 12,
    width: '72%',
    borderRadius: 6,
  },
});
