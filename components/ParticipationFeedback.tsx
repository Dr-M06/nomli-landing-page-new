import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Shadow, Spacing } from '../constants/Theme';

type ParticipationFeedbackProps = {
  visible: boolean;
  type: 'join' | 'leave';
  eventTitle: string;
  onClose: () => void;
  autoCloseTime?: number; // Time in ms until auto-close
};

export default function ParticipationFeedback({
  visible,
  type,
  eventTitle,
  onClose,
  autoCloseTime = 2000
}: ParticipationFeedbackProps) {
  // Animation for fade in/out
  const opacity = React.useRef(new Animated.Value(0)).current;
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Handle closing with animation
  const handleClose = () => {
    // Prevent additional calls if already closing
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    Animated.timing(opacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      onClose();
    });
  };
  
  useEffect(() => {
    // Only set up animation and timer when visibility changes
    if (visible) {
      // Fade in when visible
      opacity.setValue(0); // Reset animation value
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }).start();
      
      // Auto close after specified time
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      
      timerRef.current = setTimeout(() => {
        handleClose();
      }, autoCloseTime);
    }
    
    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible]); // Only run when visibility changes
  
  if (!visible) return null;
  
  const isJoining = type === 'join';
  const backgroundColor = isJoining ? Colors.success.main : Colors.error.main;
  const iconColor = Colors.neutral.white;
  const titleText = isJoining ? 'You joined' : 'You left';
  
  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View 
          style={[
            styles.container,
            { backgroundColor, opacity }
          ]}
        >
          <View style={styles.iconContainer}>
            {isJoining ? (
              <Check size={24} color={iconColor} />
            ) : (
              <X size={24} color={iconColor} />
            )}
          </View>
          
          <View style={styles.textContainer}>
            <Text style={styles.title}>{titleText}</Text>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {eventTitle}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={handleClose}
          >
            <X size={20} color={iconColor} />
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    ...Shadow.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.subhead,
    fontFamily: FontFamily.medium,
    color: Colors.neutral.white,
  },
  eventTitle: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    color: Colors.neutral.white,
    opacity: 0.9,
  },
  closeButton: {
    padding: Spacing.xs,
  }
}); 