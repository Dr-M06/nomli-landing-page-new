import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
  ActivityIndicator,
  Linking,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  X, Palette, Sparkles, Heart, Zap, Star, Music2,
  Snowflake, Gift, TreePine, ChevronDown, Play, Pause
} from 'lucide-react-native';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, FontSizes, Spacing } from '../constants/Theme';
import { getSelectableTracks, type MusicTrack } from '../constants/musicLibrary';
import { SUPPORT_EMAIL } from '../constants/ContactEmails';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type StoryMusicPayload = { type: 'library'; track: { id: string; title: string; artist: string; url: string } };

export type TextStoryStyle = 'classic'; // Plain text only - style picker removed

interface StoryTextEditorProps {
  visible: boolean;
  onClose: () => void;
  onPublish: (text: string, templateId: string, isPublic: boolean, fontSize: number, textAlign: 'left' | 'center' | 'right', music?: unknown) => void;
}

// Premium Templates - Curated Selection (TikTok-style minimal)
const TEMPLATES = [
  // Christmas Special (3 best)
  {
    id: 'christmas-red-green',
    name: 'Christmas',
    gradient: ['#C41E3A', '#165B33', '#FFD700'],
    textColor: '#FFFFFF',
    icon: TreePine,
    isChristmas: true,
  },
  {
    id: 'christmas-snow',
    name: 'Snowy',
    gradient: ['#1e3a5f', '#5fa8d3', '#e1f5fe'],
    textColor: '#1a1a1a',
    icon: Snowflake,
    isChristmas: true,
  },
  {
    id: 'christmas-gold',
    name: 'Golden',
    gradient: ['#FFD700', '#FFA000', '#FF6F00'],
    textColor: '#1a1a1a',
    icon: Gift,
    isChristmas: true,
  },
  // Gen Z Essentials (5 best)
  {
    id: 'gradient-pink-orange',
    name: 'Sunset',
    gradient: ['#FF6B9D', '#FFA07A', '#FF8C69'],
    textColor: '#FFFFFF',
    icon: Heart,
  },
  {
    id: 'gradient-purple-blue',
    name: 'Galaxy',
    gradient: ['#667eea', '#764ba2', '#f093fb'],
    textColor: '#FFFFFF',
    icon: Star,
  },
  {
    id: 'gradient-green-cyan',
    name: 'Fresh',
    gradient: ['#11998e', '#38ef7d'],
    textColor: '#FFFFFF',
    icon: Sparkles,
  },
  {
    id: 'gradient-red-orange',
    name: 'Fire',
    gradient: ['#eb3349', '#f45c43', '#fc6076'],
    textColor: '#FFFFFF',
    icon: Zap,
  },
  {
    id: 'gradient-dark',
    name: 'Dark',
    gradient: ['#000000', '#434343'],
    textColor: '#FFFFFF',
    icon: Star,
  },
];

// Isolated body: only this subtree re-renders when user types, preventing gradient/full-screen flicker
const StoryTextEditorBody = memo(function StoryTextEditorBody({
  selectedTemplate,
  fontSize,
  textAlign,
  isPublic,
  selectedMusic,
  onPublish,
  paddingBottom,
  inputRef,
}: {
  selectedTemplate: (typeof TEMPLATES)[0];
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  isPublic: boolean;
  selectedMusic: MusicTrack | null;
  onPublish: StoryTextEditorProps['onPublish'];
  paddingBottom: number;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const [text, setText] = useState('');
  const [previewText, setPreviewText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewText(text);
      debounceRef.current = null;
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text]);

  const displayText = previewText.trim();

  const handlePublish = useCallback(() => {
    if (text.trim().length > 0) {
      const music: StoryMusicPayload | undefined = selectedMusic
        ? { type: 'library', track: { id: selectedMusic.id, title: selectedMusic.title, artist: selectedMusic.artist, url: selectedMusic.url } }
        : undefined;
      onPublish(text.trim(), selectedTemplate.id, isPublic, fontSize, textAlign, music);
    }
  }, [text, selectedTemplate, isPublic, fontSize, textAlign, selectedMusic, onPublish]);

  const previewTextStyle: any[] = [
    styles.previewText,
    {
      color: selectedTemplate.textColor,
      fontSize: fontSize,
      textAlign: textAlign,
      fontFamily: FontFamily.bold,
      fontWeight: '900',
    },
  ];

  return (
    <>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.previewArea} collapsable={false}>
          <Text style={previewTextStyle} numberOfLines={12}>
            {displayText}
          </Text>
          {!displayText && (
            <Text
              style={[
                styles.previewPlaceholder,
                {
                  color: `${selectedTemplate.textColor}60`,
                  textAlign: textAlign,
                },
              ]}
            >
              Type something...
            </Text>
          )}
        </View>
      </TouchableWithoutFeedback>

      <View style={[styles.storyCommentBar, { paddingBottom }]}>
        <View style={styles.storyCommentInputRow}>
          <TouchableOpacity
            onPress={() => Keyboard.dismiss()}
            style={styles.storyCommentKeyboardDown}
            hitSlop={8}
            accessibilityLabel="Hide keyboard"
          >
            <ChevronDown size={22} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.storyCommentInputWrapper}>
            <TextInput
              ref={inputRef}
              style={styles.storyCommentInput}
              placeholder="Type something..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={280}
              autoFocus
            />
            <Text
              style={[
                styles.storyCommentCount,
                text.length > 250 && styles.storyCommentCountWarn,
              ]}
            >
              {text.length}/280
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.storyCommentSendBtn,
              text.trim().length === 0 && styles.storyCommentSendBtnDisabled,
            ]}
            onPress={handlePublish}
            disabled={text.trim().length === 0}
          >
            <LinearGradient
              colors={text.trim().length > 0 ? ['#FF3B5C', '#FF1744'] : ['#333333', '#222222']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.storyCommentSendBtnGradient}
            >
              <Sparkles size={18} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
});

export default function StoryTextEditor({ visible, onClose, onPublish }: StoryTextEditorProps) {
  const insets = useSafeAreaInsets();
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [fontSize, setFontSize] = useState(18); // Snapchat/Instagram-style compact text
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [isPublic, setIsPublic] = useState(true);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const previewLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<TextInput>(null);

  const stopPreview = useCallback(async () => {
    if (previewLimitTimerRef.current) {
      clearTimeout(previewLimitTimerRef.current);
      previewLimitTimerRef.current = null;
    }
    if (previewSoundRef.current) {
      try {
        await previewSoundRef.current.stopAsync();
        await previewSoundRef.current.unloadAsync();
      } catch (_) {}
      previewSoundRef.current = null;
    }
    setPreviewPlayingId(null);
    setPreviewLoadingId(null);
  }, []);

  const playPreview = useCallback(async (track: MusicTrack) => {
    if (!track?.url?.trim()) return;
    const isCurrentlyPlaying = previewPlayingId === track.id;
    if (isCurrentlyPlaying) {
      try {
        if (previewSoundRef.current) {
          await previewSoundRef.current.stopAsync();
          await previewSoundRef.current.unloadAsync();
        }
      } catch (_) {}
      previewSoundRef.current = null;
      setPreviewPlayingId(null);
      return;
    }
    await stopPreview();
    setPreviewLoadingId(track.id);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true }
      );
      previewSoundRef.current = sound;
      setPreviewPlayingId(track.id);
      setPreviewLoadingId(null);
      previewLimitTimerRef.current = setTimeout(() => {
        previewLimitTimerRef.current = null;
        stopPreview();
      }, 15000);
    } catch (_) {
      setPreviewLoadingId(null);
    }
  }, [previewPlayingId, stopPreview]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setSelectedTemplate(TEMPLATES[0]);
      setFontSize(18);
      setTextAlign('center');
      setIsPublic(true);
      setShowTemplatePicker(false);
      setSelectedMusic(null);
      setShowMusicPicker(false);
      stopPreview();
    }
  }, [visible, stopPreview]);

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

  const handlePublish = useCallback<StoryTextEditorProps['onPublish']>((text, templateId, isPublic, fontSize, textAlign, music, style) => {
    onPublish(text, templateId, isPublic, fontSize, textAlign, music, style);
    onClose();
  }, [onPublish, onClose]);

  const renderTemplatePickerModal = () => (
    <>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setShowTemplatePicker(false)}
      />
      <View style={styles.templatePickerCard} pointerEvents="box-none">
        <Text style={styles.templatePickerTitle}>Canvas</Text>
        <View style={styles.templatePickerGrid}>
          {TEMPLATES.map((template) => {
            const Icon = template.icon;
            const isSelected = selectedTemplate.id === template.id;
            return (
              <TouchableOpacity
                key={template.id}
                onPress={() => {
                  setSelectedTemplate(template);
                  setShowTemplatePicker(false);
                }}
                activeOpacity={0.8}
                style={styles.templatePickerItem}
              >
                <View style={[styles.templateButton, isSelected && styles.templateButtonSelected]}>
                  <LinearGradient
                    colors={template.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.templateButtonGradient}
                  >
                    <Icon size={20} color={template.textColor} strokeWidth={2.5} />
                  </LinearGradient>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 24}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            {/* Background with selected template + animated gradient */}
            <LinearGradient
              colors={selectedTemplate.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.backgroundGradient}
            >
          {/* Top: close only */}
          <View style={styles.topControls}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <X size={24} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Template picker overlay (canvas changer) */}
          {showTemplatePicker && (
            <View style={styles.templatePickerOverlay}>
              {renderTemplatePickerModal()}
            </View>
          )}

          {/* Center + bottom: isolated so only this re-renders when typing (stops flicker). Key resets body when modal reopens. */}
          <StoryTextEditorBody
            key={visible ? 'open' : 'closed'}
            selectedTemplate={selectedTemplate}
            fontSize={fontSize}
            textAlign={textAlign}
            isPublic={isPublic}
            selectedMusic={selectedMusic}
            onPublish={handlePublish}
            paddingBottom={Math.max(12, insets.bottom + 8)}
            inputRef={inputRef}
          />

          {/* Side: canvas, music icons */}
          <View style={[styles.sideActions, { top: insets.top + 56, bottom: SCREEN_HEIGHT * 0.32 }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.sideActionButton}
              onPress={() => setShowTemplatePicker(true)}
              activeOpacity={0.7}
              accessibilityLabel="Change canvas"
            >
              <Palette size={20} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sideActionButton, selectedMusic && styles.sideActionButtonActive]}
              onPress={openMusicPicker}
              activeOpacity={0.7}
              accessibilityLabel="Add music"
            >
              <Music2 size={20} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Music bubble when music is added (lightweight, Instagram/TikTok style) */}
          {selectedMusic && (
            <View style={styles.musicBubbleContainer}>
              <View style={styles.musicBubble}>
                <Music2 size={14} color="rgba(255,255,255,0.95)" strokeWidth={2.5} />
                <Text style={styles.musicBubbleText} numberOfLines={1}>
                  {selectedMusic.title} · {selectedMusic.artist}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedMusic(null)}
                  hitSlop={8}
                  style={styles.musicBubbleRemove}
                >
                  <X size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Music picker modal */}
          {showMusicPicker && (
            <View style={styles.templatePickerOverlay}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => {
                  stopPreview();
                  setShowMusicPicker(false);
                }}
              />
              <View style={styles.musicPickerCard} pointerEvents="box-none">
                <View style={styles.musicPickerHeader}>
                  <Text style={styles.templatePickerTitle}>Add Music</Text>
                  <Text style={styles.musicPickerSubtitle}>Tap play to preview · 15 sec</Text>
                </View>
                {musicLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginVertical: 24 }} />
                ) : (
                  <ScrollView style={styles.musicPickerList} showsVerticalScrollIndicator={false}>
                    {musicTracks.map((track) => {
                      const isPlaying = previewPlayingId === track.id;
                      const isLoading = previewLoadingId === track.id;
                      return (
                        <View key={track.id} style={styles.musicPickerItem}>
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); playPreview(track); }}
                            style={styles.musicPickerPlayButton}
                            disabled={isLoading}
                            hitSlop={8}
                          >
                            {isLoading ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : isPlaying ? (
                              <Pause size={20} color="#FFFFFF" strokeWidth={2.5} />
                            ) : (
                              <Play size={20} color="#FFFFFF" strokeWidth={2.5} />
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              stopPreview();
                              setSelectedMusic(track);
                              setShowMusicPicker(false);
                            }}
                            style={styles.musicPickerItemText}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.musicPickerItemTitle} numberOfLines={1}>{track.title}</Text>
                            <Text style={styles.musicPickerItemArtist} numberOfLines={1}>{track.artist}</Text>
                          </TouchableOpacity>
                          <Music2 size={18} color="rgba(255,255,255,0.5)" strokeWidth={2} style={{ marginLeft: 8 }} />
                        </View>
                      );
                    })}
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

            </LinearGradient>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundGradient: {
    flex: 1,
  },
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideActions: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 5,
    elevation: 5,
  },
  sideActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideActionButtonActive: {
    backgroundColor: 'rgba(255, 59, 92, 0.5)',
  },
  musicBubbleContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.32,
    left: 16,
    right: 16,
    zIndex: 4,
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
  musicBubbleRemove: {
    padding: 4,
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
  musicPickerPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
  templatePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  templatePickerCard: {
    backgroundColor: 'rgba(28, 28, 28, 0.95)',
    borderRadius: 20,
    padding: 20,
    minWidth: 280,
    maxWidth: SCREEN_WIDTH - 32,
  },
  templatePickerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    marginBottom: 16,
    textAlign: 'center',
  },
  templatePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  templatePickerItem: {
    padding: 4,
  },
  previewArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 44,
  },
  previewText: {
    width: '100%',
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
  },
  previewPlaceholder: {
    position: 'absolute',
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
    fontSize: 28,
    width: '100%',
  },
  storyCommentBar: {
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  storyCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  storyCommentKeyboardDown: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyCommentInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#2a2a2a',
    minHeight: 44,
    maxHeight: 120,
  },
  storyCommentInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 0,
    maxHeight: 100,
    fontFamily: FontFamily.medium,
  },
  storyCommentCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 8,
    alignSelf: 'center',
  },
  storyCommentCountWarn: {
    color: '#FF3B5C',
  },
  storyCommentSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  storyCommentSendBtnDisabled: {
    opacity: 0.5,
  },
  storyCommentSendBtnGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    padding: 2,
  },
  templateButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateButtonSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 10,
  },
});
