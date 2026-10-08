import { useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import VideoCard from '../video/VideoCard';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import { Colors } from '../../../theme';

export interface VideoItemProps {
  post: ExtendedPostView | ExtendedFeedViewPost;
  feedItem?: ExtendedFeedViewPost; // Preferred - contains feedContext and reqId natively
  height: number;
  feedOption?: string;
  isVisible?: boolean;
  index?: number;
  isAppleZoomTarget?: boolean;
  onHashtagPress?: (hashtag: string) => void;
  /** See VideoCard `activeDistance`. */
  activeDistance?: number;
  canPlay?: boolean;
  isListActive?: boolean;
}

// A function fallback: ErrorBoundary treats a null `fallback` as "use the full-screen default".
const renderEmptyRow = () => null;

function VideoItemComponent({
  post,
  feedItem,
  height,
  feedOption,
  isVisible,
  canPlay,
  isListActive,
  index = 0,
  isAppleZoomTarget = false,
  onHashtagPress,
  activeDistance,
}: VideoItemProps) {
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const hasVideo = Boolean(videoView?.playlist);

  const rowStyle = useMemo(() => [styles.videoContainer, { height }], [height]);
  const postUri = 'uri' in post ? post.uri : post.post?.uri;
  const rowResetKeys = useMemo(() => [postUri ?? index], [postUri, index]);

  if (!hasVideo) {
    return <View style={rowStyle} pointerEvents="none" collapsable={false} />;
  }

  // One malformed post must not take down the whole feed: render an empty row instead.
  const videoCard = (
    <ErrorBoundary level="component" fallback={renderEmptyRow} resetKeys={rowResetKeys}>
      <VideoCard
        post={post}
        feedItem={feedItem}
        feedOption={feedOption}
        height={height}
        isVisible={isVisible}
        canPlay={canPlay}
        isListActive={isListActive}
        index={index}
        activeDistance={activeDistance}
        onHashtagPress={onHashtagPress}
      />
    </ErrorBoundary>
  );

  return (
    <View style={rowStyle}>
      {isAppleZoomTarget ? (
        <Link.AppleZoomTarget>
          <View style={styles.appleZoomTargetInner}>{videoCard}</View>
        </Link.AppleZoomTarget>
      ) : (
        videoCard
      )}
    </View>
  );
}

export const VideoItem = memo(VideoItemComponent);
VideoItemComponent.displayName = 'VideoItem';

const styles = StyleSheet.create({
  videoContainer: {
    width: '100%',
    position: 'relative',
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleZoomTargetInner: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
});
