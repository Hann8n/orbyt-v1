/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useRecyclingState } from '@shopify/flash-list';

import VideoCard, { VideoCardRef } from '../video/VideoCard';
import { extractVideoEmbedAndUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers/screenSize';
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
  onScrubbingChange?: (isScrubbing: boolean) => void;
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
  onScrubbingChange,
  index = 0,
}) => {
  const videoRef = useRef<VideoCardRef>(null);

  // Memoize device size checks to avoid repeated calls
  const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
  
  // Simplified height calculation
  const itemHeight = useMemo(() => height || SCREEN_HEIGHT, [height]);
  


  // Simplified video data extraction
  const { videoEmbed, videoUrl, hasVideo } = useMemo(() => {
    const { videoEmbed, videoUrl } = extractVideoEmbedAndUrl(post);
    return { videoEmbed, videoUrl, hasVideo: !!videoUrl };
  }, [post.embed, post.uri]);

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

  // Optimized memoized styles
  const containerStyle = useMemo(() => [
    styles.videoContainer, 
    { height: itemHeight, marginVertical: 3 }
  ], [itemHeight]);

  // Early return if no video
  if (!hasVideo) {
    return null;
  }

  // Simplified video status handler
  const handleVideoStatusChange = useCallback((uri: string, status: string) => {
    // Defer the status update to prevent React state update during render
    requestAnimationFrame(() => {
      handleVideoStatus?.(uri, status);
    });
  }, [handleVideoStatus]);

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
