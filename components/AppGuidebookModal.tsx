import React, { useState, useMemo, useEffect } from 'react';
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
  Coins,
  Heart,
  MessageSquare,
  Video,
  Calendar,
  MapPin,
  Users,
  Gift,
  Trophy,
  Wallet,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Shield,
  Globe,
  CreditCard,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react-native';
import Constants from 'expo-constants';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

const { width, height } = Dimensions.get('window');

interface AppGuidebookModalProps {
  visible: boolean;
  onClose: () => void;
}

interface GuideStep {
  title: string;
  icon: React.ReactNode;
  description: string;
  tips?: string[];
}

export default React.memo(function AppGuidebookModal({
  visible,
  onClose,
}: AppGuidebookModalProps) {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const [currentStep, setCurrentStep] = useState(0);

  // Reset to first step when modal closes
  useEffect(() => {
    if (!visible) {
      setCurrentStep(0);
    }
  }, [visible]);

  const guideSteps: GuideStep[] = useMemo(() => [
    {
      title: 'Welcome!',
      icon: <Sparkles size={48} color="#9146FF" />,
      description: 'Quick guide to using Nomli Mingle. Swipe to learn more.',
      tips: [
        'All features are accessible from the bottom tabs',
        'Tap any section to explore',
      ],
    },
    {
      title: 'Earn Tokens',
      icon: <Coins size={40} color="#FFD700" />,
      description: 'Earn tokens through the Contributors Program by engaging with posts.',
      tips: [
        'Like and comment on posts to earn points',
        'Check Daily Scoreboard to claim rewards',
        'Higher rank = more tokens',
      ],
    },
    {
      title: 'Wallet & Rewards',
      icon: <Wallet size={40} color="#00D9FF" />,
      description: 'View your token balance and redeem rewards.',
      tips: [
        'Tokens earned appear in your wallet',
        'Redeem tokens for airtime or data',
        'Purchase temporarily locked',
      ],
    },
    {
      title: 'Community Posts',
      icon: <MessageSquare size={40} color="#FF3B30" />,
      description: 'Share photos, videos, and connect with others.',
      tips: [
        'Create posts from the + tab',
        'Like and comment to engage',
        'View posts in the Community tab',
      ],
    },
    {
      title: 'Video & Audio Calls',
      icon: <Video size={40} color="#A78BFA" />,
      description: 'Make crystal-clear video or audio calls with your connections.',
      tips: [
        'Start calls from chat conversations',
        'Switch between video and audio',
        'Tap to toggle camera/mic',
      ],
    },
    {
      title: 'Events & Meetups',
      icon: <Calendar size={40} color="#00FF88" />,
      description: 'Create or join events to meet people.',
      tips: [
        'Create events from Events tab',
        'Browse upcoming events',
        'RSVP to join',
      ],
    },
    {
      title: 'Discover Nearby',
      icon: <MapPin size={40} color="#FF6B9D" />,
      description: 'Find people in your area or explore profiles.',
      tips: [
        'Enable location to find nearby users',
        'Browse profiles from anywhere',
        'Connect with people you like',
      ],
    },
    {
      title: 'Gifts & Reactions',
      icon: <Gift size={40} color="#FF3B30" />,
      description: 'Send gifts and reactions during livestreams.',
      tips: [
        'Tap heart to send reactions',
        'Send gifts to support streamers',
        'Gifts convert to tokens',
      ],
    },
    {
      title: 'Credit Me',
      icon: <CreditCard size={40} color="#00D9FF" />,
      description: 'Send any amount of tokens directly to other users.',
      tips: [
        'Tap "Credit Me" on any profile',
        'Choose any amount to send',
        'Recipient gets notified instantly',
      ],
    },
    {
      title: 'World Chat',
      icon: <Globe size={40} color="#A78BFA" />,
      description: 'Join the global chatroom to connect with people worldwide.',
      tips: [
        'Access from Messages tab',
        'Chat with users from all countries',
        'Pin and bookmark messages',
      ],
    },
    {
      title: 'Security & OTP',
      icon: <Shield size={40} color="#00FF88" />,
      description: 'Protect your account with two-factor authentication.',
      tips: [
        'Enable in Settings > Security',
        'Use authenticator app for codes',
        'Adds extra account protection',
      ],
    },
    {
      title: 'Privacy Settings',
      icon: <Eye size={40} color="#FF6B9D" />,
      description: 'Control who can see your profile and message you.',
      tips: [
        'Hide profile from Discover screen',
        'Turn off DMs to prevent messages',
        'Adjust in Settings anytime',
      ],
    },
    {
      title: 'Livestream FAQ',
      icon: <Video size={40} color="#FF0050" />,
      description: 'Everything you need to know about going live on Nomli Mingle.',
      tips: [
        'Anyone can go live - no requirements needed!',
        'Tap "Go Live" to start streaming immediately',
        'Add a title and description for your stream',
        'Enable music mode for song requests',
        'Mark as 18+ if your content is mature',
        'Invite viewers to join as co-hosts',
      ],
    },
    {
      title: 'About',
      icon: <Info size={40} color="#9146FF" />,
      description: `Version ${(Constants.expoConfig as any)?.version || '1.0.0'}`,
      tips: [
        'Visit nomlimingle.com for more info',
        'Terms, privacy policy available on website',
        'Contact: hello@nomli.cc',
        '© 2025 Nomli Mingle. All rights reserved.',
      ],
    },
  ], []);

  const nextStep = () => {
    if (currentStep < guideSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Reset to first step when finishing the guide
      setCurrentStep(0);
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

  const currentStepData = guideSteps[currentStep];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                App Guide
              </Text>
              <Text style={[styles.stepIndicator, { color: colors.textSecondary }]}>
                {currentStep + 1} / {guideSteps.length}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${((currentStep + 1) / guideSteps.length) * 100}%`,
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
              <Text style={[styles.title, { color: colors.text }]}>
                {currentStepData.title}
              </Text>

              {/* Description */}
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                {currentStepData.description}
              </Text>

              {/* Tips */}
              {currentStepData.tips && currentStepData.tips.length > 0 && (
                <View style={styles.tipsContainer}>
                  <Text style={[styles.tipsTitle, { color: colors.text }]}>
                    Quick Tips:
                  </Text>
                  {currentStepData.tips.map((tip, index) => (
                    <View key={index} style={styles.tipItem}>
                      <View style={[styles.tipBullet, { backgroundColor: currentStepData.title === 'Livestream FAQ' ? '#FF0050' : '#9146FF' }]} />
                      <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                        {tip}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              
              {/* Additional FAQ content for Livestream */}
              {currentStepData.title === 'Livestream FAQ' && (
                <View style={styles.faqContainer}>
                  <Text style={[styles.faqTitle, { color: colors.text }]}>
                    Common Questions:
                  </Text>
                  
                  <View style={styles.faqItem}>
                    <Text style={[styles.faqQuestion, { color: colors.text }]}>
                      Do I need followers to go live?
                    </Text>
                    <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>
                      No! Anyone can go live immediately. There are no follower requirements or account restrictions.
                    </Text>
                  </View>
                  
                  <View style={styles.faqItem}>
                    <Text style={[styles.faqQuestion, { color: colors.text }]}>
                      What do I need to start streaming?
                    </Text>
                    <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>
                      Just tap "Go Live" and add a title. You can start streaming right away - no profile completion or waiting period needed.
                    </Text>
                  </View>
                  
                  <View style={styles.faqItem}>
                    <Text style={[styles.faqQuestion, { color: colors.text }]}>
                      Can I invite viewers to join my stream?
                    </Text>
                    <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>
                      Yes! Enable "Allow Guests" when creating your stream, then invite viewers from comments to join as co-hosts.
                    </Text>
                  </View>
                  
                  <View style={styles.faqItem}>
                    <Text style={[styles.faqQuestion, { color: colors.text }]}>
                      What is music mode?
                    </Text>
                    <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>
                      Music mode lets viewers request songs during your stream. Perfect for DJ streams, karaoke, or music-focused content.
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>

          {/* Step Indicators (Dots) */}
          <View style={styles.dotsContainer}>
            {guideSteps.map((_, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => goToStep(index)}
                style={[
                  styles.dot,
                  index === currentStep && styles.dotActive,
                  {
                    backgroundColor:
                      index === currentStep ? '#9146FF' : colors.border,
                  },
                ]}
              />
            ))}
          </View>

          {/* Navigation Buttons */}
          <View style={[styles.navigation, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={prevStep}
              disabled={currentStep === 0}
              style={[
                styles.navButton,
                styles.navButtonLeft,
                currentStep === 0 && styles.navButtonDisabled,
                { backgroundColor: colors.border },
              ]}
            >
              <ChevronLeft
                size={20}
                color={currentStep === 0 ? colors.textSecondary : colors.text}
              />
              <Text
                style={[
                  styles.navButtonText,
                  {
                    color: currentStep === 0 ? colors.textSecondary : colors.text,
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
                {currentStep === guideSteps.length - 1 ? 'Got it!' : 'Next'}
              </Text>
              {currentStep < guideSteps.length - 1 && (
                <ChevronRight size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

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
    height: height * 0.7,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  stepIndicator: {
    fontSize: 12,
    fontWeight: '500',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarContainer: {
    height: 4,
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
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  tipsContainer: {
    marginTop: 8,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    marginRight: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
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
  faqContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  faqTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 4,
  },
});
