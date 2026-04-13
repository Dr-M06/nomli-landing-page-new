import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView, PanGestureHandler, NativeViewGestureHandler, State } from 'react-native-gesture-handler';
import { X, HelpCircle, Wallet as WalletIcon, Building2, Check, Clock, XCircle, CheckCheck, Coins } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import useAuth from '../hooks/useAuth';
import { getUserWallet, redeemTokens, getTokenRedemptions } from '../utils/walletService';
import { redeemEarnedTokens } from '../utils/dailyTokenRewards';
import { purchaseAirtime, purchaseDataBundle, validatePhoneNumber, getDataBundles, calculateAmountFromTokens, calculateTokensForAmount, NetworkBundle } from '../utils/airtimeService';
import { submitManualAirtimeRequest } from '../utils/manualAirtimeService';
import { UserWallet, TokenRedemption } from '../utils/walletService';
import { NIGERIAN_BANKS } from '../utils/flutterwavePayoutService';
import { log, warn, error } from '../utils/productionLogger';


const { width: screenWidth } = Dimensions.get('window');

interface RedemptionScreenProps {
  onClose?: () => void;
  redemptionMode?: 'wallet' | 'earned_tokens'; // New prop to distinguish redemption source
}

const RedemptionScreen: React.FC<RedemptionScreenProps> = ({ onClose, redemptionMode = 'wallet' }) => {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [redemptions, setRedemptions] = useState<TokenRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redemptionAmount, setRedemptionAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('flutterwave_bank');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [selectedBankCode, setSelectedBankCode] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  
  // Airtime/Data redemption state (for earned tokens)
  const [redemptionType, setRedemptionType] = useState<'airtime' | 'data'>('airtime');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE' | ''>('');
  const [selectedBundle, setSelectedBundle] = useState<NetworkBundle | null>(null);
  const [airtimeAmount, setAirtimeAmount] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const translateY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const redemptionMethods = [
    { id: 'flutterwave_bank', name: 'Bank Transfer (NGN)', description: '1-3 business days' },
    { id: 'flutterwave_usd', name: 'Bank Transfer (USD)', description: '1-3 business days' },
  ];

  useEffect(() => {
    log('🔄 [REDEEM] RedemptionScreen mounted');
    loadData();
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    return () => {
      log('🔄 [REDEEM] RedemptionScreen unmounted');
    };
  }, []);

  const loadData = async () => {
    try {
      // Only show loading if no data is currently displayed
      // During refresh, existing data stays visible
      if (!wallet) {
        setLoading(true);
      }
      const [walletData, redemptionsData] = await Promise.all([
        getUserWallet(),
        getTokenRedemptions()
      ]);

      setWallet(walletData);
      setRedemptions(redemptionsData);
    } catch (error) {
      error('Error loading redemption data:', error);
      Alert.alert('Error', 'Failed to load redemption data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      error('[Redemption] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationY, velocityY } = event.nativeEvent;
      
      if (translationY > 150 || velocityY > 1000) {
        // Close modal if dragged down enough or fast enough
        Animated.timing(translateY, {
          toValue: 1000,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          onClose?.();
        });
      } else {
        // Snap back
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }).start();
      }
    }
  };

  const handleRedemption = async () => {
    const amount = parseInt(redemptionAmount);
    
    // Minimum based on redemption mode
    const minAmount = redemptionMode === 'earned_tokens' ? 500 : 100;
    if (!amount || amount < minAmount) {
      const minMessage = redemptionMode === 'earned_tokens' 
        ? 'Minimum redemption for earned tokens is 500 tokens'
        : 'Minimum redemption is 100 tokens (₦1,500)';
      Alert.alert('Invalid Amount', minMessage);
      return;
    }

    // Check balance based on redemption mode
    const availableBalance = redemptionMode === 'earned_tokens' 
      ? (wallet?.earned_tokens_balance || 0)
      : (wallet?.token_balance || 0);
    
    if (amount > availableBalance) {
      Alert.alert('Insufficient Balance', `You don't have enough ${redemptionMode === 'earned_tokens' ? 'earned tokens' : 'tokens'}`);
      return;
    }
    
    // For earned tokens redemption, skip bank transfer flow
    if (redemptionMode === 'earned_tokens') {
      // Validation and processing handled in the earned tokens section below
      // This will be handled by the airtime/data purchase flow
    } else if (selectedMethod === 'flutterwave_bank' || selectedMethod === 'flutterwave_usd') {
      // For Flutterwave bank transfer, we need bank code and account number
      // Use separate fields for bank details
      const bankCode = selectedBankCode;
      const accountNum = accountNumber.trim();
      const accountNameValue = accountName.trim();

      if (!bankCode) {
        Alert.alert('Missing Bank', 'Please select your bank');
        return;
      }

      if (!accountNum) {
        Alert.alert('Missing Account Number', 'Please enter your bank account number');
        return;
      }

      if (!accountNameValue) {
        Alert.alert('Missing Account Name', 'Please enter the account holder name');
        return;
      }

      try {
        setRedeeming(true);
        
        // Handle earned tokens redemption differently (airtime/data)
        if (redemptionMode === 'earned_tokens') {
          // Validate phone number and network
          if (!phoneNumber.trim()) {
            Alert.alert('Missing Phone Number', 'Please enter your phone number');
            return;
          }

          const phoneValidation = validatePhoneNumber(phoneNumber);
          if (!phoneValidation.valid) {
            Alert.alert('Invalid Phone Number', phoneValidation.error || 'Please enter a valid phone number');
            return;
          }

          const finalNetwork = selectedNetwork || phoneValidation.network;
          if (!finalNetwork) {
            Alert.alert('Missing Network', 'Please select your network provider');
            return;
          }

          try {
            setRedeeming(true);
            
            // Calculate amount from tokens (1 token = ₦15)
            const ngnAmount = calculateAmountFromTokens(amount);
            
            let result: any;
            
            if (redemptionType === 'data') {
              // Purchase data bundle
              if (!selectedBundle) {
                Alert.alert('Missing Bundle', 'Please select a data bundle');
                setRedeeming(false);
                return;
              }

              // For data bundles, the bundle amount is in tokens (not NGN)
              // 500 tokens = 1GB, so selectedBundle.amount is the token cost
              const bundleTokenCost = selectedBundle.amount;
              
              if (bundleTokenCost > amount) {
                Alert.alert('Insufficient Tokens', `You need ${bundleTokenCost} tokens for ${selectedBundle.dataSize} data bundle`);
                setRedeeming(false);
                return;
              }

              // Submit manual data bundle request (for support to process)
              const requestResult = await submitManualAirtimeRequest(
                {
                  username: user.username || user.email || 'User',
                  phoneNumber: phoneValidation.formatted || phoneNumber,
                  network: finalNetwork as 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE',
                  amount: selectedBundle.amount * 15, // Convert tokens to NGN equivalent for display
                  tokenAmount: bundleTokenCost,
                  redemptionType: 'data',
                  bundleCode: selectedBundle.code,
                },
                user.id
              );

              if (requestResult.success) {
                Alert.alert(
                  'Request Submitted',
                  `Your data bundle request has been submitted successfully!\n\n` +
                  `Bundle: ${selectedBundle.dataSize}\n` +
                  `Phone: ${phoneValidation.formatted || phoneNumber}\n` +
                  `Network: ${finalNetwork}\n\n` +
                  `Our support team will process your request shortly. You'll be notified once it's completed.`
                );
                setRedemptionAmount('');
                setPhoneNumber('');
                setSelectedNetwork('');
                setSelectedBundle(null);
                setAirtimeAmount('');
                await loadData();
                result = { success: true, message: 'Request submitted successfully' };
              } else {
                Alert.alert('Error', requestResult.error || 'Failed to submit data bundle request');
                result = { success: false, error: requestResult.error };
              }
            } else {
              // Submit manual airtime request (for support to process)
              const airtimeAmountValue = parseInt(airtimeAmount) || ngnAmount;
              
              if (airtimeAmountValue < 50) {
                Alert.alert('Invalid Amount', 'Minimum airtime purchase is ₦50');
                setRedeeming(false);
                return;
              }

              // Recalculate tokens needed for the airtime amount
              const tokensNeeded = calculateTokensForAmount(airtimeAmountValue);
              
              if (tokensNeeded > amount) {
                Alert.alert('Insufficient Tokens', `You need ${tokensNeeded} tokens for ₦${airtimeAmountValue} airtime`);
                setRedeeming(false);
                return;
              }

              // Submit manual request instead of automatic purchase
              const requestResult = await submitManualAirtimeRequest(
                {
                  username: user.username || user.email || 'User',
                  phoneNumber: phoneValidation.formatted || phoneNumber,
                  network: finalNetwork as 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE',
                  amount: airtimeAmountValue,
                  tokenAmount: tokensNeeded,
                  redemptionType: 'airtime',
                },
                user.id
              );

              if (requestResult.success) {
                Alert.alert(
                  'Request Submitted',
                  `Your airtime request has been submitted successfully!\n\n` +
                  `Amount: ₦${airtimeAmountValue}\n` +
                  `Phone: ${phoneValidation.formatted || phoneNumber}\n` +
                  `Network: ${finalNetwork}\n\n` +
                  `Our support team will process your request shortly. You'll be notified once it's completed.`
                );
                setRedemptionAmount('');
                setPhoneNumber('');
                setSelectedNetwork('');
                setSelectedBundle(null);
                setAirtimeAmount('');
                await loadData(); // Refresh data
                result = { success: true, message: 'Request submitted successfully' };
              } else {
                Alert.alert('Error', requestResult.error || 'Failed to submit airtime request');
                result = { success: false, error: requestResult.error };
              }
            }
            
            if (result.success) {
              // Success already handled above for manual requests
              if (redemptionType === 'data') {
                // Data bundle handling remains the same for now
                Alert.alert(
                  'Success',
                  result.message || `Data bundle purchase successful!\n\n${result.amount} NGN data bundle credited to ${result.phoneNumber}`
                );
                setRedemptionAmount('');
                setPhoneNumber('');
                setSelectedNetwork('');
                setSelectedBundle(null);
                setAirtimeAmount('');
                await loadData();
              }
            } else {
              Alert.alert('Error', result.error || 'Failed to process ' + redemptionType);
            }
          } catch (error) {
            error('Error purchasing airtime/data:', error);
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to process purchase');
          } finally {
            setRedeeming(false);
          }
        } else {
          // Use Flutterwave payout service for regular wallet tokens
          const { initiatePayout, NIGERIAN_BANKS } = await import('../utils/flutterwavePayoutService');
          
          const currency = selectedMethod === 'flutterwave_bank' ? 'NGN' : 'USD';
          const result = await initiatePayout({
            tokenAmount: amount,
            currency: currency,
            bankCode: bankCode,
            accountNumber: accountNum,
            accountName: accountNameValue,
            narration: `Token redemption: ${amount} tokens`,
          });

          if (result.success) {
            Alert.alert(
              'Success', 
              `Payout initiated successfully!\n\nAmount: ${currency} ${Math.round(result.amount || 0)}\nFees: ${currency} ${Math.round(result.fees || 0)}\n\nYour tokens have been deducted. The payout will be processed within 1-3 business days.`
            );
            setRedemptionAmount('');
            setSelectedBankCode('');
            setAccountNumber('');
            setAccountName('');
            await loadData(); // Refresh data
          } else {
            Alert.alert('Error', result.error || 'Failed to initiate payout');
          }
        }
      } catch (error) {
        error('Error submitting redemption:', error);
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to submit redemption request');
      } finally {
        setRedeeming(false);
      }
    } else {
      // Fallback to old method for other payment types
      if (!payoutDetails.trim()) {
        Alert.alert('Missing Details', 'Please provide your payout details');
        return;
      }

      try {
        setRedeeming(true);
        const result = await redeemTokens(amount, selectedMethod, payoutDetails);
        
        if (result.success) {
          Alert.alert('Success', 'Redemption request submitted successfully!');
          setRedemptionAmount('');
          setPayoutDetails('');
          await loadData();
        } else {
          Alert.alert('Error', result.error || 'Failed to submit redemption request');
        }
      } catch (error) {
        error('Error submitting redemption:', error);
        Alert.alert('Error', 'Failed to submit redemption request');
      } finally {
        setRedeeming(false);
      }
    }
  };

  const formatTokens = (amount: number | undefined | null) => {
    if (amount == null || isNaN(amount)) {
      return '0';
    }
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + 'K';
    }
    return amount.toString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return 'time-outline';
      case 'approved':
        return 'checkmark-circle-outline';
      case 'rejected':
        return 'close-circle-outline';
      case 'completed':
        return 'checkmark-done-outline';
      default:
        return 'help-circle-outline';
    }
  };

  const getStatusColor = (status: string | undefined) => {
    if (!status) {
      return colors.textSecondary;
    }
    switch (status) {
      case 'pending':
        return '#FF9800';
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#F44336';
      case 'completed':
        return '#2196F3';
      default:
        return colors.textSecondary;
    }
  };

  if (loading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Drag Indicator - iOS only */}
            {Platform.OS === 'ios' && (
              <View style={[styles.dragIndicator, { top: insets.top + 8 }]}>
                <View style={styles.dragHandle} />
              </View>
            )}
            <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? insets.top + 8 : 12 }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>redeem</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
                <X size={18} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.text} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>loading...</Text>
        </View>
          </Animated.View>
      </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <Animated.View 
          style={[
            styles.content, 
            { 
              opacity: fadeAnim,
              transform: [{ translateY }]
            }
          ]}
        >
          {/* Drag Indicator and Header - iOS drag to close */}
          {Platform.OS === 'ios' ? (
            <PanGestureHandler
              onGestureEvent={onGestureEvent}
              onHandlerStateChange={onHandlerStateChange}
              activeOffsetY={10}
              failOffsetY={-10}
            >
              <Animated.View>
                <View style={[styles.dragIndicator, { top: insets.top + 8 }]}>
                  <View style={styles.dragHandle} />
                </View>
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>redeem</Text>
                  <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.helpButton} activeOpacity={0.7}>
                      <HelpCircle size={20} color={colors.textSecondary} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
                      <X size={18} color={colors.text} strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            </PanGestureHandler>
          ) : (
            <View style={[styles.header, { paddingTop: 12 }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>redeem</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.helpButton} activeOpacity={0.7}>
                  <HelpCircle size={20} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
                  <X size={18} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
            </View>
          )}

        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Balance Card */}
          <View style={[styles.balanceCard, { 
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
          }]}>
            <View style={styles.balanceHeader}>
              <LinearGradient
                colors={isDarkMode ? ['#FF6B9D', '#C44569'] : ['#FFA07A', '#FF6B9D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.balanceIcon}
              >
                <WalletIcon size={16} color="#fff" strokeWidth={2.5} />
              </LinearGradient>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                {redemptionMode === 'earned_tokens' ? 'earned tokens available' : 'token balance'}
              </Text>
            </View>
            <Text style={[styles.balanceAmount, { color: colors.text }]}>
              {formatTokens(
                redemptionMode === 'earned_tokens' 
                  ? (wallet?.earned_tokens_balance || 0)
                  : (wallet?.token_balance || 0)
              )}
            </Text>
            <Text style={[styles.balanceSubtext, { color: colors.textSecondary }]}>
              {redemptionMode === 'earned_tokens' ? 'earned tokens' : 'tokens'}
            </Text>
            {redemptionMode === 'earned_tokens' && (
              <Text style={[styles.balanceSubtext, { color: colors.textSecondary, marginTop: 4, fontSize: 10 }]}>
                Redeem as airtime or mobile data bundles
              </Text>
            )}
          </View>

          {/* Amount to Redeem */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>amount to redeem</Text>
            
            {/* Quick Amount Suggestions */}
            <View style={styles.quickAmountsContainer}>
              {[100, 250, 500, 1000, 2500].map((amount) => {
                // New pricing: 1 token = ₦15 = $0.01
                const ngnValue = (amount * 15).toFixed(0);
                const usdValue = Math.round(amount * 0.01);
                return (
                  <TouchableOpacity
                    key={amount}
                    style={[
                      styles.quickAmountChip,
                      {
                        backgroundColor: redemptionAmount === amount.toString() 
                          ? (isDarkMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.15)')
                          : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                        borderColor: redemptionAmount === amount.toString()
                          ? (isDarkMode ? 'rgba(102, 126, 234, 0.5)' : 'rgba(102, 126, 234, 0.4)')
                          : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
                      }
                    ]}
                    onPress={() => setRedemptionAmount(amount.toString())}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.quickAmountTokens,
                      { 
                        color: redemptionAmount === amount.toString() 
                          ? (isDarkMode ? '#667EEA' : '#667EEA')
                          : colors.text
                      }
                    ]}>
                      {amount}
                    </Text>
                    <View style={[styles.quickAmountUsd, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                      <Text style={{ color: colors.textSecondary }}>₦{ngnValue} / </Text>
                      <Coins size={12} color={colors.textSecondary} strokeWidth={2} />
                      <Text style={{ color: colors.textSecondary }}>{usdValue}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.inputContainer, { 
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
            }]}>
              <View style={styles.amountInputWrapper}>
                <Text style={[styles.tokenSymbol, { color: colors.textSecondary }]}>🪙</Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.text }]}
                  value={redemptionAmount}
                  onChangeText={setRedemptionAmount}
                  placeholder="custom amount"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  maxLength={10}
                />
                {redemptionAmount ? (
                  <View style={[styles.usdEquivalent, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                    <Text style={{ color: colors.textSecondary }}>
                      ≈ ₦{(parseFloat(redemptionAmount) * 15).toFixed(0)} / 
                    </Text>
                    <Coins size={12} color={colors.textSecondary} strokeWidth={2} />
                    <Text style={{ color: colors.textSecondary }}>
                      {Math.round(parseFloat(redemptionAmount) * 0.01)}
                    </Text>
                  </View>
                ) : null}
              </View>
              </View>
              <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
              {redemptionMode === 'earned_tokens' 
                ? 'minimum: 500 tokens (1GB data or ₦7,500 airtime) • 1 token = ₦15 airtime or 2MB data'
                : 'minimum: 100 tokens (₦1,500 / $1.00) • 1 token = ₦15 / $0.01'}
              </Text>
            </View>

            {/* Airtime/Data Selection (for earned tokens) */}
            {redemptionMode === 'earned_tokens' && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>redemption type</Text>
                <View style={styles.methodsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.methodOption,
                      {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        borderColor: redemptionType === 'airtime' 
                          ? (isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)')
                          : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
                        borderWidth: redemptionType === 'airtime' ? 1.5 : 1,
                      }
                    ]}
                    onPress={() => {
                      setRedemptionType('airtime');
                      setSelectedBundle(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.methodName, { color: colors.text }]}>Airtime</Text>
                    <Text style={[styles.methodDescription, { color: colors.textSecondary }]}>Mobile top-up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.methodOption,
                      {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        borderColor: redemptionType === 'data' 
                          ? (isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)')
                          : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
                        borderWidth: redemptionType === 'data' ? 1.5 : 1,
                      }
                    ]}
                    onPress={() => setRedemptionType('data')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.methodName, { color: colors.text }]}>Data Bundle</Text>
                    <Text style={[styles.methodDescription, { color: colors.textSecondary }]}>Mobile data</Text>
                  </TouchableOpacity>
                </View>

                {/* Phone Number Input */}
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>Phone Number</Text>
                <View style={[styles.inputContainer, { 
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
                }]}>
                  <TextInput
                    style={[styles.payoutInput, { color: colors.text }]}
                    value={phoneNumber}
                    onChangeText={(text) => {
                      setPhoneNumber(text);
                      // Auto-detect network
                      const validation = validatePhoneNumber(text);
                      if (validation.valid && validation.network) {
                        setSelectedNetwork(validation.network as any);
                      }
                    }}
                    placeholder="08012345678"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                    maxLength={15}
                  />
                </View>
                <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                  Enter your phone number (network will be auto-detected)
                </Text>

                {/* Network Selection */}
                {phoneNumber && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Network</Text>
                    <View style={styles.quickAmountsContainer}>
                      {(['MTN', 'AIRTEL', 'GLO', '9MOBILE'] as const).map((network) => (
                        <TouchableOpacity
                          key={network}
                          style={[
                            styles.bankChip,
                            {
                              backgroundColor: selectedNetwork === network
                                ? (isDarkMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.15)')
                                : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                              borderColor: selectedNetwork === network
                                ? (isDarkMode ? 'rgba(102, 126, 234, 0.5)' : 'rgba(102, 126, 234, 0.4)')
                                : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
                            }
                          ]}
                          onPress={() => setSelectedNetwork(network)}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.bankChipText,
                            { 
                              color: selectedNetwork === network 
                                ? (isDarkMode ? '#667EEA' : '#667EEA')
                                : colors.text
                            }
                          ]}>
                            {network}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Airtime Amount (for airtime redemption) */}
                {redemptionType === 'airtime' && selectedNetwork && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Airtime Amount (NGN)</Text>
                    <View style={[styles.inputContainer, { 
                      backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
                    }]}>
                      <TextInput
                        style={[styles.payoutInput, { color: colors.text }]}
                        value={airtimeAmount}
                        onChangeText={setAirtimeAmount}
                        placeholder={`Auto: ₦${redemptionAmount ? (parseInt(redemptionAmount) * 15).toFixed(0) : '0'}`}
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="numeric"
                        maxLength={10}
                      />
                    </View>
                    <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                      Leave empty to use token amount (₦{redemptionAmount ? (parseInt(redemptionAmount) * 15).toFixed(0) : '0'}) or enter custom amount
                    </Text>
                  </>
                )}

                {/* Data Bundle Selection (for data redemption) */}
                {redemptionType === 'data' && selectedNetwork && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Select Data Bundle</Text>
                    <View style={styles.methodsContainer}>
                      {getDataBundles(selectedNetwork).map((bundle) => (
                        <TouchableOpacity
                          key={bundle.code}
                          style={[
                            styles.methodOption,
                            {
                              backgroundColor: selectedBundle?.code === bundle.code
                                ? (isDarkMode ? 'rgba(102, 126, 234, 0.15)' : 'rgba(102, 126, 234, 0.1)')
                                : (isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'),
                              borderColor: selectedBundle?.code === bundle.code
                                ? (isDarkMode ? 'rgba(102, 126, 234, 0.5)' : 'rgba(102, 126, 234, 0.4)')
                                : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
                              borderWidth: selectedBundle?.code === bundle.code ? 1.5 : 1,
                            }
                          ]}
                          onPress={() => setSelectedBundle(bundle)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.methodInfo}>
                            <Text style={[styles.methodName, { color: colors.text }]}>
                              {bundle.name} • {bundle.dataSize}
                            </Text>
                            <Text style={[styles.methodDescription, { color: colors.textSecondary }]}>
                              {bundle.amount} tokens • {bundle.validity}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Payment Methods (for wallet tokens) */}
            {redemptionMode !== 'earned_tokens' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>payment method</Text>
            <View style={styles.methodsContainer}>
              {redemptionMethods.map((method) => {
                const isSelected = selectedMethod === method.id;
                const Icon = Building2; // Bank transfer icon for both
                const gradientColors = (isDarkMode ? ['#11998E', '#38EF7D'] : ['#11998E', '#38EF7D']);
                
                return (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.methodOption,
                    {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        borderColor: isSelected ? (isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)') : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
                        borderWidth: isSelected ? 1.5 : 1,
                    }
                  ]}
                  onPress={() => setSelectedMethod(method.id)}
                    activeOpacity={0.7}
                >
                    <LinearGradient
                      colors={gradientColors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.methodIconContainer}
                    >
                      <Icon size={14} color="#fff" strokeWidth={2.5} />
                    </LinearGradient>
                  <View style={styles.methodInfo}>
                      <Text style={[styles.methodName, { color: colors.text }]}>
                      {method.name}
                    </Text>
                    <Text style={[styles.methodDescription, { color: colors.textSecondary }]}>
                      {method.description}
                    </Text>
                  </View>
                    {isSelected && (
                      <LinearGradient
                        colors={isDarkMode ? ['#FF6B9D', '#C44569'] : ['#FFA07A', '#FF6B9D']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.checkmarkContainer}
                      >
                        <Check size={12} color="#fff" strokeWidth={3} />
                      </LinearGradient>
                  )}
                </TouchableOpacity>
                );
              })}
            </View>

            {/* Payout Details */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>bank details</Text>
              
              {/* Bank Selection */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Select Bank</Text>
              <View style={[styles.inputContainer, { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
              }]}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.bankScrollView}
                >
                  {NIGERIAN_BANKS.map((bank) => (
                    <TouchableOpacity
                      key={bank.code}
                      style={[
                        styles.bankChip,
                        {
                          backgroundColor: selectedBankCode === bank.code
                            ? (isDarkMode ? 'rgba(102, 126, 234, 0.2)' : 'rgba(102, 126, 234, 0.15)')
                            : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                          borderColor: selectedBankCode === bank.code
                            ? (isDarkMode ? 'rgba(102, 126, 234, 0.5)' : 'rgba(102, 126, 234, 0.4)')
                            : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
                        }
                      ]}
                      onPress={() => setSelectedBankCode(bank.code)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.bankChipText,
                        { 
                          color: selectedBankCode === bank.code 
                            ? (isDarkMode ? '#667EEA' : '#667EEA')
                            : colors.text
                        }
                      ]}>
                        {bank.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Account Number */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Account Number</Text>
              <View style={[styles.inputContainer, { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
              }]}>
                <TextInput
                  style={[styles.payoutInput, { color: colors.text }]}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="Enter your bank account number"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  maxLength={20}
                />
              </View>

              {/* Account Name */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Account Name</Text>
              <View style={[styles.inputContainer, { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
              }]}>
                <TextInput
                  style={[styles.payoutInput, { color: colors.text }]}
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="Enter account holder name"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={100}
                />
              </View>
              <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                Make sure the account name matches your registered name
              </Text>
            </View>

            {/* Redeem Button */}
            <TouchableOpacity
              style={styles.redeemButton}
              onPress={handleRedemption}
              disabled={
                redeeming || 
                !redemptionAmount || 
                (redemptionMode === 'earned_tokens' 
                  ? (!phoneNumber.trim() || !selectedNetwork || (redemptionType === 'data' && !selectedBundle))
                  : (!selectedBankCode || !accountNumber.trim() || !accountName.trim()))
              }
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={isDarkMode ? ['#667EEA', '#764BA2'] : ['#667EEA', '#764BA2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.redeemButtonGradient, { opacity: redeeming ? 0.7 : 1 }]}
            >
              {redeeming ? (
                  <ActivityIndicator size="small" color="#fff" />
              ) : (
                  <Text style={styles.redeemButtonText}>submit redemption</Text>
              )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
            )}

          {/* Redemption History */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>redemption history</Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={[styles.viewAllText, { color: colors.textSecondary }]}>see all</Text>
              </TouchableOpacity>
            </View>
            {redemptions.length === 0 ? (
              <View style={[styles.emptyState, { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
              }]}>
                <CreditCard size={32} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  no redemptions yet
                </Text>
              </View>
            ) : (
              redemptions.slice(0, 5).map((redemption) => {
                const StatusIcon = redemption.status === 'pending' ? Clock :
                                 redemption.status === 'approved' ? Check :
                                 redemption.status === 'rejected' ? XCircle :
                                 redemption.status === 'completed' ? CheckCheck : Clock;
                
                return (
                  <View key={redemption.id} style={[styles.redemptionCard, { 
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
                  }]}>
                  <View style={styles.redemptionInfo}>
                      <View style={[styles.statusIcon, { backgroundColor: getStatusColor(redemption.status) + '15' }]}>
                        <StatusIcon
                          size={16}
                        color={getStatusColor(redemption.status)}
                          strokeWidth={2}
                      />
                    </View>
                    <View style={styles.redemptionDetails}>
                      <Text style={[styles.redemptionAmount, { color: colors.text }]}>
                        {formatTokens(redemption.token_amount || (redemption as any).amount)} tokens
                      </Text>
                      <Text style={[styles.redemptionMethod, { color: colors.textSecondary }]}>
                          {redemption.redemption_method || (redemption as any).payment_method || 'Bank Transfer'} • {redemption.created_at ? new Date(redemption.created_at).toLocaleDateString() : 'N/A'}
                      </Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(redemption.status) + '15' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(redemption.status) }]}>
                        {redemption.status || 'unknown'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  dragIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1002,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 1000,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1001,
  },
  helpButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '500',
  },

  // Balance Card
  balanceCard: {
    margin: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  balanceIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.5,
    marginBottom: 2,
  },
  balanceSubtext: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Section
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  // Quick Amounts
  quickAmountsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  quickAmountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  quickAmountTokens: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  quickAmountUsd: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: -0.1,
  },

  // Input Container
  inputContainer: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 6,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenSymbol: {
    fontSize: 18,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 40,
    letterSpacing: -0.3,
  },
  usdEquivalent: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  payoutInput: {
    fontSize: 13,
    fontWeight: '500',
    minHeight: 50,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  bankScrollView: {
    flexGrow: 0,
  },
  bankChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 80,
  },
  bankChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  // Methods Container
  methodsContainer: {
    gap: 8,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  methodIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodInfo: {
    flex: 1,
    marginLeft: 10,
  },
  methodName: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 1,
  },
  methodDescription: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
    letterSpacing: -0.1,
  },
  checkmarkContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Redeem Button
  redeemButton: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  redeemButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 6,
  },
  redeemButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },

  // Redemption History
  redemptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  redemptionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redemptionDetails: {
    flex: 1,
  },
  redemptionAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  redemptionMethod: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  // Empty State
  emptyState: {
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 10,
    letterSpacing: -0.1,
  },
});

export default RedemptionScreen;