import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Star } from 'lucide-react-native';

interface VipBadgeProps {
  size?: number;
  type?: 'verified' | 'official';
  position?: 'top-right' | 'bottom-right';
  style?: any;
}

const VerifiedBadge: React.FC<VipBadgeProps> = ({
  size = 10,
  type = 'verified',
  position = 'bottom-right',
  style,
}) => {
  const badgeSize = size;
  
  // Position styles - position badge completely outside the avatar (no overlap)
  const positionStyles = {
    'top-right': {
      top: -badgeSize * 0.5,
      right: -badgeSize * 0.5,
    },
    'bottom-right': {
      bottom: -badgeSize * 0.5,
      right: -badgeSize * 0.5,
    },
  };

  // Different colors for official vs verified
  const gradientColors = type === 'official' 
    ? ['#00D9FF', '#1DA1F2'] // Cyan-blue gradient for official (matches brand primary)
    : ['#00D4AA', '#00A8CC']; // Teal gradient for verified
  
  const glowColor = type === 'official' 
    ? '#00D9FF' 
    : '#00D4AA';

  return (
    <View
      style={[
        styles.badgeContainer,
        {
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          ...positionStyles[position],
        },
        style,
      ]}
    >
      {/* Outer glow ring */}
      <View
        style={[
          styles.glowRing,
          {
            width: badgeSize + 2,
            height: badgeSize + 2,
            borderRadius: (badgeSize + 2) / 2,
            backgroundColor: type === 'official' ? 'rgba(0, 217, 255, 0.4)' : 'rgba(0, 212, 170, 0.3)',
            borderColor: type === 'official' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.8)',
          }
        ]}
      />
      
      <LinearGradient
        colors={gradientColors}
        style={[
          styles.gradientBackground,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
          }
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Star 
          size={badgeSize * 0.75} 
          color="#FFFFFF" 
          fill="#FFFFFF"
          strokeWidth={2}
        />
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  gradientBackground: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
});

export default VerifiedBadge; 