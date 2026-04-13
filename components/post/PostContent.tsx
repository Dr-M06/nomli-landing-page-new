import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';

interface PostContentProps {
  content: string;
  hashtags: string[];
  displayedContent: string;
  needsTruncation: boolean;
  isContentExpanded: boolean;
  isOfficialPost: boolean;
  themeColors: any;
  onToggleExpand: () => void;
}

export const PostContent: React.FC<PostContentProps> = ({
  content,
  hashtags,
  displayedContent,
  needsTruncation,
  isContentExpanded,
  isOfficialPost,
  themeColors,
  onToggleExpand,
}) => {
  if (!content) return null;

  return (
    <View>
      {/* Hashtags above content */}
      {hashtags.length > 0 && (
        <View style={styles.hashtagsRow}>
          {hashtags.map((hashtag, index) => (
            <Text
              key={index}
              style={[
                styles.hashtagText,
                { color: themeColors.primary.main }
              ]}
            >
              {hashtag}{index < hashtags.length - 1 ? ' ' : ''}
            </Text>
          ))}
        </View>
      )}
      <Text style={[
        styles.postContent, 
        { color: themeColors.neutral.text },
        isOfficialPost && styles.officialPostContent
      ]}>
        {displayedContent}
      </Text>
      {needsTruncation && (
        <TouchableOpacity 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggleExpand();
          }}
          style={styles.readMoreButton}
          activeOpacity={0.7}
        >
          <Text style={[styles.readMoreText, { color: themeColors.primary.main }]}>
            {isContentExpanded ? 'Show less' : 'Read more'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  hashtagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  hashtagText: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    letterSpacing: -0.1,
  },
  postContent: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.15,
    opacity: 0.92,
  },
  officialPostContent: {
    fontFamily: FontFamily.medium,
  },
  readMoreButton: {
    marginTop: 2,
    paddingVertical: 2,
  },
  readMoreText: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
  },
});
