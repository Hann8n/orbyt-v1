/**
 * Simplified Feed Renderer
 * Provides a single component for rendering feeds with video items
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

import ListFeedView from './ListFeedView';
import GridFeedView from './GridFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeed, useSearchFeed } from '../../../hooks/useFeed';
import type { ModerationDecision } from '../../../services/ModerationTypes';

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
  headerMode?: 'embedded' | 'external';
  externalHeaderHeight?: number;
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
}

// Main Feed Renderer Component
const FeedRenderer: React.FC<FeedRendererProps> = ({
  feedOption,
  userDid,
  headerComponent,
  headerMode,
  externalHeaderHeight,
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
}) => {
  // Use appropriate hook based on feed type
  const isSearchFeed = feedOption === 'search';
  
  // Regular feed hook
  const feedQuery = useFeed(feedOption, userDid, {
    enabled: !isSearchFeed,
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...queryOptions,
  });

  // Force refetch when isRefreshing changes to true
  useEffect(() => {
    if (isRefreshing && !isSearchFeed) {
      feedQuery.refetch();
    }
  }, [isRefreshing, isSearchFeed, feedQuery]);

  // Search feed hook
  const searchFeedQuery = useSearchFeed(
    searchHasNextPage,
    searchIsFetchingNextPage,
    searchFetchNextPage,
    queryOptions
  );

  // Extract data based on feed type
  const feed = isSearchFeed ? searchFeedQuery.feed : feedQuery.feed;
  const isLoading = isSearchFeed ? false : feedQuery.isLoading;
  const isError = isSearchFeed ? false : feedQuery.isError;
  const error = isSearchFeed ? null : feedQuery.error;
  const isFetchingNextPage = isSearchFeed ? searchFeedQuery.isFetchingNextPage : feedQuery.isFetchingNextPage;
  const hasNextPage = isSearchFeed ? searchFeedQuery.hasNextPage : feedQuery.hasNextPage;
  const fetchNextPage = isSearchFeed ? searchFeedQuery.fetchNextPage : feedQuery.fetchNextPage;
  const refetch = isSearchFeed ? (() => {}) : feedQuery.refetch;
  const isPaused = isSearchFeed ? false : feedQuery.isPaused;
  const isProfileFeed = isSearchFeed ? false : feedQuery.isProfileFeed;
  const onScroll = isSearchFeed ? searchFeedQuery.onScroll : feedQuery.onScroll;

  // Force error state if enabled
  const finalError = forceError ? new Error('Forced error for testing') : error;
  const finalIsError = forceError || isError;

  // Show loader when feed is empty, especially for yourMix
  const shouldShowLoader = isLoading || (feed.length === 0 && feedOption === 'yourMix');

  // Handle retry
  const handleRetry = useCallback(() => {
    refetch();
    if (onRetryFeed) onRetryFeed();
  }, [refetch, onRetryFeed]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Error state
  if (finalIsError && !isSearchFeed) {
    return (
      <View style={[styles.errorContainer, { backgroundColor }]}>
        <EmptyFeed 
          type="error"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
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
          profileColors={secondaryColor ? { backgroundColor, textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
          onRetry={handleRetry}
          feedOption={feedOption}
        />
      </View>
    );
  }

  // Common props for both view modes
  const commonProps = {
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
  };

  return (
    <View style={{ flex: 1, backgroundColor }}>
      {viewMode === 'grid' ? (
        <GridFeedView
          {...commonProps}
          headerMode={headerMode}
          externalHeaderHeight={externalHeaderHeight}
          onVerticalScroll={onVerticalScroll}
          isError={isSearchFeed ? false : finalIsError}
          error={isSearchFeed ? null : finalError}
        />
      ) : (
        <ListFeedView
          {...commonProps}
          headerMode={headerMode}
          externalHeaderHeight={externalHeaderHeight}
          onVerticalScroll={onVerticalScroll}
          isLoading={isSearchFeed ? false : shouldShowLoader}
          isError={isSearchFeed ? false : finalIsError}
          error={isSearchFeed ? null : finalError}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 20,
  },
});

export default FeedRenderer;