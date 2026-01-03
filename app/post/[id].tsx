import { QueryErrorBoundary } from '../../src/components/ui/QueryErrorBoundary';
import VideoPostScreen from './VideoPostScreen';

export default function PostScreen() {
  return (
    <QueryErrorBoundary level="feature">
      <VideoPostScreen />
    </QueryErrorBoundary>
  );
}
