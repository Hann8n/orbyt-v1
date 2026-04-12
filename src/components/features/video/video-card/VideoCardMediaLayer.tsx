import { type ComponentProps } from 'react';
import BlurredBackground from '../../../ui/BlurredBackground';
import VideoCardMediaGestureLayer from './VideoCardMediaGestureLayer';

type GestureStackProps = ComponentProps<typeof VideoCardMediaGestureLayer>;

export interface VideoCardMediaLayerProps {
  thumbnailUrlForBlur: string | null;
  onBlurReady: () => void;
  gestureStack: GestureStackProps;
}

const VideoCardMediaLayer = function VideoCardMediaLayer({
  thumbnailUrlForBlur,
  onBlurReady,
  gestureStack,
}: VideoCardMediaLayerProps) {
  return (
    <>
      <BlurredBackground thumbnailUrl={thumbnailUrlForBlur} onBlurReady={onBlurReady} />
      <VideoCardMediaGestureLayer {...gestureStack} />
    </>
  );
};

export default VideoCardMediaLayer;
