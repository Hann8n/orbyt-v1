/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

import VideoCard, { VideoCardRef } from '../video/VideoCard';
import { extractVideoEmbedAndUrl } from '../../../utils/helpers/video';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import { Colors } from '../../ui/UI';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Types
export interface Post {
  embed?: any;
  uri: string;
  cid?: string;
  author?: {
    avatar?: string;
    displayName?: string;
    handle?: string;
  };
  moderationDecision?: ModerationDecision;
}

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

  // Simplified styles - no memoization needed for simple style objects
  const containerStyle = [styles.videoContainer, { height: itemHeight, marginVertical: 3 }];

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
        post={{ ...post, embed: videoEmbed }}
        isVisible={isVisible}
        shouldDisablePlayback={!allowPlayback}
        height={itemHeight}
        moderationDecision={moderationDecision}
        showOverlay={true}
        feedOption={feedOption as any}
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
  if (
    prevProps.post?.uri !== nextProps.post?.uri ||
    prevProps.post?.cid !== nextProps.post?.cid
  ) {
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
