import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import useAuth from '../../hooks/useAuth';
import {
  markDatingSetupSkipped,
  saveDatingSetup,
  type DatingIntent,
  type DatingLookingFor,
} from '../../utils/datingFlowService';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';

const PROMPT_CHOICES = [
  'A green flag I love is...',
  'My ideal first date is...',
  'Teach me something about...',
  'One thing I am proud of is...',
  'Two truths and a lie...',
];

const PROMPT_ANSWER_PRESETS: Record<string, string[]> = {
  'A green flag I love is...': [
    'Kindness to people who can do nothing for them.',
    'Consistent communication and emotional maturity.',
    'Someone who supports my goals and keeps it real.',
  ],
  'My ideal first date is...': [
    'Coffee, a walk, and deep conversation.',
    'Food spot + a fun activity after.',
    'Sunset drive with good music.',
  ],
  'Teach me something about...': [
    'Your culture and favorite traditions.',
    'The hobby you are most passionate about.',
    'A life lesson you learned the hard way.',
  ],
  'One thing I am proud of is...': [
    'How far I have come in the last year.',
    'Staying focused on growth even when it is hard.',
    'Being there for people I care about.',
  ],
  'Two truths and a lie...': [
    'I have lived in 3 cities, I love karaoke, I hate pizza.',
    'I can swim, I wake up early, I have never used TikTok.',
    'I love road trips, I have a pet, I hate music.',
  ],
};

const HERO_IMAGE_LEFT =
  'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1000&q=80';
const HERO_IMAGE_RIGHT =
  'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1000&q=80';
const BG_DOODLES = ['💕', '🦩', '💘', '💞', '💌', '🫶'];

export default function DatingSetupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const flamingoMain = '#FF6FAE';

  const [step, setStep] = useState(1);
  const [intent, setIntent] = useState<DatingIntent>('serious');
  const [lookingFor, setLookingFor] = useState<DatingLookingFor>('everyone');
  const [promptOne, setPromptOne] = useState(PROMPT_CHOICES[0]);
  const [promptOneAnswer, setPromptOneAnswer] = useState('');
  const [promptTwo, setPromptTwo] = useState(PROMPT_CHOICES[1]);
  const [promptTwoAnswer, setPromptTwoAnswer] = useState('');
  const [openPromptPicker, setOpenPromptPicker] = useState<1 | 2 | null>(null);
  const [showIdeas, setShowIdeas] = useState(false);
  const [saving, setSaving] = useState(false);

  const canStepTwo = true;
  const canStepThree = promptOneAnswer.trim().length >= 6 && promptTwoAnswer.trim().length >= 6;
  const canFinish = canStepThree;

  const onSkip = async () => {
    if (user?.id) {
      await markDatingSetupSkipped(user.id);
    }
    router.replace('/(tabs)/discovery');
  };

  const onFinish = async () => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in first.');
      return;
    }
    if (!canFinish) {
      Alert.alert('Add your prompt answers', 'Please complete both prompt answers to continue.');
      return;
    }
    setSaving(true);
    try {
      await saveDatingSetup(user.id, {
        intent,
        lookingFor,
        prompts: [
          { prompt: promptOne, answer: promptOneAnswer.trim() },
          { prompt: promptTwo, answer: promptTwoAnswer.trim() },
        ],
        photos: [],
      });
      router.replace('/(tabs)/discovery');
    } catch {
      Alert.alert('Could not save setup', 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View pointerEvents="none" style={styles.bgDoodleLayer}>
        {BG_DOODLES.map((emoji, i) => (
          <Text key={`${emoji}:${i}`} style={[styles.bgDoodle, styles[`bgDoodle${i}` as keyof typeof styles] as any]}>
            {emoji}
          </Text>
        ))}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 24 }]}
      >
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.skipBtnTopLeft} onPress={onSkip} activeOpacity={0.9}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Set up your dating profile</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>Step {step} of 2</Text>
      </View>

      <View style={styles.progressTabs}>
        <TouchableOpacity
          style={[styles.progressTab, step === 1 && styles.progressTabActive]}
          activeOpacity={0.9}
          onPress={() => setStep(1)}
        >
          <Text style={[styles.progressTabText, step === 1 && styles.progressTabTextActive]}>1. Intent</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.progressTab, step === 2 && styles.progressTabActive, !canStepTwo && styles.progressTabDisabled]}
          activeOpacity={0.9}
          onPress={() => canStepTwo && setStep(2)}
        >
          <Text style={[styles.progressTabText, step === 2 && styles.progressTabTextActive]}>2. Prompts</Text>
        </TouchableOpacity>
      </View>

      {step === 1 ? (
        <View style={styles.card}>
          <View style={styles.heroVisualWrap}>
            <View style={[styles.heroDoodleCircle, styles.heroDoodleCircleLeft]} />
            <View style={[styles.heroDoodleCircle, styles.heroDoodleCircleRight]} />
            <View style={[styles.heroPhotoCard, styles.heroPhotoLeft]}>
              <ExpoImage source={{ uri: HERO_IMAGE_LEFT }} style={styles.heroPhotoImage} contentFit="cover" transition={250} />
            </View>
            <View style={[styles.heroPhotoCard, styles.heroPhotoRight]}>
              <ExpoImage source={{ uri: HERO_IMAGE_RIGHT }} style={styles.heroPhotoImage} contentFit="cover" transition={250} />
            </View>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>real vibes</Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dating intent</Text>
          {([
            ['serious', 'Serious relationship'],
            ['open', 'Open to dating'],
            ['vibing', 'Just vibing'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.choice, intent === value && styles.choiceActive]}
              onPress={() => setIntent(value)}
            >
              <Text style={styles.choiceText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <Text style={[styles.cardTitle, { color: colors.text, marginTop: 10 }]}>Looking for</Text>
          {([
            ['male', 'Male'],
            ['female', 'Female'],
            ['others', 'Others'],
            ['everyone', 'Everyone'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.choice, lookingFor === value && styles.choiceActive]}
              onPress={() => setLookingFor(value)}
            >
              <Text style={styles.choiceText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.nextBtn, { backgroundColor: flamingoMain }]} onPress={() => canStepTwo && setStep(2)}>
            <Text style={styles.nextText}>Next</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Add prompts</Text>
          <TouchableOpacity
            style={styles.ideasToggle}
            activeOpacity={0.9}
            onPress={() => setShowIdeas((v) => !v)}
          >
            <Text style={styles.ideasToggleText}>{showIdeas ? 'Hide ideas' : 'Need ideas?'}</Text>
          </TouchableOpacity>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Prompt 1</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.selectBtn}
            onPress={() => setOpenPromptPicker(openPromptPicker === 1 ? null : 1)}
          >
            <Text style={styles.selectBtnText}>{promptOne}</Text>
            <Text style={styles.selectCaret}>▼</Text>
          </TouchableOpacity>
          {openPromptPicker === 1 ? (
            <View style={styles.dropdown}>
              {PROMPT_CHOICES.map((choice) => (
                <TouchableOpacity
                  key={`p1:${choice}`}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setPromptOne(choice);
                    setOpenPromptPicker(null);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{choice}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TextInput
            value={promptOneAnswer}
            onChangeText={setPromptOneAnswer}
            style={[styles.input, styles.multi, { color: colors.text }]}
            placeholder="Write your answer..."
            placeholderTextColor={colors.textTertiary}
            multiline
          />
          {showIdeas ? (
            <View style={styles.presetWrap}>
              {(PROMPT_ANSWER_PRESETS[promptOne] || []).map((preset) => (
                <TouchableOpacity
                  key={`preset1:${preset}`}
                  style={styles.presetChip}
                  activeOpacity={0.9}
                  onPress={() => setPromptOneAnswer(preset)}
                >
                  <Text style={styles.presetChipText} numberOfLines={2}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Prompt 2</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.selectBtn}
            onPress={() => setOpenPromptPicker(openPromptPicker === 2 ? null : 2)}
          >
            <Text style={styles.selectBtnText}>{promptTwo}</Text>
            <Text style={styles.selectCaret}>▼</Text>
          </TouchableOpacity>
          {openPromptPicker === 2 ? (
            <View style={styles.dropdown}>
              {PROMPT_CHOICES.map((choice) => (
                <TouchableOpacity
                  key={`p2:${choice}`}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setPromptTwo(choice);
                    setOpenPromptPicker(null);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{choice}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TextInput
            value={promptTwoAnswer}
            onChangeText={setPromptTwoAnswer}
            style={[styles.input, styles.multi, { color: colors.text }]}
            placeholder="Write your answer..."
            placeholderTextColor={colors.textTertiary}
            multiline
          />
          {showIdeas ? (
            <View style={styles.presetWrap}>
              {(PROMPT_ANSWER_PRESETS[promptTwo] || []).map((preset) => (
                <TouchableOpacity
                  key={`preset2:${preset}`}
                  style={styles.presetChip}
                  activeOpacity={0.9}
                  onPress={() => setPromptTwoAnswer(preset)}
                >
                  <Text style={styles.presetChipText} numberOfLines={2}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.smallBtn, styles.ghostBtn]} onPress={() => setStep(1)}>
              <Text style={styles.ghostText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: flamingoMain }, saving && styles.disabledBtn]}
              onPress={onFinish}
              disabled={saving}
            >
              <Text style={styles.nextText}>{saving ? 'Saving...' : 'Finish'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    paddingBottom: 40,
    minHeight: '100%',
    justifyContent: 'flex-start',
  },
  bgDoodleLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  bgDoodle: {
    position: 'absolute',
    opacity: 0.12,
    fontSize: 18,
  },
  bgDoodle0: { top: '10%', left: '8%' },
  bgDoodle1: { top: '18%', right: '8%' },
  bgDoodle2: { top: '34%', left: '6%' },
  bgDoodle3: { top: '52%', right: '10%' },
  bgDoodle4: { top: '70%', left: '12%' },
  bgDoodle5: { top: '86%', right: '18%' },
  header: {
    alignItems: 'center',
    marginBottom: 6,
  },
  topActions: {
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  skipBtnTopLeft: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,111,174,0.14)',
  },
  skipText: {
    color: '#FFD8EA',
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  sub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressTabs: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  progressTab: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  progressTabActive: {
    backgroundColor: 'rgba(255,111,174,0.22)',
    borderColor: 'rgba(255,111,174,0.52)',
  },
  progressTabDisabled: {
    opacity: 0.7,
  },
  progressTabText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  progressTabTextActive: {
    color: '#FFD8EA',
  },
  card: {
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(30,41,59,0.55)',
  },
  heroVisualWrap: {
    marginBottom: 12,
    height: 180,
    justifyContent: 'center',
  },
  heroDoodleCircle: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
  },
  heroDoodleCircleLeft: {
    width: 84,
    height: 84,
    left: 8,
    bottom: 10,
  },
  heroDoodleCircleRight: {
    width: 72,
    height: 72,
    right: 10,
    top: 8,
  },
  heroPhotoCard: {
    position: 'absolute',
    width: 108,
    height: 150,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroPhotoLeft: {
    left: 16,
    bottom: 0,
    transform: [{ rotate: '-6deg' }],
  },
  heroPhotoRight: {
    right: 16,
    bottom: 6,
    transform: [{ rotate: '7deg' }],
  },
  heroPhotoImage: {
    width: '100%',
    height: '100%',
  },
  heroChip: {
    position: 'absolute',
    left: '50%',
    top: 8,
    transform: [{ translateX: -40 }],
    minWidth: 80,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(236,72,153,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  choice: {
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  choiceActive: {
    backgroundColor: '#FF6FAE',
  },
  choiceText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  nextBtn: {
    marginTop: 8,
    backgroundColor: '#FF6FAE',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    marginBottom: 5,
    fontWeight: '600',
  },
  ideasToggle: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,111,174,0.18)',
  },
  ideasToggleText: {
    color: '#FFD8EA',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  selectBtn: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,111,174,0.08)',
  },
  selectBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  selectCaret: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
  },
  dropdown: {
    marginTop: -6,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.95)',
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.16)',
  },
  dropdownItemText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    backgroundColor: 'rgba(255,111,174,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  presetChipText: {
    color: '#FFD8EA',
    fontSize: 12,
    fontWeight: '700',
  },
  multi: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  smallBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FF6FAE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtn: {
    backgroundColor: '#1E1B3A',
  },
  ghostText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.7,
  },
});
