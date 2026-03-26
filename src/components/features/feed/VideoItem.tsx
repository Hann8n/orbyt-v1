/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

import { useVisibilityCoreStore } from '../../../core/visibility';
import VideoCard from '../video/VideoCard';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
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
  isModal?: boolean;
  index?: number;
}

const VideoItem: React.FC<VideoItemProps> = ({
  post,
  feedItem,
  height,
  feedOption,
  feedKey,
  canPlay = false,
  isHeaderBlockingPlayback = false,
  isModal = false,
  index = 0,
}) => {
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

  // Normalize post so VideoCard can read `embed` consistently
  const normalizedPost = { ...post, embed: videoView } as VideoCardPost;

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
        showOverlay={true}
        feedOption={feedOption}
        isModal={isModal}
        index={index}
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

export default VideoItem;
export { VideoItem };
