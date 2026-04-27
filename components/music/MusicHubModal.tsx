import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Music2, Pause, Play, Search, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';
import { getSelectableTracks, type MusicTrack } from '../../constants/musicLibrary';
import { log } from '../../utils/productionLogger';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectTrack?: (track: MusicTrack) => void;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  closeOnSelect?: boolean;
};

const FAV_KEY = 'music_hub_favorites_v1';
const RECENT_KEY = 'music_hub_recent_v1';
const PLAY_COUNT_KEY = 'music_hub_play_counts_v1';
const PREVIEW_LIMIT_MS = 15000;

function getInitials(name?: string | null): string {
  if (!name) return 'N';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'N';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function deriveGenre(track: MusicTrack): string {
  const s = `${track.title} ${track.artist}`.toLowerCase();
  if (s.includes('afro') || s.includes('naija')) return 'Afrobeats';
  if (s.includes('amapiano') || s.includes('piano')) return 'Amapiano';
  if (s.includes('hip') || s.includes('rap') || s.includes('drill')) return 'Hip Hop';
  if (s.includes('r&b') || s.includes('soul') || s.includes('love')) return 'R&B';
  if (s.includes('gospel') || s.includes('worship')) return 'Gospel';
  if (s.includes('chill') || s.includes('calm') || s.includes('ambient')) return 'Chill';
  if (s.includes('dance') || s.includes('club') || s.includes('party')) return 'Dance';
  if (s.includes('pop')) return 'Pop';
  return 'Trending';
}

export default function MusicHubModal({
  visible,
  onClose,
  onSelectTrack,
  title = 'Nomli Music',
  subtitle = 'Find sounds for your vibe',
  ctaLabel = 'Use sound',
  closeOnSelect = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [activeGenre, setActiveGenre] = useState('All');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewBusyId, setPreviewBusyId] = useState<string | null>(null);
  const [showOnlySaved, setShowOnlySaved] = useState(false);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diskSpin = useRef(new Animated.Value(0)).current;

  const stopPreview = useCallback(async () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    const sound = previewSoundRef.current;
    previewSoundRef.current = null;
    setPreviewTrackId(null);
    setPreviewBusyId(null);
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {}
      try {
        await sound.unloadAsync();
      } catch {}
    }
  }, []);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getSelectableTracks();
      setTracks(rows.filter((t) => t.url?.trim()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadTracks();
    AsyncStorage.getItem(FAV_KEY).then((v) => setFavorites(v ? JSON.parse(v) : [])).catch(() => setFavorites([]));
    AsyncStorage.getItem(RECENT_KEY).then((v) => setRecentIds(v ? JSON.parse(v) : [])).catch(() => setRecentIds([]));
    AsyncStorage.getItem(PLAY_COUNT_KEY).then((v) => setPlayCounts(v ? JSON.parse(v) : {})).catch(() => setPlayCounts({}));
  }, [visible, loadTracks]);

  useEffect(() => {
    if (!visible) {
      void stopPreview();
    }
  }, [visible, stopPreview]);

  useEffect(() => {
    if (!previewTrackId) {
      diskSpin.stopAnimation();
      diskSpin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(diskSpin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [previewTrackId, diskSpin]);

  const genres = useMemo(() => {
    const unique = new Set<string>(['All']);
    tracks.forEach((t) => unique.add(deriveGenre(t)));
    return Array.from(unique);
  }, [tracks]);

  const recentOrdered = useMemo(() => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean) as MusicTrack[];
  }, [recentIds, tracks]);

  const filteredTracks = useMemo(() => {
    let base = tracks;
    if (showOnlySaved) {
      const fav = new Set(favorites);
      base = base.filter((t) => fav.has(t.id));
    }
    if (activeGenre !== 'All') {
      base = base.filter((t) => deriveGenre(t) === activeGenre);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      base = base.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q));
    }
    if (activeGenre === 'Trending') {
      base = [...base].sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0));
    }
    return base;
  }, [tracks, showOnlySaved, favorites, activeGenre, query, playCounts]);

  const persistFavorites = useCallback(async (ids: string[]) => {
    setFavorites(ids);
    try {
      await AsyncStorage.setItem(FAV_KEY, JSON.stringify(ids));
    } catch {}
  }, []);

  const persistRecent = useCallback(async (id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 20);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const incrementPlayCount = useCallback((trackId: string) => {
    setPlayCounts((prev) => {
      const next = { ...prev, [trackId]: (prev[trackId] ?? 0) + 1 };
      AsyncStorage.setItem(PLAY_COUNT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    (id: string) => {
      const set = new Set(favorites);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      void persistFavorites(Array.from(set));
    },
    [favorites, persistFavorites]
  );

  const togglePreview = useCallback(
    async (track: MusicTrack) => {
      if (!track.url) return;
      if (previewTrackId === track.id) {
        await stopPreview();
        return;
      }
      await stopPreview();
      setPreviewBusyId(track.id);
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: track.url },
          { shouldPlay: true, isLooping: false, volume: 1 }
        );
        incrementPlayCount(track.id);
        previewSoundRef.current = sound;
        setPreviewTrackId(track.id);
        setPreviewBusyId(null);
        previewTimerRef.current = setTimeout(() => {
          void stopPreview();
        }, PREVIEW_LIMIT_MS);
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded || status.didJustFinish) {
            void stopPreview();
          }
        });
      } catch (e) {
        log('[MusicHub] preview failed', e);
        setPreviewBusyId(null);
      }
    },
    [previewTrackId, stopPreview, incrementPlayCount]
  );

  const chooseTrack = useCallback(
    (track: MusicTrack) => {
      void persistRecent(track.id);
      incrementPlayCount(track.id);
      onSelectTrack?.(track);
      if (closeOnSelect) onClose();
    },
    [onSelectTrack, onClose, persistRecent, incrementPlayCount, closeOnSelect]
  );

  const row = useCallback(
    ({ item }: { item: MusicTrack }) => {
      const isPlaying = previewTrackId === item.id;
      const busy = previewBusyId === item.id;
      const isFav = favorites.includes(item.id);
      return (
        <View style={[styles.row, { borderColor: colors.neutral.border, backgroundColor: colors.neutral.card }]}>
          <LinearGradient colors={['#FF6FAE', '#7C3AED']} style={styles.cover}>
            <Music2 size={16} color="#fff" />
          </LinearGradient>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.neutral.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.rowMeta, { color: colors.neutral.textSecondary }]} numberOfLines={1}>
              {item.artist} · {deriveGenre(item)}
            </Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => toggleFavorite(item.id)} activeOpacity={0.75}>
            <Heart size={17} color={isFav ? '#FF6FAE' : colors.neutral.textSecondary} fill={isFav ? '#FF6FAE' : 'transparent'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => void togglePreview(item)} activeOpacity={0.75}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.primary.main} />
            ) : isPlaying ? (
              <Pause size={18} color={colors.primary.main} />
            ) : (
              <Play size={18} color={colors.primary.main} />
            )}
          </TouchableOpacity>
          {onSelectTrack ? (
            <TouchableOpacity style={[styles.useBtn, { backgroundColor: colors.primary.main }]} onPress={() => chooseTrack(item)} activeOpacity={0.85}>
              <Text style={styles.useBtnText}>{ctaLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    },
    [colors, previewTrackId, previewBusyId, favorites, toggleFavorite, togglePreview, onSelectTrack, chooseTrack, ctaLabel]
  );

  const profileName = user?.user_metadata?.full_name || user?.user_metadata?.username || 'Nomli User';
  const profileAvatar = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: '#0B1220',
            paddingTop: Math.max(insets.top + 8, Spacing.lg),
            paddingBottom: Math.max(insets.bottom + 8, Spacing.md),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {profileAvatar ? (
              <Image source={{ uri: profileAvatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primary.main }]}>
                <Text style={styles.avatarFallbackText}>{getInitials(profileName)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.neutral.text }]}>{title}</Text>
              <Text style={[styles.headerSubtitle, { color: colors.neutral.textSecondary }]}>{subtitle}</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.neutral.border }]} onPress={onClose}>
            <X size={18} color={colors.neutral.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: 'rgba(148,163,184,0.26)', borderColor: 'rgba(148,163,184,0.34)' }]}>
          <Search size={16} color={colors.neutral.textSecondary} />
          <TextInput
            placeholder="Search songs, artists, vibes"
            placeholderTextColor="rgba(226,232,240,0.7)"
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: '#F8FAFC' }]}
          />
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.savedPill, { borderColor: colors.neutral.border, backgroundColor: showOnlySaved ? colors.primary.main : 'transparent' }]}
            onPress={() => setShowOnlySaved((v) => !v)}
          >
            <Text style={[styles.savedPillText, { color: showOnlySaved ? '#fff' : colors.neutral.textSecondary }]}>
              Saved
            </Text>
          </TouchableOpacity>
          <FlatList
            horizontal
            data={genres}
            keyExtractor={(g) => g}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
            renderItem={({ item }) => {
              const active = item === activeGenre;
              return (
                <TouchableOpacity
                  onPress={() => setActiveGenre(item)}
                  style={[
                    styles.genreChip,
                    {
                      borderColor: active ? colors.primary.main : colors.neutral.border,
                      backgroundColor: active ? colors.primary.main : colors.neutral.card,
                    },
                  ]}
                >
                  <Text style={[styles.genreChipText, { color: active ? '#fff' : colors.neutral.textSecondary }]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {recentOrdered.length ? (
          <View style={styles.recentSection}>
            <Text style={[styles.sectionTitle, { color: colors.neutral.text }]}>Recent</Text>
            <FlatList
              horizontal
              data={recentOrdered.slice(0, 8)}
              keyExtractor={(t) => `r-${t.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.recentChip, { borderColor: colors.neutral.border, backgroundColor: colors.neutral.card }]}
                  onPress={() => chooseTrack(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.recentChipText, { color: colors.neutral.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color={colors.primary.main} />
          </View>
        ) : (
          <FlatList
            data={filteredTracks}
            keyExtractor={(item) => item.id}
            renderItem={row}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 168 }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: colors.neutral.textSecondary }]}>No tracks found</Text>
              </View>
            }
          />
        )}

        {previewTrackId ? (
          <View style={styles.floatingPlayerWrap} pointerEvents="box-none">
            <Pressable
              style={[styles.floatingDiskBtn, { borderColor: colors.neutral.border, backgroundColor: 'rgba(51,65,85,0.9)' }]}
              onPress={() => {
                const t = tracks.find((x) => x.id === previewTrackId);
                if (t) void togglePreview(t);
              }}
            >
              <Animated.View
                style={[
                  styles.diskOuter,
                  {
                    transform: [
                      {
                        rotate: diskSpin.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '360deg'],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <LinearGradient colors={['#FF6FAE', '#A855F7']} style={styles.diskGradient}>
                  <View style={styles.diskInner}>
                    <View style={styles.diskHole} />
                  </View>
                </LinearGradient>
              </Animated.View>
              <Pause size={15} color={colors.primary.main} />
            </Pressable>
            <View style={[styles.floatingLabel, { backgroundColor: 'rgba(30,41,59,0.78)', borderColor: colors.neutral.border }]}>
              <Text style={[styles.miniTitle, { color: colors.neutral.text }]} numberOfLines={1}>
                {tracks.find((t) => t.id === previewTrackId)?.title || 'Playing'}
              </Text>
              <Text style={[styles.miniSub, { color: colors.neutral.textSecondary }]}>Previewing</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#fff', fontSize: 12, fontFamily: FontFamily.bold },
  headerTitle: { fontSize: 18, fontFamily: FontFamily.bold },
  headerSubtitle: { marginTop: 2, fontSize: 12, fontFamily: FontFamily.regular },
  closeBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { marginTop: 12, borderWidth: 1, borderRadius: BorderRadius.pill, paddingHorizontal: 12, height: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, fontSize: FontSizes.sm, fontFamily: FontFamily.regular, paddingVertical: 0 },
  filterRow: { marginTop: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  savedPill: { borderWidth: 1, borderRadius: BorderRadius.pill, paddingHorizontal: 12, height: 30, justifyContent: 'center' },
  savedPillText: { fontSize: 12, fontFamily: FontFamily.semibold },
  genreChip: { borderWidth: 1, borderRadius: BorderRadius.pill, paddingHorizontal: 12, height: 30, justifyContent: 'center' },
  genreChipText: { fontSize: 12, fontFamily: FontFamily.medium },
  recentSection: { marginTop: 12, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontFamily: FontFamily.semibold, marginBottom: 8 },
  recentChip: { borderWidth: 1, borderRadius: BorderRadius.pill, paddingHorizontal: 10, height: 30, justifyContent: 'center', minWidth: 72, maxWidth: 180 },
  recentChipText: { fontSize: 12, fontFamily: FontFamily.medium },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    marginBottom: 7,
    gap: 7,
  },
  cover: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontFamily: FontFamily.semibold },
  rowMeta: { marginTop: 1, fontSize: 12, fontFamily: FontFamily.regular },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  useBtn: { borderRadius: BorderRadius.pill, paddingHorizontal: 11, height: 28, justifyContent: 'center' },
  useBtnText: { color: '#fff', fontSize: 11, fontFamily: FontFamily.semibold },
  loaderWrap: { paddingTop: 24, alignItems: 'center' },
  emptyWrap: { paddingTop: 26, alignItems: 'center' },
  emptyText: { fontSize: 13, fontFamily: FontFamily.regular },
  miniDiskPlayer: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 16,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  diskOuter: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  diskGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  diskInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diskHole: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(148,163,184,0.7)' },
  miniTitle: { fontSize: 13, fontFamily: FontFamily.semibold },
  miniSub: { marginTop: 1, fontSize: 11, fontFamily: FontFamily.regular },
  floatingPlayerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 104,
    alignItems: 'center',
  },
  floatingDiskBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  floatingLabel: {
    marginTop: 8,
    minWidth: 110,
    maxWidth: 180,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
});

