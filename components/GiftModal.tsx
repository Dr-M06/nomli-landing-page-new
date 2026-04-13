import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Dimensions,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Gift, Heart, Star, Crown, Diamond, Plus, Minus, Coins, HelpCircle, ChevronDown } from 'lucide-react-native';
import { getUserWallet, updateWalletBalance } from '../utils/walletService';
import { supabase } from '../utils/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { log, warn, error } from '../utils/productionLogger';


const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Responsive grid: 3 columns on mobile
const getColumns = () => {
  return 3;
};

// Calculate gift item width for 3 columns
// Formula: (screenWidth - horizontalPadding - gaps) / columns
// horizontalPadding: 16px left + 16px right = 32px
// gaps: 10px between items, 2 gaps for 3 columns = 20px
const calculateGiftItemWidth = () => {
  const padding = 32; // 16px each side
  const gaps = 20; // 10px * 2 gaps
  const calculated = (screenWidth - padding - gaps) / 3;
  return Math.max(52, Math.floor(calculated)); // Smaller tiles (closer to TikTok)
};
const GIFT_ITEM_WIDTH = calculateGiftItemWidth();

interface Gift {
  id: string;
  name: string;
  emoji: string;
  usdPrice: number; // USD price only (tokens calculated as usdPrice * 100)
  icon: React.ReactNode;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// Helper function to calculate token price from USD (1 token = $0.01)
const getTokenPrice = (usdPrice: number): number => {
  // Use Math.ceil to round up fractional penny tokens (e.g., 0.5 tokens rounds to 1)
  // This matches the backend calculation and allows users with 10 tokens to send penny gifts
  return Math.ceil(usdPrice * 100); // Convert USD to tokens (e.g., $0.01 = 1 token, $0.005 = 1 token)
};

const GIFT_ITEMS: Gift[] = [
  // PENNY GIFTS - Ultra Affordable (reduced by 50%)
  {
    id: 'heart',
    name: 'Heart',
    emoji: '❤️',
    usdPrice: 0.005,
    icon: <Heart size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'thumbs_up',
    name: 'Thumbs Up',
    emoji: '👍',
    usdPrice: 0.005,
    icon: <Heart size={16} color="#4CAF50" />,
    rarity: 'common',
  },
  {
    id: 'clap',
    name: 'Clap',
    emoji: '👏',
    usdPrice: 0.005,
    icon: <Heart size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'star',
    name: 'Star',
    emoji: '⭐',
    usdPrice: 0.01,
    icon: <Star size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'fire',
    name: 'Fire',
    emoji: '🔥',
    usdPrice: 0.01,
    icon: <Star size={16} color="#FF4500" />,
    rarity: 'common',
  },
  {
    id: 'rose',
    name: 'Rose',
    emoji: '🌹',
    usdPrice: 0.015,
    icon: <Heart size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    emoji: '✨',
    usdPrice: 0.015,
    icon: <Star size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'kiss',
    name: 'Kiss',
    emoji: '💋',
    usdPrice: 0.025,
    icon: <Heart size={16} color="#FF1493" />,
    rarity: 'common',
  },
  {
    id: 'chocolate',
    name: 'Chocolate',
    emoji: '🍫',
    usdPrice: 0.03,
    icon: <Gift size={16} color="#8B4513" />,
    rarity: 'common',
  },
  
  // Budget Gifts (reduced by 60%)
  {
    id: 'pizza',
    name: 'Pizza Slice',
    emoji: '🍕',
    usdPrice: 0.04,
    icon: <Gift size={16} color="#FF6347" />,
    rarity: 'common',
  },
  {
    id: 'popcorn',
    name: 'Popcorn',
    emoji: '🍿',
    usdPrice: 0.04,
    icon: <Gift size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'coffee',
    name: 'Coffee',
    emoji: '☕',
    usdPrice: 0.06,
    icon: <Gift size={16} color="#8B4513" />,
    rarity: 'common',
  },
  {
    id: 'ice_cream',
    name: 'Ice Cream',
    emoji: '🍦',
    usdPrice: 0.06,
    icon: <Gift size={16} color="#FFB6C1" />,
    rarity: 'common',
  },
  {
    id: 'cake',
    name: 'Cake',
    emoji: '🎂',
    usdPrice: 0.10,
    icon: <Gift size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'nomli_sticker',
    name: 'Nomli Sticker',
    emoji: '🏷️',
    usdPrice: 0.06,
    icon: <Gift size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'mingle_hat',
    name: 'Mingle Cap',
    emoji: '🧢',
    usdPrice: 0.10,
    icon: <Gift size={16} color="#FF69B4" />,
    rarity: 'common',
  },

  // Cheap gifts – 5 to 25 tokens
  {
    id: 'candy',
    name: 'Candy',
    emoji: '🍬',
    usdPrice: 0.05,
    icon: <Gift size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'high_five',
    name: 'High Five',
    emoji: '🙌',
    usdPrice: 0.05,
    icon: <Heart size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'beer',
    name: 'Cheers',
    emoji: '🍻',
    usdPrice: 0.10,
    icon: <Gift size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'sunglasses',
    name: 'Sunglasses',
    emoji: '😎',
    usdPrice: 0.10,
    icon: <Star size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'taco',
    name: 'Taco',
    emoji: '🌮',
    usdPrice: 0.10,
    icon: <Gift size={16} color="#FF6347" />,
    rarity: 'common',
  },
  {
    id: 'smoothie',
    name: 'Smoothie',
    emoji: '🥤',
    usdPrice: 0.15,
    icon: <Gift size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'movie_ticket',
    name: 'Movie Ticket',
    emoji: '🎬',
    usdPrice: 0.15,
    icon: <Star size={16} color="#9370DB" />,
    rarity: 'common',
  },
  {
    id: 'donut',
    name: 'Donut',
    emoji: '🍩',
    usdPrice: 0.15,
    icon: <Gift size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'dinner',
    name: 'Dinner',
    emoji: '🍽️',
    usdPrice: 0.20,
    icon: <Gift size={16} color="#FF6347" />,
    rarity: 'common',
  },
  {
    id: 'teddy',
    name: 'Teddy Bear',
    emoji: '🧸',
    usdPrice: 0.20,
    icon: <Heart size={16} color="#8B4513" />,
    rarity: 'common',
  },
  {
    id: 'lipstick',
    name: 'Lipstick',
    emoji: '💄',
    usdPrice: 0.20,
    icon: <Heart size={16} color="#FF1493" />,
    rarity: 'common',
  },
  {
    id: 'brunch',
    name: 'Brunch',
    emoji: '🥞',
    usdPrice: 0.25,
    icon: <Gift size={16} color="#FFD700" />,
    rarity: 'common',
  },
  {
    id: 'gift_card',
    name: 'Gift Card',
    emoji: '🎟️',
    usdPrice: 0.25,
    icon: <Gift size={16} color="#00BFFF" />,
    rarity: 'common',
  },
  
  // Value Gifts (reduced by 50%)
  {
    id: 'bouquet',
    name: 'Bouquet',
    emoji: '💐',
    usdPrice: 0.35,
    icon: <Heart size={16} color="#FF69B4" />,
    rarity: 'common',
  },
  {
    id: 'nomli_hoodie',
    name: 'Nomli Hoodie',
    emoji: '👕',
    usdPrice: 0.50,
    icon: <Gift size={16} color="#00BFFF" />,
    rarity: 'common',
  },
  {
    id: 'mingle_sneakers',
    name: 'Mingle Sneakers',
    emoji: '👟',
    usdPrice: 0.50,
    icon: <Gift size={16} color="#00BFFF" />,
    rarity: 'common',
  },
  {
    id: 'nomli_backpack',
    name: 'Nomli Backpack',
    emoji: '🎒',
    usdPrice: 0.50,
    icon: <Gift size={16} color="#00BFFF" />,
    rarity: 'common',
  },
  {
    id: 'champagne_bottle',
    name: 'Champagne Bottle',
    emoji: '🍾',
    usdPrice: 0.50,
    icon: <Crown size={16} color="#FFD700" />,
    rarity: 'common',
  },
  
  // Rare Gifts (reduced by 60%)
  {
    id: 'diamond',
    name: 'Diamond',
    emoji: '💎',
    usdPrice: 2.00,
    icon: <Diamond size={16} color="#FFD700" />,
    rarity: 'rare',
  },
  {
    id: 'nomli_airpods',
    name: 'Nomli AirPods',
    emoji: '🎧',
    usdPrice: 3.00,
    icon: <Gift size={16} color="#9370DB" />,
    rarity: 'rare',
  },
  {
    id: 'crown',
    name: 'Crown',
    emoji: '👑',
    usdPrice: 4.00,
    icon: <Crown size={16} color="#FFD700" />,
    rarity: 'rare',
  },
  {
    id: 'mingle_laptop',
    name: 'Mingle Laptop',
    emoji: '💻',
    usdPrice: 5.00,
    icon: <Gift size={16} color="#9370DB" />,
    rarity: 'rare',
  },
  {
    id: 'luxury_perfume',
    name: 'Luxury Perfume',
    emoji: '🌸',
    usdPrice: 6.00,
    icon: <Heart size={16} color="#FF69B4" />,
    rarity: 'rare',
  },
  
  // Epic Gifts (reduced by 60%)
  {
    id: 'trophy',
    name: 'Trophy',
    emoji: '🏆',
    usdPrice: 10.00,
    icon: <Star size={16} color="#FFD700" />,
    rarity: 'epic',
  },
  {
    id: 'luxury_spa',
    name: 'Luxury Spa Day',
    emoji: '🧖‍♀️',
    usdPrice: 12.00,
    icon: <Heart size={16} color="#FF69B4" />,
    rarity: 'epic',
  },
  {
    id: 'nomli_golden_ring',
    name: 'Nomli Golden Ring',
    emoji: '💍',
    usdPrice: 20.00,
    icon: <Crown size={16} color="#FFD700" />,
    rarity: 'epic',
  },
  
  // Legendary Gifts (reduced by 50-60%, but VVIP kept a bit higher)
  {
    id: 'luxury_watch',
    name: 'Luxury Watch',
    emoji: '⌚',
    usdPrice: 40.00,
    icon: <Star size={16} color="#FFD700" />,
    rarity: 'legendary',
  },
  {
    id: 'mingle_diamond_necklace',
    name: 'Mingle Diamond Necklace',
    emoji: '💎',
    usdPrice: 60.00,
    icon: <Diamond size={16} color="#FFD700" />,
    rarity: 'legendary',
  },
  {
    id: 'designer_handbag',
    name: 'Designer Handbag',
    emoji: '👜',
    usdPrice: 80.00,
    icon: <Crown size={16} color="#FF69B4" />,
    rarity: 'legendary',
  },
  {
    id: 'gold_bracelet',
    name: 'Gold Bracelet',
    emoji: '📿',
    usdPrice: 100.00,
    icon: <Diamond size={16} color="#FFD700" />,
    rarity: 'legendary',
  },
  {
    id: 'designer_shoes',
    name: 'Designer Shoes',
    emoji: '👠',
    usdPrice: 120.00,
    icon: <Crown size={16} color="#FF69B4" />,
    rarity: 'legendary',
  },
  {
    id: 'diamond_earrings',
    name: 'Diamond Earrings',
    emoji: '💎',
    usdPrice: 140.00,
    icon: <Diamond size={16} color="#FFD700" />,
    rarity: 'legendary',
  },
  {
    id: 'private_jet',
    name: 'Private Jet',
    emoji: '✈️',
    usdPrice: 400.00, // VVIP - kept higher but still 60% cheaper
    icon: <Crown size={16} color="#FFD700" />,
    rarity: 'legendary',
  },
];

const RARITY_COLORS = {
  common: '#9E9E9E',
  rare: '#00D9FF',
  epic: '#A78BFA',
  legendary: '#FFD700',
};

const getGiftGradient = (rarity: string): [string, string] => {
  switch (rarity) {
    case 'legendary':
      return ['rgba(255, 215, 0, 0.2)', 'rgba(255, 165, 0, 0.1)'];
    case 'epic':
      return ['rgba(167, 139, 250, 0.2)', 'rgba(139, 92, 246, 0.1)'];
    case 'rare':
      return ['rgba(0, 217, 255, 0.2)', 'rgba(0, 191, 255, 0.1)'];
    default:
      return ['rgba(158, 158, 158, 0.15)', 'rgba(117, 117, 117, 0.1)'];
  }
};

interface GiftModalProps {
  visible: boolean;
  onClose: () => void;
  onSendGift: (gift: Gift) => void;
  /** Display name of the recipient (streamer in livestream, or chat partner) */
  recipientName: string;
}

export default function GiftModal({ visible, onClose, onSendGift, recipientName }: GiftModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [userTokens, setUserTokens] = useState(0);
  const [activeTab, setActiveTab] = useState<'popular' | 'premium'>('popular');
  const [showFaq, setShowFaq] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const slideAnim = React.useRef(new Animated.Value(screenHeight)).current;

  // Load user's real token balance when modal opens
  useEffect(() => {
    if (visible) {
      log('🎁 [GiftModal] Opening modal, GIFT_ITEMS count:', GIFT_ITEMS.length);
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 8,
        useNativeDriver: true,
      }).start();
      
      const loadTokens = async () => {
        try {
          const wallet = await getUserWallet();
          setUserTokens(wallet?.token_balance || 0);
          log('💰 [GIFT] Loaded wallet balance:', wallet?.token_balance || 0);
        } catch (error) {
          error('Error loading wallet:', error);
          setUserTokens(0);
        }
      };
      loadTokens();
    } else {
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
      // Reset state when modal closes
      setSelectedGift(null);
      setQuantity(1);
      setActiveTab('popular');
      setShowFaq(false);
      setOpenFaqId(null);
    }
  }, [visible]);

  // Add tokens for testing
  // Test token function removed - purchases disabled for Apple review
  // Users cannot add test tokens in production

  const handleSendGift = async () => {
    if (!selectedGift) return;
    
    const totalCost = getTokenPrice(selectedGift.usdPrice) * quantity;
    
    if (userTokens < totalCost) {
      Alert.alert('Insufficient Tokens', `You need ${totalCost.toLocaleString()} tokens to send ${quantity} ${selectedGift.name}!`);
      return;
    }
    
    // Send gift with quantity (spread to avoid type error)
    const giftWithQuantity = { ...selectedGift, quantity } as Gift & { quantity: number };
    onSendGift(giftWithQuantity);
    
    // Update UI tokens after successful send
    setUserTokens(prev => prev - totalCost);
    
    // Reset selection
    setSelectedGift(null);
    setQuantity(1);
    
    Alert.alert('Gift Sent!', `You sent ${quantity}x ${selectedGift.emoji} ${selectedGift.name} to ${recipientName}!`);
  };

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setSelectedGift(null);
      setQuantity(1);
      onClose();
    });
  };

  const handleQuantityChange = (change: number) => {
    if (!selectedGift) return;
    
    const newQuantity = Math.max(1, Math.min(99, quantity + change));
    const totalCost = getTokenPrice(selectedGift.usdPrice) * newQuantity;
    
    if (totalCost <= userTokens) {
      setQuantity(newQuantity);
    }
  };

  // Format price - show Nomli tokens instead of USD
  const formatPrice = (usdPrice: number) => {
    // Convert USD to tokens (1 token = $0.01, so usdPrice * 100 = tokens)
    const tokens = getTokenPrice(usdPrice);
    return `${tokens.toLocaleString()} tokens`;
  };

  // Tabs: Popular = all gifts (cheapest first), Premium = expensive only
  const filteredGifts = React.useMemo(() => {
    const sorted = [...GIFT_ITEMS].sort((a, b) => getTokenPrice(a.usdPrice) - getTokenPrice(b.usdPrice));
    if (activeTab === 'premium') {
      const start = Math.max(0, Math.floor(sorted.length * 0.66));
      return sorted.slice(start);
    }
    // Popular = show all gifts so users see every option (including cheap 5/10/20 token gifts)
    return sorted;
  }, [activeTab]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <View style={styles.modalOverlay}>
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
            }
          ]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={95} tint="dark" style={styles.blurContainer}>
              <View style={styles.container}>
                {/* Drag Handle */}
                <View style={styles.dragHandle} />
                
                {/* Header with Balance */}
                <View style={styles.header}>
                  <View style={styles.headerLeft}>
                    <Text style={styles.title}>Send Gift</Text>
                    <View style={styles.balanceCompact}>
                      <Gift size={14} color="#FFD700" strokeWidth={2} />
                      <Text style={styles.balanceTextCompact}>
                        {userTokens.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.headerActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setShowFaq(true);
                        setOpenFaqId(null);
                      }}
                      style={styles.faqButton}
                      activeOpacity={0.8}
                    >
                      <HelpCircle size={18} color="rgba(255,255,255,0.85)" strokeWidth={2.5} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                      <X size={20} color="#FFFFFF" strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Compact tabs */}
                <View style={styles.tabsRow}>
                  <TouchableOpacity
                    style={[styles.tabPill, activeTab === 'popular' && styles.tabPillActive]}
                    onPress={() => setActiveTab('popular')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabText, activeTab === 'popular' && styles.tabTextActive]}>Popular</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabPill, activeTab === 'premium' && styles.tabPillActive]}
                    onPress={() => setActiveTab('premium')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabText, activeTab === 'premium' && styles.tabTextActive]}>Premium</Text>
                  </TouchableOpacity>
                </View>

                {/* Gift Grid */}
                <ScrollView 
                  style={styles.scrollView} 
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={true}
                  bounces={true}
                  nestedScrollEnabled={true}
                >
                  <View style={styles.giftGrid}>
                    {filteredGifts.map((gift) => {
                      const isSelected = selectedGift?.id === gift.id;
                      const rarityColor = RARITY_COLORS[gift.rarity];
                      const canAfford = userTokens >= getTokenPrice(gift.usdPrice);
                      
                      return (
                        <TouchableOpacity
                          key={gift.id}
                          style={[
                            styles.giftCard,
                            isSelected && styles.selectedGift,
                            !canAfford && styles.giftCardDisabled,
                          ]}
                          onPress={() => setSelectedGift(gift)}
                          activeOpacity={0.7}
                          disabled={!canAfford}
                        >
                          {/* Minimal gift tile (no big container/background) */}
                          <View
                            style={[
                              styles.giftBox,
                              isSelected && { borderColor: rarityColor, borderWidth: 2 },
                            ]}
                          >
                            {/* Rarity Badge */}
                            {(gift.rarity === 'legendary' || gift.rarity === 'epic') && (
                              <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
                                <Star 
                                  size={8} 
                                  color="#FFFFFF" 
                                  fill="#FFFFFF"
                                  strokeWidth={2}
                                />
                              </View>
                            )}
                            
                            {/* Emoji */}
                            <Text style={styles.giftEmoji}>
                              {gift.emoji}
                            </Text>
                          </View>
                          
                          {/* Gift Name */}
                          <Text 
                            style={styles.giftName} 
                            numberOfLines={2}
                            ellipsizeMode="tail"
                          >
                            {gift.name}
                          </Text>
                          
                          {/* Price (small, no big pill) */}
                          <View style={styles.priceContainer}>
                            <Text style={[styles.giftPrice, { color: rarityColor }]}>
                              {formatPrice(gift.usdPrice)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Bottom Action Bar */}
                {selectedGift && (
                  <View style={styles.bottomBar}>
                    <View style={styles.quantityContainer}>
                      <TouchableOpacity
                        onPress={() => handleQuantityChange(-1)}
                        style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
                        disabled={quantity <= 1}
                        activeOpacity={0.7}
                      >
                        <Minus size={18} color={quantity <= 1 ? '#666' : '#FFFFFF'} strokeWidth={3} />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{quantity}</Text>
                      <TouchableOpacity
                        onPress={() => handleQuantityChange(1)}
                        style={[
                          styles.quantityButton, 
                          (getTokenPrice(selectedGift.usdPrice) * (quantity + 1)) > userTokens && styles.quantityButtonDisabled
                        ]}
                        disabled={(getTokenPrice(selectedGift.usdPrice) * (quantity + 1)) > userTokens}
                        activeOpacity={0.7}
                      >
                        <Plus size={18} color={(selectedGift.price * (quantity + 1)) > userTokens ? '#666' : '#FFFFFF'} strokeWidth={3} />
                      </TouchableOpacity>
                    </View>
                    
                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        (getTokenPrice(selectedGift.usdPrice) * quantity) > userTokens && styles.sendButtonDisabled
                      ]}
                      onPress={handleSendGift}
                      disabled={(getTokenPrice(selectedGift.usdPrice) * quantity) > userTokens}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={
                          (getTokenPrice(selectedGift.usdPrice) * quantity) > userTokens
                            ? ['#666', '#555']
                            : ['#FF69B4', '#FF1493']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.sendButtonGradient}
                      >
                        <Text style={styles.sendButtonText}>
                          Send {quantity}x {selectedGift.emoji}
                        </Text>
                        <Text style={styles.sendButtonPrice}>
                          {(getTokenPrice(selectedGift.usdPrice) * quantity).toLocaleString()} tokens
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </BlurView>
          ) : (
            <View style={styles.container}>
              {/* Drag Handle */}
              <View style={styles.dragHandle} />
              
              {/* Header with Balance */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Text style={styles.title}>Send Gift</Text>
                  <View style={styles.balanceCompact}>
                    <Gift size={14} color="#FFD700" strokeWidth={2} />
                    <Text style={styles.balanceTextCompact}>
                      {userTokens.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowFaq(true);
                      setOpenFaqId(null);
                    }}
                    style={styles.faqButton}
                    activeOpacity={0.8}
                  >
                    <HelpCircle size={18} color="rgba(255,255,255,0.85)" strokeWidth={2.5} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                    <X size={20} color="#FFFFFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Gift Grid */}
              <ScrollView 
                style={styles.scrollView} 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
                bounces={true}
                nestedScrollEnabled={true}
              >
                <View style={styles.giftGrid}>
                  {filteredGifts.map((gift) => {
                    const isSelected = selectedGift?.id === gift.id;
                    const rarityColor = RARITY_COLORS[gift.rarity];
                    const canAfford = userTokens >= getTokenPrice(gift.usdPrice);
                    
                    return (
                      <TouchableOpacity
                        key={gift.id}
                        style={[
                          styles.giftCard,
                          isSelected && styles.selectedGift,
                          !canAfford && styles.giftCardDisabled,
                        ]}
                        onPress={() => setSelectedGift(gift)}
                        activeOpacity={0.7}
                        disabled={!canAfford}
                      >
                        {/* Minimal gift tile (no big container/background) */}
                        <View
                          style={[
                            styles.giftBox,
                            isSelected && { borderColor: rarityColor, borderWidth: 2 },
                          ]}
                        >
                          {/* Rarity Badge */}
                          {(gift.rarity === 'legendary' || gift.rarity === 'epic') && (
                            <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
                              <Star 
                                size={8} 
                                color="#FFFFFF" 
                                fill="#FFFFFF"
                                strokeWidth={2}
                              />
                            </View>
                          )}
                          
                          {/* Emoji */}
                          <Text style={styles.giftEmoji}>
                            {gift.emoji}
                          </Text>
                        </View>
                        
                        {/* Gift Name */}
                        <Text 
                          style={styles.giftName} 
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {gift.name}
                        </Text>
                        
                        {/* Price - Fixed display */}
                        <View style={styles.priceContainer}>
                          {typeof formatPrice(gift.usdPrice) === 'string' ? (
                            <Text style={[styles.giftPrice, { color: rarityColor }]}>
                              {formatPrice(gift.usdPrice) as string}
                            </Text>
                          ) : (
                            <View style={[styles.giftPrice, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                              {formatPrice(gift.usdPrice)}
                            </View>
                          )}
                        </View>
                        </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Bottom Action Bar */}
              {selectedGift && (
                <View style={styles.bottomBar}>
                  <View style={styles.quantityContainer}>
                    <TouchableOpacity
                      onPress={() => handleQuantityChange(-1)}
                      style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
                      disabled={quantity <= 1}
                      activeOpacity={0.7}
                    >
                      <Minus size={18} color={quantity <= 1 ? '#666' : '#FFFFFF'} strokeWidth={3} />
                    </TouchableOpacity>
                    <Text style={styles.quantityText}>{quantity}</Text>
                    <TouchableOpacity
                      onPress={() => handleQuantityChange(1)}
                      style={[
                        styles.quantityButton, 
                        (selectedGift.price * (quantity + 1)) > userTokens && styles.quantityButtonDisabled
                      ]}
                      disabled={(selectedGift.price * (quantity + 1)) > userTokens}
                      activeOpacity={0.7}
                    >
                      <Plus size={18} color={(selectedGift.price * (quantity + 1)) > userTokens ? '#666' : '#FFFFFF'} strokeWidth={3} />
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      (selectedGift.price * quantity) > userTokens && styles.sendButtonDisabled
                    ]}
                    onPress={handleSendGift}
                    disabled={(selectedGift.price * quantity) > userTokens}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={
                        (selectedGift.price * quantity) > userTokens
                          ? ['#666', '#555']
                          : ['#FF69B4', '#FF1493']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.sendButtonGradient}
                    >
                      <Text style={styles.sendButtonText}>
                        Send {quantity}x {selectedGift.emoji}
                      </Text>
                      <Text style={styles.sendButtonPrice}>
                        {(selectedGift.price * quantity).toLocaleString()}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* FAQ Modal */}
          <Modal
            visible={showFaq}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowFaq(false)}
          >
            <View style={styles.faqOverlay}>
              <TouchableOpacity
                style={styles.faqBackdrop}
                activeOpacity={1}
                onPress={() => setShowFaq(false)}
              />
              <View style={styles.faqCard}>
                <View style={styles.faqHeader}>
                  <Text style={styles.faqTitle}>Gifts & Nomli Tokens</Text>
                  <TouchableOpacity
                    style={styles.faqClose}
                    onPress={() => setShowFaq(false)}
                    activeOpacity={0.8}
                  >
                    <X size={18} color="#FFFFFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                {[
                  {
                    id: 'token',
                    q: 'What is a Nomli Token?',
                    a: 'Nomli Tokens are in-app credits you can use to send gifts during livestreams.',
                  },
                  {
                    id: 'use',
                    q: 'What are tokens used for?',
                    a: 'Use tokens to send gifts or “Credit Me” during livestreams. They show on stream and help support creators.',
                  },
                  {
                    id: 'earn',
                    q: 'How do I get tokens?',
                    a: 'You can buy tokens in the app or earn them through promotions/events (when available).',
                  },
                  {
                    id: 'withdraw',
                    q: 'How can I withdraw?',
                    a: 'Creators can withdraw eligible earnings in Wallet. Availability depends on your region and verification status.',
                  },
                ].map((item) => {
                  const open = openFaqId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.faqItem}
                      onPress={() => setOpenFaqId(open ? null : item.id)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.faqRow}>
                        <Text style={styles.faqQuestion}>{item.q}</Text>
                        <ChevronDown
                          size={16}
                          color="rgba(255,255,255,0.8)"
                          strokeWidth={2.5}
                          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                        />
                      </View>
                      {open && <Text style={styles.faqAnswer}>{item.a}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Modal>
        </Animated.View>
      </View>
    </Modal>
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
    // Smaller bottom sheet so it sits lower (TikTok-like)
    height: Math.min(screenHeight * 0.58, 520),
    maxHeight: screenHeight * 0.65,
    minHeight: 320,
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
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  faqButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tabPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  tabPillActive: {
    backgroundColor: 'rgba(255, 105, 180, 0.16)',
    borderColor: 'rgba(255, 105, 180, 0.35)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  balanceCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  balanceTextCompact: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  testButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  testButtonText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  balanceGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  balanceLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  demoBadgeGift: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.4)',
  },
  demoBadgeTextGift: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FF9800',
    letterSpacing: 0.8,
  },
  balanceText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 132, // Account for bottom bar (~68px) + spacing
    paddingTop: 6,
  },
  giftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  giftCard: {
    width: GIFT_ITEM_WIDTH,
    minWidth: GIFT_ITEM_WIDTH,
    maxWidth: GIFT_ITEM_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 4,
  },
  selectedGift: {
    transform: [{ scale: 1.05 }],
  },
  giftCardDisabled: {
    opacity: 0.5,
  },
  giftBox: {
    width: '100%',
    // Smaller tile so emoji doesn't sit "too high"
    height: 44,
    minHeight: 44,
    minWidth: 44,
    borderRadius: 12,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
    // Truly minimal: no visible background, only show border when selected
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  rarityBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  giftEmoji: {
    fontSize: 18,
    textAlign: 'center',
  },
  giftName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
    lineHeight: 13,
    minHeight: 0,
    width: '100%',
  },
  priceContainer: {
    // Keep price tight to the title (no pill)
    marginTop: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  giftPrice: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  // FAQ modal
  faqOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  faqBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  faqCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(26,26,26,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  faqTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  faqClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqItem: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  faqQuestion: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  faqAnswer: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    lineHeight: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(26, 26, 26, 0.98)' : '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 12,
  },
  quantityButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonDisabled: {
    opacity: 0.3,
  },
  quantityText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  sendButton: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  sendButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sendButtonPrice: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.9,
  },
  emptyState: {
    width: '100%',
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    fontWeight: '500',
  },
});
