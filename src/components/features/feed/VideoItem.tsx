/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import { useMemo, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Link } from 'expo-router';

import { useVisibilityCoreStore } from '../../../core/visibility';
import { useFeedScroll } from '../../../context/FeedScrollContext';
import VideoCard from '../video/VideoCard';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import { HOME_FEED_PAGER_OPTIONS } from '../../../utils/constants';
import { Colors } from '../../../theme';

// VideoCard's Post type
type VideoCardPost = ExtendedPostView | ExtendedFeedViewPost;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Types
// Post can be ExtendedPostView, ExtendedFeedViewPost, or simplified post structure
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

// Simplified Video Item Component for immediate playback
export interface VideoItemProps {
  post: Post;
  feedItem?: ExtendedFeedViewPost; // Preferred - contains feedContext and reqId natively
  height?: number;
  feedOption?: string;
  /** Scoped key for visibility (e.g. profile:did). */
  feedKey?: string;
  canPlay?: boolean;
  isHeaderBlockingPlayback?: boolean;
  index?: number;
  /** iOS: marks the row as the zoom transition target (paired with grid `Link.AppleZoom`). */
  isAppleZoomTarget?: boolean;
}

export function VideoItem({
  post,
  feedItem,
  height,
  feedOption,
  feedKey,
  canPlay = false,
  isHeaderBlockingPlayback = false,
  index = 0,
  isAppleZoomTarget = false,
}: VideoItemProps) {
  const key = feedKey ?? feedOption ?? '';
  const isActiveFeed = useVisibilityCoreStore(s => s.activeFeedKey === key);
  const isViewable = useVisibilityCoreStore(s => (s.lastViewableIndexByFeed[key] ?? -1) === index);
  const isVisible = isViewable && !isHeaderBlockingPlayback;
  const allowPlayback = isViewable && isActiveFeed && canPlay && !isHeaderBlockingPlayback;

  // Simplified calculations - no memoization needed for simple operations
  const itemHeight = height || SCREEN_HEIGHT;

  // Extract video embed and URL using getVideoView helper + direct property access
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const videoUrl = videoView?.playlist || null;

  const hasVideo = !!videoUrl;

  // No margins - using FlashList ItemSeparatorComponent for spacing
  const containerStyle = [styles.videoContainer, { height: itemHeight }];

  const normalizedPost = useMemo(
    () => ({ ...post, embed: videoView }) as VideoCardPost,
    [post, videoView]
  );

  const setHomePagerChromeUserHold = useFeedScroll()?.setHomePagerChromeUserHold;
  const onHomeFeedPagerChromeUserPaused = useCallback(
    (userPaused: boolean) => {
      if (!feedOption || !HOME_FEED_PAGER_OPTIONS.has(feedOption)) return;
      setHomePagerChromeUserHold?.(userPaused);
    },
    [feedOption, setHomePagerChromeUserHold]
  );

  const homeFeedPagerChromeHandler =
    feedOption && HOME_FEED_PAGER_OPTIONS.has(feedOption)
      ? onHomeFeedPagerChromeUserPaused
      : undefined;

  if (!hasVideo) {
    return <View style={containerStyle} pointerEvents="none" collapsable={false} />;
  }

  // expo-video's useVideoPlayer automatically handles cleanup on unmount
  // The VideoCard component manages video state via useRecyclingState for FlashList optimization

  const videoCard = (
    <VideoCard
      post={normalizedPost}
      feedItem={feedItem}
      isVisible={isVisible}
      shouldDisablePlayback={!allowPlayback}
      height={itemHeight}
      showOverlay={true}
      feedOption={feedOption}
      index={index}
      onUserPausedChange={homeFeedPagerChromeHandler}
    />
  );

  return (
    <View style={containerStyle}>
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

export default VideoItem;
