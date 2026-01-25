/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

import { useVisibilityCoreStore } from '../../../core/visibility';
import VideoCard from '../video/VideoCard';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import { Colors } from '../../ui/UI';

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
  canPlay?: boolean;
  isHeaderBlockingPlayback?: boolean;
  shouldBlur?: boolean; // Simple flag from parent (computed at feed level for performance)
  isModal?: boolean;
  index?: number;
}

const VideoItem: React.FC<VideoItemProps> = ({
  post,
  feedItem,
  height,
  feedOption,
  canPlay = false,
  isHeaderBlockingPlayback = false,
  shouldBlur = false,
  isModal = false,
  index = 0,
}) => {
  // Overlay when viewable for this feed (frozen+overlay on inactive); play only when active feed.
  // Boolean selector (isActiveFeed) avoids subscribing to activeFeedKey string; fewer rerenders when switching feeds.
  const isActiveFeed = useVisibilityCoreStore(s => s.activeFeedKey === (feedOption ?? ''));
  const lastViewable = useVisibilityCoreStore(
    s => s.lastViewableIndexByFeed[feedOption ?? ''] ?? -1
  );
  const isViewable = lastViewable === index;
  const isVisible = isViewable && !isHeaderBlockingPlayback;
  const allowPlayback = isViewable && isActiveFeed && canPlay && !isHeaderBlockingPlayback;

  // Simplified calculations - no memoization needed for simple operations
  const itemHeight = height || SCREEN_HEIGHT;

  // Extract video embed and URL using getVideoView helper + direct property access
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const videoUrl = videoView?.playlist || null;

  const hasVideo = !!videoUrl;

  // Convert shouldBlur flag to ModerationDecision format for VideoCard
  const moderationDecision = useMemo(() => {
    if (!shouldBlur) {
      return { filter: false, blur: false, informs: [] };
    }
    return { filter: false, blur: true, informs: [] };
  }, [shouldBlur]);

  // Memoize container style to prevent recreation on every render
  // No margins - using FlashList ItemSeparatorComponent for spacing
  const containerStyle = useMemo(
    () => [styles.videoContainer, { height: itemHeight }],
    [itemHeight]
  );

  // Memoize merged post so VideoCard's memo can skip when uri/cid/video unchanged (FlashList recycling)
  const postUri = getPostUri(post) ?? '';
  const postCid = getPostCid(post) ?? '';
  const normalizedPost = useMemo(
    () => ({ ...post, embed: videoView }) as VideoCardPost,
    // Deps by stable identity (uri/cid/video) for FlashList recycling; post/videoView used in callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postUri, postCid, videoUrl]
  );

  // Early return if no video
  if (!hasVideo) {
    return null;
  }

  // expo-video's useVideoPlayer automatically handles cleanup on unmount
  // The VideoCard component manages video state via useRecyclingState for FlashList optimization

  return (
    <View style={containerStyle}>
      <VideoCard
        post={normalizedPost}
        feedItem={feedItem}
        isVisible={isVisible}
        shouldDisablePlayback={!allowPlayback}
        height={itemHeight}
        moderationDecision={moderationDecision}
        showOverlay={true}
        feedOption={feedOption}
        isModal={isModal}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  videoContainer: {
    width: '100%',
    position: 'relative',
    margin: 0,
    padding: 0,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Helper to extract stable post identifiers
const getPostUri = (post: Post): string | undefined => {
  if ('uri' in post) return post.uri;
  if ('post' in post && typeof post.post === 'object' && post.post !== null && 'uri' in post.post) {
    return (post.post as { uri: string }).uri;
  }
  return undefined;
};

const getPostCid = (post: Post): string | undefined => {
  if ('cid' in post) return post.cid;
  if ('post' in post && typeof post.post === 'object' && post.post !== null && 'cid' in post.post) {
    return (post.post as { cid: string }).cid;
  }
  return undefined;
};

// Custom comparison function for memoization
// Compares by value (URI/CID + optional feed properties) rather than post object reference
// isVisible and allowPlayback are derived from store in the component; areEqual only compares props
const areEqual = (prevProps: VideoItemProps, nextProps: VideoItemProps) => {
  if (
    prevProps.height !== nextProps.height ||
    prevProps.feedOption !== nextProps.feedOption ||
    prevProps.canPlay !== nextProps.canPlay ||
    prevProps.isHeaderBlockingPlayback !== nextProps.isHeaderBlockingPlayback ||
    prevProps.isModal !== nextProps.isModal ||
    prevProps.index !== nextProps.index ||
    prevProps.shouldBlur !== nextProps.shouldBlur
  ) {
    return false;
  }

  // Compare feedItem by post URI (stable identifier) instead of object reference
  if (prevProps.feedItem?.post?.uri !== nextProps.feedItem?.post?.uri) {
    return false;
  }

  // Compare post by stable identifiers (URI/CID) instead of object reference
  if (
    getPostUri(prevProps.post) !== getPostUri(nextProps.post) ||
    getPostCid(prevProps.post) !== getPostCid(nextProps.post)
  ) {
    return false;
  }

  return true;
};

export default React.memo(VideoItem, areEqual);
export { VideoItem };
