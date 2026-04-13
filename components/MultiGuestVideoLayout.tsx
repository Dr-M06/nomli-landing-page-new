import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, MicOff, Video as VideoIcon, VideoOff, Camera, ChevronDown, X } from 'lucide-react-native';
import { LiveStreamGuest } from '../utils/guestService';
import MicIndicator from './MicIndicator';
import { RtcSurfaceView } from 'react-native-agora';
import { log, warn, error } from '../utils/productionLogger';

const { width, height } = Dimensions.get('window');

// Participant Video Frame Component with Loading Animation
// Memoized to prevent unnecessary re-renders when guests join
const ParticipantVideoFrame = React.memo(({
  participant,
  renderUid,
  videoWidth,
  videoHeight,
  isActiveSpeaker,
  currentUserId,
  isStreamer,
  onToggleGuestAudio,
  onSwitchCamera,
  onRemoveGuest,
  isFrontCamera = true,
}: {
  participant: VideoParticipant;
  renderUid: number;
  videoWidth: number;
  videoHeight: number;
  isActiveSpeaker: boolean;
  currentUserId?: string;
  isStreamer: boolean;
  onToggleGuestAudio?: (userId: string, audioEnabled: boolean) => void;
  onSwitchCamera?: () => void;
  onRemoveGuest?: (userId: string) => void;
  isFrontCamera?: boolean; // true = front (mirror selfie), false = back (no mirror)
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const borderOpacityAnim = useRef(new Animated.Value(0)).current;
  const borderGlowAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for active speaker border - TikTok style
  useEffect(() => {
    if (isActiveSpeaker) {
      // Fade in border
      Animated.timing(borderOpacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Continuous glow pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(borderGlowAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(borderGlowAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Subtle frame pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Fade out border
      Animated.timing(borderOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      // Reset animations
      borderGlowAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [isActiveSpeaker, pulseAnim, borderOpacityAnim, borderGlowAnim]);

  // Monitor video loading state - especially important for local preview (UID 0)
  useEffect(() => {
    // For local preview (UID 0), give it more time to initialize
    if (renderUid === 0 && participant.videoEnabled) {
      // Local preview might take a moment to start
      const timer = setTimeout(() => {
        setIsVideoLoading(false);
      }, 1000); // Give 1 second for local preview to initialize
      return () => clearTimeout(timer);
    }
  }, [renderUid, participant.videoEnabled]);

  // Shimmer loading animation - Gen Z friendly
  useEffect(() => {
    if (isVideoLoading && participant.videoEnabled) {
      // Start shimmer animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [isVideoLoading, participant.videoEnabled, shimmerAnim]);

  // Simulate video loading - hide loading after a delay
  // Increased timeout for guests who join later (they may need more time to receive video)
  useEffect(() => {
    if (participant.videoEnabled) {
      // Reset loading state when video enabled changes
      setIsVideoLoading(true);
      
      // Hide loading animation after video should be ready
      // Increased timeout for guests 2 and 3 who join later
      const loadingTimer = setTimeout(() => {
        setIsVideoLoading(false);
      }, 3000); // Increased from 2000ms to 3000ms for better reliability
      
      return () => clearTimeout(loadingTimer);
    } else {
      setIsVideoLoading(false);
    }
  }, [participant.videoEnabled, participant.uid, renderUid]);

  return (
    <Animated.View
      style={[
        styles.videoFrame,
        {
          width: videoWidth,
          height: videoHeight,
          transform: [{ scale: isActiveSpeaker ? pulseAnim : 1 }],
        },
      ]}
    >
      {/* Video or Avatar */}
      {participant.videoEnabled ? (
        <View style={styles.videoContainer}>
          <RtcSurfaceView
            canvas={{
              uid: renderUid,
              renderMode: 1, // Fit mode
              mirrorMode: (renderUid === 0 && isFrontCamera) ? 1 : 0, // Front = mirror selfie; back = no mirror so things show correct
            }}
            zOrderMediaOverlay={false}
            style={styles.videoSurface}
          />
          {/* Gen Z Loading Animation Overlay */}
          {isVideoLoading && (
            <Animated.View 
              style={[
                styles.loadingOverlay,
                {
                  opacity: shimmerAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.3, 0.6, 0.3],
                  }),
                },
              ]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={['rgba(0, 217, 255, 0.1)', 'rgba(255, 59, 48, 0.1)', 'rgba(0, 217, 255, 0.1)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Animated.View
                style={[
                  styles.shimmer,
                  {
                    transform: [
                      {
                        translateX: shimmerAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-width, width],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    'transparent',
                    'rgba(255, 255, 255, 0.15)',
                    'transparent',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shimmerGradient}
                />
              </Animated.View>
              {/* Pulsing dots */}
              <View style={styles.loadingDots}>
                {[0, 1, 2].map((i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.loadingDot,
                      {
                        opacity: shimmerAnim.interpolate({
                          inputRange: [0, 0.33, 0.66, 1],
                          outputRange: i === 0 ? [0.3, 1, 0.3, 0.3] : i === 1 ? [0.3, 0.3, 1, 0.3] : [0.3, 0.3, 0.3, 1],
                        }),
                        transform: [
                          {
                            scale: shimmerAnim.interpolate({
                              inputRange: [0, 0.33, 0.66, 1],
                              outputRange: i === 0 ? [0.8, 1.2, 0.8, 0.8] : i === 1 ? [0.8, 0.8, 1.2, 0.8] : [0.8, 0.8, 0.8, 1.2],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ))}
              </View>
            </Animated.View>
          )}
        </View>
      ) : (
        <View style={styles.avatarContainer}>
          <Image
            source={{
              uri: participant.avatarUrl || 'https://via.placeholder.com/80',
            }}
            style={styles.avatar}
            contentFit="cover"
          />
          <View style={styles.videoOffOverlay}>
            <VideoOff size={24} color="rgba(255, 255, 255, 0.6)" strokeWidth={2} />
          </View>
        </View>
      )}

      {/* Active Speaker Border - TikTok style animated gradient */}
      <Animated.View 
        style={[
          styles.activeSpeakerBorderContainer,
          {
            opacity: borderOpacityAnim,
          },
        ]}
        pointerEvents="none"
      >
        {/* Outer glow layer */}
        <Animated.View
          style={[
            styles.activeSpeakerGlow,
            {
              opacity: borderGlowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.8],
              }),
              transform: [
                {
                  scale: borderGlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.03],
                  }),
                },
              ],
            },
          ]}
        />
        {/* Inner border gradient */}
        <LinearGradient
          colors={['#00D9FF', '#FF3B30', '#00D9FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.activeSpeakerBorder}
        >
          <View style={styles.activeSpeakerBorderInner} />
        </LinearGradient>
      </Animated.View>

      {/* Username Pill - Top Left */}
      <View style={styles.usernamePill}>
        {participant.isHost && (
          <View style={styles.crownIcon}>
            <Text style={styles.crownEmoji}>👑</Text>
          </View>
        )}
        {!participant.audioEnabled && (
          <MicOff size={10} color="#FF3B30" strokeWidth={2} />
        )}
        <Text style={styles.usernameText} numberOfLines={1}>
          {participant.username}
        </Text>
      </View>

      {/* Video Off Indicator - Top Right */}
      {!participant.videoEnabled && (
        <View style={styles.videoOffBadge}>
          <VideoOff size={14} color="#FFFFFF" strokeWidth={2} />
        </View>
      )}

      {/* Remove Cohost Button (only for streamer to remove guests) - Top Right */}
      {isStreamer && !participant.isHost && onRemoveGuest && (
        <TouchableOpacity
          style={[
            styles.removeButton,
            !participant.videoEnabled && styles.removeButtonWithVideoBadge // Adjust position if video badge is visible
          ]}
          onPress={() => {
            log('🗑️ [MULTI_GUEST] Removing cohost:', participant.userId);
            if (onRemoveGuest) {
              onRemoveGuest(participant.userId);
            }
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={16} color="#FF3B30" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* Mic Indicator - Shows when user is talking */}
      <MicIndicator 
        isActive={isActiveSpeaker} 
        isMuted={!participant.audioEnabled}
      />
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  // CRITICAL: For host, NEVER re-render unless renderUid or userId changes
  if (prevProps.participant.isHost && nextProps.participant.isHost) {
    // Host should only re-render if renderUid changes (should never happen)
    return prevProps.renderUid === nextProps.renderUid &&
           prevProps.participant.userId === nextProps.participant.userId;
  }
  
  // For guests, check all relevant props
  // NOTE: audioEnabled changes should NOT trigger video re-render to prevent dark screen
  // Video rendering is independent of audio state
  return (
    prevProps.participant.uid === nextProps.participant.uid &&
    prevProps.participant.userId === nextProps.participant.userId &&
    prevProps.participant.isHost === nextProps.participant.isHost &&
    // Removed audioEnabled from comparison - audio state changes shouldn't re-render video
    prevProps.participant.videoEnabled === nextProps.participant.videoEnabled &&
    prevProps.renderUid === nextProps.renderUid &&
    prevProps.isActiveSpeaker === nextProps.isActiveSpeaker &&
    prevProps.videoWidth === nextProps.videoWidth &&
    prevProps.videoHeight === nextProps.videoHeight
  );
});

interface VideoParticipant {
  uid: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isHost: boolean;
}

interface MultiGuestVideoLayoutProps {
  hostUid: number;
  hostUserId: string;
  hostUsername: string;
  hostAvatarUrl?: string;
  hostAudioEnabled: boolean;
  hostVideoEnabled: boolean;
  guests: LiveStreamGuest[];
  activeGuests: VideoParticipant[];
  isStreamer: boolean;
  activeSpeakerUid?: number;
  currentUserId?: string; // Current user's ID to detect own video
  streamId?: string; // Stream ID for mute/unmute actions
  onMuteGuest?: (userId: string, audioEnabled: boolean) => void; // Callback for mute/unmute
  onSwitchCamera?: () => void; // Callback for camera switch
  onRemoveGuest?: (userId: string) => void; // Callback for removing cohost (for guests)
  isStreamFrontCamera?: boolean; // true = front (mirror selfie), false = back (no mirror so things show correct)
}

// Memoize the entire layout to prevent remounts when guests join
const MultiGuestVideoLayout = React.memo(({
  hostUid,
  hostUserId,
  hostUsername,
  hostAvatarUrl,
  hostAudioEnabled,
  hostVideoEnabled,
  guests,
  activeGuests,
  isStreamer,
  activeSpeakerUid,
  currentUserId,
  streamId,
  onMuteGuest,
  onSwitchCamera,
  onRemoveGuest,
  isStreamFrontCamera = true,
}: MultiGuestVideoLayoutProps) => {
  // CRITICAL: Filter out the host from guests if they somehow got added
  // This prevents the host from being remounted as a guest
  const filteredGuests = activeGuests.filter(
    guest => guest.userId !== hostUserId
  );
  
  // Limit to exactly 1 guest (max 2 total participants: 1 host + 1 guest)
  const limitedGuests = filteredGuests.slice(0, 1);
  
  // CRITICAL: Memoize host participant to prevent remounts when guests join
  // Host participant should NEVER change identity
  const hostParticipant = React.useMemo<VideoParticipant>(() => ({
    uid: hostUid,
    userId: hostUserId,
    username: hostUsername,
    avatarUrl: hostAvatarUrl,
    audioEnabled: hostAudioEnabled,
    videoEnabled: hostVideoEnabled,
    isHost: true,
  }), [hostUid, hostUserId, hostUsername, hostAvatarUrl, hostAudioEnabled, hostVideoEnabled]);
  
  // Combine host and guests (max 2 total: 1 host + 1 guest)
  // Host is always first and has stable identity
  const allParticipants: VideoParticipant[] = React.useMemo(() => [
    hostParticipant,
    ...limitedGuests,
  ], [hostParticipant, limitedGuests]);

  // Calculate layout based on participant count
  const getLayout = (count: number) => {
    if (count === 1) return { rows: 1, cols: 1 };
    if (count === 2) return { rows: 1, cols: 2 }; // Side by side for 1-on-1 - cleaner, more natural
    return { rows: 1, cols: 2 }; // Default to side by side
  };

  const layout = getLayout(allParticipants.length);
  
  // For 1-on-1 side-by-side: use balanced aspect ratio (not too tall, not too wide)
  // Increased top padding to move videos down and center them better
  const topPadding = allParticipants.length === 2 ? 180 : 120; // More space from header for 1-on-1
  const bottomPadding = 140; // Space for bottom controls
  const sidePadding = 12; // Horizontal margins
  const framegap = 8; // Gap between frames
  
  const verticalPadding = topPadding + bottomPadding;
  const horizontalPadding = sidePadding * 2;
  
  const availableHeight = height - verticalPadding;
  const availableWidth = width - horizontalPadding;
  
  // Calculate balanced dimensions for 1-on-1 side-by-side layout
  let videoHeight: number;
  let videoWidth: number;
  
  if (layout.cols === 2 && allParticipants.length === 2) {
    // For 1-on-1: Use a balanced aspect ratio (wider, less tall)
    // Target: roughly 3:4 aspect ratio (height:width) - makes panels wider relative to height
    const targetAspectRatio = 0.75; // height/width ratio (0.75 means height is 75% of width)
    const totalGapWidth = framegap; // Gap between the two panels
    
    // Calculate width first (split available width between two panels)
    const totalVideoWidth = availableWidth - totalGapWidth;
    const calculatedWidth = (totalVideoWidth / 2) * 0.98; // Each panel gets half, with small margin
    
    // Calculate height based on aspect ratio (not using all available height)
    const calculatedHeight = calculatedWidth / targetAspectRatio;
    
    // Ensure we don't exceed available height (use max 85% of available height)
    const maxHeight = availableHeight * 0.85;
    videoHeight = Math.min(calculatedHeight, maxHeight);
    videoWidth = videoHeight * targetAspectRatio;
  } else {
    // Default calculations for other layouts
    videoHeight = (availableHeight / layout.rows) * 0.9;
    videoWidth = (availableWidth / layout.cols) * 0.92;
  }

  const getParticipantDimensions = (index: number, count: number) => {
    // For 1-on-1 side-by-side, use balanced dimensions
    if (count === 2 && layout.cols === 2) {
      return { width: videoWidth, height: videoHeight };
    }
    
    // Special case for 3 participants: 2 on top, 1 full on bottom
    if (count === 3) {
      if (index < 2) {
        // Top 2 participants - split width
        return { width: videoWidth, height: videoHeight };
      } else {
        // Bottom participant - full width
        return { width: availableWidth, height: videoHeight };
      }
    }
    
    // Default grid layout for 4 participants (2x2)
    return { width: videoWidth, height: videoHeight };
  };

  const renderParticipant = (participant: VideoParticipant, index: number) => {
    const isActiveSpeaker = activeSpeakerUid === participant.uid;
    
    // Get custom dimensions for this participant
    const dimensions = getParticipantDimensions(index, allParticipants.length);
    
    // Determine which UID to render:
    // 1. If this is the current user's own video → UID 0 (local preview)
    // 2. If streamer viewing their own host video → UID 0 (local preview)
    // 3. Otherwise → remote UID (host or guest)
    const isCurrentUser = currentUserId && participant.userId === currentUserId;
    const isStreamerViewingHost = isStreamer && participant.isHost;
    
    // CRITICAL: For guests viewing the host, always use the host's remote UID
    // Don't use UID 0 for the host when a guest is viewing
    const renderUid = (() => {
      if (isCurrentUser) {
        // Current user's own video (local preview)
        return 0;
      }
      if (isStreamerViewingHost) {
        // Streamer viewing their own host video (local preview)
        return 0;
      }
      // Remote video (host or guest) - use the participant's UID
      return participant.uid;
    })();
    
    // Use stable key that doesn't change when guests join
    // For host, use userId to ensure it doesn't remount
    // For guests, use uid (which is stable)
    const stableKey = participant.isHost 
      ? `host-${hostUserId}` 
      : `guest-${participant.uid}-${participant.userId}`;
    
    return (
      <ParticipantVideoFrame
        key={stableKey}
        participant={participant}
        renderUid={renderUid}
        videoWidth={dimensions.width}
        videoHeight={dimensions.height}
        isActiveSpeaker={isActiveSpeaker}
        currentUserId={currentUserId}
        isStreamer={isStreamer}
        onToggleGuestAudio={onMuteGuest}
        onRemoveGuest={onRemoveGuest}
        onSwitchCamera={onSwitchCamera}
        isFrontCamera={isStreamFrontCamera}
      />
    );
  };

  return (
    <View style={styles.videoGrid}>
      {allParticipants.map((participant, index) => {
        const dimensions = getParticipantDimensions(index, allParticipants.length);
        const isFullWidth = allParticipants.length === 3 && index === 2;
        
        // Use stable key that doesn't change when guests join
        const stableKey = participant.isHost 
          ? `host-${hostUserId}` 
          : `guest-${participant.uid}-${participant.userId}`;
        
        // Check if this is the current user's guest video (for positioning camera button outside)
        const isCurrentUserGuest = !isStreamer && currentUserId && participant.userId === currentUserId;
        
        return (
          <View
            key={stableKey}
            style={[
              isFullWidth && { width: '100%', alignItems: 'center' },
              styles.participantContainer
            ]}
          >
            {renderParticipant(participant, index)}
            
            {/* Guest Controls - Outside the frame (only camera flip button) */}
            {isCurrentUserGuest && onSwitchCamera && (
              <TouchableOpacity
                style={styles.cameraSwitchButtonOutside}
                onPress={() => {
                  log('📹 [GUEST] Switching camera (outside frame)');
                  onSwitchCamera();
                }}
                activeOpacity={0.7}
              >
                <Camera size={18} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
});

// Memoize the entire layout component to prevent remounts when guests join
const MemoizedMultiGuestVideoLayout = React.memo(MultiGuestVideoLayout, (prevProps, nextProps) => {
  // Custom comparison: Only re-render if guests list changes or host props change
  // CRITICAL: Host props should be stable, so this prevents remounts
  const guestsChanged = 
    prevProps.activeGuests.length !== nextProps.activeGuests.length ||
    prevProps.activeGuests.some((g, i) => 
      g.uid !== nextProps.activeGuests[i]?.uid ||
      g.userId !== nextProps.activeGuests[i]?.userId
    );
  
  const hostChanged = 
    prevProps.hostUid !== nextProps.hostUid ||
    prevProps.hostUserId !== nextProps.hostUserId ||
    prevProps.hostVideoEnabled !== nextProps.hostVideoEnabled ||
    prevProps.hostAudioEnabled !== nextProps.hostAudioEnabled;
  
  // Re-render only if guests or host actually changed
  return !guestsChanged && !hostChanged;
});

export default MemoizedMultiGuestVideoLayout;

const styles = StyleSheet.create({
  videoGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 180, // Increased top padding to move videos down and center them
    paddingBottom: 140, // Space for bottom controls  
    paddingHorizontal: 12, // Side padding for balanced layout
    gap: 8, // Gap between frames
    backgroundColor: 'transparent', // No background
  },
  participantContainer: {
    position: 'relative',
  },
  videoFrame: {
    position: 'relative',
    backgroundColor: '#2a2a2a', // Lighter background for better visibility
    borderRadius: 16, // Gen Z rounded corners
    overflow: 'hidden', // Clip video to rounded corners
    borderWidth: 0, // No borders - clean minimal look
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a', // Ensure container has background
  },
  videoSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a', // Lighter background - less jarring when video loads
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(42, 42, 42, 0.6)', // Lighter overlay to match new background
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width * 0.5,
    height: '100%',
  },
  shimmerGradient: {
    flex: 1,
    width: '100%',
  },
  loadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D9FF',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a', // Match videoFrame background
  },
  avatarContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a', // Match videoFrame background
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  videoOffOverlay: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  activeSpeakerBorderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    pointerEvents: 'none',
    zIndex: 100,
  },
  activeSpeakerGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 20,
    backgroundColor: '#00D9FF',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  activeSpeakerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    padding: 3, // Border thickness
  },
  activeSpeakerBorderInner: {
    flex: 1,
    borderRadius: 13,
    backgroundColor: 'transparent',
  },
  usernamePill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    gap: 4,
    maxWidth: '70%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  crownIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 215, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crownEmoji: {
    fontSize: 8,
  },
  usernameText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  videoOffBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 59, 48, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1, // Below mute button
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  removeButtonWithVideoBadge: {
    top: 28, // Adjust position if video badge is visible
  },
  muteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 10, // Above video badge
  },
  muteButtonWithVideoBadge: {
    // When video badge is visible, position mute button below it
    top: 48, // 10 (top) + 28 (badge height) + 10 (gap)
  },
  cameraSwitchButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 217, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.5)',
    zIndex: 20, // Ensure it's above video content
  },
  cameraSwitchButtonOutside: {
    position: 'absolute',
    bottom: -50, // Position below the video frame
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 217, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
});

