import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontSizes, Shadow } from '../constants/Theme';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type ReactionType = 'like' | 'laugh'; // Removed 'love' (pink heart) - only like (red heart) and laugh now

interface ReactionPickerProps {
  visible: boolean;
  onReactionSelect: (reaction: ReactionType) => void;
  onClose: () => void;
  position?: { x: number; y: number };
  currentReaction?: ReactionType | null;
}

const REACTIONS = [
  { type: 'like' as ReactionType, emoji: '⚡', label: 'Lightning' },
  { type: 'laugh' as ReactionType, emoji: '😂', label: 'Laugh' },
];

const ReactionPicker: React.FC<ReactionPickerProps> = ({
  visible,
  onReactionSelect,
  onClose,
  position = { x: SCREEN_WIDTH / 2, y: 200 },
  currentReaction = null,
}) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(null);
  
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      setSelectedReaction(null);
    }
  }, [visible]);

  const handleReactionPress = (reaction: ReactionType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedReaction(reaction);
    
    // Small delay for visual feedback, then select
    setTimeout(() => {
      onReactionSelect(reaction);
      onClose();
    }, 150);
  };

  const animatedStyle = {
    transform: [{ scale: scaleAnim }],
    opacity: opacityAnim,
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: themeColors.neutral.card,
              shadowColor: themeColors.neutral.text,
              left: Math.max(10, Math.min(position.x - 80, SCREEN_WIDTH - 170)),
              top: Math.max(10, Math.min(position.y - 60, Dimensions.get('window').height - 100)),
            },
            animatedStyle,
          ]}
          pointerEvents="box-none"
        >
          {REACTIONS.map((reaction) => (
            <TouchableOpacity
              key={reaction.type}
              style={[
                styles.reactionButton,
                (selectedReaction === reaction.type || currentReaction === reaction.type) &&
                  styles.reactionButtonSelected,
              ]}
              onPress={() => handleReactionPress(reaction.type)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{reaction.emoji}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: 'transparent',
  },
  container: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 24,
    ...Shadow.lg,
    elevation: 10,
  },
  reactionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  reactionButtonSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  emoji: {
    fontSize: 28,
  },
});

export default ReactionPicker;

