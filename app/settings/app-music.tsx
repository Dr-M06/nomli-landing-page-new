/**
 * Admin-only: Upload and manage in-app songs (Nomli Mingle Original).
 * Songs appear in the music picker with the app logo as cover.
 */

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
  Image,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Music, Plus, Trash2 } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, getThemeColors } from '../../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../../constants/Theme';
import { useTheme } from '../../contexts/ThemeContext';
import useAuth from '../../hooks/useAuth';
import { isUserAdmin } from '../../utils/adminCheck';
import {
  ensureAppMusicBucketExists,
  uploadAppMusicFile,
  addAppSong,
  listAppSongs,
  deleteAppSong,
  type AppSongRow,
} from '../../utils/appMusicAdmin';
import { clearMusicTracksCache } from '../../constants/musicLibrary';
import { log, error } from '../../utils/productionLogger';
import Toast from 'react-native-toast-message';

const APP_LOGO = require('../../assets/images/icon.png');

export default function AppMusicSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const { user } = useAuth();
  const themeColors = getThemeColors(isDarkMode);

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [songs, setSongs] = useState<AppSongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('Nomli Mingle');

  useEffect(() => {
    (async () => {
      if (!user?.id) {
        setAdmin(false);
        setLoading(false);
        return;
      }
      const ok = await isUserAdmin(user.id);
      setAdmin(ok);
      if (!ok) {
        setLoading(false);
        return;
      }
      await loadSongs();
      setLoading(false);
    })();
  }, [user?.id]);

  const loadSongs = async () => {
    const list = await listAppSongs();
    setSongs(list);
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const uri = result.assets[0]?.uri;
      if (uri) {
        setPickedUri(uri);
        const name = result.assets[0].name || '';
        if (!title.trim()) setTitle(name.replace(/\.[^.]*$/, '') || 'Untitled');
      }
    } catch (e) {
      error('[AppMusic] Pick file error:', e);
      Toast.show({ type: 'error', text1: 'Could not pick file' });
    }
  };

  const handleUpload = async () => {
    if (!pickedUri || !title.trim()) {
      Toast.show({ type: 'info', text1: 'Pick an audio file and enter a title' });
      return;
    }
    setUploading(true);
    try {
      await ensureAppMusicBucketExists();
      const result = await uploadAppMusicFile(pickedUri);
      if ('error' in result) {
        Toast.show({ type: 'error', text1: 'Upload failed', text2: result.error });
        setUploading(false);
        return;
      }
      const id = await addAppSong({
        title: title.trim(),
        artist: (artist || 'Nomli Mingle').trim(),
        url: result.url,
        license: 'Nomli Mingle Original',
        sort_order: songs.length,
      });
      if (id) {
        clearMusicTracksCache();
        await loadSongs();
        setShowAddForm(false);
        setPickedUri(null);
        setTitle('');
        setArtist('Nomli Mingle');
        Toast.show({ type: 'success', text1: 'Song added', text2: 'It will appear in the music picker with the app logo as cover.' });
      } else {
        Toast.show({ type: 'error', text1: 'Failed to add song' });
      }
    } catch (e) {
      error('[AppMusic] Upload/add error:', e);
      Toast.show({ type: 'error', text1: 'Something went wrong' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (song: AppSongRow) => {
    Alert.alert(
      'Remove song',
      `Remove "${song.title}" from in-app music?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteAppSong(song.id, { deleteFromStorage: true, storageUrl: song.url });
            if (ok) {
              clearMusicTracksCache();
              await loadSongs();
              Toast.show({ type: 'success', text1: 'Song removed' });
            } else {
              Toast.show({ type: 'error', text1: 'Could not remove' });
            }
          },
        },
      ]
    );
  };

  if (admin === null || loading) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary.main} />
      </View>
    );
  }

  if (admin === false) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background }]}>
        <Text style={[styles.forbidden, { color: themeColors.text }]}>Admin only</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { borderColor: themeColors.border }]}>
          <Text style={{ color: themeColors.text }}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'In-app songs',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
              <ArrowLeft size={24} color={themeColors.text} />
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: themeColors.surface },
          headerTitleStyle: { color: themeColors.text, fontFamily: FontFamily.semibold },
        }}
      />
      <ScrollView
        style={[styles.scroll, { backgroundColor: themeColors.background }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
          These tracks appear in the music picker as "Nomli Mingle Original" with the app logo as cover.
        </Text>

        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          style={[styles.addCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
        >
          <Plus size={20} color={themeColors.primary.main} />
          <Text style={[styles.addCardText, { color: themeColors.primary.main }]}>Upload a song</Text>
        </TouchableOpacity>

        {showAddForm && (
          <View style={[styles.form, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <TouchableOpacity onPress={handlePickFile} style={[styles.input, { borderColor: themeColors.border }]}>
              <Text style={{ color: themeColors.text }}>{pickedUri ? 'File selected ✓' : 'Pick audio file (MP3, M4A…)'}</Text>
            </TouchableOpacity>
            <TextInput
              placeholder="Song title"
              placeholderTextColor={themeColors.textSecondary}
              value={title}
              onChangeText={setTitle}
              style={[styles.input, { borderColor: themeColors.border, color: themeColors.text }]}
            />
            <TextInput
              placeholder="Artist (default: Nomli Mingle)"
              placeholderTextColor={themeColors.textSecondary}
              value={artist}
              onChangeText={setArtist}
              style={[styles.input, { borderColor: themeColors.border, color: themeColors.text }]}
            />
            <TouchableOpacity
              onPress={handleUpload}
              disabled={uploading || !pickedUri || !title.trim()}
              style={[styles.uploadBtn, { backgroundColor: themeColors.primary.main, opacity: uploading || !pickedUri || !title.trim() ? 0.6 : 1 }]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.uploadBtnText}>Upload & add</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.listHeader}>
          <Text style={[styles.listTitle, { color: themeColors.text }]}>Current songs ({songs.length})</Text>
        </View>
        {songs.length === 0 ? (
          <Text style={[styles.empty, { color: themeColors.textSecondary }]}>No songs yet. Upload one above.</Text>
        ) : (
          songs.map((song) => (
            <View key={song.id} style={[styles.songRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Image source={APP_LOGO} style={styles.cover} resizeMode="cover" />
              <View style={styles.songInfo}>
                <Text style={[styles.songTitle, { color: themeColors.text }]} numberOfLines={1}>{song.title}</Text>
                <Text style={[styles.songArtist, { color: themeColors.textSecondary }]} numberOfLines={1}>{song.artist}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(song)}
                hitSlop={12}
                style={[styles.deleteBtn, { backgroundColor: (themeColors.error || '#e53935') + '18', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }]}
              >
                <Trash2 size={18} color={themeColors.error || '#e53935'} style={{ marginRight: 4 }} />
                <Text style={{ color: themeColors.error || '#e53935', fontSize: 13, fontFamily: FontFamily.semibold }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forbidden: {
    fontSize: FontSizes.lg,
    marginBottom: Spacing.md,
  },
  backBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.lg,
  },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  addCardText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.md,
  },
  form: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    fontSize: FontSizes.md,
  },
  uploadBtn: {
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  uploadBtnText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
  },
  listHeader: {
    marginBottom: Spacing.sm,
  },
  listTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.md,
  },
  empty: {
    fontStyle: 'italic',
    fontSize: FontSizes.sm,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  songInfo: {
    flex: 1,
    minWidth: 0,
  },
  songTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSizes.sm,
  },
  songArtist: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
