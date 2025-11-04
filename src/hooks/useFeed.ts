/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useCallback, useRef, useEffect, useMemo } from 'react';
import { NativeScrollEvent, InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useUserStore } from '../stores/userStore';
import { preloadThumbnailColors } from '../utils/helpers/video';

// Optimized feed configuration for smooth performance
export const FEED_CONFIG = {
  // Cache and performance settings
  STALE_TIME: 10 * 60 * 1000,    // 10 minutes stale time - increased to reduce unnecessary refreshes
  GC_TIME: 60 * 60 * 1000,       // 60 minutes before garbage collection - increased to preserve video cache
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
  // Use direct selector to prevent re-renders when other user data changes
  const currentUser = useUserStore(state => state.currentUser);

  // Get subscribed channels for your mix feed - use direct selector
  const subscribedChannels = useUserStore(state => state.subscribedChannels);

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
  const feedPages = query.data?.pages ?? [];

  const dedupedFeed = useMemo(() => {
    if (!feedPages.length) {
      return [] as FeedItem[];
    }

    const seenKeys = new Set<string>();
    const nextFeed: FeedItem[] = [];

    for (const page of feedPages) {
      const items = page?.feed ?? [];
      for (const item of items) {
        const uri = item?.post?.uri;
        const cid = item?.post?.cid;

        if (!uri) {
          continue;
        }

        const key = cid ? `${uri}:${cid}` : uri;
        if (seenKeys.has(key)) {
          continue;
        }

        seenKeys.add(key);
        nextFeed.push(item);
      }
    }

    return nextFeed;
  }, [feedPages]);

  const stableFeedRef = useRef<FeedItem[]>([]);

  const feed = useMemo(() => {
    const previous = stableFeedRef.current;
    if (previous.length === dedupedFeed.length && dedupedFeed.length > 0) {
      // Fast path: compare first and last items only
      const firstMatch = previous[0]?.post?.uri === dedupedFeed[0]?.post?.uri;
      const lastMatch = previous[previous.length - 1]?.post?.uri === dedupedFeed[dedupedFeed.length - 1]?.post?.uri;
      
      if (firstMatch && lastMatch) {
        return previous;
      }
    }

    stableFeedRef.current = dedupedFeed;
    return dedupedFeed;
  }, [dedupedFeed]);

  // Preload thumbnail colors when feed data changes
  useEffect(() => {
    if (feed.length > 0) {
      // Defer preload until after interactions complete
      const handle = InteractionManager.runAfterInteractions(() => {
        preloadThumbnailColors(feed.slice(0, 10)); // Preload first 10 posts
      });
      return () => handle.cancel();
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
    (feedOption && feedOption.startsWith('at://'))
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