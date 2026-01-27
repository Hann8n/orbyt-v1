import { memo } from 'react';
import { StyleSheet, type ViewStyle, Platform } from 'react-native';
import { BlurView as ExpoBlurView } from 'expo-blur';
import * as Device from 'expo-device';

export interface BlurViewProps {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default' | 'systemChromeMaterialDark' | 'systemChromeMaterialLight';
  style?: ViewStyle | ViewStyle[];
}

function BlurViewComponent({ intensity = 100, tint, style }: BlurViewProps) {
  const experimentalBlurMethod =
    Platform.OS === 'android'
      ? Device.isDevice
        ? ('dimezisBlurView' as const)
        : ('none' as const)
      : undefined;

  const resolvedStyle = Array.isArray(style) ? StyleSheet.flatten(style) : style;
  const finalStyle =
    Platform.OS === 'android' && experimentalBlurMethod === 'none'
      ? [resolvedStyle, { backgroundColor: '#000' }]
      : resolvedStyle;

  return (
    <ExpoBlurView
      intensity={intensity}
      tint={tint}
      style={finalStyle}
      {...(experimentalBlurMethod ? { experimentalBlurMethod } : undefined)}
    />
  );
}

export const BlurView = memo(BlurViewComponent);
