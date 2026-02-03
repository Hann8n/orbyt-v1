import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import {
  Canvas,
  Rect,
  LinearGradient as SkiaLinearGradient,
  vec,
  useCanvasSize,
} from '@shopify/react-native-skia';

interface LinearGradientProps {
  colors: string[];
  locations?: number[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  /** Enable dithering to reduce banding (recommended for smooth gradients) */
  dither?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
  children?: React.ReactNode;
}

/**
 * Skia-based LinearGradient component that replaces expo-linear-gradient
 * Provides better performance and fixes Android rendering issues
 */
export const LinearGradient: React.FC<LinearGradientProps> = ({
  colors,
  locations,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
  dither = true,
  style,
  pointerEvents = 'auto',
  children,
}) => {
  const { ref, size } = useCanvasSize();
  const flattenedStyle = StyleSheet.flatten(style || {});

  // Check if style uses absoluteFill
  const isAbsoluteFill =
    (flattenedStyle as any) === StyleSheet.absoluteFill ||
    (flattenedStyle.position === 'absolute' &&
      flattenedStyle.left === 0 &&
      flattenedStyle.right === 0 &&
      flattenedStyle.top === 0 &&
      flattenedStyle.bottom === 0);

  // Get dimensions from style or use canvas size
  const styleWidth = flattenedStyle.width as number | undefined;
  const styleHeight = flattenedStyle.height as number | undefined;

  // For absoluteFill or when no explicit dimensions, use canvas size
  // Otherwise use style dimensions
  const useCanvasDimensions = isAbsoluteFill || (!styleWidth && !styleHeight);

  const gradientWidth = useCanvasDimensions ? size.width : (styleWidth ?? 1);
  const gradientHeight = useCanvasDimensions ? size.height : (styleHeight ?? 1);

  // Calculate gradient start and end points (normalized 0-1 coordinates)
  const startX = start.x * gradientWidth;
  const startY = start.y * gradientHeight;
  const endX = end.x * gradientWidth;
  const endY = end.y * gradientHeight;

  // Normalize locations if provided, otherwise distribute evenly
  const normalizedLocations = locations
    ? locations
    : colors.length > 1
      ? colors.map((_, index) => index / (colors.length - 1))
      : [0];

  // If there are children, wrap in View with gradient as background
  if (children) {
    return (
      <View style={style} pointerEvents={pointerEvents}>
        <Canvas
          ref={ref}
          style={
            useCanvasDimensions
              ? StyleSheet.absoluteFill
              : { width: gradientWidth, height: gradientHeight }
          }
          pointerEvents="none"
        >
          {gradientWidth > 0 && gradientHeight > 0 && (
            <Rect x={0} y={0} width={gradientWidth} height={gradientHeight} dither={dither}>
              <SkiaLinearGradient
                start={vec(startX, startY)}
                end={vec(endX, endY)}
                colors={colors}
                positions={normalizedLocations}
                flags={1}
              />
            </Rect>
          )}
        </Canvas>
        {children}
      </View>
    );
  }

  // No children - just render gradient
  return (
    <Canvas ref={ref} style={style} pointerEvents={pointerEvents}>
      {gradientWidth > 0 && gradientHeight > 0 && (
        <Rect x={0} y={0} width={gradientWidth} height={gradientHeight} dither={dither}>
          <SkiaLinearGradient
            start={vec(startX, startY)}
            end={vec(endX, endY)}
            colors={colors}
            positions={normalizedLocations}
            flags={1}
          />
        </Rect>
      )}
    </Canvas>
  );
};
