import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, CheckCircle, AlertCircle } from 'lucide-react-native';

interface GuestJoinLoadingOverlayProps {
  visible: boolean;
  stage: 'countdown' | 'connecting' | 'joining' | 'synchronizing' | 'success' | 'error';
  errorMessage?: string;
  progress?: number; // 0-100
  countdown?: number; // Countdown number (3, 2, 1)
}

export default function GuestJoinLoadingOverlay({
  visible,
  stage,
  errorMessage,
  progress = 0,
  countdown,
}: GuestJoinLoadingOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const countdownScaleAnim = useRef(new Animated.Value(1)).current;
  const countdownOpacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Animate countdown number
  useEffect(() => {
    if (stage === 'countdown' && countdown !== undefined) {
      // Reset animations
      countdownScaleAnim.setValue(0.5);
      countdownOpacityAnim.setValue(0);
      
      // Animate in
      Animated.parallel([
        Animated.spring(countdownScaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(countdownOpacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [stage, countdown]);

  if (!visible) return null;

  const getStageInfo = () => {
    switch (stage) {
      case 'countdown':
        return {
          icon: Users,
          title: countdown ? `Joining in ${countdown}...` : 'Preparing to join...',
          message: 'Get ready to join the stream',
          color: '#FFD60A',
        };
      case 'connecting':
        return {
          icon: Users,
          title: 'Connecting...',
          message: 'Establishing connection to stream',
          color: '#FFD60A',
        };
      case 'joining':
        return {
          icon: Users,
          title: 'Joining as Guest',
          message: 'Setting up your video and audio',
          color: '#34C759',
        };
      case 'synchronizing':
        return {
          icon: Users,
          title: 'Synchronizing',
          message: 'Syncing with other participants',
          color: '#007AFF',
        };
      case 'success':
        return {
          icon: CheckCircle,
          title: 'Connected!',
          message: 'You\'re now a guest in the stream',
          color: '#34C759',
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: 'Connection Failed',
          message: errorMessage || 'Unable to join as guest',
          color: '#FF3B30',
        };
      default:
        return {
          icon: Users,
          title: 'Loading...',
          message: 'Please wait',
          color: '#FFD60A',
        };
    }
  };

  const stageInfo = getStageInfo();
  const Icon = stageInfo.icon;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <BlurView intensity={20} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.9)', 'rgba(0, 0, 0, 0.8)']}
          style={styles.content}
        >
          {stage === 'countdown' && countdown !== undefined ? (
            <>
              <Animated.View
                style={[
                  styles.countdownContainer,
                  {
                    transform: [{ scale: countdownScaleAnim }],
                    opacity: countdownOpacityAnim,
                  },
                ]}
              >
                <Text style={[styles.countdownNumber, { color: stageInfo.color }]}>
                  {countdown}
                </Text>
              </Animated.View>
              <Text style={styles.title}>{stageInfo.title}</Text>
              <Text style={styles.message}>{stageInfo.message}</Text>
            </>
          ) : (
            <>
              <View style={[styles.iconContainer, { backgroundColor: `${stageInfo.color}20` }]}>
                {stage === 'success' || stage === 'error' ? (
                  <Icon size={48} color={stageInfo.color} strokeWidth={2} />
                ) : (
                  <ActivityIndicator size="large" color={stageInfo.color} />
                )}
              </View>
              <Text style={styles.title}>{stageInfo.title}</Text>
              <Text style={styles.message}>{stageInfo.message}</Text>
            </>
          )}

          {(stage === 'connecting' || stage === 'joining' || stage === 'synchronizing') && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor: stageInfo.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  container: {
    width: '80%',
    maxWidth: 320,
  },
  content: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  countdownContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(255, 214, 10, 0.15)',
    borderWidth: 3,
    borderColor: '#FFD60A',
  },
  countdownNumber: {
    fontSize: 64,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
});

