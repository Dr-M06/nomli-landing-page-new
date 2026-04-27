import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Heart, Lock, RotateCcw, X } from 'lucide-react-native';
import { NearbyProfile } from './types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 28;
const CARD_HEIGHT = Math.max(370, Math.min(Math.round(SCREEN_HEIGHT * 0.57), 570));
const SWIPE_THRESHOLD = 110;

interface Props {
  profiles: NearbyProfile[];
  onLike: (profile: NearbyProfile) => void;
  onPass: (profile: NearbyProfile) => void;
  onCardPress: (profile: NearbyProfile) => void;
  onUndoPass?: () => void;
  canUndoPass?: boolean;
  canUseRewind?: boolean;
  onLockedRewindPress?: () => void;
  showOnlineBadges?: boolean;
}

export default function DiscoverSwipeDeck({
  profiles,
  onLike,
  onPass,
  onCardPress,
  onUndoPass,
  canUndoPass = false,
  canUseRewind = true,
  onLockedRewindPress,
  showOnlineBadges = false,
}: Props) {
  const [index, setIndex] = useState(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const current = profiles[index];
  const next = profiles[index + 1];

  useEffect(() => {
    if (profiles.length > 0 && index >= profiles.length) setIndex(0);
  }, [index, profiles.length]);

  const finishSwipe = useCallback(
    (direction: 'left' | 'right') => {
      if (!current) return;
      if (direction === 'right') onLike(current);
      else onPass(current);
      setIndex(0);
    },
    [current, onLike, onPass]
  );

  const animateOutAndFinish = useCallback(
    (direction: 'left' | 'right', velocityX = 0) => {
      const targetX = direction === 'right' ? SCREEN_WIDTH * 1.15 : -SCREEN_WIDTH * 1.15;
      const dynamicDuration = Math.max(150, Math.min(230, 220 - Math.abs(velocityX) * 0.03));
      translateX.value = withTiming(targetX, { duration: dynamicDuration }, () => {
        translateX.value = 0;
        translateY.value = 0;
        runOnJS(finishSwipe)(direction);
      });
      translateY.value = withTiming(0, { duration: Math.round(dynamicDuration * 0.9) });
    },
    [finishSwipe, translateX, translateY]
  );

  const topCardStyle = useAnimatedStyle(() => {
    const rot = interpolate(translateX.value, [-CARD_WIDTH, 0, CARD_WIDTH], [-8, 0, 8], 'clamp');
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value * 0.18 },
        { rotate: `${rot}deg` },
      ],
    };
  });

  const nextCardStyle = useAnimatedStyle(() => {
    const drag = Math.min(Math.abs(translateX.value), CARD_WIDTH);
    const progress = drag / CARD_WIDTH;
    return {
      transform: [{ scale: interpolate(progress, [0, 1], [0.97, 1], 'clamp') }],
      opacity: interpolate(progress, [0, 1], [0.45, 0.8], 'clamp'),
    };
  });

  const likeOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], 'clamp'),
  }));
  const nopeOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], 'clamp'),
  }));

  const panGesture = Gesture.Pan()
    .minDistance(4)
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const goRight = translateX.value > SWIPE_THRESHOLD || e.velocityX > 520;
      const goLeft = translateX.value < -SWIPE_THRESHOLD || e.velocityX < -520;
      if (goRight) {
        runOnJS(animateOutAndFinish)('right', e.velocityX);
        return;
      }
      if (goLeft) {
        runOnJS(animateOutAndFinish)('left', e.velocityX);
        return;
      }
      translateX.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.8 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.8 });
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (current) runOnJS(onCardPress)(current);
  });

  const composed = Gesture.Exclusive(panGesture, tapGesture);

  const renderCard = useCallback((profile: NearbyProfile) => {
    const name = profile.full_name || profile.username || 'User';
    return (
      <View style={styles.card}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoFallback}><Text style={styles.photoFallbackText}>No photo</Text></View>
        )}
        <View style={styles.info}>
          <Text style={styles.name}>
            {name}
            {profile.age ? ` - ${profile.age}` : ''}
          </Text>
          <Text style={styles.meta}>
            {profile.country || 'Nearby'} - {profile.distance != null ? `${Math.max(1, Math.round(profile.distance))} km away` : 'Near you'}
          </Text>
          {showOnlineBadges && profile.is_online_now ? (
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlinePillText}>Online now</Text>
            </View>
          ) : null}
          <Text style={styles.bio} numberOfLines={2}>
            {profile.bio || 'Say hi and start the conversation.'}
          </Text>
          <View style={styles.tags}>
            {(profile.interests || []).slice(0, 3).map((it) => (
              <View key={`${profile.id}:${it}`} style={styles.tag}>
                <Text style={styles.tagText}>{it}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }, [showOnlineBadges]);

  const content = useMemo(() => {
    if (!current) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No more profiles</Text>
          <Text style={styles.emptySub}>Pull to refresh and discover more people</Text>
        </View>
      );
    }
    return (
      <>
        {next ? <Animated.View style={[styles.nextCardWrap, nextCardStyle]}>{renderCard(next)}</Animated.View> : null}
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.topCardWrap, topCardStyle]}>
            {renderCard(current)}
            <Animated.View style={[styles.labelLike, likeOverlayStyle]}>
              <Text style={styles.labelText}>LIKE</Text>
            </Animated.View>
            <Animated.View style={[styles.labelNope, nopeOverlayStyle]}>
              <Text style={styles.labelText}>NOPE</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </>
    );
  }, [composed, current, likeOverlayStyle, next, nextCardStyle, nopeOverlayStyle, renderCard, topCardStyle]);

  return (
    <View style={styles.container}>
      {content}
      {current ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.rewindBtn,
              (!canUseRewind || !canUndoPass) && styles.actionDisabled,
            ]}
            disabled={!canUseRewind ? false : !canUndoPass}
            onPress={() => {
              if (!canUseRewind) {
                onLockedRewindPress?.();
                return;
              }
              onUndoPass?.();
            }}
            activeOpacity={0.9}
          >
            {!canUseRewind ? (
              <Lock size={16} color="#94A3B8" />
            ) : (
              <RotateCcw size={19} color={canUndoPass ? '#7C3AED' : '#94A3B8'} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.passBtn]}
            onPress={() => animateOutAndFinish('left')}
            activeOpacity={0.9}
          >
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.likeBtn]}
            onPress={() => animateOutAndFinish('right')}
            activeOpacity={0.9}
          >
            <Heart size={20} color="#FFFFFF" fill="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    minHeight: CARD_HEIGHT + 92,
    paddingBottom: 12,
  },
  nextCardWrap: {
    position: 'absolute',
    top: 8,
    transform: [{ scale: 0.97 }],
    opacity: 0.45,
  },
  topCardWrap: { zIndex: 3 },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  photo: { width: '100%', height: '70%', backgroundColor: '#0F172A' },
  photoFallback: {
    width: '100%',
    height: '70%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  photoFallbackText: { color: '#94A3B8', fontWeight: '700' },
  info: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  name: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  meta: { color: '#CBD5E1', fontSize: 14, fontWeight: '600', marginTop: 1 },
  onlinePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(34,197,94,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  onlinePillText: { color: '#DCFCE7', fontSize: 11, fontWeight: '800' },
  bio: { color: '#E2E8F0', fontSize: 13, marginTop: 6, lineHeight: 18 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 8 },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(56,189,248,0.2)',
  },
  tagText: { color: '#E0F2FE', fontSize: 12, fontWeight: '700' },
  labelLike: {
    position: 'absolute',
    top: 24,
    left: 18,
    borderWidth: 2,
    borderColor: '#22C55E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  labelNope: {
    position: 'absolute',
    top: 24,
    right: 18,
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  labelText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 1.2 },
  actions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
  },
  actionBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewindBtn: { backgroundColor: '#FFFFFF' },
  passBtn: { backgroundColor: '#334155' },
  likeBtn: { backgroundColor: '#FF6FAE' },
  actionDisabled: { opacity: 0.55 },
  emptyWrap: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT * 0.7,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  emptySub: { color: '#CBD5E1', fontSize: 13, marginTop: 6, textAlign: 'center' },
});

