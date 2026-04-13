import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Phone, PhoneOff, PhoneMissed, PhoneIncoming, PhoneOutgoing, Video, Mic } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { useTheme } from '../contexts/ThemeContext';
import { formatTimeAgo } from '../utils/formatters';

interface CallHistoryCardProps {
  callType: 'audio' | 'video';
  status: 'missed' | 'answered' | 'rejected' | 'ended' | 'declined';
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  duration?: number; // in seconds
  onCallBack?: () => void;
}

export default function CallHistoryCard({
  callType,
  status,
  direction,
  timestamp,
  duration,
  onCallBack
}: CallHistoryCardProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  // Determine call status display
  const getCallStatusInfo = () => {
    const isMissed = status === 'missed';
    const isIncoming = direction === 'incoming';
    
    if (isMissed) {
      return {
        icon: PhoneMissed,
        label: 'Missed call',
        colors: ['#EF4444', '#DC2626'],
        iconColor: '#EF4444',
        showCallBack: true
      };
    }
    
    if (isIncoming && (status === 'answered' || status === 'ended')) {
      return {
        icon: PhoneIncoming,
        label: 'Incoming call',
        colors: ['#10B981', '#059669'],
        iconColor: '#10B981',
        showCallBack: false
      };
    }
    
    if (!isIncoming && (status === 'answered' || status === 'ended')) {
      return {
        icon: PhoneOutgoing,
        label: 'Outgoing call',
        colors: ['#3B82F6', '#2563EB'],
        iconColor: '#3B82F6',
        showCallBack: false
      };
    }
    
    if (status === 'rejected' || status === 'declined') {
      return {
        icon: PhoneOff,
        label: isIncoming ? 'Call declined' : 'Call rejected',
        colors: ['#F59E0B', '#D97706'],
        iconColor: '#F59E0B',
        showCallBack: false
      };
    }
    
    return {
      icon: Phone,
      label: 'Call',
      colors: ['#6366F1', '#4F46E5'],
      iconColor: '#6366F1',
      showCallBack: false
    };
  };

  const callInfo = getCallStatusInfo();
  const CallIcon = callInfo.icon;
  const MediaIcon = callType === 'video' ? Video : Mic;

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format timestamp
  const formatTime = () => {
    try {
      return formatTimeAgo(timestamp);
    } catch {
      return 'Recently';
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.cardContainer,
          {
            backgroundColor: isDarkMode
              ? 'rgba(255, 255, 255, 0.04)'
              : 'rgba(0, 0, 0, 0.03)',
            borderColor: isDarkMode
              ? 'rgba(255, 255, 255, 0.06)'
              : 'rgba(0, 0, 0, 0.04)'
          }
        ]}
      >
        {/* Call Icon - Smaller and more subtle */}
        <View style={[styles.iconContainer, { backgroundColor: callInfo.iconColor + '20' }]}>
          <CallIcon size={14} color={callInfo.iconColor} strokeWidth={2.5} />
        </View>

        {/* Call Info - Compact single row */}
        <View style={styles.infoContainer}>
          <View style={styles.contentRow}>
            <Text style={[styles.statusLabel, { color: themeColors.text }]}>
              {callInfo.label}
            </Text>
            <View style={styles.dotSeparator} />
            <MediaIcon size={10} color={themeColors.textSecondary} strokeWidth={2} />
            <View style={styles.dotSeparator} />
            <Text style={[styles.timestamp, { color: themeColors.textSecondary }]}>
              {formatTime()}
            </Text>
            {duration !== undefined && duration > 0 && (
              <>
                <View style={styles.dotSeparator} />
                <Text style={[styles.duration, { color: themeColors.textSecondary }]}>
                  {formatDuration(duration)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Call Back Button - Compact */}
        {callInfo.showCallBack && onCallBack && (
          <TouchableOpacity
            style={[
              styles.callBackButton,
              { backgroundColor: callInfo.iconColor + '20' }
            ]}
            onPress={onCallBack}
            activeOpacity={0.7}
          >
            <Phone size={13} color={callInfo.iconColor} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xs - 2,
    marginHorizontal: Spacing.md,
    alignItems: 'flex-start',
  },
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: 12,
    borderWidth: 1,
    gap: Spacing.xs + 2,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs - 2,
  },
  statusLabel: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
  },
  duration: {
    fontSize: FontSizes.caption + 1,
    fontFamily: FontFamily.medium,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  timestamp: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    letterSpacing: 0.1,
  },
  callBackButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

