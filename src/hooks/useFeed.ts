/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useMemo, useEffect, useRef } from 'react';
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
} as const;

interface UseFeedOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
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
}

/**
 * Comprehensive feed hook that handles data fetching and infinite scrolling
 */
export function useFeed(
  feedOption: FeedOption,
  userDid?: string,
  options: UseFeedOptions = {}
): UseFeedReturn {
  const { enabled = true, ...queryOptions } = options;

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

  // React Query automatically handles query key changes - when effectiveUserDid changes,
  // it treats it as a new query and fetches fresh data. Old queries are cleaned up via gcTime.

  // Ensure query is enabled only when:
  // 1. Base enabled flag is true
  // 2. Account switch is complete (not switching)
  // 3. Agent is available (API client ready)
  // 4. For user-specific feeds, we have a user DID
  const isUserSpecificFeed = feedOption === 'following' || feedOption === 'your-mix';
  const queryEnabled =
    enabled && !isSwitchingAccount && !!agent && (!isUserSpecificFeed || !!effectiveUserDid);

  // Create optimized infinite query with centralized configuration
  // When effectiveUserDid or feedOption changes, React Query treats this as a new query and fetches fresh data
  const queryKey = queryKeys.feed.infinite(feedOption, effectiveUserDid ?? undefined);

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
      return await feedService.fetchFeed(
        feedOption,
        effectiveUserDid ?? undefined,
        (pageParam ?? undefined) as string | undefined
      );
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
    // Use placeholderData to maintain previous data during refetch
    // React Query automatically handles query key changes (feed switches) by creating new queries
    placeholderData: previousData => previousData,
    ...queryOptions,
  });

  // Track previous page count to prefetch profiles only for new pages
  const previousPageCountRef = useRef(0);

  // Prefetch author profiles when new pages are loaded
  useEffect(() => {
    const currentPageCount = query.data?.pages.length ?? 0;
    if (currentPageCount > previousPageCountRef.current && query.data) {
      // Extract unique author handles from the latest page for batch prefetching
      const latestPage = query.data.pages[currentPageCount - 1];
      const authorHandles = Array.from(
        new Set(
          latestPage?.feed
            ?.map((item: ExtendedFeedViewPost) => item.post?.author?.handle)
            .filter((h): h is string => !!h) ?? []
        )
      );

      // Batch prefetch all author profiles in background after interactions complete
      if (authorHandles.length > 0) {
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

      previousPageCountRef.current = currentPageCount;
    }
  }, [query.data?.pages.length, query.data, queryClient]);

  // Flatten feed pages and add moderation flags
  // useMemo ensures transformation only happens when data or settings change
  const feed = useMemo(() => {
    const feedPages = query.data?.pages ?? [];
    if (!feedPages.length) {
      return [] as FeedItem[];
    }

    const seenKeys = new Set<string>();
    const result: FeedItem[] = [];

    // Flatten pages and deduplicate items
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

        // Compute moderation flags
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

        result.push({
          ...feedItem,
          shouldBlur,
          shouldFilter,
        });
      }
    }

    return result;
  }, [query.data?.pages, settings]);

  // Removed custom prefetching - FlashList's onEndReached with React Query's fetchNextPage handles this natively

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
    hasNextPage: !!hasNextPage,
    isFetchingNextPage: !!isFetchingNextPage,
    fetchNextPage: fetchNextPage || (() => {}),
  };
}

export default useFeed;
