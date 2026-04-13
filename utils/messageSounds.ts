import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { log, warn, error } from './productionLogger';


let messageSound: Audio.Sound | null = null;

export const playMessageSound = async () => {
  try {
    log('Attempting to play message sound on', Platform.OS);
    
    // Set audio mode for Android
    if (Platform.OS === 'android') {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      log('Android audio mode set successfully');
    }

    // Create sound if it doesn't exist
    if (!messageSound) {
      log('Creating new sound instance...');
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/notification.mp3'),
        { shouldPlay: false }
      );
      messageSound = sound;
      log('Sound instance created successfully');
    }

    // Ensure sound is loaded
    const status = await messageSound.getStatusAsync();
    if (!status.isLoaded) {
      log('Sound not loaded, loading...');
      await messageSound.loadAsync(require('../assets/sounds/notification.mp3'));
    }

    // Set volume for Android (sometimes needed)
    if (Platform.OS === 'android') {
      await messageSound.setVolumeAsync(1.0);
      log('Volume set to maximum for Android');
    }

    // Play the sound
    await messageSound.replayAsync();
    
    log('Message sound played successfully on', Platform.OS);
  } catch (error) {
    log('Error playing message sound:', error);
    
    // Try to recreate sound on error
    if (messageSound) {
      try {
        await messageSound.unloadAsync();
        messageSound = null;
        log('Sound unloaded due to error, will recreate on next attempt');
      } catch (unloadError) {
        log('Error unloading sound:', unloadError);
      }
    }
  }
};

export const stopMessageSound = async () => {
  try {
    if (messageSound) {
      await messageSound.stopAsync();
    }
  } catch (error) {
    log('Error stopping message sound:', error);
  }
};

export const unloadMessageSound = async () => {
  try {
    if (messageSound) {
      await messageSound.unloadAsync();
      messageSound = null;
    }
  } catch (error) {
    log('Error unloading message sound:', error);
  }
};
