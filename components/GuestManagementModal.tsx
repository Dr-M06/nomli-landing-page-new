import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { X, Search, UserPlus, Check, Clock, UserX, Users } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { supabase } from '../utils/supabase';
import Toast from 'react-native-toast-message';
import { log, warn, error } from '../utils/productionLogger';
import {
  sendGuestInvitation,
  getPendingJoinRequests,
  acceptJoinRequest,
  declineJoinRequest,
  removeGuestFromStream,
  LiveStreamJoinRequest,
  LiveStreamGuest,
} from '../utils/guestService';

const { width } = Dimensions.get('window');

interface GuestManagementModalProps {
  visible: boolean;
  onClose: () => void;
  streamId: string;
  currentGuests: LiveStreamGuest[];
  maxGuests?: number;
  onGuestAdded?: (guest: LiveStreamGuest) => void;
  onGuestRemoved?: (userId: string) => void;
}

interface UserSearchResult {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
}

export default function GuestManagementModal({
  visible,
  onClose,
  streamId,
  currentGuests,
  maxGuests = 1,
  onGuestAdded,
  onGuestRemoved,
}: GuestManagementModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  const [activeTab, setActiveTab] = useState<'search' | 'requests' | 'current'>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [joinRequests, setJoinRequests] = useState<LiveStreamJoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLimitWarning, setShowLimitWarning] = useState(false);

  // Fetch pending join requests
  useEffect(() => {
    if (visible && activeTab === 'requests') {
      fetchJoinRequests();
    }
  }, [visible, activeTab, streamId]);

  // Subscribe to new join requests
  useEffect(() => {
    if (!visible || !streamId) return;

    const channel = supabase
      .channel(`join_requests_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_join_requests',
          filter: `stream_id=eq.${streamId}`,
        },
        async (payload) => {
          log('New join request received:', payload);
          fetchJoinRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, streamId]);

  const fetchJoinRequests = async () => {
    const result = await getPendingJoinRequests(streamId);
    if (result.success && result.requests) {
      setJoinRequests(result.requests);
    }
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;

      // Filter out users who are already guests
      const filtered = data?.filter(
        (user) => !currentGuests.some((guest) => guest.user_id === user.id)
      ) || [];

      setSearchResults(filtered);
    } catch (error) {
      error('Error searching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (activeTab === 'search') {
        searchUsers(searchQuery);
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, activeTab]);

  const handleInviteUser = async (userId: string) => {
    if (currentGuests.length >= maxGuests) {
      setShowLimitWarning(true);
      return;
    }

    setActionLoading(userId);
    log('[GuestManagementModal] 📤 Sending invitation to user:', userId, 'for stream:', streamId);
    
    try {
      const result = await sendGuestInvitation(streamId, userId);
      setActionLoading(null);

      log('[GuestManagementModal] 📤 Invitation result:', {
        success: result.success,
        error: result.error,
        invitationId: result.invitation?.id
      });

      if (result.success) {
        log('[GuestManagementModal] ✅ Invitation sent successfully!');
        Toast.show({
          type: 'success',
          text1: 'Invitation Sent',
          text2: 'The user will receive a notification to join as co-host.',
          visibilityTime: 3000,
        });
        setSearchQuery('');
        setSearchResults([]);
      } else {
        Toast.show({
          type: 'error',
          text1: 'Invitation Failed',
          text2: result.error || 'Failed to send invitation. Please try again.',
          visibilityTime: 3000,
        });
      }
    } catch (error: any) {
      setActionLoading(null);
      error('❌ [GuestManagementModal] Error sending invitation:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to send invitation. Please try again.',
        visibilityTime: 3000,
      });
    }
  };

  const handleAcceptRequest = async (request: LiveStreamJoinRequest) => {
    if (currentGuests.length >= maxGuests) {
      setShowLimitWarning(true);
      return;
    }

    setActionLoading(request.id);
    try {
      const result = await acceptJoinRequest(request.id);
      setActionLoading(null);

      if (result.success) {
        // Remove from requests list
        setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
        // Refresh to show updated guest list
        fetchJoinRequests();
        Toast.show({
          type: 'success',
          text1: 'Request Accepted',
          text2: 'The user can now join as co-host.',
          visibilityTime: 3000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Accept Failed',
          text2: result.error || 'Failed to accept request. Please try again.',
          visibilityTime: 3000,
        });
      }
    } catch (error: any) {
      setActionLoading(null);
      error('❌ [GuestManagementModal] Error accepting request:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to accept request. Please try again.',
        visibilityTime: 3000,
      });
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const result = await declineJoinRequest(requestId);
      setActionLoading(null);

      if (result.success) {
        setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
        Toast.show({
          type: 'info',
          text1: 'Request Declined',
          text2: 'The join request has been declined.',
          visibilityTime: 2000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Decline Failed',
          text2: result.error || 'Failed to decline request. Please try again.',
          visibilityTime: 3000,
        });
      }
    } catch (error: any) {
      setActionLoading(null);
      error('❌ [GuestManagementModal] Error declining request:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to decline request. Please try again.',
        visibilityTime: 3000,
      });
    }
  };

  const handleRemoveGuest = async (userId: string) => {
    try {
      setActionLoading(userId);
      const result = await removeGuestFromStream(streamId, userId);
      setActionLoading(null);

      if (result.success) {
        try {
          onGuestRemoved?.(userId);
        } catch (callbackError) {
          error('❌ [GuestManagementModal] Error in onGuestRemoved callback:', callbackError);
          // Continue anyway - guest was removed from database
        }
        Toast.show({
          type: 'success',
          text1: 'Guest Removed',
          text2: 'The guest has been removed from the stream.',
          visibilityTime: 2000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Remove Failed',
          text2: result.error || 'Failed to remove guest. Please try again.',
          visibilityTime: 3000,
        });
      }
    } catch (error: any) {
      setActionLoading(null);
      error('❌ [GuestManagementModal] Error removing guest:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to remove guest. Please try again.',
        visibilityTime: 3000,
      });
    }
  };

  const renderSearchResults = () => (
    <FlatList
      data={searchResults}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.userCard}>
          <Image
            source={{ uri: item.avatar_url || 'https://via.placeholder.com/40' }}
            style={styles.avatar}
            contentFit="cover"
          />
          <View style={styles.userInfo}>
            <Text style={styles.username}>{item.full_name || item.username}</Text>
            <Text style={styles.handle}>@{item.username}</Text>
          </View>
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={() => handleInviteUser(item.id)}
            disabled={actionLoading === item.id}
          >
              {actionLoading === item.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <UserPlus size={14} color="#FFFFFF" strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Search size={36} color="rgba(255, 255, 255, 0.3)" strokeWidth={1.5} />
          <Text style={styles.emptyText}>
            {searchQuery ? 'No users found' : 'Search for users to invite'}
          </Text>
        </View>
      }
    />
  );

  const renderJoinRequests = () => (
    <FlatList
      data={joinRequests}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.requestCard}>
          <Image
            source={{
              uri: item.user_profile?.avatar_url || 'https://via.placeholder.com/40',
            }}
            style={styles.avatar}
            contentFit="cover"
          />
          <View style={styles.userInfo}>
            <Text style={styles.username} numberOfLines={1}>
              {item.user_profile?.full_name || item.user_profile?.username}
            </Text>
            <Text style={styles.handle} numberOfLines={1}>@{item.user_profile?.username}</Text>
            {/* TikTok-style: Show request time */}
            {item.created_at && (
              <Text style={styles.requestTime}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={[styles.acceptButton, actionLoading === item.id && styles.buttonLoading]}
              onPress={() => handleAcceptRequest(item)}
              disabled={actionLoading === item.id || currentGuests.length >= maxGuests}
              activeOpacity={0.7}
            >
              {actionLoading === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.declineButton, actionLoading === item.id && styles.buttonLoading]}
              onPress={() => handleDeclineRequest(item.id)}
              disabled={actionLoading === item.id}
              activeOpacity={0.7}
            >
              <X size={16} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Clock size={36} color="rgba(255, 255, 255, 0.3)" strokeWidth={1.5} />
          <Text style={styles.emptyText}>No pending requests</Text>
        </View>
      }
    />
  );

  const renderCurrentGuests = () => (
    <FlatList
      data={currentGuests}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.guestCard}>
          <View style={styles.guestAvatarContainer}>
            <Image
              source={{
                uri: item.profile?.avatar_url || 'https://via.placeholder.com/40',
              }}
              style={styles.avatar}
              contentFit="cover"
            />
            {/* TikTok-style: Show active indicator */}
            {item.is_active && (
              <View style={styles.activeIndicator} />
            )}
          </View>
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Text style={styles.username} numberOfLines={1}>
                {item.profile?.full_name || item.profile?.username}
              </Text>
              {/* TikTok-style: Show audio/video status */}
              <View style={styles.mediaStatus}>
                {item.audio_enabled !== false && (
                  <View style={styles.statusDot} />
                )}
                {item.video_enabled !== false && (
                  <View style={[styles.statusDot, styles.videoDot]} />
                )}
              </View>
            </View>
            <Text style={styles.handle} numberOfLines={1}>@{item.profile?.username}</Text>
            {/* TikTok-style: Show join time */}
            {item.joined_at && (
              <Text style={styles.joinTime}>
                Joined {new Date(item.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.removeButton, actionLoading === item.user_id && styles.buttonLoading]}
            onPress={() => handleRemoveGuest(item.user_id)}
            disabled={actionLoading === item.user_id}
            activeOpacity={0.7}
          >
            {actionLoading === item.user_id ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <UserX size={16} color="#FF3B30" strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <UserPlus size={36} color="rgba(255, 255, 255, 0.3)" strokeWidth={1.5} />
          <Text style={styles.emptyText}>No guests yet</Text>
          <Text style={styles.emptySubtext}>Invite users or accept join requests</Text>
        </View>
      }
    />
  );

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={80} style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Manage Guests</Text>
            <Text style={styles.subtitle}>
              {currentGuests.length}/{maxGuests} guests
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={16} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
              onPress={() => setActiveTab('requests')}
            >
              <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
                Requests
              </Text>
              {joinRequests.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{joinRequests.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'current' && styles.activeTab]}
              onPress={() => setActiveTab('current')}
            >
              <Text style={[styles.tabText, activeTab === 'current' && styles.activeTabText]}>
                Current
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'search' && styles.activeTab]}
              onPress={() => setActiveTab('search')}
            >
              <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
                Invite
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar (only for search tab) */}
          {activeTab === 'search' && (
            <View style={styles.searchContainer}>
              <Search size={14} color="rgba(255, 255, 255, 0.5)" strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor="rgba(255, 255, 255, 0.5)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {loading && <ActivityIndicator size="small" color="#FFFFFF" />}
            </View>
          )}

          {/* Content */}
          <View style={styles.content}>
            {activeTab === 'search' && renderSearchResults()}
            {activeTab === 'requests' && renderJoinRequests()}
            {activeTab === 'current' && renderCurrentGuests()}
          </View>
        </View>
      </BlurView>
    </Modal>
    
    {/* Guest Limit Warning Modal - Separate modal outside main modal */}
    <Modal
      visible={showLimitWarning}
      transparent
      animationType="fade"
      onRequestClose={() => setShowLimitWarning(false)}
    >
      <TouchableOpacity
        style={styles.warningOverlay}
        activeOpacity={1}
        onPress={() => setShowLimitWarning(false)}
      >
        <TouchableOpacity
          style={[styles.warningCard, { backgroundColor: themeColors.neutral.card }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.warningIconContainer}>
            <Users size={32} color={themeColors.primary.main} strokeWidth={2} />
          </View>
          <Text style={[styles.warningTitle, { color: themeColors.neutral.text }]}>
            Guest Limit Reached
          </Text>
          <Text style={[styles.warningMessage, { color: themeColors.neutral.subtext }]}>
            You can only host {maxGuests} guest{maxGuests !== 1 ? 's' : ''} at a time. Please remove a guest before inviting another.
          </Text>
          <TouchableOpacity
            style={[styles.warningButton, { backgroundColor: themeColors.primary.main }]}
            onPress={() => setShowLimitWarning(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.warningButtonText}>Got it</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '65%',
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  activeTab: {
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.4)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: -0.2,
  },
  activeTabText: {
    color: '#00D9FF',
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  content: {
    flex: 1,
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 217, 255, 0.05)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.2)',
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(76, 217, 100, 0.05)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(76, 217, 100, 0.2)',
  },
  guestAvatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: 'rgba(20, 20, 30, 0.95)',
  },
  userInfo: {
    flex: 1,
    minWidth: 0, // Allow text to shrink
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    flexShrink: 1,
    marginBottom: 1,
  },
  handle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
    marginTop: 2,
  },
  requestTime: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
    fontWeight: '400',
  },
  joinTime: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
    fontWeight: '400',
  },
  mediaStatus: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  videoDot: {
    backgroundColor: '#007AFF',
  },
  buttonLoading: {
    opacity: 0.6,
  },
  inviteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00D9FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 6,
  },
  acceptButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CD964',
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 12,
    letterSpacing: -0.2,
  },
  emptySubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 4,
  },
  // Guest Limit Warning Modal Styles
  warningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  warningCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  warningIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 20,
    fontFamily: 'System',
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  warningMessage: {
    fontSize: 15,
    fontFamily: 'System',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    letterSpacing: -0.2,
    paddingHorizontal: 8,
  },
  warningButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'System',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});

