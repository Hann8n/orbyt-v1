import { View, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { VideoPlayer } from 'expo-video';
import { VideoScrubber } from '../VideoScrubber';
import VideoOverlayUI, { type VideoOverlayUIProps } from '../VideoOverlayUI';
import VideoCardContentWarningLayer from './VideoCardContentWarningLayer';

export interface VideoCardOverlayLayersProps {
  /** When false, skip scrubber + social overlay (list rows far from the active page). Content warning still mounts. */
  renderHeavyChrome?: boolean;
  shouldRenderScrubber: boolean;
  scrubberActive: boolean;
  player: VideoPlayer | null;
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
  renderHeavyChrome = true,
  shouldRenderScrubber,
  scrubberActive,
  player,
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
      {renderHeavyChrome && shouldRenderScrubber ? (
        <View style={styles.videoScrubberLayer} pointerEvents="box-none">
          <VideoScrubber
            active={scrubberActive}
            player={player ?? undefined}
            seekingAnimationSV={seekingAnimationSV}
            overlayOpacitySV={overlayOpacitySV}
          />
        </View>
      ) : null}

      {renderHeavyChrome && showOverlay ? (
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
