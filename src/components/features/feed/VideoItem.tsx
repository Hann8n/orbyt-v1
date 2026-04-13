import { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import { useFeedScrollMotion } from '../../../context/FeedScrollContext';
import VideoCard from '../video/VideoCard';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import { HOME_FEED_PAGER_OPTIONS } from '../../../utils/constants';
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
}: VideoItemProps) {
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const hasVideo = Boolean(videoView?.playlist);

  const rowStyle = [styles.videoContainer, { height }];

  const normalizedPost = useMemo(
    () => ({ ...post, embed: videoView }) as VideoCardPost,
    [post, videoView]
  );

  const setHomePagerChromeUserHold = useFeedScrollMotion()?.setHomePagerChromeUserHold;
  const onHomeFeedPagerChromeUserPaused = useCallback(
    (userPaused: boolean) => {
      setHomePagerChromeUserHold?.(userPaused);
    },
    [setHomePagerChromeUserHold]
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
      onUserPausedChange={
        feedOption && HOME_FEED_PAGER_OPTIONS.has(feedOption)
          ? onHomeFeedPagerChromeUserPaused
          : undefined
      }
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
