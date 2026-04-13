import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Wallet } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { WALLET_LEMON, WALLET_MINT, WALLET_MINT_BRIGHT } from '../constants/walletAccent';
import { getUserWallet, subscribeWalletChanges } from '../utils/walletService';
import { log, warn, error } from '../utils/productionLogger';


interface WalletButtonProps {
  onPress?: () => void;
  showBalance?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: any;
  variant?: 'default' | 'minimal' | 'premium';
}

const WalletButton: React.FC<WalletButtonProps> = ({
  onPress,
  showBalance = true,
  size = 'medium',
  style,
  variant = 'premium'
}) => {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scaleAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadWallet();

    // Refresh wallet balance immediately after any token balance change
    const unsubscribe = subscribeWalletChanges(() => {
      loadWallet(false);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const loadWallet = async (useCache = true) => {
    try {
      const walletData = await getUserWallet(undefined, useCache);
      setWallet(walletData);
    } catch (error) {
      error('Error loading wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTokens = (amount: number) => {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + 'K';
    }
    return amount.toString();
  };

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.96,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();

    onPress?.();
  };

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={WALLET_MINT} />
        </View>
      </View>
    );
  }

  if (variant === 'premium') {
    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.85}
          style={style}
        >
          <LinearGradient
            colors={
              isDarkMode
                ? ['rgba(159, 232, 212, 0.14)', 'rgba(107, 201, 176, 0.08)']
                : ['rgba(228, 235, 138, 0.16)', 'rgba(107, 201, 176, 0.1)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.premiumContainer}
          >
            <View style={styles.iconContainer}>
              <Wallet size={16} color={WALLET_MINT_BRIGHT} strokeWidth={2.5} />
            </View>
            {showBalance && (
              <View style={styles.balanceContainer}>
                <Text style={styles.balanceText}>
                  {formatTokens(wallet?.token_balance || 0)}
                </Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[styles.minimalContainer, style]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <Wallet size={16} color={WALLET_MINT_BRIGHT} strokeWidth={2.5} />
        {showBalance && (
          <Text style={styles.minimalText}>
            {formatTokens(wallet?.token_balance || 0)}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  loadingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(107, 201, 176, 0.1)',
  },
  premiumContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(107, 201, 176, 0.35)',
    gap: 6,
  },
  iconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(107, 201, 176, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceText: {
    fontSize: 13,
    fontWeight: '700',
    color: WALLET_LEMON,
    letterSpacing: -0.3,
  },
  minimalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(107, 201, 176, 0.1)',
    gap: 5,
  },
  minimalText: {
    fontSize: 12,
    fontWeight: '600',
    color: WALLET_LEMON,
    letterSpacing: -0.2,
  },
});

export default WalletButton;