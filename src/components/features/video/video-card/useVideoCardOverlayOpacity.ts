import { useDerivedValue, interpolate, type SharedValue } from 'react-native-reanimated';
import { useFeedScrollLayout, useFeedScrollMotion } from '../../../../context/FeedScrollContext';

const OVERLAY_FADE_ZONE_PX = 80;

export function useVideoCardOverlayOpacity({
  idx,
}: {
  idx: number;
}): SharedValue<number> {
  const motion = useFeedScrollMotion();
  const layout = useFeedScrollLayout();

  return useDerivedValue(() => {
    if (!motion || !layout) return 1;

    const { scrollOffsetYSV } = motion;
    const { headerHeight, itemSpacing, snapTopInset } = layout;

    const scrollY = scrollOffsetYSV.value;

    // Layout not yet measured — headerHeight is 0 before the first onLayout fires.
    // In this state scrollY is also 0 and the list is at its initial rest position,
    // so treat the active card as fully visible rather than fading based on stale values.
    if (headerHeight === 0 && scrollY === 0 && idx === 0) return 1;

    const snapOffset =
      (headerHeight > 0 ? headerHeight : 0) + idx * itemSpacing - snapTopInset;

    const distanceFromSnap = Math.abs(scrollY - snapOffset);

    return interpolate(distanceFromSnap, [0, OVERLAY_FADE_ZONE_PX], [1, 0], 'clamp');
  });
}
