import { type ComponentProps } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { VideoView as ExpoVideoView } from 'expo-video';
import type { VideoPlayer } from 'expo-video';
import type { VideoSource } from 'expo-video';
import { NanoIcon } from '../../../ui/NanoIcon';
import { Colors } from '../../../../theme';
import { Typography } from '../../../../utils/components/typography';
import { hexToRGBA } from '../../../../utils/formatting/colors';
import { OVERLAY_Z_INDEX } from '../../../../utils/constants/overlay';

type GestureDetectorGestureProp = ComponentProps<typeof GestureDetector>['gesture'];

export interface VideoCardMediaGestureLayerProps {
  videoGesture: GestureDetectorGestureProp;
  posterUrl: string | null;
  cannotShowMedia: boolean;
  firstFrameRendered: boolean;
  recyclingKey: string;
  videoSource: VideoSource | null;
  isBlurred: boolean;
  player: VideoPlayer | null;
  shouldLoadVideo: boolean;
  loadingLabel: string;
  onFirstFrameRender: () => void;
  surfaceType: 'textureView' | undefined;
  textDimAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  heartAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  /**
   * Decode-priority hint for the poster `<Image>`. Active-row posters get
   * 'high' so they decode before any neighbours that are merely in the
   * preload window; everything else stays at 'normal'.
   */
  posterPriority: 'low' | 'normal' | 'high';
}

const VideoCardMediaGestureLayer = function VideoCardMediaGestureLayer({
  videoGesture,
  posterUrl,
  cannotShowMedia,
  firstFrameRendered,
  recyclingKey,
  videoSource,
  isBlurred,
  player,
  shouldLoadVideo,
  loadingLabel,
  onFirstFrameRender,
  surfaceType,
  textDimAnimatedStyle,
  heartAnimatedStyle,
  posterPriority,
}: VideoCardMediaGestureLayerProps) {
  return (
    <GestureDetector gesture={videoGesture}>
      <View style={styles.videoContainerPressable} collapsable={false}>
        <View style={styles.videoContainer}>
          {!!videoSource && !cannotShowMedia && !isBlurred && player && (
            <ExpoVideoView
              player={player}
              style={styles.videoPlayer}
              contentFit="contain"
              nativeControls={false}
              playsInline
              surfaceType={surfaceType}
              allowsVideoFrameAnalysis={false}
              onFirstFrameRender={onFirstFrameRender}
              pointerEvents="none"
            />
          )}

          {!!posterUrl && !cannotShowMedia && !firstFrameRendered && (
            <Image
              source={{ uri: posterUrl }}
              contentFit="contain"
              style={styles.poster}
              pointerEvents="none"
              recyclingKey={recyclingKey}
              cachePolicy="memory-disk"
              priority={posterPriority}
              allowDownscaling
              accessible={false}
            />
          )}

          {!shouldLoadVideo && !cannotShowMedia && !isBlurred && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.neutral[50]} />
              <Text style={styles.loadingText}>{loadingLabel}</Text>
            </View>
          )}

          <Animated.View
            style={[styles.textExpandedDimmingOverlay, textDimAnimatedStyle]}
            pointerEvents="none"
          />

          <Animated.View
            style={[styles.heartAnimationContainer, heartAnimatedStyle]}
            pointerEvents="none"
          >
            <NanoIcon name="heart-fill" size={100} color={Colors.coral[500]} />
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  videoContainerPressable: {
    width: '100%',
    height: '100%',
    zIndex: OVERLAY_Z_INDEX.GESTURE_LAYER,
  },
  videoContainer: {
    width: '100%',
    height: '100%',
  },
  videoPlayer: {
    ...StyleSheet.absoluteFillObject,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
  },
  loadingText: {
    color: Colors.neutral[50],
    marginTop: 10,
    fontSize: Typography.sizes.caption,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: hexToRGBA(Colors.black, 0.7),
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: OVERLAY_Z_INDEX.LOADING_OVERLAY,
  },
  textExpandedDimmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
    zIndex: OVERLAY_Z_INDEX.LOADING_OVERLAY,
    pointerEvents: 'none',
  },
  heartAnimationContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: OVERLAY_Z_INDEX.HEART_ANIMATION,
  },
});

export default VideoCardMediaGestureLayer;
