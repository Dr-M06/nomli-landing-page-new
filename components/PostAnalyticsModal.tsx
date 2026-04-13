import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Eye, TrendingUp } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PostAnalyticsModalProps {
  visible: boolean;
  onClose: () => void;
  viewsCount: number;
  postType: 'video' | 'photo';
}

export default function PostAnalyticsModal({
  visible,
  onClose,
  viewsCount,
  postType,
}: PostAnalyticsModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const [canClose, setCanClose] = useState(false);
  
  // Prevent immediate closing - allow backdrop taps only after modal is fully visible
  useEffect(() => {
    if (visible) {
      // Reset canClose when modal opens
      setCanClose(false);
      // Allow closing after animation completes (300ms for fade animation)
      const timer = setTimeout(() => {
        setCanClose(true);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      // Reset when modal closes
      setCanClose(false);
    }
  }, [visible]);

  const formatViews = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={canClose ? onClose : undefined}
          disabled={!canClose}
        />
        
        {Platform.OS === 'ios' ? (
          <BlurView intensity={95} tint={isDarkMode ? 'dark' : 'light'} style={styles.blurContainer}>
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={[
                styles.modalContent,
                {
                  backgroundColor: isDarkMode ? 'rgba(20, 20, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  paddingBottom: Math.max(insets.bottom, 20),
                }
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: `${themeColors.primary.main}20` }]}>
                    <TrendingUp size={24} color={themeColors.primary.main} />
                  </View>
                  <Text style={[styles.title, { color: themeColors.text }]}>
                    Post Analytics
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <X size={24} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <View style={styles.content}>
                <View style={styles.analyticsCard}>
                  <View style={[styles.iconCircle, { backgroundColor: `${themeColors.primary.main}15` }]}>
                    <Eye size={32} color={themeColors.primary.main} />
                  </View>
                  
                  <Text style={[styles.mainText, { color: themeColors.text }]}>
                    This is how many people viewed your {postType}
                  </Text>
                  
                  <View style={styles.viewCountContainer}>
                    <Text style={[styles.viewCount, { color: themeColors.primary.main }]}>
                      {formatViews(viewsCount)}
                    </Text>
                    <Text style={[styles.viewLabel, { color: themeColors.textSecondary }]}>
                      {viewsCount === 1 ? 'view' : 'views'}
                    </Text>
                  </View>

                  <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: themeColors.text }]}>
                        {formatViews(viewsCount)}
                      </Text>
                      <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                        Total Views
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Close Button */}
              <TouchableOpacity
                style={[styles.doneButton, { backgroundColor: themeColors.primary.main }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </Animated.View>
          </BlurView>
        ) : (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={[
              styles.modalContent,
              {
                backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
                paddingBottom: Math.max(insets.bottom, 20),
              }
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={[styles.iconContainer, { backgroundColor: `${themeColors.primary.main}20` }]}>
                  <TrendingUp size={24} color={themeColors.primary.main} />
                </View>
                <Text style={[styles.title, { color: themeColors.text }]}>
                  Post Analytics
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <View style={styles.analyticsCard}>
                <View style={[styles.iconCircle, { backgroundColor: `${themeColors.primary.main}15` }]}>
                  <Eye size={32} color={themeColors.primary.main} />
                </View>
                
                <Text style={[styles.mainText, { color: themeColors.text }]}>
                  This is how many people viewed your {postType}
                </Text>
                
                <View style={styles.viewCountContainer}>
                  <Text style={[styles.viewCount, { color: themeColors.primary.main }]}>
                    {formatViews(viewsCount)}
                  </Text>
                  <Text style={[styles.viewLabel, { color: themeColors.textSecondary }]}>
                    {viewsCount === 1 ? 'view' : 'views'}
                  </Text>
                </View>

                <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: themeColors.text }]}>
                      {formatViews(viewsCount)}
                    </Text>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                      Total Views
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Close Button */}
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: themeColors.primary.main }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  blurContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    width: '100%',
    ...(Platform.OS === 'android' && {
      elevation: 24,
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  analyticsCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  mainText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  viewCountContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  viewCount: {
    fontSize: 48,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  viewLabel: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  doneButton: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
});

