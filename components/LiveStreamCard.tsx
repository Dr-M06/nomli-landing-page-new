import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, Eye, Video, Flame, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { useLiveStream } from './LiveStreamProvider';
import { formatViewerCount } from '../utils/numberFormatter';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with margin

interface LiveStreamCardProps {
  stream: {
    id: string;
    title: string;
    description?: string;
    streamer_id: string;
    streamer_name: string;
    streamer_avatar?: string;
    channel_id: string;
    viewer_count: number;
    is_live: boolean;
    started_at: string;
    thumbnail_url?: string;
    adult_content?: boolean;
  };
  onPress: () => void;
  onStreamClosed?: () => void;
  isAdmin?: boolean;
  onAdminClose?: (streamId: string) => void;
}

export default function LiveStreamCard({ stream, onPress, onStreamClosed, isAdmin = false, onAdminClose }: LiveStreamCardProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const screenWidth = Dimensions.get('window').width;
  const isSmall = screenWidth < 375;

  
  // Dynamic styles based on screen size
  const dynamicStyles = {
    container: {
      borderRadius: isSmall ? 16 : 20,
      marginBottom: isSmall ? 12 : 16,
    },
    thumbnailContainer: {
      height: CARD_WIDTH * (isSmall ? 0.7 : 0.75),
    },
    info: {
      padding: isSmall ? 10 : 12,
      paddingTop: isSmall ? 8 : 10,
    },
    streamerInfo: {
      gap: isSmall ? 8 : 10,
    },
    avatar: {
      width: isSmall ? 28 : 32,
      height: isSmall ? 28 : 32,
      borderRadius: isSmall ? 14 : 16,
    },
    streamerTextContainer: {
      gap: isSmall ? 1 : 2,
    },
    streamerName: {
      fontSize: isSmall ? 12 : 13,
    },
    title: {
      fontSize: isSmall ? 11 : 12,
    },
    topBadgesRow: {
      top: isSmall ? 8 : 10,
      left: isSmall ? 8 : 10,
      gap: isSmall ? 5 : 6,
    },
    liveBadge: {
      paddingHorizontal: isSmall ? 6 : 8,
      paddingVertical: isSmall ? 3 : 4,
      borderRadius: isSmall ? 10 : 12,
      gap: isSmall ? 3 : 4,
    },
    liveText: {
      fontSize: isSmall ? 8 : 9,
    },
    viewerCount: {
      top: isSmall ? 8 : 10,
      right: isSmall ? 8 : 10,
      paddingHorizontal: isSmall ? 6 : 7,
      paddingVertical: isSmall ? 3 : 4,
      borderRadius: isSmall ? 10 : 12,
      gap: isSmall ? 3 : 4,
    },
    viewerText: {
      fontSize: isSmall ? 9 : 10,
    },
    liveCenterContent: {
      gap: isSmall ? 10 : 12,
    },
    liveIndicatorRow: {
      gap: isSmall ? 5 : 6,
      paddingHorizontal: isSmall ? 8 : 10,
      paddingVertical: isSmall ? 4 : 5,
      borderRadius: isSmall ? 10 : 12,
    },
    liveIndicatorDot: {
      width: isSmall ? 5 : 6,
      height: isSmall ? 5 : 6,
      borderRadius: isSmall ? 2.5 : 3,
    },
    liveStatusText: {
      fontSize: isSmall ? 9 : 10,
    },
    liveBottomInfo: {
      bottom: isSmall ? 8 : 10,
      right: isSmall ? 8 : 10,
    },
    liveDurationText: {
      fontSize: isSmall ? 9 : 10,
      paddingHorizontal: isSmall ? 6 : 8,
      paddingVertical: isSmall ? 3 : 4,
      borderRadius: isSmall ? 8 : 10,
    },
    adultBadge: {
      paddingHorizontal: isSmall ? 6 : 7,
      paddingVertical: isSmall ? 3 : 4,
      borderRadius: isSmall ? 10 : 12,
    },
    adultText: {
      fontSize: isSmall ? 8 : 9,
    },
  };


  const getStreamDuration = (): string => {
    const startTime = new Date(stream.started_at);
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <TouchableOpacity
      style={[styles.container, dynamicStyles.container, { backgroundColor: themeColors.neutral.surface }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Live Preview Container */}
      <View style={[styles.thumbnailContainer, dynamicStyles.thumbnailContainer, stream.is_live && { 
        borderWidth: 2,
        borderColor: 'rgba(255, 0, 80, 0.3)',
      }]}>
        {stream.is_live ? (
          <View style={styles.livePreviewContainer}>
            {/* Clean gradient background */}
            <LinearGradient
              colors={['#1a1a1a', '#2d2d2d', '#1a1a1a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.liveGradient}
            />
            
            {/* Subtle pink overlay */}
            <LinearGradient
              colors={['rgba(255, 0, 80, 0.08)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.liveOverlay}
            />
            
            {/* Central content */}
            <View style={[styles.liveCenterContent, dynamicStyles.liveCenterContent]}>
              {/* Video icon */}
              <View style={styles.videoIconContainer}>
                <Video size={isSmall ? 32 : 36} color="#FFFFFF" strokeWidth={2} />
              </View>
              
              {/* Live indicator */}
              <View style={[styles.liveIndicatorRow, dynamicStyles.liveIndicatorRow]}>
                <View style={[styles.liveIndicatorDot, dynamicStyles.liveIndicatorDot]} />
                <Text style={[styles.liveStatusText, dynamicStyles.liveStatusText]}>LIVE</Text>
              </View>
            </View>
            
            {/* Duration at bottom */}
            <View style={[styles.liveBottomInfo, dynamicStyles.liveBottomInfo]}>
              <Text style={[styles.liveDurationText, dynamicStyles.liveDurationText]}>{getStreamDuration()}</Text>
            </View>
          </View>
        ) : stream.thumbnail_url ? (
          <Image
            source={{ uri: stream.thumbnail_url }}
            style={styles.thumbnail}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: themeColors.neutral.background }]}>
            <Video size={32} color={themeColors.text.secondary} />
          </View>
        )}
        
        {/* Top badges row */}
        <View style={[styles.topBadgesRow, dynamicStyles.topBadgesRow]}>
          {/* Live badge */}
          <View style={[styles.liveBadge, dynamicStyles.liveBadge]}>
            <Flame size={isSmall ? 9 : 10} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={[styles.liveText, dynamicStyles.liveText]}>LIVE</Text>
          </View>
          
          {/* Adult Content Badge */}
          {stream.adult_content && (
            <View style={[styles.adultBadge, dynamicStyles.adultBadge]}>
              <Text style={[styles.adultText, dynamicStyles.adultText]}>18+</Text>
            </View>
          )}
        </View>
        
        {/* Viewer count */}
        <View style={[styles.viewerCount, dynamicStyles.viewerCount]}>
          <Eye size={isSmall ? 10 : 11} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={[styles.viewerText, dynamicStyles.viewerText]}>
            {formatViewerCount(stream.viewer_count)}
          </Text>
        </View>

        {/* Admin close button */}
        {isAdmin && onAdminClose && (
          <TouchableOpacity
            style={styles.adminCloseButton}
            onPress={() => {
              Alert.alert(
                'Close Stream',
                'Are you sure you want to close this stream?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Close',
                    style: 'destructive',
                    onPress: () => onAdminClose(stream.id),
                  },
                ]
              );
            }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <View style={styles.adminCloseButtonInner}>
              <X size={14} color="#FFFFFF" strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Stream info - Compact */}
      <View style={[styles.info, dynamicStyles.info]}>
        <View style={[styles.streamerInfo, dynamicStyles.streamerInfo]}>
          <Image
            source={{ 
              uri: stream.streamer_avatar || 'https://via.placeholder.com/32x32.png?text=U'
            }}
            style={[styles.avatar, dynamicStyles.avatar]}
            contentFit="cover"
          />
          <View style={[styles.streamerTextContainer, dynamicStyles.streamerTextContainer]}>
            <Text 
              style={[styles.streamerName, dynamicStyles.streamerName, { color: themeColors.textLight }]}
              numberOfLines={1}
            >
              {stream.streamer_name}
            </Text>
            <Text 
              style={[styles.title, dynamicStyles.title, { color: themeColors.textSecondary }]}
              numberOfLines={1}
            >
              {stream.title}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 0, 80, 0.12)',
  },
  thumbnailContainer: {
    position: 'relative',
    width: '100%',
    height: CARD_WIDTH * 0.75,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  livePreviewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  liveGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  liveOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  liveCenterContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  videoIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 0, 80, 0.25)',
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF0050',
  },
  liveStatusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  liveBottomInfo: {
    position: 'absolute',
    bottom: 10,
    right: 10,
  },
  liveDurationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  topBadgesRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    backgroundColor: '#FF0050',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  viewerCount: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  viewerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  info: {
    padding: 12,
    paddingTop: 10,
  },
  streamerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 0, 80, 0.15)',
  },
  streamerTextContainer: {
    flex: 1,
    gap: 2,
  },
  streamerName: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  adultBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
  },
  adultText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  adminCloseButton: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    zIndex: 10,
  },
  adminCloseButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
});
