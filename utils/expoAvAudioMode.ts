import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS,
  type AVPlaybackStatus,
} from 'expo-av';

/** Single source of truth for feed / inline video playback (iOS needs explicit session + unmute handling). */
export const PLAYBACK_AUDIO_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
};

export async function configurePlaybackAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync(PLAYBACK_AUDIO_MODE);
}

type AVPlaybackObject = {
  getStatusAsync: () => Promise<AVPlaybackStatus>;
  setStatusAsync: (status: Record<string, unknown>) => Promise<AVPlaybackStatus>;
  setPositionAsync: (positionMillis: number) => Promise<AVPlaybackStatus>;
  playAsync: () => Promise<AVPlaybackStatus>;
};

/**
 * iOS (expo-av): `isMuted: false` alone often does not restart the audio pipeline while the video is already playing.
 * Nudge position and call `playAsync()` so audio starts without requiring a scroll/swap.
 */
export async function reactivateVideoAudioAfterUnmute(
  video: AVPlaybackObject | null | undefined
): Promise<void> {
  if (!video) return;
  try {
    const status = await video.getStatusAsync();
    if (!status.isLoaded) return;
    await video.setStatusAsync({ isMuted: false, volume: 1, shouldPlay: true });
    await video.setPositionAsync(status.positionMillis ?? 0);
    await video.playAsync();
  } catch {
    // best-effort
  }
}
