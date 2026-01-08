import { View, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { memo } from 'react';

interface BlurredThumbnailBackgroundProps {
  thumbnailUrl: string | null;
  recyclingKey?: string;
}

const BlurredThumbnailBackground = memo(function BlurredThumbnailBackground({
  thumbnailUrl,
  recyclingKey,
}: BlurredThumbnailBackgroundProps) {
  if (!thumbnailUrl) return null;

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: thumbnailUrl }}
        style={styles.background}
        contentFit="cover"
        recyclingKey={recyclingKey}
        cachePolicy="disk"
      />
      <BlurView
        intensity={100}
        tint={Platform.OS === 'android' ? 'dark' : 'systemChromeMaterialDark'}
        style={styles.blur}
        experimentalBlurMethod="dimezisBlurView"
        {...(Platform.OS === 'android' && { blurReductionFactor: 3 })}
      />
      <View style={styles.overlay} />
    </View>
  );
});

export default BlurredThumbnailBackground;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
