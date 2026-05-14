import { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

const END_OF_FEED_OVERSCROLL_FULL_OPACITY_PX = 56;

export interface UseFeedScrollHandlerResult {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  scrollOffsetYSV: SharedValue<number>;
  contentScrollProgressSV: SharedValue<number>;
  endOfFeedEnabledSV: SharedValue<number>;
  endOfFeedOverscrollOpacitySV: SharedValue<number>;
}

export function useFeedScrollHandler({
  fadeDist,
  contentScrollProgressOutput,
}: {
  fadeDist: number;
  contentScrollProgressOutput?: SharedValue<number>;
}): UseFeedScrollHandlerResult {
  const scrollOffsetYSV = useSharedValue(0);
  const contentScrollProgressSV = useSharedValue(0);
  const endOfFeedEnabledSV = useSharedValue(0);
  const endOfFeedOverscrollOpacitySV = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: event => {
        'worklet';

        const y = Math.max(0, event.contentOffset.y);
        scrollOffsetYSV.value = y;

        const progress = fadeDist > 0 ? Math.max(0, Math.min(1, y / fadeDist)) : 0;
        contentScrollProgressSV.value = progress;
        if (contentScrollProgressOutput) {
          contentScrollProgressOutput.value = progress;
        }

        const contentH = event.contentSize?.height ?? 0;
        const layoutH = event.layoutMeasurement?.height ?? 0;
        const maxY = Math.max(0, contentH - layoutH);
        const overscrollPastEnd = y - maxY;
        if (endOfFeedEnabledSV.value < 0.5) {
          endOfFeedOverscrollOpacitySV.value = 0;
        } else {
          endOfFeedOverscrollOpacitySV.value = Math.max(
            0,
            Math.min(1, overscrollPastEnd / END_OF_FEED_OVERSCROLL_FULL_OPACITY_PX)
          );
        }
      },
    },
    [contentScrollProgressOutput, fadeDist]
  );

  return {
    scrollHandler,
    scrollOffsetYSV,
    contentScrollProgressSV,
    endOfFeedEnabledSV,
    endOfFeedOverscrollOpacitySV,
  };
}
