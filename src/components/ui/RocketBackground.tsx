import React, { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, Image } from 'react-native';
import { Canvas, Image as SkiaImage, useImage, Group, rect } from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const SPRITE_SHEET = require('../../assets/rocket-sprite-sheet.png');

const TOTAL_FRAMES = 8;
const FRAMES_PER_ROW = 8;
const FRAME_DURATION_MS = 50;
const FADE_IN_DURATION_MS = 1000;
const HORIZONTAL_OFFSET_PERCENT = 0.03;

let preloadPromise: Promise<boolean> | null = null;

export const preloadRocketSpriteSheet = () => {
  if (preloadPromise) return preloadPromise;
  const source = Image.resolveAssetSource(SPRITE_SHEET);
  preloadPromise = Image.prefetch(source.uri)
    .then(() => true)
    .catch(() => false);
  return preloadPromise;
};

preloadRocketSpriteSheet();

const RocketBackground: React.FC = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const opacity = useSharedValue(0);
  const frameIndex = useSharedValue(0);
  const spriteSheet = useImage(SPRITE_SHEET);
  const animationStartedRef = useRef(false);

  const dimensions = useDerivedValue(() => {
    if (!spriteSheet) return { frameSize: 0, scale: 1 };
    const sheetWidth = spriteSheet.width();
    const sheetHeight = spriteSheet.height();
    const frameSize = sheetWidth / FRAMES_PER_ROW;
    const scale = Math.max(screenWidth / frameSize, screenHeight / sheetHeight);
    return { frameSize, scale };
  }, [spriteSheet, screenWidth, screenHeight]);

  const imageX = useDerivedValue(() => {
    if (!spriteSheet) return 0;
    const idx = Math.floor(frameIndex.value) % TOTAL_FRAMES;
    const col = idx % FRAMES_PER_ROW;
    const baseX = -col * dimensions.value.frameSize * dimensions.value.scale;
    return baseX - screenWidth * HORIZONTAL_OFFSET_PERCENT;
  }, [frameIndex, spriteSheet, dimensions, screenWidth]);

  const imageY = useDerivedValue(() => {
    if (!spriteSheet) return 0;
    const scaledHeight = spriteSheet.height() * dimensions.value.scale;
    return (screenHeight - scaledHeight) / 2;
  }, [spriteSheet, screenHeight, dimensions]);

  const imageWidth = useDerivedValue(() => {
    if (!spriteSheet) return screenWidth;
    return spriteSheet.width() * dimensions.value.scale;
  }, [spriteSheet, screenWidth, dimensions]);

  const imageHeight = useDerivedValue(() => {
    if (!spriteSheet) return screenHeight;
    return spriteSheet.height() * dimensions.value.scale;
  }, [spriteSheet, screenHeight, dimensions]);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: FADE_IN_DURATION_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [opacity]);

  useEffect(() => {
    if (!spriteSheet || animationStartedRef.current) return;
    animationStartedRef.current = true;

    frameIndex.value = withRepeat(
      withSequence(
        ...Array.from({ length: TOTAL_FRAMES }, (_, i) =>
          withTiming(i, { duration: FRAME_DURATION_MS, easing: Easing.linear })
        )
      ),
      -1,
      false
    );
  }, [spriteSheet, frameIndex]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {spriteSheet && (
          <Group clip={rect(0, 0, screenWidth, screenHeight)}>
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
    </Animated.View>
  );
};

export default React.memo(RocketBackground);
