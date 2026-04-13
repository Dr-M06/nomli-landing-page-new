import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { X, Type, Sparkles, Send, Music2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { log, warn, error } from '../utils/productionLogger';
import { getSelectableTracks, type MusicTrack } from '../constants/musicLibrary';
import { SUPPORT_EMAIL } from '../constants/ContactEmails';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type StoryEditorMusicPayload = { type: 'library'; track: { id: string; title: string; artist: string; url: string } };

interface StoryEditorProps {
  visible: boolean;
  onClose: () => void;
  mediaUri: string;
  mediaType: 'photo' | 'video';
  onPublish: (mediaUri: string, mediaType: 'photo' | 'video', caption?: string, isPublic?: boolean, music?: StoryEditorMusicPayload | null) => void;
  uploadProgress?: number;
  isUploading?: boolean;
  uploadError?: string | null;
}

export default function StoryEditor({
  visible,
  onClose,
  mediaUri,
  mediaType,
  onPublish,
  uploadProgress = 0,
  isUploading = false,
  uploadError = null,
}: StoryEditorProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const [caption, setCaption] = useState('');
  const [showCaptionInput, setShowCaptionInput] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const publishScaleAnim = useRef(new Animated.Value(1)).current;
  const uploadProgressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Entrance animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset animations and error state
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      uploadProgressAnim.setValue(0);
      setVideoError(false);
      setSelectedMusic(null);
      setShowMusicPicker(false);
    }
  }, [visible]);

  useEffect(() => {
    if (isPublishing) {
      // Publishing animation - smooth upload progress
      Animated.loop(
        Animated.sequence([
          Animated.timing(uploadProgressAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(uploadProgressAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: false,
          }),
        ])
      ).start();

      // Pulse animation for publishing button
      Animated.loop(
        Animated.sequence([
          Animated.timing(publishScaleAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(publishScaleAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      uploadProgressAnim.setValue(0);
      publishScaleAnim.setValue(1);
    }
  }, [isPublishing]);

  const handlePublish = async () => {
    log('[StoryEditor] 🚀 Publish button pressed - closing modal immediately');
    
    // Close modal immediately (Instagram-style - user can continue using app)
    onClose();
    
    const music: StoryEditorMusicPayload | undefined =
      mediaType === 'video'
        ? undefined
        : selectedMusic
          ? { type: 'library', track: { id: selectedMusic.id, title: selectedMusic.title, artist: selectedMusic.artist, url: selectedMusic.url } }
          : undefined;
    onPublish(mediaUri, mediaType, caption, isPublic, music ?? null).catch((error) => {
      error('[StoryEditor] ❌ Error publishing story:', error);
      // Error will be handled by parent component with alert
    });
  };

  const openMusicPicker = async () => {
    setShowMusicPicker(true);
    setMusicLoading(true);
    try {
      const tracks = await getSelectableTracks();
      setMusicTracks(tracks.filter((t) => t.url?.trim()));
    } finally {
      setMusicLoading(false);
    }
  };

  const handleClose = () => {
    if (isPublishing) return;
    
    Alert.alert(
      'Discard Story?',
      'Are you sure you want to discard this story?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setCaption('');
            setShowCaptionInput(false);
            setSelectedMusic(null);
            setShowMusicPicker(false);
            onClose();
          },
        },
      ]
    );
  };

  const progressWidth = uploadProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // When uploading (especially large files), show an immediate overlay on both iOS and Android
  // so the screen never appears frozen with no progress or way to dismiss (opacity fade + heavy
  // media load can block the UI on both platforms).
  const showUploadOverlay = visible && (isUploading || uploadError);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 24}
      >
        {/* Always-visible overlay when uploading (iOS & Android) so user sees progress and can cancel. */}
        {showUploadOverlay && (
          <View style={styles.uploadOverlay} pointerEvents="box-none">
            <View style={styles.uploadOverlayCard}>
              <ActivityIndicator size="large" color="#FFFFFF" style={{ marginBottom: Spacing.md }} />
              <Text style={styles.uploadOverlayTitle}>
                {uploadError ? 'Upload failed' : isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Preparing...'}
              </Text>
              {uploadError && (
                <Text style={styles.uploadOverlaySubtext} numberOfLines={2}>{uploadError}</Text>
              )}
              <View style={[styles.uploadOverlayBar, { width: '100%' }]}>
                <View style={[styles.uploadOverlayBarFill, { width: `${uploadError ? 0 : Math.round(uploadProgress)}%` }]} />
              </View>
              <TouchableOpacity
                style={styles.uploadOverlayCancelButton}
                onPress={() => onClose()}
                activeOpacity={0.8}
              >
                <Text style={styles.uploadOverlayCancelText}>{uploadError ? 'Close' : 'Cancel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={[styles.contentContainer, { opacity: fadeAnim }]}>
            {/* Media Preview */}
            <Animated.View style={[styles.mediaContainer, { transform: [{ scale: scaleAnim }] }]}>
            {mediaType === 'photo' ? (
              <Image
                source={{ uri: mediaUri }}
                style={styles.media}
                contentFit="cover"
                transition={300}
                onError={(error) => {
                  error('[StoryEditor] Image load error:', error);
                }}
              />
            ) : videoError ? (
              // Fallback UI when video fails to load (e.g., decoder error)
              <View style={[styles.media, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                  Video Preview Unavailable
                </Text>
                <Text style={{ color: '#999', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }}>
                  You can still publish your video. The preview may not work on this device, but the upload will succeed.
                </Text>
              </View>
            ) : (
              <Video
                source={{ uri: mediaUri }}
                style={styles.media}
                resizeMode={ResizeMode.COVER}
                shouldPlay={visible && !videoError}
                isLooping
                isMuted={false}
                useNativeControls={false}
                onError={(error) => {
                  error('[StoryEditor] Video load error:', error);
                  setVideoError(true);
                }}
                onLoad={() => {
                  log('[StoryEditor] Video loaded successfully');
                  setVideoError(false);
                }}
              />
            )}

            {/* Premium gradient overlays */}
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.2)', 'transparent']}
              style={styles.topGradient}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)']}
              style={styles.bottomGradient}
            />

            {/* Top Controls with glass morphism */}
            <View style={styles.topControls}>
              <TouchableOpacity
                style={styles.glassButton}
                onPress={handleClose}
                disabled={isPublishing}
              >
                <X size={26} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Instagram-style Upload Progress Bar */}
            {isUploading && (
              <View style={styles.uploadProgressContainer}>
                <View style={styles.uploadProgressBar}>
                  <Animated.View
                    style={[
                      styles.uploadProgressFill,
                      {
                        width: `${uploadProgress}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.uploadProgressText}>
                  {uploadProgress < 100 ? `Uploading... ${Math.round(uploadProgress)}%` : 'Upload complete!'}
                </Text>
              </View>
            )}

            {/* Upload Error Message */}
            {uploadError && !isUploading && (
              <View style={styles.uploadErrorContainer}>
                <Text style={styles.uploadErrorText}>⚠️ Upload failed: {uploadError}</Text>
              </View>
            )}

            {/* Upload Progress Bar */}
            {isPublishing && (
              <MotiView
                from={{ opacity: 0, translateY: -20 }}
                animate={{ opacity: 1, translateY: 0 }}
                style={styles.uploadProgressContainer}
              >
                <View style={styles.uploadProgressBar}>
                  <Animated.View 
                    style={[
                      styles.uploadProgressFill,
                      { width: progressWidth }
                    ]} 
                  />
                </View>
                <Text style={styles.uploadProgressText}>Uploading your story...</Text>
              </MotiView>
            )}

            {/* Caption Input with glass morphism */}
            {showCaptionInput && (
              <MotiView
                from={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring' }}
                style={styles.captionContainer}
              >
                <View style={styles.glassCaptionBox}>
                  <TextInput
                    style={styles.captionInput}
                    placeholder="Add a caption..."
                    placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    value={caption}
                    onChangeText={setCaption}
                    multiline
                    maxLength={200}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.captionCloseButton}
                    onPress={() => setShowCaptionInput(false)}
                  >
                    <X size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </MotiView>
            )}

            {/* Music bubble when added (photo only; video has music disabled) */}
            {selectedMusic && mediaType !== 'video' && (
              <View style={styles.musicBubbleWrap}>
                <View style={styles.musicBubble}>
                  <Music2 size={14} color="rgba(255,255,255,0.95)" strokeWidth={2.5} />
                  <Text style={styles.musicBubbleText} numberOfLines={1}>
                    {selectedMusic.title} · {selectedMusic.artist}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedMusic(null)} hitSlop={8} style={styles.musicBubbleRemove}>
                    <X size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Music picker modal */}
            {showMusicPicker && (
              <View style={styles.musicPickerOverlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowMusicPicker(false)} />
                <View style={styles.musicPickerCard} pointerEvents="box-none">
                  <View style={styles.musicPickerHeader}>
                    <Text style={styles.musicPickerTitle}>Add Music</Text>
                    <Text style={styles.musicPickerSubtitle}>15 sec · Plays when story opens</Text>
                  </View>
                  {musicLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginVertical: 24 }} />
                  ) : (
                    <ScrollView style={styles.musicPickerList} showsVerticalScrollIndicator={false}>
                      {musicTracks.map((track) => (
                        <TouchableOpacity
                          key={track.id}
                          onPress={() => {
                            setSelectedMusic(track);
                            setShowMusicPicker(false);
                          }}
                          style={styles.musicPickerItem}
                          activeOpacity={0.7}
                        >
                          <Music2 size={18} color="rgba(255,255,255,0.8)" strokeWidth={2} />
                          <View style={styles.musicPickerItemText}>
                            <Text style={styles.musicPickerItemTitle} numberOfLines={1}>{track.title}</Text>
                            <Text style={styles.musicPickerItemArtist} numberOfLines={1}>{track.artist}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                      {musicTracks.length === 0 && (
                        <Text style={styles.musicPickerEmpty}>No music available</Text>
                      )}
                      <TouchableOpacity
                        style={styles.musicPickerContactSupport}
                        onPress={() => {
                          Linking.openURL(
                            `mailto:${SUPPORT_EMAIL}?subject=Add my music to in-app library&body=Hi, I'd like to add my own music to the in-app music library for stories.`
                          ).catch(() => {});
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.musicPickerContactSupportText}>
                          Want your own music as in-app music? Contact support
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                  )}
                </View>
              </View>
            )}

            {/* Text + Music stacked on the right (same UI for photo and video, iOS and Android) */}
            {!isPublishing && (
              <View style={styles.sideControls} pointerEvents="box-none">
                {!showCaptionInput && (
                  <TouchableOpacity
                    style={styles.sideControlButton}
                    onPress={() => setShowCaptionInput(true)}
                    activeOpacity={0.7}
                  >
                    <Type size={20} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.sideControlLabel}>Text</Text>
                  </TouchableOpacity>
                )}
                {mediaType === 'video' ? (
                  <TouchableOpacity
                    style={[styles.sideControlButton, styles.sideControlButtonDisabled]}
                    disabled
                    activeOpacity={1}
                  >
                    <Music2 size={20} color="rgba(255,255,255,0.5)" strokeWidth={2.5} />
                    <Text style={[styles.sideControlLabel, { color: 'rgba(255,255,255,0.5)' }]}>Music</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.sideControlButton, selectedMusic && { backgroundColor: 'rgba(255, 59, 92, 0.4)' }]}
                    onPress={openMusicPicker}
                    activeOpacity={0.7}
                  >
                    <Music2 size={20} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.sideControlLabel}>Music</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Bottom Controls - publish only (same on iOS and Android) */}
            <View style={styles.bottomControls}>
              <View style={styles.leftControls} />

              {/* Premium Publish Button with animations */}
              <Animated.View style={{ transform: [{ scale: publishScaleAnim }] }}>
                <TouchableOpacity
                  style={[
                    styles.publishButton,
                    (isPublishing || isUploading) && styles.publishButtonPublishing,
                    (isUploading || uploadError) && { opacity: 0.6 },
                  ]}
                  onPress={handlePublish}
                  disabled={isPublishing || isUploading || !!uploadError}
                >
                  <LinearGradient
                    colors={isPublishing 
                      ? ['#9C27B0', '#7B1FA2', '#6A1B9A'] 
                      : ['#FF3B5C', '#FF1744', '#C2185B']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.publishButtonGradient}
                  >
                    {(isPublishing || isUploading) ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.publishButtonText}>
                          {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Sharing...'}
                        </Text>
                      </>
                    ) : uploadError ? (
                      <>
                        <Text style={styles.publishButtonText}>Upload Failed</Text>
                      </>
                    ) : (
                      <>
                        <MotiView
                          from={{ rotate: '0deg' }}
                          animate={{ rotate: '360deg' }}
                          transition={{ 
                            type: 'timing', 
                            duration: 20000, 
                            loop: true 
                          }}
                        >
                          <Sparkles size={20} color="#FFFFFF" />
                        </MotiView>
                        <Text style={styles.publishButtonText}>Share Story</Text>
                        <Send size={20} color="#FFFFFF" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>
        </Animated.View>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    flex: 1,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  uploadOverlayCard: {
    width: '80%',
    maxWidth: 320,
    backgroundColor: 'rgba(40,40,40,0.95)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  uploadOverlayTitle: {
    color: '#FFFFFF',
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.semibold,
    marginBottom: Spacing.xs,
  },
  uploadOverlaySubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  uploadOverlayBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  uploadOverlayBarFill: {
    height: '100%',
    backgroundColor: '#FF3B5C',
    borderRadius: 2,
  },
  uploadOverlayCancelButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  uploadOverlayCancelText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semibold,
  },
  mediaContainer: {
    flex: 1,
    position: 'relative',
    borderRadius: 0,
    overflow: 'hidden',
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 250,
  },
  topControls: {
    position: 'absolute',
    top: 60,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glassButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadProgressContainer: {
    position: 'absolute',
    top: 120,
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
  },
  uploadProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  uploadProgressFill: {
    height: '100%',
    backgroundColor: '#FF3B5C',
    borderRadius: 2,
  },
  uploadProgressText: {
    color: '#FFFFFF',
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.semibold,
    marginTop: Spacing.sm,
  },
  uploadErrorContainer: {
    position: 'absolute',
    top: 120,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: 'rgba(255, 59, 92, 0.9)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  uploadErrorText: {
    color: '#FFFFFF',
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  musicBubbleWrap: {
    position: 'absolute',
    bottom: 120,
    left: Spacing.lg,
    right: Spacing.lg,
  },
  musicBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    gap: 8,
    maxWidth: 260,
  },
  musicBubbleText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 13,
    fontFamily: FontFamily.medium,
    flex: 1,
  },
  musicBubbleRemove: { padding: 4 },
  musicPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  musicPickerCard: {
    backgroundColor: 'rgba(28, 28, 28, 0.95)',
    borderRadius: 20,
    padding: 20,
    minWidth: 280,
    maxWidth: SCREEN_WIDTH - 48,
    maxHeight: Math.min(320, SCREEN_HEIGHT * 0.6),
    alignSelf: 'center',
  },
  musicPickerHeader: {
    marginBottom: 12,
  },
  musicPickerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
  },
  musicPickerSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontFamily: FontFamily.regular,
    marginTop: 4,
    textAlign: 'center',
  },
  musicPickerList: {
    maxHeight: Math.min(220, SCREEN_HEIGHT * 0.35),
  },
  musicPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  musicPickerItemText: { flex: 1, minWidth: 0 },
  musicPickerItemTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: FontFamily.semibold,
  },
  musicPickerItemArtist: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  musicPickerEmpty: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    paddingVertical: 24,
  },
  musicPickerContactSupport: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  musicPickerContactSupportText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  captionContainer: {
    position: 'absolute',
    top: '40%',
    left: Spacing.lg,
    right: Spacing.lg,
  },
  glassCaptionBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  captionInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
    minHeight: 60,
    maxHeight: 200,
  },
  captionCloseButton: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
  },
  sideControls: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    transform: [{ translateY: -60 }],
    alignItems: 'center',
    gap: 10,
    zIndex: 5,
  },
  sideControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideControlButtonDisabled: {
    opacity: 0.7,
  },
  sideControlLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: FontFamily.semibold,
    marginTop: 2,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 50,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftControls: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flex: 1,
  },
  glassControlButton: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: Spacing.sm + 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.md,
    minWidth: 68,
  },
  controlButtonLabel: {
    color: '#FFFFFF',
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.semibold,
    marginTop: Spacing.xxs,
  },
  publishButton: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  publishButtonPublishing: {
    opacity: 0.95,
  },
  publishButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    minWidth: 160,
  },
  publishButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.5,
  },
});
