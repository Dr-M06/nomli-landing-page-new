import React, { useRef, useEffect } from 'react';
import { Modal, View, TouchableOpacity, Animated, PanResponder, Dimensions } from 'react-native';
import WalletScreen from '../WalletScreen';

const screenHeight = Dimensions.get('window').height;
const DRAG_THRESHOLD = 100;

interface WalletModalProps {
  visible: boolean;
  onClose: () => void;
  themeColors: any;
  onRedeem: () => void;
}

export const WalletModalWithDrag: React.FC<WalletModalProps> = ({ visible, onClose, themeColors, onRedeem }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5 && gestureState.dy > 0;
      },
      onPanResponderGrant: () => {
        translateY.setOffset(translateY._value);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          const opacityValue = Math.max(0, 1 - (gestureState.dy / screenHeight));
          opacity.setValue(opacityValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        if (gestureState.dy > DRAG_THRESHOLD || gestureState.vy > 0.5) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: screenHeight,
              duration: 250,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }),
          ]).start(() => {
            translateY.setValue(0);
            opacity.setValue(1);
            onClose();
          });
        } else {
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 30,
              stiffness: 300,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              useNativeDriver: true,
              damping: 30,
              stiffness: 300,
            }),
          ]).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      opacity.setValue(1);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={() => {}}
      statusBarTranslucent={true}
    >
      <Animated.View 
        style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0, 0, 0, 0.5)', 
          justifyContent: 'flex-end',
          opacity: opacity
        }}
      >
        <TouchableOpacity 
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={{ 
            backgroundColor: themeColors.background, 
            borderTopLeftRadius: 24, 
            borderTopRightRadius: 24,
            maxHeight: '90%',
            minHeight: '80%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 10,
            transform: [{ translateY: translateY }],
          }}
        >
          <View 
            {...panResponder.panHandlers}
            style={{ 
              alignItems: 'center', 
              paddingTop: 12, 
              paddingBottom: 8,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          >
            <View style={{
              width: 40,
              height: 4,
              backgroundColor: themeColors.neutral?.border || 'rgba(0, 0, 0, 0.2)',
              borderRadius: 2,
            }} />
          </View>
          
          <View 
            style={{ flex: 1 }}
            pointerEvents="box-none"
          >
            <WalletScreen 
              key="wallet-screen" 
              onClose={onClose} 
              onRedeem={onRedeem}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};
