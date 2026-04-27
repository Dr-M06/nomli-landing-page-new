/**
 * Post Data Normalization Utilities
 * 
 * Handles post data normalization for edge cases and ensures consistent format.
 * Note: Lite mode has been disabled - all users now use normal mode.
 * These utilities still handle data normalization for consistency.
 */

import { Post } from './communityUtils';

/**
 * Check if we're in lite mode based on response headers
 * Note: Lite mode is disabled - this always returns false
 */
export function isLiteMode(response?: Response): boolean {
  // Lite mode is disabled - always return false
  return false;
}

/**
 * Normalize post data to standard format
 * Handles edge cases and ensures consistent field names
 */
export function normalizeLitePost(item: any): Post {
  // If already in standard format, return as-is
  if (item.content && item.username && !item.u) {
    return item as Post;
  }

  // Normalize from lite format
  const normalized: Post = {
    id: item.id,
    user_id: item.user_id || item.userId,
    content: item.content || item.t || item.text || '',
    created_at: item.created_at || item.createdAt,
    updated_at: item.updated_at || item.updatedAt,
    likes_count: item.likes_count || item.lc || 0,
    comments_count: item.comments_count || item.cc || 0,
    views_count: item.views_count || item.vc || 0,
    liked_by_user: item.liked_by_user !== undefined ? item.liked_by_user : (item.l !== undefined ? item.l : false),
    liked: item.liked !== undefined ? item.liked : (item.l !== undefined ? item.l : false),
    bookmarked: item.bookmarked !== undefined ? item.bookmarked : (item.b !== undefined ? item.b : false),
    isBookmarked: item.isBookmarked !== undefined ? item.isBookmarked : (item.b !== undefined ? item.b : false),
    username: item.username || item.u || 'User',
    display_name: item.display_name || item.dn || item.username || item.u,
    user_avatar_url: item.user_avatar_url || item.pp || null,
    // Handle null images/videos gracefully
    image_url: item.image_url || null,
    image_urls: item.image_urls || (item.i ? [item.i] : []),
    video_url: item.video_url || (item.v || null),
  };

  // Clean up empty arrays
  if (normalized.image_urls && normalized.image_urls.length === 0) {
    normalized.image_urls = undefined;
  }

  // If image_urls has null values, filter them out
  if (normalized.image_urls) {
    normalized.image_urls = normalized.image_urls.filter((url: any) => url && url !== null);
    if (normalized.image_urls.length === 0) {
      normalized.image_urls = undefined;
    }
  }

  return normalized;
}

/**
 * Check if post has media (images or videos)
 */
export function hasMedia(post: Post): boolean {
  if (!post) return false;
  
  const hasImages = post.image_urls && post.image_urls.length > 0 && 
    post.image_urls.some(url => url && url !== null);
  const hasVideo = post.video_url && post.video_url !== null;
  
  return hasImages || hasVideo;
}

/**
 * Get safe image URL (returns null if invalid)
 */
export function getSafeImageUrl(post: Post, index: number = 0): string | null {
  if (!post) return null;
  if (post.image_urls && post.image_urls.length > index) {
    const url = post.image_urls[index];
    if (url && url !== null && typeof url === 'string') {
      return url;
    }
  }
  
  if (post.image_url && post.image_url !== null) {
    return post.image_url;
  }
  
  return null;
}

/**
 * Get safe video URL (returns null if invalid)
 */
export function getSafeVideoUrl(post: Post): string | null {
  if (!post) return null;
  
  if (post.video_url && post.video_url !== null && typeof post.video_url === 'string') {
    return post.video_url;
  }
  
  return null;
}

/**
 * Normalize array of posts to ensure consistent format
 */
export function normalizeLitePosts(posts: any[]): Post[] {
  if (!Array.isArray(posts)) return [];
  
  return posts.map(normalizeLitePost);
}
