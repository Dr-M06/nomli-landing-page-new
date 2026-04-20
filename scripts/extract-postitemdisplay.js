#!/usr/bin/env node
/**
 * Script to extract PostItemDisplay component from community.tsx
 * This extracts lines 382-2492 (component + interface + helper function)
 */

const fs = require('fs');
const path = require('path');

const COMMUNITY_FILE = path.join(__dirname, '../app/(tabs)/community.tsx');
const OUTPUT_FILE = path.join(__dirname, '../components/PostItemDisplay.tsx');

// Read the community file
const content = fs.readFileSync(COMMUNITY_FILE, 'utf8');
const lines = content.split('\n');

// Extract component (lines 382-2492, 0-indexed: 381-2491)
const componentLines = lines.slice(381, 2492);
const componentCode = componentLines.join('\n');

// Extract imports from original file (first 170 lines)
const importLines = lines.slice(0, 170);
const imports = importLines.join('\n');

// Filter imports to only what PostItemDisplay needs
// PostItemDisplay needs these specific imports
const neededImports = `
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Dimensions,
  Animated,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import ReanimatedAnimated from 'react-native-reanimated';
const { ScrollView: AnimatedScrollView } = ReanimatedAnimated;
import {
  Heart,
  MessageSquare,
  Bookmark,
  Share2,
  Send,
  MoreVertical,
  Pin,
  Store,
  Lock,
  ChevronUp,
  ChevronDown,
} from 'lucide-react-native';
import { Video, ResizeMode } from 'expo-av';
import { BorderRadius, FontFamily, FontSizes, Spacing, Shadow } from '../constants/Theme';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { Post, Comment } from '../utils/communityUtils';
import { formatTimeAgo } from '../utils/formatters';
import { getSafeDisplayName, sanitizeUsernameForDisplay, stripAtSymbol } from '../utils/contentFilter';
import { OFFICIAL_ACCOUNT_EMAIL } from '../constants/ContactEmails';
import SimpleAvatar from './SimpleAvatar';
import OptimizedImage from './OptimizedImage';
import { PollPostCard } from './PollPostCard';
import { QuestionPostCard } from './QuestionPostCard';
import PostReactionsList from './PostReactionsList';
import ReactionPicker, { ReactionType as PickerReactionType } from './ReactionPicker';
import { toggleReaction, getUserReaction, getReactionCounts } from '../utils/reactionUtils';
import { useDoubleTap } from '../hooks/useDoubleTap';
import DoubleTapHeart from './DoubleTapHeart';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
`;

// Create the new file content
const newFileContent = `${neededImports}

// Helper function to validate image URLs
const isValidImageUrl = (url?: string) => {
  if (!url) return false;
  
  // Check for common invalid URLs
  if (url.startsWith('file:///data/user/0/com.nomli.mingle/cache/')) {
    console.log('[PostItemDisplay] Skipping cached image that might be invalid:', url);
    return false;
  }
  
  // Accept URLs from Supabase storage
  if (url.includes('supabase.co/storage/v1/object/public/post-images/') || 
      url.includes('supabase.co/storage/v1/object/public/avatars/')) {
    return true;
  }
  
  // Require http(s) for remote images
  return url.startsWith('http://') || url.startsWith('https://');
};

${componentCode}

export default PostItemDisplay;
`;

// Write the new file
fs.writeFileSync(OUTPUT_FILE, newFileContent, 'utf8');
console.log(`✅ Extracted PostItemDisplay to ${OUTPUT_FILE}`);
console.log(`   Component size: ${componentLines.length} lines`);
