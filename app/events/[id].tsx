import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
  Alert,
  Dimensions,
  Animated,
  Linking,
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PanGestureHandler, State as GestureState, GestureHandlerRootView } from 'react-native-gesture-handler';
import { 
  ChevronLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Trash2,
  MessageCircle,
  Info,
  Mail,
  X,
  Edit,
  MousePointerClick,
  AlertTriangle
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, Event, Profile } from '../../utils/supabase';
import { joinEvent, leaveEvent, isParticipatingInEvent, deleteEvent } from '../../utils/eventActions';
import { trackAdClick, getAdClickCount } from '../../utils/adClickService';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, GlobalStyles, Shadow, Spacing } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import Button from '../../components/Button';
import ProfileCard from '../../components/ProfileCard';
import EventParticipantCount from '../../components/EventParticipantCount';
import EventParticipantAvatars from '../../components/EventParticipantAvatars';
import EventParticipantList from '../../components/EventParticipantList';
import ParticipantNotification from '../../components/ParticipantNotification';
import ParticipationFeedback from '../../components/ParticipationFeedback';
import { format } from '../../utils/dateFormatters';
import { getConversations, Conversation, getMessages, deleteConversation } from '../../utils/chat';
import SimpleAvatar from '../../components/SimpleAvatar';
import { useTheme } from '../../contexts/ThemeContext';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import useChatStore from '../../app/store/useChatStore';
import { log, warn, error } from '../../utils/productionLogger';


const { width: screenWidth } = Dimensions.get('window');

// Swipeable Conversation Item Component
const SwipeableConversationItem = ({ conversation, onPress, onDelete, style }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const deleteButtonOpacity = useRef(new Animated.Value(0)).current;
  const [isDeleting, setIsDeleting] = useState(false);
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const SWIPE_THRESHOLD = -80;
  const DELETE_THRESHOLD = -120;
  
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true }
  );
  
  const onHandlerStateChange = (event) => {
    if (event.nativeEvent.state === GestureState.END) {
      const { translationX } = event.nativeEvent;
      
      if (translationX < DELETE_THRESHOLD) {
        // Delete the conversation
        handleDelete();
      } else if (translationX < SWIPE_THRESHOLD) {
        // Show delete button
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: SWIPE_THRESHOLD,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }),
          Animated.timing(deleteButtonOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          })
        ]).start();
      } else {
        // Reset to original position
        resetPosition();
      }
    }
  };
  
  const resetPosition = () => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(deleteButtonOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start();
  };
  
  const handleDelete = () => {
    // Show confirmation dialog before deleting
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete this conversation with ${conversation.conversation_with_name}? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: resetPosition
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setIsDeleting(true);
            
            // Animate out
            Animated.parallel([
              Animated.timing(opacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.timing(translateX, {
                toValue: -screenWidth,
                duration: 300,
                useNativeDriver: true,
              })
            ]).start(() => {
              onDelete(conversation.conversation_with);
            });
          }
        }
      ]
    );
  };
  
  const handleDeletePress = () => {
    // Direct delete with animation since this is a button press
    setIsDeleting(true);
    
    // Animate out
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -screenWidth,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      onDelete(conversation.conversation_with);
    });
  };
  
  return (
    <View style={[styles.swipeableContainer, style]}>
      {/* Delete Button Background */}
      <Animated.View 
        style={[
          styles.deleteBackground,
          {
            opacity: deleteButtonOpacity,
            backgroundColor: themeColors.error.main,
          }
        ]}
      >
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={handleDeletePress}
          activeOpacity={0.7}
        >
          <Trash2 size={20} color={themeColors.error.textOnColor || '#FFFFFF'} />
          <Text style={[styles.deleteButtonText, { color: themeColors.error.textOnColor || '#FFFFFF' }]}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
      
      {/* Main Conversation Item */}
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-5, 5]}
      >
        <Animated.View
          style={[
            styles.conversationItem,
            {
              backgroundColor: conversation.unread_count > 0 
                ? (isDarkMode ? '#1a2332' : '#f0f8ff') // Unique unread background color
                : themeColors.neutral.surface,
              borderLeftWidth: conversation.unread_count > 0 ? 3 : 0,
              borderLeftColor: conversation.unread_count > 0 ? '#007AFF' : 'transparent', // Blue accent for unread
              transform: [{ translateX }],
              opacity,
            }
          ]}
        >
          <TouchableOpacity
            style={styles.conversationContent}
            onPress={onPress}
            disabled={isDeleting}
            activeOpacity={0.7}
          >
            <SimpleAvatar
              avatarUrl={conversation.conversation_with_avatar}
              size={32}
              style={styles.conversationAvatar}
            />
            <View style={styles.conversationInfo}>
              <Text style={[
                styles.conversationName, 
                { 
                  color: conversation.unread_count > 0 
                    ? (isDarkMode ? '#ffffff' : '#1a1a1a') // Bolder text for unread
                    : themeColors.neutral.text,
                  fontWeight: conversation.unread_count > 0 ? '600' : '500' // Semi-bold for unread
                }
              ]}>
                {conversation.conversation_with_name || 'Unknown User'}
              </Text>
              {conversation.last_message_content && (
                <Text style={[
                  styles.conversationMessage, 
                  { 
                    color: conversation.unread_count > 0 
                      ? (isDarkMode ? '#e0e0e0' : '#2c2c2c') // More prominent text for unread
                      : themeColors.neutral.textSecondary,
                    fontWeight: conversation.unread_count > 0 ? '500' : '400' // Medium weight for unread
                  }
                ]} numberOfLines={2}>
                  {conversation.last_message_content}
                </Text>
              )}
              <Text style={[
                styles.conversationTime, 
                { 
                  color: conversation.unread_count > 0 
                    ? (isDarkMode ? '#007AFF' : '#007AFF') // Blue timestamp for unread
                    : themeColors.neutral.subtext,
                  fontWeight: conversation.unread_count > 0 ? '600' : '400' // Semi-bold for unread
                }
              ]}>
                {format(new Date(conversation.last_message_at), 'MMM d, h:mm a')}
              </Text>
            </View>
            <View style={styles.conversationActions}>
              {conversation.unread_count > 0 && (
                <View style={[
                  styles.unreadBadge, 
                  { 
                    backgroundColor: '#FF3B30', // Distinctive red color for unread badge
                    shadowColor: '#FF3B30',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 4,
                  }
                ]}>
                  <Text style={[
                    styles.unreadCount, 
                    { 
                      color: '#ffffff',
                      fontWeight: '700', // Extra bold for unread count
                      fontSize: 11,
                    }
                  ]}>
                    {conversation.unread_count}
                  </Text>
                </View>
              )}
              <ChevronLeft 
                size={20} 
                color={themeColors.neutral.subtext} 
                style={{ transform: [{ rotate: '180deg' }] }}
              />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
};

// Shimmer Loading Component
const ShimmerPlaceholder = ({ width, height, borderRadius = 8, style = {} }) => {
  const [measuredWidth, setMeasuredWidth] = useState(typeof width === 'number' ? width : 100);
  const translateX = useRef(new Animated.Value(-100)).current;
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  useEffect(() => {
    // Reset animation with the correct width
    translateX.setValue(-measuredWidth);
    
    // Start animation
    Animated.loop(
      Animated.timing(translateX, {
        toValue: measuredWidth,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  }, [measuredWidth]);
  
  const baseColor = isDarkMode ? 'rgba(40, 40, 40, 1)' : 'rgba(230, 230, 230, 1)';
  const highlightColor = isDarkMode ? 'rgba(60, 60, 60, 1)' : 'rgba(255, 255, 255, 1)';

  // Handle view measurement to get actual width
  const onLayout = (event) => {
    const { width: layoutWidth } = event.nativeEvent.layout;
    if (layoutWidth > 0 && layoutWidth !== measuredWidth) {
      setMeasuredWidth(layoutWidth);
    }
  };

  return (
    <View 
      style={[
        styles.shimmerContainer,
        { 
          width: width, 
          height, 
          borderRadius,
          backgroundColor: baseColor,
          ...style 
        }
      ]}
      onLayout={onLayout}
    >
      <Animated.View 
        style={[
          styles.shimmerOverlay,
          {
            backgroundColor: highlightColor,
            opacity: 0.5,
            transform: [{ translateX }],
          }
        ]}
      />
    </View>
  );
};

// Event Detail Loading Skeleton
const EventDetailSkeleton = () => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  const pulseAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );
    
    animation.start();
    
    return () => {
      animation.stop();
    };
  }, []);
  
  const backgroundColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [themeColors.neutral.background, themeColors.neutral.surface],
  });
  
  return (
    <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
      <StatusBar 
        backgroundColor="transparent"
        barStyle="light-content"
        translucent
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero Image Placeholder */}
        <Animated.View style={[styles.heroPlaceholder, { backgroundColor }]} />
        
        {/* Content Section */}
        <View style={[styles.contentContainer, { backgroundColor: themeColors.neutral.background }]}>
          {/* Title Placeholder */}
          <ShimmerPlaceholder 
            width={screenWidth - 50} 
            height={28} 
            style={{ marginBottom: 8 }}
          />
          <ShimmerPlaceholder 
            width={screenWidth - 120} 
            height={28} 
            style={{ marginBottom: 30 }}
          />
          
          {/* Meta Information Placeholders */}
          <View style={styles.metaContainer}>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <ShimmerPlaceholder 
                  width={40} 
                  height={40} 
                  borderRadius={20}
                  style={{ marginRight: 12 }}
                />
                <ShimmerPlaceholder width={100} height={20} />
              </View>
              
              <View style={styles.metaItem}>
                <ShimmerPlaceholder 
                  width={40} 
                  height={40} 
                  borderRadius={20}
                  style={{ marginRight: 12 }}
                />
                <ShimmerPlaceholder width={90} height={20} />
              </View>
            </View>
            
            <View style={styles.metaRow}>
              <View style={[styles.metaItem, styles.metaItemFull]}>
                <ShimmerPlaceholder 
                  width={40} 
                  height={40} 
                  borderRadius={20}
                  style={{ marginRight: 12 }}
                />
                <ShimmerPlaceholder width={180} height={20} />
              </View>
            </View>
          </View>
          
          {/* Host Section Placeholder */}
          <View style={styles.hostSection}>
            <ShimmerPlaceholder 
              width={120} 
              height={24} 
              style={{ marginBottom: 12 }}
            />
            <ShimmerPlaceholder 
              width={screenWidth - 50} 
              height={80} 
              borderRadius={8}
            />
          </View>
          
          {/* Description Section Placeholder */}
          <View style={styles.descriptionSection}>
            <ShimmerPlaceholder 
              width={150} 
              height={24} 
              style={{ marginBottom: 12 }}
            />
            <ShimmerPlaceholder 
              width={screenWidth - 50} 
              height={16} 
              style={{ marginBottom: 8 }}
            />
            <ShimmerPlaceholder 
              width={screenWidth - 80} 
              height={16} 
              style={{ marginBottom: 8 }}
            />
            <ShimmerPlaceholder 
              width={screenWidth - 100} 
              height={16} 
              style={{ marginBottom: 8 }}
            />
            <ShimmerPlaceholder 
              width={screenWidth - 140} 
              height={16} 
            />
          </View>
          
          {/* Participants Section Placeholder */}
          <View style={styles.participantsSection}>
            <ShimmerPlaceholder 
              width={150} 
              height={24} 
              style={{ marginBottom: 12 }}
            />
            <View style={styles.participantsRow}>
              {[...Array(5)].map((_, index) => (
                <ShimmerPlaceholder 
                  key={index}
                  width={36} 
                  height={36} 
                  borderRadius={18}
                  style={{ marginRight: 8 }}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* Bottom Action Bar Placeholder */}
      <View style={[styles.bottomActionBar, { backgroundColor: themeColors.neutral.surface }]}>
        <ShimmerPlaceholder 
          width={screenWidth - 50} 
          height={48} 
          borderRadius={24}
        />
      </View>
    </View>
  );
};

// Messages Tab Loading Skeleton
const MessagesTabSkeleton = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);
  
  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <ShimmerPlaceholder 
        width="80%" 
        height={24} 
        style={{ marginBottom: Spacing.lg }}
      />
      
      {[...Array(3)].map((_, index) => (
        <View key={`skeleton-${index}`} style={[styles.conversationItem, { 
          backgroundColor: themeColors.neutral.surface,
          marginBottom: Spacing.md 
        }]}>
          <View style={styles.conversationContent}>
            <ShimmerPlaceholder 
              width={40} 
              height={40} 
              borderRadius={20}
              style={{ marginRight: Spacing.md }}
            />
            <View style={styles.conversationInfo}>
              <ShimmerPlaceholder 
                width="60%" 
                height={18}
                style={{ marginBottom: Spacing.xs }}
              />
              <ShimmerPlaceholder 
                width="80%" 
                height={16}
                style={{ marginBottom: Spacing.xs }}
              />
              <ShimmerPlaceholder 
                width="30%" 
                height={14}
              />
            </View>
            <ShimmerPlaceholder 
              width={20} 
              height={20} 
              borderRadius={10}
            />
          </View>
        </View>
      ))}
    </Animated.View>
  );
};

// Animated Empty Messages State Component
const AnimatedEmptyMessagesState = () => {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const decorationsAnim = useRef(new Animated.Value(0)).current;
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  
  useEffect(() => {
    // Staggered animation sequence
    Animated.sequence([
      // Fade in glow first
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      // Then bring in the icon and text
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(bounceAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      // Finally animate the decorations
      Animated.timing(decorationsAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Setup continuous glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.7,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);
  
  // Generate floating decoration elements
  const decorations = Array(8).fill(null).map((_, index) => {
    const size = 4 + Math.random() * 6;
    const angle = (index / 8) * Math.PI * 2;
    const distance = 80 + Math.random() * 60;
    
    // Calculate starting positions in a circle
    const left = Math.cos(angle) * distance;
    const top = Math.sin(angle) * distance;
    
    // Random animation delays
    const delay = index * 100;
    
    return { size, left, top, delay, angle: angle * (180 / Math.PI) };
  });
  
  return (
    <View style={styles.emptyMessagesContainer}>
      {/* Glowing background effect */}
      <Animated.View 
        style={[
          styles.emptyMessagesGlow,
          { 
            opacity: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.5],
            }),
            backgroundColor: themeColors.primary.light,
            transform: [
              { scale: glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1.2],
              })},
            ],
          }
        ]}
      />
      
      {/* Main icon and text content */}
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: opacityAnim,
          transform: [
            { translateY: bounceAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            })},
            { scale: bounceAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.9, 1],
            })},
          ],
        }}
      >
        <View style={[styles.emptyMessagesIconContainer, { backgroundColor: themeColors.primary.light }]}>
          <Mail size={36} color={themeColors.primary.main} />
        </View>
        
        <Text style={[styles.emptyMessagesTitle, { color: themeColors.neutral.text }]}>
          No Messages Yet
        </Text>
        
        <Text style={[styles.emptyMessagesText, { color: themeColors.neutral.textSecondary }]}>
          Messages from participants who have joined your event will appear here.
        </Text>
      </Animated.View>
      
      {/* Floating decorations */}
      <Animated.View 
        style={[
          styles.emptyMessagesDecorations,
          { opacity: decorationsAnim }
        ]}
      >
        {decorations.map((decoration, index) => {
          return (
            <Animated.View
              key={`decoration-${index}`}
              style={[
                styles.emptyMessagesDecoration,
                {
                  width: decoration.size,
                  height: decoration.size,
                  left: decoration.left,
                  top: decoration.top,
                  backgroundColor: themeColors.primary.main,
                  transform: [
                    { translateX: decorationsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.random() * 10 - 5],
                    })},
                    { translateY: decorationsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.random() * 10 - 5],
                    })},
                    { 
                      rotate: bounceAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', `${5 + index * 3}deg`],
                      })
                    },
                    {
                      scale: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1.2],
                      })
                    },
                  ],
                }
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
};

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoaded: authLoaded } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  const [event, setEvent] = useState<Event | null>(null);
  const [host, setHost] = useState<Profile | null>(null);
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [participating, setParticipating] = useState(false);
  const [joiningEvent, setJoiningEvent] = useState(false);
  const [leavingEvent, setLeavingEvent] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [clickCount, setClickCount] = useState<number | null>(null);
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  
  // Feedback modal state
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'join' | 'leave'>('join');
  
  
  // Check if current user is the host/owner - but only if auth is loaded
  const isEventOwner = authLoaded && event && user && event.host_id === user.id;
  
  // Handle messaging the event host
  const handleMessageHost = () => {
    if (event?.host_id && event.host_id !== user?.id) {
      router.push(`/chat/${event.host_id}`);
    }
  };
  
  // Handle deleting a conversation (no longer used - messages tab removed)
  const handleDeleteConversation = async (conversationWithId) => {
    // Function kept for compatibility but no longer used
    return;
  };
        
  // Load conversations for event host (no longer needed - messages tab removed)
  const loadConversations = async () => {
    // Function kept for compatibility but no longer used
    return;
  };
  
  // Debug logging
  log('Event Debug Info:', {
    isEventOwner,
    eventHostId: event?.host_id,
    userId: user?.id,
    authLoaded,
    showMessageButton: !isEventOwner && event?.host_id && user,
    conversationsCount: 0
  });
  
  // Refs for subscriptions
  const eventSubscription = useRef<any>(null);
  const participantsSubscription = useRef<any>(null);
  
  useEffect(() => {
    if (!id) return;
    
    fetchEventDetails();
    
    // Set up real-time subscriptions
    setupEventSubscription();
    setupParticipantsSubscription();
    
    // Clean up subscriptions when component unmounts
    return () => {
      if (eventSubscription.current) {
        supabase.removeChannel(eventSubscription.current);
      }
      if (participantsSubscription.current) {
        supabase.removeChannel(participantsSubscription.current);
      }
    };
  }, [id, authLoaded]);
  
  
  // Conversations loading removed since messages tab was removed

  const setupEventSubscription = () => {
    if (eventSubscription.current) {
      supabase.removeChannel(eventSubscription.current);
    }
    
    const subscription = supabase
      .channel(`event-${id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'events',
          filter: `id=eq.${id}`
        }, 
        (payload) => {
          log('Event change received:', payload);
          
          if (payload.eventType === 'DELETE' || 
              (payload.eventType === 'UPDATE' && payload.new.deleted_at)) {
            // Event was deleted, navigate back
            Alert.alert(
              'Event Deleted',
              'This event has been deleted by the host.',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          } else if (payload.eventType === 'UPDATE') {
            // Event was updated, refresh details
            fetchEventDetails();
          }
        }
      )
      .subscribe();
    
    eventSubscription.current = subscription;
  };

  const setupParticipantsSubscription = () => {
    if (participantsSubscription.current) {
      supabase.removeChannel(participantsSubscription.current);
    }
    
    const subscription = supabase
      .channel(`event-attendees-${id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'event_attendees',
          filter: `event_id=eq.${id}`
        }, 
        (payload) => {
          log('Participants change received:', payload);
          // Refresh participants when someone joins or leaves
          fetchParticipants();
          
          // Update participation status if it's the current user
          if (user && payload.new?.user_id === user.id) {
            setParticipating(payload.eventType === 'INSERT');
          } else if (user && payload.old?.user_id === user.id) {
              setParticipating(false);
          }
        }
      )
      .subscribe();
    
    participantsSubscription.current = subscription;
  };
  
  const fetchEventDetails = async () => {
    try {
        setLoading(true);
      log(`[EventDetail] Fetching event details for ID: ${id}`);
      
      // Fetch event details with host information
      // Don't filter by deleted_at - allow viewing deleted events (for owner to see what happened)
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select(`
          *,
          host:profiles(id, username, full_name, avatar_url, is_verified, email)
        `)
        .eq('id', id)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
      
      if (eventError) {
        error('[EventDetail] Error fetching event:', eventError);
        setEvent(null);
        return;
      }
      
      if (!eventData) {
        // Event not found
        log('[EventDetail] Event not found:', id);
        setEvent(null);
        return;
      }
      
      log('[EventDetail] Event data received:', eventData);
      setEvent(eventData);
      setHost(eventData.host);
      
      // Show deleted modal if event is deleted and user is the owner
      if (eventData.deleted_at && user && eventData.host_id === user.id) {
        setShowDeletedModal(true);
      }
      
      // Track click if this is an ad (and user is not the owner)
      if (eventData.post_type === 'ad' && user && eventData.host_id !== user.id) {
        trackAdClick(id as string, user.id).catch(err => {
          error('[EventDetail] Error tracking ad click:', err);
        });
      }
      
      // Fetch click count if this is an ad and user is the owner
      if (eventData.post_type === 'ad' && user && eventData.host_id === user.id) {
        const count = await getAdClickCount(id as string);
        setClickCount(count);
      }
      
      // Fetch participants
      await fetchParticipants();
      
      // Check if current user is participating
        if (user) {
        const isParticipating = await isParticipatingInEvent(id as string, user.id);
              setParticipating(isParticipating);
      }
      
    } catch (error) {
      error('[EventDetail] Error in fetchEventDetails:', error);
      Alert.alert('Error', 'Failed to load event details. Please try again.');
    } finally {
        setLoading(false);
      }
  };
  
  const fetchParticipants = async () => {
    try {
      log(`[EventDetail] Fetching participants for event: ${id}`);
      
      const { data, error } = await supabase
        .from('event_attendees')
        .select(`
          user_id,
          profiles(id, username, full_name, avatar_url)
        `)
        .eq('event_id', id);
      
      if (error) {
        error('[EventDetail] Error fetching participants:', error);
        return;
      }
      
      // Extract profile data from the nested structure
      const participantProfiles = data
        ?.map(item => item.profiles)
        .filter(profile => profile !== null) || [];
      
      log(`[EventDetail] Found ${participantProfiles?.length || 0} participants`);
      setParticipants(participantProfiles);
      
    } catch (error) {
      error('[EventDetail] Exception in fetchParticipants:', error);
    }
  };
  
  const handleJoinEvent = async () => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please log in to join events.');
      return;
    }
    
    try {
      setJoiningEvent(true);
      log(`[EventDetail] Attempting to join event: ${id} for user: ${user.id}`);
      
      const result = await joinEvent(id as string, user.id);
      
      if (result.success) {
        log('[EventDetail] Successfully joined event');
        // Immediately update the UI without waiting for subscription
      setParticipating(true);
        
        // Add the current user to the participants list
        if (user) {
          const userProfile: Profile = {
              id: user.id,
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || 'User',
            avatar_url: user.user_metadata?.avatar_url || null,
            bio: null,
            location: null,
            website: null,
            created_at: user.created_at,
            updated_at: new Date().toISOString()
          };
          
          setParticipants(current => {
            // Check if user is already in the list to avoid duplicates
            const userExists = current.some(p => p.id === user.id);
            if (userExists) return current;
            return [...current, userProfile];
        });
        }
        
        // Show feedback
        setFeedbackType('join');
        setFeedbackVisible(true);
      } else {
        error('[EventDetail] Failed to join event:', result.message);
        Alert.alert('Error', result.message || 'Failed to join the event. Please try again.');
      }
    } catch (error) {
      error('[EventDetail] Error joining event:', error);
      Alert.alert('Error', 'Failed to join the event. Please try again.');
    } finally {
      setJoiningEvent(false);
    }
  };
  
  const handleLeaveEvent = async () => {
    if (!user) return;
    
    try {
      setLeavingEvent(true);
      log(`[EventDetail] Attempting to leave event: ${id} for user: ${user.id}`);
      
      const result = await leaveEvent(id as string, user.id);
      
      if (result.success) {
        log('[EventDetail] Successfully left event');
        // Immediately update the UI without waiting for subscription
      setParticipating(false);
        
        // Remove the current user from the participants list
        setParticipants(current => current.filter(p => p.id !== user.id));
        
        // Show feedback
        setFeedbackType('leave');
        setFeedbackVisible(true);
      } else {
        error('[EventDetail] Failed to leave event:', result.message);
        Alert.alert('Error', result.message || 'Failed to leave the event. Please try again.');
      }
    } catch (error) {
      error('[EventDetail] Error leaving event:', error);
      Alert.alert('Error', 'Failed to leave the event. Please try again.');
    } finally {
      setLeavingEvent(false);
    }
  };
  
  const formatEventDate = (date: string | null) => {
    if (!date) return '';
    return format(new Date(date), 'EEEE, MMMM d, yyyy');
  };
  
  const formatEventTime = (time: string | null) => {
    if (!time) return '';
    // Basic parsing of time string like "18:00" to show as "6:00 PM"
    try {
      const [hours, minutes] = time.split(':').map(part => parseInt(part, 10));
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch (err) {
      return time;
    }
  };
  
  const openMap = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    let url = '';
    
    if (Platform.OS === 'ios') {
      url = `maps://maps.apple.com/?q=${encodedAddress}`;
    } else {
      url = `https://maps.google.com/?q=${encodedAddress}`;
    }
    
    Linking.canOpenURL(url)
      .then(supported => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          // Fallback to Google Maps web URL if app-specific URLs aren't supported
          return Linking.openURL(`https://maps.google.com/?q=${encodedAddress}`);
        }
      })
      .catch(err => {
        error('An error occurred while opening the map:', err);
        Alert.alert('Error', 'Could not open map application');
      });
  };
  
  const handleEditEvent = () => {
    router.push(`/events/edit/${id}`);
  };
  
  const handleDeleteEvent = async () => {
    if (!user || !event) return;
    
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone and all participants will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingEvent(true);
              const result = await deleteEvent(event.id, user.id);
              if (result.success) {
                Alert.alert(
                  'Event Deleted',
                  'Your event has been successfully deleted.',
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              } else {
                Alert.alert('Error', result.message || 'Failed to delete event');
              }
            } catch (error) {
              error('Error deleting event:', error);
              Alert.alert('Error', 'Failed to delete event');
            } finally {
              setDeletingEvent(false);
            }
          }
        }
      ]
    );
  };


  
  if (loading) {
    return <EventDetailSkeleton />;
  }
  
  if (!event) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
        <SafeAreaView style={styles.errorContainer}>
          <View style={styles.notFoundContainer}>
            <Text style={[styles.notFoundText, { color: themeColors.neutral.textSecondary }]}>
              The event you're looking for doesn't exist or has been removed.
            </Text>
            <Button
              title="Go Back"
              onPress={() => router.back()}
              style={styles.backBtn}
            />
          </View>
        </SafeAreaView>
      </View>
    );
    }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.neutral.background }]}>
          <ExpoStatusBar style={isDarkMode ? "light" : "dark"} />
        
        {loading ? (
          <EventDetailSkeleton />
        ) : (
          event ? (
            <>
              <ScrollView 
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContentContainer}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {/* Hero Image Section */}
                <View style={styles.heroContainer}>
                  <Image 
                    source={{ uri: event.image_url || 'https://images.pexels.com/photos/2774556/pexels-photo-2774556.jpeg' }}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                  
                  {/* Gradient Overlay */}
                  <View style={styles.gradientOverlay} />
                  
                  {/* Floating Header */}
                  <View style={styles.floatingHeader}>
                    <TouchableOpacity 
                      style={styles.floatingBackButton}
                      // Instead of a generic back, always return to the Events screen/tab
                      onPress={() => router.replace('/(tabs)/events')}
                    >
                      <ChevronLeft size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    
                    {/* Delete Button - For event owner only */}
                    {isEventOwner && (
                      <TouchableOpacity 
                        style={styles.floatingDeleteButton}
                        onPress={handleDeleteEvent}
                        disabled={deletingEvent}
                      >
                        <Trash2 size={20} color={themeColors.error.main} />
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {/* Event Category Badge */}
                  <View style={styles.categoryBadgeContainer}>
                    <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary.main }]}>
                      <Text style={[styles.categoryText, { color: '#FFFFFF' }]}>
                        {event.category}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Content Section */}
                <View style={[styles.contentContainer, { backgroundColor: themeColors.neutral.background }]}>
                  {/* Event Title */}
                  <Text style={[styles.eventTitle, { color: themeColors.neutral.text }]}>{event.title}</Text>
                  
                  {/* Edit Event Button for Event Owner */}
                  {isEventOwner && (
                    <View style={[styles.editButtonContainer, { 
                      backgroundColor: themeColors.neutral.surface,
                      borderColor: themeColors.neutral.border 
                    }]}>
                      <TouchableOpacity
                        style={[styles.editEventTab, { backgroundColor: themeColors.primary.main }]}
                        onPress={handleEditEvent}
                      >
                        <Edit size={18} color={themeColors.neutral.surface} />
                        <Text style={[
                          styles.editEventTabText,
                          { color: themeColors.neutral.surface }
                        ]}>
                          Edit Event
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  {/* Event Details Content */}
                    <>
                      {/* Event Meta Information - Only show for events, not ads */}
                      {event.post_type !== 'ad' && (
                        <View style={styles.metaContainer}>
                          <View style={styles.metaRow}>
                            {event.date && (
                              <View style={styles.metaItem}>
                                <View style={[styles.metaIconContainer, { backgroundColor: themeColors.primary.main }]}>
                                  <Calendar size={14} color="#FFFFFF" />
                                </View>
                                <Text style={[styles.metaText, { color: themeColors.neutral.text }]}>
                                  {formatEventDate(event.date)}
                                </Text>
                              </View>
                            )}
                            
                            {event.time && (
                              <View style={styles.metaItem}>
                                <View style={[styles.metaIconContainer, { backgroundColor: themeColors.primary.main }]}>
                                  <Clock size={14} color="#FFFFFF" />
                                </View>
                                <Text style={[styles.metaText, { color: themeColors.neutral.text }]}>
                                  {formatEventTime(event.time)}
                                </Text>
                              </View>
                            )}
                          </View>
                          
                          {event.location && (
                            <View style={styles.metaRow}>
                              <View style={[styles.metaItem, styles.metaItemFull]}>
                                <View style={[styles.metaIconContainer, { backgroundColor: themeColors.primary.main }]}>
                                  <MapPin size={14} color="#FFFFFF" />
                                </View>
                                <TouchableOpacity 
                                  style={styles.addressTouchable}
                                  onPress={() => openMap(event.location)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.metaText, styles.addressText, { color: themeColors.primary.main }]} numberOfLines={2}>
                                    {event.location}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                      
                      {/* Ad Analytics Section - Only show for ad owners */}
                      {isEventOwner && event.post_type === 'ad' && clickCount !== null && (
                        <View style={[styles.analyticsSection, { backgroundColor: themeColors.neutral.surface }]}>
                          <Text style={[styles.sectionTitle, { color: themeColors.neutral.text }]}>Ad Analytics</Text>
                          <View style={[styles.analyticsCard, { backgroundColor: themeColors.background }]}>
                            <View style={styles.analyticsItem}>
                              <View style={[styles.analyticsIconContainer, { backgroundColor: themeColors.primary.light }]}>
                                <MousePointerClick size={20} color="#FFFFFF" />
                              </View>
                              <View style={styles.analyticsTextContainer}>
                                <Text style={[styles.analyticsValue, { color: themeColors.neutral.text }]}>
                                  {clickCount.toLocaleString()}
                                </Text>
                                <Text style={[styles.analyticsLabel, { color: themeColors.neutral.textSecondary }]}>
                                  Total Clicks
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      )}
                      
                      {/* Host Section */}
                      {host && (
                        <View style={styles.hostSection}>
                          <Text style={[styles.sectionTitle, { color: themeColors.neutral.text }]}>
                            {event.post_type === 'ad' ? 'Posted by' : 'Hosted by'}
                          </Text>
                          <ProfileCard 
                            profile={host}
                            onPress={() => router.push(`/profile/${host.id}`)}
                            onMessagePress={(profileId) => router.push(`/chat/${profileId}`)}
                            showMessageButton={false}
                            style={[styles.hostCard, { backgroundColor: themeColors.neutral.surface }]}
                          />
                        </View>
                      )}
                      
                      {/* Quick Message Section - Only show if user is not the host */}
                      {!isEventOwner && event?.host_id && user && (
                        <View style={styles.messageSection}>
                          <Text style={[styles.sectionTitle, { color: themeColors.neutral.text }]}>Have questions?</Text>
                          <TouchableOpacity 
                            style={[styles.quickMessageButton, { 
                              backgroundColor: themeColors.neutral.surface, 
                              borderColor: themeColors.primary.light 
                            }]}
                            onPress={handleMessageHost}
                          >
                            <View style={[styles.messageIconContainer, { backgroundColor: themeColors.primary.light }]}>
                              <MessageCircle size={20} color="#FFFFFF" />
                            </View>
                            <View style={styles.messageTextContainer}>
                              <Text style={[styles.messageButtonTitle, { color: themeColors.neutral.text }]}>
                                {event.post_type === 'ad' ? 'Message the Advertiser' : 'Message the Host'}
                              </Text>
                              <Text style={[styles.messageButtonSubtitle, { color: themeColors.neutral.textSecondary }]}>
                                {event.post_type === 'ad' 
                                  ? 'Ask questions about this ad or get more details'
                                  : 'Ask questions about the event or get more details'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      )}
                      
                      {/* Description Section */}
                      <View style={styles.descriptionSection}>
                        <Text style={[styles.sectionTitle, { color: themeColors.neutral.text }]}>
                          {event.post_type === 'ad' ? 'About this ad' : 'About this event'}
                        </Text>
                        <Text style={[styles.description, { color: themeColors.neutral.text }]}>
                          {event.description}
                        </Text>
                      </View>
                      
                      {/* Participants Section - Only show for events, not ads */}
                      {event.post_type !== 'ad' && (
                        <View style={styles.participantsSection}>
                          <View style={styles.participantsHeader}>
                            <Text style={[styles.sectionTitle, { color: themeColors.neutral.text }]}>Participants</Text>
                            <EventParticipantCount 
                              eventId={id as string} 
                              maxAttendees={event.max_attendees} 
                              initialCount={(participants?.length || 0)}
                            />
                          </View>
                          
                          <EventParticipantAvatars
                            eventId={id as string}
                            initialParticipants={participants}
                          maxDisplay={8}
                          size={36}
                          style={styles.participantAvatars}
                          />
                          
                          <EventParticipantList
                            eventId={id as string}
                            initialParticipants={participants}
                            insideScrollView={true}
                            event={event}
                            onParticipantCountChange={(count) => {
                              // Only update state if really needed and there's a meaningful difference
                              if (count !== (participants?.length || 0) && (participants?.length || 0) > 0) {
                                // If the list is completely different, update our state
                                // But avoid resetting to empty array which could cause re-renders
                                setParticipants(prev => {
                                  // If lengths are different but prev has data, keep prev data to avoid flicker
                                  if ((prev?.length || 0) > 0 && count !== (prev?.length || 0)) {
                                    return prev; // The real data will come from subscription updates
                                  }
                                  return prev;
                                });
                              }
                            }}
                          />
                        </View>
                      )}
                    </>
                            </View>
                
                {/* Action Bar - Inside ScrollView (for non-owners, only for events, not ads) */}
                {!isEventOwner && event?.post_type !== 'ad' && (
                  <View style={[styles.bottomActionBar, { 
                    backgroundColor: themeColors.neutral.surface, 
                    borderColor: themeColors.neutral.border,
                    marginTop: Spacing.xl,
                    marginBottom: Math.max(insets.bottom, Spacing.xl),
                    marginHorizontal: Spacing.lg,
                    borderRadius: BorderRadius.lg,
                  }]}>
                    {participating ? (
                      <Button
                        title={leavingEvent ? "Leaving..." : "Leave Event"}
                        onPress={handleLeaveEvent}
                        variant="outline"
                        disabled={leavingEvent}
                        loading={leavingEvent}
                        style={styles.leaveButton}
                      />
                    ) : (
                      <Button
                        title={joiningEvent ? "Joining..." : "Join Event"}
                        onPress={handleJoinEvent}
                        disabled={joiningEvent || (event?.max_attendees && (participants?.length || 0) >= event.max_attendees)}
                        loading={joiningEvent}
                        style={styles.joinButton}
                      />
                  )}
                </View>
                )}
              </ScrollView>
            </>
          ) : (
            <View style={styles.errorContainer}>
              <View style={styles.notFoundContainer}>
                <Text style={styles.notFoundText}>
                  The event you're looking for doesn't exist or has been removed.
                </Text>
                <Button
                  title="Go Back"
                  onPress={() => router.back()}
                  style={styles.backBtn}
                />
              </View>
            </View>
          )
        )}
      </SafeAreaView>
      
      {/* Deleted Event Modal */}
      <Modal
        visible={showDeletedModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeletedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.deletedModalContent, { backgroundColor: themeColors.neutral.card }]}>
            {/* Close Button */}
            <TouchableOpacity
              style={[styles.deletedModalCloseButton, { backgroundColor: themeColors.neutral.backgroundAlt }]}
              onPress={() => setShowDeletedModal(false)}
              activeOpacity={0.7}
            >
              <X size={20} color={themeColors.neutral.text} strokeWidth={2.5} />
            </TouchableOpacity>
            
            <View style={[styles.deletedModalIconContainer, { backgroundColor: themeColors.error.light }]}>
              <AlertTriangle size={32} color={themeColors.error.main} strokeWidth={2} />
            </View>
            
            <Text style={[styles.deletedModalTitle, { color: themeColors.neutral.text }]}>
              Event Removed from Public Listings
            </Text>
            
            <Text style={[styles.deletedModalMessage, { color: themeColors.neutral.subtext }]}>
              Your {event?.post_type || 'event'} "{event?.title || 'Untitled'}" has been removed from public listings for not meeting community guidelines.
            </Text>
            
            <Text style={[styles.deletedModalNote, { color: themeColors.neutral.subtext }]}>
              You can still view it here, but it will not appear in public event listings or search results.
            </Text>
            
            <TouchableOpacity
              style={[styles.deletedModalButton, { backgroundColor: themeColors.primary.main }]}
              onPress={() => setShowDeletedModal(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.deletedModalButtonText, { color: '#FFFFFF' }]}>
                Understood
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
  },
  
  // Hero Section
  heroContainer: {
    position: 'relative',
    height: screenWidth * 0.75, // More proportional height
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.2)', // Solid fallback for React Native and web
  },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + Spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
  },
  floatingBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(5px)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.md,
  },
  floatingDeleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(5px)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.md,
  },
  
  // Event Category Badge
  categoryBadgeContainer: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.lg,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    ...Shadow.lg,
  },
  categoryText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#FFFFFF', // Force white color
  },
  
  // Content Section
  contentContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    marginTop: -30,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120, // Space for bottom bar
    minHeight: screenWidth, // Ensure enough content height
    ...Shadow.xl,
  },
  eventTitle: {
    fontSize: FontSizes.xl, // Reduced from heading
    fontFamily: FontFamily.bold,
    lineHeight: 28, // Reduced from 32
    marginBottom: Spacing.md, // Reduced from lg
  },
  
  // Meta Information
  metaContainer: {
    marginBottom: Spacing.xl,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  metaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItemFull: {
    flex: 1,
  },
  metaIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  metaText: {
    fontSize: FontSizes.md, // Reduced from lg
    fontFamily: FontFamily.medium,
    flex: 1,
  },
  addressTouchable: {
    flex: 1,
  },
  addressText: {
    textDecorationLine: 'underline',
  },
  
  // Sections
  sectionTitle: {
    fontSize: FontSizes.lg, // Reduced from title
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.sm, // Reduced from md
  },
  analyticsSection: {
    marginBottom: Spacing.xl,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    ...Shadow.sm,
  },
  analyticsCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  analyticsItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  analyticsIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  analyticsTextContainer: {
    flex: 1,
  },
  analyticsValue: {
    fontSize: FontSizes.xl,
    fontFamily: FontFamily.bold,
    marginBottom: 2,
  },
  analyticsLabel: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  hostSection: {
    marginBottom: Spacing.xl,
  },
  hostCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  
  // Message Section
  messageSection: {
    marginBottom: Spacing.xl,
  },
  quickMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    ...Shadow.sm,
  },
  messageIconContainer: {
    width: 36, // Reduced from 44
    height: 36, // Reduced from 44
    borderRadius: 18, // Reduced from 22
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm, // Reduced from md
  },
  messageTextContainer: {
    flex: 1,
  },
  messageButtonTitle: {
    fontSize: FontSizes.md, // Reduced from lg
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xs,
  },
  messageButtonSubtitle: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
  
  // Description Section
  descriptionSection: {
    marginBottom: Spacing.xl,
  },
  description: {
    fontSize: FontSizes.md, // Reduced from lg
    fontFamily: FontFamily.regular,
    lineHeight: 20, // Reduced from 24
  },
  
  // Participants Section
  participantsSection: {
    marginBottom: Spacing.xl,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  participantAvatars: {
    marginBottom: Spacing.md,
  },
  
  // Bottom Action Bar
  bottomActionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    ...Shadow.lg,
  },
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  editButton: {
    flex: 1,
    marginRight: Spacing.md,
  },
  deleteIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaveButton: {
    flex: 1,
  },
  joinButton: {
    flex: 1,
  },
  
  // Tab Navigation Styles
  editButtonContainer: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
    ...Shadow.sm,
    borderWidth: 1,
  },
  editEventTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  editEventTabText: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.bold,
  },
  
  // Messages Tab Styles
  messagesTabContent: {
    flex: 1,
    minHeight: 400,
  },
  conversationsList: {
    flex: 1,
  },
  conversationsTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.md,
  },
  swipeableContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  deleteBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 100,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: '100%',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.bold,
    marginTop: Spacing.xs,
  },
  conversationItem: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  conversationContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationAvatar: {
    marginRight: Spacing.md,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationName: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.xs,
  },
  conversationMessage: {
    fontSize: FontSizes.md,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.xs,
    lineHeight: 18,
  },
  conversationTime: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamily.regular,
  },
  conversationActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  unreadCount: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamily.bold,
  },
  
  // Empty Messages State
  emptyMessagesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
    position: 'relative',
  },
  emptyMessagesGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: '35%',
  },
  emptyMessagesIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadow.lg,
  },
  emptyMessagesTextContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyMessagesTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyMessagesText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    lineHeight: 24,
  },
  emptyMessagesDecorations: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyMessagesDecoration: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  
  // Skeleton Component
  shimmerContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  
  // Error Screen
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  notFoundContainer: {
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  backBtn: {
    minWidth: 120,
  },
  
  // For skeleton
  heroPlaceholder: {
    height: screenWidth * 0.75,
  },
  participantsRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  deletedModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadow.lg,
    position: 'relative',
  },
  deletedModalCloseButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deletedModalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  deletedModalTitle: {
    fontSize: FontSizes.title,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  deletedModalMessage: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  deletedModalNote: {
    fontSize: FontSizes.caption,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    fontStyle: 'italic',
  },
  deletedModalButton: {
    width: '100%',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletedModalButtonText: {
    fontSize: FontSizes.body,
    fontFamily: FontFamily.semibold,
  },
});