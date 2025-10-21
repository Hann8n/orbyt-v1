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

  // Simple video status handler - uses post URI for tracking
  const handleVideoStatusChange = (uri: string, status: string) => {
    requestAnimationFrame(() => {
      handleVideoStatus?.(uri, status);
    });
  };

  // Enhanced cleanup on unmount for better memory management
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        // Ensure video is paused
        try {
          videoRef.current.pause?.();
        } catch (e) {
          // Silently handle pause errors
        }
        
        // Reset position to beginning
        try {
          videoRef.current.seek?.(0);
        } catch (e) {
          // Silently handle seek errors
        }
        
        // Unload video resources
        try {
          videoRef.current.unload?.();
        } catch (e) {
          // Silently handle unload errors
        }
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
        showOverlay={true}
        feedOption={feedOption as any}
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

export default React.memo(VideoItem);
export { VideoItem };
