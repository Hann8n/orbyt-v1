/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

import VideoCard, { VideoCardRef } from '../video/VideoCard';
import { extractVideoEmbedAndUrl } from '../../../utils/helpers/video';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import type { ExtendedPostView, ExtendedFeedViewPost } from '../../../services/api/types';
import { Colors } from '../../ui/UI';

// VideoCard's Post type
type VideoCardPost = ExtendedPostView | ExtendedFeedViewPost;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Types
// Post can be ExtendedPostView, ExtendedFeedViewPost, or the simplified post structure from FeedItem
export type Post = ExtendedPostView | ExtendedFeedViewPost | {
  uri: string;
  cid: string;
  embed?: unknown;
  author?: {
    avatar?: string;
    displayName?: string;
    handle?: string;
  };
};

export interface FeedItem {
  post: Post;
  sourceFeed?: string;
}

// Simplified Video Item Component for immediate playback
export interface VideoItemProps {
  post: Post;
  feedItem?: FeedItem;
  height?: number;
  feedOption?: string;
  isVisible?: boolean;
  moderationDecision?: ModerationDecision;
  isModal?: boolean;
  index?: number;
  allowPlayback?: boolean;
}

const VideoItem: React.FC<VideoItemProps> = ({
  post,
  feedItem,
  height,
  feedOption,
  isVisible = false,
  moderationDecision,
  isModal = false,
  index = 0,
  allowPlayback = true,
}) => {
  const videoRef = useRef<VideoCardRef>(null);

  // Simplified calculations - no memoization needed for simple operations
  const itemHeight = height || SCREEN_HEIGHT;
  const { videoEmbed, videoUrl } = extractVideoEmbedAndUrl(post);
  const hasVideo = !!videoUrl;

  // Memoize container style to prevent recreation on every render
  const containerStyle = useMemo(
    () => [styles.videoContainer, { height: itemHeight, marginVertical: 3 }],
    [itemHeight]
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
        ref={videoRef}
        post={{ ...post, embed: videoEmbed } as VideoCardPost}
        isVisible={isVisible}
        shouldDisablePlayback={!allowPlayback}
        height={itemHeight}
        moderationDecision={moderationDecision}
        showOverlay={true}
        feedOption={feedOption}
        sourceFeed={feedItem?.sourceFeed}
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
  }
});

// Custom comparison function for better memoization
// Only rerender if props that actually affect rendering change
const areEqual = (prevProps: VideoItemProps, nextProps: VideoItemProps) => {
  // Compare primitive values
  if (
    prevProps.height !== nextProps.height ||
    prevProps.feedOption !== nextProps.feedOption ||
    prevProps.isVisible !== nextProps.isVisible ||
    prevProps.isModal !== nextProps.isModal ||
    prevProps.allowPlayback !== nextProps.allowPlayback ||
    prevProps.index !== nextProps.index
  ) {
    return false;
  }

  // Compare post URI and CID (stable identifiers)
  // Handle ExtendedPostView (has uri directly), ExtendedFeedViewPost (has post.uri), or simplified post structure
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
  
  if (getPostUri(prevProps.post) !== getPostUri(nextProps.post) || 
      getPostCid(prevProps.post) !== getPostCid(nextProps.post)) {
    return false;
  }

  // Compare moderation decision
  if (prevProps.moderationDecision !== nextProps.moderationDecision) {
    return false;
  }

  // Compare feedItem sourceFeed
  if (prevProps.feedItem?.sourceFeed !== nextProps.feedItem?.sourceFeed) {
    return false;
  }

  // If all checks pass, props are equal - skip rerender
  return true;
};

export default React.memo(VideoItem, areEqual);
export { VideoItem };
