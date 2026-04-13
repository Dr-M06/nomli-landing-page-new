import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';
import { MapPin, Shield, Users, Eye, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

interface LocationDisclosureModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SimpleLocationDisclosureModal({
  visible,
  onAccept,
  onDecline,
}: LocationDisclosureModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [hasReadDisclosure, setHasReadDisclosure] = useState(false);
  const router = useRouter();

  const handleAccept = () => {
    if (!hasReadDisclosure) {
      Alert.alert(
        'Please Read the Disclosure',
        'Please scroll through and read the complete location disclosure before proceeding.',
        [{ text: 'OK' }]
      );
      return;
    }
    onAccept();
  };

  const openPrivacyPolicy = () => {
    // Navigate to settings screen instead of external URL
    router.push('/settings');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View style={styles.container}>
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          style={StyleSheet.absoluteFillObject}
        />
        
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerOverlay} />
          <View style={styles.iconContainer}>
            <MapPin size={32} color={Colors.primary.main} />
          </View>
          <Text style={styles.title}>Location Access for Discover</Text>
          <Text style={styles.subtitle}>Enable location to find nearby users (approximate location only)</Text>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const isScrolledToBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 20;
            if (isScrolledToBottom && !hasReadDisclosure) {
              setHasReadDisclosure(true);
            }
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.disclosureCard}>
            <View style={styles.disclosureHeader}>
              <Shield size={24} color={Colors.primary.main} />
              <Text style={styles.disclosureTitle}>Why We Need Location Access</Text>
            </View>
            
            <Text style={styles.disclosureText}>
              We use your approximate location to help you discover nearby users on the Discover screen. This allows you to find and connect with people in your area.
            </Text>

            <View style={styles.privacySection}>
              <Text style={styles.privacyTitle}>Your Privacy is Protected</Text>
              <Text style={styles.privacyText}>
                • We only use approximate location (not exact coordinates){'\n'}
                • Location is only accessed when you use the Discover screen{'\n'}
                • We no longer request location when you open the app{'\n'}
                • You can turn off location anytime and still use all other app features{'\n'}
                • Discover screen requires location, but everything else works without it
              </Text>
            </View>

            <View style={styles.consentSection}>
              <Text style={styles.consentText}>
                By tapping "Allow Location Access" below, you consent to the collection and use of your approximate location data as described above. You can disable this anytime in your device settings and continue using all other app features.
              </Text>
              <TouchableOpacity onPress={openPrivacyPolicy} style={styles.privacyLink}>
                <Text style={styles.privacyLinkText}>Read our Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.readIndicator}>
            {hasReadDisclosure ? (
              <View style={styles.readIndicatorContent}>
                <CheckCircle size={16} color={Colors.success.main} />
                <Text style={styles.readIndicatorText}>Disclosure read</Text>
              </View>
            ) : (
              <Text style={styles.scrollPrompt}>Please scroll to read the complete disclosure</Text>
            )}
          </View>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.acceptButton,
                !hasReadDisclosure && styles.disabledButton
              ]}
              onPress={handleAccept}
              disabled={!hasReadDisclosure}
            >
              <LinearGradient
                colors={hasReadDisclosure ? [Colors.primary.main, Colors.primary.dark] : [Colors.neutral.light, Colors.neutral.medium]}
                style={styles.acceptButtonGradient}
              >
                <Text style={styles.acceptButtonText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  header: {
    paddingTop: 80,
    paddingBottom: 30,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    position: 'relative',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: BorderRadius.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 128, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    zIndex: 1,
  },
  title: {
    fontSize: FontSizes.heading,
    fontFamily: FontFamily.bold,
    color: 'white',
    textAlign: 'center',
    marginBottom: Spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    zIndex: 1,
  },
  subtitle: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    zIndex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  disclosureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  disclosureTitle: {
    fontSize: FontSizes.subheading,
    fontFamily: FontFamily.bold,
    color: '#1a1a2e',
    marginLeft: Spacing.sm,
  },
  disclosureText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: '#333333',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  featureList: {
    marginBottom: Spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  featureText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: '#333333',
    marginLeft: Spacing.sm,
    flex: 1,
    lineHeight: 22,
  },
  featureTitle: {
    fontFamily: FontFamily.medium,
    color: '#1a1a2e',
  },
  privacySection: {
    backgroundColor: 'rgba(0, 128, 128, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#008080',
  },
  privacyTitle: {
    fontSize: FontSizes.subheading,
    fontFamily: FontFamily.bold,
    color: '#008080',
    marginBottom: Spacing.xs,
  },
  privacyText: {
    fontSize: FontSizes.small,
    fontFamily: FontFamily.regular,
    color: '#444444',
    lineHeight: 20,
  },
  dataUsageSection: {
    marginBottom: Spacing.lg,
  },
  dataUsageTitle: {
    fontSize: FontSizes.subheading,
    fontFamily: FontFamily.bold,
    color: '#1a1a2e',
    marginBottom: Spacing.sm,
  },
  dataUsageText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: '#333333',
    lineHeight: 22,
  },
  consentSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  consentTitle: {
    fontSize: FontSizes.subheading,
    fontFamily: FontFamily.bold,
    color: '#1a1a2e',
    marginBottom: Spacing.sm,
  },
  consentText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    color: '#333333',
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  privacyLink: {
    alignSelf: 'flex-start',
  },
  privacyLinkText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: '#008080',
    textDecorationLine: 'underline',
  },
  footer: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  readIndicator: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  readIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readIndicatorText: {
    fontSize: FontSizes.small,
    fontFamily: FontFamily.medium,
    color: '#4CAF50',
    marginLeft: Spacing.xs,
  },
  scrollPrompt: {
    fontSize: FontSizes.small,
    fontFamily: FontFamily.regular,
    color: '#666666',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    maxWidth: 300,
    height: 52,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  acceptButton: {
    // Gradient will be applied via LinearGradient
  },
  acceptButtonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.medium,
    color: 'white',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
