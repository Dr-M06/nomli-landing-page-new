import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  AlertTriangle, 
  X, 
  Check, 
  FileText, 
  Shield, 
  Move,
  ChevronRight,
  ChevronLeft
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_MAX_WIDTH = 400;
const MODAL_WIDTH = Math.min(SCREEN_WIDTH * 0.9, MODAL_MAX_WIDTH);

interface ProgressiveLivestreamTermsModalProps {
  visible: boolean;
  onAgree: () => void;
  onCancel: () => void;
}

const TOTAL_STEPS = 3;

export default function ProgressiveLivestreamTermsModal({
  visible,
  onAgree,
  onCancel,
}: ProgressiveLivestreamTermsModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [currentStep, setCurrentStep] = useState(1);
  const [agreed, setAgreed] = useState(false);
  
  const slideAnim = useSharedValue(0);
  const stepAnim = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      slideAnim.value = withTiming(1, { duration: 300 });
      setCurrentStep(1);
      setAgreed(false);
      stepAnim.value = 0;
    } else {
      slideAnim.value = 0;
    }
  }, [visible]);

  React.useEffect(() => {
    stepAnim.value = withTiming(currentStep - 1, { duration: 300 });
  }, [currentStep]);

  const slideStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      stepAnim.value,
      [0, 1, 2],
      [0, -MODAL_WIDTH, -MODAL_WIDTH * 2]
    );
    return {
      transform: [{ translateX }],
    };
  });

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else if (agreed) {
      onAgree();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    setCurrentStep(1);
    setAgreed(false);
    onCancel();
  };

  const renderStepIndicator = () => {
    return (
      <View style={styles.stepIndicator}>
        {[1, 2, 3].map((step) => (
          <View
            key={step}
            style={[
              styles.stepDot,
              {
                backgroundColor:
                  step === currentStep
                    ? themeColors.primary.main
                    : step < currentStep
                    ? themeColors.primary.main
                    : themeColors.neutral.surfaceVariant,
                width: step === currentStep ? 32 : 8,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  const renderStep1 = () => (
    <View style={styles.stepWrapper}>
      <View style={[styles.iconWrapper, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
        <FileText size={28} color="#3B82F6" strokeWidth={2} />
      </View>
      <Text style={[styles.stepTitle, { color: themeColors.textLight }]}>
        Terms & Conditions
      </Text>
      
      <View style={styles.contentBox}>
        <Text style={[styles.introText, { color: themeColors.textSecondary }]}>
          By going live, you agree to our community guidelines:
        </Text>
        
        <View style={styles.rulesList}>
          {[
            'You must be 18+ years old to stream',
            'No harmful, illegal, or inappropriate content',
            'Respect all community members and their privacy',
            'Follow platform rules and guidelines',
          ].map((rule, index) => (
            <View key={index} style={styles.ruleRow}>
              <View style={[styles.ruleNumberBadge, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                <Text style={styles.ruleNumber}>{index + 1}</Text>
              </View>
              <Text style={[styles.ruleText, { color: themeColors.textLight }]}>{rule}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepWrapper}>
      <View style={[styles.iconWrapper, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
        <Shield size={28} color="#FF9500" strokeWidth={2} />
      </View>
      <Text style={[styles.stepTitle, { color: themeColors.textLight }]}>
        18+ Content Toggle
      </Text>
      
      <View style={[styles.warningBox, { 
        backgroundColor: 'rgba(255, 149, 0, 0.1)', 
        borderColor: 'rgba(255, 149, 0, 0.3)' 
      }]}>
        <AlertTriangle size={28} color="#FF9500" strokeWidth={2.5} />
        <Text style={[styles.warningTitle, { color: themeColors.textLight }]}>
          Important: Mark 18+ Content
        </Text>
        <Text style={[styles.warningText, { color: themeColors.textSecondary }]}>
          If your stream contains{' '}
          <Text style={[styles.boldText, { color: themeColors.textLight }]}>
            mature themes, language, or situations
          </Text>
          {' '}intended for adult audiences, you{' '}
          <Text style={[styles.boldText, { color: '#FF9500' }]}>
            must toggle the 18+ option
          </Text>
          {' '}when creating your stream.
        </Text>
        <Text style={[styles.warningSubtext, { color: themeColors.textSecondary }]}>
          <Text style={[styles.boldText, { color: '#EF4444' }]}>
            Failure to mark 18+ content appropriately may result in account suspension.
          </Text>
          {'\n\n'}This helps protect younger viewers and ensures appropriate content labeling.
        </Text>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepWrapper}>
      <View style={[styles.iconWrapper, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
        <Move size={28} color="#8B5CF6" strokeWidth={2} />
      </View>
      <Text style={[styles.stepTitle, { color: themeColors.textLight }]}>
        UI Tips
      </Text>
      
      <View style={styles.tipsList}>
        {[
          {
            icon: Move,
            title: 'Moveable Icons',
            text: 'All icons and controls on the livestream screen can be moved around by dragging them. Customize your layout!',
          },
          {
            icon: Shield,
            title: 'Privacy Controls',
            text: 'Use the camera and microphone toggle buttons to control your stream privacy at any time.',
          },
          {
            icon: Check,
            title: 'Ready to Stream',
            text: 'Once you agree, you\'ll be able to start your livestream and connect with your audience!',
          },
        ].map((tip, index) => {
          const IconComponent = tip.icon;
          return (
            <View key={index} style={styles.tipCard}>
              <View style={[styles.tipIconWrapper, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                <IconComponent size={20} color="#8B5CF6" strokeWidth={2} />
              </View>
              <View style={styles.tipContent}>
                <Text style={[styles.tipTitle, { color: themeColors.textLight }]}>{tip.title}</Text>
                <Text style={[styles.tipText, { color: themeColors.textSecondary }]}>{tip.text}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setAgreed(!agreed)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: agreed ? themeColors.primary.main : 'transparent',
              borderColor: agreed ? themeColors.primary.main : themeColors.neutral.border,
            },
          ]}
        >
          {agreed && <Check size={16} color="#FFFFFF" strokeWidth={3} />}
        </View>
        <Text style={[styles.checkboxLabel, { color: themeColors.textLight }]}>
          I understand and agree to the terms
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: themeColors.neutral.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: themeColors.textLight }]}>
              Before You Go Live
            </Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.closeBtn}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <X size={20} color={themeColors.textSecondary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Step Indicator */}
          {renderStepIndicator()}

          {/* Content */}
          <View style={styles.contentArea}>
            <Animated.View style={[styles.slider, slideStyle]}>
              <View style={[styles.stepContainer, { width: MODAL_WIDTH }]}>
                {renderStep1()}
              </View>
              <View style={[styles.stepContainer, { width: MODAL_WIDTH }]}>
                {renderStep2()}
              </View>
              <View style={[styles.stepContainer, { width: MODAL_WIDTH }]}>
                {renderStep3()}
              </View>
            </Animated.View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={[styles.backBtn, { 
                  backgroundColor: themeColors.neutral.surfaceVariant,
                  borderColor: themeColors.neutral.border,
                }]}
                onPress={handleBack}
              >
                <ChevronLeft size={18} color={themeColors.textLight} strokeWidth={2.5} />
                <Text style={[styles.backBtnText, { color: themeColors.textLight }]}>
                  Back
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.nextBtn,
                {
                  backgroundColor:
                    currentStep === TOTAL_STEPS && !agreed
                      ? themeColors.neutral.surfaceVariant
                      : themeColors.primary.main,
                  opacity: currentStep === TOTAL_STEPS && !agreed ? 0.6 : 1,
                },
              ]}
              onPress={handleNext}
              disabled={currentStep === TOTAL_STEPS && !agreed}
            >
              <Text style={styles.nextBtnText}>
                {currentStep === TOTAL_STEPS ? 'Agree & Continue' : 'Next'}
              </Text>
              {currentStep < TOTAL_STEPS && (
                <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    width: '100%',
    height: '100%',
  },
  modal: {
    width: MODAL_WIDTH,
    borderRadius: 24,
    overflow: 'hidden',
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  stepDot: {
    height: 8,
    borderRadius: 4,
  },
  contentArea: {
    overflow: 'hidden',
    width: MODAL_WIDTH,
  },
  slider: {
    flexDirection: 'row',
  },
  stepContainer: {
    paddingHorizontal: 20,
  },
  stepWrapper: {
    alignItems: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  contentBox: {
    width: '100%',
  },
  introText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    lineHeight: 18,
    marginBottom: 12,
    textAlign: 'center',
  },
  rulesList: {
    gap: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ruleNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  ruleNumber: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FontFamily.medium,
    lineHeight: 18,
  },
  warningBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    gap: 10,
  },
  warningTitle: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    lineHeight: 18,
    textAlign: 'center',
  },
  boldText: {
    fontFamily: FontFamily.bold,
  },
  warningSubtext: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 4,
  },
  tipsList: {
    width: '100%',
    gap: 10,
    marginBottom: 12,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  tipIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
    marginBottom: 3,
  },
  tipText: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 90,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  nextBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
  },
});
