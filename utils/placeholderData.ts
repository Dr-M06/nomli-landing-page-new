/**
 * Realistic Placeholder Data - Looks like real users
 * These placeholders stay visible and mix with real data seamlessly
 */

export interface PlaceholderStory {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  photoUrl?: string; // Story photo
  caption?: string; // Story caption/title
  theme?: string; // Story theme (puppies, kittens, nature, etc.)
  isPlaceholder: true;
}

export interface PlaceholderComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  username: string;
  display_name: string;
  user_avatar?: string;
}

export interface PlaceholderPost {
  id: string;
  user_id: string;
  user_email: string;
  username: string;
  display_name: string;
  user_avatar_url: string;
  content: string;
  image_url?: string; // Single image URL
  image_urls?: string[]; // Array of image URLs (for posts)
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  liked_by_user: boolean;
  liked: boolean;
  bookmarked: boolean;
  isBookmarked: boolean;
  profile: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
  // Social proof - who liked/commented
  liked_by_username?: string; // "Liked by sarah_jones and 24 others"
  recent_comments?: PlaceholderComment[];
  isPlaceholder: true;
  /** True when post uses only bundled/local assets (offline-safe, no network). */
  isBundledOffline?: true;
}

// Realistic usernames that look authentic
const PLACEHOLDER_USERNAMES = [
  'alexmartinez',
  'sarahjones',
  'mikechen',
  'emilywilson',
  'jamestaylor',
  'lisabrown',
  'davidlee',
  'amandagarcia',
  'chrisanderson',
  'jessicamoore',
];

// Realistic display names
const PLACEHOLDER_DISPLAY_NAMES = [
  'Alex Martinez',
  'Sarah Jones',
  'Mike Chen',
  'Emily Wilson',
  'James Taylor',
  'Lisa Brown',
  'David Lee',
  'Amanda Garcia',
  'Chris Anderson',
  'Jessica Moore',
];

// Realistic post content snippets
const PLACEHOLDER_POST_CONTENT = [
  'Just finished an amazing workout! 💪',
  'Beautiful sunset today 🌅',
  'Coffee and coding ☕️',
  'Weekend vibes ✨',
  'New project coming soon 🚀',
  'Love this weather! ☀️',
  'Productive day today 📚',
  'Feeling grateful 🙏',
  'Can\'t wait for the weekend! 🎉',
  'Life is good 😊',
];

// Theme-specific comment pools for contextual comments
const THEME_COMMENTS: Record<string, string[]> = {
  'fitness': [
    'That workout looks intense! 💪',
    'Goals! Need to try this routine',
    'You\'re killing it! 🔥',
    'What gym do you go to?',
    'This is motivating! 💪',
    'How long did this take?',
    'Inspiring! Keep it up!',
    'Need this energy! ⚡',
    'Workout goals! 💯',
    'This is the motivation I needed!',
  ],
  'sunset': [
    'Beautiful sunset! 🌅',
    'This is stunning! 😍',
    'Where was this taken?',
    'Sunset vibes! ✨',
    'So peaceful! 🌅',
    'Perfect timing!',
    'This made my day!',
    'Nature is beautiful!',
    'Amazing colors! 🌈',
    'This is goals!',
  ],
  'coffee': [
    'Coffee goals! ☕',
    'That looks delicious!',
    'Where\'s this from?',
    'Need this right now! ☕',
    'Coffee and coding vibes!',
    'Perfect morning!',
    'This is the energy!',
    'Coffee addiction is real! 😂',
    'Looks amazing!',
    'Coffee break goals!',
  ],
  'lifestyle': [
    'Weekend vibes! ✨',
    'This is the energy!',
    'Love this! ❤️',
    'Goals! 🙌',
    'So good!',
    'This made my day!',
    'Can\'t wait for the weekend!',
    'Life is good! 😊',
    'This is everything!',
    'Perfect vibes!',
  ],
  'tech': [
    'Tech setup is clean! 💻',
    'What laptop is that?',
    'Coding vibes! 🚀',
    'This is goals!',
    'Love the setup!',
    'What are you building?',
    'Tech enthusiast here!',
    'Clean workspace!',
    'This is inspiring!',
    'Need this setup!',
  ],
  'nature': [
    'Beautiful weather! ☀️',
    'Nature is healing! 🌲',
    'Perfect day!',
    'This is peaceful!',
    'Love this weather!',
    'So beautiful!',
    'Nature vibes! 🌿',
    'This made my day!',
    'Perfect timing!',
    'Beautiful! 😍',
  ],
  'study': [
    'Study motivation! 📚',
    'Productive vibes!',
    'This is inspiring!',
    'What are you studying?',
    'Study goals!',
    'Love the setup!',
    'This is motivating!',
    'Productive day!',
    'Study mode! 📖',
    'This is goals!',
  ],
  'wellness': [
    'Grateful for this! 🙏',
    'This is beautiful!',
    'So inspiring!',
    'Gratitude vibes!',
    'This made my day!',
    'Love this energy!',
    'So peaceful!',
    'This is healing!',
    'Beautiful message!',
    'Grateful! 🙏',
  ],
};

// External URL arrays removed - now using local SVG placeholders for reliability

// Use local bundled assets for instant placeholder images
// Pre-resolve asset URIs at module load time for instant access
let defaultAvatarUri: string | null = null;
let splashImageUri: string | null = null;
let iconImageUri: string | null = null;

// Resolve local assets once when module loads (skip on web - use SVG fallbacks)
try {
  const { Platform } = require('react-native');
  
  // On web, skip asset resolution and use SVG fallbacks directly
  if (Platform.OS === 'web') {
    // Web doesn't support require() for images the same way, use SVG fallbacks
    defaultAvatarUri = null;
    splashImageUri = null;
    iconImageUri = null;
  } else {
    // Native platforms: try to resolve assets
    const { Image } = require('react-native');
    
    // Resolve default avatar
    try {
      const defaultAvatar = require('../assets/images/default-avatar.png');
      const resolved = Image.resolveAssetSource(defaultAvatar);
      defaultAvatarUri = resolved?.uri || null;
    } catch (e) {
      // Silently fail - will use SVG fallback
    }
    
    // Resolve splash image
    try {
      const splash = require('../assets/images/splash.png');
      const resolved = Image.resolveAssetSource(splash);
      splashImageUri = resolved?.uri || null;
    } catch (e) {
      // Silently fail - will use SVG fallback
    }
    
    // Resolve icon
    try {
      const icon = require('../assets/images/icon.png');
      const resolved = Image.resolveAssetSource(icon);
      iconImageUri = resolved?.uri || null;
    } catch (e) {
      // Silently fail - will use SVG fallback
    }
  }
} catch (error) {
  // Silently fail - will use SVG fallbacks
}

// Get local asset URI (returns pre-resolved URI or fallback)
const getLocalAssetUri = (type: 'avatar' | 'post' | 'story', index: number = 0): string => {
  if (type === 'avatar') {
    return defaultAvatarUri || generateInstantPlaceholderImage(200, 200, index);
  } else if (type === 'post') {
    // Cycle through available assets for variety
    const assets = [splashImageUri, iconImageUri, defaultAvatarUri].filter(Boolean);
    if (assets.length > 0) {
      return assets[index % assets.length] || generateInstantPlaceholderImage(1080, 1080, index);
    }
    return generateInstantPlaceholderImage(1080, 1080, index);
  } else { // story
    return splashImageUri || generateInstantPlaceholderImage(1080, 1920, index);
  }
};

// Generate instant placeholder image using data URI (fallback only)
const generateInstantPlaceholderImage = (width: number, height: number, seed: number): string => {
  // Generate consistent colors based on seed
  const colors = [
    ['#667eea', '#764ba2'], // Purple gradient
    ['#f093fb', '#f5576c'], // Pink gradient
    ['#4facfe', '#00f2fe'], // Blue gradient
    ['#43e97b', '#38f9d7'], // Green gradient
    ['#fa709a', '#fee140'], // Pink-yellow gradient
    ['#30cfd0', '#330867'], // Cyan-purple gradient
    ['#a8edea', '#fed6e3'], // Light blue-pink
    ['#ff9a9e', '#fecfef'], // Pink gradient
    ['#ffecd2', '#fcb69f'], // Orange gradient
    ['#ff8a80', '#ea6100'], // Red-orange gradient
  ];
  const colorPair = colors[seed % colors.length];
  
  // Create SVG gradient placeholder (instant, no network)
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad${seed}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${colorPair[0]};stop-opacity:1" /><stop offset="100%" style="stop-color:${colorPair[1]};stop-opacity:1" /></linearGradient></defs><rect width="100%" height="100%" fill="url(#grad${seed})" /></svg>`;
  
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// Get profile photo URL - use local SVG avatar fallbacks for reliability
const getPlaceholderAvatarUrl = (index: number): string => {
  // Use pre-resolved local avatar if available, otherwise SVG fallback
  if (defaultAvatarUri) {
    return defaultAvatarUri;
  }
  // Generate unique avatar SVG based on index
  return generateAvatarPlaceholder(index);
};

// Generate avatar placeholder with initials
const generateAvatarPlaceholder = (index: number): string => {
  const colors = [
    '#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a',
    '#30cfd0', '#a8edea', '#ff9a9e', '#ffecd2', '#ff8a80',
  ];
  const color = colors[index % colors.length];
  const initial = PLACEHOLDER_DISPLAY_NAMES[index % PLACEHOLDER_DISPLAY_NAMES.length].charAt(0);
  
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="80" fill="white" text-anchor="middle" dy="0.35em">${initial}</text></svg>`;
  
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// Map post content to themes for matching images
const getPostTheme = (content: string): string => {
  const contentLower = content.toLowerCase();
  if (contentLower.includes('workout') || contentLower.includes('💪') || contentLower.includes('gym')) {
    return 'fitness';
  }
  // Check for sunset first (before ocean/beach)
  if (contentLower.includes('sunset') || contentLower.includes('🌅')) {
    return 'sunset';
  }
  if (contentLower.includes('coffee') || contentLower.includes('☕')) {
    return 'coffee';
  }
  if (contentLower.includes('weekend') || contentLower.includes('🎉') || contentLower.includes('✨')) {
    return 'lifestyle';
  }
  if (contentLower.includes('project') || contentLower.includes('🚀') || contentLower.includes('coding')) {
    return 'tech';
  }
  if (contentLower.includes('weather') || contentLower.includes('☀️')) {
    return 'nature';
  }
  if (contentLower.includes('productive') || contentLower.includes('📚') || contentLower.includes('study')) {
    return 'study';
  }
  if (contentLower.includes('grateful') || contentLower.includes('🙏')) {
    return 'wellness';
  }
  if (contentLower.includes('life') || contentLower.includes('😊')) {
    return 'lifestyle';
  }
  return 'lifestyle'; // Default
};

// Post theme image URLs removed - now using local SVG placeholders for reliability

// Get post photo URL based on content (square format) - use local SVG fallbacks for reliability
const getPlaceholderPostPhotoUrl = (content: string, index: number): string => {
  // Use instant SVG placeholders that never fail (no network required)
  // These gradient placeholders are reliable and load instantly
  return generateInstantPlaceholderImage(1080, 1080, index);
};

// Story themes with appropriate image URLs
const STORY_THEMES = [
  { theme: 'Puppies', caption: 'Adorable puppies 🐶', imageSeed: 'puppies' },
  { theme: 'Kittens', caption: 'Cute kittens 🐱', imageSeed: 'kittens' },
  { theme: 'Nature', caption: 'Beautiful nature 🌲', imageSeed: 'nature' },
  { theme: 'Sunset', caption: 'Stunning sunset 🌅', imageSeed: 'sunset' },
  { theme: 'Ocean', caption: 'Ocean vibes 🌊', imageSeed: 'ocean' },
  { theme: 'Mountains', caption: 'Mountain views ⛰️', imageSeed: 'mountains' },
  { theme: 'Flowers', caption: 'Beautiful flowers 🌸', imageSeed: 'flowers' },
  { theme: 'City', caption: 'City lights 🌃', imageSeed: 'city' },
  { theme: 'Beach', caption: 'Beach day 🏖️', imageSeed: 'beach' },
  { theme: 'Forest', caption: 'Forest walk 🌳', imageSeed: 'forest' },
  { theme: 'Coffee', caption: 'Morning coffee ☕', imageSeed: 'coffee' },
  { theme: 'Food', caption: 'Delicious food 🍕', imageSeed: 'food' },
  { theme: 'Travel', caption: 'Travel adventures ✈️', imageSeed: 'travel' },
  { theme: 'Art', caption: 'Creative art 🎨', imageSeed: 'art' },
  { theme: 'Music', caption: 'Music vibes 🎵', imageSeed: 'music' },
];

// Theme image URLs removed - now using local SVG placeholders for reliability

// Get story photo URL based on theme (portrait format for stories) - use local SVG fallbacks for reliability
const getPlaceholderStoryPhotoUrl = (theme: string, index: number): string => {
  // Use instant SVG placeholders that never fail (no network required)
  // Add theme index offset for variety
  const themeIndex = STORY_THEMES.findIndex(t => t.imageSeed === theme.toLowerCase());
  const seed = themeIndex >= 0 ? themeIndex + index : index;
  return generateInstantPlaceholderImage(1080, 1920, seed);
};


/**
 * Generate realistic placeholder stories with real photos and unique themes
 */
export const generatePlaceholderStories = (count: number = 6): PlaceholderStory[] => {
  return Array.from({ length: count }, (_, index) => {
    const username = PLACEHOLDER_USERNAMES[index % PLACEHOLDER_USERNAMES.length];
    const displayName = PLACEHOLDER_DISPLAY_NAMES[index % PLACEHOLDER_DISPLAY_NAMES.length];
    const userId = `placeholder-user-${index}`;
    
    // Each user gets a unique theme
    const themeData = STORY_THEMES[index % STORY_THEMES.length];
    
    // All stories have photos with unique themes (more realistic)
    return {
      id: `placeholder-story-${index}`,
      userId,
      username,
      displayName,
      avatarUrl: getPlaceholderAvatarUrl(index), // Real profile photo
      photoUrl: getPlaceholderStoryPhotoUrl(themeData.imageSeed, index), // Real story photo with theme
      caption: themeData.caption, // Story caption/title
      theme: themeData.theme, // Story theme
      isPlaceholder: true,
    };
  });
};

/**
 * Generate fake comments for a post - contextual comments that match post content
 */
const generatePlaceholderComments = (postId: string, count: number, postIndex: number, postContent: string): PlaceholderComment[] => {
  const now = new Date();
  
  // Determine post theme to get contextual comments
  const postTheme = getPostTheme(postContent);
  const themeComments = THEME_COMMENTS[postTheme] || THEME_COMMENTS['lifestyle'];
  
  // Create a unique seed for this post to ensure different comments
  const postIdHash = postId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const commentSeed = (postIndex * 137) + (postIdHash * 17); // Use prime numbers for better distribution
  
  // Track which users have already commented on this post to avoid duplicates
  const usedUserIndices = new Set<number>();
  
  return Array.from({ length: count }, (_, index) => {
    // Ensure each comment is from a different user
    let commentUserIndex: number;
    let attempts = 0;
    do {
      // Use a combination of seed, index, and postIndex to get different users per post
      commentUserIndex = (commentSeed + index * 7 + attempts * 11) % PLACEHOLDER_USERNAMES.length;
      attempts++;
      // Prevent infinite loop
      if (attempts > PLACEHOLDER_USERNAMES.length) {
        commentUserIndex = (index + postIndex + 3) % PLACEHOLDER_USERNAMES.length;
        break;
      }
    } while (usedUserIndices.has(commentUserIndex));
    
    usedUserIndices.add(commentUserIndex);
    const username = PLACEHOLDER_USERNAMES[commentUserIndex];
    const displayName = PLACEHOLDER_DISPLAY_NAMES[commentUserIndex];
    
    // Use theme-specific comments that match the post content
    const contentIndex = (commentSeed + index * 23 + postIndex * 31) % themeComments.length;
    const content = themeComments[contentIndex];
    
    // Comments within last few hours (vary timing per post and comment)
    const baseMinutesAgo = Math.floor(Math.random() * 120) + 5;
    const minutesAgo = baseMinutesAgo + (postIndex * 15) + (index * 5);
    const createdAt = new Date(now.getTime() - minutesAgo * 60 * 1000);
    
    return {
      id: `placeholder-comment-${postId}-${index}`,
      post_id: postId,
      user_id: `placeholder-user-${commentUserIndex}`,
      content,
      created_at: createdAt.toISOString(),
      username,
      display_name: displayName,
      user_avatar: getPlaceholderAvatarUrl(commentUserIndex),
    };
  });
};

/**
 * Generate realistic placeholder posts with real photos
 */
export const generatePlaceholderPosts = (count: number = 3): PlaceholderPost[] => {
  const now = new Date();
  
  return Array.from({ length: count }, (_, index) => {
    const username = PLACEHOLDER_USERNAMES[index % PLACEHOLDER_USERNAMES.length];
    const displayName = PLACEHOLDER_DISPLAY_NAMES[index % PLACEHOLDER_DISPLAY_NAMES.length];
    const userId = `placeholder-user-${index}`;
    const content = PLACEHOLDER_POST_CONTENT[index % PLACEHOLDER_POST_CONTENT.length];
    const avatarUrl = getPlaceholderAvatarUrl(index);
    
    // Set placeholder posts to have old timestamps (days/weeks ago)
    // This ensures they always sort below real posts when sorted by created_at
    // Use a range of 7-30 days ago to make them appear older than most real posts
    const daysAgo = 7 + Math.floor(Math.random() * 23); // 7-30 days ago
    const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    // All posts have photos that match their content (more realistic)
    const photoUrl = getPlaceholderPostPhotoUrl(content, index);
    const postId = `placeholder-post-${index}`;
    
    // Generate likes count and who liked
    const likesCount = Math.floor(Math.random() * 50) + 5; // 5-55 likes
    const likedByIndex = (index + 2) % PLACEHOLDER_USERNAMES.length; // Different user who liked
    const likedByUsername = PLACEHOLDER_USERNAMES[likedByIndex];
    
    // Generate comments count and recent comments
    // Use index to ensure each post has different comment counts
    const commentsCount = Math.floor(Math.random() * 10) + (index % 3); // 0-12 comments, varied per post
    const recentComments = commentsCount > 0 
      ? generatePlaceholderComments(postId, Math.min(commentsCount, 3), index, content) // Pass content for contextual comments
      : [];
    
    return {
      id: postId,
      user_id: userId,
      user_email: `${username}@example.com`,
      username,
      display_name: displayName,
      user_avatar_url: avatarUrl, // Real profile photo
      content,
      image_url: photoUrl, // Real post photo
      image_urls: [photoUrl], // Array format for posts
      likes_count: likesCount,
      comments_count: commentsCount,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      liked_by_user: false, // Current user hasn't liked placeholder posts
      liked: false,
      bookmarked: false,
      isBookmarked: false,
      comments_disabled: true, // Lock comments for placeholder posts
      // Profile object (for fallback avatar)
      profile: {
        id: userId,
        username,
        full_name: displayName,
        avatar_url: avatarUrl,
      },
      // Social proof
      liked_by_username: likedByUsername, // "Liked by sarah_jones and 24 others"
      recent_comments: recentComments,
      isPlaceholder: true,
    };
  });
};

/**
 * Mix placeholder and real stories seamlessly
 * Real stories and live streams are prioritized - placeholders only show after real content
 */
export const mixStoriesWithPlaceholders = (
  realStories: any[],
  placeholderStories: PlaceholderStory[]
): any[] => {
  // Prioritize real stories first, then show placeholders after
  // This ensures real content is always visible before placeholders
  
  // Filter out any real stories that might conflict with placeholders
  const filteredRealStories = realStories.filter(
    real => !placeholderStories.some(placeholder => placeholder.userId === real.user_id)
  );
  
  // Combine: REAL STORIES FIRST, then placeholders (opposite of before)
  return [
    ...filteredRealStories, // Real stories come first
    ...placeholderStories.map(p => ({
      ...p,
      user_id: p.userId,
      avatar_url: p.avatarUrl,
      media_url: p.photoUrl || p.avatarUrl, // Use story photo
      media_type: 'photo' as 'photo' | 'video',
      caption: p.caption, // Include story caption/title
      viewed: false, // Placeholders always show as unviewed
      created_at: new Date().toISOString(), // Current time
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      views_count: 0,
      is_public: true,
      isPlaceholder: true, // Mark as placeholder for sorting
    })),
  ];
};

/**
 * Mix placeholder and real posts seamlessly
 * Real content appears at the top, placeholders stay at the bottom
 */
export const mixPostsWithPlaceholders = (
  realPosts: any[],
  placeholderPosts: PlaceholderPost[]
): any[] => {
  // Filter out any real posts that might conflict with placeholders
  const filteredRealPosts = realPosts.filter(
    real => !placeholderPosts.some(placeholder => placeholder.id === real.id)
  );
  
  // Combine: real posts first (at the top), then placeholders (at the bottom)
  // This ensures real content is prioritized and visible immediately
  // Placeholders remain at the bottom as a visual indicator
  return [
    ...filteredRealPosts,
    ...placeholderPosts,
  ];
};

/**
 * Bundled offline posts – use only local/bundled assets (no network).
 * For offline mode and new users with no cache. Safe to show when feed would otherwise be empty.
 */
export const getBundledOfflinePosts = (count: number = 5): PlaceholderPost[] => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const username = PLACEHOLDER_USERNAMES[index % PLACEHOLDER_USERNAMES.length];
    const displayName = PLACEHOLDER_DISPLAY_NAMES[index % PLACEHOLDER_DISPLAY_NAMES.length];
    const userId = `bundled-offline-${index}`;
    const content = PLACEHOLDER_POST_CONTENT[index % PLACEHOLDER_POST_CONTENT.length];
    const avatarUri = getLocalAssetUri('avatar', index);
    const postImageUri = getLocalAssetUri('post', index);
    const postId = `bundled-offline-post-${index}`;
    const daysAgo = 3 + (index % 14);
    const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const likesCount = 5 + (index * 7) % 40;
    const likedByIndex = (index + 2) % PLACEHOLDER_USERNAMES.length;
    const likedByUsername = PLACEHOLDER_USERNAMES[likedByIndex];
    const commentsCount = index % 4;
    const theme = getPostTheme(content);
    const themeComments = THEME_COMMENTS[theme] || THEME_COMMENTS['lifestyle'];
    const recentComments: PlaceholderComment[] = commentsCount > 0
      ? Array.from({ length: Math.min(commentsCount, 2) }, (_, ci) => ({
          id: `bundled-comment-${postId}-${ci}`,
          post_id: postId,
          user_id: `bundled-offline-${(index + ci + 1) % 5}`,
          content: themeComments[ci % themeComments.length],
          created_at: new Date(now.getTime() - (ci + 1) * 60 * 60 * 1000).toISOString(),
          username: PLACEHOLDER_USERNAMES[(index + ci + 1) % PLACEHOLDER_USERNAMES.length],
          display_name: PLACEHOLDER_DISPLAY_NAMES[(index + ci + 1) % PLACEHOLDER_DISPLAY_NAMES.length],
          user_avatar: getLocalAssetUri('avatar', (index + ci + 1) % 5),
        }))
      : [];
    return {
      id: postId,
      user_id: userId,
      user_email: `${username}@example.com`,
      username,
      display_name: displayName,
      user_avatar_url: avatarUri,
      content,
      image_url: postImageUri,
      image_urls: [postImageUri],
      likes_count: likesCount,
      comments_count: commentsCount,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
      liked_by_user: false,
      liked: false,
      bookmarked: false,
      isBookmarked: false,
      comments_disabled: true,
      profile: { id: userId, username, full_name: displayName, avatar_url: avatarUri },
      liked_by_username: likedByUsername,
      recent_comments: recentComments,
      isPlaceholder: true,
      isBundledOffline: true,
    };
  });
};

