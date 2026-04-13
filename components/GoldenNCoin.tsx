import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GoldenNCoinProps {
  size?: number;
  showAmount?: boolean;
  amount?: number;
  style?: any;
}

export default function GoldenNCoin({ 
  size = 24, 
  showAmount = false, 
  amount = 0,
  style 
}: GoldenNCoinProps) {
  const coinSize = size;
  const fontSize = coinSize * 0.55;

  return (
    <View style={[styles.container, style]}>
      {/* Main coin */}
      <View style={[styles.coin, { 
        width: coinSize, 
        height: coinSize, 
        borderRadius: coinSize / 2 
      }]}>
        <LinearGradient
          colors={['#FFD700', '#FFA500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { 
            width: coinSize, 
            height: coinSize, 
            borderRadius: coinSize / 2 
          }]}
        >
          {/* Subtle shine effect */}
          <View style={[styles.shine, { 
            width: coinSize * 0.35, 
            height: coinSize * 0.35, 
            borderRadius: coinSize * 0.175,
            top: coinSize * 0.08,
            left: coinSize * 0.08
          }]} />
          
          {/* Centered N */}
          <View style={styles.textWrapper}>
            <Text style={[styles.letterN, { fontSize: fontSize }]}>N</Text>
          </View>
        </LinearGradient>
      </View>
      
      {/* Amount text */}
      {showAmount && (
        <Text style={[styles.amountText, { fontSize: coinSize * 0.35 }]}>
          {amount.toLocaleString()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coin: {
    // Subtle shadow for depth
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  textWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    zIndex: 2,
  },
  letterN: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontFamily: 'System',
    fontSize: 'inherit',
    textAlign: 'center',
    letterSpacing: -0.5,
    // Subtle text shadow for readability
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  shine: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 1,
  },
  amountText: {
    color: '#FFD700',
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
});