/**
 * Optimized Feed Renderer with Comprehensive Visibility System
 * Provides a single component for rendering feeds with video items
 * Enhanced with React.memo, useCallback, useMemo for performance
 */

import React, { useCallback, useMemo, memo, forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';

import ListFeedView from './ListFeedView';
import GridFeedView from './GridFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeed, useSearchFeed } from '../../../hooks/useFeed';
import { Colors } from '../../ui/UI';
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
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;

  // Feed state
  isRefreshing?: boolean; // Optional - if not provided, FeedRenderer manages refresh state internally
  isVisible?: boolean;
  isModal?: boolean;

  // View mode
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;

  // Callbacks
  onRetryFeed?: () => void;
  onRefresh?: () => void | Promise<void>; // Called when user pulls to refresh
  onPositionChange?: (position: number) => void;
  onVerticalScroll?: (scrollY: number) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;

  // Search-specific props
  searchQuery?: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;

  // Query options
  queryOptions?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
  };

  // Debug flag
  forceError?: boolean;
  ListComponent?: React.ComponentType<unknown> | null; // Optional custom list component for integration with collapsible tabs
  visibilityKey?: string;
  shouldPrefetch?: boolean;
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
        refreshControl,
        backgroundColor = '#000',
        secondaryColor,
        onRetryFeed,
        onRefresh: onRefreshCallback,
        queryOptions = {},
        onPositionChange,
        isVisible = true,
        viewMode = 'list',
        onViewModeChange,
        onVerticalScroll,
        isRefreshing, // No default - undefined means FeedRenderer manages state internally
        isModal = false,
        onScrubbingChange,
        // Search props
        hasNextPage: searchHasNextPage,
        isFetchingNextPage: searchIsFetchingNextPage,
        fetchNextPage: searchFetchNextPage,
        forceError = false,
        ListComponent,
        visibilityKey,
        shouldPrefetch = false,
        targetScrollIndex: propTargetScrollIndex,
      },
      ref
    ) => {
      // Resolve visibility key for feed tracking
      const resolvedVisibilityKey =
        visibilityKey || (userDid ? `${feedOption}:${userDid}` : feedOption);
      // Memoized feed type detection
      const isSearchFeed = useMemo(() => feedOption === 'search', [feedOption]);

      // Memoized query options - useFeed handles defaults (staleTime, gcTime, etc.)
      const memoizedQueryOptions = useMemo(() => {
        const { enabled: providedEnabled, ...restOptions } = queryOptions ?? {};

        const computedEnabled =
          typeof providedEnabled === 'boolean'
            ? providedEnabled
            : !isSearchFeed && (isVisible || shouldPrefetch);

        return {
          enabled: computedEnabled,
          ...restOptions,
        };
      }, [queryOptions, isSearchFeed, isVisible, shouldPrefetch]);

      // Regular feed hook with memoized options
      const feedQuery = useFeed(feedOption, userDid, memoizedQueryOptions);

      // Unified refresh handler - leverages React Query's built-in refetch
      // This is called when user pulls to refresh
      const handleRefresh = useCallback(async () => {
        if (isSearchFeed) return;

        // Always refetch the feed using React Query
        // This ensures pull-to-refresh actually fetches fresh data
        await feedQuery.refetch();

        // Call parent's onRefresh callback for additional side effects
        // (e.g., to refresh channel/profile metadata)
        if (onRefreshCallback) {
          await onRefreshCallback();
        }
      }, [isSearchFeed, feedQuery, onRefreshCallback]);

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
          isFetching: isSearchFeed ? false : feedQuery.isFetching, // React Query's fetching state
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
          feedQuery.isFetching,
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
        feed,
        isLoading,
        isError,
        isFetching, // React Query's fetching state (includes refetching)
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        refetch,
        isPaused,
        isProfileFeed,
        dataUpdatedAt,
      } = feedData;

      // Memoized error state calculation
      const errorState = useMemo(
        () => ({
          finalIsError: forceError || isError,
        }),
        [forceError, isError]
      );

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

      // Simple position change handler - forwards to parent only
      // Pagination is handled by FlashList's onEndReached (via onLoadMore -> handleLoadMore)
      // This avoids conflicting pagination triggers and ensures new content is added to next page
      const handlePositionChange = useCallback(
        (position: number) => {
          onPositionChange?.(position);
        },
        [onPositionChange]
      );

      // Determine effective refreshing state
      // Priority: 1) Parent-provided isRefreshing, 2) React Query's isFetching
      // Exclude "fetch next page" so infinite scroll doesn't constantly show pull-to-refresh
      const effectiveRefreshing =
        isRefreshing !== undefined ? isRefreshing : isFetching && !isFetchingNextPage;

      // Create RefreshControl automatically if not provided
      // This centralizes refresh logic and removes redundancy
      const effectiveRefreshControl = useMemo(() => {
        // If refreshControl is explicitly provided, use it (for backward compatibility)
        if (refreshControl) {
          return refreshControl;
        }

        // Otherwise, create RefreshControl automatically
        // Only create if we have a refetch function (not for search feeds)
        if (isSearchFeed || !refetch) {
          return undefined;
        }

        return (
          <RefreshControl
            refreshing={effectiveRefreshing}
            onRefresh={handleRefresh}
            tintColor={secondaryColor || Colors.white}
            colors={secondaryColor ? [secondaryColor] : [Colors.white]}
            progressBackgroundColor="transparent"
          />
        );
      }, [
        refreshControl,
        effectiveRefreshing,
        handleRefresh,
        secondaryColor,
        isSearchFeed,
        refetch,
      ]);

      // Unified handler for grid and horizontal item presses
      // Opens feed modal and scrolls to selected video using FlashList's native scrollToIndex
      const navigation = useRouter();

      const handleItemPress = useCallback(
        (index: number) => {
          if (viewMode === 'grid' && index >= 0 && index < feed.length) {
            // Set the current feed so the modal can use it
            feedService.setCurrentFeed(feed);

            // Navigate to feed modal with initial index
            navigation.push({
              pathname: '/(modals)/feed',
              params: {
                feedOption: feedOption || 'search',
                userDid,
                backgroundColor: backgroundColor || Colors.black,
                secondaryColor: secondaryColor || Colors.white,
                initialIndex: index.toString(),
              },
            });
          }
        },
        [viewMode, feed, feedOption, userDid, backgroundColor, secondaryColor, navigation]
      );

      // Refs for forwarding to ListFeedView and GridFeedView
      const listFeedViewRef = useRef<ListFeedViewRef>(null);
      const gridFeedViewRef = useRef<ListFeedViewRef>(null);

      // Forward ref methods
      useImperativeHandle(
        ref,
        () => ({
          scrollToTop: () => {
            if (viewMode === 'list') {
              listFeedViewRef.current?.scrollToTop();
            } else if (viewMode === 'grid') {
              gridFeedViewRef.current?.scrollToTop();
            }
          },
        }),
        [viewMode]
      );

      // Memoized common props to prevent recreation on every render
      const commonProps = useMemo(
        () => ({
          feed,
          headerComponent,
          refreshControl: effectiveRefreshControl,
          backgroundColor,
          secondaryColor,
          feedOption,
          userDid,
          onLoadMore: handleLoadMore,
          hasNextPage,
          onRetry: handleRetry,
          isProfileFeed,
          onPositionChange: handlePositionChange,
          isVisible,
          viewMode,
          onViewModeChange,
          onVerticalScroll,
          isRefreshing: effectiveRefreshing,
          isModal,
          onScrubbingChange,
          dataUpdatedAt,
          ListComponent,
          visibilityKey: resolvedVisibilityKey,
        }),
        [
          feed,
          headerComponent,
          effectiveRefreshControl,
          backgroundColor,
          secondaryColor,
          feedOption,
          userDid,
          handleLoadMore,
          hasNextPage,
          handleRetry,
          isProfileFeed,
          handlePositionChange,
          isVisible,
          viewMode,
          onViewModeChange,
          onVerticalScroll,
          effectiveRefreshing,
          isModal,
          onScrubbingChange,
          dataUpdatedAt,
          ListComponent,
          resolvedVisibilityKey,
        ]
      );

      // Memoized view selection to prevent unnecessary re-renders
      const feedView = useMemo(() => {
        if (viewMode === 'grid') {
          return (
            <GridFeedView
              ref={gridFeedViewRef}
              {...commonProps}
              onGridItemPress={handleItemPress}
              isError={isSearchFeed ? false : errorState.finalIsError}
            />
          );
        }

        return (
          <ListFeedView
            ref={listFeedViewRef}
            {...commonProps}
            isFetchingNextPage={isFetchingNextPage}
            isLoading={isSearchFeed ? false : isLoading}
            isError={isSearchFeed ? false : errorState.finalIsError}
            visibilityKey={resolvedVisibilityKey}
            targetScrollIndex={propTargetScrollIndex}
          />
        );
      }, [
        viewMode,
        commonProps,
        isSearchFeed,
        errorState.finalIsError,
        isLoading,
        isFetchingNextPage,
        resolvedVisibilityKey,
        handleItemPress,
        propTargetScrollIndex,
      ]);

      // Early return for error states
      if (errorState.finalIsError && !isSearchFeed) {
        return (
          <View style={[styles.errorContainer, { backgroundColor }]}>
            <EmptyFeed
              type="error"
              secondaryColor={secondaryColor}
              profileColors={
                secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined
              }
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
              profileColors={
                secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined
              }
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

// Performance comparison for memo
const areEqual = (prevProps: FeedRendererProps, nextProps: FeedRendererProps) => {
  // Critical props that affect rendering performance
  if (prevProps.feedOption !== nextProps.feedOption) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.viewMode !== nextProps.viewMode) return false;
  if (prevProps.isRefreshing !== nextProps.isRefreshing) return false;
  if (prevProps.backgroundColor !== nextProps.backgroundColor) return false;
  if (prevProps.secondaryColor !== nextProps.secondaryColor) return false;
  if (prevProps.userDid !== nextProps.userDid) return false;
  if (prevProps.forceError !== nextProps.forceError) return false;
  if (prevProps.shouldPrefetch !== nextProps.shouldPrefetch) return false;

  // Shallow comparison for query options - check each property individually
  const prevQueryOpts = prevProps.queryOptions;
  const nextQueryOpts = nextProps.queryOptions;

  // Handle undefined/null cases
  if (!prevQueryOpts && !nextQueryOpts) {
    // Both undefined/null - equal
  } else if (!prevQueryOpts || !nextQueryOpts) {
    return false; // One is undefined, other is not
  } else {
    // Both defined - compare properties
    if (prevQueryOpts.enabled !== nextQueryOpts.enabled) return false;
    if (prevQueryOpts.staleTime !== nextQueryOpts.staleTime) return false;
    if (prevQueryOpts.cacheTime !== nextQueryOpts.cacheTime) return false;
    if (prevQueryOpts.refetchOnWindowFocus !== nextQueryOpts.refetchOnWindowFocus) return false;
    if (prevQueryOpts.refetchOnMount !== nextQueryOpts.refetchOnMount) return false;
  }

  return true;
};

// Note: forwardRef components need special memo handling
const MemoizedFeedRenderer = memo(FeedRenderer, areEqual);
export default MemoizedFeedRenderer;
