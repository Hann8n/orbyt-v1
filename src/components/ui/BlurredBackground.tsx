import { StyleSheet } from 'react-native';
import { memo, useEffect } from 'react';
import { Canvas, Image, Blur, Rect, useImage, useCanvasSize } from '@shopify/react-native-skia';

interface BlurredBackgroundProps {
  thumbnailUrl: string | null;
  onBlurReady?: () => void;
  /** When false, no dark overlay on top of the blur (e.g. for video post preview) */
  darkOverlay?: boolean;
}

const BlurredBackground = memo(function BlurredBackground({
  thumbnailUrl,
  onBlurReady,
  darkOverlay = true,
}: BlurredBackgroundProps) {
  const image = useImage(thumbnailUrl);
  const { ref, size } = useCanvasSize();
  const w = size.width;
  const h = size.height;
  const hasSize = w > 0 && h > 0;

  useEffect(() => {
    if (image && hasSize && onBlurReady) onBlurReady();
  }, [image, hasSize, onBlurReady]);

  if (!thumbnailUrl) return null;

  return (
    <Canvas ref={ref} style={StyleSheet.absoluteFill} pointerEvents="none">
      {hasSize && (
        <>
          {image && (
            <Image
              image={image}
              x={-w * 0.15}
              y={-h * 0.15}
              width={w * 1.3}
              height={h * 1.3}
              fit="cover"
            >
              <Blur blur={24} mode="clamp" />
            </Image>
          )}
          {darkOverlay && <Rect x={0} y={0} width={w} height={h} color="black" opacity={0.5} />}
        </>
      )}
    </Canvas>
  );
});

export default BlurredBackground;
