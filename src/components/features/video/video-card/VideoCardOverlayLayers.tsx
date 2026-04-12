import { View, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { VideoPlayer } from 'expo-video';
import { VideoScrubber } from '../VideoScrubber';
import VideoOverlayUI, { type VideoOverlayUIProps } from '../VideoOverlayUI';
import VideoCardContentWarningLayer from './VideoCardContentWarningLayer';

export interface VideoCardOverlayLayersProps {
  shouldRenderScrubber: boolean;
  scrubberActive: boolean;
  player: VideoPlayer | null;
  playerStatus: string;
  seekingAnimationSV: SharedValue<number>;
  overlayOpacitySV: SharedValue<number>;
  showOverlay: boolean;
  overlayProps: VideoOverlayUIProps;
  showContentWarning: boolean;
  cannotShowMedia: boolean;
  isBlurred: boolean;
  warningDescription: string;
  onViewContent: () => void;
}

function VideoCardOverlayLayers({
  shouldRenderScrubber,
  scrubberActive,
  player,
  playerStatus,
  seekingAnimationSV,
  overlayOpacitySV,
  showOverlay,
  overlayProps,
  showContentWarning,
  cannotShowMedia,
  isBlurred,
  warningDescription,
  onViewContent,
}: VideoCardOverlayLayersProps) {
  return (
    <>
      {shouldRenderScrubber ? (
        <View style={styles.videoScrubberLayer} pointerEvents="box-none">
          <VideoScrubber
            active={scrubberActive}
            player={player ?? undefined}
            playerStatus={playerStatus}
            seekingAnimationSV={seekingAnimationSV}
            overlayOpacitySV={overlayOpacitySV}
          />
        </View>
      ) : null}

      {showOverlay ? (
        <View style={styles.videoOverlayLayer} pointerEvents="box-none">
          <VideoOverlayUI {...overlayProps} />
        </View>
      ) : null}

      {showContentWarning ? (
        <VideoCardContentWarningLayer
          cannotShowMedia={cannotShowMedia}
          isBlurred={isBlurred}
          warningDescription={warningDescription}
          onViewContent={onViewContent}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  videoScrubberLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  videoOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 14,
  },
});

export default VideoCardOverlayLayers;
