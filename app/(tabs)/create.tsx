import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import CreatePostScreen from '../community/create';
import StoryCamera from '../../components/StoryCamera';
import StoryEditor from '../../components/StoryEditor';
import StoryTextEditor, { type StoryMusicPayload } from '../../components/StoryTextEditor';
import { uploadStoryMedia, createStory } from '../../utils/storyUtils';
import { generateTextStoryImage } from '../../utils/textStoryGenerator';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Music2 } from 'lucide-react-native';
import { type MusicTrack } from '../../constants/musicLibrary';

export default function CreateScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string; music?: string }>();
  const initialTab = params?.tab === 'story' ? 'story' : 'post';
  const [tab, setTab] = useState<'post' | 'story'>(initialTab);
  const flamingoMain = '#FF6FAE';
  const flamingoDeep = '#E25595';
  const flamingoSoft = isDarkMode ? 'rgba(255,111,174,0.18)' : 'rgba(255,111,174,0.10)';
  const flamingoBorder = isDarkMode ? 'rgba(255,111,174,0.38)' : 'rgba(226,85,149,0.28)';

  useEffect(() => {
    const next = params?.tab === 'story' ? 'story' : 'post';
    setTab(next);
  }, [params?.tab]);

  useEffect(() => {
    if (!params?.music) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(params.music));
      if (!parsed?.id || !parsed?.title || !parsed?.artist || !parsed?.url) return;
      setPrefilledStoryMusic({
        id: String(parsed.id),
        title: String(parsed.title),
        artist: String(parsed.artist),
        url: String(parsed.url),
      });
    } catch {
      // Ignore malformed payload
    }
  }, [params?.music]);

  const [showStoryCamera, setShowStoryCamera] = useState(false);
  const [showStoryEditor, setShowStoryEditor] = useState(false);
  const [showStoryTextEditor, setShowStoryTextEditor] = useState(false);
  const [storyMediaUri, setStoryMediaUri] = useState<string | null>(null);
  const [storyMediaType, setStoryMediaType] = useState<'photo' | 'video'>('photo');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [prefilledStoryMusic, setPrefilledStoryMusic] = useState<MusicTrack | null>(null);
  const uploadHint =
    uploadProgress < 0.4
      ? 'Compressing media...'
      : uploadProgress < 0.95
        ? 'Uploading...'
        : 'Finishing...';

  const openCameraStory = useCallback(() => {
    setShowStoryTextEditor(false);
    setShowStoryEditor(false);
    setShowStoryCamera(true);
  }, []);

  const openTextStory = useCallback(() => {
    setShowStoryCamera(false);
    setShowStoryEditor(false);
    setShowStoryTextEditor(true);
  }, []);

  const handleMediaCaptured = useCallback((uri: string, type: 'photo' | 'video') => {
    setShowStoryCamera(false);
    setStoryMediaUri(uri);
    setStoryMediaType(type);
    // Allow modal transition to settle
    setTimeout(() => setShowStoryEditor(true), Platform.OS === 'ios' ? 250 : 0);
  }, []);

  const publishMediaStory = useCallback(
    async (
      mediaUri: string,
      mediaType: 'photo' | 'video',
      caption?: string,
      isPublic?: boolean,
      music?: { type: 'library'; track: { id: string; title: string; artist: string; url: string } } | null
    ) => {
      try {
        Toast.show({
          type: 'info',
          text1: 'Uploading in background',
          text2: 'You can leave this screen. We will keep posting your story.',
          position: 'bottom',
          visibilityTime: 2400,
        });
        setUploading(true);
        setUploadProgress(0.05);

        const uploaded = await uploadStoryMedia(mediaUri, mediaType);
        setUploadProgress(0.65);

        const audio =
          music?.type === 'library'
            ? { url: music.track.url, title: music.track.title, artist: music.track.artist }
            : null;

        const story = await createStory(
          uploaded.mediaUrl,
          mediaType,
          caption,
          isPublic ?? true,
          uploaded.muxAssetId,
          audio,
          null
        );

        if (!story) throw new Error('Failed to create story');
        setUploadProgress(1);
        Toast.show({ type: 'success', text1: 'Story posted', position: 'bottom' });
      } catch (e: any) {
        Toast.show({ type: 'error', text1: e?.message || 'Failed to post story', position: 'bottom' });
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setShowStoryEditor(false);
        setStoryMediaUri(null);
      }
    },
    []
  );

  const publishTextStory = useCallback(
    async (
      text: string,
      templateId: string,
      isPublic: boolean,
      fontSize: number,
      textAlign: 'left' | 'center' | 'right',
      music?: unknown
    ) => {
      try {
        Toast.show({
          type: 'info',
          text1: 'Uploading in background',
          text2: 'You can leave this screen. We will keep posting your story.',
          position: 'bottom',
          visibilityTime: 2400,
        });
        setUploading(true);
        setUploadProgress(0.05);
        const imageUri = await generateTextStoryImage(text, templateId, fontSize, textAlign, 'classic');
        setUploadProgress(0.35);
        const uploaded = await uploadStoryMedia(imageUri, 'photo');
        setUploadProgress(0.75);

        const payload = music as StoryMusicPayload | undefined;
        const audio =
          payload?.type === 'library'
            ? { url: payload.track.url, title: payload.track.title, artist: payload.track.artist }
            : null;

        // Store the text in caption so StoryViewer can animate/show it.
        const story = await createStory(uploaded.mediaUrl, 'photo', text, isPublic, undefined, audio, {
          text_style: 'classic',
          text_animation: undefined,
        });

        if (!story) throw new Error('Failed to create story');
        setUploadProgress(1);
        Toast.show({ type: 'success', text1: 'Story posted', position: 'bottom' });
      } catch (e: any) {
        Toast.show({ type: 'error', text1: e?.message || 'Failed to post story', position: 'bottom' });
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setShowStoryTextEditor(false);
      }
    },
    []
  );

  const tabs = useMemo(
    () => (
      <View
        style={[
          styles.tabs,
          { backgroundColor: flamingoSoft, borderColor: flamingoBorder },
        ]}
      >
        <TouchableOpacity
          onPress={() => setTab('post')}
          activeOpacity={0.85}
          style={[
            styles.tabBtn,
            tab === 'post' && [
              styles.activeTab,
              { backgroundColor: isDarkMode ? flamingoDeep : flamingoMain, borderColor: flamingoMain },
            ],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  tab === 'post'
                    ? '#FFFFFF'
                    : (isDarkMode ? 'rgba(255,196,220,0.92)' : flamingoDeep),
              },
            ]}
          >
            Post
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('story')}
          activeOpacity={0.85}
          style={[
            styles.tabBtn,
            tab === 'story' && [
              styles.activeTab,
              { backgroundColor: isDarkMode ? flamingoDeep : flamingoMain, borderColor: flamingoMain },
            ],
          ]}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  tab === 'story'
                    ? '#FFFFFF'
                    : (isDarkMode ? 'rgba(255,196,220,0.92)' : flamingoDeep),
              },
            ]}
          >
            Story
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [flamingoSoft, flamingoBorder, isDarkMode, tab, flamingoDeep, flamingoMain]
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.neutral.background, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>{tabs}</View>
          <TouchableOpacity
            onPress={() => router.push('/music')}
            activeOpacity={0.85}
            style={[
              styles.musicEntryBtn,
              {
                backgroundColor: isDarkMode ? 'rgba(255,111,174,0.14)' : 'rgba(255,111,174,0.10)',
                borderColor: flamingoBorder,
              },
            ]}
          >
            <Music2 size={16} color={flamingoDeep} strokeWidth={2.3} />
          </TouchableOpacity>
        </View>
      </View>

      {tab === 'post' ? (
        <CreatePostScreen />
      ) : (
        <View style={styles.storyPane}>
          <Text style={[styles.storyTitle, { color: themeColors.neutral.text }]}>Share your vibe story</Text>
          <Text style={[styles.storySubtitle, { color: themeColors.neutral.textSecondary }]}>
            Post your Nomli vibe in a quick moment.
          </Text>

          {prefilledStoryMusic ? (
            <View
              style={[
                styles.selectedMusicWrap,
                {
                  borderColor: themeColors.neutral.border,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                },
              ]}
            >
              <Music2 size={14} color={themeColors.primary.main} strokeWidth={2.4} />
              <Text style={[styles.selectedMusicText, { color: themeColors.neutral.text }]} numberOfLines={1}>
                {prefilledStoryMusic.title} · {prefilledStoryMusic.artist}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={openCameraStory}
            activeOpacity={0.85}
            style={[
              styles.storyAction,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: themeColors.neutral.border },
            ]}
          >
            <Text style={[styles.storyActionTitle, { color: themeColors.neutral.text }]}>Vibe camera story</Text>
            <Text style={[styles.storyActionSub, { color: themeColors.neutral.textSecondary }]}>
              Photo or video
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openTextStory}
            activeOpacity={0.85}
            style={[
              styles.storyAction,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: themeColors.neutral.border },
            ]}
          >
            <Text style={[styles.storyActionTitle, { color: themeColors.neutral.text }]}>Vibe text story</Text>
            <Text style={[styles.storyActionSub, { color: themeColors.neutral.textSecondary }]}>
              Gradient + big text
            </Text>
          </TouchableOpacity>

          {uploading && (
            <View style={styles.uploadRow}>
              <ActivityIndicator color={themeColors.primary.main} />
              <View>
                <Text style={[styles.uploadText, { color: themeColors.neutral.textSecondary }]}>
                  Posting... {Math.round(uploadProgress * 100)}%
                </Text>
                <Text style={[styles.uploadHintText, { color: themeColors.neutral.textSecondary }]}>
                  {uploadHint}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      <StoryCamera
        visible={showStoryCamera}
        onClose={() => setShowStoryCamera(false)}
        onMediaCaptured={handleMediaCaptured}
      />

      {storyMediaUri && (
        <StoryEditor
          visible={showStoryEditor}
          onClose={() => setShowStoryEditor(false)}
          mediaUri={storyMediaUri}
          mediaType={storyMediaType}
          onPublish={publishMediaStory}
          initialMusic={prefilledStoryMusic}
          uploadProgress={uploadProgress}
          isUploading={uploading}
        />
      )}

      <StoryTextEditor
        visible={showStoryTextEditor}
        onClose={() => setShowStoryTextEditor(false)}
        onPublish={publishTextStory}
        initialMusic={prefilledStoryMusic}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  top: {
    paddingTop: 4,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  musicEntryBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: BorderRadius.pill,
    padding: 2,
    gap: 4,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    borderRadius: BorderRadius.pill,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    borderWidth: 1,
    shadowColor: '#FF6FAE',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.xs,
    letterSpacing: 0.2,
  },
  storyPane: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  storyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    letterSpacing: -0.6,
  },
  storySubtitle: {
    marginTop: 6,
    fontFamily: FontFamily.regular,
    fontSize: 14,
  },
  selectedMusicWrap: {
    marginTop: 10,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedMusicText: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  storyAction: {
    marginTop: 10,
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  storyActionTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
  storyActionSub: {
    marginTop: 4,
    fontFamily: FontFamily.regular,
    fontSize: 13,
  },
  uploadRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uploadText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
  },
  uploadHintText: {
    marginTop: 2,
    fontFamily: FontFamily.regular,
    fontSize: 12,
    opacity: 0.85,
  },
});
