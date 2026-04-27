/**
 * Placeholder Profile Data - Complete profile info for placeholder users
 */

import { generatePlaceholderStories } from './placeholderData';

export interface PlaceholderProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  email: string;
  bio?: string;
  location?: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  is_verified: boolean;
  profile_visible: boolean;
  allows_dms: boolean;
  interests?: string[];
  created_at: string;
  isPlaceholder: true;
}

/**
 * Generate complete placeholder profile data
 */
export const generatePlaceholderProfile = (userId: string): PlaceholderProfile | null => {
  // Extract index from userId (e.g., "placeholder-user-0" -> 0)
  const match = userId.match(/placeholder-user-(\d+)/);
  if (!match) return null;
  
  const index = parseInt(match[1], 10);
  
  const usernames = [
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
  
  const displayNames = [
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
  
  const bios = [
    'Building, creating, and sharing real moments.',
    'Good energy, good people, and growth mindset.',
    'Tech, food, and community events.',
    'Art, ideas, and everyday inspiration.',
    'Fitness, nature, and healthy routines.',
    'Books, creativity, and calm weekends.',
    'Music, stories, and positive vibes.',
    'Style, travel, and culture.',
    'Code, games, and coffee runs.',
    'Exploring cities, food spots, and new hobbies.',
  ];
  
  const locations = [
    'New York, USA',
    'London, UK',
    'Tokyo, Japan',
    'Paris, France',
    'Sydney, Australia',
    'Toronto, Canada',
    'Berlin, Germany',
    'Barcelona, Spain',
    'Dubai, UAE',
    'Singapore',
  ];
  
  const profilePhotoUrls = [
    'https://randomuser.me/api/portraits/men/32.jpg',
    'https://randomuser.me/api/portraits/women/44.jpg',
    'https://randomuser.me/api/portraits/men/75.jpg',
    'https://randomuser.me/api/portraits/women/68.jpg',
    'https://randomuser.me/api/portraits/men/22.jpg',
    'https://randomuser.me/api/portraits/women/17.jpg',
    'https://randomuser.me/api/portraits/men/45.jpg',
    'https://randomuser.me/api/portraits/women/63.jpg',
    'https://randomuser.me/api/portraits/men/86.jpg',
    'https://randomuser.me/api/portraits/women/91.jpg',
  ];
  
  const username = usernames[index % usernames.length];
  const displayName = displayNames[index % displayNames.length];
  const avatarUrl = profilePhotoUrls[index % profilePhotoUrls.length];
  
  // Realistic follower/following counts - increased for more engagement
  const followersCount = Math.floor(Math.random() * 2000) + 500; // 500-2500 followers
  const followingCount = Math.floor(Math.random() * 500) + 100; // 100-600 following
  const postsCount = Math.floor(Math.random() * 50) + 10; // 10-60 posts
  
  return {
    id: userId,
    username,
    full_name: displayName,
    avatar_url: avatarUrl,
    email: `${username}@example.com`,
    bio: bios[index % bios.length],
    location: locations[index % locations.length],
    followers_count: followersCount,
    following_count: followingCount,
    posts_count: postsCount,
    is_verified: Math.random() < 0.2, // 20% verified
    profile_visible: true,
    allows_dms: false, // Lock DMs for placeholder users
    allow_dms: false, // Also set this field (some code uses different field name)
    interests: ['Travel', 'Photography', 'Food'],
    created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(), // Random date within last year
    isPlaceholder: true,
  };
};

