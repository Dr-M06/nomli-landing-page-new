import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Image } from 'react-native';
import { Profile } from '../utils/supabase';
import { Colors } from '../constants/Colors';
import { BorderRadius, Shadow, AnimationTiming } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';


interface ProfileMapProps {
  profile: Partial<Profile>;
  size?: number;
  showPulse?: boolean;
  selected?: boolean;
}

const ProfileMap = ({
  profile,
  size = 44,
  showPulse = false,
  selected = false,
}: ProfileMapProps) => {
  const pulseAnim = useRef(new Animated.Value(0.8)).current;
  const selectedAnim = useRef(new Animated.Value(1)).current;

  // Helper function to get the correct avatar URL
  const getAvatarUrl = (avatarUrl?: string | null) => {
    if (!avatarUrl) return null;
    
    // Handle DiceBear avatars
    if (avatarUrl.startsWith('dicebear:')) {
      const avatarData = avatarUrl.replace('dicebear:', '');
      if (avatarData.includes(':')) {
        const [style, seed] = avatarData.split(':');
        return `https://api.dicebear.com/9.x/${style}/png?seed=${seed}&size=${size}`;
      } else {
        // Handle old format (style only) - use userId as seed
        return `https://api.dicebear.com/9.x/${avatarData}/png?seed=${profile.id || 'default'}&size=${size}`;
      }
    }
    
    // Return regular URL as-is
    return avatarUrl;
  };

  useEffect(() => {
    // Pulse animation for map markers
    if (showPulse) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: AnimationTiming.medium,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.8,
            duration: AnimationTiming.medium,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    // Selected animation
    if (selected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(selectedAnim, {
            toValue: 1.1,
            duration: AnimationTiming.fast,
            useNativeDriver: true,
          }),
          Animated.timing(selectedAnim, {
            toValue: 1,
            duration: AnimationTiming.fast,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      selectedAnim.setValue(1);
    }
  }, [showPulse, selected]);

  const getScaleTransform = () => {
    if (selected) {
      return [{ scale: selectedAnim }];
    }
    if (showPulse) {
      return [{ scale: pulseAnim }];
    }
    return [{ scale: 1 }];
  };
  
  return (
    <View style={styles.container}>
      {showPulse && (
        <Animated.View
          style={[
            styles.pulseCircle,
            {
              width: size * 1.8,
              height: size * 1.8,
              borderRadius: size * 1.8 / 2,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
      )}
      
      <Animated.View
        style={[
          styles.markerContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: getScaleTransform(),
          },
          selected && styles.selectedMarker,
        ]}
      >
        <Image
          source={
            getAvatarUrl(profile?.avatar_url)
              ? { uri: getAvatarUrl(profile?.avatar_url) }
              : require('../assets/images/default-avatar.png')
          }
          style={[
            styles.avatar,
            {
              width: size - 6,
              height: size - 6,
              borderRadius: (size - 6) / 2,
            },
          ]}
          defaultSource={require('../assets/images/default-avatar.png')}
          onError={(e) => log('Image loading error:', e.nativeEvent.error)}
        />
      </Animated.View>
      
      <View
        style={[
          styles.pointer,
          { 
            marginTop: -4,
            borderLeftWidth: 8,
            borderRightWidth: 8,
            borderTopWidth: 8,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCircle: {
    position: 'absolute',
    backgroundColor: 'rgba(140, 204, 217, 0.2)', // Accent color with opacity
    zIndex: 1,
  },
  markerContainer: {
    backgroundColor: Colors.neutral.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primary.main,
    ...Shadow.md,
    zIndex: 2,
  },
  selectedMarker: {
    borderColor: Colors.secondary.main,
    borderWidth: 3,
  },
  avatar: {
    resizeMode: 'cover',
  },
  pointer: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.primary.main,
    zIndex: 1,
  },
});

export default ProfileMap;