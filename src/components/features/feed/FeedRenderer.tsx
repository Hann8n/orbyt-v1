/**
 * Feed renderer: single entry for list/grid feeds with visibility-aware playback.
 * FlashList-bound props are memoized to remain stable during parent/query churn.
 */

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
import type { GridFeedModalZoomConfig } from '@/utils/navigation/feedModalRoute';
import { FollowProvider } from '../../../context/FollowContext';
import type { ExtendedFeedViewPost as FeedItem } from '../../../services/api/types';

const noopFeedRefetch = () => {};

const defaultQueryOptions = {};

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

  forceError?: boolean;
  ListComponent?: React.ComponentType<unknown> | null;
  /** When opening the feed modal from grid, matches `Link.AppleZoomTarget` on the list row (iOS 18+). */
  zoomTargetPostUri?: string | null;

  /** When true, FlashList shows pull-to-refresh (profile/channel). Ignored for search feeds. */
  pullToRefreshEnabled?: boolean;
  /** Runs in parallel with the feed infinite-query `refetch` (e.g. profile/channel metadata). */
  onPullToRefreshExtra?: () => Promise<unknown>;
  /**
   * Relative pathname (resolved with `relativeToDirectory` at press time) of this tab's `feed`
   * screen, expressed from the route that hosts this renderer. Depth-1 hosts (home/profile index)
   * use the default `./feed`; the channel screen sits two directories deeper, so it passes
   * `../../feed`. Relative resolution at press time anchors to the focused (tapped) screen, so the
   * detail always lands on the current tab's stack — no tab detection, no frozen segment.
   */
  feedRouteHref?: string;
}

const FeedRendererComponent = ({
  ref,
  feedOption,
  userDid,
  headerComponent,
  backgroundColor = Colors.black,
  secondaryColor,
  onRetryFeed,
  queryOptions = defaultQueryOptions,
  isVisible = true,
  viewMode = 'list',
  onViewModeChange,
  contentScrollProgressOutput,
  hasTabBar: hasTabBarProp,

  hasNextPage: searchHasNextPage,
  isFetchingNextPage: searchIsFetchingNextPage,
  fetchNextPage: searchFetchNextPage,
  forceError = false,
  ListComponent,
  zoomTargetPostUri,
  pullToRefreshEnabled = false,
  onPullToRefreshExtra,
  feedRouteHref = './feed',
}: FeedRendererProps & {
  ref?: React.Ref<ListFeedViewRef>;
}) => {
  const resolvedBackgroundColor = backgroundColor ?? Colors.black;

  const isSearchFeed = feedOption === 'search';

  const memoizedQueryOptions = useMemo(() => {
    const { enabled: providedEnabled, ...restOptions } = queryOptions ?? {};

    const computedEnabled = typeof providedEnabled === 'boolean' ? providedEnabled : !isSearchFeed;

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
  const dataUpdatedAt = isSearchFeed ? 0 : feedQuery.dataUpdatedAt;

  const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);

  const feed = useMemo(() => {
    return sourceFeed.filter(item => {
      const uri = (item as { post?: { uri?: string } }).post?.uri;
      if (uri && reportedPostUris.has(uri)) return false;
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

  const router = useRouter();
  const routerRef = useRef(router);

  const gridStateRef = useRef({ feed, feedOption, userDid, feedRouteHref });

  useLayoutEffect(() => {
    routerRef.current = router;
    gridStateRef.current = { feed, feedOption, userDid, feedRouteHref };
  }, [feed, feedOption, router, userDid, feedRouteHref]);

  // Relative pushes resolve against the focused (tapped) route at press time, so the detail always
  // lands on the tab stack the user is currently on — no tab detection / no frozen segment.
  const handleHashtagPress = useCallback((hashtag: string) => {
    routerRef.current.push(
      {
        pathname: gridStateRef.current.feedRouteHref,
        params: { feedOption: `hashtag:${hashtag}`, initialPostUri: '' },
      },
      { relativeToDirectory: true }
    );
  }, []);

  const handleGridItemPress = useCallback((index: number) => {
    const s = gridStateRef.current;
    if (index >= 0 && index < s.feed.length) {
      if (s.feedOption === 'search') feedService.setCurrentFeed(s.feed);
      const item = s.feed[index] as FeedItem;
      const initialPostUri = item?.post?.uri ?? '';
      const feedOption = s.feedOption || 'search';
      const params = {
        feedOption,
        ...(s.userDid ? { userDid: s.userDid } : {}),
        initialPostUri,
      };
      routerRef.current.push(
        { pathname: s.feedRouteHref, params },
        {
          relativeToDirectory: true,
          dangerouslySingular: () =>
            [feedOption, s.userDid, initialPostUri].filter(Boolean).join('|'),
        }
      );
    }
  }, []);

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
        if (s.feedOption === 'search' && index >= 0 && index < s.feed.length) {
          feedService.setCurrentFeed(s.feed);
        }
      },
      buildHref: (index: number) => {
        const s = gridStateRef.current;
        const item = s.feed[index] as FeedItem | undefined;
        const initialPostUri = item?.post?.uri ?? '';
        // Relative href — the Apple-Zoom <Link> sets `relativeToDirectory`, so it resolves to the
        // current tab's `feed` route at press time.
        return {
          pathname: s.feedRouteHref,
          params: {
            feedOption: s.feedOption || 'search',
            ...(s.userDid ? { userDid: s.userDid } : {}),
            initialPostUri,
          },
        };
      },
    };
  }, [feed, feedOption, userDid, feedRouteHref]);

  const listFeedViewRef = useRef<ListFeedViewRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => listFeedViewRef.current?.scrollToTop(),
      refresh: () => {
        listFeedViewRef.current?.scrollToTop();
        handlePullToRefresh();
      },
    }),
    [handlePullToRefresh]
  );

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
};
FeedRendererComponent.displayName = 'FeedRenderer';

const FeedRenderer = FeedRendererComponent;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default FeedRenderer;
