import { memo, type ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { BlurView as ExpoBlurView } from 'expo-blur';

export interface BlurViewProps {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default' | 'systemChromeMaterialDark' | 'systemChromeMaterialLight';
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function BlurViewComponent({ intensity = 100, tint, style, children }: BlurViewProps) {
  return (
    <ExpoBlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </ExpoBlurView>
  );
}

export const BlurView = memo(BlurViewComponent);
