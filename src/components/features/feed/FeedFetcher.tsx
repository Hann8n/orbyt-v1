import React from 'react';
import { View, StyleSheet, RefreshControl, Dimensions, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import ListFeedView from './ListFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeedQuery } from '../../../hooks/useFeedQuery';
import ProfileCache from '../../../services/cache/ProfileCache';
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import ListFeedDebugPanel from './ListFeedDebugPanel';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedFetcherProps {
  feedOption: 'yourMix' | 'profile' | 'following' | 'author' | 'likes' | 'reposts' | string;
  userDid?: string;
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  onRetryFeed?: () => void;
  queryOptions?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
  };
  secondaryColor?: string;
  isProfileLoading?: boolean;
  onPositionChange?: (position: number) => void;
  initialPosition?: number;
  initialIndex?: number;
  initialUri?: string;
  isVisible?: boolean;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  onVerticalScroll?: (scrollY: number) => void;
  isRefreshing?: boolean;
  isModal?: boolean;
}

// Add FeedFetcherDebugPanel component
const FeedFetcherDebugPanel = ({
  feed,
  isFetchingNextPage,
  hasNextPage,
  isLoading,
  isError,
  cursorPosition,
  preloadedVideos,
  queueStats,
  visibleIndex,
  visibleVideo,
  totalListLength,
}: any) => (
  <ListFeedDebugPanel title="FeedFetcher Debug Panel" style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
    <Text style={{ color: '#fff', fontSize: 12 }}>isFetchingNextPage: {String(isFetchingNextPage)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>hasNextPage: {String(hasNextPage)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>isLoading: {String(isLoading)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>isError: {String(isError)}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>cursorPosition: {cursorPosition}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>visibleIndex: {visibleIndex}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>visibleVideo: {visibleVideo}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>totalListLength: {totalListLength}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>Preloaded Videos: {preloadedVideos.length}</Text>
    <Text style={{ color: '#fff', fontSize: 12 }}>Queue Stats: {JSON.stringify(queueStats)}</Text>
  </ListFeedDebugPanel>
);

const FeedFetcher: React.FC<FeedFetcherProps> = ({
  feedOption,
  userDid,
  headerComponent,
  refreshControl,
  backgroundColor,
  onRetryFeed,
  queryOptions = {},
  secondaryColor,
  isProfileLoading,
  onPositionChange,
  initialPosition,
  initialIndex,
  initialUri,
  isVisible = true,
  viewMode,
  onViewModeChange,
  onVerticalScroll,
  isRefreshing = false,
  isModal = false,
}) => {
  const insets = useSafeAreaInsets();
  const lastPrefetchedFeedLength = useRef(0);

  // Debug state for cursor position, visible index, visible video
  const [cursorPosition, setCursorPosition] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [visibleVideo, setVisibleVideo] = useState<string | null>(null);

  // Handler to update position from ListFeedView
  const handlePositionChange = useCallback((position: number) => {
    setCursorPosition(position);
    if (onPositionChange) onPositionChange(position);
  }, [onPositionChange]);

  // Handler to update visible index/video from ListFeedView
  const handleVisibleChange = useCallback((index: number, video: string | null) => {
    setVisibleIndex(index);
    setVisibleVideo(video);
  }, []);

  // Get preloaded videos and queue stats from VideoPreloadManager
  const [preloadedVideos, setPreloadedVideos] = useState<string[]>([]);
  const [queueStats, setQueueStats] = useState<any>({});

  useEffect(() => {
    setPreloadedVideos(VideoPreloadManager.getPreloadedUris());
    setQueueStats(VideoPreloadManager.getQueueStats());
    const interval = setInterval(() => {
      setPreloadedVideos(VideoPreloadManager.getPreloadedUris());
      setQueueStats(VideoPreloadManager.getQueueStats());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Use the optimized feed query hook with maximum batch loading
  const {
    feed,
    isProfileFeed,
    error,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
    isPaused,
    isError
  } = useFeedQuery(feedOption, userDid, {
    ...queryOptions,
    staleTime: 10 * 60 * 1000, // 10 minutes for better caching
  });

  // Remove handleEndReached and onEndReached from ListFeedView
  // Add proactive queue filling logic

  const QUEUE_THRESHOLD = 3; // Minimum number of videos to keep preloaded

  const ensureQueueFilled = useCallback(() => {
    const preloadedCount = VideoPreloadManager.getPreloadedUris().length;
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isLoading &&
      !isError &&
      !isPaused &&
      preloadedCount < QUEUE_THRESHOLD
    ) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, isError, isPaused, fetchNextPage]);

  // Call ensureQueueFilled whenever the feed or visible index changes
  useEffect(() => {
    ensureQueueFilled();
  }, [feed, visibleIndex, ensureQueueFilled]);

  // Optimized profile prefetching for new items in background
  useEffect(() => {
    if (feed.length > 0 && feed.length !== lastPrefetchedFeedLength.current) {
      const newItems = feed.slice(lastPrefetchedFeedLength.current);
      if (newItems.length > 0) {
        // Batch prefetch profiles for better performance
        ProfileCache.batchPrefetchFromFeed(newItems).catch(error => {
          console.warn('Error batch prefetching profiles:', error);
        });
      }
      lastPrefetchedFeedLength.current = feed.length;
    }
  }, [feed]);

  /**
   * Handle retrying failed feed
   */
  const handleRetry = useCallback(() => {
    refetch();
    if (onRetryFeed) onRetryFeed();
  }, [refetch, onRetryFeed]);

  /**
   * Render an error if the query has failed
   */
  if (isError) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: backgroundColor || '#000' }]}>
        <EmptyFeed 
          type="error"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
          onRetry={handleRetry}
          feedOption={feedOption}
        />
      </View>
    );
  }

  // Show offline notice when network is unavailable
  if (isPaused) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: backgroundColor || '#000' }]}>
        <EmptyFeed 
          type="no-connection"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
          onRetry={handleRetry}
          feedOption={feedOption}
        />
      </View>
    );
  }

  // Use unified ListFeedView for all feed types
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor || '#000' }}>
      {(typeof globalThis !== 'undefined' && (globalThis as any).__FEED_FETCHER_DEBUG__ === true) && (
        <FeedFetcherDebugPanel
          feed={feed}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          isLoading={isLoading}
          isError={isError}
          cursorPosition={cursorPosition}
          preloadedVideos={preloadedVideos}
          queueStats={queueStats}
          visibleIndex={visibleIndex}
          visibleVideo={visibleVideo}
          totalListLength={feed.length}
        />
      )}
      <ListFeedView
        key={`${feedOption}-${userDid || 'default'}`}
        feed={feed}
        headerComponent={headerComponent}
        refreshControl={refreshControl}
        backgroundColor={backgroundColor}
        secondaryColor={secondaryColor}
        feedOption={feedOption}
        userDid={userDid}
        // onEndReached={handleEndReached} // REMOVE THIS LINE
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={handleRetry}
        onPositionChange={handlePositionChange}
        initialPosition={initialPosition}
        initialIndex={initialIndex}
        initialUri={initialUri}
        isVisible={isVisible}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onVerticalScroll={onVerticalScroll}
        isRefreshing={isRefreshing}
        isProfileLoading={isProfileLoading}
        onVisibleChange={handleVisibleChange}
        isModal={isModal}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 20,
  },
});

export default FeedFetcher;