import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { Users } from 'lucide-react-native';
import { supabase } from '../utils/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing } from '../constants/Theme';
import PostReactionsList from './PostReactionsList';
import { log, warn, error } from '../utils/productionLogger';


type PostLikesCounterProps = {
  postId: string;
  initialLikesCount: number;
  postOwnerId?: string; // Optional: post owner ID to check if current user is owner
};

const PostLikesCounter = ({ postId, initialLikesCount, postOwnerId }: PostLikesCounterProps) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [showLikesList, setShowLikesList] = useState(false);
  const [likesCount, setLikesCount] = useState(initialLikesCount);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    setLikesCount(initialLikesCount);
  }, [initialLikesCount]);
  
  const fetchLikesCount = async () => {
    try {
      setLoading(true);
      
      // Try post_likes first (for regular posts)
      let { data, error } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', postId);
      
      // If no data from post_likes, try community_post_likes
      if (!data || data.length === 0) {
        const { data: communityLikes, error: communityError } = await supabase
          .from('community_post_likes')
          .select('id')
          .eq('post_id', postId);
        
        if (!communityError && communityLikes) {
          data = communityLikes;
        }
      }
      
      if (!error && data) {
        setLikesCount(data.length);
      }
    } catch (error) {
      error('Error fetching likes count:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Don't show anything if there are no likes
  if (likesCount === 0) {
    return null;
  }
  
  return (
    <>
      <TouchableOpacity
        style={[styles.container, { backgroundColor: themeColors.neutral.backgroundAlt }]}
        onPress={() => setShowLikesList(true)}
        disabled={loading}
      >
        <View style={styles.content}>
          <View style={[styles.usersIcon, { backgroundColor: themeColors.primary.main }]}>
            <Users size={9} color="white" />
          </View>
          
          {loading ? (
            <ActivityIndicator size="small" color={themeColors.neutral.textSecondary} />
          ) : (
            <Text style={[styles.count, { color: themeColors.neutral.textSecondary }]}>
              {likesCount > 999 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      
      <PostReactionsList
        visible={showLikesList}
        onClose={() => setShowLikesList(false)}
        postId={postId}
        postOwnerId={postOwnerId}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 12,
    marginLeft: Spacing.sm, // Add left margin to space from like button
    alignSelf: 'center', // Center align to match other buttons
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usersIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  count: {
    fontSize: FontSizes.xs, // Smaller to match other action text
    fontFamily: FontFamily.medium,
    lineHeight: 16,
  },
});

export default PostLikesCounter;