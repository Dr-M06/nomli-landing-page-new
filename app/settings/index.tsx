import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  useColorScheme
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Moon, Sun, LogOut, User, Users, ChevronRight, Lock, Bell, ChevronLeft, FileText, UserX, Fingerprint, AlertCircle, Wrench, Shield, Globe, HelpCircle, Trash2, Ban, RefreshCw } from 'lucide-react-native';
import { supabase } from '../../utils/supabase';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Spacing, Shadow } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import { deleteUserAccount } from '../../utils/accountDeletion';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';
import { Linking, Platform, TextInput } from 'react-native';
import { SUPPORT_EMAIL, OFFICIAL_ACCOUNT_ID } from '../../constants/ContactEmails';
import { clearAllUserCache } from '../../utils/clearAllCache';
import { getVibeMode, setVibeMode } from '../../utils/vibePrefs';
import { setupVibeModeField } from '../../utils/setupVibeModeField';
import type { VibeMode } from '../../utils/setupVibeModeField';
import { Music } from 'lucide-react-native';
import { log, warn, error } from '../../utils/productionLogger';
import { isUserAdmin } from '../../utils/adminCheck';




const settingsItems = [
  {
    title: 'Account',
    icon: 'person-outline',
    onPress: () => router.push('/settings/account'),
  },
  {
    title: 'Notifications',
    icon: 'notifications-outline',
    onPress: () => router.push('/settings/notifications'),
  },
  {
    title: 'Privacy',
    icon: 'lock-closed-outline',
    onPress: () => router.push('/settings/privacy'),
  },
  {
    title: 'Support',
    icon: 'help-circle-outline',
    onPress: () => router.push(`/chat/${OFFICIAL_ACCOUNT_ID}`),
  },
  // Test/debug menu items - only in development
  ...(__DEV__ ? [
    {
      title: 'Notification Test',
      icon: 'pulse-outline',
      onPress: () => router.push('/settings/notification-test'),
    },
    {
      title: 'Supabase Notifications',
      icon: 'flash-outline',
      onPress: () => router.push('/settings/supabase-notifications'),
    },
  ] : []),
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);
  
  // Debug theme state (development only)
  if (__DEV__) {
  log('[Settings] Current theme state - isDarkMode:', isDarkMode);
  }
  const [loading, setLoading] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [vibeMode, setVibeModeState] = useState<VibeMode | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Get theme-based colors
  const themeColors = getThemeColors(isDarkMode);
  const themeStyles = useThemeStyles();

  // Load admin status (for in-app songs link)
  const loadAdminStatus = async () => {
    if (!user?.id) return;
    const ok = await isUserAdmin(user.id);
    setIsAdmin(ok);
  };

  // Load vibe mode (who can message you)
  const loadVibeMode = async () => {
    try {
      if (!user?.id) return;
      await setupVibeModeField();
      const mode = await getVibeMode(user.id);
      setVibeModeState(mode);
    } catch {
      setVibeModeState('anyone');
    }
  };

  // Load preferences on component mount
  useEffect(() => {
    if (user) {
      loadVibeMode();
    }
  }, [user]);
  
  // Refresh DM preferences and profile visibility when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      log('[Settings] Screen focused, refreshing preferences');
      loadAdminStatus();
      if (user) {
        loadVibeMode();
      }
      return () => {};
    }, [user])
  );

  useEffect(() => {
    // Check if biometric authentication is available and enabled
    const checkBiometricSetting = async () => {
      try {
        // Check if device supports biometric auth
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = compatible ? await LocalAuthentication.isEnrolledAsync() : false;
        setIsBiometricAvailable(compatible && enrolled);
        
        // Check if user has enabled biometric auth
        const biometricEnabled = await AsyncStorage.getItem('useBiometricAuth');
        setUseBiometrics(biometricEnabled === 'true');
        
        log('Biometrics available:', compatible && enrolled);
        log('Biometrics enabled:', biometricEnabled === 'true');
      } catch (error) {
        error('Error checking biometric setting:', error);
      }
    };
    
    checkBiometricSetting();
  }, []);

  const toggleBiometrics = async (value) => {
    try {
      log('Setting biometrics to:', value);
      setUseBiometrics(value);
      await AsyncStorage.setItem('useBiometricAuth', value ? 'true' : 'false');
      
      if (value) {
        // If turning on biometrics, verify with authentication first
        const authResult = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to enable biometric login',
          disableDeviceFallback: false
        });
        
        if (authResult.success) {
          // Store current credentials if authenticated successfully
          const { email } = user;
          if (email) {
            // Prompt for password since we don't store it in plain text
            Alert.prompt(
              'Enter Password',
              'Please enter your password to enable biometric login',
              [
                {
                  text: 'Cancel',
                  onPress: () => {
                    setUseBiometrics(false);
                    AsyncStorage.setItem('useBiometricAuth', 'false');
                  },
                  style: 'cancel'
                },
                {
                  text: 'OK',
                  onPress: async (password) => {
                    if (password && password.length >= 6) {
                      try {
                        // Verify credentials before saving
                        const { data, error } = await supabase.auth.signInWithPassword({
                          email,
                          password,
                        });
                        
                        if (!error) {
                          await SecureStore.setItemAsync('authEmail', email);
                          await SecureStore.setItemAsync('authPassword', password);
                          Alert.alert('Success', 'Biometric login enabled successfully');
                        } else {
                          setUseBiometrics(false);
                          await AsyncStorage.setItem('useBiometricAuth', 'false');
                          Alert.alert('Error', 'Invalid password. Biometric login not enabled.');
                        }
                      } catch (err) {
                        error('Error saving credentials:', err);
                        setUseBiometrics(false);
                        await AsyncStorage.setItem('useBiometricAuth', 'false');
                        Alert.alert('Error', 'Could not enable biometric login');
                      }
                    } else {
                      setUseBiometrics(false);
                      await AsyncStorage.setItem('useBiometricAuth', 'false');
                      Alert.alert('Error', 'Password must be at least 6 characters');
                    }
                  }
                }
              ],
              'secure-text'
            );
          }
        } else {
          // If authentication fails, revert the switch
          setUseBiometrics(false);
          await AsyncStorage.setItem('useBiometricAuth', 'false');
        }
      } else {
        // If turning off biometrics, clear stored credentials
        await SecureStore.deleteItemAsync('authEmail');
        await SecureStore.deleteItemAsync('authPassword');
      }
    } catch (error) {
      error('Error saving biometric setting:', error);
      Alert.alert('Error', 'Failed to save biometric authentication setting.');
      setUseBiometrics(false);
      await AsyncStorage.setItem('useBiometricAuth', 'false');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // First confirmation
      Alert.alert(
        "Delete Account",
        "This will permanently delete your Nomli Mingle account and all associated data. This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Continue", 
            style: "destructive",
            onPress: () => {
              // Second confirmation
              Alert.alert(
                "Final Confirmation",
                "Are you absolutely sure? This will permanently delete:\n\n• Your profile\n• All your messages\n• All your photos and media\n• Your account data\n\nThis cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  { 
                    text: "Permanently Delete My Account", 
                    style: "destructive",
                    onPress: async () => {
                      try {
                        setLoading(true);
                        log('[Settings] Starting account deletion...');
                        
                        // Call account deletion utility
                        const result = await deleteUserAccount();
                        
                        if (result.success) {
                          // Sign out
                          await signOut();
                          
                          log('[Settings] Account deleted successfully');
                          Alert.alert(
                            "Account Deleted",
                            "Your account has been permanently deleted. We're sorry to see you go!",
                            [
                              {
                                text: "OK",
                                onPress: () => {
                                  router.replace('/auth/signin');
                                }
                              }
                            ]
                          );
                        } else {
                          throw new Error(result.error || 'Failed to delete account');
                        }
                      } catch (error) {
                        error('[Settings] Error in account deletion:', error);
                        Alert.alert(
                          'Error', 
                          error instanceof Error 
                            ? error.message 
                            : 'Failed to delete account. Please contact support if this issue persists.'
                        );
                      } finally {
                        setLoading(false);
                      }
                    }
                  }
                ]
              );
            }
          }
        ]
      );
    } catch (error) {
      error('Error initiating account deletion:', error);
      Alert.alert('Error', 'Failed to initiate account deletion. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      Alert.alert(
        "Confirm Logout",
        "Are you sure you want to log out?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Logout", 
            style: "destructive",
            onPress: async () => {
              try {
                log('[Settings] Starting logout process...');
                
                // Use the signOut function from useAuth hook which handles all cleanup
                const success = await signOut();
                log('[Settings] SignOut result:', success);
                
                if (success) {
                  log('[Settings] Logout successful, clearing biometric data...');
                  // Clear biometric auth setting and credentials when logging out
                  await AsyncStorage.removeItem('useBiometricAuth');
                  await SecureStore.deleteItemAsync('authEmail');
                  await SecureStore.deleteItemAsync('authPassword');
                  setUseBiometrics(false);
                  log('[Settings] Navigating to signin screen...');
                  router.replace('/auth/signin');
                } else {
                  error('[Settings] Logout failed');
                  Alert.alert('Error', 'Failed to log out. Please try again.');
                }
              } catch (error) {
                error('[Settings] Error in logout onPress:', error);
                Alert.alert('Error', 'Failed to log out. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      error('Error logging out:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleNotifications = () => {
    setNotifications(!notifications);
    // In a real app, you would implement actual notification settings here
  };

  const renderSettingItem = (
    icon: React.ReactNode, 
    title: string, 
    subtitle: string | null = null, 
    rightElement: React.ReactNode | null = null,
    onPress: () => void = () => {}
  ) => {
    // Check if rightElement is a Switch component by checking if it has onValueChange prop
    const isSwitch = rightElement && React.isValidElement(rightElement) && rightElement.props && 'onValueChange' in rightElement.props;
    
    // If it's a Switch, don't wrap in TouchableOpacity to avoid interference
    if (isSwitch) {
      return (
        <View style={[styles.settingItem, themeStyles.card]}>
          <View style={[styles.settingIconContainer, { backgroundColor: isDarkMode ? '#2A3746' : '#F3F4F6' }]}>
            {icon}
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, themeStyles.text]}>{title}</Text>
            {subtitle && <Text style={[styles.settingSubtitle, themeStyles.subtext]}>{subtitle}</Text>}
          </View>
          <View style={styles.settingAction}>
            {rightElement}
          </View>
        </View>
      );
    }
    
    // For non-Switch elements, use TouchableOpacity as before
    return (
      <TouchableOpacity 
        style={[styles.settingItem, themeStyles.card]} 
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.settingIconContainer, { backgroundColor: isDarkMode ? '#2A3746' : '#F3F4F6' }]}>
          {icon}
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, themeStyles.text]}>{title}</Text>
          {subtitle && <Text style={[styles.settingSubtitle, themeStyles.subtext]}>{subtitle}</Text>}
        </View>
        <View style={styles.settingAction}>
          {rightElement || <ChevronRight size={20} color={themeColors.neutral.subtext} />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderQuickActionCard = (icon: React.ReactNode, title: string, onPress: () => void) => {
    return (
      <TouchableOpacity 
        style={[
          styles.quickActionButton,
          {
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)',
          },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.quickActionIcon, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
          {icon}
        </View>
        <Text style={[styles.quickActionTitle, themeStyles.text]} numberOfLines={1}>
          {title}
        </Text>
        <ChevronRight size={14} color={themeColors.neutral.subtext} />
      </TouchableOpacity>
    );
  };

  const openNomliVibeStore = async () => {
    try {
      const iosStoreUrl = 'https://apps.apple.com/us/search?term=Nomli%20Vibe';
      const androidStoreUrl = 'https://play.google.com/store/search?q=Nomli%20Vibe&c=apps';
      const targetUrl = Platform.OS === 'ios' ? iosStoreUrl : androidStoreUrl;
      await Linking.openURL(targetUrl);
    } catch (e) {
      Alert.alert('Store unavailable', 'Unable to open the app store right now. Please try again.');
    }
  };

  

  







  return (
    <SafeAreaWrapper>
      <StatusBar style="light" />
      <View style={[styles.container, themeStyles.background]}>
        {/* Minimal Header */}
        <View style={[styles.header, { backgroundColor: 'transparent' }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.6}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <View style={[styles.backButtonContainer, { backgroundColor: themeColors.neutral.background + '80' }]}>
              <ChevronLeft size={16} color={themeColors.neutral.text} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, themeStyles.text]}>Settings</Text>
          <View style={styles.headerRight} />
        </View>
        
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Quick Actions Grid */}
          <View style={styles.quickActionsGrid}>
            {renderQuickActionCard(
              <User size={16} color={Colors.primary.main} />,
              "Profile",
              () => router.push('/profile/edit')
            )}
            {renderQuickActionCard(
              <Bell size={16} color={Colors.primary.main} />,
              "Notifications",
              () => router.push('/settings/notifications')
            )}
            {renderQuickActionCard(
              <Lock size={16} color={Colors.primary.main} />,
              "Security",
              () => router.push('/settings/security')
            )}
            {renderQuickActionCard(
              <HelpCircle size={16} color={Colors.primary.main} />,
              "Support",
              () => router.push(`/chat/${OFFICIAL_ACCOUNT_ID}`)
            )}
          </View>

          {/* Pivot notice: Nomli Vibe */}
          <View
            style={[
              styles.pivotCard,
              {
                backgroundColor: isDarkMode ? 'rgba(255,111,174,0.10)' : 'rgba(255,111,174,0.08)',
                borderColor: isDarkMode ? 'rgba(255,111,174,0.35)' : 'rgba(226,85,149,0.28)',
              },
            ]}
          >
            <Text style={[styles.pivotTitle, { color: themeColors.neutral.text }]}>
              Nomli Mingle has evolved
            </Text>
            <Text style={[styles.pivotBody, { color: themeColors.neutral.subtext }]}>
              We have pivoted into two separate apps. Nomli Vibe is our official dating app.
            </Text>
            <TouchableOpacity
              style={[styles.pivotButton, { backgroundColor: Colors.primary.main }]}
              onPress={openNomliVibeStore}
              activeOpacity={0.85}
            >
              <Text style={styles.pivotButtonText}>Get Nomli Vibe</Text>
            </TouchableOpacity>
          </View>

          {/* Compact Settings Cards */}
          <View style={styles.settingsCard}>
            <Text style={[styles.cardTitle, themeStyles.text]}>Appearance</Text>
            <View style={styles.compactSettingRow}>
              <View style={styles.settingLeft}>
                {isDarkMode ? 
                  <Moon size={18} color={themeColors.neutral.text} /> : 
                  <Sun size={18} color={themeColors.neutral.text} />
                }
                <Text style={[styles.settingLabel, themeStyles.text]}>Dark Mode</Text>
              </View>
              <View style={styles.switchWrapper}>
                <Switch
                  value={isDarkMode}
                  onValueChange={toggleTheme}
                  trackColor={{ false: themeColors.neutral.border, true: Colors.primary.light }}
                  thumbColor={isDarkMode ? Colors.primary.main : themeColors.neutral.card}
                />
              </View>
            </View>
          </View>

          {/* Storage & Data Section */}
          <View style={styles.settingsCard}>
            <Text style={[styles.cardTitle, themeStyles.text]}>Storage & Data</Text>
            <TouchableOpacity 
              style={styles.compactSettingRow}
              onPress={async () => {
                Alert.alert(
                  'Clear Cache',
                  'This will clear all cached data including messages, images, posts, and profiles. The app will reload fresh data. Continue?',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel'
                    },
                    {
                      text: 'Clear Cache',
                      style: 'destructive',
                      onPress: async () => {
                        setClearingCache(true);
                        try {
                          const result = await clearAllUserCache(user?.id);
                          if (result.success) {
                            Toast.show({
                              type: 'success',
                              text1: 'Cache Cleared',
                              text2: `Successfully cleared ${result.cleared.length} cache types`,
                              position: 'bottom',
                            });
                          } else {
                            Toast.show({
                              type: 'info',
                              text1: 'Cache Partially Cleared',
                              text2: `Cleared ${result.cleared.length} types. ${result.errors.length} had errors.`,
                              position: 'bottom',
                            });
                          }
                        } catch (error) {
                          error('[Settings] Error clearing cache:', error);
                          Toast.show({
                            type: 'error',
                            text1: 'Error',
                            text2: 'Failed to clear cache. Please try again.',
                            position: 'bottom',
                          });
                        } finally {
                          setClearingCache(false);
                        }
                      }
                    }
                  ]
                );
              }}
              disabled={clearingCache}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <RefreshCw size={18} color={clearingCache ? themeColors.neutral.subtext : themeColors.neutral.text} />
                <Text style={[styles.settingLabel, { color: clearingCache ? themeColors.neutral.subtext : themeColors.neutral.text }]}>
                  {clearingCache ? 'Clearing Cache...' : 'Clear Cache'}
                </Text>
              </View>
              {clearingCache ? (
                <ActivityIndicator size="small" color={themeColors.primary.main} />
              ) : (
                <ChevronRight size={18} color={themeColors.neutral.subtext} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.settingsCard}>
            <Text style={[styles.cardTitle, themeStyles.text]}>Privacy & Security</Text>
            
            {/* Blocked Users Link */}
            <TouchableOpacity 
              style={styles.compactSettingRow}
              onPress={() => router.push('/settings/blocked-users')}
            >
              <View style={styles.settingLeft}>
                <Ban size={18} color={themeColors.neutral.text} />
                <Text style={[styles.settingLabel, themeStyles.text]}>Blocked Users</Text>
              </View>
              <ChevronRight size={18} color={themeColors.neutral.subtext} />
            </TouchableOpacity>

            {/* Admin: In-app songs (Nomli Mingle Original) */}
            {isAdmin && (
              <TouchableOpacity 
                style={styles.compactSettingRow}
                onPress={() => router.push('/settings/app-music')}
              >
                <View style={styles.settingLeft}>
                  <Music size={18} color={themeColors.neutral.text} />
                  <Text style={[styles.settingLabel, themeStyles.text]}>In-app songs</Text>
                </View>
                <ChevronRight size={18} color={themeColors.neutral.subtext} />
              </TouchableOpacity>
            )}

            {/* Biometric Login */}
            {isBiometricAvailable && (
              <View style={styles.compactSettingRow}>
                <View style={styles.settingLeft}>
                  <Fingerprint size={18} color={themeColors.neutral.text} />
                  <Text style={[styles.settingLabel, themeStyles.text]}>Biometric Login</Text>
                </View>
                <View style={styles.switchWrapper}>
                  <Switch
                    value={useBiometrics}
                    onValueChange={toggleBiometrics}
                    trackColor={{ false: themeColors.neutral.border, true: Colors.primary.light }}
                    thumbColor={useBiometrics ? Colors.primary.main : themeColors.neutral.card}
                  />
                </View>
              </View>
            )}
          </View>


          {/* Legal Section - Links to website */}
          <View style={styles.settingsCard}>
            <Text style={[styles.cardTitle, themeStyles.text]}>Legal</Text>
            <TouchableOpacity 
              style={styles.compactSettingRow}
              onPress={() => Linking.openURL('https://www.nomlimingle.com/terms')}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <FileText size={18} color={themeColors.neutral.text} />
                <Text style={[styles.settingLabel, themeStyles.text]}>Terms of Service</Text>
              </View>
              <ChevronRight size={18} color={themeColors.neutral.subtext} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.compactSettingRow}
              onPress={() => Linking.openURL('https://www.nomlimingle.com/privacy')}
              activeOpacity={0.7}
            >
              <View style={styles.settingLeft}>
                <Shield size={18} color={themeColors.neutral.text} />
                <Text style={[styles.settingLabel, themeStyles.text]}>Privacy Policy</Text>
              </View>
              <ChevronRight size={18} color={themeColors.neutral.subtext} />
            </TouchableOpacity>
          </View>
          
          {/* Logout Button - Compact */}
          <TouchableOpacity 
            style={[styles.logoutButton, { 
              backgroundColor: themeColors.neutral.card,
              borderColor: Colors.error.light
            }]}
            onPress={handleLogout}
            disabled={loading}
            activeOpacity={0.7}
          >
            <LogOut size={16} color={Colors.error.main} />
            <Text style={styles.logoutText}>
              {loading ? 'Logging out...' : 'Log Out'}
            </Text>
          </TouchableOpacity>

          {/* Danger Zone - Separated and distinct */}
          <View style={[styles.dangerZoneContainer, { 
            backgroundColor: isDarkMode ? 'rgba(220, 38, 38, 0.05)' : 'rgba(220, 38, 38, 0.03)',
            borderColor: isDarkMode ? 'rgba(220, 38, 38, 0.3)' : 'rgba(220, 38, 38, 0.2)'
          }]}>
            <View style={styles.dangerZoneHeader}>
              <AlertCircle size={14} color={Colors.error.main} />
              <Text style={[styles.dangerZoneTitle, { color: Colors.error.main }]}>Danger Zone</Text>
            </View>
            <Text style={[styles.dangerZoneWarning, themeStyles.subtext]}>
              This action cannot be undone. Please be certain.
            </Text>
            <TouchableOpacity 
              style={[styles.dangerButton, { 
                backgroundColor: Colors.error.main,
                borderColor: Colors.error.dark
              }]}
              onPress={handleDeleteAccount}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Trash2 size={14} color="#FFFFFF" />
              <Text style={styles.dangerButtonText}>Delete Account Permanently</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    ...GlobalStyles.container,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: 16,
  },
  backButton: {
    padding: 0,
  },
  backButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  headerRight: {
    width: 36, // Same width as back button for perfect center alignment
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.medium,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
  },
  settingAction: {
    marginLeft: Spacing.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  logoutText: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    color: Colors.error.main,
    letterSpacing: -0.2,
  },
  dangerZoneContainer: {
    marginTop: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  dangerZoneTitle: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    letterSpacing: -0.2,
  },
  dangerZoneWarning: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    marginBottom: 10,
    lineHeight: 16,
    letterSpacing: -0.1,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 0,
    gap: 6,
    shadowColor: Colors.error.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  dangerButtonText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  // Unavailable item
  unavailableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
    opacity: 0.6,
  },
  // Quick Actions Grid - Enhanced Apple-style
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
    rowGap: 8,
  },
  quickActionButton: {
    width: '48.5%',
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  quickActionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  quickActionTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: FontFamily.semibold,
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  pivotCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  pivotTitle: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  pivotBody: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
    marginBottom: 10,
  },
  pivotButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pivotButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.2,
  },
  // Settings Cards - Premium Apple-style
  settingsCard: {
    backgroundColor: 'transparent',
    marginBottom: 22,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    marginBottom: 8,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.6,
  },
  compactSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderRadius: 12,
    marginBottom: 2,
    minHeight: 42,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    gap: 8,
  },
  settingLeftTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  switchWrapper: {
    marginLeft: 4,
    transform: [{ scale: 0.82 }],
  },
  settingLabel: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    letterSpacing: -0.3,
  },
  settingSublabel: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: FontFamily.regular,
  },
}); 