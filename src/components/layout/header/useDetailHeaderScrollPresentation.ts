import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { Colors } from '@/theme';

/**
 * Scroll-linked opacity for ProfileHeader / ChannelHeader when they render {@link UniversalHeader}:
 * - body content fade vs scroll
 * - full-bleed dim overlay vs scroll
 *
 * Keep curves in sync here only; UniversalHeader consumes the returned styles.
 */
export interface UseDetailHeaderScrollPresentationParams {
  contentScrollProgress?: SharedValue<number>;
  contentScrollFadeDisabled?: boolean;
  scrollLinkedDimDisabled?: boolean;
}

export function useDetailHeaderScrollPresentation({
  contentScrollProgress,
  contentScrollFadeDisabled = false,
  scrollLinkedDimDisabled = false,
}: UseDetailHeaderScrollPresentationParams) {
  const contentAnimatedStyle = useAnimatedStyle(() => {
    if (contentScrollFadeDisabled) {
      return { opacity: 1 };
    }
    const progress = contentScrollProgress?.value ?? 0;
    const opacity = interpolate(progress, [0, 0.6, 1], [1, 1, 0.02], Extrapolate.CLAMP);
    return { opacity };
  }, [contentScrollProgress, contentScrollFadeDisabled]);

  const scrollDimAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    if (scrollLinkedDimDisabled) {
      return {
        ...StyleSheet.absoluteFill,
        opacity: 0,
        pointerEvents: 'none',
      };
    }
    const progress = contentScrollProgress != null ? contentScrollProgress.value : 0;
    return {
      ...StyleSheet.absoluteFill,
      backgroundColor: Colors.black,
      opacity: interpolate(progress, [0, 0.5, 1], [0, 0, 0.3], Extrapolate.CLAMP),
      pointerEvents: 'none',
    };
  }, [contentScrollProgress, scrollLinkedDimDisabled]);

  return { contentAnimatedStyle, scrollDimAnimatedStyle };
}
