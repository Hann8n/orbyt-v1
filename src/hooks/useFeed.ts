/**
 * FlashList v2-Optimized Feed Hook
 * Enhanced for FlashList v2 performance with advanced caching and memory management
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 * Replaces: useFeedQuery.tsx, useInfiniteScroll.tsx
 */

import { useSyncExternalStore } from 'react';
import { useInfiniteQuery, keepPreviousData, onlineManager } from '@tanstack/react-query';
import { feedService, FeedOption, FeedItem } from '../services/FeedService';
import { useShallow } from 'zustand/react/shallow';
import { useUserStore } from '../stores/userStore';
import { useModerationSettings } from './useModerationSettings';
import { QUERY_CONSTANTS } from '../utils/constants';
import { queryKeys } from '../utils/query/queryKeys';
import type { FeedResponse } from '../services/api/types';
import ProfileService from '../services/data/ProfileService';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { isValidAtUri } from '../utils/atproto/uriValidation';

const selectFeedPages = (data: InfiniteData<FeedResponse> | undefined): FeedItem[] =>
  (data?.pages ?? []).flatMap(p => p?.feed ?? []);

export const FEED_CONFIG = {
  GC_TIME: 60 * 60 * 1000,
  RETRY_DELAY: 1000,
  MAX_RETRIES: 2,
  /** Align prefetch / infinite-query defaults with app-wide feed staleness. */
  STALE_TIME: QUERY_CONSTANTS.STALE_TIME_LONG,
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
  feed: FeedItem[];
  /** True until the first fetch settles (incl. when query is disabled / waiting). Prefer over `isLoading` for empty-slot UI. */
  isPending: boolean;
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

  fetchNextPage: () => void;
  refetch: () => void;
}

export function useFeed(
  feedOption: FeedOption,
  userDid?: string,
  options: UseFeedOptions = {}
): UseFeedReturn {
  const { enabled = true, ...queryOptions } = options;

  const { currentUser, isSwitchingAccount, feedBootstrapStatus, feedBootstrapDid, agent } =
    useUserStore(
      useShallow(state => ({
        currentUser: state.currentUser,
        isSwitchingAccount: state.isSwitchingAccount,
        feedBootstrapStatus: state.feedBootstrapStatus,
        feedBootstrapDid: state.feedBootstrapDid,
        agent: state.agent,
      }))
    );
  const effectiveUserDid =
    feedOption === 'following' || feedOption === 'your-mix' ? currentUser?.did : userDid;

  const moderationData = useModerationSettings(effectiveUserDid || undefined);
  const modReady = moderationData.moderationPrefs != null;

  const isUserSpecificFeed = feedOption === 'following' || feedOption === 'your-mix';
  const isFeedBootstrapReady =
    !isUserSpecificFeed ||
    (feedBootstrapStatus === 'ready' &&
      !!effectiveUserDid &&
      feedBootstrapDid === effectiveUserDid);
  const queryEnabled =
    enabled &&
    !isSwitchingAccount &&
    !!agent &&
    (!isUserSpecificFeed || !!effectiveUserDid) &&
    modReady &&
    isFeedBootstrapReady;

  const queryKey = queryKeys.feed.infinite(feedOption, effectiveUserDid ?? undefined);

  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const response = await feedService.fetchFeed(
        feedOption,
        effectiveUserDid ?? undefined,
        pageParam ?? undefined
      );
      // Warm profile cache immediately for the new page's authors
      if (response.feed.length > 0) {
        void ProfileService.warmProfileCacheFromFeed(response.feed, queryClient);
      }
      return response;
    },
    enabled: queryEnabled,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: FeedResponse) => lastPage?.cursor ?? null,
    staleTime: queryOptions.staleTime ?? QUERY_CONSTANTS.STALE_TIME_LONG,
    gcTime: queryOptions.gcTime ?? FEED_CONFIG.GC_TIME,
    retry: FEED_CONFIG.MAX_RETRIES,
    retryDelay: FEED_CONFIG.RETRY_DELAY,
    refetchOnReconnect: queryOptions.refetchOnReconnect ?? false,
    refetchInterval: queryOptions.refetchInterval,
    refetchIntervalInBackground: queryOptions.refetchIntervalInBackground ?? false,
    // Keep previous pages visible during refetch (eliminates blank flashes)
    placeholderData: keepPreviousData,
    // Flatten pages into a single feed array; getNextPageParam still receives raw lastPage
    select: selectFeedPages,
  });

  const isProfileFeed =
    (feedOption === 'profile' ||
      feedOption === 'likes' ||
      feedOption === 'reposts' ||
      (feedOption && isValidAtUri(feedOption))) &&
    Boolean(userDid);

  return {
    feed: (query.data ?? []) as FeedItem[],
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error ?? null) as Error | null,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isProfileFeed: Boolean(isProfileFeed),
    isPaused: query.isPaused ?? false,
    dataUpdatedAt: query.dataUpdatedAt ?? 0,

    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

export function useSearchFeed(
  hasNextPage?: boolean,
  isFetchingNextPage?: boolean,
  fetchNextPage?: () => void
) {
  const feed = feedService.getCurrentFeed();

  const subscribeOnline = (cb: () => void) => onlineManager.subscribe(cb);
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => onlineManager.isOnline(),
    () => true
  );

  return {
    feed,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage: !!isFetchingNextPage,
    fetchNextPage: fetchNextPage || (() => {}),
    isPaused: !isOnline,
  };
}
