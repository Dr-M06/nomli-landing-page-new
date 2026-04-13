import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Calendar, MapPin, Users, Clock } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { formatTimeAgo } from '../utils/formatters';

const { width } = Dimensions.get('window');

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  category: string;
  max_attendees?: number;
  host_id: string;
  image_url?: string;
  created_at: string;
  host_name?: string;
  host_avatar?: string;
  attendee_count?: number;
}

interface EventCardProps {
  event: Event;
  onPress: (event: Event) => void;
  onJoin?: (eventId: string) => void;
  isJoined?: boolean;
  showJoinButton?: boolean;
}

export default function EventCard({ 
  event, 
  onPress, 
  onJoin, 
  isJoined = false,
  showJoinButton = true 
}: EventCardProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  // Pre-resolve bundled placeholder images for instant loading
  const placeholderImage = useMemo(() => {
    try {
      const { Image: RNImage } = require('react-native');
      
      // Try to resolve splash image first (best for event cards)
      try {
        const splash = require('../assets/images/splash.png');
        const resolved = RNImage.resolveAssetSource(splash);
        if (resolved?.uri) return resolved.uri;
      } catch (e) {
        // Fallback to icon
        try {
          const icon = require('../assets/images/icon.png');
          const resolved = RNImage.resolveAssetSource(icon);
          if (resolved?.uri) return resolved.uri;
        } catch (e2) {
          // Final fallback to default avatar
          try {
            const avatar = require('../assets/images/default-avatar.png');
            const resolved = RNImage.resolveAssetSource(avatar);
            if (resolved?.uri) return resolved.uri;
          } catch (e3) {
            return null;
          }
        }
      }
    } catch (error) {
      return null;
    }
    return null;
  }, []);

  // Use event image if available, otherwise use bundled placeholder
  const imageUrl = event.image_url || placeholderImage;

  const formatEventDate = (dateString: string, timeString: string) => {
    const eventDate = new Date(`${dateString}T${timeString}`);
    const now = new Date();
    const isToday = eventDate.toDateString() === now.toDateString();
    const isTomorrow = eventDate.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
    
    if (isToday) {
      return `Today at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (isTomorrow) {
      return `Tomorrow at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return eventDate.toLocaleDateString([], { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const formatAttendeeCount = () => {
    if (!event.attendee_count) return '0';
    if (event.max_attendees) {
      return `${event.attendee_count}/${event.max_attendees}`;
    }
    return event.attendee_count.toString();
  };

  const handleJoinPress = () => {
    if (onJoin) {
      onJoin(event.id);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: themeColors.surface }]}
      onPress={() => onPress(event)}
      activeOpacity={0.8}
    >
      {/* Event Image - Always show (either real or placeholder) */}
      {imageUrl && (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.eventImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            placeholder={null} // No placeholder needed since we're using bundled images
          />
          <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary.main }]}>
            <Text style={[styles.categoryText, { color: themeColors.neutral.surface }]}>
              {event.category}
            </Text>
          </View>
        </View>
      )}

      {/* Event Content */}
      <View style={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : themeColors.text }]} numberOfLines={2}>
            {event.title}
          </Text>
          {event.host_name && (
            <Text style={[styles.hostName, { color: themeColors.textSecondary }]}>
              by {event.host_name}
            </Text>
          )}
        </View>

        {/* Description */}
        {event.description && (
          <Text style={[styles.description, { color: themeColors.textSecondary }]} numberOfLines={2}>
            {event.description}
          </Text>
        )}

        {/* Event Details */}
        <View style={styles.detailsContainer}>
          {/* Date & Time */}
          <View style={styles.detailRow}>
            <Calendar size={16} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>
              {formatEventDate(event.date, event.time)}
            </Text>
          </View>

          {/* Location */}
          <View style={styles.detailRow}>
            <MapPin size={16} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.textSecondary }]} numberOfLines={1}>
              {event.location}
            </Text>
          </View>

          {/* Attendees */}
          <View style={styles.detailRow}>
            <Users size={16} color={themeColors.textSecondary} />
            <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>
              {formatAttendeeCount()} attending
            </Text>
          </View>
        </View>

        {/* Action Button */}
        {showJoinButton && (
          <TouchableOpacity
            style={[
              styles.joinButton,
              { 
                backgroundColor: isJoined ? themeColors.neutral.border : themeColors.primary.main,
                borderColor: themeColors.primary.main
              }
            ]}
            onPress={handleJoinPress}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.joinButtonText,
              { 
                color: isJoined ? themeColors.textSecondary : themeColors.neutral.surface 
              }
            ]}>
              {isJoined ? 'Joined' : 'Join Event'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  imageContainer: {
    position: 'relative',
    height: 160,
  },
  eventImage: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  categoryText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    fontWeight: '600',
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 4,
  },
  hostName: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  description: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  detailsContainer: {
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  detailText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  joinButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    borderWidth: 1,
  },
  joinButtonText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
});