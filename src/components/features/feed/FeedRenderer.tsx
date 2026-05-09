/**
 * Optimized feed renderer: single entry for list/grid feeds with visibility-aware playback.
 * Uses useMemo/useCallback so FlashList-bound props (`data`, `onLoadMore`, `commonProps`) stay
 * stable when unrelated parent/query churn occurs — aligns with FlashList v2 prop-memo guidance.
 * React Compiler handles memoization automatically; no manual memo() wrapper needed.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  memo,
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
const FeedRendererComponent = forwardRef<ListFeedViewRef, FeedRendererProps>(
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
    const resolvedBackgroundColor = backgroundColor ?? Colors.black;

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

    const sourceFeed = isSearchFeed ? searchFeedQuery.feed : feedQuery.feed;
    const isPending = isSearchFeed ? false : feedQuery.isPending;
    const isError = isSearchFeed ? false : feedQuery.isError;
    const isFetchingNextPage = isSearchFeed
      ? searchFeedQuery.isFetchingNextPage
      : feedQuery.isFetchingNextPage;
    const hasNextPage = isSearchFeed ? searchFeedQuery.hasNextPage : feedQuery.hasNextPage;
    const fetchNextPage = isSearchFeed ? searchFeedQuery.fetchNextPage : feedQuery.fetchNextPage;
    const refetch = isSearchFeed ? noopFeedRefetch : feedQuery.refetch;
    const isPaused = isSearchFeed ? false : feedQuery.isPaused;
    const isProfileFeed = isSearchFeed ? false : feedQuery.isProfileFeed;
    const dataUpdatedAt = isSearchFeed ? 0 : feedQuery.dataUpdatedAt;

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

    const handleHashtagPress = useCallback(
      (hashtag: string) => {
        router.navigate(
          buildFeedModalHref(
            {
              feedOption: `hashtag:${hashtag}`,
              backgroundColor: Colors.black,
              secondaryColor: Colors.neutral[50],
              initialIndex: '0',
              initialPostUri: '',
            },
            feedModalTab
          )
        );
      },
      [router, feedModalTab]
    );

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
                backgroundColor: resolvedBackgroundColor,
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
        secondaryColor,
        resolvedBackgroundColor,
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
              backgroundColor: resolvedBackgroundColor,
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
      secondaryColor,
      resolvedBackgroundColor,
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

    // Scroll to top on feed reset: fires when dataUpdatedAt changes and the first item URI
    // differs from before (covers same-count resets that the old feed.length check missed).
    const prevFirstUriRef = useRef(feed[0]?.post?.uri ?? null);
    const prevDataUpdatedAtRef = useRef(dataUpdatedAt);
    useEffect(() => {
      const currentFirstUri = feed[0]?.post?.uri ?? null;
      if (
        dataUpdatedAt !== prevDataUpdatedAtRef.current &&
        feed.length > 0 &&
        currentFirstUri !== prevFirstUriRef.current
      ) {
        listFeedViewRef.current?.scrollToTop();
      }
      prevFirstUriRef.current = currentFirstUri;
      prevDataUpdatedAtRef.current = dataUpdatedAt;
    }, [dataUpdatedAt, feed]);

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
        onHashtagPress: handleHashtagPress,
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
        handleHashtagPress,
      ]
    );

    // ListFeedView is the single place that chooses list vs grid (no duplicate branch here)
    const feedView = (
      <ListFeedView
        ref={listFeedViewRef}
        {...commonProps}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isSearchFeed ? false : isPending}
        isError={isSearchFeed ? false : finalIsError}
        targetScrollIndex={propTargetScrollIndex}
        pullToRefresh={pullToRefresh}
      />
    );

    const profileColors = secondaryColor
      ? {
          backgroundColor: resolvedBackgroundColor,
          textColor: secondaryColor,
        }
      : undefined;
    const containerStyle = useMemo(
      () => StyleSheet.compose(styles.container, { backgroundColor: resolvedBackgroundColor }),
      [resolvedBackgroundColor]
    );
    const errorContainerStyle = useMemo(
      () => StyleSheet.compose(styles.errorContainer, { backgroundColor: resolvedBackgroundColor }),
      [resolvedBackgroundColor]
    );

    // Early return for error states
    if (finalIsError && !isSearchFeed) {
      return (
        <View style={errorContainerStyle}>
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
        <View style={errorContainerStyle}>
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
        <View style={containerStyle}>{feedView}</View>
      </FollowProvider>
    );
  }
);
FeedRendererComponent.displayName = 'FeedRenderer';

const FeedRenderer = memo(FeedRendererComponent);

// Optimized StyleSheet creation outside component to prevent recreation
const styles = StyleSheet.create({
  container: {
    flex: 1,
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
