import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause } from 'lucide-react-native';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';

/** Headless: auto-play when visible, stop when not. No UI. Use for text/photo posts with music (Facebook-style). */
export function PostAudioAutoPlay({ audioUrl, isVisible }: { audioUrl: string; isVisible: boolean }) {
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (!audioUrl?.trim()) return;
    if (!isVisible) {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
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
        if (cancelled) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        });
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [audioUrl, isVisible]);

  return null;
}

interface PostMusicStripProps {
  audioUrl: string;
  title?: string;
  artist?: string;
  themeColors: any;
  /** Tighter strip for inside story-style cards */
  compact?: boolean;
  style?: ViewStyle;
}

export function PostMusicStrip({ audioUrl, title, artist, themeColors, compact, style }: PostMusicStripProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const loadAndPlay = async () => {
    if (!audioUrl?.trim()) return;
    try {
      setIsLoading(true);
      setError(null);
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
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
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinishAndNotStopped) {
          setIsPlaying(false);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (e) {
      setError('Could not play');
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  const toggle = async () => {
    if (isLoading) return;
    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.playAsync();
      setIsPlaying(true);
      return;
    }
    await loadAndPlay();
  };

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [audioUrl]);

  return (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border },
        style,
      ]}
    >
      <TouchableOpacity
        onPress={toggle}
        disabled={!!error}
        style={[
          styles.playBtn,
          compact && styles.playBtnCompact,
          { backgroundColor: themeColors.primary.main },
        ]}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          isPlaying ? (
            <Pause size={compact ? 14 : 18} color="#fff" />
          ) : (
            <Play size={compact ? 14 : 18} color="#fff" />
          )
        )}
      </TouchableOpacity>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>
          {title || 'Track'}
        </Text>
        <Text style={[styles.artist, { color: themeColors.textSecondary }]} numberOfLines={1}>
          {artist || 'Music'}
        </Text>
      </View>
      {error ? (
        <Text style={[styles.error, { color: themeColors.error?.main || '#FF3B30' }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  containerCompact: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  playBtnCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: Spacing.xs,
  },
  textWrap: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.sm,
  },
  artist: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    marginTop: 2,
  },
  error: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    marginLeft: Spacing.xs,
  },
});
