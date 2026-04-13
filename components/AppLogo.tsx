import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface AppLogoProps {
  size?: number;
  style?: any;
}

export default function AppLogo({ size = 40, style }: AppLogoProps) {
  return (
    <Image
      source={require('../assets/images/icon.png')}
      style={[
        {
          width: size,
          height: size,
        },
        style
      ]}
      resizeMode="contain"
    />
  );
}
