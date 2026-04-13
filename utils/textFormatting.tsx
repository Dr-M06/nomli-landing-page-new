import React from 'react';
import { Text, TouchableOpacity, TextStyle } from 'react-native';

/**
 * Parse text and render with styled hashtags (TikTok/Instagram style)
 * @param text - The text content to parse
 * @param baseStyle - Base text style
 * @param hashtagStyle - Style for hashtags
 * @param onHashtagPress - Optional callback when hashtag is pressed
 * @returns Array of React elements
 */
export const renderTextWithHashtags = (
  text: string,
  baseStyle: TextStyle | TextStyle[],
  hashtagStyle: TextStyle | TextStyle[],
  onHashtagPress?: (hashtag: string) => void
): React.ReactNode => {
  if (!text) return null;

  // Regex to match hashtags: # followed by word characters
  const hashtagRegex = /(#[\w]+)/g;
  const parts = text.split(hashtagRegex);

  return parts.map((part, index) => {
    if (part.match(hashtagRegex)) {
      // This is a hashtag
      return onHashtagPress ? (
        <TouchableOpacity
          key={index}
          onPress={() => onHashtagPress(part)}
          activeOpacity={0.7}
        >
          <Text style={[baseStyle, hashtagStyle]}>{part}</Text>
        </TouchableOpacity>
      ) : (
        <Text key={index} style={[baseStyle, hashtagStyle]}>
          {part}
        </Text>
      );
    } else {
      // Regular text
      return <Text key={index} style={baseStyle}>{part}</Text>;
    }
  });
};

/**
 * Extract hashtags from text
 */
export const extractHashtags = (text: string): string[] => {
  const hashtagRegex = /#[\w]+/g;
  const matches = text.match(hashtagRegex);
  return matches ? matches.map(tag => tag.toLowerCase()) : [];
};

/**
 * Extract hashtags and remove them from content
 * Returns object with content without hashtags and array of hashtags (max 4)
 */
export const separateHashtagsFromContent = (text: string): { content: string; hashtags: string[] } => {
  if (!text) return { content: '', hashtags: [] };
  
  const hashtagRegex = /#[\w]+/g;
  const hashtags = text.match(hashtagRegex) || [];
  // Limit to 4 hashtags
  const limitedHashtags = hashtags.slice(0, 4);
  
  // Remove hashtags from content
  const contentWithoutHashtags = text.replace(/#[\w]+/g, '').replace(/\s+/g, ' ').trim();
  
  return {
    content: contentWithoutHashtags,
    hashtags: limitedHashtags
  };
};

/**
 * Render text with both hashtags and URLs styled differently
 */
export const renderTextWithHashtagsAndLinks = (
  text: string,
  baseStyle: TextStyle | TextStyle[],
  hashtagStyle: TextStyle | TextStyle[],
  linkStyle: TextStyle | TextStyle[],
  onHashtagPress?: (hashtag: string) => void,
  onLinkPress?: (url: string) => void
): React.ReactNode => {
  if (!text) return null;

  // Combined regex to match both hashtags and URLs
  const combinedRegex = /(#[\w]+|https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(combinedRegex);

  return parts.map((part, index) => {
    // Check if it's a hashtag
    if (part.match(/^#[\w]+$/)) {
      return onHashtagPress ? (
        <TouchableOpacity
          key={index}
          onPress={() => onHashtagPress(part)}
          activeOpacity={0.7}
        >
          <Text style={[baseStyle, hashtagStyle]}>{part}</Text>
        </TouchableOpacity>
      ) : (
        <Text key={index} style={[baseStyle, hashtagStyle]}>
          {part}
        </Text>
      );
    }
    
    // Check if it's a URL
    if (part.match(/^(https?:\/\/|www\.)/)) {
      return onLinkPress ? (
        <TouchableOpacity
          key={index}
          onPress={() => onLinkPress(part)}
          activeOpacity={0.7}
        >
          <Text style={[baseStyle, linkStyle]}>{part}</Text>
        </TouchableOpacity>
      ) : (
        <Text key={index} style={[baseStyle, linkStyle]}>
          {part}
        </Text>
      );
    }
    
    // Regular text
    return <Text key={index} style={baseStyle}>{part}</Text>;
  });
};

