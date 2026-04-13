import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface VerifiedBadgeProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  style?: any;
}

export default function VerifiedBadge({ 
  size = 'medium', 
  showText = true, 
  style 
}: VerifiedBadgeProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          badgeSize: 14,
          fontSize: 8,
          textSize: Math.min(10, SCREEN_WIDTH * 0.025),
          marginRight: 3,
        };
      case 'large':
        return {
          badgeSize: 22,
          fontSize: 12,
          textSize: Math.min(14, SCREEN_WIDTH * 0.035),
          marginRight: 6,
        };
      default: // medium
        return {
          badgeSize: 18,
          fontSize: 10,
          textSize: Math.min(12, SCREEN_WIDTH * 0.03),
          marginRight: 4,
        };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <View style={[styles.verifiedContainer, style]}>
      <View style={[
        styles.verifiedBadge, 
        { 
          width: sizeStyles.badgeSize, 
          height: sizeStyles.badgeSize,
          borderRadius: sizeStyles.badgeSize / 2,
          marginRight: sizeStyles.marginRight,
        }
      ]}>
        <Text style={[
          styles.verifiedCheckmark, 
          { fontSize: sizeStyles.fontSize }
        ]}>
          ✓
        </Text>
      </View>
      {showText && (
        <Text style={[
          styles.verifiedText, 
          { 
            fontSize: sizeStyles.textSize,
            color: themeColors.primary.main 
          }
        ]}>
          Verified
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  verifiedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedBadge: {
    backgroundColor: '#1DA1F2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1DA1F2',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  verifiedCheckmark: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  verifiedText: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
