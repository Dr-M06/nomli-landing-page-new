import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
  PanResponder,
  Pressable,
  Animated,
  InteractionManager,
  TextInput,
  ScrollView,
  BackHandler,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import { Image as RNImage } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus, Audio } from 'expo-av';
import { X, Eye, MoreVertical, Trash2, Edit, MessageSquare, Send, ChevronDown, Music2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { fetchUserStories, markStoryAsViewed, Story, deleteStory, resetUserStoryViews, STORY_VIDEO_MAX_SECONDS } from '../utils/storyUtils';
import { formatTimeAgo } from '../utils/formatters';

// Story comment types (local copy so we don't depend on storyCommentUtils at load time)
interface StoryComment {
  id: string;
  story_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  username?: string;
  display_name?: string;
  user_avatar?: string;
  profiles?: any;
  likes_count?: number;
  liked?: boolean;
}
import useAuth from '../hooks/useAuth';
import { useRouter } from 'expo-router';
import StoryFlyingHearts from './StoryFlyingHearts';
import StoryReactions from './StoryReactions';
import { supabase } from '../utils/supabase';
import * as Haptics from 'expo-haptics';
import { Heart } from 'lucide-react-native';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PROGRESS_BAR_HEIGHT = 2;
const STORY_DURATION = 5000; // 5 seconds for photos
const STORY_MUSIC_DURATION_MS = 15000; // Keep story music clips in sync with progress
const MIN_SWIPE_DISTANCE = 50;

interface StoryUser {
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

interface StoryViewerProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  initialStoryId?: string;
  allUsersWithStories?: StoryUser[]; // List of all users with stories for auto-advance
  onNextUser?: (userId: string) => void; // Callback when moving to next user
}

export default function StoryViewer({
  visible,
  onClose,
  userId,
  initialStoryId,
  allUsersWithStories = [],
  onNextUser,
}: StoryViewerProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [reactionsCount, setReactionsCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const videoRef = useRef<Video>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const videoFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Lazy-loaded story comment utils (avoids crash when Metro fails to resolve module)
  const storyCommentUtilsRef = useRef<typeof import('../utils/storyCommentUtils') | null>(null);
  // Lazy-loaded StoryViewers modal (avoids "importedDefault of undefined" when module fails to load)
  const [StoryViewersComponent, setStoryViewersComponent] = useState<React.ComponentType<{
    visible: boolean;
    onClose: () => void;
    storyId: string;
    storyOwnerId: string;
    currentUserId: string;
  }> | null>(null);
  const startTime = useRef<number>(Date.now());
  const videoDuration = useRef<number>(0);
  const storyMusicSoundRef = useRef<Audio.Sound | null>(null);
  const storyMusicStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadedStoriesRef = useRef<Map<string, Story[]>>(new Map()); // Cache preloaded stories
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const allUsersWithStoriesRef = useRef(allUsersWithStories); // Keep ref to latest users list
  const onNextUserRef = useRef(onNextUser); // Keep ref to latest callback
  const goToNextRef = useRef<() => void>(() => {}); // So interval/video always call latest goToNext

  // Music wave bars (fancy lightweight animation when story has music)
  const MUSIC_WAVE_BAR_COUNT = 4;
  const musicWaveAnims = useRef(
    Array.from({ length: MUSIC_WAVE_BAR_COUNT }, () => new Animated.Value(0.4))
  ).current;
  
  // Animated values for swipe down gesture
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  
  // Double-tap detection for hearts
  const lastTapTime = useRef<number>(0);
  const lastTapX = useRef<number>(0);
  const lastTapY = useRef<number>(0);
  const heartsRef = useRef<{ addHeart: (x: number) => void } | null>(null);

  const currentStory = stories[currentIndex];
  const isStoryOwner = user?.id === userId;
  const isTextStory = currentStory?.media_url?.includes('.svg') || false;

  // Lightweight text animation for text stories (fade / typewriter); derive from text_style when text_animation missing (backward compat)
  const textStoryAnimOpacity = useRef(new Animated.Value(0)).current;
  const [typewriterChars, setTypewriterChars] = useState(0);
  const metadata = currentStory?.metadata;
  const textAnimation =
    (metadata?.text_animation as string | undefined) ??
    (metadata?.text_style === 'fade' ? 'fade' : metadata?.text_style === 'typewriter' ? 'typewriter' : 'none');
  const captionTrimmed = (currentStory?.caption ?? '').trim();
  const hasTextAnimation = currentStory?.media_type === 'photo' && captionTrimmed.length > 0 && textAnimation && textAnimation !== 'none';

  // Run text story animation when story has metadata.text_animation
  useEffect(() => {
    if (!hasTextAnimation || !captionTrimmed) {
      setTypewriterChars(0);
      textStoryAnimOpacity.setValue(0);
      return;
    }
    if (textAnimation === 'fade') {
      textStoryAnimOpacity.setValue(0);
      Animated.timing(textStoryAnimOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    } else if (textAnimation === 'typewriter') {
      setTypewriterChars(0);
      const total = captionTrimmed.length;
      if (total === 0) return;
      const interval = setInterval(() => {
        setTypewriterChars((c) => {
          if (c >= total) {
            clearInterval(interval);
            return total;
          }
          return c + 1;
        });
      }, 40);
      return () => clearInterval(interval);
    }
  }, [currentStory?.id, textAnimation, hasTextAnimation, captionTrimmed]);

  // Load stories for user - reload when userId changes (for auto-advance)
  useEffect(() => {
    if (visible && userId) {
      log('[StoryViewer] Loading stories for user:', userId);
      loadStories();
    }
  }, [visible, userId]);

  // Lazy-load story comment utils so missing Metro module doesn't crash the app
  const [commentUtilsReady, setCommentUtilsReady] = useState(false);
  useEffect(() => {
    if (!visible || storyCommentUtilsRef.current) return;
    let cancelled = false;
    import('../utils/storyCommentUtils')
      .then((mod) => {
        if (!cancelled) {
          storyCommentUtilsRef.current = mod;
          setCommentUtilsReady(true);
        }
      })
      .catch((err) => {
        if (__DEV__) warn('[StoryViewer] Story comments unavailable:', err?.message || err);
      });
    return () => { cancelled = true; };
  }, [visible]);

  // Lazy-load StoryViewers modal to avoid "importedDefault of undefined" when module fails
  useEffect(() => {
    if (!visible || StoryViewersComponent) return;
    let cancelled = false;
    import('./StoryViewers')
      .then((mod) => {
        if (!cancelled && mod?.default) setStoryViewersComponent(() => mod.default);
      })
      .catch((err) => {
        if (__DEV__) warn('[StoryViewer] StoryViewers modal unavailable:', err?.message || err);
      });
    return () => { cancelled = true; };
  }, [visible, StoryViewersComponent]);

  // Inline story music playback (15s) - lightweight and synced with story progress duration.
  useEffect(() => {
    const audioUrl = visible && currentStory?.audio_url?.trim() ? currentStory.audio_url : null;
    if (!audioUrl) {
      storyMusicStopTimeoutRef.current && clearTimeout(storyMusicStopTimeoutRef.current);
      storyMusicStopTimeoutRef.current = null;
      storyMusicSoundRef.current?.unloadAsync().catch(() => {});
      storyMusicSoundRef.current = null;
      return;
    }
    let cancelled = false;
    const delay = setTimeout(() => {
      (async () => {
        if (cancelled) return;
        try {
          if (storyMusicSoundRef.current) {
            await storyMusicSoundRef.current.unloadAsync();
            storyMusicSoundRef.current = null;
          }
          if (cancelled) return;
          storyMusicStopTimeoutRef.current && clearTimeout(storyMusicStopTimeoutRef.current);
          storyMusicStopTimeoutRef.current = null;
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
        storyMusicSoundRef.current = sound;
        storyMusicStopTimeoutRef.current = setTimeout(async () => {
          if (storyMusicSoundRef.current) {
            await storyMusicSoundRef.current.stopAsync();
            await storyMusicSoundRef.current.unloadAsync();
            storyMusicSoundRef.current = null;
          }
          storyMusicStopTimeoutRef.current = null;
        }, STORY_MUSIC_DURATION_MS);
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinishAndNotStopped) {
            storyMusicStopTimeoutRef.current && clearTimeout(storyMusicStopTimeoutRef.current);
            storyMusicStopTimeoutRef.current = null;
            sound.unloadAsync().catch(() => {});
            storyMusicSoundRef.current = null;
          }
        });
      } catch {
        if (!cancelled) {
          storyMusicSoundRef.current = null;
        }
      }
    })();
    }, 120); // Small defer only; long defer makes progress feel out-of-sync at story start.
    return () => {
      cancelled = true;
      clearTimeout(delay);
      storyMusicStopTimeoutRef.current && clearTimeout(storyMusicStopTimeoutRef.current);
      storyMusicStopTimeoutRef.current = null;
      storyMusicSoundRef.current?.unloadAsync().catch(() => {});
      storyMusicSoundRef.current = null;
    };
  }, [visible, currentStory?.id, currentStory?.audio_url]);

  // Keep inline music playback aligned with hold-to-pause behavior.
  useEffect(() => {
    const sound = storyMusicSoundRef.current;
    if (!sound) return;
    (async () => {
      try {
        if (isPaused || showViewers || showOptions || showComments) {
          await sound.pauseAsync();
        } else {
          await sound.playAsync();
        }
      } catch {
        // Non-fatal: story media flow should continue even if audio command fails.
      }
    })();
  }, [isPaused, showViewers, showOptions, showComments, currentStory?.id]);

  // Music wave animation - gentle loop when story has music
  useEffect(() => {
    const hasMusic = !!(currentStory?.audio_url?.trim());
    if (!hasMusic) {
      musicWaveAnims.forEach((a) => a.setValue(0.4));
      return;
    }
    const barH = 10;
    const loops = musicWaveAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.9,
            duration: 220 + i * 70,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: 220 + i * 70,
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [currentStory?.audio_url]);

  // Load reactions count when story changes (for story owners)
  useEffect(() => {
    if (currentStory && isStoryOwner) {
      loadReactionsCount();
    } else {
      setReactionsCount(0);
    }
  }, [currentStory?.id, isStoryOwner]);

  // Load comments when story changes (and when comment utils become ready after lazy load)
  useEffect(() => {
    if (currentStory?.id) {
      loadComments();
    } else {
      setComments([]);
    }
  }, [currentStory?.id, commentUtilsReady]);

  // Subscribe to real-time comment updates
  useEffect(() => {
    if (!currentStory?.id || !user?.id || !currentStory?.user_id) return;
    const utils = storyCommentUtilsRef.current;
    if (!utils?.subscribeToStoryComments) return;

    const unsubscribe = utils.subscribeToStoryComments(
      currentStory.id,
      user.id,
      currentStory.user_id,
      (comment) => {
        setComments(prev => {
          const exists = prev.some(c => c.id === comment.id);
          if (exists) return prev.map(c => c.id === comment.id ? comment : c);
          return [...prev, comment];
        });
      },
      (commentId) => {
        setComments(prev => prev.filter(c => c.id !== commentId));
      }
    );

    return unsubscribe;
  }, [currentStory?.id, currentStory?.user_id, user?.id]);

  const loadComments = async () => {
    if (!currentStory?.id || !user?.id || !currentStory?.user_id) {
      if (__DEV__) {
        log('[StoryViewer] loadComments skipped:', {
          hasStory: !!currentStory?.id,
          hasUser: !!user?.id,
          hasStoryUserId: !!currentStory?.user_id,
        });
      }
      return;
    }
    const utils = storyCommentUtilsRef.current;
    if (!utils?.fetchStoryComments) return;

    if (__DEV__) {
      log('[StoryViewer] Loading comments for story:', currentStory.id, 'user:', user.id, 'owner:', currentStory.user_id);
    }
    setLoadingComments(true);
    try {
      const storyComments = await utils.fetchStoryComments(
        currentStory.id,
        user.id,
        currentStory.user_id
      );
      if (__DEV__) log('[StoryViewer] Loaded comments:', storyComments.length);
      setComments(storyComments);
    } catch (error) {
      error('[StoryViewer] Error loading comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !currentStory || !user || submittingComment) return;
    const utils = storyCommentUtilsRef.current;
    if (!utils?.addStoryComment) {
      setSubmittingComment(false);
      return;
    }

    const commentContent = commentText.trim();
    setSubmittingComment(true);
    
    const optimisticComment: StoryComment = {
      id: `temp-${Date.now()}`,
      story_id: currentStory.id,
      user_id: user.id,
      content: commentContent,
      created_at: new Date().toISOString(),
      username: user.user_metadata?.username,
      display_name: user.user_metadata?.full_name,
      user_avatar: user.user_metadata?.avatar_url,
      likes_count: 0,
      liked: false,
    };
    
    setComments(prev => [...prev, optimisticComment]);
    setCommentText('');
    
    try {
      const newComment = await utils.addStoryComment(currentStory.id, user.id, commentContent);
      if (newComment) {
        // Replace optimistic comment with real one (remove temp, add real)
        setComments(prev => {
          // Remove optimistic comment
          const withoutOptimistic = prev.filter(c => c.id !== optimisticComment.id);
          // Check if real comment already exists (from subscription)
          const exists = withoutOptimistic.some(c => c.id === newComment.id);
          if (!exists) {
            return [...withoutOptimistic, newComment];
          }
          return withoutOptimistic;
        });
      } else {
        // If submission failed, remove optimistic comment
        setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
        Alert.alert('Error', 'Failed to post comment. Please try again.');
      }
    } catch (error) {
      error('[StoryViewer] Error submitting comment:', error);
      // Remove optimistic comment on error
      setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const loadStories = async () => {
    const preloadedStories = preloadedStoriesRef.current.get(userId);
    const usePreloaded = preloadedStories && preloadedStories.length > 0;
    if (!usePreloaded) setLoading(true);
    try {
      let userStories: Story[];
      if (usePreloaded) {
        log(`[StoryViewer] Using preloaded stories for user: ${userId}`);
        userStories = preloadedStories;
        preloadedStoriesRef.current.delete(userId);
      } else {
        userStories = await fetchUserStories(userId);
      }
      
      log('[StoryViewer] Loaded stories:', {
        count: userStories.length,
        viewedCount: userStories.filter(s => s.viewed).length,
        hasInitialStoryId: !!initialStoryId,
        isStoryOwner,
      });
      
      // For story owners: always start from beginning when reopening (ignore initialStoryId)
      // This gives them a fresh viewing experience of their own content
      // For non-owners: check if all stories viewed, then reset
      const allViewed = !isStoryOwner && userStories.length > 0 && userStories.every(s => s.viewed);

      log('[StoryViewer] All viewed check:', {
        allViewed,
        isStoryOwner,
        storyCount: userStories.length,
        hasInitialStoryId: !!initialStoryId,
      });

      // CRITICAL FIX: Don't reset views during auto-advance - this causes loops!
      // The reset logic was causing: reset -> show first story -> auto-advance -> reset again -> loop
      // Instead, just show the stories as viewed and let auto-advance work normally
      // Users can manually refresh if they want to rewatch
      
      // If all stories are viewed, just show them (don't reset to prevent loops)
      if (allViewed) {
        log('[StoryViewer] All stories viewed - showing as viewed (no reset to prevent auto-advance loops)');
        setStories(userStories);
        setCurrentIndex(0); // Start from first story even if all viewed
        setLoading(false);
        return; // Early return to prevent further processing that might trigger loops
      } 
      // For story owners: always start from beginning (ignore initialStoryId from StatusBar)
      else if (isStoryOwner) {
        log('[StoryViewer] ✅ Story owner reopening own stories - always starting from beginning (ignoring initialStoryId)');
        setStories(userStories);
        setCurrentIndex(0);
      }
      // Normal flow for non-owners: prioritize first unviewed story over initialStoryId
      else {
        setStories(userStories);
        
        // Always prioritize first unviewed story for better UX
        // initialStoryId is just a hint from StatusBar, but we want to show unviewed content first
        const firstUnviewedIndex = userStories.findIndex(s => !s.viewed);
        
        if (firstUnviewedIndex >= 0) {
          // Start from first unviewed story
          setCurrentIndex(firstUnviewedIndex);
          log('[StoryViewer] Starting from first unviewed story, index:', firstUnviewedIndex, {
            initialStoryIdProvided: !!initialStoryId,
            initialStoryIdIndex: initialStoryId ? userStories.findIndex(s => s.id === initialStoryId) : -1,
          });
        } else {
          // All stories viewed - use initialStoryId if provided, otherwise start from beginning
          if (initialStoryId) {
            const index = userStories.findIndex(s => s.id === initialStoryId);
            const finalIndex = index >= 0 ? index : 0;
            setCurrentIndex(finalIndex);
            log('[StoryViewer] All stories viewed, using initialStoryId, index:', finalIndex);
          } else {
            setCurrentIndex(0);
            log('[StoryViewer] All stories viewed, no initialStoryId, starting from beginning');
          }
        }
      }
    } catch (error) {
      error('[StoryViewer] Error loading stories:', error);
      Alert.alert('Error', 'Failed to load stories');
      InteractionManager.runAfterInteractions(() => onClose());
    } finally {
      setLoading(false);
    }
  };

  // Aggressive preloading: Preload current, next, and previous story media
  useEffect(() => {
    if (stories.length > 0 && !isPaused && !loading) {
      // Preload current story (if not already loaded)
      const currentStory = stories[currentIndex];
      if (currentStory) {
        if (currentStory.media_type === 'photo' && currentStory.media_url) {
          Image.prefetch(currentStory.media_url).catch(() => {});
        }
      }

      // Preload next story in current user's stories
      if (currentIndex < stories.length - 1) {
        const nextStory = stories[currentIndex + 1];
        if (nextStory) {
          if (nextStory.media_type === 'photo' && nextStory.media_url) {
          Image.prefetch(nextStory.media_url).catch(() => {});
        }
      }
      }

      // Preload previous story for smooth back navigation
      if (currentIndex > 0) {
        const prevStory = stories[currentIndex - 1];
        if (prevStory && prevStory.media_type === 'photo' && prevStory.media_url) {
          Image.prefetch(prevStory.media_url).catch(() => {});
        }
      }
    }
  }, [currentIndex, stories, isPaused, loading]);

  // Keep refs updated with latest values
  useEffect(() => {
    allUsersWithStoriesRef.current = allUsersWithStories;
    onNextUserRef.current = onNextUser;
  }, [allUsersWithStories, onNextUser]);

  // Preload next user's stories while current stories play (WhatsApp/TikTok style)
  useEffect(() => {
    if (allUsersWithStories.length > 0 && stories.length > 0 && !isPaused && !loading) {
      // Find current user index in the list
      const currentUserIndex = allUsersWithStories.findIndex(u => u.userId === userId);
      
      if (currentUserIndex >= 0 && currentUserIndex < allUsersWithStories.length - 1) {
        const nextUserId = allUsersWithStories[currentUserIndex + 1].userId;
        
        // Clear any existing preload timeout
        if (preloadTimeoutRef.current) {
          clearTimeout(preloadTimeoutRef.current);
        }

        // Preload next user's stories after a short delay (don't block current story)
        preloadTimeoutRef.current = setTimeout(async () => {
          // Check if already preloaded
          if (!preloadedStoriesRef.current.has(nextUserId)) {
            try {
              log(`[StoryViewer] Preloading stories for next user: ${nextUserId}`);
              const nextUserStories = await fetchUserStories(nextUserId);
              preloadedStoriesRef.current.set(nextUserId, nextUserStories);
              
              // Preload all media from next user's stories
              nextUserStories.forEach((story, index) => {
                if (story.media_type === 'photo' && story.media_url) {
                  Image.prefetch(story.media_url).catch(() => {});
                }
                // For videos, we can't preload but we can prefetch metadata
              });
              
              log(`[StoryViewer] ✅ Preloaded ${nextUserStories.length} stories for next user`);
            } catch (error) {
              warn(`[StoryViewer] Failed to preload next user stories:`, error);
            }
          }
        }, 1000); // Wait 1 second before preloading to not interfere with current story
      }
    }

    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, [userId, stories, allUsersWithStories, isPaused, loading]);

  // Mark story as viewed (but not own stories)
  useEffect(() => {
    if (currentStory && !currentStory.viewed && !isStoryOwner) {
      markStoryAsViewed(currentStory.id);
    }
  }, [currentStory, isStoryOwner]);

  // Progress bar animation (use stories/currentIndex so we don't retrigger on currentStory identity change)
  useEffect(() => {
    const story = stories[currentIndex];
    if (!story || isPaused || loading || showViewers || showOptions || showComments) return;

    startTime.current = Date.now();
    setProgress(0);
    videoDuration.current = 0;

    if (story.media_type !== 'video') {
      // Photos/text: if story has attached music, use music clip duration so progress stays in sync.
      const duration = story.audio_url?.trim() ? STORY_MUSIC_DURATION_MS : STORY_DURATION;
      progressInterval.current = setInterval(() => {
        const elapsed = Date.now() - startTime.current;
        const newProgress = Math.min((elapsed / duration) * 100, 100);
        setProgress(newProgress);
        if (newProgress >= 100) {
          goToNextRef.current();
        }
      }, 100);
    } else {
      // Video: progress is driven only by onPlaybackStatusUpdate (no timer) so the bar stays in sync with playback and doesn't skip. didJustFinish in callback handles advance.
      // Fallback: advance after max length in case video never fires didJustFinish (e.g. error).
      const FALLBACK_VIDEO_MS = STORY_VIDEO_MAX_SECONDS * 1000;
      videoFallbackTimeoutRef.current = setTimeout(() => {
        videoFallbackTimeoutRef.current = null;
        goToNextRef.current();
      }, FALLBACK_VIDEO_MS);
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      if (videoFallbackTimeoutRef.current) {
        clearTimeout(videoFallbackTimeoutRef.current);
        videoFallbackTimeoutRef.current = null;
      }
    };
  }, [currentIndex, isPaused, loading, stories, showViewers, showOptions, showComments]);

  // Cleanup video and preload timeout on unmount
  useEffect(() => {
    return () => {
      // Clear preload timeout
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
      
      // Cleanup video
      InteractionManager.runAfterInteractions(() => {
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
          videoRef.current.unloadAsync().catch(() => {});
        }
      });
      
      // Clear preloaded stories cache
      preloadedStoriesRef.current.clear();
    };
  }, []);

  const goToNext = () => {
    // Clear progress interval immediately to prevent any further progress updates
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    
    if (currentIndex < stories.length - 1) {
      // Move to next story in current user's stories
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      // Current user's stories finished - auto-advance to next user (WhatsApp/TikTok style)
      // Use refs to get latest values (important for closures in intervals)
      const currentUsersList = allUsersWithStoriesRef.current;
      const nextUserCallback = onNextUserRef.current;
      
      log('[StoryViewer] Current user stories finished, checking for next user...', {
        allUsersWithStoriesLength: currentUsersList.length,
        hasOnNextUser: !!nextUserCallback,
        currentUserId: userId,
        allUserIds: currentUsersList.map(u => u.userId),
      });
      
      if (currentUsersList.length > 0 && nextUserCallback) {
        const currentUserIndex = currentUsersList.findIndex(u => u.userId === userId);
        log('[StoryViewer] Current user index:', currentUserIndex, 'Total users:', currentUsersList.length);
        
        // Check if there's a next user to advance to
        if (currentUserIndex >= 0 && currentUserIndex < currentUsersList.length - 1) {
          const nextUserId = currentUsersList[currentUserIndex + 1].userId;
          log(`[StoryViewer] ✅ Found next user: ${nextUserId}, auto-advancing...`);
          
          // Check if we have preloaded stories for next user
          const preloadedStories = preloadedStoriesRef.current.get(nextUserId);
          
          if (preloadedStories && preloadedStories.length > 0) {
            // Use preloaded stories for instant transition (keep in cache so loadStories can use them without refetch)
            log(`[StoryViewer] ✅ Using preloaded stories for next user: ${nextUserId}`);
            setStories(preloadedStories);
            setCurrentIndex(0);
            setProgress(0);
            setTimeout(() => nextUserCallback(nextUserId), 0);
            return;
          }
          
          // If not preloaded, trigger callback to load next user
          log(`[StoryViewer] ✅ Auto-advancing to next user (will load): ${nextUserId}`);
          setTimeout(() => nextUserCallback(nextUserId), 0);
          return;
        } else {
          // Last user's last story - clean exit (no reset, no loop)
          log('[StoryViewer] ✅ Last story of last user finished - closing viewer cleanly');
          if (preloadTimeoutRef.current) {
            clearTimeout(preloadTimeoutRef.current);
            preloadTimeoutRef.current = null;
          }
          // Defer close so we're not inside the interval callback (avoids iOS freeze when story closes on its own)
          InteractionManager.runAfterInteractions(() => {
            onClose();
          });
          return;
        }
      } else {
        log('[StoryViewer] ⚠️ Auto-advance not available - closing viewer:', {
          hasUsers: currentUsersList.length > 0,
          hasCallback: !!nextUserCallback,
        });
        if (preloadTimeoutRef.current) {
          clearTimeout(preloadTimeoutRef.current);
          preloadTimeoutRef.current = null;
        }
        InteractionManager.runAfterInteractions(() => {
          onClose();
        });
        return;
      }
    }
  };

  goToNextRef.current = goToNext;

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    }
  };

  const handleDeleteStory = async () => {
    if (!currentStory) return;
    
    Alert.alert(
      'Delete Story',
      'Are you sure you want to delete this story?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteStory(currentStory.id);
            if (success) {
              // Remove from local state
              const newStories = stories.filter(s => s.id !== currentStory.id);
              setStories(newStories);
              
              if (newStories.length === 0) {
                InteractionManager.runAfterInteractions(() => onClose());
              } else if (currentIndex >= newStories.length) {
                // If we deleted the last story, go to previous
                setCurrentIndex(newStories.length - 1);
              }
              // Current index stays same, will show next story
            } else {
              Alert.alert('Error', 'Failed to delete story');
            }
          },
        },
      ]
    );
  };

  const handleEditStory = () => {
    // For now, just show an alert. You can implement edit later
    Alert.alert('Edit Story', 'Story editing coming soon!');
  };

  // Handle double tap for hearts
  const handleDoubleTap = (event: any) => {
    const now = Date.now();
    const { locationX, locationY } = event.nativeEvent;
    const DOUBLE_TAP_DELAY = 300;
    const DOUBLE_TAP_DISTANCE = 50; // Maximum distance between taps

    if (
      now - lastTapTime.current < DOUBLE_TAP_DELAY &&
      Math.abs(locationX - lastTapX.current) < DOUBLE_TAP_DISTANCE &&
      Math.abs(locationY - lastTapY.current) < DOUBLE_TAP_DISTANCE
    ) {
      // Double tap detected!
      const tapX = locationX;
      
      // Add animated heart at tap location
      if (heartsRef.current) {
        heartsRef.current.addHeart(tapX);
      }
      
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Save reaction to database - fire and forget, non-blocking, optional network call
      // Confetti animation is already triggered above, this doesn't affect it
      if (currentStory && user) {
        setTimeout(() => {
          saveStoryReaction(currentStory.id, user.id, tapX).catch(() => {
            // Silently handle - no network ingress consumed on failure
          });
        }, 0);
      }
      
      // Reset tap tracking
      lastTapTime.current = 0;
    } else {
      // Single tap - update tap tracking
      lastTapTime.current = now;
      lastTapX.current = locationX;
      lastTapY.current = locationY;
    }
  };

  // Save story reaction to database - ensures only one reaction per user
  const saveStoryReaction = async (storyId: string, userId: string, xPosition: number) => {
    try {
      // First, check if user already has a reaction for this story
      const { data: existingReaction, error: checkError } = await supabase
        .from('story_reactions')
        .select('id')
        .eq('story_id', storyId)
        .eq('user_id', userId)
        .limit(1)
        .single();

      // If user already reacted, don't create duplicate - just update timestamp/position
      if (existingReaction && !checkError) {
        // Update existing reaction (update timestamp and position)
        const { error: updateError } = await supabase
          .from('story_reactions')
          .update({
            x_position: xPosition,
            created_at: new Date().toISOString(), // Update timestamp
          })
          .eq('id', existingReaction.id);

        if (updateError && updateError.code !== '42P01') {
          // Silently handle update errors
          return;
        }
      } else {
        // No existing reaction - insert new one
        const { error: insertError } = await supabase
          .from('story_reactions')
          .insert({
            story_id: storyId,
            user_id: userId,
            x_position: xPosition,
            reaction_type: 'heart',
          });

        if (insertError) {
          // If table doesn't exist, that's okay - silently skip
          if (insertError.code === '42P01' || insertError.message?.includes('does not exist')) {
            return;
          }
          // For duplicate key errors (if unique constraint exists), that's also okay
          if (insertError.code === '23505') {
            // Unique constraint violation - user already reacted, ignore
            return;
          }
          return;
        }
      }

      // Update reactions count if we're the story owner - async, non-blocking
      if (isStoryOwner && currentStory?.id === storyId) {
        setTimeout(() => {
          loadReactionsCount().catch(() => {
            // Silently handle - no network ingress consumed on failure
          });
        }, 0);
      }
    } catch (error) {
      // Silently handle errors - table may not exist yet
    }
  };

  // Load reactions count for current story - async, non-blocking, optional network call
  // Excludes story owner's own reactions and counts unique users only (one per user)
  const loadReactionsCount = async (): Promise<number> => {
    if (!currentStory) return Promise.resolve(0);
    
    try {
      // Get all unique user IDs who reacted (excluding story owner)
      const { data, error } = await supabase
        .from('story_reactions')
        .select('user_id')
        .eq('story_id', currentStory.id)
        .neq('user_id', userId); // Exclude story owner's reactions

      if (error) {
        // If table doesn't exist, that's okay - silently handle
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setReactionsCount(0);
          return 0;
        }
        // Silently handle other errors - no network ingress consumed on failure
        return 0;
      } else {
        // Count unique users (one per user, even if they reacted multiple times)
        const uniqueUserIds = new Set(data?.map(r => r.user_id) || []);
        const countValue = uniqueUserIds.size;
        setReactionsCount(countValue);
        return countValue;
      }
    } catch (error) {
      // Silently handle - no network ingress consumed on failure
      setReactionsCount(0);
      return 0;
    }
  };

  // Reset animation values when modal opens/closes
  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      opacity.setValue(1);
    }
  }, [visible]);

  // Android back button handler
  useEffect(() => {
    if (!visible) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [visible, onClose]);

  // Pan responder for swipe down to close with visual feedback
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes (down)
        return Math.abs(gestureState.dy) > 10 && gestureState.dy > 0;
      },
      onPanResponderGrant: () => {
        // Pause story when starting to drag
        setIsPaused(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          // Update translateY for visual feedback
          translateY.setValue(gestureState.dy);
          
          // Fade out as user drags down
          const opacityValue = Math.max(0, 1 - (gestureState.dy / SCREEN_HEIGHT));
          opacity.setValue(opacityValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const SWIPE_THRESHOLD = 100; // Minimum distance to close
        const VELOCITY_THRESHOLD = 500; // Fast swipe velocity
        
        if (gestureState.dy > SWIPE_THRESHOLD || gestureState.velocityY > VELOCITY_THRESHOLD) {
          // Close the story
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            translateY.setValue(0);
            opacity.setValue(1);
          onClose();
          });
        } else {
          // Snap back to original position
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 50,
              friction: 8,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              useNativeDriver: true,
              tension: 50,
              friction: 8,
            }),
          ]).start(() => {
            setIsPaused(false);
          });
        }
      },
    })
  ).current;

  const handleVideoPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      // Update video duration if available
      if (status.durationMillis && status.durationMillis !== videoDuration.current) {
        videoDuration.current = status.durationMillis;
      }
      
      // Update progress bar based on video playback position
      if (status.positionMillis !== undefined && videoDuration.current > 0) {
        const newProgress = Math.min((status.positionMillis / videoDuration.current) * 100, 100);
        setProgress(newProgress);
      }
      
      // Auto-advance when video finishes
      if (status.didJustFinish) {
        if (videoFallbackTimeoutRef.current) {
          clearTimeout(videoFallbackTimeoutRef.current);
          videoFallbackTimeoutRef.current = null;
        }
        goToNextRef.current();
      }
    }
  };

  // Render as overlay View instead of Modal to avoid iOS modal-dismiss freeze (homescreen stuck)
  if (!visible) return null;

  if (loading) {
    return (
      <View style={[styles.storyOverlayRoot, styles.loadingContainer, { backgroundColor: '#000000' }]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!currentStory) {
    return null;
  }

  return (
    <View style={styles.storyOverlayRoot}>
      <Animated.View 
        style={[
          styles.container,
          {
            transform: [{ translateY }],
            opacity,
          }
        ]}
        {...panResponder.panHandlers}
        onTouchEnd={handleDoubleTap}
      >
        {/* Story Media - photo and text story use same lightweight Image */}
        {currentStory.media_type === 'photo' ? (
          <Image
            source={{ uri: currentStory.media_url }}
            style={styles.media}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={200}
            priority="high"
            recyclingKey={currentStory.id}
          />
        ) : (
          // Video story
          <Video
            ref={videoRef}
            source={{ uri: currentStory.media_url }}
            style={styles.media}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={!isPaused}
            isLooping={false}
            isMuted={false}
            useNativeControls={false}
            onPlaybackStatusUpdate={handleVideoPlaybackStatusUpdate}
            progressUpdateIntervalMillis={100}
            playInSilentModeIOS={true}
            staysActiveInBackground={false}
            allowsExternalPlayback={false}
            ignoreSilentSwitch="ignore"
          />
        )}

        {/* Lightweight text animation overlay (fade / typewriter) for text stories - transparent so image stays visible */}
        {hasTextAnimation && captionTrimmed.length > 0 && (
          <View style={styles.textStoryAnimationOverlay} pointerEvents="box-none">
            {textAnimation === 'fade' ? (
              <Animated.Text
                style={[
                  styles.textStoryAnimationText,
                  { opacity: textStoryAnimOpacity },
                ]}
                numberOfLines={12}
              >
                {captionTrimmed}
              </Animated.Text>
            ) : textAnimation === 'typewriter' ? (
              <Text style={styles.textStoryAnimationText} numberOfLines={12}>
                {captionTrimmed.slice(0, typewriterChars)}
              </Text>
            ) : null}
          </View>
        )}

        {/* Gradient overlays */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={styles.topGradient}
        />

        {/* Progress bars */}
        <View style={styles.progressContainer}>
          {stories.map((_, index) => (
            <View key={index} style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${
                      index < currentIndex
                        ? 100
                        : index === currentIndex
                        ? progress
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Header with absolute positioning to prevent navigation interference */}
        <View style={styles.headerContainer} pointerEvents="box-none">
          <View style={styles.header} pointerEvents="box-none">
            <TouchableOpacity 
              style={styles.userInfo} 
              onPress={() => {
                router.push(`/profile/${userId}`);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Image
                source={{ uri: currentStory.avatar_url || 'https://via.placeholder.com/40' }}
                style={styles.userAvatar}
              />
              <View style={styles.userTextContainer}>
                <Text style={styles.username} numberOfLines={1}>
                  {currentStory.display_name || currentStory.username}
                </Text>
                <Text style={styles.timestamp}>
                  {formatTimeAgo(currentStory.created_at)}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.headerRight} pointerEvents="box-none">
              <TouchableOpacity 
                style={[styles.iconButton, { zIndex: 100 }]}
                onPress={onClose}
                activeOpacity={0.7}
                onPressIn={(e) => e.stopPropagation()}
                onPressOut={(e) => e.stopPropagation()}
              >
                <X size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
          {/* Attached music - label + fancy wave animation */}
          {currentStory.audio_url && (currentStory.audio_title || currentStory.audio_artist) && (
            <View style={styles.storyMusicHeader}>
              <View style={styles.storyMusicLabelPill}>
                <Music2 size={14} color="rgba(255,255,255,0.95)" strokeWidth={2.5} />
                <View style={styles.storyMusicWaveWrap}>
                  {musicWaveAnims.map((anim, i) => (
                    <View key={i} style={styles.storyMusicWaveBarWrap}>
                      <Animated.View
                        style={[
                          styles.storyMusicWaveBar,
                          {
                            transform: [
                              { scaleY: anim },
                              { translateY: anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [5, 0],
                              }) },
                            ],
                          },
                        ]}
                      />
                    </View>
                  ))}
                </View>
                <Text style={styles.storyMusicLabelText} numberOfLines={1}>
                  {[currentStory.audio_title, currentStory.audio_artist].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Caption - pill above tab bar, fits text (hide for text stories since text is in the image) */}
        {!isTextStory && currentStory.caption && (
          <View style={[styles.captionWrapper, { bottom: insets.bottom + 88 + 12 }]}>
            <View style={styles.captionContainer}>
              <Text style={styles.caption} numberOfLines={4}>{currentStory.caption}</Text>
            </View>
          </View>
        )}

        {/* Bottom Left Actions - Heart Reaction and Comment Buttons (above caption, like video feed) */}
        {currentStory && !isStoryOwner && (
          <View 
            style={[styles.bottomLeftActions, { bottom: insets.bottom + 200 }]} 
            pointerEvents="box-none"
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          >
            <TouchableOpacity
              style={styles.heartReactionButton}
              onPress={(e) => {
                e.stopPropagation();
                const tapX = SCREEN_WIDTH / 2; // Center of screen
                const tapY = SCREEN_HEIGHT / 2; // Center of screen for confetti
                
                // Trigger confetti explosion immediately - purely client-side, no network calls
                if (heartsRef.current) {
                  heartsRef.current.addConfetti(tapX, tapY);
                }
                
                // Haptic feedback - client-side only
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                
                // Database save happens asynchronously in background - doesn't block confetti animation
                // Fire and forget - won't consume ingress if it fails
                if (currentStory && user) {
                  // Use setTimeout to ensure confetti animation isn't blocked
                  setTimeout(() => {
                    saveStoryReaction(currentStory.id, user.id, tapX).catch(() => {
                      // Silently handle - no network ingress consumed on failure
                    });
                    
                    // Update reactions count if we're the story owner (also async, non-blocking)
                    if (isStoryOwner) {
                      setTimeout(() => {
                        loadReactionsCount().catch(() => {
                          // Silently handle - no network ingress consumed on failure
                        });
                      }, 100);
                    }
                  }, 0);
                }
              }}
              onPressIn={(e) => e.stopPropagation()}
              onPressOut={(e) => e.stopPropagation()}
              activeOpacity={0.8}
              accessibilityLabel="React to story"
            >
              <Heart size={28} color="#FFFFFF" fill="#FF1744" strokeWidth={2} />
            </TouchableOpacity>
            
            {/* Comment Button */}
            <TouchableOpacity
              style={styles.commentButton}
              onPress={(e) => {
                e.stopPropagation();
                setIsPaused(true);
                setShowComments(true);
              }}
              onPressIn={(e) => e.stopPropagation()}
              onPressOut={(e) => e.stopPropagation()}
              activeOpacity={0.8}
              accessibilityLabel="View comments"
            >
              <MessageSquare size={28} color="#FFFFFF" strokeWidth={2} />
              {comments.length > 0 && (
                <View style={styles.commentCountBadge}>
                  <Text style={styles.commentCountBadgeText}>
                    {comments.length >= 1000 
                      ? `${(comments.length / 1000).toFixed(1)}K` 
                      : comments.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Right Actions (only for story owner) - above caption, like video feed */}
        {isStoryOwner && currentStory && (
          <View 
            style={[styles.bottomRightActions, { bottom: insets.bottom + 200 }]} 
            pointerEvents="box-none"
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          >
            {/* Comments button - always show for story owner */}
            <TouchableOpacity
              style={styles.bottomActionButton}
              onPress={(e) => {
                e.stopPropagation();
                setIsPaused(true);
                setShowComments(true);
              }}
              onPressIn={(e) => e.stopPropagation()}
              onPressOut={(e) => e.stopPropagation()}
              activeOpacity={0.8}
              accessibilityLabel="View story comments"
            >
              <MessageSquare size={22} color="#FFFFFF" strokeWidth={2} />
              {comments.length > 0 && (
                <View style={styles.reactionCountBadge}>
                  <Text style={styles.reactionCountBadgeText}>
                    {comments.length >= 1000 
                      ? `${(comments.length / 1000).toFixed(1)}K` 
                      : comments.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            
            {/* Reactions button - show reactions count */}
            {reactionsCount > 0 && (
              <TouchableOpacity
                style={styles.bottomActionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  setIsPaused(true);
                  setShowReactions(true);
                }}
                onPressIn={(e) => e.stopPropagation()}
                onPressOut={(e) => e.stopPropagation()}
                activeOpacity={0.8}
                accessibilityLabel="View story reactions"
              >
                <Heart size={22} color="#FFFFFF" fill="#FF1744" strokeWidth={2} />
                <View style={styles.reactionCountBadge}>
                  <Text style={styles.reactionCountBadgeText}>
                    {reactionsCount >= 1000 
                      ? `${(reactionsCount / 1000).toFixed(1)}K` 
                      : reactionsCount}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            
            {/* Viewers button - always show for story owner */}
            <TouchableOpacity
              style={styles.bottomActionButton}
              onPress={(e) => {
                e.stopPropagation();
                setIsPaused(true);
                setShowViewers(true);
              }}
              onPressIn={(e) => e.stopPropagation()}
              onPressOut={(e) => e.stopPropagation()}
              activeOpacity={0.8}
              accessibilityLabel="View story viewers"
            >
              <Eye size={22} color="#FFFFFF" strokeWidth={2} />
              {currentStory.views_count > 0 && (
                <View style={styles.viewCountBadge}>
                  <Text style={styles.viewCountBadgeText}>
                    {currentStory.views_count >= 1000 
                      ? `${(currentStory.views_count / 1000).toFixed(1)}K` 
                      : currentStory.views_count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            
            {/* Delete button */}
            <TouchableOpacity
              style={styles.bottomActionButton}
              onPress={(e) => {
                e.stopPropagation();
                setIsPaused(true);
                setShowOptions(true);
              }}
              onPressIn={(e) => e.stopPropagation()}
              onPressOut={(e) => e.stopPropagation()}
              activeOpacity={0.8}
              accessibilityLabel="Delete story"
            >
              <Trash2 size={22} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* Navigation areas - only active when modals are closed */}
        {!showViewers && !showOptions && (
          <View style={styles.navigationContainer} pointerEvents="box-none">
            {/* Previous area - exclude bottom right corner where buttons are */}
            <Pressable
              style={styles.navAreaLeft}
              onPress={goToPrevious}
              onPressIn={() => setIsPaused(true)}
              onPressOut={() => setIsPaused(false)}
            />
            
            {/* Next area - exclude bottom right corner where buttons are */}
            <View style={styles.navAreaRight}>
              <Pressable
                style={styles.navAreaRightTop}
                onPress={goToNext}
                onPressIn={() => setIsPaused(true)}
                onPressOut={() => setIsPaused(false)}
              />
              {/* Bottom right corner excluded - where action buttons are */}
              <View style={styles.navAreaRightBottom} />
            </View>
          </View>
        )}

      </Animated.View>

      {/* Story Viewers - overlay (no nested Modal; iOS doesn't support modal-on-modal) */}
      {currentStory && StoryViewersComponent && (
        <StoryViewersComponent
          visible={showViewers}
          onClose={() => {
            setShowViewers(false);
            setIsPaused(false);
          }}
          storyId={currentStory.id}
          storyOwnerId={userId}
          currentUserId={user?.id || ''}
          useOverlay
        />
      )}

      {/* Story Reactions - overlay (no nested Modal; iOS doesn't support modal-on-modal) */}
      {currentStory && (
        <StoryReactions
          visible={showReactions}
          onClose={() => {
            setShowReactions(false);
            setIsPaused(false);
          }}
          storyId={currentStory.id}
          storyOwnerId={userId}
          currentUserId={user?.id || ''}
          useOverlay
        />
      )}

      {/* Story Comments - overlay (no nested Modal; iOS doesn't support modal-on-modal) */}
      {showComments && (
        <View style={styles.overlayRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              Keyboard.dismiss();
              setShowComments(false);
              setIsPaused(false);
            }}
          />
          <KeyboardAvoidingView
            style={styles.commentsOverlaySheet}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <View style={styles.commentsModalContainer}>
              <View style={styles.commentsModalHeader}>
                <Text style={styles.commentsModalTitle}>Comments ({comments.length})</Text>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowComments(false);
                    setIsPaused(false);
                  }}
                  style={styles.commentsModalCloseButton}
                >
                  <X size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.commentsListContainer}>
                  {loadingComments ? (
                    <View style={styles.commentsLoadingContainer}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  ) : comments.length === 0 ? (
                    <View style={styles.commentsEmptyContainer}>
                      <Text style={styles.commentsEmptyText}>No comments yet</Text>
                      <Text style={styles.commentsEmptySubtext}>Be the first to comment!</Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.commentsScrollView} keyboardShouldPersistTaps="handled">
                      {comments.map((comment) => (
                        <View key={comment.id} style={styles.commentItem}>
                          <Image
                            source={{ uri: comment.user_avatar || 'https://via.placeholder.com/40' }}
                            style={styles.commentAvatar}
                            contentFit="cover"
                          />
                          <View style={styles.commentContent}>
                            <View style={styles.commentHeader}>
                              <Text style={styles.commentUsername}>
                                {comment.display_name || comment.username || 'User'}
                              </Text>
                              <Text style={styles.commentTime}>
                                {formatTimeAgo(comment.created_at)}
                              </Text>
                            </View>
                            <Text style={styles.commentText}>{comment.content}</Text>
                          </View>
                          {(isStoryOwner || comment.user_id === user?.id) && (
                            <TouchableOpacity
                              onPress={async () => {
                                const utils = storyCommentUtilsRef.current;
                                if (!utils?.deleteStoryComment || !user?.id) return;
                                const success = await utils.deleteStoryComment(comment.id, user.id);
                                if (success) {
                                  setComments(prev => prev.filter(c => c.id !== comment.id));
                                }
                              }}
                              style={styles.commentDeleteButton}
                            >
                              <Trash2 size={16} color="#FF3B5C" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </TouchableWithoutFeedback>
              {user && !isStoryOwner && (
                <View style={[styles.commentInputContainer, { paddingBottom: Math.max(16, insets.bottom) + 80 }]}>
                  <TouchableOpacity
                    onPress={() => Keyboard.dismiss()}
                    style={styles.commentKeyboardDown}
                    hitSlop={8}
                    accessibilityLabel="Hide keyboard"
                  >
                    <ChevronDown size={22} color="rgba(255, 255, 255, 0.7)" strokeWidth={2.5} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="Add a comment..."
                    placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    value={commentText}
                    onChangeText={setCommentText}
                    multiline
                    maxLength={500}
                  />
                  <TouchableOpacity
                    onPress={handleSubmitComment}
                    disabled={!commentText.trim() || submittingComment}
                    style={[
                      styles.commentSendButton,
                      (!commentText.trim() || submittingComment) && styles.commentSendButtonDisabled
                    ]}
                  >
                    {submittingComment ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Send size={20} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {isStoryOwner && comments.length > 0 && (
                <View style={[styles.commentInputContainer, { paddingBottom: Math.max(16, insets.bottom) + 80 }]}>
                  <Text style={styles.storyOwnerMessage}>
                    You can see all comments on your story. Tap the trash icon to delete any comment.
                  </Text>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* Story Options - overlay (no nested Modal; iOS doesn't support modal-on-modal) */}
      {showOptions && (
        <View style={styles.overlayRoot}>
          <TouchableOpacity
            style={styles.optionsOverlay}
            activeOpacity={1}
            onPress={() => {
              setShowOptions(false);
              setIsPaused(false);
            }}
          >
            <View
              style={[
                styles.optionsModal,
                // Keep the sheet above the bottom tab bar + home indicator
                { paddingBottom: Math.max(16, insets.bottom) + 96 },
              ]}
              onStartShouldSetResponder={() => true}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptions(false);
                  setIsPaused(false);
                  handleDeleteStory();
                }}
              >
                <Trash2 size={22} color="#FF3B5C" />
                <Text style={[styles.optionText, { color: '#FF3B5C' }]}>Delete Story</Text>
              </TouchableOpacity>
              <View style={styles.optionDivider} />
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptions(false);
                  setIsPaused(false);
                }}
              >
                <X size={22} color="#FFFFFF" />
                <Text style={styles.optionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Animated Flying Hearts */}
      <StoryFlyingHearts
        ref={heartsRef}
        onHeartAdded={(x) => {
          // Optional: Could trigger additional actions here
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  storyOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000',
    // Let content determine aspect ratio - no forced dimensions
    alignSelf: 'center',
  },
  mediaContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  progressContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 4,
  },
  progressBarBg: {
    flex: 1,
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  optionsModal: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
  },
  optionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: Spacing.xl,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userTextContainer: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  username: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timestamp: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: FontSizes.xs + 1,
    fontFamily: FontFamily.medium,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginTop: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: Spacing.sm,
    right: Spacing.sm,
    zIndex: 10,
  },
  storyMusicHeader: {
    marginTop: 8,
  },
  storyMusicLabelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    gap: 6,
    maxWidth: 240,
  },
  storyMusicWaveWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 10,
    gap: 2,
  },
  storyMusicWaveBarWrap: {
    width: 2,
    height: 10,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  storyMusicWaveBar: {
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  storyMusicLabelText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
    fontFamily: FontFamily.medium,
    flexShrink: 1,
    maxWidth: 180,
  },
  captionWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  captionContainer: {
    maxWidth: SCREEN_WIDTH - 48,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignSelf: 'center',
  },
  caption: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  textStoryAnimationOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 44,
    backgroundColor: 'transparent',
  },
  textStoryAnimationText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  navigationContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90, // Start below header to avoid blocking close button
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 1,
  },
  navAreaLeft: {
    flex: 1,
  },
  navAreaRight: {
    flex: 1,
    flexDirection: 'column',
  },
  navAreaRightTop: {
    flex: 1,
  },
  navAreaRightBottom: {
    height: 120, // Exclude bottom right corner where buttons are
    width: 80, // Exclude right edge
    alignSelf: 'flex-end',
  },
  bottomRightActions: {
    position: 'absolute',
    right: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'flex-end',
    zIndex: 10, // Higher z-index than navigation areas; bottom set inline (insets.bottom + 140)
  },
  bottomActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  viewCountBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#4D96FF',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  viewCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: FontFamily.bold,
    lineHeight: 13,
    letterSpacing: -0.2,
  },
  reactionCountBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF3B5C',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  reactionCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: FontFamily.bold,
    lineHeight: 13,
    letterSpacing: -0.2,
  },
  bottomLeftActions: {
    position: 'absolute',
    left: Spacing.md,
    gap: Spacing.xs,
    alignItems: 'flex-start',
    zIndex: 10, // bottom set inline (insets.bottom + 140) to sit above caption like video feed
  },
  commentButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  commentCountBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF3B5C',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  commentCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: FontFamily.bold,
    lineHeight: 13,
    letterSpacing: -0.2,
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  commentsOverlaySheet: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsModalKeyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    marginTop: SCREEN_HEIGHT * 0.2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  commentsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  commentsModalTitle: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
  commentsModalCloseButton: {
    padding: 4,
  },
  commentsListContainer: {
    flex: 1,
  },
  commentsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentsEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  commentsEmptyText: {
    fontSize: 16,
    fontFamily: FontFamily.medium,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  commentsEmptySubtext: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  commentsScrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentUsername: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    marginRight: 8,
  },
  commentTime: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  commentText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  commentDeleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  commentInputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'flex-end',
  },
  commentKeyboardDown: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: '#FFFFFF',
    maxHeight: 100,
    marginRight: 12,
  },
  commentSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF3B5C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendButtonDisabled: {
    backgroundColor: 'rgba(255, 59, 92, 0.5)',
  },
  storyOwnerMessage: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  heartReactionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
});

