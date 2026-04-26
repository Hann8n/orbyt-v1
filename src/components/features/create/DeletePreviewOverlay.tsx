import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { FEED_BUFFER_OPTIONS } from '@/utils/video/helpers';

interface Props {
  uri: string;
}

const DeletePreviewOverlay: React.FC<Props> = ({ uri }) => {
  const player = useVideoPlayer({ uri }, p => {
    p.loop = true;
    p.muted = true;
    p.bufferOptions = FEED_BUFFER_OPTIONS;
  });

  useEffect(() => {
    player?.play();
  }, [player, uri]);

  if (!player) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 11,
  },
});

export default React.memo(DeletePreviewOverlay);
