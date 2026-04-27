import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

function extractProfileId(raw: string): string | null {
  const input = (raw || '').trim();
  if (!input) return null;

  // nomlimingle://profile/<id>
  const deepMatch = input.match(/^nomlimingle:\/\/profile\/([^/?#]+)/i);
  if (deepMatch?.[1]) return decodeURIComponent(deepMatch[1]);

  // https://.../profile/<id>
  const webMatch = input.match(/\/profile\/([^/?#]+)/i);
  if (webMatch?.[1]) return decodeURIComponent(webMatch[1]);

  return null;
}

export default function ProfileQrScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const hasPermission = useMemo(() => permission?.granted === true, [permission?.granted]);

  const onScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    const profileId = extractProfileId(data);
    if (!profileId) return;

    setScanned(true);
    router.replace(`/profile/${encodeURIComponent(profileId)}`);
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Loading camera...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera permission is required to scan QR.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.ghost]} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft color="#fff" size={18} />
        </TouchableOpacity>
      </View>

      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Scan a Nomli profile QR</Text>
        {scanned && (
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              setScanned(false);
              Alert.alert('Ready', 'Scan another profile QR.');
            }}
          >
            <Text style={styles.buttonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0a1226' },
  text: { color: '#fff', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  topBar: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    zIndex: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  hint: {
    marginTop: 18,
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    marginTop: 14,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f0629b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

