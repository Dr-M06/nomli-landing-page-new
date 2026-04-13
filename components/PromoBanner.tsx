import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Linking,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ExternalLink } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Event } from '../utils/eventUtils';
import { trackBannerImpression, trackBannerClick } from '../utils/promoBannerUtils';
import useAuth from '../hooks/useAuth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PromoBannerProps {
  banner: Event;
  onDismiss?: () => void;
  fullScreen?: boolean;
  containerHeight?: number;
  disableInternalNavigation?: boolean;
}

/**
 * Promotional banner component for video feed
 * Displays ad from events table with custom image
 * Responsive design with blurred background for any image aspect ratio
 */
export default function PromoBanner({
  banner,
  onDismiss,
  fullScreen = true,
  containerHeight,
  disableInternalNavigation = false,
}: PromoBannerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const hasTrackedImpression = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  // Track impression when banner becomes visible
  useEffect(() => {
    if (!hasTrackedImpression.current && banner.id) {
      trackBannerImpression(banner.id);
      hasTrackedImpression.current = true;
    }

    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [banner.id]);

  const handlePress = async () => {
    // Track click
    await trackBannerClick(banner.id, user?.id);

    // Handle navigation
    if (banner.external_url) {
      Linking.openURL(banner.external_url);
    } else if (disableInternalNavigation) {
      // In fullscreen feed ads, avoid pushing EventDetail to keep return flow stable.
      onDismiss?.();
    } else {
      router.push(`/events/${banner.id}`);
    }
  };

  // Use passed containerHeight if available
  const height = containerHeight || (fullScreen ? SCREEN_HEIGHT : SCREEN_HEIGHT * 0.6);

  // Get CTA text
  const ctaText = banner.cta_text || (banner.external_url ? 'Learn More' : 'View Details');

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          width: windowWidth,
          height: height,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }
      ]}
    >
      {/* Blurred Background - same image but blurred for responsive feel */}
      <Image
        source={{ uri: banner.image_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={30}
      />
      
      {/* Dark overlay on blur */}
      <View style={styles.blurOverlay} />

      {/* Main Image - contained to show properly */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: banner.image_url }}
          style={styles.mainImage}
          contentFit="contain"
          transition={300}
        />
      </View>

      {/* Gradient for text readability */}
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
        locations={[0, 0.2, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Sponsored Label */}
      <View style={[styles.adLabel, { top: insets.top + 12 }]}>
        <Text style={styles.adLabelText}>Sponsored</Text>
      </View>
      {!!onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          activeOpacity={0.9}
          style={[styles.skipButton, { top: insets.top + 12 }]}
        >
          <Text style={styles.skipButtonText}>Skip Ad</Text>
        </TouchableOpacity>
      )}

      {/* Bottom Content */}
      <View style={[styles.content, { paddingBottom: insets.bottom + 90 }]}>
        {/* Host info */}
        {banner.profiles && (
          <View style={styles.hostRow}>
            {banner.profiles.avatar_url && (
              <Image
                source={{ uri: banner.profiles.avatar_url }}
                style={styles.hostAvatar}
                contentFit="cover"
              />
            )}
            <Text style={styles.hostName}>
              @{banner.profiles.username || 'sponsor'}
            </Text>
          </View>
        )}

        {/* Title */}
        {banner.title && (
          <Text style={styles.title} numberOfLines={2}>
            {banner.title}
          </Text>
        )}
        
        {/* Description */}
        {banner.description && (
          <Text style={styles.description} numberOfLines={2}>
            {banner.description}
          </Text>
        )}

        {/* CTA Button */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handlePress}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>{ctaText}</Text>
          {banner.external_url && (
            <ExternalLink size={14} color="#000" style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
      </View>

      {/* Swipe indicator */}
      <View style={[styles.swipeHint, { bottom: insets.bottom + 70 }]}>
        <View style={styles.swipeLine} />
        <Text style={styles.swipeText}>Swipe to continue</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  mainImage: {
    width: '100%',
    height: '70%',
  },
  adLabel: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  adLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 0.5,
  },
  skipButton: {
    position: 'absolute',
    right: 14,
    backgroundColor: 'rgba(20,20,24,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  hostAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  hostName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 16,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  swipeHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  swipeLine: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
    marginBottom: 6,
  },
  swipeText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
});
