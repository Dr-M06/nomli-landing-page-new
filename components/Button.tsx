import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';

interface ButtonProps extends TouchableOpacityProps {
  title?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  title,
  label,
  variant = 'primary',
  size = 'medium',
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  disabled,
  ...rest
}: ButtonProps) {
  const buttonText = label || title || '';
  
  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.primary;
      case 'secondary':
        return styles.secondary;
      case 'outline':
        return styles.outline;
      case 'ghost':
        return styles.ghost;
      default:
        return styles.primary;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.primaryText;
      case 'secondary':
        return styles.secondaryText;
      case 'outline':
        return styles.outlineText;
      case 'ghost':
        return styles.ghostText;
      default:
        return styles.primaryText;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.small;
      case 'medium':
        return styles.medium;
      case 'large':
        return styles.large;
      default:
        return styles.medium;
    }
  };

  const getTextSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.smallText;
      case 'medium':
        return styles.mediumText;
      case 'large':
        return styles.largeText;
      default:
        return styles.mediumText;
    }
  };

  const buttonStyles = [
    styles.button,
    getVariantStyle(),
    getSizeStyle(),
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    getTextStyle(),
    getTextSizeStyle(),
    disabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator 
          color={variant === 'outline' || variant === 'ghost' ? Colors.primary.main : 'white'} 
          size="small" 
        />
      ) : (
        <Text style={textStyles}>{buttonText}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  primary: {
    backgroundColor: '#B794F6',
  },
  secondary: {
    backgroundColor: '#E879B9',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#B794F6',
    shadowOpacity: 0,
    elevation: 0,
  },
  ghost: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  small: {
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    minHeight: 36,
  },
  medium: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
  },
  large: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 54,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    fontWeight: '600',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: '#B794F6',
  },
  ghostText: {
    color: '#B794F6',
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 15,
  },
  largeText: {
    fontSize: 16,
  },
  disabledText: {
    color: '#9CA3AF',
  },
});