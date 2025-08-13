/**
 * Optimized Feed Renderer with Comprehensive Visibility System
 * Provides a single component for rendering feeds with video items
 * Enhanced with React.memo, useCallback, useMemo for performance
 */

import React, { useCallback, useEffect, useState, useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';

import ListFeedView from './ListFeedView';
import GridFeedView from './GridFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeed, useSearchFeed } from '../../../hooks/useFeed';
import type { ModerationDecision } from '../../../services/ModerationTypes';
import { Colors } from '../../ui/UI';

// Types
export interface Post {
  embed?: any;
  uri: string;
  author?: {
    avatar?: string;
    displayName?: string;
    handle?: string;
  };
  moderationDecision?: ModerationDecision;
}

export interface FeedItem {
  post: Post;
  sourceFeed?: string;
}

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
  isProfileLoading?: boolean;
  isRefreshing?: boolean;
  isVisible?: boolean;
  isModal?: boolean;
  
  // View mode
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  
  // Callbacks
  onRetryFeed?: () => void;
  onPositionChange?: (position: number) => void;
  onVerticalScroll?: (scrollY: number) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  
  // Initial state
  initialPosition?: number;
  initialIndex?: number;
  initialUri?: string;
  
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
  ListComponent?: any; // Optional custom list component for integration with collapsible tabs
}

// Memoized Feed Renderer Component with Performance Optimizations
const FeedRenderer: React.FC<FeedRendererProps> = memo(({
  feedOption,
  userDid,
  headerComponent,
  refreshControl,
  backgroundColor = '#000',
  secondaryColor,
  onRetryFeed,
  queryOptions = {},
  isProfileLoading,
  onPositionChange,
  initialPosition,
  initialIndex,
  initialUri,
  isVisible = true,
  viewMode = 'list',
  onViewModeChange,
  onVerticalScroll,
  isRefreshing = false,
  isModal = false,
  onScrubbingChange,
  // Search props
  hasNextPage: searchHasNextPage,
  isFetchingNextPage: searchIsFetchingNextPage,
  fetchNextPage: searchFetchNextPage,
  forceError = false,
  ListComponent,
}) => {
  // Memoized feed type detection
  const isSearchFeed = useMemo(() => feedOption === 'search', [feedOption]);
  
  // Memoized query options to prevent unnecessary hook recreations
  const memoizedQueryOptions = useMemo(() => ({
    enabled: !isSearchFeed, // Always enable when not a search feed
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...queryOptions,
  }), [isSearchFeed, queryOptions]);
  
  // Regular feed hook with memoized options
  const feedQuery = useFeed(feedOption, userDid, memoizedQueryOptions);

  // Optimized refetch effect with proper dependencies
  useEffect(() => {
    if (isRefreshing && !isSearchFeed) {
      feedQuery.refetch();
    }
  }, [isRefreshing, isSearchFeed, feedQuery.refetch]);

  // Memoized search feed hook with visibility control
  const searchFeedQuery = useSearchFeed(
    searchHasNextPage,
    searchIsFetchingNextPage,
    searchFetchNextPage,
    memoizedQueryOptions
  );

  // Memoized data extraction to prevent unnecessary recalculations
  const feedData = useMemo(() => ({
    feed: isSearchFeed ? searchFeedQuery.feed : feedQuery.feed,
    isLoading: isSearchFeed ? false : feedQuery.isLoading,
    isError: isSearchFeed ? false : feedQuery.isError,
    error: isSearchFeed ? null : feedQuery.error,
    isFetchingNextPage: isSearchFeed ? searchFeedQuery.isFetchingNextPage : feedQuery.isFetchingNextPage,
    hasNextPage: isSearchFeed ? searchFeedQuery.hasNextPage : feedQuery.hasNextPage,
    fetchNextPage: isSearchFeed ? searchFeedQuery.fetchNextPage : feedQuery.fetchNextPage,
    refetch: isSearchFeed ? (() => {}) : feedQuery.refetch,
    isPaused: isSearchFeed ? false : feedQuery.isPaused,
    isProfileFeed: isSearchFeed ? false : feedQuery.isProfileFeed,
    onScroll: isSearchFeed ? searchFeedQuery.onScroll : feedQuery.onScroll,
  }), [
    isSearchFeed,
    searchFeedQuery.feed,
    searchFeedQuery.isFetchingNextPage,
    searchFeedQuery.hasNextPage,
    searchFeedQuery.fetchNextPage,
    searchFeedQuery.onScroll,
    feedQuery.feed,
    feedQuery.isLoading,
    feedQuery.isError,
    feedQuery.error,
    feedQuery.isFetchingNextPage,
    feedQuery.hasNextPage,
    feedQuery.fetchNextPage,
    feedQuery.refetch,
    feedQuery.isPaused,
    feedQuery.isProfileFeed,
    feedQuery.onScroll,
  ]);

  // Destructure memoized data
  const {
    feed,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isPaused,
    isProfileFeed,
    onScroll,
  } = feedData;

  // Memoized error state calculation
  const errorState = useMemo(() => ({
    finalError: forceError ? new Error('Forced error for testing') : error,
    finalIsError: forceError || isError,
  }), [forceError, error, isError]);

  // Memoized loading state calculation
  const shouldShowLoader = useMemo(() => 
    isLoading || (feed.length === 0 && feedOption === 'yourMix'),
    [isLoading, feed.length, feedOption]
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

  // Memoized error state render
  const errorStateRender = useMemo(() => {
    if (errorState.finalIsError && !isSearchFeed) {
      try {
        console.error('[FeedError]', feedOption, errorState.finalError);
      } catch {}
      return (
        <View style={[styles.errorContainer, { backgroundColor }]}>
          <EmptyFeed 
            type="error"
            secondaryColor={secondaryColor}
            profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
            onRetry={handleRetry}
            feedOption={feedOption}
          />
        </View>
      );
    }

    // Offline state
    if (isPaused && !isSearchFeed) {
      try {
        console.warn('[FeedPaused]', feedOption);
      } catch {}
      return (
        <View style={[styles.errorContainer, { backgroundColor }]}>
          <EmptyFeed 
            type="no-connection"
            secondaryColor={secondaryColor}
            profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
            onRetry={handleRetry}
            feedOption={feedOption}
          />
        </View>
      );
    }

    return null;
  }, [
    errorState.finalIsError,
    isSearchFeed,
    backgroundColor,
    secondaryColor,
    handleRetry,
    feedOption,
    isPaused,
  ]);

  // Early return for error states
  if (errorStateRender) {
    return errorStateRender;
  }

  // Memoized common props to prevent recreation on every render
  const commonProps = useMemo(() => ({
    feed,
    headerComponent,
    refreshControl,
    backgroundColor,
    secondaryColor,
    feedOption,
    userDid,
    onLoadMore: handleLoadMore,
    isFetchingNextPage,
    hasNextPage,
    onRetry: handleRetry,
    isProfileLoading,
    isProfileFeed,
    onPositionChange,
    initialPosition,
    initialIndex,
    initialUri,
    isVisible,
    viewMode,
    onViewModeChange,
    onVerticalScroll,
    isRefreshing,
    isModal,
    onScrubbingChange,
    onScroll,
    ListComponent,
  }), [
    feed,
    headerComponent,
    refreshControl,
    backgroundColor,
    secondaryColor,
    feedOption,
    userDid,
    handleLoadMore,
    isFetchingNextPage,
    hasNextPage,
    handleRetry,
    isProfileLoading,
    isProfileFeed,
    onPositionChange,
    initialPosition,
    initialIndex,
    initialUri,
    isVisible,
    viewMode,
    onViewModeChange,
    onVerticalScroll,
    isRefreshing,
    isModal,
    onScrubbingChange,
    onScroll,
    ListComponent,
  ]);

  // Memoized view selection to prevent unnecessary re-renders
  const feedView = useMemo(() => {
    if (viewMode === 'grid') {
      return (
        <GridFeedView
          {...commonProps}
          isError={isSearchFeed ? false : errorState.finalIsError}
          error={isSearchFeed ? null : errorState.finalError}
        />
      );
    }
    
    return (
      <ListFeedView
        {...commonProps}
        isLoading={isSearchFeed ? false : shouldShowLoader}
        isError={isSearchFeed ? false : errorState.finalIsError}
        error={isSearchFeed ? null : errorState.finalError}
      />
    );
  }, [
    viewMode,
    commonProps,
    isSearchFeed,
    errorState.finalIsError,
    errorState.finalError,
    shouldShowLoader,
  ]);

  return (
    <View style={styles.container}>
      {feedView}
    </View>
  );
});

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
  if (prevProps.initialIndex !== nextProps.initialIndex) return false;
  if (prevProps.initialUri !== nextProps.initialUri) return false;
  if (prevProps.forceError !== nextProps.forceError) return false;
  
  // Shallow comparison for query options
  if (JSON.stringify(prevProps.queryOptions) !== JSON.stringify(nextProps.queryOptions)) return false;
  
  return true;
};

export default memo(FeedRenderer, areEqual);