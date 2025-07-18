import React from 'react';
import { View, StyleSheet, RefreshControl, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import ListFeedView from './ListFeedView';
import EmptyFeed from './EmptyFeed';
import { useFeedQuery } from '../../../hooks/useFeedQuery';
import ProfileCache from '../../../services/cache/ProfileCache';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedFetcherProps {
  feedOption: 'yourMix' | 'profile' | 'following' | 'author' | 'likes' | 'reposts' | string;
  userDid?: string;
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  onRetryFeed?: () => void;
  queryOptions?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
  };
  secondaryColor?: string;
  isProfileLoading?: boolean;
  onPositionChange?: (position: number) => void;
  initialPosition?: number;
  isVisible?: boolean;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  onVerticalScroll?: (scrollY: number) => void;
  isRefreshing?: boolean;
}

const FeedFetcher: React.FC<FeedFetcherProps> = ({
  feedOption,
  userDid,
  headerComponent,
  refreshControl,
  backgroundColor,
  onRetryFeed,
  queryOptions = {},
  secondaryColor,
  isProfileLoading,
  onPositionChange,
  initialPosition,
  isVisible = true,
  viewMode,
  onViewModeChange,
  onVerticalScroll,
  isRefreshing = false,
}) => {
  const insets = useSafeAreaInsets();
  const lastPrefetchedFeedLength = useRef(0);

  // Use the optimized feed query hook with maximum batch loading
  const {
    feed,
    isProfileFeed,
    error,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
    isPaused,
    isError
  } = useFeedQuery(feedOption, userDid, {
    ...queryOptions,
    staleTime: 10 * 60 * 1000, // 10 minutes for better caching
  });

  // Simplified handleEndReached: always load more when user scrolls to end
  const handleEndReached = useCallback(() => {
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isLoading &&
      !isError &&
      !isPaused
    ) {
      // Always fetch next page for maximum batch loading
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, isError, isPaused, fetchNextPage]);

  // Optimized profile prefetching for new items in background
  useEffect(() => {
    if (feed.length > 0 && feed.length !== lastPrefetchedFeedLength.current) {
      const newItems = feed.slice(lastPrefetchedFeedLength.current);
      if (newItems.length > 0) {
        // Batch prefetch profiles for better performance
        ProfileCache.batchPrefetchFromFeed(newItems).catch(error => {
          console.warn('Error batch prefetching profiles:', error);
        });
      }
      lastPrefetchedFeedLength.current = feed.length;
    }
  }, [feed]);

  /**
   * Handle retrying failed feed
   */
  const handleRetry = useCallback(() => {
    refetch();
    if (onRetryFeed) onRetryFeed();
  }, [refetch, onRetryFeed]);

  /**
   * Render an error if the query has failed
   */
  if (isError) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: backgroundColor || '#000' }]}>
        <EmptyFeed 
          type="error"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
          onRetry={handleRetry}
          feedOption={feedOption}
        />
      </View>
    );
  }

  // Show offline notice when network is unavailable
  if (isPaused) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: backgroundColor || '#000' }]}>
        <EmptyFeed 
          type="no-connection"
          secondaryColor={secondaryColor}
          profileColors={secondaryColor ? { backgroundColor: backgroundColor || '#000', textColor: secondaryColor } : undefined}
          feedKey={`${feedOption}-${userDid || 'default'}`}
          onRetry={handleRetry}
          feedOption={feedOption}
        />
      </View>
    );
  }

  // Use unified ListFeedView for all feed types
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor || '#000' }}>
      <ListFeedView
        key={`${feedOption}-${userDid || 'default'}`}
        feed={feed}
        headerComponent={headerComponent}
        refreshControl={refreshControl}
        backgroundColor={backgroundColor}
        secondaryColor={secondaryColor}
        feedOption={feedOption}
        userDid={userDid}
        onEndReached={handleEndReached}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={handleRetry}
        onPositionChange={onPositionChange}
        initialPosition={initialPosition}
        isVisible={isVisible}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onVerticalScroll={onVerticalScroll}
        isRefreshing={isRefreshing}
        isProfileLoading={isProfileLoading}
      />
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

export default FeedFetcher;