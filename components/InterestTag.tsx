import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, useColorScheme } from 'react-native';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow, AnimationTiming } from '../constants/Theme';
import { Colors, getThemeColors } from '../constants/Colors';

type InterestTagProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
};

export default function InterestTag({ 
  label, 
  selected = false, 
  onPress, 
  disabled = false,
  size = 'medium'
}: InterestTagProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = getThemeColors(isDark);
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (selected) {
      Animated.spring(scaleAnim, {
        toValue: 1.05,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [selected]);
  
  const getContainerStyle = () => {
    const sizeStyles = {
      small: {
        paddingVertical: Spacing.xs / 2,
        paddingHorizontal: Spacing.xs,
      },
      medium: {
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.sm,
      },
      large: {
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
      },
    };
    
    return sizeStyles[size];
  };
  
  const getLabelStyle = () => {
    const sizeStyles = {
      small: {
        fontSize: FontSizes.caption - 1,
      },
      medium: {
        fontSize: FontSizes.caption,
      },
      large: {
        fontSize: FontSizes.body - 1,
      },
    };
    
    return sizeStyles[size];
  };
  
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.container,
          {
            backgroundColor: theme.neutral.card,
            borderColor: theme.neutral.border,
          },
          getContainerStyle(),
          selected ? {
            backgroundColor: theme.accent.main,
            borderColor: theme.accent.main,
            ...Shadow.md,
          } : {},
          disabled ? {
            backgroundColor: theme.neutral.disabled,
            borderColor: theme.neutral.disabled,
          } : {},
          !disabled && !selected && styles.containerShadow
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text 
          style={[
            styles.label,
            {
              color: isDark ? theme.neutral.text : theme.primary.main,
            },
            getLabelStyle(),
            selected ? {
              color: isDark ? theme.neutral.background : theme.primary.dark,
              fontFamily: FontFamily.bold,
            } : {},
            disabled ? {
              color: theme.neutral.subtext,
            } : {}
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.pill,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerShadow: {
    ...Shadow.sm,
  },
  label: {
    fontFamily: FontFamily.medium,
  },
});