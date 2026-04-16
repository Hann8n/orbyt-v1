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
import { hexToRGBA } from '../../utils/formatting/colors';
import { LinearGradient } from './LinearGradient';

interface VideoAmbientBackdropProps {
  seedUrl: string | null;
  onVideoAmbientBackdropReady?: () => void;
  showScrim?: boolean;
}

const GOLDEN_ANGLE = 137.50776;

function normalizeHue(value: number): number {
  const hue = value % 360;
  return hue < 0 ? hue + 360 : hue;
}

function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;
  const linR = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const linG = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const linB = -0.0041960863 * lc - 0.7034186147 * mc + 1.697613517 * sc;

  const gamma = (x: number) => {
    const v = Math.max(0, Math.min(1, x));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };
  const toHex = (x: number) =>
    Math.round(gamma(x) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(linR)}${toHex(linG)}${toHex(linB)}`;
}

function getVideoAmbientBackdropGradientColors(seed: string): readonly [string, string] {
  const baseHue = normalizeHue((hashVideoAmbientBackdropSeed(`${seed}:h`) * GOLDEN_ANGLE) % 360);
  const secondHueOffset = 150 + (hashVideoAmbientBackdropSeed(`${seed}:h2`) % 61);
  const secondHue = normalizeHue(baseHue + secondHueOffset);

  const lightPrimary = 0.16 + (hashVideoAmbientBackdropSeed(`${seed}:l1`) % 6) * 0.01;
  const lightSecondary = 0.1 + (hashVideoAmbientBackdropSeed(`${seed}:l2`) % 5) * 0.01;
  const chromaPrimary = 0.04 + (hashVideoAmbientBackdropSeed(`${seed}:c1`) % 4) * 0.01;
  const chromaSecondary = 0.02 + (hashVideoAmbientBackdropSeed(`${seed}:c2`) % 3) * 0.01;

  return [
    oklchToHex(lightPrimary, chromaPrimary, baseHue),
    oklchToHex(lightSecondary, chromaSecondary, secondHue),
  ];
}

const ANGLES = [155, 170, 185, 200, 215, 230] as const;
const HIGHLIGHT_X_PCT = [14, 28, 42, 58, 72, 86] as const;
const HIGHLIGHT_Y_PCT = [12, 20, 28, 36] as const;
const HIGHLIGHT_OPACITY = [0.07, 0.09, 0.11, 0.13] as const;
const SCRIM_OPACITY = [0.42, 0.46, 0.5, 0.54] as const;

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
  const colors = getVideoAmbientBackdropGradientColors(seed);
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
