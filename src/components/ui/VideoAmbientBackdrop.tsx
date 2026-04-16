import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  RadialGradient as SkiaRadialGradient,
  Rect,
  vec,
  useCanvasSize,
} from '@shopify/react-native-skia';
import { Colors } from '../../theme';
import { darkenColor, hexToRGBA } from '../../utils/formatting/colors';
import { LinearGradient } from './LinearGradient';

interface VideoAmbientBackdropProps {
  seedUrl: string | null;
  onVideoAmbientBackdropReady?: () => void;
  showScrim?: boolean;
}

const VIDEO_AMBIENT_BACKDROP_RAW_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [Colors.purple[900], Colors.neutral[925]],
  [Colors.blue[900], Colors.purple[900]],
  [Colors.teal[900], Colors.neutral[925]],
  [Colors.pink[900], Colors.purple[900]],
  [Colors.coral[900], Colors.purple[900]],
  [Colors.neutral[800], Colors.neutral[975]],
  [Colors.amber[900], Colors.purple[900]],
  [Colors.orange[900], Colors.purple[900]],
  [Colors.cyan[900], Colors.blue[900]],
  [Colors.cyan[900], Colors.neutral[925]],
  [Colors.amber[900], Colors.neutral[925]],
  [Colors.blue[900], Colors.teal[900]],
  [Colors.purple[900], Colors.teal[900]],
  [Colors.pink[900], Colors.coral[900]],
  [Colors.orange[900], Colors.neutral[975]],
  [Colors.coral[900], Colors.neutral[925]],
  [Colors.teal[900], Colors.purple[900]],
  [Colors.amber[900], Colors.orange[900]],
];

const VIDEO_AMBIENT_BACKDROP_DIM_PRIMARY = 0.38;
const VIDEO_AMBIENT_BACKDROP_DIM_SECONDARY = 0.45;

const VIDEO_AMBIENT_BACKDROP_GRADIENT_PAIRS: ReadonlyArray<readonly [string, string]> =
  VIDEO_AMBIENT_BACKDROP_RAW_PAIRS.map(
    ([bg, accent]) =>
      [
        darkenColor(bg, VIDEO_AMBIENT_BACKDROP_DIM_PRIMARY),
        darkenColor(accent, VIDEO_AMBIENT_BACKDROP_DIM_SECONDARY),
      ] as const
  );

const ANGLES = [155, 170, 185, 200, 215, 230] as const;
const HIGHLIGHT_X_PCT = [14, 28, 42, 58, 72, 86] as const;
const HIGHLIGHT_Y_PCT = [12, 20, 28, 36] as const;
const HIGHLIGHT_OPACITY = [0.05, 0.07, 0.09, 0.11] as const;
const SCRIM_OPACITY = [0.52, 0.56, 0.6, 0.64] as const;

function hashVideoAmbientBackdropSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function cssLinearGradientNormalizedEndpoints(angleDeg: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = -Math.cos(rad);
  if (Math.abs(ux) < 1e-9 && Math.abs(uy) < 1e-9) {
    return { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } };
  }
  const halfLen = Math.min(
    Math.abs(ux) < 1e-9 ? Infinity : 0.5 / Math.abs(ux),
    Math.abs(uy) < 1e-9 ? Infinity : 0.5 / Math.abs(uy)
  );
  return {
    start: { x: 0.5 - ux * halfLen, y: 0.5 - uy * halfLen },
    end: { x: 0.5 + ux * halfLen, y: 0.5 + uy * halfLen },
  };
}

type VideoAmbientBackdropComputed = {
  colors: readonly [string, string];
  linearGradientStart: { x: number; y: number };
  linearGradientEnd: { x: number; y: number };
  highlightCenterX: number;
  highlightCenterY: number;
  highlightRadius: number;
  highlightInnerColor: string;
  highlightOuterColor: string;
  scrimOpacity: number;
};

function getVideoAmbientBackdropComputed(seed: string): VideoAmbientBackdropComputed {
  const colorIndex =
    hashVideoAmbientBackdropSeed(seed) % VIDEO_AMBIENT_BACKDROP_GRADIENT_PAIRS.length;
  const colors = VIDEO_AMBIENT_BACKDROP_GRADIENT_PAIRS[colorIndex];
  const angleDeg = ANGLES[hashVideoAmbientBackdropSeed(`${seed}:angle`) % ANGLES.length];
  const hxPct =
    HIGHLIGHT_X_PCT[hashVideoAmbientBackdropSeed(`${seed}:hx`) % HIGHLIGHT_X_PCT.length];
  const hyPct =
    HIGHLIGHT_Y_PCT[hashVideoAmbientBackdropSeed(`${seed}:hy`) % HIGHLIGHT_Y_PCT.length];
  const highlightOpacity =
    HIGHLIGHT_OPACITY[hashVideoAmbientBackdropSeed(`${seed}:ho`) % HIGHLIGHT_OPACITY.length];
  const scrimOpacity =
    SCRIM_OPACITY[hashVideoAmbientBackdropSeed(`${seed}:so`) % SCRIM_OPACITY.length];
  const { start: linearGradientStart, end: linearGradientEnd } =
    cssLinearGradientNormalizedEndpoints(angleDeg);

  return {
    colors,
    linearGradientStart,
    linearGradientEnd,
    highlightCenterX: hxPct / 100,
    highlightCenterY: hyPct / 100,
    highlightRadius: 0.72,
    highlightInnerColor: hexToRGBA(Colors.neutral[0], highlightOpacity),
    highlightOuterColor: hexToRGBA(Colors.neutral[0], 0),
    scrimOpacity,
  };
}

const VideoAmbientBackdropRadialHighlight = memo(function VideoAmbientBackdropRadialHighlight({
  centerXN,
  centerYN,
  radiusFactor,
  innerColor,
  outerColor,
}: {
  centerXN: number;
  centerYN: number;
  radiusFactor: number;
  innerColor: string;
  outerColor: string;
}) {
  const { ref, size } = useCanvasSize();
  const w = size.width;
  const h = size.height;
  const cx = centerXN * w;
  const cy = centerYN * h;
  const r = Math.max(w, h) * radiusFactor;

  return (
    <Canvas ref={ref} style={StyleSheet.absoluteFill} pointerEvents="none">
      {w > 0 && h > 0 && (
        <Rect x={0} y={0} width={w} height={h} dither>
          <SkiaRadialGradient
            c={vec(cx, cy)}
            r={r}
            colors={[innerColor, outerColor]}
            positions={[0, 0.6]}
            flags={1}
          />
        </Rect>
      )}
    </Canvas>
  );
});

const VideoAmbientBackdrop = memo(function VideoAmbientBackdrop({
  seedUrl,
  onVideoAmbientBackdropReady,
  showScrim = true,
}: VideoAmbientBackdropProps) {
  const notifiedUrlRef = useRef<string | null>(null);
  const colorSeed = seedUrl ?? 'fallback';
  const backdrop = useMemo(() => getVideoAmbientBackdropComputed(colorSeed), [colorSeed]);

  useEffect(() => {
    if (notifiedUrlRef.current === colorSeed) return;
    notifiedUrlRef.current = colorSeed;
    onVideoAmbientBackdropReady?.();
  }, [colorSeed, onVideoAmbientBackdropReady]);

  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={[backdrop.colors[0], backdrop.colors[1]]}
        start={backdrop.linearGradientStart}
        end={backdrop.linearGradientEnd}
        style={styles.gradient}
      />

      <VideoAmbientBackdropRadialHighlight
        centerXN={backdrop.highlightCenterX}
        centerYN={backdrop.highlightCenterY}
        radiusFactor={backdrop.highlightRadius}
        innerColor={backdrop.highlightInnerColor}
        outerColor={backdrop.highlightOuterColor}
      />

      {showScrim && (
        <View style={[styles.scrim, { opacity: backdrop.scrimOpacity }]} pointerEvents="none" />
      )}
    </View>
  );
});

export default VideoAmbientBackdrop;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
  },
});
