import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

const SLIDE_DISTANCE = 110;
const AUTO_DISMISS_MS = 4000;
const ANNOUNCEMENT_Z = 10025;

type Props = {
  visible: boolean;
  username?: string;
  fullName?: string;
  avatarUrl?: string | null;
  onDismiss?: () => void;
};

export default function ViewerJoinAnnouncement({
  visible,
  username,
  fullName,
  avatarUrl,
  onDismiss,
}: Props) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();

  const [show, setShow] = useState(false);
  const translateY = useRef(new Animated.Value(-SLIDE_DISTANCE)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const exitingRef = useRef(false);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisibleRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const clearAutoDismiss = () => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const runExit = (callOnDismiss: boolean) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      clearAutoDismiss();

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -SLIDE_DISTANCE,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        exitingRef.current = false;
        wasVisibleRef.current = false;
        setShow(false);
        if (callOnDismiss) onDismissRef.current?.();
      });
    };

    if (visible) {
      exitingRef.current = false;
      clearAutoDismiss();
      wasVisibleRef.current = true;
      setShow(true);
      translateY.setValue(-SLIDE_DISTANCE);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          tension: 68,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();

      autoDismissTimerRef.current = setTimeout(() => {
        autoDismissTimerRef.current = null;
        if (!cancelled) runExit(true);
      }, AUTO_DISMISS_MS);
    } else if (wasVisibleRef.current) {
      runExit(false);
    }

    return () => {
      cancelled = true;
      clearAutoDismiss();
    };
  }, [visible, username, fullName, avatarUrl]);

  const dismissFromTap = () => {
    clearAutoDismiss();
    if (exitingRef.current) return;
    exitingRef.current = true;

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -SLIDE_DISTANCE,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      exitingRef.current = false;
      wasVisibleRef.current = false;
      setShow(false);
      onDismissRef.current?.();
    });
  };

  if (!show) return null;

  const displayName = (fullName && fullName.trim()) || (username && username.trim()) || 'Someone';
  const displayHandle = username ? `@${username.replace(/^@/, '')}` : undefined;
  const topOffset = Math.max(insets.top, 12) + 6;

  return (
    <Pressable
      onPress={dismissFromTap}
      style={[styles.wrapper, { top: topOffset }]}
      accessibilityRole="button"
      accessibilityLabel="Dismiss join announcement"
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.94)',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.28)' : themeColors.border,
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        <View style={styles.row}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : themeColors.neutral.surfaceVariant,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.35)' : themeColors.border,
              },
            ]}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarFallbackText, { color: isDarkMode ? '#fff' : themeColors.textSecondary }]}>
                {displayName.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>

          <View style={styles.textCol}>
            <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : themeColors.text }]} numberOfLines={1}>
              {displayName}
              <Text style={[styles.titleJoined, { color: isDarkMode ? 'rgba(255,255,255,0.82)' : themeColors.textSecondary }]}>
                {' '}
                joined
              </Text>
            </Text>
            {displayHandle ? (
              <Text
                style={[styles.subtitle, { color: isDarkMode ? 'rgba(255,255,255,0.65)' : themeColors.textSecondary }]}
                numberOfLines={1}
              >
                {displayHandle}
              </Text>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
    zIndex: ANNOUNCEMENT_Z,
    elevation: 24,
  },
  container: {
    maxWidth: 248,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    paddingRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarImage: {
    width: 28,
    height: 28,
  },
  avatarFallbackText: {
    fontSize: 12,
    fontWeight: '700',
  },
  textCol: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 190,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
  },
  titleJoined: {
    fontSize: 12,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 0,
    fontSize: 10,
    fontWeight: '600',
  },
});
