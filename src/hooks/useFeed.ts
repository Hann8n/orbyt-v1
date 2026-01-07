/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useRef, useEffect, useMemo } from 'react';
import { useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { InteractionManager } from 'react-native';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useUserStore } from '../stores/userStore';
import { queryKeys } from '../utils/query/queryKeys';
import { computeModerationDecision } from '../utils/moderation/computeDecision';
import { useModerationSettings } from './useModerationSettings';
import type { ExtendedFeedViewPost, FeedResponse } from '../services/api/types';

// Optimized feed configuration for smooth performance
export const FEED_CONFIG = {
  // Cache and performance settings
  STALE_TIME: 10 * 60 * 1000, // 10 minutes stale time - increased to reduce unnecessary refreshes
  GC_TIME: 60 * 60 * 1000, // 60 minutes before garbage collection - increased to preserve video cache
  RETRY_DELAY: 1000, // Longer delay to reduce server load
  MAX_RETRIES: 2, // Reduced retries for faster failure handling

  // Scroll and prefetch settings
  THROTTLE_MS: 150, // Increased throttling for smoother scrolling
  PREFETCH_THRESHOLD: 0.8, // Higher threshold to reduce premature loading
  PREFETCH_ITEMS_AHEAD: 20, // Number of items to keep queued ahead of current position
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
  error: Error | null;
  isFetching: boolean; // React Query's fetching state (includes refetching)
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  isProfileFeed: boolean;
  isPaused: boolean;
  dataUpdatedAt: number;

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
    threshold: _threshold = 0.8,
    debounceMs: _debounceMs = 100,
    ...queryOptions
  } = options;

  const queryClient = useQueryClient();
  // Use direct selector to prevent re-renders when other user data changes
  const currentUser = useUserStore(state => state.currentUser);
  const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);
  const agent = useUserStore(state => state.agent);

  // Get moderation settings once for the entire feed
  const { settings } = useModerationSettings(currentUser?.did ?? undefined);

  // Use current user's DID for user-specific feeds (following and your-mix), fallback to passed userDid for profile feeds
  // Both 'following' and 'your-mix' are user-specific and should include userDid in query key to ensure fresh data on account switch
  const effectiveUserDid =
    feedOption === 'following' || feedOption === 'your-mix' ? currentUser?.did : userDid;

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
        queryKey: queryKeys.feed.byUser('following', currentDid),
        exact: false,
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.feed.byUser('your-mix', currentDid),
        exact: false,
        refetchType: 'active',
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
  const queryEnabled =
    enabled && !isSwitchingAccount && !!agent && (!isUserSpecificFeed || !!effectiveUserDid);

  // Create optimized infinite query with centralized configuration
  // When effectiveUserDid changes, React Query treats this as a new query and fetches fresh data
  const queryKey = queryKeys.feed.infinite(feedOption, effectiveUserDid ?? undefined);

  // Track previous feedOption to detect feed type changes (tab switches)
  // When feedOption changes, disable placeholderData to clear old feed data immediately
  const previousFeedOptionRef = useRef<FeedOption | undefined>(undefined);
  const isFeedTypeChanged =
    previousFeedOptionRef.current !== undefined && previousFeedOptionRef.current !== feedOption;

  // Update ref synchronously after checking for changes (before query creation)
  if (previousFeedOptionRef.current !== feedOption) {
    previousFeedOptionRef.current = feedOption;
  }

  const query = useInfiniteQuery<
    FeedResponse,
    Error,
    InfiniteData<FeedResponse, string | null>,
    ReturnType<typeof queryKeys.feed.infinite>,
    string | null
  >({
    queryKey,
    queryFn: async ({ pageParam }) => {
      // Fetch feed data
      const feedData = await feedService.fetchFeed(
        feedOption,
        effectiveUserDid ?? undefined,
        (pageParam ?? undefined) as string | undefined
      );

      // Extract unique author handles from this page for batch prefetching
      const authorHandles = Array.from(
        new Set(
          feedData.feed.map(item => item.post?.author?.handle).filter((h): h is string => !!h)
        )
      );

      // Batch prefetch all author profiles in background after interactions complete
      // Fire and forget - don't await, let it populate cache
      if (authorHandles.length > 0) {
        // Defer prefetching until after interactions complete
        InteractionManager.runAfterInteractions(() => {
          // Import ProfileCache dynamically to avoid circular dependency
          import('../services/data/ProfileService')
            .then(({ default: ProfileService, profileKeys }) => {
              ProfileService.batchGetProfiles(authorHandles)
                .then(profiles => {
                  // Prepopulate individual profile query keys for instant cache hits
                  profiles.forEach(profile => {
                    if (profile?.handle) {
                      queryClient.setQueryData(profileKeys.detail(profile.handle), profile);
                    }
                  });
                })
                .catch(() => {
                  // Silently fail - feed still renders, individual fetches will work as fallback
                });
            })
            .catch(() => {
              // Failed to load ProfileCache, skip prefetch
            });
        });
      }

      return feedData;
    },
    enabled: queryEnabled,
    initialPageParam: null,
    getNextPageParam: lastPage => lastPage?.cursor ?? null,
    staleTime: queryOptions.staleTime ?? FEED_CONFIG.STALE_TIME,
    gcTime: queryOptions.cacheTime ?? FEED_CONFIG.GC_TIME,
    retry: FEED_CONFIG.MAX_RETRIES,
    retryDelay: FEED_CONFIG.RETRY_DELAY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // Use placeholderData to maintain previous data during refetch of the SAME feed
    // But NOT when switching between different feed types (tabs) - clear feed on tab switch
    // This prevents the feed from clearing and losing scroll position during refetches,
    // but ensures clean state when switching tabs
    placeholderData: isFeedTypeChanged ? undefined : previousData => previousData,
    ...queryOptions,
  });

  // Deduplicate feed items, compute moderation flags, and create stable array
  // FlashList v2's maintainVisibleContentPosition handles new items gracefully
  // when keyExtractor returns stable keys (not including index)
  const feed = useMemo(() => {
    // Flatten the pages for a single data array
    // React Query's placeholderData keeps previous data during refetch
    // This ensures FlashList maintains scroll position when feed updates
    const feedPages = query.data?.pages ?? [];

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

        // Compute moderation flags once at feed level for performance
        // Attach simple boolean flags to avoid per-component computation
        const feedItem = item as ExtendedFeedViewPost;
        let shouldBlur = false;
        let shouldFilter = false;

        if (settings) {
          try {
            const decision = computeModerationDecision(feedItem, settings);
            shouldBlur = decision.blur;
            shouldFilter = decision.filter;
          } catch {
            // Fallback to safe defaults if computation fails
            shouldBlur = false;
            shouldFilter = false;
          }
        }

        // Create new object with moderation flags (immutable)
        result.push({
          ...feedItem,
          shouldBlur,
          shouldFilter,
        });
      }
    }

    return result;
  }, [query.data?.pages, settings]);

  // Infinite scroll state
  const isNearEndRef = useRef(false);
  const prefetchTriggeredRef = useRef(false);

  // Smart prefetching: Immediately prefetch after fast path (10 items) to reach ~20 items
  // This only runs once after initial load if we're below threshold
  useEffect(() => {
    const totalItemsLoaded = feed.length;
    const isInitialLoad = query.data?.pages.length === 1;

    // Only auto-prefetch if:
    // 1. This is the first page (initial load)
    // 2. We have less than PREFETCH_ITEMS_AHEAD items
    // 3. Has next page available
    // 4. Not currently fetching
    // 5. Haven't already triggered prefetch for this state
    if (
      isInitialLoad &&
      totalItemsLoaded > 0 &&
      totalItemsLoaded < FEED_CONFIG.PREFETCH_ITEMS_AHEAD &&
      query.hasNextPage &&
      !query.isFetchingNextPage &&
      queryEnabled &&
      !prefetchTriggeredRef.current
    ) {
      prefetchTriggeredRef.current = true;
      // Immediately start background fetch (fire and forget)
      // This ensures fast path (10 items) immediately gets next page to reach ~20 items
      query.fetchNextPage().catch(() => {
        // Silently handle errors - user can retry via scroll
        prefetchTriggeredRef.current = false; // Reset on error to allow retry
      });
    }
  }, [
    feed.length,
    query.data?.pages.length,
    query.hasNextPage,
    query.isFetchingNextPage,
    queryEnabled,
    query.fetchNextPage,
    query,
  ]);

  // Reset prefetch flag when feed changes significantly (new feed option, etc.)
  useEffect(() => {
    prefetchTriggeredRef.current = false;
  }, [feedOption, effectiveUserDid]);

  // Removed custom scroll handler - using FlashList's onEndReached

  // Determine if this is a profile feed
  const isProfileFeed =
    (feedOption === 'profile' ||
      feedOption === 'likes' ||
      feedOption === 'reposts' ||
      (feedOption && feedOption.startsWith('at://'))) &&
    Boolean(userDid);

  return {
    // Data
    feed,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching, // React Query's built-in fetching state (includes refetching)
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isProfileFeed: Boolean(isProfileFeed),
    isPaused: query.isPaused ?? false,
    dataUpdatedAt: query.dataUpdatedAt ?? 0,

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
  _options: UseFeedOptions = {}
) {
  // Get search feed from global state
  const feed = feedService.getCurrentFeed();

  return {
    feed,
    // Removed onScroll - using FlashList's onEndReached
    isNearEnd: false, // Deprecated - using onEndReached instead
    hasNextPage: !!hasNextPage,
    isFetchingNextPage: !!isFetchingNextPage,
    fetchNextPage: fetchNextPage || (() => {}),
  };
}

export default useFeed;
