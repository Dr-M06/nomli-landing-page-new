import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity 
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes } from '../constants/Theme';
import PostReactionsList from './PostReactionsList';
import { getReactionCounts } from '../utils/reactionUtils';
import { log, warn, error } from '../utils/productionLogger';
import { Zap } from 'lucide-react-native';


type PostReactionsCounterProps = {
  postId: string;
  initialCounts?: {
    total: number;
    likes: number;
    loves: number;
    laughs: number;
  };
  postOwnerId?: string; // Optional: post owner ID to check if current user is owner
};

const PostReactionsCounter = ({ 
  postId, 
  initialCounts = { total: 0, likes: 0, loves: 0, laughs: 0 },
  postOwnerId
}: PostReactionsCounterProps) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [showReactionsList, setShowReactionsList] = useState(false);
  const [reactionCounts, setReactionCounts] = useState(initialCounts);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    fetchReactionCounts();
  }, [postId]);
  
  // Update counts when initialCounts prop changes (e.g., after a reaction is toggled)
  useEffect(() => {
    if (initialCounts && (initialCounts.total > 0 || initialCounts.likes > 0 || initialCounts.laughs > 0)) {
      setReactionCounts(initialCounts);
      // Also fetch fresh data to ensure we have the latest counts
      fetchReactionCounts(false); // Bypass cache to get fresh data
    }
  }, [initialCounts.total, initialCounts.likes, initialCounts.laughs]);
  
  const fetchReactionCounts = async (useCache: boolean = true) => {
    try {
      setLoading(true);
      
      // Use the new reaction system to get all reaction counts
      const counts = await getReactionCounts(postId, useCache);
      setReactionCounts(counts);
    } catch (error) {
      error('Error in fetchReactionCounts:', error);
      // Fallback to initial counts on error
      if (initialCounts && (initialCounts.total > 0 || initialCounts.likes > 0 || initialCounts.laughs > 0)) {
        setReactionCounts(initialCounts);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // If there are no reactions, don't show anything
  const totalReactions = reactionCounts.total || reactionCounts.likes + reactionCounts.loves + reactionCounts.laughs;
  if (totalReactions === 0) {
    return null;
  }
  
  // Show reaction icons based on what reactions exist
  const hasLikes = reactionCounts.likes > 0;
  const hasLaughs = reactionCounts.laughs > 0;
  
  return (
    <>
            <TouchableOpacity
        style={[styles.container, { backgroundColor: themeColors.neutral.backgroundAlt }]} 
        onPress={() => setShowReactionsList(true)}
        disabled={loading}
      >
        <View style={styles.reactionsIconsContainer}>
          {hasLikes && (
          <View style={[styles.reactionIcon, { backgroundColor: '#F63A4D' }]}>
            <Zap size={11} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
          </View>
          )}
          {hasLaughs && (
            <View style={[styles.reactionIcon, { backgroundColor: '#FFD700', marginLeft: hasLikes ? -4 : 0 }]}>
              <Text style={{ fontSize: 10 }}>😂</Text>
            </View>
          )}
        </View>
        
        <Text style={[styles.count, { color: themeColors.neutral.textSecondary }]}>
          {loading ? '...' : totalReactions}
        </Text>
      </TouchableOpacity>
      
      <PostReactionsList
        visible={showReactionsList}
        onClose={() => setShowReactionsList(false)}
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
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginVertical: 8,
  },
  reactionsIconsContainer: {
    flexDirection: 'row',
    marginRight: 8,
  },
  reactionIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -4,
  },
  count: {
    fontSize: FontSizes.small,
    fontFamily: FontFamily.medium,
    marginLeft: 6,
  },
});

export default PostReactionsCounter; 