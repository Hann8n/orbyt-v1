import { StyleSheet } from 'react-native';
import { memo } from 'react';
import { Canvas, Image, Blur, Rect, useImage, useCanvasSize } from '@shopify/react-native-skia';

interface BlurredBackgroundProps {
  thumbnailUrl: string | null;
}

const BlurredBackground = memo(function BlurredBackground({
  thumbnailUrl,
}: BlurredBackgroundProps) {
  const image = useImage(thumbnailUrl);
  const { ref, size } = useCanvasSize();

  if (!thumbnailUrl) return null;

  return (
    <Canvas ref={ref} style={StyleSheet.absoluteFill} pointerEvents="none">
      {image && size.width > 0 && size.height > 0 && (
        <>
          <Image
            image={image}
            x={-size.width * 0.15}
            y={-size.height * 0.15}
            width={size.width * 1.3}
            height={size.height * 1.3}
            fit="cover"
          >
            <Blur blur={40} mode="clamp" />
          </Image>
          <Rect x={0} y={0} width={size.width} height={size.height} color="black" opacity={0.5} />
        </>
      )}
    </Canvas>
  );
});

export default BlurredBackground;
