import { type ComponentProps } from 'react';
import VideoAmbientBackdrop from '../../../ui/VideoAmbientBackdrop';
import VideoCardMediaGestureLayer from './VideoCardMediaGestureLayer';

type GestureStackProps = ComponentProps<typeof VideoCardMediaGestureLayer>;

export interface VideoCardMediaLayerProps {
  videoAmbientBackdropSeedUrl: string | null;
  onVideoAmbientBackdropReady: () => void;
  /**
   * When false, skip mounting the Skia-backed `VideoAmbientBackdrop` for this (off-screen) feed row.
   * FlashList keeps ~15 `VideoCard` instances mounted but only 1 is visible + up to 2 neighbors need
   * chrome ready for imminent scroll-into-view. Gating the backdrop here drops Skia `Canvas` work
   * from ~15 per home-feed cascade to ~3. See docs/react-native-optimization-agent-handoff.md (P0.5).
   */
  shouldRenderAmbientBackdrop: boolean;
  gestureStack: GestureStackProps;
}

const VideoCardMediaLayer = function VideoCardMediaLayer({
  videoAmbientBackdropSeedUrl,
  onVideoAmbientBackdropReady,
  shouldRenderAmbientBackdrop,
  gestureStack,
}: VideoCardMediaLayerProps) {
  return (
    <>
      {shouldRenderAmbientBackdrop && (
        <VideoAmbientBackdrop
          seedUrl={videoAmbientBackdropSeedUrl}
          onVideoAmbientBackdropReady={onVideoAmbientBackdropReady}
        />
      )}
      <VideoCardMediaGestureLayer {...gestureStack} />
    </>
  );
};

export default VideoCardMediaLayer;
