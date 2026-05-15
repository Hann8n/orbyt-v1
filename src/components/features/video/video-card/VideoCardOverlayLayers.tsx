import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { VideoPlayer } from 'expo-video';
import { VideoScrubber } from '../VideoScrubber';
import VideoOverlayUI, { type VideoOverlayUIProps } from '../VideoOverlayUI';
import VideoCardContentWarningLayer from './VideoCardContentWarningLayer';
import { OVERLAY_Z_INDEX } from '../../../../utils/constants/overlay';

export interface VideoCardOverlayLayersProps {
  /** When false, skip scrubber + social overlay (list rows far from the active page). Content warning still mounts. */
  renderHeavyChrome?: boolean;
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
  renderHeavyChrome = true,
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

const arePropsEqual = (
  prev: VideoCardOverlayLayersProps,
  next: VideoCardOverlayLayersProps
): boolean => {
  if (prev.renderHeavyChrome !== next.renderHeavyChrome) return false;
  if (prev.showOverlay !== next.showOverlay) return false;
  if (prev.shouldRenderScrubber !== next.shouldRenderScrubber) return false;
  if (prev.scrubberActive !== next.scrubberActive) return false;
  if (prev.isActive !== next.isActive) return false;
  if (prev.showContentWarning !== next.showContentWarning) return false;
  if (prev.cannotShowMedia !== next.cannotShowMedia) return false;
  if (prev.isBlurred !== next.isBlurred) return false;
  if (prev.warningDescription !== next.warningDescription) return false;
  if (prev.onViewContent !== next.onViewContent) return false;

  // Skip heavy comparisons entirely for rows where heavy chrome is not mounted.
  if (!next.renderHeavyChrome) {
    return true;
  }

  if (next.shouldRenderScrubber) {
    if (prev.player !== next.player) return false;
    if (prev.seekingAnimationSV !== next.seekingAnimationSV) return false;
    if (prev.overlayOpacitySV !== next.overlayOpacitySV) return false;
  }

  return true;
};

const styles = StyleSheet.create({
  videoScrubberLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_Z_INDEX.SCRUBBER,
  },
  videoOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_Z_INDEX.OVERLAY_CONTENT,
  },
});

export default memo(VideoCardOverlayLayers, arePropsEqual);
