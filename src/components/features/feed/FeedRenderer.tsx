/**
 * Unified Feed Renderer
 * Consolidates FeedFetcher.tsx and MemoizedVideoItem.tsx functionality
 * Provides a single component for rendering feeds with video items
 */

import React, { useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, SharedValue } from 'react-native-reanimated';

import ListFeedView from './ListFeedView';
import GridFeedView from './GridFeedView';
import EmptyFeed from './EmptyFeed';
import VideoCard, { VideoCardRef } from '../video/VideoCard';
import VideoOverlay from '../video/VideoOverlay';
import ListFeedDebugPanel from './ListFeedDebugPanel';

import { useFeed, useSearchFeed } from '../../../hooks/useFeed';
import { feedService } from '../../../services/FeedService';
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

// Memoized Video Item Component
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

  // Optimized video status handler
  const handleVideoStatusChange = useCallback((uri: string, status: string) => {
    if (handleVideoStatus) {
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
  const prevPost = prevProps.post;
  const nextPost = nextProps.post;
  
  if (prevPost.uri !== nextPost.uri) return false;
  if (prevPost.embed !== nextPost.embed) return false;
  if (prevPost.author?.handle !== nextPost.author?.handle) return false;
  if (prevPost.author?.displayName !== nextPost.author?.displayName) return false;
  if (prevPost.author?.avatar !== nextPost.author?.avatar) return false;
  
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.isPlaying !== nextProps.isPlaying) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.feedOption !== nextProps.feedOption) return false;
  if (prevProps.moderationDecision?.blur !== nextProps.moderationDecision?.blur) return false;
  if (prevProps.shouldPreload !== nextProps.shouldPreload) return false;
  if (prevProps.isModal !== nextProps.isModal) return false;
  
  return true;
});

// Main Feed Renderer Props
interface FeedRendererProps {
  // Core feed configuration
  feedOption: string;
  userDid?: string;
  
  // UI configuration
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  
  // Feed state
  isProfileLoading?: boolean;
  isRefreshing?: boolean;
  isVisible?: boolean;
  isModal?: boolean;
  
  // View mode
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  
  // Callbacks
  onRetryFeed?: () => void;
  onPositionChange?: (position: number) => void;
  onVerticalScroll?: (scrollY: number) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  
  // Initial state
  initialPosition?: number;
  initialIndex?: number;
  initialUri?: string;
  
  // Search-specific props
  searchQuery?: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  
  // Query options
  queryOptions?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
  };
  
  // Debug flag
  forceError?: boolean;
}

// Debug Panel Component
const FeedDebugPanel = ({ 
  feed, 
  isFetchingNextPage, 
  hasNextPage, 
  isLoading, 
  isError 
}: any) => (
  <ListFeedDebugPanel title="Feed Debug Panel" style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
    <Text style={{ color: '#fff', fontSize: 12 }}>isFetchingNextPage: {String(isFetchingNextPage)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>hasNextPage: {String(hasNextPage)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>isLoading: {String(isLoading)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>isError: {String(isError)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>feedLength: {feed?.length || 0}</Text>
  </ListFeedDebugPanel>
);

// Main Feed Renderer Component
const FeedRenderer: React.FC<FeedRendererProps> = ({
  feedOption,
  userDid,
  headerComponent,
  refreshControl,
  backgroundColor = '#000',
  secondaryColor,
  onRetryFeed,
  queryOptions = {},
  isProfileLoading,
  onPositionChange,
  initialPosition,
  initialIndex,
  initialUri,
  isVisible = true,
  viewMode = 'list',
  onViewModeChange,
  onVerticalScroll,
  isRefreshing = false,
  isModal = false,
  onScrubbingChange,
  // Search props
  hasNextPage: searchHasNextPage,
  isFetchingNextPage: searchIsFetchingNextPage,
  fetchNextPage: searchFetchNextPage,
  forceError = false,
}) => {
  // Use appropriate hook based on feed type
  const isSearchFeed = feedOption === 'search';
  
  // Regular feed hook
  const feedQuery = useFeed(feedOption, userDid, {
    enabled: !isSearchFeed,
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...queryOptions,
  });

  // Search feed hook
  const searchFeedQuery = useSearchFeed(
    searchHasNextPage,
    searchIsFetchingNextPage,
    searchFetchNextPage,
    queryOptions
  );

  // Select appropriate query results
  const {
    feed,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isPaused,
    isProfileFeed,
    onScroll
  } = isSearchFeed ? {
    ...searchFeedQuery,
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
    isPaused: false,
    isProfileFeed: false,
  } : feedQuery;

  // Force error state if enabled
  const forcedError = forceError ? new Error('Forced error for testing') : null;
  const forcedIsError = forceError || isError;
  const forcedErrorState = forceError ? forcedError : error;

  // Show loader when feed is empty, especially for yourMix
  const shouldShowLoader = isLoading || (feed.length === 0 && feedOption === 'yourMix');

  // Handle retry
  const handleRetry = useCallback(() => {
    refetch();
    if (onRetryFeed) onRetryFeed();
  }, [refetch, onRetryFeed]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Error state
  if (forcedIsError && !isSearchFeed) {
    return (
      <View style={[styles.errorContainer, { backgroundColor }]}>
        <EmptyFeed 
          type="error"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
          onRetry={handleRetry}
          feedOption={feedOption}
        />
      </View>
    );
  }

  // Offline state
  if (isPaused && !isSearchFeed) {
    return (
      <View style={[styles.errorContainer, { backgroundColor }]}>
        <EmptyFeed 
          type="no-connection"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
          onRetry={handleRetry}
          feedOption={feedOption}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor }}>
      {viewMode === 'grid' ? (
        <GridFeedView
          feed={feed}
          headerComponent={headerComponent}
          refreshControl={refreshControl}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          feedOption={feedOption}
          userDid={userDid}
          onLoadMore={handleLoadMore}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          isError={isSearchFeed ? false : forcedIsError}
          error={isSearchFeed ? null : forcedErrorState}
          onRetry={handleRetry}
          isProfileLoading={isProfileLoading}
          isProfileFeed={isProfileFeed}
        />
      ) : (
        <ListFeedView
          key={`${feedOption}-${userDid || 'default'}`}
          feed={feed}
          headerComponent={headerComponent}
          refreshControl={refreshControl}
          backgroundColor={backgroundColor}
          secondaryColor={secondaryColor}
          feedOption={feedOption}
          userDid={userDid}
          onLoadMore={handleLoadMore}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          isLoading={isSearchFeed ? false : shouldShowLoader}
          isError={isSearchFeed ? false : forcedIsError}
          error={isSearchFeed ? null : forcedErrorState}
          onRetry={handleRetry}
          onPositionChange={onPositionChange}
          initialPosition={initialPosition}
          initialIndex={initialIndex}
          initialUri={initialUri}
          isVisible={isVisible}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onVerticalScroll={onVerticalScroll}
          isRefreshing={isRefreshing}
          isProfileLoading={isProfileLoading}
          isModal={isModal}
          onScrubbingChange={onScrubbingChange}
          onScroll={onScroll}
        />
      )}
      
      {__DEV__ && (
        <FeedDebugPanel
          feed={feed}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          isLoading={isLoading}
          isError={forcedIsError}
        />
      )}
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
    bottom: 0,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 20,
  },
});

export default FeedRenderer;
export { MemoizedVideoItem, VideoItem };