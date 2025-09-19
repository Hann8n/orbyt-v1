/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useRecyclingState } from '@shopify/flash-list';

import VideoCard, { VideoCardRef } from '../video/VideoCard';
import { extractVideoEmbedAndUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import { Colors } from '../../ui/UI';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Types
export interface Post {
  embed?: any;
  uri: string;
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
  isPlaying?: boolean;
  handleVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  feedOption?: string;
  isVisible?: boolean;
  moderationDecision?: ModerationDecision;
  isModal?: boolean;
  index?: number;
}

const VideoItem: React.FC<VideoItemProps> = ({
  post,
  feedItem,
  isPlaying = false,
  handleVideoStatus,
  height,
  feedOption,
  isVisible = false,
  moderationDecision,
  isModal = false,
  index = 0,
}) => {
  const videoRef = useRef<VideoCardRef>(null);

  // Simplified calculations - no memoization needed for simple operations
  const itemHeight = height || SCREEN_HEIGHT;
  const { videoEmbed, videoUrl } = extractVideoEmbedAndUrl(post);
  const hasVideo = !!videoUrl;

  // Reset state when post changes
  useEffect(() => {
    if (videoRef.current?.seek) {
      try {
        videoRef.current.seek(0);
      } catch (e) {
        // Silently handle seek errors
      }
    }
  }, [post.uri]);

  // Simplified styles - no memoization needed for simple style objects
  const containerStyle = [styles.videoContainer, { height: itemHeight, marginVertical: 3 }];

  // Early return if no video
  if (!hasVideo) {
    return null;
  }

  // Simplified video status handler - no need for useCallback for simple functions
  const handleVideoStatusChange = (uri: string, status: string) => {
    requestAnimationFrame(() => {
      handleVideoStatus?.(uri, status);
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current?.unload) {
        videoRef.current.unload();
      }
    };
  }, []);

  return (
    <View style={containerStyle}>
      <VideoCard
        ref={videoRef}
        post={{ ...post, embed: videoEmbed }}
        isVisible={isVisible}
        shouldCache={true}
        onVideoStatus={handleVideoStatusChange}
        height={itemHeight}
        moderationDecision={moderationDecision}
        isPlaying={isPlaying}
        showOverlay={true}
                feedOption={feedOption as any}
        isModal={isModal}
      />
    </View>
  );
};

// Optimized React.memo for FlashList performance
const MemoizedVideoItem = React.memo(VideoItem, (prevProps, nextProps) => {
  // Only re-render on critical changes
  return (
    prevProps.post.uri === nextProps.post.uri &&
    prevProps.isVisible === nextProps.isVisible &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.height === nextProps.height &&
    prevProps.moderationDecision?.blur === nextProps.moderationDecision?.blur
  );
});

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

export default VideoItem;
export { MemoizedVideoItem, VideoItem };
