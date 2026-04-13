import { useState, useEffect, useCallback } from 'react';
import { 
  followUser, 
  unfollowUser, 
  isFollowing, 
  getUserFollowers, 
  getUserFollowing, 
  getFollowCounts,
  FollowerUser,
  FollowCounts 
} from '../utils/followersServiceSimple';
import useAuth from './useAuth';

export interface UseFollowersReturn {
  // Follow state
  isFollowingUser: boolean;
  followLoading: boolean;
  
  // Follow counts
  followCounts: FollowCounts;
  countsLoading: boolean;
  
  // Followers/following lists
  followers: FollowerUser[];
  following: FollowerUser[];
  listsLoading: boolean;
  
  // Actions
  handleFollow: () => Promise<void>;
  handleUnfollow: () => Promise<void>;
  toggleFollow: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  refreshLists: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

/**
 * Hook for managing followers functionality
 */
export default function useFollowers(userId?: string): UseFollowersReturn {
  const { user } = useAuth();
  
  // State
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followCounts, setFollowCounts] = useState<FollowCounts>({
    followers_count: 0,
    following_count: 0
  });
  const [countsLoading, setCountsLoading] = useState(false);
  const [followers, setFollowers] = useState<FollowerUser[]>([]);
  const [following, setFollowing] = useState<FollowerUser[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  // Check if current user follows the target user
  const checkFollowStatus = useCallback(async () => {
    if (!userId || !user || user.id === userId) return;
    
    try {
      const following = await isFollowing(userId);
      setIsFollowingUser(following);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  }, [userId, user]);

  // Load follow counts
  const refreshCounts = useCallback(async () => {
    if (!userId) return;
    
    try {
      setCountsLoading(true);
      const counts = await getFollowCounts(userId);
      setFollowCounts(counts);
    } catch (error) {
      console.error('Error loading follow counts:', error);
    } finally {
      setCountsLoading(false);
    }
  }, [userId]);

  // Load followers and following lists
  const refreshLists = useCallback(async () => {
    if (!userId) return;
    
    try {
      setListsLoading(true);
      const [followersData, followingData] = await Promise.all([
        getUserFollowers(userId),
        getUserFollowing(userId)
      ]);
      setFollowers(followersData);
      setFollowing(followingData);
    } catch (error) {
      console.error('Error loading followers/following lists:', error);
    } finally {
      setListsLoading(false);
    }
  }, [userId]);

  // Refresh all data
  const refreshAll = useCallback(async () => {
    await Promise.all([
      checkFollowStatus(),
      refreshCounts(),
      refreshLists()
    ]);
  }, [checkFollowStatus, refreshCounts, refreshLists]);

  // Follow user
  const handleFollow = useCallback(async () => {
    if (!userId || followLoading) return;
    
    try {
      setFollowLoading(true);
      
      // Optimistic update
      setIsFollowingUser(true);
      setFollowCounts(prev => ({
        ...prev,
        followers_count: prev.followers_count + 1
      }));
      
      const success = await followUser(userId);
      
      if (!success) {
        // Revert optimistic update
        setIsFollowingUser(false);
        setFollowCounts(prev => ({
          ...prev,
          followers_count: Math.max(prev.followers_count - 1, 0)
        }));
      } else {
        // Refresh data to ensure consistency
        await refreshCounts();
      }
    } catch (error) {
      console.error('Error following user:', error);
      // Revert optimistic update
      setIsFollowingUser(false);
      setFollowCounts(prev => ({
        ...prev,
        followers_count: Math.max(prev.followers_count - 1, 0)
      }));
    } finally {
      setFollowLoading(false);
    }
  }, [userId, followLoading, refreshCounts]);

  // Unfollow user
  const handleUnfollow = useCallback(async () => {
    if (!userId || followLoading) return;
    
    try {
      setFollowLoading(true);
      
      // Optimistic update
      setIsFollowingUser(false);
      setFollowCounts(prev => ({
        ...prev,
        followers_count: Math.max(prev.followers_count - 1, 0)
      }));
      
      const success = await unfollowUser(userId);
      
      if (!success) {
        // Revert optimistic update
        setIsFollowingUser(true);
        setFollowCounts(prev => ({
          ...prev,
          followers_count: prev.followers_count + 1
        }));
      } else {
        // Refresh data to ensure consistency
        await refreshCounts();
      }
    } catch (error) {
      console.error('Error unfollowing user:', error);
      // Revert optimistic update
      setIsFollowingUser(true);
      setFollowCounts(prev => ({
        ...prev,
        followers_count: prev.followers_count + 1
      }));
    } finally {
      setFollowLoading(false);
    }
  }, [userId, followLoading, refreshCounts]);

  // Toggle follow status
  const toggleFollow = useCallback(async () => {
    if (isFollowingUser) {
      await handleUnfollow();
    } else {
      await handleFollow();
    }
  }, [isFollowingUser, handleFollow, handleUnfollow]);

  // Load initial data
  useEffect(() => {
    if (userId) {
      refreshAll();
    }
  }, [userId, refreshAll]);

  return {
    // Follow state
    isFollowingUser,
    followLoading,
    
    // Follow counts
    followCounts,
    countsLoading,
    
    // Followers/following lists
    followers,
    following,
    listsLoading,
    
    // Actions
    handleFollow,
    handleUnfollow,
    toggleFollow,
    refreshCounts,
    refreshLists,
    refreshAll,
  };
}
