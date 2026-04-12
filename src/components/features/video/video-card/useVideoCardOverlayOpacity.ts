/**
 * Scroll × scrubbing overlay opacity per row.
 *
 * Single-worklet approach for lower overhead:
 * visibility curve from legacy VideoCard logic for earlier fade-out timing.
 */
import { useDerivedValue, interpolate, type SharedValue } from 'react-native-reanimated';

/** Start fading earlier so overlay doesn't stay opaque until the card nears the top edge. */
const FULL_OPACITY_UNTIL_VISIBLE = 0.72;
const FADE_CURVE_EXPONENT = 1.35;

/** Skip overlap math for cards far outside the viewport. */
const FAR_AWAY_FACTOR = 1.5;

export function useVideoCardOverlayOpacity({
  seekingAnimationSV,
  scrollOffsetYSV,
  headerH,
  viewportH,
  itemSp,
  idx,
  cardHeight,
}: {
  seekingAnimationSV: SharedValue<number>;
  scrollOffsetYSV?: SharedValue<number>;
  headerH: number;
  viewportH: number;
  itemSp: number;
  idx: number;
  cardHeight: number;
}): SharedValue<number> {
  const targetOpacity = useDerivedValue(() => {
    'worklet';
    const scrubbing = interpolate(seekingAnimationSV.value, [0, 0.2, 1], [1, 0, 0], 'clamp');

    let p: number;
    if (!scrollOffsetYSV) {
      p = 1;
    } else {
      const scrollY = scrollOffsetYSV.value;
      const itemTop = headerH + idx * itemSp;

      // Early-out: skip overlap math for cards far outside viewport
      const dist = Math.abs(itemTop - scrollY);
      if (dist > viewportH * FAR_AWAY_FACTOR + cardHeight) {
        return 0;
      }

      const itemBottom = itemTop + cardHeight;
      const viewportBottom = scrollY + viewportH;
      const overlap = Math.max(
        0,
        Math.min(itemBottom, viewportBottom) - Math.max(itemTop, scrollY)
      );
      const visDenom =
        viewportH > 0 && cardHeight > 0 ? Math.min(cardHeight, viewportH) : cardHeight;
      const raw = visDenom > 0 ? Math.min(1, Math.max(0, overlap / visDenom)) : 1;

      if (raw >= FULL_OPACITY_UNTIL_VISIBLE) {
        p = 1;
      } else {
        p = Math.pow(raw / FULL_OPACITY_UNTIL_VISIBLE, FADE_CURVE_EXPONENT);
      }
    }
    return p * scrubbing;
  });

  return targetOpacity;
}
