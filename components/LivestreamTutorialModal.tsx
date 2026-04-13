import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import {
  X,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Eye,
  Settings,
  Users,
  Shield,
  BarChart3,
  Bell,
  BellOff,
  Volume2,
  Sparkles,
  MessageSquare,
  Pin,
  Heart,
  ChevronRight,
  ChevronLeft,
  Minimize2,
  Maximize2,
  Music,
  Menu,
  UserPlus,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

const { width, height } = Dimensions.get('window');

interface LivestreamTutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

interface TutorialStep {
  title: string;
  icon: React.ReactNode;
  description: string;
  tips?: string[];
}

function LivestreamTutorialModal({
  visible,
  onClose,
}: LivestreamTutorialModalProps) {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const [currentStep, setCurrentStep] = useState(0);

  const tutorialSteps: TutorialStep[] = [
    {
      title: 'Welcome to Livestream!',
      icon: <Video size={48} color="#9146FF" />,
      description: 'Learn how to use all the features of your livestream. Swipe through to explore each feature.',
      tips: [
        'Access the control drawer by tapping the menu button',
        'All controls are organized in the drawer for easy access',
        'You can always access this guide from the settings menu',
      ],
    },
    {
      title: 'Control Drawer',
      icon: <Menu size={40} color="#9146FF" />,
      description: 'Access all your stream controls from the organized control drawer.',
      tips: [
        'Tap the menu button to open the control drawer',
        'The drawer contains all your controls in organized sections',
        'Guests, Analytics, and Moderator tools are in the top row',
        'Sound effects and reactions are in the middle rows',
        'Camera, mic, and flip controls are at the bottom',
        'Tap outside or use the close button to dismiss',
      ],
    },
    {
      title: 'Camera & Microphone',
      icon: <Video size={40} color="#00D9FF" />,
      description: 'Control your video and audio with the camera and mic buttons in the control drawer.',
      tips: [
        'Tap the camera icon to turn your video on/off',
        'Tap the mic icon to mute/unmute your audio',
        'Use the flip button to switch between front and back camera',
        'You can still interact with comments even when camera/mic is off',
        'All media controls are in the control drawer',
      ],
    },
    {
      title: 'Co-hosts & Guests',
      icon: <UserPlus size={40} color="#00D9FF" />,
      description: 'Invite viewers to join as co-hosts! You can have up to 1 co-host at a time.',
      tips: [
        'Open the control drawer and tap "Guests" to manage co-hosts',
        'Invite viewers from comments by tapping the invite button',
        'Viewers can also send join requests to become co-hosts',
        'Mute or unmute your co-host\'s audio anytime',
        'Remove co-hosts if needed from the guest management modal',
        'Co-hosts appear in a multi-video layout alongside you',
      ],
    },
    {
      title: 'Comments',
      icon: <MessageSquare size={40} color="#FFD700" />,
      description: 'View and interact with all viewer messages in the comments section.',
      tips: [
        'Comments appear in the comments section below the stream',
        'Pin important comments so everyone sees them',
        'Reply to comments by tapping the reply icon',
        'Invite commenters to join as co-hosts directly from comments',
        'View all comments in real-time as viewers send them',
        'Comments are displayed with usernames and timestamps',
      ],
    },
    {
      title: 'Pin Comments',
      icon: <Pin size={40} color="#FFD700" fill="#FFD700" />,
      description: 'Pin important comments so all viewers can see them!',
      tips: [
        'Only you (the streamer) can pin comments',
        'Tap the pin icon on any comment to pin it',
        'Pinned comments appear at the top of the comment list',
        'All viewers will see the pinned comment prominently',
        'Only one comment can be pinned at a time',
      ],
    },
    {
      title: 'Viewer List',
      icon: <Eye size={40} color="#00D9FF" />,
      description: 'See who\'s watching your stream and manage your audience.',
      tips: [
        'Tap the eye icon in the header to see all viewers',
        'View real-time viewer count',
        'See who joined recently',
        'Manage moderators from the viewer list',
        'The viewer count adjusts when you have co-hosts',
      ],
    },
    {
      title: 'Moderation Tools',
      icon: <Shield size={40} color="#FF3B30" />,
      description: 'Keep your stream safe with moderation tools. Warn or kick problematic viewers.',
      tips: [
        'Access moderation from the control drawer',
        'Assign moderators to help manage your stream',
        'Warn viewers with custom messages',
        'Kick viewers who violate community guidelines',
        'Moderators can also help moderate comments',
      ],
    },
    {
      title: 'Analytics',
      icon: <BarChart3 size={40} color="#8A2BE2" />,
      description: 'Track your stream performance with real-time analytics.',
      tips: [
        'Access analytics from the control drawer',
        'View viewer count over time',
        'See peak viewer moments',
        'Track engagement metrics',
        'Monitor stream duration',
        'View analytics anytime during your stream',
      ],
    },
    {
      title: 'Sound Effects & Reactions',
      icon: <Volume2 size={40} color="#FF3B30" />,
      description: 'Engage your audience with sound effects and reactions from the control drawer!',
      tips: [
        'Honk: Play a honk sound effect with floating reactions',
        'Splash: Play applause sound with sparkle effects',
        'Laugh: Trigger floating laugh emoji reactions',
        'Toggle sounds on/off with the bell button',
        'Viewers will hear the sounds when you trigger them',
        'Sounds work alongside your stream audio without interruption',
      ],
    },
    {
      title: 'Music Mode & Song Requests',
      icon: <Music size={40} color="#A78BFA" />,
      description: 'Enable music mode to let viewers request songs during your stream!',
      tips: [
        'Toggle music mode when creating your stream',
        'Viewers can request songs using the music button',
        'Song requests appear in comments with a special badge',
        'View all song requests in the dedicated section',
        'Perfect for DJ streams, karaoke, or music-focused content',
      ],
    },
    {
      title: 'Gifts & Reactions',
      icon: <Heart size={40} color="#FF3B30" />,
      description: 'Viewers can send you gifts and reactions during the stream.',
      tips: [
        'See recent gift senders in the header',
        'Gift animations appear on screen with beautiful effects',
        'Viewers can tap the heart button to send floating heart reactions',
        'In music mode, hearts trigger disco bubble effects',
        'All interactions are tracked in analytics',
      ],
    },
    {
      title: '18+ Content Badge',
      icon: <Shield size={40} color="#FF3B30" />,
      description: 'Mark your stream as 18+ if it contains mature content.',
      tips: [
        'Toggle 18+ content when creating your stream',
        'An 18+ badge will appear on your stream thumbnail',
        'Helps protect younger viewers from inappropriate content',
        'Required for streams with mature themes, language, or situations',
        'The badge appears on the homescreen and in the stream',
      ],
    },
    {
      title: 'Clear Screen Mode',
      icon: <Minimize2 size={40} color="#00D9FF" />,
      description: 'Hide all UI elements except the viewer count and comments for a cleaner view.',
      tips: [
        'Tap the minimize button next to the eye icon to enter clear screen mode',
        'Or long-press the eye icon to toggle clear screen mode',
        'In clear screen mode, only viewer count and comments are visible',
        'Tap the maximize button to exit clear screen mode',
        'Perfect for focusing on your content while keeping essential info visible',
      ],
    },
  ];

  const nextStep = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  const currentStepData = tutorialSteps[currentStep];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>
                Livestream Guide
              </Text>
              <Text style={styles.stepIndicator}>
                {currentStep + 1} / {tutorialSteps.length}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color="#000000" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${((currentStep + 1) / tutorialSteps.length) * 100}%`,
                  backgroundColor: '#9146FF',
                },
              ]}
            />
          </View>

          {/* Content */}
          <View style={styles.contentWrapper}>
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
              {/* Icon */}
              <View style={styles.iconContainer}>
                {currentStepData.icon}
              </View>

            {/* Title */}
            <Text style={styles.title}>
              {currentStepData.title}
            </Text>

            {/* Description */}
            <Text style={styles.description}>
              {currentStepData.description}
            </Text>

            {/* Tips */}
            {currentStepData.tips && currentStepData.tips.length > 0 && (
              <View style={styles.tipsContainer}>
                <Text style={styles.tipsTitle}>
                  Quick Tips:
                </Text>
                {currentStepData.tips.map((tip, index) => (
                  <View key={index} style={styles.tipItem}>
                    <View style={styles.tipBullet} />
                    <Text style={styles.tipText}>
                      {tip}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            </ScrollView>
          </View>

          {/* Step Indicators (Dots) */}
          <View style={styles.dotsContainer}>
            {tutorialSteps.map((_, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => goToStep(index)}
                style={[
                  styles.dot,
                  index === currentStep && styles.dotActive,
                  {
                    backgroundColor:
                      index === currentStep ? '#9146FF' : '#E0E0E0',
                  },
                ]}
              />
            ))}
          </View>

          {/* Navigation Buttons */}
          <View style={styles.navigation}>
            <TouchableOpacity
              onPress={prevStep}
              disabled={currentStep === 0}
              style={[
                styles.navButton,
                styles.navButtonLeft,
                currentStep === 0 && styles.navButtonDisabled,
                { backgroundColor: '#F5F5F5' },
              ]}
            >
              <ChevronLeft
                size={20}
                color={currentStep === 0 ? '#999999' : '#000000'}
              />
              <Text
                style={[
                  styles.navButtonText,
                  {
                    color: currentStep === 0 ? '#999999' : '#000000',
                  },
                ]}
              >
                Previous
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={nextStep}
              style={[
                styles.navButton,
                styles.navButtonRight,
                { backgroundColor: '#9146FF' },
              ]}
            >
              <Text style={[styles.navButtonText, { color: '#FFFFFF' }]}>
                {currentStep === tutorialSteps.length - 1 ? 'Got it!' : 'Next'}
              </Text>
              {currentStep < tutorialSteps.length - 1 && (
                <ChevronRight size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export { LivestreamTutorialModal };
export default LivestreamTutorialModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    height: height * 0.75,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    color: '#000000',
  },
  stepIndicator: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  contentWrapper: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingVertical: 4,
    minHeight: 50,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#000000',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    color: '#333333',
  },
  tipsContainer: {
    marginTop: 8,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000000',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    marginRight: 12,
    backgroundColor: '#9146FF',
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#333333',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
  navigation: {
    flexDirection: 'row',
    padding: 20,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  navButtonLeft: {
    // Left button styles
  },
  navButtonRight: {
    // Right button styles
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

