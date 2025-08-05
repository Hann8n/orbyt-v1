/**
 * Unified Feed Hook
 * Consolidates useFeedQuery and useInfiniteScroll functionality
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useCallback, useRef, useEffect } from 'react';
import { NativeScrollEvent } from 'react-native';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useSubscribedChannels } from './useSubscribedChannels';

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

  // Create infinite query
  const query = feedService.createInfiniteQuery(feedOption, userDid, {
    enabled,
    ...queryOptions
  });

  // Flatten the pages for a single data array
  const feed = query.data?.pages.flatMap(page => page.feed).filter(Boolean) || [];

  // Infinite scroll state
  const isNearEndRef = useRef(false);

  // Create scroll handler
  const onScroll = useCallback(
    feedService.createInfiniteScrollHandler({
      threshold,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      onLoadMore: query.fetchNextPage,
      debounceMs,
    }),
    [threshold, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, debounceMs]
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
 */
export function useSearchFeed(
  hasNextPage?: boolean,
  isFetchingNextPage?: boolean,
  fetchNextPage?: () => void,
  options: UseFeedOptions = {}
) {
  const {
    threshold = 0.8,
    debounceMs = 100,
  } = options;

  // Get search feed from global state
  const feed = feedService.getCurrentFeed();
  const isNearEndRef = useRef(false);

  // Create scroll handler for search
  const onScroll = useCallback(
    feedService.createInfiniteScrollHandler({
      threshold,
      hasNextPage: hasNextPage ?? false,
      isFetchingNextPage: isFetchingNextPage ?? false,
      onLoadMore: fetchNextPage ?? (() => {}),
      debounceMs,
    }),
    [threshold, hasNextPage, isFetchingNextPage, fetchNextPage, debounceMs]
  );

  return {
    feed,
    onScroll,
    isNearEnd: isNearEndRef.current,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage: isFetchingNextPage ?? false,
    fetchNextPage: fetchNextPage ?? (() => {}),
  };
}

export default useFeed;