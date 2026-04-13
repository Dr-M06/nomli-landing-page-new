import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  I18nManager
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  backgroundColor?: string;
}

export const SwipeableRow = ({ children, onDelete, backgroundColor }: SwipeableRowProps) => {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.rightActionsContainer}>
        <Animated.View
          style={[
            styles.deleteAction,
            {
              transform: [{ translateX: trans }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              swipeableRef.current?.close();
              onDelete();
            }}
          >
            <Ionicons name="trash-outline" size={24} color="white" />
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={80}
      rightThreshold={40}
      renderRightActions={renderRightActions}
      overshootRight={false}
    >
      <View style={[styles.container, backgroundColor && { backgroundColor }]}>
        {children}
      </View>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  rightActionsContainer: {
    width: 80,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
  },
  deleteAction: {
    flex: 1,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteText: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
  },
}); 