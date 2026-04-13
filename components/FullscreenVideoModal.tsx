import React, { useEffect } from 'react';
import { Modal, View, StyleSheet, Dimensions } from 'react-native';
import VideoFeed from './VideoFeed';
import type { VideoPost } from './VideoFeed';
import { useVideoContext } from '../contexts/VideoContext';

export interface FullscreenVideoModalProps {
  visible: boolean;
  onClose: () => void;
  videos: VideoPost[];
  initialIndex?: number;
  /** Resume playback from this position (milliseconds) when opening fullscreen on a playing video. */
  initialPosition?: number;
  /** Called when the initial fullscreen video has loaded and started at initialPosition (so feed can pause). */
  onFullscreenVideoReady?: () => void;
  onLike?: (postId: string, isLiked: boolean) => void;
  onBookmark?: (postId: string, isBookmarked: boolean) => void;
  onShare?: (post: VideoPost) => void;
  onComment?: (post: VideoPost) => void;
  onProfilePress?: (userId: string) => void;
  currentUserId?: string;
}

/**
 * Fullscreen video modal: one video per screen, scroll up for next, down for previous.
 * Use from feed (tap fullscreen on a video) or from post detail.
 * Videos are already shuffled by the backend fetch function for a fresh, unpredictable experience.
 */
export default function FullscreenVideoModal({
  visible,
  onClose,
  videos,
  initialIndex = 0,
  initialPosition,
  onFullscreenVideoReady,
  onLike,
  onBookmark,
  onShare,
  onComment,
  onProfilePress,
  currentUserId,
}: FullscreenVideoModalProps) {
  const { setFullscreenModalOpen, setGlobalMute } = useVideoContext();

  // When fullscreen opens: stop background videos, unmute so fullscreen has sound.
  useEffect(() => {
    setFullscreenModalOpen(visible);
    if (visible) {
      setGlobalMute(false);
    }
    return () => setFullscreenModalOpen(false);
  }, [visible, setFullscreenModalOpen, setGlobalMute]);

  if (!visible || videos.length === 0) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container} collapsable={false}>
        <VideoFeed
          videos={videos}
          initialIndex={initialIndex}
          initialPosition={initialPosition}
          onInitialVideoReady={onFullscreenVideoReady}
          fullScreenMode
          onExitFullscreen={onClose}
          onLike={onLike}
          onBookmark={onBookmark}
          onShare={onShare}
          onComment={onComment}
          onProfilePress={onProfilePress}
          currentUserId={currentUserId}
        />
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: SCREEN_WIDTH,
    alignSelf: 'center',
    backgroundColor: '#000',
  },
});
