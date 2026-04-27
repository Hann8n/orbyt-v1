import { type ComponentProps } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { VideoView as ExpoVideoView } from 'expo-video';
import type { VideoPlayer } from 'expo-video';
import type { VideoSource } from 'expo-video';
import { NanoIcon } from '../../../ui/NanoIcon';
import { Colors } from '../../../../theme';
import { Typography } from '../../../../utils/components/typography';
import { hexToRGBA } from '../../../../utils/formatting/colors';

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
  textDimAnimatedStyle: Record<string, unknown>;
  heartAnimatedStyle: Record<string, unknown>;
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
}: VideoCardMediaGestureLayerProps) {
  return (
    <GestureDetector gesture={videoGesture}>
      <View style={styles.videoContainerPressable} collapsable={false}>
        <View style={styles.videoContainer}>
          {!!posterUrl &&
            !cannotShowMedia &&
            !firstFrameRendered && (
              <Image
                source={{ uri: posterUrl }}
                contentFit="contain"
                style={styles.poster}
                recyclingKey={recyclingKey}
                accessible={false}
              />
            )}

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
    position: 'relative',
    zIndex: 1,
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  poster: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
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
    zIndex: 5,
  },
  textExpandedDimmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
    zIndex: 5,
    pointerEvents: 'none',
  },
  heartAnimationContainer: {
    position: 'absolute',
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
});

export default VideoCardMediaGestureLayer;
