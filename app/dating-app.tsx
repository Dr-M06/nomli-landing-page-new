import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExternalLink, ArrowLeft, Heart } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily } from '../constants/Theme';
import { supabase } from '../utils/supabase';

const DEFAULT_DATING_APP_URL = 'https://www.nomlimingle.com';

export default function DatingAppScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const c = getThemeColors(isDarkMode);
  const [downloadUrl, setDownloadUrl] = useState(DEFAULT_DATING_APP_URL);
  const [loadingUrl, setLoadingUrl] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadRemoteLink = async () => {
      try {
        // Primary source: app_settings table with key/value
        const { data: appSetting } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'dating_app_download_url')
          .maybeSingle();
        const first = appSetting?.value;
        if (!cancelled && typeof first === 'string' && first.startsWith('http')) {
          setDownloadUrl(first);
          return;
        }

        // Secondary fallback source: app_links table
        const { data: appLink } = await supabase
          .from('app_links')
          .select('url')
          .eq('key', 'dating_app_download_url')
          .maybeSingle();
        const second = appLink?.url;
        if (!cancelled && typeof second === 'string' && second.startsWith('http')) {
          setDownloadUrl(second);
        }
      } catch {
        // Keep default URL
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    };
    loadRemoteLink();
    return () => {
      cancelled = true;
    };
  }, []);

  const openStoreLink = async () => {
    try {
      const can = await Linking.canOpenURL(downloadUrl);
      if (!can) {
        Alert.alert('Invalid link', 'Dating app link is not available right now.');
        return;
      }
      await Linking.openURL(downloadUrl);
    } catch {
      Alert.alert('Could not open link', 'Please try again.');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.neutral.background, paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <ArrowLeft size={18} color={c.neutral.text} />
      </TouchableOpacity>

      <View style={[styles.card, { backgroundColor: isDarkMode ? '#101624' : '#fff', borderColor: c.neutral.border }]}>
        <View style={styles.iconWrap}>
          <Heart size={20} color="#ff4fa3" />
        </View>
        <Text style={[styles.title, { color: c.neutral.text }]}>Dating is now in our official Dating app</Text>
        <Text style={[styles.sub, { color: c.neutral.textSecondary }]}>
          For swiping, matching, and dating-only features, download our dedicated Dating app.
        </Text>
        <TouchableOpacity style={[styles.cta, { backgroundColor: c.primary.main }]} onPress={openStoreLink} activeOpacity={0.9}>
          <ExternalLink size={16} color="#fff" />
          <Text style={styles.ctaText}>{loadingUrl ? 'Loading link...' : 'Download Dating App'}</Text>
        </TouchableOpacity>
        {loadingUrl && <ActivityIndicator size="small" color={c.primary.main} style={{ marginTop: 10 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,79,163,0.14)',
    marginBottom: 10,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  sub: {
    marginTop: 8,
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  cta: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: 14,
  },
});

