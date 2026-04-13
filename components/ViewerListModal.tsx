import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  Alert,
  TextInput,
} from 'react-native';
import { X, Eye, Users, Shield, AlertTriangle, Ban } from 'lucide-react-native';
import FollowButton from './FollowButton';
import { Image as ExpoImage } from 'expo-image';
import { supabase } from '../utils/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { canModerate, warnUser, kickUser, isModerator, isStreamer } from '../utils/moderationService';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';


const { width, height } = Dimensions.get('window');

interface Viewer {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  joined_at: string;
}

interface ViewerListModalProps {
  visible: boolean;
  onClose: () => void;
  streamId: string;
  viewerCount: number;
  onUserKicked?: (userId: string) => void; // Callback when user is kicked
}

export default function ViewerListModal({ 
  visible, 
  onClose, 
  streamId, 
  viewerCount,
  onUserKicked
}: ViewerListModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [canModerateStream, setCanModerateStream] = useState(false);
  const [showWarnModal, setShowWarnModal] = useState(false);
  const [showKickModal, setShowKickModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Viewer | null>(null);
  const [warnReason, setWarnReason] = useState('Please follow community guidelines and be respectful to others.');
  const [kickReason, setKickReason] = useState('');

  useEffect(() => {
    if (visible && streamId) {
      loadViewers();
      checkModerationPermissions();
    }
  }, [visible, streamId, user?.id]);

  // Subscribe to viewer updates and kick events in real-time
  useEffect(() => {
    if (!visible || !streamId) return;

    const viewerChannel = supabase
      .channel(`viewer_updates_${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_stream_viewers',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          log('👥 [ViewerListModal] Viewer updated:', payload);
          // If viewer was marked as inactive, refresh the list
          if (payload.new && !payload.new.is_active) {
            log('👥 [ViewerListModal] Viewer marked inactive, refreshing list');
            loadViewers();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'live_stream_viewers',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          log('👥 [ViewerListModal] Viewer deleted:', payload);
          loadViewers();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_stream_kicks',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          log('🚫 [ViewerListModal] User kicked, refreshing viewer list:', payload);
          // Immediately remove kicked user from list and refresh
          if (payload.new?.user_id) {
            setViewers(prev => prev.filter(v => v.user_id !== payload.new.user_id));
          }
          // Refresh the full list to ensure consistency
          setTimeout(() => {
            loadViewers();
          }, 300);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log('✅ [ViewerListModal] Subscribed to viewer updates and kicks');
        }
      });

    return () => {
      supabase.removeChannel(viewerChannel);
    };
  }, [visible, streamId, loadViewers]);

  const checkModerationPermissions = async () => {
    if (!user?.id || !streamId) return;
    const canMod = await canModerate(streamId, user.id);
    setCanModerateStream(canMod);
  };

  const loadViewers = useCallback(async () => {
    setLoading(true);
    try {
      log('🎯 [LIVE_STREAM] 📊 Loading viewers for stream:', streamId);
      
      // First get the viewers
      const { data: viewersData, error: viewersError } = await supabase
        .from('live_stream_viewers')
        .select('id, user_id, joined_at')
        .eq('stream_id', streamId)
        .eq('is_active', true)
        .order('joined_at', { ascending: false });

      if (viewersError) {
        error('❌ Failed to load viewers:', viewersError);
        setViewers([]);
        return;
      }

      if (!viewersData || viewersData.length === 0) {
        log('🎯 [LIVE_STREAM] No active viewers found');
        setViewers([]);
        return;
      }

      // Get list of kicked users for this stream
      const { data: kickedUsers, error: kickedError } = await supabase
        .from('live_stream_kicks')
        .select('user_id')
        .eq('stream_id', streamId);

      const kickedUserIds = new Set(kickedUsers?.map(k => k.user_id) || []);
      log('🚫 [ViewerListModal] Kicked user IDs:', Array.from(kickedUserIds));

      // Filter out kicked users
      const activeViewers = viewersData.filter(v => !kickedUserIds.has(v.user_id));
      log('🎯 [LIVE_STREAM] Active viewers after filtering kicked:', activeViewers.length, 'out of', viewersData.length);

      if (activeViewers.length === 0) {
        log('🎯 [LIVE_STREAM] No active viewers after filtering kicked users');
        setViewers([]);
        return;
      }

      // Then get the profiles for those users
      const userIds = activeViewers.map(v => v.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        error('❌ Failed to load profiles:', profilesError);
      }

      // Combine the data
      const formattedViewers: Viewer[] = activeViewers.map(viewer => {
        const profile = profilesData?.find(p => p.id === viewer.user_id);
        return {
          id: viewer.id,
          user_id: viewer.user_id,
          username: profile?.username || 'Unknown',
          full_name: profile?.full_name || 'Unknown User',
          avatar_url: profile?.avatar_url,
          joined_at: viewer.joined_at,
        };
      });

      // Do not inject synthetic "anonymous" rows; show only real viewer records.
      // This avoids temporary fake users when stream viewer_count is briefly stale.
      if ((viewerCount || 0) > formattedViewers.length) {
        log(
          `🎯 [LIVE_STREAM] Viewer count mismatch (stream=${viewerCount}, rows=${formattedViewers.length}) - showing real viewers only`
        );
      }
      log('🎯 [LIVE_STREAM] ✅ Loaded real viewers:', formattedViewers.length);
      setViewers(formattedViewers);
    } catch (error) {
      error('❌ Failed to load viewers:', error);
      setViewers([]);
    } finally {
      setLoading(false);
    }
  }, [streamId, viewerCount]);

  const formatJoinTime = (joinedAt: string) => {
    const now = new Date();
    const joined = new Date(joinedAt);
    const diffMs = now.getTime() - joined.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const handleWarn = async () => {
    if (!selectedUser || !user?.id || !streamId) return;

    const success = await warnUser(streamId, selectedUser.user_id, user.id, warnReason || undefined);
    if (success) {
      Alert.alert('Success', `Warning sent to ${selectedUser.full_name}`);
      setShowWarnModal(false);
      setWarnReason('');
      setSelectedUser(null);
    } else {
      Alert.alert('Error', 'Failed to send warning');
    }
  };

  const handleKick = async () => {
    if (!selectedUser || !user?.id || !streamId) return;

    Alert.alert(
      'Kick User',
      `Are you sure you want to kick ${selectedUser.full_name} from the stream?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: async () => {
            const success = await kickUser(streamId, selectedUser.user_id, user.id, kickReason || undefined);
            if (success) {
              Alert.alert('Success', `${selectedUser.full_name} has been kicked from the stream`);
              setShowKickModal(false);
              setKickReason('');
              setSelectedUser(null);
              // Immediately remove from viewers list
              setViewers(prev => prev.filter(v => v.user_id !== selectedUser.user_id));
              // Refresh viewer list to ensure consistency
              setTimeout(() => {
                loadViewers();
              }, 500);
              // Notify parent component
              if (onUserKicked) {
                onUserKicked(selectedUser.user_id);
              }
            } else {
              Alert.alert('Error', 'Failed to kick user');
            }
          },
        },
      ]
    );
  };

  const openWarnModal = (viewer: Viewer) => {
    setSelectedUser(viewer);
    setWarnReason('Please follow community guidelines and be respectful to others.');
    setShowWarnModal(true);
  };

  const openKickModal = (viewer: Viewer) => {
    setSelectedUser(viewer);
    setShowKickModal(true);
  };

  const renderViewer = ({ item }: { item: Viewer }) => {
    const isCurrentUser = item.user_id === user?.id;
    const showModActions = canModerateStream && Boolean(item.user_id) && !isCurrentUser;

    return (
      <View style={styles.viewerItem}>
        <ExpoImage
          source={{ 
            uri: item.avatar_url || 'https://via.placeholder.com/40x40.png?text=U'
          }}
          style={styles.viewerAvatar}
          contentFit="cover"
        />
        <View style={styles.viewerInfo}>
          <Text style={styles.viewerName} numberOfLines={1}>
            {item.full_name}
          </Text>
          <Text style={styles.viewerUsername} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
        <View style={styles.viewerRight}>
          <Text style={styles.joinTime}>
            {formatJoinTime(item.joined_at)}
          </Text>
          {Boolean(item.user_id) && !showModActions && (
            <FollowButton 
              userId={item.user_id}
              size="small"
              variant="minimal"
              style={styles.followBtn}
            />
          )}
          {showModActions && (
            <View style={styles.modActions}>
              <TouchableOpacity
                style={styles.modActionButton}
                onPress={() => openWarnModal(item)}
              >
                <AlertTriangle size={16} color="#FFA500" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modActionButton}
                onPress={() => openKickModal(item)}
              >
                <Ban size={16} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Eye size={20} color="#FFFFFF" />
            <Text style={styles.headerTitle}>
              {viewerCount} {viewerCount === 1 ? 'Viewer' : 'Viewers'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={onClose}
          >
            <X size={24} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <Users size={48} color="#666" />
              <Text style={styles.loadingText}>Loading viewers...</Text>
            </View>
          ) : viewers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Eye size={48} color="#666" />
              <Text style={styles.emptyText}>No viewers yet</Text>
              <Text style={styles.emptySubtext}>
                Share your stream to get viewers!
              </Text>
            </View>
          ) : (
            <FlatList
              data={viewers}
              keyExtractor={(item) => item.id}
              renderItem={renderViewer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.viewersList}
            />
          )}
        </View>

        {/* Warn Modal */}
        <Modal
          visible={showWarnModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowWarnModal(false);
            setWarnReason('');
            setSelectedUser(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Warn User</Text>
              <Text style={styles.modalSubtitle}>
                Send a warning to {selectedUser?.full_name}
              </Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="Reason (optional)"
                placeholderTextColor="#999"
                value={warnReason}
                onChangeText={setWarnReason}
                multiline
                numberOfLines={3}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowWarnModal(false);
                    setWarnReason('');
                    setSelectedUser(null);
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonWarn]}
                  onPress={handleWarn}
                >
                  <Text style={styles.modalButtonText}>Send Warning</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Kick Modal */}
        <Modal
          visible={showKickModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowKickModal(false);
            setKickReason('');
            setSelectedUser(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Kick User</Text>
              <Text style={styles.modalSubtitle}>
                Remove {selectedUser?.full_name} from the stream
              </Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="Reason (optional)"
                placeholderTextColor="#999"
                value={kickReason}
                onChangeText={setKickReason}
                multiline
                numberOfLines={3}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowKickModal(false);
                    setKickReason('');
                    setSelectedUser(null);
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonKick]}
                  onPress={handleKick}
                >
                  <Text style={styles.modalButtonText}>Kick User</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  viewersList: {
    padding: 20,
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  viewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  viewerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  viewerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  viewerName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  viewerUsername: {
    color: '#FFFFFF',
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  joinTime: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.6,
  },
  followBtn: {
    marginTop: 4,
  },
  modActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  modActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 20,
  },
  reasonInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalButtonWarn: {
    backgroundColor: '#FFA500',
  },
  modalButtonKick: {
    backgroundColor: '#FF3B30',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonTextCancel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    opacity: 0.9,
  },
});
