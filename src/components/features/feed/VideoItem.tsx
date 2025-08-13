/**
 * VideoItem Component
 * Updated for unified snapping system
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSharedValue, SharedValue } from 'react-native-reanimated';
import { useRecyclingState } from '@shopify/flash-list';

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

// Simplified Video Item Component for immediate playback
export interface VideoItemProps {
  post: Post;
  feedItem?: FeedItem;
  isPlaying?: boolean;
  handleVideoStatus?: (uri: string, status: string) => void;
  height?: number;
  scrollY?: SharedValue<number>;
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
  scrollY: externalScrollY,
  feedOption,
  isVisible = false,
  moderationDecision,
  isModal = false,
  onScrubbingChange,
  index = 0,
}) => {
  const videoRef = useRef<VideoCardRef>(null);
  const localScrollY = useSharedValue(0);
  const scrollY = externalScrollY || localScrollY;

  // Memoize device size checks to avoid repeated calls
  const isSmallDevice = useMemo(() => isSmallScreen() || isTablet(), []);
  
  // Simplified height calculation
  const itemHeight = useMemo(() => height || SCREEN_HEIGHT, [height]);
  
  // Simplified progress bar positioning with fewer conditions
  const progressBarAtCardBottom = useMemo(() => 
    isModal || isSmallDevice || itemHeight >= SCREEN_HEIGHT - 1, 
    [isModal, isSmallDevice, itemHeight]
  );

  // Simplified video data extraction
  const { videoEmbed, videoUrl, hasVideo } = useMemo(() => {
    const { videoEmbed, videoUrl } = extractVideoEmbedAndUrl(post);
    return { videoEmbed, videoUrl, hasVideo: !!videoUrl };
  }, [post.embed, post.uri]);

  // Reset state when post changes
  useRecyclingState(null, [post.uri], () => {
    if (videoRef.current?.seek) {
      try {
        videoRef.current.seek(0);
      } catch (e) {
        // Silently handle seek errors
      }
    }
  });

  // Simplified memoized styles
  const containerStyle = useMemo(() => [
    styles.videoContainer, 
    { height: itemHeight }
  ], [itemHeight]);

  // Removed duplicate style with overlayContainerSmallScreen as it's redundant
  const overlayContainerStyle = useMemo(() => [
    styles.overlayContainer,
    { height: itemHeight }
  ], [itemHeight]);

  // Early return if no video
  if (!hasVideo) {
    return null;
  }

  // Simplified video status handler
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
        shouldCache={true}
        onVideoStatus={handleVideoStatusChange}
        height={itemHeight}
        moderationDecision={moderationDecision}
        isPlaying={isPlaying}
      />
      <View style={overlayContainerStyle} pointerEvents="box-none">
        <VideoOverlay 
          post={post}
          isVisible={isVisible}
          scrollY={scrollY}
          prefetchProfile={isVisible}
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

// Simplified React.memo for performance
const MemoizedVideoItem = React.memo(VideoItem, (prevProps, nextProps) => {
  // Critical props that affect video rendering
  if (prevProps.post.uri !== nextProps.post.uri) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.isPlaying !== nextProps.isPlaying) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.moderationDecision?.blur !== nextProps.moderationDecision?.blur) return false;
  
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
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  }
});

export default VideoItem;
export { MemoizedVideoItem, VideoItem };
