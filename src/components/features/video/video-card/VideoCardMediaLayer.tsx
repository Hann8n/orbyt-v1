import { type ComponentProps } from 'react';
import VideoAmbientBackdrop from '../../../ui/VideoAmbientBackdrop';
import VideoCardMediaGestureLayer from './VideoCardMediaGestureLayer';

type GestureStackProps = ComponentProps<typeof VideoCardMediaGestureLayer>;

export interface VideoCardMediaLayerProps {
  videoAmbientBackdropSeedUrl: string | null;
  onVideoAmbientBackdropReady: () => void;
  gestureStack: GestureStackProps;
}

const VideoCardMediaLayer = function VideoCardMediaLayer({
  videoAmbientBackdropSeedUrl,
  onVideoAmbientBackdropReady,
  gestureStack,
}: VideoCardMediaLayerProps) {
  return (
    <>
      <VideoAmbientBackdrop
        seedUrl={videoAmbientBackdropSeedUrl}
        onVideoAmbientBackdropReady={onVideoAmbientBackdropReady}
      />
      <VideoCardMediaGestureLayer {...gestureStack} />
    </>
  );
};

export default VideoCardMediaLayer;
