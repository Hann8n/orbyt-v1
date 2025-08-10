/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSharedValue, SharedValue } from 'react-native-reanimated';

import VideoCard, { VideoCardRef } from '../video/VideoCard';
import VideoOverlay from '../video/VideoOverlay';
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
  
  // Unified height calculation - Restored original 9:16 design
  const itemHeight = useMemo(() => {
    if (height) return height;
    
    // Use the provided height or fallback to screen height
    // This maintains the original design where videos have uniform spacing
    return SCREEN_HEIGHT;
  }, [height]);
  
  // Determine if this is a full screen card
  const isFullScreenCard = itemHeight >= SCREEN_HEIGHT - 1;
  
  // Progress bar positioning logic - Restored original logic
  const progressBarAtCardBottom = useMemo(() => {
    // In modals, always put progress bar at bottom
    if (isModal) return true;
    
    // For small devices, always put progress bar at bottom
    if (isSmallDevice) return true;
    
    // For large devices with full screen cards, put progress bar at bottom
    if (isFullScreenCard) return true;
    
    // For large devices with smaller cards, put progress bar at top of navigation
    return false;
  }, [isModal, isSmallDevice, isFullScreenCard]);

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
      backgroundColor: Colors.black
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

  // Optimized video status handler
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

// Optimized memo comparison
const MemoizedVideoItem = React.memo(VideoItem, (prevProps, nextProps) => {
  // Critical props that affect rendering
  if (prevProps.post.uri !== nextProps.post.uri) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.isPlaying !== nextProps.isPlaying) return false;
  if (prevProps.shouldPreload !== nextProps.shouldPreload) return false;
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
    backgroundColor: Colors.black,
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
