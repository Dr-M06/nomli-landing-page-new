import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { BorderRadius, Spacing } from '../../constants/Theme';

const { width } = Dimensions.get('window');

// Shared shimmer placeholder component
export const ShimmerPlaceholder = ({ 
  width: w, 
  height, 
  borderRadius = 8, 
  style = {}, 
  sharedShimmerValue 
}: { 
  width: number | string; 
  height: number; 
  borderRadius?: number; 
  style?: object; 
  sharedShimmerValue?: Animated.Value 
}) => {
  const localShimmer = useRef(new Animated.Value(0)).current;
  const shimmerAnim = sharedShimmerValue ?? localShimmer;

  useEffect(() => {
    if (sharedShimmerValue) return;
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(localShimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(localShimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerAnimation.start();
    return () => shimmerAnimation.stop();
  }, [sharedShimmerValue]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width: w,
          height,
          backgroundColor: '#E0E0E0',
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

// Profile Header Skeleton
export const ProfileHeaderSkeleton = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sharedShimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sharedShimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(sharedShimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.profileInfo, { opacity: fadeAnim }]}>
      <ShimmerPlaceholder width={100} height={100} borderRadius={50} sharedShimmerValue={sharedShimmer} />
      <View style={{ marginTop: Spacing.md, alignItems: 'center' }}>
        <ShimmerPlaceholder width={150} height={24} borderRadius={12} sharedShimmerValue={sharedShimmer} />
      </View>
      <View style={{ marginTop: Spacing.sm, alignItems: 'center' }}>
        <ShimmerPlaceholder width={120} height={16} borderRadius={8} sharedShimmerValue={sharedShimmer} />
      </View>
      <View style={{ marginTop: Spacing.md, alignItems: 'center' }}>
        <ShimmerPlaceholder width={250} height={16} borderRadius={8} style={{ marginBottom: 4 }} sharedShimmerValue={sharedShimmer} />
        <ShimmerPlaceholder width={200} height={16} borderRadius={8} sharedShimmerValue={sharedShimmer} />
      </View>
      <View style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
        <ShimmerPlaceholder width={80} height={18} borderRadius={9} style={{ marginBottom: Spacing.sm }} sharedShimmerValue={sharedShimmer} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
          <ShimmerPlaceholder width={80} height={28} borderRadius={14} style={{ margin: 4 }} sharedShimmerValue={sharedShimmer} />
          <ShimmerPlaceholder width={100} height={28} borderRadius={14} style={{ margin: 4 }} sharedShimmerValue={sharedShimmer} />
          <ShimmerPlaceholder width={70} height={28} borderRadius={14} style={{ margin: 4 }} sharedShimmerValue={sharedShimmer} />
          <ShimmerPlaceholder width={90} height={28} borderRadius={14} style={{ margin: 4 }} sharedShimmerValue={sharedShimmer} />
        </View>
      </View>
    </Animated.View>
  );
};

// Posts Grid Skeleton
export const PostsGridSkeleton = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sharedShimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sharedShimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(sharedShimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Match profile screen grid: paddingHorizontal 20, 3 columns, 2px gap between items
  const paddingHorizontal = 20;
  const gap = 2;
  const postWidth = (width - paddingHorizontal * 2 - gap * 2) / 3;

  return (
    <Animated.View style={[styles.postsGrid, { opacity: fadeAnim }]}>
      {[...Array(9)].map((_, index) => (
        <View 
          key={index} 
          style={[
            styles.postItem, 
            { width: postWidth, height: postWidth },
            (index + 1) % 3 === 0 ? { marginRight: 0 } : {},
          ]}
        >
          <ShimmerPlaceholder 
            width={postWidth} 
            height={postWidth} 
            borderRadius={BorderRadius.md} 
            sharedShimmerValue={sharedShimmer}
          />
        </View>
      ))}
    </Animated.View>
  );
};

// Events Skeleton
export const EventsSkeleton = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sharedShimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sharedShimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(sharedShimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.eventsContainer, { opacity: fadeAnim }]}>
      <View style={styles.eventFilterTabs}>
        <ShimmerPlaceholder width={80} height={36} borderRadius={18} style={{ marginRight: 8 }} sharedShimmerValue={sharedShimmer} />
        <ShimmerPlaceholder width={90} height={36} borderRadius={18} style={{ marginRight: 8 }} sharedShimmerValue={sharedShimmer} />
        <ShimmerPlaceholder width={70} height={36} borderRadius={18} sharedShimmerValue={sharedShimmer} />
      </View>
      <View style={styles.eventsGrid}>
        {[...Array(4)].map((_, index) => (
          <View key={index} style={styles.eventItem}>
            <View style={styles.eventContent}>
              <ShimmerPlaceholder width="100%" height={120} borderRadius={BorderRadius.md} sharedShimmerValue={sharedShimmer} />
              <View style={{ padding: Spacing.md }}>
                <ShimmerPlaceholder width="80%" height={18} borderRadius={9} style={{ marginBottom: 8 }} sharedShimmerValue={sharedShimmer} />
                <ShimmerPlaceholder width="60%" height={14} borderRadius={7} style={{ marginBottom: 4 }} sharedShimmerValue={sharedShimmer} />
                <ShimmerPlaceholder width="40%" height={14} borderRadius={7} sharedShimmerValue={sharedShimmer} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
};

// Bookmarks Skeleton
export const BookmarksSkeleton = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sharedShimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sharedShimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(sharedShimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.bookmarksContainer, { opacity: fadeAnim }]}>
      <View style={styles.bookmarkFilterTabs}>
        <ShimmerPlaceholder width={70} height={32} borderRadius={16} style={{ marginRight: 8 }} sharedShimmerValue={sharedShimmer} />
        <ShimmerPlaceholder width={120} height={32} borderRadius={16} style={{ marginRight: 8 }} sharedShimmerValue={sharedShimmer} />
        <ShimmerPlaceholder width={80} height={32} borderRadius={16} sharedShimmerValue={sharedShimmer} />
      </View>
      <View style={styles.bookmarksList}>
        {[...Array(5)].map((_, index) => (
          <View key={index} style={styles.bookmarkItem}>
            <View style={styles.bookmarkHeader}>
              <ShimmerPlaceholder width={20} height={20} borderRadius={10} style={{ marginRight: 8 }} sharedShimmerValue={sharedShimmer} />
              <ShimmerPlaceholder width={120} height={14} borderRadius={7} sharedShimmerValue={sharedShimmer} />
              <View style={{ flex: 1 }} />
              <ShimmerPlaceholder width={20} height={20} borderRadius={10} sharedShimmerValue={sharedShimmer} />
            </View>
            <View style={styles.bookmarkContent}>
              <ShimmerPlaceholder width={160} height={16} borderRadius={8} style={{ marginBottom: 8 }} sharedShimmerValue={sharedShimmer} />
              <ShimmerPlaceholder width="100%" height={16} borderRadius={8} style={{ marginBottom: 4 }} sharedShimmerValue={sharedShimmer} />
              <ShimmerPlaceholder width="90%" height={16} borderRadius={8} style={{ marginBottom: 4 }} sharedShimmerValue={sharedShimmer} />
              <ShimmerPlaceholder width="80%" height={16} borderRadius={8} sharedShimmerValue={sharedShimmer} />
            </View>
            <View style={styles.bookmarkFooter}>
              <ShimmerPlaceholder width={80} height={14} borderRadius={7} sharedShimmerValue={sharedShimmer} />
              <ShimmerPlaceholder width={100} height={28} borderRadius={14} sharedShimmerValue={sharedShimmer} />
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  profileInfo: {
    alignItems: 'center',
    padding: Spacing.lg,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  postItem: {
    marginRight: 2,
    marginBottom: 2,
  },
  eventsContainer: {
    padding: Spacing.lg,
  },
  eventFilterTabs: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  eventsGrid: {
    gap: Spacing.md,
  },
  eventItem: {
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  eventContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookmarksContainer: {
    padding: Spacing.lg,
  },
  bookmarkFilterTabs: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  bookmarksList: {
    gap: Spacing.md,
  },
  bookmarkItem: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  bookmarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  bookmarkContent: {
    marginBottom: Spacing.sm,
  },
  bookmarkFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
