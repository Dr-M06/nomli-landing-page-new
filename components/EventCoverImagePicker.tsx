import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image as ImageIcon, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';
import { BorderRadius, FontFamily, FontSizes, Spacing } from '../constants/Theme';

interface Props {
  selectedImage: string | null;
  onSelectImage: (uri: string | null) => void;
  /** Kept for API compatibility with old EventImagePicker; unused. */
  selectedCategory?: string | null;
}

export default function EventCoverImagePicker({
  selectedImage,
  onSelectImage,
}: Props) {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);

  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to choose a cover image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      onSelectImage(res.assets[0].uri);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: themeColors.neutral.text }]}>Cover image</Text>
      {selectedImage ? (
        <View>
          <Image source={{ uri: selectedImage }} style={styles.preview} resizeMode="cover" />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { borderColor: themeColors.neutral.border }]} onPress={pick}>
              <Text style={{ color: themeColors.primary.main, fontFamily: FontFamily.medium }}>Change</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { borderColor: themeColors.neutral.border }]}
              onPress={() => onSelectImage(null)}
            >
              <X size={18} color={themeColors.neutral.text} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.placeholder, { borderColor: themeColors.neutral.border, backgroundColor: themeColors.neutral.card }]}
          onPress={pick}
        >
          <ImageIcon size={28} color={themeColors.neutral.textSecondary} />
          <Text style={[styles.placeholderText, { color: themeColors.neutral.textSecondary }]}>
            Tap to choose image
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.lg },
  label: { fontFamily: FontFamily.semibold, fontSize: FontSizes.sm, marginBottom: Spacing.sm },
  preview: { width: '100%', height: 160, borderRadius: BorderRadius.md },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  btn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    height: 140,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  placeholderText: { fontFamily: FontFamily.regular, fontSize: FontSizes.sm },
});
