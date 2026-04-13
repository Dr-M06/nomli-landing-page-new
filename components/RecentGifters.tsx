import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Animated,
  Dimensions,
  TouchableOpacity,
  Modal,
  Platform,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gift, Crown, Star, Zap, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react-native';
import { supabase } from '../utils/supabase';
import { setupGiftTransactionsTable } from '../utils/setupGiftTransactions';
import { log, warn, error } from '../utils/productionLogger';

// import { useTheme } from '../contexts/ThemeContext';

interface RecentGift {
  id: string;
  sender_name: string;
  sender_avatar?: string;
  gift_name: string;
  gift_emoji: string;
  gift_price: number;
  gift_rarity: string;
  gift_quantity: number;
  created_at: string;
  total_value: number;
}

interface RecentGiftersProps {
  streamId: string;
  isStreamer?: boolean;
  position?: 'default' | 'header' | 'subtle'; // 'default' = right side, 'header' = next to streamer name, 'subtle' = minimal, less intrusive
}

const RecentGifters: React.FC<RecentGiftersProps> = ({ streamId, isStreamer = false, position = 'default' }) => {
  // const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [recentGifts, setRecentGifts] = useState<RecentGift[]>([]);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [slideAnim] = useState(new Animated.Value(-400)); // Start off-screen (top)
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const reloadRotateAnim = useRef(new Animated.Value(0)).current;
  
  // Animation values for the gift icon
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Continuous subtle animation for the gift icon
  useEffect(() => {
    // Gentle pulse animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    
    // Gentle rotation animation
    const rotateAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: -1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();
    rotateAnimation.start();

    return () => {
      pulseAnimation.stop();
      rotateAnimation.stop();
    };
  }, []);

  useEffect(() => {
    log('🎁 RecentGifters mounted with streamId:', streamId);
    if (!streamId) {
      log('❌ No streamId provided to RecentGifters');
      setLoadError('No stream ID provided');
      setIsLoading(false);
      return;
    }

    // Reset state when streamId changes
    setRecentGifts([]);
    setIsLoading(true);
    setLoadError(null);

    // Check if table is accessible and load gifts
    setupGiftTransactionsTable().then((success) => {
      if (success) {
        log('✅ Gift transactions table ready');
        loadRecentGiftsWithRetry();
      } else {
        log('⚠️ Table check failed, trying to load gifts anyway...');
        // Try to load gifts even if table check failed
        loadRecentGiftsWithRetry();
      }
    });

    // Subscribe to real-time updates
    log('🎁 Setting up real-time subscription for streamId:', streamId);
    let subscription: any = null;
    
    try {
      subscription = supabase
        .channel(`gift_updates_${streamId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'gift_transactions',
            filter: `stream_id=eq.${streamId}`,
          },
          (payload) => {
            log('🎁 Gift transaction change via real-time:', payload.eventType, payload.new);
            // Always refresh when real-time update comes in (even if modal is open)
            loadRecentGifts(false);
            if (payload.eventType === 'INSERT') {
              animateNewGift();
            }
          }
        )
        .subscribe((status) => {
          log('🎁 Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            log('✅ Successfully subscribed to gift updates');
          } else if (status === 'CHANNEL_ERROR') {
            error('❌ Error subscribing to gift updates - this may be due to RLS policies or network issues');
            // Try to reconnect after a delay
            setTimeout(() => {
              log('🎁 Attempting to reconnect gift subscription...');
              if (subscription) {
                subscription.unsubscribe();
              }
              // The subscription will be recreated on the next useEffect
            }, 5000);
          } else if (status === 'TIMED_OUT') {
            error('❌ Gift subscription timed out');
          } else if (status === 'CLOSED') {
            log('🎁 Gift subscription closed');
          }
        });
    } catch (error) {
      error('🎁 Error setting up gift subscription:', error);
    }

    // Periodic refresh to catch any missed gifts (reduced frequency to save ingress)
    // Real-time subscription handles most updates, polling is just backup
    const refreshInterval = setInterval(() => {
      if (!isLoading && !loadError) {
        log('🔄 Periodic refresh of gifts');
        loadRecentGifts(false);
      }
    }, isModalVisible ? 30000 : 60000); // Increased from 5-10s to 30-60s to reduce ingress

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      clearInterval(refreshInterval);
    };
  }, [streamId, isModalVisible]); // Re-run when modal visibility changes to adjust refresh interval

  const loadRecentGiftsWithRetry = async (retryCount = 0, isManualRefresh = false) => {
    const maxRetries = 3;
    const retryDelay = 1000 * (retryCount + 1); // Exponential backoff

    try {
      log(`🎁 Loading recent gifts (attempt ${retryCount + 1}/${maxRetries + 1})`);
      await loadRecentGifts(isManualRefresh);
      setIsLoading(false);
      setLoadError(null);
      setIsRefreshing(false);
    } catch (error) {
      error(`Error loading recent gifts (attempt ${retryCount + 1}):`, error);

      if (retryCount < maxRetries) {
        log(`🔄 Retrying in ${retryDelay}ms...`);
        setTimeout(() => {
          loadRecentGiftsWithRetry(retryCount + 1, isManualRefresh);
        }, retryDelay);
      } else {
        error('❌ Failed to load recent gifts after all retries');
        setLoadError('Failed to load gifts. Tap to retry.');
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const loadRecentGifts = async (isManualRefresh = false): Promise<void> => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    }
    log('🎁 [RecentGifters] Loading gifts for streamId:', streamId);
    
    // Simple query to get gifts for this stream
    const { data: gifts, error: giftsError } = await supabase
      .from('gift_transactions')
      .select(`
        id,
        sender_id,
        gift_name,
        gift_emoji,
        gift_price,
        gift_rarity,
        created_at
      `)
      .eq('stream_id', streamId)
      .order('created_at', { ascending: false })
      .limit(10);

    log('🎁 [RecentGifters] Database query result:', { 
      giftsCount: gifts?.length || 0, 
      giftsError: giftsError?.message || null,
      streamId 
    });

    if (giftsError) {
      error('❌ [RecentGifters] Error loading recent gifts:', giftsError);
      throw new Error(giftsError.message);
    }

    if (!gifts || gifts.length === 0) {
      log('🎁 [RecentGifters] No gifts found for stream:', streamId);
      setRecentGifts([]);
      return;
    }

    log('🎁 [RecentGifters] Found gifts:', gifts.length);

    // Get sender IDs
    const senderIds = gifts.map(gift => gift.sender_id).filter(Boolean);
    
    // Fetch profiles separately
    let profiles: any[] = [];
    if (senderIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', senderIds);

      if (profilesError) {
        error('Error loading profiles:', profilesError);
        // Don't throw here, just use anonymous names
      } else if (profilesData) {
        profiles = profilesData;
      }
    }

    // Create a map for quick lookup
    const profilesMap = profiles.reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {});

    const formattedGifts = gifts.map((gift: any) => {
      const profile = profilesMap[gift.sender_id];
      // Calculate quantity from total price / base price (assuming base price is stored in gift_price)
      // For now, we'll assume each gift is quantity 1 since the database doesn't store quantity separately
      const gift_quantity = 1;
      return {
        id: gift.id,
        sender_name: profile?.full_name || 'Anonymous',
        sender_avatar: profile?.avatar_url,
        gift_name: gift.gift_name,
        gift_emoji: gift.gift_emoji,
        gift_price: gift.gift_price,
        gift_rarity: gift.gift_rarity,
        gift_quantity: gift_quantity,
        created_at: gift.created_at,
        total_value: gift.gift_price || 0, // Use gift_price as total_value since quantity is always 1
      };
    });

    // Sort by total gift value (most expensive first)
    const sortedGifts = formattedGifts.sort((a, b) => b.total_value - a.total_value);

    log('🎁 Loaded gifts:', sortedGifts.length, sortedGifts);
    setRecentGifts(sortedGifts);
    
    // Reset refreshing state
    if (isRefreshing) {
      setIsRefreshing(false);
    }
  };

  const animateNewGift = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const toggleModal = () => {
    const newVisible = !isModalVisible;
    setIsModalVisible(newVisible);
    
    // Tap animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
    
    if (newVisible) {
      // Opening modal - refresh gifts to ensure latest data
      log('🎁 Modal opening - refreshing gifts');
      setIsLoading(true);
      setLoadError(null);
      loadRecentGiftsWithRetry(0, false);
      
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -400,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  };

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: -400, // Slide up to close
      duration: 250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setIsModalVisible(false);
    });
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return '#FFD700'; // Gold
      case 'epic':
        return '#FF69B4'; // Hot Pink
      case 'rare':
        return '#00D9FF'; // Electric Cyan
      case 'common':
        return '#A78BFA'; // Soft Purple
      default:
        return '#FFFFFF';
    }
  };

  const getRarityIcon = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return <Crown size={14} color="#FFD700" fill="#FFD700" />;
      case 'epic':
        return <Star size={14} color="#FF69B4" fill="#FF69B4" />;
      case 'rare':
        return <Zap size={14} color="#00D9FF" fill="#00D9FF" />;
      default:
        return <Gift size={14} color="#A78BFA" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const giftTime = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - giftTime.getTime()) / 1000);

    if (diffInSeconds < 60) return 'now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    return `${Math.floor(diffInSeconds / 3600)}h ago`;
  };

  const renderGift = ({ item }: { item: RecentGift }) => {
    return (
      <View style={styles.giftItem}>
        <View style={styles.giftContent}>
            {item.sender_avatar ? (
              <Image source={{ uri: item.sender_avatar }} style={styles.senderAvatar} />
            ) : (
              <View style={styles.defaultAvatar}>
                <Text style={styles.avatarText}>{item.sender_name?.charAt(0) || 'A'}</Text>
              </View>
            )}
          
          <View style={styles.giftDetails}>
            <View style={styles.topRow}>
              <Text style={styles.senderName} numberOfLines={1}>{item.sender_name}</Text>
              <Text style={styles.timeAgo}>{formatTimeAgo(item.created_at)}</Text>
            </View>
            
            <View style={styles.bottomRow}>
              <View style={styles.rarityBadge}>
                {getRarityIcon(item.gift_rarity)}
                <Text style={[styles.rarityText, { color: getRarityColor(item.gift_rarity) }]}>
                  {item.gift_rarity}
                </Text>
          </View>
              <View style={styles.giftNameContainer}>
            <Text style={styles.giftEmoji}>{item.gift_emoji}</Text>
                <Text style={styles.giftName} numberOfLines={1}>
              {item.gift_quantity > 1 ? `${item.gift_quantity}x ` : ''}{item.gift_name}
            </Text>
          </View>
        </View>
          </View>
          
          <View style={[styles.priceTag, { 
            backgroundColor: item.total_value >= 500 ? 'rgba(255, 215, 0, 0.12)' : 
                            item.total_value >= 200 ? 'rgba(155, 89, 182, 0.12)' : 
                            item.total_value >= 100 ? 'rgba(52, 152, 219, 0.12)' : 
                            'rgba(149, 165, 166, 0.12)' 
          }]}>
            <Text style={[styles.priceText, { 
              color: item.total_value >= 500 ? '#FFD700' : 
                     item.total_value >= 200 ? '#9B59B6' : 
                     item.total_value >= 100 ? '#3498DB' : 
                     '#95A5A6' 
            }]}>
              {item.total_value}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Don't render if no gifts and position is 'subtle' (less intrusive)
  if (position === 'subtle' && recentGifts.length === 0 && !isLoading) {
    return null;
  }

  return (
    <>
      {/* Gift Icon Button */}
      <Animated.View
        style={{
          transform: [
            { scale: Animated.multiply(scaleAnim, pulseAnim) },
            { 
              rotate: rotateAnim.interpolate({
                inputRange: [-1, 1],
                outputRange: ['-8deg', '8deg'],
              })
            },
          ],
        }}
      >
        <TouchableOpacity 
          style={
            position === 'header' ? styles.giftButtonHeader : 
            position === 'subtle' ? styles.giftButtonSubtle : 
            styles.giftButton
          } 
          onPress={toggleModal}
          activeOpacity={0.7}
        >
          {/* Show most recent sender's avatar if available, otherwise show gift icon */}
          {recentGifts.length > 0 && recentGifts[0].sender_avatar ? (
            <View style={styles.avatarIconContainer}>
              <Image 
                source={{ uri: recentGifts[0].sender_avatar }} 
                style={position === 'header' ? styles.avatarIconHeader : styles.avatarIcon}
                resizeMode="cover"
              />
              {/* Small gift icon indicator at bottom-right (TikTok style) - minimal, doesn't block */}
              <View style={[styles.giftIconBadge, position === 'header' && styles.giftIconBadgeHeader]}>
                <Gift size={position === 'header' ? 6 : 7} color="#FFFFFF" strokeWidth={2} fill="#FF69B4" />
              </View>
              {/* Counter badge at bottom-right (only if multiple gifts) - clean TikTok style */}
              {recentGifts.length > 1 && (
                <Animated.View style={[
                  styles.badge, 
                  position === 'header' ? styles.badgeHeader : 
                  position === 'subtle' ? styles.badgeSubtle : 
                  styles.badgeDefault, 
                  { transform: [{ scale: pulseAnim }] }
                ]}>
                  <Text style={[
                    styles.badgeText, 
                    position === 'header' && styles.badgeTextHeader,
                    position === 'subtle' && styles.badgeTextSubtle
                  ]}>{recentGifts.length}</Text>
                </Animated.View>
              )}
            </View>
          ) : (
            <View style={styles.giftIconContainer}>
              <Gift size={position === 'header' ? 14 : position === 'subtle' ? 14 : 16} color={position === 'subtle' ? 'rgba(255, 255, 255, 0.7)' : '#FFFFFF'} strokeWidth={2.5} />
              {recentGifts.length > 0 && (
                <Animated.View style={[
                  styles.badge, 
                  position === 'header' ? styles.badgeHeader : 
                  position === 'subtle' ? styles.badgeSubtle : 
                  styles.badgeDefault, 
                  { transform: [{ scale: pulseAnim }] }
                ]}>
                  <Text style={[
                    styles.badgeText, 
                    position === 'header' && styles.badgeTextHeader,
                    position === 'subtle' && styles.badgeTextSubtle
                  ]}>{recentGifts.length}</Text>
                </Animated.View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Dropdown Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop} 
            onPress={closeModal}
            activeOpacity={1}
          />
          <Animated.View style={[
            styles.dropdownModal, 
            { 
              transform: [{ translateY: slideAnim }],
              top: insets.top + 60, // Position below header
            }
          ]}>
            <BlurView intensity={95} tint="dark" style={styles.blurContainer}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <View style={styles.iconWrapper}>
                    <Gift size={18} color="#FF69B4" strokeWidth={2.5} />
                  </View>
                  <Text style={styles.modalTitle}>Gifts</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{recentGifts.length}</Text>
                  </View>
                </View>
                <View style={styles.modalHeaderRight}>
                  <TouchableOpacity 
                    onPress={() => {
                      setIsLoading(true);
                      setLoadError(null);
                      setIsRefreshing(true);
                      
                      // Start rotation animation
                      reloadRotateAnim.setValue(0);
                      Animated.loop(
                        Animated.timing(reloadRotateAnim, {
                          toValue: 1,
                          duration: 1000,
                          easing: Easing.linear,
                          useNativeDriver: true,
                        })
                      ).start();
                      
                      loadRecentGifts(true).then(() => {
                        // Stop animation when done
                        reloadRotateAnim.stopAnimation();
                        reloadRotateAnim.setValue(0);
                      });
                    }} 
                    style={styles.reloadButton}
                    disabled={isLoading || isRefreshing}
                    activeOpacity={0.7}
                  >
                    <Animated.View
                      style={{
                        transform: [{
                          rotate: reloadRotateAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        }],
                      }}
                    >
                      <RefreshCw 
                        size={16} 
                        color={isLoading || isRefreshing ? "rgba(255, 255, 255, 0.5)" : "#FFFFFF"} 
                        strokeWidth={2.5}
                      />
                    </Animated.View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.modalContent}>
              {isLoading ? (
                <View style={styles.loadingState}>
                  <Text style={styles.loadingText}>Loading gifts...</Text>
                </View>
              ) : loadError ? (
                <View style={styles.errorState}>
                  <Text style={styles.errorText}>{loadError}</Text>
                  <TouchableOpacity 
                    style={styles.retryButton}
                    onPress={() => {
                      setIsLoading(true);
                      setLoadError(null);
                      loadRecentGiftsWithRetry();
                    }}
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : recentGifts.length > 0 ? (
                <FlatList
                  data={recentGifts}
                  renderItem={renderGift}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={true}
                  scrollEnabled={true}
                  style={styles.giftsList}
                />
              ) : (
                <View style={styles.emptyState}>
                  <Gift size={48} color="rgba(255, 255, 255, 0.3)" />
                  <Text style={styles.emptyText}>No gifts yet</Text>
                  <Text style={styles.emptySubtext}>Be the first to send a gift!</Text>
                </View>
              )}
              </View>
            </BlurView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Gift Icon Button (positioned below action buttons - default)
  giftButton: {
    position: 'absolute',
    top: 330, // Moved further down to avoid overlapping with header
    right: 12, // Aligned with action buttons
    width: 32,
    height: 32,
    backgroundColor: 'rgba(255, 105, 180, 0.9)', // Hot pink - Gen Z friendly
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 95, // Higher than dropdown but lower than action buttons
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  // Gift Icon Button (positioned in header next to streamer name)
  giftButtonHeader: {
    width: 28,
    height: 28,
    backgroundColor: 'transparent', // Clean, no background
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    overflow: 'visible', // Allow badge to be visible outside
  },
  giftIconContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    backgroundColor: '#FF3B30', // Clean red like TikTok
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  badgeDefault: {
    bottom: -4,
    right: -4,
  },
  badgeHeader: {
    bottom: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 12,
  },
  badgeTextHeader: {
    fontSize: 8,
    lineHeight: 10,
  },
  badgeTextSubtle: {
    fontSize: 9,
    lineHeight: 11,
  },
  // Gift Icon Button (subtle, less intrusive)
  giftButtonSubtle: {
    width: 28,
    height: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Very transparent dark background
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)', // Very subtle border
  },
  badgeSubtle: {
    bottom: -3,
    right: -3,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 59, 48, 0.85)', // Slightly transparent
  },
  avatarIconContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'visible', // Allow badges to be visible
    position: 'relative',
  },
  avatarIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarIconHeader: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  giftIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FF69B4',
    borderRadius: 8,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#FF69B4',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 2,
  },
  giftIconBadgeHeader: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dropdownModal: {
    position: 'absolute',
    left: 12,
    right: 12,
    maxHeight: 400,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#FF69B4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  blurContainer: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 25, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 105, 180, 0.2)',
    borderRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 105, 180, 0.15)',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 105, 180, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  countBadge: {
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.3)',
  },
  countBadgeText: {
    color: '#00D9FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButtonText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  giftsList: {
    flex: 1,
  },
  giftItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  giftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  senderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
  },
  defaultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(167, 139, 250, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.4)',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  giftDetails: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  senderName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.3,
  },
  timeAgo: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  rarityText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  giftNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  giftEmoji: {
    fontSize: 14,
  },
  giftName: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
    letterSpacing: -0.2,
  },
  priceTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 45,
    alignItems: 'center',
  },
  priceText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  emptySubtext: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  debugText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '500',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: 'rgba(0, 128, 128, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 128, 128, 0.3)',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default RecentGifters;
