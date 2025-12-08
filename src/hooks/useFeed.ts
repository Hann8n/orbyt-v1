/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useRef, useEffect, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useUserStore } from '../stores/userStore';

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
  const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);
  const agent = useUserStore(state => state.agent);

  // Use current user's DID for user-specific feeds (following and your-mix), fallback to passed userDid for profile feeds
  // Both 'following' and 'your-mix' are user-specific and should include userDid in query key to ensure fresh data on account switch
  const effectiveUserDid = (feedOption === 'following' || feedOption === 'your-mix')
    ? currentUser?.did 
    : userDid;

  // Track previous user DID to detect actual account changes (not just object reference changes)
  const previousUserDidRef = useRef<string | undefined>(currentUser?.did);
  
  // Invalidate feed queries ONLY when user DID actually changes (account switch)
  // This prevents unnecessary invalidations when navigating between feeds
  useEffect(() => {
    const currentDid = currentUser?.did;
    const previousDid = previousUserDidRef.current;
    
    // Only invalidate if:
    // 1. Account switch is complete
    // 2. We have a user DID
    // 3. The DID actually changed (not just object reference)
    // 4. Agent is available
    if (currentDid && !isSwitchingAccount && agent && currentDid !== previousDid) {
      // Only invalidate user-specific feeds (following, your-mix) to preserve other feeds
      // The query key change (via effectiveUserDid) will automatically trigger a new fetch for the new user
      queryClient.invalidateQueries({ 
        queryKey: ['feed', 'following'],
        exact: false 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['feed', 'your-mix'],
        exact: false 
      });
      
      // Update ref to track the new DID
      previousUserDidRef.current = currentDid;
    } else if (currentDid && currentDid === previousDid) {
      // Update ref even if DID didn't change (to track object reference updates)
      previousUserDidRef.current = currentDid;
    }
  }, [currentUser?.did, isSwitchingAccount, agent, queryClient]);

  // Ensure query is enabled only when:
  // 1. Base enabled flag is true
  // 2. Account switch is complete (not switching)
  // 3. Agent is available (API client ready)
  // 4. For user-specific feeds, we have a user DID
  const isUserSpecificFeed = feedOption === 'following' || feedOption === 'your-mix';
  const queryEnabled = enabled 
    && !isSwitchingAccount 
    && !!agent 
    && (!isUserSpecificFeed || !!effectiveUserDid);

  // Create optimized infinite query with centralized configuration
  // When effectiveUserDid changes, React Query treats this as a new query and fetches fresh data
  const query = feedService.createInfiniteQuery(feedOption, effectiveUserDid, {
    enabled: queryEnabled,
    staleTime: FEED_CONFIG.STALE_TIME,
    gcTime: FEED_CONFIG.GC_TIME,
    retry: FEED_CONFIG.MAX_RETRIES,
    retryDelay: FEED_CONFIG.RETRY_DELAY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    ...queryOptions
  });

  // Flatten the pages for a single data array
  // React Query's placeholderData keeps previous data during refetch
  // This ensures FlashList maintains scroll position when feed updates
  const feedPages = query.data?.pages ?? [];

  // Deduplicate feed items and create stable array
  // FlashList v2's maintainVisibleContentPosition handles new items gracefully
  // when keyExtractor returns stable keys (not including index)
  const feed = useMemo(() => {
    if (!feedPages.length) {
      return [] as FeedItem[];
    }

    const seenKeys = new Set<string>();
    const result: FeedItem[] = [];

    for (const page of feedPages) {
      const items = page?.feed ?? [];
      for (const item of items) {
        const uri = item?.post?.uri;
        const cid = item?.post?.cid;

        if (!uri) {
          continue;
        }

        // Use same key format as keyExtractor for consistency
        const key = cid ? `${uri}:${cid}` : uri;
        if (seenKeys.has(key)) {
          continue;
        }

        seenKeys.add(key);
        result.push(item);
      }
    }

    return result;
  }, [feedPages]);


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