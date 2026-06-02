import { useDerivedValue, interpolate, type SharedValue } from 'react-native-reanimated';
import { useFeedScrollLayout, useFeedScrollMotion } from '../../../../context/FeedScrollContext';

export function useVideoCardOverlayOpacity({
  seekingAnimationSV,
  idx,
}: {
  seekingAnimationSV: SharedValue<number>;
  idx: number;
}): SharedValue<number> {
  const motion = useFeedScrollMotion();
  const layout = useFeedScrollLayout();

  return useDerivedValue(() => {
    const seeking = interpolate(seekingAnimationSV.value, [0, 0.2, 1], [1, 0, 0], 'clamp');
    if (!motion || !layout) return seeking;

    const { scrollOffsetYSV } = motion;
    const { headerHeight, itemSpacing } = layout;
    const cardTop = headerHeight + idx * itemSpacing;
    const distanceFromCenter = scrollOffsetYSV.value - cardTop;
    const fadeZone = itemSpacing * 0.25;
    const visibility = interpolate(
      distanceFromCenter,
      [-itemSpacing + fadeZone, -fadeZone, fadeZone, itemSpacing - fadeZone],
      [0, 1, 1, 0],
      'clamp'
    );

    return visibility * seeking;
  });
}
