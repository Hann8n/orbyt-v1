import React, { useState, useCallback, useImperativeHandle, forwardRef, memo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '../../src/services/FeedService';
import { APP_CONSTANTS } from '../../src/utils/constants';
import { SwipeableFeedContainer } from '../../src/components';
import { HomeScreenRef, FeedOption } from '../../src/types';
import { useVisibilityRouteTracker } from '../../src/hooks';
import { Colors } from '../../src/components/ui/UI';
import { tabRefs } from '../../src/utils/tabRefs';
import type { ScrollToTopRef } from '../../src/utils/tabRefs';

interface HomeScreenProps {}

const HomeScreen = memo(forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  // Home screen always defaults to 'your-mix'
  // Built-in channels ('following' and 'your-mix') are not in subscribedChannels,
  // so we always default to 'your-mix' directly
  const [currentFeed, setCurrentFeed] = useState<FeedOption>('your-mix');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  useVisibilityRouteTracker('home', 'index');

  const triggerRefresh = useCallback(() => {
    // Smart refresh: only invalidate current feed, preserve other feeds and video cache
    // React Query's invalidateQueries automatically triggers refetch
    // We can use React Query's isFetching state instead of manual state management
    queryClient.invalidateQueries({ 
      queryKey: createQueryKeys.feed.infinite(currentFeed),
      exact: false // Invalidate all related queries for this feed
    });
    
    // Note: We still set isRefreshing for the RefreshControl spinner
    // but React Query's isFetching is the source of truth for actual fetch state
    setIsRefreshing(true);
    
    // Reset refreshing state after a short delay to show refresh animation
    // In the future, we could use React Query's isFetching directly instead
    setTimeout(() => {
      setIsRefreshing(false);
    }, APP_CONSTANTS.REFRESH_DELAY);
  }, [currentFeed, queryClient]);

  // Expose refresh method to parent components
  useImperativeHandle(ref, () => ({
    refresh: triggerRefresh,
    isRefreshing
  }), [isRefreshing, triggerRefresh]);

  // Smart refresh logic: only refresh when explicitly requested
  // No automatic refresh on tab focus to preserve video cache and user experience

  // Memoized feed change handler
  const handleFeedChange = useCallback((newFeed: FeedOption) => {
    setCurrentFeed(newFeed);
  }, []);

  return (
    <View style={styles.container}>
      <SwipeableFeedContainer
        ref={(r) => {
          tabRefs.home = r;
        }}
        initialFeed={currentFeed}
        onFeedChange={handleFeedChange}
        isRefreshing={isRefreshing}
        applySafeArea={true}
        indicatorFontSize={18}
      />
    </View>
  );
}));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});

export default HomeScreen;

