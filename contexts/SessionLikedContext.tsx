/**
 * Session-level cache of post IDs the current user has liked.
 * Used so that when the user likes a video on the Videos tab, the Community tab
 * shows the red heart without waiting for a refetch (and vice versa).
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type SessionLikedContextValue = {
  /** Post IDs the current user has liked this session (from any tab). */
  likedPostIds: string[];
  addLiked: (postId: string) => void;
  removeLiked: (postId: string) => void;
  isLiked: (postId: string) => boolean;
};

const SessionLikedContext = createContext<SessionLikedContextValue | null>(null);

export function SessionLikedProvider({ children }: { children: React.ReactNode }) {
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());

  const addLiked = useCallback((postId: string) => {
    setLikedSet(prev => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });
  }, []);

  const removeLiked = useCallback((postId: string) => {
    setLikedSet(prev => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });
  }, []);

  const isLiked = useCallback((postId: string) => likedSet.has(postId), [likedSet]);

  const likedPostIds = useMemo(() => Array.from(likedSet), [likedSet]);

  const value = useMemo(
    () => ({ likedPostIds, addLiked, removeLiked, isLiked }),
    [likedPostIds, addLiked, removeLiked, isLiked]
  );

  return (
    <SessionLikedContext.Provider value={value}>
      {children}
    </SessionLikedContext.Provider>
  );
}

export function useSessionLiked(): SessionLikedContextValue {
  const ctx = useContext(SessionLikedContext);
  if (!ctx) {
    return {
      likedPostIds: [],
      addLiked: () => {},
      removeLiked: () => {},
      isLiked: () => false,
    };
  }
  return ctx;
}
