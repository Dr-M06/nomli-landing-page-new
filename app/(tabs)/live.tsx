import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Modal,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coins, Flame, Gift, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useLiveStream, type LiveStream } from '../../components/LiveStreamProvider';
import LiveStreamViewer from '../../components/LiveStreamViewer';
import LiveStreamBroadcaster from '../../components/LiveStreamBroadcaster';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { FontFamily } from '../../constants/Theme';
import { log } from '../../utils/productionLogger';

const RING_COLORS = ['#FF2D92', '#FF6B35', '#FFE14A'] as const;
const LIVE_DATA_SAVER_KEY = 'live_data_saver_mode_v1';

function streamInitials(name: string) {
  const clean = name.replace(/^@/, '').trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase().slice(0, 2);
  }
  return clean.slice(0, 2).toUpperCase();
}

function LiveDiscoveryCard({
  item,
  isDark,
  textColor,
  textSecondary,
  cardBg,
  onPress,
}: {
  item: LiveStream;
  isDark: boolean;
  textColor: string;
  textSecondary: string;
  cardBg: string;
  onPress: () => void;
}) {
  const avatarUri = item.streamer_avatar?.trim();
  const name = item.streamer_name || 'live';
  const viewers = Math.max(0, item.viewer_count || 0);
  const title = (item.title || `${name} is live`).trim();

  return (
    <TouchableOpacity
      style={styles.discoveryCard}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Join ${name} live stream`}
    >
      <LinearGradient colors={[...RING_COLORS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
        <View style={[styles.avatarInner, { backgroundColor: cardBg }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" transition={120} />
          ) : (
            <Text style={[styles.avatarInitials, { color: textColor }]}>{streamInitials(name)}</Text>
          )}
        </View>
      </LinearGradient>

      <View style={styles.liveBadge}>
        <LinearGradient colors={['#FF2D92', '#FF4D7D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.liveBadgeGrad}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </LinearGradient>
      </View>

      <Text style={[styles.discoveryName, { color: textColor }]} numberOfLines={1}>
        @{name.replace(/^@/, '')}
      </Text>
      <Text style={[styles.discoveryTitle, { color: textSecondary }]} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.fireRow, { backgroundColor: isDark ? 'rgba(255,107,53,0.18)' : 'rgba(255,107,53,0.12)' }]}>
        <Flame size={15} color="#FF6B35" fill="#FF6B35" strokeWidth={2} />
        <Text style={styles.fireCount}>{viewers}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { streamId: streamIdParam } = useLocalSearchParams<{ streamId?: string }>();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const theme = getThemeColors(isDarkMode);

  const {
    liveStreams,
    loadLiveStreams,
    startLiveStream,
    isStreaming,
    currentStream,
  } = useLiveStream();

  const [refreshing, setRefreshing] = useState(false);
  const [viewerStreamId, setViewerStreamId] = useState<string | null>(null);
  const [showBroadcaster, setShowBroadcaster] = useState(false);

  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [adultContent, setAdultContent] = useState(false);
  const [allowGuests, setAllowGuests] = useState(false);
  const [startingLive, setStartingLive] = useState(false);
  const [dataSaverMode, setDataSaverMode] = useState(true);
  const perkFloat = useMemo(() => new Animated.Value(0), []);

  const defaultTitle = useMemo(
    () => `${user?.username || 'Nomli User'} is live`,
    [user?.username]
  );

  const fetchStreams = useCallback(async () => {
    try {
      await loadLiveStreams();
    } catch {
      // Non-blocking fetch failures are handled by provider logs.
    }
  }, [loadLiveStreams]);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  useFocusEffect(
    useCallback(() => {
      fetchStreams();
      const id = setInterval(fetchStreams, 15000);
      return () => clearInterval(id);
    }, [fetchStreams])
  );

  useEffect(() => {
    if (isStreaming) {
      setShowBroadcaster(true);
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!streamIdParam) return;
    setViewerStreamId(streamIdParam);
  }, [streamIdParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LIVE_DATA_SAVER_KEY);
        if (!cancelled && saved !== null) {
          setDataSaverMode(saved === '1');
        }
      } catch {
        // Keep default when read fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(perkFloat, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(perkFloat, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();
    return () => {
      floatLoop.stop();
    };
  }, [perkFloat]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStreams();
    setRefreshing(false);
  }, [fetchStreams]);

  const openGoLiveModal = useCallback(() => {
    if (!user?.id) {
      router.push('/auth/signin');
      return;
    }
    setStreamTitle(defaultTitle);
    setAdultContent(false);
    setAllowGuests(false);
    setShowGoLiveModal(true);
  }, [router, user?.id, defaultTitle]);

  const submitGoLive = useCallback(async () => {
    if (!user?.id || startingLive) return;
    const title = streamTitle.trim() || defaultTitle;
    setStartingLive(true);
    try {
      const started = await startLiveStream(title, undefined, adultContent, allowGuests, false);
      if (started) {
        setShowGoLiveModal(false);
        setShowBroadcaster(true);
        log('[Live] Stream started successfully');
      }
    } finally {
      setStartingLive(false);
    }
  }, [user?.id, startingLive, streamTitle, defaultTitle, adultContent, allowGuests, startLiveStream]);

  const onToggleDataSaver = useCallback(async (value: boolean) => {
    setDataSaverMode(value);
    try {
      await AsyncStorage.setItem(LIVE_DATA_SAVER_KEY, value ? '1' : '0');
    } catch {
      // Non-blocking preference save.
    }
  }, []);

  const handleHeaderGoLive = useCallback(() => {
    if (isStreaming) {
      setShowBroadcaster(true);
      return;
    }
    openGoLiveModal();
  }, [isStreaming, openGoLiveModal]);

  const streams = useMemo(() => liveStreams.filter((s) => s.is_live), [liveStreams]);

  const showBroadcastOverlay = showBroadcaster && (isStreaming || currentStream);

  return (
    <View style={[styles.container, { backgroundColor: theme.neutral.background }]}>
      <View style={styles.mainShell}>
        <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
          <Text style={[styles.title, { color: theme.neutral.text }]}>Livestream</Text>
          <TouchableOpacity style={styles.goLiveBtn} onPress={handleHeaderGoLive} activeOpacity={0.8}>
            <Text style={styles.goLiveText}>{isStreaming ? 'Resume Live' : 'Go Live'}</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={streams}
          keyExtractor={(item) => item.id}
          style={styles.listFlex}
          horizontal={streams.length > 0}
          showsHorizontalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={
            streams.length
              ? [
                  styles.liveStripContent,
                  streams.length === 1 ? styles.liveStripCenterRow : styles.liveStripRowStart,
                ]
              : styles.emptyContent
          }
          ItemSeparatorComponent={
            streams.length > 1
              ? () => <View style={styles.liveStripSeparator} />
              : undefined
          }
          renderItem={({ item }) => (
            <LiveDiscoveryCard
              item={item}
              isDark={isDarkMode}
              textColor={theme.neutral.text}
              textSecondary={theme.neutral.textSecondary}
              cardBg={theme.neutral.card}
              onPress={() => setViewerStreamId(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.perkFloatGift,
                  {
                    opacity: perkFloat.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.4] }),
                    transform: [
                      { translateY: perkFloat.interpolate({ inputRange: [0, 1], outputRange: [2, -4] }) },
                    ],
                  },
                ]}
              >
                <Gift size={18} color="#FF4D7D" strokeWidth={2.2} />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.perkFloatCoin,
                  {
                    opacity: perkFloat.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.35] }),
                    transform: [{ translateY: perkFloat.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) }],
                  },
                ]}
              >
                <Coins size={18} color="#FFB347" strokeWidth={2.2} />
              </Animated.View>

              <View style={styles.emptyBadge}>
                <Sparkles size={14} color="#fff" strokeWidth={2.4} />
                <Text style={styles.emptyBadgeText}>Creator mode</Text>
              </View>

              <Text style={[styles.emptyTitle, { color: theme.neutral.text }]}>Go live and earn from gifts</Text>
              <Text style={[styles.emptySub, { color: theme.neutral.textSecondary }]}>
                Build your audience in real time, receive gifts, and grow your income while streaming.
              </Text>

              <View style={styles.emptyPerks}>
                <View style={styles.emptyPerkRow}>
                  <Gift size={15} color="#FF4D7D" strokeWidth={2.2} />
                  <Text style={[styles.emptyPerkText, { color: theme.neutral.text }]}>Receive gifts from viewers</Text>
                </View>
                <View style={styles.emptyPerkRow}>
                  <Coins size={15} color="#FFB347" strokeWidth={2.2} />
                  <Text style={[styles.emptyPerkText, { color: theme.neutral.text }]}>Turn engagement into earnings</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.emptyCtaBtn} onPress={handleHeaderGoLive} activeOpacity={0.85}>
                <Text style={styles.emptyCtaBtnText}>Start earning now</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      <Modal
        visible={showGoLiveModal}
        animationType="slide"
        transparent
        onRequestClose={() => !startingLive && setShowGoLiveModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => !startingLive && setShowGoLiveModal(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
            style={styles.modalKeyboardInner}
          >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.neutral.card,
                borderColor: theme.neutral.border,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.neutral.text }]}>Go live</Text>
            <Text style={[styles.modalHint, { color: theme.neutral.textSecondary }]}>
              Set a title and options before you start.
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.neutral.textSecondary }]}>Stream title</Text>
            <TextInput
              value={streamTitle}
              onChangeText={setStreamTitle}
              placeholder={defaultTitle}
              placeholderTextColor={theme.neutral.textSecondary}
              style={[
                styles.titleInput,
                {
                  color: theme.neutral.text,
                  borderColor: theme.neutral.border,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                },
              ]}
              maxLength={120}
              editable={!startingLive}
            />

            <View style={styles.switchList}>
              <View style={[styles.switchRow, { borderColor: theme.neutral.border }]}>
                <View style={styles.switchLabelCol}>
                  <Text style={[styles.switchTitle, { color: theme.neutral.text }]}>Sensitive (18+)</Text>
                  <Text style={[styles.switchSub, { color: theme.neutral.textSecondary }]}>
                    Mark if your stream is adult-only. Viewers may need to opt in.
                  </Text>
                </View>
                <View style={styles.switchSlot}>
                  <View style={styles.switchMini}>
                    <Switch
                      value={adultContent}
                      onValueChange={setAdultContent}
                      disabled={startingLive}
                      trackColor={{ false: 'rgba(120,120,128,0.32)', true: '#FF4D7D' }}
                      thumbColor="#fff"
                      ios_backgroundColor="rgba(120,120,128,0.26)"
                    />
                  </View>
                </View>
              </View>

              <View style={[styles.switchRow, { borderColor: theme.neutral.border }]}>
                <View style={styles.switchLabelCol}>
                  <Text style={[styles.switchTitle, { color: theme.neutral.text }]}>Allow guests</Text>
                  <Text style={[styles.switchSub, { color: theme.neutral.textSecondary }]}>
                    Let approved viewers join on camera (when your plan supports it).
                  </Text>
                </View>
                <View style={styles.switchSlot}>
                  <View style={styles.switchMini}>
                    <Switch
                      value={allowGuests}
                      onValueChange={setAllowGuests}
                      disabled={startingLive}
                      trackColor={{ false: 'rgba(120,120,128,0.32)', true: '#FF4D7D' }}
                      thumbColor="#fff"
                      ios_backgroundColor="rgba(120,120,128,0.26)"
                    />
                  </View>
                </View>
              </View>

              <View style={[styles.switchRow, { borderColor: theme.neutral.border }]}>
                <View style={styles.switchLabelCol}>
                  <Text style={[styles.switchTitle, { color: theme.neutral.text }]}>Data saver mode</Text>
                  <Text style={[styles.switchSub, { color: theme.neutral.textSecondary }]}>
                    Better for 2G/slow networks. Starts streams in lower quality for stability.
                  </Text>
                </View>
                <View style={styles.switchSlot}>
                  <View style={styles.switchMini}>
                    <Switch
                      value={dataSaverMode}
                      onValueChange={onToggleDataSaver}
                      disabled={startingLive}
                      trackColor={{ false: 'rgba(120,120,128,0.32)', true: '#FF4D7D' }}
                      thumbColor="#fff"
                      ios_backgroundColor="rgba(120,120,128,0.26)"
                    />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: theme.neutral.border }]}
                onPress={() => setShowGoLiveModal(false)}
                disabled={startingLive}
              >
                <Text style={[styles.btnSecondaryText, { color: theme.neutral.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, startingLive && styles.btnDisabled]}
                onPress={submitGoLive}
                disabled={startingLive}
              >
                {startingLive ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Start live</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {viewerStreamId ? (
        <View style={styles.fullScreenOverlay} testID="live-viewer-overlay">
          <LiveStreamViewer
            streamId={viewerStreamId}
            onClose={() => {
              setViewerStreamId(null);
              router.setParams({ streamId: undefined });
            }}
          />
        </View>
      ) : null}

      {showBroadcastOverlay ? (
        <View style={styles.fullScreenOverlay} testID="live-broadcaster-overlay">
          <LiveStreamBroadcaster
            onClose={() => {
              setShowBroadcaster(false);
              fetchStreams();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mainShell: {
    flex: 1,
  },
  listFlex: {
    flex: 1,
  },
  /** Full-screen camera / viewer — was stacked under the FlatList, so the video only got a thin band. */
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700' },
  goLiveBtn: {
    backgroundColor: '#FF4D7D',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  goLiveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  /** Horizontal list: flexGrow fills list height; alignItems centers cards vertically; justifyContent handles 1 vs many. */
  liveStripContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 100,
    flexGrow: 1,
    alignItems: 'center',
  },
  /** One live: center the card in the row (main axis). */
  liveStripCenterRow: {
    justifyContent: 'center',
  },
  /** Multiple lives: start from the left, scroll for overflow; same vertical alignment as single. */
  liveStripRowStart: {
    justifyContent: 'flex-start',
  },
  liveStripSeparator: {
    width: 14,
  },
  discoveryCard: {
    width: 108,
    alignItems: 'center',
    position: 'relative',
    paddingTop: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#FF2D92',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  avatarRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: 72,
    height: 72,
  },
  avatarInitials: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
  },
  liveBadge: {
    position: 'absolute',
    top: 0,
    zIndex: 2,
    alignSelf: 'center',
  },
  liveBadgeGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  discoveryName: {
    marginTop: 8,
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    maxWidth: 104,
    textAlign: 'center',
  },
  discoveryTitle: {
    marginTop: 2,
    fontFamily: FontFamily.regular,
    fontSize: 10,
    maxWidth: 104,
    textAlign: 'center',
    opacity: 0.85,
  },
  fireRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  fireCount: {
    fontFamily: FontFamily.bold,
    fontSize: 12,
    color: '#FF6B35',
  },
  emptyContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 380,
    paddingHorizontal: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  perkFloatGift: {
    position: 'absolute',
    left: 26,
    top: 88,
  },
  perkFloatCoin: {
    position: 'absolute',
    right: 30,
    top: 132,
  },
  emptyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF4D7D',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  emptyBadgeText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: 11,
  },
  emptyTitle: {
    fontSize: 30,
    fontFamily: FontFamily.bold,
    marginBottom: 10,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 360,
  },
  emptyPerks: {
    marginTop: 16,
    gap: 10,
  },
  emptyPerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyPerkText: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
  },
  emptyCtaBtn: {
    marginTop: 18,
    backgroundColor: '#FF4D7D',
    borderRadius: 14,
    paddingVertical: 13,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaBtnText: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  /** KAV only wraps the sheet so the sheet stays bottom-anchored; avoids the whole sheet jumping upward. */
  modalKeyboardInner: {
    width: '100%',
    justifyContent: 'flex-end',
    maxHeight: '100%',
  },
  modalCard: {
    width: '100%',
    alignSelf: 'stretch',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 18,
    minHeight: 430,
  },
  modalTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  modalHint: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
    opacity: 0.9,
  },
  fieldLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 11,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    opacity: 0.75,
  },
  titleInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    marginBottom: 14,
  },
  switchList: { paddingHorizontal: 2 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    overflow: 'visible',
  },
  switchLabelCol: { flex: 1, paddingRight: 8, minWidth: 0 },
  switchTitle: { fontFamily: FontFamily.semibold, fontSize: 13, letterSpacing: -0.1 },
  switchSub: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
    opacity: 0.85,
  },
  /** Fixed slot prevents scaled switch from clipping at the sheet edge. */
  switchSlot: {
    width: 44,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  switchMini: {
    ...Platform.select({
      ios: { transform: [{ scale: 0.64 }] },
      android: { transform: [{ scale: 0.72 }] },
      default: { transform: [{ scale: 0.66 }] },
    }),
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 2,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontFamily: FontFamily.semibold, fontSize: 14 },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FF4D7D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnPrimaryText: { color: '#fff', fontFamily: FontFamily.bold, fontSize: 14 },
});
