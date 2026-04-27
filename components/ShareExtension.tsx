import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { close, openHostApp, type InitialProps } from 'expo-share-extension';
import {
  normalizeSharedFileUri,
  encodeShareMediaPayload,
  type ShareMediaPayload,
} from '../utils/shareImportPayload';

/**
 * iOS Share Extension root (see index.share.js). Must avoid default font scaling in extensions.
 */
export default function ShareExtension(props: InitialProps) {
  const summary = useMemo(() => {
    const img = (props.images?.length || 0) + (props.files?.length || 0);
    const vid = props.videos?.length || 0;
    const parts: string[] = [];
    if (img) parts.push(`${Math.min(img, 4)} photo${img === 1 ? '' : 's'}`);
    if (vid) parts.push(`${vid} video${vid === 1 ? '' : 's'}`);
    if (props.text) parts.push('text');
    if (props.url) parts.push('link');
    return parts.length ? parts.join(' · ') : null;
  }, [props.images, props.videos, props.files, props.text, props.url]);

  const openApp = () => {
    const q = new URLSearchParams();
    if (props.text) q.set('sharedText', props.text.slice(0, 2000));
    if (props.url) q.set('sharedUrl', props.url.slice(0, 2000));

    const payload: ShareMediaPayload = {
      images: (props.images || []).slice(0, 4).map(normalizeSharedFileUri),
      videos: (props.videos || []).slice(0, 1).map(normalizeSharedFileUri),
      files: (props.files || []).slice(0, 4).map(normalizeSharedFileUri),
    };
    const hasMedia =
      (payload.images?.length || 0) > 0 ||
      (payload.videos?.length || 0) > 0 ||
      (payload.files?.length || 0) > 0;
    if (hasMedia) {
      q.set('shareMedia', encodeShareMediaPayload(payload));
    }

    const qs = q.toString();
    openHostApp(qs ? `/(tabs)/create?${qs}` : '/(tabs)/create');
  };

  return (
    <View style={styles.container}>
      <Text allowFontScaling={false} style={styles.title}>
        Nomli
      </Text>
      <Text allowFontScaling={false} style={styles.sub}>
        {summary
          ? `You’re sharing ${summary}. Open the app to finish your post.`
          : 'Continue in the app to create a post from this share.'}
      </Text>
      <Pressable onPress={openApp} style={styles.btn} accessibilityRole="button">
        <Text allowFontScaling={false} style={styles.btnText}>
          Open Nomli
        </Text>
      </Pressable>
      <Pressable onPress={() => close()} style={styles.cancel} accessibilityRole="button">
        <Text allowFontScaling={false} style={styles.cancelText}>
          Cancel
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    color: '#b0b0b0',
    textAlign: 'center',
    marginBottom: 24,
  },
  btn: {
    backgroundColor: '#19444d',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancel: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#888',
    fontSize: 15,
  },
});
