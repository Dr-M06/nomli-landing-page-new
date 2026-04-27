import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

interface ChatBackgroundPatternProps {
  children?: React.ReactNode;
  style?: any;
}

export default function ChatBackgroundPattern({ children, style }: ChatBackgroundPatternProps) {
  const doodles = [
    { emoji: '💘', top: '7%', left: '10%', size: 20, rotate: '-10deg' },
    { emoji: '💕', top: '13%', right: '12%', size: 18, rotate: '8deg' },
    { emoji: '🦩', top: '24%', left: '82%', size: 19, rotate: '-6deg' },
    { emoji: '😘', top: '34%', left: '9%', size: 18, rotate: '6deg' },
    { emoji: '💞', top: '46%', right: '10%', size: 20, rotate: '-8deg' },
    { emoji: '🌹', top: '58%', left: '12%', size: 18, rotate: '10deg' },
    { emoji: '💌', top: '69%', right: '14%', size: 18, rotate: '-7deg' },
    { emoji: '🫶', top: '81%', left: '18%', size: 20, rotate: '9deg' },
    { emoji: '💖', top: '88%', right: '24%', size: 18, rotate: '-6deg' },
  ];

  return (
    <View style={[styles.container, style]}>
      <View pointerEvents="none" style={styles.doodlesLayer}>
        {doodles.map((doodle, idx) => (
          <Text
            key={`${doodle.emoji}-${idx}`}
            style={[
              styles.doodle,
              {
                top: doodle.top as any,
                left: doodle.left as any,
                right: doodle.right as any,
                fontSize: doodle.size,
                transform: [{ rotate: doodle.rotate }],
              },
            ]}
          >
            {doodle.emoji}
          </Text>
        ))}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  doodlesLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  doodle: {
    position: 'absolute',
    opacity: 0.12,
  },
  content: {
    flex: 1,
    zIndex: 2,
    position: 'relative',
  },
});

