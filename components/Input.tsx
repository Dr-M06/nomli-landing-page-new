import React, { useState } from 'react';
import { 
  View, 
  TextInput, 
  Text, 
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  TouchableOpacity,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  inputContainerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  errorStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function Input({
  label,
  error,
  secureTextEntry,
  containerStyle,
  labelStyle,
  inputContainerStyle,
  inputStyle,
  errorStyle,
  leftIcon,
  rightIcon,
  ...rest
}: InputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPassword = secureTextEntry !== undefined;
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);


  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, labelStyle, { color: isDarkMode ? '#F8FAFC' : '#1F2937' }]}>{label}</Text>
      )}
      <View style={[
        styles.inputContainer, 
        { 
          backgroundColor: isDarkMode ? '#334155' : '#FFFFFF',
          borderColor: isDarkMode ? '#475569' : '#E5E7EB',
        },
        error ? styles.inputError : null,
        inputContainerStyle
      ]}>
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            {leftIcon}
          </View>
        )}
        <TextInput
          style={[
            styles.input,
            { color: isDarkMode ? '#FFFFFF' : '#000000' },
            leftIcon ? styles.inputWithLeftIcon : null,
            (rightIcon || isPassword) ? styles.inputWithRightIcon : null,
            inputStyle
          ]}
          placeholderTextColor={isDarkMode ? '#CBD5E1' : '#6B7280'}
          secureTextEntry={isPassword ? !isPasswordVisible : secureTextEntry}
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity 
            style={styles.rightIconContainer} 
            onPress={togglePasswordVisibility}
            activeOpacity={0.7}
          >
            {isPasswordVisible ? (
              <EyeOff size={20} color={isDarkMode ? '#CBD5E1' : '#6B7280'} />
            ) : (
              <Eye size={20} color={isDarkMode ? '#CBD5E1' : '#6B7280'} />
            )}
          </TouchableOpacity>
        )}
        {rightIcon && !isPassword && (
          <View style={styles.rightIconContainer}>
            {rightIcon}
          </View>
        )}
      </View>
      {error && (
        <Text style={[styles.error, errorStyle, { color: '#EF4444' }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  label: {
    fontSize: 17,
    fontFamily: 'Inter-Regular',
    marginBottom: 8,
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 44,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  inputError: {
    // Will be handled by inline styles
  },
  leftIconContainer: {
    marginRight: 12,
    paddingVertical: 8,
  },
  rightIconContainer: {
    marginLeft: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Inter-Regular',
    paddingVertical: 12,
    paddingHorizontal: 0,
    minHeight: 20,
    lineHeight: 22,
  },
  inputWithLeftIcon: {
    paddingLeft: 4,
  },
  inputWithRightIcon: {
    paddingRight: 4,
  },
  error: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
    lineHeight: 20,
  },
});