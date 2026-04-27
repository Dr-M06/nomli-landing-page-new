import { ViewStyle } from 'react-native';

export type VideoContainerVariant = 'tiktok';

/**
 * Base styles for video container (TikTok-style full-width, centered).
 * Height/width are applied by the caller.
 */
export function getVideoContainerStyles(variant: VideoContainerVariant): ViewStyle {
  if (variant === 'tiktok') {
    return {
      backgroundColor: '#000',
      position: 'relative' as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      overflow: 'hidden' as const,
    };
  }
  return {};
}
