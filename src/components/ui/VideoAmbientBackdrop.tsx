import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Image,
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';
import {
  Canvas,
  RadialGradient as SkiaRadialGradient,
  Rect,
  vec,
  useCanvasSize,
} from '@shopify/react-native-skia';
import { Colors } from '../../theme';
import { hexToRGBA } from '../../utils/formatting/colors';

interface VideoAmbientBackdropProps {
  seedUrl: string | null;
  onVideoAmbientBackdropReady?: () => void;
  showScrim?: boolean;
  showGrain?: boolean;
}

const HASH_NORMALIZER = 10000;

const SCRIM_OPACITY = [0.5, 0.54, 0.58, 0.62] as const;
const GRAIN_TEXTURE_PRIMARY_DATA_URI =
  'data:image/png;base64,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';
const GRAIN_TEXTURE_SECONDARY_DATA_URI =
  'data:image/png;base64,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';
const GRAIN_TEXTURE_PRIMARY_SOURCE = { uri: GRAIN_TEXTURE_PRIMARY_DATA_URI } as const;
const GRAIN_TEXTURE_SECONDARY_SOURCE = { uri: GRAIN_TEXTURE_SECONDARY_DATA_URI } as const;
const RADIAL_GRADIENT_POSITIONS: number[] = [0, 0.6];
const GRAIN_PRIMARY_SCALE = 1.18;
const GRAIN_SECONDARY_SCALE = 1.3;

function hashVideoAmbientBackdropSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildSeedHasher(seed: string): (channel: string) => number {
  const cache = new Map<string, number>();
  return (channel: string) => {
    const cached = cache.get(channel);
    if (cached !== undefined) return cached;
    const hash = hashVideoAmbientBackdropSeed(`${seed}:${channel}`);
    cache.set(channel, hash);
    return hash;
  };
}

type GrainOpacityVariant = 0 | 1 | 2 | 3;
type ScrimVariant = 0 | 1 | 2 | 3;

function toGrainOpacityVariant(value: number): GrainOpacityVariant {
  return (value % 4) as GrainOpacityVariant;
}

function toScrimVariant(value: number): ScrimVariant {
  return (value % 4) as ScrimVariant;
}

type VideoAmbientBackdropComputed = {
  ambientCenterX: number;
  ambientCenterY: number;
  ambientRadius: number;
  ambientInnerColor: string;
  ambientOuterColor: string;
  highlightCenterX: number;
  highlightCenterY: number;
  highlightRadius: number;
  highlightInnerColor: string;
  highlightOuterColor: string;
  scrimVariant: ScrimVariant;
  grainPrimaryOpacityVariant: GrainOpacityVariant;
  grainSecondaryOpacityVariant: GrainOpacityVariant;
};

function getVideoAmbientBackdropComputed(seed: string): VideoAmbientBackdropComputed {
  const hashChannel = buildSeedHasher(seed);
  // Keep highlights in-frame but increase per-seed variance.
  const ambientCenterX = 0.04 + ((hashChannel('ax') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.92;
  const ambientCenterY = 0.06 + ((hashChannel('ay') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.7;
  const ambientRadius = 0.65 + ((hashChannel('ar') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.55;
  const ambientOpacity = 0.055 + ((hashChannel('ao') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.075;
  const highlightCenterX = 0.02 + ((hashChannel('hx') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.96;
  const highlightCenterY = 0.02 + ((hashChannel('hy') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.62;
  const highlightOpacity = 0.02 + ((hashChannel('ho') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.06;
  const highlightRadius = 0.45 + ((hashChannel('hr') % HASH_NORMALIZER) / HASH_NORMALIZER) * 0.5;
  const scrimVariant = toScrimVariant(hashChannel('so'));
  const grainPrimaryOpacityVariant = toGrainOpacityVariant(hashChannel('gpo'));
  const grainSecondaryOpacityVariant = toGrainOpacityVariant(hashChannel('gso'));
  const ambientColorVariants = [
    Colors.brand.purple,
    Colors.brand.teal,
    Colors.brand.coral,
  ] as const;
  const ambientColor = ambientColorVariants[hashChannel('ac') % ambientColorVariants.length];

  return {
    ambientCenterX,
    ambientCenterY,
    ambientRadius,
    ambientInnerColor: hexToRGBA(ambientColor, ambientOpacity),
    ambientOuterColor: hexToRGBA(ambientColor, 0),
    highlightCenterX,
    highlightCenterY,
    highlightRadius,
    highlightInnerColor: hexToRGBA(Colors.neutral[0], highlightOpacity),
    highlightOuterColor: hexToRGBA(Colors.neutral[0], 0),
    scrimVariant,
    grainPrimaryOpacityVariant,
    grainSecondaryOpacityVariant,
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
  const gradientColors = useMemo(() => [innerColor, outerColor], [innerColor, outerColor]);

  return (
    <Canvas ref={ref} style={StyleSheet.absoluteFill} pointerEvents="none">
      {w > 0 && h > 0 && (
        <Rect x={0} y={0} width={w} height={h} dither>
          <SkiaRadialGradient
            c={vec(cx, cy)}
            r={r}
            colors={gradientColors}
            positions={RADIAL_GRADIENT_POSITIONS}
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
  showGrain = true,
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
      <View style={styles.background} />

      <VideoAmbientBackdropRadialHighlight
        centerXN={backdrop.ambientCenterX}
        centerYN={backdrop.ambientCenterY}
        radiusFactor={backdrop.ambientRadius}
        innerColor={backdrop.ambientInnerColor}
        outerColor={backdrop.ambientOuterColor}
      />

      <VideoAmbientBackdropRadialHighlight
        centerXN={backdrop.highlightCenterX}
        centerYN={backdrop.highlightCenterY}
        radiusFactor={backdrop.highlightRadius}
        innerColor={backdrop.highlightInnerColor}
        outerColor={backdrop.highlightOuterColor}
      />

      {showScrim && <View style={scrimStyles[backdrop.scrimVariant]} pointerEvents="none" />}

      {showGrain && (
        <>
          <Image
            source={GRAIN_TEXTURE_PRIMARY_SOURCE}
            resizeMode="repeat"
            style={grainPrimaryStyles[backdrop.grainPrimaryOpacityVariant]}
          />
          <Image
            source={GRAIN_TEXTURE_SECONDARY_SOURCE}
            resizeMode="repeat"
            style={grainSecondaryStyles[backdrop.grainSecondaryOpacityVariant]}
          />
        </>
      )}
    </View>
  );
});

export default VideoAmbientBackdrop;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.neutral[975],
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
  },
  scrimOpacity0: {
    opacity: SCRIM_OPACITY[0],
  },
  scrimOpacity1: {
    opacity: SCRIM_OPACITY[1],
  },
  scrimOpacity2: {
    opacity: SCRIM_OPACITY[2],
  },
  scrimOpacity3: {
    opacity: SCRIM_OPACITY[3],
  },
  grainPrimary: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: GRAIN_PRIMARY_SCALE }],
  },
  grainSecondary: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: GRAIN_SECONDARY_SCALE }],
  },
  grainPrimaryOpacity0: {
    opacity: 0.07,
  },
  grainPrimaryOpacity1: {
    opacity: 0.08,
  },
  grainPrimaryOpacity2: {
    opacity: 0.09,
  },
  grainPrimaryOpacity3: {
    opacity: 0.1,
  },
  grainSecondaryOpacity0: {
    opacity: 0.03,
  },
  grainSecondaryOpacity1: {
    opacity: 0.04,
  },
  grainSecondaryOpacity2: {
    opacity: 0.045,
  },
  grainSecondaryOpacity3: {
    opacity: 0.055,
  },
});

const grainPrimaryOpacityStyles = [
  styles.grainPrimaryOpacity0,
  styles.grainPrimaryOpacity1,
  styles.grainPrimaryOpacity2,
  styles.grainPrimaryOpacity3,
] as const;

const grainSecondaryOpacityStyles = [
  styles.grainSecondaryOpacity0,
  styles.grainSecondaryOpacity1,
  styles.grainSecondaryOpacity2,
  styles.grainSecondaryOpacity3,
] as const;

const scrimOpacityStyles = [
  styles.scrimOpacity0,
  styles.scrimOpacity1,
  styles.scrimOpacity2,
  styles.scrimOpacity3,
] as const;

const grainPrimaryStyles: Array<StyleProp<ImageStyle>> = [
  [styles.grainPrimary, grainPrimaryOpacityStyles[0]],
  [styles.grainPrimary, grainPrimaryOpacityStyles[1]],
  [styles.grainPrimary, grainPrimaryOpacityStyles[2]],
  [styles.grainPrimary, grainPrimaryOpacityStyles[3]],
];

const grainSecondaryStyles: Array<StyleProp<ImageStyle>> = [
  [styles.grainSecondary, grainSecondaryOpacityStyles[0]],
  [styles.grainSecondary, grainSecondaryOpacityStyles[1]],
  [styles.grainSecondary, grainSecondaryOpacityStyles[2]],
  [styles.grainSecondary, grainSecondaryOpacityStyles[3]],
];

const scrimStyles: Array<StyleProp<ViewStyle>> = [
  [styles.scrim, scrimOpacityStyles[0]],
  [styles.scrim, scrimOpacityStyles[1]],
  [styles.scrim, scrimOpacityStyles[2]],
  [styles.scrim, scrimOpacityStyles[3]],
];
