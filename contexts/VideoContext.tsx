import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';
import {
  configurePlaybackAudioMode,
  reactivateVideoAudioAfterUnmute,
} from '../utils/expoAvAudioMode';

interface VideoContextType {
  currentlyPlayingVideoId: string | null;
  setCurrentlyPlayingVideo: (videoId: string | null) => void;
  pauseAllVideos: () => void;
  isVideoPlaying: (videoId: string) => boolean;
  // Global mute state - starts as true (muted by default)
  isGlobalMuted: boolean;
  toggleGlobalMute: () => void;
  setGlobalMute: (muted: boolean) => void;
  /** Register a video ref so global mute can apply immediately. */
  registerVideoRef: (videoId: string, ref: any) => void;
  unregisterVideoRef: (videoId: string) => void;
  /** When true, fullscreen video modal is open – background feed videos should pause. */
  isFullscreenModalOpen: boolean;
  setFullscreenModalOpen: (open: boolean) => void;
  /** When true, fullscreen video has loaded and started at initialPosition – safe to pause feed video. */
  fullscreenVideoReadyToTakeOver: boolean;
  setFullscreenVideoReadyToTakeOver: (ready: boolean) => void;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

export const useVideoContext = () => {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error('useVideoContext must be used within a VideoProvider');
  }
  return context;
};

export const VideoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentlyPlayingVideoId, setCurrentlyPlayingVideoId] = useState<string | null>(null);
  // Global mute state - starts as true (muted by default)
  const [isGlobalMuted, setIsGlobalMuted] = useState<boolean>(true);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState<boolean>(false);
  const [fullscreenVideoReadyToTakeOver, setFullscreenVideoReadyToTakeOver] = useState<boolean>(false);
  const videoRefs = useRef<Map<string, any>>(new Map());

  const registerVideoRef = useCallback((videoId: string, ref: any) => {
    if (!videoId) return;
    videoRefs.current.set(videoId, ref);
    // Apply current mute state immediately.
    if (ref?.current) {
      ref.current.setIsMutedAsync(isGlobalMuted).catch(console.error);
    }
  }, [isGlobalMuted]);

  const unregisterVideoRef = useCallback((videoId: string) => {
    if (!videoId) return;
    videoRefs.current.delete(videoId);
  }, []);

  // Memoize setCurrentlyPlayingVideo to prevent unnecessary re-renders
  const setCurrentlyPlayingVideo = useCallback((videoId: string | null) => {
    setCurrentlyPlayingVideoId((prevId) => {
      // If there's already a video playing, pause it first
      if (prevId && prevId !== videoId) {
        const previousVideoRef = videoRefs.current.get(prevId);
        if (previousVideoRef?.current) {
          previousVideoRef.current.pauseAsync().catch(console.error);
        }
      }
      return videoId;
    });
  }, []);

  // Memoize pauseAllVideos
  const pauseAllVideos = useCallback(() => {
      videoRefs.current.forEach((ref) => {
        if (ref?.current) {
          ref.current.pauseAsync().catch(console.error);
        }
      });
      setCurrentlyPlayingVideoId(null);
  }, []);

  // Memoize isVideoPlaying
  const isVideoPlaying = useCallback((videoId: string) => {
      return currentlyPlayingVideoId === videoId;
  }, [currentlyPlayingVideoId]);

  // Toggle global mute state - applies to all videos
  const toggleGlobalMute = useCallback(() => {
    const nextMuted = !isGlobalMuted;
    setIsGlobalMuted(nextMuted);
    if (!nextMuted) void configurePlaybackAudioMode().catch(() => {});
    videoRefs.current.forEach((ref) => {
      const v = ref?.current;
      if (!v) return;
      void v.setIsMutedAsync(nextMuted).catch(console.error);
      if (!nextMuted) {
        void v.getStatusAsync().then((st) => {
          if (st.isLoaded && st.isPlaying && ref.current) {
            void reactivateVideoAudioAfterUnmute(ref.current);
          }
        });
      }
    });
  }, [isGlobalMuted]);

  // Set global mute state explicitly - applies to all videos
  const setGlobalMute = useCallback((muted: boolean) => {
    setIsGlobalMuted(muted);
    if (!muted) void configurePlaybackAudioMode().catch(() => {});
    videoRefs.current.forEach((ref) => {
      const v = ref?.current;
      if (!v) return;
      void v.setIsMutedAsync(muted).catch(console.error);
      if (!muted) {
        void v.getStatusAsync().then((st) => {
          if (st.isLoaded && st.isPlaying && ref.current) {
            void reactivateVideoAudioAfterUnmute(ref.current);
          }
        });
      }
    });
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
        currentlyPlayingVideoId,
        setCurrentlyPlayingVideo,
        pauseAllVideos,
        isVideoPlaying,
        isGlobalMuted,
        toggleGlobalMute,
        setGlobalMute,
        registerVideoRef,
        unregisterVideoRef,
        isFullscreenModalOpen,
        setFullscreenModalOpen: setIsFullscreenModalOpen,
        fullscreenVideoReadyToTakeOver,
        setFullscreenVideoReadyToTakeOver,
  }), [currentlyPlayingVideoId, setCurrentlyPlayingVideo, pauseAllVideos, isVideoPlaying, isGlobalMuted, toggleGlobalMute, setGlobalMute, registerVideoRef, unregisterVideoRef, isFullscreenModalOpen, fullscreenVideoReadyToTakeOver]);

  return (
    <VideoContext.Provider value={contextValue}>
        {children}
      </VideoContext.Provider>
    );
};
