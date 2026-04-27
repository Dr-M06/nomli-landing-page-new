/**
 * OptimizedImage Component
 * 
 * Implements tiered image loading with lazy loading and viewport detection.
 * 
 * Features:
 * - Preview-first rendering (<100ms first paint)
 * - Lazy loads medium quality when in viewport
 * - Loads full quality only on tap/zoom
 * - Network-aware loading
 * - Smooth transitions between tiers
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import NetInfo from '@react-native-community/netinfo';
import { getTieredImageUrl, getAllTierUrls, ImageTier, getImagePlaceholderColor } from '../utils/tieredImageLoader';
import { log, warn, error } from '../utils/productionLogger';


export interface OptimizedImageProps {
  source: string | { uri: string };
  style?: any;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  contentPosition?: string;
  onPress?: () => void;
  onLoad?: () => void;
  onError?: (error: any) => void;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  defaultSource?: any;
  // Viewport detection props
  isVisible?: boolean; // Whether image is currently visible in viewport
  distanceFromViewport?: number; // Distance in pixels from viewport (for preloading)
  // Tier control
  initialTier?: ImageTier; // Start with this tier (default: 'preview')
  maxTier?: ImageTier; // Maximum tier to load (default: 'full')
  // Network awareness
  networkSpeed?: '2g' | '3g' | '4g' | '5g' | 'wifi';
  // Fullscreen mode (loads full tier immediately)
  fullscreen?: boolean;
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  source,
  style,
  contentFit = 'cover',
  contentPosition = 'center',
  onPress,
  onLoad,
  onError,
  priority = 'normal',
  recyclingKey,
  defaultSource,
  isVisible = true,
  distanceFromViewport = 0,
  initialTier = 'preview',
  maxTier = 'full',
  networkSpeed,
  fullscreen = false,
}) => {
  const imageUrl = typeof source === 'string' ? source : source.uri;
  
  // Track highest tier loaded to prevent downgrades
  const highestTierLoadedRef = useRef<ImageTier>(initialTier);
  
  const [currentTier, setCurrentTier] = useState<ImageTier>(() => {
    // Start with the highest tier we've loaded, or initial tier
    return fullscreen ? 'full' : initialTier;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [networkType, setNetworkType] = useState<string>('unknown');
  const [tierUrls, setTierUrls] = useState<{ preview: string; medium: string; full: string } | null>(null);
  
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedMediumRef = useRef(false);
  const hasLoadedFullRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);
  
  // Generate stable cache key from original URL (without query params)
  // Each tier gets its own cache entry, but we check higher tiers first
  const getCacheKey = useCallback((tier?: ImageTier): string => {
    try {
      // Extract base URL without query parameters
      const baseUrl = imageUrl.split('?')[0];
      // Remove protocol and domain, keep path
      const urlMatch = baseUrl.match(/\/([^\/]+\/.*)$/);
      if (urlMatch) {
        // Use path as base cache key (includes bucket and filename)
        const baseKey = urlMatch[1].replace(/\//g, '_');
        // Append tier to make each tier have its own cache entry
        return tier ? `${baseKey}_${tier}` : baseKey;
      }
      // Fallback: use hash of URL
      let hash = 0;
      for (let i = 0; i < baseUrl.length; i++) {
        hash = ((hash << 5) - hash) + baseUrl.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      return tier ? `img_${Math.abs(hash)}_${tier}` : `img_${Math.abs(hash)}`;
    } catch {
      // Fallback to recyclingKey or imageUrl
      const base = recyclingKey || imageUrl.split('?')[0];
      return tier ? `${base}_${tier}` : base;
    }
  }, [imageUrl, recyclingKey]);
  
  // Simplified: Let expo-image handle cache naturally, don't aggressively check

  // Simplified network detection - only check once on mount, don't subscribe to changes
  useEffect(() => {
    const detectNetwork = async () => {
      try {
        const netInfo = await NetInfo.fetch();
        const type = netInfo.type;
        const isConnected = netInfo.isConnected;
        
        if (!isConnected) {
          setNetworkType('offline');
          return;
        }

        // Map NetInfo types to our network speed categories
        if (type === 'wifi') {
          setNetworkType('wifi');
        } else if (type === 'cellular') {
          const details = netInfo.details as any;
          if (details?.cellularGeneration) {
            setNetworkType(details.cellularGeneration.toLowerCase());
          } else {
            // Default to 3G for cellular
            setNetworkType('3g');
          }
        } else {
          setNetworkType('unknown');
        }
      } catch (error) {
        // Fail silently, use default
        setNetworkType('3g');
      }
    };

    // Only check once on mount, don't subscribe to changes to reduce strain
    detectNetwork();
  }, []);

  // Generate tier URLs
  useEffect(() => {
    if (imageUrl) {
      try {
        // Strip cache-busting query params before generating tier URLs
        const cleanUrl = imageUrl.split('?')[0];
        const urls = getAllTierUrls(cleanUrl);
        
        // Validate URLs - if any are invalid, use original URL (without query params) for all tiers
        if (urls.preview && urls.medium && urls.full) {
          setTierUrls(urls);
        } else {
          // Fallback: use original URL without query params for all tiers
          setTierUrls({
            preview: cleanUrl,
            medium: cleanUrl,
            full: cleanUrl,
          });
        }
      } catch (error) {
        if (__DEV__) {
          warn('[OptimizedImage] Error generating tier URLs, using original:', error);
        }
        // Fallback: use original URL without query params for all tiers
        const cleanUrl = imageUrl.split('?')[0];
        setTierUrls({
          preview: cleanUrl,
          medium: cleanUrl,
          full: cleanUrl,
        });
      }
    }
  }, [imageUrl]);

  // Determine which tier to load based on visibility and network
  useEffect(() => {
    if (!tierUrls || fullscreen) return;

    // Clear any pending load timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    // CRITICAL: Never downgrade if we've already loaded a higher tier
    // This ensures cache is reused properly
    const highestLoaded = highestTierLoadedRef.current;
    if (highestLoaded === 'full' && currentTier !== 'full') {
      setCurrentTier('full');
      return;
    }
    if (highestLoaded === 'medium' && currentTier === 'preview') {
      setCurrentTier('medium');
      return;
    }

    const effectiveNetworkSpeed = networkSpeed || networkType as any;
    
    // Load medium only when actually visible (not near viewport)
    // Reduced aggressive preloading
    if (currentTier === 'preview' && isVisible) {
      // Check network conditions - don't upgrade on 2G
      if (effectiveNetworkSpeed === '2g' || effectiveNetworkSpeed === 'slow-2g') {
        return; // Stay on preview tier
      }
      
      // Delay upgrade to avoid straining the app
      loadTimeoutRef.current = setTimeout(() => {
        // Only upgrade if we haven't already loaded medium or higher
        if (!hasLoadedMediumRef.current && maxTier !== 'preview' && highestLoaded === 'preview') {
          setCurrentTier('medium');
          hasLoadedMediumRef.current = true;
          highestTierLoadedRef.current = 'medium';
        }
      }, 500); // Increased delay to reduce strain
    }

    // Load full only on tap (handled by onPress)
    // Or if explicitly requested via fullscreen prop

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [isVisible, distanceFromViewport, currentTier, tierUrls, maxTier, networkSpeed, networkType, fullscreen]);

  // Get current image URL based on tier
  // Always strip query params to avoid cache-busting issues
  const getCurrentImageUrl = useCallback((): string => {
    if (!tierUrls) {
      // Strip query params from original URL
      return imageUrl.split('?')[0];
    }
    
    // In fullscreen mode, always use full tier
    if (fullscreen) {
      return tierUrls.full || imageUrl.split('?')[0];
    }

    let tierUrl: string;
    switch (currentTier) {
      case 'preview':
        tierUrl = tierUrls.preview;
        break;
      case 'medium':
        tierUrl = tierUrls.medium;
        break;
      case 'full':
        tierUrl = tierUrls.full;
        break;
      default:
        tierUrl = tierUrls.medium;
    }
    
    // Fallback to original URL without query params if tier URL is invalid
    return tierUrl || imageUrl.split('?')[0];
  }, [tierUrls, currentTier, imageUrl, fullscreen]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    
    // Update highest tier loaded
    if (currentTier === 'full') {
      highestTierLoadedRef.current = 'full';
      hasLoadedFullRef.current = true;
      hasLoadedMediumRef.current = true;
    } else if (currentTier === 'medium') {
      highestTierLoadedRef.current = 'medium';
      hasLoadedMediumRef.current = true;
    }
    
    onLoad?.();
  }, [onLoad, currentTier]);

  const handleError = useCallback((error: any) => {
    setIsLoading(false);
    
    // Fallback: Try original URL without query params if tier URL fails
    // This handles cases where render endpoint isn't available or returns errors
    if (tierUrls && imageUrl && !fallbackAttemptedRef.current) {
      const cleanOriginalUrl = imageUrl.split('?')[0];
      
      // If current URL is different from clean original, retry with original
      if (currentUrl !== cleanOriginalUrl && !currentUrl.includes(cleanOriginalUrl)) {
        fallbackAttemptedRef.current = true; // Mark fallback as attempted
        // Silently fallback to original URL (render endpoint may not be available)
        // Update to use original URL directly for all tiers
        setTierUrls({
          preview: cleanOriginalUrl,
          medium: cleanOriginalUrl,
          full: cleanOriginalUrl,
        });
        setCurrentTier('full'); // Use full tier with original URL
        setHasError(false);
        setIsLoading(true);
        return; // Retry with original URL
      }
    }
    
    // If we've already tried original URL and it still fails, show error
    setHasError(true);
    onError?.(error);
  }, [currentTier, tierUrls, onError, imageUrl, currentUrl]);

  const handlePress = useCallback(() => {
    // On tap, upgrade to full tier if not already loaded
    // Once full is loaded, it stays loaded (never downgrade)
    if (currentTier !== 'full' && !hasLoadedFullRef.current && maxTier === 'full') {
      setCurrentTier('full');
      hasLoadedFullRef.current = true;
      // Also mark medium as loaded since we're skipping to full
      hasLoadedMediumRef.current = true;
      highestTierLoadedRef.current = 'full';
    }
    
    onPress?.();
  }, [currentTier, maxTier, onPress]);

  const currentUrl = getCurrentImageUrl();
  const placeholderColor = getImagePlaceholderColor(imageUrl);

  // Ensure we have a valid URL
  if (!currentUrl || !imageUrl) {
    return (
      <View style={[style, styles.placeholder, { backgroundColor: placeholderColor }]}>
        {defaultSource && (
          <Image
            source={defaultSource}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}
      </View>
    );
  }

  // Render placeholder while loading preview
  if (isLoading && currentTier === 'preview' && !tierUrls) {
    return (
      <View style={[style, styles.placeholder, { backgroundColor: placeholderColor }]}>
        {defaultSource && (
          <Image
            source={defaultSource}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}
        {!defaultSource && (
          <ActivityIndicator size="small" color="#999" />
        )}
      </View>
    );
  }

  // Apply blur for preview tier only; never blur Bunny.net (and similar CDN) images
  const isBunnyOrCdn = imageUrl.includes('bunny.net') || imageUrl.includes('bunnycdn.com');
  const blurRadius = currentTier === 'preview' && !isBunnyOrCdn ? 10 : 0;
  
  // Simplified: Use current tier's URL and cache key
  // Let expo-image handle cache naturally without complex logic
  const cacheKey = getCacheKey(currentTier);
  
  const imageComponent = (
    <Image
      source={{ 
        uri: currentUrl,
        // Use tier-specific cache key
        cacheKey: cacheKey
      }}
      style={style}
      contentFit={contentFit}
      contentPosition={contentPosition}
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={recyclingKey || cacheKey}
      transition={200}
      blurRadius={blurRadius}
      // Reduced preloading to avoid strain
      drawDistance={isVisible ? 200 : 0} // Reduced from 600px to 200px
      onLoad={handleLoad}
      onError={handleError}
      onLoadStart={() => setIsLoading(true)}
    />
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={handlePress}
        style={style}
      >
        {imageComponent}
        {isLoading && currentTier !== 'preview' && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <>
      {imageComponent}
      {isLoading && currentTier !== 'preview' && (
        <View style={[styles.loadingOverlay, style]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default OptimizedImage;
