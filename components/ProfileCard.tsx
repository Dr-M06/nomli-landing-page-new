import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity,
  Dimensions
} from 'react-native';
import { MapPin, Calendar, MessageCircle } from 'lucide-react-native';
import { Profile } from '../utils/supabase';
import { Colors, getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Shadow, Spacing, GlobalStyles } from '../constants/Theme';
import { getSafeImageSource } from '../utils/safeAvatarUrl';
import VerifiedBadge from './VerifiedBadge';
import VipBadge from './VipBadge';
import UserBadge, { UserBadgeData } from './UserBadge';
import { getUserBadges } from '../utils/badgeService';
import { useTheme } from '../contexts/ThemeContext';
import { OFFICIAL_ACCOUNT_EMAIL } from '../constants/ContactEmails';
import { log, warn, error } from '../utils/productionLogger';
import { isVerifiedEntity } from '../utils/verification';


interface ProfileCardProps {
  profile: Partial<Profile>;
  distance?: number | null;
  onPress?: (profileId: string) => void;
  onMessagePress?: (profileId: string) => void;
  showMessageButton?: boolean;
  showDistance?: boolean;
  compact?: boolean;
  style?: any;
}

const isProfileVerified = isVerifiedEntity;

// Helper function to check if profile is official account
const isOfficialAccount = (profile: Partial<Profile>) => {
  if (!profile) return false;
  return profile.email?.toLowerCase() === OFFICIAL_ACCOUNT_EMAIL.toLowerCase();
};

// Helper function to validate UUID format
const isValidUUID = (id: string | undefined | null): boolean => {
  if (!id) return false;
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const ProfileCard = ({
  profile, 
  distance,
  onPress, 
  onMessagePress,
  showMessageButton = true,
  showDistance = true,
  compact = false,
  style,
}: ProfileCardProps) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [userBadges, setUserBadges] = useState<UserBadgeData[]>([]);
  
  // Fetch user badges when profile.id is available and valid UUID
  useEffect(() => {
    if (profile?.id && isValidUUID(profile.id)) {
      getUserBadges(profile.id)
        .then(badges => {
          setUserBadges(badges || []);
        })
        .catch(error => {
          error('[ProfileCard] Error fetching badges:', error);
          setUserBadges([]);
        });
    } else {
      setUserBadges([]);
    }
  }, [profile?.id]);
  
  const cardWidth = compact 
    ? Dimensions.get('window').width * 0.85 
    : Dimensions.get('window').width - (Spacing.lg * 2);

  // Helper function to get the correct avatar URL
  const getAvatarUrl = (avatarUrl?: string | null) => {
    if (!avatarUrl) return null;
    
    // Handle DiceBear avatars
    if (avatarUrl.startsWith('dicebear:')) {
      const avatarData = avatarUrl.replace('dicebear:', '');
      if (avatarData.includes(':')) {
        const [style, seed] = avatarData.split(':');
        return `https://api.dicebear.com/9.x/${style}/png?seed=${seed}&size=100`;
      } else {
        // Handle old format (style only) - use userId as seed
        return `https://api.dicebear.com/9.x/${avatarData}/png?seed=${profile.id}&size=100`;
      }
    }
    
    // Return regular URL as-is
    return avatarUrl;
  };

  // Render interests if available
  const renderInterests = () => {
    if (!profile || !profile.interests) return null;
    
    // Ensure interests is an array
    let interestsArray = profile.interests;
    if (!Array.isArray(interestsArray)) {
      try {
        // Try to parse it if it's a string
        interestsArray = typeof profile.interests === 'string' 
          ? JSON.parse(profile.interests) 
          : [];
      } catch (e) {
        log('Error parsing interests:', e);
        interestsArray = typeof profile.interests === 'string'
          ? profile.interests.split(',').map(i => i.trim())
          : [];
      }
    }
    
    // Return null if no interests after processing
    if (!Array.isArray(interestsArray) || (interestsArray?.length || 0) === 0) return null;
    
    const interestsToShow = interestsArray.slice(0, 4);
    
    return (
      <View style={styles.interestsContainer}>
        {interestsToShow.map((interest, index) => (
          <View key={`${interest}-${index}`} style={[GlobalStyles.pill, styles.pillItem, { backgroundColor: themeColors.primary.main, borderColor: themeColors.primary.main }]}>
            <Text style={[GlobalStyles.pillText, { color: '#FFFFFF' }]}>{interest}</Text>
          </View>
        ))}
      </View>
    );
  };

  // Truncate bio text if it's too long
  const renderBio = () => {
    if (!profile || !profile.bio) return null;
    
    const maxLength = 70;
    const bioText = (profile.bio?.length || 0) > maxLength
      ? `${profile.bio.substring(0, maxLength).trim()}...`
      : profile.bio;
    
    return (
      <Text style={[styles.bio, { color: themeColors.neutral.text }]} numberOfLines={2}>
        {bioText}
      </Text>
    );
  };

  return (
    <View
      style={[
        styles.card,
        { 
          width: cardWidth,
          backgroundColor: themeColors.neutral.card,
        },
        compact ? styles.compactCard : styles.fullCard,
        style,
      ]}
    >
      <TouchableOpacity 
        style={styles.cardContent}
        onPress={() => {
          if (onPress && profile.id) {
            onPress(profile.id);
          }
        }}
        disabled={!onPress || !profile.id}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatarWrapper}>
            <Image 
              source={
                getSafeImageSource(profile.avatar_url, profile.id) || 
                require('../assets/images/default-avatar.png')
              }
              style={styles.avatar}
              defaultSource={require('../assets/images/default-avatar.png')}
              onError={(e) => log('Avatar loading error:', e.nativeEvent.error)}
            />
            {/* User Badges - positioned on avatar */}
            {userBadges.length > 0 && (
              <View style={styles.userBadgesOverlay}>
                {userBadges.slice(0, 2).map((badge, index) => (
                  <View 
                    key={badge.badge_key} 
                    style={[
                      styles.userBadgeItem,
                      { marginLeft: index > 0 ? 2 : 0 }
                    ]}
                  >
                    <UserBadge 
                      badge={badge} 
                      size="small"
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={[styles.name, { color: themeColors.neutral.text }]} numberOfLines={1}>
            {profile.full_name || 'Traveler'}
          </Text>
          
          {profile.username && (
            <View style={styles.usernameRow}>
              <Text style={[styles.username, { color: themeColors.neutral.text }]} numberOfLines={1}>
                @{profile.username}
              </Text>
              {/* Official Badge for official account - next to username */}
              {isOfficialAccount(profile) && (
                <View style={styles.usernameBadgeContainer}>
                  <VipBadge size={10} type="official" position="bottom-right" style={styles.usernameBadgePosition} />
                </View>
              )}
              {/* Verified Badge - next to username */}
              {!isOfficialAccount(profile) && isProfileVerified(profile) && (
                <View style={styles.usernameBadgeContainer}>
                  <VipBadge size={10} type="verified" position="bottom-right" style={styles.usernameBadgePosition} />
                </View>
              )}
            </View>
          )}
        
          {profile.location && (
            <View style={styles.locationContainer}>
              <MapPin size={14} color={themeColors.neutral.subtext} />
              <Text style={[styles.locationText, { color: themeColors.neutral.subtext }]} numberOfLines={1}>
                {profile.location}
              </Text>
            </View>
          )}
        
          {showDistance && distance !== null && distance !== undefined && (
            <View style={styles.distanceContainer}>
              <Text style={[styles.distanceText, { color: themeColors.secondary.main }]}>{distance < 1 ? 'Less than 1 km away' : `${Math.round(distance)} km away`}</Text>
            </View>
          )}
          
          {renderBio()}
          
          {renderInterests()}
        </View>
      </TouchableOpacity>
      
      {showMessageButton && (
        <TouchableOpacity 
          style={styles.messageButton} 
          onPress={() => onMessagePress && profile.id && onMessagePress(profile.id)}
          disabled={!onMessagePress || !profile.id}
        >
          <MessageCircle size={18} color={Colors.neutral.background} />
          <Text style={styles.messageButtonText}>Message</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    width: '100%',
    ...Shadow.md,
  },
  fullCard: {
    padding: Spacing.md,
    marginHorizontal: 0,
  },
  compactCard: {
    padding: Spacing.sm,
  },
  cardContent: {
    flexDirection: 'row',
  },
  avatarContainer: {
    marginRight: Spacing.md,
  },
  avatarWrapper: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.lg,
  },
  userBadgesOverlay: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    bottom: 0,
    right: 0,
    zIndex: 9,
  },
  userBadgeItem: {
    marginRight: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  usernameBadgeContainer: {
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
    height: 14,
    width: 14,
  },
  usernameBadgePosition: {
    position: 'relative',
    bottom: 0,
    right: 0,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  name: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
    marginRight: Spacing.xs / 2,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeSpacing: {
    marginLeft: 4,
  },
  username: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginBottom: 4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginLeft: Spacing.xs,
  },
  distanceContainer: {
    marginBottom: 4,
  },
  distanceText: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.medium,
  },
  bio: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    marginTop: 2,
    marginBottom: 8,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pillItem: {
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary.main,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  messageButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.background,
    marginLeft: Spacing.xs,
  },
});

export default ProfileCard;