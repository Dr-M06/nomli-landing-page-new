import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, UserX, Search, X } from 'lucide-react-native';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeAreaWrapper from '../../components/SafeAreaWrapper';
import { getBlockedUsers, unblockUser } from '../../utils/blockUser';
import EnhancedAvatar from '../../components/EnhancedAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import { log, warn, error } from '../../utils/productionLogger';


interface BlockedUser {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  blocked_at: string;
}

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const insets = useSafeAreaInsets();
  
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const loadBlockedUsers = React.useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      log('[BlockedUsers] Loading blocked users...');
      setLoading(true);
      const users = await getBlockedUsers(user.id);
      log('[BlockedUsers] Loaded users:', users);
      setBlockedUsers(users);
      setFilteredUsers(users);
    } catch (error) {
      error('[BlockedUsers] Error loading blocked users:', error);
      setBlockedUsers([]);
      setFilteredUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    
    if (mounted) {
      loadBlockedUsers();
    }

    return () => {
      mounted = false;
    };
  }, [loadBlockedUsers]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(blockedUsers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        blockedUsers.filter(
          user =>
            user.username?.toLowerCase().includes(query) ||
            user.full_name?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, blockedUsers]);

  const handleUnblock = (blockedUser: BlockedUser) => {
    if (!user?.id) return;

    Alert.alert(
      'Unblock User',
      `Unblock ${blockedUser.username}? They'll be able to see your posts and message you again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            try {
              setUnblockingId(blockedUser.id);
              const { success, error } = await unblockUser(user.id, blockedUser.id);
              
              if (success) {
                // Remove from list
                setBlockedUsers(prev => prev.filter(u => u.id !== blockedUser.id));
                setFilteredUsers(prev => prev.filter(u => u.id !== blockedUser.id));
              } else {
                Alert.alert('Error', error || 'Failed to unblock user');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to unblock user');
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.neutral.background }]}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: 'Blocked',
        }}
      />
      
      {/* Minimalist Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={22} color={themeColors.neutral.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.neutral.text }]}>
          blocked
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search Bar - Minimal & Clean */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchContainer, { 
          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
        }]}>
          <Search size={16} color={themeColors.neutral.subtext} strokeWidth={2.5} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.neutral.text }]}
            placeholder="search..."
            placeholderTextColor={themeColors.neutral.subtext}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={themeColors.neutral.subtext} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.primary.main} />
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { 
            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          }]}>
            <UserX size={32} color={themeColors.neutral.subtext} strokeWidth={2} />
          </View>
          <Text style={[styles.emptyTitle, { color: themeColors.neutral.text }]}>
            {searchQuery ? 'no results' : 'no blocked users'}
          </Text>
          <Text style={[styles.emptyText, { color: themeColors.neutral.subtext }]}>
            {searchQuery
              ? 'try a different search'
              : 'blocked users can\'t see your content\nor message you'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          {filteredUsers.map((blockedUser, index) => (
            <View
              key={blockedUser.id}
              style={[styles.userCard, { 
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                borderBottomWidth: index < filteredUsers.length - 1 ? 1 : 0,
                borderBottomColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
              }]}
            >
              <View style={styles.userInfo}>
                <EnhancedAvatar
                  userId={blockedUser.id}
                  avatarUrl={blockedUser.avatar_url}
                  size={44}
                  username={blockedUser.username}
                />
                <View style={styles.userDetails}>
                  <Text style={[styles.username, { color: themeColors.neutral.text }]}>
                    {blockedUser.username || 'unknown'}
                  </Text>
                  {blockedUser.full_name && (
                    <Text style={[styles.fullName, { color: themeColors.neutral.subtext }]} numberOfLines={1}>
                      {blockedUser.full_name}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={[styles.unblockButton]}
                onPress={() => handleUnblock(blockedUser)}
                disabled={unblockingId === blockedUser.id}
                activeOpacity={0.7}
              >
                {unblockingId === blockedUser.id ? (
                  <ActivityIndicator size="small" color={Colors.primary.main} />
                ) : (
                  <Text style={[styles.unblockText, { color: Colors.primary.main }]}>
                    unblock
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginRight: 32,
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 32,
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    fontWeight: '400',
    letterSpacing: -0.2,
    paddingVertical: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: -60,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  userDetails: {
    flex: 1,
    gap: 2,
  },
  username: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  fullName: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});

