import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { CreditCard, Lock, Calendar, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { log, warn, error } from '../utils/productionLogger';


interface CustomPaymentFormProps {
  amount: number;
  currency: 'NGN' | 'USD';
  packageName: string;
  onSuccess: () => void;
  onCancel: () => void;
  transactionId: string;
}

export default function CustomPaymentForm({
  amount,
  currency,
  packageName,
  onSuccess,
  onCancel,
  transactionId,
}: CustomPaymentFormProps) {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);

  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [processing, setProcessing] = useState(false);

  // Flutterwave transaction limits
  const FLUTTERWAVE_LIMIT_NGN = 500000; // ₦500,000
  const FLUTTERWAVE_LIMIT_USD = 300; // $300 (approximate equivalent)

  // Check if amount exceeds limit
  const exceedsLimit = currency === 'NGN' 
    ? amount > FLUTTERWAVE_LIMIT_NGN 
    : amount > FLUTTERWAVE_LIMIT_USD;

  // Format card number with spaces (XXXX XXXX XXXX XXXX)
  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s/g, '');
    const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
    return formatted.slice(0, 19); // Max 16 digits + 3 spaces
  };

  // Format expiry date (MM/YY)
  const formatExpiryDate = (text: string) => {
    const cleaned = text.replace(/\//g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  // Validate card details
  const validateCard = () => {
    const cleanedCardNumber = cardNumber.replace(/\s/g, '');
    
    if (cleanedCardNumber.length < 13 || cleanedCardNumber.length > 19) {
      Alert.alert('Invalid Card', 'Please enter a valid card number');
      return false;
    }
    
    if (!expiryDate.match(/^\d{2}\/\d{2}$/)) {
      Alert.alert('Invalid Expiry', 'Please enter expiry date in MM/YY format');
      return false;
    }
    
    if (cvv.length < 3) {
      Alert.alert('Invalid CVV', 'Please enter a valid CVV');
      return false;
    }
    
    if (cardholderName.trim().length < 3) {
      Alert.alert('Invalid Name', 'Please enter cardholder name');
      return false;
    }
    
    return true;
  };

  // Process payment with Flutterwave using payment link (no encryption needed)
  const handlePayment = async () => {
    // Check transaction limit first
    if (exceedsLimit) {
      Alert.alert(
        'Amount Exceeds Limit',
        `The maximum transaction amount is ${currency === 'NGN' ? `₦${FLUTTERWAVE_LIMIT_NGN.toLocaleString()}` : `$${FLUTTERWAVE_LIMIT_USD}`}. Please contact support for larger transactions.`
      );
      return;
    }

    if (!validateCard()) return;

    setProcessing(true);

    try {
      const { supabase } = await import('../utils/supabase');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user profile for email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', user.id)
        .single();

      if (profileError) {
        warn('⚠️ [PAYMENT] Could not fetch profile, using auth email:', profileError);
      }

      log('👤 [PAYMENT] User info:', {
        userId: user.id,
        email: profile?.email || user.email,
        name: profile?.full_name || 'N/A',
      });

      // Use Flutterwave payment link approach (no encryption needed)
      // This creates a payment link that opens in a WebView
      const { initializeFlutterwavePayment } = await import('../utils/flutterwaveService');
      const { getTokenPackages } = await import('../utils/walletService');
      
      // Get package info to create payment
      const packages = await getTokenPackages();
      // Find package that matches this amount (approximate match)
      const matchingPackage = packages.find(pkg => {
        const packageAmount = currency === 'NGN' ? Math.ceil((pkg.price_usd || 0) * 1500) : (pkg.price_usd || 0);
        return Math.abs(packageAmount - amount) < 100; // Within 100 units
      });

      if (!matchingPackage) {
        throw new Error('Could not find matching token package');
      }

      // Create payment link
      const paymentResult = await initializeFlutterwavePayment({
        packageId: matchingPackage.id,
        amount: amount,
        tokenAmount: matchingPackage.token_amount,
        bonusTokens: matchingPackage.bonus_tokens || 0,
        totalTokens: matchingPackage.token_amount + (matchingPackage.bonus_tokens || 0),
        userEmail: profile?.email || user.email || '',
        userName: profile?.full_name || cardholderName || 'User',
        userId: user.id,
      });

      if (!paymentResult.success || !paymentResult.paymentLink) {
        throw new Error(paymentResult.error || 'Failed to create payment link');
      }

      log('✅ [PAYMENT] Payment link created:', paymentResult.paymentLink);

      // Open Flutterwave payment page in WebView
      const result = await WebBrowser.openBrowserAsync(paymentResult.paymentLink, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        enableBarCollapsing: false,
      });

      log('🌐 [PAYMENT] WebBrowser result:', result);

      // Payment will be processed via webhook
      // The polling in WalletScreen will detect completion
      if (result.type === 'cancel') {
        Alert.alert('Payment Cancelled', 'You cancelled the payment process.');
        setProcessing(false);
        return;
      }

      // If user completed payment, call onSuccess
      // The actual payment status will be checked by polling
      onSuccess();
    } catch (error: any) {
      error('❌ [PAYMENT] Payment error:', error);
      
      // Get error message
      let errorMessage = 'Unable to process payment. Please try again.';
      
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      Alert.alert('Payment Failed', errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Amount Card */}
        <LinearGradient
          colors={exceedsLimit ? ['#FF6B35', '#FF9500'] : ['#FF0050', '#FF6B9D']}
          style={styles.amountCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.amountContent}>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amountValue}>
              {currency === 'NGN' ? '₦' : '$'}{amount.toLocaleString()}
            </Text>
            <Text style={styles.packageLabel}>{packageName}</Text>
            {exceedsLimit && (
              <View style={styles.warningBadge}>
                <Text style={styles.warningText}>⚠️ Exceeds limit</Text>
              </View>
            )}
          </View>
          <View style={styles.secureIconContainer}>
            <Shield size={24} color="rgba(255, 255, 255, 0.8)" />
          </View>
        </LinearGradient>

        {/* Limit Warning */}
        {exceedsLimit && (
          <View style={styles.limitWarning}>
            <Text style={styles.limitWarningText}>
              ⚠️ Maximum: {currency === 'NGN' ? `₦${FLUTTERWAVE_LIMIT_NGN.toLocaleString()}` : `$${FLUTTERWAVE_LIMIT_USD}`}
            </Text>
            <Text style={styles.limitWarningSubtext}>
              Please contact support for transactions above this amount
            </Text>
          </View>
        )}

        {/* Payment Form */}
        <View style={styles.formContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Card Details
          </Text>

          {/* Card Number */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <CreditCard size={20} color={colors.textSecondary} />
            </View>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Card Number"
              placeholderTextColor={colors.textSecondary}
              value={cardNumber}
              onChangeText={(text) => setCardNumber(formatCardNumber(text))}
              keyboardType="number-pad"
              maxLength={19}
              autoComplete="cc-number"
            />
          </View>

          {/* Cardholder Name */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <Text style={[styles.iconText, { color: colors.textSecondary }]}>
                AB
              </Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Cardholder Name"
              placeholderTextColor={colors.textSecondary}
              value={cardholderName}
              onChangeText={setCardholderName}
              autoComplete="name"
              autoCapitalize="words"
            />
          </View>

          {/* Expiry & CVV */}
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <View style={styles.inputIcon}>
                <Calendar size={20} color={colors.textSecondary} />
              </View>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="MM/YY"
                placeholderTextColor={colors.textSecondary}
                value={expiryDate}
                onChangeText={(text) => setExpiryDate(formatExpiryDate(text))}
                keyboardType="number-pad"
                maxLength={5}
                autoComplete="cc-exp"
              />
            </View>

            <View style={[styles.inputContainer, styles.halfInput]}>
              <View style={styles.inputIcon}>
                <Lock size={20} color={colors.textSecondary} />
              </View>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="CVV"
                placeholderTextColor={colors.textSecondary}
                value={cvv}
                onChangeText={(text) => setCvv(text.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoComplete="cc-csc"
              />
            </View>
          </View>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <Shield size={16} color="#4CAF50" />
            <Text style={[styles.securityText, { color: colors.textSecondary }]}>
              Your payment is secure and encrypted
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.payButton, exceedsLimit && styles.payButtonDisabled]}
            onPress={handlePayment}
            disabled={processing || exceedsLimit}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={processing || exceedsLimit ? ['#999', '#999'] : ['#FF0050', '#FF6B9D']}
              style={styles.payButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {processing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : exceedsLimit ? (
                <Text style={styles.payButtonText}>Amount Exceeds Limit</Text>
              ) : (
                <Text style={styles.payButtonText}>
                  Pay {currency === 'NGN' ? '₦' : '$'}{amount.toLocaleString()}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={processing}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelButtonText, { color: colors.text }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>

        {/* Test Mode Note */}
        <View style={styles.testModeNote}>
          <Text style={[styles.testModeText, { color: colors.textSecondary }]}>
            Test Mode: Use card 5531886652142950, CVV 564, Expiry 09/32
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  
  // Amount Card
  amountCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountContent: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -1,
  },
  packageLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: -0.2,
  },
  warningBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  warningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  secureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Limit Warning
  limitWarning: {
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35',
  },
  limitWarningText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B35',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  limitWarningSubtext: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FF6B35',
    opacity: 0.8,
    letterSpacing: -0.1,
  },
  
  // Form
  formContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  
  // Security Note
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  securityText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  
  // Actions
  actions: {
    gap: 12,
  },
  payButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF0050',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  payButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  payButtonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  
  // Test Mode
  testModeNote: {
    marginTop: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
  },
  testModeText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
});

