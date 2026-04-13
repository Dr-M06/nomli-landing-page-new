import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Gift, Star } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface UserBadgeData {
  badge_key: string;
  badge_name: string;
  icon_name: string;
  color: string;
  badge_description?: string;
}

interface UserBadgeProps {
  badge: UserBadgeData;
  size?: 'small' | 'medium' | 'large';
  style?: any;
  onPress?: () => void;
}

const UserBadge: React.FC<UserBadgeProps> = ({ badge, size = 'medium', style, onPress }) => {
  const sizeMap = {
    small: { container: 20, icon: 10, fontSize: 8, padding: 4 },
    medium: { container: 28, icon: 14, fontSize: 10, padding: 6 },
    large: { container: 36, icon: 18, fontSize: 12, padding: 8 },
  };

  const dimensions = sizeMap[size];

  const getIcon = () => {
    switch (badge.icon_name) {
      case 'gift':
        return <Gift size={dimensions.icon} color="#FFFFFF" strokeWidth={2.5} />;
      case 'star':
        return <Star size={dimensions.icon} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2.5} />;
      default:
        return <Star size={dimensions.icon} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2.5} />;
    }
  };

  const getGradientColors = () => {
    switch (badge.badge_key) {
      case 'top_gifter':
        return ['#FF6B9D', '#FF8FB3'];
      case 'early_user':
        return ['#FFD700', '#FFED4E'];
      default:
        return [badge.color || '#FFD700', badge.color || '#FFED4E'];
    }
  };

  const BadgeContent = (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={getGradientColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.badge,
          {
            width: dimensions.container,
            height: dimensions.container,
            borderRadius: dimensions.container / 2,
            padding: dimensions.padding,
          },
        ]}
      >
        {getIcon()}
      </LinearGradient>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {BadgeContent}
      </TouchableOpacity>
    );
  }

  return BadgeContent;
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});

export default UserBadge;

