/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useCallback, useRef, useEffect } from 'react';
import { NativeScrollEvent } from 'react-native';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useSubscribedChannels } from './useSubscribedChannels';

// Feed configuration constants - centralized for consistency across hooks
export const FEED_CONFIG = {
  // Cache and performance settings
  STALE_TIME: 7 * 60 * 1000,     // 7 minutes stale time 
  GC_TIME: 15 * 60 * 1000,       // 15 minutes before garbage collection
  RETRY_DELAY: 800,              // Milliseconds between retry attempts
  MAX_RETRIES: 3,                // Maximum retry attempts
  
  // Scroll and prefetch settings
  THROTTLE_MS: 80,               // Scroll event throttling in milliseconds
  PREFETCH_THRESHOLD: 0.75,      // Prefetch when within 75% of visible content
} as const;

interface UseFeedOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
  // Infinite scroll options
  threshold?: number;
  debounceMs?: number;
}

interface UseFeedReturn {
  // Data
  feed: FeedItem[];
  isLoading: boolean;
  isError: boolean;
  error: any;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  isProfileFeed: boolean;
  isPaused: boolean;
  
  // Actions
  fetchNextPage: () => void;
  refetch: () => void;
  
  // Infinite scroll
  onScroll: (event: { nativeEvent: NativeScrollEvent }) => void;
  isNearEnd: boolean;
}

/**
 * Comprehensive feed hook that handles data fetching and infinite scrolling
 */
export function useFeed(
  feedOption: FeedOption, 
  userDid?: string, 
  options: UseFeedOptions = {}
): UseFeedReturn {
  const {
    enabled = true,
    threshold = 0.8,
    debounceMs = 100,
    ...queryOptions
  } = options;

  // Get subscribed channels for your mix feed
  const { channels: subscribedChannels = [] } = useSubscribedChannels();

  // Update feed service with subscribed channels
  useEffect(() => {
    feedService.setSubscribedChannels(subscribedChannels);
  }, [subscribedChannels]);

  // Create optimized infinite query with centralized configuration
  const query = feedService.createInfiniteQuery(feedOption, userDid, {
    enabled,
    staleTime: FEED_CONFIG.STALE_TIME,
    gcTime: FEED_CONFIG.GC_TIME,
    retry: FEED_CONFIG.MAX_RETRIES,
    retryDelay: FEED_CONFIG.RETRY_DELAY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
    ...queryOptions
  });

  // Flatten the pages for a single data array
  const feed = query.data?.pages.flatMap(page => page.feed).filter(Boolean) || [];

  // Infinite scroll state
  const isNearEndRef = useRef(false);

  // Create optimized scroll handler with centralized configuration
  const onScroll = useCallback(
    feedService.createInfiniteScrollHandler({
      threshold: FEED_CONFIG.PREFETCH_THRESHOLD,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      onLoadMore: query.fetchNextPage,
      debounceMs: FEED_CONFIG.THROTTLE_MS,
    }),
    [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]
  );

  // Determine if this is a profile feed
  const isProfileFeed = (
    feedOption === 'profile' || 
    feedOption === 'likes' || 
    feedOption === 'reposts' || 
    feedOption.startsWith('at://')
  ) && Boolean(userDid);

  return {
    // Data
    feed,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isProfileFeed,
    isPaused: query.isPaused ?? false,
    
    // Actions
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    
    // Infinite scroll
    onScroll,
    isNearEnd: isNearEndRef.current,
  };
}

/**
 * Hook specifically for search feeds that use the global feed state
 * Streamlined to use the same config constants as useFeed
 */
export function useSearchFeed(
  hasNextPage?: boolean,
  isFetchingNextPage?: boolean,
  fetchNextPage?: () => void,
  options: UseFeedOptions = {}
) {
  // Use the same default threshold for consistency
  const threshold = options.threshold ?? FEED_CONFIG.PREFETCH_THRESHOLD;
  const debounceMs = options.debounceMs ?? FEED_CONFIG.THROTTLE_MS;

  // Get search feed from global state
  const feed = feedService.getCurrentFeed();
  const isNearEndRef = useRef(false);

  // Create scroll handler with same configuration as main feed
  const onScroll = useCallback(
    feedService.createInfiniteScrollHandler({
      threshold,
      hasNextPage: !!hasNextPage,
      isFetchingNextPage: !!isFetchingNextPage,
      onLoadMore: fetchNextPage || (() => {}),
      debounceMs,
    }),
    [threshold, hasNextPage, isFetchingNextPage, fetchNextPage, debounceMs]
  );

  return {
    feed,
    onScroll,
    isNearEnd: isNearEndRef.current,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage: !!isFetchingNextPage,
    fetchNextPage: fetchNextPage || (() => {}),
  };
}

export default useFeed;