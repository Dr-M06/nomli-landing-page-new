import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Wifi, WifiOff, Radio } from 'lucide-react-native';
import { getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';

interface LiveStreamVideoFallbackProps {
  /** Network quality (0-6, where 0=unknown, 1=bad, 2=poor, 3=fair, 4=good, 5=very good, 6=excellent) */
  networkQuality?: number;
  /** Whether video is enabled */
  videoEnabled?: boolean;
  /** Whether audio is playing */
  audioPlaying?: boolean;
  /** Streamer's avatar URL for fallback display */
  streamerAvatarUrl?: string;
  /** Streamer's username */
  streamerUsername?: string;
  /** Custom message */
  message?: string;
  /** When true, show "Stream ended" status and hide poor-network tip (e.g. host ended the stream) */
  streamEnded?: boolean;
}

/**
 * Fallback UI for livestream when video fails or network is poor
 * Shows audio-only mode, connection status, and helpful messages
 * Based on how YouTube, Twitch, Instagram handle poor connections
 */
export default function LiveStreamVideoFallback({
  networkQuality = 0,
  videoEnabled = false,
  audioPlaying = false,
  streamerAvatarUrl,
  streamerUsername,
  message,
  streamEnded = false,
}: LiveStreamVideoFallbackProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showMessage, setShowMessage] = useState(true);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Auto-hide message after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowMessage(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const getConnectionStatus = () => {
    if (streamEnded) return { text: 'Stream ended', icon: Radio, color: '#FFFFFF' };
    if (networkQuality === 0) return { text: 'Checking connection...', icon: Radio, color: '#FFA500' };
    if (networkQuality <= 2) return { text: 'Poor connection', icon: WifiOff, color: '#FF4444' };
    if (networkQuality <= 3) return { text: 'Fair connection', icon: Wifi, color: '#FFA500' };
    return { text: 'Good connection', icon: Wifi, color: '#44FF44' };
  };

  const status = getConnectionStatus();
  const StatusIcon = status.icon;

  const getMessage = () => {
    if (message) return message;
    if (!videoEnabled && audioPlaying) {
      return 'Audio-only mode\nVideo unavailable due to poor connection';
    }
    if (networkQuality <= 2) {
      return 'Poor connection detected\nSwitching to lower quality...';
    }
    if (!videoEnabled) {
      return 'Waiting for video stream...';
    }
    return 'Connecting to stream...';
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
      {/* Gradient overlay for better text visibility */}
      <View style={styles.gradientOverlay} />
      
      {/* Streamer avatar or icon */}
      <Animated.View style={[styles.avatarContainer, { opacity: pulseAnim }]}>
        {streamerAvatarUrl ? (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {streamerUsername?.charAt(0).toUpperCase() || 'L'}
            </Text>
          </View>
        ) : (
          <StatusIcon size={64} color={status.color} />
        )}
      </Animated.View>

      {/* Connection status */}
      {showMessage && (
        <View style={styles.statusContainer}>
          <StatusIcon size={20} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.text}
          </Text>
        </View>
      )}

      {/* Main message */}
      <Text style={[styles.message, { color: themeColors.neutral.text }]}>
        {getMessage()}
      </Text>

      {/* Audio indicator */}
      {audioPlaying && !videoEnabled && (
        <View style={styles.audioIndicator}>
          <View style={styles.audioBar} />
          <View style={[styles.audioBar, { animationDelay: '0.1s' }]} />
          <View style={[styles.audioBar, { animationDelay: '0.2s' }]} />
          <Text style={[styles.audioText, { color: themeColors.neutral.textSecondary }]}>
            🔊 Audio is playing
          </Text>
        </View>
      )}

      {/* Helpful tip - hide when stream ended (host left, not user's network) */}
      {!streamEnded && networkQuality <= 2 && (
        <Text style={[styles.tip, { color: themeColors.neutral.textSecondary }]}>
          💡 Tip: Move closer to WiFi or try a different network
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  avatarContainer: {
    marginBottom: 24,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  audioIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  audioBar: {
    width: 4,
    height: 20,
    backgroundColor: '#44FF44',
    marginHorizontal: 2,
    borderRadius: 2,
  },
  audioText: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  tip: {
    marginTop: 24,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
