import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { VideoPlayer } from 'expo-video';
import { VideoScrubber } from '../VideoScrubber';
import VideoOverlayUI, { type VideoOverlayUIProps } from '../VideoOverlayUI';
import VideoCardContentWarningLayer from './VideoCardContentWarningLayer';
import { OVERLAY_Z_INDEX } from '../../../../utils/constants/overlay';

export interface VideoCardOverlayLayersProps {
  shouldRenderScrubber: boolean;
  scrubberActive: boolean;
  /** Controls whether the overlay layer receives touch events. Pass false for off-screen cards. */
  isActive: boolean;
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
  shouldRenderScrubber,
  scrubberActive,
  isActive,
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
      {shouldRenderScrubber ? (
        <View style={styles.videoScrubberLayer} pointerEvents="box-none">
          <VideoScrubber
            active={scrubberActive}
            player={player ?? undefined}
            seekingAnimationSV={seekingAnimationSV}
            overlayOpacitySV={overlayOpacitySV}
          />
        </View>
      ) : null}

      {showOverlay ? (
        <View style={styles.videoOverlayLayer} pointerEvents={isActive ? 'box-none' : 'none'}>
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
    ...StyleSheet.absoluteFill,
    zIndex: OVERLAY_Z_INDEX.SCRUBBER,
  },
  videoOverlayLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: OVERLAY_Z_INDEX.OVERLAY_CONTENT,
  },
});

export default memo(VideoCardOverlayLayers);
