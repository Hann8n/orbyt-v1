/**
 * Optimized Feed Renderer with Comprehensive Visibility System
 * Provides a single component for rendering feeds with video items
 * Enhanced with React.memo, useCallback, useMemo for performance
 */

import React, { useCallback, useMemo, memo, forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import ListFeedView from './ListFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeed, useSearchFeed } from '../../../hooks/useFeed';
import { useReportedPostsStore } from '../../../stores/reportedPostsStore';
import { Colors } from '../../../theme';
import { feedService } from '../../../services/FeedService';
import type { ListFeedViewRef, ViewMode } from '../../../types';
import { FollowProvider } from '../../../context/FollowContext';
import type {
  ExtendedFeedViewPost as FeedItem,
  ExtendedPostView as Post,
} from '../../../services/api/types';

// Re-export types for component usage
export type { FeedItem, Post };

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
  isModal?: boolean;

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
}

// Memoized Feed Renderer Component with Performance Optimizations
const FeedRenderer = memo(
  forwardRef<ListFeedViewRef, FeedRendererProps>(
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
        isModal = false,
        // Search props
        hasNextPage: searchHasNextPage,
        isFetchingNextPage: searchIsFetchingNextPage,
        fetchNextPage: searchFetchNextPage,
        forceError = false,
        ListComponent,
        targetScrollIndex: propTargetScrollIndex,
      },
      ref
    ) => {
      // Memoized feed type detection
      const isSearchFeed = useMemo(() => feedOption === 'search', [feedOption]);

      // Memoized query options - useFeed handles defaults (staleTime, gcTime, etc.)
      // Keep query enabled always to avoid refetch trigger when visibility changes
      // Visibility is handled separately for video playback and infinite scroll
      const memoizedQueryOptions = useMemo(() => {
        const { enabled: providedEnabled, ...restOptions } = queryOptions ?? {};

        const computedEnabled =
          typeof providedEnabled === 'boolean' ? providedEnabled : !isSearchFeed; // Always enabled for non-search feeds, regardless of visibility

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

      // Memoized data extraction to prevent unnecessary recalculations
      const feedData = useMemo(
        () => ({
          feed: isSearchFeed ? searchFeedQuery.feed : feedQuery.feed,
          isLoading: isSearchFeed ? false : feedQuery.isLoading,
          isError: isSearchFeed ? false : feedQuery.isError,
          isFetchingNextPage: isSearchFeed
            ? searchFeedQuery.isFetchingNextPage
            : feedQuery.isFetchingNextPage,
          hasNextPage: isSearchFeed ? searchFeedQuery.hasNextPage : feedQuery.hasNextPage,
          fetchNextPage: isSearchFeed ? searchFeedQuery.fetchNextPage : feedQuery.fetchNextPage,
          refetch: isSearchFeed ? () => {} : feedQuery.refetch,
          isPaused: isSearchFeed ? false : feedQuery.isPaused,
          isProfileFeed: isSearchFeed ? false : feedQuery.isProfileFeed,
          dataUpdatedAt: isSearchFeed ? 0 : feedQuery.dataUpdatedAt,
        }),
        [
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
        ]
      );

      // Destructure memoized data
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

      // Display filter: reported only. Label/hide/mute/block are handled by applyModerationBatch (SDK moderatePost).
      const reportedPostUris = useReportedPostsStore(state => state.reportedPostUris);
      const feed = useMemo(
        () =>
          sourceFeed.filter(item => {
            const uri = (item as { post?: { uri?: string } }).post?.uri;
            if (!uri) return false;
            if (reportedPostUris.has(uri)) return false;
            return true;
          }),
        [sourceFeed, reportedPostUris]
      );

      // Calculate error state (inline - simple enough to not need memoization)
      const finalIsError = forceError || isError;

      // Memoized callback for retry - prevents recreation on every render
      const handleRetry = useCallback(() => {
        refetch();
        onRetryFeed?.();
      }, [refetch, onRetryFeed]);

      // Memoized callback for load more - prevents recreation on every render
      const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage && isVisible) {
          fetchNextPage();
        }
      }, [hasNextPage, isFetchingNextPage, isVisible, fetchNextPage]);

      // Grid item press: open feed modal at tapped index (profile/channel); ListFeedView uses this when provided
      const router = useRouter();
      const handleGridItemPress = useCallback(
        (index: number) => {
          if (index >= 0 && index < feed.length) {
            feedService.setCurrentFeed(feed);
            router.navigate({
              pathname: '/(modals)/feed',
              params: {
                feedOption: feedOption || 'search',
                userDid,
                backgroundColor: backgroundColor || Colors.black,
                secondaryColor: secondaryColor || Colors.neutral[50],
                initialIndex: index.toString(),
              },
            });
          }
        },
        [feed, feedOption, userDid, backgroundColor, secondaryColor, router]
      );

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

      // Memoized common props to prevent recreation on every render
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
          isModal,
          ListComponent,
          onGridItemPress: handleGridItemPress,
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
          isModal,
          ListComponent,
          handleGridItemPress,
        ]
      );

      // ListFeedView is the single place that chooses list vs grid (no duplicate branch here)
      const feedView = useMemo(
        () => (
          <ListFeedView
            ref={listFeedViewRef}
            {...commonProps}
            isFetchingNextPage={isFetchingNextPage}
            isLoading={
              isSearchFeed ? false : isLoading || (feed.length === 0 && dataUpdatedAt === 0)
            }
            isError={isSearchFeed ? false : finalIsError}
            targetScrollIndex={propTargetScrollIndex}
          />
        ),
        [
          commonProps,
          isSearchFeed,
          finalIsError,
          isLoading,
          feed.length,
          dataUpdatedAt,
          isFetchingNextPage,
          propTargetScrollIndex,
        ]
      );

      // Memoize profile colors for EmptyFeed
      const profileColors = useMemo(
        () =>
          secondaryColor
            ? {
                backgroundColor: backgroundColor || Colors.black,
                textColor: secondaryColor,
              }
            : undefined,
        [backgroundColor, secondaryColor]
      );

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
  )
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
