/**
 * Lightweight music bubble for stories (Instagram/TikTok style).
 * Small pill with light text, semi-transparent background.
 * Playback limited to 15 seconds.
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Audio } from 'expo-av';
import { Music2, Play, Pause } from 'lucide-react-native';
import { FontFamily } from '../constants/Theme';

const BAR_COUNT = 4;
const BAR_WIDTH = 3;
const BAR_MIN_H = 4;
const BAR_MAX_H = 14;

const BAR_WIDTH_SM = 2;
const BAR_MAX_H_SM = 10;

function MusicWaveBars({ isPlaying, compact }: { isPlaying: boolean; compact?: boolean }) {
  const w = compact ? BAR_WIDTH_SM : BAR_WIDTH;
  const h = compact ? BAR_MAX_H_SM : BAR_MAX_H;
  const anims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.4))
  ).current;

  useEffect(() => {
    if (!isPlaying) {
      anims.forEach((a) => a.setValue(0.4));
      return;
    }
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.9,
            duration: 200 + i * 80,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: 200 + i * 80,
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [isPlaying]);

  return (
    <View style={[waveStyles.container, compact && { height: h, gap: 2 }]}>
      {anims.map((anim, i) => (
        <View key={i} style={[waveStyles.barWrap, { width: w, height: h }]}>
          <Animated.View
            style={[
              waveStyles.bar,
              { width: w, height: h, borderRadius: compact ? 1 : 2 },
              {
                transform: [
                  { scaleY: anim },
                  { translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [h * 0.5, 0],
                  }) },
                ],
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: BAR_MAX_H,
  },
  barWrap: {
    width: BAR_WIDTH,
    height: BAR_MAX_H,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_MAX_H,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
});

const STORY_MUSIC_DURATION_MS = 15 * 1000; // 15 seconds

interface StoryMusicBubbleProps {
  audioUrl: string;
  title?: string;
  artist?: string;
  /** When true, start playing as soon as the story is shown */
  autoPlay?: boolean;
  /** Smaller size for header placement */
  compact?: boolean;
}

export function StoryMusicBubble({ audioUrl, title, artist, autoPlay, compact }: StoryMusicBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoPlayedRef = useRef(false);

  const clearStopTimeout = () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  };

  const loadAndPlay = async () => {
    if (!audioUrl?.trim()) return;
    try {
      setIsLoading(true);
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      clearStopTimeout();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      setIsLoading(false);

      // Stop after 15 seconds
      stopTimeoutRef.current = setTimeout(async () => {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        setIsPlaying(false);
        stopTimeoutRef.current = null;
      }, STORY_MUSIC_DURATION_MS);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinishAndNotStopped) {
          clearStopTimeout();
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          setIsPlaying(false);
        }
      });
    } catch {
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  const toggle = async () => {
    if (isLoading) return;
    if (isPlaying && soundRef.current) {
      clearStopTimeout();
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.playAsync();
      setIsPlaying(true);
      stopTimeoutRef.current = setTimeout(async () => {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        setIsPlaying(false);
        stopTimeoutRef.current = null;
      }, STORY_MUSIC_DURATION_MS);
      return;
    }
    await loadAndPlay();
  };

  // Auto-play when story opens
  useEffect(() => {
    if (autoPlay && audioUrl?.trim() && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      loadAndPlay();
    }
    return () => {
      hasAutoPlayedRef.current = false;
    };
  }, [audioUrl, autoPlay]);

  useEffect(() => {
    return () => {
      clearStopTimeout();
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [audioUrl]);

  const label = [title || 'Music', artist].filter(Boolean).join(' · ');

  const iconSize = compact ? 12 : 14;
  return (
    <TouchableOpacity
      onPress={toggle}
      disabled={!!isLoading}
      style={[styles.bubble, compact && styles.bubbleCompact]}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
      ) : isPlaying ? (
        <MusicWaveBars isPlaying={true} compact={compact} />
      ) : (
        <Music2 size={iconSize} color="rgba(255,255,255,0.95)" strokeWidth={2.5} />
      )}
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
        {label || 'Music'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    gap: 8,
    maxWidth: 200,
  },
  bubbleCompact: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
    gap: 6,
    maxWidth: 160,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 13,
    fontFamily: FontFamily.medium,
  },
  labelCompact: {
    fontSize: 11,
  },
});
