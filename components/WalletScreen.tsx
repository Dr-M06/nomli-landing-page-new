import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Animated,
  Modal,
  AppState,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, ArrowUpRight, CheckCircle2, Sparkles, Star, Rocket, Coins, Info, History, Gift, Award, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { getUserWallet, getTokenPackages, purchaseTokens, getCachedWallet, getCachedPackages, clearWalletCache, getWalletTransactions, WalletTransaction } from '../utils/walletService';
import { UserWallet, TokenPackage } from '../utils/walletService';
import { getClaimHistory, DailyTokenClaim, syncEarnedTokensBalance } from '../utils/dailyTokenRewards';
import GoldenNCoin from './GoldenNCoin';
import RedemptionScreen from './RedemptionScreen';
import { supabase } from '../utils/supabase';
import useAuth from '../hooks/useAuth';
import { initializeStoreKit, setupPurchaseListener, disconnectStoreKit, clearPendingPurchases } from '../utils/storeKitService';
import { TransactionItem, CreditTransactionItem, TokensEarnItem } from './wallet/TransactionItems';
import { log, warn, error } from '../utils/productionLogger';
import Toast from 'react-native-toast-message';


const { width: screenWidth } = Dimensions.get('window');

interface WalletScreenProps {
  onClose?: () => void;
  onRedeem?: () => void;
}

const WalletScreen: React.FC<WalletScreenProps> = ({ onClose, onRedeem }) => {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  
  // Transaction history state
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [creditHistory, setCreditHistory] = useState<WalletTransaction[]>([]);
  const [tokensEarnHistory, setTokensEarnHistory] = useState<DailyTokenClaim[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'credits' | 'tokensEarn'>('all');
  const fadeAnim = useRef(new Animated.Value(0)).current; // Use useRef to prevent remounts
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<{ tokens: number; packageName: string } | null>(null);
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successOpacityAnim = useRef(new Animated.Value(0)).current;
  
  // iOS Get Tokens modal state
  const [showGetTokensModal, setShowGetTokensModal] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  
  // iOS Coming Soon modal state
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const comingSoonScaleAnim = useRef(new Animated.Value(0)).current;
  const comingSoonOpacityAnim = useRef(new Animated.Value(0)).current;
  const comingSoonRotateAnim = useRef(new Animated.Value(0)).current;
  const comingSoonPulseAnim = useRef(new Animated.Value(1)).current;
  
  // Payment state
  const [currentTransactionId, setCurrentTransactionId] = useState<string | null>(null);
  const [currentPackageInfo, setCurrentPackageInfo] = useState<{ name: string; tokens: number } | null>(null);
  
  // Store polling interval reference to stop it when needed
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateSubscriptionRef = useRef<any>(null); // For Flutterwave payments
  const iapAppStateListenerRef = useRef<any>(null); // For iOS IAP purchases
  const iapUnregisterRef = useRef<(() => void) | null>(null); // Cleanup for IAP callbacks
  
  // Track if wallet system has been set up to prevent repeated calls
  const walletSystemSetupRef = useRef<boolean>(false);
  const walletSystemSetupPromiseRef = useRef<Promise<void> | null>(null);
  
  // Store current purchasing package ID for purchase listener
  const currentPurchasingPackageRef = useRef<string | null>(null);
  
  // Track last time we processed app state change to prevent duplicate calls
  const lastAppStateProcessTimeRef = useRef<number>(0);
  const isProcessingAppStateRef = useRef<boolean>(false);

  useEffect(() => {
    // Start fade animation immediately - will be adjusted if cached data loads quickly
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    loadWalletData();
    loadTransactionHistory();

    // Register purchase callbacks for iOS IAP (native listener is set up at app root via initIAPAtAppRoot)
    if (Platform.OS === 'ios') {
      // Ensure StoreKit is ready when user opens wallet (initIAPAtAppRoot may still be initializing)
      initializeStoreKit();
      
      // Register our callbacks - native listener is ALWAYS active (set up in _layout.tsx)
      const unregisterIAP = setupPurchaseListener(
        (transactionId, productId) => {
          log('✅ [WALLET] Purchase completed:', transactionId, productId);
          setPurchasing(null);
          currentPurchasingPackageRef.current = null;
          loadWalletData(true);
          loadTransactionHistory(true);
          Toast.show({
            type: 'success',
            text1: 'Purchase successful',
            text2: 'Tokens have been added to your wallet.',
            position: 'bottom',
            visibilityTime: 4000,
          });
        },
        (err, details) => {
          error('❌ [WALLET] Purchase error:', err);
          error('❌ [WALLET] Error details:', details);
          console.error('[WALLET] ❌ FULL ERROR:', JSON.stringify({ error: err, details }, null, 2));
          setPurchasing(null);
          currentPurchasingPackageRef.current = null;
          const shortMessage = typeof err === 'string' ? err : err?.message || 'Purchase could not be completed.';
          Toast.show({
            type: 'error',
            text1: 'Purchase failed',
            text2: shortMessage,
            position: 'bottom',
            visibilityTime: 5000,
          });
        }
      );
      iapUnregisterRef.current = unregisterIAP;

      // Clear any pending/stuck purchases on mount
      (async () => {
        try {
          log('[WALLET] 🧹 Clearing any pending purchases...');
          const result = await clearPendingPurchases();
          if (result.cleared > 0) {
            log(`[WALLET] ✅ Cleared ${result.cleared} pending purchase(s)`);
            // Refresh wallet in case any were credited
            loadWalletData(true);
            loadTransactionHistory(true);
          }
          if (result.errors.length > 0) {
            warn('[WALLET] ⚠️ Some errors clearing purchases:', result.errors);
          }
        } catch (err: any) {
          error('[WALLET] Error clearing pending purchases:', err);
        }
      })();
    }

    // CRITICAL: Listen for app state changes to detect when Apple purchase modal is dismissed
    // When user dismisses the Apple "You're all set" modal, app comes back to foreground
    // This is when we need to check for and process any completed purchases
    if (Platform.OS === 'ios') {
      // Remove existing listener if any (prevent duplicates)
      if (iapAppStateListenerRef.current) {
        iapAppStateListenerRef.current.remove();
        iapAppStateListenerRef.current = null;
      }
      
      // Set up IAP AppState listener
      iapAppStateListenerRef.current = AppState.addEventListener('change', async (nextAppState: string) => {
        // Check if we have a pending IAP purchase (not Flutterwave)
        const hasPendingIAP = currentPurchasingPackageRef.current !== null;
        
        if (nextAppState === 'active' && hasPendingIAP) {
          // Debounce: Prevent processing the same state change multiple times
          const now = Date.now();
          const timeSinceLastProcess = now - lastAppStateProcessTimeRef.current;
          
          // If we processed this less than 2 seconds ago, skip it
          if (timeSinceLastProcess < 2000) {
            log('[WALLET] ⏭️ Skipping duplicate app state change (processed recently)');
            return;
          }
          
          // If already processing, skip
          if (isProcessingAppStateRef.current) {
            log('[WALLET] ⏭️ Already processing app state change, skipping');
            return;
          }
          
          // Mark as processing
          isProcessingAppStateRef.current = true;
          lastAppStateProcessTimeRef.current = now;
          
          // App came to foreground and we have a pending IAP purchase
          // This likely means user dismissed the Apple success modal
          log('[WALLET] 🔄 App became active with pending IAP purchase, checking for completed purchases...');
          
          // Wait a moment for StoreKit to process
          setTimeout(async () => {
            try {
              // Clear pending purchases - this will process any that completed
              const result = await clearPendingPurchases();
              // Always clear spinner and refresh when we finished transactions (cleared > 0)
              if (result.cleared > 0) {
                setPurchasing(null);
                currentPurchasingPackageRef.current = null;
                loadWalletData(true);
                loadTransactionHistory(true);
                if (result.verified > 0) {
                  log(`[WALLET] ✅ Verified and credited ${result.verified} purchase(s) after app became active`);
                  Toast.show({
                    type: 'success',
                    text1: 'Purchase successful',
                    text2: 'Tokens have been added to your wallet.',
                    position: 'bottom',
                    visibilityTime: 4000,
                  });
                } else {
                  log(`[WALLET] ⚠️ Cleared ${result.cleared} transaction(s) but none were verified by backend - tokens not credited`);
                  Toast.show({
                    type: 'error',
                    text1: 'Purchase not completed',
                    text2: 'Could not verify. Tokens were not added. Check your connection or try again.',
                    position: 'bottom',
                    visibilityTime: 5000,
                  });
                }
              } else if (currentPurchasingPackageRef.current) {
                // Still have spinner but no purchases cleared - might be stuck
                warn('[WALLET] ⚠️ Purchase spinner active but no purchases found');
                // Give it one more try after a delay
                setTimeout(async () => {
                  if (currentPurchasingPackageRef.current) {
                    const retryResult = await clearPendingPurchases();
                    if (retryResult.cleared > 0) {
                      setPurchasing(null);
                      currentPurchasingPackageRef.current = null;
                      loadWalletData(true);
                      loadTransactionHistory(true);
                      if (retryResult.verified > 0) {
                        Toast.show({
                          type: 'success',
                          text1: 'Purchase successful',
                          text2: 'Tokens have been added to your wallet.',
                          position: 'bottom',
                          visibilityTime: 4000,
                        });
                      } else {
                        Toast.show({
                          type: 'error',
                          text1: 'Purchase not completed',
                          text2: 'Could not verify. Tokens were not added. Try again or contact support.',
                          position: 'bottom',
                          visibilityTime: 5000,
                        });
                      }
                    } else {
                      warn('[WALLET] ⚠️ Clearing spinner due to timeout');
                      setPurchasing(null);
                      currentPurchasingPackageRef.current = null;
                      Toast.show({
                        type: 'error',
                        text1: 'Purchase incomplete',
                        text2: 'Verification timed out. If you were charged, contact support.',
                        position: 'bottom',
                        visibilityTime: 5000,
                      });
                    }
                  }
                }, 3000);
              }
            } catch (err: any) {
              error('[WALLET] Error checking purchases on app active:', err);
            } finally {
              // Reset processing flag
              isProcessingAppStateRef.current = false;
            }
          }, 1000); // Wait 1 second for StoreKit to process
        }
      });
    }
    
    // Set up real-time subscription for wallet updates
    // Use the user from useAuth hook called at top level (line 40)
    if (user?.id) {
      const walletSubscription = supabase
        .channel('wallet_updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_wallets',
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            log('💰 [WALLET] Wallet updated via real-time:', payload.new);
            // Clear cache and refresh wallet data when balance changes
            if (user?.id) {
              await clearWalletCache(user.id);
            }
            loadWalletData(true); // Force refresh to get latest balance
          }
        )
        .subscribe((status) => {
          log('💰 [WALLET] Subscription status:', status);
        });


      // Cleanup subscriptions on unmount
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (appStateSubscriptionRef.current) {
          appStateSubscriptionRef.current.remove();
          appStateSubscriptionRef.current = null;
        }
        if (iapAppStateListenerRef.current) {
          iapAppStateListenerRef.current.remove();
          iapAppStateListenerRef.current = null;
        }
        if (iapUnregisterRef.current) {
          iapUnregisterRef.current();
          iapUnregisterRef.current = null;
        }
        try {
          walletSubscription.unsubscribe();
        } catch (e) {
          // Ignore unsubscribe errors
        }
        
        // Disconnect StoreKit on unmount
        if (Platform.OS === 'ios') {
          disconnectStoreKit();
        }
        
        // Reset wallet setup flag on unmount so it can run again if component remounts
        walletSystemSetupRef.current = false;
        walletSystemSetupPromiseRef.current = null;
      };
    } else {
      // Cleanup polling on unmount (no user)
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (appStateSubscriptionRef.current) {
          appStateSubscriptionRef.current.remove();
          appStateSubscriptionRef.current = null;
        }
        if (iapAppStateListenerRef.current) {
          iapAppStateListenerRef.current.remove();
          iapAppStateListenerRef.current = null;
        }
        if (iapUnregisterRef.current) {
          iapUnregisterRef.current();
          iapUnregisterRef.current = null;
        }
        
        // Reset wallet setup flag on unmount
        walletSystemSetupRef.current = false;
        walletSystemSetupPromiseRef.current = null;
      };
    }
  }, [user?.id]); // Removed fadeAnim from dependencies to prevent remounts

  const loadWalletData = async (forceRefresh = false) => {
    try {
      // Load cached data immediately if not forcing refresh
      if (!forceRefresh && user?.id) {
        const [cachedWallet, cachedPackages] = await Promise.all([
          getCachedWallet(user.id),
          getCachedPackages()
        ]);
        
        if (cachedWallet) {
          log('[WalletScreen] 🚀 Using cached wallet - showing instantly');
          setWallet(cachedWallet);
          setLoading(false); // Show cached data immediately
          // If we have cached data, show immediately without fade blur
          fadeAnim.setValue(1);
        }
        
        if (cachedPackages && cachedPackages.length > 0) {
          log(`[WalletScreen] 🚀 Using ${cachedPackages.length} cached packages - showing instantly`);
          setPackages(cachedPackages);
          // If we have cached packages, show immediately without fade blur
          fadeAnim.setValue(1);
        }
        
        // If we have both cached, we can show UI immediately
        if (cachedWallet && cachedPackages && cachedPackages.length > 0) {
          setLoading(false);
          fadeAnim.setValue(1); // Ensure fully visible
        } else {
          setLoading(true);
        }
      } else {
        // Only show loading if no wallet data is currently displayed
        // During pull-to-refresh, existing data stays visible
        if (!wallet) {
          setLoading(true);
        }
      }
      
      // First, try to setup wallet system to ensure packages exist (only once per session)
      if (!walletSystemSetupRef.current) {
        // If setup is already in progress, wait for it
        if (walletSystemSetupPromiseRef.current) {
          await walletSystemSetupPromiseRef.current;
        } else {
          // Start setup and store the promise
          walletSystemSetupPromiseRef.current = (async () => {
            try {
              const { setupWalletSystem } = await import('../utils/setupWalletSystem');
              await setupWalletSystem();
              walletSystemSetupRef.current = true;
              log('🔧 [WALLET] Wallet system setup completed');
            } catch (setupError) {
              log('⚠️ [WALLET] Wallet setup failed (may already exist):', setupError.message);
              walletSystemSetupRef.current = true; // Mark as done even on error to prevent retries
            } finally {
              walletSystemSetupPromiseRef.current = null;
            }
          })();
          await walletSystemSetupPromiseRef.current;
        }
      }
      
      // Fetch fresh data (will update cache)
      const [walletData, packagesData] = await Promise.all([
        getUserWallet(undefined, !forceRefresh), // Use cache unless forcing refresh
        getTokenPackages(!forceRefresh) // Use cache unless forcing refresh
      ]);

      // Only update if data changed (avoid unnecessary re-renders)
      if (walletData) {
        setWallet(walletData);
      }
      if (packagesData && packagesData.length > 0) {
        setPackages(packagesData);
      }
      
      // Only log summary if packages were loaded (reduce verbosity)
      if (packagesData && packagesData.length > 0 && forceRefresh) {
        log(`📦 [WALLET] Loaded ${packagesData.length} packages`);
      }
    } catch (error) {
      error('Error loading wallet data:', error);
      Alert.alert('Error', 'Failed to load wallet data');
    } finally {
      setLoading(false);
      // Ensure content is visible when loading finishes
      fadeAnim.setValue(1);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Don't clear cache before refresh - keep existing data visible
      // Fresh data will replace cached data when it arrives
      await Promise.all([
        loadWalletData(true), // Force refresh (fetches fresh, keeps existing visible)
        loadTransactionHistory(true) // Refresh history too
      ]);
    } catch (error) {
      error('[WalletScreen] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const loadTransactionHistory = async (forceRefresh = false) => {
    if (!user?.id) return;
    
    try {
      setLoadingHistory(true);
      
      // Load all transaction history
      const allTransactions = await getWalletTransactions(user.id, 100);
      setTransactions(allTransactions);
      
      // Filter credit history (both sent and received)
      const credits = allTransactions.filter(tx => 
        tx.transaction_type === 'user_credit' || tx.transaction_type === 'user_credit_sent'
      );
      setCreditHistory(credits);
      
      // Load tokens earn history (daily claims - includes flamingo egg with contribution_score = -1)
      const { getClaimHistory, syncEarnedTokensBalance } = await import('../utils/dailyTokenRewards');
      const claims = await getClaimHistory(user.id, 50);
      setTokensEarnHistory(claims);
      
      // Sync earned tokens balance from claims
      await syncEarnedTokensBalance(user.id);
      
      // Reload wallet to get updated earned_tokens_balance
      const updatedWallet = await getUserWallet(user.id, false);
      if (updatedWallet) {
        setWallet(updatedWallet);
      }
    } catch (error) {
      error('[WalletScreen] Error loading transaction history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // State for RedemptionScreen modal
  const [showRedemptionScreen, setShowRedemptionScreen] = useState(false);
  const [redemptionMode, setRedemptionMode] = useState<'wallet' | 'earned_tokens'>('wallet');

  // Handle redeeming earned tokens (separate from wallet balance)
  const handleRedeemEarnedTokens = async () => {
    if (!user?.id || !wallet) return;
    
    // Use wallet's earned_tokens_balance (synced from database)
    const earnedTokensBalance = wallet.earned_tokens_balance || 0;
    
    if (earnedTokensBalance < 500) {
      Alert.alert(
        'Minimum Required',
        `You need at least 500 earned tokens to redeem. You currently have ${earnedTokensBalance} earned tokens.`,
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Open RedemptionScreen in earned tokens mode
    setRedemptionMode('earned_tokens');
    setShowRedemptionScreen(true);
  };

  const handlePurchase = async (packageId: string, packageName: string) => {
    // Use IAP on iOS (Apple) and Android (Google Play); Flutterwave only when explicitly chosen (e.g. web).
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        setPurchasing(packageId);
        currentPurchasingPackageRef.current = packageId;
        const result = await purchaseTokens(packageId, 'iap');

        if (result.success) {
          log('✅ [IAP] Purchase initiated');
          setTimeout(() => {
            if (currentPurchasingPackageRef.current === packageId) {
              warn('[WALLET] Purchase timeout - clearing spinner');
              setPurchasing(null);
              currentPurchasingPackageRef.current = null;
            }
          }, 60000);
        } else {
          Alert.alert('Purchase Failed', result.error || 'Failed to start purchase');
          setPurchasing(null);
          currentPurchasingPackageRef.current = null;
        }
      } catch (err: any) {
        error('❌ [IAP] Purchase error:', err);
        Alert.alert('Purchase Error', err.message || 'An error occurred');
        setPurchasing(null);
        currentPurchasingPackageRef.current = null;
      }
      return;
    }

    // Fallback: Flutterwave (e.g. web or other platforms)
    try {
      setPurchasing(packageId);
      const result = await purchaseTokens(packageId, 'flutterwave');

      if (result.success && result.transactionId) {
        const selectedPackage = packages.find(p => p.id === packageId);
        const totalTokens = (selectedPackage?.token_amount || 0) + (selectedPackage?.bonus_tokens || 0);
        log('✅ [PAYMENT] Opening Flutterwave payment page (external web)');
        const { initializeFlutterwavePayment } = await import('../utils/flutterwaveService');
        const { supabase } = await import('../utils/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', user.id)
          .single();
        const paymentResult = await initializeFlutterwavePayment({
          packageId,
          packageName,
          amount: selectedPackage?.price_usd || 0,
          tokenAmount: selectedPackage?.token_amount || 0,
          bonusTokens: selectedPackage?.bonus_tokens || 0,
          totalTokens,
          userEmail: profile?.email || user.email || '',
          userName: profile?.full_name || 'User',
          userId: user.id,
        });
        if (!paymentResult.success || !paymentResult.paymentLink) {
          throw new Error(paymentResult.error || 'Failed to create payment link');
        }
        const canOpen = await Linking.canOpenURL(paymentResult.paymentLink);
        if (canOpen) {
          await Linking.openURL(paymentResult.paymentLink);
        } else {
          await WebBrowser.openBrowserAsync(paymentResult.paymentLink, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            enableBarCollapsing: false,
          });
        }
        pollPaymentStatus(result.transactionId, packageName, totalTokens);
        Toast.show({ type: 'info', text1: 'Complete payment in your browser', text2: 'Return here when done' });
      } else {
        Alert.alert('Error', result.error || 'Failed to initialize payment');
      }
    } catch (err: any) {
      error('❌ [PAYMENT] Error purchasing tokens:', err);
      Alert.alert('Error', err.message || 'Failed to purchase tokens');
    } finally {
      setPurchasing(null);
    }
  };

  // Show Coming Soon animation for iOS
  const showComingSoonAnimation = () => {
    setShowComingSoonModal(true);
    
    // Reset animations
    comingSoonScaleAnim.setValue(0);
    comingSoonOpacityAnim.setValue(0);
    comingSoonPulseAnim.setValue(1);
    
    // Animate in
    Animated.parallel([
      Animated.spring(comingSoonScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(comingSoonOpacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Gentle pulse animation for sparkle effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(comingSoonPulseAnim, {
          toValue: 1.15,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(comingSoonPulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };
  
  const hideComingSoonModal = () => {
    Animated.parallel([
      Animated.timing(comingSoonScaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(comingSoonOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowComingSoonModal(false);
    });
  };

  const pollPaymentStatus = async (transactionId: string, packageName: string, tokenAmount: number) => {
    // Stop any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (appStateSubscriptionRef.current) {
      appStateSubscriptionRef.current.remove();
      appStateSubscriptionRef.current = null;
    }
    
    const { verifyFlutterwavePayment } = await import('../utils/flutterwaveService');
    const { supabase } = await import('../utils/supabase');
    
    let attempts = 0;
    const maxAttempts = 60; // 60 attempts = 60 seconds (webhooks can take time)
    
    // Function to check payment status
    const checkPaymentStatus = async (): Promise<boolean> => {
      // First check database directly (webhook might have processed it)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: purchase } = await supabase
            .from('token_purchases')
            .select('status')
            .eq('payment_id', transactionId)
            .eq('user_id', user.id)
            .single();

          if (purchase && purchase.status === 'completed') {
            log('✅ [PAYMENT] Payment completed (found in database)');
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (appStateSubscriptionRef.current) {
              appStateSubscriptionRef.current.remove();
              appStateSubscriptionRef.current = null;
            }
            setSuccessData({ tokens: tokenAmount, packageName });
            showSuccessAnimation();
            await loadWalletData();
            return true;
          }
        }
      } catch (dbError) {
        log('🔍 [PAYMENT] Checking Flutterwave API...');
      }
      
      // If not in DB, verify with Flutterwave API
      const result = await verifyFlutterwavePayment(transactionId);
      
      if (result.verified) {
        log('✅ [PAYMENT] Payment verified via API');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (appStateSubscriptionRef.current) {
          appStateSubscriptionRef.current.remove();
          appStateSubscriptionRef.current = null;
        }
        setSuccessData({ tokens: tokenAmount, packageName });
        showSuccessAnimation();
        await loadWalletData();
        return true;
      }
      
      return false;
    };
    
    // Listen for app state changes (when user returns from browser)
    appStateSubscriptionRef.current = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        log('📱 [PAYMENT] App became active, checking payment status immediately');
        // Immediately check when app comes back to foreground
        const completed = await checkPaymentStatus();
        if (completed && pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          if (appStateSubscriptionRef.current) {
            appStateSubscriptionRef.current.remove();
            appStateSubscriptionRef.current = null;
          }
        }
      }
    });
    
    // Start polling
    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      
      const completed = await checkPaymentStatus();
      if (completed) {
        if (appStateSubscriptionRef.current) {
          appStateSubscriptionRef.current.remove();
          appStateSubscriptionRef.current = null;
        }
        return;
      }
      
      if (attempts >= maxAttempts) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (appStateSubscriptionRef.current) {
          appStateSubscriptionRef.current.remove();
          appStateSubscriptionRef.current = null;
        }
        
        // Check one more time before showing pending message
        const { supabase } = await import('../utils/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: finalCheck } = await supabase
            .from('token_purchases')
            .select('status')
            .eq('payment_id', transactionId)
            .eq('user_id', user.id)
            .single();

          if (finalCheck && finalCheck.status === 'completed') {
            // Payment was completed, show success
            setSuccessData({ tokens: tokenAmount, packageName });
            showSuccessAnimation();
            await loadWalletData();
          } else {
            // Still pending
            Alert.alert(
              'Payment Pending',
              'Your payment is being processed. Your tokens will be added once payment is confirmed. You can close this and check back later.',
              [{ text: 'OK', onPress: () => loadWalletData() }]
            );
          }
        } else {
          Alert.alert(
            'Payment Pending',
            'Your payment is being processed. Your tokens will be added once payment is confirmed.',
            [{ text: 'OK', onPress: () => loadWalletData() }]
          );
        }
      }
    }, 2000); // Poll every 2 seconds (reduced frequency)
  };

  const showSuccessAnimation = () => {
    setShowSuccessModal(true);
    Animated.parallel([
      Animated.spring(successScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(successOpacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Removed auto-hide - user must manually close the modal
  };

  const hideSuccessModal = () => {
    Animated.parallel([
      Animated.timing(successScaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowSuccessModal(false);
      setSuccessData(null);
    });
  };

  const formatPrice = (priceUSD: number) => {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Coins size={14} color={colors.textSecondary} strokeWidth={2} />
        <Text style={{ color: colors.textSecondary }}>${priceUSD.toFixed(2)}</Text>
      </View>
    );
  };

  const formatTokens = (amount: number) => {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + 'K';
    }
    return amount.toString();
  };

  const formatCurrency = (amount: number) => {
    return `$${Math.round(amount)}`;
  };


  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, flex: 1 }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>wallet</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
            <X size={18} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={[styles.loadingText, { color: colors.text }]}>loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background, flex: 1 }]} edges={['top']}>
      <Animated.View style={[styles.content, { opacity: fadeAnim, flex: 1 }]}>
        {/* Premium Apple-Style Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>wallet</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
            <X size={18} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFD700" />
          }
          showsVerticalScrollIndicator={false}
        >
            {/* Sleek Balance Card */}
            <View style={[styles.balanceCard, { 
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
            }]}>
              <View style={styles.balanceHeader}>
                <View style={styles.coinIconContainer}>
                  <GoldenNCoin size={24} showAmount={false} />
                </View>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>token earned</Text>
              </View>
              
            <View style={styles.balanceAmountContainer}>
            <Text style={[styles.balanceAmount, { color: colors.text }]}>
              {formatTokens(wallet?.token_balance || 0)}
            </Text>
            </View>
              <Text style={[styles.balanceSubtext, { color: colors.textSecondary }]}>tokens</Text>
            
            {/* Get Tokens Button - in-app modal for both iOS (IAP) and Android (Google Play Billing) */}
            <TouchableOpacity
              style={styles.getTokensButton}
              onPress={async () => {
                setIsLoadingProducts(true);
                setProductsError(null);
                try {
                  if (Platform.OS === 'ios') {
                    const { initializeStoreKit, fetchProducts } = await import('../utils/storeKitService');
                    const initialized = await initializeStoreKit();
                    if (initialized) await fetchProducts();
                  }
                  // Android: packages come from token_packages (iap_product_id used for Google Play too)
                } catch (error: any) {
                  error('[WALLET] Error fetching products:', error);
                  setProductsError('Failed to load products. Please try again.');
                } finally {
                  setIsLoadingProducts(false);
                  setShowGetTokensModal(true);
                }
              }}
              activeOpacity={0.7}
              disabled={isLoadingProducts}
            >
              {isLoadingProducts ? (
                <ActivityIndicator size="small" color="#FFD700" />
              ) : (
                <>
                  <Coins size={16} color="#FFD700" strokeWidth={2.5} />
                  <Text style={styles.getTokensButtonText}>Get Tokens</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Token Purchase Disclaimer - iOS only - REMOVED for testing */}
          {/* {Platform.OS === 'ios' && (
            <View style={[styles.disclaimerCard, {
              backgroundColor: isDarkMode ? 'rgba(255, 152, 0, 0.1)' : 'rgba(255, 152, 0, 0.08)',
              borderColor: isDarkMode ? 'rgba(255, 152, 0, 0.3)' : 'rgba(255, 152, 0, 0.25)',
            }]}>
              <View style={styles.disclaimerContent}>
                <View style={styles.disclaimerIcon}>
                  <Info size={18} color={isDarkMode ? '#FF9800' : '#F57C00'} strokeWidth={2.5} />
                </View>
                <View style={styles.disclaimerTextContainer}>
                  <Text style={[styles.disclaimerTitle, { color: isDarkMode ? '#FFB74D' : '#E65100' }]}>
                    Token Purchase & Withdrawal Temporarily Unavailable
                  </Text>
                  <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
                    We're currently updating our payment systems. Token purchases and withdrawals will be available soon. Thank you for your patience.
                  </Text>
                </View>
              </View>
            </View>
          )} */}

          {/* Transaction History Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>history</Text>
            </View>
            
            {/* Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'all' && styles.activeTab]}
                onPress={() => setActiveTab('all')}
                activeOpacity={0.7}
              >
                <History size={14} color={activeTab === 'all' ? colors.text : colors.textSecondary} />
                <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText, { color: activeTab === 'all' ? colors.text : colors.textSecondary }]}>
                  All
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.tab, activeTab === 'credits' && styles.activeTab]}
                onPress={() => setActiveTab('credits')}
                activeOpacity={0.7}
              >
                <Gift size={14} color={activeTab === 'credits' ? colors.text : colors.textSecondary} />
                <Text style={[styles.tabText, activeTab === 'credits' && styles.activeTabText, { color: activeTab === 'credits' ? colors.text : colors.textSecondary }]}>
                  Credits
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.tab, activeTab === 'tokensEarn' && styles.activeTab]}
                onPress={() => setActiveTab('tokensEarn')}
                activeOpacity={0.7}
              >
                <Award size={14} color={activeTab === 'tokensEarn' ? colors.text : colors.textSecondary} />
                <Text style={[styles.tabText, activeTab === 'tokensEarn' && styles.activeTabText, { color: activeTab === 'tokensEarn' ? colors.text : colors.textSecondary }]}>
                  Tokens Earn
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* Transaction List */}
            {loadingHistory ? (
              <View style={styles.historyLoadingContainer}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
              </View>
            ) : (
              <>
                {activeTab === 'all' && (
                  <View style={styles.historyList}>
                    {transactions.length === 0 ? (
                      <View style={styles.emptyHistory}>
                        <Text style={[styles.emptyHistoryText, { color: colors.textSecondary }]}>
                          No transactions yet
                        </Text>
                      </View>
                    ) : (
                      transactions.slice(0, 20).map((tx) => (
                        <TransactionItem key={tx.id} transaction={tx} colors={colors} isDarkMode={isDarkMode} />
                      ))
                    )}
                  </View>
                )}
                
                {activeTab === 'credits' && (
                  <View style={styles.historyList}>
                    {creditHistory.length === 0 ? (
                      <View style={styles.emptyHistory}>
                        <Text style={[styles.emptyHistoryText, { color: colors.textSecondary }]}>
                          No credit history yet
                        </Text>
                      </View>
                    ) : (
                      creditHistory.slice(0, 20).map((tx) => (
                        <CreditTransactionItem key={tx.id} transaction={tx} colors={colors} isDarkMode={isDarkMode} userId={user.id} />
                      ))
                    )}
                  </View>
                )}
                
                {activeTab === 'tokensEarn' && (
                  <View style={styles.historyList}>
                    {(() => {
                      // Use wallet's earned_tokens_balance (synced from database)
                      const earnedTokensBalance = wallet?.earned_tokens_balance || 0;
                      const earnedTokensRedeemed = wallet?.earned_tokens_redeemed || 0;
                      const totalEarnedAllTime = earnedTokensBalance + earnedTokensRedeemed;
                      const canRedeem = earnedTokensBalance >= 500;
                      const progressTo500 = Math.min((earnedTokensBalance / 500) * 100, 100);
                      const tokensNeeded = Math.max(500 - earnedTokensBalance, 0);
                      
                      return (
                        <>
                          {/* Total Earned Tokens Summary & Redeem Button */}
                          {(tokensEarnHistory.length > 0 || earnedTokensBalance > 0) && (
                            <View style={[styles.earnedTokensSummary, {
                              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                            }]}>
                              <View style={styles.earnedTokensInfo}>
                                <Award size={18} color="#FFD700" />
                                <View style={styles.earnedTokensTextContainer}>
                                  <Text style={[styles.earnedTokensLabel, { color: colors.textSecondary }]}>
                                    Available Earned Tokens
                                  </Text>
                                  <Text style={[styles.earnedTokensAmount, { color: '#FFD700' }]}>
                                    {earnedTokensBalance.toLocaleString()} tokens
                                  </Text>
                                  {totalEarnedAllTime > earnedTokensBalance && (
                                    <Text style={[styles.earnedTokensSubtext, { color: colors.textTertiary }]}>
                                      Total earned: {totalEarnedAllTime.toLocaleString()} • Redeemed: {earnedTokensRedeemed.toLocaleString()}
                                    </Text>
                                  )}
                                </View>
                              </View>
                              
                              {/* Progress Bar */}
                              {!canRedeem && earnedTokensBalance > 0 && (
                                <View style={styles.progressContainer}>
                                  <View style={[styles.progressBar, {
                                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                                  }]}>
                                    <View style={[styles.progressFill, {
                                      width: `${progressTo500}%`,
                                      backgroundColor: '#FFD700',
                                    }]} />
                                  </View>
                                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                                    {tokensNeeded} more tokens needed to redeem
                                  </Text>
                                </View>
                              )}
                              
                              <TouchableOpacity
                                style={[
                                  styles.redeemButton,
                                  {
                                    backgroundColor: canRedeem 
                                      ? colors.primary.main 
                                      : isDarkMode 
                                        ? 'rgba(255, 255, 255, 0.1)' 
                                        : 'rgba(0, 0, 0, 0.1)',
                                    opacity: canRedeem ? 1 : 0.5,
                                  }
                                ]}
                                onPress={canRedeem ? handleRedeemEarnedTokens : undefined}
                                disabled={!canRedeem}
                                activeOpacity={canRedeem ? 0.7 : 1}
                              >
                                <Text style={[
                                  styles.redeemButtonText,
                                  { 
                                    color: canRedeem ? '#FFFFFF' : colors.textSecondary 
                                  }
                                ]}>
                                  {canRedeem ? 'Redeem as Airtime/Data' : `Need ${tokensNeeded} more`}
                                </Text>
                              </TouchableOpacity>
                              {!canRedeem && (
                                <Text style={[styles.redeemInfoText, { color: colors.textTertiary }]}>
                                  Minimum 500 tokens required to redeem
                                </Text>
                              )}
                            </View>
                          )}
                          
                          {/* Tokens Earn History List */}
                          {tokensEarnHistory.length === 0 ? (
                            <View style={styles.emptyHistory}>
                              <Text style={[styles.emptyHistoryText, { color: colors.textSecondary }]}>
                                No tokens earned yet
                              </Text>
                            </View>
                          ) : (
                            tokensEarnHistory.slice(0, 20).map((claim) => (
                              <TokensEarnItem key={claim.id} claim={claim} colors={colors} isDarkMode={isDarkMode} />
                            ))
                          )}
                        </>
                      );
                    })()}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Buy Tokens Section placeholder - now inside balance card */}

        </ScrollView>
      </Animated.View>


      {/* Coming Soon Modal - iOS Only */}
      <Modal
        visible={showComingSoonModal}
        transparent
        animationType="none"
        onRequestClose={hideComingSoonModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.comingSoonModal,
              {
                transform: [{ scale: comingSoonScaleAnim }],
                opacity: comingSoonOpacityAnim,
              },
            ]}
          >
            <LinearGradient
              colors={isDarkMode ? ['#1E293B', '#334155', '#475569'] : ['#FFFFFF', '#F8FAFC', '#F1F5F9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.comingSoonGradient}
            >
              {/* Animated background elements */}
              <Animated.View
                style={[
                  styles.floatingIcon,
                  styles.floatingIcon1,
                  { transform: [{ scale: comingSoonPulseAnim }] }
                ]}
              >
                <Sparkles size={20} color="#00D9FF" />
              </Animated.View>
              <Animated.View
                style={[
                  styles.floatingIcon,
                  styles.floatingIcon2,
                  { transform: [{ scale: comingSoonPulseAnim }] }
                ]}
              >
                <Sparkles size={24} color="#A78BFA" />
              </Animated.View>
              <Animated.View
                style={[
                  styles.floatingIcon,
                  styles.floatingIcon3,
                  { transform: [{ scale: comingSoonPulseAnim }] }
                ]}
              >
                <Star size={18} color="#00FF88" fill="#00FF88" />
              </Animated.View>

              {/* Main content */}
              <View style={styles.rocketContainer}>
                <LinearGradient
                  colors={['#00D9FF', '#A78BFA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.rocketGradient}
                >
                  <Rocket size={48} color="#FFFFFF" strokeWidth={2.5} />
                </LinearGradient>
              </View>

              <Text style={[styles.comingSoonTitle, { color: colors.text }]}>Coming Soon!</Text>
              <Text style={[styles.comingSoonSubtitle, { color: colors.textSecondary }]}>
                In-App Purchase
              </Text>
              <Text style={[styles.comingSoonDescription, { color: colors.textSecondary }]}>
                We're implementing secure in-app purchase systems.
              </Text>
              <Text style={[styles.comingSoonDescription, { color: colors.textSecondary }]}>
                Token purchases will be available soon! 🚀
              </Text>

              <TouchableOpacity
                style={styles.comingSoonButton}
                onPress={hideComingSoonModal}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#00D9FF', '#A78BFA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.comingSoonButtonGradient}
                >
                  <Text style={styles.comingSoonButtonText}>Got it!</Text>
                  <Sparkles size={16} color="#FFFFFF" strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>

              <Text style={[styles.comingSoonFooter, { color: colors.textTertiary }]}>
                Thank you for your patience ✨
              </Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="none"
        onRequestClose={hideSuccessModal}
      >
        <View style={styles.modalOverlay}>
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
                  <Sparkles size={24} color="#FFD700" style={styles.sparkle1} />
                  <Sparkles size={20} color="#FFD700" style={styles.sparkle2} />
                  <Sparkles size={18} color="#FFD700" style={styles.sparkle3} />
                </View>
              </Animated.View>
              
              <Text style={styles.successTitle}>payment complete!</Text>
              <Text style={styles.successSubtitle}>
                {successData?.tokens.toLocaleString()} tokens added
              </Text>
              <Text style={styles.successPackage}>{successData?.packageName}</Text>
              
              <TouchableOpacity
                style={styles.successButton}
                onPress={hideSuccessModal}
                activeOpacity={0.8}
              >
                <Text style={styles.successButtonText}>nice!</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* Redemption Screen Modal */}
      <Modal
        visible={showRedemptionScreen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRedemptionScreen(false)}
      >
        <RedemptionScreen 
          onClose={() => {
            setShowRedemptionScreen(false);
            // Reload wallet data after redemption
            loadWalletData(true);
            loadTransactionHistory(true);
          }}
          redemptionMode={redemptionMode}
        />
      </Modal>

      {/* Flamingo Egg Modal */}
      {/* Get Tokens Modal - iOS IAP / Android Google Play Billing */}
      <Modal
        visible={showGetTokensModal}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setShowGetTokensModal(false)}
      >
        <SafeAreaView style={[styles.getTokensModal, { backgroundColor: colors.background }]} edges={['top']}>
          <View style={styles.getTokensHeader}>
            <Text style={[styles.getTokensTitle, { color: colors.text }]}>Get Tokens</Text>
            <TouchableOpacity
              onPress={() => setShowGetTokensModal(false)}
              style={[styles.closeButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
              activeOpacity={0.7}
            >
              <X size={18} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.getTokensContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Current Balance */}
            <View style={styles.getTokensBalanceRow}>
              <GoldenNCoin size={28} showAmount={false} />
              <View>
                <Text style={[styles.getTokensBalanceLabel, { color: colors.textSecondary }]}>Current balance</Text>
                <Text style={[styles.getTokensBalanceAmount, { color: colors.text }]}>
                  {formatTokens(wallet?.token_balance || 0)} tokens
                </Text>
              </View>
            </View>

            {/* Store secure badge - compact */}
            <View style={[styles.getTokensSecureBadge, {
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            }]}>
              <Lock size={14} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.getTokensSecureBadgeText, { color: colors.textSecondary }]}>
                {Platform.OS === 'android' ? 'Secured by Google Play' : 'Secured by Apple'}
              </Text>
            </View>

            {/* Products Error Message */}
            {productsError && (
              <View style={[styles.errorCard, {
                backgroundColor: isDarkMode ? 'rgba(255, 59, 48, 0.1)' : 'rgba(255, 59, 48, 0.08)',
                borderColor: isDarkMode ? 'rgba(255, 59, 48, 0.3)' : 'rgba(255, 59, 48, 0.25)',
              }]}>
                <Text style={[styles.errorText, { color: isDarkMode ? '#FF6B6B' : '#D32F2F' }]}>
                  {productsError}
                </Text>
              </View>
            )}

            {/* Package Grid - compact cards */}
            <View style={styles.getTokensGrid}>
              {packages.filter(pkg => pkg.iap_product_id).length === 0 ? (
                <View style={styles.noProductsContainer}>
                  <Text style={[styles.noProductsText, { color: colors.textSecondary }]}>
                    {Platform.OS === 'ios'
                      ? 'No products available. Please check App Store Connect configuration.'
                      : 'No products available. Please check Google Play Console configuration.'}
                  </Text>
                </View>
              ) : (
                packages.filter(pkg => pkg.iap_product_id).map((pkg, index) => {
                  const iapPackages = packages.filter(x => x.iap_product_id);
                  const isBestValue = iapPackages.length >= 3 && index === 2;
                  return (
                    <TouchableOpacity
                      key={pkg.id}
                      style={[
                        styles.getTokensGridCard,
                        {
                          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                          borderColor: isBestValue
                            ? (isDarkMode ? 'rgba(0, 212, 170, 0.45)' : 'rgba(0, 212, 170, 0.5)')
                            : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'),
                          borderWidth: isBestValue ? 1.5 : 1,
                        },
                      ]}
                      onPress={() => {
                        setShowGetTokensModal(false);
                        setTimeout(() => handlePurchase(pkg.id, pkg.name), 300);
                      }}
                      disabled={purchasing === pkg.id}
                      activeOpacity={0.7}
                    >
                      {purchasing === pkg.id ? (
                        <ActivityIndicator size="small" color="#FFD700" style={{ marginVertical: 8 }} />
                      ) : (
                        <>
                          {isBestValue && (
                            <View style={styles.getTokensGridBestPill}>
                              <Text style={styles.getTokensGridBestPillText}>Best value</Text>
                            </View>
                          )}
                          <Text style={[styles.getTokensGridAmount, { color: colors.text }]}>
                            {pkg.token_amount.toLocaleString()}
                          </Text>
                          <Text style={[styles.getTokensGridLabel, { color: colors.textSecondary }]}>tokens</Text>
                          <View style={[styles.getTokensGridPriceWrap, {
                            backgroundColor: isDarkMode ? 'rgba(255, 215, 0, 0.1)' : 'rgba(255, 215, 0, 0.12)',
                          }]}>
                            <Text style={styles.getTokensGridPrice}>${pkg.price_usd.toFixed(2)}</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* Secure payment - lock + store */}
            <View style={styles.getTokensSecureRow}>
              <Lock size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.getTokensSecureText, { color: colors.textSecondary }]}>
                Secure payment · Tokens added instantly
              </Text>
            </View>

            {/* Footer note */}
            <Text style={[styles.getTokensFooter, { color: colors.textSecondary }]}>
              {Platform.OS === 'ios'
                ? 'Purchases are processed through Apple.'
                : 'Purchases are processed through Google Play.'}
            </Text>

            {/* DEBUG: Test Edge Function Button (remove in production) */}
            {__DEV__ && (
              <TouchableOpacity
                style={[styles.testButton, {
                  backgroundColor: isDarkMode ? 'rgba(0, 122, 255, 0.2)' : 'rgba(0, 122, 255, 0.15)',
                  borderColor: isDarkMode ? 'rgba(0, 122, 255, 0.4)' : 'rgba(0, 122, 255, 0.3)',
                }]}
                onPress={async () => {
                  try {
                    log('[TEST] 🧪 Testing Edge Function call...');
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) {
                      Alert.alert('Error', 'Not logged in');
                      return;
                    }

                    const { data: packageData } = await supabase
                      .from('token_packages')
                      .select('id, iap_product_id')
                      .eq('is_active', true)
                      .limit(1)
                      .single();

                    if (!packageData) {
                      Alert.alert('Error', 'No package found');
                      return;
                    }

                    log('[TEST] 📞 Calling Edge Function with test data...');
                    const { data, error } = await supabase.functions.invoke('verify-apple-receipt', {
                      body: {
                        receipt: 'test-receipt-' + Date.now(),
                        productId: packageData.iap_product_id || 'com.nomli.mingle.coins.micro',
                        transactionId: 'test-' + Date.now(),
                        userId: user.id,
                        packageId: packageData.id,
                      },
                    });

                    log('[TEST] 📥 Edge Function response:', { data, error });
                    if (error) {
                      // Handle FunctionsHttpError and other error types
                      let errorMessage = error.message || error.toString() || 'Unknown error';
                      let errorDetails = '';
                      let edgeFunctionError = '';
                      
                      // Extract status code if available
                      const status = error.status || (error as any).status;
                      if (status) {
                        errorMessage = `HTTP ${status}: ${errorMessage}`;
                      }
                      
                      // Try to extract the actual error message from Edge Function response body
                      // FunctionsHttpError has a context property with the response
                      try {
                        if (error.context) {
                          let responseBody: any = null;
                          
                          // Check if context has a json() method (Response object)
                          if (typeof (error.context as any).json === 'function') {
                            responseBody = await (error.context as any).json();
                          } else if (typeof error.context === 'object') {
                            // Context might already be the parsed object
                            responseBody = error.context;
                          }
                          
                          // Extract error message from response body
                          if (responseBody) {
                            if (responseBody.error) {
                              edgeFunctionError = responseBody.error;
                            } else if (responseBody.message) {
                              edgeFunctionError = responseBody.message;
                            } else if (responseBody.details) {
                              edgeFunctionError = responseBody.details;
                            } else {
                              // If no specific error field, show the whole response for debugging
                              const responseStr = JSON.stringify(responseBody, null, 2);
                              if (responseStr.length < 500) {
                                errorDetails = `\n\nResponse: ${responseStr}`;
                              }
                            }
                          }
                        }
                      } catch (parseError: any) {
                        // If parsing fails, try to stringify the context as fallback
                        try {
                          const contextStr = JSON.stringify(error.context, null, 2);
                          if (contextStr.length < 500) {
                            errorDetails = `\n\nContext: ${contextStr}`;
                          }
                        } catch (e) {
                          // Ignore if context can't be stringified
                          log('[TEST] Could not parse error context:', parseError);
                        }
                      }
                      
                      // Build the final error message
                      let finalMessage = errorMessage;
                      if (edgeFunctionError) {
                        finalMessage = `${errorMessage}\n\nEdge Function Error: ${edgeFunctionError}`;
                      }
                      if (errorDetails) {
                        finalMessage += errorDetails;
                      }
                      
                      // Add helpful note for test data
                      const is400Error = status === 400;
                      const note = is400Error 
                        ? '\n\n✅ Note: A 400 error is expected with test data. The Edge Function correctly rejected invalid receipt data.'
                        : '';
                      
                      Alert.alert(
                        'Test Result - Error',
                        `${finalMessage}${note}`
                      );
                    } else {
                      Alert.alert(
                        'Test Result - Success',
                        `Success: ${JSON.stringify(data, null, 2)}`
                      );
                    }
                  } catch (err: any) {
                    log('[TEST] ❌ Exception:', err);
                    Alert.alert('Test Error', err.message);
                  }
                }}
              >
                <Text style={[styles.testButtonText, { color: '#007AFF' }]}>
                  🧪 Test Edge Function (DEBUG)
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  
  // Premium Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  
  // Sleek Balance Card
  balanceCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  coinIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  balanceAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  demoBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  demoBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF9800',
    letterSpacing: 0.8,
  },
  demoBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  demoBadgeTextSmall: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceSubtext: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
    letterSpacing: -0.1,
  },
  
  // Token Purchase Disclaimer Styles
  disclaimerCard: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  disclaimerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  disclaimerIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  disclaimerTextContainer: {
    flex: 1,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 20,
  },
  disclaimerText: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
  },

  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 14,
    gap: 4,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  // Section
  section: {
    paddingHorizontal: 16,
    marginBottom: 28,
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
    color: '#FFD700',
    letterSpacing: -0.2,
  },

  // Sleek Packages Grid
  packagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  packageCard: {
    width: (screenWidth - 48) / 3,
    padding: 12,
    borderRadius: 14,
    position: 'relative',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 85,
  },
  popularPackage: {
    borderColor: '#00D4AA',
    borderWidth: 1.5,
  },
  popularBadge: {
    position: 'absolute',
    top: -4,
    right: 6,
    backgroundColor: '#00D4AA',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    zIndex: 1,
  },
  popularText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.2,
  },
  vvipPackage: {
    borderColor: '#FF6B35',
    borderWidth: 1.5,
  },
  vvipBadge: {
    position: 'absolute',
    top: -4,
    right: 6,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    zIndex: 1,
  },
  vvipText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  packageContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tokenAmount: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  priceAmount: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.1,
  },


  // Get Tokens Button (inside balance card)
  getTokensButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  getTokensButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: -0.2,
  },

  // Get Tokens Modal
  getTokensModal: {
    flex: 1,
  },
  getTokensHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  getTokensTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  getTokensContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  getTokensBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 28,
    marginTop: 8,
  },
  getTokensBalanceLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  getTokensBalanceAmount: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  getTokensSecureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  getTokensSecureBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  getTokensGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  getTokensGridCard: {
    width: (screenWidth - 40 - 20) / 3,
    minHeight: 88,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getTokensGridAmount: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  getTokensGridLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  getTokensGridPriceWrap: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  getTokensGridPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: -0.2,
  },
  getTokensGridBestPill: {
    marginBottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 212, 170, 0.25)',
    alignSelf: 'center',
  },
  getTokensGridBestPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#00D4AA',
    letterSpacing: 0.2,
  },
  getTokensSecureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  getTokensSecureText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  getTokensFooter: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  testButton: {
    marginTop: 16,
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  noProductsContainer: {
    padding: 32,
    alignItems: 'center',
  },
  noProductsText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },

  // Empty State
  emptyState: {
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 10,
    letterSpacing: -0.1,
  },


  // Success Modal
  modalOverlay: {
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
  // Coming Soon Modal Styles
  comingSoonModal: {
    borderRadius: 28,
    overflow: 'hidden',
    width: Math.min(screenWidth - 48, 340),
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  comingSoonGradient: {
    padding: 36,
    alignItems: 'center',
    position: 'relative',
    minHeight: 420,
    justifyContent: 'center',
  },
  floatingIcon: {
    position: 'absolute',
  },
  floatingIcon1: {
    top: 24,
    right: 24,
  },
  floatingIcon2: {
    bottom: 36,
    left: 24,
  },
  floatingIcon3: {
    top: 60,
    left: 32,
  },
  rocketContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  rocketGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonTitle: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  comingSoonSubtitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 24,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  comingSoonDescription: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 22,
  },
  comingSoonButton: {
    borderRadius: 24,
    marginTop: 28,
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  comingSoonButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 36,
    paddingVertical: 14,
  },
  comingSoonButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  comingSoonFooter: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 24,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  // Coming Soon Message (iOS/Android)
  comingSoonMessage: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  comingSoonMessageTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  comingSoonMessageText: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Transaction History Styles
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeTab: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  activeTabText: {
    fontWeight: '700',
  },
  historyList: {
    gap: 8,
  },
  historyLoadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyHistory: {
    padding: 24,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  earnedTokensSummary: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  earnedTokensInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  earnedTokensTextContainer: {
    flex: 1,
  },
  earnedTokensLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  earnedTokensAmount: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  redeemButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  redeemInfoText: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  earnedTokensSubtext: {
    fontSize: 10,
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    textAlign: 'center',
  },
});

export default WalletScreen;