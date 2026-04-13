import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Signal, SignalLow, SignalMedium, SignalHigh } from 'lucide-react-native';

interface NetworkQualityIndicatorProps {
  quality: number; // 0-6 (0=unknown, 1=bad, 2=poor, 3=fair, 4=good, 5=very good, 6=excellent)
  isLocal?: boolean;
  showText?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function NetworkQualityIndicator({ 
  quality, 
  isLocal = false,
  showText = true,
  size = 'medium'
}: NetworkQualityIndicatorProps) {
  const getQualityInfo = () => {
    if (quality <= 0) {
      return {
        color: '#8E8E93',
        text: 'Unknown',
        icon: Signal,
        bgColor: 'rgba(142, 142, 147, 0.2)',
      };
    } else if (quality <= 2) {
      return {
        color: '#FF3B30',
        text: 'Poor',
        icon: SignalLow,
        bgColor: 'rgba(255, 59, 48, 0.2)',
      };
    } else if (quality <= 4) {
      return {
        color: '#FFD60A',
        text: 'Good',
        icon: SignalMedium,
        bgColor: 'rgba(255, 214, 10, 0.2)',
      };
    } else {
      return {
        color: '#34C759',
        text: 'Excellent',
        icon: SignalHigh,
        bgColor: 'rgba(52, 199, 89, 0.2)',
      };
    }
  };

  const qualityInfo = getQualityInfo();
  const Icon = qualityInfo.icon;

  const sizeStyles = {
    small: {
      container: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 },
      icon: 10,
      text: { fontSize: 8 },
      dot: { width: 4, height: 4, borderRadius: 2 },
    },
    medium: {
      container: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
      icon: 16,
      text: { fontSize: 10 },
      dot: { width: 8, height: 8, borderRadius: 4 },
    },
    large: {
      container: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
      icon: 20,
      text: { fontSize: 12 },
      dot: { width: 10, height: 10, borderRadius: 5 },
    },
  };

  const currentSize = sizeStyles[size];

  return (
    <View style={[
      styles.container,
      currentSize.container,
      { backgroundColor: qualityInfo.bgColor }
    ]}>
      <Icon 
        size={currentSize.icon} 
        color={qualityInfo.color} 
        strokeWidth={2}
      />
      {showText && (
        <Text style={[styles.text, currentSize.text, { color: qualityInfo.color }]}>
          {qualityInfo.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginLeft: 4,
    fontWeight: '600',
  },
});

