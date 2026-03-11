import { memo, type ReactNode } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView as ExpoBlurView } from 'expo-blur';

export interface BlurViewProps {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default' | 'systemChromeMaterialDark' | 'systemChromeMaterialLight';
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function BlurViewComponent({ intensity = 100, tint, style, children }: BlurViewProps) {
  if (Platform.OS === 'android') {
    const resolvedStyle = Array.isArray(style) ? StyleSheet.flatten(style) : style;
    return <View style={[resolvedStyle, { backgroundColor: '#000' }]}>{children}</View>;
  }

  return (
    <ExpoBlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </ExpoBlurView>
  );
}

export const BlurView = memo(BlurViewComponent);
