import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Alert,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Coins, CheckCircle2, Sparkles } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import EnhancedAvatar from './EnhancedAvatar';
import { getUserWallet, getTokenPackages, TokenPackage } from '../utils/walletService';
import { log, warn, error } from '../utils/productionLogger';


const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface CreditModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (amount: number) => Promise<{ success: boolean; error?: string }>;
  recipientName: string;
  recipientAvatar?: string;
  recipientId?: string;
  sending?: boolean;
}

// Preset amounts will be dynamically generated from token packages

export default function CreditModal({
  visible,
  onClose,
  onSend,
  recipientName,
  recipientAvatar,
  recipientId,
  sending = false,
}: CreditModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [userTokens, setUserTokens] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);
  const [presetAmounts, setPresetAmounts] = useState<number[]>([2, 5, 10, 20]); // Fallback defaults
  const [tokenPackages, setTokenPackages] = useState<TokenPackage[]>([]);
  const slideAnim = React.useRef(new Animated.Value(screenHeight)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const successScaleAnim = React.useRef(new Animated.Value(0.8)).current;
  const successOpacityAnim = React.useRef(new Animated.Value(0)).current;
  
  // Pan responder for swipe down to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical drags down
        return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        // Stop any ongoing animations
        slideAnim.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down (positive dy)
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const CLOSE_THRESHOLD = 100;
        const VELOCITY_THRESHOLD = 500;
        
        if (gestureState.dy > CLOSE_THRESHOLD || gestureState.velocityY > VELOCITY_THRESHOLD) {
          // Close modal if dragged down far enough or fast enough
          Animated.timing(slideAnim, {
            toValue: screenHeight,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            if (!showSuccess) {
              onClose();
            }
          });
        } else {
          // Snap back to open position
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  // Load wallet balance when modal opens
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const loadData = async () => {
        try {
          // Load wallet balance
          const wallet = await getUserWallet();
          setUserTokens(wallet?.token_balance || 0);

          // Load token packages and generate preset amounts
          const packages = await getTokenPackages();
          setTokenPackages(packages);

          if (packages && packages.length > 0) {
            // Generate preset amounts from token packages
            // Take the first 4 packages sorted by token_amount (ascending)
            const sortedPackages = [...packages]
              .filter(pkg => pkg.is_active !== false)
              .sort((a, b) => a.token_amount - b.token_amount)
              .slice(0, 4);

            if (sortedPackages.length > 0) {
              const amounts = sortedPackages.map(pkg => pkg.token_amount);
              setPresetAmounts(amounts);
              
              // Set default selected amount to the first (cheapest) package
              if (!selectedAmount) {
                setSelectedAmount(amounts[0]);
              }
            } else {
              // Fallback to default amounts if no active packages
              setPresetAmounts([2, 5, 10, 20]);
              if (!selectedAmount) {
                setSelectedAmount(2);
              }
            }
          } else {
            // Fallback to default amounts if no packages found
            setPresetAmounts([2, 5, 10, 20]);
            if (!selectedAmount) {
              setSelectedAmount(2);
            }
          }
        } catch (error) {
          error('Error loading wallet data:', error);
          setUserTokens(0);
          // Keep fallback preset amounts
          if (!selectedAmount) {
            setSelectedAmount(2);
          }
        }
      };
      loadData();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: screenHeight,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      // Reset state when modal closes
      // Reset to first preset amount (will be set when modal opens again)
      setSelectedAmount(null);
      setCustomAmount('');
      setShowSuccess(false);
    }
  }, [visible]);

  // Success animation
  useEffect(() => {
    if (showSuccess) {
      Animated.parallel([
        Animated.spring(successScaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      successScaleAnim.setValue(0.8);
      successOpacityAnim.setValue(0);
    }
  }, [showSuccess]);

  const handleSend = async () => {
    const amount = customAmount ? parseInt(customAmount, 10) : selectedAmount;
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to send.');
      return;
    }

    if (userTokens < amount) {
      Alert.alert(
        'Insufficient Tokens', 
        `You need ${amount.toLocaleString()} tokens to send this credit!\n\nYour balance: ${userTokens.toLocaleString()} tokens`,
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    try {
      const result = await onSend(amount);
      
      if (result.success) {
        // Show success modal
        setSuccessAmount(amount);
        setShowSuccess(true);
        
        // Update wallet balance
        setUserTokens(prev => prev - amount);
        
        // Auto close after 2.5 seconds
        setTimeout(() => {
          setShowSuccess(false);
          setTimeout(() => {
            onClose();
          }, 300);
        }, 2500);
      } else {
        // Show error alert
        Alert.alert(
          'Transaction Failed',
          result.error || 'Failed to send tokens. Please try again.',
          [
            { 
              text: 'OK', 
              style: 'default',
              onPress: () => {
                // Keep modal open so user can try again
              }
            }
          ]
        );
      }
    } catch (error) {
      error('[CreditModal] Error sending credit:', error);
      Alert.alert(
        'Transaction Failed',
        'An unexpected error occurred. Please try again.',
        [
          { 
            text: 'OK', 
            style: 'default',
            onPress: () => {
              // Keep modal open so user can try again
            }
          }
        ]
      );
    }
  };

  const getFinalAmount = (): number => {
    if (customAmount) {
      const parsed = parseInt(customAmount, 10);
      return isNaN(parsed) || parsed <= 0 ? 0 : parsed;
    }
    return selectedAmount || 0;
  };

  const finalAmount = getFinalAmount();
  const canSend = finalAmount > 0 && !sending && userTokens >= finalAmount;

  const handleClose = () => {
    if (showSuccess) {
      setShowSuccess(false);
      setTimeout(() => {
        onClose();
      }, 300);
    } else {
      onClose();
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={showSuccess ? undefined : handleClose}
        statusBarTranslucent={true}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleClose}
          />

          <Animated.View
            style={[
              styles.modalContent,
              {
                paddingBottom: Math.max(insets.bottom, 20),
                transform: [{ translateY: slideAnim }],
                opacity: showSuccess ? 0 : 1,
              },
            ]}
            pointerEvents={showSuccess ? 'none' : 'auto'}
            {...panResponder.panHandlers}
          >
            {Platform.OS === 'ios' ? (
              <BlurView intensity={95} tint="dark" style={styles.blurContainer}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Drag Handle */}
                    <View style={styles.dragHandle} />

                    {/* Header */}
                    <View style={styles.header}>
                      <View style={styles.headerLeft}>
                        <Text style={styles.title}>Send Tokens</Text>
                      </View>
                      <TouchableOpacity 
                        onPress={handleClose} 
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <X size={20} color="#FFFFFF" strokeWidth={2.5} />
                      </TouchableOpacity>
                    </View>

                  {/* Header with Balance - Compact Design */}
                  <View style={styles.headerWithBalance}>
                    <View style={styles.recipientInfoCompact}>
                      <EnhancedAvatar
                        avatarUrl={recipientAvatar}
                        userId={recipientId}
                        fullName={recipientName}
                        size={48}
                        isDarkMode={isDarkMode}
                      />
                      <View style={styles.recipientTextContainer}>
                        <Text style={styles.recipientNameCompact}>
                          {recipientName}
                        </Text>
                        <View style={styles.balanceRow}>
                          <Coins size={14} color="#FFD700" strokeWidth={2} />
                          <Text style={styles.balanceTextCompact}>
                            {userTokens.toLocaleString()}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Preset Amounts */}
                  <View style={styles.presetContainer}>
                    <Text style={styles.sectionLabel}>Amount</Text>
                    <View style={styles.presetGrid}>
                      {presetAmounts.map((amount) => {
                        const isSelected = selectedAmount === amount && !customAmount;
                        const canAfford = userTokens >= amount;
                        return (
                          <TouchableOpacity
                            key={amount}
                            onPress={() => {
                              if (canAfford) {
                                setSelectedAmount(amount);
                                setCustomAmount('');
                              }
                            }}
                            style={[
                              styles.presetButton,
                              {
                                backgroundColor: isSelected
                                  ? '#FFD700'
                                  : 'rgba(255, 255, 255, 0.1)',
                                borderColor: isSelected ? '#FFD700' : 'rgba(255, 255, 255, 0.2)',
                                opacity: canAfford ? 1 : 0.5,
                              },
                            ]}
                            disabled={!canAfford}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.presetButtonText,
                                {
                                  color: isSelected ? '#000000' : '#FFFFFF',
                                  fontWeight: isSelected ? '700' : '600',
                                },
                              ]}
                            >
                              {amount}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Custom Amount */}
                  <View style={styles.customContainer}>
                    <Text style={styles.sectionLabel}>Custom</Text>
                    <View
                      style={[
                        styles.customInputContainer,
                        {
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          borderColor: customAmount ? '#FFD700' : 'rgba(255, 255, 255, 0.2)',
                        },
                      ]}
                    >
                      <Coins size={20} color={customAmount ? '#FFD700' : 'rgba(255, 255, 255, 0.5)'} />
                      <TextInput
                        style={styles.customInput}
                        value={customAmount}
                        onChangeText={(text) => {
                          const numericText = text.replace(/[^0-9]/g, '');
                          setCustomAmount(numericText);
                          if (numericText) {
                            setSelectedAmount(null);
                          }
                        }}
                        placeholder="Enter amount"
                        placeholderTextColor="rgba(255, 255, 255, 0.5)"
                        keyboardType="numeric"
                        maxLength={10}
                      />
                      {customAmount && (
                        <View style={styles.usdEquivalent}>
                          <Coins size={14} color="rgba(255, 255, 255, 0.7)" strokeWidth={2} />
                          {Math.round(parseInt(customAmount, 10) / 100) > 0 && (
                            <Text style={styles.usdEquivalentText}>
                              {Math.round(parseInt(customAmount, 10) / 100)}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>

                    {/* Send Button */}
                    <TouchableOpacity
                      onPress={handleSend}
                      disabled={!canSend}
                      style={styles.sendButtonContainer}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={
                          canSend
                            ? ['#FFD700', '#FFA500']
                            : ['#666', '#555']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.sendButton}
                      >
                        {sending ? (
                          <ActivityIndicator color="#000000" />
                        ) : (
                          <>
                            <Coins size={18} color="#000000" strokeWidth={2.5} />
                            <Text style={styles.sendButtonText}>
                              Send {finalAmount}
                            </Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </ScrollView>
                </TouchableWithoutFeedback>
              </BlurView>
            ) : (
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <ScrollView
                  style={styles.container}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Drag Handle */}
                  <View style={styles.dragHandle} />

                  {/* Header */}
                  <View style={styles.header}>
                    <View style={styles.headerLeft}>
                      <Text style={styles.title}>Send Tokens</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={handleClose} 
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <X size={20} color="#FFFFFF" strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>

                {/* Header with Balance - Compact Design */}
                <View style={styles.headerWithBalance}>
                  <View style={styles.recipientInfoCompact}>
                    <EnhancedAvatar
                      avatarUrl={recipientAvatar}
                      userId={recipientId}
                      fullName={recipientName}
                      size={48}
                      isDarkMode={isDarkMode}
                    />
                    <View style={styles.recipientTextContainer}>
                      <Text style={styles.recipientNameCompact}>
                        {recipientName}
                      </Text>
                      <View style={styles.balanceRow}>
                        <Coins size={14} color="#FFD700" strokeWidth={2} />
                        <Text style={styles.balanceTextCompact}>
                          {userTokens.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Preset Amounts */}
                <View style={styles.presetContainer}>
                  <Text style={styles.sectionLabel}>Amount</Text>
                  <View style={styles.presetGrid}>
                    {presetAmounts.map((amount) => {
                      const isSelected = selectedAmount === amount && !customAmount;
                      const canAfford = userTokens >= amount;
                      return (
                        <TouchableOpacity
                          key={amount}
                          onPress={() => {
                            if (canAfford) {
                              setSelectedAmount(amount);
                              setCustomAmount('');
                            }
                          }}
                          style={[
                            styles.presetButton,
                            {
                              backgroundColor: isSelected
                                ? '#FFD700'
                                : 'rgba(255, 255, 255, 0.1)',
                              borderColor: isSelected ? '#FFD700' : 'rgba(255, 255, 255, 0.2)',
                              opacity: canAfford ? 1 : 0.5,
                            },
                          ]}
                          disabled={!canAfford}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.presetButtonText,
                              {
                                color: isSelected ? '#000000' : '#FFFFFF',
                                fontWeight: isSelected ? '700' : '600',
                              },
                            ]}
                          >
                            {amount}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Custom Amount */}
                <View style={styles.customContainer}>
                  <Text style={styles.sectionLabel}>Custom</Text>
                  <View
                    style={[
                      styles.customInputContainer,
                      {
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderColor: customAmount ? '#FFD700' : 'rgba(255, 255, 255, 0.2)',
                      },
                    ]}
                  >
                    <Coins size={20} color={customAmount ? '#FFD700' : 'rgba(255, 255, 255, 0.5)'} />
                    <TextInput
                      style={styles.customInput}
                      value={customAmount}
                      onChangeText={(text) => {
                        const numericText = text.replace(/[^0-9]/g, '');
                        setCustomAmount(numericText);
                        if (numericText) {
                          setSelectedAmount(null);
                        }
                      }}
                      placeholder="Enter amount"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      keyboardType="numeric"
                      maxLength={10}
                    />
                    {customAmount && (
                      <View style={styles.usdEquivalent}>
                        <Coins size={14} color="rgba(255, 255, 255, 0.7)" strokeWidth={2} />
                        {Math.round(parseInt(customAmount, 10) / 100) > 0 && (
                          <Text style={styles.usdEquivalentText}>
                            {Math.round(parseInt(customAmount, 10) / 100)}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>

                  {/* Send Button */}
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={!canSend}
                    style={styles.sendButtonContainer}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={
                        canSend
                          ? ['#FFD700', '#FFA500']
                          : ['#666', '#555']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.sendButton}
                    >
                      {sending ? (
                        <ActivityIndicator color="#000000" />
                      ) : (
                        <>
                          <Coins size={18} color="#000000" strokeWidth={2.5} />
                          <Text style={styles.sendButtonText}>
                            Send {finalAmount}
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </ScrollView>
              </TouchableWithoutFeedback>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success Modal - Shows on top when transaction succeeds */}
      <Modal
        visible={showSuccess && visible}
        transparent
        animationType="none"
        onRequestClose={handleClose}
        statusBarTranslucent={true}
      >
        <View style={styles.successOverlay}>
          <Animated.View
            style={[
              styles.successModal,
              {
                width: Math.min(screenWidth - 32, 320),
                transform: [{ scale: successScaleAnim }],
                opacity: successOpacityAnim,
              },
            ]}
          >
            <LinearGradient
              colors={['#FF0050', '#FF6B9D']}
              style={styles.successGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Animated.View
                style={[
                  styles.successIconContainer,
                  {
                    transform: [{ scale: successScaleAnim }],
                  },
                ]}
              >
                <CheckCircle2 size={64} color="#FFFFFF" strokeWidth={2.5} />
                <View style={styles.sparklesContainer}>
                  <Sparkles size={24} color="#FFFFFF" style={styles.sparkle1} />
                  <Sparkles size={20} color="#FFFFFF" style={styles.sparkle2} />
                  <Sparkles size={18} color="#FFFFFF" style={styles.sparkle3} />
                </View>
              </Animated.View>

              <Text style={styles.successTitle}>Sent!</Text>
              <Text style={styles.successSubtitle}>
                {successAmount.toLocaleString()} sent to {recipientName}
              </Text>

              <TouchableOpacity
                style={styles.successButton}
                onPress={handleClose}
                activeOpacity={0.8}
              >
                <Text style={styles.successButtonText}>nice!</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '100%',
    height: Math.min(screenHeight * 0.65, 550),
    maxHeight: screenHeight * 0.7,
    minHeight: 350,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : '#1A1A1A',
  },
  blurContainer: {
    flex: 1,
    backgroundColor: 'rgba(26, 26, 26, 0.98)',
    width: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : '#1A1A1A',
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerWithBalance: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  recipientInfoCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recipientTextContainer: {
    flex: 1,
  },
  recipientNameCompact: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceTextCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  presetContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetButton: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetButtonText: {
    fontSize: 16,
  },
  customContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  customInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  usdEquivalent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  usdEquivalentText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  sendButtonContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  sendButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  // Success Modal Styles
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  successModal: {
    maxWidth: 320,
    borderRadius: 24,
    overflow: 'hidden',
  },
  successGradient: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  sparklesContainer: {
    position: 'absolute',
    width: 100,
    height: 100,
    top: -18,
    left: -18,
  },
  sparkle1: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  sparkle2: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  sparkle3: {
    position: 'absolute',
    top: 20,
    left: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 4,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  successPackage: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 24,
    letterSpacing: -0.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  successButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
});
