import { useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import VideoCard from '../video/VideoCard';
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
  activeIndex?: number;
  canPlay?: boolean;
}

function VideoItemComponent({
  post,
  feedItem,
  height,
  feedOption,
  isVisible,
  canPlay,
  index = 0,
  isAppleZoomTarget = false,
  onHashtagPress,
  activeIndex,
}: VideoItemProps) {
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const hasVideo = Boolean(videoView?.playlist);

  const rowStyle = useMemo(() => [styles.videoContainer, { height }], [height]);

  if (!hasVideo) {
    return <View style={rowStyle} pointerEvents="none" collapsable={false} />;
  }

  const videoCard = (
    <VideoCard
      post={post}
      feedItem={feedItem}
      feedOption={feedOption}
      height={height}
      isVisible={isVisible}
      canPlay={canPlay}
      index={index}
      activeIndex={activeIndex}
      onHashtagPress={onHashtagPress}
    />
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

const getPostVideoPlaylist = (post: ExtendedPostView | ExtendedFeedViewPost): string | undefined => {
  if (!('embed' in post)) return undefined;
  return getVideoView(post.embed as PostView['embed'])?.playlist;
};

const areVideoItemPropsEqual = (prev: VideoItemProps, next: VideoItemProps): boolean => {
  const prevUri = 'uri' in prev.post ? prev.post.uri : undefined;
  const nextUri = 'uri' in next.post ? next.post.uri : undefined;
  const prevCid = 'cid' in prev.post ? prev.post.cid : undefined;
  const nextCid = 'cid' in next.post ? next.post.cid : undefined;

  const prevFeedItemUri = prev.feedItem?.post?.uri;
  const nextFeedItemUri = next.feedItem?.post?.uri;
  const prevFeedItemCid = prev.feedItem?.post?.cid;
  const nextFeedItemCid = next.feedItem?.post?.cid;
  const prevFeedContext = prev.feedItem?.feedContext;
  const nextFeedContext = next.feedItem?.feedContext;
  const prevReqId = prev.feedItem?.reqId;
  const nextReqId = next.feedItem?.reqId;

  return (
    prevUri === nextUri &&
    prevCid === nextCid &&
    getPostVideoPlaylist(prev.post) === getPostVideoPlaylist(next.post) &&
    prevFeedItemUri === nextFeedItemUri &&
    prevFeedItemCid === nextFeedItemCid &&
    prevFeedContext === nextFeedContext &&
    prevReqId === nextReqId &&
    prev.height === next.height &&
    prev.feedOption === next.feedOption &&
    prev.isVisible === next.isVisible &&
    prev.canPlay === next.canPlay &&
    prev.index === next.index &&
    prev.activeIndex === next.activeIndex &&
    prev.onHashtagPress === next.onHashtagPress
  );
};

export const VideoItem = memo(VideoItemComponent, areVideoItemPropsEqual);
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
