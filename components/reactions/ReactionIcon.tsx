import React from 'react';
import { Text } from 'react-native';
import { Zap } from 'lucide-react-native';

export type UniversalReaction = 'like' | 'laugh' | null;

export function ReactionIcon({
  reaction,
  size = 22,
  activeColor = '#FACC15',
  inactiveColor = '#9CA3AF',
}: {
  reaction: UniversalReaction;
  size?: number;
  activeColor?: string;
  inactiveColor?: string;
}) {
  if (reaction === 'laugh') {
    return <Text style={{ fontSize: size }}>{'😂'}</Text>;
  }
  if (reaction === 'like') {
    return <Zap size={size} color={activeColor} fill={activeColor} strokeWidth={2} />;
  }
  return <Zap size={size} color={inactiveColor} fill="transparent" strokeWidth={2} />;
}

