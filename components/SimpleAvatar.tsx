import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';
import EnhancedAvatar from './EnhancedAvatar';

interface SimpleAvatarProps {
  avatarUrl?: string | null;
  userId?: string;
  size?: number;
  isDarkMode?: boolean;
  isVerified?: boolean; // User verification status
  fullName?: string;
  username?: string;
  email?: string; // User email for official account check
  showBadges?: boolean; // Show user badges next to avatar
  /** When false, taps pass through to a parent pressable (e.g. row opens profile). */
  enableZoom?: boolean;
}

const SimpleAvatar: React.FC<SimpleAvatarProps> = ({ 
  avatarUrl, 
  userId,
  size = 32, 
  isDarkMode = false,
  isVerified = false,
  fullName,
  username,
  email,
  showBadges = true, // Show badges by default
  enableZoom = true,
}) => {
  // Use the enhanced avatar component for better fallbacks
  return (
    <EnhancedAvatar
      avatarUrl={avatarUrl}
      userId={userId}
      size={size}
      isDarkMode={isDarkMode}
      showBorder={true}
      showOnlineIndicator={false}
      isVerified={isVerified}
      fullName={fullName}
      username={username}
      email={email}
      showBadges={showBadges}
      enableZoom={enableZoom}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center', 
    justifyContent: 'center',
  },
  avatar: {
    backgroundColor: Colors.neutral.disabled,
    borderWidth: 2,
  },
});

export default SimpleAvatar; 