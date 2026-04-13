import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Volume2, VolumeX, Sparkles } from 'lucide-react-native';

interface LiveStreamInteractionsProps {
  streamId: string;
  isStreamer?: boolean;
  soundsEnabled: boolean;
  onToggleSounds: () => void;
  onInteractionSent?: (type: 'honk' | 'applause') => void;
  hasGuests?: boolean;
}

export default function LiveStreamInteractions({
  streamId,
  isStreamer = false,
  soundsEnabled,
  onToggleSounds,
  onInteractionSent,
  hasGuests = false,
}: LiveStreamInteractionsProps) {
  const [honkCooldown, setHonkCooldown] = useState(false);
  const [applauseCooldown, setApplauseCooldown] = useState(false);
  
  const honkScaleAnim = useRef(new Animated.Value(1)).current;
  const applauseScaleAnim = useRef(new Animated.Value(1)).current;

  const sendInteraction = (type: 'honk' | 'applause') => {
    // Cooldown check
    if ((type === 'honk' && honkCooldown) || (type === 'applause' && applauseCooldown)) {
      return;
    }

    // Set cooldown
    if (type === 'honk') {
      setHonkCooldown(true);
      setTimeout(() => setHonkCooldown(false), 500); // 500ms cooldown
    } else {
      setApplauseCooldown(true);
      setTimeout(() => setApplauseCooldown(false), 1000); // 1s cooldown for applause
    }

    // Smooth bounce animation
    const anim = type === 'honk' ? honkScaleAnim : applauseScaleAnim;
    Animated.sequence([
      Animated.spring(anim, {
        toValue: 0.8,
        tension: 200,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.spring(anim, {
        toValue: 1,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    // Soothing haptic feedback
    if (Platform.OS === 'ios') {
      // Light, gentle haptic
      if (type === 'honk') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      // Gentle vibration for Android
      require('react-native').Vibration.vibrate(type === 'honk' ? 30 : 20);
    }

    // Just trigger the sound/callback, no database saving
    if (onInteractionSent) {
      onInteractionSent(type);
    }
  };

  if (isStreamer) {
    const buttonSize = hasGuests ? 20 : 24;
    
    // Streamer view: Show honk and applause buttons (vertical layout)
    return (
      <>
        <Animated.View style={{ transform: [{ scale: honkScaleAnim }] }}>
          <TouchableOpacity
            onPress={() => sendInteraction('honk')}
            disabled={honkCooldown}
            style={[
              styles.streamerButton,
              hasGuests && styles.streamerButtonCompact,
              styles.honkButton,
              honkCooldown && styles.buttonDisabled,
            ]}
            activeOpacity={0.8}
          >
            <Volume2 size={buttonSize} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: applauseScaleAnim }] }}>
          <TouchableOpacity
            onPress={() => sendInteraction('applause')}
            disabled={applauseCooldown}
            style={[
              styles.streamerButton,
              hasGuests && styles.streamerButtonCompact,
              styles.applauseButton,
              applauseCooldown && styles.buttonDisabled,
            ]}
            activeOpacity={0.8}
          >
            <Sparkles size={buttonSize} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  }

  // Viewer view: No buttons (viewers don't need sound toggle)
  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streamerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  streamerButtonCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 6,
  },
  honkButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.85)', // Red/Orange (horn color)
  },
  applauseButton: {
    backgroundColor: 'rgba(255, 214, 10, 0.85)', // Gold/Yellow (sparkle color)
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  soundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
});

