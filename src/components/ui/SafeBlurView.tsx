import { memo } from 'react';
import { Platform, type ViewProps } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import * as Device from 'expo-device';

/**
 * SafeBlurView
 *
 * Why: On Android, BlurView is experimental and `experimentalBlurMethod="dimezisBlurView"`
 * can crash in emulator / software-rendering scenarios when hardware bitmaps are involved
 * (e.g. "Software rendering doesn't support hardware bitmaps").
 *
 * Strategy: keep Dimezis blur on real Android devices, but use the built-in `'none'` fallback
 * everywhere else (including Android emulators). This is the most targeted JS-only guard.
 *
 * Reference: https://docs.expo.dev/versions/latest/sdk/blur-view/
 */
export type SafeBlurViewProps = Omit<BlurViewProps, 'experimentalBlurMethod'> & {
  style?: ViewProps['style'];
};

function SafeBlurViewComponent(props: SafeBlurViewProps) {
  const experimentalBlurMethod =
    Platform.OS === 'android'
      ? Device.isDevice
        ? ('dimezisBlurView' as const)
        : ('none' as const)
      : undefined;

  // When blur is unavailable (Android `'none'` fallback), use a deterministic solid black
  // background instead of the default semi-transparent fallback.
  const style =
    Platform.OS === 'android' && experimentalBlurMethod === 'none'
      ? [props.style, { backgroundColor: '#000' }]
      : props.style;

  return (
    <BlurView
      {...props}
      style={style}
      {...(experimentalBlurMethod ? { experimentalBlurMethod } : undefined)}
    />
  );
}

export const SafeBlurView = memo(SafeBlurViewComponent);
