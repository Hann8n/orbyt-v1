/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useUserStore } from '../stores/userStore';
import { useModerationSettings } from './useModerationSettings';
import { queryKeys } from '../utils/query/queryKeys';
import type { FeedResponse } from '../services/api/types';

// Optimized feed configuration for smooth performance
export const FEED_CONFIG = {
  // Cache and performance settings
  STALE_TIME: 10 * 60 * 1000, // 10 minutes stale time - increased to reduce unnecessary refreshes
  GC_TIME: 60 * 60 * 1000, // 60 minutes before garbage collection - increased to reduce unnecessary refetching
  RETRY_DELAY: 1000, // Longer delay to reduce server load
  MAX_RETRIES: 2, // Reduced retries for faster failure handling
} as const;

interface UseFeedOptions {
  enabled?: boolean;
  staleTime?: number;
  /** Maps to useInfiniteQuery's gcTime (React Query v5; cacheTime was removed) */
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
}

interface UseFeedReturn {
  // Data
  feed: FeedItem[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean; // React Query's fetching state (includes refetching)
  isRefetching: boolean; // React Query's refetching state (distinguishes refetch from initial load)
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

  // Use direct selector to prevent re-renders when other user data changes
  const currentUser = useUserStore(state => state.currentUser);
  const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);
  const agent = useUserStore(state => state.agent);
  const prevModReadyRef = useRef(false);

  // User-specific feeds use currentUser; profile/likes/reposts use passed userDid
  const effectiveUserDid =
    feedOption === 'following' || feedOption === 'your-mix' ? currentUser?.did : userDid;

  // React Query automatically deduplicates useModerationSettings calls with the same userDid
  // Multiple feeds calling this will share the same query instance and network request
  const moderationData = useModerationSettings(effectiveUserDid || undefined);
  const modReady = moderationData.moderationPrefs != null;

  useEffect(() => {
    if (modReady) {
      prevModReadyRef.current = true;
    } else {
      prevModReadyRef.current = false;
    }
  }, [modReady]);

  // React Query automatically handles query key changes - when effectiveUserDid changes,
  // it treats it as a new query and fetches fresh data. Old queries are cleaned up via gcTime.

  // Ensure query is enabled only when:
  // 1. Base enabled flag is true
  // 2. Account switch is complete (not switching)
  // 3. Agent is available (API client ready)
  // 4. For user-specific feeds, we have a user DID
  // 5. Moderation prefs loaded (from MMKV or fetch) so applyModerationBatch can filter
  const isUserSpecificFeed = feedOption === 'following' || feedOption === 'your-mix';
  const queryEnabled =
    enabled &&
    !isSwitchingAccount &&
    !!agent &&
    (!isUserSpecificFeed || !!effectiveUserDid) &&
    modReady;

  // Create optimized infinite query with centralized configuration
  // When effectiveUserDid or feedOption changes, React Query treats this as a new query and fetches fresh data
  const queryKey = queryKeys.feed.infinite(feedOption, effectiveUserDid ?? undefined);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      // Fetch feed data - pageParam type inferred from initialPageParam
      return await feedService.fetchFeed(
        feedOption,
        effectiveUserDid ?? undefined,
        pageParam ?? undefined
      );
    },
    enabled: queryEnabled,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: FeedResponse) => lastPage?.cursor ?? null,
    staleTime: queryOptions.staleTime ?? FEED_CONFIG.STALE_TIME,
    gcTime: queryOptions.gcTime ?? FEED_CONFIG.GC_TIME,
    retry: FEED_CONFIG.MAX_RETRIES,
    retryDelay: FEED_CONFIG.RETRY_DELAY,
    refetchOnWindowFocus: queryOptions.refetchOnWindowFocus ?? false,
    refetchOnMount: queryOptions.refetchOnMount ?? false,
    refetchOnReconnect: queryOptions.refetchOnReconnect ?? false,
    refetchInterval: queryOptions.refetchInterval,
    refetchIntervalInBackground: queryOptions.refetchIntervalInBackground ?? false,
    // Flatten pages into a single feed array; getNextPageParam still receives raw lastPage
    select: data => (data?.pages ?? []).flatMap(p => (p as FeedResponse)?.feed ?? []) as FeedItem[],
  });

  // Removed custom prefetching - FlashList's onEndReached with React Query's fetchNextPage handles this natively

  // Determine if this is a profile feed
  const isProfileFeed =
    (feedOption === 'profile' ||
      feedOption === 'likes' ||
      feedOption === 'reposts' ||
      (feedOption && feedOption.startsWith('at://'))) &&
    Boolean(userDid);

  return {
    // Data (select flattens data.pages → FeedItem[])
    feed: (query.data ?? []) as FeedItem[],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error ?? null) as Error | null,
    isFetching: query.isFetching, // React Query's built-in fetching state (includes refetching)
    isRefetching: query.isRefetching, // React Query's refetching state (distinguishes refetch from initial load)
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
