/**
 * Optimized feed renderer: single entry for list/grid feeds with visibility-aware playback.
 * Uses useMemo/useCallback so FlashList-bound props (`data`, `onLoadMore`, `commonProps`) stay
 * stable when unrelated parent/query churn occurs — aligns with FlashList v2 prop-memo guidance.
 */

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import ListFeedView from './ListFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeed, useSearchFeed } from '../../../hooks/useFeed';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';
import { Colors } from '../../../theme';
import { feedService } from '../../../services/FeedService';
import type { ListFeedViewRef, ViewMode } from '../../../types';
import {
  buildFeedModalHref,
  type GridFeedModalZoomConfig,
} from '@/utils/navigation/feedModalRoute';
import { useFeedModalTabSegment } from '@/utils/navigation/feedModalTabSegment';
import { FollowProvider } from '../../../context/FollowContext';
import type { ExtendedFeedViewPost as FeedItem } from '../../../services/api/types';

const noopFeedRefetch = () => {};

// Main Feed Renderer Props
interface FeedRendererProps {
  // Core feed configuration
  feedOption: string;
  userDid?: string;

  // UI configuration
  headerComponent?: React.ReactNode;
  backgroundColor?: string;
  secondaryColor?: string;

  // Feed state
  isVisible?: boolean;
  /** When set, overrides list tab-bar inset behavior. */
  hasTabBar?: boolean;

  // View mode
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;

  // Callbacks
  onRetryFeed?: () => void;
  /** When provided, list writes scroll progress (0..1) here on UI thread for overlay fade. */
  contentScrollProgressOutput?: import('react-native-reanimated').SharedValue<number>;

  // Search-specific props
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;

  // Query options (gcTime = React Query v5; replaces legacy cacheTime)
  queryOptions?: {
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
    refetchOnReconnect?: boolean;
    refetchInterval?: number | false;
    refetchIntervalInBackground?: boolean;
  };

  // Debug flag
  forceError?: boolean;
  ListComponent?: React.ComponentType<unknown> | null; // Optional custom list component for integration with collapsible tabs
  targetScrollIndex?: number | null; // Initial index to scroll to when opening feed
  /** When opening the feed modal from grid, matches `Link.AppleZoomTarget` on the list row (iOS 18+). */
  zoomTargetPostUri?: string | null;

  /** When true, FlashList shows pull-to-refresh (profile/channel). Ignored for search feeds. */
  pullToRefreshEnabled?: boolean;
  /** Runs in parallel with the feed infinite-query `refetch` (e.g. profile/channel metadata). */
  onPullToRefreshExtra?: () => Promise<unknown>;
}

// Memoized Feed Renderer Component with Performance Optimizations
const FeedRenderer = forwardRef<ListFeedViewRef, FeedRendererProps>(
  (
    {
      feedOption,
      userDid,
      headerComponent,
      backgroundColor = Colors.black,
      secondaryColor,
      onRetryFeed,
      queryOptions = {},
      isVisible = true,
      viewMode = 'list',
      onViewModeChange,
      contentScrollProgressOutput,
      hasTabBar: hasTabBarProp,
      // Search props
      hasNextPage: searchHasNextPage,
      isFetchingNextPage: searchIsFetchingNextPage,
      fetchNextPage: searchFetchNextPage,
      forceError = false,
      ListComponent,
      targetScrollIndex: propTargetScrollIndex,
      zoomTargetPostUri,
      pullToRefreshEnabled = false,
      onPullToRefreshExtra,
    },
    ref
  ) => {
    // Feed type detection
    const isSearchFeed = feedOption === 'search';

    // Memoized query options - useFeed handles defaults (staleTime, gcTime, etc.)
    // Keep query enabled always to avoid refetch trigger when visibility changes
    // Visibility is handled separately for video playback and infinite scroll
    const memoizedQueryOptions = useMemo(() => {
      const { enabled: providedEnabled, ...restOptions } = queryOptions ?? {};

      const computedEnabled =
        typeof providedEnabled === 'boolean' ? providedEnabled : !isSearchFeed;

      return {
        enabled: computedEnabled,
        ...restOptions,
      };
    }, [queryOptions, isSearchFeed]);

    // Regular feed hook with memoized options
    const feedQuery = useFeed(feedOption, userDid, memoizedQueryOptions);

    // Memoized search feed hook with visibility control
    const searchFeedQuery = useSearchFeed(
      searchHasNextPage,
      searchIsFetchingNextPage,
      searchFetchNextPage,
      memoizedQueryOptions
    );

    const feedData = useMemo(() => {
      if (isSearchFeed) {
        return {
          feed: searchFeedQuery.feed,
          isLoading: false,
          isError: false,
          isFetchingNextPage: searchFeedQuery.isFetchingNextPage,
          hasNextPage: searchFeedQuery.hasNextPage,
          fetchNextPage: searchFeedQuery.fetchNextPage,
          refetch: noopFeedRefetch,
          isPaused: false,
          isProfileFeed: false,
          dataUpdatedAt: 0,
        };
      }
      return {
        feed: feedQuery.feed,
        isLoading: feedQuery.isLoading,
        isError: feedQuery.isError,
        isFetchingNextPage: feedQuery.isFetchingNextPage,
        hasNextPage: feedQuery.hasNextPage,
        fetchNextPage: feedQuery.fetchNextPage,
        refetch: feedQuery.refetch,
        isPaused: feedQuery.isPaused,
        isProfileFeed: feedQuery.isProfileFeed,
        dataUpdatedAt: feedQuery.dataUpdatedAt,
      };
    }, [
      isSearchFeed,
      searchFeedQuery.feed,
      searchFeedQuery.isFetchingNextPage,
      searchFeedQuery.hasNextPage,
      searchFeedQuery.fetchNextPage,
      feedQuery.feed,
      feedQuery.isLoading,
      feedQuery.isError,
      feedQuery.isFetchingNextPage,
      feedQuery.hasNextPage,
      feedQuery.fetchNextPage,
      feedQuery.refetch,
      feedQuery.isPaused,
      feedQuery.isProfileFeed,
      feedQuery.dataUpdatedAt,
    ]);

    const {
      feed: sourceFeed,
      isLoading,
      isError,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      refetch,
      isPaused,
      isProfileFeed,
      dataUpdatedAt,
    } = feedData;

    const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);
    const feed = useMemo(() => {
      return sourceFeed.filter(item => {
        const uri = (item as { post?: { uri?: string } }).post?.uri;
        if (!uri) return false;
        if (reportedPostUris.has(uri)) return false;
        return true;
      });
    }, [sourceFeed, reportedPostUris]);

    const finalIsError = forceError || isError;

    const handleRetry = useCallback(() => {
      refetch();
      onRetryFeed?.();
    }, [refetch, onRetryFeed]);

    const handleLoadMore = useCallback(() => {
      if (hasNextPage && !isFetchingNextPage && isVisible) {
        fetchNextPage();
      }
    }, [hasNextPage, isFetchingNextPage, isVisible, fetchNextPage]);

    const feedModalTab = useFeedModalTabSegment();
    const router = useRouter();

    const handleGridItemPress = useCallback(
      (index: number) => {
        if (index >= 0 && index < feed.length) {
          feedService.setCurrentFeed(feed);
          const item = feed[index] as FeedItem;
          const initialPostUri = item?.post?.uri ?? '';
          router.navigate(
            buildFeedModalHref(
              {
                feedOption: feedOption || 'search',
                userDid,
                backgroundColor: backgroundColor || Colors.black,
                secondaryColor: secondaryColor || Colors.neutral[50],
                initialIndex: index.toString(),
                initialPostUri,
                hasNextPage: hasNextPage ? 'true' : 'false',
                isFetchingNextPage: isFetchingNextPage ? 'true' : 'false',
              },
              feedModalTab
            )
          );
        }
      },
      [
        feed,
        feedOption,
        userDid,
        backgroundColor,
        secondaryColor,
        hasNextPage,
        isFetchingNextPage,
        feedModalTab,
        router,
      ]
    );

    const [pullRefreshing, setPullRefreshing] = useState(false);

    const handlePullToRefresh = useCallback(async () => {
      if (isSearchFeed) return;
      setPullRefreshing(true);
      try {
        const feedPromise = Promise.resolve(refetch());
        const extraPromise = onPullToRefreshExtra ? onPullToRefreshExtra() : Promise.resolve();
        await Promise.all([feedPromise, extraPromise]);
      } finally {
        setPullRefreshing(false);
      }
    }, [isSearchFeed, refetch, onPullToRefreshExtra]);

    const pullToRefresh = useMemo(() => {
      if (!pullToRefreshEnabled || isSearchFeed) return undefined;
      return {
        refreshing: pullRefreshing,
        onRefresh: handlePullToRefresh,
      };
    }, [pullToRefreshEnabled, isSearchFeed, pullRefreshing, handlePullToRefresh]);

    const gridFeedModalZoomConfig: GridFeedModalZoomConfig = useMemo(() => {
      return {
        onBeforeNavigate: (index: number) => {
          if (index >= 0 && index < feed.length) {
            feedService.setCurrentFeed(feed);
          }
        },
        buildHref: (index: number) => {
          const item = feed[index] as FeedItem | undefined;
          const initialPostUri = item?.post?.uri ?? '';
          return buildFeedModalHref(
            {
              feedOption: feedOption || 'search',
              userDid,
              backgroundColor: backgroundColor || Colors.black,
              secondaryColor: secondaryColor || Colors.neutral[50],
              initialIndex: String(index),
              initialPostUri,
              hasNextPage: hasNextPage ? 'true' : 'false',
              isFetchingNextPage: isFetchingNextPage ? 'true' : 'false',
            },
            feedModalTab
          );
        },
      };
    }, [
      feed,
      feedOption,
      userDid,
      backgroundColor,
      secondaryColor,
      hasNextPage,
      isFetchingNextPage,
      feedModalTab,
    ]);

    // Single ref: ListFeedView chooses list vs grid internally and forwards scrollToTop
    const listFeedViewRef = useRef<ListFeedViewRef>(null);

    // Forward ref methods (ListFeedView delegates to grid when in grid mode)
    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => listFeedViewRef.current?.scrollToTop(),
      }),
      []
    );

    const commonProps = useMemo(
      () => ({
        feed,
        headerComponent,
        backgroundColor,
        secondaryColor,
        feedOption,
        userDid,
        onLoadMore: handleLoadMore,
        hasNextPage,
        onRetry: handleRetry,
        isProfileFeed,
        isVisible,
        viewMode,
        onViewModeChange,
        contentScrollProgressOutput,
        hasTabBar: hasTabBarProp,
        ListComponent,
        onGridItemPress: handleGridItemPress,
        gridFeedModalZoomConfig,
        zoomTargetPostUri: zoomTargetPostUri ?? null,
      }),
      [
        feed,
        headerComponent,
        backgroundColor,
        secondaryColor,
        feedOption,
        userDid,
        handleLoadMore,
        hasNextPage,
        handleRetry,
        isProfileFeed,
        isVisible,
        viewMode,
        onViewModeChange,
        contentScrollProgressOutput,
        hasTabBarProp,
        ListComponent,
        handleGridItemPress,
        gridFeedModalZoomConfig,
        zoomTargetPostUri,
      ]
    );

    // ListFeedView is the single place that chooses list vs grid (no duplicate branch here)
    const feedView = (
      <ListFeedView
        ref={listFeedViewRef}
        {...commonProps}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isSearchFeed ? false : isLoading || (feed.length === 0 && dataUpdatedAt === 0)}
        isError={isSearchFeed ? false : finalIsError}
        targetScrollIndex={propTargetScrollIndex}
        pullToRefresh={pullToRefresh}
      />
    );

    const profileColors = secondaryColor
      ? {
          backgroundColor: backgroundColor || Colors.black,
          textColor: secondaryColor,
        }
      : undefined;

    // Early return for error states
    if (finalIsError && !isSearchFeed) {
      return (
        <View style={[styles.errorContainer, { backgroundColor }]}>
          <EmptyFeed
            type="error"
            secondaryColor={secondaryColor}
            profileColors={profileColors}
            onRetry={handleRetry}
            feedOption={feedOption}
          />
        </View>
      );
    }

    // Offline state
    if (isPaused && !isSearchFeed) {
      return (
        <View style={[styles.errorContainer, { backgroundColor }]}>
          <EmptyFeed
            type="no-connection"
            secondaryColor={secondaryColor}
            profileColors={profileColors}
            onRetry={handleRetry}
            feedOption={feedOption}
          />
        </View>
      );
    }

    return (
      <FollowProvider>
        <View style={styles.container}>{feedView}</View>
      </FollowProvider>
    );
  }
);

// Optimized StyleSheet creation outside component to prevent recreation
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
    paddingHorizontal: 20,
  },
});

export default FeedRenderer;
