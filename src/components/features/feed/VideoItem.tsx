import { useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import VideoCard from '../video/VideoCard';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import { Colors } from '../../../theme';

type VideoCardPost = ExtendedPostView | ExtendedFeedViewPost;

type Post =
  | ExtendedPostView
  | ExtendedFeedViewPost
  | {
      uri: string;
      cid: string;
      embed?: unknown;
      author?: {
        avatar?: string;
        displayName?: string;
        handle?: string;
      };
    };

export interface VideoItemProps {
  post: Post;
  feedItem?: ExtendedFeedViewPost; // Preferred - contains feedContext and reqId natively
  height: number;
  feedOption?: string;
  isVisible?: boolean;
  allowPlayback?: boolean;
  index?: number;
  /** iOS: marks the row as the zoom transition target (paired with grid `Link.AppleZoom`). */
  isAppleZoomTarget?: boolean;
  /** Navigate to a hashtag feed. */
  onHashtagPress?: (hashtag: string) => void;
}

function VideoItemComponent({
  post,
  feedItem,
  height,
  feedOption,
  isVisible,
  allowPlayback,
  index = 0,
  isAppleZoomTarget = false,
  onHashtagPress,
}: VideoItemProps) {
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const hasVideo = Boolean(videoView?.playlist);

  const rowStyle = useMemo(() => [styles.videoContainer, { height }], [height]);

  const normalizedPost = useMemo(
    () => ({ ...post, embed: videoView }) as VideoCardPost,
    [post, videoView]
  );

  if (!hasVideo) {
    return <View style={rowStyle} pointerEvents="none" collapsable={false} />;
  }

  const videoCard = (
    <VideoCard
      post={normalizedPost}
      feedItem={feedItem}
      {...(isVisible !== undefined ? { isVisible } : {})}
      {...(allowPlayback !== undefined ? { shouldDisablePlayback: !allowPlayback } : {})}
      height={height}
      feedOption={feedOption}
      index={index}
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

const getPostVideoPlaylist = (post: Post): string | undefined => {
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
    prev.allowPlayback === next.allowPlayback &&
    prev.index === next.index &&
    prev.isAppleZoomTarget === next.isAppleZoomTarget &&
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
