import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';

interface BlurredThumbnailBackgroundProps {
  thumbnailUrl: string | null;
  recyclingKey?: string;
}

export default function BlurredThumbnailBackground({
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
        transition={200}
      />
      <BlurView
        intensity={100}
        tint="systemChromeMaterialDark"
        style={styles.blur}
        experimentalBlurMethod="dimezisBlurView"
      />
      <View style={styles.overlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
  background: {
    width: '200%',
    height: '200%',
    position: 'absolute',
    top: '-50%',
    left: '-50%',
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
