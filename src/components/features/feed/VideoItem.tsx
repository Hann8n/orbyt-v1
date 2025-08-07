/**
 * VideoItem Component
 * Extracted from FeedRenderer to break circular dependency
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSharedValue, SharedValue } from 'react-native-reanimated';

import VideoCard, { VideoCardRef } from '../video/VideoCard';
import VideoOverlay from '../video/VideoOverlay';
import { extractVideoEmbedAndUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

// Video Item Component
export interface VideoItemProps {
  post: Post;
  feedItem?: FeedItem;
  isPlaying?: boolean;
  handleVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  shouldPreload?: boolean;
  scrollY?: SharedValue<number>;
  feedOption?: string;
  isVisible?: boolean;
  moderationDecision?: ModerationDecision;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  isModal?: boolean;
}

const VideoItem: React.FC<VideoItemProps> = ({
  post,
  feedItem,
  isPlaying = false,
  handleVideoStatus,
  height,
  shouldPreload = false,
  scrollY: externalScrollY,
  feedOption,
  isVisible = false,
  moderationDecision,
  isModal = false,
  onScrubbingChange,
}) => {
  const videoRef = useRef<VideoCardRef>(null);
  const localScrollY = useSharedValue(0);
  const scrollY = externalScrollY || localScrollY;

  const isSmallDevice = isSmallScreen() || isTablet();
  const itemHeight = height || SCREEN_HEIGHT;
  const isFullScreenCard = itemHeight >= SCREEN_HEIGHT - 1;
  const progressBarAtCardBottom = isModal || (!isSmallDevice && !isFullScreenCard);

  // Memoized video data
  const { videoEmbed, videoUrl, hasVideo } = useMemo(() => {
    const { videoEmbed, videoUrl } = extractVideoEmbedAndUrl(post);
    return { videoEmbed, videoUrl, hasVideo: !!videoUrl };
  }, [post.embed, post.uri]);

  // Memoized styles
  const containerStyle = useMemo(() => [
    styles.videoContainer, 
    { 
      height: itemHeight,
      width: '100%' as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      backgroundColor: '#000'
    }
  ], [itemHeight]);

  const overlayContainerStyle = useMemo(() => [
    styles.overlayContainer,
    isSmallDevice && styles.overlayContainerSmallScreen
  ], [isSmallDevice]);

  // Early return if no video
  if (!hasVideo) {
    return null;
  }

  // Optimized video status handler - removed requestAnimationFrame for better scroll performance
  const handleVideoStatusChange = useCallback((uri: string, status: string) => {
    handleVideoStatus?.(uri, status);
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
        shouldPreload={shouldPreload}
        shouldCache={true}
        onVideoStatus={handleVideoStatusChange}
        height={itemHeight}
        moderationDecision={moderationDecision}
      />
      <View style={overlayContainerStyle}>
        <VideoOverlay 
          post={post}
          isVisible={isVisible}
          scrollY={scrollY}
          prefetchProfile={shouldPreload || isVisible}
          videoRef={videoRef as React.RefObject<VideoCardRef>}
          feedOption={feedOption as 'yourMix' | 'following' | 'discover'}
          sourceFeed={feedItem?.sourceFeed}
          isModal={isModal}
          onScrubbingChange={onScrubbingChange}
          progressBarAtCardBottom={progressBarAtCardBottom}
        />
      </View>
    </View>
  );
};

// Optimized memo comparison - balanced for performance and functionality
const MemoizedVideoItem = React.memo(VideoItem, (prevProps, nextProps) => {
  // Critical props that affect rendering
  if (prevProps.post.uri !== nextProps.post.uri) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.isPlaying !== nextProps.isPlaying) return false;
  if (prevProps.shouldPreload !== nextProps.shouldPreload) return false; // Important for preloading
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.isModal !== nextProps.isModal) return false;
  
  return true;
});

const styles = StyleSheet.create({
  videoContainer: {
    width: '100%',
    position: 'relative',
    margin: 0,
    padding: 0,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  overlayContainerSmallScreen: {
    bottom: 0,
  },
});

export default VideoItem;
export { MemoizedVideoItem, VideoItem };
