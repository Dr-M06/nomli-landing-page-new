import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity, Alert } from 'react-native';
import UserBadge, { UserBadgeData } from './UserBadge';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

interface UserBadgesListProps {
  badges: UserBadgeData[];
  size?: 'small' | 'medium' | 'large';
  showLabels?: boolean;
  style?: any;
}

const UserBadgesList: React.FC<UserBadgesListProps> = ({
  badges,
  size = 'medium',
  showLabels = false,
  style,
}) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [selectedBadge, setSelectedBadge] = useState<UserBadgeData | null>(null);

  const handleBadgePress = (badge: UserBadgeData) => {
    setSelectedBadge(badge);
  };

  const closeModal = () => {
    setSelectedBadge(null);
  };

  const getBadgeDescription = (badge: UserBadgeData): string => {
    if (badge.badge_description) {
      return badge.badge_description;
    }
    // Fallback descriptions
    switch (badge.badge_key) {
      case 'top_gifter':
        return 'Regularly sends tokens to support others';
      case 'early_user':
        return 'Joined during the early days of the platform';
      default:
        return 'A special achievement badge';
    }
  };

  if (!badges || badges.length === 0) {
    return null;
  }

  return (
    <>
      <View style={[styles.container, style]}>
        {showLabels ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
            {badges.map((badge, index) => (
              <View key={index} style={styles.badgeWithLabel}>
                <UserBadge 
                  badge={badge} 
                  size={size} 
                  onPress={() => handleBadgePress(badge)}
                />
                <Text style={styles.badgeLabel}>{badge.badge_name}</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.badgesRow}>
            {badges.map((badge, index) => (
              <UserBadge 
                key={index} 
                badge={badge} 
                size={size} 
                style={styles.badgeItem}
                onPress={() => handleBadgePress(badge)}
              />
            ))}
          </View>
        )}
      </View>

      {/* Badge Info Modal */}
      <Modal
        visible={selectedBadge !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeModal}
        >
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: themeColors.neutral.card }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedBadge && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: themeColors.neutral.text }]}>
                    {selectedBadge.badge_name}
                  </Text>
                  <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                    <X size={20} color={themeColors.neutral.text} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.badgePreviewContainer}>
                  <UserBadge badge={selectedBadge} size="large" />
                </View>

                <Text style={[styles.badgeDescription, { color: themeColors.neutral.subtext }]}>
                  {getBadgeDescription(selectedBadge)}
                </Text>

                <TouchableOpacity
                  style={[styles.closeButtonBottom, { backgroundColor: themeColors.primary.main }]}
                  onPress={closeModal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.closeButtonText}>Got it</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollView: {
    flexGrow: 0,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeItem: {
    marginRight: 4,
  },
  badgeWithLabel: {
    alignItems: 'center',
    marginRight: 12,
    minWidth: 60,
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  badgePreviewContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badgeDescription: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  closeButtonBottom: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default UserBadgesList;

