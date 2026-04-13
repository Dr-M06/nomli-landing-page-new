import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, getThemeColors } from '../constants/Colors';
import { useTheme } from '../contexts/ThemeContext';

interface DoodleProps {
  size: number;
  x: string;
  y: string;
  opacity?: number;
  color?: string;
}

// Chat bubble doodle
const ChatBubbleDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// Airplane doodle
const AirplaneDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// N for Nomli doodle
const NomliDoodle: React.FC<DoodleProps> = React.memo(({ size, x, y, opacity = 0.7, color }) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const nomliColor = color || themeColors.primary.main;
  
  return (
    <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M7 7h2v10H7V7zm8 0h2v10h-2V7zm-4 0h2l-2 10H9L7 7h2z"
          fill={nomliColor}
          fillOpacity={opacity}
        />
      </Svg>
    </View>
  );
});

// Happy emoji doodle
const HappyEmojiDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// Camera doodle
const CameraDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// Sun doodle
const SunDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// Check marks doodle
const CheckMarksDoodle: React.FC<DoodleProps> = React.memo(({ size, x, y, opacity = 0.7, color }) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const checkColor = color || themeColors.success.main;
  
  return (
    <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41z"
          fill={checkColor}
          fillOpacity={opacity}
        />
      </Svg>
    </View>
  );
});

// Heart doodle
const HeartDoodle: React.FC<DoodleProps> = React.memo(({ size, x, y, opacity = 0.6, color }) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const heartColor = color || themeColors.accent.main;
  
  return (
    <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={heartColor}
          fillOpacity={opacity}
        />
      </Svg>
    </View>
  );
});

// Map doodle
const MapDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// Globe doodle
const GlobeDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// Thumbs up doodle
const ThumbsUpDoodle: React.FC<DoodleProps> = ({ size, x, y, opacity = 0.6, color = '#ffffff' }) => (
  <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"
        fill={color}
        fillOpacity={opacity}
      />
    </Svg>
  </View>
);

// Star doodle
const StarDoodle: React.FC<DoodleProps> = React.memo(({ size, x, y, opacity = 0.5, color }) => {
  const { isDarkMode } = useTheme();
  const themeColors = getThemeColors(isDarkMode);
  const starColor = color || themeColors.warning.main;
  
  return (
    <View style={[styles.doodle, { left: x, top: y, width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          fill={starColor}
          fillOpacity={opacity}
        />
      </Svg>
    </View>
  );
});

interface ChatBackgroundPatternProps {
  children?: React.ReactNode;
  backgroundTheme?: 'auto' | 'day' | 'night';
  style?: any;
}

export const ChatBackgroundPattern: React.FC<ChatBackgroundPatternProps> = ({ 
  children, 
  backgroundTheme = 'auto',
  style 
}) => {
  // Use the theme context directly
  const { isDarkMode } = useTheme();
  
  // Determine the actual theme to use - memoized to be reactive
  const effectiveTheme = useMemo(() => {
    if (backgroundTheme === 'auto') {
      return isDarkMode ? 'night' : 'day';
    }
    return backgroundTheme;
  }, [backgroundTheme, isDarkMode]);
  
  const isThemeDark = effectiveTheme === 'night';
  const themeColors = getThemeColors(isThemeDark);
  
  // Use theme colors for background with enhanced day/night themes
  const getBackgroundStyle = useMemo(() => {
    switch (effectiveTheme) {
      case 'day':
        return {
          backgroundColor: '#f0f8ff', // Light blue day sky
          doodleOpacity: 0.15, // Subtle but visible
          doodleColor: '#4a90e2', // Bright blue
          accentColor: '#ffd700', // Golden sun
        };
      case 'night':
        return {
          backgroundColor: '#1a1a2e', // Deep night blue
          doodleOpacity: 0.18, // Slightly more visible in dark mode
          doodleColor: '#6c7ce0', // Soft purple
          accentColor: '#f39c12', // Warm moon
        };
      default: // auto - this shouldn't happen but just in case
        return {
          backgroundColor: isDarkMode ? themeColors.background : '#f8f9fa', // Lighter background for light theme
          doodleOpacity: isDarkMode ? 0.12 : 0.08, // Very subtle
          doodleColor: isDarkMode ? themeColors.textTertiary : themeColors.primary.main,
          accentColor: themeColors.primary.main,
        };
    }
  }, [effectiveTheme, isDarkMode, themeColors]);
  
  const backgroundStyle = getBackgroundStyle;

  return (
    <View 
      key={`theme-${effectiveTheme}-${isDarkMode}`} 
      style={[styles.container, { backgroundColor: backgroundStyle.backgroundColor }, style]}
    >
      {/* Background doodles - positioned absolutely */}
      <View style={styles.doodlesContainer}>
        <ChatBubbleDoodle size={40} x="15%" y="20%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <AirplaneDoodle size={36} x="85%" y="15%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <NomliDoodle size={50} x="50%" y="70%" opacity={backgroundStyle.doodleOpacity * 1.5} />
        <HappyEmojiDoodle size={35} x="25%" y="70%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <CameraDoodle size={38} x="75%" y="40%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <SunDoodle size={38} x="30%" y="45%" opacity={backgroundStyle.doodleOpacity} color={effectiveTheme === 'day' ? backgroundStyle.accentColor : backgroundStyle.doodleColor} />
        <CheckMarksDoodle size={32} x="65%" y="85%" opacity={backgroundStyle.doodleOpacity * 1.5} />
        <HeartDoodle size={32} x="10%" y="90%" opacity={backgroundStyle.doodleOpacity} />
        <MapDoodle size={34} x="40%" y="30%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <GlobeDoodle size={36} x="70%" y="50%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <ThumbsUpDoodle size={32} x="20%" y="35%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <StarDoodle size={30} x="55%" y="65%" opacity={backgroundStyle.doodleOpacity} color={effectiveTheme === 'night' ? backgroundStyle.accentColor : undefined} />
        <ChatBubbleDoodle size={32} x="80%" y="25%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        <AirplaneDoodle size={28} x="35%" y="10%" opacity={backgroundStyle.doodleOpacity} color={backgroundStyle.doodleColor} />
        
        {/* Theme-specific doodles */}
        {effectiveTheme === 'day' && (
          <>
            <SunDoodle size={42} x="90%" y="5%" opacity={backgroundStyle.doodleOpacity * 1.2} color={backgroundStyle.accentColor} />
            <SunDoodle size={24} x="5%" y="15%" opacity={backgroundStyle.doodleOpacity * 0.8} color={backgroundStyle.accentColor} />
          </>
        )}
        
        {effectiveTheme === 'night' && (
          <>
            <StarDoodle size={20} x="85%" y="8%" opacity={backgroundStyle.doodleOpacity * 1.5} color={backgroundStyle.accentColor} />
            <StarDoodle size={16} x="75%" y="12%" opacity={backgroundStyle.doodleOpacity * 1.2} color={backgroundStyle.accentColor} />
            <StarDoodle size={18} x="90%" y="20%" opacity={backgroundStyle.doodleOpacity * 1.3} color={backgroundStyle.accentColor} />
          </>
        )}
      </View>
      
      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  doodlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  doodle: {
    position: 'absolute',
    zIndex: 1,
  },
  content: {
    flex: 1,
    zIndex: 2,
    position: 'relative',
  },
});

export default ChatBackgroundPattern; 