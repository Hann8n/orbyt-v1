/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

import VideoCard, { VideoCardRef } from '../video/VideoCard';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import { Colors } from '../../ui/UI';

// VideoCard's Post type
type VideoCardPost = ExtendedPostView | ExtendedFeedViewPost;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Types
// Post can be ExtendedPostView, ExtendedFeedViewPost, or simplified post structure
export type Post =
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
  isVisible?: boolean;
  shouldBlur?: boolean; // Simple flag from parent (computed at feed level for performance)
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
  shouldBlur = false, // Simple flag from parent (computed at feed level)
  isModal = false,
  index: _index = 0,
  allowPlayback = true,
}) => {
  const videoRef = useRef<VideoCardRef>(null);

  // Simplified calculations - no memoization needed for simple operations
  const itemHeight = height || SCREEN_HEIGHT;

  // Extract video embed and URL using getVideoView helper + direct property access
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const videoEmbed = videoView;
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
const areEqual = (prevProps: VideoItemProps, nextProps: VideoItemProps) => {
  // Compare primitives
  if (
    prevProps.height !== nextProps.height ||
    prevProps.feedOption !== nextProps.feedOption ||
    prevProps.isVisible !== nextProps.isVisible ||
    prevProps.isModal !== nextProps.isModal ||
    prevProps.allowPlayback !== nextProps.allowPlayback ||
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
