/**
 * Scroll × scrubbing overlay opacity per row.
 *
 * Worklet-based calculation without useDerivedValue.
 * Opacity is computed on-demand by reading pre-calculated scroll state.
 * Replaced per-frame recalculation with event-driven update from scroll handler.
 */
import {
  useAnimatedReaction,
  useSharedValue,
  interpolate,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

/** Start fading earlier so overlay doesn't stay opaque until the card nears the top edge. */
const FULL_OPACITY_UNTIL_VISIBLE = 0.72;
const FADE_CURVE_EXPONENT = 1.35;

/** Skip overlap math for cards far outside the viewport. */
const FAR_AWAY_FACTOR = 1.5;

/** Smooth opacity transitions to prevent jitter during fast scrolling. */
const OPACITY_TIMING_CONFIG = {
  duration: 100,
  easing: Easing.out(Easing.ease),
};

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
  // Direct shared value, updated only when scroll or seeking animation changes (not per-frame).
  // This replaces useDerivedValue for lower overhead.
  const targetOpacity = useSharedValue(1);

  // Calculate opacity when scroll offset or seeking animation changes.
  // useAnimatedReaction replaces useDerivedValue for more explicit, event-driven updates.
  useAnimatedReaction(
    () => [scrollOffsetYSV?.value ?? 0, seekingAnimationSV.value] as const,
    ([scrollY, seeking]) => {
      const scrubbing = interpolate(seeking, [0, 0.2, 1], [1, 0, 0], 'clamp');

      if (!scrollOffsetYSV) {
        targetOpacity.value = withTiming(1, OPACITY_TIMING_CONFIG);
        return;
      }

      const itemTop = headerH + idx * itemSp;
      const itemBottom = itemTop + cardHeight;

      // Early-out: skip overlap math for cards far outside viewport
      const dist = Math.abs(itemTop - scrollY);
      if (dist > viewportH * FAR_AWAY_FACTOR + cardHeight) {
        targetOpacity.value = withTiming(0, OPACITY_TIMING_CONFIG);
        return;
      }

      const viewportBottom = scrollY + viewportH;
      const overlap = Math.max(
        0,
        Math.min(itemBottom, viewportBottom) - Math.max(itemTop, scrollY)
      );
      const visDenom =
        viewportH > 0 && cardHeight > 0 ? Math.min(cardHeight, viewportH) : cardHeight;
      const raw = visDenom > 0 ? Math.min(1, Math.max(0, overlap / visDenom)) : 1;

      let p: number;
      if (raw >= FULL_OPACITY_UNTIL_VISIBLE) {
        p = 1;
      } else {
        p = Math.pow(raw / FULL_OPACITY_UNTIL_VISIBLE, FADE_CURVE_EXPONENT);
      }

      targetOpacity.value = withTiming(p * scrubbing, OPACITY_TIMING_CONFIG);
    },
    [scrollOffsetYSV, seekingAnimationSV, headerH, viewportH, itemSp, idx, cardHeight]
  );

  return targetOpacity;
}
