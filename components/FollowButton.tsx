import React, { useState, useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
  View,
} from 'react-native';
import { UserPlus, UserMinus, Check } from 'lucide-react-native';
import { followUser, unfollowUser, isFollowing } from '../utils/followersServiceFixed';
import { sendFriendRequest, cancelFriendRequest, hasPendingRequest } from '../utils/friendRequestService';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import useAuth from '../hooks/useAuth';
import Toast from 'react-native-toast-message';
import { log, warn, error } from '../utils/productionLogger';


interface FollowButtonProps {
  userId: string;
  size?: 'compact' | 'small' | 'medium' | 'large';
  variant?: 'primary' | 'outline' | 'minimal';
  onFollowChange?: (isFollowing: boolean) => void;
  style?: any;
  profileVisible?: boolean; // Whether profile is visible in mingle screen
}

export default function FollowButton({
  userId,
  size = 'medium',
  variant = 'primary',
  onFollowChange,
  style,
  profileVisible = true, // Default to visible for backward compatibility
}: FollowButtonProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'none' | 'sent' | 'received'>('none');
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  
  // Ref to track if we've already checked status to prevent duplicate calls
  const hasCheckedRef = useRef(false);
  
  // Animation for success feedback
  const scaleAnim = new Animated.Value(1);
  const opacityAnim = new Animated.Value(1);

  const checkFollowStatus = async () => {
    if (!userId || !user || user.id === userId) {
      setCheckingStatus(false);
      hasCheckedRef.current = true;
      return;
    }
    
    // Prevent duplicate calls
    if (hasCheckedRef.current && !checkingStatus) {
      return;
    }
    
    try {
      setCheckingStatus(true);
      // Pass current user ID to avoid auth call in isFollowing
      const following = await isFollowing(userId, user.id);
      setIsFollowingUser(following);
      
      // If profile is hidden, check for friend requests
      if (!profileVisible && !following) {
        const requestStatus = await hasPendingRequest(user.id, userId);
        setRequestStatus(requestStatus || 'none');
      } else {
        setRequestStatus('none');
      }
      
      hasCheckedRef.current = true;
    } catch (error) {
      error('Error checking follow status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Check initial follow status
  useEffect(() => {
    hasCheckedRef.current = false; // Reset for new user
    checkFollowStatus();
  }, [userId, user?.id]); // Only depend on user.id to prevent unnecessary re-renders

  // Don't show button for own profile
  if (!user || user.id === userId) {
    return null;
  }

  const handlePress = async () => {
    if (loading) return;

    try {
      setLoading(true);

      // Animation feedback
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 0.95,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.8,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      // If already following, unfollow
      if (isFollowingUser) {
        const success = await unfollowUser(userId);
        if (success) {
          setIsFollowingUser(false);
          onFollowChange?.(false);
        }
        return;
      }

      // If profile is hidden, use friend request system
      if (!profileVisible) {
        if (requestStatus === 'sent') {
          // Cancel friend request
          const success = await cancelFriendRequest(userId);
          if (success) {
            setRequestStatus('none');
            Toast.show({
              type: 'success',
              text1: 'Request canceled',
              text2: 'Friend request canceled',
            });
          }
        } else {
          // Send friend request
          const success = await sendFriendRequest(userId);
          if (success) {
            setRequestStatus('sent');
            Toast.show({
              type: 'success',
              text1: 'Request sent!',
              text2: 'They\'ll be notified when you\'re accepted',
            });
          } else {
            Toast.show({
              type: 'error',
              text1: 'Failed to send request',
              text2: 'Please try again',
            });
          }
        }
      } else {
        // Profile visible - direct follow
        const success = await followUser(userId);
        if (success) {
          setIsFollowingUser(true);
          onFollowChange?.(true);
        }
      }
    } catch (error) {
      error('Error handling follow/request:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Something went wrong',
      });
    } finally {
      setLoading(false);
    }
  };

  // Compact sizing (quiet minimal)
  const getSizeStyles = () => {
    switch (size) {
      case 'compact':
        return {
          paddingHorizontal: variant === 'minimal' ? 8 : 10,
          paddingVertical: 4,
          borderRadius: 13,
          fontSize: 11,
          iconSize: 12,
          height: 26,
          minWidth: variant === 'minimal' ? 32 : 56,
        };
      case 'small':
        return {
          paddingHorizontal: variant === 'minimal' ? 10 : 12,
          paddingVertical: 6,
          borderRadius: 14,
          fontSize: 12,
          iconSize: 14,
          height: 36,
          minWidth: variant === 'minimal' ? 36 : 52,
        };
      case 'large':
        return {
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 18,
          fontSize: 14,
          iconSize: 18,
          height: 44,
          minWidth: 88,
        };
      default: // medium
        return {
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 16,
          fontSize: 13,
          iconSize: 16,
          height: 40,
          minWidth: 72,
        };
    }
  };

  // Get variant styles with premium design
  const getVariantStyles = () => {
    const sizeStyles = getSizeStyles();
    
    if (isFollowingUser) {
      // Following state - premium design
      switch (variant) {
        case 'outline':
          return {
            backgroundColor: isDarkMode 
              ? 'rgba(34, 197, 94, 0.08)' 
              : 'rgba(34, 197, 94, 0.06)',
            borderWidth: 1,
            borderColor: '#22C55E',
            textColor: '#22C55E',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 2,
            elevation: 1,
          };
        case 'minimal':
          return {
            backgroundColor: isDarkMode 
              ? 'rgba(34, 197, 94, 0.12)' 
              : 'rgba(34, 197, 94, 0.08)',
            borderWidth: 0,
            textColor: '#22C55E',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.03,
            shadowRadius: 2,
            elevation: 1,
          };
        default: // primary
          return {
            backgroundColor: '#22C55E',
            borderWidth: 0,
            textColor: 'white',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 3,
            elevation: 2,
          };
      }
    } else {
      // Not following state - premium design
      switch (variant) {
        case 'outline':
          return {
            backgroundColor: isDarkMode 
              ? 'rgba(59, 130, 246, 0.08)' 
              : 'rgba(59, 130, 246, 0.06)',
            borderWidth: 1,
            borderColor: '#3B82F6',
            textColor: '#3B82F6',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 2,
            elevation: 1,
          };
        case 'minimal':
          return {
            backgroundColor: isDarkMode 
              ? 'rgba(59, 130, 246, 0.12)' 
              : 'rgba(59, 130, 246, 0.08)',
            borderWidth: 0,
            textColor: '#3B82F6',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.03,
            shadowRadius: 2,
            elevation: 1,
          };
        default: // primary
          return {
            backgroundColor: '#3B82F6', // Fallback color for gradient
            borderWidth: 0,
            textColor: 'white',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 3,
            elevation: 2,
          };
      }
    }
  };

  const sizeStyles = getSizeStyles();
  const variantStyles = getVariantStyles();

  // Show loading state for initial check
  if (checkingStatus) {
    return (
      <TouchableOpacity
        style={[
          styles.button,
          {
            paddingHorizontal: sizeStyles.paddingHorizontal,
            paddingVertical: sizeStyles.paddingVertical,
            borderRadius: sizeStyles.borderRadius,
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            borderWidth: 0,
          },
          style
        ]}
        disabled
      >
        <ActivityIndicator size="small" color={themeColors.neutral.subtext} />
      </TouchableOpacity>
    );
  }

  const renderIcon = () => {
    if (loading) {
      return <ActivityIndicator size="small" color={variantStyles.textColor} />;
    }
    
    if (isFollowingUser) {
      return variant === 'minimal' ? 
        <Check size={sizeStyles.iconSize} color={variantStyles.textColor} strokeWidth={2.5} /> :
        <UserMinus size={sizeStyles.iconSize} color={variantStyles.textColor} strokeWidth={2} />;
    }
    
    // Show check icon for sent friend requests
    if (!profileVisible && requestStatus === 'sent') {
      return <Check size={sizeStyles.iconSize} color={variantStyles.textColor} strokeWidth={2} />;
    }
    
    return <UserPlus size={sizeStyles.iconSize} color={variantStyles.textColor} strokeWidth={2} />;
  };

  const renderText = () => {
    if (loading) return '';
    
    // For small minimal buttons, show icon only
    if (size === 'small' && variant === 'minimal') {
      return '';
    }
    
    if (isFollowingUser) {
      return 'Following';
    }
    
    // Handle friend request states when profile is hidden
    if (!profileVisible) {
      if (requestStatus === 'sent') {
        return 'Request Sent';
      }
      return 'Send Request';
    }
    
    return 'Follow';
  };

  // Render button (quiet minimal: no gradients)
  const ButtonWrapper = ({ children, style: buttonStyle }: any) => {
    // Regular view for all variants
    return (
      <View
        style={[
          styles.button,
          {
            height: sizeStyles.height,
            minWidth: sizeStyles.minWidth,
            paddingHorizontal: sizeStyles.paddingHorizontal,
            borderRadius: sizeStyles.borderRadius,
            backgroundColor: variantStyles.backgroundColor,
            borderWidth: variantStyles.borderWidth,
            borderColor: variantStyles.borderColor,
            shadowColor: variantStyles.shadowColor,
            shadowOffset: variantStyles.shadowOffset,
            shadowOpacity: variantStyles.shadowOpacity,
            shadowRadius: variantStyles.shadowRadius,
            elevation: variantStyles.elevation,
          },
          buttonStyle
        ]}
      >
        {children}
      </View>
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.85 : 1,
          transform: [
            { scale: pressed ? 0.96 : 1 },
          ],
        },
        style
      ]}
    >
      <ButtonWrapper>
        <Animated.View
          style={[
            styles.buttonContent,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            }
          ]}
        >
          {renderIcon()}
          {renderText() && (
            <Text
              style={[
                styles.buttonText,
                {
                  fontSize: sizeStyles.fontSize,
                  color: variantStyles.textColor,
                  marginLeft: size === 'small' && variant === 'minimal' ? 0 : 6,
                }
              ]}
            >
              {renderText()}
            </Text>
          )}
        </Animated.View>
      </ButtonWrapper>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow and elevation are handled in variant styles
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  buttonText: {
    fontWeight: '600',
    fontFamily: 'System',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
});
