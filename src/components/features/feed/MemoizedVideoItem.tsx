import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Platform, StyleProp, ViewStyle } from 'react-native';
import VideoCard, { VideoCardRef } from '../video/VideoCard';
import VideoOverlay from '../video/VideoOverlay';
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import Animated, { 
  useSharedValue, 
  SharedValue 
} from 'react-native-reanimated';
import { extractVideoEmbedAndUrl } from '../../../utils/helpers/video';
import { isSmallScreen, isTablet } from '../../../utils/helpers/screenSize';
import type { ModerationDecision } from '../../../services/ModerationTypes';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

export interface MemoizedVideoItemProps {
  post: Post;
  isPlaying?: boolean;
  handleVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  shouldPreload?: boolean;
  scrollY?: SharedValue<number>;
  feedOption?: 'yourMix' | 'following' | 'discover';
  isVisible?: boolean;
  moderationDecision?: ModerationDecision;
  onScrubbingChange?: (isScrubbing: boolean) => void;
}

// Memoized video extraction to avoid repeated calculations
const useVideoData = (post: Post) => {
  return useMemo(() => {
    const { videoEmbed, videoUrl } = extractVideoEmbedAndUrl(post);
    return { videoEmbed, videoUrl, hasVideo: !!videoUrl };
  }, [post.embed, post.uri]);
};

// Memoized styles to prevent recreation
const useMemoizedStyles = (itemHeight: number, isSmallDevice: boolean) => {
  return useMemo(() => ({
    container: [
      styles.videoContainer, 
      { 
        height: itemHeight,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000'
      }
    ] as StyleProp<ViewStyle>,
    overlay: [
      styles.overlayContainer,
      isSmallDevice && styles.overlayContainerSmallScreen
    ] as StyleProp<ViewStyle>
  }), [itemHeight, isSmallDevice]);
};

const VideoItem: React.FC<MemoizedVideoItemProps & { isModal?: boolean }> = ({
  post,
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
  const videoRef = useRef<VideoCardRef>(null) as React.RefObject<VideoCardRef>;

  // Create a local shared value if no external one is provided
  const localScrollY = useSharedValue(0);
  const scrollY = externalScrollY || localScrollY;

  const isSmallDevice = isSmallScreen() || isTablet();
  const itemHeight = height || SCREEN_HEIGHT;
  const isFullScreenCard = itemHeight >= SCREEN_HEIGHT - 1; // allow for rounding
  const progressBarAtCardBottom = isModal || (!isSmallDevice && !isFullScreenCard);

  // Use memoized video data
  const { videoEmbed, videoUrl, hasVideo } = useVideoData(post);

  // Use memoized styles
  const { container: containerStyle, overlay: overlayContainerStyle } = useMemoizedStyles(itemHeight, isSmallDevice);

  // Early return if no video
  if (!hasVideo) {
    return null;
  }

  // Memoize video status handler - optimized to prevent blocking scroll
  const handleVideoStatusChange = useCallback((uri: string, status: string) => {
    if (handleVideoStatus) {
      // Use requestAnimationFrame to prevent blocking scroll events
      requestAnimationFrame(() => {
        handleVideoStatus(uri, status);
      });
    }
  }, [handleVideoStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current?.unload) {
        videoRef.current.unload();
      }
    };
  }, []);

  // Memoize props for VideoOverlay to prevent unnecessary re-renders
  const memoizedPost = useMemo(() => post, [post]);
  const memoizedFeedOption = useMemo(() => feedOption, [feedOption]);
  // videoRef is already stable as a ref

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
          post={memoizedPost}
          isVisible={isVisible}
          scrollY={scrollY}
          prefetchProfile={shouldPreload || isVisible}
          videoRef={videoRef as React.RefObject<VideoCardRef>}
          feedOption={memoizedFeedOption}
          isModal={isModal}
          onScrubbingChange={onScrubbingChange}
          progressBarAtCardBottom={progressBarAtCardBottom}
        />
      </View>
      

    </View>
  );
};

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
    // For small screens, overlay extends to full screen
    bottom: 0,
  },

});

// Optimized memo comparison with deep equality for critical props
const MemoizedVideoItem = React.memo(
  VideoItem,
  (prevProps, nextProps) => {
    // Deep comparison for post object - optimized for performance
    const prevPost = prevProps.post;
    const nextPost = nextProps.post;
    
    // Quick URI check first (most common change)
    if (prevPost.uri !== nextPost.uri) return false;
    
    // Only check other post properties if URI is the same
    if (prevPost.embed !== nextPost.embed) return false;
    if (prevPost.author?.handle !== nextPost.author?.handle) return false;
    if (prevPost.author?.displayName !== nextPost.author?.displayName) return false;
    if (prevPost.author?.avatar !== nextPost.author?.avatar) return false;
    
    // Compare other critical props - optimized order (most likely to change first)
    if (prevProps.isVisible !== nextProps.isVisible) return false;
    if (prevProps.isPlaying !== nextProps.isPlaying) return false;
    if (prevProps.height !== nextProps.height) return false;
    if (prevProps.feedOption !== nextProps.feedOption) return false;
    if (prevProps.moderationDecision?.blur !== nextProps.moderationDecision?.blur) return false;
    if (prevProps.shouldPreload !== nextProps.shouldPreload) return false;
    if (prevProps.isModal !== nextProps.isModal) return false;
    
    return true;
  }
);

export default MemoizedVideoItem;