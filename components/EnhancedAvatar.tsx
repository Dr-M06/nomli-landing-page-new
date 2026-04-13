import React, { useMemo, memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes } from '../constants/Theme';
import { OFFICIAL_ACCOUNT_EMAIL } from '../constants/ContactEmails';
import { User, Crown } from 'lucide-react-native';
import VipBadge from './VipBadge';
import UserBadge, { UserBadgeData } from './UserBadge';
import { getUserBadges } from '../utils/badgeService';
import { getSafeAvatarUrl } from '../utils/safeAvatarUrl';
import AvatarZoomModal from './AvatarZoomModal';
import { useIsLeaderboardUser } from '../contexts/LeaderboardContext';
import { log, warn, error } from '../utils/productionLogger';


interface EnhancedAvatarProps {
  avatarUrl?: string | null;
  userId?: string;
  fullName?: string;
  username?: string;
  email?: string;
  size?: number;
  isDarkMode?: boolean;
  showBorder?: boolean;
  showOnlineIndicator?: boolean;
  isOnline?: boolean;
  showVerifiedBadge?: boolean; // New prop to control verified badge visibility
  isVerified?: boolean; // User verification status from profile
  showBadges?: boolean; // Show user badges next to avatar
  badges?: UserBadgeData[]; // Pre-fetched badges (optional, will fetch if not provided)
  style?: any;
  isStatic?: boolean;
  enableZoom?: boolean; // Enable zoom on tap
}

// Custom equality function for memoization
const arePropsEqual = (prevProps: EnhancedAvatarProps, nextProps: EnhancedAvatarProps) => {
  // If component is static, only re-render if essential props change
  if (prevProps.isStatic && nextProps.isStatic) {
    return (
      prevProps.avatarUrl === nextProps.avatarUrl &&
      prevProps.userId === nextProps.userId &&
      prevProps.size === nextProps.size &&
      prevProps.isDarkMode === nextProps.isDarkMode &&
      prevProps.showBorder === nextProps.showBorder &&
      prevProps.showOnlineIndicator === nextProps.showOnlineIndicator &&
      prevProps.isOnline === nextProps.isOnline &&
      prevProps.showVerifiedBadge === nextProps.showVerifiedBadge &&
      prevProps.showBadges === nextProps.showBadges &&
      JSON.stringify(prevProps.badges) === JSON.stringify(nextProps.badges)
    );
  }
  
  // Default React.memo behavior for non-static components
  return false;
};

const EnhancedAvatar: React.FC<EnhancedAvatarProps> = ({
  avatarUrl,
  userId,
  fullName,
  username,
  email,
  size = 44,
  enableZoom = true, // New prop to enable/disable zoom
  isDarkMode = false,
  showBorder = true,
  showOnlineIndicator = false,
  isOnline = false,
  showVerifiedBadge = true, // Default to true for backward compatibility
  isVerified = false, // User verification status
  showBadges = true, // Show badges by default
  badges: providedBadges, // Pre-fetched badges
  style,
  isStatic = false,
}) => {
  const themeColors = getThemeColors(isDarkMode);
  const [imageError, setImageError] = React.useState(false);
  const [userBadges, setUserBadges] = useState<UserBadgeData[]>(providedBadges || []);
  const [badgesLoaded, setBadgesLoaded] = useState(!!providedBadges);
  const [showZoomModal, setShowZoomModal] = useState(false);
  
  // Check if user is on daily leaderboard (top 5 contributors)
  const { isOnLeaderboard, rank } = useIsLeaderboardUser(userId);

  // Check if user is official account
  const isOfficialAccount = useMemo(() => {
    return email?.toLowerCase() === OFFICIAL_ACCOUNT_EMAIL.toLowerCase();
  }, [email]);

  // Check if user should have verified badge
  const shouldShowVerifiedBadge = useMemo(() => {
    // First check if explicitly verified via isVerified prop
    if (isVerified) return true;
    
    // Check for official account
    if (isOfficialAccount) return true;
    
    // Check for specific user IDs if needed (VIP users)
    const vipUserIds = [
      '63fab08e-28cc-43b3-8563-54b718639ddf', // Umaru Mohammed
    ];
    
    return vipUserIds.includes(userId || '');
  }, [isVerified, isOfficialAccount, userId]);

  // Helper function to generate avatar URL with CDN conversion
  const generateAvatarUrl = useMemo(() => {
    if (!avatarUrl) {
      if (__DEV__) {
        log('[EnhancedAvatar] No avatarUrl provided for userId:', userId);
      }
      return null;
    }

    // Use getSafeAvatarUrl which handles CDN conversion automatically
    // This converts Supabase URLs to CDN URLs for faster loading in Nigeria/Africa
    const cdnUrl = getSafeAvatarUrl(avatarUrl, userId);
    
    if (!cdnUrl) {
      if (__DEV__) {
        warn('[EnhancedAvatar] getSafeAvatarUrl returned null for:', avatarUrl);
      }
      return null;
    }

    // Don't add cache busting query params - expo-image handles caching better
    // Cache busting causes React Native Image to treat it as a new image each time
    // expo-image uses recyclingKey for proper cache management
    if (__DEV__) {
      log('[EnhancedAvatar] Generated URL for userId:', userId, 'URL:', cdnUrl.substring(0, 80));
    }
    return cdnUrl;
  }, [avatarUrl, userId]);

  // Generate gradient colors based on user ID for consistent colors
  const gradientColors = useMemo(() => {
    if (!userId) {
      return isDarkMode 
        ? ['#4A5568', '#2D3748'] 
        : ['#E2E8F0', '#CBD5E0'];
    }

    // Create consistent colors based on user ID
    const hash = userId.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    const hue = Math.abs(hash) % 360;
    
    if (isDarkMode) {
      return [
        `hsl(${hue}, 45%, 35%)`,
        `hsl(${hue}, 45%, 25%)`
      ];
    } else {
      return [
        `hsl(${hue}, 50%, 70%)`,
        `hsl(${hue}, 50%, 60%)`
      ];
    }
  }, [userId, isDarkMode]);

  // Get initials for fallback
  const getInitials = useMemo(() => {
    if (fullName) {
      const names = fullName.trim().split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return names[0][0]?.toUpperCase() || '?';
    }
    
    if (username) {
      return username[0]?.toUpperCase() || '?';
    }
    
    return '?';
  }, [fullName, username]);

  // Calculate font size based on avatar size
  const fontSize = size * 0.35;
  const borderWidth = Math.max(1, size * 0.045);
  const onlineIndicatorSize = size * 0.25;

  const shouldShowFallback = !generateAvatarUrl || imageError;

  // Reset image error when avatar URL changes, but only if not static
  React.useEffect(() => {
    if (!isStatic && avatarUrl) {
      // Only reset error if we have a valid URL
      setImageError(false);
      if (__DEV__) {
        log('[EnhancedAvatar] Reset imageError for new avatarUrl:', avatarUrl.substring(0, 60));
      }
    }
  }, [avatarUrl, isStatic]);

  // Debug: Log when generateAvatarUrl changes
  React.useEffect(() => {
    if (__DEV__) {
      log('[EnhancedAvatar] generateAvatarUrl changed:', {
        hasUrl: !!generateAvatarUrl,
        url: generateAvatarUrl ? generateAvatarUrl.substring(0, 60) : null,
        imageError,
        shouldShowFallback,
        userId
      });
    }
  }, [generateAvatarUrl, imageError, shouldShowFallback, userId]);

  // Fetch badges if not provided and showBadges is true
  useEffect(() => {
    if (showBadges && userId && !badgesLoaded && !providedBadges) {
      getUserBadges(userId)
        .then((fetchedBadges) => {
          setUserBadges(fetchedBadges);
          setBadgesLoaded(true);
        })
        .catch((error) => {
          warn('[EnhancedAvatar] Error fetching badges:', error);
          setBadgesLoaded(true); // Mark as loaded to prevent retries
        });
    } else if (providedBadges) {
      setUserBadges(providedBadges);
      setBadgesLoaded(true);
    }
  }, [userId, showBadges, badgesLoaded, providedBadges]);

  // Calculate badge size based on avatar size
  const badgeSize = Math.max(10, size * 0.25);
  const userBadgeSize = Math.max(8, size * 0.18); // Smaller for user badges

  // Get badges to display (limit to 2 for space)
  const displayBadges = userBadges.slice(0, 2);

  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.container, { width: size, height: size }]}>
        {!shouldShowFallback && generateAvatarUrl ? (
          <TouchableOpacity
            activeOpacity={enableZoom ? 0.8 : 1}
            onPress={() => {
              if (enableZoom && generateAvatarUrl) {
                setShowZoomModal(true);
              }
            }}
            disabled={!enableZoom || !generateAvatarUrl}
          >
            <Image
              source={{ uri: generateAvatarUrl }}
              style={[
                styles.avatar,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderWidth: showBorder ? borderWidth : 0,
                  borderColor: themeColors.primary.light,
                }
              ]}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="normal"
              recyclingKey={userId || (generateAvatarUrl ? generateAvatarUrl.split('?')[0] : 'avatar')}
              transition={200}
              defaultSource={require('../assets/images/default-avatar.png')}
              onError={(error) => {
                warn('[EnhancedAvatar] Image load error:', {
                  url: generateAvatarUrl,
                  error: error?.message || error,
                  userId,
                  imageError
                });
                // Only set error if URL is still the same (not a stale error)
                // Use a small delay to prevent race conditions
                setTimeout(() => {
                  if (generateAvatarUrl) {
                    setImageError(true);
                  }
                }, 100);
              }}
              onLoad={() => {
                // Always reset error state on successful load
                if (__DEV__) {
                  log('[EnhancedAvatar] ✅ Image loaded successfully:', {
                    url: generateAvatarUrl?.substring(0, 60),
                    userId,
                    hadError: imageError
                  });
                }
                setImageError(false);
              }}
              onLoadStart={() => {
                // Reset error when starting to load (prevents stale errors)
                if (imageError && generateAvatarUrl) {
                  if (__DEV__) {
                    log('[EnhancedAvatar] Starting to load, resetting error state');
                  }
                  setImageError(false);
                }
              }}
            />
          </TouchableOpacity>
        ) : (
          <LinearGradient
            colors={gradientColors}
            style={[
              styles.fallbackContainer,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: showBorder ? borderWidth : 0,
                borderColor: themeColors.primary.light,
              }
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {getInitials !== '?' ? (
              <Text
                style={[
                  styles.initialsText,
                  {
                    fontSize: fontSize,
                    color: isDarkMode ? '#FFFFFF' : '#FFFFFF',
                  }
                ]}
              >
                {getInitials}
              </Text>
            ) : (
              <User
                size={size * 0.45}
                color={isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.9)'}
              />
            )}
          </LinearGradient>
        )}

        {/* Online Indicator */}
        {showOnlineIndicator && (
          <View
            style={[
              styles.onlineIndicator,
              {
                width: onlineIndicatorSize,
                height: onlineIndicatorSize,
                borderRadius: onlineIndicatorSize / 2,
                backgroundColor: isOnline ? themeColors.success.main : themeColors.neutral.border,
                borderColor: themeColors.neutral.surface,
                borderWidth: Math.max(1, onlineIndicatorSize * 0.15),
                bottom: size * 0.05,
                right: size * 0.05,
              }
            ]}
          />
        )}

        {/* Verified Badge */}
        {shouldShowVerifiedBadge && showVerifiedBadge && (
          <VipBadge 
            size={badgeSize} 
            type={isOfficialAccount ? "official" : "verified"}
            position={showOnlineIndicator ? "top-right" : "bottom-right"}
          />
        )}

        {/* Leaderboard Crown Badge (top-left, above verified badge) */}
        {isOnLeaderboard && rank && (
          <View
            style={[
              styles.crownBadge,
              {
                top: -2,
                left: -2,
                width: Math.min(28, Math.max(16, size * 0.22)),
                height: Math.min(28, Math.max(16, size * 0.22)),
              },
            ]}
          >
            <Crown
              size={Math.min(22, Math.max(12, size * 0.18))}
              color={
                rank === 1
                  ? '#FFD700' // Gold
                  : rank === 2
                  ? '#C0C0C0' // Silver
                  : rank === 3
                  ? '#CD7F32' // Bronze
                  : themeColors.primary.main
              }
              fill={
                rank === 1
                  ? '#FFD700'
                  : rank === 2
                  ? '#C0C0C0'
                  : rank === 3
                  ? '#CD7F32'
                  : themeColors.primary.main
              }
            />
          </View>
        )}
      </View>

      {/* User Badges - Display next to avatar (only show on avatars 32px or larger) */}
      {showBadges && size >= 32 && displayBadges.length > 0 && (
        <View style={styles.badgesContainer}>
          {displayBadges.map((badge) => (
            <View 
              key={badge.badge_key} 
              style={styles.badgeItem}
            >
              <UserBadge 
                badge={badge} 
                size="small"
              />
            </View>
          ))}
        </View>
      )}
      
      {/* Avatar Zoom Modal */}
      {enableZoom && generateAvatarUrl && (
        <AvatarZoomModal
          visible={showZoomModal}
          imageUri={generateAvatarUrl}
          onClose={() => setShowZoomModal(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible', // Allow badge to be visible outside avatar bounds
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  badgeItem: {
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
        elevation: 4,
      },
    }),
  },
  avatar: {
    backgroundColor: Colors.neutral.disabled,
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  initialsText: {
    fontFamily: FontFamily.bold,
    ...Platform.select({
      web: {
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
      },
      default: {
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
    }),
  },
  onlineIndicator: {
    position: 'absolute',
  },
  crownBadge: {
    position: 'absolute',
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Export with custom equality function
export default memo(EnhancedAvatar, arePropsEqual); 