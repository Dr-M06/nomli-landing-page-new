import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { X, Shield, UserPlus, Trash2, Search } from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import { supabase } from '../utils/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { getModerators, addModerator, removeModerator, StreamModerator } from '../utils/moderationService';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';


interface ModeratorManagementModalProps {
  visible: boolean;
  onClose: () => void;
  streamId: string;
}

export default function ModeratorManagementModal({
  visible,
  onClose,
  streamId,
}: ModeratorManagementModalProps) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const { user } = useAuth();
  const [moderators, setModerators] = useState<StreamModerator[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingModerator, setAddingModerator] = useState(false);

  useEffect(() => {
    if (visible && streamId) {
      loadModerators();
    }
  }, [visible, streamId]);

  const loadModerators = async () => {
    setLoading(true);
    try {
      const mods = await getModerators(streamId);
      setModerators(mods);
    } catch (error) {
      error('[Moderation] Error loading moderators:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(10);

      if (error) {
        error('[Moderation] Error searching users:', error);
        return;
      }

      // Filter out current user and existing moderators
      const existingModIds = new Set(moderators.map(m => m.moderator_id));
      const filtered = (data || []).filter(
        profile => profile.id !== user?.id && !existingModIds.has(profile.id)
      );

      setSearchResults(filtered);
    } catch (error) {
      error('[Moderation] Exception searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddModerator = async (userId: string, username: string) => {
    if (!user?.id) return;

    setAddingModerator(true);
    try {
      const success = await addModerator(streamId, userId, user.id);
      if (success) {
        Alert.alert('Success', `${username} has been added as a moderator`);
        setSearchQuery('');
        setSearchResults([]);
        loadModerators();
      } else {
        Alert.alert('Error', 'Failed to add moderator');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add moderator');
    } finally {
      setAddingModerator(false);
    }
  };

  const handleRemoveModerator = async (moderatorId: string, username: string) => {
    if (!user?.id) return;

    Alert.alert(
      'Remove Moderator',
      `Are you sure you want to remove ${username} as a moderator?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await removeModerator(streamId, moderatorId, user.id);
            if (success) {
              Alert.alert('Success', `${username} has been removed as a moderator`);
              loadModerators();
            } else {
              Alert.alert('Error', 'Failed to remove moderator');
            }
          },
        },
      ]
    );
  };

  const renderModerator = ({ item }: { item: StreamModerator }) => (
    <View style={styles.moderatorItem}>
      <ExpoImage
        source={{
          uri: item.profile?.avatar_url || 'https://via.placeholder.com/40x40.png?text=U'
        }}
        style={styles.moderatorAvatar}
        contentFit="cover"
      />
      <View style={styles.moderatorInfo}>
        <Text style={styles.moderatorName} numberOfLines={1}>
          {item.profile?.full_name || 'Unknown'}
        </Text>
        <Text style={styles.moderatorUsername} numberOfLines={1}>
          @{item.profile?.username || 'unknown'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveModerator(item.moderator_id, item.profile?.full_name || 'Moderator')}
      >
        <Trash2 size={18} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  const renderSearchResult = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.searchResultItem}
      onPress={() => handleAddModerator(item.id, item.username)}
      disabled={addingModerator}
    >
      <ExpoImage
        source={{
          uri: item.avatar_url || 'https://via.placeholder.com/40x40.png?text=U'
        }}
        style={styles.searchAvatar}
        contentFit="cover"
      />
      <View style={styles.searchInfo}>
        <Text style={styles.searchName} numberOfLines={1}>
          {item.full_name}
        </Text>
        <Text style={styles.searchUsername} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>
      {addingModerator ? (
        <ActivityIndicator size="small" color={themeColors.primary.main} />
      ) : (
        <UserPlus size={20} color={themeColors.primary.main} />
      )}
    </TouchableOpacity>
  );

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
            <Shield size={20} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Moderators</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={24} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {/* Search Section */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Search size={18} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users to add as moderator..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                searchUsers(text);
              }}
            />
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.primary.main} />
              <Text style={styles.loadingText}>Loading moderators...</Text>
            </View>
          ) : (
            <>
              {/* Search Results */}
              {searchQuery.length >= 2 && (
                <View style={styles.searchResultsSection}>
                  <Text style={styles.sectionTitle}>Search Results</Text>
                  {searching ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={themeColors.primary.main} />
                    </View>
                  ) : searchResults.length > 0 ? (
                    <FlatList
                      data={searchResults}
                      keyExtractor={(item) => item.id}
                      renderItem={renderSearchResult}
                      scrollEnabled={false}
                    />
                  ) : (
                    <Text style={styles.emptyText}>No users found</Text>
                  )}
                </View>
              )}

              {/* Current Moderators */}
              <View style={styles.moderatorsSection}>
                <Text style={styles.sectionTitle}>
                  Current Moderators ({moderators.length})
                </Text>
                {moderators.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Shield size={48} color="#666" />
                    <Text style={styles.emptyText}>No moderators yet</Text>
                    <Text style={styles.emptySubtext}>
                      Search and add users to help moderate your stream
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={moderators}
                    keyExtractor={(item) => item.id}
                    renderItem={renderModerator}
                    scrollEnabled={false}
                  />
                )}
              </View>
            </>
          )}
        </View>
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
  searchSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  content: {
    flex: 1,
    padding: 20,
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
  searchResultsSection: {
    marginBottom: 24,
  },
  moderatorsSection: {
    flex: 1,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
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
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  moderatorItem: {
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
  moderatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  moderatorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  moderatorName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  moderatorUsername: {
    color: '#FFFFFF',
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultItem: {
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
  searchAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  searchInfo: {
    flex: 1,
    marginLeft: 12,
  },
  searchName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  searchUsername: {
    color: '#FFFFFF',
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
});

