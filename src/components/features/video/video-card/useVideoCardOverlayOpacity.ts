import { useDerivedValue, interpolate, type SharedValue } from 'react-native-reanimated';

export function useVideoCardOverlayOpacity({
  seekingAnimationSV,
  scrollOffsetYSV,
  headerH,
  viewportH: _viewportH,
  itemSp,
  idx,
  cardHeight: _cardHeight,
}: {
  seekingAnimationSV: SharedValue<number>;
  scrollOffsetYSV?: SharedValue<number>;
  headerH: number;
  viewportH: number;
  itemSp: number;
  idx: number;
  cardHeight: number;
}): SharedValue<number> {
  // Keep a delayed fade start, then smoothstep to zero over a slightly extended
  // range so fast flings do not hard-drop opacity in a single frame.
  const scrollOpacitySV = useDerivedValue((): number => {
    if (!scrollOffsetYSV) return 1;
    const offset = scrollOffsetYSV.value - (headerH + idx * itemSp);
    const abs = offset < 0 ? -offset : offset;
    const fadeStart = itemSp * 0.08;
    const fadeEnd = itemSp * 1.15;
    const fadeRange = fadeEnd - fadeStart;
    if (fadeRange <= 0) return 1;
    // Smoothstep(0..1): t*t*(3-2*t)
    const t = Math.max(0, Math.min(1, (abs - fadeStart) / fadeRange));
    return 1 - t * t * (3 - 2 * t);
  });

  const seekingFactorSV = useDerivedValue(() =>
    interpolate(seekingAnimationSV.value, [0, 0.2, 1], [1, 0, 0], 'clamp')
  );

  return useDerivedValue(() => scrollOpacitySV.value * seekingFactorSV.value);
}
