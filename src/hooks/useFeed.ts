/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useCallback, useRef, useEffect } from 'react';
import { NativeScrollEvent } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useSubscribedChannels } from './useSubscribedChannels';
import { useCurrentUser } from '../stores/userStore';
import { preloadThumbnailColors } from '../utils/helpers/video';

// Optimized feed configuration for smooth performance
export const FEED_CONFIG = {
  // Cache and performance settings
  STALE_TIME: 5 * 60 * 1000,     // 5 minutes stale time - fresher content
  GC_TIME: 10 * 60 * 1000,       // 10 minutes before garbage collection
  RETRY_DELAY: 1000,             // Longer delay to reduce server load
  MAX_RETRIES: 2,                // Reduced retries for faster failure handling
  
  // Scroll and prefetch settings
  THROTTLE_MS: 150,              // Increased throttling for smoother scrolling
  PREFETCH_THRESHOLD: 0.8,       // Higher threshold to reduce premature loading
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
  
  // Removed onScroll - using FlashList's onEndReached
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

  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  // Get subscribed channels for your mix feed
  const { channels: subscribedChannels = [] } = useSubscribedChannels();

  // Invalidate feed queries when user changes
  useEffect(() => {
    if (currentUser?.did) {
      // Invalidate all feed queries when user changes
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    }
  }, [currentUser?.did, queryClient]);

  // Update feed service with subscribed channels
  useEffect(() => {
    feedService.setSubscribedChannels(subscribedChannels);
  }, [subscribedChannels]);

  // Use current user's DID for user-specific feeds, fallback to passed userDid for profile feeds
  const effectiveUserDid = (feedOption === 'yourMix' || feedOption === 'following') 
    ? currentUser?.did 
    : userDid;

  // Create optimized infinite query with centralized configuration
  const query = feedService.createInfiniteQuery(feedOption, effectiveUserDid, {
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

  // Preload thumbnail colors when feed data changes
  useEffect(() => {
    if (feed.length > 0) {
      // Preload colors in background without blocking UI
      requestAnimationFrame(() => {
        preloadThumbnailColors(feed.slice(0, 10)); // Preload first 10 posts
      });
    }
  }, [feed]);

  // Infinite scroll state
  const isNearEndRef = useRef(false);

  // Removed custom scroll handler - using FlashList's onEndReached

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
    
    // Removed onScroll - using FlashList's onEndReached
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
  // Get search feed from global state
  const feed = feedService.getCurrentFeed();
  const isNearEndRef = useRef(false);

  return {
    feed,
    // Removed onScroll - using FlashList's onEndReached
    isNearEnd: isNearEndRef.current,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage: !!isFetchingNextPage,
    fetchNextPage: fetchNextPage || (() => {}),
  };
}

export default useFeed;