import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors } from '../../theme';
import { darkenColor } from '../../utils/formatting/colors';
import { LinearGradient } from './LinearGradient';

interface BlurredBackgroundProps {
  thumbnailUrl: string | null;
  onBlurReady?: () => void;
  /** When false, no dark overlay on top of the blur (e.g. for video post preview) */
  darkOverlay?: boolean;
}

const RAW_AMBIENT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [Colors.purple[900], Colors.neutral[925]],
  [Colors.blue[900], Colors.purple[900]],
  [Colors.teal[900], Colors.neutral[925]],
  [Colors.pink[900], Colors.purple[900]],
  [Colors.coral[900], Colors.purple[900]],
  [Colors.neutral[800], Colors.neutral[975]],
];

const DIM_STOP_PRIMARY = 0.38;
const DIM_STOP_SECONDARY = 0.45;

const AMBIENT_GRADIENT_PAIRS: ReadonlyArray<readonly [string, string]> = RAW_AMBIENT_PAIRS.map(
  ([bg, accent]) =>
    [darkenColor(bg, DIM_STOP_PRIMARY), darkenColor(accent, DIM_STOP_SECONDARY)] as const
);

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAmbientColors(seed: string | null): { backgroundColor: string; accentColor: string } {
  if (!seed) {
    const [backgroundColor, accentColor] = AMBIENT_GRADIENT_PAIRS[0];
    return { backgroundColor, accentColor };
  }
  const index = hashSeed(seed) % AMBIENT_GRADIENT_PAIRS.length;
  const [backgroundColor, accentColor] = AMBIENT_GRADIENT_PAIRS[index];
  return { backgroundColor, accentColor };
}

const BlurredBackground = memo(function BlurredBackground({
  thumbnailUrl,
  onBlurReady,
  darkOverlay = true,
}: BlurredBackgroundProps) {
  const notifiedUrlRef = useRef<string | null>(null);
  const colorSeed = thumbnailUrl ?? 'fallback';
  const colors = useMemo(() => getAmbientColors(colorSeed), [colorSeed]);

  useEffect(() => {
    if (notifiedUrlRef.current === colorSeed) return;
    notifiedUrlRef.current = colorSeed;
    onBlurReady?.();
  }, [colorSeed, onBlurReady]);

  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={[colors.backgroundColor, colors.accentColor]}
        style={styles.gradient}
      />

      {darkOverlay && <View style={styles.darkOverlay} />}
    </View>
  );
});

export default BlurredBackground;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
    opacity: 0.58,
  },
});
