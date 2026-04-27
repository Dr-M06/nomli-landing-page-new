import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Fingerprint, Shield, ShieldOff } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';
import {
  checkBiometricCapabilities,
  isBiometricEnabled,
  enableBiometricAuth,
  disableBiometricAuth,
  getBiometricTypeDescription,
} from '../utils/biometricAuth';

interface BiometricSettingsProps {
  userEmail?: string;
  userPassword?: string;
  onToggle?: (enabled: boolean) => void;
}

export default function BiometricSettings({ 
  userEmail, 
  userPassword, 
  onToggle 
}: BiometricSettingsProps) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkBiometricStatus();
  }, []);

  const checkBiometricStatus = async () => {
    try {
      const capabilities = await checkBiometricCapabilities();
      setAvailable(capabilities.isAvailable);
      
      if (capabilities.isAvailable) {
        const biometricTypeDesc = getBiometricTypeDescription(capabilities.supportedTypes);
        setBiometricType(biometricTypeDesc);
        
        const isEnabled = await isBiometricEnabled();
        setEnabled(isEnabled);
      }
    } catch (error) {
      error('Error checking biometric status:', error);
    }
  };

  const handleToggleBiometric = async () => {
    if (!available) {
      Alert.alert(
        'Not Available',
        'Biometric authentication is not available on this device or no biometric data is enrolled.'
      );
      return;
    }

    if (enabled) {
      // Disable biometric auth
      Alert.alert(
        `Disable ${biometricType}?`,
        `Are you sure you want to disable ${biometricType} authentication? You'll need to sign in with your email and password.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              setLoading(true);
              try {
                const success = await disableBiometricAuth();
                if (success) {
                  setEnabled(false);
                  onToggle?.(false);
                  Alert.alert(
                    'Disabled',
                    `${biometricType} authentication has been disabled.`
                  );
                } else {
                  Alert.alert(
                    'Error',
                    'Failed to disable biometric authentication. Please try again.'
                  );
                }
              } catch (error) {
                error('Error disabling biometric auth:', error);
                Alert.alert(
                  'Error',
                  'An error occurred while disabling biometric authentication.'
                );
              } finally {
                setLoading(false);
              }
            }
          }
        ]
      );
    } else {
      // Enable biometric auth
      if (!userEmail || !userPassword) {
        Alert.alert(
          'Credentials Required',
          'Please sign in again to enable biometric authentication.',
          [
            { text: 'OK' }
          ]
        );
        return;
      }

      Alert.alert(
        `Enable ${biometricType}?`,
        `Would you like to use ${biometricType} to sign in quickly and securely?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              setLoading(true);
              try {
                const success = await enableBiometricAuth(userEmail, userPassword);
                if (success) {
                  setEnabled(true);
                  onToggle?.(true);
                  Alert.alert(
                    'Enabled',
                    `${biometricType} authentication has been enabled.`
                  );
                } else {
                  Alert.alert(
                    'Error',
                    'Failed to enable biometric authentication. Please try again.'
                  );
                }
              } catch (error) {
                error('Error enabling biometric auth:', error);
                Alert.alert(
                  'Error',
                  'An error occurred while enabling biometric authentication.'
                );
              } finally {
                setLoading(false);
              }
            }
          }
        ]
      );
    }
  };

  if (!available) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <View style={styles.iconContainer}>
            <ShieldOff size={24} color={Colors.neutral.subtext} />
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>Biometric Authentication</Text>
            <Text style={styles.subtitle}>Not available on this device</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={handleToggleBiometric}
      disabled={loading}
    >
      <View style={styles.row}>
        <View style={styles.iconContainer}>
          {enabled ? (
            <Shield size={24} color={Colors.success.main} />
          ) : (
            <Fingerprint size={24} color={Colors.neutral.subtext} />
          )}
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{biometricType} Authentication</Text>
          <Text style={[styles.subtitle, { color: enabled ? Colors.success.main : Colors.neutral.subtext }]}>
            {loading 
              ? 'Updating...' 
              : enabled 
                ? 'Enabled - Use for quick sign-in' 
                : 'Disabled - Tap to enable'
            }
          </Text>
        </View>
        <View style={styles.toggle}>
          <View style={[
            styles.toggleSwitch, 
            enabled ? styles.toggleSwitchEnabled : styles.toggleSwitchDisabled
          ]}>
            <View style={[
              styles.toggleCircle,
              enabled ? styles.toggleCircleEnabled : styles.toggleCircleDisabled
            ]} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.neutral.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.neutral.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.semiBold,
    color: Colors.neutral.text,
    marginBottom: Spacing.xxs,
  },
  subtitle: {
    fontSize: FontSizes.small,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.subtext,
  },
  toggle: {
    marginLeft: Spacing.sm,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchEnabled: {
    backgroundColor: Colors.success.main,
  },
  toggleSwitchDisabled: {
    backgroundColor: Colors.neutral.border,
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.neutral.card,
  },
  toggleCircleEnabled: {
    alignSelf: 'flex-end',
  },
  toggleCircleDisabled: {
    alignSelf: 'flex-start',
  },
}); 