import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';

export type StatusType = 'error' | 'success' | 'info' | 'warning';

interface StatusMessageProps {
  message: string;
  type?: StatusType;
  actionLink?: string;
  actionText?: string;
  helpText?: string;
  onActionPress?: () => void;
}

/**
 * A reusable status message component with optional action button and help text
 * Can be used for error, success, info, or warning messages
 */
const StatusMessage = ({ 
  message, 
  type = 'error',
  actionLink, 
  actionText, 
  helpText,
  onActionPress
}: StatusMessageProps) => {
  // Define colors based on status type
  const getStatusColors = () => {
    switch (type) {
      case 'success':
        return {
          background: '#E8F5E9',
          border: '#C8E6C9',
          text: '#2E7D32',
          icon: <CheckCircle size={20} color="#2E7D32" />,
          buttonBg: '#2E7D32'
        };
      case 'info':
        return {
          background: '#E3F2FD',
          border: '#BBDEFB',
          text: '#1565C0',
          icon: <Info size={20} color="#1565C0" />,
          buttonBg: '#1565C0'
        };
      case 'warning':
        return {
          background: '#FFF8E1',
          border: '#FFECB3',
          text: '#F57F17',
          icon: <AlertTriangle size={20} color="#F57F17" />,
          buttonBg: '#F57F17'
        };
      case 'error':
      default:
        return {
          background: '#FEF2F2', // Very light red background
          border: '#FECACA',      // Light red border
          text: '#DC2626',        // Red text for visibility
          icon: null,             // No icon for clean look
          buttonBg: '#007AFF'     // Apple blue for actions
        };
    }
  };

  const statusColors = getStatusColors();

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: statusColors.background,
        borderColor: statusColors.border
      },
      type === 'error' && styles.errorContainer
    ]}>
      {statusColors.icon && (
        <View style={styles.iconContainer}>
          {statusColors.icon}
        </View>
      )}
      
      <Text style={[
        styles.messageText, 
        { color: statusColors.text },
        type === 'error' && styles.errorText
      ]}>
        {message}
      </Text>
      
      {helpText && (
        <Text style={styles.helpText}>{helpText}</Text>
      )}
      
      {actionText && actionLink && (
        <Link href={actionLink} asChild>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: statusColors.buttonBg }]}
          >
            <Text style={styles.actionButtonText}>{actionText}</Text>
          </TouchableOpacity>
        </Link>
      )}
      
      {actionText && onActionPress && !actionLink && (
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: statusColors.buttonBg }]} 
          onPress={onActionPress}
        >
          <Text style={styles.actionButtonText}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: 12, // More rounded - Apple-style
    marginBottom: Spacing.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, // Very subtle shadow
    shadowRadius: 8,
    elevation: 1,
    alignItems: 'center',
  },
  errorContainer: {
    borderWidth: 1, // Keep subtle border
    shadowOpacity: 0.04, // Very light shadow
    elevation: 1,
    padding: Spacing.lg,
    borderRadius: 12,
  },
  iconContainer: {
    marginBottom: Spacing.sm,
  },
  messageText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular, // Regular weight for less aggressive feel
    textAlign: 'center',
    lineHeight: 20, // Better line height
    letterSpacing: -0.2, // Apple-style negative letter spacing
  },
  errorText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  helpText: {
    color: '#9CA3AF', // Lighter gray for secondary text
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  actionButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2, // Apple-style button padding
    borderRadius: 8, // Apple button radius
    marginTop: Spacing.md,
    alignSelf: 'center',
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, // Very subtle shadow
    shadowRadius: 4,
    elevation: 1,
  },
  actionButtonText: {
    fontSize: FontSizes.body - 1,
    fontFamily: FontFamily.medium,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2, // Apple-style
  },
});

export default StatusMessage; 