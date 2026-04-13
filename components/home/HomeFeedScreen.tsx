import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Text,
  Platform,
  Alert,
  ViewToken,
  TouchableOpacity,
  useWindowDimensions,
  DeviceEventEmitter,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useAuth from '../../hooks/useAuth';
import useProfile from '../../hooks/useProfile';
import useAgeGate from '../../hooks/useAgeGate';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { FontFamily } from '../../constants/Theme';
import { getFloatingTabBarReservedHeight } from '../../utils/tabBarInset';
import {
  fetchPosts,
  getCachedPosts,
  getCachedPostsSync,
  toggleLike,
  toggleBookmark,
  createPost,
  deletePost,
  type Post,
} from '../../utils/communityUtils';
import { rankHomeFeedPosts } from '../../utils/homeFeedRanking';
import { toggleReaction, getReactionCounts, getUserReaction, type ReactionType } from '../../utils/reactionUtils';
import { badgeCounter } from '../../utils/badgeCounter';
import { error } from '../../utils/productionLogger';
import { sendUserReport } from '../../utils/reportUser';
import Toast from 'react-native-toast-message';
import { supabase } from '../../utils/supabase';
import HomeHeader from './HomeHeader';
import ActivitySummaryCard from '../ActivitySummaryCard';
import FeedPostCard from './FeedPostCard';
import UserStatusBar from '../StatusBar';
import StoryViewer from '../StoryViewer';
import HomeFullscreenFeed, { type HomeFullscreenFeedHandle } from './HomeFullscreenFeed';
import HomeFeedSkeleton from './HomeFeedSkeleton';
import { useLiveStream } from '../LiveStreamProvider';
import { useVideoUpload } from '../../contexts/VideoUploadContext';

const PAGE = 20;
const INITIAL_PREFETCH_PAGES = 2;
type HomeFeedRow = Post & { __isHomeAd?: boolean };

export default function HomeFeedScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { postId: postIdParam } = useLocalSearchParams<{ postId?: string }>();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const c = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const ageGate = useAgeGate({ profile, user });

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(new Set());
  const [homeHeaderHeight, setHomeHeaderHeight] = useState(0);
  /** Measured height of the flex slot above the tab bar (avoids windowHeight math mismatch on small devices). */
  const [homeFeedSlotHeight, setHomeFeedSlotHeight] = useState(0);
  const [feedMode, setFeedMode] = useState<'forYou' | 'following'>('forYou');
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followerIds, setFollowerIds] = useState<Set<string>>(new Set());
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [storyViewerUserId, setStoryViewerUserId] = useState<string | null>(null);
  const [storyViewerStoryId, setStoryViewerStoryId] = useState<string | undefined>(undefined);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const { liveStreams, loadLiveStreams } = useLiveStream();
  const { uploads, uploadVideo } = useVideoUpload();
  const mounted = useRef(true);
  const nextOffsetRef = useRef(0);
  const emptyLoadMoreStreakRef = useRef(0);
  const retryBindingsRef = useRef<Record<string, { tempId: string; content: string }>>({});
  const retryPublishingRef = useRef<Record<string, boolean>>({});
  const fullscreenFeedRef = useRef<HomeFullscreenFeedHandle>(null);
  const homeListModeRef = useRef<FlatList<HomeFeedRow>>(null);

  const mergeUniquePosts = useCallback((base: Post[], incoming: Post[]) => {
    if (!incoming.length) return base;
    const seen = new Set(base.map((p) => p.id));
    const merged = [...base];
    for (const p of incoming) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        merged.push(p);
      }
    }
    return merged;
  }, []);

  /** When the API omits counts, keep the last known values from `previous` so the rail stays stable. */
  const mergeEngagementFromPrevious = useCallback((fresh: Post[], previous: Post[]) => {
    const prevById = new Map(previous.map((p) => [p.id, p]));
    return fresh.map((p) => {
      const old = prevById.get(p.id);
      return {
        ...p,
        likes_count: p.likes_count != null ? p.likes_count : (old?.likes_count ?? 0),
        comments_count: p.comments_count != null ? p.comments_count : (old?.comments_count ?? 0),
      };
    });
  }, []);

  const handleVideoLike = useCallback(async (postId: string, isLiked: boolean) => {
    if (!user?.id) {
      router.push('/auth/signin');
      return;
    }
    try {
      await toggleLike(postId, user.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                liked_by_user: isLiked,
                liked: isLiked,
                likes_count: isLiked ? (p.likes_count ?? 0) + 1 : Math.max(0, (p.likes_count ?? 0) - 1),
              }
            : p
        )
      );
    } catch (e) {
      error('[HomeFeed] video like', e);
    }
  }, [user?.id, router]);

  const handleVideoReact = useCallback(async (postId: string, reaction: ReactionType) => {
    if (!user?.id) {
      router.push('/auth/signin');
      return;
    }
    try {
      await toggleReaction(postId, reaction);
      const [counts, mine] = await Promise.all([getReactionCounts(postId), getUserReaction(postId)]);
      const total = (counts.likes || 0) + (counts.loves || 0) + (counts.laughs || 0);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likes_count: total,
                liked_by_user: !!mine,
                liked: !!mine,
              }
            : p
        )
      );
    } catch (e) {
      error('[HomeFeed] video react', e);
    }
  }, [user?.id, router]);

  const handleVideoBookmark = useCallback(async (postId: string, isBookmarked: boolean) => {
    if (!user?.id) {
      router.push('/auth/signin');
      return;
    }
    try {
      await toggleBookmark(postId, user.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, bookmarked: isBookmarked, isBookmarked: isBookmarked }
            : p
        )
      );
    } catch (e) {
      error('[HomeFeed] video bookmark', e);
    }
  }, [user?.id, router]);

  const handleEditPost = useCallback((post: Post) => {
    router.push({
      pathname: '/community/edit',
      params: {
        id: post.id,
        content: post.content ?? '',
      },
    });
  }, [router]);

  const handleDeletePost = useCallback((postId: string) => {
    if (!user?.id) {
      router.push('/auth/signin');
      return;
    }

    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const ok = await deletePost(postId, user.id);
              if (ok) {
                setPosts((prev) => prev.filter((p) => p.id !== postId));
              }
            } catch (e) {
              error('[HomeFeed] delete post', e);
            }
          },
        },
      ]
    );
  }, [user?.id, router]);

  const handleRetryVideoUpload = useCallback(
    async (post: Post) => {
      const localUri = String(post.video_url || '');
      if (!localUri || (!localUri.startsWith('file://') && !localUri.startsWith('content://'))) {
        return;
      }
      if (!user?.id) {
        router.push('/auth/signin');
        return;
      }

      const tempId = post.client_temp_id || post.id;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === tempId || p.client_temp_id === tempId
            ? { ...p, client_upload_status: 'uploading', client_upload_progress: 2, client_error: undefined }
            : p
        )
      );

      try {
        const uploadId = await uploadVideo(localUri, (post.content || 'Video post').slice(0, 80), {
          maxDuration: 120,
          description: `Retry upload for post ${tempId}`,
        });
        retryBindingsRef.current[uploadId] = {
          tempId,
          content: post.content || '',
        };
      } catch (e) {
        error('[HomeFeed] retry upload start failed', e);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === tempId || p.client_temp_id === tempId
              ? { ...p, client_upload_status: 'failed', client_error: 'Retry failed to start' }
              : p
          )
        );
      }
    },
    [uploadVideo, user?.id, router]
  );

  useEffect(() => {
    Object.entries(retryBindingsRef.current).forEach(([uploadId, binding]) => {
      const u = uploads.find((x) => x.id === uploadId);
      if (!u) return;

      if (u.status === 'uploading' || u.status === 'queued' || u.status === 'compressing') {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === binding.tempId || p.client_temp_id === binding.tempId
              ? {
                  ...p,
                  client_upload_status: 'uploading',
                  client_upload_progress: Math.max(1, Math.min(92, Math.round(u.progress || 0))),
                  client_error: undefined,
                }
              : p
          )
        );
        return;
      }

      if (u.status === 'processing') {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === binding.tempId || p.client_temp_id === binding.tempId
              ? { ...p, client_upload_status: 'processing', client_upload_progress: 96, client_error: undefined }
              : p
          )
        );
        return;
      }

      if (u.status === 'failed') {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === binding.tempId || p.client_temp_id === binding.tempId
              ? { ...p, client_upload_status: 'failed', client_error: u.error || 'Upload failed' }
              : p
          )
        );
        delete retryBindingsRef.current[uploadId];
        delete retryPublishingRef.current[uploadId];
        return;
      }

      if (u.status === 'completed' && u.result && !retryPublishingRef.current[uploadId]) {
        if (!user?.id) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === binding.tempId || p.client_temp_id === binding.tempId
                ? { ...p, client_upload_status: 'failed', client_error: 'Please sign in again to publish' }
                : p
            )
          );
          delete retryBindingsRef.current[uploadId];
          delete retryPublishingRef.current[uploadId];
          return;
        }
        retryPublishingRef.current[uploadId] = true;
        const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'User';
        const userEmail = user?.email || '';
        createPost(
          (binding.content || 'Video post').trim(),
          user.id,
          username,
          userEmail,
          undefined,
          undefined,
          undefined,
          u.result.secure_url,
          false,
          'standard'
        )
          .then((created) => {
            if (!created) return;
            setPosts((prev) =>
              prev.map((p) =>
                p.id === binding.tempId || p.client_temp_id === binding.tempId
                  ? { ...created, client_upload_status: 'ready', client_upload_progress: 100 }
                  : p
              )
            );
          })
          .catch((e) => {
            error('[HomeFeed] retry publish failed', e);
            setPosts((prev) =>
              prev.map((p) =>
                p.id === binding.tempId || p.client_temp_id === binding.tempId
                  ? { ...p, client_upload_status: 'failed', client_error: 'Upload finished but publish failed' }
                  : p
              )
            );
          })
          .finally(() => {
            delete retryBindingsRef.current[uploadId];
            delete retryPublishingRef.current[uploadId];
          });
      }
    });
  }, [uploads, user?.id, user?.email, user?.user_metadata?.username]);

  useEffect(() => {
    let cancelled = false;
    const loadConnections = async () => {
      if (!user?.id) {
        setFollowingIds(new Set());
        setFollowerIds(new Set());
        return;
      }
      try {
        const { data: followingData, error: followErr } = await supabase
          .from('user_followers')
          .select('following_id')
          .eq('follower_id', user.id);
        const { data: followerData, error: followersErr } = await supabase
          .from('user_followers')
          .select('follower_id')
          .eq('following_id', user.id);
        if (followErr || followersErr) return;
        if (!cancelled) {
          setFollowingIds(new Set((followingData || []).map((r: any) => r.following_id).filter(Boolean)));
          setFollowerIds(new Set((followerData || []).map((r: any) => r.follower_id).filter(Boolean)));
        }
      } catch {
        // non-critical
      }
    };
    loadConnections();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);
      // Instant-first: show in-memory cache immediately (no auth/network wait).
      let showedInstantContent = false;
      const warmCache = getCachedPostsSync(PAGE, 0) || getCachedPostsSync(undefined, 0);
      if (mounted.current && warmCache && warmCache.length > 0) {
        setPosts(rankHomeFeedPosts(warmCache));
        nextOffsetRef.current = PAGE;
        setHasMore(true);
        setLoading(false);
        showedInstantContent = true;
      } else {
        // Persistent cache fallback (still fast, async storage only).
        const cached = await getCachedPosts(PAGE, 0);
        if (mounted.current && cached && cached.length > 0) {
          setPosts(rankHomeFeedPosts(cached));
          nextOffsetRef.current = PAGE;
          setHasMore(true);
          setLoading(false);
          showedInstantContent = true;
        }
      }

      // Background refresh: fetch fresh pages silently and swap once ready.
      const fresh = await fetchPosts(PAGE, 0, false, false);
      if (mounted.current && fresh.length > 0) {
        let merged: Post[] = [...fresh];
        const extraPages = await Promise.all(
          Array.from({ length: INITIAL_PREFETCH_PAGES }, (_, idx) =>
            fetchPosts(PAGE, (idx + 1) * PAGE, false, false).catch(() => [])
          )
        );
        for (const batch of extraPages) {
          if (!mounted.current || !batch.length) continue;
          merged = mergeUniquePosts(merged, batch);
        }
        const nextOrdered = rankHomeFeedPosts(merged);
        if (showedInstantContent) {
          // Merge fresh fetch with any local-only cards, then re-rank (uploads/pinned + score).
          setPosts((prev) => {
            const withCounts = mergeEngagementFromPrevious(nextOrdered, prev);
            const freshIds = new Set(nextOrdered.map((p) => p.id));
            const tail = prev.filter((p) => !freshIds.has(p.id));
            return rankHomeFeedPosts([...withCounts, ...tail]);
          });
        } else {
          setPosts(rankHomeFeedPosts(mergeEngagementFromPrevious(nextOrdered, [])));
        }
        nextOffsetRef.current = PAGE * (INITIAL_PREFETCH_PAGES + 1);
        setHasMore(true);
      } else if (mounted.current && !showedInstantContent) {
        nextOffsetRef.current = 0;
        setHasMore(false);
      }
    } catch (e) {
      error('[HomeFeed] loadInitial', e);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [mergeUniquePosts, mergeEngagementFromPrevious]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchPosts(PAGE, 0, false, false);
      if (mounted.current) {
        let merged: Post[] = [...fresh];
        for (let i = 1; i <= INITIAL_PREFETCH_PAGES; i += 1) {
          const batch = await fetchPosts(PAGE, i * PAGE, false, false);
          if (!mounted.current || batch.length === 0) break;
          merged = mergeUniquePosts(merged, batch);
        }
        setPosts((prev) => rankHomeFeedPosts(mergeEngagementFromPrevious(merged, prev)));
        nextOffsetRef.current = PAGE * (INITIAL_PREFETCH_PAGES + 1);
        setHasMore(fresh.length > 0);
      }
    } catch (e) {
      error('[HomeFeed] refresh', e);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [mergeUniquePosts, mergeEngagementFromPrevious]);

  /** Tab bar re-tap on Home: pop feed to top + same as pull-to-refresh. */
  const handleTapHomeTabRefresh = useCallback(() => {
    setHeaderCollapsed(false);
    requestAnimationFrame(() => {
      fullscreenFeedRef.current?.scrollToTop();
      homeListModeRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    void onRefresh();
  }, [onRefresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      // Probe multiple DB windows because a page can shrink after filters
      // (blocked users, invalid media, etc.) even when more rows exist.
      const MAX_PROBES = 4;
      let next: Post[] = [];
      let probes = 0;
      let probeOffset = nextOffsetRef.current;
      while (probes < MAX_PROBES && next.length === 0) {
        const batch = await fetchPosts(PAGE, probeOffset, false, false);
        probes += 1;
        if (batch.length > 0) {
          next = batch;
          probeOffset += PAGE;
        } else {
          // Move the probe window forward locally, but don't commit global offset
          // until we actually append posts.
          probeOffset += PAGE;
        }
      }

      if (!mounted.current) return;
      if (next.length === 0) {
        // Avoid getting permanently stuck due transient empty/error pages.
        // Only stop after repeated empty attempts.
        emptyLoadMoreStreakRef.current += 1;
        if (emptyLoadMoreStreakRef.current >= 3) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
        return;
      }

      emptyLoadMoreStreakRef.current = 0;
      nextOffsetRef.current = probeOffset;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        let added = 0;
        for (const p of next) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
            added += 1;
          }
        }
        // Keep trying future DB windows unless repeated probes return nothing.
        if (added === 0) {
          setHasMore(true);
        }
        return merged;
      });
    } catch (e) {
      error('[HomeFeed] loadMore', e);
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading]);

  useFocusEffect(
    useCallback(() => {
      badgeCounter.decrementBadgeCount('community').catch(() => {});
      let cancelled = false;
      (async () => {
        try {
          const flag = await AsyncStorage.getItem('should_refresh_community');
          if (flag !== 'true' || cancelled) return;
          await AsyncStorage.removeItem('should_refresh_community');
          const fresh = await fetchPosts(PAGE, 0, false, false);
          if (!cancelled && mounted.current) {
            let merged: Post[] = [...fresh];
            for (let i = 1; i <= INITIAL_PREFETCH_PAGES; i += 1) {
              const batch = await fetchPosts(PAGE, i * PAGE, false, false);
              if (!mounted.current || batch.length === 0) break;
              merged = mergeUniquePosts(merged, batch);
            }
            setPosts((prev) => rankHomeFeedPosts(mergeEngagementFromPrevious(merged, prev)));
            nextOffsetRef.current = PAGE * (INITIAL_PREFETCH_PAGES + 1);
            setHasMore(fresh.length > 0);
          }
        } catch (e) {
          error('[HomeFeed] focus refresh', e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [mergeUniquePosts, mergeEngagementFromPrevious])
  );

  useEffect(() => {
    loadInitial();
    return () => {
      mounted.current = false;
    };
  }, [loadInitial]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('refreshCommunityFeed', handleTapHomeTabRefresh);
    return () => {
      sub.remove();
    };
  }, [handleTapHomeTabRefresh]);

  useEffect(() => {
    const createdSub = DeviceEventEmitter.addListener('optimisticVideoPostCreated', (payload: { tempId: string; post: Post }) => {
      if (!payload?.tempId || !payload?.post) return;
      setPosts((prev) => {
        if (prev.some((p) => p.id === payload.tempId || p.client_temp_id === payload.tempId)) return prev;
        return [payload.post, ...prev];
      });
    });
    const progressSub = DeviceEventEmitter.addListener(
      'optimisticVideoPostProgress',
      (payload: { tempId: string; status: Post['client_upload_status']; progress: number }) => {
        if (!payload?.tempId) return;
        setPosts((prev) =>
          prev.map((p) =>
            p.id === payload.tempId || p.client_temp_id === payload.tempId
              ? {
                  ...p,
                  client_upload_status: payload.status || 'uploading',
                  client_upload_progress: Math.max(0, Math.min(100, Number(payload.progress || 0))),
                }
              : p
          )
        );
      }
    );
    const failedSub = DeviceEventEmitter.addListener('optimisticVideoPostFailed', (payload: { tempId: string; error?: string }) => {
      if (!payload?.tempId) return;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === payload.tempId || p.client_temp_id === payload.tempId
            ? {
                ...p,
                client_upload_status: 'failed',
                client_error: payload.error || 'Upload failed',
              }
            : p
        )
      );
    });
    const finalizedSub = DeviceEventEmitter.addListener('optimisticVideoPostFinalized', (payload: { tempId: string; post: Post }) => {
      if (!payload?.tempId || !payload?.post) return;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === payload.tempId || p.client_temp_id === payload.tempId
            ? {
                ...payload.post,
                client_upload_status: 'ready',
                client_upload_progress: 100,
              }
            : p
        )
      );
    });
    const adultFlagSub = DeviceEventEmitter.addListener(
      'postAdultContentFlagged',
      (payload: { postId?: string }) => {
        if (!payload?.postId) return;
        setPosts((prev) =>
          prev.map((p) => (p.id === payload.postId ? { ...p, adult_content: true } : p))
        );
      }
    );

    return () => {
      createdSub.remove();
      progressSub.remove();
      failedSub.remove();
      finalizedSub.remove();
      adultFlagSub.remove();
    };
  }, []);

  // (Removed) Old "open modal fullscreen" behavior for Home cards.

  useEffect(() => {
    const id = typeof postIdParam === 'string' ? postIdParam : undefined;
    if (!id) return;
    router.push(`/community/post/${id}`);
    try {
      router.setParams({ postId: undefined });
    } catch {
      /* fallback */
    }
  }, [postIdParam, router]);

  // Track visible items for video autoplay
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const ids = new Set(viewableItems.map((v) => v.item?.id).filter(Boolean) as string[]);
      setVisiblePostIds(ids);
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 100,
  }).current;

  // Handle like changes to update local state
  const handleLikeChange = useCallback((postId: string, liked: boolean, newCount: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_user: liked, liked: liked, likes_count: newCount }
          : p
      )
    );
  }, []);

  // Handle bookmark changes to update local state
  const handleBookmarkChange = useCallback((postId: string, bookmarked: boolean) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, bookmarked, isBookmarked: bookmarked }
          : p
      )
    );
  }, []);

  const handleCommentPosted = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments_count: (p.comments_count ?? 0) + 1 } : p
      )
    );
  }, []);

  const handleReportPost = useCallback(
    (post: Post) => {
      if (!user?.id) {
        Alert.alert('Sign in required', 'Create an account to report posts.');
        return;
      }
      const reporterUsername =
        (typeof user.user_metadata?.username === 'string' && user.user_metadata.username) ||
        (typeof user.email === 'string' ? user.email.split('@')[0] : null) ||
        'Unknown';
      Alert.alert(
        'Report this post?',
        'Our team will review it. Your report is anonymous.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Report',
            style: 'destructive',
            onPress: async () => {
              const ok = await sendUserReport({
                reportedUserId: post.user_id,
                reportedUsername: post.username || 'Unknown',
                reporterUserId: user.id,
                reporterUsername,
                reason: 'inappropriate',
                postId: post.id,
              });
              if (ok) {
                Toast.show({
                  type: 'success',
                  text1: 'Report submitted',
                  text2: 'Thanks for helping keep the community safe.',
                  position: 'bottom',
                });
              } else {
                Toast.show({
                  type: 'error',
                  text1: 'Could not submit report',
                  text2: 'Please try again later.',
                  position: 'bottom',
                });
              }
            },
          },
        ]
      );
    },
    [user]
  );

  const renderItem = useCallback(
    ({ item }: { item: Post; index: number }) => (
      <View>
        <FeedPostCard
          post={item}
          isDark={isDarkMode}
          onPress={() => router.push(`/community/post/${item.id}`)}
          isVisible={visiblePostIds.has(item.id)}
          userId={user?.id}
          viewerIsUnder16={ageGate.isUnder16}
          viewerIsUnder13={ageGate.isUnder13}
          onLikeChange={handleLikeChange}
          onBookmarkChange={handleBookmarkChange}
          onCommentPosted={handleCommentPosted}
          onRetryUpload={handleRetryVideoUpload}
          onReportPost={() => handleReportPost(item)}
        />

        {/* Home ads disabled intentionally */}
        {/* {(index + 1) % 5 === 0 && (
          <View style={styles.inlineAdWrap}>
            <PostScreenAd isDark={isDarkMode} />
          </View>
        )} */}
      </View>
    ),
    [
      isDarkMode,
      router,
      visiblePostIds,
      user?.id,
      ageGate.isUnder16,
      ageGate.isUnder13,
      handleLikeChange,
      handleBookmarkChange,
      handleCommentPosted,
      handleRetryVideoUpload,
      handleReportPost,
    ]
  );

  const openStoryViewer = useCallback((userId: string, storyId?: string) => {
    setStoryViewerUserId(userId);
    setStoryViewerStoryId(storyId);
    setStoryViewerVisible(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLiveStreams().catch(() => {});
    }, [loadLiveStreams])
  );
  const flamingoMain = '#FF6FAE';

  const header = useMemo(() => (
    <View>
      <HomeHeader
        isDark={isDarkMode}
        collapsed={headerCollapsed}
        showModeSwitch={!!user?.id}
        feedMode={feedMode}
        onChangeMode={setFeedMode}
      />
      {!user?.id && (
        <LinearGradient
          colors={isDarkMode ? ['rgba(255,111,174,0.18)', 'rgba(111,147,255,0.12)'] : ['rgba(255,111,174,0.16)', 'rgba(111,147,255,0.10)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.guestCard,
            { borderColor: isDarkMode ? 'rgba(255,111,174,0.40)' : 'rgba(226,85,149,0.24)' },
          ]}
        >
          <Text style={[styles.guestTitle, { color: c.neutral.text }]}>You are browsing as guest</Text>
          <Text style={[styles.guestSub, { color: c.neutral.textSecondary }]}>
            Sign in to post, like, bookmark, and chat.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/auth/signin')}
            activeOpacity={0.86}
            style={[styles.guestButton, { backgroundColor: flamingoMain }]}
          >
            <Text style={styles.guestButtonText}>Sign In</Text>
          </TouchableOpacity>
        </LinearGradient>
      )}
      {!!user?.id && (
        <>
          <UserStatusBar
            liveStreams={liveStreams}
            stories={[]}
            onPressLive={(streamId) => router.push(`/(tabs)/live?streamId=${streamId}` as any)}
            onPressStory={openStoryViewer}
            createButtonMode="whenNotEmpty"
            hideEmptyCta
            onPressCreateStory={() => router.push('/(tabs)/create?tab=story' as any)}
            onPressEmptyCta={() => router.push('/(tabs)/create?tab=story' as any)}
          />
        </>
      )}
    </View>
  ), [isDarkMode, headerCollapsed, openStoryViewer, router, feedMode, liveStreams, user?.id, c.neutral.text, c.neutral.textSecondary, flamingoMain]);

  const displayedPosts = useMemo(() => {
    if (feedMode === 'following') {
      const followingPosts = posts.filter((p) => followingIds.has(p.user_id));
      // If following has too few items, blend with For You so feed isn't stuck on 1-2 posts.
      if (followingPosts.length < 4) {
        const remainder = posts.filter((p) => !followingIds.has(p.user_id));
        return [...followingPosts, ...remainder];
      }
      return followingPosts;
    }
    // For You: prioritize discovery by mixing in users outside follow/follower graph.
    if (!user?.id) return posts;
    const connectedIds = new Set<string>([...followingIds, ...followerIds, user.id]);
    const discovery = posts.filter((p) => !connectedIds.has(p.user_id));
    const connected = posts.filter((p) => connectedIds.has(p.user_id));
    if (discovery.length === 0 || connected.length === 0) return posts;

    const mixed: Post[] = [];
    let d = 0;
    let cIdx = 0;
    // Pattern: 2 discovery posts, then 1 connected post.
    while (d < discovery.length || cIdx < connected.length) {
      if (d < discovery.length) mixed.push(discovery[d++]);
      if (d < discovery.length) mixed.push(discovery[d++]);
      if (cIdx < connected.length) mixed.push(connected[cIdx++]);
    }
    return mixed;
  }, [feedMode, posts, followingIds, followerIds, user?.id]);

  const homeFullscreenRows = useMemo<HomeFeedRow[]>(() => {
    // Home ads disabled intentionally: render only real posts in fullscreen feed.
    return displayedPosts as HomeFeedRow[];
  }, [displayedPosts]);

  const HEADER_GAP = 2;
  const effectiveHeaderHeight =
    homeHeaderHeight > 0 ? homeHeaderHeight : insets.top + 186;
  const tabReserve = getFloatingTabBarReservedHeight(insets.bottom);
  const fallbackFeedHeight = Math.max(
    1,
    windowHeight - effectiveHeaderHeight - HEADER_GAP - tabReserve
  );
  const feedViewportHeight = homeFeedSlotHeight > 0 ? homeFeedSlotHeight : fallbackFeedHeight;

  const showFullscreenFeed = displayedPosts.length > 0;
  const showInitialSkeleton = loading && posts.length === 0;

  return (
    <LinearGradient
      colors={isDarkMode ? ['#090b12', '#0a0b0e'] : ['#f7f8fc', '#ffffff']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.root}
    >
      <View
        onLayout={(e) => setHomeHeaderHeight(e.nativeEvent.layout.height)}
        pointerEvents="auto"
      >
        {header}
      </View>
      <View style={{ height: HEADER_GAP }} />
      <View style={{ flex: 1, minHeight: 0, paddingBottom: tabReserve }}>
        <View
          style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setHomeFeedSlotHeight(h);
          }}
        >
          {showFullscreenFeed ? (
            <HomeFullscreenFeed
              ref={fullscreenFeedRef}
              posts={homeFullscreenRows}
              isDark={isDarkMode}
              containerHeight={feedViewportHeight}
              onFeedScrollStateChange={({ y, direction }) => {
                if (y < 14) {
                  setHeaderCollapsed(false);
                  return;
                }
                if (direction === 'down' && y > 52) {
                  setHeaderCollapsed(true);
                } else if (direction === 'up') {
                  setHeaderCollapsed(false);
                }
              }}
              currentUserId={user?.id}
              onRefresh={onRefresh}
              onEndReached={loadMore}
              refreshing={refreshing}
              onLike={handleVideoLike}
              onReact={handleVideoReact}
              onBookmark={handleVideoBookmark}
              onCommentPosted={handleCommentPosted}
              onOpenProfile={(profileUserId) => {
                if (!profileUserId) return;
                router.push(`/profile/${profileUserId}`);
              }}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              onRetryUpload={handleRetryVideoUpload}
              onReportPost={handleReportPost}
              viewerIsUnder16={ageGate.isUnder16}
              suppressBackgroundPlayback={storyViewerVisible}
            />
          ) : showInitialSkeleton ? (
            <HomeFeedSkeleton isDark={isDarkMode} />
          ) : (
            <FlatList
              ref={homeListModeRef}
              style={{ flex: 1 }}
              data={displayedPosts}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={{
                paddingBottom: 24,
                flexGrow: 1,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={c.primary.main}
                  colors={[c.primary.main]}
                  progressBackgroundColor={isDarkMode ? '#1e1e24' : '#fff'}
                />
              }
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyTitle, { color: c.neutral.text }]}>Nothing yet</Text>
                  <Text style={[styles.emptySub, { color: c.neutral.textSecondary }]}>
                    Be the first to post something
                  </Text>
                </View>
              }
              ListFooterComponent={
                <View style={styles.listFooterReserve}>
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={c.primary.main} />
                  ) : null}
                </View>
              }
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={Platform.OS === 'android'}
              maxToRenderPerBatch={6}
              windowSize={5}
              initialNumToRender={4}
            />
          )}
          <ActivitySummaryCard overlay />
        </View>
      </View>

      {storyViewerUserId && (
        <StoryViewer
          visible={storyViewerVisible}
          onClose={() => setStoryViewerVisible(false)}
          userId={storyViewerUserId}
          initialStoryId={storyViewerStoryId}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  guestCard: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  guestTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
  },
  guestSub: {
    marginTop: 4,
    fontFamily: FontFamily.regular,
    fontSize: 12,
  },
  guestButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  guestButtonText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
  inlineAdWrap: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  footer: { paddingVertical: 20 },
  /** Fixed footer height so spinner on/off does not shift scroll position */
  listFooterReserve: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
});
