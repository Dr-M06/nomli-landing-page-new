import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { X, Lock } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily, FontSizes, Spacing, BorderRadius } from '../constants/Theme';

interface LikesPrivacyModalProps {
  visible: boolean;
  onClose: () => void;
}

const LikesPrivacyModal: React.FC<LikesPrivacyModalProps> = ({ visible, onClose }) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.overlayPressable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: themeColors.neutral.card,
              shadowColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.2)',
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: themeColors.primary.main + '20' }]}>
              <Lock size={24} color={themeColors.primary.main} />
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: themeColors.neutral.backgroundAlt }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={themeColors.neutral.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.title, { color: themeColors.neutral.text }]}>
              This Information Is Private
            </Text>
            <Text style={[styles.description, { color: themeColors.neutral.textSecondary }]}>
              To protect user privacy, we keep the list of people who bookmarked, followed, or are following private. Only the content creator or profile owner can see these details.
            </Text>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: themeColors.primary.main }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>
              Got it
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: 24,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    marginBottom: 24,
  },
  title: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    lineHeight: 22,
    textAlign: 'center',
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.semiBold,
  },
});

export default LikesPrivacyModal;
