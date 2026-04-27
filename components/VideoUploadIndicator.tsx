import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, RefreshCw } from 'lucide-react-native';
import { useVideoUploadOptional } from '../contexts/VideoUploadContext';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontSizes, FontFamily, Spacing } from '../constants/Theme';

/** Minimal top-of-screen upload progress — thin stripe, not a large card. */
export default function VideoUploadIndicator() {
  const videoUpload = useVideoUploadOptional();
  if (!videoUpload) {
    return null;
  }
  const { uploads, cancelUpload, retryUpload } = videoUpload;
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();

  const activeUploads = uploads.filter(
    (upload) =>
      upload.status === 'queued' ||
      upload.status === 'compressing' ||
      upload.status === 'uploading' ||
      upload.status === 'processing' ||
      (upload.status === 'failed' && Date.now() - upload.createdAt < 10000) ||
      (upload.status === 'completed' && Date.now() - upload.createdAt < 4000)
  );

  if (activeUploads.length === 0) return null;

  const latestUpload = activeUploads[activeUploads.length - 1];
  const pct = Math.max(0, Math.min(100, Math.round(latestUpload.progress)));
  const isFailed = latestUpload.status === 'failed';
  const isDone = latestUpload.status === 'completed';
  const showDismiss =
    latestUpload.status === 'queued' ||
    latestUpload.status === 'compressing' ||
    latestUpload.status === 'uploading' ||
    latestUpload.status === 'processing';

  const fillColor = isFailed
    ? themeColors.error.main
    : isDone
      ? themeColors.success.main
      : themeColors.primary.main;

  const trackBg = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  return (
    <View
      style={[
        styles.container,
        {
          top: insets.top + 4,
          paddingHorizontal: Spacing.md,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <View style={[styles.track, { backgroundColor: trackBg }]}>
          <View
            style={[
              styles.fill,
              {
                width: `${isFailed ? 100 : pct}%`,
                backgroundColor: fillColor,
              },
            ]}
          />
        </View>
        {showDismiss && (
          <TouchableOpacity
            accessibilityLabel="Cancel upload"
            onPress={() => cancelUpload(latestUpload.id)}
            style={styles.iconHit}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={15} color={themeColors.neutral.textSecondary} strokeWidth={2.2} />
          </TouchableOpacity>
        )}
        {isFailed && (
          <TouchableOpacity
            accessibilityLabel="Retry upload"
            onPress={() => retryUpload(latestUpload.id)}
            style={styles.iconHit}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <RefreshCw size={15} color={themeColors.primary.main} strokeWidth={2.2} />
          </TouchableOpacity>
        )}
        {!showDismiss && !isFailed && isDone && (
          <Text style={[styles.pct, { color: themeColors.neutral.textSecondary }]}>✓</Text>
        )}
        {showDismiss && (
          <Text style={[styles.pct, { color: themeColors.neutral.textSecondary }]}>{pct}%</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10000,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  iconHit: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pct: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    minWidth: 30,
    textAlign: 'right',
  },
});
