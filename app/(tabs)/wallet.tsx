import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import WalletScreen from '../../components/WalletScreen';
import { setupWalletSystem } from '../../utils/setupWalletSystem';
import { error } from '../../utils/productionLogger';

export default function WalletTabScreen() {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const [walletReady, setWalletReady] = useState(false);

  React.useEffect(() => {
    initializeWallet();
  }, []);

  const initializeWallet = async () => {
    try {
      const result = await setupWalletSystem();
      if (result.success) {
        setWalletReady(true);
      } else {
        Alert.alert('Wallet Setup', result.error || 'Failed to setup wallet system');
      }
    } catch (err) {
      error('Error initializing wallet:', err);
      Alert.alert('Error', 'Failed to initialize wallet system');
    }
  };

  if (!walletReady) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <WalletScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
