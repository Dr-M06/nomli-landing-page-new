import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { BorderRadius, FontFamily, FontSizes } from '../../constants/Theme';

interface SimpleActionButtonProps {
  onPress: () => void;
  icon: React.ReactNode;
  text?: string;
  color?: string;
  isActive?: boolean;
  themeColors: any;
  onLongPress?: (event: any) => void;
  buttonRef?: React.RefObject<TouchableOpacity>;
}

const SimpleActionButton: React.FC<SimpleActionButtonProps> = ({
  onPress,
  icon,
  text,
  color,
  isActive = false,
  themeColors,
  onLongPress,
  buttonRef,
}) => {
  const [scale] = useState(new Animated.Value(1));
  const longPressHandledRef = useRef(false);

  const handlePressIn = () => {
    longPressHandledRef.current = false;
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      friction: 4,
      tension: 150,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 150,
    }).start();
  };

  const handlePress = () => {
    if (!longPressHandledRef.current) {
      onPress();
    }
  };

  const handleLongPress = (event: any) => {
    longPressHandledRef.current = true;
    if (onLongPress) {
      onLongPress(event);
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        ref={buttonRef}
        style={[
          styles.actionButton,
          {
            backgroundColor: isActive
              ? `${themeColors.primary.main}22`
              : `${themeColors.neutral.border}30`,
            borderColor: isActive
              ? `${themeColors.primary.main}50`
              : `${themeColors.neutral.border}60`,
          },
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.7}
        delayLongPress={400}
      >
        {icon}
        {text && (
          <Text
            style={[
              styles.actionText,
              { color: color || themeColors.neutral.text },
              isActive && { fontWeight: '600' }
            ]}
          >
            {text}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    fontFamily: FontFamily.semibold,
    fontSize: 11,
  },
});

export default SimpleActionButton;
