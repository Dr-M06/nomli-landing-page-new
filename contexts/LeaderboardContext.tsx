import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getDailyLeaderboardOptimized, DailyUserStats } from '../utils/dailyScoreboard';

interface LeaderboardContextType {
  leaderboardUsers: Set<string>; // Set of user IDs on the leaderboard
  leaderboardRanks: Map<string, number>; // Map of user_id -> rank (1-5)
  isLoading: boolean;
  refreshLeaderboard: () => Promise<void>;
}

const LeaderboardContext = createContext<LeaderboardContextType | undefined>(undefined);

export const LeaderboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [leaderboardUsers, setLeaderboardUsers] = useState<Set<string>>(new Set());
  const [leaderboardRanks, setLeaderboardRanks] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshDate, setLastRefreshDate] = useState<string>('');

  const refreshLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      const leaderboard = await getDailyLeaderboardOptimized(5); // Top 5 only
      
      const userIds = new Set<string>();
      const ranks = new Map<string, number>();
      
      leaderboard.forEach((user: DailyUserStats) => {
        if (user.user_id) {
          userIds.add(user.user_id);
          if (user.rank) {
            ranks.set(user.user_id, user.rank);
          }
        }
      });
      
      setLeaderboardUsers(userIds);
      setLeaderboardRanks(ranks);
      
      // Store today's date to detect midnight reset
      const today = new Date().toISOString().split('T')[0];
      setLastRefreshDate(today);
      
      console.log(`[LeaderboardContext] ✅ Loaded ${userIds.size} leaderboard users`);
    } catch (error) {
      console.error('[LeaderboardContext] Error refreshing leaderboard:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  // Auto-refresh at midnight UTC (daily reset)
  useEffect(() => {
    const checkAndRefresh = () => {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      // If date changed, refresh leaderboard (midnight UTC passed)
      if (lastRefreshDate && lastRefreshDate !== today) {
        console.log('[LeaderboardContext] 🕛 Midnight UTC detected - refreshing leaderboard');
        refreshLeaderboard();
      }
    };

    // Check every minute
    const interval = setInterval(checkAndRefresh, 60000);
    
    // Also check on mount
    checkAndRefresh();

    return () => clearInterval(interval);
  }, [lastRefreshDate, refreshLeaderboard]);

  // Refresh when app comes to foreground (in case user was away during midnight UTC)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const today = new Date().toISOString().split('T')[0];
        if (lastRefreshDate && lastRefreshDate !== today) {
          console.log('[LeaderboardContext] 🕛 App resumed - date changed, refreshing leaderboard');
          refreshLeaderboard();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [lastRefreshDate, refreshLeaderboard]);

  return (
    <LeaderboardContext.Provider
      value={{
        leaderboardUsers,
        leaderboardRanks,
        isLoading,
        refreshLeaderboard,
      }}
    >
      {children}
    </LeaderboardContext.Provider>
  );
};

export const useLeaderboard = () => {
  const context = useContext(LeaderboardContext);
  if (!context) {
    throw new Error('useLeaderboard must be used within LeaderboardProvider');
  }
  return context;
};

// Helper hook to check if a user is on the leaderboard and get their rank
// Safe: returns false if context not available
export const useIsLeaderboardUser = (userId?: string) => {
  const context = useContext(LeaderboardContext);
  
  if (!context || !userId) {
    return { isOnLeaderboard: false, rank: null };
  }
  
  const { leaderboardUsers, leaderboardRanks } = context;
  const isOnLeaderboard = leaderboardUsers.has(userId);
  const rank = isOnLeaderboard ? (leaderboardRanks.get(userId) || null) : null;
  
  return { isOnLeaderboard, rank };
};
