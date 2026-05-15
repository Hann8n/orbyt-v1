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
  useRef,
  useState,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import ListFeedView from './ListFeedView';
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

    const feedQuery = useFeed(feedOption, userDid, memoizedQueryOptions);

    const searchFeedQuery = useSearchFeed(
      searchHasNextPage,
      searchIsFetchingNextPage,
      searchFetchNextPage
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
    const isPaused = isSearchFeed ? searchFeedQuery.isPaused : feedQuery.isPaused;
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

    // Refs keep callbacks stable so FlashList items don't re-render when
    // query state / navigation context changes. Values are always current.
    const routerRef = useRef(router);
    routerRef.current = router;
    const feedModalTabRef = useRef(feedModalTab);
    feedModalTabRef.current = feedModalTab;

    const gridStateRef = useRef({
      feed,
      feedOption,
      userDid,
      resolvedBackgroundColor,
      secondaryColor,
      hasNextPage,
      isFetchingNextPage,
    });
    gridStateRef.current = {
      feed,
      feedOption,
      userDid,
      resolvedBackgroundColor,
      secondaryColor,
      hasNextPage,
      isFetchingNextPage,
    };

    const handleHashtagPress = useCallback(
      (hashtag: string) => {
        routerRef.current.push(
          buildFeedModalHref(
            {
              feedOption: `hashtag:${hashtag}`,
              backgroundColor: Colors.black,
              secondaryColor: Colors.neutral[50],
              initialIndex: '0',
              initialPostUri: '',
            },
            feedModalTabRef.current
          )
        );
      },
      []
    );

    const handleGridItemPress = useCallback(
      (index: number) => {
        const s = gridStateRef.current;
        if (index >= 0 && index < s.feed.length) {
          feedService.setCurrentFeed(s.feed);
          const item = s.feed[index] as FeedItem;
          const initialPostUri = item?.post?.uri ?? '';
          routerRef.current.push(
            buildFeedModalHref(
              {
                feedOption: s.feedOption || 'search',
                userDid: s.userDid,
                backgroundColor: s.resolvedBackgroundColor,
                secondaryColor: s.secondaryColor || Colors.neutral[50],
                initialIndex: index.toString(),
                initialPostUri,
                hasNextPage: s.hasNextPage ? 'true' : 'false',
                isFetchingNextPage: s.isFetchingNextPage ? 'true' : 'false',
              },
              feedModalTabRef.current
            )
          );
        }
      },
      []
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
          const s = gridStateRef.current;
          if (index >= 0 && index < s.feed.length) {
            feedService.setCurrentFeed(s.feed);
          }
        },
        buildHref: (index: number) => {
          const s = gridStateRef.current;
          const item = s.feed[index] as FeedItem | undefined;
          const initialPostUri = item?.post?.uri ?? '';
          return buildFeedModalHref(
            {
              feedOption: s.feedOption || 'search',
              userDid: s.userDid,
              backgroundColor: s.resolvedBackgroundColor,
              secondaryColor: s.secondaryColor || Colors.neutral[50],
              initialIndex: String(index),
              initialPostUri,
              hasNextPage: s.hasNextPage ? 'true' : 'false',
              isFetchingNextPage: s.isFetchingNextPage ? 'true' : 'false',
            },
            feedModalTabRef.current
          );
        },
      };
    }, []);

    // Single ref: ListFeedView chooses list vs grid internally and forwards scrollToTop
    const listFeedViewRef = useRef<ListFeedViewRef>(null);

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

    const feedView = (
      <ListFeedView
        ref={listFeedViewRef}
        feed={feed}
        headerComponent={headerComponent}
        backgroundColor={backgroundColor}
        secondaryColor={secondaryColor}
        feedOption={feedOption}
        userDid={userDid}
        onLoadMore={handleLoadMore}
        hasNextPage={hasNextPage}
        onRetry={handleRetry}
        isProfileFeed={isProfileFeed}
        isVisible={isVisible}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        contentScrollProgressOutput={contentScrollProgressOutput}
        hasTabBar={hasTabBarProp}
        ListComponent={ListComponent}
        onGridItemPress={handleGridItemPress}
        gridFeedModalZoomConfig={gridFeedModalZoomConfig}
        zoomTargetPostUri={zoomTargetPostUri}
        onHashtagPress={handleHashtagPress}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isSearchFeed ? false : isPending}
        isError={isSearchFeed ? false : finalIsError}
        isPaused={isPaused}
        targetScrollIndex={propTargetScrollIndex}
        pullToRefresh={pullToRefresh}
      />
    );

    const containerStyle = useMemo(
      () => StyleSheet.compose(styles.container, { backgroundColor: resolvedBackgroundColor }),
      [resolvedBackgroundColor]
    );
    return (
      <FollowProvider>
        <View style={containerStyle}>{feedView}</View>
      </FollowProvider>
    );
  }
);
FeedRendererComponent.displayName = 'FeedRenderer';

const FeedRenderer = FeedRendererComponent;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default FeedRenderer;
