import React, { useEffect, useRef } from 'react';
import { StyleProp, ViewStyle, Image } from 'react-native';
import { Canvas, Image as SkiaImage, useImage, Group, rect } from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const SPRITE_SHEET = require('../../assets/tv-static-sprite-sheet.png');

const TOTAL_FRAMES = 25;
const FRAMES_PER_ROW = 5;
const FRAME_DURATION = 40; // ~25fps

// Preload the sprite sheet using React Native's Image prefetch
// This caches the image in memory for faster loading
let preloadPromise: Promise<boolean> | null = null;

export const preloadSpriteSheet = () => {
  if (preloadPromise) return preloadPromise;

  preloadPromise = Image.prefetch(Image.resolveAssetSource(SPRITE_SHEET).uri)
    .then(() => true)
    .catch(() => false);

  return preloadPromise;
};

// Preload immediately when module loads
preloadSpriteSheet();

interface AnimatedTVStaticProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
}

const AnimatedTVStatic: React.FC<AnimatedTVStaticProps> = ({
  size = 72,
  style,
  autoPlay = true,
}) => {
  const frameIndex = useSharedValue(0);
  const spriteSheet = useImage(SPRITE_SHEET);
  const animationStartedRef = useRef(false);

  const dimensions = useDerivedValue(() => {
    if (!spriteSheet) return { frameSize: 0, scale: 1 };
    const sheetSize = spriteSheet.width();
    const frameSize = sheetSize / FRAMES_PER_ROW;
    return { frameSize, scale: size / frameSize };
  }, [spriteSheet, size]);

  const imageX = useDerivedValue(() => {
    if (!spriteSheet) return 0;
    const idx = Math.floor(frameIndex.value) % TOTAL_FRAMES;
    const col = idx % FRAMES_PER_ROW;
    return -col * dimensions.value.frameSize * dimensions.value.scale;
  }, [frameIndex, spriteSheet, dimensions]);

  const imageY = useDerivedValue(() => {
    if (!spriteSheet) return 0;
    const idx = Math.floor(frameIndex.value) % TOTAL_FRAMES;
    const row = Math.floor(idx / FRAMES_PER_ROW);
    return -row * dimensions.value.frameSize * dimensions.value.scale;
  }, [frameIndex, spriteSheet, dimensions]);

  const imageWidth = useDerivedValue(() => {
    if (!spriteSheet) return size;
    return spriteSheet.width() * dimensions.value.scale;
  }, [spriteSheet, size, dimensions]);

  const imageHeight = useDerivedValue(() => {
    if (!spriteSheet) return size;
    return spriteSheet.width() * dimensions.value.scale;
  }, [spriteSheet, size, dimensions]);

  useEffect(() => {
    if (!spriteSheet || !autoPlay || animationStartedRef.current) {
      return;
    }

    animationStartedRef.current = true;

    frameIndex.value = withRepeat(
      withSequence(
        ...Array.from({ length: TOTAL_FRAMES }, (_, i) =>
          withTiming(i, { duration: FRAME_DURATION, easing: Easing.linear })
        )
      ),
      -1,
      false
    );
  }, [spriteSheet, autoPlay, frameIndex]);

  // Always render Canvas to avoid layout shifts, but only show image when ready
  return (
    <Canvas style={[{ width: size, height: size }, style]}>
      {spriteSheet && (
        <Group clip={rect(0, 0, size, size)}>
          <SkiaImage
            image={spriteSheet}
            x={imageX}
            y={imageY}
            width={imageWidth}
            height={imageHeight}
          />
        </Group>
      )}
    </Canvas>
  );
};

export default AnimatedTVStatic;
