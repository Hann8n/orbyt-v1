import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { Colors } from '@/theme';

export interface UseDetailHeaderScrollPresentationParams {
  contentScrollProgress?: SharedValue<number>;
  contentScrollFadeDisabled?: boolean;
  scrollLinkedDimDisabled?: boolean;
}

const absoluteFill = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export function useDetailHeaderScrollPresentation({
  contentScrollProgress,
  contentScrollFadeDisabled = false,
  scrollLinkedDimDisabled = false,
}: UseDetailHeaderScrollPresentationParams) {
  const contentAnimatedStyle = useAnimatedStyle(() => {
    if (contentScrollFadeDisabled) return { opacity: 1 };
    const opacity = interpolate(
      contentScrollProgress?.value ?? 0,
      [0, 0.6, 1],
      [1, 1, 0.02],
      'clamp',
    );
    return { opacity };
  });

  const scrollDimAnimatedStyle = useAnimatedStyle(() => {
    if (scrollLinkedDimDisabled) {
      return { ...absoluteFill, opacity: 0, pointerEvents: 'none' as const };
    }
    return {
      ...absoluteFill,
      backgroundColor: Colors.black,
      opacity: interpolate(
        contentScrollProgress?.value ?? 0,
        [0, 0.5, 1],
        [0, 0, 0.3],
        'clamp',
      ),
      pointerEvents: 'none' as const,
    };
  });

  return { contentAnimatedStyle, scrollDimAnimatedStyle };
}
