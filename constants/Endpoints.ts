import Constants from 'expo-constants';

// Get environment variables with proper fallbacks
export const SUPABASE_URL = 
  process.env.EXPO_PUBLIC_SUPABASE_URL || 
  Constants?.expoConfig?.extra?.SUPABASE_URL || 
  '';

export const SUPABASE_ANON_KEY = 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
  Constants?.expoConfig?.extra?.SUPABASE_ANON_KEY || 
  '';

// Firebase configuration removed - app uses Supabase

// Common endpoints
export const ENDPOINTS = {
  // User related
  USERS: 'users',
  PROFILES: 'profiles',
  
  // Social related
  EVENTS: 'events',
  EVENTS_PARTICIPANTS: 'events_participants',
  CHATS: 'chats',
  MESSAGES: 'messages',
  
  // Location related
  LOCATIONS: 'locations',
  
  // Interest related
  INTERESTS: 'interests',
  USER_INTERESTS: 'user_interests',
  
  // Live streaming
  LIVE_BOOTSTRAP: 'live-bootstrap', // Supabase Edge Function
};

// Location constants
export const SEARCH_RADIUS_KM = 25; // Default search radius for nearby users in kilometers