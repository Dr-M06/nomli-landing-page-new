import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Platform, StatusBar, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell } from 'lucide-react-native';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../../constants/Theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getNotificationSoundEnabled, setNotificationSoundEnabled as saveNotificationSoundEnabled } from '../../utils/notificationSoundSettings';
import {
  getNotificationPreferences,
  updatePushNotificationsPreference,
  updateMessageNotificationsPreference,
} from '../../utils/notificationPreferences';
import useAuth from '../../hooks/useAuth';
import { log, warn, error } from '../../utils/productionLogger';


export default function NotificationsSettings() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const safeAreaInsets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [pushNotifications, setPushNotifications] = React.useState(true);
  const [messageNotifications, setMessageNotifications] = React.useState(true);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = React.useState(true);
  const [loadingSound, setLoadingSound] = React.useState(false);

  // Load notification preferences on mount
  useEffect(() => {
    loadNotificationSoundPreference();
    loadAllNotificationPreferences();
  }, [user?.id]);

  const loadNotificationSoundPreference = async () => {
    try {
      const enabled = await getNotificationSoundEnabled();
      setNotificationSoundEnabled(enabled);
    } catch (error) {
      error('[NotificationsSettings] Error loading sound preference:', error);
    }
  };

  const loadAllNotificationPreferences = async () => {
    try {
      if (!user?.id) return;
      
      const preferences = await getNotificationPreferences(user.id);
      if (preferences) {
        setPushNotifications(preferences.push_notifications_enabled);
        setMessageNotifications(preferences.message_notifications_enabled);
      }
    } catch (error) {
      error('[NotificationsSettings] Error loading notification preferences:', error);
    }
  };

  const handleToggleNotificationSound = async (value: boolean) => {
    setLoadingSound(true);
    try {
      const success = await saveNotificationSoundEnabled(value);
      if (success) {
        setNotificationSoundEnabled(value);
        log(`[NotificationsSettings] Notification sound ${value ? 'enabled' : 'muted'}`);
      } else {
        Alert.alert('Error', 'Failed to save notification sound preference. Please try again.');
      }
    } catch (error) {
      error('[NotificationsSettings] Error toggling sound:', error);
      Alert.alert('Error', 'Failed to save notification sound preference. Please try again.');
    } finally {
      setLoadingSound(false);
    }
  };

  return (
    <>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <Stack.Screen 
        options={{ 
          headerShown: false,
        }} 
      />
      
      <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
        {/* Modern Header */}
        <View style={[
          styles.modernHeader, 
          { 
            backgroundColor: themeColors.neutral.surface,
            borderBottomColor: themeColors.neutral.border,
            paddingTop: safeAreaInsets.top + 16,
          }
        ]}>
          <TouchableOpacity 
            style={[styles.modernBackButton, { backgroundColor: themeColors.neutral.card }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={themeColors.neutral.text} />
          </TouchableOpacity>
          
          <Text style={[styles.modernHeaderTitle, { color: themeColors.neutral.text }]}>
            Notifications
          </Text>
          
          <View style={styles.headerSpacer} />
        </View>
        
        <ScrollView 
          style={styles.modernScrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={[styles.modernHeaderSection, { backgroundColor: themeColors.neutral.card }]}>
            <View style={[styles.headerIcon, { backgroundColor: themeColors.primary.extralight }]}>
              <Bell size={24} color={themeColors.primary.main} />
            </View>
            <Text style={[styles.modernTitle, { color: themeColors.neutral.text }]}>
              Notification Settings
            </Text>
            <Text style={[styles.modernSubtitle, { color: themeColors.neutral.subtext }]}>
              Manage your notification preferences
            </Text>
          </View>
          
          {/* Push Notifications Section */}
          <View style={[styles.modernSection, { backgroundColor: themeColors.neutral.card }]}>
            <View style={styles.modernSectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: themeColors.primary.extralight }]}>
                <Bell size={18} color={themeColors.primary.main} />
              </View>
              <Text style={[styles.modernSectionTitle, { color: themeColors.neutral.text }]}>
                Push Notifications
              </Text>
            </View>
            
            <View style={styles.modernSettingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.modernSettingLabel, { color: themeColors.neutral.text }]}>
                  Enable Push Notifications
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.neutral.subtext }]}>
                  Receive notifications on your device
                </Text>
              </View>
              <View style={styles.switchWrapper}>
                <Switch
                  value={pushNotifications}
                  onValueChange={async (value) => {
                    setPushNotifications(value);
                    if (user?.id) {
                      await updatePushNotificationsPreference(user.id, value);
                    }
                  }}
                  trackColor={{ false: themeColors.neutral.border, true: themeColors.primary.light }}
                  thumbColor={pushNotifications ? themeColors.primary.main : themeColors.neutral.surface}
                />
              </View>
            </View>
            
            <View style={styles.modernSettingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.modernSettingLabel, { color: themeColors.neutral.text }]}>
                  Message Notifications
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.neutral.subtext }]}>
                  Get notified about new messages
                </Text>
              </View>
              <View style={styles.switchWrapper}>
                <Switch
                  value={messageNotifications}
                  onValueChange={async (value) => {
                    setMessageNotifications(value);
                    if (user?.id) {
                      await updateMessageNotificationsPreference(user.id, value);
                    }
                  }}
                  trackColor={{ false: themeColors.neutral.border, true: themeColors.primary.light }}
                  thumbColor={messageNotifications ? themeColors.primary.main : themeColors.neutral.surface}
                />
              </View>
            </View>
            
            <View style={[styles.modernSettingRow, styles.lastSettingRow]}>
              <View style={styles.settingInfo}>
                <Text style={[styles.modernSettingLabel, { color: themeColors.neutral.text }]}>
                  Notification Sound
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.neutral.subtext }]}>
                  {notificationSoundEnabled ? 'Sounds enabled' : 'Sounds muted'}
                </Text>
              </View>
              <View style={styles.switchWrapper}>
                <Switch
                  value={notificationSoundEnabled}
                  onValueChange={handleToggleNotificationSound}
                  disabled={loadingSound}
                  trackColor={{ false: themeColors.neutral.border, true: themeColors.primary.light }}
                  thumbColor={notificationSoundEnabled ? themeColors.primary.main : themeColors.neutral.surface}
                />
              </View>
            </View>
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modernHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modernBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  modernHeaderTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  modernScrollContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  modernHeaderSection: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    ...Shadow.sm,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modernTitle: {
    fontSize: FontSizes.xxl,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  modernSubtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  modernSection: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  modernSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  modernSectionTitle: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.semibold,
  },
  modernSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  lastSettingRow: {
    borderBottomWidth: 0,
  },
  settingInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: Spacing.md,
  },
  switchWrapper: {
    marginLeft: 4,
    transform: [{ scale: 0.82 }],
  },
  modernSettingLabel: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
  },
  settingDescription: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
  },
}); 