import { type ComponentProps } from 'react';
import VideoCardMediaGestureLayer from './VideoCardMediaGestureLayer';

type GestureStackProps = ComponentProps<typeof VideoCardMediaGestureLayer>;

export interface VideoCardMediaLayerProps {
  gestureStack: GestureStackProps;
}

const VideoCardMediaLayer = function VideoCardMediaLayer({
  gestureStack,
}: VideoCardMediaLayerProps) {
  return <VideoCardMediaGestureLayer {...gestureStack} />;
};

export default VideoCardMediaLayer;
