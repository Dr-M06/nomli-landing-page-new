import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ExternalLink, ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { FontFamily } from '../constants/Theme';
import { supabase } from '../utils/supabase';
import { getDiscoverDatingOptedIn, setDiscoverDatingOptedIn } from '../utils/discoverDatingPrefs';
import useAuth from '../hooks/useAuth';

const DEFAULT_DATING_APP_URL = 'https://www.nomlimingle.com';
const VIBE_LOGO = require('../assets/images/nomli-vibe.png');
const { height: SCREEN_H } = Dimensions.get('window');

function Bullet({ children, textColor, accentColor }: { children: React.ReactNode; textColor: string; accentColor: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: accentColor }]} />
      <Text style={[styles.bulletText, { color: textColor }]}>{children}</Text>
    </View>
  );
}

export default function DatingAppScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const c = getThemeColors(isDarkMode);
  const [downloadUrl, setDownloadUrl] = useState(DEFAULT_DATING_APP_URL);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [datingOptedIn, setDatingOptedIn] = useState(false);
  const [datingPrefsLoaded, setDatingPrefsLoaded] = useState(() => !user?.id);

  const panelBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const panelBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  useEffect(() => {
    if (!user?.id) {
      setDatingOptedIn(false);
      setDatingPrefsLoaded(true);
      return;
    }
    let cancelled = false;
    setDatingPrefsLoaded(false);
    getDiscoverDatingOptedIn()
      .then((v) => {
        if (!cancelled) {
          setDatingOptedIn(v);
          setDatingPrefsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setDatingPrefsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadRemoteLink = async () => {
      try {
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
        Alert.alert('Link not working', 'We could not open the download page. Try again later.');
        return;
      }
      await Linking.openURL(downloadUrl);
    } catch {
      Alert.alert('Could not open', 'Check your connection and try again.');
    }
  };

  const minScrollH = Math.max(SCREEN_H - insets.top - insets.bottom - 48, 440);
  const innerMinH = minScrollH - 20;

  return (
    <View style={[styles.root, { backgroundColor: c.neutral.background, paddingTop: insets.top + 6 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8} hitSlop={12}>
        <ArrowLeft size={20} color={c.neutral.text} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { minHeight: minScrollH, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.fill, { minHeight: innerMinH }]}>
          <View style={styles.hero}>
            <Image source={VIBE_LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="Nomli Vibe logo" />
            <Text style={[styles.title, { color: c.neutral.text }]}>Real connection lives on Nomli Vibe</Text>
            <Text style={[styles.lede, { color: c.neutral.textSecondary }]}>
              Vibe is for chemistry and conversation — not another endless swipe pile. It is its own app; your Nomli login
              still works.
            </Text>
            <Text style={[styles.fomoLine, { color: c.primary.main }]}>
              Dating is moving there. Show up before the people you care about only see you somewhere else.
            </Text>
          </View>

          <View style={styles.column}>
            <Text style={[styles.sectionLabel, { color: c.neutral.textSecondary }]}>Get set up</Text>
            <View style={styles.bulletBlock}>
              <Bullet textColor={c.neutral.textSecondary} accentColor={c.primary.main}>
                Same email and password as Nomli. No second account, no starting from zero.
              </Bullet>
              <Bullet textColor={c.neutral.textSecondary} accentColor={c.primary.main}>
                Turn the switch on so your profile is already in Vibe when you arrive — not a cold start after the
                party started.
              </Bullet>
            </View>

            {user?.id ? (
              <View style={[styles.togglePanel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabels}>
                    <Text style={[styles.toggleTitle, { color: c.neutral.text }]}>Bring my profile to Vibe</Text>
                    <Text style={[styles.toggleSub, { color: c.neutral.textSecondary }]}>
                      We copy your photos and bio from Nomli so you can focus on meeting people, not fixing a blank
                      profile.
                    </Text>
                  </View>
                  <Switch
                    value={datingOptedIn}
                    disabled={!datingPrefsLoaded}
                    onValueChange={(v) => {
                      setDatingOptedIn(v);
                      void setDiscoverDatingOptedIn(v);
                    }}
                    trackColor={{
                      false: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)',
                      true: c.primary.main,
                    }}
                    thumbColor="#fff"
                    ios_backgroundColor={isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)'}
                  />
                </View>
              </View>
            ) : (
              <Text style={[styles.guestHint, { color: c.neutral.textSecondary }]}>
                Log in to Nomli to turn this on — then grab Vibe and join the room.
              </Text>
            )}
          </View>

          <View style={styles.spacer} />

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: c.primary.main }]}
              onPress={openStoreLink}
              activeOpacity={0.9}
            >
              <ExternalLink size={18} color="#fff" />
              <Text style={styles.ctaText}>{loadingUrl ? 'Loading…' : 'Open Nomli Vibe'}</Text>
            </TouchableOpacity>
            {loadingUrl ? <ActivityIndicator size="small" color={c.primary.main} style={styles.ctaSpinner} /> : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    alignSelf: 'flex-start',
  },
  scrollContent: {
    flexGrow: 1,
  },
  fill: {
    flex: 1,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 18,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  lede: {
    marginTop: 10,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
    maxWidth: 320,
  },
  fomoLine: {
    marginTop: 16,
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: 340,
    alignSelf: 'center',
  },
  column: {
    marginTop: 28,
    width: '100%',
  },
  sectionLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    marginBottom: 10,
  },
  bulletBlock: {
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingRight: 4,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    opacity: 0.85,
  },
  bulletText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  togglePanel: {
    marginTop: 22,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleLabels: {
    flex: 1,
    minWidth: 0,
  },
  toggleTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 16,
  },
  toggleSub: {
    marginTop: 4,
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  guestHint: {
    marginTop: 16,
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  spacer: {
    flex: 1,
    minHeight: 32,
  },
  footer: {
    width: '100%',
    paddingTop: 8,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: {
    color: '#fff',
    fontFamily: FontFamily.semibold,
    fontSize: 16,
  },
  ctaSpinner: {
    marginTop: 14,
    alignSelf: 'center',
  },
});
