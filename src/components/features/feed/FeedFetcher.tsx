import React from 'react';
import { View, StyleSheet, RefreshControl, Dimensions, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import ListFeedView from './ListFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeedQuery } from '../../../hooks/useFeedQuery';
import ProfileCache from '../../../services/cache/ProfileCache';
import VideoPreloadManager from '../../../services/VideoPreloadManager';
import ListFeedDebugPanel from './ListFeedDebugPanel';
import { getCurrentFeed } from '../../../services/FeedStore';
import AccountManager from '../../../services/storage/AccountManager';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedFetcherProps {
  // Core feed configuration
  feedOption: 'yourMix' | 'profile' | 'following' | 'author' | 'likes' | 'reposts' | string;
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
  
  // Debug flag to force error responses
  forceError?: boolean;
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
  onScrubbingChange,
  searchQuery,
  hasNextPage: searchHasNextPage,
  isFetchingNextPage: searchIsFetchingNextPage,
  fetchNextPage: searchFetchNextPage,
  forceError = false, // Add debug flag to force error responses
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

  // For search results, use the current feed from FeedStore
  const searchFeed = feedOption === 'search' ? getCurrentFeed() : null;
  
  // For search feeds, we need to handle dynamic updates when new pages are loaded
  const [searchFeedState, setSearchFeedState] = useState<any[]>([]);
  
  // Update search feed state when searchFeed changes
  useEffect(() => {
    if (feedOption === 'search' && searchFeed) {
      setSearchFeedState(searchFeed);
    }
  }, [searchFeed, feedOption]);
  
  // Only use useFeedQuery for non-search feeds
  const queryResult = feedOption !== 'search' ? useFeedQuery(feedOption, userDid, {
    ...queryOptions,
    staleTime: 10 * 60 * 1000, // 10 minutes for better caching
  }) : null;

  // Use search feed if available, otherwise use query feed
  const feed = feedOption === 'search' ? searchFeedState : (queryResult?.feed || []);
  // Use the regular query for all feeds
  const activeQuery = queryResult;
  
  const isProfileFeed = activeQuery?.isProfileFeed || false;
  const error = activeQuery?.error || null;
  const isLoading = activeQuery?.isLoading || false;
  const isFetchingNextPage = feedOption === 'search' ? (searchIsFetchingNextPage || false) : (activeQuery?.isFetchingNextPage || false);
  const hasNextPage = feedOption === 'search' ? (searchHasNextPage || false) : (activeQuery?.hasNextPage || false);
  const fetchNextPage = feedOption === 'search' ? (searchFetchNextPage || (() => {})) : (activeQuery?.fetchNextPage || (() => {}));
  const refetch = activeQuery?.refetch || (() => {});
  const isPaused = activeQuery?.isPaused || false;
  const isError = activeQuery?.isError || false;

  // Force error state if forceError flag is enabled
  const forcedError = forceError ? new Error('Forced error for testing purposes') : null;
  const forcedIsError = forceError || isError;
  const forcedErrorState = forceError ? forcedError : error;

  // Improved loading state: show loader when feed is empty, especially for yourMix
  const shouldShowLoader = isLoading || (feed.length === 0 && feedOption === 'yourMix');

  // Proactive fetching logic - starts fetching before user reaches the end
  // This is especially important for mixed feeds (yourMix) which take time to process
  const [shouldProactivelyFetch, setShouldProactivelyFetch] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const proactiveFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine when to start proactive fetching based on feed type and current position
  const shouldStartProactiveFetch = useCallback((currentIndex: number, totalLength: number) => {
    if (!hasNextPage || isFetchingNextPage) return false;
    
    // For mixed feeds (yourMix), start fetching earlier since they take more time to process
    if (feedOption === 'yourMix') {
      // Start fetching when user is 3 items away from the end (reduced from 5)
      return currentIndex >= totalLength - 3;
    }
    
    // For other feeds, start fetching when user is 2 items away from the end (reduced from 3)
    return currentIndex >= totalLength - 2;
  }, [hasNextPage, isFetchingNextPage, feedOption]);

  // Handle proactive fetching
  const handleProactiveFetch = useCallback(() => {
    if (!shouldProactivelyFetch || isFetchingNextPage || !hasNextPage) return;
    
    const now = Date.now();
    // Prevent too frequent fetching (minimum 2 seconds between fetches)
    if (now - lastFetchTime < 2000) return;
    
    console.log(`[FeedFetcher] Proactively fetching more data for ${feedOption}`);
    setLastFetchTime(now);
    fetchNextPage();
  }, [shouldProactivelyFetch, isFetchingNextPage, hasNextPage, lastFetchTime, fetchNextPage, feedOption]);

  // Set up proactive fetching timeout
  useEffect(() => {
    if (shouldProactivelyFetch && !isFetchingNextPage && hasNextPage) {
      // Clear existing timeout
      if (proactiveFetchTimeoutRef.current) {
        clearTimeout(proactiveFetchTimeoutRef.current);
      }
      
      // Set new timeout for proactive fetch
      proactiveFetchTimeoutRef.current = setTimeout(() => {
        handleProactiveFetch();
      }, 500); // Reduced from 1000ms to 500ms for faster loading
    } else {
      // Clear timeout if conditions aren't met
      if (proactiveFetchTimeoutRef.current) {
        clearTimeout(proactiveFetchTimeoutRef.current);
        proactiveFetchTimeoutRef.current = null;
      }
    }
    
    return () => {
      if (proactiveFetchTimeoutRef.current) {
        clearTimeout(proactiveFetchTimeoutRef.current);
      }
    };
  }, [shouldProactivelyFetch, isFetchingNextPage, hasNextPage, handleProactiveFetch]);

  // Handle proactive fetching when visible index changes
  useEffect(() => {
    if (visibleIndex >= 0 && feed.length > 0) {
      const shouldStart = shouldStartProactiveFetch(visibleIndex, feed.length);
      setShouldProactivelyFetch(shouldStart);
      
      if (shouldStart) {
        console.log(`[FeedFetcher] Proactive fetching triggered for ${feedOption} at index ${visibleIndex}/${feed.length}`);
      }
    }
  }, [visibleIndex, feed.length, shouldStartProactiveFetch, feedOption]);

  // Remove handleEndReached and onEndReached from ListFeedView
  // Add proactive queue filling logic

  const QUEUE_THRESHOLD = 2; // Reduced from 3 for faster loading

  const ensureQueueFilled = useCallback(() => {
    const preloadedCount = VideoPreloadManager.getPreloadedUris().length;
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isLoading &&
      !forcedIsError && // Use forced error state
      !isPaused &&
      preloadedCount < QUEUE_THRESHOLD
    ) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, forcedIsError, isPaused, fetchNextPage]);

  // Call ensureQueueFilled whenever the feed or visible index changes
  useEffect(() => {
    ensureQueueFilled();
  }, [feed, visibleIndex, ensureQueueFilled]);

  // Optimized profile prefetching for new items in background (only for non-search feeds)
  useEffect(() => {
    if (feedOption !== 'search' && feed.length > 0 && feed.length !== lastPrefetchedFeedLength.current) {
      const newItems = feed.slice(lastPrefetchedFeedLength.current);
      if (newItems.length > 0) {
        // Batch prefetch profiles for better performance
        ProfileCache.batchPrefetchFromFeed(newItems).catch(error => {
          console.warn('Error batch prefetching profiles:', error);
        });
      }
      lastPrefetchedFeedLength.current = feed.length;
    }
  }, [feed, feedOption]);

  /**
   * Handle retrying failed feed
   */
  const handleRetry = useCallback(() => {
    refetch();
    if (onRetryFeed) onRetryFeed();
  }, [refetch, onRetryFeed]);

  /**
   * Render an error if the query has failed (only for non-search feeds)
   */
  if (forcedIsError && feedOption !== 'search') {
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

  // Show offline notice when network is unavailable (only for non-search feeds)
  if (isPaused && feedOption !== 'search') {
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
          isError={forcedIsError} // Use forced error state
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
        onEndReached={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        isLoading={feedOption === 'search' ? false : shouldShowLoader}
        isError={feedOption === 'search' ? false : forcedIsError} // Use forced error state
        error={feedOption === 'search' ? null : forcedErrorState} // Use forced error state
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
        onScrubbingChange={onScrubbingChange}
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