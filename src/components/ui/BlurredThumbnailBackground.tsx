import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

interface BlurredThumbnailBackgroundProps {
  thumbnailUrl: string | null;
}

export default function BlurredThumbnailBackground({ thumbnailUrl }: BlurredThumbnailBackgroundProps) {
  if (!thumbnailUrl) return null;

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: thumbnailUrl }}
        style={styles.background}
        resizeMode="cover"
      />
      <BlurView intensity={100} tint="systemChromeMaterialDark" style={styles.blur} />
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

