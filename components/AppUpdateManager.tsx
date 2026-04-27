import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Image, Alert } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  backgroundUpdateCheck,
  checkForAppUpdate,
  showUpdateAlert,
  handleUpdateNotificationResponse,
  openStore,
  dismissUpdate,
  clearUpdateStorage,
  getUpdateStatus,
  getCurrentVersion
} from '../utils/appUpdateChecker';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';


interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  needsUpdate: boolean;
  storeUrl: string;
  isForceUpdate?: boolean;
  updateAvailable: boolean;
}

export default function AppUpdateManager() {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!user) return;

    log('🔄 AppUpdateManager initialized for user:', user.id);
    
    // Set up notification response listener for update notifications
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.type === 'app_update') {
          handleUpdateNotificationResponse(response.notification);
        }
      }
    );

    // Check for updates immediately when component mounts
    performUpdateCheck();

    // Set up periodic background checks (every app launch)
    const interval = setInterval(() => {
      backgroundUpdateCheck();
    }, 60000); // Check every minute (adjust as needed)

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [user]);

  const performUpdateCheck = async () => {
    try {
      setIsChecking(true);
      log('🔄 Performing manual update check...');
      
      const result = await checkForAppUpdate();
      
      if (result.updateInfo && result.updateInfo.updateAvailable) {
        setUpdateInfo(result.updateInfo);
        
        // For force updates, show modal immediately
        if (result.updateInfo.isForceUpdate) {
          setShowUpdateModal(true);
        } else if (result.shouldShowNotification) {
          // For optional updates, show a subtle modal
          setShowUpdateModal(true);
        }
      }
    } catch (error) {
      error('❌ Error performing update check:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdateNow = () => {
    if (updateInfo) {
      openStore(updateInfo.storeUrl);
      setShowUpdateModal(false);
    }
  };

  const handleLater = async () => {
    if (updateInfo && !updateInfo.isForceUpdate) {
      await dismissUpdate(updateInfo.latestVersion);
      setShowUpdateModal(false);
      setUpdateInfo(null);
    }
  };

  const handleCloseModal = () => {
    // Only allow closing if not a force update
    if (updateInfo && !updateInfo.isForceUpdate) {
      setShowUpdateModal(false);
    }
  };



  if (!updateInfo || !showUpdateModal) {
    return null;
  }

  return (
    <Modal
      visible={showUpdateModal}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCloseModal}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: updateInfo.isForceUpdate ? '#FF6B6B' : colors.primary }]}>
              <Ionicons 
                name={updateInfo.isForceUpdate ? "warning" : "download"} 
                size={32} 
                color="white" 
              />
            </View>
            
            {!updateInfo.isForceUpdate && (
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={handleCloseModal}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>
              {updateInfo.isForceUpdate ? '🚨 Required Update' : '🆕 Update Available'}
            </Text>
            
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Version {updateInfo.latestVersion}
            </Text>

            <Text style={[styles.description, { color: colors.text }]}>
              {updateInfo.isForceUpdate 
                ? `A critical update is required to continue using Nomli Mingle. Your current version (${updateInfo.currentVersion}) is no longer supported.`
                : `A new version of Nomli Mingle is available with exciting new features and improvements! Update from version ${updateInfo.currentVersion} to ${updateInfo.latestVersion}.`
              }
            </Text>

            {updateInfo.isForceUpdate && (
              <View style={[styles.warningBox, { backgroundColor: '#FFF3CD', borderColor: '#FFEAA7' }]}>
                <Ionicons name="warning" size={20} color="#856404" />
                <Text style={[styles.warningText, { color: '#856404' }]}>
                  You must update to continue using the app
                </Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {!updateInfo.isForceUpdate && (
              <TouchableOpacity 
                style={[styles.laterButton, { borderColor: colors.border }]}
                onPress={handleLater}
              >
                <Text style={[styles.laterButtonText, { color: colors.textSecondary }]}>
                  Later
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={[
                styles.updateButton, 
                { backgroundColor: updateInfo.isForceUpdate ? '#FF6B6B' : colors.primary },
                !updateInfo.isForceUpdate && styles.updateButtonHalf
              ]}
              onPress={handleUpdateNow}
            >
              <Ionicons name="download" size={20} color="white" style={styles.updateButtonIcon} />
              <Text style={styles.updateButtonText}>
                Update Now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    position: 'relative',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  warningText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    padding: 24,
    paddingTop: 0,
    gap: 12,
  },
  laterButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  laterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  updateButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  updateButtonHalf: {
    flex: 1,
  },
  updateButtonIcon: {
    marginRight: 8,
  },
  updateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
