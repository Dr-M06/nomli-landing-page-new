/**
 * Pick a photo or video from the device library for a story.
 * Does not open the camera — library only. Use this for "Choose from Library" in Create Story.
 */
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { STORY_VIDEO_MAX_SECONDS } from './storyUtils';
import { log, error } from './productionLogger';

export type PickedStoryMedia = { uri: string; type: 'photo' | 'video' };

export async function pickStoryMediaFromLibrary(): Promise<PickedStoryMedia | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to choose a story.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 1.0,
      videoMaxDuration: STORY_VIDEO_MAX_SECONDS,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    const asset = result.assets[0];
    const type: 'photo' | 'video' = asset.type === 'video' ? 'video' : 'photo';
    log('[StoryLibraryPicker] Picked from library:', type, asset.uri);
    return { uri: asset.uri, type };
  } catch (err) {
    error('[StoryLibraryPicker] Error:', err);
    Alert.alert('Error', 'Failed to pick media. Please try again.');
    return null;
  }
}
